# app/schemas/mom_schema.py
"""Pydantic request bodies for the MOM module."""

from typing import Optional, List, Union, Any
from pydantic import BaseModel


class AttendeeIn(BaseModel):
    name: str
    source: Optional[str] = "employee"       # employee | manual
    present: Optional[bool] = True
    user_id: Optional[str] = None
    branch: Optional[str] = None             # branch label shown next to the name

    model_config = {"extra": "ignore"}


class BranchIn(BaseModel):
    """One branch a meeting covers (manual branches use an 'MB-…' code)."""
    code: str
    name: Optional[str] = ""

    model_config = {"extra": "ignore"}


class RowIn(BaseModel):
    trackId: str
    masterId: Optional[Union[int, str]] = None
    area: str
    category: Optional[str] = "Other"
    point: Optional[str] = ""
    # multi-person responsibility — a list of names; a plain string is still
    # accepted for backward compatibility and treated as a one-person list
    resp: Optional[Union[List[str], str]] = []
    due: Optional[str] = ""                  # 'YYYY-MM-DD' (Tasks only)
    flag: Optional[str] = "I"                # T | I  (I may have resp, never a due date)
    status: Optional[str] = "pending"
    remark: Optional[str] = ""
    originDate: Optional[str] = ""
    carried: Optional[bool] = False
    prevRemarks: Optional[List[Any]] = []

    model_config = {"extra": "ignore"}


class MeetingIn(BaseModel):
    branchCode: str                          # primary branch (first selected)
    branchName: Optional[str] = ""           # display label — "A + B" for joint reviews
    branches: Optional[List[BranchIn]] = []  # every branch this meeting covers
    date: str                                # 'YYYY-MM-DD' — mandatory
    location: Optional[str] = ""
    type: Optional[str] = ""                 # preset OR custom typed text
    heads: Optional[List[str]] = []          # meeting-head names (multiple allowed)
    attendees: List[AttendeeIn] = []
    rows: List[RowIn] = []

    model_config = {"extra": "ignore"}


class MeetingUpdateIn(BaseModel):
    """Editing an already-finalized meeting from MOM History.

    Only the current meeting's own details are editable — branch and conductor
    are never changed here. Carried (past) rows are sent back untouched by the
    client alongside the edited current rows, so nothing is lost. Every field
    is optional so a partial update only touches what it sends."""
    date: Optional[str] = None
    location: Optional[str] = None
    type: Optional[str] = None
    heads: Optional[List[str]] = None
    attendees: Optional[List[AttendeeIn]] = None
    rows: Optional[List[RowIn]] = None

    model_config = {"extra": "ignore"}


class MasterPointIn(BaseModel):
    title: str
    category: Optional[str] = "Other"


class MasterPointUpdate(BaseModel):
    title: Optional[str] = None
    category: Optional[str] = None


class MeetingTypeIn(BaseModel):
    name: str


class MeetingTypeUpdate(BaseModel):
    name: str


class CategoryIn(BaseModel):
    name: str
    color: Optional[str] = "#64748b"


class CategoryUpdate(BaseModel):
    color: Optional[str] = None
    name: Optional[str] = None               # new name when renaming


class DraftIn(BaseModel):
    """Auto-saved wizard draft — the whole client-side state as one JSON blob.
    Stored and returned verbatim, so the client shape can evolve freely."""
    data: dict

    model_config = {"extra": "ignore"}