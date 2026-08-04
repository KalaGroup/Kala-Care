# ============================================================================
# PMS (Performance Management System) — Spare & Labour sales vs monthly targets
# ----------------------------------------------------------------------------
# Two Excel files feed the module (Part Sale + Labour Revenue). Rows accumulate
# in pms_sales_records with hash-based dedupe, so the user can upload daily /
# weekly / monthly / quarterly extracts and re-uploads never double-count.
# The report is a pivot of NET TAXABLE AMOUNT by BRANCH ID / CLAIM INVOICE DATE
# against the AOP Master monthly targets (pms_branch_targets).
# ============================================================================
import calendar
import hashlib
import io
import json
import math
import re
from datetime import date, datetime, timedelta

import pandas as pd
from sqlalchemy.orm import Session

from app.models.pms_model import (
    PmsBranchTarget, PmsSrTypeMapping, PmsUploadBatch,
    PmsSalesRecord, PmsReportHistory, PmsMonthSettings, PmsHead,
)
from app.models.user_model import User, UserRole, UserBranchAccess
from app.time_utils import now_ist

# ERP branches (same codes as the rest of the ERP) used to auto-prefill a
# month's Target Master; responsible person = the branch's Branch Admin.
ERP_BRANCHES = [
    ("MH", "420435_1", "Ch.Sambhaji Nagar"),
    ("MH", "420435_2", "Ahilyanagar"),
    ("MH", "420435_3", "Beed"),
    ("MH", "420435_4", "Nanded"),
    ("MH", "420435_5", "Babhaleshwar"),
    ("MH", "420435_6", "Latur"),
    ("KA", "420435_8", "Hubli"),
    ("KA", "420435_9", "Belagavi"),
    ("KA", "420435_10", "Hospet"),
    ("KA", "420435_11", "Ballari"),
    ("KA", "420435_12", "Bagalkot"),
    ("KA", "420435_13", "Gulbarga"),
    ("KA", "420435_14", "Bijapur"),
]

# ---------------- SR TYPE -> HEAD DEFAULTS (given by business) -------------- #

DEFAULT_SR_HEADS = {
    "Bandhan Premium": "AMC",
    "KOEL Anubandh": "AMC",
    "KOEL Anubandhan Plus": "AMC",
    "KOEL Bandhan": "AMC",
    "KOEL Bandhan Plus": "AMC",
    "KOEL AMC": "KOEL AMC",
    "OTC Order": "OTC Order",
    "Post Warranty": "Post Warranty",
    "Campaign": "Warranty",
    "CSP": "Warranty",
    "Line Rejection": "Warranty",
    "Paid CSP": "Warranty",
    "Revalidation": "Warranty",
    "Warranty": "Warranty",
    "WG DG CSP": "Warranty",
}

HEAD_CHOICES = ["Warranty", "Post Warranty", "AMC", "KOEL AMC", "OTC Order"]

# ---------------- FLEXIBLE HEADER MATCHING ---------------------------------- #
# Same philosophy as the customer Import module: headers are matched on their
# alphanumeric skeleton ("Claim Invoice Date" == "CLAIM  INVOICE DATE."), the
# canonical fields are extracted, and every unrecognised column is preserved
# in extra_data JSON so nothing from the file is lost.

def _tight(name) -> str:
    return re.sub(r"[^A-Z0-9]", "", str(name).upper())


# canonical field -> accepted header skeletons (first match wins)
CANON_HEADERS = {
    "zone_name": ["ZONENAME", "ZONE"],
    "soid": ["SOID", "SDID", "SONO", "SONUMBER", "SOI"],
    "sd_name": ["SDNAME", "SD", "DEALERNAME"],
    "branch_id": ["BRANCHID", "BRANCHCODE", "BRANCH"],
    "branch_name": ["BRANCHNAME"],
    "claim_invoice_no": ["CLAIMINVOICENO", "CLAIMINVOICENUMBER", "INVOICENO", "INVOICENUMBER"],
    "claim_invoice_date": ["CLAIMINVOICEDATE", "INVOICEDATE"],
    "product_segment": ["PRODUCTSEGMENT", "PRODSEGMENT", "PRODUCTSEG"],
    "segment": ["SEGMENT", "SEGMENTNAME", "CUSTOMERSEGMENT"],
    "sr_type": ["SERVICEREPORTTYPE", "CLAIMINVOICESRTYPE", "SRTYPE", "SERVICETYPE",
                "REPORTTYPE", "SERVICEREPORT", "TYPEOFSERVICE", "CLAIMTYPE", "SRREPORTTYPE"],
    "net_taxable_amount": ["NETTAXABLEAMOUNT", "NETTAXABLEAMT", "NETTAXABLEVALUE",
                           "NETAMOUNT", "TAXABLEAMOUNT", "TAXABLEVALUE"],
}

# The SR Type column differs per file and feeds the SR Type Master:
# Part Sale (spares) file -> 'CLAIM INVOICE SR TYPE', Labour file -> 'SR TYPE'.
# These take priority over the generic sr_type header fallbacks above.
_SR_TYPE_PRIORITY = {
    "part": ["CLAIMINVOICESRTYPE"],
    "labour": ["SRTYPE"],
}

# The report cannot be built without these three.
CRITICAL_FIELDS = ["branch_id", "claim_invoice_date", "net_taxable_amount"]

FIELD_LABELS = {
    "branch_id": "BRANCH ID",
    "claim_invoice_date": "CLAIM INVOICE DATE",
    "net_taxable_amount": "NET TAXABLE AMOUNT",
}


def _map_headers(df: pd.DataFrame, record_type: str = None):
    """Return ({canonical_field: actual column}, [unmapped columns]).

    record_type ('part' | 'labour') puts that file's known SR Type header
    first — CLAIM INVOICE SR TYPE for spares, SR TYPE for labour — so it
    always wins over the generic fallbacks."""
    cols = [c for c in df.columns if pd.notna(c)]
    by_tight = {}
    for c in cols:
        by_tight.setdefault(_tight(c), c)

    mapping, used = {}, set()
    for field, keys in CANON_HEADERS.items():
        if field == "sr_type" and record_type in _SR_TYPE_PRIORITY:
            pref = _SR_TYPE_PRIORITY[record_type]
            keys = pref + [k for k in keys if k not in pref]
        for k in keys:
            col = by_tight.get(k)
            if col is not None and col not in used:
                mapping[field] = col
                used.add(col)
                break
    # BRANCH alone must not shadow BRANCH NAME if both are generic
    unmapped = [c for c in cols if c not in used]
    return mapping, unmapped


def _norm_branch_id(value) -> str:
    """Branch ids appear as '420435-1', '420435_1', '420435 1' across files —
    normalise to the underscore form used everywhere else in the ERP."""
    s = str(value or "").strip()
    if not s:
        return ""
    if s.endswith(".0"):  # pandas float-read of a numeric id
        s = s[:-2]
    return re.sub(r"[\s\-/]+", "_", s).upper()


