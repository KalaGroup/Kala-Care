from fastapi import APIRouter, HTTPException, status, Query
from typing import Optional, List
from datetime import date, datetime, timedelta
from pydantic import BaseModel, Field
from app.database import SessionLocal
from app.controllers.LVB_controller import LocalVendorController, LocalVendorBillController
from app.controllers.LVB_controller import LocalVendorBillTempController
from app.models.LVB_model import LocalVendorBillHistory  

router = APIRouter(prefix="/lvb", tags=["Local Vendor Bills"])

def get_db():
    return SessionLocal()


# ── Pydantic schemas ────────────────────────────────────────────────────────────

class VendorCreate(BaseModel):
    name: str = Field(..., max_length=255)
    gst_no: Optional[str] = Field(None, max_length=20)
    address: Optional[str] = None
    state: Optional[str] = Field(None, max_length=100)
    is_registered: bool = False
    branch_code: Optional[str] = Field(None, max_length=50)
    created_by: Optional[str] = Field(None, max_length=100)


class VendorResponse(BaseModel):
    id: int
    name: str
    gst_no: Optional[str]
    address: Optional[str]
    state: Optional[str]
    is_registered: bool
    branch_code: Optional[str]
    created_at: Optional[str]

    class Config:
        from_attributes = True


class BillCreate(BaseModel):
    vendor_id: Optional[int] = None
    vendor_name: str = Field(..., max_length=255)
    is_registered: bool = False
    gst_no: Optional[str] = Field(None, max_length=20)
    invoice_date: str
    invoice_number: Optional[str] = Field(None, max_length=100)
    payment_amount: float = Field(..., gt=0)
    shop_name: Optional[str] = Field(None, max_length=255)
    description: Optional[str] = None
    remark: Optional[str] = None
    customer_name: str = Field(..., max_length=255)
    customer_invoice_no: str = Field(..., max_length=100)
    customer_sr_no: str = Field(..., max_length=100)
    customer_invoice_amount: float = Field(..., gt=0)
    line_work_amount: float = Field(..., gt=0)
    branch_code: str = Field(..., max_length=50)
    created_by: str = Field(..., max_length=100)
    created_by_name: str = Field(..., max_length=100)

class BillResponse(BaseModel):
    id: int
    vendor_id: Optional[int]
    vendor_name: str
    is_registered: bool
    gst_no: Optional[str]
    invoice_date: Optional[str]
    invoice_number: Optional[str]
    payment_amount: float
    shop_name: Optional[str]
    description: Optional[str]
    remark: Optional[str]
    customer_name: Optional[str] = None
    customer_invoice_no: Optional[str] = None
    customer_sr_no: Optional[str] = None
    customer_invoice_amount: Optional[float] = None
    line_work_amount: Optional[float] = None
    branch_code: str
    created_by: str
    created_by_name: str
    created_at: Optional[str]
    # ✅ Add these:
    verification_status: str = 'Pending'
    verified_by_name: Optional[str] = None
    verified_by_id: Optional[str] = None
    verified_at: Optional[str] = None

    class Config:
        from_attributes = True

class BillTempCreate(BaseModel):
    vendor_id: Optional[int] = None
    vendor_name: str
    is_registered: bool = False
    gst_no: Optional[str] = None
    invoice_date: str
    invoice_number: Optional[str] = None
    payment_amount: float = Field(..., gt=0)
    shop_name: Optional[str] = None
    description: Optional[str] = None
    remark: Optional[str] = None
    customer_name: str
    customer_invoice_no: str
    customer_sr_no: str
    customer_invoice_amount: float = Field(..., gt=0)
    line_work_amount: float = Field(..., gt=0)
    branch_code: str
    created_by: str
    created_by_name: str

class BillTempUpdate(BaseModel):
    vendor_name: Optional[str] = None
    gst_no: Optional[str] = None
    invoice_date: Optional[str] = None
    invoice_number: Optional[str] = None
    payment_amount: Optional[float] = None
    shop_name: Optional[str] = None
    description: Optional[str] = None
    remark: Optional[str] = None
    customer_name: Optional[str] = None
    customer_invoice_no: Optional[str] = None
    customer_sr_no: Optional[str] = None
    customer_invoice_amount: Optional[float] = None
    line_work_amount: Optional[float] = None

