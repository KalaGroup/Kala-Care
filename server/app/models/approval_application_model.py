from sqlalchemy import (
    Column, Integer, String, Float, DateTime, Text, Boolean, ForeignKey,
    LargeBinary, UniqueConstraint
)
from sqlalchemy.orm import relationship, deferred
from app.database import Base
from app.time_utils import now_ist

# The two fixed rights-master users. They always resolve to L5 (COO) level, can
# open the rights master panel, and never appear in the assignable-users dropdown.
RIGHTS_MASTER_IDS = ("kala000001", "31240002")

# Approval levels — the Employee Hierarchy is a 5-stage ladder:
#   l1 -> Employee (creates applications; a self limit auto-approves own records)
#   l2 -> L2 approver (first branch-level approval stage)
#   l3 -> L3 approver (second branch-level approval stage)
#   l4 -> HOD (fixed for L4; assigned per branch PER CATEGORY)
#   l5 -> COO (fixed for L5; the rights-master users, final fallback)
APPROVAL_LEVELS = ("l1", "l2", "l3", "l4", "l5")

# Legacy level names (pre-L1..L5 scheme) still tolerated when reading old rows.
LEGACY_LEVEL_MAP = {"user": "l1", "branch": "l2", "hod": "l4", "coo": "l5"}

# Branch code of the Head Office. HO members: see every branch in the create
# form and CHOOSE their own L4/L5 approvers; HO never appears as a hierarchy row.
HO_BRANCH = "HO"

# Application statuses (the pending_* value names the level whose action is due).
# 'draft' = saved by the creator, not yet submitted — visible only to them.
APP_STATUSES = ("draft", "pending_l2", "pending_l3", "pending_l4", "pending_l5",
                "approved", "rejected")

# Default display names of the five levels — the COO can rename them from the
# Authority Limit tab (ApprovalLevelConfig.display_name); the custom name shows
# everywhere in the Approval Application.
DEFAULT_LEVEL_NAMES = {
    "l1": "Employee",
    "l2": "Approver",
    "l3": "Approver",
    "l4": "HOD",
    "l5": "COO",
}


class ApprovalLevelConfig(Base):
    """One row per level (l1..l5): its display name and its authority limits.

    LIMITS ARE LEVEL-WISE — every user holding the level gets the same
    Max Discounting % / Max Credit Days / Max Expense Amount. NULL = 0
    (nothing can be finalized at that level) except for the rights-master
    COOs, who are always unlimited regardless of the l5 row."""
    __tablename__ = "approval_level_configs"

    id = Column(Integer, primary_key=True, index=True)
    level = Column(String(5), nullable=False, unique=True)   # l1..l5
    display_name = Column(String(100), nullable=True)        # NULL = default name
    max_discount_percent = Column(Float, nullable=True)
    max_credit_days = Column(Integer, nullable=True)
    max_expense_amount = Column(Float, nullable=True)
    updated_by = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=now_ist)
    updated_at = Column(DateTime, onupdate=now_ist)

    def to_dict(self):
        return {
            "id": self.id,
            "level": self.level,
            "display_name": self.display_name or DEFAULT_LEVEL_NAMES.get(self.level, self.level),
            "max_discount_percent": self.max_discount_percent,
            "max_credit_days": self.max_credit_days,
            "max_expense_amount": self.max_expense_amount,
        }


