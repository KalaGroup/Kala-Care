from sqlalchemy import Column, String, DateTime, Text, Integer, Boolean, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.mysql import INTEGER, VARCHAR, TEXT, DATETIME, BOOLEAN, JSON as MySQLJSON
from app.database import Base
import datetime

class Campaign(Base):
    __tablename__ = "campaigns"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    service = Column(String(100), nullable=False)
    description = Column(Text)
    color = Column(String(50), default="#000000")
    start_date = Column(DateTime, nullable=True)
    end_date = Column(DateTime, nullable=True)
    status = Column(String(50), default='active')  # active, inactive

     # User tracking fields - only id and name as requested
    created_by_id = Column(String(100), nullable=True)  # User ID from localStorage
    created_by_name = Column(String(255), nullable=True)  # User name from localStorage
    
    # Store asset numbers as JSON array
    asset_numbers = Column(JSON, default=[])  # e.g., ["100746690", "100769220", ...]
    invalid_asset_numbers = Column(JSON, default=[])  # Asset numbers not found in customers table

    # Store PDF scripts as JSON array (each script can be text or PDF metadata)
    scripts = Column(JSON, default=[])  # e.g., [{"name": "script1.pdf", "content": "base64..."}, ...]
    
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)


class CampaignCSPInfo(Base):
    __tablename__ = "campaign_csp_info"

    id = Column(Integer, primary_key=True, index=True)
    campaign_id = Column(Integer, nullable=True, index=True)

    zone_name = Column(String(255), nullable=True)
    sd_id = Column(String(100), nullable=True)
    sd_name = Column(String(255), nullable=True)
    branch_id = Column(String(100), nullable=True)
    branch_name = Column(String(255), nullable=True)
    goem_oem = Column(String(255), nullable=True)
    sr_number = Column(String(100), nullable=True)
    sr_open_date = Column(String(100), nullable=True)
    sr_close_date = Column(String(100), nullable=True)
    sr_type = Column(String(100), nullable=True, index=True)
    sr_subtype = Column(String(100), nullable=True)
    sr_status = Column(String(100), nullable=True)
    segment = Column(String(255), nullable=True)
    product_segment = Column(String(255), nullable=True)
    instance_id = Column(String(100), nullable=True, index=True)
    application_code = Column(String(100), nullable=True)
    engine_serial_number = Column(String(255), nullable=True)
    account_name = Column(String(255), nullable=True)
    customer_name = Column(String(255), nullable=True)
    customer_phone_number = Column(String(100), nullable=True)
    sr_installation_site_address = Column(Text, nullable=True)
    oil_change_flag = Column(String(50), nullable=True)
    created_by_id = Column(String(100), nullable=True, index=True)
    created_by_name = Column(String(255), nullable=True)

    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)


class CampaignService(Base):
    __tablename__ = "campaign_services"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False)
    description = Column(Text)
    
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

class CampaignLetterFormat(Base):
    __tablename__ = "campaign_letter_formats"

    id = Column(Integer, primary_key=True, index=True)
    format_type_name = Column(String(255), nullable=False)

    products = Column(JSON, default=[])                 # e.g. ["Battery", "Oil"] - one or more products for this letter type
    reference_no = Column(String(255), nullable=True)   # e.g. "KCGL/26-27/Battery,Oil/BranchCode/serial no"
    serial_start = Column(String(50), nullable=True, default='1')   # starting serial number for letters
    expiry_date = Column(DateTime, nullable=True)       # date after which this format should not be used (optional)
    note = Column(Text, nullable=True)                  # optional internal note about this format

    default_attachments = Column(JSON, default=[])      # [{"name","content","type","size"}, ...]

    customer_detail_fields = Column(JSON, default=[])   # e.g. ["instance_id", "account_name", ...]
    engagement_detail_fields = Column(JSON, default=[]) # e.g. ["followup_history", "quotation_history", ...]

    # Default To/CC recipients per branch + GOEM filter
    # Structure: [
    #   {
    #     "branch_codes": ["420435_1", "420435_2"],  # [] means applies to all remaining
    #     "goem_oems": ["CUMMINS", "ASHOK LEYLAND"], # [] means all GOEMs (one or more)
    #     "to_emails": ["a@b.com"],
    #     "cc_emails": ["c@d.com"]
    #   }, ...
    # ]
    default_recipients = Column(JSON, default=[])

    start_para = Column(Text, nullable=True)            # opening paragraph of the letter
    end_para = Column(Text, nullable=True)              # closing paragraph of the letter

    created_by_id = Column(String(100), nullable=True)
    created_by_name = Column(String(255), nullable=True)

    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

class CampaignDriveMeta(Base):
    """
    Editable Drive-List-Info fields kept SEPARATE from the campaigns table.
    Editing these NEVER touches the real Campaign record. One row per drive.
    """
    __tablename__ = "campaign_drive_meta"

    id = Column(Integer, primary_key=True, index=True)
    campaign_id = Column(Integer, nullable=False, unique=True, index=True)  # one row per drive

    display_name = Column(String(255), nullable=True)   # display-only name override (NOT the real drive name)
    data_start_date = Column(DateTime, nullable=True)   # Drive Data Duration — start
    data_end_date = Column(DateTime, nullable=True)     # Drive Data Duration — end
    drive_remark = Column(Text, nullable=True)          # free-text remark

    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)


class BranchEmailMaster(Base):
    """
    Stores one email address per branch code.
    branch_code is unique — upsert on save.
    """
    __tablename__ = "branch_email_master"

    id = Column(Integer, primary_key=True, index=True)
    branch_code = Column(String(50), nullable=False, unique=True, index=True)
    branch_name = Column(String(255), nullable=False)
    email = Column(String(255), nullable=True)          # kept for backward compatibility (first email)
    emails = Column(JSON, default=[])                   # list of emails per branch (multi-email)

    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)        
