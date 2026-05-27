from sqlalchemy import Column, String, DateTime, Text, Integer, ForeignKey, Boolean, Float, text
from sqlalchemy.orm import relationship
from app.database import Base


class FollowUp(Base):
    __tablename__ = "followups"
    
    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id"))
    customer_instance_id = Column(String(100), index=True, nullable=True)
    campaign_id = Column(Integer, ForeignKey("campaigns.id"), nullable=False)
    user_id = Column(String(100), nullable=False)
    user_name = Column(String(200), nullable=False)
    
    # Follow-up Details
    followup_date = Column(DateTime, nullable=False)
    followup_by = Column(String(50))  # call, message, email, visit
    followup_flag = Column(String(20))  # C1, C2, C3, C4, C5
    followup_remark = Column(Text)
    status = Column(String(50), default='pending')  # rescheduled, wip, completed, rejected
    next_followup_date = Column(DateTime, nullable=True)
    
    # Quotation Info
    quotation_sent = Column(Boolean, default=False)
    quotation_no = Column(String(100), nullable=True)
    quotation_value = Column(Float, nullable=True)
    
    # Activity and RR references
    activity_id = Column(Integer, ForeignKey("activities.id"), nullable=True)
    rr_id = Column(Integer, ForeignKey("rr.id"), nullable=True)
    
    # Relationships
    customer = relationship("Customer", back_populates="followups")
    campaign = relationship("Campaign")
    activity = relationship("Activity")
    rr = relationship("RR")
    
    # Timestamps (Stored in IST from SQL Server)
    created_at = Column(DateTime(timezone=True), server_default=text("GETDATE()"))
    updated_at = Column(
        DateTime(timezone=True),
        server_default=text("GETDATE()"),
        onupdate=text("GETDATE()")
    )


class Activity(Base):
    __tablename__ = "activities"
    
    id = Column(Integer, primary_key=True, index=True)
    content = Column(Text, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=text("GETDATE()"))
    updated_at = Column(
        DateTime(timezone=True),
        server_default=text("GETDATE()"),
        onupdate=text("GETDATE()")
    )


class RR(Base):
    __tablename__ = "rr"
    
    id = Column(Integer, primary_key=True, index=True)
    content = Column(Text, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=text("GETDATE()"))
    updated_at = Column(
        DateTime(timezone=True),
        server_default=text("GETDATE()"),
        onupdate=text("GETDATE()")
    )