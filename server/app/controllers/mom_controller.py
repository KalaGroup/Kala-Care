import json
from datetime import datetime, date, timedelta

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

from app.models.mom_model import (
    MomCategory, MomMasterPoint, MomMeetingType, MomMeeting, MomAttendee, MomRow,
    MomDraft,
)
from app.time_utils import now_ist

# ------------------------------------------------------------------ #
#  defaults seeded on first run                                       #
# ------------------------------------------------------------------ #
DEFAULT_CATEGORIES = {
    "Sales": "#2f3192", "Service": "#0d9488", "Finance": "#059669",
    "People": "#7c3aed", "Marketing": "#d97706", "Other": "#64748b",
}
DEFAULT_MEETING_TYPES = [
    "Monthly Branch Review",
    "Weekly Review",
    "Sales Review",
    "Service Review",
    "Special / Ad-hoc",
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


# ------------------------------------------------------------------ #
#  helpers                                                            #
# ------------------------------------------------------------------ #
def _parse_date(value):
    """'YYYY-MM-DD' → date | None (empty strings tolerated)."""
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


def _iso_dt(dt):
    """datetime → 'YYYY-MM-DDTHH:MM:SS' (naive IST, as stored) | ''."""
    return dt.isoformat(timespec="seconds") if dt else ""


def _load_json_list(raw):
    """TEXT column that should contain a JSON list → list (never raises)."""
    if not raw:
        return []
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, list) else []
    except (ValueError, TypeError):
        return []


def _load_resp(raw):
    """
    responsibility column → list of names.
    New rows store a JSON list; legacy rows may hold a plain string,
    which is returned as a one-person list.
    """
    if not raw:
        return []
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, list):
            return [str(x) for x in parsed if str(x).strip()]
    except (ValueError, TypeError):
        pass
    return [raw]  # legacy single-name string


def _normalize_resp(value):
    """Incoming resp (list | str | None) → clean list of names."""
    if isinstance(value, str):
        value = [value] if value.strip() else []
    return [str(x).strip() for x in (value or []) if str(x).strip()]


def _load_branches(m: MomMeeting):
    """meeting.branches JSON → list, falling back to the primary branch."""
    branches = _load_json_list(m.branches)
    cleaned = [
        {"code": str(b.get("code") or "").strip(),
         "name": str(b.get("name") or "").strip() or str(b.get("code") or "").strip()}
        for b in branches if isinstance(b, dict) and str(b.get("code") or "").strip()
    ]
    if cleaned:
        return cleaned
    return [{"code": m.branch_code, "name": m.branch_name or m.branch_code}]


# ------------------------------------------------------------------ #
#  serializers (camelCase for the frontend)                           #
# ------------------------------------------------------------------ #
def serialize_row(r: MomRow):
    return {
        "id": f"db{r.id}",
        "trackId": r.track_id,
        "masterId": r.master_id,
        "area": r.area,
        "category": r.category,
        "point": r.point or "",
        "resp": _load_resp(r.responsibility),          # list of names
        "due": _iso(r.due_date),
        "flag": r.flag,
        "status": r.status,
        "remark": r.remark or "",
        "originDate": _iso(r.origin_date),
        "carried": bool(r.carried),
        "prevRemarks": _load_json_list(r.prev_remarks),
        # when the point's wording / owners / due were last rewritten — the
        # client uses it to decide whose version of a tracked point is newest
        "editedAt": _iso_dt(r.edited_at),
    }


def serialize_attendee(a: MomAttendee):
    return {
        "id": f"db{a.id}",
        "name": a.name,
        "source": a.source,
        "present": bool(a.present),
        "user_id": a.user_id,
        "branch": a.branch,
    }


def serialize_meeting(m: MomMeeting):
    return {
        "id": m.id,
        "branchCode": m.branch_code,
        "branchName": m.branch_name,
        "branches": _load_branches(m),                 # [{code, name}, …]
        "date": _iso(m.date),
        "location": m.location or "",
        "type": m.type or "",
        "conductedBy": m.conducted_by or "",
        "createdAt": _iso_dt(m.created_at),             # when the sheet was finalized
        "heads": [str(h).strip() for h in _load_json_list(m.heads) if str(h).strip()],
        "attendees": [serialize_attendee(a) for a in m.attendees],
        "rows": [serialize_row(r) for r in m.rows],
    }


