from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from urllib.parse import unquote
from pydantic import BaseModel
import logging

from app.database import SessionLocal
from app.controllers import salesBM_controller as ctrl

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/tada-salesbm", tags=["TADA Sales & BM"])


class CalcRequest(BaseModel):
    branch_code: str
    one_way_km: str


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
        "labour_sale_expected": r.labour_sale_expected,
        "part_sale_expected": r.part_sale_expected,
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