def _parse_date(value):
    """DATE ONLY — any time part ('2026-07-01 11:16:21') is dropped.

    Year-first values (yyyy-mm-dd...) must NOT be parsed day-first: with
    dayfirst=True pandas can flip '2026-07-01' into 7 Jan. dayfirst stays on
    only for day-first Indian formats like '01-07-2026'."""
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    s = str(value).strip()
    year_first = bool(re.match(r"^\d{4}[-/.]", s))
    ts = pd.to_datetime(s, dayfirst=not year_first, errors="coerce")
    return None if pd.isna(ts) else ts.date()


def _parse_amount(value) -> float:
    if value is None:
        return 0.0
    try:
        if isinstance(value, str):
            value = value.replace(",", "").replace("₹", "").strip() or 0
        f = float(value)
        return 0.0 if math.isnan(f) else round(f, 2)
    except (ValueError, TypeError):
        return 0.0


def _clean_str(value, limit=140):
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return None
    s = str(value).strip()
    if s.endswith(".0") and s[:-2].isdigit():
        s = s[:-2]
    return s[:limit] or None


def _read_excel(contents: bytes) -> pd.DataFrame:
    df = pd.read_excel(io.BytesIO(contents))
    df = df.dropna(how="all")
    return df


# ---------------- UPLOAD / VALIDATE ---------------------------------------- #

def validate_file(contents: bytes, filename: str, record_type: str = None):
    """Dry-run: report which canonical columns were found / are missing and a
    small sample, without writing anything. record_type ('part' | 'labour')
    is accepted for parity with import_file; header matching is the same for
    both files."""
    try:
        df = _read_excel(contents)
    except Exception as e:
        return {"success": False, "message": f"Could not read Excel file: {e}"}

    mapping, unmapped = _map_headers(df, record_type)
    missing = [FIELD_LABELS[f] for f in CRITICAL_FIELDS if f not in mapping]
    sample = df.head(5).fillna("").astype(str).to_dict(orient="records")
    return {
        "success": not missing,
        "message": ("File format OK" if not missing
                    else "Missing critical columns: " + ", ".join(missing)),
        "file_name": filename,
        "rows": int(len(df)),
        "columns": int(len(df.columns)),
        "mapped": {f: str(c) for f, c in mapping.items()},
        "unmapped_columns": [str(c) for c in unmapped],
        "missing_critical": missing,
        "sample": sample,
    }


# Fields compared to decide whether a re-uploaded invoice actually changed.
_UPSERT_FIELDS = [
    "zone_name", "soid", "sd_name", "branch_id", "branch_name",
    "claim_invoice_date", "product_segment", "segment", "sr_type",
    "net_taxable_amount", "extra_data",
]


# Line-level discriminator inside one invoice, per file type. The Part Sale
# file has one row PER PART LINE of an invoice (CLAIM INVOICE NUMBER repeats;
# invoice+PART NUMBER is unique). The Labour file is one row per invoice
# (SR NUMBER as a safety discriminator).
_LINE_KEY_HEADERS = {
    "part": ["PARTNUMBER", "PARTNO"],
    "labour": ["SRNUMBER", "SRNO"],
}


# ---- Upload progress (polled by the frontend while an import runs) -------- #
# The import runs in a worker thread (run_in_threadpool in the route), so the
# progress GET endpoint stays responsive and can read this dict live.
UPLOAD_PROGRESS = {}


def set_upload_progress(token, pct, stage=""):
    if token:
        UPLOAD_PROGRESS[token] = {"pct": int(min(100, max(0, pct))), "stage": stage}


def get_upload_progress(token):
    info = UPLOAD_PROGRESS.get(token)
    if info and info["pct"] >= 100:
        UPLOAD_PROGRESS.pop(token, None)     # done — free the slot
    return info or {"pct": 0, "stage": "Starting…"}


