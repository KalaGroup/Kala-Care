from datetime import timezone

from fastapi import HTTPException
from sqlalchemy.orm import Session, selectinload

from app.models.maintenance_model import (
    MaintenanceAppCode, MaintenancePart, MaintenanceService, MaintenanceActivity,
)


# ---------------- SERIALIZERS ---------------- #

def serialize_part(p: MaintenancePart):
    return {
        "partNumber": p.part_number or "", "partDesc": p.part_desc or "", "qty": p.qty or "",
        "action": p.action or "", "altPartNo": p.alt_part_no or "", "altDesc": p.alt_desc or "",
        "altQty": p.alt_qty or "", "altAction": p.alt_action or "",
        "serviceHours": p.service_hours or "500", "consumable": p.consumable or "",
        "schedule": p.schedule or "",
    }


def serialize_app(a: MaintenanceAppCode):
    return {
        "id": a.id, "appCode": a.app_code, "systemAppCode": a.system_app_code or "",
        "segment": a.segment or "", "engineModel": a.engine_model or "",
        "kva": a.kva or "", "emission": a.emission or "",
        "parts": [serialize_part(p) for p in a.parts],
    }


def serialize_service(s: MaintenanceService):
    return {"id": s.key, "name": s.name, "short": s.short or "", "hours": s.hours, "note": s.note or ""}


# ---------------- HELPERS ---------------- #

def _ensure_service_for_hours(db: Session, hours):
    """Make sure a service row exists for a given interval, so imported data with a
    new interval (e.g. 2000) still shows up under Master of Service and in coverage.
    Mirrors the front-end's serviceForHours behaviour."""
    h = str(hours or "500").strip() or "500"
    key = "sv" + h
    if db.query(MaintenanceService.id).filter(MaintenanceService.key == key).first():
        return
    db.add(MaintenanceService(key=key, name=f"{h} Hrs", short=f"{h} Hr", hours=h, note=""))
    db.flush()


def _insert_app(db: Session, a: dict, created_by=None):
    row = MaintenanceAppCode(
        app_code=str(a.get("appCode") or "").strip(),
        system_app_code=(a.get("systemAppCode") or None),
        segment=a.get("segment"), engine_model=a.get("engineModel"),
        kva=a.get("kva"), emission=a.get("emission"), created_by=created_by,
    )
    db.add(row)
    db.flush()  # assign row.id
    for i, p in enumerate(a.get("parts") or []):
        _ensure_service_for_hours(db, p.get("serviceHours"))
        db.add(MaintenancePart(
            app_code_id=row.id,
            part_number=p.get("partNumber"), part_desc=p.get("partDesc"),
            qty=p.get("qty"), action=p.get("action"),
            alt_part_no=p.get("altPartNo"), alt_desc=p.get("altDesc"),
            alt_qty=p.get("altQty"), alt_action=p.get("altAction"),
            service_hours=str(p.get("serviceHours") or "500"),
            consumable=p.get("consumable"), schedule=p.get("schedule"), sort_order=i,
        ))
    return row


def _get(db: Session, app_code: str) -> MaintenanceAppCode:
    row = db.query(MaintenanceAppCode).filter(MaintenanceAppCode.app_code == app_code).first()
    if not row:
        raise HTTPException(status_code=404, detail=f"Application code '{app_code}' not found")
    return row


# ---------------- APP CODES ---------------- #

def list_apps(db: Session):
    # selectinload eager-loads ALL parts in ONE extra query (parts are ordered by
    # sort_order via the relationship) instead of the N+1 that lazy access caused
    # — one query per app code. This is the main speed-up for the Master, Service
    # Selection and Report screens, which all call this endpoint.
    rows = (
        db.query(MaintenanceAppCode)
        .options(selectinload(MaintenanceAppCode.parts))
        .order_by(MaintenanceAppCode.app_code)
        .all()
    )
    return [serialize_app(a) for a in rows]


def create_app(db: Session, payload: dict):
    code = (payload.get("appCode") or "").strip()
    if not code:
        raise HTTPException(status_code=400, detail="App Code is required")
    if db.query(MaintenanceAppCode.id).filter(MaintenanceAppCode.app_code == code).first():
        raise HTTPException(status_code=409, detail=f"{code} already exists — use Edit")
    row = _insert_app(db, payload, created_by=payload.get("_created_by"))
    db.commit()
    db.refresh(row)
    return serialize_app(row)


