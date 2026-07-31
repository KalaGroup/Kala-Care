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
    altServiceHours: Optional[str] = ""
    serviceHours: Optional[str] = "500"
    consumable: Optional[str] = ""
    schedule: Optional[str] = ""


class KitPartIn(BaseModel):
    """A kit's own part line — a standalone copy, not a reference to a PartIn."""
    partNumber: Optional[str] = ""
    partDesc: Optional[str] = ""
    qty: Optional[str] = ""
    action: Optional[str] = ""
    serviceHours: Optional[str] = ""
    loose: Optional[bool] = False


class KitIn(BaseModel):
    kitNumber: Optional[str] = ""
    kitDesc: Optional[str] = ""
    qty: Optional[str] = ""
    action: Optional[str] = ""
    serviceHours: Optional[str] = ""
    parts: List[KitPartIn] = []


class AppCodeIn(BaseModel):
    appCode: str
    systemAppCode: Optional[str] = ""
    segment: Optional[str] = ""
    engineModel: Optional[str] = ""
    kva: Optional[str] = ""
    emission: Optional[str] = ""
    parts: List[PartIn] = []
    kits: List[KitIn] = []


class AppCodeUpdate(BaseModel):
    systemAppCode: Optional[str] = None
    segment: Optional[str] = None
    engineModel: Optional[str] = None
    kva: Optional[str] = None
    emission: Optional[str] = None
    parts: Optional[List[PartIn]] = None
    kits: Optional[List[KitIn]] = None


class ImportIn(BaseModel):
    items: List[AppCodeIn] = []


class ServiceRename(BaseModel):
    name: str


class ActivityIn(BaseModel):
    appCode: str
    employee: Optional[str] = None