def serialize_master_point(p: MomMasterPoint):
    return {"id": p.id, "title": p.title, "category": p.category}


def serialize_category(c: MomCategory):
    return {"id": c.id, "name": c.name, "color": c.color}


def serialize_meeting_type(t: MomMeetingType):
    return {"id": t.id, "name": t.name}


# ------------------------------------------------------------------ #
#  bootstrap: master points + categories (seed defaults on first run) #
# ------------------------------------------------------------------ #
def get_bootstrap(db: Session, created_by: str | None = None):
    # Seed-on-empty: the list queries below double as the emptiness check, so
    # the steady state runs THREE queries total instead of three extra COUNTs
    # before them. First run (empty tables) seeds and re-queries as before.
    cats = db.query(MomCategory).order_by(MomCategory.id).all()
    if not cats:
        for name, color in DEFAULT_CATEGORIES.items():
            db.add(MomCategory(name=name, color=color))
        db.commit()
        cats = db.query(MomCategory).order_by(MomCategory.id).all()

    points = (
        db.query(MomMasterPoint)
        .filter(MomMasterPoint.is_active == True)  # noqa: E712 — `.is_(True)` renders `IS 1`, invalid on SQL Server
        .order_by(MomMasterPoint.id)
        .all()
    )
    if not points and db.query(MomMasterPoint.id).first() is None:
        # truly empty (not just all soft-deleted) — seed the defaults
        for title, cat in DEFAULT_MASTER_POINTS:
            db.add(MomMasterPoint(title=title, category=cat))
        db.commit()
        points = (
            db.query(MomMasterPoint)
            .filter(MomMasterPoint.is_active == True)  # noqa: E712
            .order_by(MomMasterPoint.id)
            .all()
        )

    types = db.query(MomMeetingType).order_by(MomMeetingType.id).all()
    if not types:
        for name in DEFAULT_MEETING_TYPES:
            db.add(MomMeetingType(name=name))
        db.commit()
        types = db.query(MomMeetingType).order_by(MomMeetingType.id).all()
    return {
        "masterPoints": [serialize_master_point(p) for p in points],
        "categories": [serialize_category(c) for c in cats],
        "meetingTypes": [serialize_meeting_type(t) for t in types],
    }


# ------------------------------------------------------------------ #
#  meetings                                                           #
# ------------------------------------------------------------------ #
def list_meetings(db: Session, branch_code: str | None = None):
    # selectinload eager-loads attendees and rows in ONE extra query each
    # (ordered by the relationship's own order_by) instead of joinedload, which
    # would multiply every meeting row by attendees × rows (a cartesian blow-up)
    # and both bloat the payload and slow the query. Same data, far less work.
    q = (
        db.query(MomMeeting)
        .options(selectinload(MomMeeting.attendees), selectinload(MomMeeting.rows))
        .order_by(MomMeeting.date.desc(), MomMeeting.id.desc())
    )
    if branch_code:
        # NOTE: multi-branch meetings are matched on the primary branch here;
        # the frontend fans meetings out per branch client-side from `branches`.
        q = q.filter(MomMeeting.branch_code == branch_code)
    return [serialize_meeting(m) for m in q.all()]


