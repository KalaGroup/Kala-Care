from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Header
from sqlalchemy.orm import Session
from typing import Optional
from app.database import SessionLocal
from app.controllers import banner_controller
from app.models.user_model import User, UserRole

router = APIRouter(prefix="/banners", tags=["banners"])

# Dependency to get DB session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.get("")
async def get_banners(db: Session = Depends(get_db)):
    """Get all banners"""
    try:
        banners = banner_controller.get_all_banners(db)
        return {
            "success": True,
            "banners": [
                {
                    "id": b.id,
                    "position": b.position,
                    "image_url": b.image_url,
                    "created_at": b.created_at,
                    "updated_at": b.updated_at
                }
                for b in banners
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/upload")
async def upload_banners(
    banner1: Optional[UploadFile] = File(None),
    banner2: Optional[UploadFile] = File(None),
    banner3: Optional[UploadFile] = File(None),
    user_id: str = Header(...),  # Get user_id from header
    user_role: Optional[str] = Header(None),  # Get role from header
    db: Session = Depends(get_db)
):
    """Upload up to 3 banner images (admin only - master_admin, it_admin, branch_admin)"""
    
    # Define allowed admin roles
    ALLOWED_ADMIN_ROLES = [
        UserRole.MASTER_ADMIN.value,  # "master_admin"
        UserRole.IT_ADMIN.value,       # "it_admin"
        UserRole.BRANCH_ADMIN.value    # "branch_admin"
    ]
    
    # Check if user is authorized to upload banners
    is_authorized = False
    
    # First, check if user_role is provided in header
    if user_role and user_role in ALLOWED_ADMIN_ROLES:
        is_authorized = True
    else:
        # Fallback: Query the database to verify the role
        user = db.query(User).filter(User.user_id == user_id).first()
        if user and user.role in ALLOWED_ADMIN_ROLES:
            is_authorized = True
    
    if not is_authorized:
        raise HTTPException(
            status_code=403, 
            detail="Only master_admin, it_admin, or branch_admin can upload banners"
        )
    
    # Check if at least one file is provided
    if not any([banner1, banner2, banner3]):
        raise HTTPException(status_code=400, detail="At least one banner image is required")
    
    uploaded_banners = []
    
    # Process banner1 if provided
    if banner1:
        image_url = await banner_controller.save_banner_image(banner1, 1)
        banner = banner_controller.create_or_update_banner(db, 1, image_url)
        uploaded_banners.append({"position": 1, "image_url": image_url})
    
    # Process banner2 if provided
    if banner2:
        image_url = await banner_controller.save_banner_image(banner2, 2)
        banner = banner_controller.create_or_update_banner(db, 2, image_url)
        uploaded_banners.append({"position": 2, "image_url": image_url})
    
    # Process banner3 if provided
    if banner3:
        image_url = await banner_controller.save_banner_image(banner3, 3)
        banner = banner_controller.create_or_update_banner(db, 3, image_url)
        uploaded_banners.append({"position": 3, "image_url": image_url})
    
    return {
        "success": True,
        "message": "Banners uploaded successfully",
        "banners": uploaded_banners,
        "uploaded_by": user_id
    }