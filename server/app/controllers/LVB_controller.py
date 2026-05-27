from sqlalchemy.orm import Session
from sqlalchemy import or_, func
from typing import List, Optional, Dict, Any
from datetime import datetime, date
from app.models.LVB_model import LocalVendor, LocalVendorBill, LocalVendorBillHistory
from sqlalchemy import or_, func, cast
from sqlalchemy.types import Date
from app.models.LVB_temp_model import LocalVendorBillTemp

class LocalVendorController:

    @staticmethod
    def create_vendor(db: Session, data: Dict[str, Any]) -> LocalVendor:
        vendor = LocalVendor(**data)
        db.add(vendor)
        db.flush()
        return vendor

    @staticmethod
    def get_vendors(db: Session, branch_code: Optional[str] = None, search: Optional[str] = None) -> List[LocalVendor]:
        query = db.query(LocalVendor).filter(LocalVendor.is_active == True)
        if branch_code:
            query = query.filter(
                or_(LocalVendor.branch_code == branch_code, LocalVendor.branch_code == None)
            )
        if search:
            query = query.filter(
                or_(
                    LocalVendor.name.ilike(f"%{search}%"),
                    LocalVendor.gst_no.ilike(f"%{search}%"),
                )
            )
        return query.order_by(LocalVendor.name).all()

    @staticmethod
    def get_vendor_by_id(db: Session, vendor_id: int) -> Optional[LocalVendor]:
        return db.query(LocalVendor).filter(LocalVendor.id == vendor_id, LocalVendor.is_active == True).first()

    @staticmethod
    def get_vendor_by_name(db: Session, name: str) -> Optional[LocalVendor]:
        return db.query(LocalVendor).filter(
            func.lower(LocalVendor.name) == name.lower().strip(),
            LocalVendor.is_active == True
        ).first()

    @staticmethod
    def get_vendor_by_gst(db: Session, gst_no: str) -> Optional[LocalVendor]:
        return db.query(LocalVendor).filter(
            func.upper(LocalVendor.gst_no) == gst_no.upper().strip(),
            LocalVendor.is_active == True
        ).first()

class LocalVendorBillController:

    @staticmethod
    def create_bill(db: Session, data: Dict[str, Any]) -> LocalVendorBill:
        if isinstance(data.get('invoice_date'), str):
            data['invoice_date'] = datetime.fromisoformat(data['invoice_date'])
        bill = LocalVendorBill(**data)
        db.add(bill)
        db.flush()
        return bill

    @staticmethod
    def get_bills(
        db: Session,
        branch_code: Optional[str] = None,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        search: Optional[str] = None,
        skip: int = 0,
        limit: int = 100,
    ) -> List[LocalVendorBill]:
        query = db.query(LocalVendorBill).filter(LocalVendorBill.is_deleted == False)
        if branch_code:
            query = query.filter(LocalVendorBill.branch_code == branch_code)
        if start_date:
            query = query.filter(cast(LocalVendorBill.invoice_date, Date) >= start_date)
        if end_date:
            query = query.filter(cast(LocalVendorBill.invoice_date, Date) <= end_date)
        if search:
            term = f"%{search}%"
            query = query.filter(
                or_(
                    LocalVendorBill.vendor_name.ilike(term),
                    LocalVendorBill.invoice_number.ilike(term),
                    LocalVendorBill.shop_name.ilike(term),
                    LocalVendorBill.description.ilike(term),
                    LocalVendorBill.gst_no.ilike(term),
                    LocalVendorBill.customer_name.ilike(term),
                    LocalVendorBill.customer_invoice_no.ilike(term),
                    LocalVendorBill.customer_sr_no.ilike(term),
                )
            )
        return query.order_by(LocalVendorBill.invoice_date.desc()).offset(skip).limit(limit).all()

    @staticmethod
    def delete_bill(db: Session, bill_id: int) -> bool:
        bill = db.query(LocalVendorBill).filter(
            LocalVendorBill.id == bill_id, LocalVendorBill.is_deleted == False
        ).first()
        if not bill:
            return False
        bill.is_deleted = True
        db.flush()
        return True
    
    @staticmethod
    def verify_bill(db: Session, bill_id: int, verified_by_name: str, verified_by_id: str) -> Optional[LocalVendorBill]:
        bill = db.query(LocalVendorBill).filter(
            LocalVendorBill.id == bill_id, LocalVendorBill.is_deleted == False
        ).first()
        if not bill:
            return None
        if bill.verification_status == 'Verified':
            bill.verification_status = 'Pending'
            bill.verified_by_name = None
            bill.verified_by_id = None
            bill.verified_at = None
        else:
            bill.verification_status = 'Verified'
            bill.verified_by_name = verified_by_name
            bill.verified_by_id = verified_by_id
            bill.verified_at = datetime.utcnow()
        db.flush()
        return bill
    
    @staticmethod
    def submit_to_history(db: Session, bill_ids: List[int], submitted_by_name: str, submitted_by_id: str) -> int:
        bills = db.query(LocalVendorBill).filter(
            LocalVendorBill.id.in_(bill_ids),
            LocalVendorBill.verification_status == 'Verified',
            LocalVendorBill.is_deleted == False
        ).all()
        count = 0
        for bill in bills:
            history = LocalVendorBillHistory(
                original_bill_id=bill.id,
                vendor_id=bill.vendor_id,
                vendor_name=bill.vendor_name,
                is_registered=bill.is_registered,
                gst_no=bill.gst_no,
                invoice_date=bill.invoice_date,
                invoice_number=bill.invoice_number,
                payment_amount=bill.payment_amount,
                shop_name=bill.shop_name,
                description=bill.description,
                remark=bill.remark,
                customer_name=bill.customer_name,
                customer_invoice_no=bill.customer_invoice_no,
                customer_sr_no=bill.customer_sr_no,
                customer_invoice_amount=bill.customer_invoice_amount,
                line_work_amount=bill.line_work_amount,
                branch_code=bill.branch_code,
                created_by=bill.created_by,
                created_by_name=bill.created_by_name,
                verified_by_name=bill.verified_by_name,
                verified_by_id=bill.verified_by_id,
                verified_at=bill.verified_at,
                submitted_by_name=submitted_by_name,
                submitted_by_id=submitted_by_id,
            )
            db.add(history)
            bill.is_deleted = True
            count += 1
        db.flush()
        return count
    
    @staticmethod
    def get_history(
        db: Session,
        branch_code: Optional[str] = None,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        search: Optional[str] = None,
        skip: int = 0,
        limit: int = 500,
    ) -> List[LocalVendorBillHistory]:
        query = db.query(LocalVendorBillHistory)
        if branch_code:
            query = query.filter(LocalVendorBillHistory.branch_code == branch_code)
        if start_date:
            query = query.filter(cast(LocalVendorBillHistory.moved_at, Date) >= start_date)
        if end_date:
            query = query.filter(cast(LocalVendorBillHistory.moved_at, Date) <= end_date)
        if search:
            term = f"%{search}%"
            query = query.filter(or_(
                LocalVendorBillHistory.vendor_name.ilike(term),
                LocalVendorBillHistory.invoice_number.ilike(term),
                LocalVendorBillHistory.shop_name.ilike(term),
                LocalVendorBillHistory.submitted_by_name.ilike(term),
                LocalVendorBillHistory.verified_by_name.ilike(term),
            ))
        return query.order_by(LocalVendorBillHistory.moved_at.desc()).offset(skip).limit(limit).all()    
    
