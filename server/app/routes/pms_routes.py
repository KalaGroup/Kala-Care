from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.controllers import pms_controller as pc
from app.models.user_model import User, UserRole

router = APIRouter(prefix="/pms", tags=["pms"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# The whole PMS module is Master Admin only for now (the frontend hides it for
# everyone else; this enforces it server-side too).
def _require_master_admin(db: Session, user_id: Optional[str], user_role: Optional[str]):
    role = user_role
    if not role and user_id:
        user = db.query(User).filter(User.user_id == user_id).first()
        if user:
            role = user.role.value if hasattr(user.role, "value") else str(user.role)
    if role != UserRole.MASTER_ADMIN.value:
        raise HTTPException(status_code=403, detail="Only the Master Admin can access PMS")


# ---------------- SCHEMAS ---------------- #

class TargetsSaveIn(BaseModel):
    month: str                      # 'YYYY-MM'
    rows: list


class TargetsCopyIn(BaseModel):
    from_month: str
    to_month: str


class SrTypesSaveIn(BaseModel):
    items: list                     # [{sr_type, head}]


class ReportSaveIn(BaseModel):
    as_on: date
    title: Optional[str] = None
    payload: dict


# ---------------- AOP MASTER: TARGETS ---------------- #

@router.get("/targets")
async def get_targets(
    month: str,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_master_admin(db, user_id, user_role)
    return {"success": True, "items": pc.list_targets(db, month)}


@router.post("/targets/bulk")
async def save_targets(
    payload: TargetsSaveIn,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_master_admin(db, user_id, user_role)
    return pc.save_targets(db, payload.month, payload.rows, user_id)


@router.post("/targets/copy")
async def copy_targets(
    payload: TargetsCopyIn,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_master_admin(db, user_id, user_role)
    return pc.copy_targets(db, payload.from_month, payload.to_month, user_id)


@router.delete("/targets/{target_id}")
async def delete_target(
    target_id: int,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_master_admin(db, user_id, user_role)
    return pc.delete_target(db, target_id)


# ---------------- SR TYPE MASTER ---------------- #

@router.get("/sr-types")
async def get_sr_types(
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_master_admin(db, user_id, user_role)
    return {"success": True, "items": pc.list_sr_types(db),
            "head_choices": pc.HEAD_CHOICES}


@router.post("/sr-types")
async def save_sr_types(
    payload: SrTypesSaveIn,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_master_admin(db, user_id, user_role)
    return pc.save_sr_types(db, payload.items, user_id)


@router.post("/sr-types/sync")
async def sync_sr_types(
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_master_admin(db, user_id, user_role)
    return pc.sync_sr_types(db, user_id)


@router.post("/sr-types/reset")
async def reset_sr_types(
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_master_admin(db, user_id, user_role)
    return pc.reset_sr_types(db, user_id)


# ---------------- FILE UPLOAD / DATA ---------------- #

@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    record_type: str = Form(...),               # 'part' | 'labour'
    validate_only: bool = Form(False),
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_master_admin(db, user_id, user_role)
    contents = await file.read()
    if validate_only:
        return pc.validate_file(contents, file.filename)
    return pc.import_file(db, contents, file.filename, record_type, user_id)


@router.get("/uploads")
async def get_uploads(
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_master_admin(db, user_id, user_role)
    return {"success": True, "items": pc.list_batches(db)}


@router.delete("/data")
async def clear_data(
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_master_admin(db, user_id, user_role)
    return pc.clear_all_data(db)


@router.get("/data/summary")
async def get_data_summary(
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_master_admin(db, user_id, user_role)
    return {"success": True, "summary": pc.data_summary(db)}


@router.get("/data/preview")
async def get_data_preview(
    record_type: str,
    limit: int = 50,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_master_admin(db, user_id, user_role)
    return {"success": True, "items": pc.preview_rows(db, record_type, min(limit, 200))}


# ---------------- REPORT ---------------- #

@router.get("/report")
async def get_report(
    as_on: date,
    from_date: Optional[date] = None,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_master_admin(db, user_id, user_role)
    return pc.generate_report(db, as_on, from_date)


@router.post("/report/save")
async def save_report(
    payload: ReportSaveIn,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_master_admin(db, user_id, user_role)
    return pc.save_report(db, payload.as_on, payload.title, payload.payload, user_id)


@router.get("/report/history")
async def report_history(
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_master_admin(db, user_id, user_role)
    return {"success": True, "items": pc.list_reports(db)}


@router.get("/report/history/{report_id}")
async def report_history_item(
    report_id: int,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_master_admin(db, user_id, user_role)
    return pc.get_report(db, report_id)


@router.delete("/report/history/{report_id}")
async def delete_report_history(
    report_id: int,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_master_admin(db, user_id, user_role)
    return pc.delete_report(db, report_id)
