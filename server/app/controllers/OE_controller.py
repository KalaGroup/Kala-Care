from sqlalchemy.orm import Session
from sqlalchemy import or_, func, cast
from sqlalchemy.types import Date
from typing import List, Optional, Dict, Any
from datetime import datetime, date
from app.models.OE_model import OfficeExpense
from app.models.OE_temp_model import OfficeExpenseTemp
from app.controllers.OE_voucher_controller import OEVoucherController

class OfficeExpenseController:
    
    @staticmethod
    def create_expense(db: Session, expense_data: Dict[str, Any]) -> OfficeExpense:
        """Create a new office expense record"""
        # Convert date string to datetime if needed
        if isinstance(expense_data.get('paid_date'), str):
            expense_data['paid_date'] = datetime.fromisoformat(expense_data['paid_date'])
        
        expense = OfficeExpense(**expense_data)
        db.add(expense)
        db.flush()  # Use flush instead of commit - commit will be handled by route
        return expense
    
    @staticmethod
    def get_expenses(
        db: Session, 
        branch_code: Optional[str] = None,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        expenses_head: Optional[str] = None,
        search: Optional[str] = None,
        skip: int = 0,
        limit: int = 100
    ) -> List[OfficeExpense]:
        """Get office expenses with filters"""
        query = db.query(OfficeExpense).filter(OfficeExpense.is_deleted == False)
        
        # Filter by branch
        if branch_code:
            query = query.filter(OfficeExpense.branch_code == branch_code)
        
        # Filter by date range
        if start_date:
            query = query.filter(cast(OfficeExpense.paid_date, Date) >= start_date)
        if end_date:
            query = query.filter(cast(OfficeExpense.paid_date, Date) <= end_date)
        
        # Filter by expense head
        if expenses_head:
            query = query.filter(OfficeExpense.expenses_head == expenses_head)
        
        # Search in multiple fields
        if search:
            search_term = f"%{search}%"
            query = query.filter(
                or_(
                    OfficeExpense.expenses_head.ilike(search_term),
                    OfficeExpense.sub_head.ilike(search_term),
                    OfficeExpense.expenses_description.ilike(search_term),
                    OfficeExpense.description.ilike(search_term),
                    OfficeExpense.paid_to.ilike(search_term),
                    OfficeExpense.invoice_no.ilike(search_term),
                    OfficeExpense.remark.ilike(search_term),
                    OfficeExpense.paid_by.ilike(search_term),
                    OfficeExpense.voucher_no.ilike(search_term),
                )
            )
        
        return query.order_by(OfficeExpense.paid_date.desc()).offset(skip).limit(limit).all()
    
    @staticmethod
    def get_expense_count(
        db: Session,
        branch_code: Optional[str] = None,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        expenses_head: Optional[str] = None,
        search: Optional[str] = None
    ) -> int:
        """Get count of office expenses"""
        query = db.query(OfficeExpense).filter(OfficeExpense.is_deleted == False)
        
        if branch_code:
            query = query.filter(OfficeExpense.branch_code == branch_code)
        if start_date:
            query = query.filter(cast(OfficeExpense.paid_date, Date) >= start_date)
        if end_date:
            query = query.filter(cast(OfficeExpense.paid_date, Date) <= end_date)
        if expenses_head:
            query = query.filter(OfficeExpense.expenses_head == expenses_head)
        if search:
            search_term = f"%{search}%"
            query = query.filter(
                or_(
                    OfficeExpense.expenses_head.ilike(search_term),
                    OfficeExpense.sub_head.ilike(search_term),
                    OfficeExpense.expenses_description.ilike(search_term),
                    OfficeExpense.description.ilike(search_term),
                    OfficeExpense.paid_to.ilike(search_term),
                    OfficeExpense.invoice_no.ilike(search_term),
                    OfficeExpense.remark.ilike(search_term),
                    OfficeExpense.paid_by.ilike(search_term),
                    OfficeExpense.voucher_no.ilike(search_term),
                )
            )
        
        return query.count()
    
    @staticmethod
    def get_expense_by_id(db: Session, expense_id: int) -> Optional[OfficeExpense]:
        """Get a single expense by ID"""
        return db.query(OfficeExpense).filter(
            OfficeExpense.id == expense_id,
            OfficeExpense.is_deleted == False
        ).first()
    
    @staticmethod
    def update_expense(
        db: Session, 
        expense_id: int, 
        update_data: Dict[str, Any]
    ) -> Optional[OfficeExpense]:
        """Update an expense record"""
        expense = OfficeExpenseController.get_expense_by_id(db, expense_id)
        if not expense:
            return None
        
        for key, value in update_data.items():
            if value is not None and hasattr(expense, key):
                setattr(expense, key, value)
        
        db.flush()  # Use flush instead of commit
        return expense
    
    @staticmethod
    def delete_expense(db: Session, expense_id: int) -> bool:
        """Soft delete an expense record"""
        expense = OfficeExpenseController.get_expense_by_id(db, expense_id)
        if not expense:
            return False
        
        expense.is_deleted = True
        db.flush()  # Use flush instead of commit
        return True
    
    @staticmethod
    def get_expense_summary(
        db: Session,
        branch_code: str,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None
    ) -> Dict[str, Any]:
        """Get summary statistics for expenses"""
        query = db.query(OfficeExpense).filter(
            OfficeExpense.branch_code == branch_code,
            OfficeExpense.is_deleted == False
        )
        
        if start_date:
            query = query.filter(cast(OfficeExpense.paid_date, Date) >= start_date)
        if end_date:
            query = query.filter(cast(OfficeExpense.paid_date, Date) <= end_date)
        
        expenses = query.all()
        
        total_amount = sum(e.amount for e in expenses)
        
        # Group by expense head
        by_head = {}
        for expense in expenses:
            head = expense.expenses_head
            by_head[head] = by_head.get(head, 0) + expense.amount
        
        return {
            "total_records": len(expenses),
            "total_amount": total_amount,
            "average_amount": total_amount / len(expenses) if expenses else 0,
            "by_expenses_head": by_head
        }
    
