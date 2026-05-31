from sqlalchemy import Column, Integer, String, DateTime, Date
from sqlalchemy.sql import func
from datetime import datetime, timezone, timedelta
from app.database import Base

# ---- Indian Standard Time helper (UTC+5:30), stored as naive IST ----
IST = timezone(timedelta(hours=5, minutes=30))

def now_ist():
    """Current time in IST as a naive datetime (no tzinfo)."""
    return datetime.now(IST).replace(tzinfo=None)


class LoginSession(Base):
    __tablename__ = "login_sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String(50), index=True, nullable=False)
    user_name = Column(String(100), nullable=True)
    branch = Column(String(20), nullable=True)
    login_time = Column(DateTime, nullable=False)        # IST
    logout_time = Column(DateTime, nullable=True)        # IST, null until logout
    duration_seconds = Column(Integer, nullable=True)
    logout_type = Column(String(20), nullable=True)      # 'manual' | 'auto' | 'close'
    session_date = Column(Date, index=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())