from sqlalchemy import Column, String, DateTime, Text, Integer, Float, Boolean, Index
from app.database import Base
from sqlalchemy.orm import relationship
import datetime
from app.time_utils import now_ist

class Customer(Base):
    __tablename__ = "customers"
    
    id = Column(Integer, primary_key=True, index=True)
    instance_id = Column(String(100), unique=True, index=True, nullable=False)
    
    # Customer Details table fields
    customer_name = Column(String(500), nullable=True)  # Increased size
    phone_number = Column(String(50), nullable=True)
    email = Column(String(500), nullable=True)  # Increased size
    location = Column(String(1000), nullable=True)  # Increased size
    branch_id = Column(String(100), nullable=True)
    
    last_updated_by = Column(String(100), nullable=True) 

    followups = relationship("FollowUp", back_populates="customer", cascade="all, delete-orphan")
    
    created_at = Column(DateTime, default=now_ist)
    updated_at = Column(DateTime, default=now_ist, onupdate=now_ist)


class AMCAgreement(Base):
    __tablename__ = "amc_agreements"
    
    id = Column(Integer, primary_key=True, index=True)
    instance_id = Column(String(100), index=True, nullable=True)
    
    # All columns with increased sizes
    zone_name = Column(String(200), nullable=True)
    sd_id = Column(String(100), nullable=True)
    sd_name = Column(String(500), nullable=True)
    branch_id = Column(String(100), nullable=True)
    branch_name = Column(String(500), nullable=True)
    segment = Column(String(200), nullable=True)
    kva_rating = Column(String(100), nullable=True)
    engine_model = Column(String(200), nullable=True)
    agreement_number = Column(String(200), nullable=True, index=True)
    number_of_agreement_years = Column(Integer, nullable=True)
    agreement_name = Column(String(500), nullable=True)
    agreement_status = Column(String(100), nullable=True)
    agreement_type = Column(String(100), nullable=True)
    agreement_created_date = Column(DateTime, nullable=True)
    agreement_start_date = Column(DateTime, nullable=True)
    agreement_end_date = Column(DateTime, nullable=True)
    agreement_product_name = Column(String(500), nullable=True)
    agreement_invoice_type = Column(String(200), nullable=True)
    commissioning_date = Column(DateTime, nullable=True)
    last_agreement_number = Column(String(200), nullable=True)
    last_agreement_no_of_years = Column(Integer, nullable=True)
    last_agreement_type = Column(String(100), nullable=True)
    last_agreement_status = Column(String(100), nullable=True)
    last_agreement_product_name = Column(String(500), nullable=True)
    last_agreement_start_date = Column(DateTime, nullable=True)
    last_agreement_end_date = Column(DateTime, nullable=True)

    # Dynamic columns: any file column not mapped above is kept as JSON {header: value}
    extra_data = Column(Text, nullable=True)

    created_at = Column(DateTime, default=now_ist)
    updated_at = Column(DateTime, default=now_ist, onupdate=now_ist)


class AssetDetailed(Base):
    __tablename__ = "asset_detailed"
    
    id = Column(Integer, primary_key=True, index=True)
    instance_id = Column(String(100), index=True, nullable=True)
    
    # All columns with increased sizes
    zone_name = Column(String(200), nullable=True)
    sd_id = Column(String(100), nullable=True)
    sd_name = Column(String(500), nullable=True)
    branch_id = Column(String(100), nullable=True)
    branch_name = Column(String(500), nullable=True)
    district = Column(String(200), nullable=True)
    asset_number = Column(String(200), nullable=True, index=True)
    commissioning_date = Column(DateTime, nullable=True)
    installation_date = Column(DateTime, nullable=True)
    goem_oem = Column(String(200), nullable=True)
    application_code = Column(String(200), nullable=True)
    emission_norm = Column(String(100), nullable=True)
    engine_serial_no = Column(String(200), nullable=True, index=True)
    engine_model = Column(String(200), nullable=True)
    account_name = Column(String(500), nullable=True)
    customer_name = Column(String(500), nullable=True)
    contact_phone_number = Column(String(50), nullable=True)
    contact_email_id = Column(String(500), nullable=True)
    warranty_expiry_date = Column(DateTime, nullable=True)
    installation_site_address = Column(Text, nullable=True)  # Using Text for long addresses
    product_segment = Column(String(200), nullable=True)
    segment = Column(String(200), nullable=True)
    customer_segment = Column(String(200), nullable=True)
    asset_operational_status = Column(String(200), nullable=True)
    krm_number = Column(String(200), nullable=True, index=True)
    krm_status = Column(String(100), nullable=True)
    krm_active_date = Column(DateTime, nullable=True)
    krm_inactive_date = Column(DateTime, nullable=True)
    krm_subscription_start_date = Column(DateTime, nullable=True)
    krm_subscription_end_date = Column(DateTime, nullable=True)
    kva_rating = Column(String(100), nullable=True)

    # Dynamic columns: any file column not mapped above is kept as JSON {header: value}
    extra_data = Column(Text, nullable=True)

    created_at = Column(DateTime, default=now_ist)
    updated_at = Column(DateTime, default=now_ist, onupdate=now_ist)


class AssetService(Base):
    __tablename__ = "oil_services"
    
    id = Column(Integer, primary_key=True, index=True)
    instance_id = Column(String(100), index=True, nullable=True)
    
    # All columns with increased sizes
    zone_name = Column(String(200), nullable=True)
    sd_id = Column(String(100), nullable=True)
    sd_name = Column(String(500), nullable=True)
    branch_id = Column(String(100), nullable=True)
    branch_name = Column(String(500), nullable=True)
    asset_number = Column(String(200), nullable=True, index=True)
    commissioning_date = Column(DateTime, nullable=True)
    product_segment = Column(String(200), nullable=True)
    application_code = Column(String(200), nullable=True)
    engine_serial_no = Column(String(200), nullable=True, index=True)
    account_name = Column(String(500), nullable=True)
    contact_phone_number = Column(String(50), nullable=True)
    last_closed_sr_number = Column(String(200), nullable=True)
    last_sr_type = Column(String(200), nullable=True)
    last_sr_subtype = Column(String(200), nullable=True)
    last_sr_close_date = Column(DateTime, nullable=True)
    last_oil_change_sr_number = Column(String(200), nullable=True)
    last_oil_change_sr_type = Column(String(200), nullable=True)
    last_oil_change_sr_sub_type = Column(String(200), nullable=True)
    last_oil_change_date = Column(DateTime, nullable=True)
    installation_site_address = Column(Text, nullable=True)
    last_service_hrs = Column(String(100), nullable=True)

    # Dynamic columns: any file column not mapped above is kept as JSON {header: value}
    extra_data = Column(Text, nullable=True)

    created_at = Column(DateTime, default=now_ist)
    updated_at = Column(DateTime, default=now_ist, onupdate=now_ist)


