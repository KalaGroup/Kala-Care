from typing import List, Optional
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, UploadFile
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


def _require_login(db: Session, user_id: Optional[str]):
    """Any signed-in user. The drive letter is written by employees too, so the
    engine-model lookup cannot sit behind the Welcome Letter's own role gate —
    it only ever returns a file the Master Admin already published."""
    if not user_id:
        raise HTTPException(status_code=401, detail="Login required")
    user = db.query(User).filter(User.user_id == user_id).first()
    if not user or user.is_blocked or user.is_deleted:
        raise HTTPException(status_code=401, detail="Login required")
    return user


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


class AttachmentNameIn(BaseModel):
    file_name: str


class CustomerEmailIn(BaseModel):
    email: str


class EngineModelsIn(BaseModel):
    engine_models: List[str]


# ---------------- ENTRIES (pending / sent list) ---------------- #

@router.get("/entries")
def get_entries(
    branch: Optional[str] = None,
    status: Optional[str] = None,          # PENDING | SENT
    search: Optional[str] = None,
    user_id: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _user, allowed = _require_user(db, user_id)
    return {"success": True, **wc.list_entries(db, branch, status, search, allowed)}


@router.get("/pending-count")
def get_pending_count(
    user_id: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Sidebar badge — pending welcome letters within the user's branches."""
    _user, allowed = _require_user(db, user_id)
    return {"success": True, "pending": wc.pending_count(db, allowed)}


@router.post("/sync")
def resync(
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
def get_letter(
    entry_id: int,
    user_id: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _user, allowed = _require_user(db, user_id)
    return wc.letter_payload(db, entry_id, allowed)


@router.post("/send/{entry_id}")
def send_letter(
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


@router.post("/customer-email/{entry_id}")
def save_customer_email(
    entry_id: int,
    payload: CustomerEmailIn,
    user_id: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """An email typed into the preview's To box is written onto the customers
    table right away — most of the time the sender is supplying an address the
    customer record simply did not have."""
    _user, allowed = _require_user(db, user_id)
    return wc.save_customer_email(db, entry_id, payload.email, allowed)


@router.get("/model-attachment")
def get_model_attachment(
    engine_model: str,
    content: int = 0,                      # 1 -> include the bytes, base64
    user_id: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """The shared master's file for one engine model. Used by drive letters
    whose format has 'Use model-wise attachment' switched on."""
    _require_login(db, user_id)
    return wc.model_attachment_for(db, engine_model, with_content=bool(content))


# ---------------- REPORT ---------------- #

@router.get("/report")
def get_report(
    branch: Optional[str] = None,
    user: Optional[str] = None,            # users.user_id of the sender
    user_id: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _user, allowed = _require_user(db, user_id)
    return wc.report(db, branch, user, allowed)


# ---------------- MASTER SETUP ---------------- #

@router.get("/master")
def get_master(
    user_id: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_user(db, user_id)
    return wc.get_master(db)          # read-only: preview needs the attachments


@router.post("/master/letter-text")
def save_letter_text(
    payload: LetterTextIn,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_master_admin(db, user_id, user_role)
    return wc.save_letter_text(db, payload.letter_text, user_id)


@router.post("/master/attachments")
def add_default_attachments(
    files: List[UploadFile] = File(...),     # one or many — multi-select upload
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_master_admin(db, user_id, user_role)
    return wc.add_default_attachments(db, files, user_id)


@router.patch("/master/attachments/{att_id}")
def rename_default_attachment(
    att_id: int,
    payload: AttachmentNameIn,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Rename a master attachment — the file the customer receives keeps its
    bytes and its extension, only the visible name changes."""
    _require_master_admin(db, user_id, user_role)
    return wc.rename_attachment(db, att_id, payload.file_name)


@router.delete("/master/attachments/{att_id}")
def delete_default_attachment(
    att_id: int,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_master_admin(db, user_id, user_role)
    return wc.delete_default_attachment(db, att_id)


# ---------------- MASTER SETUP → MODEL-WISE ATTACHMENTS ---------------- #

@router.post("/master/model-attachments")
def add_model_attachment(
    file: UploadFile = File(...),
    engine_models: str = Form(...),          # comma separated, from the dropdown
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Upload one file and map the chosen engine models to it — a customer on
    any of those models gets this file automatically, on top of the defaults."""
    _require_master_admin(db, user_id, user_role)
    return wc.add_model_attachment(db, file, engine_models, user_id)


@router.post("/master/model-attachments/{att_id}/models")
def add_models_to_attachment(
    att_id: int,
    payload: EngineModelsIn,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Point more engine models at a file that is already mapped."""
    _require_master_admin(db, user_id, user_role)
    return wc.add_models_to_attachment(db, att_id, payload.engine_models, user_id)


@router.delete("/master/model-rules/{rule_id}")
def delete_model_rule(
    rule_id: int,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Unmap one engine model — the model returns to the dropdown."""
    _require_master_admin(db, user_id, user_role)
    return wc.delete_model_rule(db, rule_id)


@router.delete("/master/model-attachments/{att_id}")
def delete_model_attachment(
    att_id: int,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Delete a model-wise file and every engine model mapped to it."""
    _require_master_admin(db, user_id, user_role)
    return wc.delete_model_attachment(db, att_id)


@router.get("/master/files/{item_id}")
def download_attachment(
    item_id: int,
    user_id: Optional[str] = Header(None),
    if_none_match: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """The attachment's bytes. The sender flips between the same few files all
    day, so the response is cacheable and revalidates with an ETag — the second
    view of a file costs one 304 instead of pulling the blob out of SQL Server
    again."""
    _require_user(db, user_id)
    # Answered BEFORE the blob is touched — a conditional GET that still read
    # the file out of SQL Server would cost as much as serving it.
    if if_none_match:
        known = wc.attachment_etag(db, item_id)
        if known and known in (t.strip() for t in if_none_match.split(",")):
            return Response(status_code=304, headers={
                "ETag": known, "Cache-Control": "private, max-age=86400"})
    data, name, ctype, etag = wc.attachment_file(db, item_id)
    return Response(content=data, media_type=ctype, headers={
        "Content-Disposition": f"inline; filename*=UTF-8''{quote(name or 'file')}",
        "Cache-Control": "private, max-age=86400",
        "ETag": etag,
    })
