from sqlalchemy import (
    Column, Integer, String, Text, UnicodeText, Boolean, Date, DateTime,
    ForeignKey, LargeBinary, func,
)
from sqlalchemy.orm import relationship

from app.database import Base
from app.time_utils import now_ist

class MomCategory(Base):
    """Colour-coded category used to group master discussion points."""
    __tablename__ = "mom_categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(80), unique=True, nullable=False, index=True)
    color = Column(String(20), nullable=False, default="#64748b")   # hex colour
    created_at = Column(DateTime, default=now_ist)


class MomMasterPoint(Base):
    """A master 'Discussion Area' that pre-fills every new meeting sheet."""
    __tablename__ = "mom_master_points"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    category = Column(String(80), nullable=False, default="Other")
    is_active = Column(Boolean, nullable=False, default=True)       # soft delete
    created_at = Column(DateTime, default=now_ist)


class MomMeetingType(Base):
    """Master 'Meeting type' offered in the New-meeting type dropdown.
    Meetings store the type as plain text, so deleting a master type never
    touches saved meetings."""
    __tablename__ = "mom_meeting_types"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(120), unique=True, nullable=False, index=True)
    created_at = Column(DateTime, default=now_ist)


class MomDraft(Base):
    """Auto-saved in-progress meeting draft — ONE per user.

    The whole wizard state (branches, attendees, picked points, sheet rows,
    carried-task edits …) is mirrored here as a JSON blob while the user
    works, so a refresh / power cut never loses typing.  Deleted when the
    minutes are finalized or the wizard is reset; stale drafts (> 7 days)
    are discarded on read."""
    __tablename__ = "mom_drafts"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String(64), unique=True, nullable=False, index=True)
    data = Column(UnicodeText, nullable=False, default="")           # JSON blob of the wizard state
    saved_at = Column(DateTime, default=now_ist, onupdate=now_ist)


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
    branches = Column(UnicodeText, nullable=True)                   # JSON: [{code, name}, …]
    date = Column(Date, nullable=False, index=True)
    location = Column(String(255), nullable=False, default="")
    type = Column(String(120), nullable=False, default="")          # preset OR custom typed text
    conducted_by = Column(String(120), nullable=False, default="")
    heads = Column(UnicodeText, nullable=True)                      # JSON list of meeting-head names
    created_by = Column(String(50), ForeignKey("users.user_id"), nullable=True)
    created_at = Column(DateTime, default=now_ist)

    attendees = relationship(
        "MomAttendee", back_populates="meeting",
        cascade="all, delete-orphan", order_by="MomAttendee.id",
    )
    rows = relationship(
        "MomRow", back_populates="meeting",
        cascade="all, delete-orphan", order_by="MomRow.position",
    )


class MomFolder(Base):
    """A folder in the MOM "Master Folder" file store (Master Admin only).

    Holds any reference files (Word / Excel / CSV / PDF / image) the Master Admin
    keeps alongside the MOM register. Deleting a folder cascades its files."""
    __tablename__ = "mom_folders"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    created_by = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=now_ist)
    updated_at = Column(DateTime, onupdate=now_ist)

    files = relationship(
        "MomFile", back_populates="folder",
        cascade="all, delete-orphan", order_by="MomFile.created_at.desc()",
    )


class MomFile(Base):
    """A file uploaded into a MOM folder. The bytes live in `data` (like the
    Knowledge Bank), so nothing depends on a filesystem path."""
    __tablename__ = "mom_files"

    id = Column(Integer, primary_key=True, index=True)
    folder_id = Column(Integer, ForeignKey("mom_folders.id", ondelete="CASCADE"), nullable=False, index=True)
    original_name = Column(String(300), nullable=False)
    content_type = Column(String(150), nullable=True)
    data = Column(LargeBinary, nullable=True)                    # the file bytes
    kind = Column(String(20), nullable=False, default="other")   # image|pdf|word|excel|csv|other
    size_bytes = Column(Integer, nullable=True)
    uploaded_by = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=now_ist)

    folder = relationship("MomFolder", back_populates="files")


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

    edited_at:
      When this row's DEFINITION (area / category / point / owners / due /
      flag) was last written. Stamped when the Master Admin rewrites a point
      while editing a past meeting, so the newest wording of a tracked task
      wins in the next meeting's carry-forward even though the already-saved
      later meetings keep their own snapshot untouched. NULL = never edited
      (the row still reads as of its meeting's date).
    """
    __tablename__ = "mom_rows"

    id = Column(Integer, primary_key=True, index=True)
    meeting_id = Column(Integer, ForeignKey("mom_meetings.id", ondelete="CASCADE"), nullable=False, index=True)
    position = Column(Integer, nullable=False, default=0)            # order inside the sheet
    track_id = Column(String(64), nullable=False, index=True)        # stable across carried meetings
    master_id = Column(Integer, nullable=True)                       # source master point, if any
    area = Column(String(255), nullable=False)
    category = Column(String(80), nullable=False, default="Other")
    # UnicodeText → NVARCHAR(max) on SQL Server: keeps bullet chars ("●"),
    # Devanagari names etc. intact — plain Text (VARCHAR) turns them into "?"
    point = Column(UnicodeText, nullable=False, default="")
    responsibility = Column(UnicodeText, nullable=True)              # JSON list of names (legacy: plain string)
    due_date = Column(Date, nullable=True)
    flag = Column(String(1), nullable=False, default="I")            # T | I
    status = Column(String(20), nullable=False, default="pending")   # pending | in_progress | completed
    remark = Column(UnicodeText, nullable=False, default="")
    origin_date = Column(Date, nullable=True)                        # when the task was first raised
    carried = Column(Boolean, nullable=False, default=False)
    prev_remarks = Column(UnicodeText, nullable=True)                # JSON list (see docstring)
    edited_at = Column(DateTime, nullable=True)                      # last definition rewrite (see docstring)

    meeting = relationship("MomMeeting", back_populates="rows")