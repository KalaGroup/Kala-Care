import json
from datetime import datetime, date

from fastapi import HTTPException
from sqlalchemy.orm import Session, selectinload

from app.models.mom_model import (
    MomCategory, MomMasterPoint, MomMeeting, MomAttendee, MomRow,
)

# Seeded on first run so the module works out of the box; fully editable
# afterwards from the "Master setup" modal.
DEFAULT_CATEGORIES = [
    ("Sales", "#2f3192"), ("Service", "#0d9488"), ("Finance", "#059669"),
    ("People", "#7c3aed"), ("Marketing", "#d97706"), ("Other", "#64748b"),
]
DEFAULT_MASTER_POINTS = [
    ("Sales target vs achievement (MTD)", "Sales"),
    ("Outstanding payments & collections", "Finance"),
    ("AMC renewals due this month", "Service"),
    ("Pending service calls / installations", "Service"),
    ("Customer complaints & escalations", "Service"),
    ("Active campaign progress & follow-ups", "Marketing"),
    ("Spare parts / inventory status", "Service"),
    ("Staff attendance & performance", "People"),
    ("Expense vouchers pending approval", "Finance"),
    ("Local marketing / lead generation", "Marketing"),
    ("Training & skill development", "People"),
    ("Any other business (AOB)", "Other"),
]


# ---------------- HELPERS ---------------- #

def _parse_date(value):
    """'YYYY-MM-DD' -> date, anything falsy/invalid -> None."""
    if not value:
        return None
    if isinstance(value, date):
        return value
    try:
        return datetime.strptime(str(value)[:10], "%Y-%m-%d").date()
    except ValueError:
        return None


def _iso(d):
    return d.isoformat() if d else ""


def _load_prev_remarks(raw):
    if not raw:
        return []
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, list) else []
    except (ValueError, TypeError):
        return []


# ---------------- SERIALIZERS (camelCase, matching the frontend) ---------------- #

def serialize_point(p: MomMasterPoint):
    return {"id": p.id, "title": p.title, "category": p.category or "Other", "sortOrder": p.sort_order or 0}


def serialize_category(c: MomCategory):
    return {"name": c.name, "color": c.color or "#64748b"}


def serialize_attendee(a: MomAttendee):
    return {
        "id": a.id, "name": a.name, "source": a.source or "employee",
        "present": bool(a.present), "user_id": a.user_id,
    }


def serialize_row(r: MomRow):
    return {
        "id": r.id, "trackId": r.track_id,
        "masterId": r.master_id, "area": r.area or "", "category": r.category or "Other",
        "point": r.point or "", "resp": r.responsibility or "",
        "due": _iso(r.due_date), "flag": r.flag or "I", "status": r.status or "pending",
        "remark": r.remark or "", "originDate": _iso(r.origin_date),
        "carried": bool(r.carried), "prevRemarks": _load_prev_remarks(r.prev_remarks),
    }


def serialize_meeting(m: MomMeeting):
    return {
        "id": m.id, "branchCode": m.branch_code, "branchName": m.branch_name or "",
        "date": _iso(m.meeting_date), "location": m.location or "",
        "type": m.meeting_type or "", "conductedBy": m.conducted_by or "",
        "attendees": [serialize_attendee(a) for a in m.attendees],
        "rows": [serialize_row(r) for r in m.rows],
    }


# ---------------- BOOTSTRAP (master points + categories) ---------------- #

def _seed_defaults(db: Session, created_by=None):
    for name, color in DEFAULT_CATEGORIES:
        db.add(MomCategory(name=name, color=color, created_by=created_by))
    for i, (title, category) in enumerate(DEFAULT_MASTER_POINTS):
        db.add(MomMasterPoint(title=title, category=category, sort_order=i, created_by=created_by))
    db.commit()


def get_bootstrap(db: Session, created_by=None):
    """Master points + categories; seeds the defaults on the very first call."""
    if db.query(MomMasterPoint.id).first() is None and db.query(MomCategory.id).first() is None:
        _seed_defaults(db, created_by)
    points = db.query(MomMasterPoint).order_by(MomMasterPoint.sort_order, MomMasterPoint.id).all()
    cats = db.query(MomCategory).order_by(MomCategory.id).all()
    return {
        "masterPoints": [serialize_point(p) for p in points],
        "categories": [serialize_category(c) for c in cats],
    }


# ---------------- MEETINGS ---------------- #

def list_meetings(db: Session, branch_code=None):
    q = (
        db.query(MomMeeting)
        .options(selectinload(MomMeeting.attendees), selectinload(MomMeeting.rows))
        .order_by(MomMeeting.meeting_date.desc(), MomMeeting.id.desc())
    )
    if branch_code:
        q = q.filter(MomMeeting.branch_code == branch_code)
    return [serialize_meeting(m) for m in q.all()]


