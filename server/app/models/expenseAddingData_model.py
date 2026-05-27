from sqlalchemy import Column, Integer, String, Float, DateTime, Text, Boolean
from sqlalchemy.sql import func
from app.database import Base

class BranchKMRate(Base):
    """Table 1: Store KM rates for each branch (TADA Tab)"""
    __tablename__ = "branch_km_rates"
    
    id = Column(Integer, primary_key=True, index=True)
    branch_code = Column(String(50), nullable=False, unique=True, index=True)
    branch_name = Column(String(200), nullable=False)
    km_rate = Column(Float, default=0.0)
    
    # DA fields
    range_start_km = Column(Float, nullable=True)  # Start of range (e.g., 0)
    range_end_km = Column(Float, nullable=True)    # End of range (e.g., 100)
    range_amount = Column(Float, default=0.0)      # Amount for the range
    
    above_km = Column(Float, nullable=True)        # Threshold for above (e.g., 100)
    above_amount = Column(Float, default=0.0)      # Amount for above threshold
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    created_by = Column(String(100), nullable=True)
    updated_by = Column(String(100), nullable=True)


class ExpenseHead(Base):
    """Table 2: Store expense heads and subheads (Office Expense Tab)"""
    __tablename__ = "expense_heads"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    subheads = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    created_by = Column(String(100), nullable=True)
    updated_by = Column(String(100), nullable=True)

class BranchEmployee(Base):
    """Table 3: Store branch employees"""
    __tablename__ = "branch_employees"
    
    id = Column(Integer, primary_key=True, index=True)
    employee_name = Column(String(200), nullable=False)
    employee_id = Column(String(100), nullable=False, unique=True, index=True)
    employee_uid = Column(String(100), nullable=True)
    branch_code = Column(String(50), nullable=False, index=True)
    branch_name = Column(String(200), nullable=False)
    designation = Column(String(200), nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    created_by = Column(String(100), nullable=True)
    updated_by = Column(String(100), nullable=True)        