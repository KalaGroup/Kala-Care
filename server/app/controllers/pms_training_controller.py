# ============================================================================
# PMS -> Training Report
# ----------------------------------------------------------------------------
# One Excel file feeds this page: the KOEL "Training Report" export, one row
# per (engineer, skill, training). It is a MASTER, not a period report — rows
# accumulate across uploads and a re-upload updates in place, so the page
# always shows the whole training history of every engineer.
#
# NINE columns are FIXED (real DB columns, matched flexibly on their
# alphanumeric skeleton so spacing / case / punctuation differences never break
# an import):
#     UID NO, EMPLOYEE TICKET NUMBER, FULL NAME, OCCUPATION, SKILL,
#     BRANCH NAME, BRANCH ID, HIRE DATE, CURRENT STATUS
# CURRENT STATUS carries 'Active' / 'Inactive' on EVERY row of an employee, so
# it is the flag that says who has LEFT. A leaver's rows are kept for good —
# their training history has to outlive the exit — so the report counts, shows
# and filters the status instead of dropping the rows.
# The status can also be typed BY HAND (pms_training_status_overrides), because
# the file is only as fresh as its last export and HR knows about an exit first.
# A manual row WINS over the file, survives every re-upload, and is undone only
# by deleting it — see set_manual_status() / clear_manual_status() below.
# EVERY other column of the file is DYNAMIC: kept verbatim in extra_data as
# {header: value} and rendered from there, so the file can gain or lose columns
# without a code change.
#
# The page answers two questions, which is what shapes the payload below:
#   search a NAME  -> that person's SKILLS first, then all their other details
#   search a SKILL -> every person who holds it
# Both are served from ONE payload (the table is small): the employee list,
# with each employee's skill rows nested. The skill index is pivoted from it in
# the browser, so searching either way is instant and never hits the server.
# ============================================================================
import hashlib
import json
import re
from datetime import date, datetime

import pandas as pd
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.controllers.pms_controller import (
    _cached, _clean_str, _norm_branch_id, _parse_date, _read_excel, _tight,
    set_upload_progress,
)
from app.models.pms_model import (PmsTrainingRecord, PmsTrainingStatusOverride,
                                 PmsUploadBatch)

# The record_type stamped on the shared pms_upload_batches audit rows.
RECORD_TYPE = "training"

# ---------------- FLEXIBLE HEADER MATCHING ---------------------------------- #
# canonical field -> accepted header skeletons (first match wins)
CANON_HEADERS = {
    "uid_no": ["UIDNO", "UIDNUMBER", "UID", "SERVICEENGINEERUID", "SEUID"],
    "employee_ticket_number": ["EMPLOYEETICKETNUMBER", "EMPLOYEETICKETNO",
                               "TICKETNUMBER", "TICKETNO", "EMPLOYEECODE"],
    "full_name": ["FULLNAME", "EMPLOYEENAME", "NAME", "SERVICEENGINEERNAME"],
    "occupation": ["OCCUPATION", "QUALIFICATION"],
    "skill": ["SKILL", "SKILLNAME", "TRAININGSKILL"],
    "branch_name": ["BRANCHNAME"],
    "branch_id": ["BRANCHID", "BRANCHCODE", "BRANCH"],
    "hire_date": ["HIREDATE", "DATEOFJOINING", "DOJ", "JOININGDATE"],
    "current_status": ["CURRENTSTATUS", "EMPLOYEESTATUS", "EMPSTATUS",
                       "ACTIVEINACTIVE", "ACTIVESTATUS", "STATUS"],
}

# Read for the RECORD KEY only — both stay dynamic (extra_data), because the
# business fixed nine columns and these are not among them. The key still has
# to be stable, and without them the same engineer's repeat trainings collapse
# onto one row (see the model docstring for the counts).
KEY_ONLY_HEADERS = {
    "training_date": ["TRAININGDATE", "TRAININGSTARTDATE", "TRAINEDON"],
    "category": ["CATEGORY", "TRAININGCATEGORY"],
}

