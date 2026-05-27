from sqlalchemy import Column, Integer, String, Text, DateTime
from sqlalchemy.sql import func
from app.database import Base


class SalesBMTemp(Base):
    """Temp/draft table for Sales & BM TADA entries (merged Sales + KM Wise)"""
    __tablename__ = "sales_bm_temp"

    id = Column(Integer, primary_key=True, index=True)

    # Core fields
    date = Column(String(50), nullable=False)
    sr_invoice_engine_no = Column(String(200), nullable=True)
    customer_name = Column(String(200), nullable=False)
    location = Column(Text, nullable=True)
    one_way_km = Column(String(50), nullable=False)
    two_way_km = Column(String(50), nullable=False)   # auto-calculated = one_way_km * 2
    amount = Column(String(50), nullable=False)       # KM amount (km * rate)
    da = Column(String(50), nullable=True)
    total_amount = Column(String(50), nullable=False) # amount + da
    work_description = Column(String(200), nullable=False)  # dropdown
    remark = Column(Text, nullable=True)

    # Engineer info
    engineer_name = Column(String(200), nullable=False)
    engineer_uid = Column(String(100), nullable=True)
    employee_id = Column(String(100), nullable=True)
    labour_sale_expected = Column(String(50), nullable=True)
    part_sale_expected = Column(String(50), nullable=True)

    # Rate info (stored for reference)
    rate = Column(String(50), nullable=True)

    # Metadata
    branch_code = Column(String(50), nullable=True)
    created_by = Column(String(100), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())