class SubmitBillTempRequest(BaseModel):
    temp_ids: List[int]
    branch_code: str     

class LVBSinglePaidDateRequest(BaseModel):
    paid_date: Optional[str] = None

class LVBBulkPaidDateRequest(BaseModel):
    record_ids: List[int]
    paid_date: str       

# ── Vendor endpoints ────────────────────────────────────────────────────────────

@router.post("/vendors", response_model=VendorResponse, status_code=status.HTTP_201_CREATED)
def create_vendor(vendor: VendorCreate):
    db = get_db()
    try:
        # Check duplicate name
        existing_name = LocalVendorController.get_vendor_by_name(db, vendor.name)
        if existing_name:
            raise HTTPException(status_code=400, detail="Vendor with this name already exists")
        
        if vendor.gst_no:
            existing_gst = LocalVendorController.get_vendor_by_gst(db, vendor.gst_no)
            if existing_gst:
                raise HTTPException(status_code=400, detail=f"GST number already registered under vendor '{existing_gst.name}'")
        new_vendor = LocalVendorController.create_vendor(db, vendor.dict())
        db.commit()
        db.refresh(new_vendor)
        return VendorResponse(**new_vendor.to_dict())
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        db.close()


@router.get("/vendors", response_model=List[VendorResponse])
def get_vendors(
    branch_code: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
):
    db = get_db()
    try:
        vendors = LocalVendorController.get_vendors(db, branch_code=branch_code, search=search)
        return [VendorResponse(**v.to_dict()) for v in vendors]
    finally:
        db.close()


@router.get("/vendors/check")
def check_vendor_by_name(name: str = Query(...)):
    """Check if a vendor exists by name"""
    db = get_db()
    try:
        vendor = LocalVendorController.get_vendor_by_name(db, name)
        if vendor:
            return {"exists": True, "vendor": VendorResponse(**vendor.to_dict())}
        return {"exists": False, "vendor": None}
    finally:
        db.close()


# ── Bill endpoints ──────────────────────────────────────────────────────────────

@router.post("/bills", response_model=BillResponse, status_code=status.HTTP_201_CREATED)
def create_bill(bill: BillCreate):
    db = get_db()
    try:
        new_bill = LocalVendorBillController.create_bill(db, bill.dict())
        db.commit()
        db.refresh(new_bill)
        return BillResponse(**new_bill.to_dict())
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        db.close()


@router.get("/bills", response_model=List[BillResponse])
def get_bills(
    branch_code: Optional[str] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
):
    db = get_db()
    try:
        start = date.fromisoformat(start_date) if start_date else None
        end = date.fromisoformat(end_date) if end_date else None
    except ValueError:
        db.close()
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    try:
        bills = LocalVendorBillController.get_bills(
            db, branch_code=branch_code, start_date=start, end_date=end,
            search=search, skip=skip, limit=limit
        )
        return [BillResponse(**b.to_dict()) for b in bills]
    finally:
        db.close()