class AnubandhanPlusQuote(Base):
    __tablename__ = "anubandhan_plus_quotes"
    
    id = Column(Integer, primary_key=True, index=True)
    instance_id = Column(String(100), index=True, nullable=True)
    branch_id = Column(String(100), nullable=True)
    
    # All columns with increased sizes
    id_col = Column(String(100), nullable=True)
    quotation_ref_no = Column(String(200), nullable=True, index=True)
    company_name = Column(String(500), nullable=True)
    engine_no = Column(String(200), nullable=True, index=True)
    contact_person_name = Column(String(500), nullable=True)
    mobile_no = Column(String(50), nullable=True)
    email_id = Column(String(500), nullable=True)
    genset_kva = Column(String(100), nullable=True)
    zone = Column(String(200), nullable=True)
    state = Column(String(200), nullable=True)
    city = Column(String(200), nullable=True)
    location = Column(String(500), nullable=True)
    no_of_years = Column(Integer, nullable=True)
    genset_running_per_year = Column(String(100), nullable=True)
    created_date_time = Column(DateTime, nullable=True)
    status = Column(String(100), nullable=True)
    payment_type = Column(String(100), nullable=True)
    transaction_id = Column(String(200), nullable=True)
    bank_name = Column(String(500), nullable=True)
    account_no = Column(String(200), nullable=True)
    date_of_payment = Column(DateTime, nullable=True)
    payment_update_date_time = Column(DateTime, nullable=True)
    is_neft_confirm = Column(Boolean, default=False)
    is_cheque_confirm = Column(Boolean, default=False)
    cheque_deposited_address = Column(Text, nullable=True)
    cheque_given_dealership = Column(String(500), nullable=True)
    cheque_deposited = Column(String(200), nullable=True)
    cheque_to_dealer = Column(String(200), nullable=True)
    employee_name = Column(String(500), nullable=True)
    pulse_id = Column(String(200), nullable=True)
    is_invoice_sent = Column(Boolean, default=False)
    is_refund = Column(Boolean, default=False)
    agent_id = Column(String(200), nullable=True)
    quote_price = Column(Float, nullable=True)
    quotation_value_including_tax = Column(Float, nullable=True)
    name_of_agent = Column(String(500), nullable=True)
    actual_amount = Column(Float, nullable=True)
    reason_of_short_payment = Column(Text, nullable=True)
    status_updated_by_admin = Column(Text, nullable=True)  # Changed to Text for long messages
    quotation_expiry_date = Column(DateTime, nullable=True)
    is_expired = Column(Boolean, default=False)
    payment_updated_month = Column(String(50), nullable=True)
    pulse_instance_id = Column(String(200), nullable=True)
    new_price_applicable = Column(Boolean, default=False)
    quotation_type = Column(String(50), nullable=True)

    # Dynamic columns: any file column not mapped above is kept as JSON {header: value}
    extra_data = Column(Text, nullable=True)

    created_at = Column(DateTime, default=now_ist)
    updated_at = Column(DateTime, default=now_ist, onupdate=now_ist)


class AnubandhanQuote(Base):
    __tablename__ = "anubandhan_quotes"
    
    id = Column(Integer, primary_key=True, index=True)
    instance_id = Column(String(100), index=True, nullable=True)
    branch_id = Column(String(100), nullable=True)
    
    # Same as AnubandhanPlusQuote but without quotation_type
    id_col = Column(String(100), nullable=True)
    quotation_ref_no = Column(String(200), nullable=True, index=True)
    company_name = Column(String(500), nullable=True)
    engine_no = Column(String(200), nullable=True, index=True)
    contact_person_name = Column(String(500), nullable=True)
    mobile_no = Column(String(50), nullable=True)
    email_id = Column(String(500), nullable=True)
    genset_kva = Column(String(100), nullable=True)
    zone = Column(String(200), nullable=True)
    state = Column(String(200), nullable=True)
    city = Column(String(200), nullable=True)
    location = Column(String(500), nullable=True)
    no_of_years = Column(Integer, nullable=True)
    genset_running_per_year = Column(String(100), nullable=True)
    created_date_time = Column(DateTime, nullable=True)
    status = Column(String(100), nullable=True)
    payment_type = Column(String(100), nullable=True)
    transaction_id = Column(String(200), nullable=True)
    bank_name = Column(String(500), nullable=True)
    account_no = Column(String(200), nullable=True)
    date_of_payment = Column(DateTime, nullable=True)
    payment_update_date_time = Column(DateTime, nullable=True)
    is_neft_confirm = Column(Boolean, default=False)
    is_cheque_confirm = Column(Boolean, default=False)
    cheque_deposited_address = Column(Text, nullable=True)
    cheque_given_dealership = Column(String(500), nullable=True)
    cheque_deposited = Column(String(200), nullable=True)
    cheque_to_dealer = Column(String(200), nullable=True)
    employee_name = Column(String(500), nullable=True)
    pulse_id = Column(String(200), nullable=True)
    is_invoice_sent = Column(Boolean, default=False)
    is_refund = Column(Boolean, default=False)
    agent_id = Column(String(200), nullable=True)
    quote_price = Column(Float, nullable=True)
    quotation_value_including_tax = Column(Float, nullable=True)
    name_of_agent = Column(String(500), nullable=True)
    actual_amount = Column(Float, nullable=True)
    reason_of_short_payment = Column(Text, nullable=True)
    status_updated_by_admin = Column(Text, nullable=True)  # Changed to Text
    quotation_expiry_date = Column(DateTime, nullable=True)
    is_expired = Column(Boolean, default=False)
    payment_updated_month = Column(String(50), nullable=True)
    pulse_instance_id = Column(String(200), nullable=True)
    new_price_applicable = Column(Boolean, default=False)
    quotation_type = Column(String(50), nullable=True)

    # Dynamic columns: any file column not mapped above is kept as JSON {header: value}
    extra_data = Column(Text, nullable=True)

    created_at = Column(DateTime, default=now_ist)
    updated_at = Column(DateTime, default=now_ist, onupdate=now_ist)


