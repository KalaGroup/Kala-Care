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

# ==================== GOEM OEM distinct values ====================

@router.get("/letter-master/goem-oem-list")
def get_distinct_goem_oem(db: Session = Depends(get_db)):
    """Distinct goem_oem values from asset_detailed for letter format recipient rules."""
    controller = CampaignController(db)
    return controller.get_distinct_goem_oem()

# ==================== Branch Email Master endpoints ====================
# IMPORTANT: These must be defined BEFORE /{campaign_id} routes to avoid
# FastAPI matching "branch-email-master" as a campaign_id integer.

@router.get("/branch-email-master", response_model=List[campaign_schema.BranchEmailResponse])
def get_all_branch_emails(db: Session = Depends(get_db)):
    """Get all branch email records."""
    controller = CampaignController(db)
    return controller.get_all_branch_emails()

@router.post("/branch-email-master/bulk-save", response_model=campaign_schema.BranchEmailBulkSaveResponse)
def bulk_save_branch_emails(
    data: campaign_schema.BranchEmailBulkSave,
    db: Session = Depends(get_db)
):
    """Upsert branch emails in bulk."""
    controller = CampaignController(db)
    return controller.bulk_save_branch_emails(data)

@router.get("/{campaign_id}", response_model=campaign_schema.CampaignResponse)
def get_campaign(campaign_id: int, db: Session = Depends(get_db)):
    controller = CampaignController(db)
    return controller.get_campaign(campaign_id)

@router.post("/", response_model=campaign_schema.CampaignResponse, status_code=status.HTTP_201_CREATED)
def create_campaign(
    request: Request,
    campaign: campaign_schema.CampaignCreate,
    transfer_from_campaign_ids: Optional[List[int]] = Query(
        None,
        description="IDs of active same-product campaigns to transfer assets from (these get set to inactive)"
    ),
    db: Session = Depends(get_db)
):
    controller = CampaignController(db)
    user_data = get_user_from_request(request)
    return controller.create_campaign(campaign, user_data, transfer_from_campaign_ids)

@router.get("/active/by-service")
def get_active_campaigns_by_service(
    service: str = Query(..., description="Product/service name"),
    db: Session = Depends(get_db)
):
    """Active campaigns for a product — used by the asset-transfer picker."""
    controller = CampaignController(db)
    return controller.get_active_campaigns_by_service(service)
    
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

@router.get("/drive-meta/all", response_model=List[campaign_schema.DriveMetaResponse])
def get_all_drive_meta(db: Session = Depends(get_db)):
    """All drive-meta rows (Data Duration + Remark), keyed by campaign_id."""
    controller = CampaignController(db)
    return controller.get_all_drive_meta()

@router.put("/{campaign_id}/drive-meta", response_model=campaign_schema.DriveMetaResponse)
def upsert_drive_meta(
    campaign_id: int,
    data: campaign_schema.DriveMetaUpsert,
    db: Session = Depends(get_db)
):
    """Create/update Data Duration + Remark for a drive (separate table)."""
    controller = CampaignController(db)
    return controller.upsert_drive_meta(campaign_id, data)
    
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

# ==================== Letter Master (Letter Format) endpoints ====================

@router.get("/letter-master/formats", response_model=List[campaign_schema.LetterFormatResponse])
def get_all_letter_formats(
    include_expired: bool = Query(True, description="Include formats past their expiry date"),
    db: Session = Depends(get_db)
):
    controller = CampaignController(db)
    return controller.get_all_letter_formats(include_expired=include_expired)

@router.get("/letter-master/formats/{format_id}", response_model=campaign_schema.LetterFormatResponse)
def get_letter_format(format_id: int, db: Session = Depends(get_db)):
    controller = CampaignController(db)
    return controller.get_letter_format(format_id)

@router.get("/letter-master/formats/{format_id}/usage")
def get_letter_format_usage(format_id: int, db: Session = Depends(get_db)):
    """Has this format already sent letters? Locks the Serial No box in Letter Master."""
    controller = CampaignController(db)
    return controller.get_letter_format_usage(format_id)

@router.post("/letter-master/formats", response_model=campaign_schema.LetterFormatResponse, status_code=status.HTTP_201_CREATED)
def create_letter_format(request: Request, data: campaign_schema.LetterFormatCreate, db: Session = Depends(get_db)):
    controller = CampaignController(db)
    user_data = get_user_from_request(request)
    return controller.create_letter_format(data, user_data)

@router.put("/letter-master/formats/{format_id}", response_model=campaign_schema.LetterFormatResponse)
def update_letter_format(request: Request, format_id: int, data: campaign_schema.LetterFormatUpdate, db: Session = Depends(get_db)):
    controller = CampaignController(db)
    user_data = get_user_from_request(request)
    return controller.update_letter_format(format_id, data, user_data)

@router.delete("/letter-master/formats/{format_id}")
def delete_letter_format(format_id: int, db: Session = Depends(get_db)):
    controller = CampaignController(db)
    return controller.delete_letter_format(format_id)


