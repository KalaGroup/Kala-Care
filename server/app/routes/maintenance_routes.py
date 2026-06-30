from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from typing import Optional

from app.database import SessionLocal
from app.controllers import maintenance_controller as mc
from app.schemas.maintenance_schema import (
    AppCodeIn, AppCodeUpdate, ImportIn, ServiceRename, ActivityIn,
)
from app.models.user_model import User, UserRole

router = APIRouter(prefix="/maintenance", tags=["maintenance"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ---------------- ROLE HELPERS ---------------- #

def _resolve_role(db: Session, user_id: Optional[str], user_role: Optional[str]) -> Optional[str]:
    if user_role:
        return user_role
    if user_id:
        user = db.query(User).filter(User.user_id == user_id).first()
        if user:
            return user.role.value if hasattr(user.role, "value") else str(user.role)
    return None


def _require_master_admin(db: Session, user_id: Optional[str], user_role: Optional[str]):
    role = _resolve_role(db, user_id, user_role)
    if role != UserRole.MASTER_ADMIN.value:
        raise HTTPException(status_code=403, detail="Only the Master Admin can perform this action")
    return role


def _resolve_name(db: Session, user_id: Optional[str], fallback: Optional[str] = None) -> str:
    if user_id:
        user = db.query(User).filter(User.user_id == user_id).first()
        if user and user.name:
            return user.name
    return fallback or "Unknown"


# ---------------- APPLICATION CODES (master data) ---------------- #

@router.get("/app-codes")
async def list_app_codes(db: Session = Depends(get_db)):
    """Read for any logged-in user (used by Service Selection, Reports and Master)."""
    return {"success": True, "items": mc.list_apps(db)}


@router.post("/app-codes")
async def create_app_code(
    payload: AppCodeIn,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_master_admin(db, user_id, user_role)
    data = payload.model_dump()
    data["_created_by"] = user_id
    return {"success": True, "item": mc.create_app(db, data)}


@router.put("/app-codes/{app_code}")
async def update_app_code(
    app_code: str,
    payload: AppCodeUpdate,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_master_admin(db, user_id, user_role)
    return {"success": True, "item": mc.update_app(db, app_code, payload.model_dump())}


@router.delete("/app-codes/{app_code}")
async def delete_app_code(
    app_code: str,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_master_admin(db, user_id, user_role)
    mc.delete_app(db, app_code)
    return {"success": True}


@router.post("/app-codes/import")
async def import_app_codes(
    payload: ImportIn,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_master_admin(db, user_id, user_role)
    items = [i.model_dump() for i in payload.items]
    for it in items:
        it["_created_by"] = user_id
    result = mc.import_apps(db, items)
    return {"success": True, **result}


# ---------------- SERVICES ---------------- #

@router.get("/services")
async def list_services(db: Session = Depends(get_db)):
    return {"success": True, "items": mc.list_services(db)}


@router.put("/services/{key}")
async def rename_service(
    key: str,
    payload: ServiceRename,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    _require_master_admin(db, user_id, user_role)
    return {"success": True, "item": mc.rename_service(db, key, payload.name)}


# ---------------- SEARCH ACTIVITY ---------------- #

@router.get("/activity")
async def list_activity(limit: int = 1000, db: Session = Depends(get_db)):
    return {"success": True, "items": mc.list_activity(db, limit)}


@router.post("/activity")
async def log_activity(
    payload: ActivityIn,
    user_id: Optional[str] = Header(None),
    user_role: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Logged for any signed-in user — the employee defaults to the user's name."""
    employee = payload.employee or _resolve_name(db, user_id)
    return {"success": True, "item": mc.log_activity(db, payload.appCode, user_id=user_id, employee=employee)}