def create_meeting(db: Session, data: dict, conducted_by_id=None, conducted_by_name=""):
    meeting_date = _parse_date(data.get("date"))
    if meeting_date is None:
        raise HTTPException(status_code=422, detail="A valid meeting date (YYYY-MM-DD) is required")
    if not (data.get("branchCode") or "").strip():
        raise HTTPException(status_code=422, detail="branchCode is required")

    meeting = MomMeeting(
        branch_code=data["branchCode"].strip(),
        branch_name=(data.get("branchName") or "").strip(),
        meeting_date=meeting_date,
        location=(data.get("location") or "").strip(),
        meeting_type=(data.get("type") or "").strip(),
        conducted_by_id=conducted_by_id,
        conducted_by=conducted_by_name or "",
    )

    for att in data.get("attendees") or []:
        name = (att.get("name") or "").strip()
        if not name:
            continue
        meeting.attendees.append(MomAttendee(
            name=name,
            source=att.get("source") or "employee",
            present=bool(att.get("present", True)),
            user_id=att.get("user_id"),
        ))

    for i, row in enumerate(data.get("rows") or []):
        prev = row.get("prevRemarks") or []
        meeting.rows.append(MomRow(
            track_id=(row.get("trackId") or "").strip() or f"t{i}",
            master_id=str(row["masterId"]) if row.get("masterId") not in (None, "") else None,
            sort_order=i,
            area=(row.get("area") or "").strip(),
            category=row.get("category") or "Other",
            point=row.get("point") or "",
            responsibility=(row.get("resp") or "").strip(),
            due_date=_parse_date(row.get("due")),
            flag="T" if row.get("flag") == "T" else "I",
            status=row.get("status") or "pending",
            remark=row.get("remark") or "",
            origin_date=_parse_date(row.get("originDate")) or meeting_date,
            carried=bool(row.get("carried")),
            prev_remarks=json.dumps(prev, ensure_ascii=False) if prev else None,
        ))

    db.add(meeting)
    db.commit()
    db.refresh(meeting)
    return serialize_meeting(meeting)


def delete_meeting(db: Session, meeting_id: int):
    meeting = db.query(MomMeeting).filter(MomMeeting.id == meeting_id).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    db.delete(meeting)   # attendees + rows removed via cascade
    db.commit()
    return True


# ---------------- MASTER POINTS ---------------- #

def create_point(db: Session, title: str, category: str, created_by=None):
    title = (title or "").strip()
    if not title:
        raise HTTPException(status_code=422, detail="Title is required")
    max_order = db.query(MomMasterPoint).count()
    point = MomMasterPoint(title=title, category=category or "Other", sort_order=max_order, created_by=created_by)
    db.add(point)
    db.commit()
    db.refresh(point)
    return serialize_point(point)


def update_point(db: Session, point_id: int, title=None, category=None):
    point = db.query(MomMasterPoint).filter(MomMasterPoint.id == point_id).first()
    if not point:
        raise HTTPException(status_code=404, detail="Master point not found")
    if title is not None:
        title = title.strip()
        if not title:
            raise HTTPException(status_code=422, detail="Title cannot be empty")
        point.title = title
    if category is not None:
        point.category = category
    db.commit()
    db.refresh(point)
    return serialize_point(point)


def delete_point(db: Session, point_id: int):
    point = db.query(MomMasterPoint).filter(MomMasterPoint.id == point_id).first()
    if not point:
        raise HTTPException(status_code=404, detail="Master point not found")
    db.delete(point)
    db.commit()
    return True


# ---------------- CATEGORIES ---------------- #

def create_category(db: Session, name: str, color: str, created_by=None):
    name = (name or "").strip()
    if not name:
        raise HTTPException(status_code=422, detail="Category name is required")
    if db.query(MomCategory).filter(MomCategory.name == name).first():
        raise HTTPException(status_code=409, detail="Category already exists")
    cat = MomCategory(name=name, color=color or "#64748b", created_by=created_by)
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return serialize_category(cat)


def update_category(db: Session, name: str, color: str):
    cat = db.query(MomCategory).filter(MomCategory.name == name).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    cat.color = color
    db.commit()
    return serialize_category(cat)


def delete_category(db: Session, name: str):
    """Delete a category; its master points move to the first remaining one
    (mirrors the frontend behaviour)."""
    cat = db.query(MomCategory).filter(MomCategory.name == name).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    fallback = (
        db.query(MomCategory)
        .filter(MomCategory.name != name)
        .order_by(MomCategory.id)
        .first()
    )
    if not fallback:
        raise HTTPException(status_code=409, detail="Keep at least one category")
    db.query(MomMasterPoint).filter(MomMasterPoint.category == name).update({"category": fallback.name})
    db.delete(cat)
    db.commit()
    return {"movedTo": fallback.name}
