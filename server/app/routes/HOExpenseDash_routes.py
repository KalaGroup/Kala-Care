from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from typing import Optional, List
from app.database import SessionLocal
from app.controllers import HOExpenseDash_controller

router = APIRouter(prefix="/ho-expense-dash", tags=["HO Expense Dashboard"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.get("/all-branches-verified-expense")
def all_branches_verified_expense(
    date_from: Optional[str] = Query(None, description="YYYY-MM-DD"),
    date_to: Optional[str] = Query(None, description="YYYY-MM-DD"),
    db: Session = Depends(get_db),
):
    """Verified expense per branch (with optional date range filter)."""
    try:
        return HOExpenseDash_controller.get_all_branches_verified_expense(
            db, date_from, date_to
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/branch-monthly-expense")
def branch_monthly_expense(
    branch_code: str = Query(..., description="Branch code (e.g. 420435_1, HO)"),
    year: int = Query(..., description="Year (e.g. 2025)"),
    db: Session = Depends(get_db),
):
    """12-month verified expense for a single branch."""
    try:
        return HOExpenseDash_controller.get_branch_monthly_expense(
            db, branch_code, year
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/all-branches-unverified")
def all_branches_unverified(db: Session = Depends(get_db)):
    """Unverified expense count + amount per branch."""
    try:
        return HOExpenseDash_controller.get_all_branches_unverified_count(db)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/available-years", response_model=List[int])
def available_years(
    branch_code: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """Years with verified history data (optionally per branch)."""
    try:
        return HOExpenseDash_controller.get_available_years(db, branch_code)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/kpis")
def kpis(db: Session = Depends(get_db)):
    """Top-level dashboard KPIs."""
    try:
        return HOExpenseDash_controller.get_dashboard_kpis(db)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
@router.get("/office/all-branches-verified-expense")
def office_all_branches_verified_expense(
    date_from: Optional[str] = Query(None, description="YYYY-MM-DD"),
    date_to: Optional[str] = Query(None, description="YYYY-MM-DD"),
    db: Session = Depends(get_db),
):
    """Verified (submitted) office expense per branch, with optional date range."""
    try:
        return HOExpenseDash_controller.get_all_branches_office_verified_expense(
            db, date_from, date_to
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/office/branch-monthly-expense")
def office_branch_monthly_expense(
    branch_code: str = Query(..., description="Branch code (e.g. 420435_1, HO)"),
    year: int = Query(..., description="Year (e.g. 2025)"),
    db: Session = Depends(get_db),
):
    """12-month verified office expense for a single branch."""
    try:
        return HOExpenseDash_controller.get_branch_monthly_office_expense(
            db, branch_code, year
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/office/all-branches-unverified")
def office_all_branches_unverified(db: Session = Depends(get_db)):
    """Unverified office expense (count + amount) per branch."""
    try:
        return HOExpenseDash_controller.get_all_branches_office_unverified(db)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/office/available-years", response_model=List[int])
def office_available_years(
    branch_code: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """Years that have verified office-expense history records."""
    try:
        return HOExpenseDash_controller.get_office_available_years(db, branch_code)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/office/kpis")
def office_kpis(db: Session = Depends(get_db)):
    """Office Expense top-level KPIs."""
    try:
        return HOExpenseDash_controller.get_office_dashboard_kpis(db)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))    
    
@router.get("/vendor/all-branches-verified-expense")
def vendor_all_branches_verified_expense(
    date_from: Optional[str] = Query(None, description="YYYY-MM-DD"),
    date_to: Optional[str] = Query(None, description="YYYY-MM-DD"),
    db: Session = Depends(get_db),
):
    """Verified (submitted) vendor bills per branch, with optional date range."""
    try:
        return HOExpenseDash_controller.get_all_branches_vendor_verified(
            db, date_from, date_to
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/vendor/branch-monthly-expense")
def vendor_branch_monthly_expense(
    branch_code: str = Query(..., description="Branch code (e.g. 420435_1, HO)"),
    year: int = Query(..., description="Year (e.g. 2025)"),
    db: Session = Depends(get_db),
):
    """12-month verified vendor bills for a single branch."""
    try:
        return HOExpenseDash_controller.get_branch_monthly_vendor(
            db, branch_code, year
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/vendor/all-branches-unverified")
def vendor_all_branches_unverified(db: Session = Depends(get_db)):
    """Unverified vendor bills (count + amount) per branch."""
    try:
        return HOExpenseDash_controller.get_all_branches_vendor_unverified(db)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/vendor/available-years", response_model=List[int])
def vendor_available_years(
    branch_code: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """Years that have verified vendor-bills history records."""
    try:
        return HOExpenseDash_controller.get_vendor_available_years(db, branch_code)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/vendor/kpis")
def vendor_kpis(db: Session = Depends(get_db)):
    """Local Vendor Bills top-level KPIs."""
    try:
        return HOExpenseDash_controller.get_vendor_dashboard_kpis(db)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))    