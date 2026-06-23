import os
import io
import uuid
import shutil
import zipfile
from pathlib import Path
from fastapi import UploadFile, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.knowledge_book_model import KBFolder, KBFile

# ---------------- STORAGE ---------------- #
# Files are now stored directly in the database (KBFile.data), so there is no
# upload directory to manage.

# Maximum size for a single uploaded file. Keep this in sync with the frontend.
MAX_FILE_SIZE_MB = 25
MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024

# Allowed upload types -> kind
IMAGE_EXT = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"}
VIDEO_EXT = {".mp4", ".webm", ".mov", ".avi", ".mkv"}
PDF_EXT = {".pdf"}
ALLOWED_EXT = IMAGE_EXT | VIDEO_EXT | PDF_EXT


def kind_from_ext(ext: str) -> str:
    ext = ext.lower()
    if ext in IMAGE_EXT:
        return "image"
    if ext in VIDEO_EXT:
        return "video"
    if ext in PDF_EXT:
        return "pdf"
    return "other"


# ---------------- READ ---------------- #

def _counts(db: Session, folder_id: int):
    """How many subfolders and files a folder directly contains."""
    fcount = db.query(func.count(KBFolder.id)).filter(KBFolder.parent_id == folder_id).scalar() or 0
    flcount = db.query(func.count(KBFile.id)).filter(KBFile.folder_id == folder_id).scalar() or 0
    return int(fcount), int(flcount)


def _product_name_set(db: Session):
    """Lowercased names of every product in campaign_services."""
    try:
        from app.models.campaign_model import CampaignService
        return {(p.name or "").strip().lower() for p in db.query(CampaignService).all()}
    except Exception:
        return set()


def _is_product_folder(db: Session, folder) -> bool:
    """A top-level folder whose name matches a current product. These are
    managed by the product list (campaign_services) and re-created by the sync,
    so they cannot be renamed or deleted from the Knowledge Book."""
    if folder is None or folder.parent_id is not None:
        return False
    return (folder.name or "").strip().lower() in _product_name_set(db)


def _has_visible_content(db: Session, folder_id: int) -> bool:
    """True if this folder (or any non-hidden subfolder, recursively) contains a
    file. Used to hide empty folders from regular users — hidden subfolders don't
    count, since a user can't reach them."""
    if db.query(KBFile.id).filter(KBFile.folder_id == folder_id).first() is not None:
        return True
    subs = db.query(KBFolder).filter(
        KBFolder.parent_id == folder_id,
        KBFolder.is_hidden == False,  # noqa: E712
    ).all()
    for sub in subs:
        if _has_visible_content(db, sub.id):
            return True
    return False


def _visible_counts(db: Session, folder_id: int):
    """Counts a user will actually see: direct files, and direct non-hidden
    subfolders that have visible content."""
    fl = db.query(func.count(KBFile.id)).filter(KBFile.folder_id == folder_id).scalar() or 0
    subs = db.query(KBFolder).filter(
        KBFolder.parent_id == folder_id,
        KBFolder.is_hidden == False,  # noqa: E712
    ).all()
    f = sum(1 for s in subs if _has_visible_content(db, s.id))
    return int(f), int(fl)


def list_contents(db: Session, parent_id, is_admin: bool):
    """List subfolders + files inside a folder (parent_id None = top level).

    Non-admins never see hidden folders.
    """
    # At the top level, keep the product folders in sync with campaign_services
    # so newly added products appear automatically (add-only — see sync function).
    if parent_id is None:
        sync_product_folders(db)

    fq = db.query(KBFolder).filter(KBFolder.parent_id == parent_id)
    if not is_admin:
        fq = fq.filter(KBFolder.is_hidden == False)  # noqa: E712
    folders = fq.order_by(KBFolder.name).all()

    # For regular users, hide folders with no files anywhere in their visible subtree.
    if not is_admin:
        folders = [f for f in folders if _has_visible_content(db, f.id)]

    files = (
        db.query(KBFile)
        .filter(KBFile.folder_id == parent_id)
        .order_by(KBFile.original_name)
        .all()
        if parent_id is not None
        else []
    )

    product_names = _product_name_set(db) if parent_id is None else set()

    folder_dtos = []
    for f in folders:
        # Admins see true counts; users see only what they can reach.
        sub_f, sub_fl = _counts(db, f.id) if is_admin else _visible_counts(db, f.id)
        _fdate = f.updated_at or f.created_at
        folder_dtos.append({
            "id": f.id,
            "name": f.name,
            "is_hidden": bool(f.is_hidden),
            "is_product": (parent_id is None and (f.name or "").strip().lower() in product_names),
            "folder_count": sub_f,
            "file_count": sub_fl,
            "modified_at": _fdate.isoformat() if _fdate else None,
        })

    file_dtos = [{
        "id": fl.id,
        "name": fl.original_name,
        "kind": fl.kind,
        "size_bytes": fl.size_bytes,
        "url": f"/api/knowledge-book/files/{fl.id}/view",
        "modified_at": fl.created_at.isoformat() if fl.created_at else None,
    } for fl in files]

    return folder_dtos, file_dtos