class OfficeExpenseTempController:

    @staticmethod
    def create_temp(db: Session, data: Dict[str, Any]) -> OfficeExpenseTemp:
        if isinstance(data.get('paid_date'), str):
            data['paid_date'] = datetime.fromisoformat(data['paid_date'])

        # Auto-assign per-branch, per-FY voucher number at draft creation
        ref_date = data['paid_date'].date() if hasattr(data['paid_date'], 'date') else data['paid_date']
        data['voucher_no'] = str(
            OfficeExpenseTempController.get_next_voucher_no(db, data['branch_code'], ref_date)
        )

        temp = OfficeExpenseTemp(**data)
        db.add(temp)
        db.flush()
        return temp

    @staticmethod
    def get_temps(db: Session, branch_code: str, skip: int = 0, limit: int = 200) -> List[OfficeExpenseTemp]:
        return db.query(OfficeExpenseTemp).filter(
            OfficeExpenseTemp.branch_code == branch_code,
            OfficeExpenseTemp.is_deleted == False
        ).order_by(OfficeExpenseTemp.created_at.desc()).offset(skip).limit(limit).all()

    @staticmethod
    def get_temp_by_id(db: Session, temp_id: int) -> Optional[OfficeExpenseTemp]:
        return db.query(OfficeExpenseTemp).filter(
            OfficeExpenseTemp.id == temp_id,
            OfficeExpenseTemp.is_deleted == False
        ).first()

    @staticmethod
    def update_temp(db: Session, temp_id: int, data: Dict[str, Any]) -> Optional[OfficeExpenseTemp]:
        temp = OfficeExpenseTempController.get_temp_by_id(db, temp_id)
        if not temp:
            return None
        if isinstance(data.get('paid_date'), str):
            data['paid_date'] = datetime.fromisoformat(data['paid_date'])
        for k, v in data.items():
            if v is not None and hasattr(temp, k):
                setattr(temp, k, v)
        db.flush()
        return temp

    @staticmethod
    def delete_temp(db: Session, temp_id: int) -> bool:
        temp = OfficeExpenseTempController.get_temp_by_id(db, temp_id)
        if not temp:
            return False
        temp.is_deleted = True
        db.flush()
        return True

    @staticmethod
    def _financial_year_bounds(d: date):
        """Return (fy_start, fy_end) for the Indian FY containing date d (Apr 1 – Mar 31)."""
        if d.month >= 4:
            fy_start = date(d.year, 4, 1)
            fy_end = date(d.year + 1, 3, 31)
        else:
            fy_start = date(d.year - 1, 4, 1)
            fy_end = date(d.year, 3, 31)
        return fy_start, fy_end

    @staticmethod
    def get_next_voucher_no(db: Session, branch_code: str, ref_date: date) -> int:
        """
        Next voucher count for a branch within the financial year of ref_date.
        Counts BOTH main-table rows and existing temp/draft rows (non-deleted)
        in the same FY for this branch, so drafts get sequential numbers too.
        """
        fy_start, fy_end = OfficeExpenseTempController._financial_year_bounds(ref_date)

        main_max = db.query(func.max(OfficeExpense.voucher_no)).filter(
            OfficeExpense.branch_code == branch_code,
            OfficeExpense.is_deleted == False,
            cast(OfficeExpense.paid_date, Date) >= fy_start,
            cast(OfficeExpense.paid_date, Date) <= fy_end,
        ).scalar()

        temp_max = db.query(func.max(OfficeExpenseTemp.voucher_no)).filter(
            OfficeExpenseTemp.branch_code == branch_code,
            OfficeExpenseTemp.is_deleted == False,
            cast(OfficeExpenseTemp.paid_date, Date) >= fy_start,
            cast(OfficeExpenseTemp.paid_date, Date) <= fy_end,
        ).scalar()

        def _to_int(v):
            try:
                return int(v) if v is not None else 0
            except (ValueError, TypeError):
                return 0

        return max(_to_int(main_max), _to_int(temp_max)) + 1

    @staticmethod
    def submit_to_main(db: Session, temp_ids: List[int], branch_code: str):
        """Move temp rows to main office_expenses table.
        Each row keeps its per-record accounting voucher (voucher_no), and the
        whole batch shares ONE HO-submission voucher (submit_voucher_no),
        counted separately per branch and reset each financial year.
        Returns (count, submit_voucher_no)."""
        temps = db.query(OfficeExpenseTemp).filter(
            OfficeExpenseTemp.id.in_(temp_ids),
            OfficeExpenseTemp.branch_code == branch_code,
            OfficeExpenseTemp.is_deleted == False
        ).all()

        if not temps:
            return 0, None

        # One shared submission voucher for the whole batch (FY from earliest paid_date).
        ref_dates = [
            (t.paid_date.date() if hasattr(t.paid_date, 'date') else t.paid_date)
            for t in temps
        ]
        batch_ref_date = min(ref_dates)
        submit_voucher = OEVoucherController.generate_voucher(db, branch_code, batch_ref_date)

        count = 0
        for t in temps:
            ref_date = t.paid_date.date() if hasattr(t.paid_date, 'date') else t.paid_date
            next_no = OfficeExpenseTempController.get_next_voucher_no(db, branch_code, ref_date)
            main = OfficeExpense(
                paid_date=t.paid_date,
                expenses_head=t.expenses_head,
                sub_head=t.sub_head,
                expenses_description=t.expenses_description,
                description=t.description,
                internal_branch_name=t.internal_branch_name,
                paid_to=t.paid_to,
                invoice_no=t.invoice_no,
                amount=t.amount,
                remark=t.remark,
                paid_by=t.paid_by,
                voucher_no=str(next_no),
                submit_voucher_no=submit_voucher,
                branch_code=t.branch_code,
                created_by=t.created_by,
                created_by_name=t.created_by_name,
                verification_status='Pending',
            )
            db.add(main)
            db.flush()  # ensures the next iteration's get_next_voucher_no sees this row
            t.is_deleted = True
            count += 1
        db.flush()
        return count, submit_voucher