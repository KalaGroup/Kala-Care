from fastapi import APIRouter, Depends, HTTPException, status, Header, UploadFile, File
from sqlalchemy.orm import Session
from typing import List
from app.database import SessionLocal
from app.controllers.user_controller import UserController
from app.schemas.user_schema import (
    UserCreate, UserLogin, 
    UserUpdate, UserProfileUpdate, 
    UserRoleUpdate, BulkUserCreate
)
from app.models.user_model import User, UserRole 
from fastapi.responses import JSONResponse, StreamingResponse
import pandas as pd
import io
import csv

router = APIRouter(prefix="/api/users", tags=["users"])

# Dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.post("/login")
def login(user_login: UserLogin, db: Session = Depends(get_db)):
    """Login endpoint for users - only requires user_id and password"""
    try:
        user = UserController.authenticate_user(
            db, 
            user_login.user_id, 
            user_login.password
        )
        
        if not user:
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content={
                    "success": False,
                    "message": "Invalid credentials or account is blocked"
                }
            )
        
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content={
                "success": True,
                "message": "Login successful",
                "user": {
                    "id": user.id,
                    "user_id": user.user_id,
                    "name": user.name,
                    "branch": user.branch,
                    "branch_name": user.branch_name,
                    "role": user.role.value if hasattr(user.role, 'value') else user.role,
                    "is_blocked": user.is_blocked,
                    "can_export": user.can_export,
                    "can_access_expense": user.can_access_expense,
                    "branches": [
                        {
                            "id": ba.id,
                            "branch": ba.branch,
                            "branch_name": ba.branch_name,
                            "is_primary": ba.is_primary
                        }
                        for ba in user._branch_accesses
                    ]
                }
            }
        )
        
    except Exception as e:
        print(f"Login error: {str(e)}")
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "success": False,
                "message": "Internal server error"
            }
        )

