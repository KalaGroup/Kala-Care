from fastapi import APIRouter, Depends, HTTPException, Query, status, Request
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any 

from app.database import SessionLocal
from app.controllers.campaign_controller import CampaignController
from app.schemas import campaign_schema

router = APIRouter(prefix="/campaigns", tags=["Campaigns"])

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def get_user_from_request(request: Request):
    """Extract user data from request headers (sent from frontend)"""
    user_data = {}
    user_id = request.headers.get("X-User-Id")
    user_name = request.headers.get("X-User-Name")
    
    if user_id:
        user_data["user_id"] = user_id
    if user_name:
        user_data["name"] = user_name
    
    return user_data

# ==================== Service endpoints ====================

@router.get("/services", response_model=List[campaign_schema.ServiceResponse])
def get_all_services(db: Session = Depends(get_db)):
    controller = CampaignController(db)
    return controller.get_all_services()

@router.post("/services", response_model=campaign_schema.ServiceResponse, status_code=status.HTTP_201_CREATED)
def create_service(service: campaign_schema.ServiceCreate, db: Session = Depends(get_db)):
    controller = CampaignController(db)
    return controller.create_service(service)

@router.put("/services/{service_id}", response_model=campaign_schema.ServiceResponse)
def update_service(service_id: int, service: campaign_schema.ServiceUpdate, db: Session = Depends(get_db)):
    controller = CampaignController(db)
    return controller.update_service(service_id, service)

@router.delete("/services/{service_id}")
def delete_service(service_id: int, db: Session = Depends(get_db)):
    controller = CampaignController(db)
    return controller.delete_service(service_id)

# ==================== Campaign endpoints ====================

@router.get("/", response_model=List[campaign_schema.CampaignResponse])
def get_all_campaigns(
    service: Optional[str] = Query(None, description="Filter by service name"),
    status: Optional[str] = Query(None, description="Filter by status (active, inactive)"),
    db: Session = Depends(get_db)
):
    controller = CampaignController(db)
    return controller.get_all_campaigns(service, status)

@router.get("/{campaign_id}", response_model=campaign_schema.CampaignResponse)
def get_campaign(campaign_id: int, db: Session = Depends(get_db)):
    controller = CampaignController(db)
    return controller.get_campaign(campaign_id)

@router.post("/", response_model=campaign_schema.CampaignResponse, status_code=status.HTTP_201_CREATED)
def create_campaign(
    request: Request,
    campaign: campaign_schema.CampaignCreate, 
    db: Session = Depends(get_db)
):
    controller = CampaignController(db)
    user_data = get_user_from_request(request)
    return controller.create_campaign(campaign, user_data)

@router.put("/{campaign_id}", response_model=campaign_schema.CampaignResponse)
def update_campaign(
    request: Request,
    campaign_id: int, 
    campaign: campaign_schema.CampaignUpdate, 
    db: Session = Depends(get_db)
):
    controller = CampaignController(db)
    user_data = get_user_from_request(request)
    return controller.update_campaign(campaign_id, campaign, user_data)

@router.delete("/{campaign_id}")
def delete_campaign(campaign_id: int, db: Session = Depends(get_db)):
    controller = CampaignController(db)
    return controller.delete_campaign(campaign_id)

@router.patch("/{campaign_id}/status", response_model=campaign_schema.CampaignResponse)
def update_campaign_status(
    campaign_id: int, 
    status: str = Query(..., description="active or inactive"), 
    db: Session = Depends(get_db)
):
    controller = CampaignController(db)
    return controller.update_campaign_status(campaign_id, status)

# ==================== Asset Validation endpoint ====================

@router.post("/validate-assets", response_model=campaign_schema.AssetValidationResponse)
def validate_assets(asset_numbers: List[str], db: Session = Depends(get_db)):
    """Validate asset numbers against customers table"""
    controller = CampaignController(db)
    result = controller.validate_asset_numbers(asset_numbers)
    return {
        "valid_assets": result["valid"],
        "invalid_assets": result["invalid"],
        "total_valid": len(result["valid"]),
        "total_invalid": len(result["invalid"])
    }

# ==================== Stats endpoint ====================

@router.get("/stats/dashboard")
def get_campaign_stats(db: Session = Depends(get_db)):
    controller = CampaignController(db)
    return controller.get_campaign_stats()

@router.get("/{campaign_id}/counts")
def get_campaign_counts(campaign_id: int, db: Session = Depends(get_db)):
    """Get pending and completed counts for a campaign"""
    controller = CampaignController(db)
    return controller.get_campaign_counts(campaign_id)

# Add this new endpoint after your existing routes
@router.post("/update-branch-codes")
def update_branch_codes(
    request: Request,
    branch_updates: List[Dict[str, str]],  # List of {"asset_number": "123456778", "branch_id": "branch_code"}
    db: Session = Depends(get_db)
):
    """Update branch_id for multiple customers based on asset numbers"""
    controller = CampaignController(db)
    user_data = get_user_from_request(request)
    return controller.update_branch_codes(branch_updates, user_data)

@router.get("/{campaign_id}/customers-with-followups")
def get_campaign_customers_with_followups(
    campaign_id: int, 
    request: Request,
    db: Session = Depends(get_db)
):
    """Get all customers for a campaign with their last follow-up data"""
    controller = CampaignController(db)
    return controller.get_campaign_customers_with_followups(campaign_id)

@router.post("/{campaign_id}/sp-info")
def upsert_sp_info(
    campaign_id: int,
    sp_info_rows: List[Dict[str, Any]],
    db: Session = Depends(get_db)
):
    """Insert/update SP Info rows (CSP) for a campaign, keyed by instance_id"""
    controller = CampaignController(db)
    return controller.upsert_sp_info(campaign_id, sp_info_rows)

@router.get("/csp/open-campaigns")
def get_open_csp_campaigns(db: Session = Depends(get_db)):
    """Active CSP campaigns available for manual SR entry"""
    controller = CampaignController(db)
    return controller.get_open_csp_campaigns()

@router.post("/{campaign_id}/csp/add-sr")
def add_sr_to_csp_campaign(
    request: Request,
    campaign_id: int,
    sr_data: Dict[str, Any],
    db: Session = Depends(get_db)
):
    """Manually add a single CSP SR row to a campaign"""
    controller = CampaignController(db)
    user_data = get_user_from_request(request)
    return controller.add_sr_to_csp_campaign(campaign_id, sr_data, user_data)

@router.get("/csp/user-sr-count")
def get_user_csp_sr_count(
    user_id: str = Query(...),
    db: Session = Depends(get_db)
):
    """Count of CSP SRs manually added by a user"""
    controller = CampaignController(db)
    return {"count": controller.get_user_csp_sr_count(user_id)}
