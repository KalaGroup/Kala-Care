from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey, UniqueConstraint, LargeBinary
from sqlalchemy.sql import func
from app.database import Base


class KBFolder(Base):
    """A folder in the Knowledge Book.

    Top-level product folders have parent_id = NULL. Any folder can contain
    subfolders (parent_id -> kb_folders.id), giving unlimited nesting.
    """
    __tablename__ = "kb_folders"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    parent_id = Column(Integer, ForeignKey("kb_folders.id"), nullable=True, index=True)
    is_hidden = Column(Boolean, default=False, nullable=False)
    created_by = Column(String(50), nullable=True)   # master_admin user_id
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # No two folders with the same name under the same parent.
    # (SQL Server treats NULLs as equal in unique constraints, so this also
    #  blocks duplicate top-level product names.)
    __table_args__ = (
        UniqueConstraint("parent_id", "name", name="uq_kb_folder_parent_name"),
    )


class KBFile(Base):
    """A file uploaded into a Knowledge Book folder.

    The bytes live on disk under uploads/knowledge_book/. Only metadata is
    stored here.
    """
    __tablename__ = "kb_files"

    id = Column(Integer, primary_key=True, index=True)
    folder_id = Column(Integer, ForeignKey("kb_folders.id"), nullable=False, index=True)
    original_name = Column(String(300), nullable=False)   # name shown in the UI
    stored_name = Column(String(300), nullable=True)      # legacy, no longer used
    content_type = Column(String(150), nullable=True)     # e.g. image/png, video/mp4
    data = Column(LargeBinary, nullable=True)             # the file bytes (VARBINARY(MAX) on SQL Server)
    kind = Column(String(20), nullable=False, default="other")  # image|video|pdf|other
    size_bytes = Column(Integer, nullable=True)
    uploaded_by = Column(String(50), nullable=True)       # master_admin user_id
    created_at = Column(DateTime(timezone=True), server_default=func.now())