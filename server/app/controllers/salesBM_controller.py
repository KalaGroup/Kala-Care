from sqlalchemy.orm import Session
from sqlalchemy import desc
from fastapi import HTTPException
from typing import Optional
import logging

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