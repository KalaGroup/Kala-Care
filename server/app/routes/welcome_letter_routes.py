from typing import List, Optional
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Header, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.controllers import welcome_letter_controller as wc
from app.models.user_model import User, UserRole

router = APIRouter(prefix="/welcome-letter", tags=["welcome-letter"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _require_user(db: Session, user_id: Optional[str]):
    """Only Master Admin and Branch Admin may use the Welcome Letter module.
    Returns (user, allowed_branches) — allowed is None for Master Admin (all
    branches) and the Branch Admin's own + granted branches otherwise."""
    if not user_id:
        raise HTTPException(status_code=401, detail="Login required")
    user = db.query(User).filter(User.user_id == user_id).first()
    if not user or user.is_blocked or user.is_deleted:
        raise HTTPException(status_code=401, detail="Login required")
    role = user.role.value if hasattr(user.role, "value") else str(user.role)
    if role not in (UserRole.MASTER_ADMIN.value, UserRole.BRANCH_ADMIN.value):
        raise HTTPException(status_code=403,
                            detail="Welcome Letter is available to Master Admin and Branch Admin only")
    return user, wc.allowed_branches(db, user)


def _require_master_admin(db: Session, user_id: Optional[str], user_role: Optional[str]):
    role = user_role
    if not role and user_id:
        user = db.query(User).filter(User.user_id == user_id).first()
        if user:
            role = user.role.value if hasattr(user.role, "value") else str(user.role)
    if role != UserRole.MASTER_ADMIN.value:
        raise HTTPException(status_code=403,
                            detail="Only the Master Admin can change the Welcome Letter master setup")


# ---------------- SCHEMAS ---------------- #

class LetterTextIn(BaseModel):
    letter_text: str


# ---------------- ENTRIES (pending / sent list) ---------------- #

@router.get("/entries")
async def get_entries(
    branch: Optional[str] = None,
    status: Optional[str] = None,          # PENDING | SENT
    search: Optional[str] = None,
    user_id: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _user, allowed = _require_user(db, user_id)
    return {"success": True, **wc.list_entries(db, branch, status, search, allowed)}


@router.get("/pending-count")
async def get_pending_count(
    user_id: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Sidebar badge — pending welcome letters within the user's branches."""
    _user, allowed = _require_user(db, user_id)
    return {"success": True, "pending": wc.pending_count(db, allowed)}


@router.post("/sync")
async def resync(
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Manual re-sync from the already-imported Open SR data (the sync also
    runs automatically after every Open SR Load Report import)."""
    _require_master_admin(db, user_id, user_role)
    added = wc.sync_from_open_sr(db)
    return {"success": True, "added": added}


# ---------------- LETTER PREVIEW / SEND ---------------- #

@router.get("/letter/{entry_id}")
async def get_letter(
    entry_id: int,
    user_id: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _user, allowed = _require_user(db, user_id)
    return wc.letter_payload(db, entry_id, allowed)


@router.post("/send/{entry_id}")
async def send_letter(
    entry_id: int,
    email: Optional[str] = None,
    cc: Optional[str] = None,
    attachments: Optional[str] = None,     # ids the sender ticked, comma separated
    user_id: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _user, allowed = _require_user(db, user_id)
    return wc.send_letter(db, entry_id, user_id, override_email=email, cc_emails=cc,
                          attachment_ids=attachments, allowed=allowed)


# ---------------- REPORT ---------------- #

@router.get("/report")
async def get_report(
    branch: Optional[str] = None,
    user: Optional[str] = None,            # users.user_id of the sender
    user_id: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _user, allowed = _require_user(db, user_id)
    return wc.report(db, branch, user, allowed)


# ---------------- MASTER SETUP ---------------- #

@router.get("/master")
async def get_master(
    user_id: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_user(db, user_id)
    return wc.get_master(db)          # read-only: preview needs the attachments


@router.post("/master/letter-text")
async def save_letter_text(
    payload: LetterTextIn,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_master_admin(db, user_id, user_role)
    return wc.save_letter_text(db, payload.letter_text, user_id)


@router.post("/master/attachments")
async def add_default_attachments(
    files: List[UploadFile] = File(...),     # one or many — multi-select upload
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_master_admin(db, user_id, user_role)
    return wc.add_default_attachments(db, files, user_id)


@router.delete("/master/attachments/{att_id}")
async def delete_default_attachment(
    att_id: int,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_master_admin(db, user_id, user_role)
    return wc.delete_default_attachment(db, att_id)


@router.get("/master/files/{item_id}")
async def download_attachment(
    item_id: int,
    user_id: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_user(db, user_id)
    data, name, ctype = wc.attachment_file(db, item_id)
    return Response(
        content=data, media_type=ctype,
        headers={"Content-Disposition": f"inline; filename*=UTF-8''{quote(name or 'file')}"},
    )
