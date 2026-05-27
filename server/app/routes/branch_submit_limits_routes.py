from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
from app.database import SessionLocal
from app.models.branch_submit_limit_model import BranchSubmitLimit

router = APIRouter(prefix="/branch-submit-limits", tags=["Branch Submit Limits"])

# Default rules — used as fallback / seed
DEFAULT_WEEKDAY_BRANCHES = ['420435_3', '420435_1', '420435_2', '420435_6', '420435_4', '420435_5', '420435_7']
DEFAULT_WEEKDAYS = [1, 2]              # Mon, Tue
DEFAULT_MONTH_DATES = [1, 2, 3, 16, 17, 18]

ALL_BRANCH_CODES = [
    'HO', '420435_1', '420435_2', '420435_3', '420435_4', '420435_5',
    '420435_6', '420435_7', '420435_8', '420435_9', '420435_10',
    '420435_11', '420435_12', '420435_13', '420435_14',
]


class SubmitLimitRow(BaseModel):
    branch_code: str
    rule_type: str            # 'weekdays' or 'month_dates'
    allowed_values: List[int]
    updated_by: Optional[str] = None


class BulkSubmitLimitPayload(BaseModel):
    limits: List[SubmitLimitRow]


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.get("")
def list_submit_limits(db: Session = Depends(get_db)):
    """Return all branch submit limits, seeding defaults for any missing branch."""
    existing = {r.branch_code: r for r in db.query(BranchSubmitLimit).all()}
    result = []
    for code in ALL_BRANCH_CODES:
        row = existing.get(code)
        if row:
            result.append({
                "branch_code": row.branch_code,
                "rule_type": row.rule_type,
                "allowed_values": row.allowed_values or [],
                "updated_by": row.updated_by,
                "updated_at": str(row.updated_at) if row.updated_at else None,
            })
        else:
            # Default fallback for missing branches
            if code in DEFAULT_WEEKDAY_BRANCHES:
                result.append({
                    "branch_code": code,
                    "rule_type": "weekdays",
                    "allowed_values": DEFAULT_WEEKDAYS,
                    "updated_by": None,
                    "updated_at": None,
                })
            else:
                result.append({
                    "branch_code": code,
                    "rule_type": "month_dates",
                    "allowed_values": DEFAULT_MONTH_DATES,
                    "updated_by": None,
                    "updated_at": None,
                })
    return result


@router.put("/bulk")
def bulk_update_submit_limits(payload: BulkSubmitLimitPayload, db: Session = Depends(get_db)):
    """Upsert submit limits for many branches at once."""
    try:
        for item in payload.limits:
            if item.rule_type not in ('weekdays', 'month_dates'):
                raise HTTPException(400, f"Invalid rule_type for {item.branch_code}")

            # Validate values
            if item.rule_type == 'weekdays':
                for v in item.allowed_values:
                    if not (0 <= v <= 6):
                        raise HTTPException(400, f"Weekday must be 0-6 for {item.branch_code}")
            else:
                for v in item.allowed_values:
                    if not (1 <= v <= 31):
                        raise HTTPException(400, f"Month date must be 1-31 for {item.branch_code}")

            row = db.query(BranchSubmitLimit).filter(
                BranchSubmitLimit.branch_code == item.branch_code
            ).first()

            if row:
                row.rule_type = item.rule_type
                row.allowed_values = item.allowed_values
                row.updated_by = item.updated_by
            else:
                row = BranchSubmitLimit(
                    branch_code=item.branch_code,
                    rule_type=item.rule_type,
                    allowed_values=item.allowed_values,
                    updated_by=item.updated_by,
                )
                db.add(row)

        db.commit()
        return {"message": "Submit limits updated", "count": len(payload.limits)}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(500, str(e))