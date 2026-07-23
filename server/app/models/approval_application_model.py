from sqlalchemy import (
    Column, Integer, String, Float, DateTime, Text, Boolean, ForeignKey,
    LargeBinary, UniqueConstraint
)
from sqlalchemy.orm import relationship, deferred
from app.database import Base
from app.time_utils import now_ist

# The two fixed rights-master users. They always resolve to COO level, can open
# the rights master panel, and never appear in the assignable-users dropdown.
RIGHTS_MASTER_IDS = ("kala000001", "31240002")

# Approval levels (who the user acts as on the Approval Application page):
#   user    -> employee view: create applications, track own
#   branch  -> branch admin view: approve branch submissions + submit expense
#   hod     -> HOD view: approve after branch level
#   coo     -> COO view: final approval
APPROVAL_LEVELS = ("user", "branch", "hod", "coo")

# Application statuses (the pending_* value names the level whose action is due).
# 'draft' = saved by the creator, not yet submitted — visible only to them.
APP_STATUSES = ("draft", "pending_branch", "pending_hod", "pending_coo", "approved", "rejected")


class ApprovalRight(Base):
    """Which approval level a user acts at on the Approval Application page.

    Maintained from the in-page Rights Master (visible only to the
    RIGHTS_MASTER_IDS users). Users without a row fall back to their app role:
    branch_admin -> 'branch', everyone else -> 'user'.
    """
    __tablename__ = "approval_rights"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String(50), nullable=False, unique=True, index=True)
    user_name = Column(String(100), nullable=True)
    branch = Column(String(20), nullable=True)
    level = Column(String(20), nullable=False, default="user")  # user|branch|hod|coo
    # Authority limits (Authority Matrix). NULL = unlimited for that metric.
    # An approver whose limit covers the record's value FINALIZES it; a value
    # beyond the limit escalates to the next level in the employee's chain.
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


class ApprovalEmployeeRule(Base):
    """Per-employee approval chain rules (Authority Matrix).

    Decides which steps an employee's applications must pass through:
    skip Branch Admin and/or HOD when switched off. COO stays the final
    fallback for anything beyond the earlier approvers' authority."""
    __tablename__ = "approval_employee_rules"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String(50), nullable=False, unique=True, index=True)
    user_name = Column(String(100), nullable=True)
    branch = Column(String(20), nullable=True)
    require_branch = Column(Boolean, default=True)   # Branch Admin approval needed?
    require_hod = Column(Boolean, default=True)      # HOD approval needed?
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
            "require_branch": bool(self.require_branch),
            "require_hod": bool(self.require_hod),
            "updated_by": self.updated_by,
            "updated_by_name": self.updated_by_name,
        }


class ApprovalHODCategory(Base):
    """Which HOD-level users approve each category (spares / services /
    spares & services) at the HOD step — PER BRANCH. Multiple rows per
    (branch, category) are allowed; any assigned person may approve. No rows
    for a branch+category = any HOD user may act."""
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
    """One approval application raised by an employee (or branch admin, for
    expense) and pushed through Branch Admin -> HOD -> COO approval.

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

    status = Column(String(20), nullable=False, default="pending_branch", index=True)

    created_by = Column(String(50), nullable=False, index=True)
    created_by_name = Column(String(100), nullable=True)
    created_by_level = Column(String(20), nullable=True)  # level of creator at submit time

    # Per-level approval audit trail
    branch_action_by = Column(String(50), nullable=True)
    branch_action_by_name = Column(String(100), nullable=True)
    branch_action_at = Column(DateTime, nullable=True)
    branch_action_remark = Column(Text, nullable=True)

    hod_action_by = Column(String(50), nullable=True)
    hod_action_by_name = Column(String(100), nullable=True)
    hod_action_at = Column(DateTime, nullable=True)
    hod_action_remark = Column(Text, nullable=True)

    coo_action_by = Column(String(50), nullable=True)
    coo_action_by_name = Column(String(100), nullable=True)
    coo_action_at = Column(DateTime, nullable=True)
    coo_action_remark = Column(Text, nullable=True)

    rejected_by = Column(String(50), nullable=True)
    rejected_by_name = Column(String(100), nullable=True)
    rejected_at_level = Column(String(20), nullable=True)  # branch | hod | coo
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
            "branch_action_by": self.branch_action_by,
            "branch_action_by_name": self.branch_action_by_name,
            "branch_action_at": self.branch_action_at.isoformat() if self.branch_action_at else None,
            "branch_action_remark": self.branch_action_remark,
            "hod_action_by": self.hod_action_by,
            "hod_action_by_name": self.hod_action_by_name,
            "hod_action_at": self.hod_action_at.isoformat() if self.hod_action_at else None,
            "hod_action_remark": self.hod_action_remark,
            "coo_action_by": self.coo_action_by,
            "coo_action_by_name": self.coo_action_by_name,
            "coo_action_at": self.coo_action_at.isoformat() if self.coo_action_at else None,
            "coo_action_remark": self.coo_action_remark,
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
