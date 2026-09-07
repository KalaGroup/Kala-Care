from pydantic import BaseModel, Field, validator,field_validator

from typing import Optional, List, Dict, Any
from datetime import datetime

class ServiceBase(BaseModel):
    name: str
    description: Optional[str] = None

class ServiceCreate(ServiceBase):
    pass

class ServiceUpdate(ServiceBase):
    pass

class ServiceResponse(ServiceBase):
    id: int
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

class CampaignBase(BaseModel):
    name: str
    service: str
    description: Optional[str] = None
    color: Optional[str] = "#71C9CE"
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    status: Optional[str] = "active"
    asset_numbers: Optional[List[str]] = Field(default_factory=list)
    scripts: Optional[List[Dict[str, Any]]] = Field(default_factory=list)
    created_by_id: Optional[str] = None
    created_by_name: Optional[str] = None

    @validator('asset_numbers', pre=True, always=True)
    def validate_asset_numbers(cls, v):
        if v is None:
            return []
        if isinstance(v, list):
            # Extract just the asset numbers as strings
            validated_assets = []
            for asset in v:
                if isinstance(asset, dict):
                    # If it's a dict with ASSET NUMBER key
                    asset_num = asset.get('ASSET NUMBER') or asset.get('asset_number') or asset.get('Asset Number')
                    if asset_num:
                        validated_assets.append(str(asset_num).strip())
                elif isinstance(asset, str):
                    # If it's already a string
                    validated_assets.append(asset.strip())
                else:
                    validated_assets.append(str(asset).strip())
            return validated_assets
        return []

    @validator('scripts', pre=True, always=True)
    def validate_scripts(cls, v):
        if v is None:
            return []
        if isinstance(v, list):
            return [script for script in v if script]
        return []

class CampaignCreate(CampaignBase):
    pass

class CampaignUpdate(BaseModel):
    name: Optional[str] = None
    service: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    status: Optional[str] = None
    asset_numbers: Optional[List[str]] = None
    scripts: Optional[List[Dict[str, Any]]] = None
    # Asset numbers the admin uploaded DURING this edit session. Lets a
    # re-upload of assets already on the drive be tagged admin-added (the
    # drive's asset list itself stays deduplicated as before).
    admin_entered_assets: Optional[List[str]] = None

class DriveMetaUpsert(BaseModel):
    """Create/update payload for the separate drive-meta table (modal edits)."""
    display_name: Optional[str] = None
    data_start_date: Optional[datetime] = None
    data_end_date: Optional[datetime] = None
    drive_remark: Optional[str] = None


class DriveMetaResponse(BaseModel):
    id: int
    campaign_id: int
    display_name: Optional[str] = None
    data_start_date: Optional[datetime] = None
    data_end_date: Optional[datetime] = None
    drive_remark: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class CampaignResponse(CampaignBase):
    id: int
    asset_numbers: List[str] = []
    invalid_asset_numbers: List[str] = []
    admin_asset_numbers: List[str] = []
    scripts: List[Dict[str, Any]] = []
    created_at: datetime
    updated_at: datetime

    # Drives created before the admin-added column existed hold NULL there
    @validator('admin_asset_numbers', 'invalid_asset_numbers', pre=True, always=True)
    def default_empty_list(cls, v):
        return v if isinstance(v, list) else []

    class Config:
        from_attributes = True

# Response model for asset validation
class AssetValidationResponse(BaseModel):
    valid_assets: List[str]
    invalid_assets: List[str]
    total_valid: int
    total_invalid: int

class RecipientRule(BaseModel):
    """One To/CC rule for a set of branch codes + optional GOEM filter(s)."""
    branch_codes: List[str] = []      # empty = applies to all remaining/unmatched branches
    goem_oems: List[str] = []         # empty = all GOEMs; can contain one or more GOEMs
    to_emails: List[str] = []
    cc_emails: List[str] = []

    @field_validator('goem_oems', mode='before')
    @classmethod
    def _goems_none_to_list(cls, v):
        # backward compatible: accept an old single goem_oem string too
        if v is None:
            return []
        if isinstance(v, str):
            return [v] if v.strip() else []
        return [str(g).strip() for g in v if g and str(g).strip()]

    @field_validator('to_emails', 'cc_emails', mode='before')
    @classmethod
    def _validate_emails(cls, v):
        import re
        pattern = r'^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$'
        if not v:
            return []
        errors = [e for e in v if e and not re.match(pattern, str(e).strip())]
        if errors:
            raise ValueError(f"Invalid email(s): {', '.join(errors)}")
        return [e.strip().lower() for e in v if e and str(e).strip()]


