"""Approval Application business logic — L1..L5 Employee Hierarchy.

Flow: any user (L1..L5) creates an application. The record then follows the
hierarchy ROW of its branch: L2 -> L3 -> L4 (HOD, category-wise) -> L5 (COO).

Rules:
- SELF-APPROVAL IS REMOVED: the creator never acts on their own record; if the
  record's value is within the creator's OWN authority limit it is
  AUTO-APPROVED at submit instead.
- A level with no available approver (none assigned / all blocked / everyone
  excluded / only the creator) auto-skips with a note on the trail.
- HO-branch creators skip L2/L3: they choose their own L4 / L5 approver when
  creating the application, and may file it against ANY branch.
- Only L4 (HOD) and L5 (COO) see all applications; everyone else sees their
  own records plus the ones waiting at their approval step.

Levels are granted from the Employee Hierarchy builder (stage / HOD-category
assignments). The two RIGHTS_MASTER_IDS users are always L5 (COO).
"""

from fastapi import HTTPException, status
from sqlalchemy.orm import Session, selectinload

from app.models.user_model import User, UserBranchAccess
from app.models.approval_application_model import (
    ApprovalRight, ApprovalApplication, ApprovalAttachment, ApprovalExpenseType,
    ApprovalEmployeeRule, ApprovalHODCategory, ApprovalExpenseTypeLimit,
    ApprovalApproverExclusion, ApprovalStageApprover,
    ApprovalLevelConfig, ApprovalLevelExpenseLimit,
    RIGHTS_MASTER_IDS, APPROVAL_LEVELS, LEGACY_LEVEL_MAP, HO_BRANCH,
    DEFAULT_LEVEL_NAMES,
)
from app.time_utils import now_ist

# Static fallback labels — the live labels come from _level_label(db, lvl),
# which honours the COO-renamed level names (ApprovalLevelConfig.display_name).
LEVEL_LABELS = {
    "l1": "L1 - Employee",
    "l2": "L2 - Approver",
    "l3": "L3 - Approver",
    "l4": "L4 - HOD",
    "l5": "L5 - COO",
}


def _level_names(db: Session) -> dict:
    """{level: display name} — custom names from the Authority Limit tab,
    defaults where not renamed."""
    names = dict(DEFAULT_LEVEL_NAMES)
    for row in db.query(ApprovalLevelConfig).filter(ApprovalLevelConfig.branch.is_(None)).all():
        if row.level in names and (row.display_name or "").strip():
            names[row.level] = row.display_name.strip()
    return names


def _level_label(db: Session, level: str) -> str:
    name = _level_names(db).get(level)
    return f"{level.upper()} - {name}" if name else LEVEL_LABELS.get(level, level)

LEVEL_ORDER = {"l1": 1, "l2": 2, "l3": 3, "l4": 4, "l5": 5}

# status -> which level acts on it
STATUS_ACTING_LEVEL = {
    "pending_l2": "l2",
    "pending_l3": "l3",
    "pending_l4": "l4",
    "pending_l5": "l5",
}

CATEGORIES = ("spares", "services", "spares_services")


def _norm_level(level: str) -> str:
    """Map legacy level names (user/branch/hod/coo) onto l1..l5."""
    level = (level or "").strip()
    return LEGACY_LEVEL_MAP.get(level, level)


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


def _is_ho_user(db: Session, user: User) -> bool:
    """Head-Office member: primary branch OR any access branch is HO."""
    return HO_BRANCH in _user_branches(db, user)


def _ho_member_ids(db: Session) -> set:
    """All USABLE members of the Head Office branch (primary + access)."""
    ids = {r[0] for r in db.query(User.user_id).filter(User.branch == HO_BRANCH).all()}
    ids |= {r.user_id for r in db.query(UserBranchAccess).filter(
        UserBranchAccess.branch == HO_BRANCH).all()}
    return _usable_ids(db, ids)


def resolve_level(db: Session, user: User) -> str:
    """The approval level a user acts at. Rights masters are always L5 (COO);
    everyone else defaults to L1 until the hierarchy assigns them a stage."""
    if user.user_id in RIGHTS_MASTER_IDS:
        return "l5"
    right = db.query(ApprovalRight).filter(ApprovalRight.user_id == user.user_id).first()
    if right:
        lvl = _norm_level(right.level)
        if lvl in APPROVAL_LEVELS:
            return lvl
    return "l1"


# ---------------- AUTHORITY MATRIX HELPERS ---------------- #

def _employee_rule(db: Session, user_id: str) -> dict:
    """Approval chain flags for an employee. No row = full chain."""
    r = db.query(ApprovalEmployeeRule).filter(ApprovalEmployeeRule.user_id == user_id).first()
    return {
        "require_l2": bool(r.require_l2) if r else True,
        "require_l3": bool(r.require_l3) if r else True,
        "require_l4": bool(r.require_l4) if r else True,
    }


def _exclusions_for(db: Session, employee_id: str, category: str = None) -> set:
    """Approver ids this employee's records of THIS category must never go to."""
    if not employee_id or not category:
        return set()
    return {r.approver_id for r in db.query(ApprovalApproverExclusion).filter(
        ApprovalApproverExclusion.employee_id == employee_id,
        ApprovalApproverExclusion.category == category,
    ).all()}


def _level_user_ids(db: Session, level: str) -> set:
    """Users holding a given authority level in the rights table."""
    legacy = [k for k, v in LEGACY_LEVEL_MAP.items() if v == level]
    return {r[0] for r in db.query(ApprovalRight.user_id).filter(
        ApprovalRight.level.in_([level] + legacy)
    ).all()}


def _stage_approver_ids(db: Session, branch: str, stage: str) -> list:
    return [r.user_id for r in db.query(ApprovalStageApprover).filter(
        ApprovalStageApprover.branch == branch,
        ApprovalStageApprover.stage == stage,
    ).all()]


def _available_approvers(db: Session, level: str, branch: str, category: str,
                         creator_id: str, l4_choice: str = None, l5_choice: str = None) -> set:
    """The USABLE approver ids who may act at `level` for a record of this
    branch+category. Self-approval removed: the creator never appears.
    Blocked / deleted users and excluded approvers do not count."""
    excl = _exclusions_for(db, creator_id, category)

    if level in ("l2", "l3"):
        ids = _usable_ids(db, _stage_approver_ids(db, branch, level))
    elif level == "l4":
        all_l4 = _usable_ids(db, _level_user_ids(db, "l4"))
        # HO creators may choose ANY HO member as their L4 approver — the
        # choice wins as long as that person is still usable
        if l4_choice and _usable_ids(db, [l4_choice]):
            ids = {l4_choice}
        else:
            mappings = db.query(ApprovalHODCategory).filter(
                ApprovalHODCategory.branch == branch,
                ApprovalHODCategory.category == category,
                ApprovalHODCategory.user_id.isnot(None),
            ).all()
            if mappings:
                ids = {m.user_id for m in mappings} & all_l4
            else:
                # no mapping rows for the branch+category = any L4 user may act
                ids = all_l4
    else:  # l5 — rights masters + any explicitly granted L5 users
        ids = _usable_ids(db, set(RIGHTS_MASTER_IDS) | _level_user_ids(db, "l5"))
        if l5_choice and l5_choice in ids:
            ids = {l5_choice}

    ids = ids - excl
    ids.discard(creator_id)   # self-approval removed
    return ids


SKIP_REASONS = {
    "l2": "Skipped — no L2 approver available for this branch",
    "l3": "Skipped — no L3 approver available for this branch",
    "l4": "Skipped — no L4 (HOD) approver available for this category",
}


def _next_pending_status(db: Session, app_row: ApprovalApplication, after_level, skip_notes):
    """The first ACTIONABLE pending status after `after_level` (None = fresh
    submission), honouring the employee's chain rules AND auto-skipping steps
    that have no available approver. HO-branch creators skip L2/L3 entirely.
    Self-approval removal happens PER STAGE of the record's branch: a stage
    where the creator is the only assigned approver auto-skips, but a stage
    manned by OTHER people always runs — regardless of the creator's own
    level. Each auto-skip is appended to skip_notes as (level, reason).
    L5 (COO) always exists (the fixed rights-master users), so the chain
    terminates."""
    creator_id = app_row.created_by
    rule = _employee_rule(db, creator_id)
    creator = db.query(User).filter(User.user_id == creator_id).first()
    is_ho = _is_ho_user(db, creator) if creator else False

    after_order = LEVEL_ORDER.get(after_level, 0) if after_level else 0
    order = []
    for lvl in ("l2", "l3", "l4"):
        if LEVEL_ORDER[lvl] <= after_order:
            continue
        if is_ho and lvl in ("l2", "l3"):
            continue   # Head Office records go straight to L4 / L5
        if not rule[f"require_{lvl}"]:
            continue
        order.append(lvl)
    order.append("l5")

    for lvl in order:
        if lvl == "l5":
            return "pending_l5"
        # HO record WITHOUT a chosen L4: no HO HOD held higher authority
        # than the creator at submit — the step skips straight to L5 (the
        # branch's L4 map never applies to an HO creator's record).
        if lvl == "l4" and is_ho and not app_row.l4_approver_id:
            skip_notes.append(("l4", "Skipped — no L4 approver with higher authority than the creator"))
            continue
        ids = _available_approvers(
            db, lvl, app_row.branch, app_row.category, creator_id,
            l4_choice=app_row.l4_approver_id, l5_choice=app_row.l5_approver_id)
        if ids:
            return f"pending_{lvl}"
        reason = SKIP_REASONS[lvl]
        if lvl in ("l2", "l3") and creator_id in _stage_approver_ids(db, app_row.branch, lvl):
            reason = (f"Skipped — self approval removed (the creator is this branch's "
                      f"{lvl.upper()} approver)")
        skip_notes.append((lvl, reason))
    return "pending_l5"


def _apply_skip_notes(app_row, skip_notes):
    """Stamp auto-skip reasons on the record (no action_by = nobody acted;
    the trail shows the reason instead)."""
    for lvl, reason in skip_notes:
        col = f"{lvl}_action_remark"
        if not getattr(app_row, col, None):
            setattr(app_row, col, reason)


def reroute_pending(db: Session) -> int:
    """Self-heal pass: re-evaluate every PENDING record against the current
    Authority Matrix (approver blocked / soft-deleted / rights or flow rules
    changed) and forward any record whose step can no longer be served.
    Runs after block / delete / matrix changes. Returns how many moved.

    ONE scan covers all three pending stages (was three), and the usual case
    — nothing pending — exits without any per-record work. The same creator's
    rule / user row / HO flag is looked up once per pass, not once per record."""
    moved = 0

    pending_rows = db.query(ApprovalApplication).filter(
        ApprovalApplication.status.in_(["pending_l2", "pending_l3", "pending_l4"])
    ).order_by(ApprovalApplication.status, ApprovalApplication.id).all()
    if not pending_rows:
        return 0

    rule_memo, creator_memo, ho_memo = {}, {}, {}

    def _rule_of(uid):
        if uid not in rule_memo:
            rule_memo[uid] = _employee_rule(db, uid)
        return rule_memo[uid]

    def _is_ho_of(uid):
        if uid not in ho_memo:
            if uid not in creator_memo:
                creator_memo[uid] = db.query(User).filter(User.user_id == uid).first()
            creator = creator_memo[uid]
            ho_memo[uid] = _is_ho_user(db, creator) if creator else False
        return ho_memo[uid]

    for app_row in pending_rows:
        lvl = STATUS_ACTING_LEVEL[app_row.status]
        rule = _rule_of(app_row.created_by)
        is_ho = _is_ho_of(app_row.created_by)
        still_required = (rule[f"require_{lvl}"]
                          and not (is_ho and lvl in ("l2", "l3")))
        if still_required and _available_approvers(
            db, lvl, app_row.branch, app_row.category, app_row.created_by,
            l4_choice=app_row.l4_approver_id, l5_choice=app_row.l5_approver_id,
        ):
            continue
        reason = (SKIP_REASONS[lvl] if still_required
                  else "Skipped — step no longer required by the Authority Matrix")
        col = f"{lvl}_action_remark"
        if not getattr(app_row, col):
            setattr(app_row, col, reason)
        skips = []
        app_row.status = _next_pending_status(db, app_row, lvl, skips)
        _apply_skip_notes(app_row, skips)
        moved += 1

    if moved:
        db.commit()
    return moved


def cleanup_user_config(db: Session, user_id: str):
    """Remove a (soft-)deleted user's approval configuration: their authority
    right, flow rule, stage / HOD category assignments and per-type expense
    limits. Their created applications and audit trail are kept."""
    db.query(ApprovalRight).filter(ApprovalRight.user_id == user_id).delete()
    db.query(ApprovalEmployeeRule).filter(ApprovalEmployeeRule.user_id == user_id).delete()
    db.query(ApprovalStageApprover).filter(ApprovalStageApprover.user_id == user_id).delete()
    db.query(ApprovalHODCategory).filter(ApprovalHODCategory.user_id == user_id).delete()
    db.query(ApprovalExpenseTypeLimit).filter(ApprovalExpenseTypeLimit.user_id == user_id).delete()
    db.commit()


# Valid application types ('discounting_credit' = BOTH asks in one record —
# either value may be filled; every present value must clear the approver's
# limit before the record can finalize)
REQUEST_TYPES = ("discounting", "credit", "expense", "discounting_credit")


def _record_value(app_row):
    """The value the authority limits are checked against, per type."""
    return {
        "discounting": app_row.discount_percent,
        "credit": app_row.credit_days,
        "expense": app_row.expense_amount,
    }.get(app_row.request_type)


def _has_value(app_row):
    """Does the record carry anything measurable to auto-approve against?"""
    if app_row.request_type == "discounting_credit":
        return app_row.discount_percent is not None or app_row.credit_days is not None
    return _record_value(app_row) is not None


def _branch_level_cfg(db: Session, branch: str, level: str):
    """The (branch, level) limits row — limits are scoped PER BRANCH ROW."""
    if not branch:
        return None
    return db.query(ApprovalLevelConfig).filter(
        ApprovalLevelConfig.branch == branch,
        ApprovalLevelConfig.level == level,
    ).first()


def _individual_limit(db: Session, user_id: str, attr: str):
    """The user's OWN limit (ApprovalRight row) for one metric — set
    individually in the Authority Matrix. None = not set individually,
    fall back to the branch row's level-wise value."""
    right = db.query(ApprovalRight).filter(ApprovalRight.user_id == user_id).first()
    return getattr(right, attr, None) if right else None


def _metric_limit(db: Session, user: User, metric: str, branch: str):
    """The user's limit for ONE metric (discounting / credit): their
    INDIVIDUAL limit when set, else the level-wise value of the record's
    BRANCH row."""
    if user.user_id in RIGHTS_MASTER_IDS:
        return None
    ind = _individual_limit(db, user.user_id, {
        "discounting": "max_discount_percent", "credit": "max_credit_days",
    }[metric])
    if ind is not None:
        return ind
    level = resolve_level(db, user)
    cfg = _branch_level_cfg(db, branch, level)
    blank = None if level == "l5" else 0   # L5 blank = unlimited
    if not cfg:
        return blank
    val = {"discounting": cfg.max_discount_percent, "credit": cfg.max_credit_days}.get(metric)
    return val if val is not None else blank


def _within_limit(db: Session, user: User, app_row: ApprovalApplication) -> bool:
    """Is the WHOLE record within this user's authority? For the combined
    Discounting & Credit type EVERY filled value must be within its limit —
    if one satisfies and the other does not, the record is NOT final here."""
    if app_row.request_type == "discounting_credit":
        checks = []
        if app_row.discount_percent is not None:
            checks.append(("discounting", app_row.discount_percent))
        if app_row.credit_days is not None:
            checks.append(("credit", app_row.credit_days))
        for metric, value in checks:
            limit = _metric_limit(db, user, metric, app_row.branch)
            if limit is not None and float(value) > float(limit):
                return False
        return True
    value = _record_value(app_row)
    limit = _authority_limit(db, user, app_row)
    return value is None or limit is None or float(value) <= float(limit)


def _authority_limit(db: Session, user: User, app_row: ApprovalApplication):
    """The acting (or creating) user's authorized limit for this application.
    An INDIVIDUAL limit set for the employee in the Authority Matrix wins;
    without one the LEVEL-WISE limit of the record's branch row applies
    (shared by every user of that level in the branch). DEFAULT IS 0 — no
    limit set anywhere means the user can approve nothing. Only the fixed
    rights-master COOs are unlimited (None), so every record can finalize."""
    if user.user_id in RIGHTS_MASTER_IDS:
        return None   # unlimited — the chain's guaranteed final stop
    ind = _individual_limit(db, user.user_id, {
        "discounting": "max_discount_percent",
        "credit": "max_credit_days",
        "expense": "max_expense_amount",
    }.get(app_row.request_type, ""))
    if ind is not None:
        return ind
    level = resolve_level(db, user)
    # Limits are scoped PER BRANCH ROW — the record's branch decides which
    # limits apply. Expense: ONE combined amount limit for all types.
    cfg = _branch_level_cfg(db, app_row.branch, level)
    # L5 (COO) defaults to UNLIMITED — a blank limit means unlimited there;
    # entering a number overrides it. Every other level's blank means 0.
    blank = None if level == "l5" else 0
    if not cfg:
        return blank
    val = {
        "discounting": cfg.max_discount_percent,
        "credit": cfg.max_credit_days,
        "expense": cfg.max_expense_amount,
    }.get(app_row.request_type)
    return val if val is not None else blank