def import_file(db: Session, contents: bytes, filename: str, record_type: str,
                user_id: str, progress_token: str = None):
    """Parse the file and upsert rows keyed on CLAIM INVOICE NO + line key.

    Identity = invoice number + the line discriminator (PART NUMBER for the
    Part Sale file, SR NUMBER for Labour). A new line is inserted, a
    re-uploaded line with changed values UPDATES the stored row (latest
    upload wins), and an identical re-upload counts as a duplicate and is
    skipped. Rows without an invoice number fall back to a full-content hash.
    """
    if record_type not in ("part", "labour"):
        return {"success": False, "message": "record_type must be 'part' or 'labour'"}

    set_upload_progress(progress_token, 3, "Reading Excel file…")
    try:
        df = _read_excel(contents)
    except Exception as e:
        set_upload_progress(progress_token, 100, "Failed")
        return {"success": False, "message": f"Could not read Excel file: {e}"}

    mapping, unmapped = _map_headers(df, record_type)
    missing = [FIELD_LABELS[f] for f in CRITICAL_FIELDS if f not in mapping]
    if missing:
        set_upload_progress(progress_token, 100, "Failed")
        return {"success": False,
                "message": "Missing critical columns: " + ", ".join(missing)}

    set_upload_progress(progress_token, 8, "Parsing rows…")
    batch = PmsUploadBatch(
        record_type=record_type, file_name=filename[:255], total_rows=int(len(df)),
        uploaded_by=user_id,
    )
    db.add(batch)
    db.flush()

    # Resolve the line-key column (PART NUMBER / SR NUMBER) if the file has one.
    tight_cols = {_tight(c): c for c in df.columns if pd.notna(c)}
    line_col = next((tight_cols[k] for k in _LINE_KEY_HEADERS.get(record_type, [])
                     if k in tight_cols), None)

    inserted = updated = duplicates = skipped = 0
    by_line = {}        # (inv_no, line_key) -> parsed field dict (last in file wins)
    no_invoice = []     # rows without an invoice number -> content-hash dedupe

    total_rows = max(1, len(df))
    for row_i, (_, row) in enumerate(df.iterrows()):
        if progress_token and row_i % 200 == 0:
            set_upload_progress(progress_token, 8 + 42 * row_i / total_rows,
                                f"Parsing rows… {row_i:,} / {total_rows:,}")
        get = lambda f: row[mapping[f]] if f in mapping else None

        inv_date = _parse_date(get("claim_invoice_date"))
        branch_id = _norm_branch_id(get("branch_id"))
        amount = _parse_amount(get("net_taxable_amount"))
        if not branch_id or inv_date is None:
            skipped += 1
            continue

        extra = {}
        for c in unmapped:
            v = row[c]
            if pd.notna(v) and str(v).strip() != "":
                extra[str(c)] = str(v)

        inv_no = _clean_str(get("claim_invoice_no"), 100)
        fields = {
            "zone_name": _clean_str(get("zone_name"), 80),
            "soid": _clean_str(get("soid"), 80),
            "sd_name": _clean_str(get("sd_name"), 150),
            "branch_id": branch_id,
            "branch_name": _clean_str(get("branch_name"), 150),
            "claim_invoice_date": inv_date,
            "product_segment": _clean_str(get("product_segment"), 100),
            "segment": _clean_str(get("segment"), 100),
            "sr_type": _clean_str(get("sr_type"), 120),
            "net_taxable_amount": amount,
            "extra_data": json.dumps(extra, ensure_ascii=False) if extra else None,
        }

        if inv_no:
            line_key = (_clean_str(row[line_col], 120) or "") if line_col is not None else ""
            if (inv_no, line_key) in by_line:
                duplicates += 1        # repeated inside the same file — last wins
            by_line[(inv_no, line_key)] = fields
        else:
            raw = "|".join([record_type, branch_id, "", inv_date.isoformat(),
                            f"{amount:.2f}", fields["sr_type"] or "", fields["segment"] or ""])
            key = hashlib.sha256(raw.encode("utf-8")).hexdigest()
            no_invoice.append((key, fields))

    # ---- line-keyed upsert: the identity hash is deterministic, so existing
    # rows are found by dedupe_key in chunks ----
    id_of = {k: hashlib.sha256(f"{record_type}|inv|{k[0]}|{k[1]}".encode("utf-8")).hexdigest()
             for k in by_line}
    set_upload_progress(progress_token, 52, "Matching existing records…")
    existing = {}
    id_list = list(id_of.values())
    for i in range(0, len(id_list), 800):
        chunk = id_list[i:i + 800]
        for rec in db.query(PmsSalesRecord).filter(
                PmsSalesRecord.dedupe_key.in_(chunk)).all():
            existing[rec.dedupe_key] = rec

    for up_i, (key_pair, fields) in enumerate(by_line.items()):
        if progress_token and up_i % 200 == 0:
            set_upload_progress(progress_token, 58 + 32 * up_i / max(1, len(by_line)),
                                f"Importing rows… {up_i:,} / {len(by_line):,}")
        identity = id_of[key_pair]
        rec = existing.get(identity)
        if rec is not None:
            if all(getattr(rec, f) == fields[f] for f in _UPSERT_FIELDS):
                duplicates += 1        # identical re-upload
            else:
                for f in _UPSERT_FIELDS:
                    setattr(rec, f, fields[f])
                rec.batch_id = batch.id
                updated += 1           # same invoice line, newer values — latest wins
        else:
            db.add(PmsSalesRecord(record_type=record_type, claim_invoice_no=key_pair[0],
                                  dedupe_key=identity, batch_id=batch.id, **fields))
            inserted += 1

    set_upload_progress(progress_token, 90, "Importing remaining rows…")
    # ---- rows without an invoice number: content-hash dedupe (as before) ----
    seen_keys = set()
    keys = [k for k, _ in no_invoice]
    existing_keys = set()
    for i in range(0, len(keys), 800):
        chunk = keys[i:i + 800]
        rows = db.query(PmsSalesRecord.dedupe_key).filter(
            PmsSalesRecord.dedupe_key.in_(chunk)).all()
        existing_keys.update(k for (k,) in rows)

    for key, fields in no_invoice:
        if key in existing_keys or key in seen_keys:
            duplicates += 1
            continue
        seen_keys.add(key)
        db.add(PmsSalesRecord(record_type=record_type, claim_invoice_no=None,
                              dedupe_key=key, batch_id=batch.id, **fields))
        inserted += 1

    # ---- SR Type Master auto-sync: every SR type seen in an upload is added
    # to the mapping permanently (head defaulted when known). Rows are only
    # ever added here — deleting the uploaded data later never removes them.
    set_upload_progress(progress_token, 93, "Updating SR Type Master…")
    seen_types = {f["sr_type"] for f in by_line.values() if f.get("sr_type")}
    seen_types.update(f["sr_type"] for _, f in no_invoice if f.get("sr_type"))
    new_sr_types = 0
    if seen_types:
        known = {m.sr_type.lower() for m in db.query(PmsSrTypeMapping).all()}
        for sr in sorted(seen_types):
            if sr.lower() not in known:
                db.add(PmsSrTypeMapping(sr_type=sr,
                                        head=DEFAULT_SR_HEADS.get(sr),
                                        created_by=user_id))
                known.add(sr.lower())
                new_sr_types += 1

    batch.inserted_rows = inserted
    batch.updated_rows = updated
    batch.duplicate_rows = duplicates
    batch.skipped_rows = skipped
    set_upload_progress(progress_token, 96, "Saving to database…")
    db.commit()
    set_upload_progress(progress_token, 100, "Done")

    return {
        "success": True,
        "message": (f"{inserted} new, {updated} updated, {duplicates} duplicates skipped"
                    + (f" — {new_sr_types} new SR type(s) added to master" if new_sr_types else "")),
        "sr_types_added": new_sr_types,
        "batch_id": batch.id,
        "total_rows": batch.total_rows,
        "inserted": inserted,
        "updated": updated,
        "duplicates": duplicates,
        "skipped": skipped,
    }


def clear_all_data(db: Session):
    """Wipe every uploaded sales row + upload batch (targets, SR map and
    saved reports are kept). Used to re-import everything from scratch."""
    rows = db.query(PmsSalesRecord).delete(synchronize_session=False)
    batches = db.query(PmsUploadBatch).delete(synchronize_session=False)
    db.commit()
    return {"success": True, "deleted_rows": rows, "deleted_batches": batches}


def list_batches(db: Session, limit: int = 50):
    rows = (db.query(PmsUploadBatch)
            .order_by(PmsUploadBatch.id.desc()).limit(limit).all())
    return [{
        "id": b.id, "record_type": b.record_type, "file_name": b.file_name,
        "total_rows": b.total_rows, "inserted_rows": b.inserted_rows,
        "updated_rows": b.updated_rows or 0,
        "duplicate_rows": b.duplicate_rows, "skipped_rows": b.skipped_rows,
        "uploaded_by": b.uploaded_by,
        "uploaded_at": b.uploaded_at.isoformat() if b.uploaded_at else None,
    } for b in rows]


def data_summary(db: Session):
    """Row counts + invoice-date range per record type (shown on the page)."""
    out = {}
    for rt in ("part", "labour"):
        q = db.query(PmsSalesRecord).filter(PmsSalesRecord.record_type == rt)
        count = q.count()
        first = q.order_by(PmsSalesRecord.claim_invoice_date.asc()).first()
        last = q.order_by(PmsSalesRecord.claim_invoice_date.desc()).first()
        out[rt] = {
            "rows": count,
            "from_date": first.claim_invoice_date.isoformat() if first and first.claim_invoice_date else None,
            "to_date": last.claim_invoice_date.isoformat() if last and last.claim_invoice_date else None,
        }
    return out


