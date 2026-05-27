from pydantic import BaseModel, Field, validator
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

class CampaignResponse(CampaignBase):
    id: int
    asset_numbers: List[str] = []
    invalid_asset_numbers: List[str] = []
    scripts: List[Dict[str, Any]] = []
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

# Response model for asset validation
class AssetValidationResponse(BaseModel):
    valid_assets: List[str]
    invalid_assets: List[str]
    total_valid: int
    total_invalid: int