from sqlalchemy import Column, Integer, String, Float, DateTime, Text, Boolean
from sqlalchemy.sql import func
from app.database import Base


class OfficeExpenseTemp(Base):
    __tablename__ = "office_expense_temp"

    id = Column(Integer, primary_key=True, index=True)
    paid_date = Column(DateTime, nullable=False)
    expenses_head = Column(String(100), nullable=False)
    sub_head = Column(String(100), nullable=True)
    expenses_description = Column(Text, nullable=True)
    description = Column(Text, nullable=True)
    internal_branch_name = Column(String(150), nullable=True)
    paid_to = Column(String(255), nullable=False)
    invoice_no = Column(String(100), nullable=True)
    amount = Column(Float, nullable=False)
    remark = Column(Text, nullable=True)
    paid_by = Column(String(100), nullable=False)
    voucher_no = Column(String(50), nullable=True)
    branch_code = Column(String(50), nullable=False)
    created_by = Column(String(100), nullable=False)
    created_by_name = Column(String(100), nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())
    is_deleted = Column(Boolean, default=False)

    def to_dict(self):
        return {
            "id": self.id,
            "paid_date": self.paid_date.isoformat() if self.paid_date else None,
            "expenses_head": self.expenses_head,
            "sub_head": self.sub_head,
            "expenses_description": self.expenses_description,
            "description": self.description,
            "internal_branch_name": self.internal_branch_name,
            "paid_to": self.paid_to,
            "invoice_no": self.invoice_no,
            "amount": self.amount,
            "remark": self.remark,
            "paid_by": self.paid_by,
            "voucher_no": self.voucher_no,
            "branch_code": self.branch_code,
            "created_by": self.created_by,
            "created_by_name": self.created_by_name,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }