from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime

from app.database import SessionLocal
from app.models.diery_model import Diery, get_ist_now

router = APIRouter(prefix="/v1/diery", tags=["Diery"])


# ---------------- DB Dependency ---------------- #
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ---------------- Pydantic Schemas ---------------- #
class DieryCreate(BaseModel):
    user_id: str = Field(..., min_length=1)
    user_name: str = Field(..., min_length=1)
    content: str = Field(..., min_length=1)
    title: Optional[str] = None


class DieryUpdate(BaseModel):
    content: Optional[str] = None
    title: Optional[str] = None


class DieryResponse(BaseModel):
    id: int
    user_id: str
    user_name: str
    title: Optional[str]
    content: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ---------------- Routes ---------------- #
@router.post("/add", response_model=DieryResponse)
def add_to_diery(entry: DieryCreate, db: Session = Depends(get_db)):
    """Add a new thought / note to the user's personal diary."""
    new_entry = Diery(
        user_id=entry.user_id,
        user_name=entry.user_name,
        title=entry.title,
        content=entry.content,
    )

    db.add(new_entry)
    db.commit()
    db.refresh(new_entry)
    return new_entry


@router.get("/user/{user_id}", response_model=List[DieryResponse])
def get_user_diery(user_id: str, db: Session = Depends(get_db)):
    """Get all diary entries for a specific user, newest first."""
    entries = (
        db.query(Diery)
        .filter(Diery.user_id == user_id)
        .order_by(Diery.created_at.desc())
        .all()
    )
    return entries


@router.put("/{diery_id}", response_model=DieryResponse)
def update_diery(diery_id: int, entry: DieryUpdate, db: Session = Depends(get_db)):
    """Update a diary entry."""
    db_entry = db.query(Diery).filter(Diery.id == diery_id).first()
    if not db_entry:
        raise HTTPException(status_code=404, detail="Diary entry not found")

    update_data = entry.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_entry, key, value)

    db_entry.updated_at = get_ist_now()
    db.commit()
    db.refresh(db_entry)
    return db_entry


@router.delete("/{diery_id}")
def delete_diery(diery_id: int, db: Session = Depends(get_db)):
    """Delete a diary entry."""
    db_entry = db.query(Diery).filter(Diery.id == diery_id).first()
    if not db_entry:
        raise HTTPException(status_code=404, detail="Diary entry not found")

    db.delete(db_entry)
    db.commit()
    return {"message": "Diary entry deleted successfully", "id": diery_id}