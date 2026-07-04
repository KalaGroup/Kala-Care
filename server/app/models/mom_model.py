from sqlalchemy import (
    Column, Integer, String, Text, Boolean, Date, DateTime,
    ForeignKey, func,
)
from sqlalchemy.orm import relationship

from app.database import Base

class MomCategory(Base):
    """Colour-coded category used to group master discussion points."""
    __tablename__ = "mom_categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(80), unique=True, nullable=False, index=True)
    color = Column(String(20), nullable=False, default="#64748b")   # hex colour
    created_at = Column(DateTime, server_default=func.now())


class MomMasterPoint(Base):
    """A master 'Discussion Area' that pre-fills every new meeting sheet."""
    __tablename__ = "mom_master_points"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    category = Column(String(80), nullable=False, default="Other")
    is_active = Column(Boolean, nullable=False, default=True)       # soft delete
    created_at = Column(DateTime, server_default=func.now())


class MomMeeting(Base):
    """
    One finalized meeting sheet.

    A meeting can cover SEVERAL branches at once (joint reviews):
      • `branch_code` / `branch_name` keep the primary branch (first selected)
        so existing queries and old rows keep working;
      • `branches` holds the full JSON list  [{"code": "...", "name": "..."}]
        of every branch the meeting covers (may include manually added
        branches whose code starts with "MB-").
    """
    __tablename__ = "mom_meetings"

    id = Column(Integer, primary_key=True, index=True)
    branch_code = Column(String(40), nullable=False, index=True)    # primary branch
    branch_name = Column(String(255), nullable=False, default="")   # display label ("A + B" for joint)
    branches = Column(Text, nullable=True)                          # JSON: [{code, name}, …]
    date = Column(Date, nullable=False, index=True)
    location = Column(String(255), nullable=False, default="")
    type = Column(String(120), nullable=False, default="")          # preset OR custom typed text
    conducted_by = Column(String(120), nullable=False, default="")
    created_by = Column(String(50), ForeignKey("users.user_id"), nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    attendees = relationship(
        "MomAttendee", back_populates="meeting",
        cascade="all, delete-orphan", order_by="MomAttendee.id",
    )
    rows = relationship(
        "MomRow", back_populates="meeting",
        cascade="all, delete-orphan", order_by="MomRow.position",
    )


class MomAttendee(Base):
    """One attendee row of a meeting (mirrors the Sr.No / Attendees block)."""
    __tablename__ = "mom_attendees"

    id = Column(Integer, primary_key=True, index=True)
    meeting_id = Column(Integer, ForeignKey("mom_meetings.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(120), nullable=False)
    source = Column(String(20), nullable=False, default="employee")  # employee | manual
    present = Column(Boolean, nullable=False, default=True)
    user_id = Column(String(64), nullable=True)                      # linked employee, if any
    branch = Column(String(120), nullable=True)                      # branch label shown next to the name

    meeting = relationship("MomMeeting", back_populates="attendees")


class MomRow(Base):
    """
    One discussion row of a meeting sheet.

    flag:
      'T' (Task)        – has responsibility, due date and status
      'I' (Information) – MAY have responsibility (info directed at people),
                          but never a due date or a status

    responsibility:
      JSON list of names, e.g. '["Rahul Deshmukh", "Sneha Patil"]' — a task
      can be assigned to several people at once.  Legacy rows may still hold
      a plain string; the controller loads those as a one-person list.

    prev_remarks:
      JSON list [{date, text, status, by}] — the remark trail from earlier
      meetings, one entry per past review of this tracked task.
    """
    __tablename__ = "mom_rows"

    id = Column(Integer, primary_key=True, index=True)
    meeting_id = Column(Integer, ForeignKey("mom_meetings.id", ondelete="CASCADE"), nullable=False, index=True)
    position = Column(Integer, nullable=False, default=0)            # order inside the sheet
    track_id = Column(String(64), nullable=False, index=True)        # stable across carried meetings
    master_id = Column(Integer, nullable=True)                       # source master point, if any
    area = Column(String(255), nullable=False)
    category = Column(String(80), nullable=False, default="Other")
    point = Column(Text, nullable=False, default="")
    responsibility = Column(Text, nullable=True)                     # JSON list of names (legacy: plain string)
    due_date = Column(Date, nullable=True)
    flag = Column(String(1), nullable=False, default="I")            # T | I
    status = Column(String(20), nullable=False, default="pending")   # pending | in_progress | completed
    remark = Column(Text, nullable=False, default="")
    origin_date = Column(Date, nullable=True)                        # when the task was first raised
    carried = Column(Boolean, nullable=False, default=False)
    prev_remarks = Column(Text, nullable=True)                       # JSON list (see docstring)

    meeting = relationship("MomMeeting", back_populates="rows")