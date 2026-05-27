from sqlalchemy import Column, Integer, String, Text, DateTime
from sqlalchemy.sql import func
from app.database import Base


class TADABillWise(Base):
    """Table for Bill Wise Submission entries (Service Engineer + Branch Manager)"""
    __tablename__ = "tada_bill_wise"

    id = Column(Integer, primary_key=True, index=True)

    # ── Entry type discriminator: 'SE' (Service Engineer) | 'BM' (Branch Manager) ──
    entry_type = Column(String(10), nullable=False, default="SE")

    # ── Common bill line fields (both SE & BM) ──────────────────────────
    date = Column(String(50), nullable=False)
    expenses_head = Column(String(200), nullable=False)
    amount = Column(String(50), nullable=False)

    # ── Service Engineer header fields (denormalized onto each looped row) ──
    engineer_name = Column(String(200), nullable=True)        # SE name / employee name
    employee_id = Column(String(100), nullable=True)
    service_engineer_uid = Column(String(100), nullable=True)
    work_description = Column(Text, nullable=True)            # Work Description / Purpose
    service_request_no = Column(String(200), nullable=True)
    appointment_number = Column(String(200), nullable=True)
    account = Column(String(300), nullable=True)
    installation_site_address = Column(Text, nullable=True)
    sr_type = Column(String(200), nullable=True)
    task_status = Column(String(100), nullable=True)
    kms_travelled = Column(String(100), nullable=True)
    task_start_date = Column(String(100), nullable=True)
    task_end_date = Column(String(100), nullable=True)

    # SE-only per-bill field
    bill_submitted = Column(String(10), nullable=True)        # 'Yes' | 'No'

    # ── Branch Manager fields (denormalized onto each looped row) ──
    customer_name = Column(String(200), nullable=True)
    sr_invoice_engine_no = Column(String(200), nullable=True)
    work_status = Column(String(100), nullable=True)
    remark = Column(Text, nullable=True)
    voucher_no = Column(String(50), nullable=True, index=True)

    # ── HO verification field ──────────────────────────────────────────
    verification_status = Column(String(20), nullable=False, default="Pending")  # 'Pending' | 'Verified'

    # ── Metadata ──
    branch_code = Column(String(50), nullable=True)
    created_by = Column(String(100), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())