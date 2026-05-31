from sqlalchemy import Column, Integer, String, Float, DateTime, Text, Boolean, Date
from sqlalchemy.sql import func
from app.database import Base

class OfficeExpenseHistory(Base):
    __tablename__ = "office_expense_history"

    id = Column(Integer, primary_key=True, index=True)
    original_id = Column(Integer, nullable=True)   # original office_expenses.id

    paid_date = Column(DateTime, nullable=True)
    expenses_head = Column(String(100), nullable=True)
    sub_head = Column(String(100), nullable=True)
    expenses_description = Column(Text, nullable=True)
    description = Column(Text, nullable=True)
    internal_branch_name = Column(String(150), nullable=True)
    paid_to = Column(String(255), nullable=True)
    invoice_no = Column(String(100), nullable=True)
    amount = Column(Float, nullable=True)
    remark = Column(Text, nullable=True)
    paid_by = Column(String(100), nullable=True)
    voucher_no = Column(String(50), nullable=True)

    # Who created the original record
    branch_code = Column(String(50), nullable=True)
    created_by = Column(String(100), nullable=True)
    created_by_name = Column(String(100), nullable=True)

    # Verification info
    verification_status = Column(String(20), default='Verified')
    verified_by_name = Column(String(100), nullable=True)
    verified_by_id = Column(String(100), nullable=True)
    verified_at = Column(DateTime, nullable=True)

    # Submission info (who clicked Submit)
    submitted_by_name = Column(String(100), nullable=True)
    submitted_by_id = Column(String(100), nullable=True)
    moved_at = Column(DateTime, server_default=func.now())
    ho_paid_date = Column(Date, nullable=True)
    submit_voucher_no = Column(String(50), nullable=True)   # carried from main on submit-to-history

    def to_dict(self):
        return {
            "id": self.id,
            "original_id": self.original_id,
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
            "verification_status": self.verification_status,
            "verified_by_name": self.verified_by_name,
            "verified_by_id": self.verified_by_id,
            "verified_at": self.verified_at.isoformat() if self.verified_at else None,
            "submitted_by_name": self.submitted_by_name,
            "submitted_by_id": self.submitted_by_id,
            "moved_at": self.moved_at.isoformat() if self.moved_at else None,
            "ho_paid_date": self.ho_paid_date.isoformat() if self.ho_paid_date else None,
            "submit_voucher_no": self.submit_voucher_no,
        }