def preview_rows(db: Session, record_type: str, limit: int = 200, offset: int = 0,
                 search: str = None, cancelled: str = None):
    """One page of stored rows (newest first) + the total count, so the
    frontend can lazy-load the full dataset with infinite scroll.
    `search` filters on CLAIM INVOICE NO (contains, case-insensitive).
    `cancelled`: None/'all' = every row, 'cancelled' = only cancelled
    invoices, 'active' = only non-cancelled."""
    q = (db.query(PmsSalesRecord)
         .filter(PmsSalesRecord.record_type == record_type))
    if search:
        # Escape LIKE wildcards (SQL Server also treats [ as one) so the user's
        # text is matched literally anywhere inside the invoice no.
        safe = (search.strip().replace("\\", "\\\\").replace("%", "\\%")
                .replace("_", "\\_").replace("[", "\\["))
        q = q.filter(PmsSalesRecord.claim_invoice_no.ilike(f"%{safe}%", escape="\\"))
    if cancelled == "cancelled":
        q = q.filter(PmsSalesRecord.is_cancelled == True)   # noqa: E712
    elif cancelled == "active":
        q = q.filter(PmsSalesRecord.is_cancelled == False)  # noqa: E712
    total = q.count()
    rows = (q.order_by(PmsSalesRecord.id.desc())
            .offset(offset).limit(limit).all())
    # Cancelled-row count for this type (whole dataset, so the filter chip can
    # show it regardless of the current search/page).
    cancelled_total = (db.query(PmsSalesRecord)
                       .filter(PmsSalesRecord.record_type == record_type,
                               PmsSalesRecord.is_cancelled == True)  # noqa: E712
                       .count())
    return {
        "total": total,
        "cancelled_total": cancelled_total,
        "items": [{
            "id": r.id,
            "zone_name": r.zone_name, "soid": r.soid, "sd_name": r.sd_name,
            "branch_id": r.branch_id, "branch_name": r.branch_name,
            "claim_invoice_no": r.claim_invoice_no,
            "claim_invoice_date": r.claim_invoice_date.isoformat() if r.claim_invoice_date else None,
            "product_segment": r.product_segment, "segment": r.segment,
            "sr_type": r.sr_type, "net_taxable_amount": r.net_taxable_amount,
            "is_cancelled": bool(r.is_cancelled),
            "cancelled_by": r.cancelled_by,
            "cancelled_at": r.cancelled_at.isoformat() if r.cancelled_at else None,
            # every unmapped file column (original header -> value)
            "extra": json.loads(r.extra_data) if r.extra_data else {},
        } for r in rows],
    }


def set_row_cancelled(db: Session, record_type: str, row_id: int,
                      cancelled: bool, user_id: str = None):
    """Cancel / restore ONE stored row (not the whole invoice). The filter is
    scoped to the record type, so a Part Sale cancel can never touch Labour
    data and vice versa. The row stays in the database, just flagged — and
    every generated report skips flagged rows."""
    rows = (db.query(PmsSalesRecord)
            .filter(PmsSalesRecord.id == int(row_id),
                    PmsSalesRecord.record_type == record_type)
            .update({PmsSalesRecord.is_cancelled: bool(cancelled),
                     PmsSalesRecord.cancelled_by: (user_id if cancelled else None),
                     PmsSalesRecord.cancelled_at: (now_ist() if cancelled else None)},
                    synchronize_session=False))
    db.commit()
    if not rows:
        return {"success": False, "message": "Row not found"}
    return {"success": True, "rows": rows, "cancelled": bool(cancelled)}


# ---------------- AOP MASTER: BRANCH TARGETS -------------------------------- #

# Working-days master is YEAR-INDEPENDENT: one row per calendar month
# ('ALL-04' = April) applies to EVERY financial year. Year-specific rows
# ('2026-04', from before this change) remain as a fallback.
_ALL_WD_PREFIX = "ALL-"


def _all_wd_map(db: Session):
    """{month number '04'..'12': PmsMonthSettings} of the universal rows."""
    rows = (db.query(PmsMonthSettings)
            .filter(PmsMonthSettings.target_month.like(f"{_ALL_WD_PREFIX}%")).all())
    return {r.target_month[len(_ALL_WD_PREFIX):]: r for r in rows}


def _count_workdays(start: date, end: date) -> int:
    """Days in [start..end] excluding Sundays."""
    n, cur = 0, start
    while cur <= end:
        if cur.weekday() != 6:
            n += 1
        cur += timedelta(days=1)
    return n


def _month_bounds(month: str):
    y, m = map(int, month.split("-"))
    return date(y, m, 1), date(y, m, calendar.monthrange(y, m)[1])


def _branch_admins(db: Session):
    """branch -> Branch Admin name. A branch admin with multi-branch access
    (UserBranchAccess, granted from Profile) is the responsible person for
    EVERY branch they can access, not just their primary one."""
    admins = {}
    branch_admins = (db.query(User)
                     .filter(User.role == UserRole.BRANCH_ADMIN,
                             User.is_deleted == False)  # noqa: E712
                     .all())
    for u in branch_admins:
        admins.setdefault(_norm_branch_id(u.branch), u.name)
    by_uid = {u.user_id: u.name for u in branch_admins}
    if by_uid:
        for acc in (db.query(UserBranchAccess)
                    .filter(UserBranchAccess.user_id.in_(list(by_uid))).all()):
            admins.setdefault(_norm_branch_id(acc.branch), by_uid[acc.user_id])
    return admins


def _profile_branches(db: Session):
    """Every branch the ERP knows: the static list plus any branch that
    appears on a user account in the Profile page (new branches show up here
    automatically). HO is not a sales branch."""
    branches = {b: {"region": r, "name": n} for r, b, n in ERP_BRANCHES}
    for u in db.query(User).filter(User.is_deleted == False).all():  # noqa: E712
        b = _norm_branch_id(u.branch)
        if b and b != "HO" and b not in branches:
            branches[b] = {"region": None, "name": u.branch_name}
    for acc in db.query(UserBranchAccess).all():
        b = _norm_branch_id(acc.branch)
        if b and b != "HO" and b not in branches:
            branches[b] = {"region": None, "name": acc.branch_name}
    return branches


def get_targets_payload(db: Session, month: str):
    """The month's target rows + working-days setting, kept in sync with the
    Profile page on EVERY load: branches added there appear as new rows, and
    the responsible person always mirrors the current Branch Admin(s)."""
    branches = _profile_branches(db)
    admins = _branch_admins(db)
    existing = {t.branch_id: t for t in
                db.query(PmsBranchTarget).filter(PmsBranchTarget.target_month == month).all()}

    changed = False
    for b, info in branches.items():
        t = existing.get(b)
        admin = admins.get(b)
        if t is None:
            db.add(PmsBranchTarget(
                target_month=month, branch_id=b, region=info["region"],
                branch_name=info["name"], responsible_person=admin,
                spare_target=0, labour_target=0, created_by="profile-sync",
            ))
            changed = True
        else:
            # Profile changes flow into the saved rows (targets untouched)
            if admin and t.responsible_person != admin:
                t.responsible_person = admin
                changed = True
            if info["name"] and t.branch_name != info["name"]:
                t.branch_name = info["name"]
                changed = True
            # Region is user-editable — the sync only fills it when blank.
            if info["region"] and not t.region:
                t.region = info["region"]
                changed = True
    if changed:
        db.commit()

    items = list_targets(db, month)
    prefill = False

    m_start, m_end = _month_bounds(month)
    default_wd = _count_workdays(m_start, m_end)
    setting = (db.query(PmsMonthSettings)
               .filter(PmsMonthSettings.target_month == month).first())
    return {
        "items": items,
        "prefill": prefill,
        "working_days": (setting.working_days if setting and setting.working_days else default_wd),
        "default_working_days": default_wd,
    }