class LocalVendorBillTempController:

    @staticmethod
    def create_temp(db: Session, data: Dict[str, Any]) -> LocalVendorBillTemp:
        if isinstance(data.get('invoice_date'), str):
            data['invoice_date'] = datetime.fromisoformat(data['invoice_date'])
        temp = LocalVendorBillTemp(**data)
        db.add(temp)
        db.flush()
        return temp

    @staticmethod
    def get_temps(db: Session, branch_code: str, skip: int = 0, limit: int = 200) -> List[LocalVendorBillTemp]:
        return db.query(LocalVendorBillTemp).filter(
            LocalVendorBillTemp.branch_code == branch_code,
            LocalVendorBillTemp.is_deleted == False
        ).order_by(LocalVendorBillTemp.created_at.desc()).offset(skip).limit(limit).all()

    @staticmethod
    def get_temp_by_id(db: Session, temp_id: int) -> Optional[LocalVendorBillTemp]:
        return db.query(LocalVendorBillTemp).filter(
            LocalVendorBillTemp.id == temp_id,
            LocalVendorBillTemp.is_deleted == False
        ).first()

    @staticmethod
    def update_temp(db: Session, temp_id: int, data: Dict[str, Any]) -> Optional[LocalVendorBillTemp]:
        temp = LocalVendorBillTempController.get_temp_by_id(db, temp_id)
        if not temp:
            return None
        if isinstance(data.get('invoice_date'), str):
            data['invoice_date'] = datetime.fromisoformat(data['invoice_date'])
        for k, v in data.items():
            if v is not None and hasattr(temp, k):
                setattr(temp, k, v)
        db.flush()
        return temp

    @staticmethod
    def delete_temp(db: Session, temp_id: int) -> bool:
        temp = LocalVendorBillTempController.get_temp_by_id(db, temp_id)
        if not temp:
            return False
        temp.is_deleted = True
        db.flush()
        return True

    @staticmethod
    def submit_to_main(db: Session, temp_ids: List[int], branch_code: str) -> int:
        temps = db.query(LocalVendorBillTemp).filter(
            LocalVendorBillTemp.id.in_(temp_ids),
            LocalVendorBillTemp.branch_code == branch_code,
            LocalVendorBillTemp.is_deleted == False
        ).all()
        count = 0
        for t in temps:
            main = LocalVendorBill(
                vendor_id=t.vendor_id,
                vendor_name=t.vendor_name,
                is_registered=t.is_registered,
                gst_no=t.gst_no,
                invoice_date=t.invoice_date,
                invoice_number=t.invoice_number,
                payment_amount=t.payment_amount,
                shop_name=t.shop_name,
                customer_name=t.customer_name,
                customer_invoice_no=t.customer_invoice_no,
                customer_sr_no=t.customer_sr_no,
                customer_invoice_amount=t.customer_invoice_amount,
                line_work_amount=t.line_work_amount,
                description=t.description,
                remark=t.remark,
                branch_code=t.branch_code,
                created_by=t.created_by,
                created_by_name=t.created_by_name,
                verification_status='Pending',
            )
            db.add(main)
            t.is_deleted = True
            count += 1
        db.flush()
        return count    