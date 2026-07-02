from pydantic import BaseModel
from typing import Optional, List, Union, Any


class AttendeeIn(BaseModel):
    name: str
    source: Optional[str] = "employee"      # 'employee' | 'manual'
    present: Optional[bool] = True
    user_id: Optional[str] = None

    model_config = {"extra": "ignore"}      # frontend objects carry extra keys (id, ...)


class RowIn(BaseModel):
    trackId: str
    masterId: Optional[Union[int, str]] = None
    area: str
    category: Optional[str] = "Other"
    point: Optional[str] = ""
    resp: Optional[str] = ""
    due: Optional[str] = ""                 # 'YYYY-MM-DD' or ''
    flag: Optional[str] = "I"               # 'T' | 'I'
    status: Optional[str] = "pending"       # pending | in_progress | completed
    remark: Optional[str] = ""
    originDate: Optional[str] = ""          # 'YYYY-MM-DD' or ''
    carried: Optional[bool] = False
    prevRemarks: Optional[List[Any]] = []   # [{date, text, status, by}, ...]

    model_config = {"extra": "ignore"}


class MeetingIn(BaseModel):
    branchCode: str
    branchName: Optional[str] = ""
    date: str                               # 'YYYY-MM-DD'
    location: Optional[str] = ""
    type: Optional[str] = ""
    attendees: List[AttendeeIn] = []
    rows: List[RowIn] = []

    model_config = {"extra": "ignore"}


class MasterPointIn(BaseModel):
    title: str
    category: Optional[str] = "Other"


class MasterPointUpdate(BaseModel):
    title: Optional[str] = None
    category: Optional[str] = None


class CategoryIn(BaseModel):
    name: str
    color: Optional[str] = "#64748b"


class CategoryUpdate(BaseModel):
    color: str
