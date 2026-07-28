from datetime import timezone

from fastapi import HTTPException
from sqlalchemy.orm import Session, selectinload

from app.models.maintenance_model import (
    MaintenanceAppCode, MaintenancePart, MaintenanceService, MaintenanceActivity,
    MaintenanceKit, MaintenanceKitPart, MaintenancePartCodeChange,
)


# ---------------- SERIALIZERS ---------------- #

def serialize_part(p: MaintenancePart):
    return {
        "partNumber": p.part_number or "", "partDesc": p.part_desc or "", "qty": p.qty or "",
        "action": p.action or "", "altPartNo": p.alt_part_no or "", "altDesc": p.alt_desc or "",
        "altQty": p.alt_qty or "", "altAction": p.alt_action or "",
        "altServiceHours": p.alt_service_hours or "",
        "serviceHours": p.service_hours or "500", "consumable": p.consumable or "",
        "schedule": p.schedule or "",
    }


def serialize_kit_part(kp: MaintenanceKitPart):
    return {
        "partNumber": kp.part_number or "", "partDesc": kp.part_desc or "",
        "qty": kp.qty or "", "action": kp.action or "",
        "serviceHours": kp.service_hours or "",
    }


def serialize_kit(k: MaintenanceKit):
    return {
        "id": k.id, "kitNumber": k.kit_number or "", "kitDesc": k.kit_desc or "",
        "qty": k.qty or "", "action": k.action or "", "serviceHours": k.service_hours or "",
        "createdBy": k.created_by or "", "updatedBy": k.updated_by or "",
        "parts": [serialize_kit_part(p) for p in k.parts],
    }


def serialize_app(a: MaintenanceAppCode):
    return {
        "id": a.id, "appCode": a.app_code, "systemAppCode": a.system_app_code or "",
        "segment": a.segment or "", "engineModel": a.engine_model or "",
        "kva": a.kva or "", "emission": a.emission or "",
        "createdBy": a.created_by or "", "updatedBy": a.updated_by or "",
        "parts": [serialize_part(p) for p in a.parts],
        "kits": [serialize_kit(k) for k in a.kits],
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


def _track_part_code_changes(db: Session, app_code: str, old_parts, new_parts, user_id=None):
    """Record part-code edits on the code's SERVICE parts. Kits are ignored on
    purpose — a kit's part lines are its own copies.

    Parts are replaced wholesale on save and lines carry no id, so an edited
    line is found by matching: positionally when the list length is unchanged
    (the editor edits rows in place), otherwise by a part description that is
    unique on both sides. Only an edit of an existing code counts — blanks
    being filled in and lines added/removed are not code changes.
    """
    def pair_up():
        if len(old_parts) == len(new_parts):
            return list(zip(old_parts, new_parts))

        def uniq_by_desc(rows, desc_of):
            m, dup = {}, set()
            for r in rows:
                d = str(desc_of(r) or "").strip().lower()
                if d:
                    dup.add(d) if d in m else m.setdefault(d, r)
            return {d: r for d, r in m.items() if d not in dup}

        old_m = uniq_by_desc(old_parts, lambda p: p.part_desc)
        new_m = uniq_by_desc(new_parts, lambda p: p.get("partDesc"))
        return [(old_m[d], new_m[d]) for d in old_m if d in new_m]

    norm = lambda v: str(v or "").strip().upper()
    changes = []
    for old, new in pair_up():
        old_pn, new_pn = (old.part_number or "").strip(), (new.get("partNumber") or "").strip()
        if old_pn and new_pn and norm(old_pn) != norm(new_pn):
            changes.append((old, old_pn, new, new_pn))
    if not changes:
        return

    by_pn = {
        norm(r.part_number): r
        for r in db.query(MaintenancePartCodeChange)
                   .filter(MaintenancePartCodeChange.app_code == app_code).all()
    }
    for old, old_pn, new, new_pn in changes:
        row = by_pn.pop(norm(old_pn), None)
        if row:
            row.part_number = new_pn
            row.last_part_number = old_pn
            row.part_desc = new.get("partDesc") or row.part_desc
            row.change_count = (row.change_count or 0) + 1
            row.changed_by = user_id or row.changed_by
        else:
            row = MaintenancePartCodeChange(
                app_code=app_code, part_number=new_pn, last_part_number=old_pn,
                part_desc=new.get("partDesc") or old.part_desc,
                change_count=1, changed_by=user_id,
            )
            db.add(row)
        by_pn[norm(new_pn)] = row


def _write_kits(db: Session, app_id: int, kits: list, user_id=None):
    """Replace an application code's kits with the supplied list.

    Kits are standalone: each carries its OWN copied part lines, so nothing here
    reads or touches maintenance_parts.
    """
    for i, k in enumerate(kits or []):
        row = MaintenanceKit(
            app_code_id=app_id,
            kit_number=k.get("kitNumber"), kit_desc=k.get("kitDesc"),
            qty=k.get("qty"), action=k.get("action"),
            service_hours=str(k.get("serviceHours") or "").strip() or None,
            sort_order=i, created_by=user_id, updated_by=user_id,
        )
        db.add(row)
        db.flush()  # assign row.id
        for j, kp in enumerate(k.get("parts") or []):
            db.add(MaintenanceKitPart(
                kit_id=row.id,
                part_number=kp.get("partNumber"), part_desc=kp.get("partDesc"),
                qty=kp.get("qty"), action=kp.get("action"),
                service_hours=str(kp.get("serviceHours") or "").strip() or None,
                sort_order=j,
            ))


def _insert_app(db: Session, a: dict, created_by=None):
    row = MaintenanceAppCode(
        app_code=str(a.get("appCode") or "").strip(),
        system_app_code=(a.get("systemAppCode") or None),
        segment=a.get("segment"), engine_model=a.get("engineModel"),
        kva=a.get("kva"), emission=a.get("emission"), created_by=created_by,
        updated_by=created_by,
        # Kits arrive in their own list now, so there is no legacy alt_* data on
        # this record for the backfill to lift.
        kits_migrated=True,
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
            alt_service_hours=p.get("altServiceHours"),
            service_hours=str(p.get("serviceHours") or "500"),
            consumable=p.get("consumable"), schedule=p.get("schedule"), sort_order=i,
        ))
    for k in a.get("kits") or []:
        if str(k.get("serviceHours") or "").strip():
            _ensure_service_for_hours(db, k.get("serviceHours"))
    _write_kits(db, row.id, a.get("kits"), user_id=created_by)
    return row


