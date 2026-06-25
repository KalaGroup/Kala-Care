import io
import zipfile
from pathlib import Path
from fastapi import UploadFile, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.knowledge_book_model import KBFolder, KBFile, KBCategory

# ---------------- CONFIG ---------------- #
MAX_FILE_SIZE_MB = 25
MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024

# The two fixed top-level sections. Seeded automatically; cannot be removed.
SYSTEM_FOLDERS = ["Sales", "Service"]
_SYSTEM_LOWER = {s.lower() for s in SYSTEM_FOLDERS}

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


# ---------------- SYSTEM / READ HELPERS ---------------- #

def ensure_system_folders(db: Session):
    """Seed Sales and Service ONCE, only when no top-level folders exist yet.
    After that the admin fully owns them (rename/hide/delete all allowed); we don't
    silently recreate a deleted folder unless the entire top level is empty again."""
    try:
        has_top = db.query(KBFolder.id).filter(KBFolder.parent_id.is_(None)).first()
        if has_top:
            return
        for nm in SYSTEM_FOLDERS:
            db.add(KBFolder(name=nm, parent_id=None, is_hidden=False,
                            is_system=True, created_by="system"))
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"❌ Knowledge Book ensure_system_folders error: {e}")


def _is_system_folder(db: Session, folder) -> bool:
    if folder is None or folder.parent_id is not None:
        return False
    return bool(folder.is_system) or (folder.name or "").strip().lower() in _SYSTEM_LOWER


def _counts(db: Session, folder_id: int):
    fcount = db.query(func.count(KBFolder.id)).filter(KBFolder.parent_id == folder_id).scalar() or 0
    flcount = db.query(func.count(KBFile.id)).filter(KBFile.folder_id == folder_id).scalar() or 0
    return int(fcount), int(flcount)


def _has_visible_content(db: Session, folder_id: int) -> bool:
    """True if this folder (or a non-hidden subfolder) holds a non-hidden file."""
    if db.query(KBFile.id).filter(
        KBFile.folder_id == folder_id, KBFile.is_hidden == False  # noqa: E712
    ).first() is not None:
        return True
    subs = db.query(KBFolder).filter(
        KBFolder.parent_id == folder_id, KBFolder.is_hidden == False  # noqa: E712
    ).all()
    return any(_has_visible_content(db, s.id) for s in subs)


def _visible_counts(db: Session, folder_id: int):
    fl = db.query(func.count(KBFile.id)).filter(
        KBFile.folder_id == folder_id, KBFile.is_hidden == False  # noqa: E712
    ).scalar() or 0
    subs = db.query(KBFolder).filter(
        KBFolder.parent_id == folder_id, KBFolder.is_hidden == False  # noqa: E712
    ).all()
    f = sum(1 for s in subs if _has_visible_content(db, s.id))
    return int(f), int(fl)


def _category_map(db: Session):
    return {c.id: c.name for c in db.query(KBCategory).all()}


def list_contents(db: Session, parent_id, is_admin: bool):
    """List subfolders + files inside a folder (parent_id None = top level/tabs)."""
    if parent_id is None:
        ensure_system_folders(db)

    fq = db.query(KBFolder).filter(KBFolder.parent_id == parent_id)
    if not is_admin:
        fq = fq.filter(KBFolder.is_hidden == False)  # noqa: E712
    # System sections first, then alphabetical.
    folders = fq.order_by(KBFolder.is_system.desc(), KBFolder.name).all()

    if not is_admin:
        folders = [f for f in folders if _has_visible_content(db, f.id)]

    if parent_id is not None:
        flq = db.query(KBFile).filter(KBFile.folder_id == parent_id)
        if not is_admin:
            flq = flq.filter(KBFile.is_hidden == False)  # noqa: E712
        files = flq.order_by(KBFile.original_name).all()
    else:
        files = []

    cat_map = _category_map(db)

    folder_dtos = []
    for f in folders:
        sub_f, sub_fl = _counts(db, f.id) if is_admin else _visible_counts(db, f.id)
        _fdate = f.updated_at or f.created_at
        folder_dtos.append({
            "id": f.id,
            "name": f.name,
            "description": f.description,
            "is_hidden": bool(f.is_hidden),
            "is_system": _is_system_folder(db, f),
            "folder_count": sub_f,
            "file_count": sub_fl,
            "modified_at": _fdate.isoformat() if _fdate else None,
        })

    file_dtos = [{
        "id": fl.id,
        "name": fl.original_name,
        "kind": fl.kind,
        "description": fl.description,
        "category_id": fl.category_id,
        "category": cat_map.get(fl.category_id),
        "is_hidden": bool(fl.is_hidden),
        "size_bytes": fl.size_bytes,
        "url": f"/api/knowledge-book/files/{fl.id}/view",
        "modified_at": fl.created_at.isoformat() if fl.created_at else None,
    } for fl in files]

    return folder_dtos, file_dtos

