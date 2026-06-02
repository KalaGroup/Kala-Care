from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Dict, Optional
from pydantic import BaseModel
from datetime import datetime

from app.database import SessionLocal
from app.controllers import expenseAddingData_controller as controller

router = APIRouter(prefix="/expense", tags=["Expense Management"])

class BranchEmployeeSchema(BaseModel):
    employee_name: str
    employee_id: str
    designation: str
    employee_uid: Optional[str] = None

class BranchEmployeeResponse(BaseModel):
    id: int
    employee_name: str
    employee_id: str
    employee_uid: Optional[str] = None
    branch_code: str
    branch_name: str
    designation: str
    is_active: bool
    created_at: datetime
    class Config:
        from_attributes = True

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ---------- Pydantic Schemas ----------
class BranchKMRateSchema(BaseModel):
    branch_code: str
    branch_name: str
    km_threshold: float = 100.0
    single_low_rate: float = 0.0
    single_low_da: float = 0.0
    multi_low_rate: float = 0.0
    multi_low_da: float = 0.0
    single_high_rate: float = 0.0
    single_high_da: float = 0.0
    multi_high_rate: float = 0.0
    multi_high_da: float = 0.0


class BranchKMRateResponse(BaseModel):
    id: int
    branch_code: str
    branch_name: str
    km_threshold: float
    single_low_rate: float
    single_low_da: float
    multi_low_rate: float
    multi_low_da: float
    single_high_rate: float
    single_high_da: float
    multi_high_rate: float
    multi_high_da: float
    created_at: datetime

    class Config:
        from_attributes = True


class ExpenseHeadSchema(BaseModel):
    name: str


class ExpenseHeadResponse(BaseModel):
    id: int
    name: str
    subheads: List[Dict] = []
    is_active: bool
    created_at: datetime
    
    class Config:
        from_attributes = True


class SubheadSchema(BaseModel):
    name: str


# ---------- Branch KM Rate Routes ----------
@router.get("/branch-km-rates", response_model=List[BranchKMRateResponse])
def get_branch_km_rates(db: Session = Depends(get_db)):
    """Get all branch KM rates"""
    return controller.get_all_branch_km_rates(db)


@router.post("/branch-km-rates/bulk")
def save_bulk_km_rates(
    rates: List[BranchKMRateSchema],
    created_by: str = Query(...),
    db: Session = Depends(get_db)
):
    """Save all branch KM rates at once"""
    rates_data = [rate.dict() for rate in rates]
    saved_rates = controller.save_all_branch_km_rates(db, rates_data, created_by)
    return {"message": f"Saved {len(saved_rates)} branch KM rates", "data": saved_rates}


# ---------- Expense Head Routes ----------
@router.get("/expense-heads", response_model=List[ExpenseHeadResponse])
def get_expense_heads(include_inactive: bool = False, db: Session = Depends(get_db)):
    """Get all expense heads with their subheads"""
    heads = controller.get_all_expense_heads(db, include_inactive)
    result = []
    for head in heads:
        import json
        subheads = json.loads(head.subheads) if head.subheads else []
        result.append({
            "id": head.id,
            "name": head.name,
            "subheads": subheads,
            "is_active": head.is_active,
            "created_at": head.created_at
        })
    return result


@router.post("/expense-heads", response_model=ExpenseHeadResponse)
def create_expense_head(
    head_data: ExpenseHeadSchema,
    created_by: str = Query(...),
    db: Session = Depends(get_db)
):
    """Create a new expense head"""
    head = controller.create_expense_head(db, head_data.name, created_by)
    return {
        "id": head.id,
        "name": head.name,
        "subheads": [],
        "is_active": head.is_active,
        "created_at": head.created_at
    }


@router.put("/expense-heads/{head_id}", response_model=ExpenseHeadResponse)
def update_expense_head(
    head_id: int,
    head_data: ExpenseHeadSchema,
    updated_by: str = Query(...),
    db: Session = Depends(get_db)
):
    """Update an expense head"""
    head = controller.update_expense_head(db, head_id, head_data.name, updated_by)
    import json
    subheads = json.loads(head.subheads) if head.subheads else []
    return {
        "id": head.id,
        "name": head.name,
        "subheads": subheads,
        "is_active": head.is_active,
        "created_at": head.created_at
    }


