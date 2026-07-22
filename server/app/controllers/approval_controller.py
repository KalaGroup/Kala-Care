"""Approval Application business logic.

Flow: employee ('user' level) creates an application -> the branch admin of the
application's branch approves ('branch') -> HOD approves ('hod') -> COO gives
final approval ('coo'). A branch admin can also submit (expense) applications;
those skip the branch step and start at HOD.

Levels come from the in-page Rights Master (approval_rights table), maintained
only by the two RIGHTS_MASTER_IDS users, who are always COO. Users without an
explicit right default to employee ('user') rights.
"""

from fastapi import HTTPException, status
from sqlalchemy.orm import Session, selectinload

from app.models.user_model import User, UserBranchAccess
from app.models.approval_application_model import (
    ApprovalRight, ApprovalApplication, ApprovalAttachment, ApprovalExpenseType,
    ApprovalEmployeeRule, ApprovalHODCategory, ApprovalExpenseTypeLimit,
    ApprovalApproverExclusion,
    RIGHTS_MASTER_IDS, APPROVAL_LEVELS,
)
from app.time_utils import now_ist

LEVEL_LABELS = {
    "user": "Employee",
    "branch": "Branch Admin",
    "hod": "HOD",
    "coo": "COO",
}

# status -> which level acts on it
STATUS_ACTING_LEVEL = {
    "pending_branch": "branch",
    "pending_hod": "hod",
    "pending_coo": "coo",
}


def _get_user(db: Session, user_id: str) -> User:
    user = db.query(User).filter(User.user_id == user_id).first()
    if not user or getattr(user, "is_deleted", False):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    # Blocking takes effect IMMEDIATELY here — an open session cannot keep
    # creating or approving applications after the admin blocks the user.
    if user.is_blocked:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Your account is blocked")
    return user


def _usable_ids(db: Session, ids) -> set:
    """Of the given user_ids, the ones that still exist, are not blocked and
    not soft-deleted — i.e. can actually log in and act."""
    ids = [i for i in ids if i]
    if not ids:
        return set()
    rows = db.query(User.user_id).filter(
        User.user_id.in_(ids),
        User.is_blocked == False,   # noqa: E712
        User.is_deleted == False,   # noqa: E712
    ).all()
    return {r[0] for r in rows}


def _user_branches(db: Session, user: User):
    """All branch codes the user can act on (multi-branch access aware)."""
    rows = db.query(UserBranchAccess).filter(UserBranchAccess.user_id == user.user_id).all()
    codes = [r.branch for r in rows]
    if user.branch and user.branch not in codes:
        codes.append(user.branch)
    return codes


def resolve_level(db: Session, user: User) -> str:
    """The approval level a user acts at. Rights masters are always COO;
    everyone else defaults to employee ('user') until the rights master
    assigns them a level."""
    if user.user_id in RIGHTS_MASTER_IDS:
        return "coo"
    right = db.query(ApprovalRight).filter(ApprovalRight.user_id == user.user_id).first()
    if right and right.level in APPROVAL_LEVELS:
        return right.level
    return "user"


def get_access(db: Session, user_id: str):
    user = _get_user(db, user_id)
    level = resolve_level(db, user)

    # The caller's own authority limits (shown in the page header for
    # approver views). None = unlimited.
    limits = None
    if level in ("branch", "hod", "coo"):
        right = db.query(ApprovalRight).filter(ApprovalRight.user_id == user.user_id).first()
        my_type_limits = {
            l.expense_type_id: l.max_amount
            for l in db.query(ApprovalExpenseTypeLimit).filter(
                ApprovalExpenseTypeLimit.user_id == user.user_id
            ).all()
        }
        limits = {
            "max_discount_percent": right.max_discount_percent if right else None,
            "max_credit_days": right.max_credit_days if right else None,
            "expense_types": [
                {
                    "name": et.name,
                    "max_amount": my_type_limits.get(
                        et.id, right.max_expense_amount if right else None
                    ),
                }
                for et in db.query(ApprovalExpenseType).order_by(ApprovalExpenseType.name).all()
            ],
        }

    return {
        "user_id": user.user_id,
        "name": user.name,
        "level": level,
        "level_label": LEVEL_LABELS.get(level, level),
        "is_rights_master": user.user_id in RIGHTS_MASTER_IDS,
        "branches": _user_branches(db, user),
        "limits": limits,
    }


# ---------------- RIGHTS MASTER ---------------- #

def _require_rights_master(db: Session, user_id: str) -> User:
    user = _get_user(db, user_id)
    if user.user_id not in RIGHTS_MASTER_IDS:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the approval rights master can manage rights",
        )
    return user


def list_rights(db: Session, user_id: str):
    _require_rights_master(db, user_id)
    rows = db.query(ApprovalRight).order_by(ApprovalRight.user_name).all()
    return [r.to_dict() for r in rows]


def list_assignable_users(db: Session, user_id: str):
    """All active users the rights master can assign a level to.
    The two rights-master users never appear here."""
    _require_rights_master(db, user_id)
    users = (
        db.query(User)
        .filter(User.user_id.notin_(RIGHTS_MASTER_IDS), User.is_blocked == False)  # noqa: E712
        .order_by(User.name)
        .all()
    )
    return [
        {
            "user_id": u.user_id,
            "name": u.name,
            "branch": u.branch,
            "branch_name": u.branch_name,
            "role": u.role.value if hasattr(u.role, "value") else str(u.role),
        }
        for u in users
    ]


