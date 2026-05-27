from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

# ==================== AMC Agreement Schemas ====================

class AMCAgreementBase(BaseModel):
    instance_id: Optional[str] = None
    zone_name: Optional[str] = None
    sd_id: Optional[str] = None
    sd_name: Optional[str] = None
    branch_id: Optional[str] = None
    branch_name: Optional[str] = None
    segment: Optional[str] = None
    kva_rating: Optional[str] = None
    engine_model: Optional[str] = None
    agreement_number: Optional[str] = None
    number_of_agreement_years: Optional[int] = None
    agreement_name: Optional[str] = None
    agreement_status: Optional[str] = None
    agreement_type: Optional[str] = None
    agreement_created_date: Optional[datetime] = None
    agreement_start_date: Optional[datetime] = None
    agreement_end_date: Optional[datetime] = None
    agreement_product_name: Optional[str] = None
    last_agreement_number: Optional[str] = None
    last_agreement_no_of_years: Optional[int] = None
    last_agreement_type: Optional[str] = None
    last_agreement_status: Optional[str] = None
    last_agreement_product_name: Optional[str] = None
    last_agreement_start_date: Optional[datetime] = None
    last_agreement_end_date: Optional[datetime] = None

class AMCAgreementCreate(AMCAgreementBase):
    pass

class AMCAgreementUpdate(AMCAgreementBase):
    pass

class AMCAgreement(AMCAgreementBase):
    id: int
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

# ==================== Asset Detailed Schemas ====================

class AssetDetailedBase(BaseModel):
    instance_id: Optional[str] = None
    zone_name: Optional[str] = None
    sd_id: Optional[str] = None
    sd_name: Optional[str] = None
    branch_id: Optional[str] = None
    branch_name: Optional[str] = None
    district: Optional[str] = None
    asset_number: Optional[str] = None
    commissioning_date: Optional[datetime] = None
    installation_date: Optional[datetime] = None
    goem_oem: Optional[str] = None
    application_code: Optional[str] = None
    engine_serial_no: Optional[str] = None
    engine_model: Optional[str] = None
    account_name: Optional[str] = None
    customer_name: Optional[str] = None
    contact_phone_number: Optional[str] = None
    contact_email_id: Optional[str] = None
    warranty_expiry_date: Optional[datetime] = None
    installation_site_address: Optional[str] = None
    product_segment: Optional[str] = None
    segment: Optional[str] = None
    customer_segment: Optional[str] = None
    asset_operational_status: Optional[str] = None
    krm_number: Optional[str] = None
    krm_status: Optional[str] = None
    krm_active_date: Optional[datetime] = None
    krm_inactive_date: Optional[datetime] = None
    krm_subscription_start_date: Optional[datetime] = None
    krm_subscription_end_date: Optional[datetime] = None
    kva_rating: Optional[str] = None

class AssetDetailedCreate(AssetDetailedBase):
    pass

class AssetDetailedUpdate(AssetDetailedBase):
    pass

class AssetDetailed(AssetDetailedBase):
    id: int
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

# ==================== Asset Service Schemas ====================

class AssetServiceBase(BaseModel):
    instance_id: Optional[str] = None
    zone_name: Optional[str] = None
    sd_id: Optional[str] = None
    sd_name: Optional[str] = None
    branch_id: Optional[str] = None
    branch_name: Optional[str] = None
    asset_number: Optional[str] = None
    commissioning_date: Optional[datetime] = None
    product_segment: Optional[str] = None
    application_code: Optional[str] = None
    engine_serial_no: Optional[str] = None
    account_name: Optional[str] = None
    contact_phone_number: Optional[str] = None
    last_closed_sr_number: Optional[str] = None
    last_sr_type: Optional[str] = None
    last_sr_subtype: Optional[str] = None
    last_sr_close_date: Optional[datetime] = None
    last_oil_change_sr_number: Optional[str] = None
    last_oil_change_sr_type: Optional[str] = None
    last_oil_change_sr_sub_type: Optional[str] = None
    last_oil_change_date: Optional[datetime] = None
    installation_site_address: Optional[str] = None
    last_service_hrs: Optional[str] = None

