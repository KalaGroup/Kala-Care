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

# ---------------- APP MAPPING (assets vs master) ---------------- #

def _clean_code(v) -> str:
    """Asset application codes often arrive truncated with trailing dots
    ("3H.8422...") or an ellipsis — strip those (and stray spaces) so they
    match the real master codes. Internal dots are kept."""
    return str(v or "").strip().rstrip(". \u2026").strip()


def _date_iso(dt) -> str:
    """Serialize a commissioning date to YYYY-MM-DD (the client formats it)."""
    if not dt:
        return ""
    try:
        return dt.date().isoformat()
    except Exception:
        try:
            return str(dt)[:10]
        except Exception:
            return ""


def asset_commissioning(db: Session):
    """Latest commissioning date per application code from Asset Detailed.

    Used by the Service Applicability (coverage) tab, which is visible to every
    signed-in user \u2014 so this is intentionally NOT gated to the Master Admin like
    app_mapping is. One grouped, index-covered query; codes are cleaned + upper-
    cased the same way as app_mapping so the two line up."""
    from sqlalchemy import func
    from app.models.customer_model import AssetDetailed

    norm = func.upper(func.ltrim(func.rtrim(AssetDetailed.application_code)))
    rows = (
        db.query(norm.label("code"), func.max(AssetDetailed.commissioning_date).label("commissioning"))
        .filter(AssetDetailed.application_code.isnot(None))
        .filter(func.ltrim(func.rtrim(AssetDetailed.application_code)) != "")
        .filter(AssetDetailed.commissioning_date.isnot(None))
        .group_by(norm)
        .all()
    )
    merged = {}
    for r in rows:
        code = _clean_code(r.code)
        if not code or not r.commissioning:
            continue
        cur = merged.get(code)
        if cur is None or r.commissioning > cur:
            merged[code] = r.commissioning
    return [{"appCode": code, "commissioning": _date_iso(dt)} for code, dt in merged.items()]


def app_mapping(db: Session):
    """Reconcile the application codes found in Customers Data Hub -> Asset
    Detailed against the Part Detail Info master.

    Returns counts plus the list of asset app codes that are NOT uploaded to
    the master yet (with a representative engine model / segment / KVA and how
    many assets carry each code) so the Master Admin can add them directly.
    Codes are compared case-insensitively after trimming and after stripping
    trailing dots ("3H.8422..." matches "3H.8422").
    """
    from sqlalchemy import func
    from app.models.customer_model import AssetDetailed

    norm = func.upper(func.ltrim(func.rtrim(AssetDetailed.application_code)))
    rows = (
        db.query(
            norm.label("code"),
            func.count(AssetDetailed.id).label("assets"),
            func.max(AssetDetailed.engine_model).label("engine_model"),
            func.max(AssetDetailed.segment).label("segment"),
            func.max(AssetDetailed.kva_rating).label("kva"),
            func.max(AssetDetailed.emission_norm).label("emission"),
            func.max(AssetDetailed.commissioning_date).label("commissioning"),
        )
        .filter(AssetDetailed.application_code.isnot(None))
        .filter(func.ltrim(func.rtrim(AssetDetailed.application_code)) != "")
        .group_by(norm)
        .all()
    )

    # Re-aggregate after cleaning: "3H.8422..." and "3H.8422" collapse into one
    # code, summing their asset counts and keeping the first non-empty details.
    # Commissioning keeps the LATEST date across the collapsed rows.
    merged = {}
    for r in rows:
        code = _clean_code(r.code)
        if not code:
            continue
        m = merged.setdefault(code, {"assets": 0, "engine_model": "", "segment": "", "kva": "", "emission": "", "commissioning": None})
        m["assets"] += int(r.assets or 0)
        for k, v in (("engine_model", r.engine_model), ("segment", r.segment), ("kva", r.kva), ("emission", r.emission)):
            if not m[k] and v:
                m[k] = str(v)
        if r.commissioning and (m["commissioning"] is None or r.commissioning > m["commissioning"]):
            m["commissioning"] = r.commissioning

    master_codes = {
        _clean_code(c).upper()
        for (c,) in db.query(MaintenanceAppCode.app_code).all()
    }
    master_codes.discard("")

    # `codes` is every unique asset code with an `uploaded` flag, so the UI can
    # show all / uploaded / remaining without another round trip. `remaining` is
    # kept as its own list because the Add form uses it directly.
    codes, remaining, uploaded = [], [], 0
    for code, m in merged.items():
        is_uploaded = code in master_codes
        item = {
            "appCode": code,
            "engineModel": m["engine_model"],
            "segment": m["segment"],
            "kva": m["kva"],
            "emission": m["emission"],
            "assets": m["assets"],
            "commissioning": _date_iso(m["commissioning"]),
        }
        codes.append({**item, "uploaded": is_uploaded})
        if is_uploaded:
            uploaded += 1
        else:
            remaining.append(item)

    by_assets = lambda x: (-x["assets"], x["appCode"])
    codes.sort(key=by_assets)
    remaining.sort(key=by_assets)

    # The other side of the reconciliation: master codes that no asset uses. Both
    # sets are already cleaned + upper-cased, so they compare directly.
    master_only = sorted(c for c in master_codes if c not in merged)

    return {
        "uniqueAssetCodes": len(merged),
        "uploadedCount": uploaded,
        "remainingCount": len(remaining),
        "remaining": remaining,
        "codes": codes,
        "masterTotal": len(master_codes),
        "masterOnlyCount": len(master_only),
        "masterOnly": master_only,
    }
