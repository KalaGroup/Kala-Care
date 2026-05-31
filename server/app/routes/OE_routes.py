from fastapi import APIRouter, HTTPException, status, Query
from typing import Optional, List
from datetime import date, datetime, timedelta, timezone
from sqlalchemy import func
from pydantic import BaseModel, Field
from app.database import SessionLocal
from app.controllers.OE_controller import OfficeExpenseController
from app.models.OE_model import OfficeExpense
from app.models.expenseAddingData_model import ExpenseHead
import json
from app.models.OEH_model import OfficeExpenseHistory
from app.controllers.OE_controller import OfficeExpenseTempController

router = APIRouter(prefix="/office-expenses", tags=["Office Expenses"])

# Pydantic models for request/response
class OfficeExpenseCreate(BaseModel):
    paid_date: str
    expenses_head: str = Field(..., max_length=100)
    sub_head: Optional[str] = Field(None, max_length=100)
    expenses_description: Optional[str] = None
    description: Optional[str] = None
    internal_branch_name: Optional[str] = Field(None, max_length=150)
    paid_to: str = Field(..., max_length=255)
    invoice_no: Optional[str] = Field(None, max_length=100)
    amount: float = Field(..., gt=0)
    remark: Optional[str] = None
    paid_by: str = Field(..., max_length=100)
    voucher_no: Optional[str] = Field(None, max_length=50)
    branch_code: str = Field(..., max_length=50)
    created_by: str = Field(..., max_length=100)
    created_by_name: str = Field(..., max_length=100)

class OfficeExpenseUpdate(BaseModel):
    paid_date: Optional[str] = None
    expenses_head: Optional[str] = Field(None, max_length=100)
    sub_head: Optional[str] = Field(None, max_length=100)
    expenses_description: Optional[str] = None
    description: Optional[str] = None
    internal_branch_name: Optional[str] = Field(None, max_length=150)
    paid_to: Optional[str] = Field(None, max_length=255)
    invoice_no: Optional[str] = Field(None, max_length=100)
    amount: Optional[float] = Field(None, gt=0)
    remark: Optional[str] = None
    paid_by: Optional[str] = Field(None, max_length=100)
    voucher_no: Optional[str] = Field(None, max_length=50)

class OfficeExpenseResponse(BaseModel):
    id: int
    paid_date: Optional[str]
    expenses_head: str
    sub_head: Optional[str]
    expenses_description: Optional[str]
    description: Optional[str]
    internal_branch_name: Optional[str] = None
    paid_to: str
    invoice_no: Optional[str]
    amount: float
    remark: Optional[str]
    paid_by: str
    voucher_no: Optional[str]
    submit_voucher_no: Optional[str] = None
    branch_code: str
    created_by: str
    created_by_name: str
    created_at: Optional[str]
    updated_at: Optional[str]
    # ✅ Add these:
    verification_status: str = 'Pending'
    verified_by_name: Optional[str] = None
    verified_by_id: Optional[str] = None
    verified_at: Optional[str] = None

    class Config:
        from_attributes = True

class ExpenseHeadResponse(BaseModel):
    id: int
    name: str
    subheads: List[str]

class OfficeExpenseTempCreate(BaseModel):
    paid_date: str
    expenses_head: str = Field(..., max_length=100)
    sub_head: Optional[str] = Field(None, max_length=100)
    expenses_description: Optional[str] = None
    description: Optional[str] = None
    internal_branch_name: Optional[str] = Field(None, max_length=150)
    paid_to: str = Field(..., max_length=255)
    invoice_no: Optional[str] = Field(None, max_length=100)
    amount: float = Field(..., gt=0)
    remark: Optional[str] = None
    paid_by: str = Field(..., max_length=100)
    voucher_no: Optional[str] = Field(None, max_length=50)
    branch_code: str
    created_by: str
    created_by_name: str

class OfficeExpenseTempUpdate(BaseModel):
    paid_date: Optional[str] = None
    expenses_head: Optional[str] = None
    sub_head: Optional[str] = None
    expenses_description: Optional[str] = None
    description: Optional[str] = None
    internal_branch_name: Optional[str] = None
    paid_to: Optional[str] = None
    invoice_no: Optional[str] = None
    amount: Optional[float] = None
    remark: Optional[str] = None
    paid_by: Optional[str] = None
    voucher_no: Optional[str] = None

