from sqlalchemy import Column, Integer, String, Float, DateTime, Text, Boolean
from sqlalchemy.sql import func
from app.database import Base


class LocalVendorBillTemp(Base):
    __tablename__ = "local_vendor_bill_temp"

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
            "customer_name": self.customer_name,
            "customer_invoice_no": self.customer_invoice_no,
            "customer_sr_no": self.customer_sr_no,
            "customer_invoice_amount": self.customer_invoice_amount,
            "line_work_amount": self.line_work_amount,
            "description": self.description,
            "remark": self.remark,
            "branch_code": self.branch_code,
            "created_by": self.created_by,
            "created_by_name": self.created_by_name,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }