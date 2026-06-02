import json
from sqlalchemy.orm import Session
from datetime import datetime
from typing import List, Dict, Optional
from fastapi import HTTPException

from app.models import expenseAddingData_model as models


# ---------- Branch KM Rate Functions ----------
def get_all_branch_km_rates(db: Session):
    """Get all branch KM rates with DA details"""
    return db.query(models.BranchKMRate).all()


def get_branch_km_rate(db: Session, branch_code: str):
    """Get KM rate for a specific branch"""
    return db.query(models.BranchKMRate).filter(
        models.BranchKMRate.branch_code == branch_code
    ).first()


def create_or_update_branch_km_rate(db: Session, branch_code: str, branch_name: str,
                                    data: Dict, created_by: str):
    """Create or update the per-branch rate master (2×2 slabs)."""
    fields = dict(
        km_threshold     = data.get('km_threshold', 100.0),
        single_low_rate  = data.get('single_low_rate', 0.0),
        single_low_da    = data.get('single_low_da', 0.0),
        multi_low_rate   = data.get('multi_low_rate', 0.0),
        multi_low_da     = data.get('multi_low_da', 0.0),
        single_high_rate = data.get('single_high_rate', 0.0),
        single_high_da   = data.get('single_high_da', 0.0),
        multi_high_rate  = data.get('multi_high_rate', 0.0),
        multi_high_da    = data.get('multi_high_da', 0.0),
    )

    existing = get_branch_km_rate(db, branch_code)
    if existing:
        for k, v in fields.items():
            setattr(existing, k, v)
        existing.updated_by = created_by
        existing.updated_at = datetime.now()
        db.commit()
        db.refresh(existing)
        return existing

    new_rate = models.BranchKMRate(
        branch_code=branch_code,
        branch_name=branch_name,
        created_by=created_by,
        **fields,
    )
    db.add(new_rate)
    db.commit()
    db.refresh(new_rate)
    return new_rate


def save_all_branch_km_rates(db: Session, rates_data: List[Dict], created_by: str):
    """Save all branch rate masters at once."""
    saved_rates = []
    for rate_data in rates_data:
        saved_rates.append(create_or_update_branch_km_rate(
            db,
            rate_data['branch_code'],
            rate_data['branch_name'],
            rate_data,
            created_by,
        ))
    return saved_rates


# ---------- Expense Head Functions ----------
def get_all_expense_heads(db: Session, include_inactive: bool = False):
    """Get all expense heads with their subheads"""
    query = db.query(models.ExpenseHead)
    if not include_inactive:
        query = query.filter(models.ExpenseHead.is_active == True)
    return query.all()


def get_expense_head(db: Session, head_id: int):
    """Get expense head by ID"""
    return db.query(models.ExpenseHead).filter(models.ExpenseHead.id == head_id).first()


def create_expense_head(db: Session, name: str, created_by: str):
    """Create a new expense head"""
    existing = db.query(models.ExpenseHead).filter(
        models.ExpenseHead.name == name,
        models.ExpenseHead.is_active == True
    ).first()
    
    if existing:
        raise HTTPException(status_code=400, detail="Expense head with this name already exists")
    
    new_head = models.ExpenseHead(
        name=name,
        subheads=json.dumps([]),
        created_by=created_by
    )
    db.add(new_head)
    db.commit()
    db.refresh(new_head)
    return new_head


def update_expense_head(db: Session, head_id: int, name: str, updated_by: str):
    """Update expense head name"""
    head = get_expense_head(db, head_id)
    if not head:
        raise HTTPException(status_code=404, detail="Expense head not found")
    
    head.name = name
    head.updated_by = updated_by
    db.commit()
    db.refresh(head)
    return head


def delete_expense_head(db: Session, head_id: int):
    """Soft delete expense head"""
    head = get_expense_head(db, head_id)
    if not head:
        raise HTTPException(status_code=404, detail="Expense head not found")
    
    head.is_active = False
    db.commit()
    return {"message": "Expense head deleted successfully"}


