from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.controllers import pms_controller as pc
from app.controllers import pms_training_controller as ptc
from app.controllers.user_controller import (
    AOP_RIGHTS_ADMIN_IDS, aop_level_for_tab, can_open_annual_tab, can_open_pms_page
)
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


# Branch-wise reports (Employee Productivity, SR Allocation) show a user only
# the branches they belong to: the branch on their Profile plus every branch
# ticked in their branch access list — a Branch Admin often has more than one.
# The Master Admin, and ANY user carrying the HO branch, see every branch: HO is
# the head office. Resolved from the DB, never from the client-supplied
# user-role header, and applied to the payload in the controller so a scoped
# user cannot reach another branch's figures by calling the endpoint directly.
HO_BRANCH_CODE = "HO"


def _branch_scope(user: User):
    """The branch codes this user may see, or None for 'every branch'."""
    if _is_master(user):
        return None
    codes = {(user.branch or "").strip()}
    codes |= {(ba.branch or "").strip() for ba in (user.branch_accesses or [])}
    codes = {c for c in codes if c}
    if any(c.upper() == HO_BRANCH_CODE for c in codes):
        return None
    return sorted(codes)


def _require_pms_page(db: Session, user_id: Optional[str], user_role: Optional[str],
                      page: str):
    """One PMS REPORT page: the module flag opens the menu, and the per-page list
    in users.pms_pages then says which reports this user actually gets, so a user
    given only (say) the Training Report cannot pull another report's data by
    calling its endpoint directly. Users with no per-page list keep every report.
    Keep page= in step with PMS_PAGE_KEYS (user_controller.py) and PMS_PAGES
    (client/src/utils/pagePermission.js). AOP & Master does NOT come through
    here — it has its own rights, see _require_aop below."""
    user = _require_master_admin(db, user_id, user_role)
    if not can_open_pms_page(user, page):
        raise HTTPException(status_code=403, detail="You do not have access to this PMS page")
    return user


def _require_annual_tab(db: Session, user_id: Optional[str], user_role: Optional[str],
                        tab: str):
    """ONE sheet of the Annual Reports page. The 'annual' PMS page opens the
    page, and the per-sheet list in users.annual_tabs then says which of its
    reports this user actually gets — so a user given only (say) the CDI sheet
    cannot pull another sheet's data by calling its endpoint directly. Users
    with no per-sheet list keep every sheet. Keep tab= in step with
    ANNUAL_TAB_KEYS (user_controller.py) and ANNUAL_TABS
    (client/src/utils/pagePermission.js)."""
    user = _require_master_admin(db, user_id, user_role)
    if not can_open_annual_tab(user, tab):
        raise HTTPException(status_code=403,
                            detail="You do not have access to this Annual Report")
    return user


def _require_aop(db: Session, user_id: Optional[str], user_role: Optional[str],
                 edit: bool = False, tab: Optional[str] = None):
    """AOP & Master pages: 'view' can read, only 'edit' can save/delete.

    Rights are per TAB — every endpoint below passes the tab it belongs to, so a
    user granted only (say) 'cditargets' cannot read or write another tab's data
    by calling its endpoint directly. Users with no per-tab map keep the whole
    page at their aop_access level, and the AOP rights admins always have
    everything. Keep tab= in step with AOP_TAB_KEYS (user_controller.py) and
    AOP_TABS (client/src/utils/pagePermission.js)."""
    user = _require_master_admin(db, user_id, user_role)
    level = aop_level_for_tab(user, tab)
    if level == "none":
        raise HTTPException(status_code=403, detail="You do not have access to this AOP & Master tab")
    if edit and level != "edit":
        raise HTTPException(status_code=403, detail="You have view-only rights on this AOP & Master tab")
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


class SrCrossCheckIn(BaseModel):
    source: str                     # 'sales' | 'maxttr' | 'efsr' | 'service_load'
    items: list                     # [{sr_type, head}] — the rows just saved


