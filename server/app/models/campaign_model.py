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
