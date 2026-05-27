from sqlalchemy import Column, Integer, String, Text, DateTime, Date
from sqlalchemy.sql import func
from app.database import Base


class TADABillWiseHistory(Base):
    """History table for verified & submitted TADA Bill Wise entries"""
    __tablename__ = "tada_bill_wise_history"

    id = Column(Integer, primary_key=True, index=True)
    original_id = Column(Integer, nullable=True, index=True)

    # Entry type
    entry_type = Column(String(10), nullable=False, default="SE")

    # Common bill line fields
    date = Column(String(50), nullable=False)
    expenses_head = Column(String(200), nullable=False)
    amount = Column(String(50), nullable=False)

    # Service Engineer header fields
    engineer_name = Column(String(200), nullable=True)
    employee_id = Column(String(100), nullable=True)
    service_engineer_uid = Column(String(100), nullable=True)
    work_description = Column(Text, nullable=True)
    service_request_no = Column(String(200), nullable=True)
    appointment_number = Column(String(200), nullable=True)
    account = Column(String(300), nullable=True)
    installation_site_address = Column(Text, nullable=True)
    sr_type = Column(String(200), nullable=True)
    task_status = Column(String(100), nullable=True)
    kms_travelled = Column(String(100), nullable=True)
    task_start_date = Column(String(100), nullable=True)
    task_end_date = Column(String(100), nullable=True)
    bill_submitted = Column(String(10), nullable=True)

    # Branch Manager fields
    customer_name = Column(String(200), nullable=True)
    sr_invoice_engine_no = Column(String(200), nullable=True)
    work_status = Column(String(100), nullable=True)
    remark = Column(Text, nullable=True)

    # Verification snapshot
    verification_status = Column(String(20), nullable=False, default="Verified")

    # Original metadata
    branch_code = Column(String(50), nullable=True)
    created_by = Column(String(100), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=True)
    voucher_no = Column(String(50), nullable=True, index=True)

    # Submission metadata
    submitted_by_name = Column(String(100), nullable=True)
    submitted_by_uid = Column(String(50), nullable=True)
    moved_at = Column(DateTime(timezone=True), server_default=func.now())
    paid_date = Column(Date, nullable=True)