class LetterFormatBase(BaseModel):
    format_type_name: str
    products: List[str] = []
    reference_no: Optional[str] = None
    serial_start: Optional[str] = '1'
    expiry_date: Optional[datetime] = None
    note: Optional[str] = None
    default_attachments: List[Dict[str, Any]] = []
    customer_detail_fields: List[str] = []
    engagement_detail_fields: List[str] = []
    default_recipients: List[Dict[str, Any]] = []
    subject: Optional[str] = None
    start_para: Optional[str] = None
    end_para: Optional[str] = None
    signature_para: Optional[str] = None
    editable_fields: Optional[Dict[str, Any]] = None
    use_model_attachments: Optional[bool] = False
    include_service_cycle: Optional[bool] = False
    service_cycle_intro: Optional[str] = None
    service_cycle_rows: Optional[List[Dict[str, Any]]] = []

    @field_validator("products", mode="before")
    @classmethod
    def _products_none_to_list(cls, v):
        return v or []

    @field_validator("customer_detail_fields", mode="before")
    @classmethod
    def _customer_fields_none_to_list(cls, v):
        return v or []

    @field_validator("engagement_detail_fields", mode="before")
    @classmethod
    def _engagement_fields_none_to_list(cls, v):
        return v or []

    @field_validator("default_recipients", mode="before")
    @classmethod
    def _recipients_none_to_list(cls, v):
        return v or []


class LetterFormatCreate(LetterFormatBase):
    pass


class LetterFormatUpdate(BaseModel):
    format_type_name: Optional[str] = None
    products: Optional[List[str]] = None
    reference_no: Optional[str] = None
    serial_start: Optional[str] = None
    expiry_date: Optional[datetime] = None
    note: Optional[str] = None
    default_attachments: Optional[List[Dict[str, Any]]] = None
    customer_detail_fields: Optional[List[str]] = None
    engagement_detail_fields: Optional[List[str]] = None
    default_recipients: Optional[List[Dict[str, Any]]] = None
    subject: Optional[str] = None
    start_para: Optional[str] = None
    end_para: Optional[str] = None
    signature_para: Optional[str] = None
    editable_fields: Optional[Dict[str, Any]] = None
    use_model_attachments: Optional[bool] = False
    include_service_cycle: Optional[bool] = False
    service_cycle_intro: Optional[str] = None
    service_cycle_rows: Optional[List[Dict[str, Any]]] = []


class LetterFormatResponse(LetterFormatBase):
    id: int
    created_by_id: Optional[str] = None
    created_by_name: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ==================== Branch Email Master ====================

class BranchEmailEntry(BaseModel):
    """Single branch email entry for bulk save payload (multi-email)."""
    branch_code: str
    branch_name: str
    emails: List[str] = []
    email: Optional[str] = None      # kept for backward compatibility

    @field_validator('emails', mode='before')
    @classmethod
    def validate_emails(cls, v):
        if not v:
            return []
        import re
        pattern = r'^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$'
        cleaned = []
        for e in v:
            if not e or not str(e).strip():
                continue
            e2 = str(e).strip()
            if not re.match(pattern, e2):
                raise ValueError(f"'{e2}' is not a valid email address")
            cleaned.append(e2.lower())
        return cleaned

    @field_validator('email', mode='before')
    @classmethod
    def validate_email(cls, v):
        if v is None or str(v).strip() == '':
            return None
        return str(v).strip().lower()

    @field_validator('branch_code', mode='before')
    @classmethod
    def validate_branch_code(cls, v):
        if not v or not str(v).strip():
            raise ValueError("branch_code is required")
        return str(v).strip()


class BranchEmailBulkSave(BaseModel):
    """Payload for bulk upsert of branch emails."""
    entries: List[BranchEmailEntry]


class BranchEmailResponse(BaseModel):
    id: int
    branch_code: str
    branch_name: str
    emails: List[str] = []
    email: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    @field_validator('emails', mode='before')
    @classmethod
    def _emails_none_to_list(cls, v):
        return v or []

    class Config:
        from_attributes = True


class BranchEmailBulkSaveResponse(BaseModel):
    saved: int
    errors: List[Dict[str, Any]] = []    