# Without a UID and a name there is no employee to file the training under.
CRITICAL_FIELDS = ["uid_no", "full_name"]

FIELD_LABELS = {
    "uid_no": "UID NO",
    "employee_ticket_number": "EMPLOYEE TICKET NUMBER",
    "full_name": "FULL NAME",
    "occupation": "OCCUPATION",
    "skill": "SKILL",
    "branch_name": "BRANCH NAME",
    "branch_id": "BRANCH ID",
    "hire_date": "HIRE DATE",
    "current_status": "CURRENT STATUS",
}

# The nine fixed columns, in the order the business listed them — the page's
# "expected format" hint and the validate response both read this.
FIXED_ORDER = ["uid_no", "employee_ticket_number", "full_name", "occupation",
               "skill", "branch_name", "branch_id", "hire_date",
               "current_status"]

# pandas names a blank header column 'Unnamed: 7'. Those are the trailing empty
# columns of the export, never real data — they must not become dynamic columns.
_BLANK_HEADER = re.compile(r"^UNNAMED:?\d*$")


def _is_blank_header(col) -> bool:
    return pd.isna(col) or not str(col).strip() or bool(_BLANK_HEADER.match(_tight(col)))


def _map_headers(df: pd.DataFrame):
    """Return ({canonical field: actual column}, {key field: actual column},
    [dynamic columns]) — everything the file has that is not one of the nine
    fixed columns is dynamic, in FILE ORDER."""
    cols = [c for c in df.columns if not _is_blank_header(c)]
    by_tight = {}
    for c in cols:
        by_tight.setdefault(_tight(c), c)

    mapping, used = {}, set()
    for field, keys in CANON_HEADERS.items():
        for k in keys:
            col = by_tight.get(k)
            if col is not None and col not in used:
                mapping[field] = col
                used.add(col)
                break
    # The key columns are read but NOT consumed — they stay dynamic.
    key_map = {}
    for field, keys in KEY_ONLY_HEADERS.items():
        for k in keys:
            col = by_tight.get(k)
            if col is not None and col not in used:
                key_map[field] = col
                break

    dynamic = [c for c in cols if c not in used]
    return mapping, key_map, dynamic


def _name_key(name) -> str:
    return re.sub(r"[^A-Z0-9]", "", str(name or "").upper())


def _cell(value):
    """One dynamic cell -> (display string, is_date).

    Dates in this export arrive as '2024-03-16 05:30:00' — a plain date pushed
    through a UTC/IST conversion somewhere upstream. The time is never
    meaningful, so the DATE is what gets stored; the flag lets the page (and
    the Excel export) treat the column as a real date."""
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None, False
    if isinstance(value, (pd.Timestamp, datetime)):
        return value.date().isoformat(), True
    if isinstance(value, date):
        return value.isoformat(), True
    s = str(value).strip()
    if not s or s.lower() in ("nan", "nat", "none"):
        return None, False
    # numeric ids read back as floats ('535506240631.0') — drop the tail
    if s.endswith(".0") and s[:-2].replace("-", "").isdigit():
        s = s[:-2]
    # a date typed as text, e.g. '2024-03-16 05:30:00'
    if re.match(r"^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?$", s):
        return s[:10], True
    return s[:500], False


# CURRENT STATUS -> 'Active' / 'Inactive' / None.
# The file is typed by hand, so the spelling wobbles ('In-Active', 'INACTIVE',
# 'Left'). Everything is squashed to letters and digits and matched against the
# two buckets; anything unrecognised is left NULL rather than guessed at, so a
# surprise word shows on the page as "Status not set" instead of quietly
# counting the person as still serving.
_ACTIVE_WORDS = {"ACTIVE", "WORKING", "SERVING", "ONROLL", "ONROLLS",
                 "A", "YES", "Y", "1", "TRUE"}
