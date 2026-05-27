from sqlalchemy import Column, Integer, String, DateTime, Boolean, text
from sqlalchemy.sql import func
from app.database import Base

class CustomerEditHistory(Base):
    __tablename__ = "customer_edit_history"

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, index=True, nullable=False)
    instance_id = Column(String(100), index=True)
    
    # Original data (from customer table - never changes)
    original_customer_name = Column(String(500), nullable=True)
    original_phone_number = Column(String(50), nullable=True)
    original_email = Column(String(500), nullable=True)
    original_pan_number = Column(String(50), nullable=True)
    original_location = Column(String(1000), nullable=True)
    
    # Edited data (overwritten on each edit)
    edited_customer_name = Column(String(500), nullable=True)
    edited_phone_number = Column(String(50), nullable=True)
    edited_email = Column(String(500), nullable=True)
    edited_pan_number = Column(String(50), nullable=True)
    edited_location = Column(String(1000), nullable=True)
    
    # User who made the last edit
    user_id = Column(String(50), nullable=False)
    user_name = Column(String(100), nullable=False)
    
    # Flag to indicate if this is the first edit or subsequent edit
    is_original_preserved = Column(Boolean, default=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=text("GETDATE()"))

    last_edited_at = Column(
        DateTime(timezone=True),
        server_default=text("GETDATE()"),
        onupdate=text("GETDATE()")
    )
    edit_count = Column(Integer, default=1)
    
    def __repr__(self):
        return f"<CustomerEditHistory {self.id}: Customer {self.customer_id}>"