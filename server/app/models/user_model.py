from sqlalchemy import Column, Integer, String, DateTime, Enum, Boolean, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
import enum
from app.time_utils import now_ist

class UserRole(str, enum.Enum):
    MASTER_ADMIN = "master_admin"
    IT_ADMIN = "it_admin"  # DEPRECATED: role removed from the app; kept only so legacy DB rows still load
    BRANCH_ADMIN = "branch_admin"
    EMPLOYEE = "employee"

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String(50), unique=True, index=True, nullable=False)
    name = Column(String(100), nullable=False)
    branch = Column(String(20), nullable=False)          # primary branch code
    branch_name = Column(String(100), nullable=False)    # primary branch name
    mobile_number = Column(String(15), nullable=True)
    email = Column(String(255), nullable=True)   # approval notifications go here
    password = Column(String(255), nullable=False)
    role = Column(Enum(UserRole), default=UserRole.EMPLOYEE)
    is_blocked = Column(Boolean, default=False)
    # Soft delete: "deleted" users stay in the DB so history (followups, MOM,
    # expenses, approvals) keeps its person, but they are hidden everywhere
    # and can never log in. Set by Profile -> Delete Employee.
    is_deleted = Column(Boolean, default=False)
    can_export = Column(Boolean, default=False)
    can_access_expense = Column(Boolean, default=False)
    # Per-user page visibility, granted by Master Admin from the Profile page.
    can_access_part_detail = Column(Boolean, default=False)  # Part Detail Info pages
    can_access_mom = Column(Boolean, default=False)          # MOM Tracking page
    can_access_approval = Column(Boolean, default=False)     # Approval Application page
    can_access_pms = Column(Boolean, default=False)          # PMS module (opens the menu)
    # Open Quotation Tracker page — the branch-wise service quotation vs invoicing
    # summary. Master Admin always sees it; everyone else needs this flag.
    can_access_quotation_tracker = Column(Boolean, default=False)
    # WHICH report pages inside PMS: JSON list of page keys. NULL = every page
    # (how it worked before per-page rights). AOP & Master is NOT in here — it
    # has its own aop_access / aop_tabs rights below.
    pms_pages = Column(String(1000), nullable=True)
    # WHICH sheets of the Annual Reports page: JSON list of report keys.
    # NULL = every sheet (how it worked before per-sheet rights). The sheets
    # only read, so this is show / don't show — no view/edit level.
    annual_tabs = Column(String(1000), nullable=True)
    # AOP & Master page inside PMS — three levels, because target setting is
    # sensitive: 'none' (hidden) | 'view' (read-only) | 'edit' (full).
    aop_access = Column(String(10), nullable=True, default="none")
    # WHICH tabs of that page, and at which level: JSON {tab_key: 'view'|'edit'}.
    # NULL / empty = every tab at the aop_access level above (how it worked
    # before per-tab rights existed). A tab missing from a non-empty map is
    # hidden, and no tab can outrank aop_access.
    aop_tabs = Column(String(1000), nullable=True)
    theme = Column(String(10), nullable=True, default="light")  # 'light' | 'dark' — UI preference, applied on login
    created_at = Column(DateTime(timezone=True), default=now_ist)
    updated_at = Column(DateTime(timezone=True), onupdate=now_ist)

    branch_accesses = relationship(
        "UserBranchAccess",
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True
    )


class UserBranchAccess(Base):
    __tablename__ = "user_branch_access"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String(50), ForeignKey("users.user_id", ondelete="CASCADE"),
                     nullable=False, index=True)
    branch = Column(String(20), nullable=False)
    branch_name = Column(String(100), nullable=False)
    is_primary = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=now_ist)

    user = relationship("User", back_populates="branch_accesses")

    __table_args__ = (UniqueConstraint('user_id', 'branch', name='uq_user_branch'),)