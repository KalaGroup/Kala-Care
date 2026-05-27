"""
Imprest_routes.py
FastAPI routes for Imprest Amount management.
Mount in main.py:   app.include_router(Imprest_routes.router)
"""
from fastapi import APIRouter, HTTPException, Query
from typing import Optional

from app.database import SessionLocal
from app.controllers import Imprest_controller as ctrl
from app.models.Imprest_model import (
    ImprestBulkSave,
    ImprestEntryIn,
)

router = APIRouter(prefix="/imprest", tags=["Imprest Amount"])


def get_db_session():
    return SessionLocal()


# ─────────────────────  READ  ─────────────────────
@router.get("/all")
def get_all():
    db = get_db_session()
    try:
        return ctrl.get_all_imprest_grouped(db)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


@router.get("/branch/{branch_code}")
def get_by_branch(branch_code: str):
    db = get_db_session()
    try:
        rows  = ctrl.get_imprest_by_branch(db, branch_code)
        total = ctrl.get_branch_total(db, branch_code)
        return {
            "branch_code": branch_code,
            "entries":     [r.to_dict() for r in rows],
            "total":       total,
            "count":       len(rows),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


# ─────────────────────  WRITE  ─────────────────────
@router.post("/bulk-save")
def bulk_save(
    payload: ImprestBulkSave,
    created_by: Optional[str] = Query(default=None),
):
    if not payload.branches:
        raise HTTPException(status_code=400, detail="No branch data provided")

    db = get_db_session()
    try:
        result = ctrl.bulk_save(db, payload, created_by=created_by)
        if result.get("status") == "error":
            raise HTTPException(status_code=500, detail=result.get("message"))
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


@router.post("/entry")
def add_entry(
    payload: ImprestEntryIn,
    branch_code: str = Query(...),
    created_by:  Optional[str] = Query(default=None),
):
    db = get_db_session()
    try:
        row = ctrl.create_single_entry(
            db,
            branch_code=branch_code,
            name=payload.name,
            amount=payload.amount,
            created_by=created_by,
        )
        return {"status": "success", "entry": row.to_dict()}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        db.close()


@router.put("/entry/{entry_id}")
def update_entry(entry_id: int, payload: ImprestEntryIn):
    db = get_db_session()
    try:
        row = ctrl.update_single_entry(
            db,
            entry_id=entry_id,
            name=payload.name,
            amount=payload.amount,
        )
        if not row:
            raise HTTPException(status_code=404, detail="Imprest entry not found")
        return {"status": "success", "entry": row.to_dict()}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        db.close()


@router.delete("/entry/{entry_id}")
def delete_entry(entry_id: int):
    db = get_db_session()
    try:
        ok = ctrl.delete_single_entry(db, entry_id)
        if not ok:
            raise HTTPException(status_code=404, detail="Imprest entry not found")
        return {"status": "success", "message": "Entry deleted"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        db.close()


@router.delete("/branch/{branch_code}")
def delete_branch(branch_code: str):
    db = get_db_session()
    try:
        removed = ctrl.delete_all_for_branch(db, branch_code)
        return {"status": "success", "deleted": removed, "branch_code": branch_code}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        db.close()