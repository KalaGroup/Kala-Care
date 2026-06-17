from sqlalchemy import Column, String, DateTime, Text, Integer, Boolean, JSON
from app.database import Base
import datetime


class LetterSendRecord(Base):
    __tablename__ = "letter_send_records"

    id = Column(Integer, primary_key=True, index=True)

    ref_no = Column(String(100), nullable=False, index=True)      # e.g. KC/2026-27/01
    financial_year = Column(String(20), nullable=True)            # e.g. 2026-27
    sequence_number = Column(Integer, nullable=True)              # per instance per FY

    instance_id = Column(String(100), nullable=True, index=True)
    customer_id = Column(Integer, nullable=True, index=True)

    format_type_id = Column(Integer, nullable=True)
    format_type_name = Column(String(255), nullable=True)

    subject = Column(Text, nullable=True)
    letter_body = Column(Text, nullable=True)
    letter_html = Column(Text, nullable=True)        # full rendered HTML (for PDF view / re-send)
    letter_fields = Column(JSON, default={})         # structured fields, so a draft can be reopened
    attachments = Column(JSON, default=[])           # [{name, content(base64), type}] for reopen/email

    channels = Column(JSON, default=[])           # ["email", "whatsapp"]
    sent_email = Column(Boolean, default=False)
    sent_whatsapp = Column(Boolean, default=False)
    email_to = Column(String(255), nullable=True)
    whatsapp_to = Column(String(100), nullable=True)

    status = Column(String(50), default="sent")   # sent / partial / failed / draft
    error_message = Column(Text, nullable=True)

    sent_by_id = Column(String(100), nullable=True)
    sent_by_name = Column(String(255), nullable=True)

    created_at = Column(DateTime, default=datetime.datetime.utcnow)