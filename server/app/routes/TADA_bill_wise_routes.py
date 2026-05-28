from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from urllib.parse import unquote
from pydantic import BaseModel
from datetime import date
import logging

from app.database import SessionLocal
from app.controllers import TADA_bill_wise_controller as bill_controller

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/tada-bill-wise", tags=["TADA Bill Wise"])


# ════════════════════════════════════════════════════════════════════════════
# Pydantic Schemas
# ════════════════════════════════════════════════════════════════════════════

class BillLineItem(BaseModel):
    date: str
    expenses_head: str
    amount: str
    bill_submitted: Optional[str] = None   # SE only ('Yes'|'No')

class TempIdsRequest(BaseModel):
    temp_ids: List[int]
    branch_code: str

class BillWiseEntryRequest(BaseModel):
    entry_type: str = "SE"                 # 'SE' | 'BM'
    branch_code: str
    created_by: str

    # ── Service Engineer header fields ──
    engineer_name: Optional[str] = None
    employee_id: Optional[str] = None
    service_engineer_uid: Optional[str] = None
    work_description: Optional[str] = None
    service_request_no: Optional[str] = None
    appointment_number: Optional[str] = None
    account: Optional[str] = None
    installation_site_address: Optional[str] = None
    sr_type: Optional[str] = None
    task_status: Optional[str] = None
    kms_travelled: Optional[str] = None
    task_start_date: Optional[str] = None
    task_end_date: Optional[str] = None

    # ── Branch Manager header fields ──
    customer_name: Optional[str] = None
    sr_invoice_engine_no: Optional[str] = None
    work_status: Optional[str] = None
    remark: Optional[str] = None

    # ── Repeatable bill lines ──
    bills: List[BillLineItem]


class BillWiseUpdateRequest(BaseModel):
    verification_status: Optional[str] = None


class BillWiseSubmitRequest(BaseModel):
    record_ids: List[int]
    submitted_by_name: str
    submitted_by_uid: str


class PaidDateRequest(BaseModel):
    paid_date: Optional[date] = None


class BulkPaidDateRequest(BaseModel):
    record_ids: List[int]
    paid_date: Optional[date] = None


# ════════════════════════════════════════════════════════════════════════════
# DB Dependency
# ════════════════════════════════════════════════════════════════════════════

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ════════════════════════════════════════════════════════════════════════════
# Serializers
# ════════════════════════════════════════════════════════════════════════════

def _serialize_bill_wise(r) -> dict:
    g = lambda k, d=None: getattr(r, k, d)
    return {
        "id": g("id"),
        "entry_type": g("entry_type", "SE"),
        "date": g("date"),
        "expenses_head": g("expenses_head"),
        "amount": g("amount"),
        "bill_submitted": g("bill_submitted"),
        "engineer_name": g("engineer_name"),
        "employee_id": g("employee_id"),
        "service_engineer_uid": g("service_engineer_uid"),
        "work_description": g("work_description"),
        "service_request_no": g("service_request_no"),
        "appointment_number": g("appointment_number"),
        "account": g("account"),
        "installation_site_address": g("installation_site_address"),
        "sr_type": g("sr_type"),
        "task_status": g("task_status"),
        "kms_travelled": g("kms_travelled"),
        "task_start_date": g("task_start_date"),
        "task_end_date": g("task_end_date"),
        "customer_name": g("customer_name"),
        "sr_invoice_engine_no": g("sr_invoice_engine_no"),
        "work_status": g("work_status"),
        "remark": g("remark"),
        "verification_status": g("verification_status", "Pending"),
        "voucher_no": g("voucher_no"),
        "branch_code": g("branch_code"),
        "created_by": g("created_by"),
        "created_at": str(g("created_at")) if g("created_at") else None,
    }