class AssetServiceCreate(AssetServiceBase):
    pass

class AssetServiceUpdate(AssetServiceBase):
    pass

class AssetService(AssetServiceBase):
    id: int
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

# ==================== Anubandhan Plus Quote Schemas ====================

class AnubandhanPlusQuoteBase(BaseModel):
    instance_id: Optional[str] = None
    branch_id: Optional[str] = None
    id_col: Optional[str] = None
    quotation_ref_no: Optional[str] = None
    company_name: Optional[str] = None
    engine_no: Optional[str] = None
    contact_person_name: Optional[str] = None
    mobile_no: Optional[str] = None
    email_id: Optional[str] = None
    genset_kva: Optional[str] = None
    zone: Optional[str] = None
    state: Optional[str] = None
    city: Optional[str] = None
    location: Optional[str] = None
    no_of_years: Optional[int] = None
    genset_running_per_year: Optional[str] = None
    created_date_time: Optional[datetime] = None
    status: Optional[str] = None
    payment_type: Optional[str] = None
    transaction_id: Optional[str] = None
    bank_name: Optional[str] = None
    account_no: Optional[str] = None
    date_of_payment: Optional[datetime] = None
    payment_update_date_time: Optional[datetime] = None
    is_neft_confirm: Optional[bool] = None
    is_cheque_confirm: Optional[bool] = None
    cheque_deposited_address: Optional[str] = None
    cheque_given_dealership: Optional[str] = None
    cheque_deposited: Optional[str] = None
    cheque_to_dealer: Optional[str] = None
    employee_name: Optional[str] = None
    pulse_id: Optional[str] = None
    is_invoice_sent: Optional[bool] = None
    is_refund: Optional[bool] = None
    agent_id: Optional[str] = None
    quote_price: Optional[float] = None
    quotation_value_including_tax: Optional[float] = None
    name_of_agent: Optional[str] = None
    actual_amount: Optional[float] = None
    reason_of_short_payment: Optional[str] = None
    status_updated_by_admin: Optional[str] = None
    quotation_expiry_date: Optional[datetime] = None
    is_expired: Optional[bool] = None
    payment_updated_month: Optional[str] = None
    pulse_instance_id: Optional[str] = None
    new_price_applicable: Optional[bool] = None
    quotation_type: Optional[str] = None

class AnubandhanPlusQuoteCreate(AnubandhanPlusQuoteBase):
    pass

class AnubandhanPlusQuoteUpdate(AnubandhanPlusQuoteBase):
    pass

class AnubandhanPlusQuote(AnubandhanPlusQuoteBase):
    id: int
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

# ==================== Anubandhan Quote Schemas ====================

class AnubandhanQuoteBase(BaseModel):
    instance_id: Optional[str] = None
    branch_id: Optional[str] = None
    id_col: Optional[str] = None
    quotation_ref_no: Optional[str] = None
    company_name: Optional[str] = None
    engine_no: Optional[str] = None
    contact_person_name: Optional[str] = None
    mobile_no: Optional[str] = None
    email_id: Optional[str] = None
    genset_kva: Optional[str] = None
    zone: Optional[str] = None
    state: Optional[str] = None
    city: Optional[str] = None
    location: Optional[str] = None
    no_of_years: Optional[int] = None
    genset_running_per_year: Optional[str] = None
    created_date_time: Optional[datetime] = None
    status: Optional[str] = None
    payment_type: Optional[str] = None
    transaction_id: Optional[str] = None
    bank_name: Optional[str] = None
    account_no: Optional[str] = None
    date_of_payment: Optional[datetime] = None
    payment_update_date_time: Optional[datetime] = None
    is_neft_confirm: Optional[bool] = None
    is_cheque_confirm: Optional[bool] = None
    cheque_deposited_address: Optional[str] = None
    cheque_given_dealership: Optional[str] = None
    cheque_deposited: Optional[str] = None
    cheque_to_dealer: Optional[str] = None
    employee_name: Optional[str] = None
    pulse_id: Optional[str] = None
    is_invoice_sent: Optional[bool] = None
    is_refund: Optional[bool] = None
    agent_id: Optional[str] = None
    quote_price: Optional[float] = None
    quotation_value_including_tax: Optional[float] = None
    name_of_agent: Optional[str] = None
    actual_amount: Optional[float] = None
    reason_of_short_payment: Optional[str] = None
    status_updated_by_admin: Optional[str] = None
    quotation_expiry_date: Optional[datetime] = None
    is_expired: Optional[bool] = None
    payment_updated_month: Optional[str] = None
    pulse_instance_id: Optional[str] = None
    new_price_applicable: Optional[bool] = None
    quotation_type: Optional[str] = None