# The limit column(s) each request type is measured against
METRIC_ATTRS = {
    "discounting": ("max_discount_percent",),
    "credit": ("max_credit_days",),
    "expense": ("max_expense_amount",),
    "discounting_credit": ("max_discount_percent", "max_credit_days"),
}


def _effective_metric_limit(db: Session, user_id: str, level: str, branch: str, attr: str):
    """A user's effective limit for ONE metric on a record of `branch`:
    their INDIVIDUAL limit when set, else the branch row's level-wise value.
    None = unlimited (rights masters / blank L5)."""
    if user_id in RIGHTS_MASTER_IDS:
        return None
    ind = _individual_limit(db, user_id, attr)
    if ind is not None:
        return ind
    cfg = _branch_level_cfg(db, branch, level)
    val = getattr(cfg, attr, None) if cfg else None
    if val is not None:
        return val
    return None if level == "l5" else 0


def _qualifying_ho_l4_ids(db: Session, creator: User, branch: str, request_type: str) -> set:
    """The USEFUL L4 choices for an HO creator's record: HO members holding
    L4 whose limit for EVERY metric of `request_type` is HIGHER than the
    creator's own (an approver at or below the creator's authority could
    never finalize anything the creator's own limit doesn't already cover).
    Blank / unknown request type = no limit filtering."""
    ids = _usable_ids(db, _ho_member_ids(db) & _level_user_ids(db, "l4"))
    ids -= {creator.user_id} | set(RIGHTS_MASTER_IDS)
    attrs = METRIC_ATTRS.get((request_type or "").strip())
    if not attrs or not ids:
        return ids
    my_level = resolve_level(db, creator)
    out = set()
    for uid in ids:
        ok = True
        for attr in attrs:
            mine = _effective_metric_limit(db, creator.user_id, my_level, branch, attr)
            if mine is None:   # creator is unlimited — nobody is higher
                ok = False
                break
            his = _effective_metric_limit(db, uid, "l4", branch, attr)
            if his is not None and float(his) <= float(mine):
                ok = False
                break
        if ok:
            out.add(uid)
    return out


# ---------------- ACCESS ---------------- #

def _limits_payload(db: Session, user: User):
    """The caller's own authority limits (My Approval Limits box) — their
    INDIVIDUAL limits where set, else the level-wise limits of the level
    they hold. None = unlimited (rights masters only)."""
    unlimited = user.user_id in RIGHTS_MASTER_IDS
    level = resolve_level(db, user)
    cfg = _branch_level_cfg(db, user.branch, level)
    right = db.query(ApprovalRight).filter(ApprovalRight.user_id == user.user_id).first()
    # In this payload None ALWAYS means unlimited (rights masters, or the L5
    # level whose blank limits default to unlimited). Other levels' blanks = 0.
    blank = None if level == "l5" else 0

    def _val(attr):
        ind = getattr(right, attr, None) if right else None
        if ind is not None:
            return ind
        v = getattr(cfg, attr, None) if cfg else None
        return v if v is not None else blank
    return {
        "unlimited": unlimited,
        "level": level,
        "max_discount_percent": None if unlimited else _val("max_discount_percent"),
        "max_credit_days": None if unlimited else _val("max_credit_days"),
        # ONE amount covering ALL expense types combined
        "max_expense_amount": None if unlimited else _val("max_expense_amount"),
    }


def _names_of(db: Session, ids) -> list:
    ids = [i for i in ids if i]
    if not ids:
        return []
    rows = db.query(User).filter(
        User.user_id.in_(ids),
        User.is_blocked == False,   # noqa: E712
        User.is_deleted == False,   # noqa: E712
    ).all()
    return sorted(u.name for u in rows)


def _coo_display_names(db: Session) -> list:
    # the initial master-admin account is hidden from displays on purpose
    ids = set(uid for uid in RIGHTS_MASTER_IDS if uid != "kala000001") | _level_user_ids(db, "l5")
    return _names_of(db, ids)


def _my_chain(db: Session, user: User, is_ho: bool) -> dict:
    """The approval ladder THIS user's own submissions follow — shown in the
    My Approval Limits box. HO members choose L4/L5 at submit; stages at or
    below the user's own level are covered by it and skip."""
    rule = _employee_rule(db, user.user_id)
    branch = user.branch
    chain = {"branch": branch, "is_ho": is_ho}
    if is_ho:
        chain["l2"] = None
        chain["l3"] = None
        chain["l4"] = {c: ["You choose at submit"] for c in CATEGORIES}
        chain["l5"] = _coo_display_names(db) or ["COO"]   # fixed final approver
        return chain
    for lvl in ("l2", "l3"):
        if not rule[f"require_{lvl}"]:
            chain[lvl] = {"skipped": "Not required"}
            continue
        ids = _available_approvers(db, lvl, branch, None, user.user_id)
        chain[lvl] = {"names": _names_of(db, ids)} if ids else {"skipped": "No approver"}
    if not rule["require_l4"]:
        chain["l4"] = {c: {"skipped": "Not required"} for c in CATEGORIES}
    else:
        chain["l4"] = {}
        for c in CATEGORIES:
            ids = _available_approvers(db, "l4", branch, c, user.user_id)
            chain["l4"][c] = {"names": _names_of(db, ids)} if ids else {"skipped": "No approver"}
    chain["l5"] = {"names": _coo_display_names(db) or ["COO"]}
    return chain


def _all_branch_options(db: Session):
    """Every branch code + name in the system (for HO users' create form)."""
    seen = {}
    for b, n in db.query(User.branch, User.branch_name).filter(
        User.is_deleted == False,   # noqa: E712
    ).all():
        code = (b or "").strip()
        if code and (code not in seen or not seen[code]):
            seen[code] = (n or "").strip()
    return [{"branch": b, "branch_name": n} for b, n in sorted(seen.items())]


def get_access(db: Session, user_id: str):
    user = _get_user(db, user_id)
    level = resolve_level(db, user)
    is_ho = _is_ho_user(db, user)
    branches = _user_branches(db, user)

    # Branch dropdown of the create form: HO members see EVERY branch,
    # everyone else the branches they have access to.
    all_options = _all_branch_options(db)
    if is_ho:
        branch_options = all_options
    else:
        name_by_code = {o["branch"]: o["branch_name"] for o in all_options}
        branch_options = [{"branch": b, "branch_name": name_by_code.get(b, "")}
                          for b in sorted(branches)]

    # HO creators pick who approves their record at L4 — HO members holding
    # L4, except themselves (and the fixed L5 COOs). This is the UNFILTERED
    # fallback list; the create form asks /l4-choices for the record-specific
    # list (only HODs whose limit for the record's type beats the creator's).
    l4_choices, l5_choices = [], []
    if is_ho:
        l4_ids = _usable_ids(db, _ho_member_ids(db) & _level_user_ids(db, "l4")) \
            - {user.user_id} - set(RIGHTS_MASTER_IDS)
        rows = db.query(User).filter(User.user_id.in_(l4_ids)).all() if l4_ids else []
        l4_choices = sorted(({"user_id": u.user_id, "name": u.name} for u in rows),
                            key=lambda x: x["name"])
        l5_ids = _usable_ids(
            db, (set(RIGHTS_MASTER_IDS) - {"kala000001"}) | _level_user_ids(db, "l5")
        ) - {user.user_id}
        rows = db.query(User).filter(User.user_id.in_(l5_ids)).all() if l5_ids else []
        l5_choices = sorted(({"user_id": u.user_id, "name": u.name} for u in rows),
                            key=lambda x: x["name"])

    return {
        "user_id": user.user_id,
        "name": user.name,
        "level": level,
        "level_label": _level_label(db, level),
        "level_names": _level_names(db),
        "is_rights_master": user.user_id in RIGHTS_MASTER_IDS,
        "is_ho": is_ho,
        "branches": branches,
        "branch_options": branch_options,
        "l4_choices": l4_choices,
        "l5_choices": l5_choices,
        "limits": _limits_payload(db, user),
        "my_chain": _my_chain(db, user, is_ho),
    }