def _branch_sort_key(branch_id):
    """Natural order — 420435_1, _2 … _10, _14 (string sort puts _10 before _8)."""
    m = re.search(r"(\d+)$", branch_id or "")
    return (int(m.group(1)) if m else 10 ** 9, branch_id or "")


def list_targets(db: Session, month: str):
    rows = sorted(
        db.query(PmsBranchTarget)
        .filter(PmsBranchTarget.target_month == month).all(),
        key=lambda t: _branch_sort_key(t.branch_id))
    return [{
        "id": t.id, "target_month": t.target_month, "region": t.region,
        "branch_id": t.branch_id, "branch_name": t.branch_name,
        "responsible_person": t.responsible_person,
        "spare_target": t.spare_target, "labour_target": t.labour_target,
    } for t in rows]


def save_targets(db: Session, month: str, rows: list, user_id: str, working_days=None):
    """Upsert the month's target rows (matched on branch_id) and, when given,
    the month's working-days setting."""
    if working_days is not None:
        try:
            wd = max(1, min(31, int(working_days)))
            setting = (db.query(PmsMonthSettings)
                       .filter(PmsMonthSettings.target_month == month).first())
            if not setting:
                setting = PmsMonthSettings(target_month=month)
                db.add(setting)
            setting.working_days = wd
            setting.updated_by = user_id
        except (ValueError, TypeError):
            pass
    saved = 0
    for r in rows:
        branch_id = _norm_branch_id(r.get("branch_id"))
        if not branch_id:
            continue
        row = (db.query(PmsBranchTarget)
               .filter(PmsBranchTarget.target_month == month,
                       PmsBranchTarget.branch_id == branch_id).first())
        if not row:
            row = PmsBranchTarget(target_month=month, branch_id=branch_id,
                                  created_by=user_id)
            db.add(row)
        row.region = (r.get("region") or "").strip().upper()[:10] or None
        row.branch_name = _clean_str(r.get("branch_name"), 120)
        row.responsible_person = _clean_str(r.get("responsible_person"), 120)
        row.spare_target = _parse_amount(r.get("spare_target"))
        row.labour_target = _parse_amount(r.get("labour_target"))
        row.updated_by = user_id
        saved += 1
    db.commit()
    return {"success": True, "saved": saved, "items": list_targets(db, month)}


# ---- Financial-year view (Apr..Mar) ---------------------------------------
# The Target Master UI edits a whole FY at once: one grid per metric with 12
# month columns + a monthly working-days master. Storage is unchanged — the
# same per-(month, branch) rows in pms_branch_targets / pms_month_settings the
# report already reads.

def _fy_months(fy_start: int):
    """['2025-04' .. '2025-12', '2026-01' .. '2026-03'] for fy_start=2025."""
    return ([f"{fy_start}-{m:02d}" for m in range(4, 13)] +
            [f"{fy_start + 1}-{m:02d}" for m in range(1, 4)])


def get_targets_year_payload(db: Session, fy_start: int):
    """Branch rows for the whole FY (spare/labour per month, in rupees) plus
    the monthly working-days settings. Branch list + responsible person are
    synced from the Profile page on every load, same as the month view; rows
    are materialised in the DB only on save."""
    months = _fy_months(fy_start)
    branches = _profile_branches(db)
    admins = _branch_admins(db)

    def _blank_row(branch_id, region=None, name=None, person=None):
        return {
            "branch_id": branch_id, "region": region, "branch_name": name,
            "responsible_person": person,
            "spare": {m: 0 for m in months},
            "labour": {m: 0 for m in months},
        }

    by_branch = {b: _blank_row(b, info["region"], info["name"], admins.get(b))
                 for b, info in branches.items()}

    targets = (db.query(PmsBranchTarget)
               .filter(PmsBranchTarget.target_month.in_(months))
               .order_by(PmsBranchTarget.target_month).all())
    for t in targets:
        row = by_branch.setdefault(
            t.branch_id,
            _blank_row(t.branch_id, t.region, t.branch_name, t.responsible_person))
        row["spare"][t.target_month] = t.spare_target or 0
        row["labour"][t.target_month] = t.labour_target or 0
        # Region is user-editable — a saved row's region wins over the
        # profile default (latest month wins via the order_by above).
        if t.region:
            row["region"] = t.region
        if t.branch_name and not row["branch_name"]:
            row["branch_name"] = t.branch_name
        if t.responsible_person and not row["responsible_person"]:
            row["responsible_person"] = t.responsible_person

    default_wd = {}
    for m in months:
        m_start, m_end = _month_bounds(m)
        default_wd[m] = _count_workdays(m_start, m_end)
    saved = {s.target_month: s for s in
             db.query(PmsMonthSettings)
             .filter(PmsMonthSettings.target_month.in_(months)).all()}
    all_wd = _all_wd_map(db)

    # Region-wise working days (MH / KA). The universal ('ALL-MM', every FY)
    # row wins; old year-specific rows and the legacy single value fall back.
    def _wd_pair(m):
        s = all_wd.get(m[5:7]) or saved.get(m)
        base = (s.working_days if s and s.working_days else default_wd[m])
        return {
            "mh": (s.working_days_mh if s and s.working_days_mh else base),
            "ka": (s.working_days_ka if s and s.working_days_ka else base),
        }

    return {
        "months": months,
        "items": sorted(by_branch.values(),
                        key=lambda r: _branch_sort_key(r["branch_id"])),
        "working_days": {m: _wd_pair(m) for m in months},
        "default_working_days": default_wd,
    }


def save_targets_year(db: Session, fy_start: int, rows: list, user_id: str,
                      working_days: dict = None):
    """Upsert the FY's target rows (12 months per branch) and the monthly
    working-days settings. Values arrive in rupees."""
    months = _fy_months(fy_start)
    month_set = set(months)

    def _iv(v):
        try:
            return max(1, min(31, int(v)))
        except (ValueError, TypeError):
            return None

    for m, wd in (working_days or {}).items():
        if m not in month_set:
            continue
        # New style: {'mh': n, 'ka': n}. Legacy: a single int for both.
        if isinstance(wd, dict):
            mh, ka = _iv(wd.get("mh")), _iv(wd.get("ka"))
        else:
            mh = ka = _iv(wd)
        if mh is None and ka is None:
            continue
        # Saved under the UNIVERSAL month key ('ALL-04') — one master for
        # every financial year, not per-FY.
        key = _ALL_WD_PREFIX + m[5:7]
        setting = (db.query(PmsMonthSettings)
                   .filter(PmsMonthSettings.target_month == key).first())
        if not setting:
            setting = PmsMonthSettings(target_month=key)
            db.add(setting)
        if mh is not None:
            setting.working_days_mh = mh
        if ka is not None:
            setting.working_days_ka = ka
        # legacy mirror (pre-split readers)
        setting.working_days = mh or ka
        setting.updated_by = user_id

    existing = {(t.target_month, t.branch_id): t for t in
                db.query(PmsBranchTarget)
                .filter(PmsBranchTarget.target_month.in_(months)).all()}
    saved = 0
    for r in rows:
        branch_id = _norm_branch_id(r.get("branch_id"))
        if not branch_id:
            continue
        region = (r.get("region") or "").strip().upper()[:10] or None
        branch_name = _clean_str(r.get("branch_name"), 120)
        person = _clean_str(r.get("responsible_person"), 120)
        spare = r.get("spare") or {}
        labour = r.get("labour") or {}
        for m in months:
            row = existing.get((m, branch_id))
            if not row:
                row = PmsBranchTarget(target_month=m, branch_id=branch_id,
                                      created_by=user_id)
                db.add(row)
                existing[(m, branch_id)] = row
            row.region = region
            row.branch_name = branch_name
            row.responsible_person = person
            row.spare_target = _parse_amount(spare.get(m))
            row.labour_target = _parse_amount(labour.get(m))
            row.updated_by = user_id
        saved += 1
    db.commit()
    return {"success": True, "saved": saved,
            **get_targets_year_payload(db, fy_start)}


