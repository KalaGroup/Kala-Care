from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from urllib.parse import unquote
from pydantic import BaseModel
from datetime import date
import logging

from app.database import SessionLocal
from app.controllers import salesBM_controller as ctrl

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/tada-salesbm", tags=["TADA Sales & BM"])


class CalcRequest(BaseModel):
    branch_code: str
    one_way_km: str

class UpdateMainRequest(BaseModel):
    ho_corrected_km: Optional[str] = None
    ho_remark: Optional[str] = None
    verification_status: Optional[str] = None


class SubmitHistoryRequest(BaseModel):
    record_ids: list[int]
    submitted_by_name: Optional[str] = "HO"
    submitted_by_uid: Optional[str] = ""    


class CreateRequest(BaseModel):
    date: str
    sr_invoice_engine_no: Optional[str] = None
    customer_name: str
    location: Optional[str] = None
    one_way_km: str
    work_description: str
    remark: Optional[str] = None
    engineer_name: str
    engineer_uid: Optional[str] = None
    employee_id: Optional[str] = None
    labour_sale_expected: Optional[str] = None
    part_sale_expected: Optional[str] = None
    branch_code: str
    created_by: str

class TempIdsRequest(BaseModel):
    temp_ids: list[int]
    branch_code: str


class PaidDateRequest(BaseModel):
    paid_date: Optional[date] = None


class BulkPaidDateRequest(BaseModel):
    record_ids: list[int]
    paid_date: Optional[date] = None    

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _serialize(r) -> dict:
    return {
        "id": r.id,
        "date": r.date,
        "sr_invoice_engine_no": r.sr_invoice_engine_no,
        "customer_name": r.customer_name,
        "location": r.location,
        "one_way_km": r.one_way_km,
        "two_way_km": r.two_way_km,
        "amount": r.amount,
        "da": r.da,
        "total_amount": r.total_amount,
        "rate": r.rate,
        "work_description": r.work_description,
        "remark": r.remark,
        "engineer_name": r.engineer_name,
        "engineer_uid": r.engineer_uid,
        "employee_id": r.employee_id,
        "labour_sale_expected": getattr(r, "labour_sale_expected", None),
        "part_sale_expected": getattr(r, "part_sale_expected", None),
        "branch_code": r.branch_code,
        "created_by": r.created_by,
        "created_at": str(r.created_at) if r.created_at else None,
        "verification_status": getattr(r, "verification_status", "Pending"),
        "voucher_no": getattr(r, "voucher_no", None),
        "ho_corrected_km": getattr(r, "ho_corrected_km", None),
        "ho_remark": getattr(r, "ho_remark", None),
        "submitted_by_name": getattr(r, "submitted_by_name", None),
        "moved_at": str(r.moved_at) if getattr(r, "moved_at", None) else None,
        "paid_date": str(r.paid_date) if getattr(r, "paid_date", None) else None,
    }


@router.post("/calculate")
def calculate(payload: CalcRequest, db: Session = Depends(get_db)):
    return ctrl.calculate_salesbm_amounts(db, payload.branch_code, payload.one_way_km)


@router.post("/create")
def create(payload: CreateRequest, db: Session = Depends(get_db)):
    rec = ctrl.create_salesbm_entry(db, payload.dict(), payload.branch_code, payload.created_by)
    return {"status": "success", "id": rec.id, "total_amount": rec.total_amount}


@router.get("/records")
def list_records(branch_code: Optional[str] = None, skip: int = 0,
                 limit: int = 200, db: Session = Depends(get_db)):
    bc = unquote(branch_code) if branch_code else None
    return [_serialize(r) for r in ctrl.get_salesbm_records(db, bc, skip, limit)]


@router.delete("/records/{record_id}")
def delete_record(record_id: int, db: Session = Depends(get_db)):
    ok = ctrl.delete_salesbm_record(db, record_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Record not found")
    return {"status": "success"}

@router.post("/submit")
def submit(payload: TempIdsRequest, db: Session = Depends(get_db)):
    return ctrl.submit_salesbm_to_main(db, payload.temp_ids, payload.branch_code)


@router.get("/submitted/records")
def submitted_records(branch_code: Optional[str] = None, skip: int = 0,
                      limit: int = 1000, db: Session = Depends(get_db)):
    bc = unquote(branch_code) if branch_code else None
    return [_serialize(r) for r in ctrl.get_salesbm_main_records(db, bc, skip, limit)]


@router.get("/history")
def history(branch_code: Optional[str] = None, skip: int = 0,
            limit: int = 500, db: Session = Depends(get_db)):
    bc = unquote(branch_code) if branch_code else None
    return [_serialize(r) for r in ctrl.get_salesbm_history(db, bc, skip, limit)]    

@router.get("/branch-engineers-summary")
def branch_engineers_summary(branch_code: str, db: Session = Depends(get_db)):
    return ctrl.get_salesbm_branch_engineers(db, unquote(branch_code))


@router.get("/engineer-records")
def engineer_records(branch_code: str, engineer_uid: Optional[str] = None,
                     engineer_name: Optional[str] = None, db: Session = Depends(get_db)):
    rows = ctrl.get_salesbm_engineer_records(
        db, unquote(branch_code),
        engineer_uid or None, unquote(engineer_name) if engineer_name else None,
    )
    return [_serialize(r) for r in rows]


@router.put("/records/{record_id}/update")
def update_main_record(record_id: int, payload: UpdateMainRequest,
                       db: Session = Depends(get_db)):
    return ctrl.update_salesbm_main_record(
        db, record_id, payload.dict(exclude_unset=True)
    )


@router.post("/submit-to-history")
def submit_to_history(payload: SubmitHistoryRequest, db: Session = Depends(get_db)):
    return ctrl.submit_salesbm_to_history(
        db, payload.record_ids, payload.submitted_by_name, payload.submitted_by_uid
    )


@router.get("/history/grouped")
def history_grouped(branch_code: Optional[str] = None, db: Session = Depends(get_db)):
    bc = unquote(branch_code) if branch_code else None
    return ctrl.get_salesbm_history_grouped(db, bc)


@router.put("/history/{record_id}/paid-date")
def salesbm_history_paid_date(record_id: int, payload: PaidDateRequest, db: Session = Depends(get_db)):
    """Set/clear paid_date on a single Sales & BM history record."""
    rec = ctrl.update_salesbm_history_paid_date(db, record_id, payload.paid_date)
    return {"id": rec.id, "paid_date": str(rec.paid_date) if rec.paid_date else None}


@router.put("/history/bulk-paid-date")
def salesbm_history_bulk_paid_date(payload: BulkPaidDateRequest, db: Session = Depends(get_db)):
    """Apply paid_date to many Sales & BM history records at once (voucher-wise apply)."""
    return ctrl.bulk_update_salesbm_history_paid_date(db, payload.record_ids, payload.paid_date)    