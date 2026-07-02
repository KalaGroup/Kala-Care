from sqlalchemy import (
    Column, Integer, String, Text, Date, Boolean, DateTime, ForeignKey,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class MomCategory(Base):
    """A colour-coded grouping for discussion areas (Sales, Service, ...).

    Managed from the "Master setup" modal. Categories are referenced by NAME
    from master points and sheet rows (denormalised, matching the frontend),
    so renames are not supported — only add / recolour / delete-with-reassign.
    """
    __tablename__ = "mom_categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(60), nullable=False, unique=True, index=True)
    color = Column(String(9), nullable=False, default="#64748b")  # hex, e.g. #2f3192
    created_by = Column(String(50), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class MomMasterPoint(Base):
    """A reusable discussion area that pre-fills new meeting sheets.

    The branch admin ticks a subset of these in Meeting Setup; each ticked
    point becomes one row on the sheet.
    """
    __tablename__ = "mom_master_points"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    category = Column(String(60), nullable=False, default="Other")
    sort_order = Column(Integer, nullable=False, default=0)
    created_by = Column(String(50), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class MomMeeting(Base):
    """One finalized Minutes-of-Meeting sheet for a branch."""
    __tablename__ = "mom_meetings"

    id = Column(Integer, primary_key=True, index=True)
    branch_code = Column(String(50), nullable=False, index=True)
    branch_name = Column(String(120), nullable=False, default="")
    meeting_date = Column(Date, nullable=False, index=True)
    location = Column(String(255), nullable=False, default="")
    meeting_type = Column(String(80), nullable=False, default="")
    conducted_by_id = Column(String(50), nullable=True)
    conducted_by = Column(String(120), nullable=False, default="")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    attendees = relationship(
        "MomAttendee",
        back_populates="meeting",
        cascade="all, delete-orphan",
        order_by="MomAttendee.id",
    )
    rows = relationship(
        "MomRow",
        back_populates="meeting",
        cascade="all, delete-orphan",
        order_by="MomRow.sort_order",
    )


class MomAttendee(Base):
    """A person present (or marked absent) on one meeting sheet.

    source: 'employee' (auto-loaded from the branch) or 'manual' (typed in).
    """
    __tablename__ = "mom_attendees"

    id = Column(Integer, primary_key=True, index=True)
    meeting_id = Column(Integer, ForeignKey("mom_meetings.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String(50), nullable=True)          # set for real employees
    name = Column(String(120), nullable=False)
    source = Column(String(10), nullable=False, default="employee")
    present = Column(Boolean, nullable=False, default=True)

    meeting = relationship("MomMeeting", back_populates="attendees")


class MomRow(Base):
    """One line of the sheet: Discussion Area | points | responsibility |
    due | flag (T/I) | status | remark.

    track_id links the SAME agenda item across meetings — a pending Task is
    re-inserted (carried=True) into the next meeting with the accumulated
    remark history snapshotted into prev_remarks (JSON list of
    {date, text, status, by}), which becomes the extra "Remarks - date"
    columns in the Excel export.
    """
    __tablename__ = "mom_rows"

    id = Column(Integer, primary_key=True, index=True)
    meeting_id = Column(Integer, ForeignKey("mom_meetings.id", ondelete="CASCADE"), nullable=False, index=True)
    track_id = Column(String(40), nullable=False, index=True)
    master_id = Column(String(20), nullable=True)        # source master point id (str), null for ad-hoc rows
    sort_order = Column(Integer, nullable=False, default=0)
    area = Column(String(255), nullable=False, default="")
    category = Column(String(60), nullable=False, default="Other")
    point = Column(Text, nullable=True)                  # what was discussed / decided
    responsibility = Column(String(120), nullable=False, default="")
    due_date = Column(Date, nullable=True)
    flag = Column(String(1), nullable=False, default="I")        # 'T' task | 'I' information
    status = Column(String(20), nullable=False, default="pending")  # pending | in_progress | completed
    remark = Column(Text, nullable=True)                 # remark written in THIS meeting
    origin_date = Column(Date, nullable=True)            # when the item was first raised
    carried = Column(Boolean, nullable=False, default=False)
    prev_remarks = Column(Text, nullable=True)           # JSON: [{date, text, status, by}, ...]

    meeting = relationship("MomMeeting", back_populates="rows")
