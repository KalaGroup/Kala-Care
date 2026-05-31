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


def _get_branch_rate(db: Session, branch_code: str):
    def pick(code):
        row = db.query(BranchKMRate).filter(BranchKMRate.branch_code == code).first()
        if not row:
            return None
        km_rate = float(row.km_rate or 0)
        range_amount = float(row.range_amount or 0)
        above_amount = float(row.above_amount or 0)
        if km_rate == 0 and range_amount == 0 and above_amount == 0:
            return None
        return {
            "km_rate": km_rate,
            "range_start_km": float(row.range_start_km) if row.range_start_km is not None else None,
            "range_end_km": float(row.range_end_km) if row.range_end_km is not None else None,
            "range_amount": range_amount,
            "above_km": float(row.above_km) if row.above_km is not None else None,
            "above_amount": above_amount,
        }
    return pick(branch_code) or pick("HO")


def _compute_da(km: float, rate: dict) -> float:
    if not rate:
        return 0.0
    da = 0.0
    rs, re_ = rate["range_start_km"], rate["range_end_km"]
    ak = rate["above_km"]
    if rs is not None and re_ is not None:
        if rs <= km <= re_:
            da = rate["range_amount"]
        elif ak is not None and km > ak:
            da = rate["above_amount"]
    elif ak is not None and km > ak:
        da = rate["above_amount"]
    return da


def calculate_salesbm_amounts(db: Session, branch_code: str, one_way_km: str) -> dict:
    """Calculate two_way_km, rate, da, amount, total_amount from one_way_km."""
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

    km_rate = rate_info["km_rate"]
    da = _compute_da(km2, rate_info)
    amount = km2 * km_rate
    total = amount + da
    return {
        "two_way_km": f"{km2:.2f}",
        "rate": f"{km_rate:.2f}",
        "da": f"{da:.2f}",
        "amount": f"{amount:.2f}",
        "total_amount": f"{total:.2f}",
    }


def create_salesbm_entry(db: Session, payload: dict, branch_code: str, created_by: str):
    try:
        calc = calculate_salesbm_amounts(db, branch_code, payload.get("one_way_km") or "0")
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

def recompute_salesbm_amounts(db: Session, branch_code: str, effective_two_way_km) -> dict:
    """Recompute rate/da/amount/total from an EFFECTIVE two-way km
    (e.g. HO corrected km is already a two-way value, used directly)."""
    try:
        km2 = float(effective_two_way_km) if effective_two_way_km not in (None, "") else 0.0
    except (ValueError, TypeError):
        km2 = 0.0
    rate_info = _get_branch_rate(db, branch_code)
    if not rate_info:
        return {"rate": "0.00", "da": "0.00", "amount": "0.00", "total_amount": "0.00"}
    km_rate = rate_info["km_rate"]
    da = _compute_da(km2, rate_info)
    amount = km2 * km_rate
    total = amount + da
    return {
        "rate": f"{km_rate:.2f}",
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
            effective = payload["ho_corrected_km"] or rec.two_way_km
            calc = recompute_salesbm_amounts(db, rec.branch_code, effective)
            rec.rate = calc["rate"]
            rec.da = calc["da"]
            rec.amount = calc["amount"]
            rec.total_amount = calc["total_amount"]
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