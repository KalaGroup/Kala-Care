from sqlalchemy import Column, Integer, String, DateTime, UniqueConstraint
from sqlalchemy.sql import func
from app.database import Base


class VoucherCounter(Base):
    __tablename__ = "voucher_counters"

    id = Column(Integer, primary_key=True, index=True)
    financial_year = Column(String(10), nullable=False)   # "26-27"
    module = Column(String(20), nullable=False)           # "TADA"
    branch_code = Column(String(50), nullable=False)      # "420435_1"
    last_sequence = Column(Integer, nullable=False, default=0)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint('financial_year', 'module', 'branch_code',
                         name='uq_voucher_fy_module_branch'),
    )