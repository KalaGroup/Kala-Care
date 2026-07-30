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
from datetime import date, datetime

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
    "soid": ["SOID"],
    "sd_name": ["SDNAME"],
    "branch_id": ["BRANCHID", "BRANCHCODE", "BRANCH"],
    "branch_name": ["BRANCHNAME"],
    "claim_invoice_no": ["CLAIMINVOICENO", "CLAIMINVOICENUMBER", "INVOICENO", "INVOICENUMBER"],
    "claim_invoice_date": ["CLAIMINVOICEDATE", "INVOICEDATE"],
    "product_segment": ["PRODUCTSEGMENT"],
    "segment": ["SEGMENT"],
    "sr_type": ["SERVICEREPORTTYPE", "SRTYPE", "SERVICETYPE", "REPORTTYPE"],
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


def import_file(db: Session, contents: bytes, filename: str, record_type: str, user_id: str):
    """Parse the file and insert only never-seen-before rows.

    Dedupe key = hash of (record_type + identifying fields). Rows already in
    the DB — or repeated inside the same file — are counted as duplicates and
    skipped, so re-uploading an overlapping extract is always safe.
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

    inserted = duplicates = skipped = 0
    seen_keys = set()
    pending = []

    for _, row in df.iterrows():
        get = lambda f: row[mapping[f]] if f in mapping else None

        inv_date = _parse_date(get("claim_invoice_date"))
        branch_id = _norm_branch_id(get("branch_id"))
        amount = _parse_amount(get("net_taxable_amount"))
        if not branch_id or inv_date is None:
            skipped += 1
            continue

        inv_no = _clean_str(get("claim_invoice_no"), 100) or ""
        sr_type = _clean_str(get("sr_type"), 120) or ""
        segment = _clean_str(get("segment"), 100) or ""

        raw = "|".join([record_type, branch_id, inv_no, inv_date.isoformat(),
                        f"{amount:.2f}", sr_type, segment])
        key = hashlib.sha256(raw.encode("utf-8")).hexdigest()
        if key in seen_keys:
            duplicates += 1
            continue
        seen_keys.add(key)

        extra = {}
        for c in unmapped:
            v = row[c]
            if pd.notna(v) and str(v).strip() != "":
                extra[str(c)] = str(v)

        pending.append(PmsSalesRecord(
            record_type=record_type,
            zone_name=_clean_str(get("zone_name"), 80),
            soid=_clean_str(get("soid"), 80),
            sd_name=_clean_str(get("sd_name"), 150),
            branch_id=branch_id,
            branch_name=_clean_str(get("branch_name"), 150),
            claim_invoice_no=inv_no or None,
            claim_invoice_date=inv_date,
            product_segment=_clean_str(get("product_segment"), 100),
            segment=segment or None,
            sr_type=sr_type or None,
            net_taxable_amount=amount,
            extra_data=json.dumps(extra, ensure_ascii=False) if extra else None,
            dedupe_key=key,
            batch_id=batch.id,
        ))

    # One IN-query per chunk finds which keys already exist in the DB.
    existing = set()
    keys = [r.dedupe_key for r in pending]
    for i in range(0, len(keys), 800):
        chunk = keys[i:i + 800]
        rows = db.query(PmsSalesRecord.dedupe_key).filter(
            PmsSalesRecord.dedupe_key.in_(chunk)).all()
        existing.update(k for (k,) in rows)

    for rec in pending:
        if rec.dedupe_key in existing:
            duplicates += 1
        else:
            db.add(rec)
            inserted += 1

    batch.inserted_rows = inserted
    batch.duplicate_rows = duplicates
    batch.skipped_rows = skipped
    db.commit()

    return {
        "success": True,
        "message": f"{inserted} new rows stored, {duplicates} duplicates skipped",
        "batch_id": batch.id,
        "total_rows": batch.total_rows,
        "inserted": inserted,
        "duplicates": duplicates,
        "skipped": skipped,
    }


def list_batches(db: Session, limit: int = 50):
    rows = (db.query(PmsUploadBatch)
            .order_by(PmsUploadBatch.id.desc()).limit(limit).all())
    return [{
        "id": b.id, "record_type": b.record_type, "file_name": b.file_name,
        "total_rows": b.total_rows, "inserted_rows": b.inserted_rows,
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


def generate_report(db: Session, as_on: date):
    """The full report payload for the month of `as_on`, computed like the
    customer's Excel pivot:

      Monthly Target      -> AOP Master (pms_branch_targets) for the month
      Daily Target        -> Monthly Target / days in month
      Achi. on <date>     -> Σ NET TAXABLE AMOUNT where invoice date == as_on
      Target till <date>  -> Daily Target × day number
      Achi. till <date>   -> Σ amount, month start .. as_on
      Invoice Count till  -> distinct CLAIM INVOICE NO in that window
      % Achieved till dt  -> Achi. till / Monthly Target × 100
    """
    month_key = as_on.strftime("%Y-%m")
    month_start = as_on.replace(day=1)
    days_in_month = calendar.monthrange(as_on.year, as_on.month)[1]
    day_n = as_on.day

    targets = db.query(PmsBranchTarget).filter(
        PmsBranchTarget.target_month == month_key).all()
    target_by_branch = {t.branch_id: t for t in targets}

    records = (db.query(PmsSalesRecord)
               .filter(PmsSalesRecord.claim_invoice_date >= month_start,
                       PmsSalesRecord.claim_invoice_date <= as_on)
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
        t = target_by_branch.get(b)
        region = (t.region if t and t.region else _region_of(r.zone_name))

        info = branch_info.setdefault(b, {"branch_name": None, "region": region})
        if r.branch_name and not info["branch_name"]:
            info["branch_name"] = r.branch_name

        agg = branch_agg[rt].setdefault(b, _blank())
        amt = r.net_taxable_amount or 0.0
        inv = (rt, r.claim_invoice_no or f"row-{r.id}")
        agg["achieved_till"] += amt
        agg["invoices"].add(inv)
        if r.claim_invoice_date == as_on:
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
        branch_ids = set(target_by_branch) | set(branch_agg[rt])
        for b in sorted(branch_ids):
            t = target_by_branch.get(b)
            agg = branch_agg[rt].get(b) or _blank()
            monthly = (t.spare_target if rt == "part" else t.labour_target) if t else 0.0
            daily = monthly / days_in_month if monthly else 0.0
            target_till = daily * day_n
            achieved_till = round(agg["achieved_till"], 2)
            info = branch_info.get(b, {})
            rows.append({
                "responsible_person": (t.responsible_person if t else None) or "—",
                "branch_id": b,
                "branch_name": (t.branch_name if t and t.branch_name else info.get("branch_name")) or b,
                "region": (t.region if t and t.region else info.get("region")) or "Other",
                "monthly_target": round(monthly, 2),
                "daily_target": round(daily, 2),
                "achieved_on": round(agg["achieved_on"], 2),
                "target_till": round(target_till, 2),
                "achieved_till": achieved_till,
                "invoice_count_till": len(agg["invoices"]),
                "pct_achieved": round(achieved_till / monthly * 100, 1) if monthly else None,
            })
        return rows

    part_rows = _branch_rows("part")
    labour_rows = _branch_rows("labour")

    total_spare = round(sum(r["achieved_till"] for r in part_rows), 2)
    total_labour = round(sum(r["achieved_till"] for r in labour_rows), 2)
    total_spare_target = round(sum(t.spare_target or 0 for t in targets), 2)
    total_labour_target = round(sum(t.labour_target or 0 for t in targets), 2)
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
        "as_on": as_on.isoformat(),
        "month": month_key,
        "days_in_month": days_in_month,
        "day_number": day_n,
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
