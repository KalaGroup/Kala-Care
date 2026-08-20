from sqlalchemy import (
    Column, Integer, String, DateTime, Text, Index, LargeBinary,
)
from app.database import Base
from app.time_utils import now_ist


class WelcomeLetterEntry(Base):
    """One row per UNIQUE instance_id whose Open SR has SR Sub-Type = 'CC'
    (Commissioning). Rows are upserted by sync_from_open_sr() right after every
    'Open SR Load Report' import — new CC instances are added, SR fields of
    existing rows are refreshed, and rows are NEVER deleted (a sent letter must
    survive the Open SR snapshot semantics that delete closed SRs).

    The recipient email is NOT stored here — it is read live from the
    customers table at preview/send time (per requirement)."""
    __tablename__ = "welcome_letter_entries"

    id = Column(Integer, primary_key=True, index=True)
    instance_id = Column(String(100), unique=True, index=True, nullable=False)

    # Snapshot of the CC row from the Open SR file (field list per requirement)
    service_request_no = Column(String(200), nullable=True, index=True)
    sr_created_date = Column(DateTime, nullable=True)
    sr_status = Column(String(100), nullable=True)
    installation_site_address = Column(Text, nullable=True)
    account = Column(String(500), nullable=True)
    engine_app_code = Column(String(200), nullable=True)
    engine_serial_no = Column(String(200), nullable=True)
    segment = Column(String(200), nullable=True)
    engine_series = Column(String(200), nullable=True)
    engine_model = Column(String(200), nullable=True)
    sr_type = Column(String(200), nullable=True)
    sr_sub_type = Column(String(200), nullable=True)
    customer_mobile_no = Column(String(50), nullable=True)

    # Resolved from the customers table at sync time (drives the branch filter)
    branch_id = Column(String(100), nullable=True, index=True)

    # Letter tracking
    letter_status = Column(String(20), nullable=False, default="PENDING", index=True)  # PENDING | SENT
    ref_no = Column(String(120), nullable=True)
    sent_by = Column(String(50), nullable=True)        # users.user_id
    sent_by_name = Column(String(120), nullable=True)
    sent_to_email = Column(String(500), nullable=True)
    sent_at = Column(DateTime, nullable=True)
    # How many master attachments the sender ticked for THIS letter (the
    # selection is per letter now, so the report cannot recompute it).
    attachments_sent = Column(Integer, nullable=True)

    created_at = Column(DateTime, default=now_ist)
    updated_at = Column(DateTime, default=now_ist, onupdate=now_ist)

    __table_args__ = (
        Index("ix_wl_entries_status_branch", "letter_status", "branch_id"),
    )


class WelcomeLetterMaster(Base):
    """Singleton row holding the welcome letter text (Master Setup)."""
    __tablename__ = "welcome_letter_master"

    id = Column(Integer, primary_key=True, index=True)
    letter_text = Column(Text, nullable=True)
    updated_by = Column(String(50), nullable=True)
    updated_at = Column(DateTime, default=now_ist, onupdate=now_ist)


class WelcomeLetterAttachment(Base):
    """Master attachment library (Master Setup → Default Attachments). Every
    file here is offered on the letter preview and the sender ticks the ones
    that go out with that particular letter. The file itself lives IN the
    database (file_data), never on disk."""
    __tablename__ = "welcome_letter_attachments"

    id = Column(Integer, primary_key=True, index=True)
    file_name = Column(String(255), nullable=False)
    file_data = Column(LargeBinary, nullable=True)       # VARBINARY(MAX)
    content_type = Column(String(150), nullable=True)
    file_size = Column(Integer, nullable=True)
    stored_path = Column(String(500), nullable=True)     # legacy disk path
    uploaded_by = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=now_ist)
