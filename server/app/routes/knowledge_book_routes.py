from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Header, Form
import mimetypes
from fastapi.responses import Response, StreamingResponse
from sqlalchemy.orm import Session
from typing import Optional

from app.database import SessionLocal
from app.controllers import knowledge_book_controller as kb
from app.models.user_model import User, UserRole
from app.models.knowledge_book_model import KBFolder

router = APIRouter(prefix="/knowledge-book", tags=["knowledge-book"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ---------------- ROLE HELPERS ---------------- #

def _resolve_role(db: Session, user_id: Optional[str], user_role: Optional[str]) -> Optional[str]:
    """Trust the header role if present; otherwise look it up by user_id."""
    if user_role:
        return user_role
    if user_id:
        user = db.query(User).filter(User.user_id == user_id).first()
        if user:
            # user.role is an Enum; .value gives the string
            return user.role.value if hasattr(user.role, "value") else str(user.role)
    return None


def _require_master_admin(db: Session, user_id: Optional[str], user_role: Optional[str]):
    role = _resolve_role(db, user_id, user_role)
    if role != UserRole.MASTER_ADMIN.value:
        raise HTTPException(status_code=403, detail="Only the Master Admin can perform this action")
    return role


def _is_master_admin(db: Session, user_id: Optional[str], user_role: Optional[str]) -> bool:
    return _resolve_role(db, user_id, user_role) == UserRole.MASTER_ADMIN.value


# ---------------- READ ---------------- #

@router.get("/folders")
async def list_folder(
    parent_id: Optional[int] = None,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """List subfolders + files in a folder (omit parent_id for top-level products)."""
    is_admin = _is_master_admin(db, user_id, user_role)

    # If a specific (non-root) folder is requested, make sure it exists and,
    # for non-admins, that it isn't hidden.
    if parent_id is not None:
        folder = db.query(KBFolder).filter(KBFolder.id == parent_id).first()
        if not folder:
            raise HTTPException(status_code=404, detail="Folder not found")
        if folder.is_hidden and not is_admin:
            raise HTTPException(status_code=404, detail="Folder not found")

    folders, files = kb.list_contents(db, parent_id, is_admin)
    breadcrumb = kb.get_breadcrumb(db, parent_id)
    return {"success": True, "is_admin": is_admin, "breadcrumb": breadcrumb, "folders": folders, "files": files}


# ---------------- FOLDER WRITES (master_admin only) ---------------- #

@router.post("/folders")
async def create_folder(
    name: str = Form(...),
    parent_id: Optional[int] = Form(None),
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_master_admin(db, user_id, user_role)
    folder = kb.create_folder(db, name, parent_id, created_by=user_id)
    return {"success": True, "folder": {"id": folder.id, "name": folder.name}}


@router.put("/folders/{folder_id}")
async def rename_folder(
    folder_id: int,
    name: str = Form(...),
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_master_admin(db, user_id, user_role)
    folder = kb.rename_folder(db, folder_id, name)
    return {"success": True, "folder": {"id": folder.id, "name": folder.name}}


@router.patch("/folders/{folder_id}/hide")
async def toggle_hide(
    folder_id: int,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_master_admin(db, user_id, user_role)
    folder = kb.toggle_hide_folder(db, folder_id)
    return {"success": True, "folder": {"id": folder.id, "is_hidden": bool(folder.is_hidden)}}


@router.delete("/folders/{folder_id}")
async def delete_folder(
    folder_id: int,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_master_admin(db, user_id, user_role)
    kb.delete_folder(db, folder_id)
    return {"success": True}


# ---------------- FILE WRITES (master_admin only) ---------------- #

@router.post("/files")
async def upload_files(
    folder_id: int = Form(...),
    files: list[UploadFile] = File(...),
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_master_admin(db, user_id, user_role)
    saved = []
    for f in files:
        row = await kb.save_file(db, folder_id, f, uploaded_by=user_id)
        saved.append({"id": row.id, "name": row.original_name, "kind": row.kind, "size_bytes": row.size_bytes})
    return {"success": True, "files": saved}


@router.delete("/files/{file_id}")
async def delete_file(
    file_id: int,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_master_admin(db, user_id, user_role)
    kb.delete_file(db, file_id)
    return {"success": True}


# ---------------- VIEW / DOWNLOAD (any logged-in user) ---------------- #

@router.get("/files/{file_id}/view")
async def view_file(file_id: int, db: Session = Depends(get_db)):
    """Serve the file inline from the database (for image/video/pdf previews)."""
    row = kb.get_file(db, file_id)
    if row.data is None:
        raise HTTPException(status_code=404, detail="File data is missing")
    media_type = row.content_type or mimetypes.guess_type(row.original_name or "")[0] or "application/octet-stream"
    return Response(content=row.data, media_type=media_type)


@router.get("/files/{file_id}/download")
async def download_file(file_id: int, db: Session = Depends(get_db)):
    row = kb.get_file(db, file_id)
    if row.data is None:
        raise HTTPException(status_code=404, detail="File data is missing")
    media_type = row.content_type or mimetypes.guess_type(row.original_name or "")[0] or "application/octet-stream"
    filename = (row.original_name or "download").replace('"', "")
    return Response(
        content=row.data,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/folders/{folder_id}/download")
async def download_folder(
    folder_id: int,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Download a whole folder (and its subtree) as one .zip.
    Any logged-in user can use it; non-admins won't get hidden subfolders."""
    is_admin = _is_master_admin(db, user_id, user_role)
    name, buffer = kb.build_folder_zip(db, folder_id, is_admin)
    safe = (name or "folder").replace('"', "").strip() or "folder"
    return StreamingResponse(
        buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{safe}.zip"'},
    )