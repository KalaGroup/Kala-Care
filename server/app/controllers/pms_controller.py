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
    PmsSalesRecord, PmsReportHistory,
)

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

# The report cannot be built without these three.
CRITICAL_FIELDS = ["branch_id", "claim_invoice_date", "net_taxable_amount"]

FIELD_LABELS = {
    "branch_id": "BRANCH ID",
    "claim_invoice_date": "CLAIM INVOICE DATE",
    "net_taxable_amount": "NET TAXABLE AMOUNT",
}


def _map_headers(df: pd.DataFrame):
    """Return ({canonical_field: actual column}, [unmapped columns])."""
    cols = [c for c in df.columns if pd.notna(c)]
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
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    ts = pd.to_datetime(str(value).strip(), dayfirst=True, errors="coerce")
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

def validate_file(contents: bytes, filename: str):
    """Dry-run: report which canonical columns were found / are missing and a
    small sample, without writing anything."""
    try:
        df = _read_excel(contents)
    except Exception as e:
        return {"success": False, "message": f"Could not read Excel file: {e}"}

    mapping, unmapped = _map_headers(df)
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


def import_file(db: Session, contents: bytes, filename: str, record_type: str, user_id: str):
    """Parse the file and upsert rows keyed on CLAIM INVOICE NO + line key.

    Identity = invoice number + the line discriminator (PART NUMBER for the
    Part Sale file, SR NUMBER for Labour). A new line is inserted, a
    re-uploaded line with changed values UPDATES the stored row (latest
    upload wins), and an identical re-upload counts as a duplicate and is
    skipped. Rows without an invoice number fall back to a full-content hash.
    """
    if record_type not in ("part", "labour"):
        return {"success": False, "message": "record_type must be 'part' or 'labour'"}

    try:
        df = _read_excel(contents)
    except Exception as e:
        return {"success": False, "message": f"Could not read Excel file: {e}"}

    mapping, unmapped = _map_headers(df)
    missing = [FIELD_LABELS[f] for f in CRITICAL_FIELDS if f not in mapping]
    if missing:
        return {"success": False,
                "message": "Missing critical columns: " + ", ".join(missing)}

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

    for _, row in df.iterrows():
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
    existing = {}
    id_list = list(id_of.values())
    for i in range(0, len(id_list), 800):
        chunk = id_list[i:i + 800]
        for rec in db.query(PmsSalesRecord).filter(
                PmsSalesRecord.dedupe_key.in_(chunk)).all():
            existing[rec.dedupe_key] = rec

    for key_pair, fields in by_line.items():
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

    batch.inserted_rows = inserted
    batch.updated_rows = updated
    batch.duplicate_rows = duplicates
    batch.skipped_rows = skipped
    db.commit()

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


def preview_rows(db: Session, record_type: str, limit: int = 50):
    rows = (db.query(PmsSalesRecord)
            .filter(PmsSalesRecord.record_type == record_type)
            .order_by(PmsSalesRecord.id.desc()).limit(limit).all())
    return [{
        "zone_name": r.zone_name, "soid": r.soid, "sd_name": r.sd_name,
        "branch_id": r.branch_id, "branch_name": r.branch_name,
        "claim_invoice_no": r.claim_invoice_no,
        "claim_invoice_date": r.claim_invoice_date.isoformat() if r.claim_invoice_date else None,
        "product_segment": r.product_segment, "segment": r.segment,
        "sr_type": r.sr_type, "net_taxable_amount": r.net_taxable_amount,
    } for r in rows]


# ---------------- AOP MASTER: BRANCH TARGETS -------------------------------- #

def list_targets(db: Session, month: str):
    rows = (db.query(PmsBranchTarget)
            .filter(PmsBranchTarget.target_month == month)
            .order_by(PmsBranchTarget.region, PmsBranchTarget.branch_id).all())
    return [{
        "id": t.id, "target_month": t.target_month, "region": t.region,
        "branch_id": t.branch_id, "branch_name": t.branch_name,
        "responsible_person": t.responsible_person,
        "spare_target": t.spare_target, "labour_target": t.labour_target,
    } for t in rows]


def save_targets(db: Session, month: str, rows: list, user_id: str):
    """Upsert the month's target rows (matched on branch_id)."""
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