@router.post("/employees")
def create_employee(
    employee: UserCreate, 
    user_id: str = Header(...), 
    db: Session = Depends(get_db)
):
    """Create a new employee (admin only)"""
    try:
        # Check if requester is admin (Master Admin or IT Admin)
        admin = UserController.get_user_by_id(db, user_id)
        if not admin or admin.role not in ["master_admin", "it_admin"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only Master Admins and IT Admins can create employees"
            )
        
        new_employee = UserController.create_user(db, employee, user_id)
        
        return JSONResponse(
            status_code=status.HTTP_201_CREATED,
            content={
                "success": True,
                "message": "Employee created successfully",
                "employee": {
                    "id": new_employee.id,
                    "user_id": new_employee.user_id,
                    "name": new_employee.name,
                    "branch": new_employee.branch,
                    "branch_name": new_employee.branch_name,
                    "role": new_employee.role.value if hasattr(new_employee.role, 'value') else new_employee.role,
                    "is_blocked": new_employee.is_blocked,
                    "can_export": new_employee.can_export
                }
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error creating employee: {str(e)}"
        )

@router.post("/employees/bulk-import")
async def bulk_import_employees(
    file: UploadFile = File(...),
    user_id: str = Header(...),
    db: Session = Depends(get_db)
):
    """Bulk import employees from Excel/CSV file"""
    try:
        admin = UserController.get_user_by_id(db, user_id)
        if not admin or admin.role not in ["master_admin", "it_admin"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only Master Admins and IT Admins can import employees"
            )
        
        contents = await file.read()
        
        if file.filename.endswith('.csv'):
            df = pd.read_csv(io.BytesIO(contents))
        elif file.filename.endswith(('.xlsx', '.xls')):
            df = pd.read_excel(io.BytesIO(contents))
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only CSV and Excel files are supported"
            )
        
        # Check required columns
        required_columns = ['ECode', 'EmpName', 'Branch Code', 'Branch Name', 'Sim Number', 'Password']
        missing_columns = [col for col in required_columns if col not in df.columns]
        
        if missing_columns:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Missing required columns: {', '.join(missing_columns)}"
            )
        
        created_count = 0
        updated_count = 0
        errors = []
        
        for index, row in df.iterrows():
            try:
                ecode = str(row['ECode']).strip() if pd.notna(row['ECode']) else ''
                emp_name = str(row['EmpName']).strip() if pd.notna(row['EmpName']) else ''
                branch_code = str(row['Branch Code']).strip() if pd.notna(row['Branch Code']) else ''
                branch_name = str(row['Branch Name']).strip() if pd.notna(row['Branch Name']) else ''

                # Convert Sim Number to string and remove .0 if present
                sim_number_raw = row['Sim Number']
                if pd.notna(sim_number_raw):
                    sim_number = str(sim_number_raw).strip()
                    if sim_number.endswith('.0'):
                        sim_number = sim_number[:-2]
                else:
                    sim_number = ''

                # Read password from file
                password_raw = row['Password']
                password = str(password_raw).strip() if pd.notna(password_raw) and str(password_raw).strip() != '' else ''

                # Validate required fields per row
                if not ecode or ecode == 'nan':
                    errors.append(f"Row {index + 2}: ECode is missing")
                    continue

                if not emp_name or emp_name == 'nan':
                    errors.append(f"Row {index + 2}: EmpName is missing")
                    continue

                if not branch_code or branch_code == 'nan':
                    errors.append(f"Row {index + 2}: Branch Code is missing")
                    continue

                if not password or password == 'nan':
                    errors.append(f"Row {index + 2}: Password is missing")
                    continue

                # Check if user exists by ECode (user_id)
                existing_user = db.query(User).filter(User.user_id == ecode).first()
                
                if existing_user:
                    # UPDATE existing user including password
                    existing_user.name = emp_name
                    existing_user.branch = branch_code
                    existing_user.branch_name = branch_name
                    existing_user.mobile_number = sim_number
                    existing_user.password = UserController.hash_password(password)
                    updated_count += 1
                else:
                    # CREATE new user with password from file
                    hashed_password = UserController.hash_password(password)
                    new_user = User(
                        user_id=ecode,
                        name=emp_name,
                        branch=branch_code,
                        branch_name=branch_name,
                        mobile_number=sim_number,
                        password=hashed_password,
                        role=UserRole.EMPLOYEE,
                        is_blocked=False,
                        can_export=False
                    )
                    db.add(new_user)
                    created_count += 1
                
                db.commit()
                
            except Exception as e:
                db.rollback()
                errors.append(f"Row {index + 2}: {str(e)}")
        
        return JSONResponse(
            status_code=status.HTTP_201_CREATED,
            content={
                "success": True,
                "message": f"Imported {created_count} new employees, updated {updated_count} existing employees",
                "created_count": created_count,
                "updated_count": updated_count,
                "error_count": len(errors),
                "errors": errors if errors else None
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error importing employees: {str(e)}"
        )

@router.get("/employees/export")
def export_employees(
    user_id: str = Header(...),
    db: Session = Depends(get_db)
):
    """Export employees to CSV (Master Admin and IT Admin only)"""
    try:
        # Check if user is Master Admin or IT Admin
        admin = UserController.get_user_by_id(db, user_id)
        if not admin or admin.role not in ["master_admin", "it_admin"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only Master Admins and IT Admins can export employees"
            )
        
        # Get all employees
        employees = UserController.get_all_employees(db, user_id)
        
        # Create CSV in memory
        output = io.StringIO()
        writer = csv.writer(output)
        
        # Write header - Use S.No instead of ID
        writer.writerow(['S.No', 'Employee Name', 'Employee Code', 'Branch Code', 'Branch Name', 'Mobile Number', 'Role', 'Blocked', 'Can Export'])
        
        # Write data with serial number starting from 1
        for idx, emp in enumerate(employees, start=1):
            writer.writerow([
                idx,  # S.No starting from 1
                emp.name,
                emp.user_id,
                emp.branch,
                emp.branch_name or '',
                emp.mobile_number or '',
                emp.role.value if hasattr(emp.role, 'value') else emp.role,
                'Yes' if emp.is_blocked else 'No',
                'Yes' if emp.can_export else 'No'
            ])
        
        output.seek(0)
        
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=employees_export.csv"}
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error exporting employees: {str(e)}"
        )

@router.get("/employees")
def get_all_employees(
    user_id: str = Header(...), 
    db: Session = Depends(get_db)
):
    """Get all employees based on admin role"""
    try:
        employees = UserController.get_all_employees(db, user_id)
        
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content={
                "success": True,
                "employees": [
                    {
                        "id": emp.id,
                        "user_id": emp.user_id,
                        "name": emp.name,
                        "branch": emp.branch,
                        "branch_name": emp.branch_name,
                        "mobile_number": emp.mobile_number or '',  # Make sure this is included
                        "role": emp.role.value if hasattr(emp.role, 'value') else emp.role,
                        "is_blocked": emp.is_blocked,
                        "can_export": emp.can_export,
                        "can_access_expense": emp.can_access_expense
                    }
                    for emp in employees
                ]
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error retrieving employees: {str(e)}"
        )