class BandhanPlusQuote(Base):
    __tablename__ = "bandhan_plus_quotes"
    
    id = Column(Integer, primary_key=True, index=True)
    instance_id = Column(String(100), index=True, nullable=True)
    branch_id = Column(String(100), nullable=True)
    
    # Same structure as AnubandhanPlusQuote
    id_col = Column(String(100), nullable=True)
    quotation_ref_no = Column(String(200), nullable=True, index=True)
    company_name = Column(String(500), nullable=True)
    engine_no = Column(String(200), nullable=True, index=True)
    contact_person_name = Column(String(500), nullable=True)
    mobile_no = Column(String(50), nullable=True)
    email_id = Column(String(500), nullable=True)
    genset_kva = Column(String(100), nullable=True)
    zone = Column(String(200), nullable=True)
    state = Column(String(200), nullable=True)
    city = Column(String(200), nullable=True)
    location = Column(String(500), nullable=True)
    no_of_years = Column(Integer, nullable=True)
    genset_running_per_year = Column(String(100), nullable=True)
    created_date_time = Column(DateTime, nullable=True)
    status = Column(String(100), nullable=True)
    payment_type = Column(String(100), nullable=True)
    transaction_id = Column(String(200), nullable=True)
    bank_name = Column(String(500), nullable=True)
    account_no = Column(String(200), nullable=True)
    date_of_payment = Column(DateTime, nullable=True)
    payment_update_date_time = Column(DateTime, nullable=True)
    is_neft_confirm = Column(Boolean, default=False)
    is_cheque_confirm = Column(Boolean, default=False)
    cheque_deposited_address = Column(Text, nullable=True)
    cheque_given_dealership = Column(String(500), nullable=True)
    cheque_deposited = Column(String(200), nullable=True)
    cheque_to_dealer = Column(String(200), nullable=True)
    employee_name = Column(String(500), nullable=True)
    pulse_id = Column(String(200), nullable=True)
    is_invoice_sent = Column(Boolean, default=False)
    is_refund = Column(Boolean, default=False)
    agent_id = Column(String(200), nullable=True)
    quote_price = Column(Float, nullable=True)
    quotation_value_including_tax = Column(Float, nullable=True)
    name_of_agent = Column(String(500), nullable=True)
    actual_amount = Column(Float, nullable=True)
    reason_of_short_payment = Column(Text, nullable=True)
    status_updated_by_admin = Column(Text, nullable=True)  # Changed to Text
    quotation_expiry_date = Column(DateTime, nullable=True)
    is_expired = Column(Boolean, default=False)
    payment_updated_month = Column(String(50), nullable=True)
    pulse_instance_id = Column(String(200), nullable=True)
    new_price_applicable = Column(Boolean, default=False)
    quotation_type = Column(String(50), nullable=True)

    # Dynamic columns: any file column not mapped above is kept as JSON {header: value}
    extra_data = Column(Text, nullable=True)

    created_at = Column(DateTime, default=now_ist)
    updated_at = Column(DateTime, default=now_ist, onupdate=now_ist)


class PulseQuotation(Base):
    """'Pulse Quotation - Service Only' import - ONE ROW PER QUOTATION.

    The record key is the pair Instance Id + Quote ID. It was the Instance Id
    alone until 2026-08-27, which stored a single quotation per genset and
    discarded the rest; the Open Quotation Tracker counts quotations, so the
    grain had to be the quotation. Rows come back newest first, so the [0] the
    Drive pages read is now the genset's LATEST quote.

    service_dealer / labor_amount / parts_amount are the three columns that
    report's quote half is built from: the dealer string carries the branch
    (this file has no branch id column at all), and a row counts as a labour
    quote when labor_amount > 0 and as a part quote when parts_amount > 0."""
    __tablename__ = "pulse_quotations"
    
    id = Column(Integer, primary_key=True, index=True)
    instance_id = Column(String(100), index=True, nullable=True)
    branch_id = Column(String(100), nullable=True)
    
    # All columns with increased sizes
    creation_date = Column(DateTime, nullable=True)
    quote_id = Column(String(200), nullable=True, index=True)
    first_level_observations = Column(Text, nullable=True)
    quote_status = Column(String(100), nullable=True)
    sr_type = Column(String(200), nullable=True)
    sr_sub_type = Column(String(200), nullable=True)
    instance_id_col = Column(String(200), nullable=True)
    account = Column(String(500), nullable=True)
    bill_to_address = Column(Text, nullable=True)
    ship_to_address = Column(Text, nullable=True)
    first_name = Column(String(200), nullable=True)
    last_name = Column(String(200), nullable=True)
    contact_phone_number = Column(String(50), nullable=True)
    installation_site_address = Column(Text, nullable=True)
    contact_primary_email = Column(String(500), nullable=True)
    service_dealer = Column(String(500), nullable=True)
    labor_amount = Column(Float, nullable=True)
    parts_amount = Column(Float, nullable=True)
    total_amount = Column(Float, nullable=True)
    prepared_by = Column(String(500), nullable=True)
    recommended_by = Column(String(500), nullable=True)
    finance_company_address = Column(Text, nullable=True)
    account_number = Column(String(200), nullable=True)
    purpose_of_quotation = Column(Text, nullable=True)
    sr_number = Column(String(200), nullable=True)
    quote_revised_flag = Column(Boolean, default=False)
    quote_submitted_date = Column(DateTime, nullable=True)
    exception_enquiry_no = Column(String(200), nullable=True)
    lead_no = Column(String(200), nullable=True)
    quotation_lead_assigned_name = Column(String(500), nullable=True)
    quotation_lead_assigned_job_title = Column(String(500), nullable=True)
    quotation_lead_assigned_phone = Column(String(50), nullable=True)
    quotation_lead_assigned_uid = Column(String(200), nullable=True)

    # Dynamic columns: any file column not mapped above is kept as JSON {header: value}
    extra_data = Column(Text, nullable=True)

    created_at = Column(DateTime, default=now_ist)
    updated_at = Column(DateTime, default=now_ist, onupdate=now_ist)