def _serialize_history(r) -> dict:
    return {
        "id": r.id,
        "original_id": r.original_id,
        "entry_type": getattr(r, "entry_type", "SE"),
        "date": r.date,
        "expenses_head": r.expenses_head,
        "amount": r.amount,
        "bill_submitted": getattr(r, "bill_submitted", None),
        "engineer_name": r.engineer_name,
        "employee_id": r.employee_id,
        "service_engineer_uid": r.service_engineer_uid,
        "work_description": r.work_description,
        "service_request_no": r.service_request_no,
        "appointment_number": r.appointment_number,
        "account": r.account,
        "installation_site_address": r.installation_site_address,
        "sr_type": r.sr_type,
        "task_status": r.task_status,
        "kms_travelled": r.kms_travelled,
        "task_start_date": r.task_start_date,
        "task_end_date": r.task_end_date,
        "customer_name": r.customer_name,
        "sr_invoice_engine_no": r.sr_invoice_engine_no,
        "work_status": r.work_status,
        "remark": r.remark,
        "verification_status": r.verification_status,
        "voucher_no": getattr(r, "voucher_no", None),
        "branch_code": r.branch_code,
        "created_by": r.created_by,
        "created_at": str(r.created_at) if r.created_at else None,
        "submitted_by_name": r.submitted_by_name,
        "submitted_by_uid": r.submitted_by_uid,
        "moved_at": str(r.moved_at) if r.moved_at else None,
        "paid_date": str(r.paid_date) if r.paid_date else None,
    }


# ════════════════════════════════════════════════════════════════════════════
# CREATE (BULK) / LIST / GET / DELETE
# ════════════════════════════════════════════════════════════════════════════

