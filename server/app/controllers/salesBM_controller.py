from sqlalchemy.orm import Session
from sqlalchemy import desc
from fastapi import HTTPException
from typing import Optional
import logging
from datetime import datetime

from app.models.salesBM_temp_model import SalesBMTemp
from app.models.salesBM_model import SalesBM
from app.models.salesBM_history_model import SalesBMHistory
from app.models.expenseAddingData_model import BranchKMRate
from app.controllers.voucher_controller import generate_voucher_no

logger = logging.getLogger(__name__)


def _branch_has_rates(row) -> bool:
    """True if the branch master has any non-zero rate/DA slab configured."""
    if not row:
        return False
    fields = (
        'single_low_rate', 'single_low_da', 'multi_low_rate', 'multi_low_da',
        'single_high_rate', 'single_high_da', 'multi_high_rate', 'multi_high_da',
    )
    return any(float(getattr(row, f) or 0) > 0 for f in fields)


def _get_branch_rate(db: Session, branch_code: str):
    """Return the 2×2 master row (as a dict) for the branch, falling back to HO."""
    def pick(code):
        row = db.query(BranchKMRate).filter(BranchKMRate.branch_code == code).first()
        if not _branch_has_rates(row):
            return None
        return {
            "km_threshold": float(row.km_threshold) if row.km_threshold is not None else 100.0,
            "single_low_rate": float(row.single_low_rate or 0),
            "single_low_da": float(row.single_low_da or 0),
            "multi_low_rate": float(row.multi_low_rate or 0),
            "multi_low_da": float(row.multi_low_da or 0),
            "single_high_rate": float(row.single_high_rate or 0),
            "single_high_da": float(row.single_high_da or 0),
            "multi_high_rate": float(row.multi_high_rate or 0),
            "multi_high_da": float(row.multi_high_da or 0),
        }
    return pick(branch_code) or pick("HO")


def _pick_rate_da(rate: dict, km: float, sr_count: int):
    """Pick (rate, da) from the 2×2 master: (1 vs >1 SR/day) × (km ≤ vs > threshold)."""
    if not rate:
        return 0.0, 0.0
    threshold = float(rate.get("km_threshold") or 100)
    high = float(km) > threshold          # km == threshold counts as LOW
    multi = (sr_count or 1) > 1
    if multi and high:
        return rate["multi_high_rate"], rate["multi_high_da"]
    if multi and not high:
        return rate["multi_low_rate"], rate["multi_low_da"]
    if (not multi) and high:
        return rate["single_high_rate"], rate["single_high_da"]
    return rate["single_low_rate"], rate["single_low_da"]

def _salesbm_sr_count(db: Session, branch_code: str, engineer_uid: str,
                      engineer_name: str, date_value, exclude_temp_id=None) -> int:
    """
    Count how many Sales & BM entries this engineer has on the same DATE
    (across temp + main), to decide 1-SR vs >1-SR per day.
    """
    target = _parse_any_date(date_value)
    if target is None:
        return 1
    target_day = target.date()

    def same_eng(q, model):
        if engineer_uid:
            return q.filter(model.engineer_uid == engineer_uid)
        return q.filter(model.engineer_name == engineer_name)

    count = 0
    for model in (SalesBMTemp, SalesBM):
        q = db.query(model).filter(model.branch_code == branch_code)
        q = same_eng(q, model)
        for r in q.all():
            if exclude_temp_id is not None and model is SalesBMTemp and r.id == exclude_temp_id:
                continue
            d = _parse_any_date(r.date)
            if d and d.date() == target_day:
                count += 1
    return count if count > 0 else 1    

def _salesbm_effective_km(model, r) -> float:
    """Effective two-way km for a Sales & BM row (HO corrected km wins on main rows)."""
    val = None
    if model is SalesBM and getattr(r, "ho_corrected_km", None) not in (None, ""):
        val = r.ho_corrected_km
    elif r.two_way_km not in (None, ""):
        val = r.two_way_km
    try:
        return float(val) if val not in (None, "") else 0.0
    except (ValueError, TypeError):
        return 0.0


