import asyncio
import mimetypes

from fastapi import APIRouter, Depends, HTTPException, Header, UploadFile, File, Form
from fastapi.responses import Response, StreamingResponse
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session
from typing import Optional

from app.database import SessionLocal
from app.controllers import mom_controller as mc
from app.controllers import mom_files_controller as mf
from app.schemas.mom_schema import (
    MeetingIn, MeetingUpdateIn, MasterPointIn, MasterPointUpdate, CategoryIn, CategoryUpdate,
    MeetingTypeIn, MeetingTypeUpdate, DraftIn,
)
from app.models.user_model import User, UserRole

router = APIRouter(prefix="/mom", tags=["mom"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ---------------- ROLE HELPERS ---------------- #

ADMIN_ROLES = {UserRole.MASTER_ADMIN.value, UserRole.BRANCH_ADMIN.value}
MASTER_ROLES = {UserRole.MASTER_ADMIN.value}


def _resolve_user(db: Session, user_id: Optional[str]):
    if not user_id:
        return None
    return db.query(User).filter(User.user_id == user_id).first()


def _resolve_role(db: Session, user_id: Optional[str], user_role: Optional[str]) -> Optional[str]:
    if user_role:
        return user_role
    user = _resolve_user(db, user_id)
    if user:
        return user.role.value if hasattr(user.role, "value") else str(user.role)
    return None


def _require_role(db: Session, user_id, user_role, allowed: set, message: str):
    role = _resolve_role(db, user_id, user_role)
    if role not in allowed:
        raise HTTPException(status_code=403, detail=message)
    return role


def _resolve_name(db: Session, user_id: Optional[str], fallback: Optional[str] = None) -> str:
    user = _resolve_user(db, user_id)
    if user and user.name:
        return user.name
    return fallback or "Unknown"


# ---------------- BOOTSTRAP (master points + categories) ---------------- #

@router.get("/bootstrap")
async def bootstrap(
    user_id: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Master points + categories for the setup screen. Read for any logged-in
    user; seeds the defaults on the very first call."""
    data = mc.get_bootstrap(db, created_by=user_id)
    return {"success": True, **data}


# ---------------- MEETINGS ---------------- #

@router.get("/meetings")
async def list_meetings(
    branch_code: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """All finalized meeting sheets (optionally one branch), newest first.
    Read for any logged-in user — History and Reports both use this."""
    return {"success": True, "meetings": mc.list_meetings(db, branch_code)}


@router.post("/meetings")
async def create_meeting(
    payload: MeetingIn,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Finalize a meeting sheet. Admins only (branch admins run branch meetings).

    The flaky SQL Server link sometimes drops mid-request (pyodbc 08S01 /
    TCP 10060). The transaction rolls back on failure, so retrying the whole
    save here is safe — nothing partial is ever committed."""
    _require_role(db, user_id, user_role, ADMIN_ROLES,
                  "Only admins can finalize meeting minutes")
    conducted_by = _resolve_name(db, user_id, fallback="Master Admin")
    for attempt in range(3):
        try:
            meeting = mc.create_meeting(
                db, payload.model_dump(),
                conducted_by_id=user_id, conducted_by_name=conducted_by,
            )
            return {"success": True, "meeting": meeting}
        except OperationalError:
            db.rollback()
            if attempt == 2:
                raise HTTPException(
                    status_code=503,
                    detail="Database connection dropped while saving — the minutes were NOT saved. Please try again.",
                )
            await asyncio.sleep(1 + attempt)


@router.put("/meetings/{meeting_id}")
async def edit_meeting(
    meeting_id: int,
    payload: MeetingUpdateIn,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Edit an already-finalized meeting from MOM History. Master Admin only —
    branch admins can create meetings but not rewrite history.

    Same flaky-link retry story as create_meeting: the transaction rolls back
    on failure, so retrying the whole update is safe."""
    _require_role(db, user_id, user_role, MASTER_ROLES,
                  "Only the Master Admin can edit meeting minutes")
    for attempt in range(3):
        try:
            meeting = mc.update_meeting(db, meeting_id, payload.model_dump(exclude_unset=True))
            return {"success": True, "meeting": meeting}
        except OperationalError:
            db.rollback()
            if attempt == 2:
                raise HTTPException(
                    status_code=503,
                    detail="Database connection dropped while saving — the changes were NOT saved. Please try again.",
                )
            await asyncio.sleep(1 + attempt)


@router.delete("/meetings/{meeting_id}")
async def delete_meeting(
    meeting_id: int,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_role(db, user_id, user_role, {UserRole.MASTER_ADMIN.value},
                  "Only the Master Admin can delete meeting minutes")
    mc.delete_meeting(db, meeting_id)
    return {"success": True}


# ---------------- MEETING DRAFT (auto-saved wizard state) ---------------- #

@router.get("/draft")
async def get_draft(
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """The caller's own auto-saved meeting draft (or null). One per user."""
    if not user_id:
        raise HTTPException(status_code=400, detail="user-id header required")
    _require_role(db, user_id, user_role, ADMIN_ROLES,
                  "Only admins can use meeting drafts")
    return {"success": True, "draft": mc.get_draft(db, user_id)}


@router.put("/draft")
async def save_draft(
    payload: DraftIn,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Upsert the caller's draft — the client mirrors the wizard state here
    (debounced) while the user types."""
    if not user_id:
        raise HTTPException(status_code=400, detail="user-id header required")
    _require_role(db, user_id, user_role, ADMIN_ROLES,
                  "Only admins can use meeting drafts")
    mc.save_draft(db, user_id, payload.data)
    return {"success": True}


@router.delete("/draft")
async def delete_draft(
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Drop the caller's draft — used on Reset and after the minutes are saved."""
    if not user_id:
        raise HTTPException(status_code=400, detail="user-id header required")
    _require_role(db, user_id, user_role, ADMIN_ROLES,
                  "Only admins can use meeting drafts")
    mc.delete_draft(db, user_id)
    return {"success": True}


# ---------------- MASTER POINTS ---------------- #

@router.post("/master-points")
async def create_master_point(
    payload: MasterPointIn,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_role(db, user_id, user_role, MASTER_ROLES,
                  "Only the Master Admin can edit the master list")
    return {"success": True, "item": mc.create_point(db, payload.title, payload.category, created_by=user_id)}


@router.put("/master-points/{point_id}")
async def update_master_point(
    point_id: int,
    payload: MasterPointUpdate,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_role(db, user_id, user_role, MASTER_ROLES,
                  "Only the Master Admin can edit the master list")
    return {"success": True, "item": mc.update_point(db, point_id, payload.title, payload.category)}


@router.delete("/master-points/{point_id}")
async def delete_master_point(
    point_id: int,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_role(db, user_id, user_role, MASTER_ROLES,
                  "Only the Master Admin can edit the master list")
    mc.delete_point(db, point_id)
    return {"success": True}


# ---------------- MEETING TYPES ---------------- #

@router.post("/meeting-types")
async def create_meeting_type(
    payload: MeetingTypeIn,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_role(db, user_id, user_role, MASTER_ROLES,
                  "Only the Master Admin can edit meeting types")
    return {"success": True, "item": mc.create_meeting_type(db, payload.name, created_by=user_id)}


@router.put("/meeting-types/{type_id}")
async def update_meeting_type(
    type_id: int,
    payload: MeetingTypeUpdate,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_role(db, user_id, user_role, MASTER_ROLES,
                  "Only the Master Admin can edit meeting types")
    return {"success": True, "item": mc.update_meeting_type(db, type_id, payload.name)}


@router.delete("/meeting-types/{type_id}")
async def delete_meeting_type(
    type_id: int,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_role(db, user_id, user_role, MASTER_ROLES,
                  "Only the Master Admin can edit meeting types")
    mc.delete_meeting_type(db, type_id)
    return {"success": True}


# ---------------- CATEGORIES ---------------- #

@router.post("/categories")
async def create_category(
    payload: CategoryIn,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_role(db, user_id, user_role, MASTER_ROLES,
                  "Only the Master Admin can edit categories")
    return {"success": True, "item": mc.create_category(db, payload.name, payload.color, created_by=user_id)}


@router.put("/categories/{name}")
async def update_category(
    name: str,
    payload: CategoryUpdate,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_role(db, user_id, user_role, MASTER_ROLES,
                  "Only the Master Admin can edit categories")
    return {"success": True, "item": mc.update_category(db, name, color=payload.color, new_name=payload.name)}


@router.delete("/categories/{name}")
async def delete_category(
    name: str,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_role(db, user_id, user_role, MASTER_ROLES,
                  "Only the Master Admin can edit categories")
    result = mc.delete_category(db, name)
    return {"success": True, **result}


# ---------------- MASTER FOLDER: FILE STORE (master_admin only) ---------------- #

@router.get("/folders")
async def list_folders(
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_role(db, user_id, user_role, MASTER_ROLES,
                  "Only the Master Admin can open the master folder")
    return {"success": True, "folders": mf.list_folders(db)}


@router.post("/folders")
async def create_folder(
    name: str = Form(...),
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_role(db, user_id, user_role, MASTER_ROLES,
                  "Only the Master Admin can create folders")
    return {"success": True, "folder": mf.create_folder(db, name, created_by=user_id)}


@router.put("/folders/{folder_id}")
async def rename_folder(
    folder_id: int,
    name: str = Form(...),
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_role(db, user_id, user_role, MASTER_ROLES,
                  "Only the Master Admin can rename folders")
    return {"success": True, "folder": mf.rename_folder(db, folder_id, name)}


@router.delete("/folders/{folder_id}")
async def delete_folder(
    folder_id: int,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_role(db, user_id, user_role, MASTER_ROLES,
                  "Only the Master Admin can delete folders")
    mf.delete_folder(db, folder_id)
    return {"success": True}


@router.get("/folders/{folder_id}/files")
async def list_folder_files(
    folder_id: int,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_role(db, user_id, user_role, MASTER_ROLES,
                  "Only the Master Admin can open the master folder")
    return {"success": True, "files": mf.list_files(db, folder_id)}


@router.post("/files")
async def upload_files(
    folder_id: int = Form(...),
    files: list[UploadFile] = File(...),
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_role(db, user_id, user_role, MASTER_ROLES,
                  "Only the Master Admin can upload files")
    saved = await mf.save_files(db, folder_id, files, uploaded_by=user_id)
    return {"success": True, "files": saved}


@router.delete("/files/{file_id}")
async def delete_file(
    file_id: int,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_role(db, user_id, user_role, MASTER_ROLES,
                  "Only the Master Admin can delete files")
    mf.delete_file(db, file_id)
    return {"success": True}


# View / download are unauthenticated so the browser's <img>/<a>/<iframe> can
# load them directly (same pattern as the Knowledge Bank); the folder UI that
# exposes these ids is only ever rendered for the Master Admin.
@router.get("/files/{file_id}/view")
async def view_file(file_id: int, db: Session = Depends(get_db)):
    row = mf.get_file(db, file_id)
    if row.data is None:
        raise HTTPException(status_code=404, detail="File data is missing")
    media_type = row.content_type or mimetypes.guess_type(row.original_name or "")[0] or "application/octet-stream"
    return Response(content=row.data, media_type=media_type)


@router.get("/files/{file_id}/download")
async def download_file(file_id: int, db: Session = Depends(get_db)):
    row = mf.get_file(db, file_id)
    if row.data is None:
        raise HTTPException(status_code=404, detail="File data is missing")
    media_type = row.content_type or mimetypes.guess_type(row.original_name or "")[0] or "application/octet-stream"
    filename = (row.original_name or "download").replace('"', "")
    return Response(content=row.data, media_type=media_type,
                    headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@router.get("/folders/{folder_id}/download")
async def download_folder(folder_id: int, db: Session = Depends(get_db)):
    name, buffer = mf.build_folder_zip(db, folder_id)
    safe = (name or "folder").replace('"', "").strip() or "folder"
    return StreamingResponse(buffer, media_type="application/zip",
                             headers={"Content-Disposition": f'attachment; filename="{safe}.zip"'})
