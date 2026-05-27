from sqlalchemy import Column, Integer, String, DateTime, Enum, Boolean, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
import enum

class UserRole(str, enum.Enum):
    MASTER_ADMIN = "master_admin"
    IT_ADMIN = "it_admin"
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
    password = Column(String(255), nullable=False)
    role = Column(Enum(UserRole), default=UserRole.EMPLOYEE)
    is_blocked = Column(Boolean, default=False)
    can_export = Column(Boolean, default=False)
    can_access_expense = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

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
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="branch_accesses")

    __table_args__ = (UniqueConstraint('user_id', 'branch', name='uq_user_branch'),)