def get_ho_l4_choices(db: Session, user_id: str, branch: str = None, request_type: str = None):
    """The L4 approver dropdown of an HO creator's form, filtered for ONE
    record: HO members holding L4 whose authority for the record's type is
    HIGHER than the creator's own. Empty list = no useful HOD — the record
    may be submitted without an L4 pick and goes straight to L5."""
    user = _get_user(db, user_id)
    if not _is_ho_user(db, user):
        return {"l4_choices": []}   # non-HO: the branch row decides the chain
    ids = _qualifying_ho_l4_ids(db, user, (branch or "").strip(), request_type)
    rows = db.query(User).filter(User.user_id.in_(list(ids))).all() if ids else []
    return {"l4_choices": sorted(({"user_id": u.user_id, "name": u.name} for u in rows),
                                 key=lambda x: x["name"])}


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

    level = _norm_level(level)
    if level not in APPROVAL_LEVELS:
        raise HTTPException(status_code=400, detail=f"Unknown level — expected one of {APPROVAL_LEVELS}")
    if target_user_id in RIGHTS_MASTER_IDS:
        raise HTTPException(status_code=403, detail="Rights-master users are always L5 (COO) and cannot be changed")

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


# ---------------- APP NUMBERING ---------------- #

APP_NO_PREFIXES = {"discounting": "DIS", "credit": "CRE", "expense": "EXP",
                   "discounting_credit": "DNC"}


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
    if resolve_level(db, user) != "l5":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only COO (L5) can manage this",
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

def _recompute_right_level(db: Session, user_id: str, admin: User):
    """A user's level is DERIVED from the hierarchy: L4 if mapped as an HOD
    approver anywhere, else the highest stage (l3 > l2) they hold, else L1.
    Limits are preserved — only the level flips."""
    if not user_id or user_id in RIGHTS_MASTER_IDS:
        return
    target = db.query(User).filter(User.user_id == user_id).first()
    if not target:
        return

    if db.query(ApprovalHODCategory).filter(
        ApprovalHODCategory.user_id == user_id
    ).first():
        level = "l4"
    else:
        stages = {r.stage for r in db.query(ApprovalStageApprover).filter(
            ApprovalStageApprover.user_id == user_id
        ).all()}
        level = "l3" if "l3" in stages else ("l2" if "l2" in stages else "l1")

    right = db.query(ApprovalRight).filter(ApprovalRight.user_id == user_id).first()
    if not right:
        if level == "l1":
            return   # nothing to store — default anyway
        right = ApprovalRight(user_id=user_id)
        db.add(right)
    if _norm_level(right.level) == "l5":
        return
    right.level = level
    right.user_name = target.name
    right.branch = target.branch
    right.granted_by = admin.user_id
    right.granted_by_name = admin.name


def get_authority_matrix(db: Session, user_id: str):
    """Everything the Authority Matrix screen needs: every user (branch-wise)
    with their level + limits + chain rules, the L2/L3 stage approvers and the
    L4 (HOD) category map."""
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

    # PER-BRANCH L4 approvers per category: {branch: {category: [mapping, ...]}}
    hod_cats = {}
    for c in db.query(ApprovalHODCategory).all():
        if c.user_id and c.branch:
            hod_cats.setdefault(c.branch, {}).setdefault(c.category, []).append(c.to_dict())

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
            "level": _norm_level(r.level) if r else "l1",
            # False = brand-new profile employee not yet taken into the
            # hierarchy — the branch row offers an "Add employee" option
            "has_right": r is not None,
            "max_discount_percent": r.max_discount_percent if r else None,
            "max_credit_days": r.max_credit_days if r else None,
            "max_expense_amount": r.max_expense_amount if r else None,
            "require_l2": bool(rule.require_l2) if rule else True,
            "require_l3": bool(rule.require_l3) if rule else True,
            "require_l4": bool(rule.require_l4) if rule else True,
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

    name_by_id_all = {u["user_id"]: u["name"] for u in out}
    active_ids = set(name_by_id_all)

    # ---- L2 / L3 stage approvers per branch: {branch: {stage: [{user_id,name}]}}
    stage_approvers = {}
    for row in db.query(ApprovalStageApprover).all():
        if row.user_id in active_ids:
            stage_approvers.setdefault(row.branch, {}).setdefault(row.stage, []).append(
                {"user_id": row.user_id, "name": name_by_id_all[row.user_id]})
    for cats in stage_approvers.values():
        for lst in cats.values():
            lst.sort(key=lambda x: x["name"])

    # ---- L4 (HOD) approvers per branch+category (assigned people, else any L4)
    l4_users = [u for u in out if u["level"] == "l4"]
    l4_ids = {u["user_id"] for u in l4_users}
    l4_name_by_id = {u["user_id"]: u["name"] for u in l4_users}
    l4_all = sorted(({"user_id": u["user_id"], "name": u["name"]} for u in l4_users),
                    key=lambda x: x["name"])
    hod_by_branch = {}
    for b in {u["branch"] for u in out if u["branch"]} | set(hod_cats.keys()):
        per_cat = {}
        for cat in CATEGORIES:
            maps = hod_cats.get(b, {}).get(cat, [])
            if maps:
                per_cat[cat] = sorted(
                    ({"user_id": m["user_id"], "name": l4_name_by_id.get(m["user_id"], m["user_name"] or m["user_id"])}
                     for m in maps if m["user_id"] in l4_ids),
                    key=lambda x: x["name"])
            else:
                per_cat[cat] = l4_all
        hod_by_branch[b] = per_cat

    # Every member of every branch (primary + multi-branch access) — feeds the
    # Employee Hierarchy tab. Multi-branch users appear under EVERY branch
    # they can access.
    member_ids = {}
    for u in out:
        if u["branch"]:
            member_ids.setdefault(u["branch"], set()).add(u["user_id"])
    if name_by_id_all:
        for row in db.query(UserBranchAccess).filter(
            UserBranchAccess.user_id.in_(list(name_by_id_all))
        ).all():
            member_ids.setdefault(row.branch, set()).add(row.user_id)
    branch_members = {
        b: sorted(({"user_id": i, "name": name_by_id_all[i]} for i in ids), key=lambda x: x["name"])
        for b, ids in member_ids.items()
    }

    # Per-employee, per-category exclusions {employee_id: {category: [ids]}}
    exclusions = {}
    for r in db.query(ApprovalApproverExclusion).filter(
        ApprovalApproverExclusion.category.isnot(None)
    ).all():
        exclusions.setdefault(r.employee_id, {}).setdefault(r.category, []).append(r.approver_id)

    # Level-limit rows — PER BRANCH (branch NULL = the global name rows)
    level_configs = [{
        "branch": c.branch,
        "level": c.level,
        "max_discount_percent": c.max_discount_percent,
        "max_credit_days": c.max_credit_days,
        "max_expense_amount": c.max_expense_amount,
    } for c in db.query(ApprovalLevelConfig).all()]

    return {
        "users": out,
        "branches": [{"branch": b, "branch_name": n} for b, n in sorted(seen_branches.items())],
        "ho_branch": HO_BRANCH,
        "hod_categories": hod_cats,
        "expense_types": expense_types,
        "level_configs": level_configs,
        "level_names": _level_names(db),
        "chain_data": {
            "stage_approvers": stage_approvers,
            "hod_by_branch": hod_by_branch,
            "coo_names": _coo_display_names(db),
        },
        "exclusions": exclusions,
        "branch_members": branch_members,
    }