class ApprovalLevelExpenseLimit(Base):
    """Per level, per expense type amount limit. Overrides the level's general
    max_expense_amount for THAT type; no row = the general limit applies."""
    __tablename__ = "approval_level_expense_limits"

    id = Column(Integer, primary_key=True, index=True)
    level = Column(String(5), nullable=False, index=True)    # l1..l5
    expense_type_id = Column(
        Integer, ForeignKey("approval_expense_types.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    max_amount = Column(Float, nullable=True)
    updated_by = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=now_ist)
    updated_at = Column(DateTime, onupdate=now_ist)

    __table_args__ = (UniqueConstraint("level", "expense_type_id", name="uq_apv_lvl_exp_type"),)

    def to_dict(self):
        return {
            "id": self.id,
            "level": self.level,
            "expense_type_id": self.expense_type_id,
            "max_amount": self.max_amount,
        }


class ApprovalRight(Base):
    """Which approval level a user acts at on the Approval Application page.

    Users without a row are plain L1 employees. Levels l2/l3/l4 are granted by
    the hierarchy builder (stage / HOD-category assignments); l5 is fixed to
    the rights-master users.
    """
    __tablename__ = "approval_rights"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String(50), nullable=False, unique=True, index=True)
    user_name = Column(String(100), nullable=True)
    branch = Column(String(20), nullable=True)
    level = Column(String(20), nullable=False, default="l1")  # l1|l2|l3|l4|l5
    # Authority limits (Authority Matrix), for EVERY level — an L1 employee's
    # own limit auto-approves their own records within it. An approver whose
    # limit covers the record's value FINALIZES it; a value beyond the limit
    # escalates to the next level in the chain. NULL = 0 (nothing) except for
    # the rights masters, who are unlimited.
    max_discount_percent = Column(Float, nullable=True)   # discounting applications
    max_credit_days = Column(Integer, nullable=True)      # credit applications
    max_expense_amount = Column(Float, nullable=True)     # expense applications
    granted_by = Column(String(50), nullable=True)
    granted_by_name = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=now_ist)
    updated_at = Column(DateTime, onupdate=now_ist)

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "user_name": self.user_name,
            "branch": self.branch,
            "level": self.level,
            "max_discount_percent": self.max_discount_percent,
            "max_credit_days": self.max_credit_days,
            "max_expense_amount": self.max_expense_amount,
            "granted_by": self.granted_by,
            "granted_by_name": self.granted_by_name,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class ApprovalStageApprover(Base):
    """Who approves at the L2 / L3 stages of ONE branch (Employee Hierarchy).

    Multiple rows per (branch, stage) are allowed; any assigned person may act.
    No rows for a branch+stage = the stage auto-skips for that branch.
    L4 lives in ApprovalHODCategory (category-wise) and L5 is fixed (COO)."""
    __tablename__ = "approval_stage_approvers"

    id = Column(Integer, primary_key=True, index=True)
    branch = Column(String(20), nullable=False, index=True)
    stage = Column(String(5), nullable=False, index=True)   # l2 | l3
    user_id = Column(String(50), nullable=False, index=True)
    user_name = Column(String(100), nullable=True)
    updated_by = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=now_ist)
    updated_at = Column(DateTime, onupdate=now_ist)

    __table_args__ = (UniqueConstraint("branch", "stage", "user_id", name="uq_apv_stage_br_st_user"),)

    def to_dict(self):
        return {
            "id": self.id,
            "branch": self.branch,
            "stage": self.stage,
            "user_id": self.user_id,
            "user_name": self.user_name,
        }


class ApprovalEmployeeRule(Base):
    """Per-employee approval chain rules (Authority Matrix).

    Decides which steps an employee's applications must pass through:
    skip L2 / L3 / L4 when switched off. L5 (COO) stays the final
    fallback for anything beyond the earlier approvers' authority."""
    __tablename__ = "approval_employee_rules"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String(50), nullable=False, unique=True, index=True)
    user_name = Column(String(100), nullable=True)
    branch = Column(String(20), nullable=True)
    require_l2 = Column(Boolean, default=True)   # L2 approval needed?
    require_l3 = Column(Boolean, default=True)   # L3 approval needed?
    require_l4 = Column(Boolean, default=True)   # L4 (HOD) approval needed?
    updated_by = Column(String(50), nullable=True)
    updated_by_name = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=now_ist)
    updated_at = Column(DateTime, onupdate=now_ist)

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "user_name": self.user_name,
            "branch": self.branch,
            "require_l2": bool(self.require_l2),
            "require_l3": bool(self.require_l3),
            "require_l4": bool(self.require_l4),
            "updated_by": self.updated_by,
            "updated_by_name": self.updated_by_name,
        }


class ApprovalHODCategory(Base):
    """Which L4 (HOD) users approve each category (spares / services /
    spares & services) at the L4 step — PER BRANCH. Multiple rows per
    (branch, category) are allowed; any assigned person may approve. No rows
    for a branch+category = any L4 user may act."""
    __tablename__ = "approval_hod_categories"

    id = Column(Integer, primary_key=True, index=True)
    branch = Column(String(20), nullable=True, index=True)     # records of this branch
    category = Column(String(30), nullable=False, index=True)  # spares|services|spares_services
    user_id = Column(String(50), nullable=True)
    user_name = Column(String(100), nullable=True)
    updated_by = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=now_ist)
    updated_at = Column(DateTime, onupdate=now_ist)

    __table_args__ = (UniqueConstraint("branch", "category", "user_id", name="uq_apv_hod_br_cat_user"),)

    def to_dict(self):
        return {
            "id": self.id,
            "branch": self.branch,
            "category": self.category,
            "user_id": self.user_id,
            "user_name": self.user_name,
        }