class RegularBandhan(Base):
    """NEW format (quote-style export). Matching is by 'Pulse Instance ID' ONLY —
    one row per instance_id, first occurrence in the file wins. The file has no
    branch column, so customer branch_id is NEVER touched by this import."""
    __tablename__ = "regular_bandhan"

    id = Column(Integer, primary_key=True, index=True)
    instance_id = Column(String(100), index=True, nullable=True)
    branch_id = Column(String(100), nullable=True)

    # Same structure as AnubandhanQuote + first_pm_date / agreement_start_date
    id_col = Column(String(100), nullable=True)
    quotation_ref_no = Column(String(200), nullable=True, index=True)
    company_name = Column(String(500), nullable=True)
    engine_no = Column(String(200), nullable=True, index=True)
    contact_person_name = Column(String(500), nullable=True)
    mobile_no = Column(String(50), nullable=True)
    email_id = Column(String(500), nullable=True)
    genset_kva = Column(String(100), nullable=True)
    zone = Column(String(200), nullable=True)
    state = Column(String(200), nullable=True)
    city = Column(String(200), nullable=True)
    location = Column(String(500), nullable=True)
    no_of_years = Column(Integer, nullable=True)
    genset_running_per_year = Column(String(100), nullable=True)
    created_date_time = Column(DateTime, nullable=True)
    status = Column(String(100), nullable=True)
    payment_type = Column(String(100), nullable=True)
    transaction_id = Column(String(200), nullable=True)
    bank_name = Column(String(500), nullable=True)
    account_no = Column(String(200), nullable=True)
    date_of_payment = Column(DateTime, nullable=True)
    payment_update_date_time = Column(DateTime, nullable=True)
    is_neft_confirm = Column(Boolean, default=False)
    is_cheque_confirm = Column(Boolean, default=False)
    cheque_deposited_address = Column(Text, nullable=True)
    cheque_given_dealership = Column(String(500), nullable=True)
    cheque_deposited = Column(String(200), nullable=True)
    cheque_to_dealer = Column(String(200), nullable=True)
    employee_name = Column(String(500), nullable=True)
    pulse_id = Column(String(200), nullable=True)
    is_invoice_sent = Column(Boolean, default=False)
    is_refund = Column(Boolean, default=False)
    agent_id = Column(String(200), nullable=True)
    quote_price = Column(Float, nullable=True)
    quotation_value_including_tax = Column(Float, nullable=True)
    name_of_agent = Column(String(500), nullable=True)
    actual_amount = Column(Float, nullable=True)
    reason_of_short_payment = Column(Text, nullable=True)
    status_updated_by_admin = Column(Text, nullable=True)
    quotation_expiry_date = Column(DateTime, nullable=True)
    is_expired = Column(Boolean, default=False)
    payment_updated_month = Column(String(50), nullable=True)
    new_price_applicable = Column(Boolean, default=False)
    quotation_type = Column(String(50), nullable=True)
    first_pm_date = Column(DateTime, nullable=True)
    agreement_start_date = Column(DateTime, nullable=True)

    # Dynamic columns: any file column not mapped above is kept as JSON {header: value}
    extra_data = Column(Text, nullable=True)

    created_at = Column(DateTime, default=now_ist)
    updated_at = Column(DateTime, default=now_ist, onupdate=now_ist)


class LMSData(Base):
    __tablename__ = "lms_data"
    
    id = Column(Integer, primary_key=True, index=True)
    instance_id = Column(String(100), index=True, nullable=True)
    
    # ---- Existing columns (kept) ----
    lead_number = Column(String(200), nullable=True, index=True)
    lead_created_date = Column(DateTime, nullable=True)
    mode_of_lead_creation = Column(String(200), nullable=True)
    lead_raised_by = Column(String(500), nullable=True)
    lead_raised_for = Column(String(500), nullable=True)
    sd_name = Column(String(500), nullable=True)
    sd_id = Column(String(100), nullable=True)
    branch_name = Column(String(500), nullable=True)
    branch_id = Column(String(100), nullable=True)
    product_list = Column(String(500), nullable=True)
    product_type = Column(String(200), nullable=True)
    lead_assigned_to = Column(String(500), nullable=True)
    lead_status = Column(String(200), nullable=True)
    account_id = Column(String(200), nullable=True)
    account_name = Column(String(500), nullable=True)
    zone = Column(String(200), nullable=True)
    lead_sr_number = Column(String(200), nullable=True)
    instance_id_col = Column(String(200), nullable=True)
    engine_model = Column(String(200), nullable=True)
    kva_rating = Column(String(100), nullable=True)
    service_engineer_name = Column(String(500), nullable=True)
    tele_caller_name = Column(String(500), nullable=True)
    quotation_number = Column(String(200), nullable=True)
    quotation_submit_date = Column(DateTime, nullable=True)
    quotation_approval_date = Column(DateTime, nullable=True)
    order_number = Column(String(200), nullable=True)
    order_creation_date = Column(DateTime, nullable=True)
    
    # ---- NEW columns for the new LMS file format ----
    sr_type = Column(String(200), nullable=True)
    sr_sub_type = Column(String(200), nullable=True)
    sr_sub_type_2 = Column(String(200), nullable=True)          # second "SR Sub Type" column in file
    account_contact_number = Column(String(50), nullable=True)
    account_contact_email_id = Column(String(500), nullable=True)
    tele_caller_uid = Column(String(100), nullable=True)
    tele_caller_mobile_number = Column(String(50), nullable=True)
    enquiry_allocation_remarks = Column(Text, nullable=True)
    engine_app_code = Column(String(200), nullable=True)
    engine_serial_no = Column(String(200), nullable=True, index=True)
    pin_code = Column(String(20), nullable=True)
    segment = Column(String(200), nullable=True)
    commissioning_date = Column(DateTime, nullable=True)
    installation_site_address = Column(Text, nullable=True)
    city = Column(String(200), nullable=True)
    district = Column(String(200), nullable=True)
    state = Column(String(200), nullable=True)
    asset_contact_name = Column(String(500), nullable=True)
    asset_contact_phone_number = Column(String(50), nullable=True)
    efsr_contact_name = Column(String(500), nullable=True)
    efsr_customer_number = Column(String(100), nullable=True)
    qualifying_date = Column(DateTime, nullable=True)
    quotation_type = Column(String(200), nullable=True)
    quotation_labour_amt = Column(Float, nullable=True)
    quotation_part_amt = Column(Float, nullable=True)
    total_quote_amount = Column(Float, nullable=True)
    quotation_lead_assigned_name = Column(String(500), nullable=True)
    quotation_lead_assigned_uid = Column(String(100), nullable=True)
    quotation_lead_assigned_job_title = Column(String(500), nullable=True)
    enquiry_loss_reason = Column(Text, nullable=True)
    service_engineer_uid = Column(String(100), nullable=True)
    service_engineer_mobile_number = Column(String(50), nullable=True)
    sic_code = Column(String(200), nullable=True)
    sic_code_type = Column(String(200), nullable=True)
    labour_invoice_number = Column(String(200), nullable=True)
    labour_invoice_amount = Column(Float, nullable=True)
    part_invoice_amount = Column(Float, nullable=True)
    part_invoice_number = Column(String(200), nullable=True)
    lead_source = Column(String(200), nullable=True)
    next_action_required = Column(String(500), nullable=True)
    new_contact = Column(String(500), nullable=True)
    lead_contact_number = Column(String(50), nullable=True)
    next_action_date = Column(DateTime, nullable=True)
    lead_assign_to_sd = Column(String(500), nullable=True)

    # Dynamic columns: any file column not mapped above is kept as JSON {header: value}
    extra_data = Column(Text, nullable=True)

    created_at = Column(DateTime, default=now_ist)
    updated_at = Column(DateTime, default=now_ist, onupdate=now_ist)


