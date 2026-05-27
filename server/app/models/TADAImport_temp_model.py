from sqlalchemy import Column, Integer, String, DateTime, Text, UniqueConstraint
from sqlalchemy.sql import func
from app.database import Base


class TADAImportTemp(Base):
    """Staging table for TADA imports.
    Records live here while the branch admin verifies KM / remarks.
    On Submit, rows are moved to TADAImport (main) and deleted from here.
    Schema mirrors TADAImport so the move is a straight copy.
    """
    __tablename__ = "tada_imports_temp"

    id = Column(Integer, primary_key=True, index=True)
    # NOT unique — same appointment can re-appear after a delete-and-reimport
    appointment_number = Column(String(100), nullable=False, index=True)

    sd_branch_name = Column(String(200), nullable=True)
    sd_branch_code = Column(String(100), nullable=True)
    installation_site_address = Column(Text, nullable=True)
    instance_id = Column(String(200), nullable=True)
    engine_application_code = Column(String(100), nullable=True)
    engine_serial_number = Column(String(100), nullable=True)
    account = Column(String(200), nullable=True)
    account_id = Column(String(100), nullable=True)
    service_request_no = Column(String(100), nullable=True)
    sr_type = Column(String(100), nullable=True)
    sr_sub_type = Column(String(100), nullable=True)
    sr_due_date = Column(String(50), nullable=True)
    task_start_date = Column(String(100), nullable=True)
    task_end_date = Column(String(100), nullable=True)
    task_status = Column(String(100), nullable=True)
    task_assigned_datetime = Column(String(100), nullable=True)
    task_assign_vs_trip_start = Column(String(100), nullable=True)
    sr_trip_start_datetime = Column(String(100), nullable=True)
    sr_reach_at_site_datetime = Column(String(100), nullable=True)
    sr_trip_start_lat_long = Column(String(200), nullable=True)
    sr_reach_at_site_lat_long = Column(String(200), nullable=True)
    kms_travelled = Column(String(50), nullable=True)
    sr_closed_date = Column(String(100), nullable=True)
    sr_status = Column(String(100), nullable=True)
    asset_primary_contact_no = Column(String(50), nullable=True)
    voc = Column(String(500), nullable=True)
    service_engineer_name = Column(String(200), nullable=True)
    service_engineer_uid = Column(String(100), nullable=True)
    customer_name = Column(String(200), nullable=True)
    customer_contact_number = Column(String(50), nullable=True)
    customer_remark = Column(Text, nullable=True)
    problem_summary = Column(Text, nullable=True)
    nature_of_failure = Column(Text, nullable=True)
    action_taken = Column(Text, nullable=True)
    engineer_remark = Column(Text, nullable=True)
    exception_remark = Column(Text, nullable=True)
    otp_remark = Column(Text, nullable=True)
    pdf_generated = Column(String(50), nullable=True)

    # Branch-side editable fields
    branch_verified_km = Column(String(50), nullable=True)
    km_verification_remark = Column(Text, nullable=True)
    freight_charges = Column(String(50), nullable=True)
    two_way_km = Column(String(50), nullable=True)
    km_rate_applied = Column(String(50), nullable=True)
    verification_status = Column(String(50), nullable=True, default='Pending')

    employee_id = Column(String(100), nullable=True)  # Looked up from BranchEmployee by service_engineer_uid

    # Metadata
    branch_code = Column(String(50), nullable=True)
    uploaded_by = Column(String(100), nullable=True)
    uploaded_at = Column(DateTime(timezone=True), server_default=func.now())
    file_name = Column(String(500), nullable=True)

    # Composite unique: appointment + task_start_date + service_engineer_name + branch_code
    __table_args__ = (
        UniqueConstraint(
            'appointment_number', 'task_start_date', 'service_engineer_name', 'branch_code',
            name='uq_tada_imports_temp_appt_taskstart_engineer_branch'
        ),
    )