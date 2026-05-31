from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from typing import List, Optional

from app.database import SessionLocal
from app.controllers.engagement_controller import EngagementController
from app.schemas import engagement_schema
from app.models.user_model import User  # Add this import

router = APIRouter(prefix="/engagement", tags=["Engagement"])

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# ==================== Customer Engagement List ====================

@router.get("/customers", response_model=dict)
async def get_customer_engagement_list(
    from_date: Optional[str] = Query(None, description="From date (YYYY-MM-DD)"),
    to_date: Optional[str] = Query(None, description="To date (YYYY-MM-DD)"),
    db: Session = Depends(get_db)
):
    """Get ALL customers with their campaign engagement data - no pagination limits"""
    controller = EngagementController(db)
    
    result = controller.get_customer_engagement_list(from_date, to_date)
    
    return result

# ==================== Customer Details with Follow-ups ====================

@router.get("/customers/{customer_id}", response_model=dict)
async def get_customer_engagement_details(
    customer_id: int, 
    db: Session = Depends(get_db)
):
    """Get customer details with all follow-ups, service history and LMS data"""
    controller = EngagementController(db)
    data = controller.get_customer_engagement_details(customer_id)
    
    return data

# ==================== Follow-up Endpoints ====================

@router.get("/customers/{customer_id}/followups", response_model=List[dict])
async def get_customer_followups(
    customer_id: int, 
    db: Session = Depends(get_db)
):
    """Get all follow-ups for a customer"""
    controller = EngagementController(db)
    return controller.get_followups(customer_id)

@router.get("/followups/{followup_id}", response_model=dict)
async def get_followup(
    followup_id: int, 
    db: Session = Depends(get_db)
):
    """Get a single follow-up by ID"""
    controller = EngagementController(db)
    return controller.get_followup(followup_id)

@router.post("/customers/{customer_id}/followups", status_code=status.HTTP_201_CREATED, response_model=dict)
async def create_followup(
    customer_id: int, 
    followup: engagement_schema.FollowUpCreate, 
    db: Session = Depends(get_db)
):
    """Create a new follow-up for a customer"""
    controller = EngagementController(db)
    return controller.create_followup(customer_id, followup)

@router.put("/followups/{followup_id}", response_model=dict)
async def update_followup(
    followup_id: int, 
    followup: engagement_schema.FollowUpUpdate, 
    db: Session = Depends(get_db)
):
    """Update a follow-up"""
    controller = EngagementController(db)
    return controller.update_followup(followup_id, followup)

@router.delete("/followups/{followup_id}", response_model=dict)
async def delete_followup(
    followup_id: int, 
    db: Session = Depends(get_db)
):
    """Delete a follow-up"""
    controller = EngagementController(db)
    return controller.delete_followup(followup_id)

# ==================== Campaign Management ====================

@router.post("/campaigns/{campaign_id}/customers/{customer_id}", response_model=dict)
async def add_customer_to_campaign(
    campaign_id: int,
    customer_id: int,
    db: Session = Depends(get_db)
):
    """Add a customer to a campaign by adding their instance_id to campaign's asset_numbers"""
    controller = EngagementController(db)
    return controller.add_customer_to_campaign(campaign_id, customer_id)

@router.delete("/campaigns/{campaign_id}/customers/{customer_id}", response_model=dict)
async def remove_customer_from_campaign(
    campaign_id: int,
    customer_id: int,
    db: Session = Depends(get_db)
):
    """Remove a customer from a campaign by removing their instance_id from campaign's asset_numbers"""
    controller = EngagementController(db)
    return controller.remove_customer_from_campaign(campaign_id, customer_id)

# ==================== Follow-up Flags Info ====================

@router.get("/followup-flags", response_model=dict)
async def get_followup_flags():
    """Get information about follow-up flags"""
    return {
        "C1": {"days": 10, "description": "10 days follow-up"},
        "C2": {"days": 15, "description": "15 days follow-up"},
        "C3": {"days": 20, "description": "20 days follow-up"},
        "C4": {"days": 25, "description": "25 days follow-up"}
    }

# ==================== Activity Endpoints ====================

@router.get("/activities", response_model=List[dict])
async def get_all_activities(
    db: Session = Depends(get_db)
):
    """Get all activities (common for all customers)"""
    controller = EngagementController(db)
    return controller.get_activities()

@router.post("/activities", status_code=status.HTTP_201_CREATED, response_model=dict)
async def create_activity(
    activity: engagement_schema.ActivityCreate, 
    db: Session = Depends(get_db)
):
    """Create a new activity (common for all customers)"""
    controller = EngagementController(db)
    return controller.create_activity(activity)

@router.put("/activities/{activity_id}", response_model=dict)
async def update_activity(
    activity_id: int, 
    activity: engagement_schema.ActivityUpdate, 
    db: Session = Depends(get_db)
):
    """Update an activity"""
    controller = EngagementController(db)
    return controller.update_activity(activity_id, activity)

@router.delete("/activities/{activity_id}", response_model=dict)
async def delete_activity(
    activity_id: int, 
    db: Session = Depends(get_db)
):
    """Delete an activity"""
    controller = EngagementController(db)
    return controller.delete_activity(activity_id)


# ==================== RR Endpoints ====================

