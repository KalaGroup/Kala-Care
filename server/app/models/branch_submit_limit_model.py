from sqlalchemy import Column, Integer, String, JSON, DateTime
from sqlalchemy.sql import func
from app.database import Base

class BranchSubmitLimit(Base):
    __tablename__ = "branch_submit_limits"

    id = Column(Integer, primary_key=True, index=True)
    branch_code = Column(String(50), unique=True, nullable=False, index=True)
    # rule_type: 'weekdays' or 'month_dates'
    rule_type = Column(String(20), nullable=False, default='month_dates')
    # For 'weekdays': list of ints 0-6 (Mon=1, Tue=2, ... Sun=0). Stored as JSON.
    # For 'month_dates': list of ints 1-31. Stored as JSON.
    allowed_values = Column(JSON, nullable=False, default=list)
    updated_by = Column(String(100), nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())