def set_right(db: Session, admin_id: str, target_user_id: str, level: str):
    admin = _require_rights_master(db, admin_id)

    if level not in APPROVAL_LEVELS:
        raise HTTPException(status_code=400, detail=f"Unknown level — expected one of {APPROVAL_LEVELS}")
    if target_user_id in RIGHTS_MASTER_IDS:
        raise HTTPException(status_code=403, detail="Rights-master users are always COO and cannot be changed")

    target = db.query(User).filter(User.user_id == target_user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Target user not found")

    right = db.query(ApprovalRight).filter(ApprovalRight.user_id == target_user_id).first()
    if right:
        right.level = level
        right.user_name = target.name
        right.branch = target.branch
        right.granted_by = admin.user_id
        right.granted_by_name = admin.name
    else:
        right = ApprovalRight(
            user_id=target.user_id,
            user_name=target.name,
            branch=target.branch,
            level=level,
            granted_by=admin.user_id,
            granted_by_name=admin.name,
        )
        db.add(right)
    db.commit()
    db.refresh(right)
    return right.to_dict()


def remove_right(db: Session, admin_id: str, target_user_id: str):
    _require_rights_master(db, admin_id)
    right = db.query(ApprovalRight).filter(ApprovalRight.user_id == target_user_id).first()
    if not right:
        raise HTTPException(status_code=404, detail="No right found for this user")
    db.delete(right)
    db.commit()
    return True


# ---------------- AUTHORITY MATRIX HELPERS ---------------- #

def _employee_rule(db: Session, user_id: str) -> dict:
    """Approval chain flags for an employee. No row = full chain."""
    r = db.query(ApprovalEmployeeRule).filter(ApprovalEmployeeRule.user_id == user_id).first()
    return {
        "require_branch": bool(r.require_branch) if r else True,
        "require_hod": bool(r.require_hod) if r else True,
    }


def _exclusions_for(db: Session, employee_id: str, category: str = None) -> set:
    """Approver ids this employee's records of THIS category must never go to."""
    if not employee_id or not category:
        return set()
    return {r.approver_id for r in db.query(ApprovalApproverExclusion).filter(
        ApprovalApproverExclusion.employee_id == employee_id,
        ApprovalApproverExclusion.category == category,
    ).all()}


def _has_branch_approver(db: Session, branch: str, creator_id: str = None, category: str = None) -> bool:
    """Is any USABLE Branch-Admin-level approver defined who covers this
    branch? Blocked / soft-deleted users and approvers excluded for the
    record's creator+category do not count."""
    ids = _usable_ids(db, [
        r[0] for r in db.query(ApprovalRight.user_id).filter(ApprovalRight.level == "branch").all()
    ]) - _exclusions_for(db, creator_id, category)
    if not ids:
        return False
    if db.query(UserBranchAccess).filter(
        UserBranchAccess.branch == branch, UserBranchAccess.user_id.in_(ids)
    ).first():
        return True
    return db.query(User).filter(User.branch == branch, User.user_id.in_(ids)).first() is not None


def _usable_hod_ids(db: Session) -> set:
    return _usable_ids(db, [
        r[0] for r in db.query(ApprovalRight.user_id).filter(ApprovalRight.level == "hod").all()
    ])


def _has_hod_approver(db: Session, category: str, creator_id: str = None) -> bool:
    """Is any USABLE HOD approver defined for this category? Category mappings
    only count when the mapped person still holds HOD authority, is not
    blocked / deleted and is not excluded for the record's creator+category."""
    hod_ids = _usable_hod_ids(db) - _exclusions_for(db, creator_id, category)
    if not hod_ids:
        return False
    mappings = db.query(ApprovalHODCategory).filter(
        ApprovalHODCategory.category == category,
        ApprovalHODCategory.user_id.isnot(None),
    ).all()
    if mappings:
        return any(m.user_id in hod_ids for m in mappings)
    return True


def _next_pending_status(db: Session, creator_user_id: str, branch: str, category: str,
                         after_level, skip_notes):
    """The first ACTIONABLE pending status after `after_level` (None = fresh
    submission), honouring the employee's chain rules AND auto-skipping steps
    that have no defined approver (no BM for the branch / no HOD for the
    category). Each auto-skip is appended to skip_notes as (level, reason) so
    the record shows why the step was jumped. COO always exists (the fixed
    rights-master users), so the chain always terminates."""
    rule = _employee_rule(db, creator_user_id)
    order = []
    if after_level is None:
        if rule["require_branch"]:
            order.append("branch")
        if rule["require_hod"]:
            order.append("hod")
    elif after_level == "branch":
        if rule["require_hod"]:
            order.append("hod")
    order.append("coo")

    for lvl in order:
        if lvl == "branch":
            if _has_branch_approver(db, branch, creator_user_id, category):
                return "pending_branch"
            skip_notes.append(("branch", "Skipped — no Branch Admin approver available for this branch"))
        elif lvl == "hod":
            if _has_hod_approver(db, category, creator_user_id):
                return "pending_hod"
            skip_notes.append(("hod", "Skipped — no HOD approver available for this category"))
        else:
            return "pending_coo"
    return "pending_coo"


def _apply_skip_notes(app_row, skip_notes):
    """Stamp auto-skip reasons on the record (no action_by = nobody acted;
    the trail shows the reason instead)."""
    for lvl, reason in skip_notes:
        if lvl == "branch" and not app_row.branch_action_remark:
            app_row.branch_action_remark = reason
        elif lvl == "hod" and not app_row.hod_action_remark:
            app_row.hod_action_remark = reason


def reroute_pending(db: Session) -> int:
    """Self-heal pass: re-evaluate every PENDING record against the current
    Authority Matrix (approver blocked / soft-deleted / rights or flow rules
    changed) and forward any record whose step can no longer be served.
    Runs after block / delete / matrix changes. Returns how many moved."""
    moved = 0

    for app_row in db.query(ApprovalApplication).filter(
        ApprovalApplication.status == "pending_branch"
    ).all():
        rule = _employee_rule(db, app_row.created_by)
        if rule["require_branch"] and _has_branch_approver(db, app_row.branch, app_row.created_by, app_row.category):
            continue
        reason = ("Skipped — step no longer required by the Authority Matrix"
                  if not rule["require_branch"]
                  else "Skipped — no active Branch Admin approver for this branch")
        if not app_row.branch_action_remark:
            app_row.branch_action_remark = reason
        skips = []
        app_row.status = _next_pending_status(
            db, app_row.created_by, app_row.branch, app_row.category, "branch", skips)
        _apply_skip_notes(app_row, skips)
        moved += 1

    for app_row in db.query(ApprovalApplication).filter(
        ApprovalApplication.status == "pending_hod"
    ).all():
        rule = _employee_rule(db, app_row.created_by)
        if rule["require_hod"] and _has_hod_approver(db, app_row.category, app_row.created_by):
            continue
        reason = ("Skipped — step no longer required by the Authority Matrix"
                  if not rule["require_hod"]
                  else "Skipped — no active HOD approver for this category")
        if not app_row.hod_action_remark:
            app_row.hod_action_remark = reason
        app_row.status = "pending_coo"
        moved += 1

    if moved:
        db.commit()
    return moved


def cleanup_user_config(db: Session, user_id: str):
    """Remove a (soft-)deleted user's approval configuration: their authority
    right, flow rule, HOD category assignments and per-type expense limits.
    Their created applications and audit trail are kept."""
    db.query(ApprovalRight).filter(ApprovalRight.user_id == user_id).delete()
    db.query(ApprovalEmployeeRule).filter(ApprovalEmployeeRule.user_id == user_id).delete()
    db.query(ApprovalHODCategory).filter(ApprovalHODCategory.user_id == user_id).delete()
    db.query(ApprovalExpenseTypeLimit).filter(ApprovalExpenseTypeLimit.user_id == user_id).delete()
    db.commit()


def _record_value(app_row):
    """The value the authority limits are checked against, per type."""
    return {
        "discounting": app_row.discount_percent,
        "credit": app_row.credit_days,
        "expense": app_row.expense_amount,
    }.get(app_row.request_type)


def _authority_limit(db: Session, user: User, app_row: ApprovalApplication):
    """The acting user's authorized limit for this application.
    None = unlimited (rights masters and users without an explicit limit).
    For expense applications, a per-expense-type limit (Authority Matrix)
    overrides the approver's general expense limit."""
    if user.user_id in RIGHTS_MASTER_IDS:
        return None
    right = db.query(ApprovalRight).filter(ApprovalRight.user_id == user.user_id).first()

    if app_row.request_type == "expense" and app_row.expense_type:
        et = db.query(ApprovalExpenseType).filter(
            ApprovalExpenseType.name == app_row.expense_type
        ).first()
        if et:
            lim = db.query(ApprovalExpenseTypeLimit).filter(
                ApprovalExpenseTypeLimit.expense_type_id == et.id,
                ApprovalExpenseTypeLimit.user_id == user.user_id,
            ).first()
            if lim is not None:
                return lim.max_amount   # may be NULL = unlimited for this type

    if not right:
        return None
    return {
        "discounting": right.max_discount_percent,
        "credit": right.max_credit_days,
        "expense": right.max_expense_amount,
    }.get(app_row.request_type)


# ---------------- APP NUMBERING ---------------- #

APP_NO_PREFIXES = {"discounting": "DIS", "credit": "CRE", "expense": "EXP"}


def _fy_label(dt):
    """Indian financial year label, e.g. 2025-26 (April to March)."""
    start = dt.year if dt.month >= 4 else dt.year - 1
    return f"{start}-{str((start + 1) % 100).zfill(2)}"


def _next_app_no(db: Session, request_type: str) -> str:
    """DIS/2025-26/01 style — per type, per financial year, counter restarts
    at 01 when the financial year changes."""
    prefix = APP_NO_PREFIXES[request_type]
    base = f"{prefix}/{_fy_label(now_ist())}/"
    rows = db.query(ApprovalApplication.app_no).filter(
        ApprovalApplication.app_no.like(base + "%")
    ).all()
    last = 0
    for (no,) in rows:
        try:
            last = max(last, int(no.rsplit("/", 1)[1]))
        except (ValueError, IndexError):
            continue
    return f"{base}{str(last + 1).zfill(2)}"


# ---------------- EXPENSE TYPE MASTER (COO view) ---------------- #

def _require_coo(db: Session, user_id: str) -> User:
    user = _get_user(db, user_id)
    if resolve_level(db, user) != "coo":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only COO can manage the expense type master",
        )
    return user