class OpenSRLoadReport(Base):
    """'Open SR Load Report' import — one row per unique
    (Instance Id [Asset #], Service Request #), upserted on re-import.
    Rows are NEVER deleted or flagged by an import: every SR the file has
    ever carried stays here, so the customer's SR history survives.

    OPEN vs CLOSED is NOT stored on this row. An SR counts as CLOSED when the
    same (instance_id, sr_number) exists in MaxTTROilChangeSRZeroLabourFlag —
    that file is the closure record and every one of its rows carries a real
    SR CLOSE DATE. The SR Details box therefore lists a row here only while no
    MaxTTR row matches it (see
    CustomerController.get_open_sr_load_reports_by_instance)."""
    __tablename__ = "open_sr_load_reports"

    id = Column(Integer, primary_key=True, index=True)
    instance_id = Column(String(100), index=True, nullable=True)
    branch_id = Column(String(100), nullable=True)  
    
    # All columns from Open SR Load Report
    service_request_no = Column(String(200), nullable=True, index=True)
    sr_due_date = Column(DateTime, nullable=True)
    appointment_date = Column(DateTime, nullable=True)
    service_dealer = Column(String(500), nullable=True)
    status = Column(String(100), nullable=True)
    sr_type = Column(String(200), nullable=True)
    sr_sub_type = Column(String(200), nullable=True)
    problem_code = Column(String(200), nullable=True)
    installation_site_address = Column(Text, nullable=True)
    engine_app_code = Column(String(200), nullable=True)
    voc = Column(String(200), nullable=True)
    engine_serial_no = Column(String(200), nullable=True, index=True)
    engine_series = Column(String(200), nullable=True)
    engine_model = Column(String(200), nullable=True)
    ticket_no = Column(String(200), nullable=True)
    segment = Column(String(200), nullable=True)
    task_start_date = Column(DateTime, nullable=True)
    task_end_date = Column(DateTime, nullable=True)
    account = Column(String(500), nullable=True)
    under_monitoring_date = Column(DateTime, nullable=True)
    under_monitoring_remark = Column(Text, nullable=True)
    convert_pm_to_wet_pm_flag = Column(String(100), nullable=True)
    efsr_engineer_remarks = Column(Text, nullable=True)
    quick_ticket_sr_comments = Column(Text, nullable=True)
    actual_sr_due_date = Column(DateTime, nullable=True)
    convert_pm_to_wet_pm_flag_updated_date = Column(DateTime, nullable=True)
    convert_pm_to_wet_pm_flag_updated_by = Column(String(500), nullable=True)
    customer_name = Column(String(500), nullable=True)
    contact_last_name = Column(String(200), nullable=True)
    customer_mobile_no = Column(String(50), nullable=True)
    genset_appcode = Column(String(200), nullable=True)
    contact_name = Column(String(500), nullable=True)
    primary_phone_no = Column(String(50), nullable=True)
    mode = Column(String(100), nullable=True)
    close_date_time = Column(DateTime, nullable=True)
    special_tool = Column(String(500), nullable=True)
    special_tool_name = Column(String(500), nullable=True)
    repeat = Column(String(100), nullable=True)
    assigned_to = Column(String(500), nullable=True)
    oil_change_flg = Column(String(100), nullable=True)
    claim_created = Column(String(100), nullable=True)
    agreement_no = Column(String(200), nullable=True)
    cancellation_reason = Column(Text, nullable=True)
    csp_cancellation_reasons = Column(String(500), nullable=True)
    csp_cancellation_remarks = Column(Text, nullable=True)
    asm_ase_remarks = Column(Text, nullable=True)
    asm_ase_remarks_date = Column(DateTime, nullable=True)
    battery_charger_availability = Column(String(100), nullable=True)
    wet_pm_due_flag = Column(String(100), nullable=True)
    cap_limit_approval_remarks = Column(Text, nullable=True)
    cap_limit_deviation_remarks = Column(Text, nullable=True)
    cap_limit_deviation_status = Column(String(100), nullable=True)
    cap_limit_user_details = Column(String(500), nullable=True)
    csp_prepone_flag = Column(String(100), nullable=True)
    csp_prepone_flag_updated_by = Column(String(500), nullable=True)
    bandhan_pm_sr_closure_within_15_days_flag = Column(String(100), nullable=True)
    bandhan_pm_lock_removal_flag_updated_by = Column(String(500), nullable=True)
    bandhan_pm_lock_removal_flag_updated_date = Column(DateTime, nullable=True)
    bandhan_pm_sr_closure_90_days_max_after_pm_due_date_flag = Column(String(100), nullable=True)
    bandhan_pm_due_date_lock_removal_flag_updated_by = Column(String(500), nullable=True)
    bandhan_pm_due_date_lock_removal_flag_updated_date = Column(DateTime, nullable=True)
    bandhan_job_card_creation_prior_to_60_days_flag = Column(String(100), nullable=True)
    bandhan_pm_jc_creation_lock_removal_flag_updated_by = Column(String(500), nullable=True)
    bandhan_pm_jc_creation_lock_removal_flag_updated_date = Column(DateTime, nullable=True)
    account_id = Column(String(200), nullable=True)
    sr_created_by = Column(String(500), nullable=True)
    sr_created_date = Column(DateTime, nullable=True)
    efsr_krm_number = Column(String(200), nullable=True)
    dry_csp_approved_by = Column(String(500), nullable=True)
    dry_csp_approved_date = Column(DateTime, nullable=True)

    # Date of the last import in which this SR was still present in the file.
    # Informational only — nothing filters on it. (The is_active soft-delete
    # flag that used to sit here was removed: closure is now decided against
    # the MaxTTR file, not against "was it in the latest upload".)
    last_seen_date = Column(DateTime, nullable=True)

    # Dynamic columns: any file column not mapped above is kept as JSON {header: value}
    extra_data = Column(Text, nullable=True)

    created_at = Column(DateTime, default=now_ist)
    updated_at = Column(DateTime, default=now_ist, onupdate=now_ist)