def _get(db: Session, app_code: str) -> MaintenanceAppCode:
    row = db.query(MaintenanceAppCode).filter(MaintenanceAppCode.app_code == app_code).first()
    if not row:
        raise HTTPException(status_code=404, detail=f"Application code '{app_code}' not found")
    return row


# ---------------- APP CODES ---------------- #

def list_apps(db: Session, slim: bool = False):
    # SLIM mode (Master Report page): the coverage matrix only reads
    # parts[].serviceHours (see partService on the client), so ship each app's
    # DISTINCT service hours instead of the full 12-field part rows — same
    # coverage result, a fraction of the query, serialization and payload cost.
    if slim:
        apps = db.query(MaintenanceAppCode).order_by(MaintenanceAppCode.app_code).all()
        hour_rows = db.query(
            MaintenancePart.app_code_id, MaintenancePart.service_hours
        ).distinct().all()
        hours_by_app = {}
        for app_id, h in hour_rows:
            # same default the full serializer applies (blank -> "500")
            hours_by_app.setdefault(app_id, set()).add(str(h or "").strip() or "500")
        return [{
            "id": a.id, "appCode": a.app_code, "systemAppCode": a.system_app_code or "",
            "segment": a.segment or "", "engineModel": a.engine_model or "",
            "kva": a.kva or "", "emission": a.emission or "",
            "parts": [{"serviceHours": h} for h in sorted(hours_by_app.get(a.id, set()))],
        } for a in apps]

    # selectinload eager-loads ALL parts in ONE extra query (parts are ordered by
    # sort_order via the relationship) instead of the N+1 that lazy access caused
    # — one query per app code. This is the main speed-up for the Master, Service
    # Selection and Report screens, which all call this endpoint.
    rows = (
        db.query(MaintenanceAppCode)
        .options(
            selectinload(MaintenanceAppCode.parts),
            selectinload(MaintenanceAppCode.kits).selectinload(MaintenanceKit.parts),
        )
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
    row.updated_by = payload.get("_updated_by") or row.updated_by
    for attr, key in (("system_app_code", "systemAppCode"), ("segment", "segment"),
                      ("engine_model", "engineModel"), ("kva", "kva"), ("emission", "emission")):
        if payload.get(key) is not None:
            setattr(row, attr, payload.get(key))
    if payload.get("kits") is not None:
        # Kits are replaced wholesale — they own their part copies, so nothing
        # has to be reconciled against maintenance_parts.
        for k in list(row.kits):
            db.delete(k)
        db.flush()
        for k in payload["kits"]:
            if str(k.get("serviceHours") or "").strip():
                _ensure_service_for_hours(db, k.get("serviceHours"))
        _write_kits(db, row.id, payload["kits"], user_id=payload.get("_updated_by"))
        row.kits_migrated = True
    if payload.get("parts") is not None:
        _track_part_code_changes(db, row.app_code, list(row.parts), payload["parts"],
                                 user_id=payload.get("_updated_by"))
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
                alt_service_hours=p.get("altServiceHours"),
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
            # Set-based delete of the old code + its parts and kits — never loads
            # those rows into memory (matters on a full re-upload of the master
            # file). Kit parts go first, then kits, then parts, then the code.
            kit_ids = [k for (k,) in db.query(MaintenanceKit.id).filter(MaintenanceKit.app_code_id == existing.id).all()]
            if kit_ids:
                db.query(MaintenanceKitPart).filter(MaintenanceKitPart.kit_id.in_(kit_ids)).delete(synchronize_session=False)
                db.query(MaintenanceKit).filter(MaintenanceKit.id.in_(kit_ids)).delete(synchronize_session=False)
            db.query(MaintenancePart).filter(MaintenancePart.app_code_id == existing.id).delete(synchronize_session=False)
            db.query(MaintenanceAppCode).filter(MaintenanceAppCode.id == existing.id).delete(synchronize_session=False)
            db.flush()
            replaced.append(code)
        else:
            added.append(code)
        _insert_app(db, a, created_by=a.get("_created_by") or "import")
    db.commit()
    return {"added": added, "replaced": replaced}


# ---------------- ONE-TIME KIT BACKFILL ---------------- #

def _legacy_kits_of(parts: list) -> list:
    """Rebuild kits from the LEGACY per-part kit columns (alt_*).

    The old master sheet merged one kit down a run of part rows: the run's first
    row carried the kit values and the rows under it were blank. A row whose kit
    number repeated its own part number was a "loose" part, and it closed the run
    above it. This mirrors that exactly, and copies each covered part line into
    the kit — which is all a kit is now.
    """
    def t(v):
        return str(v or "").strip()

    kits, cur = [], None
    for p in parts:
        has_kit = bool(t(p.alt_part_no) or t(p.alt_desc) or t(p.alt_qty) or t(p.alt_action))
        copy = {
            "partNumber": p.part_number or "", "partDesc": p.part_desc or "",
            "qty": p.qty or "", "action": p.action or "",
            "serviceHours": p.service_hours or "",
        }
        if has_kit and t(p.alt_part_no) == t(p.part_number):
            cur = None                      # loose part — ends the run above it
        elif has_kit:
            cur = {
                "kitNumber": p.alt_part_no or "", "kitDesc": p.alt_desc or "",
                "qty": p.alt_qty or "", "action": p.alt_action or "",
                "serviceHours": p.alt_service_hours or "",
                "parts": [copy],
            }
            kits.append(cur)
        elif cur is not None:
            cur["parts"].append(copy)       # blank row — merged into the kit above
    return kits


def backfill_kits(db: Session) -> int:
    """Lift every application code's legacy kit data into maintenance_kits.

    Runs on startup and is idempotent: a code is processed once and flagged via
    kits_migrated, so kits the Master Admin later deletes are never resurrected.
    Returns how many codes were converted.
    """
    rows = (
        db.query(MaintenanceAppCode)
        .options(selectinload(MaintenanceAppCode.parts))
        .filter((MaintenanceAppCode.kits_migrated == False) | (MaintenanceAppCode.kits_migrated.is_(None)))  # noqa: E712
        .all()
    )
    if not rows:
        return 0
    for a in rows:
        kits = _legacy_kits_of(a.parts)
        if kits:
            _write_kits(db, a.id, kits, user_id=a.created_by)
        a.kits_migrated = True
    db.commit()
    return len(rows)


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


def _active_assets(q):
    """Restrict an Asset Detailed query to operationally ACTIVE assets only.

    The data hub also carries inactive / blank-status assets; those must not
    count toward the app-code mapping or the commissioning dates."""
    from sqlalchemy import func
    from app.models.customer_model import AssetDetailed

    return q.filter(
        func.upper(func.ltrim(func.rtrim(AssetDetailed.asset_operational_status))) == "ACTIVE"
    )


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
    cased and restricted to ACTIVE assets the same way as app_mapping so the two
    line up."""
    from sqlalchemy import func
    from app.models.customer_model import AssetDetailed

    norm = func.upper(func.ltrim(func.rtrim(AssetDetailed.application_code)))
    q = (
        db.query(norm.label("code"), func.max(AssetDetailed.commissioning_date).label("commissioning"))
        .filter(AssetDetailed.application_code.isnot(None))
        .filter(func.ltrim(func.rtrim(AssetDetailed.application_code)) != "")
        .filter(AssetDetailed.commissioning_date.isnot(None))
    )
    rows = _active_assets(q).group_by(norm).all()
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
    Only assets whose Asset Operational Status is "Active" are considered —
    inactive / blank-status assets are excluded from the codes, the counts and
    the commissioning dates. Codes are compared case-insensitively after
    trimming and after stripping trailing dots ("3H.8422..." matches "3H.8422").
    """
    from sqlalchemy import func
    from app.models.customer_model import AssetDetailed

    norm = func.upper(func.ltrim(func.rtrim(AssetDetailed.application_code)))
    q = (
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
    )
    rows = _active_assets(q).group_by(norm).all()

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
