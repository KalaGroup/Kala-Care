from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.branch_upload_limit_model import BranchUploadLimit


router = APIRouter(prefix="/branch-upload-limits", tags=["Branch Upload Limits"])


# ─── DB session dependency ────────────────────────────────────────
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ─── Schemas ──────────────────────────────────────────────────────
class BranchLimitOut(BaseModel):
    branch_code: str
    tada_days: int
    office_expense_days: int
    lvb_days: int
    updated_by: Optional[str] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class BranchLimitIn(BaseModel):
    branch_code: str = Field(..., min_length=1, max_length=50)
    tada_days: int = Field(30, ge=1, le=3650)
    office_expense_days: int = Field(30, ge=1, le=3650)
    lvb_days: int = Field(30, ge=1, le=3650)
    updated_by: Optional[str] = None


class BulkUpdateIn(BaseModel):
    limits: List[BranchLimitIn]


# ─── Routes ───────────────────────────────────────────────────────
@router.get("", response_model=List[BranchLimitOut])
def list_limits(db: Session = Depends(get_db)):
    """
    Return all branch upload-day limits stored in DB.
    Frontend merges with its BRANCH_ORDER list and shows default 30 for any branch not in DB yet.
    """
    return db.query(BranchUploadLimit).all()


@router.put("/bulk", response_model=List[BranchLimitOut])
def bulk_upsert_limits(payload: BulkUpdateIn, db: Session = Depends(get_db)):
    """
    Upsert multiple branches' limits at once.
    Creates row if branch_code not found, otherwise updates day fields + updated_by.
    """
    if not payload.limits:
        raise HTTPException(status_code=400, detail="No limits supplied")

    saved: List[BranchUploadLimit] = []
    for item in payload.limits:
        existing = db.query(BranchUploadLimit).filter(
            BranchUploadLimit.branch_code == item.branch_code
        ).first()

        if existing:
            existing.tada_days = item.tada_days
            existing.office_expense_days = item.office_expense_days
            existing.lvb_days = item.lvb_days
            if item.updated_by:
                existing.updated_by = item.updated_by
            saved.append(existing)
        else:
            row = BranchUploadLimit(
                branch_code=item.branch_code,
                tada_days=item.tada_days,
                office_expense_days=item.office_expense_days,
                lvb_days=item.lvb_days,
                updated_by=item.updated_by,
            )
            db.add(row)
            saved.append(row)

    db.commit()
    for r in saved:
        db.refresh(r)
    return saved