from pydantic import BaseModel, Field, validator
from typing import Optional, List
from datetime import datetime
from enum import Enum

class UserRole(str, Enum):
    MASTER_ADMIN = "master_admin"
    IT_ADMIN = "it_admin"
    BRANCH_ADMIN = "branch_admin"
    EMPLOYEE = "employee"

class UserBase(BaseModel):
    name: str
    user_id: str
    branch: str  # Branch code for authentication
    branch_name: Optional[str] = None  # Field for full branch name
    role: UserRole = UserRole.EMPLOYEE

class UserCreate(UserBase):
    password: str
    is_blocked: bool = False
    can_export: bool = False
    can_access_expense: bool = False
    mobile_number: Optional[str] = None  # ADDED: Mobile number field
    
    @validator('user_id')
    def validate_user_id(cls, v):
        if len(v) < 8:
            raise ValueError('User ID must be at least 8 characters long')
        return v
    
    @validator('password')
    def validate_password(cls, v):
        if len(v) < 6:
            raise ValueError('Password must be at least 6 characters long')
        if len(v) > 72:
            raise ValueError('Password must not exceed 72 characters')
        return v
    
    @validator('mobile_number')
    def validate_mobile_number(cls, v):
        if v:
            # Remove any non-digit characters
            cleaned = ''.join(filter(str.isdigit, v))
            if len(cleaned) < 10 or len(cleaned) > 15:
                raise ValueError('Mobile number must be between 10 and 15 digits')
        return v

class UserUpdate(BaseModel):
    name: Optional[str] = None
    branch: Optional[str] = None
    branch_name: Optional[str] = None
    mobile_number: Optional[str] = None  # ADDED: Mobile number field
    password: Optional[str] = None
    role: Optional[UserRole] = None
    is_blocked: Optional[bool] = None
    can_export: Optional[bool] = None
    can_access_expense: Optional[bool] = None
    
    @validator('password')
    def validate_password(cls, v):
        if v and len(v) > 72:
            raise ValueError('Password must not exceed 72 characters')
        return v
    
    @validator('mobile_number')
    def validate_mobile_number(cls, v):
        if v:
            # Remove any non-digit characters
            cleaned = ''.join(filter(str.isdigit, v))
            if len(cleaned) < 10 or len(cleaned) > 15:
                raise ValueError('Mobile number must be between 10 and 15 digits')
        return v

class UserProfileUpdate(BaseModel):
    name: Optional[str] = None
    branch: Optional[str] = None
    branch_name: Optional[str] = None
    mobile_number: Optional[str] = None  # ADDED: Mobile number field for profile update
    password: Optional[str] = None
    
    @validator('password')
    def validate_password(cls, v):
        if v and len(v) > 72:
            raise ValueError('Password must not exceed 72 characters')
        return v
    
    @validator('mobile_number')
    def validate_mobile_number(cls, v):
        if v:
            # Remove any non-digit characters
            cleaned = ''.join(filter(str.isdigit, v))
            if len(cleaned) < 10 or len(cleaned) > 15:
                raise ValueError('Mobile number must be between 10 and 15 digits')
        return v

class UserInDB(UserBase):
    id: int
    is_blocked: bool
    can_export: bool
    can_access_expense: bool = False
    mobile_number: Optional[str] = None  # ADDED: Mobile number field
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class UserLogin(BaseModel):
    user_id: str
    password: str

class UserResponse(BaseModel):
    success: bool
    message: str
    user: Optional[dict] = None

class UserRoleUpdate(BaseModel):
    role: UserRole

class BulkUserCreate(BaseModel):
    """Schema for bulk user creation/update - used for importing multiple users"""
    name: str
    user_id: str
    branch: str
    branch_name: str
    mobile_number: Optional[str] = None  # ADDED: Mobile number field (Sim Number from Excel)
    password: str = "12345678"  # Default password if not provided
    role: str = "employee"
    is_blocked: bool = False
    can_export: bool = False
    
    @validator('user_id')
    def validate_user_id(cls, v):
        if len(v) < 8:
            raise ValueError('User ID must be at least 8 characters long')
        return v
    
    @validator('password')
    def validate_password(cls, v):
        if v and len(v) < 6:
            raise ValueError('Password must be at least 6 characters long')
        if v and len(v) > 72:
            raise ValueError('Password must not exceed 72 characters')
        return v
    
    @validator('role')
    def validate_role(cls, v):
        valid_roles = ['master_admin', 'it_admin', 'branch_admin', 'employee']
        if v not in valid_roles:
            raise ValueError(f'Role must be one of: {", ".join(valid_roles)}')
        return v
    
    @validator('mobile_number')
    def validate_mobile_number(cls, v):
        if v:
            # Remove any non-digit characters
            cleaned = ''.join(filter(str.isdigit, v))
            if len(cleaned) < 10 or len(cleaned) > 15:
                raise ValueError('Mobile number must be between 10 and 15 digits')
        return v

class BulkUserCreateList(BaseModel):
    """Schema for bulk user creation list"""
    users: List[BulkUserCreate]

class BulkImportResponse(BaseModel):
    """Response schema for bulk import operation"""
    success: bool
    message: str
    created_count: int
    updated_count: int
    error_count: int
    errors: Optional[List[str]] = None

# ===== Multi-branch access schemas =====

class BranchAccessOut(BaseModel):
    """Returned to the frontend for each branch a user can access."""
    id: int
    branch: str
    branch_name: str
    is_primary: bool

    class Config:
        from_attributes = True


class BranchAccessAdd(BaseModel):
    """Payload when master/IT admin grants a new branch to a user."""
    branch: str
    branch_name: str
    is_primary: Optional[bool] = False

    @validator('branch')
    def validate_branch(cls, v):
        if not v or not v.strip():
            raise ValueError('Branch code is required')
        return v.strip()

    @validator('branch_name')
    def validate_branch_name(cls, v):
        if not v or not v.strip():
            raise ValueError('Branch name is required')
        return v.strip()


class SwitchPrimaryBranch(BaseModel):
    """Payload when changing which branch is the primary/parent for a user."""
    branch: str

    @validator('branch')
    def validate_branch(cls, v):
        if not v or not v.strip():
            raise ValueError('Branch code is required')
        return v.strip()    