class AnubandhanQuoteCreate(AnubandhanQuoteBase):
    pass

class AnubandhanQuoteUpdate(AnubandhanQuoteBase):
    pass

class AnubandhanQuote(AnubandhanQuoteBase):
    id: int
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

# ==================== BandhanPlus Quote Schemas ====================

class BandhanPlusQuoteBase(BaseModel):
    instance_id: Optional[str] = None
    branch_id: Optional[str] = None
    id_col: Optional[str] = None
    quotation_ref_no: Optional[str] = None
    company_name: Optional[str] = None
    engine_no: Optional[str] = None
    contact_person_name: Optional[str] = None
    mobile_no: Optional[str] = None
    email_id: Optional[str] = None
    genset_kva: Optional[str] = None
    zone: Optional[str] = None
    state: Optional[str] = None
    city: Optional[str] = None
    location: Optional[str] = None
    no_of_years: Optional[int] = None
    genset_running_per_year: Optional[str] = None
    created_date_time: Optional[datetime] = None
    status: Optional[str] = None
    payment_type: Optional[str] = None
    transaction_id: Optional[str] = None
    bank_name: Optional[str] = None
    account_no: Optional[str] = None
    date_of_payment: Optional[datetime] = None
    payment_update_date_time: Optional[datetime] = None
    is_neft_confirm: Optional[bool] = None
    is_cheque_confirm: Optional[bool] = None
    cheque_deposited_address: Optional[str] = None
    cheque_given_dealership: Optional[str] = None
    cheque_deposited: Optional[str] = None
    cheque_to_dealer: Optional[str] = None
    employee_name: Optional[str] = None
    pulse_id: Optional[str] = None
    is_invoice_sent: Optional[bool] = None
    is_refund: Optional[bool] = None
    agent_id: Optional[str] = None
    quote_price: Optional[float] = None
    quotation_value_including_tax: Optional[float] = None
    name_of_agent: Optional[str] = None
    actual_amount: Optional[float] = None
    reason_of_short_payment: Optional[str] = None
    status_updated_by_admin: Optional[str] = None
    quotation_expiry_date: Optional[datetime] = None
    is_expired: Optional[bool] = None
    payment_updated_month: Optional[str] = None
    pulse_instance_id: Optional[str] = None
    new_price_applicable: Optional[bool] = None
    quotation_type: Optional[str] = None

class BandhanPlusQuoteCreate(BandhanPlusQuoteBase):
    pass

class BandhanPlusQuoteUpdate(BandhanPlusQuoteBase):
    pass

class BandhanPlusQuote(BandhanPlusQuoteBase):
    id: int
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

# ==================== Pulse Quotation Schemas ====================

class PulseQuotationBase(BaseModel):
    instance_id: Optional[str] = None
    branch_id: Optional[str] = None
    creation_date: Optional[datetime] = None
    quote_id: Optional[str] = None
    first_level_observations: Optional[str] = None
    quote_status: Optional[str] = None
    sr_type: Optional[str] = None
    sr_sub_type: Optional[str] = None
    instance_id_col: Optional[str] = None
    account: Optional[str] = None
    bill_to_address: Optional[str] = None
    ship_to_address: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    contact_phone_number: Optional[str] = None
    installation_site_address: Optional[str] = None
    contact_primary_email: Optional[str] = None
    service_dealer: Optional[str] = None
    labor_amount: Optional[float] = None
    parts_amount: Optional[float] = None
    total_amount: Optional[float] = None
    prepared_by: Optional[str] = None
    recommended_by: Optional[str] = None
    finance_company_address: Optional[str] = None
    account_number: Optional[str] = None
    purpose_of_quotation: Optional[str] = None
    sr_number: Optional[str] = None
    quote_revised_flag: Optional[bool] = None
    quote_submitted_date: Optional[datetime] = None
    exception_enquiry_no: Optional[str] = None
    lead_no: Optional[str] = None
    quotation_lead_assigned_name: Optional[str] = None
    quotation_lead_assigned_job_title: Optional[str] = None
    quotation_lead_assigned_phone: Optional[str] = None
    quotation_lead_assigned_uid: Optional[str] = None

