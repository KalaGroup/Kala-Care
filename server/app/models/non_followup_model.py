from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey, Boolean, Numeric
from sqlalchemy.sql import func
from app.database import Base

class NonFollowUp(Base):
    __tablename__ = "non_followups"

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=False)
    customer_instance_id = Column(String(255), nullable=True)
    campaign_id = Column(Integer, ForeignKey("campaigns.id"), nullable=True)  # NULL for "Other" type
    user_id = Column(String(100), nullable=False)
    user_name = Column(String(255), nullable=True)
    
    # Follow-up details
    followup_date = Column(DateTime, nullable=False, server_default=func.now())
    followup_by = Column(String(50), nullable=False)
    followup_remark = Column(Text, nullable=True)
    status = Column(String(50), nullable=False)
    remark_type = Column(String(50), nullable=False, default="other")
    service = Column(String(255), nullable=True)
    
    # Flag and next follow-up
    followup_flag = Column(String(10), nullable=True)
    next_followup_date = Column(DateTime, nullable=True)
    
    # Quotation fields
    quotation_sent = Column(Boolean, default=False)
    quotation_no = Column(String(255), nullable=True)
    quotation_value = Column(Numeric(15, 2), nullable=True)
    
    # Activity and RR references
    activity_id = Column(Integer, ForeignKey("activities.id"), nullable=True)
    rr_id = Column(Integer, ForeignKey("rr.id"), nullable=True)
    
    # Timestamps
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())
    
    def to_dict(self):
        return {
            "id": self.id,
            "customer_id": self.customer_id,
            "customer_instance_id": self.customer_instance_id,
            "campaign_id": self.campaign_id,  # Will be None for "Other" type
            "user_id": self.user_id,
            "user_name": self.user_name,
            "followup_date": self.followup_date,
            "followup_by": self.followup_by,
            "followup_remark": self.followup_remark,
            "status": self.status,
            "remark_type": self.remark_type,
            "followup_flag": self.followup_flag,
            "next_followup_date": self.next_followup_date,
            "quotation_sent": self.quotation_sent,
            "quotation_no": self.quotation_no,
            "quotation_value": float(self.quotation_value) if self.quotation_value else None,
            "activity_id": self.activity_id,
            "rr_id": self.rr_id,
            "created_at": self.created_at,
            "updated_at": self.updated_at
        }