def create_meeting(db: Session, data: dict, conducted_by_id: str | None = None,
                   conducted_by_name: str = ""):
    mdate = _parse_date(data.get("date"))
    if not mdate:
        raise HTTPException(status_code=422, detail="A valid meeting date is mandatory")
    if not (data.get("branchCode") or "").strip():
        raise HTTPException(status_code=422, detail="branchCode is required")

    # --- branches: full list, defaulting to the primary branch ---------
    branches = []
    for b in data.get("branches") or []:
        code = str(b.get("code") or "").strip()
        if code and not any(x["code"] == code for x in branches):
            branches.append({"code": code, "name": str(b.get("name") or "").strip() or code})
    if not branches:
        code = data["branchCode"].strip()
        branches = [{"code": code, "name": (data.get("branchName") or "").strip() or code}]

    branch_name = (data.get("branchName") or "").strip() or " + ".join(b["name"] for b in branches)

    # meeting heads — the conductor is always kept as the first head
    heads = []
    for h in [conducted_by_name, *(data.get("heads") or [])]:
        h = str(h or "").strip()
        if h and h not in heads:
            heads.append(h)

    meeting = MomMeeting(
        branch_code=data["branchCode"].strip(),
        branch_name=branch_name,
        branches=json.dumps(branches, ensure_ascii=False),
        date=mdate,
        location=(data.get("location") or "").strip(),
        type=(data.get("type") or "").strip(),          # preset OR custom typed text
        conducted_by=conducted_by_name or "",
        heads=json.dumps(heads, ensure_ascii=False) if heads else None,
        created_by=conducted_by_id,
    )
    db.add(meeting)
    db.flush()  # meeting.id

    for att in data.get("attendees") or []:
        name = (att.get("name") or "").strip()
        if not name:
            continue
        db.add(MomAttendee(
            meeting_id=meeting.id,
            name=name,
            source=att.get("source") or "employee",
            present=bool(att.get("present", True)),
            user_id=att.get("user_id"),
            branch=(att.get("branch") or None),
        ))

    for pos, row in enumerate(data.get("rows") or []):
        flag = "T" if row.get("flag") == "T" else "I"
        resp = _normalize_resp(row.get("resp"))
        db.add(MomRow(
            meeting_id=meeting.id,
            position=pos,
            track_id=(row.get("trackId") or f"t{meeting.id}-{pos}"),
            master_id=row.get("masterId"),
            area=(row.get("area") or "").strip() or "—",
            category=row.get("category") or "Other",
            point=row.get("point") or "",
            responsibility=json.dumps(resp, ensure_ascii=False) if resp else None,
            due_date=_parse_date(row.get("due")) if flag == "T" else None,   # I rows never keep a due date
            flag=flag,
            status=row.get("status") or "pending",
            remark=row.get("remark") or "",
            origin_date=_parse_date(row.get("originDate")) or mdate,
            carried=bool(row.get("carried")),
            prev_remarks=json.dumps(row.get("prevRemarks") or [], ensure_ascii=False),
        ))

    db.commit()
    db.refresh(meeting)
    return serialize_meeting(meeting)


def _row_definition(area, category, point, resp, due, flag, master_id):
    """The part of a row that DEFINES the tracked point (what was discussed and
    by whom, by when) — status / remark are that meeting's own outcome and are
    deliberately left out, so re-typing a remark never counts as a rewrite."""
    return (
        (area or "").strip(), (category or "").strip(), (point or "").strip(),
        tuple(resp or []), due, flag,
        str(master_id) if master_id is not None else "",
    )


def _later_meetings(db: Session, meeting: MomMeeting):
    """Every meeting of the SAME branch(es) held after `meeting`, oldest first.

    Meetings can cover several branches, so the overlap is checked on the full
    branch list, not just the primary branch code."""
    codes = {b["code"] for b in _load_branches(meeting)}
    candidates = (
        db.query(MomMeeting)
        .options(selectinload(MomMeeting.rows))
        .filter(MomMeeting.date >= meeting.date, MomMeeting.id != meeting.id)
        .order_by(MomMeeting.date, MomMeeting.id)
        .all()
    )
    return [
        m for m in candidates
        if (m.date, m.id) > (meeting.date, meeting.id)
        and codes & {b["code"] for b in _load_branches(m)}
    ]


