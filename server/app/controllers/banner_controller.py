import os
import shutil
from pathlib import Path
from fastapi import UploadFile, HTTPException
from sqlalchemy.orm import Session
from app.models.banner_model import Banner

# Get the absolute path to the server directory
BASE_DIR = Path(__file__).resolve().parent.parent.parent
UPLOAD_DIR = BASE_DIR / "uploads"
BANNER_DIR = UPLOAD_DIR / "banners"

# Ensure upload directory exists with proper permissions
try:
    BANNER_DIR.mkdir(parents=True, exist_ok=True)
except Exception as e:
    print(f"Error creating directory: {e}")

ALLOWED_EXTENSIONS = {'.jpg', '.jpeg', '.png'}

async def save_banner_image(file: UploadFile, position: int) -> str:
    """Save banner image and return the file path"""
    
    # Check file extension
    file_ext = Path(file.filename).suffix.lower()
    if file_ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"File type {file_ext} not allowed. Please upload JPG or PNG images.")
    
    # Create filename with position
    filename = f"banner_{position}{file_ext}"
    file_path = BANNER_DIR / filename
        
    # Save the file
    try:
        # Remove old file if exists
        if file_path.exists():
            file_path.unlink()
        
        # Save new file
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
                
        # Return the URL path (relative to static files)
        return f"/uploads/banners/{filename}"
    except Exception as e:
        print(f"Error saving file: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error saving file: {str(e)}")
    finally:
        await file.close()

def get_all_banners(db: Session):
    """Get all banners ordered by position"""
    return db.query(Banner).order_by(Banner.position).all()

def get_banner_by_position(db: Session, position: int):
    """Get banner by position"""
    return db.query(Banner).filter(Banner.position == position).first()

def create_or_update_banner(db: Session, position: int, image_url: str):
    """Create or update banner"""
    banner = get_banner_by_position(db, position)
    
    if banner:
        banner.image_url = image_url
    else:
        banner = Banner(position=position, image_url=image_url)
        db.add(banner)
    
    db.commit()
    db.refresh(banner)
    return banner