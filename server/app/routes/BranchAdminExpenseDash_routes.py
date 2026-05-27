from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from typing import Optional, List
from app.database import SessionLocal
from app.controllers import BranchAdminExpenseDash_controller

router = APIRouter(
    prefix="/branch-expense-dash",
    tags=["Branch Admin Expense Dashboard"],
)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.get("/kpis")
def kpis(
    branch_code: str = Query(..., description="Branch code (e.g. 420435_1)"),
    db: Session = Depends(get_db),
):
    """4 top-level KPIs for this branch."""
    try:
        return BranchAdminExpenseDash_controller.get_branch_kpis(db, branch_code)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/monthly-expense")
def monthly_expense(
    branch_code: str = Query(...),
    year: int = Query(...),
    db: Session = Depends(get_db),
):
    """12-month verified expense trend for this branch (grouped by moved_at)."""
    try:
        return BranchAdminExpenseDash_controller.get_branch_monthly(db, branch_code, year)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/engineers-verified")
def engineers_verified(
    branch_code: str = Query(...),
    date_from: Optional[str] = Query(None, description="YYYY-MM-DD"),
    date_to: Optional[str] = Query(None, description="YYYY-MM-DD"),
    db: Session = Depends(get_db),
):
    """Engineer-wise verified count + amount for this branch."""
    try:
        return BranchAdminExpenseDash_controller.get_engineers_verified(
            db, branch_code, date_from, date_to
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/engineers-unverified")
def engineers_unverified(
    branch_code: str = Query(...),
    db: Session = Depends(get_db),
):
    """Engineer-wise unverified count + amount for this branch."""
    try:
        return BranchAdminExpenseDash_controller.get_engineers_unverified(db, branch_code)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/available-years", response_model=List[int])
def available_years(
    branch_code: str = Query(...),
    db: Session = Depends(get_db),
):
    """Years that have verified history for this branch."""
    try:
        return BranchAdminExpenseDash_controller.get_branch_available_years(db, branch_code)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
# ══════════════════════════════════════════════════════════════════
# OFFICE EXPENSE — Branch Admin
# ══════════════════════════════════════════════════════════════════
@router.get("/office/kpis")
def office_kpis(
    branch_code: str = Query(...),
    db: Session = Depends(get_db),
):
    try:
        return BranchAdminExpenseDash_controller.get_branch_office_kpis(db, branch_code)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/office/monthly-expense")
def office_monthly_expense(
    branch_code: str = Query(...),
    year: int = Query(...),
    db: Session = Depends(get_db),
):
    try:
        return BranchAdminExpenseDash_controller.get_branch_office_monthly(db, branch_code, year)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/office/by-category")
def office_by_category(
    branch_code: str = Query(...),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    try:
        return BranchAdminExpenseDash_controller.get_branch_office_by_category(
            db, branch_code, date_from, date_to
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/office/available-years", response_model=List[int])
def office_available_years(
    branch_code: str = Query(...),
    db: Session = Depends(get_db),
):
    try:
        return BranchAdminExpenseDash_controller.get_branch_office_available_years(db, branch_code)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ══════════════════════════════════════════════════════════════════
# LOCAL VENDOR BILLS — Branch Admin
# ══════════════════════════════════════════════════════════════════
@router.get("/vendor/kpis")
def vendor_kpis(
    branch_code: str = Query(...),
    db: Session = Depends(get_db),
):
    try:
        return BranchAdminExpenseDash_controller.get_branch_vendor_kpis(db, branch_code)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/vendor/monthly-expense")
def vendor_monthly_expense(
    branch_code: str = Query(...),
    year: int = Query(...),
    db: Session = Depends(get_db),
):
    try:
        return BranchAdminExpenseDash_controller.get_branch_vendor_monthly(db, branch_code, year)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/vendor/by-vendor")
def vendor_by_vendor(
    branch_code: str = Query(...),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    try:
        return BranchAdminExpenseDash_controller.get_branch_vendor_by_vendor(
            db, branch_code, date_from, date_to
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/vendor/available-years", response_model=List[int])
def vendor_available_years(
    branch_code: str = Query(...),
    db: Session = Depends(get_db),
):
    try:
        return BranchAdminExpenseDash_controller.get_branch_vendor_available_years(db, branch_code)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))    