class SubmitTempToMainRequest(BaseModel):
    temp_ids: List[int]
    branch_code: str

class SinglePaidDateRequest(BaseModel):
    paid_date: Optional[str] = None

class BulkPaidDateRequest(BaseModel):
    record_ids: List[int]
    paid_date: str    

# Helper function to get DB session
def get_db_session():
    return SessionLocal()

# ==================== EXPENSE HEADS ENDPOINTS ====================

@router.get("/expense-heads", response_model=List[ExpenseHeadResponse])
def get_expense_heads():
    """Get all active expense heads with their subheads"""
    db = get_db_session()
    try:
        results = db.query(ExpenseHead).filter(ExpenseHead.is_active == True).order_by(ExpenseHead.name).all()
        
        expense_heads = []
        for row in results:
            subheads_list = []
            if row.subheads:
                try:
                    # Try parsing as JSON array of objects: [{"id":1,"name":"xyz"}, ...]
                    parsed = json.loads(row.subheads)
                    if isinstance(parsed, list):
                        for item in parsed:
                            if isinstance(item, dict):
                                # Extract "name" key if it exists, else "value", else stringify
                                subheads_list.append(str(item.get("name") or item.get("value") or item.get("label") or list(item.values())[0]))
                            else:
                                subheads_list.append(str(item))
                    else:
                        subheads_list = [str(parsed)]
                except (json.JSONDecodeError, ValueError):
                    # Fall back to comma-separated string
                    subheads_list = [s.strip() for s in row.subheads.split(',') if s.strip()]
            
            expense_heads.append({
                "id": row.id,
                "name": row.name,
                "subheads": subheads_list
            })
        
        return expense_heads
    except Exception as e:
        print(f"Error fetching expense heads: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()

# ==================== OFFICE EXPENSES ENDPOINTS ====================

@router.post("/", response_model=OfficeExpenseResponse, status_code=status.HTTP_201_CREATED)
def create_office_expense(expense: OfficeExpenseCreate):
    """Create a new office expense record"""
    db = get_db_session()
    try:
        new_expense = OfficeExpenseController.create_expense(db, expense.model_dump())
        db.commit()
        db.refresh(new_expense)
        return OfficeExpenseResponse(**new_expense.to_dict())
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        db.close()

@router.get("/", response_model=List[OfficeExpenseResponse])
def get_office_expenses(
    branch_code: Optional[str] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    expenses_head: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500)
):
    """Get all office expenses with filters"""
    db = get_db_session()
    try:
        start_date_obj = date.fromisoformat(start_date) if start_date else None
        end_date_obj = date.fromisoformat(end_date) if end_date else None
    except ValueError:
        db.close()
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    
    try:
        expenses = OfficeExpenseController.get_expenses(
            db=db,
            branch_code=branch_code,
            start_date=start_date_obj,
            end_date=end_date_obj,
            expenses_head=expenses_head,
            search=search,
            skip=skip,
            limit=limit
        )
        return [OfficeExpenseResponse(**expense.to_dict()) for expense in expenses]
    finally:
        db.close()

@router.get("/count")
def get_expenses_count(
    branch_code: Optional[str] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    expenses_head: Optional[str] = Query(None),
    search: Optional[str] = Query(None)
):
    """Get count of office expenses"""
    db = get_db_session()
    try:
        start_date_obj = date.fromisoformat(start_date) if start_date else None
        end_date_obj = date.fromisoformat(end_date) if end_date else None
    except ValueError:
        db.close()
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    
    try:
        count = OfficeExpenseController.get_expense_count(
            db=db,
            branch_code=branch_code,
            start_date=start_date_obj,
            end_date=end_date_obj,
            expenses_head=expenses_head,
            search=search
        )
        return {"count": count}
    finally:
        db.close()


@router.get("/next-voucher-no")
def get_next_voucher_no(
    branch_code: str = Query(...),
    paid_date: Optional[str] = Query(None),
):
    """Preview the next voucher number for a branch in the FY of paid_date (defaults today)."""
    db = get_db_session()
    try:
        ref = date.fromisoformat(paid_date) if paid_date else date.today()
        next_no = OfficeExpenseTempController.get_next_voucher_no(db, branch_code, ref)
        return {"next_voucher_no": str(next_no)}
    finally:
        db.close()            

