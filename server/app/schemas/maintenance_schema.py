from pydantic import BaseModel
from typing import Optional, List


class PartIn(BaseModel):
    partNumber: Optional[str] = ""
    partDesc: Optional[str] = ""
    qty: Optional[str] = ""
    action: Optional[str] = ""
    altPartNo: Optional[str] = ""
    altDesc: Optional[str] = ""
    altQty: Optional[str] = ""
    altAction: Optional[str] = ""
    serviceHours: Optional[str] = "500"
    consumable: Optional[str] = ""
    schedule: Optional[str] = ""


class AppCodeIn(BaseModel):
    appCode: str
    systemAppCode: Optional[str] = ""
    segment: Optional[str] = ""
    engineModel: Optional[str] = ""
    kva: Optional[str] = ""
    emission: Optional[str] = ""
    parts: List[PartIn] = []


class AppCodeUpdate(BaseModel):
    systemAppCode: Optional[str] = None
    segment: Optional[str] = None
    engineModel: Optional[str] = None
    kva: Optional[str] = None
    emission: Optional[str] = None
    parts: Optional[List[PartIn]] = None


class ImportIn(BaseModel):
    items: List[AppCodeIn] = []


class ServiceRename(BaseModel):
    name: str


class ActivityIn(BaseModel):
    appCode: str
    employee: Optional[str] = None