def _reapply_day_da(db: Session, branch_code: str, engineer_uid: str,
                    engineer_name: str, date_value):
    """
    DA is per-DAY, not per-SR. For an engineer's SRs on the same date:
      - the rate/DA SLAB is chosen from the day's TOTAL km
        (sum of every SR's two-way km that day) × (1 vs >1 SR/day),
      - that rate is applied to EACH SR's OWN km to get its amount,
      - the full slab DA is applied ONLY to the LAST SR of the day,
      - every other same-day SR gets DA = 0.
    Recomputes rate/amount/da/total across temp + main for the whole day group.
    """
    target = _parse_any_date(date_value)
    if target is None:
        return
    target_day = target.date()

    def same_eng(q, model):
        if engineer_uid:
            return q.filter(model.engineer_uid == engineer_uid)
        return q.filter(model.engineer_name == engineer_name)

    group = []  # (sort_key, model, record, km)
    for model in (SalesBMTemp, SalesBM):
        q = same_eng(db.query(model).filter(model.branch_code == branch_code), model)
        for r in q.all():
            d = _parse_any_date(r.date)
            if d and d.date() == target_day:
                sort_key = (getattr(r, "created_at", None) or datetime.min, r.id)
                km = _salesbm_effective_km(model, r)
                group.append((sort_key, model, r, km))

    if not group:
        return

    group.sort(key=lambda t: t[0])                 # oldest first → last element = last SR of day
    last_key = (group[-1][1], group[-1][2].id)     # (model, id) of the last SR
    sr_count = len(group)
    day_total_km = sum(km for _, _, _, km in group)  # day's TOTAL km decides the slab
    rate_info = _get_branch_rate(db, branch_code)

    # Slab (rate + DA) is picked ONCE from the day's total km, then reused for every SR
    rate, full_da = _pick_rate_da(rate_info, day_total_km, sr_count) if rate_info else (0.0, 0.0)

    for _, model, r, km in group:
        amount = km * rate                          # rate applied to each SR's OWN km
        da = full_da if (model, r.id) == last_key else 0.0   # DA only on the last SR of the day
        total = amount + da
        r.rate = f"{rate:.2f}"
        r.amount = f"{amount:.2f}"
        r.da = f"{da:.2f}"
        r.total_amount = f"{total:.2f}"

    db.commit()    


def calculate_salesbm_amounts(db: Session, branch_code: str, one_way_km: str,
                              sr_count: int = 1) -> dict:
    """Calculate two_way_km, rate, da, amount, total_amount from one_way_km using the 2×2 master."""
    try:
        km1 = float(one_way_km) if one_way_km not in (None, "") else 0.0
    except (ValueError, TypeError):
        km1 = 0.0

    km2 = km1 * 2
    rate_info = _get_branch_rate(db, branch_code)
    if not rate_info:
        return {
            "two_way_km": f"{km2:.2f}",
            "rate": "0.00",
            "da": "0.00",
            "amount": "0.00",
            "total_amount": "0.00",
        }

    rate, da = _pick_rate_da(rate_info, km2, sr_count)
    amount = km2 * rate
    total = amount + da
    return {
        "two_way_km": f"{km2:.2f}",
        "rate": f"{rate:.2f}",
        "da": f"{da:.2f}",
        "amount": f"{amount:.2f}",
        "total_amount": f"{total:.2f}",
    }


