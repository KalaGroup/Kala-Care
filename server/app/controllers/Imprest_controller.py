"""
Imprest_controller.py
Business logic for Imprest Amount CRUD + bulk save.
"""
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional, Dict, Any
from decimal import Decimal

from app.models.Imprest_model import (
    ImprestAmount,
    ImprestBulkSave,
    ImprestEntryIn,
)


# ─────────────────────────  READ  ─────────────────────────
def get_all_imprest_grouped(db: Session) -> Dict[str, Any]:
    """
    Returns:
        {
          "branches": {
            "BR001": [ {id, name, amount, ...}, ... ],
            "BR002": [ ... ]
          },
          "totals":   { "BR001": 12500.00, "BR002": 0.0 },
          "grand_total": 12500.00,
          "count": 3
        }
    """
    rows = (
        db.query(ImprestAmount)
        .order_by(ImprestAmount.branch_code.asc(), ImprestAmount.id.asc())
        .all()
    )

    grouped: Dict[str, list] = {}
    totals:  Dict[str, float] = {}
    grand   = Decimal("0")

    for r in rows:
        grouped.setdefault(r.branch_code, []).append(r.to_dict())
        amt = Decimal(r.amount or 0)
        totals[r.branch_code] = float(Decimal(totals.get(r.branch_code, 0)) + amt)
        grand += amt

    return {
        "branches":    grouped,
        "totals":      totals,
        "grand_total": float(grand),
        "count":       len(rows),
    }


def get_imprest_by_branch(db: Session, branch_code: str) -> List[ImprestAmount]:
    return (
        db.query(ImprestAmount)
        .filter(ImprestAmount.branch_code == branch_code)
        .order_by(ImprestAmount.id.asc())
        .all()
    )


def get_branch_total(db: Session, branch_code: str) -> float:
    total = (
        db.query(func.coalesce(func.sum(ImprestAmount.amount), 0))
        .filter(ImprestAmount.branch_code == branch_code)
        .scalar()
    )
    return float(total or 0)


# ─────────────────────────  CREATE / UPDATE  ─────────────────────────
def create_single_entry(
    db: Session,
    branch_code: str,
    name: str,
    amount: Decimal,
    created_by: Optional[str] = None,
) -> ImprestAmount:
    entry = ImprestAmount(
        branch_code=branch_code.strip(),
        name=name.strip(),
        amount=amount,
        created_by=created_by,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


def update_single_entry(
    db: Session,
    entry_id: int,
    name: Optional[str] = None,
    amount: Optional[Decimal] = None,
) -> Optional[ImprestAmount]:
    entry = db.query(ImprestAmount).filter(ImprestAmount.id == entry_id).first()
    if not entry:
        return None
    if name is not None and name.strip():
        entry.name = name.strip()
    if amount is not None:
        entry.amount = amount
    db.commit()
    db.refresh(entry)
    return entry


def delete_single_entry(db: Session, entry_id: int) -> bool:
    entry = db.query(ImprestAmount).filter(ImprestAmount.id == entry_id).first()
    if not entry:
        return False
    db.delete(entry)
    db.commit()
    return True


def delete_all_for_branch(db: Session, branch_code: str) -> int:
    deleted = (
        db.query(ImprestAmount)
        .filter(ImprestAmount.branch_code == branch_code)
        .delete(synchronize_session=False)
    )
    db.commit()
    return deleted


# ─────────────────────────  BULK SAVE  ─────────────────────────
def bulk_save(
    db: Session,
    payload: ImprestBulkSave,
    created_by: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Replace-per-branch save:
      For every branch block in `payload.branches`:
        - Existing entries with matching id are UPDATED.
        - Entries without id are INSERTED.
        - Existing entries of that branch whose id is NOT in the payload are DELETED.
      Branches NOT mentioned in the payload are untouched.
    """
    actor = created_by or payload.created_by or "System"

    summary = {
        "inserted": 0,
        "updated":  0,
        "deleted":  0,
        "branches_touched": 0,
    }

    try:
        for block in payload.branches:
            branch_code = block.branch_code.strip()
            if not branch_code:
                continue

            summary["branches_touched"] += 1

            # Existing rows for this branch keyed by id
            existing = {
                r.id: r
                for r in db.query(ImprestAmount)
                          .filter(ImprestAmount.branch_code == branch_code)
                          .all()
            }
            incoming_ids = {e.id for e in block.entries if e.id is not None}

            # Delete rows that no longer appear in the payload
            for old_id, old_row in existing.items():
                if old_id not in incoming_ids:
                    db.delete(old_row)
                    summary["deleted"] += 1

            # Upsert
            for entry in block.entries:
                if entry.id and entry.id in existing:
                    row = existing[entry.id]
                    row.name = entry.name.strip()
                    row.amount = entry.amount
                    summary["updated"] += 1
                else:
                    db.add(ImprestAmount(
                        branch_code=branch_code,
                        name=entry.name.strip(),
                        amount=entry.amount,
                        created_by=actor,
                    ))
                    summary["inserted"] += 1

        db.commit()
        return {
            "status":  "success",
            "message": (
                f"Saved Imprest Amounts: "
                f"{summary['inserted']} added, "
                f"{summary['updated']} updated, "
                f"{summary['deleted']} removed "
                f"across {summary['branches_touched']} branch(es)."
            ),
            **summary,
        }
    except Exception as exc:
        db.rollback()
        return {
            "status": "error",
            "message": f"Bulk save failed: {exc}",
            **summary,
        }