class SrCrossApplyIn(BaseModel):
    targets: list                   # [{master, sr_type, head}] — the ticked offers


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
    _require_aop(db, user_id, user_role, edit=False, tab="targets")
    return {"success": True, **pc.get_targets_year_payload(db, fy)}


@router.post("/targets/year/bulk")
async def save_targets_year(
    payload: TargetsYearSaveIn,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_aop(db, user_id, user_role, edit=True, tab="targets")
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
    _require_aop(db, user_id, user_role, edit=False, tab="targets")
    return {"success": True, **pc.list_holidays(db, fy)}


@router.post("/holidays")
async def save_holidays(
    payload: HolidaysSaveIn,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_aop(db, user_id, user_role, edit=True, tab="targets")
    return pc.save_holidays(db, payload.fy, payload.holidays, user_id)


# ---------------- SR TYPE MASTER ---------------- #

@router.get("/sr-types")
async def get_sr_types(
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_aop(db, user_id, user_role, edit=False, tab="srtypes")
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
    _require_aop(db, user_id, user_role, edit=True, tab="srtypes")
    return pc.save_sr_types(db, payload.items, user_id)


@router.post("/heads")
async def add_head(
    payload: HeadIn,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_aop(db, user_id, user_role, edit=True, tab="srtypes")
    return pc.add_head(db, payload.name, user_id)


@router.delete("/heads/{head_id}")
async def delete_head(
    head_id: int,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_aop(db, user_id, user_role, edit=True, tab="srtypes")
    return pc.delete_head(db, head_id)


@router.post("/sr-types/sync")
async def sync_sr_types(
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_aop(db, user_id, user_role, edit=True, tab="srtypes")
    return pc.sync_sr_types(db, user_id)


@router.post("/sr-types/reset")
async def reset_sr_types(
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_aop(db, user_id, user_role, edit=True, tab="srtypes")
    return pc.reset_sr_types(db, user_id)


# ---------------- THE SAME SR TYPE IN MORE THAN ONE MASTER ---------------- #
# The four SR Type masters share their head list and overlap heavily on SR Type.
# After a save, cross-check says where else the SR Types just mapped also live;
# cross-apply writes the ones the user ticked. Rights are still per tab: a target
# master the user may not edit is never offered, and never written.

def _sr_tab_of(master_key: str) -> Optional[str]:
    m = pc.SR_MASTER_BY_KEY.get(master_key or "")
    return m[2] if m else None


def _editable_sr_masters(user) -> set:
    return {k for k, _label, tab, _H, _M, _d, _ln in pc.SR_HEAD_MASTERS
            if aop_level_for_tab(user, tab) == "edit"}


@router.post("/sr-types/cross-check")
async def cross_check_sr_types(
    payload: SrCrossCheckIn,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    tab = _sr_tab_of(payload.source)
    if not tab:
        raise HTTPException(status_code=400, detail="Unknown SR Type master")
    user = _require_aop(db, user_id, user_role, edit=True, tab=tab)
    res = pc.cross_check_sr_types(db, payload.source, payload.items)
    if not res.get("success"):
        return res
    # never offer what this user could not write anyway
    allowed = _editable_sr_masters(user)
    matches = []
    for m in res.get("matches", []):
        targets = [t for t in m.get("targets", []) if t.get("master") in allowed]
        if targets:
            matches.append({**m, "targets": targets})
    return {"success": True, "matches": matches}


@router.post("/sr-types/cross-apply")
async def cross_apply_sr_types(
    payload: SrCrossApplyIn,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    # any of the four tabs at edit is enough to reach here; each target is then
    # checked against the tab it actually writes to
    user = _require_aop(db, user_id, user_role, edit=True, tab=None)
    return pc.apply_cross_sr_types(db, payload.targets, user_id,
                                   allowed_masters=_editable_sr_masters(user))


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
    _require_aop(db, user_id, user_role, edit=False, tab="mxtypes")
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
    _require_aop(db, user_id, user_role, edit=True, tab="mxtypes")
    return pc.save_maxttr_sr_types(db, payload.items, user_id)


@router.post("/maxttr-sr-types/sync")
async def sync_maxttr_sr_types(
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_aop(db, user_id, user_role, edit=True, tab="mxtypes")
    return await run_in_threadpool(pc.sync_maxttr_sr_types, db, user_id)


@router.post("/maxttr-sr-types/reset")
async def reset_maxttr_sr_types(
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_aop(db, user_id, user_role, edit=True, tab="mxtypes")
    return pc.reset_maxttr_sr_types(db, user_id)


@router.post("/maxttr-heads")
async def add_maxttr_head(
    payload: HeadIn,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_aop(db, user_id, user_role, edit=True, tab="mxtypes")
    return pc.add_maxttr_head(db, payload.name, user_id)


@router.delete("/maxttr-heads/{head_id}")
async def delete_maxttr_head(
    head_id: int,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_aop(db, user_id, user_role, edit=True, tab="mxtypes")
    return pc.delete_maxttr_head(db, head_id)


# ---------------- SR TYPE MASTER — EFSR (AOP Master) ---------------- #
# Drives the Employee Productivity report's ALLOCATE SR split.

@router.get("/efsr-sr-types")
async def get_efsr_sr_types(
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_aop(db, user_id, user_role, edit=False, tab="eftypes")
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
    _require_aop(db, user_id, user_role, edit=True, tab="eftypes")
    return pc.save_efsr_sr_types(db, payload.items, user_id)


@router.post("/efsr-sr-types/sync")
async def sync_efsr_sr_types(
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_aop(db, user_id, user_role, edit=True, tab="eftypes")
    return await run_in_threadpool(pc.sync_efsr_sr_types, db, user_id)


@router.post("/efsr-sr-types/reset")
async def reset_efsr_sr_types(
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_aop(db, user_id, user_role, edit=True, tab="eftypes")
    return pc.reset_efsr_sr_types(db, user_id)


@router.post("/efsr-heads")
async def add_efsr_head(
    payload: HeadIn,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_aop(db, user_id, user_role, edit=True, tab="eftypes")
    return pc.add_efsr_head(db, payload.name, user_id)


@router.delete("/efsr-heads/{head_id}")
async def delete_efsr_head(
    head_id: int,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_aop(db, user_id, user_role, edit=True, tab="eftypes")
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
    _require_aop(db, user_id, user_role, edit=False, tab="leadcats")
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
    _require_aop(db, user_id, user_role, edit=True, tab="leadcats")
    return pc.save_lead_map(db, payload.items, user_id)


@router.post("/lead-categories/sync")
async def sync_lead_categories(
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_aop(db, user_id, user_role, edit=True, tab="leadcats")
    return await run_in_threadpool(pc.sync_lead_map, db, user_id)


@router.post("/lead-categories/reset")
async def reset_lead_categories(
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_aop(db, user_id, user_role, edit=True, tab="leadcats")
    return pc.reset_lead_map(db, user_id)


@router.post("/lead-cats")
async def add_lead_cat(
    payload: HeadIn,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_aop(db, user_id, user_role, edit=True, tab="leadcats")
    return pc.add_lead_category(db, payload.name, user_id)


@router.delete("/lead-cats/{cat_id}")
async def delete_lead_cat(
    cat_id: int,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_aop(db, user_id, user_role, edit=True, tab="leadcats")
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
    _require_pms_page(db, user_id, user_role, "sales_labour")
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
    _require_pms_page(db, user_id, user_role, "sales_labour")
    return {"success": True, "items": pc.list_batches(db)}


@router.delete("/data")
async def clear_data(
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_pms_page(db, user_id, user_role, "sales_labour")
    return pc.clear_all_data(db)


@router.get("/data/summary")
async def get_data_summary(
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_pms_page(db, user_id, user_role, "sales_labour")
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
    _require_pms_page(db, user_id, user_role, "sales_labour")
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
    _require_pms_page(db, user_id, user_role, "sales_labour")
    if payload.record_type not in ("part", "labour"):
        raise HTTPException(status_code=400, detail="record_type must be 'part' or 'labour'")
    return pc.set_row_cancelled(db, payload.record_type, payload.row_id,
                                payload.cancelled, user_id)


# ---------------- TRAINING REPORT ---------------- #
# Its own Excel file and its own table (pms_training_records) — nothing here
# touches the sales data. Nine fixed columns, every other column dynamic;
# see controllers/pms_training_controller.py.


class TrainingStatusIn(BaseModel):
    uid_no: str                        # the engineer, by UID NO
    # 'Active' / 'Inactive' to TYPE a status; None or '' to drop the typed one
    # and hand the engineer back to whatever the uploaded file says.
    status: Optional[str] = None
    left_on: Optional[date] = None     # last working day, when it is known
    reason: Optional[str] = None

@router.post("/training/upload")
async def upload_training_file(
    file: UploadFile = File(...),
    validate_only: bool = Form(False),
    progress_token: Optional[str] = Form(None),   # frontend polls /upload/progress
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_pms_page(db, user_id, user_role, "training")
    contents = await file.read()
    if validate_only:
        return ptc.validate_file(contents, file.filename)
    # Worker thread keeps the event loop free so progress polls answer live;
    # progress is reported through the SAME /pms/upload/progress endpoint.
    return await run_in_threadpool(
        ptc.import_file, db, contents, file.filename, user_id, progress_token)


@router.get("/training/report")
async def get_training_report(
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """The whole training master: every employee with their skills nested, plus
    the dynamic columns split into employee-level and training-level. The page
    searches it by name or by skill in the browser."""
    _require_pms_page(db, user_id, user_role, "training")
    return await run_in_threadpool(ptc.report_payload, db)


@router.get("/training/summary")
async def get_training_summary(
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_pms_page(db, user_id, user_role, "training")
    return {"success": True, "summary": ptc.data_summary(db)}


@router.post("/training/status")
async def set_training_status(
    payload: TrainingStatusIn,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Type an employment status by hand, or clear it.

    Guarded exactly like the upload, because it answers the same question the
    file's CURRENT STATUS column does — anyone who may replace the whole master
    may certainly mark one engineer as having left."""
    _require_pms_page(db, user_id, user_role, "training")
    if not (payload.status or "").strip():
        return ptc.clear_manual_status(db, payload.uid_no)
    return ptc.set_manual_status(db, payload.uid_no, payload.status,
                                 payload.left_on, payload.reason, user_id)


@router.delete("/training/data")
async def clear_training_data(
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_pms_page(db, user_id, user_role, "training")
    return ptc.clear_data(db)


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
    _require_pms_page(db, user_id, user_role, "sales_labour")
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
    _require_pms_page(db, user_id, user_role, "sales_labour")
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
    _require_pms_page(db, user_id, user_role, "sales_labour")
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
    user = _require_pms_page(db, user_id, user_role, "employee_productivity")
    return pc.employee_productivity_data(db, _branch_scope(user))


@router.get("/report/se-performance")
async def report_se_performance(
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """SE Performance — the Annexure I commitment matrix, per service engineer.

    Returns the ROSTER only: the branches with their region, and the engineers
    of the SE UID Master with what the Training Report knows about each. The
    twelve commitments' figures are generated in the browser for now — the
    counting rules are not agreed yet — so this endpoint stays a master read."""
    _require_pms_page(db, user_id, user_role, "se_performance")
    return await run_in_threadpool(pc.se_performance_roster, db)


@router.get("/report/sr-allocation")
async def report_sr_allocation(
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """SR Allocation — the EFSR Report counted per Service Engineer on SR
    CLOSED DATE, split by the 'SR Type Master (EFSR)'. Windowing, the date
    columns and every rollup happen client-side."""
    user = _require_pms_page(db, user_id, user_role, "sr_allocation")
    return pc.sr_allocation_data(db, _branch_scope(user))


@router.get("/report/employee-productivity/se-records")
async def report_ep_se_records(
    name: str,
    branch_id: Optional[str] = "",
    date_from: Optional[str] = "",
    date_to: Optional[str] = "",
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Employee Productivity -> the CLOSE SR rows behind ONE engineer.

    The drill-down the SE name opens: every MaxTTR row the report counted for
    that engineer in the picked period, so the figure on screen can be read
    SR by SR. Same page right as the report itself - the popup must never be a
    way around the per-page access list."""
    user = _require_pms_page(db, user_id, user_role, "employee_productivity")
    return await run_in_threadpool(pc.ep_se_records, db, name, branch_id or "",
                                   date_from or "", date_to or "",
                                   _branch_scope(user))


@router.get("/report/sr-allocation/se-records")
async def report_srar_se_records(
    name: str,
    date_from: Optional[str] = "",
    date_to: Optional[str] = "",
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """SR Allocation -> the ALLOCATED and CLOSED rows behind ONE engineer.

    Every EFSR appointment of the engineer touching the period on either of its
    dates, tagged both / carry_in / carry_out / open - so why Allocated and
    Closed differ is visible row by row instead of only as two totals."""
    user = _require_pms_page(db, user_id, user_role, "sr_allocation")
    scope = _branch_scope(user)
    if not await run_in_threadpool(pc.srar_engineer_in_branches, db, name, scope):
        raise HTTPException(status_code=403,
                            detail="This engineer is not in your branch")
    return await run_in_threadpool(pc.srar_se_records, db, name,
                                   date_from or "", date_to or "")


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
    _require_annual_tab(db, user_id, user_role, "service_penetration")
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
    _require_annual_tab(db, user_id, user_role, "cdi")
    return await run_in_threadpool(pc.annual_cdi_data, db)


@router.get("/report/annual/amc-bandhan")
async def report_annual_amc_bandhan(
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Annual Reports -> AMC & Bandhan Projection. The AMC Population Report's
    D/BAMC agreements (Dealer + Bandhan types) counted per branch on AGREEMENT
    START DATE, shipped as raw monthly counts; the financial year's YTD, its best
    month and the period's own month are all derived client-side. Last year's
    actual and the AOP projection come from the AOP master, in `targets`."""
    _require_annual_tab(db, user_id, user_role, "amc_bandhan")
    return await run_in_threadpool(pc.annual_amc_bandhan_data, db)


@router.get("/report/annual/amc-monthly")
async def report_annual_amc_monthly(
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Annual Reports -> AMC (the AMC report's second tab). The same AMC
    Population Report as the projection sheet, but one row per AGREEMENT
    CATEGORY instead of per branch - KOEL Bandhan (MH / KAR), KALA AMC, KOEL
    Corporate AMC, expiries, renewals - shipped as raw PER-DAY counts so the
    sheet builds its FY cumulatives, month columns and the working month's weeks
    client-side. Only the RUNNING year is printed - a closed year's count decays
    as gensets renew - and the one figure that cannot be counted, the AOP, rides
    along in `aop` from the AOP master."""
    _require_annual_tab(db, user_id, user_role, "amc_bandhan")
    return await run_in_threadpool(pc.annual_amc_monthly_data, db)


# ---------------- AOP MASTER: QUOTE CITY MASTER ---------------- #
# Which branch each city in the Bandhan quote files belongs to. The list of
# cities is built FROM THE FILES, so the business only picks a branch for each -
# it never has to know which cities the files contain. Nothing is derived: a city
# with no branch picked lands on the report's Unmapped Branch row, by name.

class QuoteCitiesSaveIn(BaseModel):
    items: list = []                # [{city_key, city_name, branch_id}]


@router.get("/quote-city-map")
async def get_quote_city_map(
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_aop(db, user_id, user_role, edit=False)
    return {"success": True, **await run_in_threadpool(pc.list_quote_cities, db)}


@router.post("/quote-city-map")
async def save_quote_city_map(
    payload: QuoteCitiesSaveIn,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_aop(db, user_id, user_role, edit=True)
    return await run_in_threadpool(pc.save_quote_cities, db, payload.items, user_id)


# ---------------- AOP MASTER: AMC & BANDHAN TARGETS ---------------- #
# TWO tables on one tab. `items` is per BRANCH - the two columns of the AMC &
# Bandhan Projection sheet that cannot be counted: the financial year's AOP
# projection, and the PREVIOUS year's actual (the AMC Population file is a
# snapshot, so a closed year's count decays - see PmsAmcTarget). Region and
# company rows are sums, so they need no target.
# `categories` is per ROW OF THE AMC SHEET - KOEL Bandhan, KALA AMC, Corporate
# AMC and the rest. Those rows are agreement categories rather than branches, so
# their AOP cannot be a sum of the branch figures and is entered on its own.

class AmcTargetsSaveIn(BaseModel):
    fy: int                         # FY start year (2026 = Apr 2026 .. Mar 2027)
    items: list = []                # [{key, proj_nos, prior_nos, best_nos}]
    categories: list = []           # [{key, aop_nos}] - the AMC sheet's rows


@router.get("/amc-targets")
async def get_amc_targets(
    fy: int,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_aop(db, user_id, user_role, edit=False, tab="amctargets")
    return {"success": True, **pc.list_amc_targets(db, fy)}


@router.post("/amc-targets")
async def save_amc_targets(
    payload: AmcTargetsSaveIn,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_aop(db, user_id, user_role, edit=True, tab="amctargets")
    return pc.save_amc_targets(db, payload.fy, payload.items, user_id,
                               payload.categories)


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
    _require_aop(db, user_id, user_role, edit=False, tab="cditargets")
    return {"success": True, **pc.list_cdi_targets(db, fy)}


@router.post("/cdi-targets")
async def save_cdi_targets(
    payload: CdiTargetsSaveIn,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_aop(db, user_id, user_role, edit=True, tab="cditargets")
    return pc.save_cdi_targets(db, payload.fy, payload.items, user_id)


# ---------------- ANNUAL REPORTS: SERVICE LOAD AND RESPONSE ---------------- #

@router.get("/report/annual/service-load")
async def report_annual_service_load(
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Annual Reports -> Service Load and Response. The Response Time & MaxTTR
    Details file counted on SR CLOSE DATE per branch: the SR-type-wise load
    split by the 'SR Type Master (Service Load)', the 4-hour response and
    24 / 48-hour closure numerators straight off the file's own columns, and one
    triple per engineer-day for the productivity denominator. The financial-year
    cumulatives, the month columns, the working month's weeks and every region
    rollup are computed client-side from the raw per-day payload."""
    _require_annual_tab(db, user_id, user_role, "service_load")
    return await run_in_threadpool(pc.annual_service_load_data, db)


# ---------------- SR TYPE MASTER - SERVICE LOAD (AOP Master) --------------- #
# The Service Load and Response sheet's breakdown rows. A THIRD master over the
# same MaxTTR SR Type column: this sheet prints CSP and Dealer AMC as rows of
# their own where Employee Productivity folds them into Warranty and AMC.

class ServiceLoadSrTypesSaveIn(BaseModel):
    items: list                     # [{sr_type, head}]


@router.get("/service-load-sr-types")
async def get_service_load_sr_types(
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_aop(db, user_id, user_role, edit=False, tab="sltypes")
    heads = pc.list_service_load_heads(db)
    return {"success": True, "items": pc.list_service_load_sr_types(db),
            "heads": heads,
            "head_choices": [h["name"] for h in heads]}


@router.post("/service-load-sr-types")
async def save_service_load_sr_types(
    payload: ServiceLoadSrTypesSaveIn,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_aop(db, user_id, user_role, edit=True, tab="sltypes")
    return pc.save_service_load_sr_types(db, payload.items, user_id)


@router.post("/service-load-sr-types/sync")
async def sync_service_load_sr_types(
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_aop(db, user_id, user_role, edit=True, tab="sltypes")
    return await run_in_threadpool(pc.sync_service_load_sr_types, db, user_id)


@router.post("/service-load-sr-types/reset")
async def reset_service_load_sr_types(
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_aop(db, user_id, user_role, edit=True, tab="sltypes")
    return pc.reset_service_load_sr_types(db, user_id)


@router.post("/service-load-heads")
async def add_service_load_head(
    payload: HeadIn,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_aop(db, user_id, user_role, edit=True, tab="sltypes")
    return pc.add_service_load_head(db, payload.name, user_id)


@router.delete("/service-load-heads/{head_id}")
async def delete_service_load_head(
    head_id: int,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_aop(db, user_id, user_role, edit=True, tab="sltypes")
    return pc.delete_service_load_head(db, head_id)


# ---------------- AOP MASTER: SERVICE LOAD AOP ---------------- #
# Two kinds of figure the sheet cannot count: the MONTHLY SR-closure target per
# branch (every AOP column on the sheet is a sum of these), and the percentage /
# productivity AOPs, which cannot be summed and so carry one value per report row.

class ServiceLoadTargetsSaveIn(BaseModel):
    fy: int                         # FY start year (2026 = Apr 2026 .. Mar 2027)
    items: list = []                # [{key, month, sr_target}]
    pct_items: list = []            # [{metric, scope, key, target_value}]


@router.get("/service-load-targets")
async def get_service_load_targets(
    fy: int,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_aop(db, user_id, user_role, edit=False, tab="sltargets")
    return {"success": True, **pc.list_service_load_targets(db, fy)}


class ServiceLoadSeCountSaveIn(BaseModel):
    items: list = []                # [{key, se_count}]


@router.get("/service-load-se-counts")
async def get_service_load_se_counts(
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """The SE headcount per branch — the productivity denominator."""
    _require_aop(db, user_id, user_role, edit=False)
    return {"success": True, **pc.list_service_load_se_counts(db)}


@router.post("/service-load-se-counts")
async def save_service_load_se_counts(
    payload: ServiceLoadSeCountSaveIn,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_aop(db, user_id, user_role, edit=True)
    return pc.save_service_load_se_counts(db, payload.items, user_id)


class ServiceLoadManualSaveIn(BaseModel):
    fy: int                         # FY start year (2026 = Apr 2026 .. Mar 2027)
    items: list = []                # [{metric, period, value}]


@router.get("/service-load-manual")
async def get_service_load_manual(
    fy: int,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """The typed FTR / FVR figures of the Service Load and Response sheet."""
    _require_aop(db, user_id, user_role, edit=False, tab="sltargets")
    return {"success": True, **pc.list_service_load_manual(db, fy)}


@router.post("/service-load-manual")
async def save_service_load_manual(
    payload: ServiceLoadManualSaveIn,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_aop(db, user_id, user_role, edit=True, tab="sltargets")
    return pc.save_service_load_manual(db, payload.fy, payload.items, user_id)


@router.post("/service-load-targets")
async def save_service_load_targets(
    payload: ServiceLoadTargetsSaveIn,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_aop(db, user_id, user_role, edit=True, tab="sltargets")
    return pc.save_service_load_targets(db, payload.fy, payload.items,
                                        payload.pct_items, user_id)