def set_level_config(db: Session, admin_id: str, payload: dict):
    """Upsert ONE level's config. With `branch` in the payload the row holds
    that BRANCH's level-wise limits (fresh branch rows start at 0); without
    `branch` it is the GLOBAL row carrying the renamable display name."""
    admin = _require_coo(db, admin_id)
    level = _norm_level(payload.get("level"))
    if level not in APPROVAL_LEVELS:
        raise HTTPException(status_code=400, detail=f"Unknown level — expected one of {APPROVAL_LEVELS}")
    branch = (payload.get("branch") or "").strip() or None

    q = db.query(ApprovalLevelConfig).filter(ApprovalLevelConfig.level == level)
    q = q.filter(ApprovalLevelConfig.branch == branch) if branch \
        else q.filter(ApprovalLevelConfig.branch.is_(None))
    cfg = q.first()
    if not cfg:
        cfg = ApprovalLevelConfig(level=level, branch=branch)
        db.add(cfg)
    # the display name lives ONLY on the global (branch-less) row
    if not branch and "display_name" in payload:
        name = (payload.get("display_name") or "").strip()
        # storing NULL falls back to the default name
        cfg.display_name = name or None
    if level == "l5":
        # L5 (COO) is ALWAYS unlimited — limits cannot be set for it
        cfg.max_discount_percent = None
        cfg.max_credit_days = None
        cfg.max_expense_amount = None
        db.query(ApprovalLevelExpenseLimit).filter(
            ApprovalLevelExpenseLimit.level == "l5").delete()
    else:
        cfg.max_discount_percent = _matrix_num(payload, "max_discount_percent")
        cfg.max_credit_days = _matrix_num(payload, "max_credit_days", as_int=True)
        cfg.max_expense_amount = _matrix_num(payload, "max_expense_amount")
    cfg.updated_by = admin.user_id

    # Per-expense-type amounts for this LEVEL. Blank = the override row is
    # removed and the level's general expense limit applies for that type.
    etl = payload.get("expense_type_limits")
    if level != "l5" and isinstance(etl, list):
        for item in etl:
            tid = item.get("expense_type_id")
            if not tid:
                continue
            amount = _matrix_num(item, "max_amount")
            row = db.query(ApprovalLevelExpenseLimit).filter(
                ApprovalLevelExpenseLimit.expense_type_id == int(tid),
                ApprovalLevelExpenseLimit.level == level,
            ).first()
            if amount is None:
                if row:
                    db.delete(row)
            else:
                if not row:
                    row = ApprovalLevelExpenseLimit(expense_type_id=int(tid), level=level)
                    db.add(row)
                row.max_amount = amount
                row.updated_by = admin.user_id

    db.commit()
    db.refresh(cfg)

    affected = 0
    if level != "l5":
        legacy = [k for k, v in LEGACY_LEVEL_MAP.items() if v == level]
        affected = db.query(ApprovalRight).filter(
            ApprovalRight.level.in_([level] + legacy)
        ).count()
    if level == "l1":
        # every user WITHOUT a right row is an L1 employee too
        with_rights = db.query(ApprovalRight.user_id).subquery()
        affected += db.query(User).filter(
            User.user_id.notin_(with_rights),
            User.user_id.notin_(RIGHTS_MASTER_IDS),
            User.is_blocked == False,   # noqa: E712
            User.is_deleted == False,   # noqa: E712
        ).count()

    return {
        "config": cfg.to_dict(),
        "level_names": _level_names(db),
        "impact": {
            "message": (f"Applied to every {_level_label(db, level)} user"
                        + (f" ({affected} user(s))." if affected else "."))
        },
    }


def remove_employee_rights(db: Session, admin_id: str, payload: dict):
    """Take an employee OUT of the hierarchy: their authority right, flow
    rule and every stage / L4 assignment are removed (they fall back to a
    plain, not-taken-in employee and reappear in 'Add employee'). Their
    created records and audit trail are kept; stranded pending records are
    re-routed."""
    _require_coo(db, admin_id)
    target_id = (payload.get("user_id") or "").strip()
    if not target_id:
        raise HTTPException(status_code=400, detail="user_id is required")
    if target_id in RIGHTS_MASTER_IDS:
        raise HTTPException(status_code=403, detail="Rights-master users are fixed at L5 (COO)")
    cleanup_user_config(db, target_id)
    moved = reroute_pending(db)
    return {"moved": moved}


def set_stage_approvers(db: Session, admin_id: str, branch: str, stage: str, user_ids):
    """Replace the L2 or L3 approver list for ONE branch (Employee Hierarchy
    row). Empty list = that stage auto-skips for the branch. The affected
    users' authority levels are re-derived automatically."""
    admin = _require_coo(db, admin_id)
    branch = (branch or "").strip()
    if not branch:
        raise HTTPException(status_code=400, detail="branch is required")
    if stage not in ("l2", "l3"):
        raise HTTPException(status_code=400, detail="stage must be l2 or l3")

    if user_ids is None:
        user_ids = []
    if isinstance(user_ids, str):
        user_ids = [user_ids]
    user_ids = [str(u).strip() for u in user_ids if u and str(u).strip()]

    previous = set(_stage_approver_ids(db, branch, stage))

    # replace-all semantics for THIS branch+stage
    db.query(ApprovalStageApprover).filter(
        ApprovalStageApprover.branch == branch,
        ApprovalStageApprover.stage == stage,
    ).delete()
    rows = []
    for uid in dict.fromkeys(user_ids):   # de-dup, keep order
        target = db.query(User).filter(User.user_id == uid).first()
        if not target:
            raise HTTPException(status_code=404, detail=f"User {uid} not found")
        if uid in RIGHTS_MASTER_IDS:
            raise HTTPException(status_code=400, detail="Rights-master users are fixed at L5 (COO)")
        row = ApprovalStageApprover(
            branch=branch,
            stage=stage,
            user_id=target.user_id,
            user_name=target.name,
            updated_by=admin.user_id,
        )
        db.add(row)
        rows.append(row)
    db.flush()

    for uid in previous | set(user_ids):
        _recompute_right_level(db, uid, admin)
    db.commit()

    # Reassignment may strand pending records — self-heal forwards them.
    moved = reroute_pending(db)
    return {"approvers": [r.to_dict() for r in rows], "moved": moved}