_INACTIVE_WORDS = {"INACTIVE", "NOTACTIVE", "LEFT", "RESIGNED", "EXIT",
                   "EXITED", "SEPARATED", "TERMINATED", "RELIEVED",
                   "EXEMPLOYEE", "I", "NO", "N", "0", "FALSE"}


# A file uploaded BEFORE current_status was a real column kept the value in
# extra_data. ensure_schema() backfills the column from that JSON, but the JSON
# key stays behind — so the payload has to drop it, or the page shows the status
# twice: once as the badge and once as a dynamic "All details" row. Only dropped
# when the real column actually carries a value, so a header that merely happens
# to be called STATUS is never hidden.
_STATUS_SKELETONS = set(CANON_HEADERS["current_status"])


def _status(value):
    text = _cell(value)[0]
    if not text:
        return None
    tight = re.sub(r"[^A-Z0-9]", "", str(text).upper())
    if tight in _ACTIVE_WORDS:
        return "Active"
    if tight in _INACTIVE_WORDS:
        return "Inactive"
    return None


def _dedupe_key(uid, skill, training_date, category) -> str:
    raw = "|".join(["training", uid or "", (skill or "").upper(),
                    training_date or "", (category or "").upper()])
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


# ---------------- VALIDATE -------------------------------------------------- #

def validate_file(contents: bytes, filename: str):
    """Dry-run: which of the nine fixed columns were found, which extra
    columns will be kept dynamically, and a small sample. Writes nothing."""
    try:
        df = _read_excel(contents)
    except Exception as e:
        return {"success": False, "message": f"Could not read Excel file: {e}"}

    mapping, key_map, dynamic = _map_headers(df)
    missing = [FIELD_LABELS[f] for f in CRITICAL_FIELDS if f not in mapping]
    absent = [FIELD_LABELS[f] for f in FIXED_ORDER if f not in mapping]

    warnings = []
    if absent and not missing:
        warnings.append("Fixed column(s) not in this file: " + ", ".join(absent)
                        + " — those cells will stay empty.")
    if "skill" not in mapping:
        warnings.append("No SKILL column — every employee will import as one "
                        "row with no training against it.")
    if "current_status" not in mapping:
        warnings.append("No CURRENT STATUS column — nobody can be told apart "
                        "as Active or Inactive, so every employee will show as "
                        "“Status not set”.")
    if not key_map.get("training_date"):
        warnings.append("No TRAINING DATE column — repeat trainings of the "
                        "same skill cannot be told apart, so only the last "
                        "one of each skill will be kept.")

    return {
        "success": not missing,
        "message": ("File format OK" if not missing
                    else "Missing critical columns: " + ", ".join(missing)),
        "warnings": warnings,
        "file_name": filename,
        "rows": int(len(df)),
        "columns": int(len(df.columns)),
        "mapped": {FIELD_LABELS[f]: str(c) for f, c in mapping.items()},
        "dynamic_columns": [str(c) for c in dynamic],
        "missing_critical": missing,
        "sample": df.head(5).fillna("").astype(str).to_dict(orient="records"),
    }


# ---------------- IMPORT ---------------------------------------------------- #

_UPSERT_FIELDS = ["uid_no", "employee_ticket_number", "full_name", "name_key",
                  "occupation", "skill", "branch_name", "branch_id",
                  "hire_date", "current_status", "extra_data"]