# ==================== VOUCHER-WISE VERIFICATION (MAIN) ====================

@router.get("/vouchers")
def oe_vouchers(branch_code: Optional[str] = Query(None)):
    """Group non-deleted office expenses by submit_voucher_no for HO verification."""
    db = get_db_session()
    try:
        q = db.query(OfficeExpense).filter(OfficeExpense.is_deleted == False)
        if branch_code:
            q = q.filter(OfficeExpense.branch_code == branch_code)
        records = q.all()

        groups_map = {}
        for r in records:
            vno = r.submit_voucher_no or 'No Voucher'
            key = (r.branch_code or '', vno)
            if key not in groups_map:
                groups_map[key] = {
                    'submit_voucher_no': vno,
                    'branch_code': r.branch_code or '',
                    'record_count': 0,
                    'verified_count': 0,
                    'total_amount': 0.0,
                    'verified_amount': 0.0,
                    'record_ids': [],
                    '_dates': [],
                    '_submitters': set(),
                }
            g = groups_map[key]
            amt = float(r.amount or 0)
            g['record_count'] += 1
            g['total_amount'] += amt
            g['record_ids'].append(r.id)
            if r.created_by_name:
                g['_submitters'].add(r.created_by_name)
            if r.verification_status == 'Verified':
                g['verified_count'] += 1
                g['verified_amount'] += amt
            if r.paid_date:
                d = r.paid_date.date() if hasattr(r.paid_date, 'date') else r.paid_date
                g['_dates'].append(d)

        groups = []
        for g in groups_map.values():
            dates = g.pop('_dates')
            submitters = g.pop('_submitters')
            g['submitted_by'] = ', '.join(sorted(submitters)) if submitters else 'Unknown'
            if dates:
                ps, pe = min(dates), max(dates)
                g['period_start'] = ps.isoformat()
                g['period_end'] = pe.isoformat()
                g['period_start_display'] = ps.strftime('%d %b %Y')
                g['period_end_display'] = pe.strftime('%d %b %Y')
            else:
                g['period_start'] = g['period_end'] = None
                g['period_start_display'] = g['period_end_display'] = '-'
            groups.append(g)

        groups.sort(key=lambda x: (x['period_start'] or '', x['submit_voucher_no']), reverse=True)
        return {'groups': groups}
    finally:
        db.close()


@router.get("/voucher-records")
def oe_voucher_records(
    submit_voucher_no: str = Query(...),
    branch_code: Optional[str] = Query(None),
):
    """All non-deleted office expenses inside one submit voucher."""
    db = get_db_session()
    try:
        q = db.query(OfficeExpense).filter(OfficeExpense.is_deleted == False)
        if submit_voucher_no == 'No Voucher':
            q = q.filter(OfficeExpense.submit_voucher_no.is_(None))
        else:
            q = q.filter(OfficeExpense.submit_voucher_no == submit_voucher_no)
        if branch_code:
            q = q.filter(OfficeExpense.branch_code == branch_code)
        records = q.order_by(OfficeExpense.paid_date.asc()).all()
        return [r.to_dict() for r in records]
    finally:
        db.close()            

@router.get("/{expense_id}", response_model=OfficeExpenseResponse)
def get_office_expense(expense_id: int):
    """Get a specific office expense by ID"""
    db = get_db_session()
    try:
        expense = OfficeExpenseController.get_expense_by_id(db, expense_id)
        if not expense:
            raise HTTPException(status_code=404, detail="Expense not found")
        return OfficeExpenseResponse(**expense.to_dict())
    finally:
        db.close()

@router.put("/{expense_id}", response_model=OfficeExpenseResponse)
def update_office_expense(expense_id: int, update_data: OfficeExpenseUpdate):
    """Update an office expense record"""
    db = get_db_session()
    try:
        update_dict = {k: v for k, v in update_data.model_dump().items() if v is not None}
        updated_expense = OfficeExpenseController.update_expense(db, expense_id, update_dict)
        if not updated_expense:
            raise HTTPException(status_code=404, detail="Expense not found")
        db.commit()
        db.refresh(updated_expense)
        return OfficeExpenseResponse(**updated_expense.to_dict())
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        db.close()

