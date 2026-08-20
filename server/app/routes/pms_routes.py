from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.controllers import pms_controller as pc
from app.controllers.user_controller import AOP_RIGHTS_ADMIN_IDS
from app.models.user_model import User, UserRole

router = APIRouter(prefix="/pms", tags=["pms"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# PMS access: the Master Admin always, plus anyone the Master Admin has ticked
# "PMS Access" for in Profile. Always resolved from the DB — the user-role
# header is client-supplied and must never decide access on its own.
def _pms_user(db: Session, user_id: Optional[str]) -> User:
    user = db.query(User).filter(User.user_id == (user_id or "")).first() if user_id else None
    if not user or getattr(user, "is_deleted", False) or user.is_blocked:
        raise HTTPException(status_code=403, detail="You do not have access to PMS")
    return user


def _is_master(user: User) -> bool:
    role = user.role.value if hasattr(user.role, "value") else str(user.role)
    return role == UserRole.MASTER_ADMIN.value


def _require_master_admin(db: Session, user_id: Optional[str], user_role: Optional[str]):
    """Name kept: every PMS endpoint calls this. It now means "may open PMS"."""
    user = _pms_user(db, user_id)
    if not (_is_master(user) or bool(user.can_access_pms)):
        raise HTTPException(status_code=403, detail="You do not have access to PMS")
    return user


def _require_master_only(db: Session, user_id: Optional[str]):
    """Endpoints that stay Master-Admin-only whatever PMS rights a user has —
    the SE UID Master, which lives in the Profile page's admin tabs."""
    user = _pms_user(db, user_id)
    if not _is_master(user):
        raise HTTPException(status_code=403, detail="Only the Master Admin can do this")
    return user


def _require_aop(db: Session, user_id: Optional[str], user_role: Optional[str],
                 edit: bool = False):
    """AOP & Master pages: 'view' can read, only 'edit' can save/delete.
    The AOP rights admins (AOP_RIGHTS_ADMIN_IDS) always have full rights."""
    user = _require_master_admin(db, user_id, user_role)
    level = "edit" if user.user_id in AOP_RIGHTS_ADMIN_IDS else (user.aop_access or "none")
    if level == "none":
        raise HTTPException(status_code=403, detail="You do not have access to AOP & Master")
    if edit and level != "edit":
        raise HTTPException(status_code=403, detail="You have view-only rights on AOP & Master")
    return user


# ---------------- SCHEMAS ---------------- #

class TargetsYearSaveIn(BaseModel):
    fy: int                         # FY start year (2025 = Apr 2025 .. Mar 2026)
    rows: list                      # [{branch_id, region, ..., spare:{m:v}, labour:{m:v}}]
    working_days: Optional[dict] = None   # {'YYYY-MM': int}


class SrTypesSaveIn(BaseModel):
    items: list                     # [{sr_type, head}]


class HeadIn(BaseModel):
    name: str


class MaxttrSrTypesSaveIn(BaseModel):
    items: list                     # [{sr_type, head}]


class EfsrSrTypesSaveIn(BaseModel):
    items: list                     # [{sr_type, head}]


class LeadMapSaveIn(BaseModel):
    items: list                     # [{lead_raised_for, category}]


class SeUidIn(BaseModel):
    id: Optional[int] = None
    se_name: str
    se_uid: Optional[str] = None
    # KALA branch the engineer belongs to — the reports' last-resort branch
    branch_id: Optional[str] = None


class CancelRowIn(BaseModel):
    record_type: str                # 'part' | 'labour' — scopes the row lookup
    row_id: int                     # pms_sales_records.id of the ONE row
    cancelled: bool = True          # False = restore


# ---------------- AOP MASTER: TARGETS ---------------- #

@router.get("/targets/year")
async def get_targets_year(
    fy: int,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_aop(db, user_id, user_role, edit=False)
    return {"success": True, **pc.get_targets_year_payload(db, fy)}


@router.post("/targets/year/bulk")
async def save_targets_year(
    payload: TargetsYearSaveIn,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_aop(db, user_id, user_role, edit=True)
    return pc.save_targets_year(db, payload.fy, payload.rows, user_id,
                                payload.working_days)


# ---------------- AOP MASTER: HOLIDAY CALENDAR ---------------- #

class HolidaysSaveIn(BaseModel):
    fy: int
    holidays: dict          # {'YYYY-MM-DD': {'regions': ['MH','KA'], 'name': str}}


@router.get("/holidays")
async def get_holidays(
    fy: int,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_aop(db, user_id, user_role, edit=False)
    return {"success": True, **pc.list_holidays(db, fy)}


@router.post("/holidays")
async def save_holidays(
    payload: HolidaysSaveIn,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_aop(db, user_id, user_role, edit=True)
    return pc.save_holidays(db, payload.fy, payload.holidays, user_id)


# ---------------- SR TYPE MASTER ---------------- #

@router.get("/sr-types")
async def get_sr_types(
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_aop(db, user_id, user_role, edit=False)
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
    _require_aop(db, user_id, user_role, edit=True)
    return pc.save_sr_types(db, payload.items, user_id)


@router.post("/heads")
async def add_head(
    payload: HeadIn,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_aop(db, user_id, user_role, edit=True)
    return pc.add_head(db, payload.name, user_id)


@router.delete("/heads/{head_id}")
async def delete_head(
    head_id: int,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_aop(db, user_id, user_role, edit=True)
    return pc.delete_head(db, head_id)


@router.post("/sr-types/sync")
async def sync_sr_types(
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_aop(db, user_id, user_role, edit=True)
    return pc.sync_sr_types(db, user_id)


@router.post("/sr-types/reset")
async def reset_sr_types(
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_aop(db, user_id, user_role, edit=True)
    return pc.reset_sr_types(db, user_id)


# ---------------- SR TYPE MASTER — MAXTTR (AOP Master) ---------------- #
# The Employee Productivity report groups SRs by these heads. Separate from the
# Sales/Labour SR Type Master above: this one maps the MaxTTR file's own
# SR Type column.

@router.get("/maxttr-sr-types")
async def get_maxttr_sr_types(
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_aop(db, user_id, user_role, edit=False)
    heads = pc.list_maxttr_heads(db)
    return {"success": True, "items": pc.list_maxttr_sr_types(db),
            "heads": heads,
            "head_choices": [h["name"] for h in heads]}


@router.post("/maxttr-sr-types")
async def save_maxttr_sr_types(
    payload: MaxttrSrTypesSaveIn,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_aop(db, user_id, user_role, edit=True)
    return pc.save_maxttr_sr_types(db, payload.items, user_id)


@router.post("/maxttr-sr-types/sync")
async def sync_maxttr_sr_types(
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_aop(db, user_id, user_role, edit=True)
    return await run_in_threadpool(pc.sync_maxttr_sr_types, db, user_id)


@router.post("/maxttr-sr-types/reset")
async def reset_maxttr_sr_types(
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_aop(db, user_id, user_role, edit=True)
    return pc.reset_maxttr_sr_types(db, user_id)


@router.post("/maxttr-heads")
async def add_maxttr_head(
    payload: HeadIn,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_aop(db, user_id, user_role, edit=True)
    return pc.add_maxttr_head(db, payload.name, user_id)


@router.delete("/maxttr-heads/{head_id}")
async def delete_maxttr_head(
    head_id: int,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_aop(db, user_id, user_role, edit=True)
    return pc.delete_maxttr_head(db, head_id)


# ---------------- SR TYPE MASTER — EFSR (AOP Master) ---------------- #
# Drives the Employee Productivity report's ALLOCATE SR split.

@router.get("/efsr-sr-types")
async def get_efsr_sr_types(
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_aop(db, user_id, user_role, edit=False)
    heads = pc.list_efsr_heads(db)
    return {"success": True, "items": pc.list_efsr_sr_types(db),
            "heads": heads,
            "head_choices": [h["name"] for h in heads]}


@router.post("/efsr-sr-types")
async def save_efsr_sr_types(
    payload: EfsrSrTypesSaveIn,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_aop(db, user_id, user_role, edit=True)
    return pc.save_efsr_sr_types(db, payload.items, user_id)


@router.post("/efsr-sr-types/sync")
async def sync_efsr_sr_types(
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_aop(db, user_id, user_role, edit=True)
    return await run_in_threadpool(pc.sync_efsr_sr_types, db, user_id)


@router.post("/efsr-sr-types/reset")
async def reset_efsr_sr_types(
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_aop(db, user_id, user_role, edit=True)
    return pc.reset_efsr_sr_types(db, user_id)


@router.post("/efsr-heads")
async def add_efsr_head(
    payload: HeadIn,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_aop(db, user_id, user_role, edit=True)
    return pc.add_efsr_head(db, payload.name, user_id)


@router.delete("/efsr-heads/{head_id}")
async def delete_efsr_head(
    head_id: int,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_aop(db, user_id, user_role, edit=True)
    return pc.delete_efsr_head(db, head_id)


# ---------------- LEAD CATEGORY MASTER (AOP Master) ---------------- #
# Same shape as the SR Type Master: a category master + a per-value mapping
# synced out of the uploaded LMS file, read by the Employee Productivity report.

@router.get("/lead-categories")
async def get_lead_categories(
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_aop(db, user_id, user_role, edit=False)
    cats = pc.list_lead_categories(db)
    return {"success": True, "items": pc.list_lead_map(db),
            "categories": cats,
            "category_choices": [c["name"] for c in cats]}


@router.post("/lead-categories")
async def save_lead_categories(
    payload: LeadMapSaveIn,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_aop(db, user_id, user_role, edit=True)
    return pc.save_lead_map(db, payload.items, user_id)


@router.post("/lead-categories/sync")
async def sync_lead_categories(
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_aop(db, user_id, user_role, edit=True)
    return await run_in_threadpool(pc.sync_lead_map, db, user_id)


@router.post("/lead-categories/reset")
async def reset_lead_categories(
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_aop(db, user_id, user_role, edit=True)
    return pc.reset_lead_map(db, user_id)


@router.post("/lead-cats")
async def add_lead_cat(
    payload: HeadIn,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_aop(db, user_id, user_role, edit=True)
    return pc.add_lead_category(db, payload.name, user_id)


@router.delete("/lead-cats/{cat_id}")
async def delete_lead_cat(
    cat_id: int,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_aop(db, user_id, user_role, edit=True)
    return pc.delete_lead_category(db, cat_id)


# ---------------- SE UID MASTER (Profile page) ---------------- #

@router.get("/se-uid")
async def get_se_uids(
    sync: bool = False,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """The stored SE roster. sync=true (the 'Reload from data' button) first
    pulls in every engineer the uploaded files know and saves them; the master
    is also seeded automatically the very first time, while it is empty."""
    _require_master_only(db, user_id)
    return await run_in_threadpool(pc.se_uid_payload, db, user_id, sync)


@router.post("/se-uid/sync")
async def sync_se_uids(
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_master_only(db, user_id)
    return await run_in_threadpool(pc.se_uid_payload, db, user_id, True)


@router.post("/se-uid")
async def save_se_uid(
    payload: SeUidIn,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_master_only(db, user_id)
    return pc.save_se_uid(db, payload.id, payload.se_name, payload.se_uid, user_id,
                          payload.branch_id)


@router.delete("/se-uid/{row_id}")
async def delete_se_uid(
    row_id: int,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_master_only(db, user_id)
    return pc.delete_se_uid(db, row_id)


@router.post("/se-uid/import")
async def import_se_uids(
    file: UploadFile = File(...),
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Two-column Excel (SE Name, SE UID) — existing names update in place."""
    _require_master_only(db, user_id)
    contents = await file.read()
    return await run_in_threadpool(pc.import_se_uids, db, contents, user_id)


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


@router.get("/report/fy-summary")
async def report_fy_summary(
    fy: Optional[int] = None,              # FY start year; default = current FY
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Whole-FY target vs achievement per branch and month. Feeds the FY /
    Quarterly / Month-wise panels, which ignore the report period picker."""
    _require_master_admin(db, user_id, user_role)
    if fy is None:
        today = date.today()
        fy = today.year if today.month >= 4 else today.year - 1
    return await run_in_threadpool(pc.fy_summary_report, db, fy)


@router.get("/report/branch-detail")
async def report_branch_detail(
    as_on: date,
    from_date: Optional[date] = None,
    branches: str = "",                    # comma-separated branch ids
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_master_admin(db, user_id, user_role)
    ids = [b for b in branches.split(",") if b.strip()]
    return pc.branch_detail_report(db, as_on, from_date, ids)


@router.get("/report/employee-productivity")
async def report_employee_productivity(
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Employee Productivity — labour SR numbers matched against the
    'Response Time & MaxTTR Details' import; counted by SE NAME on SR
    close date. Windowing/aggregation happens client-side."""
    _require_master_admin(db, user_id, user_role)
    return pc.employee_productivity_data(db)


@router.get("/report/sr-allocation")
async def report_sr_allocation(
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """SR Allocation — the EFSR Report counted per Service Engineer on SR
    CLOSED DATE, split by the 'SR Type Master (EFSR)'. Windowing, the date
    columns and every rollup happen client-side."""
    _require_master_admin(db, user_id, user_role)
    return pc.sr_allocation_data(db)


@router.get("/report/annual/service-penetration")
async def report_annual_service_penetration(
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Annual Reports → Service Penetration. The asset master's live IND / PG
    population per branch (counted on COMMISSIONING DATE, read cumulatively)
    against the unique assets whose SR the Response Time & MaxTTR file has
    closed; the period, the Pen % and every rollup are applied client-side."""
    _require_master_admin(db, user_id, user_role)
    return pc.annual_service_penetration_data(db)


@router.get("/report/annual/cdi")
async def report_annual_cdi(
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Annual Reports → Customer Delight Index (CDI). The CDI Detail Report's
    Promotor / Passive / Detractor feedback per branch, counted on ACTIVITY END
    DATE. The financial-year cumulatives, the month columns and the working
    month's weeks are all computed client-side from the raw per-day payload."""
    _require_master_admin(db, user_id, user_role)
    return await run_in_threadpool(pc.annual_cdi_data, db)


# ---------------- AOP MASTER: CDI TARGETS ---------------- #
# The AOP column of the Customer Delight Index report — one percentage per
# financial year and report row (branch, MH / KA region, overall).

class CdiTargetsSaveIn(BaseModel):
    fy: int                         # FY start year (2026 = Apr 2026 .. Mar 2027)
    items: list                     # [{scope, key, target_pct}]


@router.get("/cdi-targets")
async def get_cdi_targets(
    fy: int,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_aop(db, user_id, user_role, edit=False)
    return {"success": True, **pc.list_cdi_targets(db, fy)}


@router.post("/cdi-targets")
async def save_cdi_targets(
    payload: CdiTargetsSaveIn,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_aop(db, user_id, user_role, edit=True)
    return pc.save_cdi_targets(db, payload.fy, payload.items, user_id)