def _propagate_added_rows(db: Session, meeting: MomMeeting, added: list):
    """Push points ADDED while editing a past meeting into the meetings that
    already happened after it.

    Rule (Master Admin editing MOM History):
      • editing an EXISTING point only changes that meeting — the sheets of the
        meetings held after it keep the snapshot they were signed off with;
      • ADDING a new open task is a point the branch still owes, so it is
        inserted as a carried (C/F) row into every later meeting of the same
        branch and therefore also carries into the next new meeting.

    The remark trail is chained meeting by meeting exactly like a normally
    carried task, and the push stops at the meeting where the task is already
    marked completed. Re-running the edit is safe: a meeting that already holds
    the track is left alone.

    Returns the later meetings that were changed."""
    open_tasks = [r for r in added if r["flag"] == "T" and r["status"] != "completed"]
    if not open_tasks:
        return []
    later = _later_meetings(db, meeting)
    if not later:
        return []

    # running carry state per track, starting from how the row stands in the
    # edited meeting (its own review becomes the first trail entry)
    state = {
        r["track_id"]: {
            "status": r["status"],
            "trail": list(r["prev_remarks"]) + [{
                "date": _iso(meeting.date), "text": r["remark"] or "",
                "status": r["status"], "by": meeting.conducted_by or "",
            }],
        }
        for r in open_tasks
    }

    touched = []
    for m in later:
        existing = {r.track_id: r for r in m.rows if r.track_id}
        next_pos = max((r.position for r in m.rows), default=-1) + 1
        changed = False
        for r in open_tasks:
            st = state[r["track_id"]]
            if st["status"] == "completed":
                continue                      # closed earlier — nothing left to carry
            row = existing.get(r["track_id"])
            if row is None:
                m.rows.append(MomRow(
                    position=next_pos,
                    track_id=r["track_id"],
                    master_id=r["master_id"],
                    area=r["area"],
                    category=r["category"],
                    point=r["point"],
                    responsibility=r["responsibility"],
                    due_date=r["due_date"],
                    flag="T",
                    status=st["status"],
                    remark="",                # not reviewed in that meeting
                    origin_date=r["origin_date"],
                    carried=True,
                    prev_remarks=json.dumps(st["trail"], ensure_ascii=False),
                    edited_at=r["edited_at"],
                ))
                next_pos += 1
                changed = True
                review_text, review_status = "", st["status"]
            else:
                # already on that sheet (earlier push) — keep its own review
                review_text, review_status = (row.remark or ""), row.status
            st["trail"] = st["trail"] + [{
                "date": _iso(m.date), "text": review_text,
                "status": review_status, "by": m.conducted_by or "",
            }]
            st["status"] = review_status
        if changed:
            touched.append(m)
    return touched


def update_meeting(db: Session, meeting_id: int, data: dict, editor_name: str = ""):
    """Edit an already-finalized meeting (MOM History → Edit).

    Only the meeting's own details, attendees and rows are updated — the
    branch(es) and the original conductor are left exactly as they were.
    Attendees and rows are fully replaced from the payload; the client sends
    the carried (past) rows back unchanged along with the edited current rows,
    so the full sheet is preserved. Row storage mirrors create_meeting() so
    the saved shape stays identical.

    Two things reach beyond this meeting (see _propagate_added_rows):
      • a rewritten point is stamped `edited_at`, so the next meeting carries
        the NEW wording forward while the already-saved later meetings keep
        their own snapshot;
      • a newly added open task is inserted into the later meetings of the
        same branch as a carried row.

    Returns {"meeting": …, "propagated": [later meetings that changed]}."""
    meeting = (
        db.query(MomMeeting)
        .options(selectinload(MomMeeting.rows))
        .filter(MomMeeting.id == meeting_id)
        .first()
    )
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    # snapshot the rows BEFORE they are replaced, so the save can tell an
    # untouched row from a rewritten one and a brand-new point from both
    before = {
        r.track_id: {
            "definition": _row_definition(
                r.area, r.category, r.point, _load_resp(r.responsibility),
                r.due_date, r.flag, r.master_id,
            ),
            "edited_at": r.edited_at,
        }
        for r in meeting.rows if r.track_id
    }

    if data.get("date") is not None:
        mdate = _parse_date(data.get("date"))
        if not mdate:
            raise HTTPException(status_code=422, detail="A valid meeting date is mandatory")
        meeting.date = mdate
    if data.get("location") is not None:
        meeting.location = (data.get("location") or "").strip()
    if data.get("type") is not None:
        meeting.type = (data.get("type") or "").strip()
    if data.get("heads") is not None:
        # the original conductor is always kept as the first head
        heads = []
        for h in [meeting.conducted_by, *(data.get("heads") or [])]:
            h = str(h or "").strip()
            if h and h not in heads:
                heads.append(h)
        meeting.heads = json.dumps(heads, ensure_ascii=False) if heads else None

    mdate = meeting.date

    # attendees — full replace (clear respects the delete-orphan cascade)
    if data.get("attendees") is not None:
        meeting.attendees.clear()
        db.flush()
        for att in data.get("attendees") or []:
            name = (att.get("name") or "").strip()
            if not name:
                continue
            meeting.attendees.append(MomAttendee(
                name=name,
                source=att.get("source") or "employee",
                present=bool(att.get("present", True)),
                user_id=att.get("user_id"),
                branch=(att.get("branch") or None),
            ))

    # rows — full replace (client resends carried + current + new)
    propagated = []
    if data.get("rows") is not None:
        now = now_ist()
        prepared, added = [], []
        for pos, row in enumerate(data.get("rows") or []):
            flag = "T" if row.get("flag") == "T" else "I"
            resp = _normalize_resp(row.get("resp"))
            track_id = (row.get("trackId") or f"t{meeting.id}-{pos}")
            area = (row.get("area") or "").strip() or "—"
            category = row.get("category") or "Other"
            point = row.get("point") or ""
            due = _parse_date(row.get("due")) if flag == "T" else None
            master_id = row.get("masterId")

            definition = _row_definition(area, category, point, resp, due, flag, master_id)
            old = before.get(track_id)
            if old is None or old["definition"] != definition:
                edited_at = now          # brand-new point, or its wording rewritten
            else:
                edited_at = old["edited_at"]     # untouched — keep it as old as it was

            spec = {
                "position": pos,
                "track_id": track_id,
                "master_id": master_id,
                "area": area,
                "category": category,
                "point": point,
                "responsibility": json.dumps(resp, ensure_ascii=False) if resp else None,
                "due_date": due,
                "flag": flag,
                "status": row.get("status") or "pending",
                "remark": row.get("remark") or "",
                "origin_date": _parse_date(row.get("originDate")) or mdate,
                "carried": bool(row.get("carried")),
                "prev_remarks": row.get("prevRemarks") or [],
                "edited_at": edited_at,
            }
            prepared.append(spec)
            if old is None:
                added.append(spec)

        meeting.rows.clear()
        db.flush()
        for spec in prepared:
            meeting.rows.append(MomRow(
                **{k: v for k, v in spec.items() if k != "prev_remarks"},
                prev_remarks=json.dumps(spec["prev_remarks"], ensure_ascii=False),
            ))
        db.flush()

        # points added to a past meeting also land in the meetings held after it
        propagated = _propagate_added_rows(db, meeting, added)

    db.commit()
    db.refresh(meeting)
    return {
        "meeting": serialize_meeting(meeting),
        "propagated": [serialize_meeting(m) for m in propagated],
    }


