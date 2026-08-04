from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
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
    working_days: Optional[int] = None


class TargetsCopyIn(BaseModel):
    from_month: str
    to_month: str


class TargetsYearSaveIn(BaseModel):
    fy: int                         # FY start year (2025 = Apr 2025 .. Mar 2026)
    rows: list                      # [{branch_id, region, ..., spare:{m:v}, labour:{m:v}}]
    working_days: Optional[dict] = None   # {'YYYY-MM': int}


class SrTypesSaveIn(BaseModel):
    items: list                     # [{sr_type, head}]


class HeadIn(BaseModel):
    name: str


class ReportSaveIn(BaseModel):
    as_on: date
    title: Optional[str] = None
    payload: dict


class CancelRowIn(BaseModel):
    record_type: str                # 'part' | 'labour' — scopes the row lookup
    row_id: int                     # pms_sales_records.id of the ONE row
    cancelled: bool = True          # False = restore


# ---------------- AOP MASTER: TARGETS ---------------- #

@router.get("/targets")
async def get_targets(
    month: str,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_master_admin(db, user_id, user_role)
    return {"success": True, **pc.get_targets_payload(db, month)}


@router.get("/targets/year")
async def get_targets_year(
    fy: int,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_master_admin(db, user_id, user_role)
    return {"success": True, **pc.get_targets_year_payload(db, fy)}


@router.post("/targets/year/bulk")
async def save_targets_year(
    payload: TargetsYearSaveIn,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_master_admin(db, user_id, user_role)
    return pc.save_targets_year(db, payload.fy, payload.rows, user_id,
                                payload.working_days)


@router.post("/targets/bulk")
async def save_targets(
    payload: TargetsSaveIn,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_master_admin(db, user_id, user_role)
    return pc.save_targets(db, payload.month, payload.rows, user_id, payload.working_days)


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
    heads = pc.list_heads(db)
    return {"success": True, "items": pc.list_sr_types(db),
            "heads": heads,
            "head_choices": [h["name"] for h in heads]}


@router.post("/sr-types")
async def save_sr_types(
    payload: SrTypesSaveIn,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_master_admin(db, user_id, user_role)
    return pc.save_sr_types(db, payload.items, user_id)


@router.post("/heads")
async def add_head(
    payload: HeadIn,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_master_admin(db, user_id, user_role)
    return pc.add_head(db, payload.name, user_id)


@router.delete("/heads/{head_id}")
async def delete_head(
    head_id: int,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_master_admin(db, user_id, user_role)
    return pc.delete_head(db, head_id)


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
    progress_token: Optional[str] = Form(None),  # frontend polls /upload/progress
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_master_admin(db, user_id, user_role)
    contents = await file.read()
    if validate_only:
        return pc.validate_file(contents, file.filename, record_type)
    # Worker thread keeps the event loop free so progress polls answer live.
    return await run_in_threadpool(
        pc.import_file, db, contents, file.filename, record_type, user_id,
        progress_token)


@router.get("/upload/progress")
async def upload_progress(token: str):
    """Live progress of a running import (no auth — token is an opaque,
    client-generated random id and the payload is just {pct, stage})."""
    return {"success": True, **pc.get_upload_progress(token)}


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
    limit: int = 200,
    offset: int = 0,
    search: Optional[str] = None,
    cancelled: Optional[str] = None,     # 'all' | 'active' | 'cancelled'
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_master_admin(db, user_id, user_role)
    page = pc.preview_rows(db, record_type, min(limit, 500), max(offset, 0),
                           search, cancelled)
    return {"success": True, "items": page["items"], "total": page["total"],
            "cancelled_total": page["cancelled_total"]}


@router.post("/data/cancel-row")
async def cancel_row(
    payload: CancelRowIn,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_master_admin(db, user_id, user_role)
    if payload.record_type not in ("part", "labour"):
        raise HTTPException(status_code=400, detail="record_type must be 'part' or 'labour'")
    return pc.set_row_cancelled(db, payload.record_type, payload.row_id,
                                payload.cancelled, user_id)


# ---------------- REPORT ---------------- #

@router.get("/report")
async def get_report(
    as_on: date,
    from_date: Optional[date] = None,
    part_as_on: Optional[date] = None,     # per-type period ends — used by the
    labour_as_on: Optional[date] = None,   # default all-data report
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_master_admin(db, user_id, user_role)
    return pc.generate_report(db, as_on, from_date, part_as_on, labour_as_on)


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
