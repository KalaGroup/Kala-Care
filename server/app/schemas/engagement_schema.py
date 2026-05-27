from pydantic import BaseModel, validator
from typing import Optional, List, Dict, Any
from datetime import datetime

# ==================== Follow-up Schemas ====================

class FollowUpBase(BaseModel):
    followup_date: Optional[datetime] = None
    campaign_id: int  # Single campaign ID
    followup_by: Optional[str] = None  # call, message, email
    followup_flag: Optional[str] = None  # C1, C2, C3, C4
    followup_remark: Optional[str] = None
    status: Optional[str] = "pending"  # pending, wip, completed, rejected
    next_followup_date: Optional[datetime] = None
    quotation_sent: Optional[bool] = False
    quotation_no: Optional[str] = None
    quotation_value: Optional[float] = None
    activity_id: Optional[int] = None
    rr_id: Optional[int] = None

    @validator('followup_date', 'next_followup_date', pre=True, always=True)
    def parse_dates(cls, value):
        if value is None or value == '':
            return None
        if isinstance(value, datetime):
            return value
        try:
            return datetime.fromisoformat(value.replace('Z', '+00:00'))
        except:
            return None

class FollowUpCreate(FollowUpBase):
    user_id: str
    user_name: str

class FollowUpUpdate(FollowUpBase):
    user_id: Optional[str] = None
    user_name: Optional[str] = None

class FollowUp(FollowUpBase):
    id: int
    customer_id: int
    user_id: str
    user_name: str
    campaign_name: Optional[str] = None
    campaign_color: Optional[str] = None
    activity_content: Optional[str] = None
    rr_content: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

# ==================== Activity & RR Schemas ====================

class ActivityBase(BaseModel):
    content: str

class ActivityCreate(ActivityBase):
    pass

class ActivityUpdate(ActivityBase):
    pass

class Activity(ActivityBase):
    id: int
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class RRBase(BaseModel):
    content: str

class RRCreate(RRBase):
    pass

class RRUpdate(RRBase):
    pass

class RR(RRBase):
    id: int
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

# ==================== Customer Engagement List Schemas ====================

class CampaignCheckmarks(BaseModel):
    campaign_name: str
    is_in_campaign: bool

class FollowupFlags(BaseModel):
    C1: bool
    C2: bool
    C3: bool
    C4: bool

class CustomerEngagementItem(BaseModel):
    sr_no: int
    customer_id: int
    instance_id: Optional[str] = None
    customer_name: str
    contact_person: str
    mobile: str
    email: str
    campaigns: List[str]
    campaign_checkmarks: Dict[str, bool]
    followup_flags: FollowupFlags
    last_followup_date: Optional[datetime] = None
    next_followup_date: Optional[datetime] = None
    last_followup_remark: Optional[str] = None

    class Config:
        from_attributes = True

class CustomerEngagementResponse(BaseModel):
    from_date: Optional[str] = None
    to_date: Optional[str] = None
    active_campaigns: List[str]
    customers: List[CustomerEngagementItem]
    total_count: Optional[int] = None

# ==================== Customer Details with Follow-ups ====================

class CustomerServiceInfo(BaseModel):
    id: int
    instance_id: Optional[str] = None
    last_closed_sr_number: Optional[str] = None
    last_sr_type: Optional[str] = None
    last_sr_close_date: Optional[datetime] = None
    last_oil_change_date: Optional[datetime] = None
    last_service_hrs: Optional[str] = None
    account_name: Optional[str] = None
    engine_serial_no: Optional[str] = None
    
    class Config:
        from_attributes = True

class LMSDataInfo(BaseModel):
    id: int
    instance_id: Optional[str] = None
    product_list: Optional[str] = None
    product_type: Optional[str] = None
    lead_status: Optional[str] = None
    kva_rating: Optional[str] = None
    service_engineer_name: Optional[str] = None
    tele_caller_name: Optional[str] = None
    quotation_number: Optional[str] = None
    quotation_submit_date: Optional[datetime] = None
    quotation_approval_date: Optional[datetime] = None
    order_number: Optional[str] = None
    
    class Config:
        from_attributes = True

class ScriptInfo(BaseModel):
    type: str  # 'text' or 'pdf'
    name: Optional[str] = None
    content: Optional[str] = None

class CustomerCampaignInfo(BaseModel):
    id: int
    name: str
    service: str
    description: Optional[str] = None
    color: Optional[str] = "#71C9CE"
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    scripts: Optional[List[ScriptInfo]] = []

    class Config:
        from_attributes = True

class CampaignMembershipInfo(BaseModel):
    id: int
    name: str
    color: str
    is_member: bool

class CustomerDetailsResponse(BaseModel):
    customer: Dict[str, Any]
    followups: List[FollowUp]
    services: List[CustomerServiceInfo]
    lms_data: List[LMSDataInfo]
    campaigns: List[CustomerCampaignInfo]
    all_campaigns: Optional[List[CampaignMembershipInfo]] = None

    class Config:
        from_attributes = True

# ==================== Message Response ====================

class MessageResponse(BaseModel):
    message: str
    
    class Config:
        from_attributes = True

class NonFollowUpCreate(BaseModel):
    """Schema for creating a non-follow-up (other type)"""
    campaign_id: Optional[int] = None  # Make it optional, default None
    followup_by: str = "call"
    status: str = "wip"
    service: Optional[str] = None
    followup_flag: Optional[str] = None
    next_followup_date: Optional[datetime] = None
    quotation_sent: bool = False
    quotation_no: Optional[str] = None
    quotation_value: Optional[float] = None
    activity_id: Optional[int] = None
    rr_id: Optional[int] = None
    user_id: str
    user_name: Optional[str] = None
    remark_type: str = "other"
    followup_remark: Optional[str] = None  # Add this field

    class Config:
        from_attributes = True
        
class NonFollowUpUpdate(BaseModel):
    """Schema for updating a non-follow-up"""
    followup_by: Optional[str] = None
    followup_remark: Optional[str] = None
    status: Optional[str] = None
    followup_flag: Optional[str] = None
    next_followup_date: Optional[datetime] = None
    quotation_sent: Optional[bool] = None
    quotation_no: Optional[str] = None
    quotation_value: Optional[float] = None
    activity_id: Optional[int] = None
    rr_id: Optional[int] = None

    class Config:
        from_attributes = True


class NonFollowUpResponse(BaseModel):
    """Schema for non-follow-up response"""
    id: int
    customer_id: int
    customer_instance_id: Optional[str] = None
    campaign_id: int
    user_id: str
    user_name: Optional[str] = None
    followup_date: datetime
    followup_by: str
    followup_remark: Optional[str] = None
    status: str
    remark_type: str
    followup_flag: Optional[str] = None
    next_followup_date: Optional[datetime] = None
    quotation_sent: bool = False
    quotation_no: Optional[str] = None
    quotation_value: Optional[float] = None
    activity_id: Optional[int] = None
    rr_id: Optional[int] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    campaign_name: Optional[str] = None
    campaign_color: Optional[str] = None
    activity_content: Optional[str] = None
    rr_content: Optional[str] = None

    class Config:
        from_attributes = True        