class PulseQuotationCreate(PulseQuotationBase):
    pass

class PulseQuotationUpdate(PulseQuotationBase):
    pass

class PulseQuotation(PulseQuotationBase):
    id: int
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

# ==================== Regular Bandhan Schemas ====================

class RegularBandhanBase(BaseModel):
    instance_id: Optional[str] = None
    branch_id: Optional[str] = None
    name_of_agent: Optional[str] = None
    quotation_ref_no: Optional[str] = None
    password: Optional[str] = None
    genset_number: Optional[str] = None
    name: Optional[str] = None
    email: Optional[str] = None
    mobile: Optional[str] = None
    pan_card_no: Optional[str] = None
    billing_state: Optional[str] = None
    billing_city: Optional[str] = None
    billing_location: Optional[str] = None
    billing_address_1: Optional[str] = None
    billing_address_2: Optional[str] = None
    billing_pincode: Optional[str] = None
    dg_state: Optional[str] = None
    dg_city: Optional[str] = None
    dg_location: Optional[str] = None
    dg_address_1: Optional[str] = None
    dg_address_2: Optional[str] = None
    dg_pincode: Optional[str] = None
    type_of_customer: Optional[str] = None
    date: Optional[datetime] = None
    gstn_no: Optional[str] = None
    payment_type: Optional[str] = None
    payment_update_date: Optional[datetime] = None
    contact_person_name: Optional[str] = None
    zone: Optional[str] = None
    actual_amount: Optional[float] = None
    reason_of_short_payment: Optional[str] = None
    status_updated_by_admin: Optional[str] = None

class RegularBandhanCreate(RegularBandhanBase):
    pass

class RegularBandhanUpdate(RegularBandhanBase):
    pass

class RegularBandhan(RegularBandhanBase):
    id: int
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

# ==================== LMS Data Schemas ====================

class LMSDataBase(BaseModel):
    instance_id: Optional[str] = None
    # ---- Existing fields (kept) ----
    lead_number: Optional[str] = None
    lead_created_date: Optional[datetime] = None
    mode_of_lead_creation: Optional[str] = None
    lead_raised_by: Optional[str] = None
    lead_raised_for: Optional[str] = None
    sd_name: Optional[str] = None
    sd_id: Optional[str] = None
    branch_name: Optional[str] = None
    branch_id: Optional[str] = None
    product_list: Optional[str] = None
    product_type: Optional[str] = None
    lead_assigned_to: Optional[str] = None
    lead_status: Optional[str] = None
    account_id: Optional[str] = None
    account_name: Optional[str] = None
    zone: Optional[str] = None
    lead_sr_number: Optional[str] = None
    instance_id_col: Optional[str] = None
    engine_model: Optional[str] = None
    kva_rating: Optional[str] = None
    service_engineer_name: Optional[str] = None
    tele_caller_name: Optional[str] = None
    quotation_number: Optional[str] = None
    quotation_submit_date: Optional[datetime] = None
    quotation_approval_date: Optional[datetime] = None
    order_number: Optional[str] = None
    order_creation_date: Optional[datetime] = None
    # ---- NEW fields for the new LMS file format ----
    sr_type: Optional[str] = None
    sr_sub_type: Optional[str] = None
    sr_sub_type_2: Optional[str] = None
    account_contact_number: Optional[str] = None
    account_contact_email_id: Optional[str] = None
    tele_caller_uid: Optional[str] = None
    tele_caller_mobile_number: Optional[str] = None
    enquiry_allocation_remarks: Optional[str] = None
    engine_app_code: Optional[str] = None
    engine_serial_no: Optional[str] = None
    pin_code: Optional[str] = None
    segment: Optional[str] = None
    commissioning_date: Optional[datetime] = None
    installation_site_address: Optional[str] = None
    city: Optional[str] = None
    district: Optional[str] = None
    state: Optional[str] = None
    asset_contact_name: Optional[str] = None
    asset_contact_phone_number: Optional[str] = None
    efsr_contact_name: Optional[str] = None
    efsr_customer_number: Optional[str] = None
    qualifying_date: Optional[datetime] = None
    quotation_type: Optional[str] = None
    quotation_labour_amt: Optional[float] = None
    quotation_part_amt: Optional[float] = None
    total_quote_amount: Optional[float] = None
    quotation_lead_assigned_name: Optional[str] = None
    quotation_lead_assigned_uid: Optional[str] = None
    quotation_lead_assigned_job_title: Optional[str] = None
    enquiry_loss_reason: Optional[str] = None
    service_engineer_uid: Optional[str] = None
    service_engineer_mobile_number: Optional[str] = None
    sic_code: Optional[str] = None
    sic_code_type: Optional[str] = None
    labour_invoice_number: Optional[str] = None
    part_invoice_amount: Optional[float] = None
    part_invoice_number: Optional[str] = None
    lead_source: Optional[str] = None
    next_action_required: Optional[str] = None
    new_contact: Optional[str] = None
    lead_contact_number: Optional[str] = None
    next_action_date: Optional[datetime] = None
    lead_assign_to_sd: Optional[str] = None