class ApprovalExpenseType(Base):
    """Master list of expense types for the Expense application dropdown.
    Managed from the COO view's Expense Type Master."""
    __tablename__ = "approval_expense_types"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False, unique=True)
    created_by = Column(String(50), nullable=True)
    created_by_name = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=now_ist)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "created_by": self.created_by,
            "created_by_name": self.created_by_name,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class ApprovalApproverExclusion(Base):
    """Per-employee, PER-CATEGORY approver exclusion (Authority Matrix tree).

    A row means: this employee's records of THIS category must never go to
    this approver. Other categories are unaffected. If a step is left with
    no usable approver because of exclusions, it auto-skips."""
    __tablename__ = "approval_approver_exclusions"

    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(String(50), nullable=False, index=True)   # record creator
    approver_id = Column(String(50), nullable=False, index=True)   # blocked approver
    category = Column(String(30), nullable=True)                   # spares|services|spares_services
    created_by = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=now_ist)

    __table_args__ = (UniqueConstraint("employee_id", "approver_id", "category",
                                       name="uq_apv_excl_emp_app_cat"),)

    def to_dict(self):
        return {
            "id": self.id,
            "employee_id": self.employee_id,
            "approver_id": self.approver_id,
            "category": self.category,
        }


class ApprovalExpenseTypeLimit(Base):
    """Per expense type, per approver amount limit (Authority Matrix).

    When an expense application is approved, the approver's limit for THAT
    expense type wins; without a row here their general max_expense_amount
    applies. NULL max_amount = unlimited for this type."""
    __tablename__ = "approval_expense_type_limits"

    id = Column(Integer, primary_key=True, index=True)
    expense_type_id = Column(
        Integer, ForeignKey("approval_expense_types.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    user_id = Column(String(50), nullable=False, index=True)
    user_name = Column(String(100), nullable=True)
    max_amount = Column(Float, nullable=True)
    updated_by = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=now_ist)
    updated_at = Column(DateTime, onupdate=now_ist)

    __table_args__ = (UniqueConstraint("expense_type_id", "user_id", name="uq_apv_exp_type_user"),)

    def to_dict(self):
        return {
            "id": self.id,
            "expense_type_id": self.expense_type_id,
            "user_id": self.user_id,
            "user_name": self.user_name,
            "max_amount": self.max_amount,
        }


class ApprovalApplication(Base):
    """One approval application raised by any user and pushed through the
    L2 -> L3 -> L4 (HOD) -> L5 (COO) chain of its branch's hierarchy row.
    Self-approval is removed: the creator never acts on their own record —
    a value within the creator's OWN limit is auto-approved at submit.
    HO-branch creators skip L2/L3 and pick their own L4 / L5 approvers.

    Discounting / Credit share the same columns; Expense additionally fills
    expense_amount / expense_type / payment_mode.
    """
    __tablename__ = "approval_applications"

    id = Column(Integer, primary_key=True, index=True)
    # DIS/2025-26/01 style; NULL while the application is a draft. Uniqueness is
    # enforced by a FILTERED unique index (see performance_indexes) because a
    # plain SQL Server unique index treats two NULL drafts as duplicates.
    app_no = Column(String(30), index=True, nullable=True)

    category = Column(String(30), nullable=False)       # spares | services | spares_services
    request_type = Column(String(20), nullable=False)   # discounting | credit | expense

    branch = Column(String(20), nullable=False, index=True)
    branch_name = Column(String(100), nullable=True)

    # Customer details (discounting / credit only — expense skips these)
    customer_name = Column(String(255), nullable=True)
    instance_id = Column(String(100), nullable=True)
    sr_no = Column(String(100), nullable=True)

    invoice_no = Column(String(100), nullable=True)
    delivery_challan = Column(String(100), nullable=True)
    quotation_no = Column(String(100), nullable=True)
    quotation_amount = Column(Float, nullable=True)

    # Type-specific asks
    discount_percent = Column(Float, nullable=True)   # discounting only
    credit_days = Column(Integer, nullable=True)      # credit only

    # Expense-only extras
    expense_amount = Column(Float, nullable=True)
    expense_type = Column(String(100), nullable=True)
    payment_mode = Column(String(50), nullable=True)

    description = Column(Text, nullable=True)
    remark = Column(Text, nullable=True)

    status = Column(String(20), nullable=False, default="pending_l2", index=True)

    created_by = Column(String(50), nullable=False, index=True)
    created_by_name = Column(String(100), nullable=True)
    created_by_level = Column(String(20), nullable=True)  # level of creator at submit time

    # True when the record was approved at submit because its value was within
    # the creator's OWN authority limit (self-approval replaced by auto-approve)
    auto_approved = Column(Boolean, default=False)

    # HO-branch creators choose who approves their record at L4 / L5
    l4_approver_id = Column(String(50), nullable=True)
    l4_approver_name = Column(String(100), nullable=True)
    l5_approver_id = Column(String(50), nullable=True)
    l5_approver_name = Column(String(100), nullable=True)

    # Per-level approval audit trail (L2, L3, L4=HOD, L5=COO)
    l2_action_by = Column(String(50), nullable=True)
    l2_action_by_name = Column(String(100), nullable=True)
    l2_action_at = Column(DateTime, nullable=True)
    l2_action_remark = Column(Text, nullable=True)

    l3_action_by = Column(String(50), nullable=True)
    l3_action_by_name = Column(String(100), nullable=True)
    l3_action_at = Column(DateTime, nullable=True)
    l3_action_remark = Column(Text, nullable=True)

    l4_action_by = Column(String(50), nullable=True)
    l4_action_by_name = Column(String(100), nullable=True)
    l4_action_at = Column(DateTime, nullable=True)
    l4_action_remark = Column(Text, nullable=True)

    l5_action_by = Column(String(50), nullable=True)
    l5_action_by_name = Column(String(100), nullable=True)
    l5_action_at = Column(DateTime, nullable=True)
    l5_action_remark = Column(Text, nullable=True)

    rejected_by = Column(String(50), nullable=True)
    rejected_by_name = Column(String(100), nullable=True)
    rejected_at_level = Column(String(20), nullable=True)  # l2 | l3 | l4 | l5
    rejected_at = Column(DateTime, nullable=True)
    rejected_remark = Column(Text, nullable=True)

    created_at = Column(DateTime, default=now_ist, index=True)
    updated_at = Column(DateTime, onupdate=now_ist)

    attachments = relationship(
        "ApprovalAttachment",
        back_populates="application",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    def to_dict(self, include_attachments=True):
        d = {
            "id": self.id,
            "app_no": self.app_no,
            "category": self.category,
            "request_type": self.request_type,
            "branch": self.branch,
            "branch_name": self.branch_name,
            "customer_name": self.customer_name,
            "instance_id": self.instance_id,
            "sr_no": self.sr_no,
            "invoice_no": self.invoice_no,
            "delivery_challan": self.delivery_challan,
            "quotation_no": self.quotation_no,
            "quotation_amount": self.quotation_amount,
            "discount_percent": self.discount_percent,
            "credit_days": self.credit_days,
            "expense_amount": self.expense_amount,
            "expense_type": self.expense_type,
            "payment_mode": self.payment_mode,
            "description": self.description,
            "remark": self.remark,
            "status": self.status,
            "created_by": self.created_by,
            "created_by_name": self.created_by_name,
            "created_by_level": self.created_by_level,
            "auto_approved": bool(self.auto_approved),
            "l4_approver_id": self.l4_approver_id,
            "l4_approver_name": self.l4_approver_name,
            "l5_approver_id": self.l5_approver_id,
            "l5_approver_name": self.l5_approver_name,
            "l2_action_by": self.l2_action_by,
            "l2_action_by_name": self.l2_action_by_name,
            "l2_action_at": self.l2_action_at.isoformat() if self.l2_action_at else None,
            "l2_action_remark": self.l2_action_remark,
            "l3_action_by": self.l3_action_by,
            "l3_action_by_name": self.l3_action_by_name,
            "l3_action_at": self.l3_action_at.isoformat() if self.l3_action_at else None,
            "l3_action_remark": self.l3_action_remark,
            "l4_action_by": self.l4_action_by,
            "l4_action_by_name": self.l4_action_by_name,
            "l4_action_at": self.l4_action_at.isoformat() if self.l4_action_at else None,
            "l4_action_remark": self.l4_action_remark,
            "l5_action_by": self.l5_action_by,
            "l5_action_by_name": self.l5_action_by_name,
            "l5_action_at": self.l5_action_at.isoformat() if self.l5_action_at else None,
            "l5_action_remark": self.l5_action_remark,
            "rejected_by": self.rejected_by,
            "rejected_by_name": self.rejected_by_name,
            "rejected_at_level": self.rejected_at_level,
            "rejected_at": self.rejected_at.isoformat() if self.rejected_at else None,
            "rejected_remark": self.rejected_remark,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
        if include_attachments:
            d["attachments"] = [a.to_dict() for a in (self.attachments or [])]
        return d


class ApprovalAttachment(Base):
    """A file attached to an approval application (stored in the DB like the
    Knowledge Book files, served via /view and /download endpoints)."""
    __tablename__ = "approval_attachments"

    id = Column(Integer, primary_key=True, index=True)
    application_id = Column(
        Integer, ForeignKey("approval_applications.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    original_name = Column(String(255), nullable=False)
    content_type = Column(String(120), nullable=True)
    size_bytes = Column(Integer, nullable=True)
    # deferred: the file bytes are loaded ONLY when explicitly accessed
    # (view/download endpoints) — listing applications with their attachment
    # metadata never drags the blobs out of the database.
    data = deferred(Column(LargeBinary, nullable=True))
    uploaded_by = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=now_ist)

    application = relationship("ApprovalApplication", back_populates="attachments")

    def to_dict(self):
        return {
            "id": self.id,
            "application_id": self.application_id,
            "original_name": self.original_name,
            "content_type": self.content_type,
            "size_bytes": self.size_bytes,
            "uploaded_by": self.uploaded_by,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