def delete_meeting(db: Session, meeting_id: int):
    meeting = db.query(MomMeeting).filter(MomMeeting.id == meeting_id).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    db.delete(meeting)   # attendees & rows cascade
    db.commit()
    return {"success": True}


# ------------------------------------------------------------------ #
#  master points                                                      #
# ------------------------------------------------------------------ #
def create_point(db: Session, title: str, category: str, created_by: str | None = None):
    title = (title or "").strip()
    if not title:
        raise HTTPException(status_code=422, detail="Title is required")
    point = MomMasterPoint(title=title, category=(category or "Other").strip() or "Other")
    db.add(point)
    db.commit()
    db.refresh(point)
    return serialize_master_point(point)


def update_point(db: Session, point_id: int, title: str | None = None,
                 category: str | None = None):
    point = db.query(MomMasterPoint).filter(MomMasterPoint.id == point_id).first()
    if not point:
        raise HTTPException(status_code=404, detail="Master point not found")
    if title is not None:
        title = title.strip()
        if not title:
            raise HTTPException(status_code=422, detail="Title cannot be empty")
        point.title = title
    if category:
        point.category = category.strip()
    db.commit()
    return serialize_master_point(point)


def delete_point(db: Session, point_id: int):
    point = db.query(MomMasterPoint).filter(MomMasterPoint.id == point_id).first()
    if not point:
        raise HTTPException(status_code=404, detail="Master point not found")
    point.is_active = False          # soft delete → old meetings keep their rows
    db.commit()


# ------------------------------------------------------------------ #
#  meeting types                                                      #
# ------------------------------------------------------------------ #
def create_meeting_type(db: Session, name: str, created_by: str | None = None):
    name = (name or "").strip()
    if not name:
        raise HTTPException(status_code=422, detail="Meeting type name is required")
    exists = (
        db.query(MomMeetingType)
        .filter(func.lower(MomMeetingType.name) == name.lower())
        .first()
    )
    if exists:
        raise HTTPException(status_code=409, detail="Meeting type already exists")
    mt = MomMeetingType(name=name)
    db.add(mt)
    db.commit()
    db.refresh(mt)
    return serialize_meeting_type(mt)