@router.delete("/{expense_id}")
def delete_office_expense(expense_id: int):
    """Soft delete an office expense record"""
    db = get_db_session()
    try:
        success = OfficeExpenseController.delete_expense(db, expense_id)
        if not success:
            raise HTTPException(status_code=404, detail="Expense not found")
        db.commit()
        return {"message": "Expense deleted successfully"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        db.close()

@router.get("/summary/{branch_code}")
def get_expense_summary(
    branch_code: str,
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None)
):
    """Get expense summary statistics"""
    db = get_db_session()
    try:
        start_date_obj = date.fromisoformat(start_date) if start_date else None
        end_date_obj = date.fromisoformat(end_date) if end_date else None
    except ValueError:
        db.close()
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    
    try:
        summary = OfficeExpenseController.get_expense_summary(
            db=db,
            branch_code=branch_code,
            start_date=start_date_obj,
            end_date=end_date_obj
        )
        return summary
    finally:
        db.close()

# ==================== VERIFY ENDPOINT ====================

@router.put("/{expense_id}/verify")
def verify_office_expense(
    expense_id: int,
    verified_by_name: str = Query(...),
    verified_by_id: str = Query(...)
):
    """Toggle verification status of an office expense"""
    db = get_db_session()
    try:
        expense = db.query(OfficeExpense).filter(
            OfficeExpense.id == expense_id,
            OfficeExpense.is_deleted == False
        ).first()
        if not expense:
            raise HTTPException(status_code=404, detail="Expense not found")

        if expense.verification_status == 'Verified':
            # Unverify
            expense.verification_status = 'Pending'
            expense.verified_by_name = None
            expense.verified_by_id = None
            expense.verified_at = None
        else:
            # Verify
            expense.verification_status = 'Verified'
            expense.verified_by_name = verified_by_name
            expense.verified_by_id = verified_by_id
            expense.verified_at = datetime.now(timezone.utc)

        db.commit()
        db.refresh(expense)
        return expense.to_dict()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        db.close()


# ==================== SUBMIT VERIFIED TO HISTORY ====================

class SubmitToHistoryRequest(BaseModel):
    expense_ids: List[int]
    submitted_by_name: str
    submitted_by_id: str

@router.post("/submit-to-history")
def submit_verified_to_history(request: SubmitToHistoryRequest):
    """Move selected verified expenses to history and soft-delete from main table"""
    db = get_db_session()
    try:
        moved_count = 0
        for expense_id in request.expense_ids:
            expense = db.query(OfficeExpense).filter(
                OfficeExpense.id == expense_id,
                OfficeExpense.is_deleted == False,
                OfficeExpense.verification_status == 'Verified'
            ).first()

            if not expense:
                continue

            history = OfficeExpenseHistory(
                original_id=expense.id,
                submit_voucher_no=expense.submit_voucher_no,
                paid_date=expense.paid_date,
                expenses_head=expense.expenses_head,
                sub_head=expense.sub_head,
                expenses_description=expense.expenses_description,
                description=expense.description,
                internal_branch_name=expense.internal_branch_name,
                paid_to=expense.paid_to,
                invoice_no=expense.invoice_no,
                amount=expense.amount,
                remark=expense.remark,
                paid_by=expense.paid_by,
                voucher_no=expense.voucher_no,
                branch_code=expense.branch_code,
                created_by=expense.created_by,
                created_by_name=expense.created_by_name,
                verification_status='Verified',
                verified_by_name=expense.verified_by_name,
                verified_by_id=expense.verified_by_id,
                verified_at=expense.verified_at,
                submitted_by_name=request.submitted_by_name,
                submitted_by_id=request.submitted_by_id,
            )
            db.add(history)
            expense.is_deleted = True
            moved_count += 1

        db.commit()
        return {"message": f"Successfully moved {moved_count} records to history", "moved_count": moved_count}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        db.close()


# ==================== HISTORY ENDPOINT ====================

