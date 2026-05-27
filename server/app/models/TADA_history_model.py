from sqlalchemy import Column, Integer, String, Float, DateTime, Text, Boolean
from sqlalchemy.sql import func
from app.database import Base

class TADAHistory(Base):
    """Table for storing TADA verified data history"""
    __tablename__ = "tada_history"
    
    id = Column(Integer, primary_key=True, index=True)
    original_id = Column(Integer, nullable=False)  # Store original record ID
    appointment_number = Column(String(100), nullable=False, index=True)
    
    # File columns - all stored as strings to preserve original formatting
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
    
    # Verification Columns
    branch_verified_km = Column(String(50), nullable=True)
    km_verification_remark = Column(Text, nullable=True)
    two_way_km = Column(String(50), nullable=True)
    ho_corrected_km = Column(String(50), nullable=True)
    km_rate_applied = Column(String(50), nullable=True)
    da_amount = Column(String(50), nullable=True)
    freight_charges = Column(String(50), nullable=True)
    total_amount = Column(String(50), nullable=True)
    ho_remark = Column(Text, nullable=True)
    verification_status = Column(String(50), nullable=True)
    
    employee_id = Column(String(100), nullable=True)  # Looked up from BranchEmployee by service_engineer_uid

    # Metadata
    branch_code = Column(String(50), nullable=True)
    uploaded_by = Column(String(100), nullable=True)
    uploaded_at = Column(DateTime(timezone=True), server_default=func.now())
    file_name = Column(String(500), nullable=True)
    voucher_no = Column(String(50), nullable=True, index=True)
    
    # History specific fields
    moved_by = Column(String(100), nullable=True)  # Who moved the record
    moved_at = Column(DateTime(timezone=True), server_default=func.now())  # When it was moved
    moved_from_branch = Column(String(50), nullable=True)  # Original branch
    submitted_by_name = Column(String(200), nullable=True)  # Name of user who submitted
    submitted_by_uid = Column(String(100), nullable=True)   # UID/ID of user who submitted
    paid_date = Column(String(50), nullable=True)