def generate_report(db: Session, as_on: date, from_date: date = None):
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
    """
    to_date = as_on
    if from_date is None:
        from_date = to_date.replace(day=1)
    if from_date > to_date:
        from_date, to_date = to_date, from_date

    # Months the period overlaps: (month_key, days inside period, days in month)
    months = []
    cur = from_date.replace(day=1)
    while cur <= to_date:
        dim = calendar.monthrange(cur.year, cur.month)[1]
        m_end = cur.replace(day=dim)
        ov = (min(m_end, to_date) - max(cur, from_date)).days + 1
        months.append((cur.strftime("%Y-%m"), ov, dim))
        cur = m_end + timedelta(days=1)
    ov_by_month = {k: (ov, dim) for k, ov, dim in months}
    total_month_days = sum(dim for _, _, dim in months)

    target_rows = db.query(PmsBranchTarget).filter(
        PmsBranchTarget.target_month.in_(list(ov_by_month))).all()

    # Per-branch target sums (full + prorated-till) and display info from the
    # latest touched month's target row.
    full_target, till_target, info_by_branch = {}, {}, {}
    for t in target_rows:
        ov, dim = ov_by_month[t.target_month]
        f = full_target.setdefault(t.branch_id, {"part": 0.0, "labour": 0.0})
        p = till_target.setdefault(t.branch_id, {"part": 0.0, "labour": 0.0})
        f["part"] += t.spare_target or 0
        f["labour"] += t.labour_target or 0
        p["part"] += (t.spare_target or 0) * ov / dim
        p["labour"] += (t.labour_target or 0) * ov / dim
        prev = info_by_branch.get(t.branch_id)
        if prev is None or t.target_month > prev.target_month:
            info_by_branch[t.branch_id] = t

    records = (db.query(PmsSalesRecord)
               .filter(PmsSalesRecord.claim_invoice_date >= from_date,
                       PmsSalesRecord.claim_invoice_date <= to_date)
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
    branch_info = {}         # branch_id -> {branch_name, region} discovered from data

    for r in records:
        rt = r.record_type
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
        if r.claim_invoice_date == to_date:
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

    # ---- branch tables (one per record type, same shape as the mockup) ----
    def _branch_rows(rt):
        rows = []
        branch_ids = set(full_target) | set(branch_agg[rt])
        for b in sorted(branch_ids):
            t = info_by_branch.get(b)
            agg = branch_agg[rt].get(b) or _blank()
            period_target = (full_target.get(b) or {}).get(rt, 0.0)
            daily = period_target / total_month_days if period_target else 0.0
            target_till = (till_target.get(b) or {}).get(rt, 0.0)
            achieved_till = round(agg["achieved_till"], 2)
            info = branch_info.get(b, {})
            rows.append({
                "responsible_person": (t.responsible_person if t else None) or "—",
                "branch_id": b,
                "branch_name": (t.branch_name if t and t.branch_name else info.get("branch_name")) or b,
                "region": (t.region if t and t.region else info.get("region")) or "Other",
                "monthly_target": round(period_target, 2),   # period target (key kept for compat)
                "daily_target": round(daily, 2),
                "achieved_on": round(agg["achieved_on"], 2),
                "target_till": round(target_till, 2),
                "achieved_till": achieved_till,
                "invoice_count_till": len(agg["invoices"]),
                "pct_achieved": round(achieved_till / period_target * 100, 1) if period_target else None,
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
        "from_date": from_date.isoformat(),
        "month": to_date.strftime("%Y-%m"),
        "days_in_month": total_month_days,
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


def list_reports(db: Session, limit: int = 100):
    rows = (db.query(PmsReportHistory.id, PmsReportHistory.as_on_date,
                     PmsReportHistory.title, PmsReportHistory.created_by,
                     PmsReportHistory.created_at)
            .order_by(PmsReportHistory.id.desc()).limit(limit).all())
    return [{
        "id": r.id, "as_on_date": r.as_on_date.isoformat(),
        "title": r.title, "created_by": r.created_by,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    } for r in rows]


def get_report(db: Session, report_id: int):
    row = db.query(PmsReportHistory).filter(PmsReportHistory.id == report_id).first()
    if not row:
        return {"success": False, "message": "Report not found"}
    return {"success": True, "id": row.id, "title": row.title,
            "as_on_date": row.as_on_date.isoformat(),
            "payload": json.loads(row.payload)}


def delete_report(db: Session, report_id: int):
    row = db.query(PmsReportHistory).filter(PmsReportHistory.id == report_id).first()
    if not row:
        return {"success": False, "message": "Report not found"}
    db.delete(row)
    db.commit()
    return {"success": True}
