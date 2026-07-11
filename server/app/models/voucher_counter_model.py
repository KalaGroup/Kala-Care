from sqlalchemy import Column, Integer, String, DateTime, UniqueConstraint
from sqlalchemy.sql import func
from app.database import Base
from app.time_utils import now_ist


class VoucherCounter(Base):
    __tablename__ = "voucher_counters"

    id = Column(Integer, primary_key=True, index=True)
    financial_year = Column(String(10), nullable=False)   # "26-27"
    module = Column(String(20), nullable=False)           # "TADA"
    branch_code = Column(String(50), nullable=False)      # "420435_1"
    last_sequence = Column(Integer, nullable=False, default=0)
    updated_at = Column(DateTime(timezone=True), default=now_ist, onupdate=now_ist)

    __table_args__ = (
        UniqueConstraint('financial_year', 'module', 'branch_code',
                         name='uq_voucher_fy_module_branch'),
    )