@router.delete("/expense-heads/{head_id}")
def delete_expense_head(head_id: int, db: Session = Depends(get_db)):
    """Delete an expense head"""
    return controller.delete_expense_head(db, head_id)


# ---------- Subhead Routes ----------
@router.post("/expense-heads/{head_id}/subheads")
def add_subhead(
    head_id: int,
    subhead_data: SubheadSchema,
    created_by: str = Query(...),
    db: Session = Depends(get_db)
):
    """Add a subhead to an expense head"""
    head = controller.add_subhead(db, head_id, subhead_data.name, created_by)
    import json
    return {
        "message": "Subhead added successfully",
        "subheads": json.loads(head.subheads) if head.subheads else []
    }


@router.put("/expense-heads/{head_id}/subheads/{subhead_id}")
def update_subhead(
    head_id: int,
    subhead_id: int,
    subhead_data: SubheadSchema,
    updated_by: str = Query(...),
    db: Session = Depends(get_db)
):
    """Update a subhead"""
    head = controller.update_subhead(db, head_id, subhead_id, subhead_data.name, updated_by)
    import json
    return {
        "message": "Subhead updated successfully",
        "subheads": json.loads(head.subheads) if head.subheads else []
    }


@router.delete("/expense-heads/{head_id}/subheads/{subhead_id}")
def delete_subhead(
    head_id: int,
    subhead_id: int,
    updated_by: str = Query(...),
    db: Session = Depends(get_db)
):
    """Delete a subhead"""
    head = controller.delete_subhead(db, head_id, subhead_id, updated_by)
    import json
    return {
        "message": "Subhead deleted successfully",
        "subheads": json.loads(head.subheads) if head.subheads else []
    }

@router.post("/branch-employees", response_model=BranchEmployeeResponse)
def create_branch_employee(
    employee_data: BranchEmployeeSchema,
    branch_code: str = Query(...),
    created_by: str = Query(...),
    db: Session = Depends(get_db)
):
    branch_name = {
        'HO': 'Pune Office', '420435_1': 'Ch.Sambhaji Nagar',
        '420435_2': 'Ahilyanagar', '420435_3': 'Beed', '420435_4': 'Nanded',
        '420435_5': 'Babhaleshwar', '420435_6': 'Latur', '420435_7': 'Parbhani',
        '420435_8': 'Hubli', '420435_9': 'Belagavi', '420435_10': 'Hospet',
        '420435_11': 'Ballari', '420435_12': 'Bagalkot', '420435_13': 'Gulbarga',
        '420435_14': 'Bijapur'
    }.get(branch_code, branch_code)
    
    return controller.create_branch_employee(
        db, employee_data.employee_name, employee_data.employee_id, employee_data.employee_uid,
        branch_code, branch_name, employee_data.designation, created_by
    )    

@router.get("/branch-employees", response_model=List[BranchEmployeeResponse])
def get_branch_employees(
    branch_code: str = Query(...),
    db: Session = Depends(get_db)
):
    from app.models import expenseAddingData_model as models
    return db.query(models.BranchEmployee).filter(
        models.BranchEmployee.branch_code == branch_code,
        models.BranchEmployee.is_active == True
    ).order_by(models.BranchEmployee.created_at.desc()).all()

@router.put("/branch-employees/{employee_id}")
def update_branch_employee(
    employee_id: int,
    employee_data: BranchEmployeeSchema,
    updated_by: str = Query(...),
    db: Session = Depends(get_db)
):
    return controller.update_branch_employee(
        db, employee_id,
        employee_data.employee_name,
        employee_data.employee_id,
        employee_data.employee_uid,
        employee_data.designation,
        updated_by
    )

@router.delete("/branch-employees/{employee_id}")
def delete_branch_employee(
    employee_id: int,
    updated_by: str = Query(...),
    db: Session = Depends(get_db)
):
    return controller.delete_branch_employee(db, employee_id, updated_by)    

    