@router.post("/create")
def create_bill_wise(payload: BillWiseEntryRequest, db: Session = Depends(get_db)):
    """Create one or more Bill Wise rows (one per bill line item)."""
    try:
        data = payload.dict()
        bills = data.pop("bills", []) or []
        entry_type = data.pop("entry_type", "SE")
        branch_code = data.pop("branch_code")
        created_by = data.pop("created_by")
        # everything else in `data` is the shared header
        recs = bill_controller.create_bill_wise_entries(
            db, data, [b for b in bills], entry_type, branch_code, created_by
        )
        return {
            "status": "success",
            "message": f"{len(recs)} Bill Wise entr{'y' if len(recs) == 1 else 'ies'} saved successfully",
            "ids": [r.id for r in recs],
            "count": len(recs),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Bill Wise create error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/records")
def list_bill_wise(
    branch_code: Optional[str] = None,
    skip: int = 0,
    limit: int = 1000,
    db: Session = Depends(get_db),
):
    """List Bill Wise DRAFTS (temp) — Verify tab."""
    try:
        if branch_code:
            branch_code = unquote(branch_code)
        records = bill_controller.get_bill_wise_temp_records(db, branch_code, skip, limit)
        return [_serialize_bill_wise(r) for r in records]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Bill Wise list error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/records/{record_id}")
def get_bill_wise_record(record_id: int, db: Session = Depends(get_db)):
    """Get a single Bill Wise entry by ID."""
    from app.models.TADA_bill_wise_model import TADABillWise
    try:
        rec = db.query(TADABillWise).filter(TADABillWise.id == record_id).first()
        if not rec:
            raise HTTPException(status_code=404, detail="Bill Wise record not found")
        return _serialize_bill_wise(rec)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get Bill Wise record error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/records/{record_id}")
def delete_bill_wise(record_id: int, db: Session = Depends(get_db)):
    """Delete a Bill Wise DRAFT (temp)."""
    try:
        ok = bill_controller.delete_bill_wise_temp(db, record_id)
        if not ok:
            raise HTTPException(status_code=404, detail="Bill Wise draft not found")
        return {"status": "success", "message": "Bill Wise draft deleted"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Delete Bill Wise error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ════════════════════════════════════════════════════════════════════════════
# BRANCH SUMMARY
# ════════════════════════════════════════════════════════════════════════════

@router.get("/branch-summary")
def branch_bill_wise_summary(branch_code: str, db: Session = Depends(get_db)):
    """Bill Wise records grouped by submission period for a branch."""
    try:
        return bill_controller.get_branch_bill_wise_summary(db, unquote(branch_code))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"branch_bill_wise_summary error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ════════════════════════════════════════════════════════════════════════════
# PERIOD-FILTERED RECORDS
# ════════════════════════════════════════════════════════════════════════════

@router.get("/branch-records")
def branch_bill_wise_records(
    branch_code: str,
    period_start: Optional[str] = None,
    period_end: Optional[str] = None,
    engineer_name: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Get Bill Wise records for a branch, optionally filtered by period + engineer."""
    try:
        records = bill_controller.get_branch_bill_wise_records(
            db, unquote(branch_code), period_start, period_end,
            unquote(engineer_name) if engineer_name else None,
        )
        return [_serialize_bill_wise(r) for r in records]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"branch_bill_wise_records error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ════════════════════════════════════════════════════════════════════════════
# UPDATE — verification status only
# ════════════════════════════════════════════════════════════════════════════

@router.put("/records/{record_id}/update")
def update_bill_wise_record_endpoint(
    record_id: int,
    payload: BillWiseUpdateRequest,
    db: Session = Depends(get_db),
):
    """Update verification_status only."""
    try:
        data = {k: v for k, v in payload.dict(exclude_unset=True).items()}
        rec = bill_controller.update_bill_wise_record(db, record_id, data)
        return {
            "id": rec.id,
            "verification_status": rec.verification_status,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"update_bill_wise_record_endpoint error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ════════════════════════════════════════════════════════════════════════════
# SUBMIT TO HISTORY
# ════════════════════════════════════════════════════════════════════════════

@router.post("/submit-to-history")
def submit_to_history(payload: BillWiseSubmitRequest, db: Session = Depends(get_db)):
    """Move VERIFIED rows to tada_bill_wise_history and delete originals."""
    try:
        return bill_controller.submit_bill_wise_to_history(
            db, payload.record_ids, payload.submitted_by_name, payload.submitted_by_uid,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"submit_to_history error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ════════════════════════════════════════════════════════════════════════════
# HISTORY
# ════════════════════════════════════════════════════════════════════════════

@router.get("/history")
def list_bill_wise_history(
    branch_code: Optional[str] = None,
    skip: int = 0,
    limit: int = 500,
    db: Session = Depends(get_db),
):
    """List Bill Wise history records."""
    try:
        if branch_code:
            branch_code = unquote(branch_code)
        records = bill_controller.get_bill_wise_history(db, branch_code, skip, limit)
        return [_serialize_history(r) for r in records]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"list_bill_wise_history error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/history/{record_id}/paid-date")
def update_history_paid_date_endpoint(
    record_id: int,
    payload: PaidDateRequest,
    db: Session = Depends(get_db),
):
    """Set/clear the paid_date on a Bill Wise history record."""
    try:
        rec = bill_controller.update_history_paid_date(db, record_id, payload.paid_date)
        return {
            "id": rec.id,
            "paid_date": str(rec.paid_date) if rec.paid_date else None,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"update_history_paid_date error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/history/grouped")
def bill_wise_history_grouped(branch_code: str, db: Session = Depends(get_db)):
    """Bill Wise history grouped by submission period."""
    try:
        return bill_controller.get_bill_wise_history_grouped(db, unquote(branch_code))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"bill_wise_history_grouped error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/history/bulk-paid-date")
def bulk_bill_wise_history_paid_date(payload: BulkPaidDateRequest, db: Session = Depends(get_db)):
    """Apply paid_date to multiple Bill Wise history records at once."""
    try:
        return bill_controller.bulk_update_bill_wise_history_paid_date(
            db, payload.record_ids, payload.paid_date
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"bulk_bill_wise_history_paid_date error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/submit")
def submit_bill_wise_to_ho(payload: TempIdsRequest, db: Session = Depends(get_db)):
    """Move selected drafts (temp) → main (Submit to HO)."""
    try:
        return bill_controller.submit_bill_wise_temp_to_main(
            db, payload.temp_ids, payload.branch_code
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"submit_bill_wise_to_ho error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/submitted/records")
def submitted_bill_wise(
    branch_code: Optional[str] = None,
    skip: int = 0,
    limit: int = 1000,
    db: Session = Depends(get_db),
):
    """List submitted (main) Bill Wise records — Submitted tab."""
    try:
        if branch_code:
            branch_code = unquote(branch_code)
        records = bill_controller.get_bill_wise_records(db, branch_code, skip, limit)
        return [_serialize_bill_wise(r) for r in records]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"submitted_bill_wise error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))        

@router.get("/blocked-combos")
def blocked_se_combos(branch_code: str, db: Session = Depends(get_db)):
    """SE combos (emp_id + sr_no + appt_no) that must block TADA verification —
    sourced from temp + main + history."""
    try:
        return {"combos": bill_controller.get_blocked_se_combos(db, unquote(branch_code))}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"blocked_se_combos error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))        