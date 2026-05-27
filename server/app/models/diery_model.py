from sqlalchemy import Column, Integer, String, DateTime, Text
from datetime import datetime
import pytz
from app.database import Base

IST = pytz.timezone("Asia/Kolkata")

def get_ist_now():
    """Returns current Indian Standard Time as naive datetime (for SQL Server)."""
    return datetime.now(IST).replace(tzinfo=None)


class Diery(Base):
    __tablename__ = "diery_entries"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)

    # Whose diary this entry belongs to
    user_id = Column(String(100), nullable=False, index=True)
    user_name = Column(String(255), nullable=False)

    # The actual thought / note content (paragraph format)
    content = Column(Text, nullable=False)

    # Optional title for the note
    title = Column(String(500), nullable=True)

    # IST timestamps
    created_at = Column(DateTime, default=get_ist_now, nullable=False)
    updated_at = Column(DateTime, default=get_ist_now, onupdate=get_ist_now, nullable=False)