class ResponseTimeMaxTTR(Base):
    """'Response Time & MaxTTR Details' import — ONE row per unique SR NUMBER
    (the file's primary key), upserted on re-import. The FIRST row per
    instance_id in each file also refreshes the customers table (same
    empty-safe rules as every other import). Shown on the Customer page."""
    __tablename__ = "response_time_maxttr"
    __table_args__ = (
        Index('UQ_response_time_maxttr_sr_number', 'sr_number', unique=True),
    )

    id = Column(Integer, primary_key=True, index=True)
    sr_number = Column(String(200), index=True, nullable=False)
    instance_id = Column(String(100), index=True, nullable=True)

    zone_name = Column(String(200), nullable=True)
    asm_name = Column(String(500), nullable=True)
    sd_id = Column(String(100), nullable=True)
    sd_name = Column(String(500), nullable=True)
    branch_id = Column(String(100), nullable=True)
    branch_name = Column(String(500), nullable=True)
    application_code = Column(String(200), nullable=True)
    engine_serial_no = Column(String(200), nullable=True, index=True)
    segment = Column(String(200), nullable=True)
    product_segment = Column(String(200), nullable=True)
    goem_oem = Column(String(200), nullable=True)
    account_name = Column(String(500), nullable=True)
    sr_type = Column(String(200), nullable=True)
    sr_subtype = Column(String(200), nullable=True)
    sr_open_date = Column(DateTime, nullable=True)
    sr_task_start_date = Column(DateTime, nullable=True)
    sr_task_end_date = Column(DateTime, nullable=True)
    sr_close_date = Column(DateTime, nullable=True)
    engineer_remarks = Column(Text, nullable=True)
    se_name = Column(String(500), nullable=True)
    se_ticket_num = Column(String(200), nullable=True)
    response_time_range_in_hrs = Column(String(200), nullable=True)
    response_time = Column(String(200), nullable=True)
    maxttr_on_task_closed_in_hrs = Column(String(200), nullable=True)
    maxttr_on_sr_closed_in_hrs = Column(String(200), nullable=True)

    # Dynamic columns: any file column not mapped above is kept as JSON {header: value}
    extra_data = Column(Text, nullable=True)

    created_at = Column(DateTime, default=now_ist)
    updated_at = Column(DateTime, default=now_ist, onupdate=now_ist)


class MaxTTROilChangeSRZeroLabourFlag(Base):
    """'MaxTTR - Oil Change SR Zero Labour Flag' import (was called
    'Open SR Data' / Close SR Report) — ONE row per unique
    (instance_id, sr_number) combination, upserted on re-import. Only
    instance_ids that already exist in the customers table are stored;
    surfaced in the SR Details box (CustomerEng/CustomerEng2) and Customer page.

    Renamed 2026-08-13 (class + table) from OpenSRData / open_sr_data. The
    existing table is renamed in place at startup — see the rename migration in
    performance_indexes.ensure_table_renames(). The HTTP API keeps its legacy
    path (/customers/open-sr-data) and `open_sr_data` response key so the
    already-built frontend pages keep working."""
    __tablename__ = "maxttr_oil_change_sr_zero_labour_flag"
    __table_args__ = (
        Index('UQ_maxttr_oil_change_sr_instance_sr', 'instance_id', 'sr_number', unique=True),
    )

    id = Column(Integer, primary_key=True, index=True)
    instance_id = Column(String(100), index=True, nullable=False)

    zone_name = Column(String(200), nullable=True)
    asm_name = Column(String(500), nullable=True)
    sd_id = Column(String(100), nullable=True)
    sd_name = Column(String(500), nullable=True)
    branch_id = Column(String(100), nullable=True)
    branch_name = Column(String(500), nullable=True)
    application_code = Column(String(200), nullable=True)
    engine_serial_no = Column(String(200), nullable=True, index=True)
    engine_model = Column(String(200), nullable=True)
    segment = Column(String(200), nullable=True)
    product_segment = Column(String(200), nullable=True)
    account_name = Column(String(500), nullable=True)
    sr_number = Column(String(200), nullable=True, index=True)
    sr_type = Column(String(200), nullable=True)
    sr_subtype = Column(String(200), nullable=True)
    sr_open_date = Column(DateTime, nullable=True)
    sr_close_date = Column(DateTime, nullable=True)
    mode_of_sr = Column(String(200), nullable=True)
    zero_labour_flag = Column(String(100), nullable=True)
    oil_change_flag = Column(String(100), nullable=True)
    count_of_tasks = Column(String(50), nullable=True)

    # Dynamic columns: any file column not mapped above is kept as JSON {header: value}
    extra_data = Column(Text, nullable=True)

    created_at = Column(DateTime, default=now_ist)
    updated_at = Column(DateTime, default=now_ist, onupdate=now_ist)


class CDIDetailReport(Base):
    """'CDI Detail Report' import — a STANDALONE report table: it never writes
    to the customers table or to any other import table.

    SR NUMBER is the primary key: ONE row per unique SR NUMBER, upserted on
    re-import. When the same SR NUMBER appears more than once in a file, the
    FIRST occurrence wins. Only the fixed columns below are stored in
    their own DB fields — every other column of the file is dynamic and kept
    as JSON in extra_data. Shown on the Customer page."""
    __tablename__ = "cdi_detail_report"
    __table_args__ = (
        Index('UQ_cdi_detail_report_sr_number', 'sr_number', unique=True),
    )

    id = Column(Integer, primary_key=True, index=True)
    sr_number = Column(String(200), index=True, nullable=False)

    # Relation to the customers table. The file spells it ASSET NUMBER —
    # the same genset key the Asset files store as instance_id — so a CDI
    # row belongs to a customer exactly like every other import.
    instance_id = Column(String(100), index=True, nullable=True)
    x_technician_id = Column(String(200), nullable=True, index=True)
    x_technician_name = Column(String(500), nullable=True)
    cdi_category = Column(String(200), nullable=True)
    # The account the feedback is about — this file's customer name, and what
    # the import contributes to the customer master.
    x_account_name = Column(String(500), nullable=True, index=True)
    # Who actually answered the survey. NOT the account's own contact, so it is
    # stored for reference but never written to the customer master.
    feedback_customer_name = Column(String(500), nullable=True)
    feedback_customer_number = Column(String(50), nullable=True)
    # The ERP branch the feedback belongs to. This file is the ONE PMS import
    # that carries no BRANCH ID, only the branch NAME - the Customer Delight
    # Index report resolves it back to a branch id against the names the other
    # ERP files carry (see pms_controller._branch_by_name).
    branch_name = Column(String(150), nullable=True, index=True)
    # When the feedback activity closed — the date the Employee Productivity
    # report's CDI columns are counted on.
    activity_end_date = Column(DateTime, nullable=True, index=True)
    overall_experience = Column(String(50), nullable=True)

    # Dynamic columns: any file column not mapped above is kept as JSON {header: value}
    extra_data = Column(Text, nullable=True)

    created_at = Column(DateTime, default=now_ist)
    updated_at = Column(DateTime, default=now_ist, onupdate=now_ist)


