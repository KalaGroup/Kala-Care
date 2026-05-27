from sqlalchemy import Column, Integer, String, Text, DateTime
from sqlalchemy.sql import func
from app.database import Base


class SalesBM(Base):
    """Main table — Sales & BM TADA rows submitted to HO."""
    __tablename__ = "sales_bm"

    id = Column(Integer, primary_key=True, index=True)
    temp_id = Column(Integer, nullable=True, index=True)

    date = Column(String(50), nullable=False)
    sr_invoice_engine_no = Column(String(200), nullable=True)
    customer_name = Column(String(200), nullable=False)
    location = Column(Text, nullable=True)
    one_way_km = Column(String(50), nullable=False)
    two_way_km = Column(String(50), nullable=False)
    amount = Column(String(50), nullable=False)
    da = Column(String(50), nullable=True)
    total_amount = Column(String(50), nullable=False)
    rate = Column(String(50), nullable=True)
    work_description = Column(String(200), nullable=False)
    remark = Column(Text, nullable=True)

    engineer_name = Column(String(200), nullable=False)
    engineer_uid = Column(String(100), nullable=True)
    employee_id = Column(String(100), nullable=True)
    labour_sale_expected = Column(String(50), nullable=True)
    part_sale_expected = Column(String(50), nullable=True)

    verification_status = Column(String(20), nullable=False, default="Pending")
    ho_corrected_km = Column(String(50), nullable=True)
    ho_remark = Column(Text, nullable=True)
    voucher_no = Column(String(50), nullable=True, index=True)

    branch_code = Column(String(50), nullable=True)
    created_by = Column(String(100), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=True)
    submitted_at = Column(DateTime(timezone=True), server_default=func.now())