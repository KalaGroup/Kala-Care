from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from typing import Optional, List

from app.database import SessionLocal
from app.controllers.edit_customer_controller import EditCustomerController
from app.schemas import edit_customer_schema
from app.models.customer_model import Customer
from app.models.user_model import User

router = APIRouter(prefix="/edit-customer", tags=["Edit Customer History"])

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.post("/customers/{customer_id}/save-edit", response_model=edit_customer_schema.CustomerEditHistoryResponse)
async def save_customer_edit(
    customer_id: int,
    edit_request: edit_customer_schema.CustomerEditRequest,
    db: Session = Depends(get_db)
):
    """
    Save customer edit information WITHOUT modifying original customer data
    This preserves original data and only stores edited version in history table
    Subsequent edits will override the edited fields
    """
    # Check if customer exists
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Customer not found"
        )
    
    # Verify user exists
    user = db.query(User).filter(User.user_id == edit_request.user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Prepare edited data (only fields that were provided)
    edited_data = {}
    if edit_request.customer_name is not None:
        edited_data['customer_name'] = edit_request.customer_name
    if edit_request.phone_number is not None:
        edited_data['phone_number'] = edit_request.phone_number
    if edit_request.email is not None:
        edited_data['email'] = edit_request.email
    if edit_request.pan_number is not None:
        edited_data['pan_number'] = edit_request.pan_number
    if edit_request.location is not None:
        edited_data['location'] = edit_request.location
    
    # Create or update edit history
    controller = EditCustomerController(db)
    history_entry = controller.create_or_update_edit_history(
        customer_id=customer_id,
        edited_data=edited_data,
        user_id=edit_request.user_id,
        user_name=edit_request.user_name
    )
    
    return history_entry

@router.get("/customers/{customer_id}/history", response_model=edit_customer_schema.CustomerEditHistoryList)
async def get_customer_edit_history(
    customer_id: int,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db)
):
    """
    Get edit history for a specific customer
    """
    # Check if customer exists
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Customer not found"
        )
    
    controller = EditCustomerController(db)
    result = controller.get_customer_edit_history(
        customer_id=customer_id,
        page=page,
        limit=limit
    )
    
    return result

@router.get("/customers/{customer_id}/with-edit-info")
async def get_customer_with_edit_info(
    customer_id: int,
    db: Session = Depends(get_db)
):
    """
    Get customer details along with their edit information
    Shows original data (from customer table) and current edited data (from edit history)
    """
    controller = EditCustomerController(db)
    result = controller.get_customer_with_edit_info(customer_id)
    
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Customer not found"
        )
    
    return result

@router.get("/edited-customers", response_model=List[dict])
async def get_all_edited_customers(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db)
):
    """
    Get all customers that have been edited at least once
    """
    controller = EditCustomerController(db)
    result = controller.get_all_edited_customers(skip=skip, limit=limit)
    return result

@router.delete("/customers/{customer_id}/history/{history_id}")
async def delete_edit_history_entry(
    customer_id: int,
    history_id: int,
    db: Session = Depends(get_db)
):
    """
    Delete a specific edit history entry (admin only in frontend)
    """
    # Check if entry exists
    history_entry = db.query(CustomerEditHistory).filter(
        CustomerEditHistory.id == history_id,
        CustomerEditHistory.customer_id == customer_id
    ).first()
    
    if not history_entry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Edit history entry not found"
        )
    
    db.delete(history_entry)
    db.commit()
    
    return {"message": "Edit history entry deleted successfully"}

@router.get("/customers/{customer_id}/compare")
async def compare_original_and_edited(
    customer_id: int,
    db: Session = Depends(get_db)
):
    """
    Compare original customer data with current edited data
    Shows what fields have been changed
    """
    controller = EditCustomerController(db)
    result = controller.get_customer_with_edit_info(customer_id)
    
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Customer not found"
        )
    
    if not result['current_edited_data']:
        return {
            "message": "This customer has never been edited",
            "original": result['original_customer'],
            "changes": []
        }
    
    # Compare fields to show what's different
    original = result['original_customer']
    edited = result['current_edited_data']
    
    changes = []
    for field in ['customer_name', 'phone_number', 'email', 'pan_number', 'location']:
        if original.get(field) != edited.get(field):
            changes.append({
                "field": field,
                "original": original.get(field),
                "edited": edited.get(field)
            })
    
    return {
        "original": original,
        "edited": edited,
        "changes": changes,
        "last_edited_by": result['last_edited_by'],
        "last_edited_at": result['last_edited_at'],
        "total_edits": result['total_edits']
    }