def delete_target(db: Session, target_id: int):
    row = db.query(PmsBranchTarget).filter(PmsBranchTarget.id == target_id).first()
    if not row:
        return {"success": False, "message": "Target row not found"}
    db.delete(row)
    db.commit()
    return {"success": True}


def copy_targets(db: Session, from_month: str, to_month: str, user_id: str):
    """Convenience: seed a new month from an existing one (skips branches the
    new month already has)."""
    src = db.query(PmsBranchTarget).filter(PmsBranchTarget.target_month == from_month).all()
    have = {t.branch_id for t in db.query(PmsBranchTarget)
            .filter(PmsBranchTarget.target_month == to_month).all()}
    copied = 0
    for t in src:
        if t.branch_id in have:
            continue
        db.add(PmsBranchTarget(
            target_month=to_month, region=t.region, branch_id=t.branch_id,
            branch_name=t.branch_name, responsible_person=t.responsible_person,
            spare_target=t.spare_target, labour_target=t.labour_target,
            created_by=user_id,
        ))
        copied += 1
    db.commit()
    return {"success": True, "copied": copied, "items": list_targets(db, to_month)}


# ---------------- SR TYPE MASTER ------------------------------------------- #

def list_heads(db: Session):
    """Head master rows (seeded with the five default heads on first use)."""
    if db.query(PmsHead).count() == 0:
        for h in HEAD_CHOICES:
            db.add(PmsHead(name=h, created_by="system"))
        db.commit()
    rows = db.query(PmsHead).order_by(PmsHead.id).all()
    return [{"id": h.id, "name": h.name} for h in rows]


def add_head(db: Session, name: str, user_id: str):
    name = (_clean_str(name, 60) or "").strip()
    if not name:
        return {"success": False, "message": "Head name is required"}
    exists = db.query(PmsHead).filter(PmsHead.name.ilike(name)).first()
    if exists:
        return {"success": False, "message": f"Head “{exists.name}” already exists"}
    db.add(PmsHead(name=name, created_by=user_id))
    db.commit()
    return {"success": True, "items": list_heads(db)}


def delete_head(db: Session, head_id: int):
    row = db.query(PmsHead).filter(PmsHead.id == head_id).first()
    if not row:
        return {"success": False, "message": "Head not found"}
    used = (db.query(PmsSrTypeMapping)
            .filter(PmsSrTypeMapping.head == row.name).count())
    if used:
        return {"success": False,
                "message": f"“{row.name}” is used by {used} SR type(s) — remap them first"}
    db.delete(row)
    db.commit()
    return {"success": True, "items": list_heads(db)}


def _seed_sr_defaults(db: Session):
    existing = {m.sr_type.lower() for m in db.query(PmsSrTypeMapping).all()}
    added = 0
    for sr, head in DEFAULT_SR_HEADS.items():
        if sr.lower() not in existing:
            db.add(PmsSrTypeMapping(sr_type=sr, head=head, created_by="system"))
            added += 1
    if added:
        db.commit()
    return added


def list_sr_types(db: Session):
    if db.query(PmsSrTypeMapping).count() == 0:
        _seed_sr_defaults(db)
    rows = db.query(PmsSrTypeMapping).order_by(PmsSrTypeMapping.sr_type).all()
    return [{"id": m.id, "sr_type": m.sr_type, "head": m.head} for m in rows]


def save_sr_types(db: Session, items: list, user_id: str):
    for it in items:
        sr = _clean_str(it.get("sr_type"), 120)
        if not sr:
            continue
        row = (db.query(PmsSrTypeMapping)
               .filter(PmsSrTypeMapping.sr_type == sr).first())
        if not row:
            row = PmsSrTypeMapping(sr_type=sr, created_by=user_id)
            db.add(row)
        row.head = _clean_str(it.get("head"), 60)
        row.updated_by = user_id
    db.commit()
    return {"success": True, "items": list_sr_types(db)}


def sync_sr_types(db: Session, user_id: str):
    """Pull distinct SR types present in the uploaded data into the mapping
    (new ones arrive with head defaulted from the known list, else blank)."""
    _seed_sr_defaults(db)
    known = {m.sr_type.lower() for m in db.query(PmsSrTypeMapping).all()}
    distinct = (db.query(PmsSalesRecord.sr_type)
                .filter(PmsSalesRecord.sr_type.isnot(None))
                .distinct().all())
    added = 0
    for (sr,) in distinct:
        sr = (sr or "").strip()
        if sr and sr.lower() not in known:
            db.add(PmsSrTypeMapping(sr_type=sr,
                                    head=DEFAULT_SR_HEADS.get(sr),
                                    created_by=user_id))
            known.add(sr.lower())
            added += 1
    db.commit()
    return {"success": True, "added": added, "items": list_sr_types(db)}


def reset_sr_types(db: Session, user_id: str):
    """Restore every default mapping to its given head (extra custom SR types
    are left untouched)."""
    for sr, head in DEFAULT_SR_HEADS.items():
        row = db.query(PmsSrTypeMapping).filter(PmsSrTypeMapping.sr_type == sr).first()
        if row:
            row.head = head
            row.updated_by = user_id
        else:
            db.add(PmsSrTypeMapping(sr_type=sr, head=head, created_by=user_id))
    db.commit()
    return {"success": True, "items": list_sr_types(db)}


# ---------------- REPORT GENERATION ---------------------------------------- #

def _region_of(zone_name):
    z = (zone_name or "").strip().upper()
    if z.startswith("MH") or "MAHARASHTRA" in z:
        return "MH"
    if z.startswith("KA") or "KARNATAK" in z:
        return "KA"
    return z or "Other"