def list_all_files(db: Session, is_admin: bool, category_id=None):
    """Flat list of every categorised file across all folders (for the All Files tab).
    Non-admins only get non-hidden files living entirely inside non-hidden folders."""
    q = db.query(KBFile)
    if category_id:
        q = q.filter(KBFile.category_id == category_id)
    else:
        q = q.filter(KBFile.category_id.isnot(None))
    files = q.order_by(KBFile.original_name).all()

    folders = {f.id: f for f in db.query(KBFolder).all()}
    cat_map = {c.id: c.name for c in db.query(KBCategory).all()}

    def reachable(fl):
        if fl.is_hidden:
            return False
        fid = fl.folder_id
        while fid is not None:
            fo = folders.get(fid)
            if fo is None or fo.is_hidden:
                return False
            fid = fo.parent_id
        return True

    def path_of(fid):
        names = []
        while fid is not None:
            fo = folders.get(fid)
            if fo is None:
                break
            names.insert(0, fo.name)
            fid = fo.parent_id
        return " / ".join(names)

    out = []
    for fl in files:
        if not is_admin and not reachable(fl):
            continue
        out.append({
            "id": fl.id,
            "name": fl.original_name,
            "kind": fl.kind,
            "description": fl.description,
            "category_id": fl.category_id,
            "category": cat_map.get(fl.category_id),
            "is_hidden": bool(fl.is_hidden),
            "size_bytes": fl.size_bytes,
            "folder_id": fl.folder_id,
            "folder_path": path_of(fl.folder_id),
            "url": f"/api/knowledge-book/files/{fl.id}/view",
            "modified_at": fl.created_at.isoformat() if fl.created_at else None,
        })
    return out

def get_breadcrumb(db: Session, folder_id):
    trail = []
    current = db.query(KBFolder).filter(KBFolder.id == folder_id).first() if folder_id else None
    while current is not None:
        trail.insert(0, {"id": current.id, "name": current.name})
        current = (db.query(KBFolder).filter(KBFolder.id == current.parent_id).first()
                   if current.parent_id else None)
    return trail


# ---------------- FOLDER WRITES ---------------- #

def _name_exists(db: Session, parent_id, name: str, except_id=None) -> bool:
    q = db.query(KBFolder.id).filter(
        KBFolder.parent_id == parent_id,
        func.lower(KBFolder.name) == name.strip().lower(),
    )
    if except_id is not None:
        q = q.filter(KBFolder.id != except_id)
    return q.first() is not None


