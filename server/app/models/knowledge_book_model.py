from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey, UniqueConstraint, LargeBinary
from sqlalchemy.sql import func
from app.database import Base
from app.time_utils import now_ist


class KBCategory(Base):
    """Master category list (Leaflet, PDF, Image, Video, Script, ...).

    Managed by the Master Admin from the top of the Knowledge Book. Used as the
    dropdown when uploading/editing a file, and as the file filter in the toolbar.
    """
    __tablename__ = "kb_categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False, unique=True)
    created_by = Column(String(50), nullable=True)
    created_at = Column(DateTime(timezone=True), default=now_ist)


class KBFolder(Base):
    """A folder in the Knowledge Book.

    Top-level folders (parent_id = NULL) are rendered as tabs. "Sales" and
    "Service" are seeded with is_system = True and cannot be renamed/deleted/hidden.
    Any folder can contain subfolders, giving unlimited nesting.
    """
    __tablename__ = "kb_folders"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    description = Column(String(1000), nullable=True)            # NEW
    parent_id = Column(Integer, ForeignKey("kb_folders.id"), nullable=True, index=True)
    is_hidden = Column(Boolean, default=False, nullable=False)
    is_system = Column(Boolean, default=False, nullable=False)   # NEW: Sales / Service
    created_by = Column(String(50), nullable=True)
    created_at = Column(DateTime(timezone=True), default=now_ist)
    updated_at = Column(DateTime(timezone=True), onupdate=now_ist)

    __table_args__ = (
        UniqueConstraint("parent_id", "name", name="uq_kb_folder_parent_name"),
    )


class KBFile(Base):
    """A file uploaded into a Knowledge Book folder. Bytes live in `data`."""
    __tablename__ = "kb_files"

    id = Column(Integer, primary_key=True, index=True)
    folder_id = Column(Integer, ForeignKey("kb_folders.id"), nullable=False, index=True)
    original_name = Column(String(300), nullable=False)
    stored_name = Column(String(300), nullable=True)            # legacy, unused
    content_type = Column(String(150), nullable=True)
    data = Column(LargeBinary, nullable=True)                  # the file bytes
    kind = Column(String(20), nullable=False, default="other")  # image|video|pdf|other
    description = Column(String(1000), nullable=True)           # NEW
    category_id = Column(Integer, ForeignKey("kb_categories.id"), nullable=True, index=True)  # NEW
    is_hidden = Column(Boolean, default=False, nullable=False)  # NEW
    size_bytes = Column(Integer, nullable=True)
    uploaded_by = Column(String(50), nullable=True)
    created_at = Column(DateTime(timezone=True), default=now_ist)