# ---------- Subhead Functions ----------
def add_subhead(db: Session, head_id: int, subhead_name: str, created_by: str):
    """Add a subhead to an expense head"""
    head = get_expense_head(db, head_id)
    if not head:
        raise HTTPException(status_code=404, detail="Expense head not found")
    
    subheads = json.loads(head.subheads) if head.subheads else []
    subheads.append({"id": len(subheads) + 1, "name": subhead_name})
    head.subheads = json.dumps(subheads)
    head.updated_by = created_by
    head.updated_at = datetime.now()
    
    db.commit()
    db.refresh(head)
    return head


def update_subhead(db: Session, head_id: int, subhead_id: int, subhead_name: str, updated_by: str):
    """Update a subhead name"""
    head = get_expense_head(db, head_id)
    if not head:
        raise HTTPException(status_code=404, detail="Expense head not found")
    
    subheads = json.loads(head.subheads) if head.subheads else []
    for subhead in subheads:
        if subhead.get("id") == subhead_id:
            subhead["name"] = subhead_name
            break
    
    head.subheads = json.dumps(subheads)
    head.updated_by = updated_by
    head.updated_at = datetime.now()
    
    db.commit()
    db.refresh(head)
    return head


def delete_subhead(db: Session, head_id: int, subhead_id: int, updated_by: str):
    """Delete a subhead from an expense head"""
    head = get_expense_head(db, head_id)
    if not head:
        raise HTTPException(status_code=404, detail="Expense head not found")
    
    subheads = json.loads(head.subheads) if head.subheads else []
    subheads = [sh for sh in subheads if sh.get("id") != subhead_id]
    head.subheads = json.dumps(subheads)
    head.updated_by = updated_by
    head.updated_at = datetime.now()
    
    db.commit()
    db.refresh(head)
    return head

# ---------- Branch Employee Functions ----------
def create_branch_employee(db: Session, employee_name: str, employee_id: str, employee_uid: str,
                            branch_code: str, branch_name: str, designation: str, 
                            created_by: str):
    existing = db.query(models.BranchEmployee).filter(
        models.BranchEmployee.employee_id == employee_id,
        models.BranchEmployee.is_active == True
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Employee with this ID already exists")
    
    new_emp = models.BranchEmployee(
        employee_name=employee_name,
        employee_id=employee_id,
        employee_uid=employee_uid,
        branch_code=branch_code,
        branch_name=branch_name,
        designation=designation,
        created_by=created_by
    )
    db.add(new_emp)
    db.commit()
    db.refresh(new_emp)
    return new_emp    

def update_branch_employee(db: Session, employee_id_pk: int, employee_name: str, 
                            employee_id: str, employee_uid: str, designation: str, updated_by: str):
    emp = db.query(models.BranchEmployee).filter(
        models.BranchEmployee.id == employee_id_pk,
        models.BranchEmployee.is_active == True
    ).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    
    # Check duplicate employee_id (excluding self)
    existing = db.query(models.BranchEmployee).filter(
        models.BranchEmployee.employee_id == employee_id,
        models.BranchEmployee.id != employee_id_pk,
        models.BranchEmployee.is_active == True
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Employee ID already exists")
    
    emp.employee_name = employee_name
    emp.employee_id = employee_id
    emp.employee_uid = employee_uid
    emp.designation = designation
    emp.updated_by = updated_by
    emp.updated_at = datetime.now()
    db.commit()
    db.refresh(emp)
    return emp


def delete_branch_employee(db: Session, employee_id_pk: int, updated_by: str):
    emp = db.query(models.BranchEmployee).filter(
        models.BranchEmployee.id == employee_id_pk,
        models.BranchEmployee.is_active == True
    ).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    
    emp.is_active = False
    emp.updated_by = updated_by
    emp.updated_at = datetime.now()
    db.commit()
    return {"message": "Employee deleted successfully"}    