@router.delete("/bills/{bill_id}")
def delete_bill(bill_id: int):
    db = get_db()
    try:
        success = LocalVendorBillController.delete_bill(db, bill_id)
        if not success:
            raise HTTPException(status_code=404, detail="Bill not found")
        db.commit()
        return {"message": "Bill deleted successfully"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        db.close()

# Verify/unverify a single bill
@router.put("/bills/{bill_id}/verify")
def verify_bill(
    bill_id: int,
    verified_by_name: str = Query(...),
    verified_by_id: str = Query(...),
):
    db = get_db()
    try:
        bill = LocalVendorBillController.verify_bill(db, bill_id, verified_by_name, verified_by_id)
        if not bill:
            raise HTTPException(status_code=404, detail="Bill not found")
        db.commit()
        return bill.to_dict()
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        db.close()


# Submit verified bills to history
class SubmitToHistoryRequest(BaseModel):
    bill_ids: List[int]
    submitted_by_name: str
    submitted_by_id: str

@router.post("/bills/submit-to-history")
def submit_to_history(payload: SubmitToHistoryRequest):
    db = get_db()
    try:
        count = LocalVendorBillController.submit_to_history(
            db, payload.bill_ids, payload.submitted_by_name, payload.submitted_by_id
        )
        db.commit()
        return {"moved_count": count}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        db.close()


# Get history
@router.get("/bills/history")
def get_bill_history(
    branch_code: Optional[str] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(500, ge=1, le=1000),
):
    db = get_db()
    try:
        start = date.fromisoformat(start_date) if start_date else None
        end = date.fromisoformat(end_date) if end_date else None
    except ValueError:
        db.close()
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    try:
        records = LocalVendorBillController.get_history(
            db, branch_code=branch_code, start_date=start, end_date=end,
            search=search, skip=skip, limit=limit
        )
        return [r.to_dict() for r in records]
    finally:
        db.close()     

@router.post("/bills/temp", status_code=201)
def create_temp_bill(payload: BillTempCreate):
    db = get_db()
    try:
        new_temp = LocalVendorBillTempController.create_temp(db, payload.dict())
        db.commit(); db.refresh(new_temp)
        return new_temp.to_dict()
    except Exception as e:
        db.rollback(); raise HTTPException(status_code=400, detail=str(e))
    finally:
        db.close()

@router.get("/bills/temp/list")
def list_temp_bills(branch_code: str = Query(...), skip: int = 0, limit: int = 200):
    db = get_db()
    try:
        temps = LocalVendorBillTempController.get_temps(db, branch_code, skip, limit)
        return [t.to_dict() for t in temps]
    finally:
        db.close()

@router.put("/bills/temp/{temp_id}")
def update_temp_bill(temp_id: int, payload: BillTempUpdate):
    db = get_db()
    try:
        upd = {k: v for k, v in payload.dict().items() if v is not None}
        temp = LocalVendorBillTempController.update_temp(db, temp_id, upd)
        if not temp:
            raise HTTPException(status_code=404, detail="Draft not found")
        db.commit(); db.refresh(temp)
        return temp.to_dict()
    except HTTPException:
        db.rollback(); raise
    except Exception as e:
        db.rollback(); raise HTTPException(status_code=400, detail=str(e))
    finally:
        db.close()

@router.delete("/bills/temp/{temp_id}")
def delete_temp_bill(temp_id: int):
    db = get_db()
    try:
        ok = LocalVendorBillTempController.delete_temp(db, temp_id)
        if not ok:
            raise HTTPException(status_code=404, detail="Draft not found")
        db.commit()
        return {"message": "Draft deleted"}
    except HTTPException:
        db.rollback(); raise
    except Exception as e:
        db.rollback(); raise HTTPException(status_code=400, detail=str(e))
    finally:
        db.close()

@router.post("/bills/temp/submit-to-main")
def submit_bill_temp_to_main(payload: SubmitBillTempRequest):
    db = get_db()
    try:
        count = LocalVendorBillTempController.submit_to_main(db, payload.temp_ids, payload.branch_code)
        db.commit()
        return {"moved_count": count}
    except Exception as e:
        db.rollback(); raise HTTPException(status_code=400, detail=str(e))
    finally:
        db.close()           

@router.put("/bills/history/{record_id}/paid-date")
def lvb_update_paid_date(record_id: int, payload: LVBSinglePaidDateRequest):
    db = SessionLocal()
    try:
        rec = db.query(LocalVendorBillHistory).filter(LocalVendorBillHistory.id == record_id).first()
        if not rec:
            raise HTTPException(404, "Not found")
        rec.ho_paid_date = date.fromisoformat(payload.paid_date) if payload.paid_date else None
        db.commit(); db.refresh(rec)
        return rec.to_dict()
    finally:
        db.close()


@router.put("/bills/history/bulk-paid-date")
def lvb_bulk_paid_date(payload: LVBBulkPaidDateRequest):
    db = SessionLocal()
    try:
        pd = date.fromisoformat(payload.paid_date) if payload.paid_date else None
        db.query(LocalVendorBillHistory).filter(
            LocalVendorBillHistory.id.in_(payload.record_ids)
        ).update({"ho_paid_date": pd}, synchronize_session=False)
        db.commit()
        return {"updated": len(payload.record_ids)}
    finally:
        db.close()


@router.get("/bills/history/grouped")
def lvb_history_grouped(branch_code: Optional[str] = Query(None)):
    db = SessionLocal()
    try:
        # Pre-load every branch's submit rule once
        branch_rules = {}
        try:
            from app.models.branch_submit_limit_model import BranchSubmitLimit
            for rule in db.query(BranchSubmitLimit).all():
                branch_rules[rule.branch_code] = rule.rule_type or 'month_dates'
        except Exception:
            pass

        def get_period_bounds(d, rule_type):
            if rule_type == 'weekdays':
                # Mon → Sun week
                period_start = d - timedelta(days=d.weekday())
                period_end = period_start + timedelta(days=6)
            else:
                # 15-day half-month: 1–15 or 16–end-of-month
                if d.day <= 15:
                    period_start = d.replace(day=1)
                    period_end = d.replace(day=15)
                else:
                    period_start = d.replace(day=16)
                    next_first = (d.replace(year=d.year + 1, month=1, day=1)
                                  if d.month == 12
                                  else d.replace(month=d.month + 1, day=1))
                    period_end = next_first - timedelta(days=1)
            return period_start, period_end

        q = db.query(LocalVendorBillHistory)
        if branch_code:
            q = q.filter(LocalVendorBillHistory.branch_code == branch_code)
        records = q.all()

        groups_map = {}
        for r in records:
            # LVB groups by invoice_date (not paid_date)
            if not r.invoice_date:
                continue
            d = r.invoice_date.date() if hasattr(r.invoice_date, 'date') else r.invoice_date

            rule_type = branch_rules.get(r.branch_code, 'month_dates')
            period_start, period_end = get_period_bounds(d, rule_type)

            # Use created_by_name (branch uploader)
            key = (r.branch_code or '', r.created_by_name or 'Unknown', period_start, period_end)
            if key not in groups_map:
                groups_map[key] = {
                    'branch_code': key[0],
                    'uploaded_by': key[1],
                    'rule_type': rule_type,
                    'period_days': 7 if rule_type == 'weekdays' else 15,
                    'period_start': period_start.isoformat(),
                    'period_end': period_end.isoformat(),
                    'period_start_display': period_start.strftime('%d %b %Y'),
                    'period_end_display': period_end.strftime('%d %b %Y'),
                    'record_count': 0,
                    'total_amount': 0.0,
                    'record_ids': [],
                    '_paid_set': set(),
                    'paid_count': 0,
                }
            g = groups_map[key]
            g['record_count'] += 1
            g['total_amount'] += float(r.payment_amount or 0)   # LVB uses payment_amount
            g['record_ids'].append(r.id)
            if r.ho_paid_date:
                g['_paid_set'].add(r.ho_paid_date.isoformat())
                g['paid_count'] += 1

        groups = []
        for g in groups_map.values():
            paid_set = g.pop('_paid_set')
            g['paid_date'] = (list(paid_set)[0]
                              if len(paid_set) == 1 and g['paid_count'] == g['record_count']
                              else None)
            groups.append(g)

        groups.sort(key=lambda x: (x['period_start'], x['branch_code']), reverse=True)

        if branch_code:
            single_rule = branch_rules.get(branch_code, 'month_dates')
            resp_rule_type = single_rule
            resp_period_days = 7 if single_rule == 'weekdays' else 15
        else:
            resp_rule_type = 'mixed'
            resp_period_days = 0

        return {
            'rule_type': resp_rule_type,
            'period_days': resp_period_days,
            'groups': groups,
        }
    finally:
        db.close()        