def list_expense_types(db: Session):
    rows = db.query(ApprovalExpenseType).order_by(ApprovalExpenseType.name).all()
    return [r.to_dict() for r in rows]


def add_expense_type(db: Session, user_id: str, name: str):
    admin = _require_coo(db, user_id)
    name = (name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Expense type name is required")
    exists = db.query(ApprovalExpenseType).filter(ApprovalExpenseType.name == name).first()
    if exists:
        raise HTTPException(status_code=400, detail="This expense type already exists")
    row = ApprovalExpenseType(name=name, created_by=admin.user_id, created_by_name=admin.name)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row.to_dict()


def rename_expense_type(db: Session, user_id: str, type_id: int, name: str):
    _require_coo(db, user_id)
    name = (name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Expense type name is required")
    row = db.query(ApprovalExpenseType).filter(ApprovalExpenseType.id == type_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Expense type not found")
    dup = db.query(ApprovalExpenseType).filter(
        ApprovalExpenseType.name == name, ApprovalExpenseType.id != type_id
    ).first()
    if dup:
        raise HTTPException(status_code=400, detail="This expense type already exists")

    old_name = row.name
    row.name = name
    # Keep existing applications consistent so per-type limits keep matching
    db.query(ApprovalApplication).filter(
        ApprovalApplication.expense_type == old_name
    ).update({ApprovalApplication.expense_type: name}, synchronize_session=False)
    db.commit()
    db.refresh(row)
    return row.to_dict()


def remove_expense_type(db: Session, user_id: str, type_id: int):
    _require_coo(db, user_id)
    row = db.query(ApprovalExpenseType).filter(ApprovalExpenseType.id == type_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Expense type not found")
    db.delete(row)
    db.commit()
    return True


# ---------------- AUTHORITY MATRIX (COO view) ---------------- #

def get_authority_matrix(db: Session, user_id: str):
    """Everything the Authority Matrix screen needs: every user (branch-wise)
    with their level + limits + chain rules, and the HOD category map."""
    _require_coo(db, user_id)
    users = (
        db.query(User)
        .filter(
            User.user_id.notin_(RIGHTS_MASTER_IDS),
            User.is_blocked == False,   # noqa: E712
            User.is_deleted == False,   # noqa: E712
        )
        .order_by(User.branch, User.name)
        .all()
    )
    rights = {r.user_id: r for r in db.query(ApprovalRight).all()}
    rules = {r.user_id: r for r in db.query(ApprovalEmployeeRule).all()}
    # Multiple approvers per category: {category: [mapping, ...]}
    hod_cats = {}
    for c in db.query(ApprovalHODCategory).all():
        if c.user_id:
            hod_cats.setdefault(c.category, []).append(c.to_dict())

    # Per-user, per-expense-type authority amounts {user_id: {type_id: amount}}
    user_limits = {}
    for lim in db.query(ApprovalExpenseTypeLimit).all():
        user_limits.setdefault(lim.user_id, {})[lim.expense_type_id] = lim.max_amount

    out = []
    for u in users:
        r = rights.get(u.user_id)
        rule = rules.get(u.user_id)
        out.append({
            "expense_limits": user_limits.get(u.user_id, {}),
            "user_id": u.user_id,
            "name": u.name,
            "branch": u.branch,
            "branch_name": u.branch_name,
            "role": u.role.value if hasattr(u.role, "value") else str(u.role),
            "level": r.level if r else "user",
            "max_discount_percent": r.max_discount_percent if r else None,
            "max_credit_days": r.max_credit_days if r else None,
            "max_expense_amount": r.max_expense_amount if r else None,
            "require_branch": bool(rule.require_branch) if rule else True,
            "require_hod": bool(rule.require_hod) if rule else True,
        })
    # Expense types with their per-approver limits
    limits_by_type = {}
    for lim in db.query(ApprovalExpenseTypeLimit).all():
        limits_by_type.setdefault(lim.expense_type_id, []).append(lim.to_dict())
    expense_types = [
        {**et.to_dict(), "limits": limits_by_type.get(et.id, [])}
        for et in db.query(ApprovalExpenseType).order_by(ApprovalExpenseType.name).all()
    ]

    # One entry per branch CODE (users of the same branch may carry different
    # branch_name spellings — first non-empty name wins, no duplicates)
    seen_branches = {}
    for u in users:
        code = (u.branch or "").strip()
        if code and (code not in seen_branches or not seen_branches[code]):
            seen_branches[code] = (u.branch_name or "").strip()

    # ---- Chain data for the flow-rules approval tree ----
    # Which usable BM(s) cover each branch (primary + multi-branch access).
    # Entries carry user_id + name so the tree can toggle per-employee
    # exclusions on each person.
    ba_users = [u for u in out if u["level"] == "branch"]
    ba_names = {u["user_id"]: u["name"] for u in ba_users}
    branch_approver_ids = {}
    for u in ba_users:
        if u["branch"]:
            branch_approver_ids.setdefault(u["branch"], set()).add(u["user_id"])
    if ba_names:
        for row in db.query(UserBranchAccess).filter(
            UserBranchAccess.user_id.in_(list(ba_names))
        ).all():
            branch_approver_ids.setdefault(row.branch, set()).add(row.user_id)
    branch_approvers = {
        k: sorted(({"user_id": i, "name": ba_names[i]} for i in v), key=lambda x: x["name"])
        for k, v in branch_approver_ids.items()
    }

    # Which usable HOD(s) handle each category (assigned people, else any HOD)
    hod_users = [u for u in out if u["level"] == "hod"]
    hod_ids = {u["user_id"] for u in hod_users}
    hod_name_by_id = {u["user_id"]: u["name"] for u in hod_users}
    hod_all = sorted(({"user_id": u["user_id"], "name": u["name"]} for u in hod_users),
                     key=lambda x: x["name"])
    hod_by_category = {}
    for cat in ("spares", "services", "spares_services"):
        maps = hod_cats.get(cat, [])
        if maps:
            hod_by_category[cat] = sorted(
                ({"user_id": m["user_id"], "name": hod_name_by_id.get(m["user_id"], m["user_name"] or m["user_id"])}
                 for m in maps if m["user_id"] in hod_ids),
                key=lambda x: x["name"])
        else:
            hod_by_category[cat] = hod_all

    # Per-employee, per-category exclusions {employee_id: {category: [ids]}}
    exclusions = {}
    for r in db.query(ApprovalApproverExclusion).filter(
        ApprovalApproverExclusion.category.isnot(None)
    ).all():
        exclusions.setdefault(r.employee_id, {}).setdefault(r.category, []).append(r.approver_id)

    # COO display names for the flow tree — the initial master-admin account
    # is hidden from this display on purpose
    coo_display_ids = [uid for uid in RIGHTS_MASTER_IDS if uid != "kala000001"]
    coo_names = sorted(u.name for u in db.query(User).filter(
        User.user_id.in_(coo_display_ids),
        User.is_blocked == False,   # noqa: E712
        User.is_deleted == False,   # noqa: E712
    ).all())

    return {
        "users": out,
        "branches": [{"branch": b, "branch_name": n} for b, n in sorted(seen_branches.items())],
        "hod_categories": hod_cats,
        "expense_types": expense_types,
        "chain_data": {
            "branch_approvers": branch_approvers,
            "hod_by_category": hod_by_category,
            "coo_names": coo_names,
        },
        "exclusions": exclusions,
    }


def set_approver_exclusion(db: Session, admin_id: str, payload: dict):
    """Block (or re-allow) one approver for one employee's records of ONE
    category. Other categories are untouched. If a step is left with nobody,
    pending records are re-routed onward."""
    admin = _require_coo(db, admin_id)
    employee_id = (payload.get("employee_id") or "").strip()
    approver_id = (payload.get("approver_id") or "").strip()
    category = (payload.get("category") or "").strip()
    excluded = bool(payload.get("excluded", True))
    if not employee_id or not approver_id:
        raise HTTPException(status_code=400, detail="employee_id and approver_id are required")
    if category not in ("spares", "services", "spares_services"):
        raise HTTPException(status_code=400, detail="Unknown category")
    if employee_id == approver_id:
        raise HTTPException(status_code=400, detail="An employee cannot be excluded from their own records")

    row = db.query(ApprovalApproverExclusion).filter(
        ApprovalApproverExclusion.employee_id == employee_id,
        ApprovalApproverExclusion.approver_id == approver_id,
        ApprovalApproverExclusion.category == category,
    ).first()
    if excluded and not row:
        db.add(ApprovalApproverExclusion(
            employee_id=employee_id, approver_id=approver_id, category=category,
            created_by=admin.user_id))
        db.commit()
    elif not excluded and row:
        db.delete(row)
        db.commit()

    moved = reroute_pending(db)
    return {"excluded": excluded, "moved": moved}


def _matrix_num(payload, key, as_int=False):
    v = payload.get(key)
    if v in (None, ""):
        return None
    try:
        return int(float(v)) if as_int else float(v)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail=f"{key} must be a number")


def set_authority(db: Session, admin_id: str, payload: dict):
    """Upsert a user's approval level AND authority limits from the matrix."""
    admin = _require_coo(db, admin_id)
    target_id = (payload.get("user_id") or "").strip()
    level = (payload.get("level") or "user").strip()
    if not target_id:
        raise HTTPException(status_code=400, detail="user_id is required")
    if level not in APPROVAL_LEVELS:
        raise HTTPException(status_code=400, detail=f"Unknown level — expected one of {APPROVAL_LEVELS}")
    if level == "coo":
        raise HTTPException(
            status_code=403,
            detail="COO authority is fixed to the rights-master users and cannot be assigned",
        )
    if target_id in RIGHTS_MASTER_IDS:
        raise HTTPException(status_code=403, detail="Rights-master users are always COO and cannot be changed")
    target = db.query(User).filter(User.user_id == target_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Target user not found")

    right = db.query(ApprovalRight).filter(ApprovalRight.user_id == target_id).first()
    previous_level = right.level if right else "user"
    if not right:
        right = ApprovalRight(user_id=target.user_id)
        db.add(right)
    right.user_name = target.name
    right.branch = target.branch
    right.level = level
    right.max_discount_percent = _matrix_num(payload, "max_discount_percent")
    right.max_credit_days = _matrix_num(payload, "max_credit_days", as_int=True)
    right.max_expense_amount = _matrix_num(payload, "max_expense_amount")
    right.granted_by = admin.user_id
    right.granted_by_name = admin.name

    # Per-expense-type authority amounts sent alongside the level.
    # Blank amount = unlimited for that type (the override row is removed).
    etl = payload.get("expense_type_limits")
    if isinstance(etl, list):
        for item in etl:
            tid = item.get("expense_type_id")
            if not tid:
                continue
            amount = _matrix_num(item, "max_amount")
            row = db.query(ApprovalExpenseTypeLimit).filter(
                ApprovalExpenseTypeLimit.expense_type_id == int(tid),
                ApprovalExpenseTypeLimit.user_id == target.user_id,
            ).first()
            if amount is None:
                if row:
                    db.delete(row)
            else:
                if not row:
                    row = ApprovalExpenseTypeLimit(expense_type_id=int(tid), user_id=target.user_id)
                    db.add(row)
                row.user_name = target.name
                row.max_amount = amount
                row.updated_by = admin.user_id

    db.commit()
    db.refresh(right)

    # Self-heal + tell the admin what happens to records already pending.
    moved = reroute_pending(db)
    pending_here = 0
    if level == "branch":
        branches = _user_branches(db, target)
        pending_here = db.query(ApprovalApplication).filter(
            ApprovalApplication.status == "pending_branch",
            ApprovalApplication.branch.in_(branches),
        ).count() if branches else 0
    elif level == "hod":
        pending_here = db.query(ApprovalApplication).filter(
            ApprovalApplication.status == "pending_hod",
        ).count()

    parts = []
    if moved:
        parts.append(f"{moved} pending record(s) were forwarded to the next authority as per the updated rules.")
    if previous_level != level:
        parts.append(f"{target.name}'s approval role changed from {LEVEL_LABELS.get(previous_level, previous_level)} to {LEVEL_LABELS.get(level, level)}.")
    if level in ("branch", "hod") and pending_here:
        parts.append(
            f"{target.name} has {pending_here} record(s) waiting at their step — the updated limits apply immediately: "
            "within limit = final approval, above limit = forwarded to the next authority."
        )
    return {"right": right.to_dict(), "impact": {"moved": moved, "pending": pending_here, "message": " ".join(parts) or None}}


def set_employee_rule(db: Session, admin_id: str, payload: dict):
    """Upsert an employee's approval-chain flags (skip Branch Admin / HOD)."""
    admin = _require_coo(db, admin_id)
    target_id = (payload.get("user_id") or "").strip()
    if not target_id:
        raise HTTPException(status_code=400, detail="user_id is required")
    target = db.query(User).filter(User.user_id == target_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Target user not found")

    rule = db.query(ApprovalEmployeeRule).filter(ApprovalEmployeeRule.user_id == target_id).first()
    if not rule:
        rule = ApprovalEmployeeRule(user_id=target.user_id)
        db.add(rule)
    rule.user_name = target.name
    rule.branch = target.branch
    rule.require_branch = bool(payload.get("require_branch", True))
    rule.require_hod = bool(payload.get("require_hod", True))
    rule.updated_by = admin.user_id
    rule.updated_by_name = admin.name
    db.commit()
    db.refresh(rule)

    # A relaxed chain may release records this employee already has pending.
    moved = reroute_pending(db)
    message = (f"{moved} pending record(s) were forwarded to the next authority as per the updated flow rule."
               if moved else None)
    return {"rule": rule.to_dict(), "impact": {"moved": moved, "message": message}}


def set_expense_type_limit(db: Session, admin_id: str, payload: dict):
    """Upsert (or clear, with empty amount) an approver's limit for one
    expense type. Cleared = fall back to their general expense limit."""
    admin = _require_coo(db, admin_id)
    type_id = payload.get("expense_type_id")
    target_id = (payload.get("user_id") or "").strip()
    if not type_id or not target_id:
        raise HTTPException(status_code=400, detail="expense_type_id and user_id are required")

    et = db.query(ApprovalExpenseType).filter(ApprovalExpenseType.id == int(type_id)).first()
    if not et:
        raise HTTPException(status_code=404, detail="Expense type not found")
    target = db.query(User).filter(User.user_id == target_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Target user not found")

    amount = _matrix_num(payload, "max_amount")
    row = db.query(ApprovalExpenseTypeLimit).filter(
        ApprovalExpenseTypeLimit.expense_type_id == et.id,
        ApprovalExpenseTypeLimit.user_id == target_id,
    ).first()

    if amount is None:
        # cleared -> remove the override, general expense limit applies again
        if row:
            db.delete(row)
            db.commit()
        return None

    if not row:
        row = ApprovalExpenseTypeLimit(expense_type_id=et.id, user_id=target.user_id)
        db.add(row)
    row.user_name = target.name
    row.max_amount = amount
    row.updated_by = admin.user_id
    db.commit()
    db.refresh(row)
    return row.to_dict()


def set_hod_category(db: Session, admin_id: str, category: str, user_ids):
    """Replace the HOD approver list for a category. Empty list = any HOD
    user may act. Every person in the list can approve that category."""
    admin = _require_coo(db, admin_id)
    if category not in ("spares", "services", "spares_services"):
        raise HTTPException(status_code=400, detail="Unknown category")

    if user_ids is None:
        user_ids = []
    if isinstance(user_ids, str):
        user_ids = [user_ids]
    user_ids = [str(u).strip() for u in user_ids if u and str(u).strip()]

    # replace-all semantics: current rows out, selected list in
    db.query(ApprovalHODCategory).filter(ApprovalHODCategory.category == category).delete()
    rows = []
    for uid in dict.fromkeys(user_ids):   # de-dup, keep order
        target = db.query(User).filter(User.user_id == uid).first()
        if not target:
            raise HTTPException(status_code=404, detail=f"User {uid} not found")
        row = ApprovalHODCategory(
            category=category,
            user_id=target.user_id,
            user_name=target.name,
            updated_by=admin.user_id,
        )
        db.add(row)
        rows.append(row)
    db.commit()

    # Reassignment may strand records at HOD (e.g. only approver removed) —
    # self-heal forwards them.
    moved = reroute_pending(db)
    return {"mappings": [r.to_dict() for r in rows], "moved": moved}


# ---------------- APPLICATIONS ---------------- #

def _validate_for_submit(fields, request_type):
    """Field checks that must pass before an application enters the approval
    flow. Drafts skip these — they may be half-filled."""
    category = (fields.get("category") or "").strip()
    if category not in ("spares", "services", "spares_services"):
        raise HTTPException(status_code=400, detail="Category must be spares / services / spares & services")
    if not (fields.get("branch") or "").strip():
        raise HTTPException(status_code=400, detail="Branch is required")
    if not (fields.get("description") or "").strip():
        raise HTTPException(status_code=400, detail="Purpose of approval is required")
    if request_type != "expense" and not (fields.get("customer_name") or "").strip():
        raise HTTPException(status_code=400, detail="Customer name is required")


async def create_application(db: Session, user_id: str, fields: dict, files, as_draft: bool = False):
    user = _get_user(db, user_id)
    level = resolve_level(db, user)

    request_type = (fields.get("request_type") or "").strip()
    if request_type not in ("discounting", "credit", "expense"):
        raise HTTPException(status_code=400, detail="Type must be discounting / credit / expense")
    if not as_draft:
        _validate_for_submit(fields, request_type)
    category = (fields.get("category") or "").strip()
    is_expense = request_type == "expense"

    # Only 'user' and 'branch' levels raise applications. A branch admin's own
    # submission skips the branch step (they ARE the branch approver).
    if level not in ("user", "branch"):
        raise HTTPException(
            status_code=403,
            detail="Only employees and branch admins can create applications",
        )

    def _num(key):
        v = fields.get(key)
        if v in (None, ""):
            return None
        try:
            return float(v)
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail=f"{key} must be a number")

    def _int(key):
        v = fields.get(key)
        if v in (None, ""):
            return None
        try:
            return int(float(v))
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail=f"{key} must be a number")

    app_row = ApprovalApplication(
        category=category,
        request_type=request_type,
        branch=(fields.get("branch") or "").strip(),
        branch_name=(fields.get("branch_name") or "").strip() or None,
        customer_name=(fields.get("customer_name") or "").strip() or None if not is_expense else None,
        instance_id=(fields.get("instance_id") or "").strip() or None if not is_expense else None,
        sr_no=(fields.get("sr_no") or "").strip() or None,
        invoice_no=(fields.get("invoice_no") or "").strip() or None if not is_expense else None,
        delivery_challan=(fields.get("delivery_challan") or "").strip() or None if not is_expense else None,
        quotation_no=(fields.get("quotation_no") or "").strip() or None,
        quotation_amount=_num("quotation_amount"),
        discount_percent=_num("discount_percent") if request_type == "discounting" else None,
        credit_days=_int("credit_days") if request_type == "credit" else None,
        expense_amount=_num("expense_amount") if is_expense else None,
        expense_type=(fields.get("expense_type") or "").strip() or None if is_expense else None,
        description=(fields.get("description") or "").strip() or None,
        remark=(fields.get("remark") or "").strip() or None,
        status="draft",
        created_by=user.user_id,
        created_by_name=user.name,
        created_by_level=level,
    )
    # Drafts take no App No — the number (and FY sequence slot) is only
    # consumed when the application is actually submitted for approval.
    if not as_draft:
        skip_notes = []
        app_row.status = _next_pending_status(
            db, user.user_id, app_row.branch, category, None, skip_notes)
        _apply_skip_notes(app_row, skip_notes)
        app_row.app_no = _next_app_no(db, request_type)
    db.add(app_row)
    db.flush()

    for f in files or []:
        content = await f.read()
        db.add(ApprovalAttachment(
            application_id=app_row.id,
            original_name=f.filename or "attachment",
            content_type=f.content_type,
            size_bytes=len(content),
            data=content,
            uploaded_by=user.user_id,
        ))

    db.commit()
    db.refresh(app_row)
    return app_row.to_dict()


async def update_application(db: Session, user_id: str, app_id: int, fields: dict, files, submit: bool = False):
    """Edit a DRAFT (creator only). With submit=True the draft is validated,
    numbered and pushed into the approval flow."""
    user = _get_user(db, user_id)
    level = resolve_level(db, user)
    app_row = _get_application(db, app_id)

    if app_row.created_by != user.user_id:
        raise HTTPException(status_code=403, detail="Only the creator can edit this draft")
    if app_row.status != "draft":
        raise HTTPException(status_code=400, detail="Only drafts can be edited")

    request_type = (fields.get("request_type") or "").strip()
    if request_type not in ("discounting", "credit", "expense"):
        raise HTTPException(status_code=400, detail="Type must be discounting / credit / expense")
    if submit:
        _validate_for_submit(fields, request_type)
    is_expense = request_type == "expense"

    def _num(key):
        v = fields.get(key)
        if v in (None, ""):
            return None
        try:
            return float(v)
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail=f"{key} must be a number")

    def _int(key):
        v = fields.get(key)
        if v in (None, ""):
            return None
        try:
            return int(float(v))
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail=f"{key} must be a number")

    app_row.category = (fields.get("category") or "").strip()
    app_row.request_type = request_type
    app_row.branch = (fields.get("branch") or "").strip()
    app_row.branch_name = (fields.get("branch_name") or "").strip() or None
    app_row.customer_name = (fields.get("customer_name") or "").strip() or None if not is_expense else None
    app_row.instance_id = (fields.get("instance_id") or "").strip() or None if not is_expense else None
    app_row.sr_no = (fields.get("sr_no") or "").strip() or None
    app_row.invoice_no = (fields.get("invoice_no") or "").strip() or None if not is_expense else None
    app_row.delivery_challan = (fields.get("delivery_challan") or "").strip() or None if not is_expense else None
    app_row.quotation_no = (fields.get("quotation_no") or "").strip() or None
    app_row.quotation_amount = _num("quotation_amount")
    app_row.discount_percent = _num("discount_percent") if request_type == "discounting" else None
    app_row.credit_days = _int("credit_days") if request_type == "credit" else None
    app_row.expense_amount = _num("expense_amount") if is_expense else None
    app_row.expense_type = (fields.get("expense_type") or "").strip() or None if is_expense else None
    app_row.description = (fields.get("description") or "").strip() or None
    app_row.remark = (fields.get("remark") or "").strip() or None

    for f in files or []:
        content = await f.read()
        db.add(ApprovalAttachment(
            application_id=app_row.id,
            original_name=f.filename or "attachment",
            content_type=f.content_type,
            size_bytes=len(content),
            data=content,
            uploaded_by=user.user_id,
        ))

    if submit:
        app_row.created_by_level = level
        skip_notes = []
        app_row.status = _next_pending_status(
            db, user.user_id, app_row.branch, app_row.category, None, skip_notes)
        _apply_skip_notes(app_row, skip_notes)
        app_row.app_no = _next_app_no(db, request_type)

    db.commit()
    db.refresh(app_row)
    return app_row.to_dict()


def list_applications(db: Session, user_id: str, status_filter=None, request_type=None, search=None):
    """Applications visible to the caller, scoped by their level:
    user -> own; branch -> own + their branches; hod / coo -> all."""
    user = _get_user(db, user_id)
    level = resolve_level(db, user)

    q = db.query(ApprovalApplication).options(selectinload(ApprovalApplication.attachments))

    if level == "user":
        q = q.filter(ApprovalApplication.created_by == user.user_id)
    elif level == "branch":
        branches = _user_branches(db, user)
        q = q.filter(
            (ApprovalApplication.branch.in_(branches)) |
            (ApprovalApplication.created_by == user.user_id)
        )
    elif level == "hod":
        # Category assignments scope the HOD's table: a category assigned to
        # specific person(s) is visible ONLY to them. Unassigned categories are
        # visible to every HOD. Own submissions / already-acted records stay.
        # Blocked / deleted assignees are ignored.
        all_maps = db.query(ApprovalHODCategory).filter(ApprovalHODCategory.user_id.isnot(None)).all()
        usable_map_ids = _usable_ids(db, [m.user_id for m in all_maps])
        assigned = {}
        for m in all_maps:
            if m.user_id in usable_map_ids:
                assigned.setdefault(m.category, set()).add(m.user_id)
        blocked = [cat for cat, uids in assigned.items() if user.user_id not in uids]
        if blocked:
            q = q.filter(
                (~ApprovalApplication.category.in_(blocked)) |
                (ApprovalApplication.created_by == user.user_id) |
                (ApprovalApplication.hod_action_by == user.user_id)
            )
    # coo sees everything

    # Drafts are private — visible only to whoever is writing them
    q = q.filter(
        (ApprovalApplication.status != "draft") |
        (ApprovalApplication.created_by == user.user_id)
    )

    # Per-employee, per-category exclusions: records of an employee+category
    # that blocked this viewer never appear at the viewer's actionable step.
    if level in ("branch", "hod"):
        pairs = [(r.employee_id, r.category) for r in db.query(ApprovalApproverExclusion).filter(
            ApprovalApproverExclusion.approver_id == user.user_id,
            ApprovalApproverExclusion.category.isnot(None),
        ).all()]
        if pairs:
            acting_status = "pending_branch" if level == "branch" else "pending_hod"
            from sqlalchemy import and_, or_
            q = q.filter(~or_(*[
                and_(
                    ApprovalApplication.status == acting_status,
                    ApprovalApplication.created_by == emp,
                    ApprovalApplication.category == cat,
                )
                for emp, cat in pairs
            ]))

    if status_filter:
        q = q.filter(ApprovalApplication.status == status_filter)
    if request_type:
        q = q.filter(ApprovalApplication.request_type == request_type)
    if search:
        like = f"%{search.strip()}%"
        q = q.filter(
            ApprovalApplication.customer_name.ilike(like) |
            ApprovalApplication.app_no.ilike(like) |
            ApprovalApplication.invoice_no.ilike(like) |
            ApprovalApplication.sr_no.ilike(like) |
            ApprovalApplication.created_by_name.ilike(like)
        )

    # Stable newest-first ordering (matches IX_apv_apps_created_id, so SQL
    # Server returns rows pre-sorted instead of sorting per request)
    rows = q.order_by(
        ApprovalApplication.created_at.desc(), ApprovalApplication.id.desc()
    ).all()
    return {"level": level, "applications": [r.to_dict() for r in rows]}


def _get_application(db: Session, app_id: int) -> ApprovalApplication:
    row = db.query(ApprovalApplication).filter(ApprovalApplication.id == app_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Application not found")
    return row


def _check_can_act(db: Session, user: User, level: str, app_row: ApprovalApplication):
    """The caller's level must match the level the application is waiting on;
    branch admins can only act on applications of their own branches."""
    acting = STATUS_ACTING_LEVEL.get(app_row.status)
    if not acting:
        raise HTTPException(status_code=400, detail=f"Application is already {app_row.status}")
    if level != acting:
        raise HTTPException(
            status_code=403,
            detail=f"This application is waiting for {LEVEL_LABELS[acting]} action",
        )
    if acting == "branch" and app_row.branch not in _user_branches(db, user):
        raise HTTPException(status_code=403, detail="Application belongs to another branch")
    # Per-employee, per-category approver exclusion (Authority Matrix tree)
    if acting in ("branch", "hod") and user.user_id in _exclusions_for(db, app_row.created_by, app_row.category):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not allowed to act on this employee's records (Authority Matrix exclusion)",
        )


def approve_application(db: Session, user_id: str, app_id: int, remark=None):
    """Authority-based approval:
    - an approver whose Authority Matrix limit covers the record's value
      (discount % / credit days / expense amount) FINALIZES it as approved;
    - a value beyond their limit forwards the record to the next level in the
      employee's chain (COO is the final stop and needs sufficient authority);
    - at HOD level, category assignments (spares / services / spares&services)
      restrict who may act."""
    user = _get_user(db, user_id)
    level = resolve_level(db, user)
    app_row = _get_application(db, app_id)
    _check_can_act(db, user, level, app_row)
    acting = STATUS_ACTING_LEVEL[app_row.status]

    # HOD category assignment (Authority Matrix) — any of the assigned
    # persons may approve; unassigned category = any HOD user. Blocked /
    # deleted assignees are ignored (if none remain, any HOD may act).
    if acting == "hod":
        mappings = db.query(ApprovalHODCategory).filter(
            ApprovalHODCategory.category == app_row.category,
            ApprovalHODCategory.user_id.isnot(None),
        ).all()
        usable = _usable_ids(db, [m.user_id for m in mappings])
        if usable and user.user_id not in usable:
            names = ", ".join(m.user_name or m.user_id for m in mappings if m.user_id in usable)
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"HOD approval for this category is assigned to: {names}",
            )

    # Decide the outcome BEFORE touching the record
    value = _record_value(app_row)
    limit = _authority_limit(db, user, app_row)
    within = value is None or limit is None or float(value) <= float(limit)
    skip_notes = []
    if within:
        next_status = "approved"
    elif acting == "coo":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This value is beyond your authorized limit and there is no higher level to forward to",
        )
    else:
        # forward — steps without a defined approver are auto-skipped
        next_status = _next_pending_status(
            db, app_row.created_by, app_row.branch, app_row.category, acting, skip_notes)

    now = now_ist()
    remark = (remark or "").strip()
    if not remark:
        raise HTTPException(status_code=400, detail="An approval remark is required")
    if acting == "branch":
        app_row.branch_action_by = user.user_id
        app_row.branch_action_by_name = user.name
        app_row.branch_action_at = now
        app_row.branch_action_remark = remark
    elif acting == "hod":
        app_row.hod_action_by = user.user_id
        app_row.hod_action_by_name = user.name
        app_row.hod_action_at = now
        app_row.hod_action_remark = remark
    else:  # coo
        app_row.coo_action_by = user.user_id
        app_row.coo_action_by_name = user.name
        app_row.coo_action_at = now
        app_row.coo_action_remark = remark
    app_row.status = next_status
    _apply_skip_notes(app_row, skip_notes)

    db.commit()
    db.refresh(app_row)
    result = app_row.to_dict()

    # Final approval -> email the record's creator (details + trail + files),
    # in the background so the approver never waits on SMTP.
    if app_row.status == "approved":
        try:
            creator = db.query(User).filter(User.user_id == app_row.created_by).first()
            if creator and (creator.email or "").strip():
                attachments = _attachment_payloads(db, app_row.id)
                from app.controllers.approval_notify import send_final_approval_email_async
                send_final_approval_email_async(creator.email.strip(), result, attachments)
        except Exception as e:
            print(f"[approval-email] prepare failed: {e}")

    return result