class EFSRReport(Base):
    """'EFSR Report' import — a STANDALONE report table: it never writes to the
    customers table or to any other import table.

    The key is the COMBINATION Appointment Number + Service Engineer UID +
    Task Assigned Date & Time: ONE row per unique triple, upserted on
    re-import. Only the fixed columns below are stored in their own DB fields —
    every other column of the file is dynamic and kept as JSON in extra_data.
    Shown on the Customer page.

    WHY THAT TRIPLE — the file's grain is one row per TASK ASSIGNMENT, not one
    per SR and not one per engineer-on-an-SR. Verified against the two real
    exports (11,760 and 9,929 rows): the same engineer is assigned the same
    appointment more than once (attempt 1 Cancelled, attempt 2 Completed) and
    one appointment is re-assigned between engineers. So:
      Service Request No. + UID  dropped 898 (7.6%) / 714 (7.2%) of rows, and
                                 'first wins' kept the CANCELLED attempt while
                                 deleting the COMPLETED one — 601 real closures
                                 lost in one file.
      Appointment Number alone   still dropped 91 / 7 (re-assignment).
      + Service Engineer UID     still dropped 26 / 4 (same engineer twice).
      + Task Assigned Date       0 dropped in BOTH files. <- this key.
    Service Request No. is deliberately NOT in the key: Appointment Number is
    '<SR No.>_<n>' in 100% of rows, so the SR adds no discriminating power (an
    index on it as well is identical in width and effect). It stays as a normal
    indexed column for display, search and grouping.

    Task Assigned Date is safe in a key because it is stamped when the task is
    allocated and never moves: across the 9,499 (appointment, UID) pairs present
    in BOTH exports it changed 0 times, while 108 of them GAINED a Task End Date
    — exactly the update the upsert has to land on the existing row.

    Key history: Service Request No. alone -> + Service Engineer UID
    (2026-08-13) -> Appointment Number + UID + Task Assigned Date (2026-08-20).
    Each old unique index is dropped and the new one created at startup — see
    the UQ_efsr_report_* statements in performance_indexes.py."""
    __tablename__ = "efsr_report"
    __table_args__ = (
        Index('UQ_efsr_report_appt_uid_assigned', 'appointment_number',
              'service_engineer_uid', 'task_assigned_date', unique=True),
    )

    id = Column(Integer, primary_key=True, index=True)
    service_request_no = Column(String(200), index=True, nullable=False)
    # The eFSR task/visit id, '<Service Request No.>_<n>'. The record key's
    # first column — one appointment is one dispatch of one engineer to a job.
    appointment_number = Column(String(200), index=True, nullable=True)

    # Relation to the customers table. The file carries 'Instance ID' on
    # every row; it used to fall through to extra_data as a dynamic column.
    instance_id = Column(String(100), index=True, nullable=True)

    sd_branch_code = Column(String(100), nullable=True, index=True)
    sr_type = Column(String(200), nullable=True)
    # When the SR was ALLOCATED to the engineer — the date the Employee
    # Productivity report's 'Allocate SR' column is counted on. Every row with
    # a Service Engineer UID has one, while sr_closed_date is null for the ~1/3
    # of SRs that are assigned but not closed yet.
    task_assigned_date = Column(DateTime, nullable=True, index=True)
    # When the ENGINEER finished the job. This — not sr_closed_date — is what
    # the SR Allocation report counts a closure on: an SR is closed in the back
    # office days after the task ended, and often not at all (task_end_date is
    # filled on ~2,300 rows that have no sr_closed_date).
    task_end_date = Column(DateTime, nullable=True, index=True)
    sr_closed_date = Column(DateTime, nullable=True)
    sr_status = Column(String(200), nullable=True)
    service_engineer_name = Column(String(500), nullable=True, index=True)
    service_engineer_uid = Column(String(100), nullable=True, index=True)

    # The account this task belongs to, and where the genset sits. Both are on
    # every row and are what the import contributes to the customer master.
    account = Column(String(500), nullable=True, index=True)
    installation_site_address = Column(Text, nullable=True)
    # The on-site contact for THIS visit (~80% of rows) — reference only, never
    # written to the customer master.
    customer_name = Column(String(500), nullable=True)
    customer_contact_number = Column(String(50), nullable=True)

    # Dynamic columns: any file column not mapped above is kept as JSON {header: value}
    extra_data = Column(Text, nullable=True)

    created_at = Column(DateTime, default=now_ist)
    updated_at = Column(DateTime, default=now_ist, onupdate=now_ist)


class AMCExpiryPlanner(Base):
    """'AMC Agreement Expiry Planner' import — the agreements coming up for
    renewal, one row per genset per agreement.

    LINKED to the customers table (not standalone): every row carries an
    INSTANCE ID, so the import fills the customer master's name / location /
    branch the same way the other instance-keyed files do.

    The key is the COMBINATION Instance Id + Agreement Number. Measured on the
    real 1,572-row export:
      INSTANCE ID alone       1,261 unique -> 311 rows (19.8%) lost. A genset
                              renews, so it legitimately has several agreements.
      AGREEMENT NUMBER alone  1,550 unique ->  22 rows lost. One agreement can
                              cover a FLEET: 600550273 spans 4 gensets,
                              600504669 spans 5.
      the pair                1,572 unique ->   0 rows lost.  <- this key.

    Fixed columns are the ones the app reads — Instance Id, Branch Id, Account
    Name, Installation Site Address, Agreement End Date, plus Agreement Number
    because it is half the record key. Every other column of the file (Zone
    Name, SD Id/Name, Branch Name, Agreement Name/Type/Status/Start Date,
    Number of Agreement Years, Segment, Application Code, Engine Serial No,
    Engine Model, Customer Name, Customer Phone Number, ...) is DYNAMIC and
    kept as JSON in extra_data. Shown on the Customer page."""
    __tablename__ = "amc_expiry_planner"
    __table_args__ = (
        Index('UQ_amc_expiry_planner_instance_agreement',
              'instance_id', 'agreement_number', unique=True),
    )

    id = Column(Integer, primary_key=True, index=True)
    instance_id = Column(String(100), index=True, nullable=False)
    # Second half of the record key — one agreement can cover several gensets,
    # so it is not unique on its own.
    agreement_number = Column(String(200), index=True, nullable=True)

    branch_id = Column(String(100), nullable=True, index=True)
    account_name = Column(String(500), nullable=True, index=True)
    installation_site_address = Column(Text, nullable=True)
    # What the whole file is FOR: when the agreement runs out.
    agreement_end_date = Column(DateTime, nullable=True, index=True)

    # Dynamic columns: any file column not mapped above is kept as JSON {header: value}
    extra_data = Column(Text, nullable=True)

    created_at = Column(DateTime, default=now_ist)
    updated_at = Column(DateTime, default=now_ist, onupdate=now_ist)