def set_hod_category(db: Session, admin_id: str, branch: str, category: str, user_ids):
    """Replace the L4 (HOD) approver list for ONE BRANCH's category. Empty
    list = any L4 user may act for that branch+category. The affected users'
    authority levels are re-derived automatically."""
    admin = _require_coo(db, admin_id)
    branch = (branch or "").strip()
    if not branch:
        raise HTTPException(status_code=400, detail="branch is required")
    if category not in CATEGORIES:
        raise HTTPException(status_code=400, detail="Unknown category")

    if user_ids is None:
        user_ids = []
    if isinstance(user_ids, str):
        user_ids = [user_ids]
    user_ids = [str(u).strip() for u in user_ids if u and str(u).strip()]

    previous = {r.user_id for r in db.query(ApprovalHODCategory).filter(
        ApprovalHODCategory.branch == branch,
        ApprovalHODCategory.category == category,
    ).all() if r.user_id}

    # replace-all semantics for THIS branch+category
    db.query(ApprovalHODCategory).filter(
        ApprovalHODCategory.branch == branch,
        ApprovalHODCategory.category == category,
    ).delete()
    rows = []
    for uid in dict.fromkeys(user_ids):   # de-dup, keep order
        target = db.query(User).filter(User.user_id == uid).first()
        if not target:
            raise HTTPException(status_code=404, detail=f"User {uid} not found")
        if uid in RIGHTS_MASTER_IDS:
            raise HTTPException(status_code=400, detail="Rights-master users are fixed at L5 (COO)")
        row = ApprovalHODCategory(
            branch=branch,
            category=category,
            user_id=target.user_id,
            user_name=target.name,
            updated_by=admin.user_id,
        )
        db.add(row)
        rows.append(row)
    db.flush()

    for uid in previous | set(user_ids):
        _recompute_right_level(db, uid, admin)
    db.commit()

    # Reassignment may strand records at L4 (e.g. only approver removed) —
    # self-heal forwards them.
    moved = reroute_pending(db)
    return {"mappings": [r.to_dict() for r in rows], "moved": moved}


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
    if category not in CATEGORIES:
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
    """Upsert a user's authority limits (Authority Limit tab). The LEVEL is
    derived from the hierarchy; this endpoint only stores limits (the level
    field, when sent, must match l1..l4 and is stored as-is for L1 users who
    are not part of any stage)."""
    admin = _require_coo(db, admin_id)
    target_id = (payload.get("user_id") or "").strip()
    if not target_id:
        raise HTTPException(status_code=400, detail="user_id is required")
    if target_id in RIGHTS_MASTER_IDS:
        raise HTTPException(status_code=403, detail="Rights-master users are always L5 (COO) and cannot be changed")
    target = db.query(User).filter(User.user_id == target_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Target user not found")

    right = db.query(ApprovalRight).filter(ApprovalRight.user_id == target_id).first()
    previous_level = _norm_level(right.level) if right else "l1"

    # LEVEL is optional: omitted / blank = keep the user's current level (a
    # limits-only save must never disturb hierarchy assignments)
    level_raw = str(payload.get("level") or "").strip()
    if level_raw:
        level = _norm_level(level_raw)
        if level not in APPROVAL_LEVELS:
            raise HTTPException(status_code=400, detail=f"Unknown level — expected one of {APPROVAL_LEVELS}")
        if level == "l5":
            raise HTTPException(
                status_code=403,
                detail="L5 (COO) authority is fixed to the rights-master users and cannot be assigned",
            )
    else:
        level = previous_level
    if not right:
        right = ApprovalRight(user_id=target.user_id)
        db.add(right)
    right.user_name = target.name
    right.branch = target.branch
    right.level = level
    # INDIVIDUAL limits: only keys present in the payload are touched, so a
    # level-only save (Add employee) never wipes limits set individually.
    # Blank value = clear the individual limit (fall back to level-wise).
    if "max_discount_percent" in payload:
        right.max_discount_percent = _matrix_num(payload, "max_discount_percent")
    if "max_credit_days" in payload:
        right.max_credit_days = _matrix_num(payload, "max_credit_days", as_int=True)
    if "max_expense_amount" in payload:
        right.max_expense_amount = _matrix_num(payload, "max_expense_amount")
    right.granted_by = admin.user_id
    right.granted_by_name = admin.name

    # Per-expense-type authority amounts sent alongside the level.
    # Blank amount = 0 for that type (the override row is removed).
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
    if level in ("l2", "l3"):
        branches = {r.branch for r in db.query(ApprovalStageApprover).filter(
            ApprovalStageApprover.user_id == target_id,
            ApprovalStageApprover.stage == level,
        ).all()}
        pending_here = db.query(ApprovalApplication).filter(
            ApprovalApplication.status == f"pending_{level}",
            ApprovalApplication.branch.in_(list(branches)),
        ).count() if branches else 0
    elif level == "l4":
        pending_here = db.query(ApprovalApplication).filter(
            ApprovalApplication.status == "pending_l4",
        ).count()

    parts = []
    if moved:
        parts.append(f"{moved} pending record(s) were forwarded to the next authority as per the updated rules.")
    if previous_level != level:
        parts.append(f"{target.name}'s approval level changed from {_level_label(db, previous_level)} to {_level_label(db, level)}.")
    if level in ("l2", "l3", "l4") and pending_here:
        parts.append(
            f"{target.name} has {pending_here} record(s) waiting at their step — the updated limits apply immediately: "
            "within limit = final approval, above limit = forwarded to the next authority."
        )
    return {"right": right.to_dict(), "impact": {"moved": moved, "pending": pending_here, "message": " ".join(parts) or None}}


def set_employee_rule(db: Session, admin_id: str, payload: dict):
    """Upsert an employee's approval-chain flags (skip L2 / L3 / L4)."""
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
    # tolerate both the new keys and the legacy ones
    rule.require_l2 = bool(payload.get("require_l2", payload.get("require_branch", True)))
    rule.require_l3 = bool(payload.get("require_l3", True))
    rule.require_l4 = bool(payload.get("require_l4", payload.get("require_hod", True)))
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


# ---------------- APPLICATIONS ---------------- #

def _validate_for_submit(db, user, fields, request_type):
    """Field checks that must pass before an application enters the approval
    flow. Drafts skip these — they may be half-filled."""
    category = (fields.get("category") or "").strip()
    if category not in CATEGORIES:
        raise HTTPException(status_code=400, detail="Category must be spares / services / spares & services")
    if not (fields.get("branch") or "").strip():
        raise HTTPException(status_code=400, detail="Branch is required")
    if not (fields.get("description") or "").strip():
        raise HTTPException(status_code=400, detail="Purpose of approval is required")
    if request_type != "expense" and not (fields.get("customer_name") or "").strip():
        raise HTTPException(status_code=400, detail="Customer name is required")
    # combined type: either value may be blank, but never BOTH
    if request_type == "discounting_credit":
        if not str(fields.get("discount_percent") or "").strip() and not str(fields.get("credit_days") or "").strip():
            raise HTTPException(status_code=400, detail="Enter Discounting % or Credit Period (days) — at least one")
    # HO members choose who approves their record at L4; L5 (COO) is fixed.
    # Only required when a QUALIFYING choice exists — with no HO HOD holding
    # higher authority than the creator, the record goes straight to L5.
    if _is_ho_user(db, user) and user.user_id not in RIGHTS_MASTER_IDS:
        if not (fields.get("l4_approver_id") or "").strip():
            if _qualifying_ho_l4_ids(db, user, (fields.get("branch") or "").strip(), request_type):
                raise HTTPException(status_code=400, detail="Select your L4 (HOD) approver")


def _resolve_chosen_approvers(db: Session, user: User, fields: dict, strict: bool = True):
    """Validate + name-resolve the HO creator's chosen L4 / L5 approvers.
    Non-HO creators cannot choose (their branch row decides). strict=False
    (drafts) skips the limit-qualification check — it is re-run at submit."""
    l4_id = (fields.get("l4_approver_id") or "").strip() or None
    l5_id = (fields.get("l5_approver_id") or "").strip() or None
    if not _is_ho_user(db, user):
        return None, None, None, None
    l4_name = l5_name = None
    if l4_id:
        if l4_id == user.user_id:
            raise HTTPException(status_code=400, detail="You cannot choose yourself as approver")
        if l4_id not in _ho_member_ids(db):
            raise HTTPException(status_code=400, detail="Chosen L4 approver must be a Head Office member")
        # the choice must hold L4 AND beat the creator's own limit for the
        # record's type — same rule the dropdown is filtered by
        if strict and l4_id not in _qualifying_ho_l4_ids(
            db, user, (fields.get("branch") or "").strip(),
            (fields.get("request_type") or "").strip(),
        ):
            raise HTTPException(
                status_code=400,
                detail="Chosen L4 approver must be a Head Office HOD with higher authority than yours for this record type",
            )
        target = db.query(User).filter(User.user_id == l4_id).first()
        l4_name = target.name if target else None
    if l5_id:
        if l5_id == user.user_id:
            raise HTTPException(status_code=400, detail="You cannot choose yourself as approver")
        if l5_id not in (set(RIGHTS_MASTER_IDS) | _level_user_ids(db, "l5")):
            raise HTTPException(status_code=400, detail="Chosen L5 approver does not hold COO (L5) authority")
        target = db.query(User).filter(User.user_id == l5_id).first()
        l5_name = target.name if target else None
    return l4_id, l4_name, l5_id, l5_name


def _finalize_submit(db: Session, user: User, app_row: ApprovalApplication):
    """Route a submitted application: AUTO-APPROVE when its value(s) are
    within the creator's OWN authority limit (self-approval replaced),
    otherwise start the chain at the first available level. For the combined
    Discounting & Credit type EVERY filled value must be within limit.

    NON-HO creators with multi-branch access: the self-limit auto-approval
    counts ONLY for their HOME branch's records — an NFA filed for another
    access branch always goes to the next level, even within their limit."""
    home_branch_ok = _is_ho_user(db, user) or (app_row.branch or "") == (user.branch or "")
    if home_branch_ok and _has_value(app_row) and _within_limit(db, user, app_row):
        app_row.status = "approved"
        app_row.auto_approved = True
        return
    if not _has_value(app_row) and user.user_id in RIGHTS_MASTER_IDS:
        # rights master submitting a record with no measurable ask
        app_row.status = "approved"
        app_row.auto_approved = True
        return
    skip_notes = []
    app_row.status = _next_pending_status(db, app_row, None, skip_notes)
    _apply_skip_notes(app_row, skip_notes)


async def create_application(db: Session, user_id: str, fields: dict, files, as_draft: bool = False):
    user = _get_user(db, user_id)
    level = resolve_level(db, user)

    request_type = (fields.get("request_type") or "").strip()
    if request_type not in REQUEST_TYPES:
        raise HTTPException(status_code=400, detail="Type must be discounting / credit / expense / discounting & credit")
    if not as_draft:
        _validate_for_submit(db, user, fields, request_type)
    category = (fields.get("category") or "").strip()
    is_expense = request_type == "expense"

    # ALL users can create applications — even L4 (HOD) and L5 (COO).
    # Self-approval is removed: within their own limit = auto-approved,
    # beyond it the record goes to the remaining chain above them.

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

    l4_id, l4_name, l5_id, l5_name = _resolve_chosen_approvers(db, user, fields, strict=not as_draft)

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
        discount_percent=_num("discount_percent") if request_type in ("discounting", "discounting_credit") else None,
        credit_days=_int("credit_days") if request_type in ("credit", "discounting_credit") else None,
        expense_amount=_num("expense_amount") if is_expense else None,
        expense_type=(fields.get("expense_type") or "").strip() or None if is_expense else None,
        description=(fields.get("description") or "").strip() or None,
        remark=(fields.get("remark") or "").strip() or None,
        cc_emails=(fields.get("cc_emails") or "").strip() or None,
        status="draft",
        created_by=user.user_id,
        created_by_name=user.name,
        created_by_level=level,
        l4_approver_id=l4_id,
        l4_approver_name=l4_name,
        l5_approver_id=l5_id,
        l5_approver_name=l5_name,
    )
    # Drafts take no App No — the number (and FY sequence slot) is only
    # consumed when the application is actually submitted for approval.
    if not as_draft:
        _finalize_submit(db, user, app_row)
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
        raise HTTPException(status_code=403, detail="Only the creator can edit this application")
    # REJECTED records can be corrected and resubmitted by their creator —
    # the old trail is cleared and the record re-enters the flow fresh
    # (keeping its App No).
    if app_row.status not in ("draft", "rejected"):
        raise HTTPException(status_code=400, detail="Only drafts and rejected applications can be edited")
    was_rejected = app_row.status == "rejected"

    request_type = (fields.get("request_type") or "").strip()
    if request_type not in REQUEST_TYPES:
        raise HTTPException(status_code=400, detail="Type must be discounting / credit / expense / discounting & credit")
    if submit:
        _validate_for_submit(db, user, fields, request_type)
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

    l4_id, l4_name, l5_id, l5_name = _resolve_chosen_approvers(db, user, fields, strict=submit)

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
    app_row.discount_percent = _num("discount_percent") if request_type in ("discounting", "discounting_credit") else None
    app_row.credit_days = _int("credit_days") if request_type in ("credit", "discounting_credit") else None
    app_row.expense_amount = _num("expense_amount") if is_expense else None
    app_row.expense_type = (fields.get("expense_type") or "").strip() or None if is_expense else None
    app_row.description = (fields.get("description") or "").strip() or None
    app_row.remark = (fields.get("remark") or "").strip() or None
    if "cc_emails" in fields:
        app_row.cc_emails = (fields.get("cc_emails") or "").strip() or None
    app_row.l4_approver_id = l4_id
    app_row.l4_approver_name = l4_name
    app_row.l5_approver_id = l5_id
    app_row.l5_approver_name = l5_name

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

    if was_rejected:
        # wipe the previous run's trail so the record starts clean
        for lvl in ("l2", "l3", "l4", "l5"):
            for col in ("action_by", "action_by_name", "action_at", "action_remark"):
                setattr(app_row, f"{lvl}_{col}", None)
        app_row.rejected_by = None
        app_row.rejected_by_name = None
        app_row.rejected_at_level = None
        app_row.rejected_at = None
        app_row.rejected_remark = None
        app_row.auto_approved = False
        app_row.status = "draft"

    if submit:
        app_row.created_by_level = level
        _finalize_submit(db, user, app_row)
        if not app_row.app_no:   # resubmitted records keep their original number
            app_row.app_no = _next_app_no(db, request_type)

    db.commit()
    db.refresh(app_row)
    return app_row.to_dict()