def update_meeting_type(db: Session, type_id: int, name: str):
    mt = db.query(MomMeetingType).filter(MomMeetingType.id == type_id).first()
    if not mt:
        raise HTTPException(status_code=404, detail="Meeting type not found")
    name = (name or "").strip()
    if not name:
        raise HTTPException(status_code=422, detail="Meeting type name is required")
    clash = (
        db.query(MomMeetingType)
        .filter(func.lower(MomMeetingType.name) == name.lower(),
                MomMeetingType.id != type_id)
        .first()
    )
    if clash:
        raise HTTPException(status_code=409, detail="Meeting type already exists")
    mt.name = name   # saved meetings keep their type text — nothing to migrate
    db.commit()
    return serialize_meeting_type(mt)


def delete_meeting_type(db: Session, type_id: int):
    mt = db.query(MomMeetingType).filter(MomMeetingType.id == type_id).first()
    if not mt:
        raise HTTPException(status_code=404, detail="Meeting type not found")
    db.delete(mt)   # saved meetings keep their type text — nothing to migrate
    db.commit()


# ------------------------------------------------------------------ #
#  categories                                                         #
# ------------------------------------------------------------------ #
def create_category(db: Session, name: str, color: str, created_by: str | None = None):
    name = (name or "").strip()
    if not name:
        raise HTTPException(status_code=422, detail="Category name is required")
    if db.query(MomCategory).filter(MomCategory.name == name).first():
        raise HTTPException(status_code=409, detail="Category already exists")
    cat = MomCategory(name=name, color=(color or "#64748b").strip())
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return serialize_category(cat)


def update_category(db: Session, name: str, color: str | None = None,
                    new_name: str | None = None):
    cat = db.query(MomCategory).filter(MomCategory.name == name).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    new_name = (new_name or "").strip()
    if new_name and new_name != cat.name:
        if db.query(MomCategory).filter(MomCategory.name == new_name).first():
            raise HTTPException(status_code=409, detail="Category already exists")
        # master points follow the rename; saved meeting rows keep their text
        db.query(MomMasterPoint).filter(MomMasterPoint.category == cat.name)\
            .update({MomMasterPoint.category: new_name})
        cat.name = new_name
    if color:
        cat.color = color.strip()
    db.commit()
    return serialize_category(cat)


def delete_category(db: Session, name: str):
    cat = db.query(MomCategory).filter(MomCategory.name == name).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    if db.query(MomCategory).count() <= 1:
        raise HTTPException(status_code=422, detail="Keep at least one category")
    fallback = (
        db.query(MomCategory)
        .filter(MomCategory.name != name)
        .order_by(MomCategory.id)
        .first()
    )
    db.query(MomMasterPoint).filter(MomMasterPoint.category == name)\
        .update({MomMasterPoint.category: fallback.name})
    db.delete(cat)
    db.commit()
    return {"movedTo": fallback.name}


# ------------------------------------------------------------------ #
#  meeting drafts (auto-saved wizard state, one per user)             #
# ------------------------------------------------------------------ #
DRAFT_MAX_AGE = timedelta(days=7)


def get_draft(db: Session, user_id: str):
    """The user's saved draft as a dict, or None. Stale drafts are purged."""
    row = db.query(MomDraft).filter(MomDraft.user_id == user_id).first()
    if not row:
        return None
    if row.saved_at and now_ist() - row.saved_at > DRAFT_MAX_AGE:
        db.delete(row)
        db.commit()
        return None
    try:
        parsed = json.loads(row.data)
        return parsed if isinstance(parsed, dict) else None
    except (ValueError, TypeError):
        return None


def save_draft(db: Session, user_id: str, data: dict):
    payload = json.dumps(data or {}, ensure_ascii=False)
    row = db.query(MomDraft).filter(MomDraft.user_id == user_id).first()
    if row:
        row.data = payload
        row.saved_at = now_ist()
    else:
        db.add(MomDraft(user_id=user_id, data=payload, saved_at=now_ist()))
    db.commit()


def delete_draft(db: Session, user_id: str):
    db.query(MomDraft).filter(MomDraft.user_id == user_id).delete()
    db.commit()