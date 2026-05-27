from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from typing import List, Dict, Any
from pydantic import BaseModel
import logging

from app.database import SessionLocal
from app.controllers.query_controller import (
    create_query,
    get_all_queries,
    get_user_queries,
    delete_query,
    resolve_query
)
from app.models.user_model import User, UserRole
from app.models.query_model import EmployeeQuery


router = APIRouter(prefix="/api/queries", tags=["queries"])

# Dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Pydantic models
class QueryCreate(BaseModel):
    subject: str
    query: str

class QueryResponse(BaseModel):
    id: int
    user_id: str
    user_name: str
    subject: str
    query: str
    created_at: str
    is_resolved: bool

    class Config:
        from_attributes = True

# Helper functions
def is_admin(role: str) -> bool:
    """Check if user role is any type of admin"""
    admin_roles = ["master_admin", "it_admin", "branch_admin"]
    result = role in admin_roles
    return result

def can_view_all_queries(role: str) -> bool:
    """Check if user can view all queries (Master Admin or IT Admin)"""
    result = role in ["master_admin", "it_admin"]
    return result

# Routes
@router.post("/create")
async def create_query_endpoint(
    request: Request,
    query_data: QueryCreate,
    db: Session = Depends(get_db)
):
    """Create a new employee query"""
    # Get user info from headers
    user_id = request.headers.get("user-id")
    user_name = request.headers.get("user-name")
    user_role = request.headers.get("user-role")
        
    if not user_id or not user_name:
        raise HTTPException(status_code=400, detail="User information missing")
    
    result = create_query(
        db=db,
        user_id=user_id,
        user_name=user_name,
        subject=query_data.subject,
        query_text=query_data.query
    )
    
    if result["success"]:
        return {"success": True, "query": result["query"]}
    else:
        raise HTTPException(status_code=500, detail=result["error"])

@router.get("/all")
async def get_all_queries_endpoint(
    request: Request,
    db: Session = Depends(get_db)
):
    """Get all queries - Master Admin, IT Admin, and Branch Admin (filtered by branch)"""
    user_id = request.headers.get("user-id")
    user_role = request.headers.get("user-role")
    
    
    # Check if user exists and is admin
    if not user_id:
        raise HTTPException(status_code=400, detail="User ID missing")
    
    if not user_role:
        raise HTTPException(status_code=400, detail="User role missing")
    
    if not is_admin(user_role):
        raise HTTPException(status_code=403, detail=f"Admin access required. Your role: {user_role}")
    
    # Get user from database to check branch
    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Get queries based on role
    if can_view_all_queries(user_role):
        # Master Admin and IT Admin can see all queries
        queries = get_all_queries(db)
    else:
        # Branch Admin can only see queries from users in their branch
        # Get all users in the same branch
        branch_users = db.query(User).filter(User.branch == user.branch).all()
        branch_user_ids = [u.user_id for u in branch_users]
        
        # Get queries from branch users only
        from sqlalchemy import desc
        queries = db.query(EmployeeQuery).filter(
            EmployeeQuery.user_id.in_(branch_user_ids)
        ).order_by(desc(EmployeeQuery.created_at)).all()
        queries = [q.to_dict() for q in queries]
    
    return queries

@router.get("/my-queries")
async def get_my_queries_endpoint(
    request: Request,
    db: Session = Depends(get_db)
):
    """Get queries for the logged-in user"""
    user_id = request.headers.get("user-id")
    
    if not user_id:
        raise HTTPException(status_code=400, detail="User ID missing")
    
    queries = get_user_queries(db, user_id)
    return {"success": True, "queries": queries}

@router.delete("/{query_id}")
async def delete_query_endpoint(
    query_id: int,
    request: Request,
    db: Session = Depends(get_db)
):
    """Delete a query"""
    user_id = request.headers.get("user-id")
    user_role = request.headers.get("user-role", "user")
    
    if not user_id:
        raise HTTPException(status_code=400, detail="User ID missing")
    
    is_admin_user = is_admin(user_role)
    
    # For Branch Admin, check if the query belongs to their branch
    if user_role == "branch_admin":
        # Get the user to check branch
        user = db.query(User).filter(User.user_id == user_id).first()
        if user:
            # Get the query
            query = db.query(EmployeeQuery).filter(EmployeeQuery.id == query_id).first()
            if query:
                # Get the query owner's branch
                query_user = db.query(User).filter(User.user_id == query.user_id).first()
                if query_user and query_user.branch != user.branch:
                    raise HTTPException(status_code=403, detail="Branch admins can only delete queries from their branch")
    
    result = delete_query(db, query_id, user_id, is_admin_user)
    
    if result["success"]:
        return result
    else:
        status_code = 403 if "permission" in result.get("error", "").lower() else 404
        raise HTTPException(status_code=status_code, detail=result["error"])

@router.put("/{query_id}/toggle-resolve")
async def toggle_resolve_query_endpoint(
    query_id: int,
    request: Request,
    db: Session = Depends(get_db)
):
    """Toggle query resolved status - Admin only"""
    user_role = request.headers.get("user-role")
    user_id = request.headers.get("user-id")
    
    
    if not is_admin(user_role):
        raise HTTPException(status_code=403, detail=f"Admin access required. Your role: {user_role}")
    
    # For Branch Admin, check if the query belongs to their branch
    if user_role == "branch_admin":
        # Get the user to check branch
        user = db.query(User).filter(User.user_id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        # Get the query
        query = db.query(EmployeeQuery).filter(EmployeeQuery.id == query_id).first()
        if query:
            # Get the query owner's branch
            query_user = db.query(User).filter(User.user_id == query.user_id).first()
            if query_user and query_user.branch != user.branch:
                raise HTTPException(status_code=403, detail="Branch admins can only resolve queries from their branch")
    
    result = resolve_query(db, query_id, user_id, True)
    
    if result["success"]:
        return result
    else:
        raise HTTPException(status_code=404, detail=result["error"])