class LMSInsia(Base):
    """'LMS Data from Insia' import - the branch LMS lead export, one row per LEAD NUMBER.

    A SECOND LMS layout, imported alongside 'LMS Data for ERP' into its own
    table. It carries the same lead columns but NO Instance Id, so it cannot
    key a genset directly: the relation to the customers table is resolved from
    LEAD SR NUMBER against the SR the lead was raised on (Open SR Load Report,
    MaxTTR - Oil Change SR Zero Labour Flag, Response Time & MaxTTR Details,
    EFSR Report) and stored in instance_id. A row whose SR is in none of those
    tables yet keeps a null instance_id and picks one up on the next upload,
    once the SR file has been loaded.

    LEAD NUMBER is the record key: ONE row per lead, upserted on re-import
    (blank cells never wipe existing data, extra_data is merged). When the same
    lead appears more than once in a file the FIRST row wins - the real export
    repeats a lead once per PRODUCT LIST / PRODUCT TYPE line (310 leads, 466
    extra rows out of 2,576), and in 301 of those 310 leads those two columns
    are the ONLY thing that differs. QUOTATION NUMBER differs in 7 of them and
    ORDER NUMBER in 5; every other column is identical across a lead's rows.

    Fixed columns are the seven the app reads. Every other column of the file
    (MODE OF LEAD CREATION, LEAD RAISED BY / FOR, SD NAME, SD ID, BRANCH NAME,
    PRODUCT LIST, PRODUCT TYPE, LEAD ASSIGNED TO, LEAD STATUS, ACCOUNT ID,
    ZONE, ENGINE MODEL, KVA RATING, TELE CALLER NAME, QUOTATION NUMBER,
    QUOTATION SUBMIT DATE, QUOTATION APPROVAL DATE, ORDER NUMBER) is DYNAMIC
    and kept as JSON in extra_data. Shown on the Customer page."""
    __tablename__ = "lms_insia"
    __table_args__ = (
        Index('UQ_lms_insia_lead_number', 'lead_number', unique=True),
    )

    id = Column(Integer, primary_key=True, index=True)
    lead_number = Column(String(200), index=True, nullable=False)

    # Relation to the customers table, resolved from lead_sr_number - this file
    # carries no genset key of its own.
    instance_id = Column(String(100), index=True, nullable=True)

    lead_created_date = Column(DateTime, nullable=True, index=True)
    branch_id = Column(String(100), nullable=True, index=True)
    account_name = Column(String(500), nullable=True, index=True)
    lead_sr_number = Column(String(200), nullable=True, index=True)
    service_engineer_name = Column(String(500), nullable=True, index=True)
    order_creation_date = Column(DateTime, nullable=True, index=True)

    # Dynamic columns: any file column not mapped above is kept as JSON {header: value}
    extra_data = Column(Text, nullable=True)

    created_at = Column(DateTime, default=now_ist)
    updated_at = Column(DateTime, default=now_ist, onupdate=now_ist)


class AllInvoiceReport(Base):
    """'All Invoice Detailed Report' import - every service / OTC / agreement
    invoice LINE the ERP raised, one row per INVOICE NUMBER.

    LINKED to the customers table on INSTANCE ID, but only the Service lines
    carry one: measured on the real 30,242-row export, all 14,419 Service rows
    have an Instance Id and all 15,747 OTC + 76 Agreement rows have none (OTC is
    counter sale - no genset). Rows without one import UNLINKED rather than being
    dropped, or half the file would never land.

    INVOICE NUMBER is the record key and it is genuinely unique: 30,242 rows ->
    30,242 distinct numbers, zero duplicates. One row per invoice, upserted on
    re-import (blank cells never wipe existing data, extra_data is merged).

    Fixed columns are the nine the app reads plus INVOICE NUMBER, the key.
    Every other column of the file (Zone Name, SD Id/Name, Segment, Application
    Code, Engine Serial Number, SR Number/Type/Subtype, SR Close Date, Invoice
    Cancel Reason/Date, the tax and discount amounts, ...) is DYNAMIC and kept
    as JSON in extra_data. Shown on the Customer page.

    The Open Quotation Tracker reads this table's invoice half:
    invoice_date in the period, invoice_status <> 'Cancelled' (185 rows in the
    export), invoice_segment = 'Service', split into labour / part rows by
    invoice_type ('Labor' / 'Parts') and summed on invoice_amount."""
    __tablename__ = "all_invoice_report"
    __table_args__ = (
        Index('UQ_all_invoice_report_invoice_number', 'invoice_number', unique=True),
    )

    id = Column(Integer, primary_key=True, index=True)
    # The record key.
    invoice_number = Column(String(200), index=True, nullable=False)

    # The genset key - the relation to the customers table. NULL on the OTC and
    # Agreement lines, which have no genset at all.
    instance_id = Column(String(100), index=True, nullable=True)

    branch_id = Column(String(100), nullable=True, index=True)
    branch_name = Column(String(500), nullable=True, index=True)
    account_name = Column(String(500), nullable=True, index=True)

    invoice_date = Column(DateTime, nullable=True, index=True)
    # 'New' | 'Invoiced' | 'Cancelled' - the report drops the cancelled lines.
    invoice_status = Column(String(100), nullable=True, index=True)
    # 'Service' | 'OTC' | 'Agreement' - the report keeps Service only.
    invoice_segment = Column(String(100), nullable=True, index=True)
    # 'Labor' | 'Parts' - what splits the report's labour and part columns.
    invoice_type = Column(String(100), nullable=True, index=True)
    invoice_amount = Column(Float, nullable=True)

    # Dynamic columns: any file column not mapped above is kept as JSON {header: value}
    extra_data = Column(Text, nullable=True)

    created_at = Column(DateTime, default=now_ist)
    updated_at = Column(DateTime, default=now_ist, onupdate=now_ist)


class _SrClosureFlagFile:
    """Shared shape of the two SR-closure flag files — see SrClosedUnderFtr.

    Documentation only; each model spells its own columns out so the table
    definitions stay readable on their own.
    """
