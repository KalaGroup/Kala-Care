"""MOM "Master Folder" file store — folders + uploaded files.

Mirrors the Knowledge Bank approach: file bytes live in the database (`data`
LargeBinary), so nothing depends on a filesystem path. Master Admin only; the
routes enforce the role. Allowed types: Word / Excel / CSV / PDF / image.
"""
import io
import zipfile
from pathlib import Path

from fastapi import UploadFile, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.mom_model import MomFolder, MomFile

# ---------------- CONFIG ---------------- #
MAX_FILE_SIZE_MB = 25
MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024

IMAGE_EXT = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"}
PDF_EXT = {".pdf"}
WORD_EXT = {".doc", ".docx"}
EXCEL_EXT = {".xls", ".xlsx"}
CSV_EXT = {".csv"}
ALLOWED_EXT = IMAGE_EXT | PDF_EXT | WORD_EXT | EXCEL_EXT | CSV_EXT


def kind_from_ext(ext: str) -> str:
    ext = (ext or "").lower()
    if ext in IMAGE_EXT:
        return "image"
    if ext in PDF_EXT:
        return "pdf"
    if ext in WORD_EXT:
        return "word"
    if ext in EXCEL_EXT:
        return "excel"
    if ext in CSV_EXT:
        return "csv"
    return "other"


# ---------------- SERIALIZERS ---------------- #

def serialize_file(f: MomFile):
    return {
        "id": f.id,
        "folderId": f.folder_id,
        "name": f.original_name,
        "kind": f.kind,
        "contentType": f.content_type or "",
        "sizeBytes": f.size_bytes or 0,
        "uploadedBy": f.uploaded_by or "",
        "createdAt": f.created_at.isoformat() if f.created_at else "",
    }


def serialize_folder(fo: MomFolder, count: int = 0):
    return {
        "id": fo.id,
        "name": fo.name,
        "fileCount": count,
        "createdBy": fo.created_by or "",
        "createdAt": fo.created_at.isoformat() if fo.created_at else "",
    }


# ---------------- FOLDERS ---------------- #

def list_folders(db: Session):
    """All folders (newest first) with each folder's file count in one query."""
    counts = dict(
        db.query(MomFile.folder_id, func.count(MomFile.id))
        .group_by(MomFile.folder_id)
        .all()
    )
    rows = db.query(MomFolder).order_by(MomFolder.created_at.desc(), MomFolder.id.desc()).all()
    return [serialize_folder(fo, counts.get(fo.id, 0)) for fo in rows]


def create_folder(db: Session, name: str, created_by: str | None = None):
    name = (name or "").strip()
    if not name:
        raise HTTPException(status_code=422, detail="Folder name is required")
    if db.query(MomFolder.id).filter(func.lower(MomFolder.name) == name.lower()).first():
        raise HTTPException(status_code=409, detail=f"A folder named “{name}” already exists")
    fo = MomFolder(name=name, created_by=created_by)
    db.add(fo)
    db.commit()
    db.refresh(fo)
    return serialize_folder(fo, 0)


def rename_folder(db: Session, folder_id: int, name: str):
    fo = db.query(MomFolder).filter(MomFolder.id == folder_id).first()
    if not fo:
        raise HTTPException(status_code=404, detail="Folder not found")
    name = (name or "").strip()
    if not name:
        raise HTTPException(status_code=422, detail="Folder name is required")
    clash = (
        db.query(MomFolder.id)
        .filter(func.lower(MomFolder.name) == name.lower(), MomFolder.id != folder_id)
        .first()
    )
    if clash:
        raise HTTPException(status_code=409, detail=f"A folder named “{name}” already exists")
    fo.name = name
    db.commit()
    count = db.query(func.count(MomFile.id)).filter(MomFile.folder_id == fo.id).scalar() or 0
    return serialize_folder(fo, count)


def delete_folder(db: Session, folder_id: int):
    fo = db.query(MomFolder).filter(MomFolder.id == folder_id).first()
    if not fo:
        raise HTTPException(status_code=404, detail="Folder not found")
    db.delete(fo)   # files cascade
    db.commit()
    return {"success": True}


# ---------------- FILES ---------------- #

def list_files(db: Session, folder_id: int):
    fo = db.query(MomFolder.id).filter(MomFolder.id == folder_id).first()
    if not fo:
        raise HTTPException(status_code=404, detail="Folder not found")
    # Never load the `data` bytes for the listing.
    rows = (
        db.query(MomFile.id, MomFile.folder_id, MomFile.original_name, MomFile.kind,
                 MomFile.content_type, MomFile.size_bytes, MomFile.uploaded_by, MomFile.created_at)
        .filter(MomFile.folder_id == folder_id)
        .order_by(MomFile.created_at.desc(), MomFile.id.desc())
        .all()
    )
    return [{
        "id": r.id, "folderId": r.folder_id, "name": r.original_name, "kind": r.kind,
        "contentType": r.content_type or "", "sizeBytes": r.size_bytes or 0,
        "uploadedBy": r.uploaded_by or "", "createdAt": r.created_at.isoformat() if r.created_at else "",
    } for r in rows]


async def save_files(db: Session, folder_id: int, uploads: list[UploadFile], uploaded_by: str | None = None):
    """Validate + store several files in ONE transaction (a single commit for the
    whole batch instead of one per file — far fewer round-trips over the DB link)."""
    folder = db.query(MomFolder.id).filter(MomFolder.id == folder_id).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")

    rows = []
    for upload in uploads:
        ext = Path(upload.filename or "").suffix.lower()
        if ext not in ALLOWED_EXT:
            raise HTTPException(
                status_code=400,
                detail=f"File type {ext or '(unknown)'} not allowed. Upload a Word, Excel, CSV, PDF or image file.",
            )
        try:
            contents = await upload.read()
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error reading file: {e}")
        finally:
            await upload.close()

        size_bytes = len(contents)
        if size_bytes > MAX_FILE_SIZE_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f'"{upload.filename}" is too large. Maximum allowed size is {MAX_FILE_SIZE_MB} MB.',
            )

        row = MomFile(
            folder_id=folder_id,
            original_name=upload.filename,
            content_type=upload.content_type,
            data=contents,
            kind=kind_from_ext(ext),
            size_bytes=size_bytes,
            uploaded_by=uploaded_by,
        )
        db.add(row)
        rows.append(row)

    db.commit()   # one commit for the whole batch
    return [serialize_file(r) for r in rows]


def get_file(db: Session, file_id: int) -> MomFile:
    row = db.query(MomFile).filter(MomFile.id == file_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="File not found")
    return row


def delete_file(db: Session, file_id: int):
    row = db.query(MomFile).filter(MomFile.id == file_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="File not found")
    db.delete(row)
    db.commit()
    return {"success": True}


def build_folder_zip(db: Session, folder_id: int):
    """Zip every file in a folder into an in-memory buffer. Duplicate file
    names are de-duplicated so the archive stays valid."""
    fo = db.query(MomFolder).filter(MomFolder.id == folder_id).first()
    if not fo:
        raise HTTPException(status_code=404, detail="Folder not found")
    files = db.query(MomFile).filter(MomFile.folder_id == folder_id).all()
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        seen = {}
        for f in files:
            if f.data is None:
                continue
            name = f.original_name or f"file_{f.id}"
            if name in seen:
                seen[name] += 1
                stem, dot, ext = name.rpartition(".")
                name = f"{stem} ({seen[name]}){dot}{ext}" if dot else f"{name} ({seen[name]})"
            else:
                seen[name] = 0
            z.writestr(name, f.data)
    buf.seek(0)
    return fo.name, buf
