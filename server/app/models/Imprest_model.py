"""
Imprest_model.py
SQLAlchemy ORM model + Pydantic schemas for branch-wise Imprest Amount records.
One branch can have many entries (name + amount).
"""
from sqlalchemy import Column, Integer, String, Numeric, DateTime, Index
from sqlalchemy.sql import func
from pydantic import BaseModel, Field, validator
from typing import List, Optional
from datetime import datetime
from decimal import Decimal

# ---------- adjust this import to match your project ----------
from app.database import Base   # e.g. from db.session import Base
# --------------------------------------------------------------


# ─────────────────────────────  ORM MODEL  ─────────────────────────────
class ImprestAmount(Base):
    __tablename__ = "imprest_amounts"

    id           = Column(Integer, primary_key=True, index=True, autoincrement=True)
    branch_code  = Column(String(50),  nullable=False, index=True)
    name         = Column(String(255), nullable=False)
    amount       = Column(Numeric(14, 2), nullable=False, default=0)
    created_by   = Column(String(255), nullable=True)
    created_at   = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at   = Column(DateTime(timezone=True),
                          server_default=func.now(),
                          onupdate=func.now(),
                          nullable=False)

    __table_args__ = (
        Index("idx_imprest_branch_name", "branch_code", "name"),
    )

    def to_dict(self):
        return {
            "id":          self.id,
            "branch_code": self.branch_code,
            "name":        self.name,
            "amount":      float(self.amount) if self.amount is not None else 0.0,
            "created_by":  self.created_by,
            "created_at":  self.created_at.isoformat() if self.created_at else None,
            "updated_at":  self.updated_at.isoformat() if self.updated_at else None,
        }


# ─────────────────────────  PYDANTIC SCHEMAS  ─────────────────────────
class ImprestEntryIn(BaseModel):
    """Single name/amount entry within a branch block (used for create & update)."""
    id:     Optional[int]     = None        # present when editing
    name:   str               = Field(..., min_length=1, max_length=255)
    amount: Decimal           = Field(..., ge=0)

    @validator("name")
    def _strip_name(cls, v):
        v = (v or "").strip()
        if not v:
            raise ValueError("name cannot be empty")
        return v


class ImprestBranchBlock(BaseModel):
    """All entries that belong to a single branch."""
    branch_code: str               = Field(..., min_length=1, max_length=50)
    entries:     List[ImprestEntryIn] = []


class ImprestBulkSave(BaseModel):
    """
    Payload for the 'Save All' button on the frontend modal.
    `branches` contains every branch block, each with its full final list of entries.
    Saving is replace-per-branch: for every branch in this payload we delete the
    existing rows of that branch and insert the new list. Branches NOT in the
    payload are left untouched.
    """
    branches:   List[ImprestBranchBlock]
    created_by: Optional[str] = None


class ImprestEntryOut(BaseModel):
    id:          int
    branch_code: str
    name:        str
    amount:      Decimal
    created_by:  Optional[str] = None
    created_at:  Optional[datetime] = None
    updated_at:  Optional[datetime] = None

    class Config:
        from_attributes = True