@router.get("/history/list")
def get_office_expense_history(
    branch_code: Optional[str] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(200, ge=1, le=500)
):
    """Get office expense history records"""
    db = get_db_session()
    try:
        query = db.query(OfficeExpenseHistory)
        if branch_code:
            query = query.filter(OfficeExpenseHistory.branch_code == branch_code)
        if start_date:
            start = date.fromisoformat(start_date)
            query = query.filter(func.date(OfficeExpenseHistory.moved_at) >= start)
        if end_date:
            end = date.fromisoformat(end_date)
            query = query.filter(func.date(OfficeExpenseHistory.moved_at) <= end)

        records = query.order_by(OfficeExpenseHistory.moved_at.desc()).offset(skip).limit(limit).all()
        return [r.to_dict() for r in records]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()   

@router.get("/history/vouchers")
def oe_history_vouchers(branch_code: Optional[str] = Query(None)):
    """Group office-expense history by submit_voucher_no."""
    db = get_db_session()
    try:
        q = db.query(OfficeExpenseHistory)
        if branch_code:
            q = q.filter(OfficeExpenseHistory.branch_code == branch_code)
        records = q.all()

        groups_map = {}
        for r in records:
            vno = r.submit_voucher_no or 'No Voucher'
            key = (r.branch_code or '', vno)
            if key not in groups_map:
                groups_map[key] = {
                    'submit_voucher_no': vno,
                    'branch_code': r.branch_code or '',
                    'record_count': 0,
                    'total_amount': 0.0,
                    'record_ids': [],
                    '_dates': [],
                    '_submitters': set(),
                    '_verifiers': set(),
                    '_paid_set': set(),
                    'paid_count': 0,
                }
            g = groups_map[key]
            amt = float(r.amount or 0)
            g['record_count'] += 1
            g['total_amount'] += amt
            g['record_ids'].append(r.id)
            if r.created_by_name:
                g['_submitters'].add(r.created_by_name)
            if r.verified_by_name:
                g['_verifiers'].add(r.verified_by_name)
            if r.paid_date:
                d = r.paid_date.date() if hasattr(r.paid_date, 'date') else r.paid_date
                g['_dates'].append(d)
            if r.ho_paid_date:
                g['_paid_set'].add(r.ho_paid_date.isoformat())
                g['paid_count'] += 1

        groups = []
        for g in groups_map.values():
            dates = g.pop('_dates')
            submitters = g.pop('_submitters')
            verifiers = g.pop('_verifiers')
            paid_set = g.pop('_paid_set')
            g['submitted_by'] = ', '.join(sorted(submitters)) if submitters else 'Unknown'
            g['verified_by'] = ', '.join(sorted(verifiers)) if verifiers else '-'
            g['paid_date'] = (list(paid_set)[0]
                              if len(paid_set) == 1 and g['paid_count'] == g['record_count']
                              else None)
            if dates:
                ps, pe = min(dates), max(dates)
                g['period_start'] = ps.isoformat()
                g['period_end'] = pe.isoformat()
                g['period_start_display'] = ps.strftime('%d %b %Y')
                g['period_end_display'] = pe.strftime('%d %b %Y')
            else:
                g['period_start'] = g['period_end'] = None
                g['period_start_display'] = g['period_end_display'] = '-'
            groups.append(g)

        groups.sort(key=lambda x: (x['period_start'] or '', x['submit_voucher_no']), reverse=True)
        return {'groups': groups}
    finally:
        db.close()


@router.get("/history/voucher-records")
def oe_history_voucher_records(
    submit_voucher_no: str = Query(...),
    branch_code: Optional[str] = Query(None),
):
    """All history rows inside one submit voucher."""
    db = get_db_session()
    try:
        q = db.query(OfficeExpenseHistory)
        if submit_voucher_no == 'No Voucher':
            q = q.filter(OfficeExpenseHistory.submit_voucher_no.is_(None))
        else:
            q = q.filter(OfficeExpenseHistory.submit_voucher_no == submit_voucher_no)
        if branch_code:
            q = q.filter(OfficeExpenseHistory.branch_code == branch_code)
        records = q.order_by(OfficeExpenseHistory.paid_date.asc()).all()
        return [r.to_dict() for r in records]
    finally:
        db.close()        

