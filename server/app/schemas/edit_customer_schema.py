from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

class CustomerEditHistoryBase(BaseModel):
    customer_id: int
    instance_id: Optional[str] = None
    
    # Original data fields
    original_customer_name: Optional[str] = None
    original_phone_number: Optional[str] = None
    original_email: Optional[str] = None
    original_pan_number: Optional[str] = None
    original_location: Optional[str] = None
    
    # Edited data fields
    edited_customer_name: Optional[str] = None
    edited_phone_number: Optional[str] = None
    edited_email: Optional[str] = None
    edited_pan_number: Optional[str] = None
    edited_location: Optional[str] = None
    
    # User information
    user_id: str
    user_name: str

class CustomerEditHistoryCreate(CustomerEditHistoryBase):
    pass

class CustomerEditHistoryResponse(BaseModel):
    id: int
    customer_id: int
    instance_id: Optional[str]
    
    # Original data
    original_customer_name: Optional[str]
    original_phone_number: Optional[str]
    original_email: Optional[str]
    original_pan_number: Optional[str]
    original_location: Optional[str]
    
    # Edited data
    edited_customer_name: Optional[str]
    edited_phone_number: Optional[str]
    edited_email: Optional[str]
    edited_pan_number: Optional[str]
    edited_location: Optional[str]
    
    user_id: str
    user_name: str
    created_at: datetime
    last_edited_at: datetime
    edit_count: int
    
    class Config:
        from_attributes = True

class CustomerEditRequest(BaseModel):
    customer_name: Optional[str] = None
    phone_number: Optional[str] = None
    email: Optional[str] = None
    pan_number: Optional[str] = None
    location: Optional[str] = None
    user_id: str
    user_name: str

class CustomerEditHistoryList(BaseModel):
    total: int
    page: int
    limit: int
    items: List[CustomerEditHistoryResponse]

class CustomerWithEditHistoryResponse(BaseModel):
    original_customer: dict
    current_edited_data: Optional[dict]
    edit_history: List[CustomerEditHistoryResponse]
    last_edited_by: Optional[dict]
    last_edited_at: Optional[datetime]
    total_edits: int