def _attachment_payloads(db: Session, app_id: int):
    """[(name, content_type, bytes)] with the deferred blob loaded explicitly."""
    from sqlalchemy.orm import undefer
    rows = db.query(ApprovalAttachment).options(undefer(ApprovalAttachment.data)).filter(
        ApprovalAttachment.application_id == app_id).all()
    return [(r.original_name or "attachment", r.content_type or "", r.data or b"") for r in rows]


def get_approval_pdf(db: Session, app_id: int):
    """(filename, pdf_bytes) for an APPROVED record — same content as the
    approval email, attachments embedded/merged."""
    app_row = _get_application(db, app_id)
    if app_row.status != "approved":
        raise HTTPException(status_code=400, detail="PDF download is available for approved records only")
    from app.controllers.approval_notify import build_approval_pdf
    pdf = build_approval_pdf(app_row.to_dict(), _attachment_payloads(db, app_id))
    safe_no = (app_row.app_no or f"application-{app_row.id}").replace("/", "-")
    return f"Approval_{safe_no}.pdf", pdf


def reject_application(db: Session, user_id: str, app_id: int, remark=None):
    user = _get_user(db, user_id)
    level = resolve_level(db, user)
    app_row = _get_application(db, app_id)
    _check_can_act(db, user, level, app_row)

    remark = (remark or "").strip()
    if not remark:
        raise HTTPException(status_code=400, detail="A rejection remark is required")

    app_row.rejected_by = user.user_id
    app_row.rejected_by_name = user.name
    app_row.rejected_at_level = STATUS_ACTING_LEVEL[app_row.status]
    app_row.rejected_at = now_ist()
    app_row.rejected_remark = remark
    app_row.status = "rejected"

    db.commit()
    db.refresh(app_row)
    result = app_row.to_dict()

    # Rejection also notifies the record's creator (with the reason + trail)
    try:
        creator = db.query(User).filter(User.user_id == app_row.created_by).first()
        if creator and (creator.email or "").strip():
            attachments = _attachment_payloads(db, app_row.id)
            from app.controllers.approval_notify import send_final_approval_email_async
            send_final_approval_email_async(creator.email.strip(), result, attachments)
    except Exception as e:
        print(f"[approval-email] prepare failed: {e}")

    return result


