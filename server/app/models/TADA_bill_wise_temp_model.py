from sqlalchemy import Column, Integer, String, Text, DateTime
from sqlalchemy.sql import func
from app.database import Base


class TADABillWiseTemp(Base):
    """Draft table for Bill Wise entries (before Submit to HO)"""
    __tablename__ = "tada_bill_wise_temp"

    id = Column(Integer, primary_key=True, index=True)
    entry_type = Column(String(10), nullable=False, default="SE")

    date = Column(String(50), nullable=False)
    expenses_head = Column(String(200), nullable=False)
    amount = Column(String(50), nullable=False)
    bill_submitted = Column(String(10), nullable=True)

    # SE header
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

    # BM header
    customer_name = Column(String(200), nullable=True)
    sr_invoice_engine_no = Column(String(200), nullable=True)
    work_status = Column(String(100), nullable=True)
    remark = Column(Text, nullable=True)

    verification_status = Column(String(20), nullable=False, default="Pending")
    branch_code = Column(String(50), nullable=True)
    created_by = Column(String(100), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())