def import_file(db: Session, contents: bytes, filename: str, user_id: str,
                progress_token: str = None):
    """Parse the Training Report and upsert on UID + SKILL + TRAINING DATE +
    CATEGORY. A new training is inserted, a changed one updates in place
    (latest upload wins) and an identical re-upload counts as a duplicate."""
    set_upload_progress(progress_token, 3, "Reading Excel file…")
    try:
        df = _read_excel(contents)
    except Exception as e:
        set_upload_progress(progress_token, 100, "Failed")
        return {"success": False, "message": f"Could not read Excel file: {e}"}

    mapping, key_map, dynamic = _map_headers(df)
    missing = [FIELD_LABELS[f] for f in CRITICAL_FIELDS if f not in mapping]
    if missing:
        set_upload_progress(progress_token, 100, "Failed")
        return {"success": False,
                "message": "Missing critical columns: " + ", ".join(missing)}

    set_upload_progress(progress_token, 8, "Parsing rows…")
    batch = PmsUploadBatch(record_type=RECORD_TYPE, file_name=filename[:255],
                           total_rows=int(len(df)), uploaded_by=user_id)
    db.add(batch)
    db.flush()

    inserted = updated = duplicates = skipped = 0
    by_key = {}          # dedupe_key -> parsed field dict (last in file wins)
    total_rows = max(1, len(df))

    for row_i, (_, row) in enumerate(df.iterrows()):
        if progress_token and row_i % 200 == 0:
            set_upload_progress(progress_token, 8 + 44 * row_i / total_rows,
                                f"Parsing rows… {row_i:,} / {total_rows:,}")
        get = lambda f: row[mapping[f]] if f in mapping else None

        uid = _clean_str(get("uid_no"), 60)
        name = _clean_str(get("full_name"), 200)
        if not uid or not name:
            skipped += 1
            continue

        # Dynamic columns, verbatim and in file order (json keeps the order).
        extra = {}
        for c in dynamic:
            text, _is_date = _cell(row[c])
            if text is not None:
                extra[str(c)] = text

        skill = _clean_str(get("skill"), 150)
        t_date = _cell(row[key_map["training_date"]])[0] if "training_date" in key_map else None
        cat = _cell(row[key_map["category"]])[0] if "category" in key_map else None
        key = _dedupe_key(uid, skill, t_date, cat)

        fields = {
            "uid_no": uid,
            "employee_ticket_number": _clean_str(get("employee_ticket_number"), 60),
            "full_name": name,
            "name_key": _name_key(name)[:200] or None,
            "occupation": _clean_str(get("occupation"), 150),
            "skill": skill,
            "branch_name": _clean_str(get("branch_name"), 150),
            "branch_id": _norm_branch_id(get("branch_id")) or None,
            "hire_date": _parse_date(get("hire_date")),
            "current_status": _status(get("current_status")),
            "extra_data": json.dumps(extra, ensure_ascii=False) if extra else None,
        }
        if key in by_key:
            duplicates += 1          # repeated inside the same file — last wins
        by_key[key] = fields

    # ---- upsert: the identity hash is deterministic, so existing rows are
    # found by dedupe_key in chunks ----
    set_upload_progress(progress_token, 55, "Matching existing records…")
    existing = {}
    keys = list(by_key)
    for i in range(0, len(keys), 800):
        for rec in (db.query(PmsTrainingRecord)
                    .filter(PmsTrainingRecord.dedupe_key.in_(keys[i:i + 800])).all()):
            existing[rec.dedupe_key] = rec

    for up_i, (key, fields) in enumerate(by_key.items()):
        if progress_token and up_i % 200 == 0:
            set_upload_progress(progress_token, 60 + 34 * up_i / max(1, len(by_key)),
                                f"Importing rows… {up_i:,} / {len(by_key):,}")
        rec = existing.get(key)
        if rec is not None:
            if all(getattr(rec, f) == fields[f] for f in _UPSERT_FIELDS):
                duplicates += 1      # identical re-upload
            else:
                for f in _UPSERT_FIELDS:
                    setattr(rec, f, fields[f])
                rec.batch_id = batch.id
                updated += 1
        else:
            db.add(PmsTrainingRecord(dedupe_key=key, batch_id=batch.id, **fields))
            inserted += 1

    batch.inserted_rows = inserted
    batch.updated_rows = updated
    batch.duplicate_rows = duplicates
    batch.skipped_rows = skipped
    set_upload_progress(progress_token, 96, "Saving to database…")
    db.commit()
    set_upload_progress(progress_token, 100, "Done")

    return {
        "success": True,
        "message": f"{inserted} new, {updated} updated, {duplicates} duplicates skipped",
        "batch_id": batch.id,
        "total_rows": batch.total_rows,
        "inserted": inserted,
        "updated": updated,
        "duplicates": duplicates,
        "skipped": skipped,
    }