@router.post("/temp", status_code=201)
def create_temp_expense(payload: OfficeExpenseTempCreate):
    db = get_db_session()
    try:
        new_temp = OfficeExpenseTempController.create_temp(db, payload.model_dump())
        db.commit()
        db.refresh(new_temp)
        return new_temp.to_dict()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        db.close()

@router.get("/temp/list")
def list_temp_expenses(branch_code: str = Query(...), skip: int = 0, limit: int = 200):
    db = get_db_session()
    try:
        temps = OfficeExpenseTempController.get_temps(db, branch_code, skip, limit)
        return [t.to_dict() for t in temps]
    finally:
        db.close()

@router.put("/temp/{temp_id}")
def update_temp_expense(temp_id: int, payload: OfficeExpenseTempUpdate):
    db = get_db_session()
    try:
        upd = {k: v for k, v in payload.model_dump().items() if v is not None}
        temp = OfficeExpenseTempController.update_temp(db, temp_id, upd)
        if not temp:
            raise HTTPException(status_code=404, detail="Draft not found")
        db.commit()
        db.refresh(temp)
        return temp.to_dict()
    except HTTPException:
        db.rollback(); raise
    except Exception as e:
        db.rollback(); raise HTTPException(status_code=400, detail=str(e))
    finally:
        db.close()

@router.delete("/temp/{temp_id}")
def delete_temp_expense(temp_id: int):
    db = get_db_session()
    try:
        ok = OfficeExpenseTempController.delete_temp(db, temp_id)
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

@router.post("/temp/submit-to-main")
def submit_temp_to_main(payload: SubmitTempToMainRequest):
    db = get_db_session()
    try:
        count, submit_voucher_no = OfficeExpenseTempController.submit_to_main(
            db, payload.temp_ids, payload.branch_code
        )
        db.commit()
        return {"moved_count": count, "submit_voucher_no": submit_voucher_no}
    except Exception as e:
        db.rollback(); raise HTTPException(status_code=400, detail=str(e))
    finally:
        db.close()             

@router.put("/history/{record_id}/paid-date")
def oe_update_paid_date(record_id: int, payload: SinglePaidDateRequest):
    db = get_db_session()
    try:
        rec = db.query(OfficeExpenseHistory).filter(OfficeExpenseHistory.id == record_id).first()
        if not rec:
            raise HTTPException(404, "Not found")
        rec.ho_paid_date = date.fromisoformat(payload.paid_date) if payload.paid_date else None
        db.commit(); db.refresh(rec)
        return rec.to_dict()
    finally:
        db.close()

@router.put("/history/bulk-paid-date")
def oe_bulk_paid_date(payload: BulkPaidDateRequest):
    db = get_db_session()
    try:
        pd = date.fromisoformat(payload.paid_date) if payload.paid_date else None
        db.query(OfficeExpenseHistory).filter(
            OfficeExpenseHistory.id.in_(payload.record_ids)
        ).update({"ho_paid_date": pd}, synchronize_session=False)
        db.commit()
        return {"updated": len(payload.record_ids)}
    finally:
        db.close()

@router.get("/history/grouped")
def oe_history_grouped(branch_code: Optional[str] = Query(None)):
    db = get_db_session()
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

        q = db.query(OfficeExpenseHistory)
        if branch_code:
            q = q.filter(OfficeExpenseHistory.branch_code == branch_code)
        records = q.all()

        groups_map = {}
        for r in records:
            if not r.paid_date:
                continue
            d = r.paid_date.date() if hasattr(r.paid_date, 'date') else r.paid_date

            # Per-record rule: use this record's branch's rule, not a global one
            rule_type = branch_rules.get(r.branch_code, 'month_dates')
            period_start, period_end = get_period_bounds(d, rule_type)

            # Key includes period bounds → boundary crossing automatically opens a new group
            # Use created_by_name (branch uploader), not submitted_by_name (HO submitter)
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
            g['total_amount'] += float(r.amount or 0)
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

        # Sort: most recent period first, then by branch
        groups.sort(key=lambda x: (x['period_start'], x['branch_code']), reverse=True)

        # Top-level rule meta: meaningful only when one branch is filtered
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
