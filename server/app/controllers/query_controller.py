from sqlalchemy.orm import Session
from sqlalchemy import desc
from app.models.query_model import EmployeeQuery
from typing import List, Dict, Any

def create_query(db: Session, user_id: str, user_name: str, subject: str, query_text: str) -> Dict[str, Any]:
    """Create a new employee query"""
    try:
        db_query = EmployeeQuery(
            user_id=user_id,
            user_name=user_name,
            subject=subject,
            query=query_text
        )
        db.add(db_query)
        db.commit()
        db.refresh(db_query)
        return {"success": True, "query": db_query.to_dict()}
    except Exception as e:
        db.rollback()
        return {"success": False, "error": str(e)}

def get_all_queries(db: Session) -> List[Dict[str, Any]]:
    """Get all queries for admin"""
    try:
        queries = db.query(EmployeeQuery).order_by(
            desc(EmployeeQuery.created_at)
        ).all()
        return [q.to_dict() for q in queries]
    except Exception as e:
        print(f"Error in get_all_queries: {e}")
        return []

def get_user_queries(db: Session, user_id: str) -> List[Dict[str, Any]]:
    """Get queries for a specific user"""
    try:
        queries = db.query(EmployeeQuery).filter(
            EmployeeQuery.user_id == user_id
        ).order_by(desc(EmployeeQuery.created_at)).all()
        return [q.to_dict() for q in queries]
    except Exception as e:
        print(f"Error in get_user_queries: {e}")
        return []

def delete_query(db: Session, query_id: int, user_id: str, is_admin: bool = False) -> Dict[str, Any]:
    """Delete a query - admin can delete any, users can only delete their own"""
    try:
        query = db.query(EmployeeQuery).filter(
            EmployeeQuery.id == query_id
        ).first()
        
        if not query:
            return {"success": False, "error": "Query not found"}
        
        # Check permission
        if not is_admin and query.user_id != user_id:
            return {"success": False, "error": "You don't have permission to delete this query"}
        
        db.delete(query)
        db.commit()
        return {"success": True, "message": "Query deleted successfully"}
    except Exception as e:
        db.rollback()
        return {"success": False, "error": str(e)}

def resolve_query(db: Session, query_id: int, user_id: str, is_admin: bool = False) -> Dict[str, Any]:
    """Mark query as resolved/unresolved - admin only"""
    if not is_admin:
        return {"success": False, "error": "Admin permission required"}
    
    try:
        query = db.query(EmployeeQuery).filter(
            EmployeeQuery.id == query_id
        ).first()
        
        if not query:
            return {"success": False, "error": "Query not found"}
        
        query.is_resolved = not query.is_resolved
        db.commit()
        
        status = "resolved" if query.is_resolved else "unresolved"
        return {"success": True, "message": f"Query marked as {status}"}
    except Exception as e:
        db.rollback()
        return {"success": False, "error": str(e)}