def create_folder(db: Session, name: str, parent_id, created_by: str, description: str = None):
    name = (name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Folder name is required")

    if parent_id is not None:
        parent = db.query(KBFolder).filter(KBFolder.id == parent_id).first()
        if not parent:
            raise HTTPException(status_code=404, detail="Parent folder not found")

    if _name_exists(db, parent_id, name):
        raise HTTPException(status_code=409, detail="A folder with this name already exists here")

    folder = KBFolder(
        name=name,
        description=(description or "").strip() or None,
        parent_id=parent_id,
        is_hidden=False,
        created_by=created_by,
    )
    db.add(folder)
    db.commit()
    db.refresh(folder)
    return folder


def create_folders_for_products(db: Session, product_names, parent_id: int,
                                created_by: str, description: str = None):
    """Create one subfolder per selected product under the chosen section."""
    parent = db.query(KBFolder).filter(KBFolder.id == parent_id).first()
    if not parent:
        raise HTTPException(status_code=404, detail="Section folder not found")

    desc = (description or "").strip() or None
    created = []
    for raw in product_names or []:
        name = (raw or "").strip()
        if not name or _name_exists(db, parent_id, name):
            continue  # skip blanks and duplicates silently
        folder = KBFolder(name=name, description=desc, parent_id=parent_id,
                          is_hidden=False, created_by=created_by)
        db.add(folder)
        created.append(folder)

    if not created:
        raise HTTPException(status_code=409, detail="Those folders already exist in this section")

    db.commit()
    for f in created:
        db.refresh(f)
    return created


def rename_folder(db: Session, folder_id: int, name: str, description=None):
    name = (name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Folder name is required")

    folder = db.query(KBFolder).filter(KBFolder.id == folder_id).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")

    if name.lower() != (folder.name or "").strip().lower() and _name_exists(db, folder.parent_id, name, except_id=folder_id):
        raise HTTPException(status_code=409, detail="A folder with this name already exists here")

    folder.name = name
    folder.description = (description or "").strip() or None
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
    db.delete(file_row)


def delete_folder(db: Session, folder_id: int):
    """Delete a folder, its subfolders, and all their files (recursively)."""
    folder = db.query(KBFolder).filter(KBFolder.id == folder_id).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")

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

async def save_file(db: Session, folder_id: int, upload: UploadFile, uploaded_by: str,
                    description: str = None, category_id: int = None):
    folder = db.query(KBFolder).filter(KBFolder.id == folder_id).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")

    ext = Path(upload.filename or "").suffix.lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(status_code=400,
                            detail=f"File type {ext or '(unknown)'} not allowed. Upload an image, video, or PDF.")

    if category_id is not None:
        if not db.query(KBCategory.id).filter(KBCategory.id == category_id).first():
            raise HTTPException(status_code=400, detail="Selected category does not exist")

    try:
        contents = await upload.read()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading file: {e}")
    finally:
        await upload.close()

    size_bytes = len(contents)
    if size_bytes > MAX_FILE_SIZE_BYTES:
        raise HTTPException(status_code=413,
                            detail=f'"{upload.filename}" is too large. Maximum allowed size is {MAX_FILE_SIZE_MB} MB.')

    row = KBFile(
        folder_id=folder_id,
        original_name=upload.filename,
        stored_name=None,
        content_type=upload.content_type,
        data=contents,
        kind=kind_from_ext(ext),
        description=(description or "").strip() or None,
        category_id=category_id,
        is_hidden=False,
        size_bytes=size_bytes,
        uploaded_by=uploaded_by,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_file(db: Session, file_id: int, name=None, description=None, category_id=None):
    row = db.query(KBFile).filter(KBFile.id == file_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="File not found")

    if name is not None:
        nm = name.strip()
        if not nm:
            raise HTTPException(status_code=400, detail="File name is required")
        row.original_name = nm
        suffix = Path(nm).suffix.lower()
        if suffix:
            row.kind = kind_from_ext(suffix)

    row.description = (description or "").strip() or None

    if category_id:
        if not db.query(KBCategory.id).filter(KBCategory.id == category_id).first():
            raise HTTPException(status_code=400, detail="Selected category does not exist")
        row.category_id = category_id
    else:
        row.category_id = None

    db.commit()
    db.refresh(row)
    return row


def toggle_hide_file(db: Session, file_id: int):
    row = db.query(KBFile).filter(KBFile.id == file_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="File not found")
    row.is_hidden = not bool(row.is_hidden)
    db.commit()
    db.refresh(row)
    return row


def get_file(db: Session, file_id: int):
    row = db.query(KBFile).filter(KBFile.id == file_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="File not found")
    return row


def build_folder_zip(db: Session, folder_id: int, is_admin: bool):
    folder = db.query(KBFolder).filter(KBFolder.id == folder_id).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    if folder.is_hidden and not is_admin:
        raise HTTPException(status_code=404, detail="Folder not found")

    total_rows = 0
    written = 0
    missing = []

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        def recurse(fid, rel):
            nonlocal total_rows, written
            flq = db.query(KBFile).filter(KBFile.folder_id == fid)
            if not is_admin:
                flq = flq.filter(KBFile.is_hidden == False)  # noqa: E712
            for fl in flq.all():
                total_rows += 1
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
        print(f"⚠️ Knowledge Book ZIP for '{folder.name}': {written}/{total_rows} files written, {len(missing)} had no data.")

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


# ---------------- CATEGORIES (master list) ---------------- #

def list_categories(db: Session):
    return [{"id": c.id, "name": c.name}
            for c in db.query(KBCategory).order_by(KBCategory.name).all()]


def _category_name_exists(db: Session, name: str, except_id=None) -> bool:
    q = db.query(KBCategory.id).filter(func.lower(KBCategory.name) == name.strip().lower())
    if except_id is not None:
        q = q.filter(KBCategory.id != except_id)
    return q.first() is not None


def create_category(db: Session, name: str, created_by: str):
    name = (name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Category name is required")
    if _category_name_exists(db, name):
        raise HTTPException(status_code=409, detail="That category already exists")
    row = KBCategory(name=name, created_by=created_by)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def rename_category(db: Session, category_id: int, name: str):
    name = (name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Category name is required")
    row = db.query(KBCategory).filter(KBCategory.id == category_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Category not found")
    if name.lower() != row.name.lower() and _category_name_exists(db, name, except_id=category_id):
        raise HTTPException(status_code=409, detail="That category already exists")
    row.name = name
    db.commit()
    db.refresh(row)
    return row


def delete_category(db: Session, category_id: int):
    row = db.query(KBCategory).filter(KBCategory.id == category_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Category not found")
    # Detach from files, then delete the category.
    db.query(KBFile).filter(KBFile.category_id == category_id).update(
        {KBFile.category_id: None}, synchronize_session=False
    )
    db.delete(row)
    db.commit()
    return True


# ---------------- PRODUCTS (for the dropdown) ---------------- #

def list_products(db: Session):
    """Distinct product names from campaign_services, for the product picker."""
    try:
        from app.models.campaign_model import CampaignService
        rows = db.query(CampaignService).order_by(CampaignService.name).all()
        seen, out = set(), []
        for p in rows:
            nm = (p.name or "").strip()
            if nm and nm.lower() not in seen:
                seen.add(nm.lower())
                out.append(nm)
        return out
    except Exception as e:
        print(f"❌ Knowledge Book list_products error: {e}")
        return []