def list_applications(db: Session, user_id: str, status_filter=None, request_type=None, search=None):
    """Applications visible to the caller:
    - L4 (HOD) / L5 (COO) and HO-branch members: ALL applications;
    - everyone else: their own + the ones waiting at (or acted on at) their
      approval step."""
    user = _get_user(db, user_id)
    level = resolve_level(db, user)

    # ONE fetch per config table — these small tables were previously queried
    # up to four times each per request; every view below derives from them.
    all_stage_rows = db.query(ApprovalStageApprover).all()
    all_excl_rows = db.query(ApprovalApproverExclusion).filter(
        ApprovalApproverExclusion.category.isnot(None)).all()
    my_stage_branches = {
        st: {r.branch for r in all_stage_rows if r.user_id == user.user_id and r.stage == st}
        for st in ("l2", "l3")
    }
    my_excl = {(r.employee_id, r.category) for r in all_excl_rows
               if r.approver_id == user.user_id}

    q = db.query(ApprovalApplication).options(selectinload(ApprovalApplication.attachments))

    if level not in ("l4", "l5") and not _is_ho_user(db, user):
        from sqlalchemy import and_, or_
        conds = [
            ApprovalApplication.created_by == user.user_id,
            ApprovalApplication.l2_action_by == user.user_id,
            ApprovalApplication.l3_action_by == user.user_id,
            ApprovalApplication.l4_action_by == user.user_id,
            # records whose creator CHOSE this user as the L4 / L5 approver
            ApprovalApplication.l4_approver_id == user.user_id,
            ApprovalApplication.l5_approver_id == user.user_id,
        ]
        # records waiting at a stage where THIS user is an assigned approver
        for stage in ("l2", "l3"):
            branches = list(my_stage_branches[stage])
            if branches:
                conds.append(and_(
                    ApprovalApplication.status == f"pending_{stage}",
                    ApprovalApplication.branch.in_(branches),
                ))
        q = q.filter(or_(*conds))

    # Drafts are private — visible only to whoever is writing them
    q = q.filter(
        (ApprovalApplication.status != "draft") |
        (ApprovalApplication.created_by == user.user_id)
    )

    # Per-employee, per-category exclusions: records of an employee+category
    # that blocked this viewer never appear at the viewer's actionable step.
    if level in ("l2", "l3"):
        pairs = list(my_excl)
        if pairs:
            from sqlalchemy import and_, or_
            q = q.filter(~or_(*[
                and_(
                    ApprovalApplication.status.in_(["pending_l2", "pending_l3"]),
                    ApprovalApplication.created_by == emp,
                    ApprovalApplication.category == cat,
                    ApprovalApplication.created_by != user.user_id,
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

    # ---- per-record "can the CALLER act on it right now" flag ----
    # Covers every acting rule including an HO creator's CHOSEN L4 approver
    # (who may hold any level) — the UI uses it for the pending queue and the
    # Approve/Reject buttons; approve_application still enforces for real.
    my_l2 = my_stage_branches["l2"]
    my_l3 = my_stage_branches["l3"]
    all_maps = db.query(ApprovalHODCategory).filter(ApprovalHODCategory.user_id.isnot(None)).all()
    usable_map_ids = _usable_ids(db, [m.user_id for m in all_maps])
    mapped = {}
    for m in all_maps:
        if m.user_id in usable_map_ids:
            mapped.setdefault((m.branch, m.category), set()).add(m.user_id)
    am_l4, am_l5 = level == "l4", level == "l5"

    # context for naming WHO can act on each pending record (detail modal) —
    # derived from the single fetches above, no re-query
    stage_map = {}
    for r in all_stage_rows:
        stage_map.setdefault((r.branch, r.stage), set()).add(r.user_id)
    excl_map = {}
    for r in all_excl_rows:
        excl_map.setdefault((r.employee_id, r.category), set()).add(r.approver_id)
    l4_all = _usable_ids(db, _level_user_ids(db, "l4"))
    l5_all = _usable_ids(db, set(RIGHTS_MASTER_IDS) | _level_user_ids(db, "l5")) - {"kala000001"}

    def _pending_ids(a):
        acting = STATUS_ACTING_LEVEL.get(a.status)
        if not acting:
            return set()
        if acting in ("l2", "l3"):
            ids = set(stage_map.get((a.branch, acting), set()))
        elif acting == "l4":
            if a.l4_approver_id:
                ids = {a.l4_approver_id}
            else:
                m = mapped.get((a.branch, a.category))
                ids = set(m) if m else set(l4_all)
        else:
            ids = {a.l5_approver_id} if a.l5_approver_id else set(l5_all)
        ids -= excl_map.get((a.created_by, a.category), set())
        ids.discard(a.created_by)
        return ids

    pending_ids_by_app = {a.id: _pending_ids(a) for a in rows}
    all_ids = set().union(*pending_ids_by_app.values()) if pending_ids_by_app else set()
    name_by_id = {}
    if all_ids:
        for u in db.query(User).filter(
            User.user_id.in_(list(all_ids)),
            User.is_blocked == False,   # noqa: E712
            User.is_deleted == False,   # noqa: E712
        ).all():
            name_by_id[u.user_id] = u.name

    def _can_act(a):
        acting = STATUS_ACTING_LEVEL.get(a.status)
        if not acting or a.created_by == user.user_id:
            return False
        if (a.created_by, a.category) in my_excl:
            return False
        if acting == "l2":
            return a.branch in my_l2
        if acting == "l3":
            return a.branch in my_l3
        if acting == "l4":
            if a.l4_approver_id:
                return a.l4_approver_id == user.user_id
            if not am_l4:
                return False
            ids = mapped.get((a.branch, a.category))
            return True if not ids else user.user_id in ids
        # l5
        if a.l5_approver_id:
            return a.l5_approver_id == user.user_id
        return am_l5

    out = []
    for r in rows:
        d = r.to_dict()
        d["can_act"] = _can_act(r)
        d["pending_approver_names"] = sorted(
            name_by_id[i] for i in pending_ids_by_app.get(r.id, set()) if i in name_by_id)
        out.append(d)
    return {"level": level, "applications": out}


def _get_application(db: Session, app_id: int) -> ApprovalApplication:
    row = db.query(ApprovalApplication).filter(ApprovalApplication.id == app_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Application not found")
    return row


def _check_can_act(db: Session, user: User, app_row: ApprovalApplication) -> str:
    """The caller must be one of the AVAILABLE approvers at the level the
    application is waiting on. Creators can never act on their own records
    (self-approval removed). Returns the acting level."""
    acting = STATUS_ACTING_LEVEL.get(app_row.status)
    if not acting:
        raise HTTPException(status_code=400, detail=f"Application is already {app_row.status}")
    if app_row.created_by == user.user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Self-approval is not allowed — your own applications are approved by the next level",
        )
    available = _available_approvers(
        db, acting, app_row.branch, app_row.category, app_row.created_by,
        l4_choice=app_row.l4_approver_id, l5_choice=app_row.l5_approver_id)
    if user.user_id not in available:
        names = ", ".join(_names_of(db, available)) or "nobody (step will auto-forward)"
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"This application is waiting for {_level_label(db, acting)} action by: {names}",
        )
    return acting


def approve_application(db: Session, user_id: str, app_id: int, remark=None):
    """Authority-based approval:
    - an approver whose Authority Matrix limit covers the record's value
      (discount % / credit days / expense amount) FINALIZES it as approved;
    - a value beyond their limit forwards the record to the next level in the
      chain (L5/COO is the final stop and needs sufficient authority);
    - each level's available-approver rules (stage assignment, HOD category
      map, HO creator's chosen approver, exclusions) restrict who may act."""
    user = _get_user(db, user_id)
    app_row = _get_application(db, app_id)
    acting = _check_can_act(db, user, app_row)

    # Decide the outcome BEFORE touching the record. Combined Discounting &
    # Credit records finalize only when EVERY filled value is within limit.
    within = _within_limit(db, user, app_row)
    skip_notes = []
    if within:
        next_status = "approved"
    elif acting == "l5":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This value is beyond your authorized limit and there is no higher level to forward to",
        )
    else:
        # forward — steps without an available approver are auto-skipped
        next_status = _next_pending_status(db, app_row, acting, skip_notes)

    now = now_ist()
    remark = (remark or "").strip()
    if not remark:
        raise HTTPException(status_code=400, detail="An approval remark is required")
    setattr(app_row, f"{acting}_action_by", user.user_id)
    setattr(app_row, f"{acting}_action_by_name", user.name)
    setattr(app_row, f"{acting}_action_at", now)
    setattr(app_row, f"{acting}_action_remark", remark)
    app_row.status = next_status
    _apply_skip_notes(app_row, skip_notes)

    db.commit()
    db.refresh(app_row)
    # NOTE: the result email is NOT sent automatically — the acting user gets
    # a dialog (frontend) where extra recipients can be added; confirming it
    # calls send_result_email.
    return app_row.to_dict()


def _final_action_note(db: Session, app_row: ApprovalApplication) -> str:
    """Who finalized the record and at which stage — including the self /
    auto-approve case."""
    if app_row.status == "rejected":
        return (f"Rejected at {_level_label(db, app_row.rejected_at_level)} by "
                f"{app_row.rejected_by_name or app_row.rejected_by}")
    if app_row.auto_approved:
        return (f"Self approved by {app_row.created_by_name or app_row.created_by} "
                f"({_level_label(db, app_row.created_by_level or 'l1')}) — within own authority limit")
    for lvl in ("l5", "l4", "l3", "l2"):
        by = getattr(app_row, f"{lvl}_action_by_name") or getattr(app_row, f"{lvl}_action_by")
        if by:
            return f"Final approval at {_level_label(db, lvl)} by {by}"
    return "Approved"


def _clean_emails(values, what):
    out = []
    for e in (values or []):
        e = str(e).strip()
        if not e:
            continue
        if "@" not in e or "." not in e.split("@")[-1]:
            raise HTTPException(status_code=400, detail=f"'{e}' is not a valid {what} email address")
        out.append(e)
    return out


def send_result_email(db: Session, user_id: str, app_id: int, extra_emails=None, to_emails=None):
    """Send the outcome email for an APPROVED / REJECTED record:
    To = the record's creator + any addresses added in the dialog;
    Cc = everyone who approved along the trail + the CC addresses the
    CREATOR attached at submit + any added in the dialog. The mail states
    the finalizing stage and person (self-approval included)."""
    _get_user(db, user_id)
    app_row = _get_application(db, app_id)
    if app_row.status not in ("approved", "rejected"):
        raise HTTPException(status_code=400, detail="The result email is available once the record is approved or rejected")

    extra_cc = _clean_emails(extra_emails, "CC")
    extra_to = _clean_emails(to_emails, "To")

    creator = db.query(User).filter(User.user_id == app_row.created_by).first()
    tos = ([creator.email.strip()] if creator and (creator.email or "").strip() else []) + extra_to

    # CC — every user who acted on the trail (self-approve = creator, already TO)
    actor_ids = [i for i in {
        app_row.l2_action_by, app_row.l3_action_by,
        app_row.l4_action_by, app_row.l5_action_by, app_row.rejected_by,
    } if i and i != app_row.created_by]
    cc = []
    if actor_ids:
        for u in db.query(User).filter(User.user_id.in_(actor_ids)).all():
            if (u.email or "").strip():
                cc.append(u.email.strip())
    # CC addresses the creator attached at submit
    cc += [e.strip() for e in (app_row.cc_emails or "").split(",") if e.strip()]
    cc += extra_cc

    if not tos:
        if not cc:
            raise HTTPException(
                status_code=400,
                detail="No recipient found — the creator has no email; add an email address to send to",
            )
        tos, cc = [cc[0]], cc[1:]

    result = app_row.to_dict()
    result["final_action_note"] = _final_action_note(db, app_row)
    from app.controllers.approval_notify import send_final_approval_email_async
    send_final_approval_email_async(tos, result, _attachment_payloads(db, app_row.id), cc)
    return {"to": tos, "cc": cc}


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
    try:
        from app.controllers.approval_notify import build_approval_pdf
        pdf = build_approval_pdf(app_row.to_dict(), _attachment_payloads(db, app_id))
    except ImportError as e:
        # tells the admin exactly what the hosted build is missing instead of
        # a blank Internal Server Error
        raise HTTPException(
            status_code=500,
            detail=(f"PDF engine missing on this server: {e}. Install reportlab, pypdf and "
                    "pillow (pip install -r requirements.txt) — for the packaged EXE, rebuild "
                    "with backend.spec which now collects them."),
        )
    safe_no = (app_row.app_no or f"application-{app_row.id}").replace("/", "-")
    return f"Approval_{safe_no}.pdf", pdf


def reject_application(db: Session, user_id: str, app_id: int, remark=None):
    user = _get_user(db, user_id)
    app_row = _get_application(db, app_id)
    acting = _check_can_act(db, user, app_row)

    remark = (remark or "").strip()
    if not remark:
        raise HTTPException(status_code=400, detail="A rejection remark is required")

    app_row.rejected_by = user.user_id
    app_row.rejected_by_name = user.name
    app_row.rejected_at_level = acting
    app_row.rejected_at = now_ist()
    app_row.rejected_remark = remark
    app_row.status = "rejected"

    db.commit()
    db.refresh(app_row)
    # Result email goes out via send_result_email (dialog on the frontend)
    return app_row.to_dict()


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
    untouched = not (app_row.l2_action_by or app_row.l3_action_by
                     or app_row.l4_action_by or app_row.l5_action_by)
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
        "pending_l2": sum(1 for a in apps if a["status"] == "pending_l2"),
        "pending_l3": sum(1 for a in apps if a["status"] == "pending_l3"),
        "pending_l4": sum(1 for a in apps if a["status"] == "pending_l4"),
        "pending_l5": sum(1 for a in apps if a["status"] == "pending_l5"),
        "approved": sum(1 for a in apps if a["status"] == "approved"),
        "rejected": sum(1 for a in apps if a["status"] == "rejected"),
    }