def generate_report(db: Session, as_on: date, from_date: date = None,
                    part_as_on: date = None, labour_as_on: date = None):
    """The full report payload for the period [from_date .. as_on].

    Without from_date the period is month-to-date (classic view). Weekly /
    quarterly / yearly periods just pass a wider window. Targets come from
    the AOP Master rows of every month the period touches:

      Target (period)     -> Σ full monthly targets of the touched months
      Daily Target        -> Target / total days of those months
      Target till <to>    -> Σ monthly target × (days of month inside period / days in month)
      Achi. on <to>       -> Σ NET TAXABLE AMOUNT on the period's last day
      Achi. till <to>     -> Σ amount inside the period
      Invoice Count till  -> distinct CLAIM INVOICE NO in the period
      % Achieved          -> Achi. till / Target × 100

    part_as_on / labour_as_on optionally give EACH record type its own
    period end (used by the default all-data report, where the Part Sale and
    Labour files end on different dates — each side is then measured against
    targets only up to its own last data date). Omitted -> both use as_on.
    """
    to_by = {"part": part_as_on or as_on, "labour": labour_as_on or as_on}
    to_date = max(to_by.values())
    if from_date is None:
        from_date = to_date.replace(day=1)
    if from_date > to_date:
        from_date, to_date = to_date, from_date
    for rt in to_by:                       # keep each end inside the period
        to_by[rt] = min(max(to_by[rt], from_date), to_date)

    # Months each type's window overlaps. Targets spread over WORKING days
    # (Sundays excluded); the per-month count is editable in the AOP Master
    # PER REGION — MH and KA have different holidays, so each region's
    # branches use their own working-days count.
    def _months_till(to_d):
        info = {}
        cur = from_date.replace(day=1)
        while cur <= to_d:
            dim = calendar.monthrange(cur.year, cur.month)[1]
            m_end = cur.replace(day=dim)
            ov_start, ov_end = max(cur, from_date), min(m_end, to_d)
            wd_default = _count_workdays(cur, m_end)
            info[cur.strftime("%Y-%m")] = {
                "ov_work": _count_workdays(ov_start, ov_end),
                "wd_mh": wd_default,      # defaults; overridden below
                "wd_ka": wd_default,
            }
            cur = m_end + timedelta(days=1)
        return info

    month_by_rt = {rt: _months_till(d) for rt, d in to_by.items()}
    all_months = sorted(set(month_by_rt["part"]) | set(month_by_rt["labour"]))

    # Universal per-month rows ('ALL-MM', apply to EVERY year) win; old
    # year-specific rows are the fallback for months saved before the change.
    year_rows = {s.target_month: s for s in
                 db.query(PmsMonthSettings)
                 .filter(PmsMonthSettings.target_month.in_(all_months)).all()}
    all_wd = _all_wd_map(db)
    for month in all_months:
        s = all_wd.get(month[5:7]) or year_rows.get(month)
        if s is None:
            continue
        mh = s.working_days_mh or s.working_days
        ka = s.working_days_ka or s.working_days
        for m in month_by_rt.values():
            if month in m:
                if mh:
                    m[month]["wd_mh"] = max(1, mh)
                if ka:
                    m[month]["wd_ka"] = max(1, ka)

    def _wd_of(info, region):
        return info["wd_ka"] if (region or "").upper() == "KA" else info["wd_mh"]

    # Period working days per record type AND region (drives Daily Target)
    total_days_reg = {rt: {
        "MH": max(1, sum(i["wd_mh"] for i in m.values())),
        "KA": max(1, sum(i["wd_ka"] for i in m.values())),
    } for rt, m in month_by_rt.items()}
    total_days_rt = {rt: max(v.values()) for rt, v in total_days_reg.items()}

    target_rows = db.query(PmsBranchTarget).filter(
        PmsBranchTarget.target_month.in_(all_months)).all()

    # Per-branch target sums (full + prorated-till) and display info from the
    # latest touched month's target row. Each record type only counts the
    # months inside ITS window.
    full_target, till_target, info_by_branch = {}, {}, {}
    for t in target_rows:
        f = full_target.setdefault(t.branch_id, {"part": 0.0, "labour": 0.0})
        p = till_target.setdefault(t.branch_id, {"part": 0.0, "labour": 0.0})
        for rt in ("part", "labour"):
            info = month_by_rt[rt].get(t.target_month)
            if info is None:
                continue                   # month beyond this type's as-on
            wd = _wd_of(info, t.region)    # region-wise working days
            ratio = min(info["ov_work"], wd) / wd
            val = (t.spare_target if rt == "part" else t.labour_target) or 0
            f[rt] += val
            p[rt] += val * ratio
        prev = info_by_branch.get(t.branch_id)
        if prev is None or t.target_month > prev.target_month:
            info_by_branch[t.branch_id] = t

    records = (db.query(PmsSalesRecord)
               .filter(PmsSalesRecord.claim_invoice_date >= from_date,
                       PmsSalesRecord.claim_invoice_date <= to_date,
                       # cancelled invoices stay stored but never count
                       PmsSalesRecord.is_cancelled == False)  # noqa: E712
               .all())

    # Built-in defaults first, then DB rows on top — so the report groups
    # correctly even before the SR Type Master has ever been opened/saved.
    sr_head = {k.lower(): v for k, v in DEFAULT_SR_HEADS.items()}
    sr_head.update({m.sr_type.lower(): (m.head or "Unmapped")
                    for m in db.query(PmsSrTypeMapping).all()})

    # ---- aggregate helpers ----
    def _blank():
        return {"achieved_on": 0.0, "achieved_till": 0.0,
                "invoices": set(), "invoices_on": set()}

    branch_agg = {"part": {}, "labour": {}}
    region_agg = {}          # region -> {part, labour, invoices:set}
    segment_agg = {}         # segment -> {part, labour, invoices:set}
    head_agg = {}            # head -> {part, labour, invoices:set}
    category_agg = {}        # CATEGORY (Part Sale file only) -> {part, invoices:set}
    branch_info = {}         # branch_id -> {branch_name, region} discovered from data

    for r in records:
        rt = r.record_type
        if r.claim_invoice_date > to_by.get(rt, to_date):
            continue                       # beyond this type's own as-on date
        b = r.branch_id or "UNKNOWN"
        t = info_by_branch.get(b)
        region = (t.region if t and t.region else _region_of(r.zone_name))

        info = branch_info.setdefault(b, {"branch_name": None, "region": region})
        if r.branch_name and not info["branch_name"]:
            info["branch_name"] = r.branch_name

        agg = branch_agg[rt].setdefault(b, _blank())
        amt = r.net_taxable_amount or 0.0
        inv = (rt, r.claim_invoice_no or f"row-{r.id}")
        agg["achieved_till"] += amt
        agg["invoices"].add(inv)
        if r.claim_invoice_date == to_by.get(rt, to_date):
            agg["achieved_on"] += amt
            agg["invoices_on"].add(inv)

        reg = region_agg.setdefault(region, {"part": 0.0, "labour": 0.0, "invoices": set()})
        reg[rt] += amt
        reg["invoices"].add(inv)

        seg_key = (r.segment or r.product_segment or "Unspecified").strip() or "Unspecified"
        seg = segment_agg.setdefault(seg_key, {"part": 0.0, "labour": 0.0, "invoices": set()})
        seg[rt] += amt
        seg["invoices"].add(inv)

        head_key = sr_head.get((r.sr_type or "").strip().lower(),
                               "Unmapped" if r.sr_type else "Unspecified")
        hd = head_agg.setdefault(head_key, {"part": 0.0, "labour": 0.0, "invoices": set()})
        hd[rt] += amt
        hd["invoices"].add(inv)

        # CATEGORY comes only in the Part Sale file — it's an unmapped column,
        # so it lives in extra_data (QUANTITY too). Spare-only breakdown;
        # blanks grouped like Excel's "(Blanks)".
        if rt == "part":
            cat, qty = None, 0.0
            if r.extra_data:
                try:
                    for k, v in json.loads(r.extra_data).items():
                        tk = _tight(k)
                        if tk == "CATEGORY":
                            cat = str(v).strip()
                        elif tk in ("QUANTITY", "QTY"):
                            qty = _parse_amount(v)
                except (ValueError, TypeError):
                    pass
            c = category_agg.setdefault(cat or "(Blanks)",
                                        {"part": 0.0, "invoices": set(), "qty": 0.0, "lines": 0})
            c["part"] += amt
            c["qty"] += qty
            c["lines"] += 1        # one stored row = one part line of an invoice
            c["invoices"].add(inv)

    # ---- branch tables (one per record type, same shape as the mockup) ----
    def _branch_rows(rt):
        rows = []
        branch_ids = set(full_target) | set(branch_agg[rt])
        for b in sorted(branch_ids, key=_branch_sort_key):
            t = info_by_branch.get(b)
            agg = branch_agg[rt].get(b) or _blank()
            info = branch_info.get(b, {})
            region = (t.region if t and t.region else info.get("region")) or "Other"
            period_target = (full_target.get(b) or {}).get(rt, 0.0)
            # Daily Target spreads the target over the branch's OWN region's
            # working days (MH and KA can differ)
            reg_days = total_days_reg[rt]["KA" if region.upper() == "KA" else "MH"]
            daily = period_target / reg_days if period_target else 0.0
            target_till = (till_target.get(b) or {}).get(rt, 0.0)
            achieved_till = round(agg["achieved_till"], 2)
            rows.append({
                "responsible_person": (t.responsible_person if t else None) or "—",
                "branch_id": b,
                "branch_name": (t.branch_name if t and t.branch_name else info.get("branch_name")) or b,
                "region": region,
                "monthly_target": round(period_target, 2),   # period target (key kept for compat)
                "daily_target": round(daily, 2),
                "achieved_on": round(agg["achieved_on"], 2),
                "target_till": round(target_till, 2),
                "achieved_till": achieved_till,
                "invoice_count_till": len(agg["invoices"]),
                # Same formulas as the business's Result report:
                #   % Achieved     = Achi. Till / Target Till
                #   Short-Fall     = Target Till - Achi. Till   (negative = ahead)
                #   Balance/Month  = Monthly Target - Achi. Till
                "pct_achieved": round(achieved_till / target_till * 100, 1) if target_till else None,
                "short_fall_till": round(target_till - achieved_till, 2),
                "balance_month": round(period_target - achieved_till, 2),
            })
        return rows

    part_rows = _branch_rows("part")
    labour_rows = _branch_rows("labour")

    total_spare = round(sum(r["achieved_till"] for r in part_rows), 2)
    total_labour = round(sum(r["achieved_till"] for r in labour_rows), 2)
    total_spare_target = round(sum(f["part"] for f in full_target.values()), 2)
    total_labour_target = round(sum(f["labour"] for f in full_target.values()), 2)
    total_target = total_spare_target + total_labour_target
    total_invoices = len(set().union(*[a["invoices"] for a in branch_agg["part"].values()],
                                     *[a["invoices"] for a in branch_agg["labour"].values()])
                         ) if (branch_agg["part"] or branch_agg["labour"]) else 0

    def _dictrows(d):
        return [{
            "name": k, "part": round(v["part"], 2), "labour": round(v["labour"], 2),
            "total": round(v["part"] + v["labour"], 2), "invoices": len(v["invoices"]),
        } for k, v in sorted(d.items(), key=lambda kv: -(kv[1]["part"] + kv[1]["labour"]))]

    return {
        "success": True,
        "as_on": to_date.isoformat(),
        "as_on_part": to_by["part"].isoformat(),
        "as_on_labour": to_by["labour"].isoformat(),
        "from_date": from_date.isoformat(),
        "month": to_date.strftime("%Y-%m"),
        "days_in_month": max(total_days_rt.values()),
        "day_number": (to_date - from_date).days + 1,
        "generated_at": datetime.now().isoformat(),
        "summary": {
            "total_spare_sale": total_spare,
            "total_labour_sale": total_labour,
            "total_spare_target": total_spare_target,
            "total_labour_target": total_labour_target,
            "overall_pct_achieved": round((total_spare + total_labour) / total_target * 100, 1)
                                     if total_target else None,
            "total_invoices": total_invoices,
        },
        "spare_rows": part_rows,
        "labour_rows": labour_rows,
        "regional": _dictrows(region_agg),
        "segment": _dictrows(segment_agg),
        "service_head": _dictrows(head_agg),
        # Spare-only (the Labour file has no CATEGORY column)
        "category": [{
            "name": k, "part": round(v["part"], 2),
            "invoices": len(v["invoices"]),
            "qty": round(v["qty"], 2),
            "lines": v["lines"],
        } for k, v in sorted(category_agg.items(), key=lambda kv: -kv[1]["part"])],
    }


