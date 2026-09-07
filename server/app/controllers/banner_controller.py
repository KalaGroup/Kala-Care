from pathlib import Path
from fastapi import UploadFile, HTTPException
from sqlalchemy.orm import Session
from app.models.banner_model import Banner

ALLOWED_EXTENSIONS = {'.jpg', '.jpeg', '.png'}

async def read_banner_image(file: UploadFile) -> tuple[bytes, str]:
    """Validate and read a banner image, returning (bytes, content_type)."""
    
    # Check file extension
    file_ext = Path(file.filename).suffix.lower()
    if file_ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"File type {file_ext} not allowed. Please upload JPG or PNG images.")
    
    try:
        contents = await file.read()
        content_type = file.content_type or "image/jpeg"
        return contents, content_type
    except Exception as e:
        print(f"Error reading file: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error reading file: {str(e)}")
    finally:
        await file.close()

def get_all_banners(db: Session):
    """Banner metadata ordered by position - WITHOUT the image bytes.

    The listing endpoint only returns ids, positions and timestamps; it links
    to /banners/{position}/image for the picture itself. Selecting the whole
    row dragged every banner's VARBINARY(MAX) across the wire (~1.5 MB here)
    just to discard it, which cost 8-12 s per call on the remote database.
    """
    return (
        db.query(Banner.id, Banner.position, Banner.created_at, Banner.updated_at)
        .order_by(Banner.position)
        .all()
    )

def get_banner_by_position(db: Session, position: int):
    """Get banner by position"""
    return db.query(Banner).filter(Banner.position == position).first()

def create_or_update_banner(db: Session, position: int, image_data: bytes, content_type: str):
    """Create or update banner with image bytes stored in the database"""
    banner = get_banner_by_position(db, position)
    
    if banner:
        banner.image_data = image_data
        banner.content_type = content_type
    else:
        banner = Banner(position=position, image_data=image_data, content_type=content_type)
        db.add(banner)
    
    db.commit()
    db.refresh(banner)
    return banner