def clear_data(db: Session):
    """Wipe every stored training row + its upload batches.

    The manually typed statuses (pms_training_status_overrides) are deliberately
    LEFT ALONE: they are HR's answer, not imported data, and someone who has left
    is still gone after the master is re-imported from scratch."""
    rows = db.query(PmsTrainingRecord).delete(synchronize_session=False)
    batches = (db.query(PmsUploadBatch)
               .filter(PmsUploadBatch.record_type == RECORD_TYPE)
               .delete(synchronize_session=False))
    db.commit()
    return {"success": True, "deleted_rows": rows, "deleted_batches": batches}


# ---------------- MANUAL STATUS (typed, not imported) ----------------------- #

def set_manual_status(db: Session, uid_no: str, status: str, left_on=None,
                      reason: str = None, user_id: str = None):
    """Type an employment status for ONE engineer. Overrides the file for good
    (until it is cleared), so an engineer who has left stays left however many
    times a stale export is re-uploaded on top of them."""
    uid = _clean_str(uid_no, 60)
    if not uid:
        return {"success": False, "message": "No employee to set the status on"}
    wanted = _status(status)
    if wanted is None:
        return {"success": False,
                "message": "Status must be Active or Inactive"}
    # An unknown UID would be an invisible row nobody can see or undo.
    if not db.query(PmsTrainingRecord.id).filter(
            PmsTrainingRecord.uid_no == uid).first():
        return {"success": False,
                "message": f"No employee with UID {uid} in the training data"}

    # A leaving date only means something for someone who has LEFT.
    if wanted == "Active":
        left_on = None
    row = (db.query(PmsTrainingStatusOverride)
           .filter(PmsTrainingStatusOverride.uid_no == uid).first())
    if row is None:
        row = PmsTrainingStatusOverride(uid_no=uid)
        db.add(row)
    row.status = wanted
    row.left_on = _parse_date(left_on)
    row.reason = _clean_str(reason, 300)
    row.set_by = _clean_str(user_id, 50)
    db.commit()
    return {"success": True, "status": wanted,
            "message": (f"Marked as left ({wanted})" if wanted == "Inactive"
                        else "Marked as Active")}


def clear_manual_status(db: Session, uid_no: str):
    """Drop the typed status and hand the engineer back to the file's own word."""
    uid = _clean_str(uid_no, 60)
    deleted = (db.query(PmsTrainingStatusOverride)
               .filter(PmsTrainingStatusOverride.uid_no == uid)
               .delete(synchronize_session=False))
    db.commit()
    return {"success": True, "deleted": int(deleted or 0),
            "message": ("Manual status removed — the file's status applies again"
                        if deleted else "There was no manual status to remove")}


# ---------------- REPORT PAYLOAD -------------------------------------------- #

def _looks_like_date(values) -> bool:
    """A dynamic column is a DATE column when every value it holds is one."""
    seen = False
    for v in values:
        if not v:
            continue
        seen = True
        if not re.match(r"^\d{4}-\d{2}-\d{2}$", v):
            return False
    return seen