@router.put("/employees/{employee_id}")
def update_employee(
    employee_id: int,
    employee_update: UserUpdate,
    user_id: str = Header(...),
    db: Session = Depends(get_db)
):
    """Update an employee (admin only)"""
    try:
        updated_employee = UserController.update_employee(db, employee_id, user_id, employee_update)
        
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content={
                "success": True,
                "message": "Employee updated successfully",
                "employee": {
                    "id": updated_employee.id,
                    "user_id": updated_employee.user_id,
                    "name": updated_employee.name,
                    "branch": updated_employee.branch,
                    "branch_name": updated_employee.branch_name,
                    "role": updated_employee.role.value if hasattr(updated_employee.role, 'value') else updated_employee.role,
                    "is_blocked": updated_employee.is_blocked,
                    "can_export": updated_employee.can_export,
                    "can_access_expense": updated_employee.can_access_expense
                }
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error updating employee: {str(e)}"
        )

@router.delete("/employees/{employee_id}")
def delete_employee(
    employee_id: int,
    user_id: str = Header(...),
    db: Session = Depends(get_db)
):
    """Delete an employee (Master Admin and IT Admin only)"""
    try:
        UserController.delete_employee(db, employee_id, user_id)
        
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content={
                "success": True,
                "message": "Employee deleted successfully"
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error deleting employee: {str(e)}"
        )

@router.put("/employees/{employee_id}/role")
def update_employee_role(
    employee_id: int,
    role_update: UserRoleUpdate,
    user_id: str = Header(...),
    db: Session = Depends(get_db)
):
    """Update employee role (Master Admin and IT Admin only)"""
    try:
        # Check if user is Master Admin or IT Admin
        admin = UserController.get_user_by_id(db, user_id)
        if not admin or admin.role not in ["master_admin", "it_admin"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only Master Admins and IT Admins can update user roles"
            )
        
        updated_employee = UserController.update_user_role(db, employee_id, user_id, role_update)
        
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content={
                "success": True,
                "message": "Employee role updated successfully",
                "employee": {
                    "id": updated_employee.id,
                    "user_id": updated_employee.user_id,
                    "name": updated_employee.name,
                    "branch": updated_employee.branch,
                    "branch_name": updated_employee.branch_name,
                    "role": updated_employee.role.value if hasattr(updated_employee.role, 'value') else updated_employee.role,
                    "is_blocked": updated_employee.is_blocked,
                    "can_export": updated_employee.can_export
                }
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error updating employee role: {str(e)}"
        )

@router.put("/employees/{employee_id}/block")
def toggle_block_employee(
    employee_id: int,
    block_status: dict,
    user_id: str = Header(...),
    db: Session = Depends(get_db)
):
    """Toggle employee block status (Master Admin, IT Admin, and Branch Admin)"""
    try:
        updated_employee = UserController.toggle_block_employee(
            db, employee_id, user_id, block_status.get('is_blocked', False)
        )
        
        status_text = "blocked" if updated_employee.is_blocked else "unblocked"
        
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content={
                "success": True,
                "message": f"Employee {status_text} successfully",
                "employee": {
                    "id": updated_employee.id,
                    "is_blocked": updated_employee.is_blocked
                }
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error toggling employee block status: {str(e)}"
        )

@router.put("/employees/{employee_id}/export")
def toggle_export_permission(
    employee_id: int,
    export_status: dict,
    user_id: str = Header(...),
    db: Session = Depends(get_db)
):
    """Toggle employee export permission (Master Admin and IT Admin only)"""
    try:
        updated_employee = UserController.toggle_export_permission(
            db, employee_id, user_id, export_status.get('can_export', False)
        )
        
        status_text = "granted" if updated_employee.can_export else "revoked"
        
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content={
                "success": True,
                "message": f"Export permission {status_text} successfully",
                "employee": {
                    "id": updated_employee.id,
                    "can_export": updated_employee.can_export
                }
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error toggling export permission: {str(e)}"
        )