def update_app(db: Session, app_code: str, payload: dict):
    row = _get(db, app_code)
    for attr, key in (("system_app_code", "systemAppCode"), ("segment", "segment"),
                      ("engine_model", "engineModel"), ("kva", "kva"), ("emission", "emission")):
        if payload.get(key) is not None:
            setattr(row, attr, payload.get(key))
    if payload.get("parts") is not None:
        for p in list(row.parts):
            db.delete(p)
        db.flush()
        for i, p in enumerate(payload["parts"]):
            _ensure_service_for_hours(db, p.get("serviceHours"))
            db.add(MaintenancePart(
                app_code_id=row.id,
                part_number=p.get("partNumber"), part_desc=p.get("partDesc"),
                qty=p.get("qty"), action=p.get("action"),
                alt_part_no=p.get("altPartNo"), alt_desc=p.get("altDesc"),
                alt_qty=p.get("altQty"), alt_action=p.get("altAction"),
                service_hours=str(p.get("serviceHours") or "500"),
                consumable=p.get("consumable"), schedule=p.get("schedule"), sort_order=i,
            ))
    db.commit()
    db.refresh(row)
    return serialize_app(row)


def delete_app(db: Session, app_code: str):
    row = _get(db, app_code)
    db.delete(row)
    db.commit()
    return True


def import_apps(db: Session, items: list):
    """Re-upload semantics: existing codes are deleted and re-inserted from the file;
    unknown codes are added. Returns the codes added vs replaced."""
    added, replaced = [], []
    for a in items:
        code = (a.get("appCode") or "").strip()
        if not code:
            continue
        existing = db.query(MaintenanceAppCode.id).filter(MaintenanceAppCode.app_code == code).first()
        if existing:
            # Set-based delete of the old code + its parts — never loads the part
            # rows into memory (matters on a full re-upload of the master file).
            db.query(MaintenancePart).filter(MaintenancePart.app_code_id == existing.id).delete(synchronize_session=False)
            db.query(MaintenanceAppCode).filter(MaintenanceAppCode.id == existing.id).delete(synchronize_session=False)
            db.flush()
            replaced.append(code)
        else:
            added.append(code)
        _insert_app(db, a, created_by=a.get("_created_by") or "import")
    db.commit()
    return {"added": added, "replaced": replaced}


# ---------------- SERVICES ---------------- #

def list_services(db: Session):
    rows = db.query(MaintenanceService).order_by(MaintenanceService.id).all()
    return [serialize_service(s) for s in rows]


def rename_service(db: Session, key: str, name: str):
    s = db.query(MaintenanceService).filter(MaintenanceService.key == key).first()
    if not s:
        raise HTTPException(status_code=404, detail=f"Service '{key}' not found")
    name = (name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")
    s.name = name
    db.commit()
    db.refresh(s)
    return serialize_service(s)


# ---------------- ACTIVITY ---------------- #

def _ts_ms(dt):
    """Epoch-ms for the stored timestamp. The DB writes India local time via
    func.now() (tagged +00:00), so we pin the wall-clock to UTC here and the client
    renders it as-is — no second timezone shift, regardless of server/driver tz."""
    if not dt:
        return None
    try:
        return int(dt.replace(tzinfo=timezone.utc).timestamp() * 1000)
    except Exception:
        return None


def list_activity(db: Session, limit: int = 1000):
    rows = (db.query(MaintenanceActivity)
            .order_by(MaintenanceActivity.created_at.desc(), MaintenanceActivity.id.desc())
            .limit(limit).all())
    return [{
        "code": r.app_code, "employee": r.employee or "Unknown", "ts": _ts_ms(r.created_at),
        "engineModel": r.engine_model or "", "segment": r.segment or "",
    } for r in rows]


def log_activity(db: Session, app_code: str, user_id: str = None, employee: str = None):
    code = (app_code or "").strip()
    if not code:
        raise HTTPException(status_code=400, detail="App Code is required")
    app = db.query(MaintenanceAppCode).filter(MaintenanceAppCode.app_code == code).first()
    row = MaintenanceActivity(
        app_code=code, user_id=user_id, employee=employee or "Unknown",
        engine_model=(app.engine_model if app else None),
        segment=(app.segment if app else None),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"code": row.app_code, "employee": row.employee, "ts": _ts_ms(row.created_at)}