def get_breadcrumb(db: Session, folder_id):
    """Build the trail from root down to folder_id: [{id, name}, ...]."""
    trail = []
    current = db.query(KBFolder).filter(KBFolder.id == folder_id).first() if folder_id else None
    while current is not None:
        trail.insert(0, {"id": current.id, "name": current.name})
        current = (
            db.query(KBFolder).filter(KBFolder.id == current.parent_id).first()
            if current.parent_id else None
        )
    return trail


# ---------------- FOLDER WRITES ---------------- #

def _name_exists(db: Session, parent_id, name: str, except_id=None) -> bool:
    q = db.query(KBFolder.id).filter(
        KBFolder.parent_id == parent_id,
        func.lower(KBFolder.name) == name.strip().lower(),
    )
    if except_id is not None:
        q = q.filter(KBFolder.id != except_id)
    # NOTE: SQL Server does not support `SELECT EXISTS (...)` as a scalar, so we
    # check for a row with .first() instead (works on SQL Server, SQLite, etc.).
    return q.first() is not None


def create_folder(db: Session, name: str, parent_id, created_by: str):
    name = (name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Folder name is required")

    if parent_id is not None:
        parent = db.query(KBFolder).filter(KBFolder.id == parent_id).first()
        if not parent:
            raise HTTPException(status_code=404, detail="Parent folder not found")

    if _name_exists(db, parent_id, name):
        raise HTTPException(status_code=409, detail="A folder with this name already exists here")

    folder = KBFolder(name=name, parent_id=parent_id, is_hidden=False, created_by=created_by)
    db.add(folder)
    db.commit()
    db.refresh(folder)
    return folder


def rename_folder(db: Session, folder_id: int, name: str):
    name = (name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Folder name is required")

    folder = db.query(KBFolder).filter(KBFolder.id == folder_id).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")

    if _is_product_folder(db, folder):
        raise HTTPException(
            status_code=400,
            detail="Product folders are named from the product list and can't be renamed here.",
        )

    if name.lower() != folder.name.strip().lower() and _name_exists(db, folder.parent_id, name, except_id=folder_id):
        raise HTTPException(status_code=409, detail="A folder with this name already exists here")

    folder.name = name
    db.commit()
    db.refresh(folder)
    return folder


def toggle_hide_folder(db: Session, folder_id: int):
    folder = db.query(KBFolder).filter(KBFolder.id == folder_id).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    folder.is_hidden = not bool(folder.is_hidden)
    db.commit()
    db.refresh(folder)
    return folder


def _delete_file_row(db: Session, file_row: KBFile):
    """Remove a file's DB row. The bytes live in the row, so nothing else to do."""
    db.delete(file_row)


def delete_folder(db: Session, folder_id: int):
    """Delete a folder, its subfolders, and all their files (recursively)."""
    folder = db.query(KBFolder).filter(KBFolder.id == folder_id).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")

    if _is_product_folder(db, folder):
        raise HTTPException(
            status_code=400,
            detail="This is a product folder (from the product list). You can hide it, but it can't be deleted here.",
        )

    def recurse(fid):
        for child in db.query(KBFolder).filter(KBFolder.parent_id == fid).all():
            recurse(child.id)
        for fl in db.query(KBFile).filter(KBFile.folder_id == fid).all():
            _delete_file_row(db, fl)
        db.delete(db.query(KBFolder).filter(KBFolder.id == fid).first())

    recurse(folder_id)
    db.commit()
    return True


# ---------------- FILE WRITES ---------------- #

async def save_file(db: Session, folder_id: int, upload: UploadFile, uploaded_by: str):
    folder = db.query(KBFolder).filter(KBFolder.id == folder_id).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")

    ext = Path(upload.filename or "").suffix.lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(
            status_code=400,
            detail=f"File type {ext or '(unknown)'} not allowed. Upload an image, video, or PDF.",
        )

    # Read the whole file into memory and store it in the database.
    try:
        contents = await upload.read()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading file: {e}")
    finally:
        await upload.close()

    size_bytes = len(contents)

    # Server-side size guard. The frontend checks too, but never trust the client.
    if size_bytes > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f'"{upload.filename}" is too large. Maximum allowed size is {MAX_FILE_SIZE_MB} MB.',
        )

    row = KBFile(
        folder_id=folder_id,
        original_name=upload.filename,
        stored_name=None,
        content_type=upload.content_type,
        data=contents,
        kind=kind_from_ext(ext),
        size_bytes=size_bytes,
        uploaded_by=uploaded_by,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def get_file(db: Session, file_id: int):
    row = db.query(KBFile).filter(KBFile.id == file_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="File not found")
    return row


def build_folder_zip(db: Session, folder_id: int, is_admin: bool):
    """Zip a folder and its entire subtree into memory -> (folder_name, BytesIO).
    Non-admins don't get hidden subfolders and can't download a hidden folder."""
    folder = db.query(KBFolder).filter(KBFolder.id == folder_id).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    if folder.is_hidden and not is_admin:
        raise HTTPException(status_code=404, detail="Folder not found")

    total_rows = 0   # files we expected to add
    written = 0      # files whose bytes were actually found on disk
    missing = []

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        def recurse(fid, rel):
            nonlocal total_rows, written
            for fl in db.query(KBFile).filter(KBFile.folder_id == fid).all():
                total_rows += 1
                # ZIP entries MUST use forward slashes, even on Windows.
                arcname = f"{rel}/{fl.original_name}"
                if fl.data is not None:
                    zf.writestr(arcname, fl.data)
                    written += 1
                else:
                    missing.append(fl.original_name)

            subq = db.query(KBFolder).filter(KBFolder.parent_id == fid)
            if not is_admin:
                subq = subq.filter(KBFolder.is_hidden == False)  # noqa: E712
            for sub in subq.all():
                recurse(sub.id, f"{rel}/{sub.name}")

        recurse(folder.id, folder.name)

    if missing:
        print(f"⚠️ Knowledge Book ZIP for '{folder.name}': "
              f"{written}/{total_rows} files written, {len(missing)} had no data.")

    if written == 0:
        if total_rows == 0:
            raise HTTPException(status_code=404, detail="This folder has no files to download.")
        raise HTTPException(status_code=404, detail="The file records exist but their data is empty.")

    buffer.seek(0)
    return folder.name, buffer


def delete_file(db: Session, file_id: int):
    row = db.query(KBFile).filter(KBFile.id == file_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="File not found")
    _delete_file_row(db, row)
    db.commit()
    return True


# ---------------- PRODUCT SYNC ---------------- #

def sync_product_folders(db: Session):
    """Ensure a top-level folder exists for every product in `campaign_services`.

    Connects the Knowledge Book's top level to the real product/service list used
    across the app. ONLY ADDS folders that are missing; it never renames or deletes
    existing ones, so uploaded files are never lost when a product is renamed or
    removed in the system. The Master Admin can still create extra top-level folders
    by hand; those simply aren't tied to a product.
    """
    try:
        from app.models.campaign_model import CampaignService
        products = db.query(CampaignService).order_by(CampaignService.name).all()
        if not products:
            return

        existing = {
            (f.name or "").strip().lower()
            for f in db.query(KBFolder).filter(KBFolder.parent_id.is_(None)).all()
        }

        added = 0
        for p in products:
            name = (p.name or "").strip()
            if not name or name.lower() in existing:
                continue
            db.add(KBFolder(name=name, parent_id=None, is_hidden=False, created_by="system"))
            existing.add(name.lower())
            added += 1

        if added:
            db.commit()
            print(f"✅ Knowledge Book: added {added} product folder(s) from campaign_services")
    except Exception as e:
        db.rollback()
        print(f"❌ Knowledge Book product sync error: {e}")