class LMSDataCreate(LMSDataBase):
    pass

class LMSDataUpdate(LMSDataBase):
    pass

class LMSData(LMSDataBase):
    id: int
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

# ==================== Customer Schemas ====================

class CustomerBase(BaseModel):
    instance_id: str
    customer_name: Optional[str] = None
    phone_number: Optional[str] = None
    email: Optional[str] = None
    pan_number: Optional[str] = None
    branch_id: Optional[str] = None
    location: Optional[str] = None

class CustomerCreate(CustomerBase):
    pass

class CustomerUpdate(BaseModel):
    customer_name: Optional[str] = None
    phone_number: Optional[str] = None
    email: Optional[str] = None
    pan_number: Optional[str] = None
    location: Optional[str] = None
    last_updated_by: Optional[str] = None

class Customer(CustomerBase):
    id: int
    created_at: datetime
    updated_at: datetime
    last_updated_by: Optional[str] = None 
    
    class Config:
        from_attributes = True

# ==================== Customer with Related Data Schemas ====================
# Note: These are kept for API responses but note that there are no actual relationships in the database

class CustomerWithRelations(Customer):
    amc_agreements: List[AMCAgreement] = []
    asset_detailed: List[AssetDetailed] = []
    oil_services: List[AssetService] = []
    anubandhan_plus_quotes: List[AnubandhanPlusQuote] = []
    anubandhan_quotes: List[AnubandhanQuote] = []
    bandhan_plus_quotes: List[BandhanPlusQuote] = []
    pulse_quotations: List[PulseQuotation] = []
    regular_bandhan: List[RegularBandhan] = []
    lms_data: List[LMSData] = []
    
    class Config:
        from_attributes = True

class CustomerWithSummary(Customer):
    amc_agreements_count: int = 0
    asset_detailed_count: int = 0
    oil_services_count: int = 0
    anubandhan_plus_quotes_count: int = 0
    anubandhan_quotes_count: int = 0
    bandhan_plus_quotes_count: int = 0
    pulse_quotations_count: int = 0
    regular_bandhan_count: int = 0
    lms_data_count: int = 0
    
    class Config:
        from_attributes = True

# ==================== Message Response ====================

class MessageResponse(BaseModel):
    message: str
    
    class Config:
        from_attributes = True

# ==================== Import Response ====================

class ImportResponse(BaseModel):
    message: str
    imported_count: int
    skipped_count: int
    total_processed: int
    file_type: str
    
    class Config:
        from_attributes = True

class MultipleImportResponse(BaseModel):
    total_imported: int
    total_skipped: int
    total_files: int
    results: List[dict]
    
    class Config:
        from_attributes = True


