from sqlalchemy import Column, Integer, String, DateTime, LargeBinary
from sqlalchemy.sql import func
from app.database import Base
from app.time_utils import now_ist

class Banner(Base):
    __tablename__ = "banners"

    id = Column(Integer, primary_key=True, index=True)
    position = Column(Integer, unique=True, nullable=False)  # 1, 2, or 3
    image_data = Column(LargeBinary, nullable=False)  # image bytes -> VARBINARY(MAX) on SQL Server
    content_type = Column(String(100), nullable=False, default="image/jpeg")
    created_at = Column(DateTime(timezone=True), default=now_ist)
    updated_at = Column(DateTime(timezone=True), onupdate=now_ist)