@router.put("/profile")
def update_profile(
    profile_update: UserProfileUpdate,
    user_id: str = Header(...),
    db: Session = Depends(get_db)
):
    """Update user's own profile"""
    try:
        updated_user = UserController.update_profile(db, user_id, profile_update)
        
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content={
                "success": True,
                "message": "Profile updated successfully",
                "user": {
                    "id": updated_user.id,
                    "user_id": updated_user.user_id,
                    "name": updated_user.name,
                    "branch": updated_user.branch,
                    "branch_name": updated_user.branch_name,
                    "role": updated_user.role.value if hasattr(updated_user.role, 'value') else updated_user.role,
                    "is_blocked": updated_user.is_blocked,
                    "can_export": updated_user.can_export
                }
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error updating profile: {str(e)}"
        )

@router.get("/profile")
def get_profile(
    user_id: str = Header(...),
    db: Session = Depends(get_db)
):
    """Get user's own profile"""
    try:
        user = UserController.get_user_by_id(db, user_id)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content={
                "success": True,
                "user": {
                    "id": user.id,
                    "user_id": user.user_id,
                    "name": user.name,
                    "branch": user.branch,
                    "branch_name": user.branch_name,
                    "role": user.role.value if hasattr(user.role, 'value') else user.role,
                    "is_blocked": user.is_blocked,
                    "can_export": user.can_export,
                    "can_access_expense": user.can_access_expense
                }
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error retrieving profile: {str(e)}"
        )

@router.get("/employees/{employee_user_id}/branches")
def list_employee_branches(employee_user_id: str,
                           user_id: str = Header(...),
                           db: Session = Depends(get_db)):
    admin = UserController.get_user_by_id(db, user_id)
    if not admin or admin.role not in ["master_admin", "it_admin", "branch_admin"]:
        raise HTTPException(403, "Not allowed")
    branches = UserController.get_user_branches(db, employee_user_id)
    return {
        "success": True,
        "branches": [
            {"id": b.id, "branch": b.branch, "branch_name": b.branch_name,
             "is_primary": b.is_primary}
            for b in branches
        ]
    }

@router.post("/employees/{employee_user_id}/branches")
def add_employee_branch(employee_user_id: str,
                        payload: dict,
                        user_id: str = Header(...),
                        db: Session = Depends(get_db)):
    access = UserController.add_branch_access(
        db, employee_user_id,
        payload.get("branch"), payload.get("branch_name"), user_id
    )
    return {"success": True, "branch": {
        "id": access.id, "branch": access.branch,
        "branch_name": access.branch_name, "is_primary": access.is_primary
    }}

@router.delete("/employees/branch-access/{access_id}")
def remove_employee_branch(access_id: int,
                           user_id: str = Header(...),
                           db: Session = Depends(get_db)):
    UserController.remove_branch_access(db, access_id, user_id)
    return {"success": True, "message": "Branch access removed"}

@router.put("/employees/{employee_user_id}/primary-branch")
def set_primary_branch_route(employee_user_id: str,
                             payload: dict,
                             user_id: str = Header(...),
                             db: Session = Depends(get_db)):
    UserController.set_primary_branch(db, employee_user_id,
                                      payload.get("branch"), user_id)
    return {"success": True, "message": "Primary branch updated"}        
    
@router.put("/employees/{employee_id}/expense-access")
def toggle_expense_access(
    employee_id: int,
    expense_status: dict,
    user_id: str = Header(...),
    db: Session = Depends(get_db)
):
    """Toggle employee expense access permission (Master Admin and IT Admin only)"""
    try:
        admin = UserController.get_user_by_id(db, user_id)
        if not admin or admin.role not in ["master_admin", "it_admin"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only Master Admins and IT Admins can change expense access"
            )

        employee = db.query(User).filter(User.id == employee_id).first()
        if not employee:
            raise HTTPException(status_code=404, detail="Employee not found")

        employee.can_access_expense = expense_status.get('can_access_expense', False)
        db.commit()
        db.refresh(employee)

        status_text = "granted" if employee.can_access_expense else "revoked"
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content={
                "success": True,
                "message": f"Expense access {status_text} successfully",
                "employee": {
                    "id": employee.id,
                    "can_access_expense": employee.can_access_expense
                }
            }
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error toggling expense access: {str(e)}"
        )    