# ---------------- REPORT HISTORY ------------------------------------------- #

def save_report(db: Session, as_on: date, title: str, payload: dict, user_id: str):
    row = PmsReportHistory(
        as_on_date=as_on, title=(title or f"Report as on {as_on.isoformat()}")[:200],
        payload=json.dumps(payload, ensure_ascii=False), created_by=user_id,
    )
    db.add(row)
    db.commit()
    return {"success": True, "id": row.id}


def _user_names(db: Session, user_ids):
    ids = [u for u in set(user_ids) if u]
    if not ids:
        return {}
    return {u.user_id: u.name for u in
            db.query(User).filter(User.user_id.in_(ids)).all()}


def list_reports(db: Session, limit: int = 100):
    rows = (db.query(PmsReportHistory.id, PmsReportHistory.as_on_date,
                     PmsReportHistory.title, PmsReportHistory.created_by,
                     PmsReportHistory.created_at)
            .order_by(PmsReportHistory.id.desc()).limit(limit).all())
    names = _user_names(db, [r.created_by for r in rows])
    return [{
        "id": r.id, "as_on_date": r.as_on_date.isoformat(),
        "title": r.title, "created_by": r.created_by,
        "created_by_name": names.get(r.created_by, r.created_by or "—"),
        "created_at": r.created_at.isoformat() if r.created_at else None,
    } for r in rows]


def get_report(db: Session, report_id: int):
    row = db.query(PmsReportHistory).filter(PmsReportHistory.id == report_id).first()
    if not row:
        return {"success": False, "message": "Report not found"}
    names = _user_names(db, [row.created_by])
    return {"success": True, "id": row.id, "title": row.title,
            "as_on_date": row.as_on_date.isoformat(),
            "created_by_name": names.get(row.created_by, row.created_by or "—"),
            "created_at": row.created_at.isoformat() if row.created_at else None,
            "payload": json.loads(row.payload)}


def delete_report(db: Session, report_id: int):
    row = db.query(PmsReportHistory).filter(PmsReportHistory.id == report_id).first()
    if not row:
        return {"success": False, "message": "Report not found"}
    db.delete(row)
    db.commit()
    return {"success": True}