def delete_application(db: Session, user_id: str, app_id: int):
    """Creator can withdraw an application only while nobody has acted yet."""
    user = _get_user(db, user_id)
    app_row = _get_application(db, app_id)
    if app_row.created_by != user.user_id:
        raise HTTPException(status_code=403, detail="Only the creator can delete an application")
    if app_row.status == "draft":
        db.delete(app_row)
        db.commit()
        return True
    # Deletable while it is still pending and NOBODY has acted on it yet
    # (chains vary per employee, so "no action recorded" is the real test).
    untouched = not (app_row.branch_action_by or app_row.hod_action_by or app_row.coo_action_by)
    if not app_row.status.startswith("pending") or not untouched:
        raise HTTPException(status_code=400, detail="Application already processed — it can no longer be deleted")
    db.delete(app_row)
    db.commit()
    return True


def get_attachment(db: Session, attachment_id: int) -> ApprovalAttachment:
    row = db.query(ApprovalAttachment).filter(ApprovalAttachment.id == attachment_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Attachment not found")
    return row


def get_summary(db: Session, user_id: str):
    """Counts for the view header cards, scoped like list_applications."""
    data = list_applications(db, user_id)
    apps = data["applications"]
    return {
        "level": data["level"],
        "total": len(apps),
        "pending_branch": sum(1 for a in apps if a["status"] == "pending_branch"),
        "pending_hod": sum(1 for a in apps if a["status"] == "pending_hod"),
        "pending_coo": sum(1 for a in apps if a["status"] == "pending_coo"),
        "approved": sum(1 for a in apps if a["status"] == "approved"),
        "rejected": sum(1 for a in apps if a["status"] == "rejected"),
    }
