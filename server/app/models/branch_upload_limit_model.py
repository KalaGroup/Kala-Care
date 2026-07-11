from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.sql import func
from app.database import Base
from app.time_utils import now_ist


class BranchUploadLimit(Base):
    """
    Per-branch upload day limits, set by HO admin.
    One row per branch_code. Used by all three tabs (TADA, Office Expense, LVB).
    """
    __tablename__ = "branch_upload_limits"

    id = Column(Integer, primary_key=True, index=True)
    branch_code = Column(String(50), unique=True, nullable=False, index=True)
    tada_days = Column(Integer, nullable=False, default=30)
    office_expense_days = Column(Integer, nullable=False, default=30)
    lvb_days = Column(Integer, nullable=False, default=30)
    updated_by = Column(String(100), nullable=True)
    updated_at = Column(DateTime(timezone=True), default=now_ist, onupdate=now_ist)
    created_at = Column(DateTime(timezone=True), default=now_ist)