@router.get("/rr", response_model=List[dict])
async def get_all_rr(
    db: Session = Depends(get_db)
):
    """Get all RR entries (common for all customers)"""
    controller = EngagementController(db)
    return controller.get_rr()

@router.post("/rr", status_code=status.HTTP_201_CREATED, response_model=dict)
async def create_rr(
    rr: engagement_schema.RRCreate, 
    db: Session = Depends(get_db)
):
    """Create a new RR entry (common for all customers)"""
    controller = EngagementController(db)
    return controller.create_rr(rr)

@router.put("/rr/{rr_id}", response_model=dict)
async def update_rr(
    rr_id: int, 
    rr: engagement_schema.RRUpdate, 
    db: Session = Depends(get_db)
):
    """Update an RR entry"""
    controller = EngagementController(db)
    return controller.update_rr(rr_id, rr)

@router.delete("/rr/{rr_id}", response_model=dict)
async def delete_rr(
    rr_id: int, 
    db: Session = Depends(get_db)
):
    """Delete an RR entry"""
    controller = EngagementController(db)
    return controller.delete_rr(rr_id)

# ==================== Export Permission Check ====================
@router.get("/check-export-permission", response_model=dict)
async def check_export_permission(
    user_id: str = Query(..., description="User ID to check export permission"),
    db: Session = Depends(get_db)
):
    """Check if a user has export permission"""
    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Check if user is blocked
    if user.is_blocked:
        return {
            "user_id": user.user_id,
            "name": user.name,
            "role": user.role,
            "can_export": False,
            "is_blocked": True,
            "message": "User is blocked"
        }
    
    # User has export permission if they are admin OR have can_export=True
    can_export = bool(user.can_export)
    
    return {
        "user_id": user.user_id,
        "name": user.name,
        "role": user.role,
        "can_export": can_export,
        "is_blocked": user.is_blocked,
        "message": "Permission checked successfully"
    }

# ==================== Non-Campaign Customers Endpoint ====================

@router.get("/non-campaign-customers", response_model=dict)
async def get_non_campaign_customers(
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(20, ge=1, le=10000, description="Items per page"),
    search: Optional[str] = Query(None, description="Search instance_id / name / mobile / email"),
    from_date: Optional[str] = Query(None, description="From date (YYYY-MM-DD)"),
    to_date: Optional[str] = Query(None, description="To date (YYYY-MM-DD)"),
    completed_first: bool = Query(False, description="Put completed customers on top"),
    db: Session = Depends(get_db)
):
    """Get customers who are not in any campaign with their engagement data"""
    controller = EngagementController(db)
    
    result = controller.get_non_campaign_customers(
        page=page,
        limit=limit,
        search=search,
        from_date=from_date,
        to_date=to_date,
        completed_first=completed_first
    )
    
    return result    

@router.get("/customers/{customer_id}/non-followups", response_model=List[dict])
async def get_customer_non_followups(
    customer_id: int, 
    db: Session = Depends(get_db)
):
    """Get all non-follow-ups (other type) for a customer"""
    controller = EngagementController(db)
    return controller.get_customer_non_followups(customer_id)


@router.get("/non-followups/{non_followup_id}", response_model=dict)
async def get_non_followup(
    non_followup_id: int, 
    db: Session = Depends(get_db)
):
    """Get a single non-follow-up by ID"""
    controller = EngagementController(db)
    return controller.get_non_followup(non_followup_id)


@router.post("/customers/{customer_id}/non-followups", status_code=status.HTTP_201_CREATED, response_model=dict)
async def create_non_followup(
    customer_id: int, 
    non_followup: engagement_schema.NonFollowUpCreate, 
    db: Session = Depends(get_db)
):
    """Create a new non-follow-up (other type) with * as remark"""
    controller = EngagementController(db)
    return controller.create_non_followup(customer_id, non_followup)


@router.put("/non-followups/{non_followup_id}", response_model=dict)
async def update_non_followup(
    non_followup_id: int, 
    non_followup: engagement_schema.NonFollowUpUpdate, 
    db: Session = Depends(get_db)
):
    """Update a non-follow-up"""
    controller = EngagementController(db)
    return controller.update_non_followup(non_followup_id, non_followup)


@router.delete("/non-followups/{non_followup_id}", response_model=dict)
async def delete_non_followup(
    non_followup_id: int, 
    db: Session = Depends(get_db)
):
    """Delete a non-follow-up"""
    controller = EngagementController(db)
    return controller.delete_non_followup(non_followup_id)

@router.get("/csp-status", response_model=dict)
async def get_csp_status(
    branch_id: Optional[str] = Query(None, description="User branch id"),
    role: Optional[str] = Query(None, description="User role"),
    db: Session = Depends(get_db)
):
    """Get branch-wise CSP info rows with computed due dates"""
    controller = EngagementController(db)
    return controller.get_csp_status_for_branch(branch_id, role)    

@router.get("/campaigns/{campaign_id}/scripts/{script_index}", response_model=dict)
async def get_campaign_script_pdf(
    campaign_id: int,
    script_index: int,
    db: Session = Depends(get_db)
):
    """Fetch a single campaign script's PDF content on demand (lazy load)."""
    controller = EngagementController(db)
    return controller.get_campaign_script_pdf(campaign_id, script_index)