def create_salesbm_entry(db: Session, payload: dict, branch_code: str, created_by: str):
    try:
        # Count this engineer's SRs on the same date (existing temp + main) and add this new one
        sr_count = _salesbm_sr_count(
            db, branch_code,
            payload.get("engineer_uid") or "",
            payload.get("engineer_name") or "",
            payload.get("date"),
        ) + 1
        calc = calculate_salesbm_amounts(db, branch_code, payload.get("one_way_km") or "0", sr_count=sr_count)
        record = SalesBMTemp(
            date=payload.get("date"),
            sr_invoice_engine_no=payload.get("sr_invoice_engine_no") or None,
            customer_name=payload.get("customer_name"),
            location=payload.get("location") or None,
            one_way_km=payload.get("one_way_km"),
            two_way_km=calc["two_way_km"],
            amount=calc["amount"],
            da=calc["da"],
            total_amount=calc["total_amount"],
            rate=calc["rate"],
            work_description=payload.get("work_description"),
            remark=payload.get("remark") or None,
            engineer_name=payload.get("engineer_name"),
            engineer_uid=payload.get("engineer_uid") or None,
            employee_id=payload.get("employee_id") or None,
            labour_sale_expected=payload.get("labour_sale_expected") or None,
            part_sale_expected=payload.get("part_sale_expected") or None,
            branch_code=branch_code,
            created_by=created_by,
        )
        db.add(record)
        db.commit()
        db.refresh(record)
        # DA is per-day: keep DA only on the last SR of the day, zero the earlier ones
        _reapply_day_da(
            db, branch_code,
            record.engineer_uid or "", record.engineer_name or "", record.date,
        )
        db.refresh(record)
        return record
    except Exception as e:
        db.rollback()
        logger.error(f"create_salesbm_entry error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def get_salesbm_records(db: Session, branch_code: Optional[str] = None,
                         skip: int = 0, limit: int = 200):
    try:
        q = db.query(SalesBMTemp)
        if branch_code:
            q = q.filter(SalesBMTemp.branch_code == branch_code)
        return q.order_by(desc(SalesBMTemp.created_at)).offset(skip).limit(limit).all()
    except Exception as e:
        logger.error(f"get_salesbm_records error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def delete_salesbm_record(db: Session, record_id: int) -> bool:
    try:
        rec = db.query(SalesBMTemp).filter(SalesBMTemp.id == record_id).first()
        if not rec:
            existing_ids = [r.id for r in db.query(SalesBMTemp.id).all()]
            logger.warning(
                f"delete_salesbm_record: id={record_id} not in SalesBMTemp. "
                f"Existing temp ids: {existing_ids}"
            )
            return False
        db.delete(rec)
        db.commit()
        logger.info(f"delete_salesbm_record: deleted SalesBMTemp id={record_id}")
        return True
    except Exception as e:
        db.rollback()
        logger.error(f"delete_salesbm_record error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

def submit_salesbm_to_main(db, temp_ids, branch_code):
    try:
        rows = db.query(SalesBMTemp).filter(SalesBMTemp.id.in_(temp_ids)).all()
        voucher_no = generate_voucher_no(db, "TADA", branch_code) if rows else None
        moved = 0
        for r in rows:
            main = SalesBM(
                temp_id=r.id, date=r.date, sr_invoice_engine_no=r.sr_invoice_engine_no,
                customer_name=r.customer_name, location=r.location,
                one_way_km=r.one_way_km, two_way_km=r.two_way_km,
                amount=r.amount, da=r.da, total_amount=r.total_amount, rate=r.rate,
                work_description=r.work_description, remark=r.remark,
                engineer_name=r.engineer_name, engineer_uid=r.engineer_uid,
                employee_id=r.employee_id,
                labour_sale_expected=r.labour_sale_expected,
                part_sale_expected=r.part_sale_expected,
                verification_status="Pending",
                voucher_no=voucher_no,                  # <-- only added field
                branch_code=r.branch_code, created_by=r.created_by, created_at=r.created_at,
            )
            db.add(main); db.delete(r); moved += 1
        db.commit()
        return {"status": "success", "moved_count": moved, "voucher_no": voucher_no,
                "message": f"{moved} record(s) submitted — Voucher {voucher_no}"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


def get_salesbm_main_records(db: Session, branch_code: Optional[str] = None,
                             skip: int = 0, limit: int = 1000):
    try:
        q = db.query(SalesBM)
        if branch_code:
            q = q.filter(SalesBM.branch_code == branch_code)
        return q.order_by(desc(SalesBM.submitted_at)).offset(skip).limit(limit).all()
    except Exception as e:
        logger.error(f"get_salesbm_main_records error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def get_salesbm_history(db: Session, branch_code: Optional[str] = None,
                        skip: int = 0, limit: int = 500):
    try:
        q = db.query(SalesBMHistory)
        if branch_code:
            q = q.filter(SalesBMHistory.branch_code == branch_code)
        return q.order_by(desc(SalesBMHistory.moved_at)).offset(skip).limit(limit).all()
    except Exception as e:
        logger.error(f"get_salesbm_history error: {e}")
        raise HTTPException(status_code=500, detail=str(e))       

def recompute_salesbm_amounts(db: Session, branch_code: str, effective_two_way_km,
                              sr_count: int = 1) -> dict:
    """Recompute rate/da/amount/total from an EFFECTIVE two-way km using the 2×2 master
    (e.g. HO corrected km is already a two-way value, used directly)."""
    try:
        km2 = float(effective_two_way_km) if effective_two_way_km not in (None, "") else 0.0
    except (ValueError, TypeError):
        km2 = 0.0
    rate_info = _get_branch_rate(db, branch_code)
    if not rate_info:
        return {"rate": "0.00", "da": "0.00", "amount": "0.00", "total_amount": "0.00"}
    rate, da = _pick_rate_da(rate_info, km2, sr_count)
    amount = km2 * rate
    total = amount + da
    return {
        "rate": f"{rate:.2f}",
        "da": f"{da:.2f}",
        "amount": f"{amount:.2f}",
        "total_amount": f"{total:.2f}",
    }


def get_salesbm_branch_engineers(db: Session, branch_code: str):
    """Engineers present in the MAIN table for a branch (like service-engineer summary)."""
    rows = db.query(SalesBM).filter(SalesBM.branch_code == branch_code).all()
    agg = {}
    for r in rows:
        key = (r.engineer_uid or "").strip() or (r.engineer_name or "Unknown")
        if key not in agg:
            agg[key] = {
                "engineer_uid": r.engineer_uid or "",
                "engineer_name": r.engineer_name or "Unknown",
                "total_sr_count": 0,
                "verified_sr_count": 0,
            }
        agg[key]["total_sr_count"] += 1
        if r.verification_status == "Verified":
            agg[key]["verified_sr_count"] += 1
    return sorted(agg.values(), key=lambda x: str(x["engineer_name"]))


def get_salesbm_engineer_records(db: Session, branch_code: str,
                                 engineer_uid: Optional[str] = None,
                                 engineer_name: Optional[str] = None):
    q = db.query(SalesBM).filter(SalesBM.branch_code == branch_code)
    if engineer_uid:
        q = q.filter(SalesBM.engineer_uid == engineer_uid)
    elif engineer_name:
        q = q.filter(SalesBM.engineer_name == engineer_name)
    return q.order_by(desc(SalesBM.submitted_at)).all()


def update_salesbm_main_record(db: Session, record_id: int, payload: dict) -> dict:
    """HO edits: ho_corrected_km (recomputes rate/da/amount/total), ho_remark, verification_status."""
    rec = db.query(SalesBM).filter(SalesBM.id == record_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Record not found")
    try:
        if "ho_corrected_km" in payload:
            rec.ho_corrected_km = payload["ho_corrected_km"]
            db.flush()  # make the new ho_corrected_km visible to the day-group recompute
            # Recompute the whole day group so DA stays on the last SR of the day only
            _reapply_day_da(
                db, rec.branch_code, rec.engineer_uid or "", rec.engineer_name or "", rec.date,
            )
            db.refresh(rec)
        if "ho_remark" in payload:
            rec.ho_remark = payload["ho_remark"]
        if "verification_status" in payload:
            rec.verification_status = payload["verification_status"]
        db.commit()
        db.refresh(rec)
        return {
            "rate": rec.rate, "da": rec.da,
            "amount": rec.amount, "total_amount": rec.total_amount,
            "verification_status": rec.verification_status,
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


def submit_salesbm_to_history(db: Session, record_ids, submitted_by_name, submitted_by_uid):
    """Move only VERIFIED main rows to history."""
    try:
        rows = db.query(SalesBM).filter(
            SalesBM.id.in_(record_ids),
            SalesBM.verification_status == "Verified",
        ).all()
        moved = 0
        for r in rows:
            h = SalesBMHistory(
                original_id=r.id, date=r.date, sr_invoice_engine_no=r.sr_invoice_engine_no,
                customer_name=r.customer_name, location=r.location,
                one_way_km=r.one_way_km, two_way_km=r.two_way_km,
                amount=r.amount, da=r.da, total_amount=r.total_amount, rate=r.rate,
                work_description=r.work_description, remark=r.remark,
                engineer_name=r.engineer_name, engineer_uid=r.engineer_uid,
                employee_id=r.employee_id,
                labour_sale_expected=getattr(r, "labour_sale_expected", None),
                part_sale_expected=getattr(r, "part_sale_expected", None),
                ho_corrected_km=r.ho_corrected_km, ho_remark=r.ho_remark,
                verification_status="Verified", voucher_no=r.voucher_no,
                branch_code=r.branch_code, created_by=r.created_by, created_at=r.created_at,
                submitted_by_name=submitted_by_name, submitted_by_uid=submitted_by_uid,
            )
            db.add(h)
            db.delete(r)
            moved += 1
        db.commit()
        return {"status": "success", "moved_count": moved}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


def _parse_any_date(s):
    if not s:
        return None
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(str(s)[:19], fmt)
        except (ValueError, TypeError):
            continue
    return None


def get_salesbm_history_grouped(db: Session, branch_code: Optional[str] = None):
    """Group history by voucher_no (the 'period' for Sales & BM)."""
    q = db.query(SalesBMHistory)
    if branch_code:
        q = q.filter(SalesBMHistory.branch_code == branch_code)
    rows = q.order_by(desc(SalesBMHistory.moved_at)).all()

    groups = {}
    for r in rows:
        key = (r.voucher_no or "No Voucher")
        g = groups.setdefault(key, {
            "voucher_no": key, "record_ids": [], "total_amount": 0.0,
            "paid_count": 0, "submitters": set(), "branch": set(),
            "engineers": set(), "dates": [], "paid_dates": set(),
        })
        g["record_ids"].append(r.id)
        g["total_amount"] += float(r.total_amount or 0)
        if r.paid_date:
            g["paid_count"] += 1
            g["paid_dates"].add(str(r.paid_date))
        if r.submitted_by_name:
            g["submitters"].add(r.submitted_by_name)   # HO verifier
        if r.created_by:
            g["branch"].add(str(r.created_by).strip()) # branch submitter
        if r.engineer_name:
            g["engineers"].add(r.engineer_name)
        d = _parse_any_date(r.date)
        if d:
            g["dates"].append(d)

    out = []
    for key, g in groups.items():
        dates = sorted(g["dates"])
        start = dates[0].strftime("%d %b %Y") if dates else "-"
        end = dates[-1].strftime("%d %b %Y") if dates else "-"
        paid_date = next(iter(g["paid_dates"])) if len(g["paid_dates"]) == 1 else None
        out.append({
            "voucher_no": key,
            "period_start": dates[0].strftime("%Y-%m-%d") if dates else None,
            "period_end": dates[-1].strftime("%Y-%m-%d") if dates else None,
            "period_start_display": start,
            "period_end_display": end,
            "submitted_by": ", ".join(sorted(g["branch"])) or "-",       # branch person
            "verified_by": ", ".join(sorted(g["submitters"])) or "-",    # HO person
            "uploaded_by": ", ".join(sorted(g["branch"])) or "-",        # back-compat
            "engineer_name": ", ".join(sorted(g["engineers"])) or "-",
            "engineer_count": len(g["engineers"]),
            "record_count": len(g["record_ids"]),
            "record_ids": g["record_ids"],
            "total_amount": g["total_amount"],
            "paid_count": g["paid_count"],
            "paid_date": paid_date,
        })
    out.sort(key=lambda x: str(x["voucher_no"]))
    return {"rule_type": "voucher", "period_days": 0, "groups": out}


def update_salesbm_history_paid_date(db: Session, record_id: int, paid_date):
    """Set/clear paid_date on a single Sales & BM history row."""
    rec = db.query(SalesBMHistory).filter(SalesBMHistory.id == record_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="History record not found")
    rec.paid_date = paid_date
    db.commit()
    db.refresh(rec)
    return rec


def bulk_update_salesbm_history_paid_date(db: Session, record_ids, paid_date) -> dict:
    """Apply one paid_date to many Sales & BM history rows (voucher-wise apply)."""
    if not record_ids:
        raise HTTPException(status_code=400, detail="No record_ids provided")
    updated = (
        db.query(SalesBMHistory)
        .filter(SalesBMHistory.id.in_(record_ids))
        .update({"paid_date": paid_date}, synchronize_session=False)
    )
    db.commit()
    return {"updated_count": updated}         