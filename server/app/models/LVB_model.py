from sqlalchemy import Column, Integer, String, Float, DateTime, Text, Boolean, Date
from sqlalchemy.sql import func
from app.database import Base

class LocalVendor(Base):
    __tablename__ = "local_vendors"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    gst_no = Column(String(20), nullable=True)
    address = Column(Text, nullable=True)
    state = Column(String(100), nullable=True)
    is_registered = Column(Boolean, default=False)
    branch_code = Column(String(50), nullable=True)
    created_by = Column(String(100), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    is_active = Column(Boolean, default=True)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "gst_no": self.gst_no,
            "address": self.address,
            "state": self.state,
            "is_registered": self.is_registered,
            "branch_code": self.branch_code,
            "created_by": self.created_by,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "is_active": self.is_active,
        }


class LocalVendorBill(Base):
    __tablename__ = "local_vendor_bills"

    id = Column(Integer, primary_key=True, index=True)
    vendor_id = Column(Integer, nullable=True)
    vendor_name = Column(String(255), nullable=False)
    is_registered = Column(Boolean, default=False)
    gst_no = Column(String(20), nullable=True)

    invoice_date = Column(DateTime, nullable=False)
    invoice_number = Column(String(100), nullable=True)
    payment_amount = Column(Float, nullable=False)
    shop_name = Column(String(255), nullable=True)
    customer_name = Column(String(255), nullable=False)
    customer_invoice_no = Column(String(100), nullable=False)
    customer_sr_no = Column(String(100), nullable=False)
    customer_invoice_amount = Column(Float, nullable=False)
    line_work_amount = Column(Float, nullable=False)
    description = Column(Text, nullable=True)
    remark = Column(Text, nullable=True)

    branch_code = Column(String(50), nullable=False)
    created_by = Column(String(100), nullable=False)
    created_by_name = Column(String(100), nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())
    is_deleted = Column(Boolean, default=False)
    verification_status = Column(String(20), default='Pending')
    verified_by_name = Column(String(100), nullable=True)
    verified_by_id = Column(String(100), nullable=True)
    verified_at = Column(DateTime, nullable=True)
    submit_voucher_no = Column(String(50), nullable=True)   # HO-submission batch voucher

    def to_dict(self):
        return {
            "id": self.id,
            "vendor_id": self.vendor_id,
            "vendor_name": self.vendor_name,
            "is_registered": self.is_registered,
            "gst_no": self.gst_no,
            "invoice_date": self.invoice_date.isoformat() if self.invoice_date else None,
            "invoice_number": self.invoice_number,
            "payment_amount": self.payment_amount,
            "shop_name": self.shop_name,
            "description": self.description,
            "remark": self.remark,
            "customer_name": self.customer_name,
            "customer_invoice_no": self.customer_invoice_no,
            "customer_sr_no": self.customer_sr_no,
            "customer_invoice_amount": self.customer_invoice_amount,
            "line_work_amount": self.line_work_amount,
            "branch_code": self.branch_code,
            "created_by": self.created_by,
            "created_by_name": self.created_by_name,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "verification_status": self.verification_status or 'Pending',
            "verified_by_name": self.verified_by_name,
            "verified_by_id": self.verified_by_id,
            "verified_at": self.verified_at.isoformat() if self.verified_at else None,
            "submit_voucher_no": self.submit_voucher_no,
        }


class LocalVendorBillHistory(Base):
    __tablename__ = "local_vendor_bills_history"

    id = Column(Integer, primary_key=True, index=True)
    original_bill_id = Column(Integer, nullable=True)
    vendor_id = Column(Integer, nullable=True)
    vendor_name = Column(String(255), nullable=False)
    is_registered = Column(Boolean, default=False)
    gst_no = Column(String(20), nullable=True)
    invoice_date = Column(DateTime, nullable=True)
    invoice_number = Column(String(100), nullable=True)
    payment_amount = Column(Float, nullable=False)
    shop_name = Column(String(255), nullable=True)
    customer_name = Column(String(255), nullable=True)
    customer_invoice_no = Column(String(100), nullable=True)
    customer_sr_no = Column(String(100), nullable=True)
    customer_invoice_amount = Column(Float, nullable=True)
    line_work_amount = Column(Float, nullable=True)
    description = Column(Text, nullable=True)
    remark = Column(Text, nullable=True)
    branch_code = Column(String(50), nullable=False)
    created_by = Column(String(100), nullable=False)
    created_by_name = Column(String(100), nullable=False)
    verified_by_name = Column(String(100), nullable=True)
    verified_by_id = Column(String(100), nullable=True)
    verified_at = Column(DateTime, nullable=True)
    submitted_by_name = Column(String(100), nullable=True)
    submitted_by_id = Column(String(100), nullable=True)
    moved_at = Column(DateTime, server_default=func.now())
    ho_paid_date = Column(Date, nullable=True)
    submit_voucher_no = Column(String(50), nullable=True)   # carried from main on submit-to-history

    def to_dict(self):
        return {
            "id": self.id,
            "original_bill_id": self.original_bill_id,
            "vendor_id": self.vendor_id,
            "vendor_name": self.vendor_name,
            "is_registered": self.is_registered,
            "gst_no": self.gst_no,
            "invoice_date": self.invoice_date.isoformat() if self.invoice_date else None,
            "invoice_number": self.invoice_number,
            "payment_amount": self.payment_amount,
            "shop_name": self.shop_name,
            "description": self.description,
            "remark": self.remark,
            "customer_name": self.customer_name,
            "customer_invoice_no": self.customer_invoice_no,
            "customer_sr_no": self.customer_sr_no,
            "customer_invoice_amount": self.customer_invoice_amount,
            "line_work_amount": self.line_work_amount,
            "branch_code": self.branch_code,
            "created_by": self.created_by,
            "created_by_name": self.created_by_name,
            "verified_by_name": self.verified_by_name,
            "verified_by_id": self.verified_by_id,
            "verified_at": self.verified_at.isoformat() if self.verified_at else None,
            "submitted_by_name": self.submitted_by_name,
            "submitted_by_id": self.submitted_by_id,
            "moved_at": self.moved_at.isoformat() if self.moved_at else None,
            "ho_paid_date": self.ho_paid_date.isoformat() if self.ho_paid_date else None,
            "submit_voucher_no": self.submit_voucher_no,
        }
    