def _build_payload(db: Session):
    rows = (db.query(PmsTrainingRecord)
            .order_by(PmsTrainingRecord.full_name, PmsTrainingRecord.id).all())

    # Dynamic columns in FILE ORDER: json.dumps kept each row's key order, so
    # walking the rows and appending unseen keys reproduces the file's layout.
    dyn_order, dyn_values = [], {}
    parsed = []
    for r in rows:
        extra = {}
        if r.extra_data:
            try:
                extra = json.loads(r.extra_data) or {}
            except (ValueError, TypeError):
                extra = {}
        if r.current_status:
            extra = {k: v for k, v in extra.items()
                     if _tight(k) not in _STATUS_SKELETONS}
        for k in extra:
            if k not in dyn_values:
                dyn_order.append(k)
                dyn_values[k] = []
            dyn_values[k].append(extra[k])
        parsed.append((r, extra))

    # Group by employee. UID is the identity — the ticket number is blank for
    # anyone who has not been through a training yet.
    employees = {}
    for r, extra in parsed:
        emp = employees.get(r.uid_no)
        if emp is None:
            emp = employees[r.uid_no] = {
                "uid_no": r.uid_no,
                "employee_ticket_number": r.employee_ticket_number,
                "full_name": r.full_name,
                "occupation": r.occupation,
                "branch_name": r.branch_name,
                "branch_id": r.branch_id,
                "hire_date": r.hire_date.isoformat() if r.hire_date else None,
                # What the FILE says. Kept separate from the effective status
                # so the page can show both — "the file still calls him Active,
                # you marked him left" is the whole point of the override.
                "file_status": None,
                "current_status": None,
                "status_source": None,     # 'file' | 'manual' | None
                "left_on": None,
                "status_reason": None,
                "status_by": None,
                "status_at": None,
                "details": {},
                "skills": [],
                "_seen": {},        # dynamic column -> set of values (classifier)
            }
        # Later rows fill in anything the first one left blank (the ticket
        # number sits on the training rows, not on the untrained row).
        for f in ("employee_ticket_number", "occupation", "branch_name", "branch_id"):
            if not emp[f]:
                emp[f] = getattr(r, f)
        if not emp["hire_date"] and r.hire_date:
            emp["hire_date"] = r.hire_date.isoformat()
        # Status describes the PERSON, and the file repeats it on every one of
        # their rows. Should those rows ever disagree (a leaver whose older
        # training rows still read Active), 'Inactive' WINS — the point of the
        # column is to spot who has gone, and a stale Active row must not hide
        # that. Otherwise the first row that carries a status sets it.
        if r.current_status == "Inactive":
            emp["file_status"] = "Inactive"
        elif not emp["file_status"] and r.current_status:
            emp["file_status"] = r.current_status

        for k, v in extra.items():
            emp["_seen"].setdefault(k, set()).add(v)
        if r.skill:
            emp["skills"].append({"id": r.id, "skill": r.skill, "values": extra})

    # ---- the typed statuses win over the file ----
    # One query for the lot: the table holds one row per engineer HR has told us
    # about, which is a handful next to the training master.
    overrides = {o.uid_no: o for o in db.query(PmsTrainingStatusOverride).all()}
    for uid, emp in employees.items():
        o = overrides.get(uid)
        if o is not None:
            emp["current_status"] = o.status
            emp["status_source"] = "manual"
            emp["left_on"] = o.left_on.isoformat() if o.left_on else None
            emp["status_reason"] = o.reason
            emp["status_by"] = o.set_by
            emp["status_at"] = o.updated_at.isoformat() if o.updated_at else None
        else:
            emp["current_status"] = emp["file_status"]
            emp["status_source"] = "file" if emp["file_status"] else None

    # Which dynamic columns describe the EMPLOYEE and which describe the
    # TRAINING? Data decides, not a hard-coded list: a column that never varies
    # inside an employee (ZONE NAME, SD NAME, the bank block) belongs on the
    # person; one that does (CATEGORY, TRAINING DATE) belongs on the row. So a
    # file that adds a column lands it in the right place on its own.
    varying = set()
    for emp in employees.values():
        for k, vals in emp["_seen"].items():
            if len(vals) > 1:
                varying.add(k)
    employee_columns = [c for c in dyn_order if c not in varying]
    training_columns = [c for c in dyn_order if c in varying]

    # The file's own training-date column, whatever it is called — used to sort
    # each engineer's skills newest first.
    date_col = next((c for c in training_columns
                     if _tight(c).startswith("TRAININGDATE")), None)

    out = []
    for emp in sorted(employees.values(), key=lambda e: (e["full_name"] or "").upper()):
        seen = emp.pop("_seen")
        emp["details"] = {c: next(iter(seen[c])) for c in employee_columns
                          if seen.get(c)}
        # Skills NEWEST FIRST where the file dates them, ties alphabetical.
        # Two passes rather than one reversed key: reversing a (date, skill)
        # tuple would also flip the names into Z..A.
        emp["skills"].sort(key=lambda s: (s["skill"] or "").upper())
        if date_col:
            emp["skills"].sort(key=lambda s: s["values"].get(date_col) or "",
                               reverse=True)
        emp["skill_names"] = sorted({s["skill"] for s in emp["skills"] if s["skill"]})
        out.append(emp)

    all_skills = sorted({s for e in out for s in e["skill_names"]})
    branches = sorted({(e["branch_id"] or "", e["branch_name"] or "") for e in out},
                      key=lambda b: b[1] or b[0])
    last = (db.query(PmsUploadBatch)
            .filter(PmsUploadBatch.record_type == RECORD_TYPE)
            .order_by(PmsUploadBatch.id.desc()).first())

    return {
        "success": True,
        "employee_columns": employee_columns,
        "training_columns": training_columns,
        "date_columns": [c for c in dyn_order if _looks_like_date(dyn_values.get(c, []))],
        "employees": out,
        "meta": {
            "rows": len(rows),
            "employees": len(out),
            "trained": sum(1 for e in out if e["skills"]),
            "untrained": sum(1 for e in out if not e["skills"]),
            "active": sum(1 for e in out if e["current_status"] == "Active"),
            "inactive": sum(1 for e in out if e["current_status"] == "Inactive"),
            "status_unset": sum(1 for e in out if not e["current_status"]),
            "status_manual": sum(1 for e in out if e["status_source"] == "manual"),
            "skills": len(all_skills),
            "skill_list": all_skills,
            "branches": [{"branch_id": b[0], "branch_name": b[1]} for b in branches],
            "occupations": sorted({e["occupation"] for e in out if e["occupation"]}),
            "last_upload": ({
                "file_name": last.file_name,
                "uploaded_by": last.uploaded_by,
                "uploaded_at": last.uploaded_at.isoformat() if last.uploaded_at else None,
                "total_rows": last.total_rows,
            } if last else None),
        },
    }


def report_payload(db: Session):
    """The whole training master, shaped for the page. Cached on the same data
    fingerprint the other PMS reports use, so a repeat view is free."""
    return _cached(db, "training-report", lambda: _build_payload(db))


def data_summary(db: Session):
    """Row / employee / skill counts for the page's setup box, plus HOW MANY
    times the file has been uploaded and WHEN the last one landed — the only
    two things the page reports about the upload history."""
    rows, emps, skills = (db.query(
        func.count(PmsTrainingRecord.id),
        func.count(func.distinct(PmsTrainingRecord.uid_no)),
        func.count(func.distinct(PmsTrainingRecord.skill)),
    ).first() or (0, 0, 0))
    uploads, last_at = (db.query(
        func.count(PmsUploadBatch.id),
        func.max(PmsUploadBatch.uploaded_at),
    ).filter(PmsUploadBatch.record_type == RECORD_TYPE).first() or (0, None))
    return {"rows": int(rows or 0), "employees": int(emps or 0),
            "skills": int(skills or 0), "uploads": int(uploads or 0),
            "last_uploaded_at": last_at.isoformat() if last_at else None}