# ==================== Open SR Load Report Schemas ====================

class OpenSRLoadReportBase(BaseModel):
    instance_id: Optional[str] = None
    branch_id: Optional[str] = None
    service_request_no: Optional[str] = None
    sr_due_date: Optional[datetime] = None
    appointment_date: Optional[datetime] = None
    service_dealer: Optional[str] = None
    status: Optional[str] = None
    sr_type: Optional[str] = None
    sr_sub_type: Optional[str] = None
    problem_code: Optional[str] = None
    installation_site_address: Optional[str] = None
    engine_app_code: Optional[str] = None
    voc: Optional[str] = None
    engine_serial_no: Optional[str] = None
    engine_series: Optional[str] = None
    engine_model: Optional[str] = None
    ticket_no: Optional[str] = None
    segment: Optional[str] = None
    task_start_date: Optional[datetime] = None
    task_end_date: Optional[datetime] = None
    account: Optional[str] = None
    under_monitoring_date: Optional[datetime] = None
    under_monitoring_remark: Optional[str] = None
    convert_pm_to_wet_pm_flag: Optional[str] = None
    efsr_engineer_remarks: Optional[str] = None
    quick_ticket_sr_comments: Optional[str] = None
    actual_sr_due_date: Optional[datetime] = None
    convert_pm_to_wet_pm_flag_updated_date: Optional[datetime] = None
    convert_pm_to_wet_pm_flag_updated_by: Optional[str] = None
    customer_name: Optional[str] = None
    contact_last_name: Optional[str] = None
    customer_mobile_no: Optional[str] = None
    genset_appcode: Optional[str] = None
    contact_name: Optional[str] = None
    primary_phone_no: Optional[str] = None
    mode: Optional[str] = None
    close_date_time: Optional[datetime] = None
    special_tool: Optional[str] = None
    special_tool_name: Optional[str] = None
    repeat: Optional[str] = None
    assigned_to: Optional[str] = None
    oil_change_flg: Optional[str] = None
    claim_created: Optional[str] = None
    agreement_no: Optional[str] = None
    cancellation_reason: Optional[str] = None
    csp_cancellation_reasons: Optional[str] = None
    csp_cancellation_remarks: Optional[str] = None
    asm_ase_remarks: Optional[str] = None
    asm_ase_remarks_date: Optional[datetime] = None
    battery_charger_availability: Optional[str] = None
    wet_pm_due_flag: Optional[str] = None
    cap_limit_approval_remarks: Optional[str] = None
    cap_limit_deviation_remarks: Optional[str] = None
    cap_limit_deviation_status: Optional[str] = None
    cap_limit_user_details: Optional[str] = None
    csp_prepone_flag: Optional[str] = None
    csp_prepone_flag_updated_by: Optional[str] = None
    bandhan_pm_sr_closure_within_15_days_flag: Optional[str] = None
    bandhan_pm_lock_removal_flag_updated_by: Optional[str] = None
    bandhan_pm_lock_removal_flag_updated_date: Optional[datetime] = None
    bandhan_pm_sr_closure_90_days_max_after_pm_due_date_flag: Optional[str] = None
    bandhan_pm_due_date_lock_removal_flag_updated_by: Optional[str] = None
    bandhan_pm_due_date_lock_removal_flag_updated_date: Optional[datetime] = None
    bandhan_job_card_creation_prior_to_60_days_flag: Optional[str] = None
    bandhan_pm_jc_creation_lock_removal_flag_updated_by: Optional[str] = None
    bandhan_pm_jc_creation_lock_removal_flag_updated_date: Optional[datetime] = None
    account_id: Optional[str] = None
    sr_created_by: Optional[str] = None
    efsr_krm_number: Optional[str] = None
    dry_csp_approved_by: Optional[str] = None
    dry_csp_approved_date: Optional[datetime] = None

class OpenSRLoadReportCreate(OpenSRLoadReportBase):
    pass

class OpenSRLoadReportUpdate(OpenSRLoadReportBase):
    pass

class OpenSRLoadReport(OpenSRLoadReportBase):
    id: int
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True