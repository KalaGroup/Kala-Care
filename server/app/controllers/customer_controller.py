from sqlalchemy.orm import Session
from sqlalchemy import or_, desc, and_, func, exists, case, select, literal, union_all
from fastapi import HTTPException
from typing import List, Optional, Dict, Any
from datetime import datetime

from app.models.customer_model import (
    Customer, AMCAgreement, AssetDetailed, AssetService,
    AnubandhanPlusQuote, AnubandhanQuote, BandhanPlusQuote,
    PulseQuotation, RegularBandhan, LMSData, OpenSRLoadReport, MaxTTROilChangeSRZeroLabourFlag,
    ResponseTimeMaxTTR, CDIDetailReport, EFSRReport, AMCExpiryPlanner, LMSInsia,
    AllInvoiceReport
)
from app.time_utils import now_ist
from app.schemas.customer_schema import (
    CustomerCreate, CustomerUpdate,
    AMCAgreementCreate, AMCAgreementUpdate,
    AssetDetailedCreate, AssetDetailedUpdate,
    AssetServiceCreate, AssetServiceUpdate,
    AnubandhanPlusQuoteCreate, AnubandhanPlusQuoteUpdate,
    AnubandhanQuoteCreate, AnubandhanQuoteUpdate,
    BandhanPlusQuoteCreate, BandhanPlusQuoteUpdate,
    PulseQuotationCreate, PulseQuotationUpdate,
    RegularBandhanCreate, RegularBandhanUpdate,
    LMSDataCreate, LMSDataUpdate,
    OpenSRLoadReportCreate, OpenSRLoadReportUpdate
)


class CustomerController:
    def __init__(self, db: Session):
        self.db = db
    
    # Every unfiltered table count in ONE round trip.
    #
    # The 18 individual *_count() methods below each issue their own
    # COUNT(*), which is fine for a single table but means 18 sequential
    # network round trips when the dashboard asks for all of them. Against
    # the remote SQL Server (~60 ms RTT) that was ~4 s of pure latency.
    # UNION ALL returns the identical numbers in a single trip.
    _COUNT_MODELS = {
        "customers": Customer,
        "amc_agreements": AMCAgreement,
        "asset_detailed": AssetDetailed,
        "asset_services": AssetService,
        "anubandhan_plus": AnubandhanPlusQuote,
        "anubandhan": AnubandhanQuote,
        "bandhan_plus": BandhanPlusQuote,
        "pulse": PulseQuotation,
        "regular_bandhan": RegularBandhan,
        "lms_data": LMSData,
        "open_sr_load_reports": OpenSRLoadReport,
        "open_sr_data": MaxTTROilChangeSRZeroLabourFlag,
        "response_time_maxttr": ResponseTimeMaxTTR,
        "cdi_detail_report": CDIDetailReport,
        "efsr_report": EFSRReport,
        "amc_expiry_planner": AMCExpiryPlanner,
        "lms_insia": LMSInsia,
        "all_invoice_report": AllInvoiceReport,
    }

    def get_all_counts(self) -> Dict[str, int]:
        """Unfiltered row count for every customer-data table, in one query."""
        stmts = [
            select(literal(key).label("k"), func.count().label("n"))
            .select_from(model.__table__)
            for key, model in self._COUNT_MODELS.items()
        ]
        rows = self.db.execute(union_all(*stmts)).all()
        counts = {row.k: int(row.n) for row in rows}
        # Never let a missing key break the dashboard.
        return {key: counts.get(key, 0) for key in self._COUNT_MODELS}

    # Add these count methods to your CustomerController class
# ==================== COUNT METHODS FOR PAGINATION ====================

    def get_customers_count(self, search: Optional[str] = None):
        """Get total count of customers with optional search"""
        query = self.db.query(Customer)
        
        if search:
            search_term = f"%{search}%"
            query = query.filter(
                or_(
                    Customer.customer_name.ilike(search_term),
                    Customer.instance_id.ilike(search_term),
                    Customer.phone_number.ilike(search_term),
                    Customer.email.ilike(search_term),
                    Customer.location.ilike(search_term),
                    Customer.branch_id.ilike(search_term)
                )
            )
        
        return query.count()
    
    def get_amc_agreements_count(self, search: Optional[str] = None):
        """Get total count of AMC agreements with optional search"""
        query = self.db.query(AMCAgreement)
        
        if search:
            search_term = f"%{search}%"
            query = query.filter(
                or_(
                    AMCAgreement.agreement_number.ilike(search_term),
                    AMCAgreement.agreement_name.ilike(search_term),
                    AMCAgreement.instance_id.ilike(search_term)
                )
            )
        
        return query.count()
    
    def get_asset_detailed_count(self, search: Optional[str] = None):
        """Get total count of asset detailed records with optional search"""
        query = self.db.query(AssetDetailed)
        
        if search:
            search_term = f"%{search}%"
            query = query.filter(
                or_(
                    AssetDetailed.asset_number.ilike(search_term),
                    AssetDetailed.engine_serial_no.ilike(search_term),
                    AssetDetailed.customer_name.ilike(search_term),
                    AssetDetailed.instance_id.ilike(search_term)
                )
            )
        
        return query.count()
    
    def get_asset_services_count(self, search: Optional[str] = None):
        """Get total count of asset services with optional search"""
        query = self.db.query(AssetService)
        
        if search:
            search_term = f"%{search}%"
            query = query.filter(
                or_(
                    AssetService.asset_number.ilike(search_term),
                    AssetService.engine_serial_no.ilike(search_term),
                    AssetService.last_closed_sr_number.ilike(search_term),
                    AssetService.instance_id.ilike(search_term)
                )
            )
        
        return query.count()
    
    def get_anubandhan_plus_quotes_count(self, search: Optional[str] = None):
        """Get total count of Anubandhan Plus quotes with optional search"""
        query = self.db.query(AnubandhanPlusQuote)
        
        if search:
            search_term = f"%{search}%"
            query = query.filter(
                or_(
                    AnubandhanPlusQuote.quotation_ref_no.ilike(search_term),
                    AnubandhanPlusQuote.company_name.ilike(search_term),
                    AnubandhanPlusQuote.engine_no.ilike(search_term),
                    AnubandhanPlusQuote.instance_id.ilike(search_term)
                )
            )
        
        return query.count()
    
    def get_anubandhan_quotes_count(self, search: Optional[str] = None):
        """Get total count of Anubandhan quotes with optional search"""
        query = self.db.query(AnubandhanQuote)
        
        if search:
            search_term = f"%{search}%"
            query = query.filter(
                or_(
                    AnubandhanQuote.quotation_ref_no.ilike(search_term),
                    AnubandhanQuote.company_name.ilike(search_term),
                    AnubandhanQuote.engine_no.ilike(search_term),
                    AnubandhanQuote.instance_id.ilike(search_term)
                )
            )
        
        return query.count()
    
    def get_bandhan_plus_quotes_count(self, search: Optional[str] = None):
        """Get total count of Bandhan Plus quotes with optional search"""
        query = self.db.query(BandhanPlusQuote)
        
        if search:
            search_term = f"%{search}%"
            query = query.filter(
                or_(
                    BandhanPlusQuote.quotation_ref_no.ilike(search_term),
                    BandhanPlusQuote.company_name.ilike(search_term),
                    BandhanPlusQuote.engine_no.ilike(search_term),
                    BandhanPlusQuote.instance_id.ilike(search_term)
                )
            )
        
        return query.count()
    
    def get_pulse_quotations_count(self, search: Optional[str] = None):
        """Get total count of Pulse quotations with optional search"""
        query = self.db.query(PulseQuotation)
        
        if search:
            search_term = f"%{search}%"
            query = query.filter(
                or_(
                    PulseQuotation.quote_id.ilike(search_term),
                    PulseQuotation.account.ilike(search_term),
                    PulseQuotation.instance_id.ilike(search_term)
                )
            )
        
        return query.count()
    
    def get_regular_bandhan_count(self, search: Optional[str] = None):
        """Get total count of Regular Bandhan records with optional search"""
        query = self.db.query(RegularBandhan)
        
        if search:
            search_term = f"%{search}%"
            query = query.filter(
                or_(
                    RegularBandhan.quotation_ref_no.ilike(search_term),
                    RegularBandhan.company_name.ilike(search_term),
                    RegularBandhan.engine_no.ilike(search_term),
                    RegularBandhan.instance_id.ilike(search_term)
                )
            )
        
        return query.count()
    
    def get_lms_data_count(self, search: Optional[str] = None):
        """Get total count of LMS data with optional search"""
        query = self.db.query(LMSData)
        
        if search:
            search_term = f"%{search}%"
            query = query.filter(
                or_(
                    LMSData.lead_number.ilike(search_term),
                    LMSData.account_name.ilike(search_term),
                    LMSData.lead_raised_by.ilike(search_term),
                    LMSData.instance_id.ilike(search_term)
                )
            )
        
        return query.count()
    
    def get_open_sr_load_reports_count(self, search: Optional[str] = None):
        """Get total count of Open SR Load Reports with optional search"""
        query = self.db.query(OpenSRLoadReport)
        
        if search:
            search_term = f"%{search}%"
            query = query.filter(
                or_(
                    OpenSRLoadReport.service_request_no.ilike(search_term),
                    OpenSRLoadReport.customer_name.ilike(search_term),
                    OpenSRLoadReport.engine_serial_no.ilike(search_term),
                    OpenSRLoadReport.instance_id.ilike(search_term),
                    OpenSRLoadReport.account.ilike(search_term)
                )
            )
        
        return query.count()
    
    # ==================== CUSTOMER CRUD ====================
    
    def get_customers(self, skip: int = 0, limit: Optional[int] = None, search: Optional[str] = None):
        """Get all customers with optional search"""
        query = self.db.query(Customer)
        
        if search:
            search_term = f"%{search}%"
            query = query.filter(
                or_(
                    Customer.customer_name.ilike(search_term),
                    Customer.instance_id.ilike(search_term),
                    Customer.phone_number.ilike(search_term),
                    Customer.email.ilike(search_term),
                    Customer.location.ilike(search_term),
                    Customer.branch_id.ilike(search_term)
                )
            )
        
        query = query.order_by(Customer.created_at.desc()).offset(skip)
        
        # Only apply limit if it's provided
        if limit is not None:
            query = query.limit(limit)
        
        return query.all()
    
    def get_customer(self, customer_id: int):
        """Get single customer by ID"""
        customer = self.db.query(Customer).filter(Customer.id == customer_id).first()
        if not customer:
            raise HTTPException(status_code=404, detail="Customer not found")
        return customer
    
    def get_customer_by_instance_id(self, instance_id: str):
        """Find customer by instance ID"""
        return self.db.query(Customer).filter(Customer.instance_id == instance_id).first()
    
    def create_customer(self, customer: CustomerCreate):
        """Create new customer"""
        if customer.instance_id:
            existing = self.get_customer_by_instance_id(customer.instance_id)
            if existing:
                raise HTTPException(status_code=400, detail="Customer with this Instance ID already exists")
        
        db_customer = Customer(**customer.dict())
        self.db.add(db_customer)
        self.db.commit()
        self.db.refresh(db_customer)
        return db_customer
    
    def update_customer(self, customer_id: int, customer_update: CustomerUpdate):
        """Update customer"""
        db_customer = self.get_customer(customer_id)
        
        update_data = customer_update.dict(exclude_unset=True)
        
        for field, value in update_data.items():
            setattr(db_customer, field, value)
        
        db_customer.updated_at = now_ist()
        self.db.commit()
        self.db.refresh(db_customer)  # This refreshes with all fields from database
        return db_customer
    
    def delete_customer(self, customer_id: int):
        """Delete customer"""
        db_customer = self.get_customer(customer_id)
        self.db.delete(db_customer)
        self.db.commit()
        return {"message": "Customer deleted successfully"}
    
    # ==================== AMC AGREEMENT CRUD ====================
    
    def get_amc_agreements(self, skip: int = 0, limit: Optional[int] = 100, search: Optional[str] = None):
        """Get all AMC agreements with optional search"""
        query = self.db.query(AMCAgreement)
        
        if search:
            search_term = f"%{search}%"
            query = query.filter(
                or_(
                    AMCAgreement.agreement_number.ilike(search_term),
                    AMCAgreement.agreement_name.ilike(search_term),
                    AMCAgreement.instance_id.ilike(search_term)
                )
            )
        
        query = query.order_by(AMCAgreement.agreement_start_date.desc()).offset(skip)
        
        # Only apply limit if it's not None
        if limit is not None:
            query = query.limit(limit)
        
        return query.all()
    
    def get_amc_agreement(self, agreement_id: int):
        """Get single AMC agreement by ID"""
        agreement = self.db.query(AMCAgreement).filter(AMCAgreement.id == agreement_id).first()
        if not agreement:
            raise HTTPException(status_code=404, detail="AMC Agreement not found")
        return agreement
    
    def create_amc_agreement(self, agreement: AMCAgreementCreate):
        """Create new AMC agreement"""
        db_agreement = AMCAgreement(**agreement.dict())
        self.db.add(db_agreement)
        self.db.commit()
        self.db.refresh(db_agreement)
        return db_agreement
    
    def update_amc_agreement(self, agreement_id: int, agreement_update: AMCAgreementUpdate):
        """Update AMC agreement"""
        db_agreement = self.get_amc_agreement(agreement_id)
        
        update_data = agreement_update.dict(exclude_unset=True)
        
        for field, value in update_data.items():
            setattr(db_agreement, field, value)
        
        db_agreement.updated_at = now_ist()
        self.db.commit()
        self.db.refresh(db_agreement)
        return db_agreement
    
    def delete_amc_agreement(self, agreement_id: int):
        """Delete AMC agreement"""
        db_agreement = self.get_amc_agreement(agreement_id)
        self.db.delete(db_agreement)
        self.db.commit()
        return {"message": "AMC Agreement deleted successfully"}
    
    def bulk_delete_amc_agreements(self, agreement_ids: List[int]):
        """Delete multiple AMC agreements"""
        self.db.query(AMCAgreement).filter(AMCAgreement.id.in_(agreement_ids)).delete(synchronize_session=False)
        self.db.commit()
        return {"message": f"{len(agreement_ids)} AMC Agreements deleted successfully"}
    
    # ==================== ASSET DETAILED CRUD ====================
    
    def get_asset_detailed(self, skip: int = 0, limit: Optional[int] = 100, search: Optional[str] = None):
        """Get all asset detailed records with optional search"""
        query = self.db.query(AssetDetailed)
        
        if search:
            search_term = f"%{search}%"
            query = query.filter(
                or_(
                    AssetDetailed.asset_number.ilike(search_term),
                    AssetDetailed.engine_serial_no.ilike(search_term),
                    AssetDetailed.customer_name.ilike(search_term),
                    AssetDetailed.instance_id.ilike(search_term),
                    AssetDetailed.krm_number.ilike(search_term),
                    AssetDetailed.krm_status.ilike(search_term)
                )
            )
        
        query = query.order_by(AssetDetailed.created_at.desc()).offset(skip)
        
        # Only apply limit if it's not None
        if limit is not None:
            query = query.limit(limit)
        
        return query.all()
    
    def get_asset_detailed_record(self, asset_id: int):
        """Get single asset detailed record by ID"""
        asset = self.db.query(AssetDetailed).filter(AssetDetailed.id == asset_id).first()
        if not asset:
            raise HTTPException(status_code=404, detail="Asset record not found")
        return asset
    
    def create_asset_detailed(self, asset: AssetDetailedCreate):
        """Create new asset detailed record"""
        db_asset = AssetDetailed(**asset.dict())
        self.db.add(db_asset)
        self.db.commit()
        self.db.refresh(db_asset)
        return db_asset
    
    def update_asset_detailed(self, asset_id: int, asset_update: AssetDetailedUpdate):
        """Update asset detailed record"""
        db_asset = self.get_asset_detailed_record(asset_id)
        
        update_data = asset_update.dict(exclude_unset=True)
        
        for field, value in update_data.items():
            setattr(db_asset, field, value)
        
        db_asset.updated_at = now_ist()
        self.db.commit()
        self.db.refresh(db_asset)
        return db_asset
    
    def delete_asset_detailed(self, asset_id: int):
        """Delete asset detailed record"""
        db_asset = self.get_asset_detailed_record(asset_id)
        self.db.delete(db_asset)
        self.db.commit()
        return {"message": "Asset record deleted successfully"}
    
    def bulk_delete_asset_detailed(self, asset_ids: List[int]):
        """Delete multiple asset detailed records"""
        self.db.query(AssetDetailed).filter(AssetDetailed.id.in_(asset_ids)).delete(synchronize_session=False)
        self.db.commit()
        return {"message": f"{len(asset_ids)} Asset records deleted successfully"}
    
    # ==================== ASSET SERVICE CRUD ====================
    
    def get_asset_services(self, skip: int = 0, limit: Optional[int] = 100, search: Optional[str] = None):
        """Get all asset services with optional search"""
        query = self.db.query(AssetService)
        
        if search:
            search_term = f"%{search}%"
            query = query.filter(
                or_(
                    AssetService.asset_number.ilike(search_term),
                    AssetService.engine_serial_no.ilike(search_term),
                    AssetService.last_closed_sr_number.ilike(search_term),
                    AssetService.instance_id.ilike(search_term)
                )
            )
        
        query = query.order_by(AssetService.last_oil_change_date.desc()).offset(skip)
        
        # Only apply limit if it's not None
        if limit is not None:
            query = query.limit(limit)
        
        return query.all()
    
    def get_asset_service(self, service_id: int):
        """Get single asset service by ID"""
        service = self.db.query(AssetService).filter(AssetService.id == service_id).first()
        if not service:
            raise HTTPException(status_code=404, detail="Asset service not found")
        return service
    
    def create_asset_service(self, service: AssetServiceCreate):
        """Create new asset service"""
        db_service = AssetService(**service.dict())
        self.db.add(db_service)
        self.db.commit()
        self.db.refresh(db_service)
        return db_service
    
    def update_asset_service(self, service_id: int, service_update: AssetServiceUpdate):
        """Update asset service"""
        db_service = self.get_asset_service(service_id)
        
        update_data = service_update.dict(exclude_unset=True)
        
        for field, value in update_data.items():
            setattr(db_service, field, value)
        
        db_service.updated_at = now_ist()
        self.db.commit()
        self.db.refresh(db_service)
        return db_service
    
    def delete_asset_service(self, service_id: int):
        """Delete asset service"""
        db_service = self.get_asset_service(service_id)
        self.db.delete(db_service)
        self.db.commit()
        return {"message": "Asset service deleted successfully"}
    
    def bulk_delete_asset_services(self, service_ids: List[int]):
        """Delete multiple asset services"""
        self.db.query(AssetService).filter(AssetService.id.in_(service_ids)).delete(synchronize_session=False)
        self.db.commit()
        return {"message": f"{len(service_ids)} Asset services deleted successfully"}
    
    # ==================== ANUBANDHAN PLUS QUOTES CRUD ====================
    
    def get_anubandhan_plus_quotes(self, skip: int = 0, limit: Optional[int] = 100, search: Optional[str] = None):
        """Get all Anubandhan Plus quotes with optional search"""
        query = self.db.query(AnubandhanPlusQuote)
        
        if search:
            search_term = f"%{search}%"
            query = query.filter(
                or_(
                    AnubandhanPlusQuote.quotation_ref_no.ilike(search_term),
                    AnubandhanPlusQuote.company_name.ilike(search_term),
                    AnubandhanPlusQuote.engine_no.ilike(search_term),
                    AnubandhanPlusQuote.instance_id.ilike(search_term)
                )
            )
        
        query = query.order_by(AnubandhanPlusQuote.created_date_time.desc()).offset(skip)
        
        # Only apply limit if it's not None
        if limit is not None:
            query = query.limit(limit)
        
        return query.all()
    
    def get_anubandhan_plus_quote(self, quote_id: int):
        """Get single Anubandhan Plus quote by ID"""
        quote = self.db.query(AnubandhanPlusQuote).filter(AnubandhanPlusQuote.id == quote_id).first()
        if not quote:
            raise HTTPException(status_code=404, detail="Anubandhan Plus quote not found")
        return quote
    
    def create_anubandhan_plus_quote(self, quote: AnubandhanPlusQuoteCreate):
        """Create new Anubandhan Plus quote"""
        db_quote = AnubandhanPlusQuote(**quote.dict())
        self.db.add(db_quote)
        self.db.commit()
        self.db.refresh(db_quote)
        return db_quote
    
    def update_anubandhan_plus_quote(self, quote_id: int, quote_update: AnubandhanPlusQuoteUpdate):
        """Update Anubandhan Plus quote"""
        db_quote = self.get_anubandhan_plus_quote(quote_id)
        
        update_data = quote_update.dict(exclude_unset=True)
        
        for field, value in update_data.items():
            setattr(db_quote, field, value)
        
        db_quote.updated_at = now_ist()
        self.db.commit()
        self.db.refresh(db_quote)
        return db_quote
    
    def delete_anubandhan_plus_quote(self, quote_id: int):
        """Delete Anubandhan Plus quote"""
        db_quote = self.get_anubandhan_plus_quote(quote_id)
        self.db.delete(db_quote)
        self.db.commit()
        return {"message": "Anubandhan Plus quote deleted successfully"}
    
    def bulk_delete_anubandhan_plus_quotes(self, quote_ids: List[int]):
        """Delete multiple Anubandhan Plus quotes"""
        self.db.query(AnubandhanPlusQuote).filter(AnubandhanPlusQuote.id.in_(quote_ids)).delete(synchronize_session=False)
        self.db.commit()
        return {"message": f"{len(quote_ids)} Anubandhan Plus quotes deleted successfully"}
    
    # ==================== ANUBANDHAN QUOTES CRUD ====================
    
    def get_anubandhan_quotes(self, skip: int = 0, limit: Optional[int] = 100, search: Optional[str] = None):
        """Get all Anubandhan quotes with optional search"""
        query = self.db.query(AnubandhanQuote)
        
        if search:
            search_term = f"%{search}%"
            query = query.filter(
                or_(
                    AnubandhanQuote.quotation_ref_no.ilike(search_term),
                    AnubandhanQuote.company_name.ilike(search_term),
                    AnubandhanQuote.engine_no.ilike(search_term),
                    AnubandhanQuote.instance_id.ilike(search_term)
                )
            )
        
        query = query.order_by(AnubandhanQuote.created_date_time.desc()).offset(skip)
        
        # Only apply limit if it's not None
        if limit is not None:
            query = query.limit(limit)
        
        return query.all()
    
    def get_anubandhan_quote(self, quote_id: int):
        """Get single Anubandhan quote by ID"""
        quote = self.db.query(AnubandhanQuote).filter(AnubandhanQuote.id == quote_id).first()
        if not quote:
            raise HTTPException(status_code=404, detail="Anubandhan quote not found")
        return quote
    
    def create_anubandhan_quote(self, quote: AnubandhanQuoteCreate):
        """Create new Anubandhan quote"""
        db_quote = AnubandhanQuote(**quote.dict())
        self.db.add(db_quote)
        self.db.commit()
        self.db.refresh(db_quote)
        return db_quote
    
    def update_anubandhan_quote(self, quote_id: int, quote_update: AnubandhanQuoteUpdate):
        """Update Anubandhan quote"""
        db_quote = self.get_anubandhan_quote(quote_id)
        
        update_data = quote_update.dict(exclude_unset=True)
        
        for field, value in update_data.items():
            setattr(db_quote, field, value)
        
        db_quote.updated_at = now_ist()
        self.db.commit()
        self.db.refresh(db_quote)
        return db_quote
    
    def delete_anubandhan_quote(self, quote_id: int):
        """Delete Anubandhan quote"""
        db_quote = self.get_anubandhan_quote(quote_id)
        self.db.delete(db_quote)
        self.db.commit()
        return {"message": "Anubandhan quote deleted successfully"}
    
    def bulk_delete_anubandhan_quotes(self, quote_ids: List[int]):
        """Delete multiple Anubandhan quotes"""
        self.db.query(AnubandhanQuote).filter(AnubandhanQuote.id.in_(quote_ids)).delete(synchronize_session=False)
        self.db.commit()
        return {"message": f"{len(quote_ids)} Anubandhan quotes deleted successfully"}
    
    # ==================== BANDHAN PLUS QUOTES CRUD ====================
    
    def get_bandhan_plus_quotes(self, skip: int = 0, limit: Optional[int] = 100, search: Optional[str] = None):
        """Get all Bandhan Plus quotes with optional search"""
        query = self.db.query(BandhanPlusQuote)
        
        if search:
            search_term = f"%{search}%"
            query = query.filter(
                or_(
                    BandhanPlusQuote.quotation_ref_no.ilike(search_term),
                    BandhanPlusQuote.company_name.ilike(search_term),
                    BandhanPlusQuote.engine_no.ilike(search_term),
                    BandhanPlusQuote.instance_id.ilike(search_term)
                )
            )
        
        query = query.order_by(BandhanPlusQuote.created_date_time.desc()).offset(skip)
        
        # Only apply limit if it's not None
        if limit is not None:
            query = query.limit(limit)
        
        return query.all()
    
    def get_bandhan_plus_quote(self, quote_id: int):
        """Get single Bandhan Plus quote by ID"""
        quote = self.db.query(BandhanPlusQuote).filter(BandhanPlusQuote.id == quote_id).first()
        if not quote:
            raise HTTPException(status_code=404, detail="Bandhan Plus quote not found")
        return quote
    
    def create_bandhan_plus_quote(self, quote: BandhanPlusQuoteCreate):
        """Create new Bandhan Plus quote"""
        db_quote = BandhanPlusQuote(**quote.dict())
        self.db.add(db_quote)
        self.db.commit()
        self.db.refresh(db_quote)
        return db_quote
    
    def update_bandhan_plus_quote(self, quote_id: int, quote_update: BandhanPlusQuoteUpdate):
        """Update Bandhan Plus quote"""
        db_quote = self.get_bandhan_plus_quote(quote_id)
        
        update_data = quote_update.dict(exclude_unset=True)
        
        for field, value in update_data.items():
            setattr(db_quote, field, value)
        
        db_quote.updated_at = now_ist()
        self.db.commit()
        self.db.refresh(db_quote)
        return db_quote
    
    def delete_bandhan_plus_quote(self, quote_id: int):
        """Delete Bandhan Plus quote"""
        db_quote = self.get_bandhan_plus_quote(quote_id)
        self.db.delete(db_quote)
        self.db.commit()
        return {"message": "Bandhan Plus quote deleted successfully"}
    
    def bulk_delete_bandhan_plus_quotes(self, quote_ids: List[int]):
        """Delete multiple Bandhan Plus quotes"""
        self.db.query(BandhanPlusQuote).filter(BandhanPlusQuote.id.in_(quote_ids)).delete(synchronize_session=False)
        self.db.commit()
        return {"message": f"{len(quote_ids)} Bandhan Plus quotes deleted successfully"}
    
    # ==================== PULSE QUOTATIONS CRUD ====================
    
    def get_pulse_quotations(self, skip: int = 0, limit: Optional[int] = 100, search: Optional[str] = None):
        """Get all Pulse quotations with optional search"""
        query = self.db.query(PulseQuotation)
        
        if search:
            search_term = f"%{search}%"
            query = query.filter(
                or_(
                    PulseQuotation.quote_id.ilike(search_term),
                    PulseQuotation.account.ilike(search_term),
                    PulseQuotation.instance_id.ilike(search_term)
                )
            )
        
        query = query.order_by(PulseQuotation.creation_date.desc()).offset(skip)
        
        # Only apply limit if it's not None
        if limit is not None:
            query = query.limit(limit)
        
        return query.all()
    
    def get_pulse_quotation(self, quote_id: int):
        """Get single Pulse quotation by ID"""
        quote = self.db.query(PulseQuotation).filter(PulseQuotation.id == quote_id).first()
        if not quote:
            raise HTTPException(status_code=404, detail="Pulse quotation not found")
        return quote
    
    def create_pulse_quotation(self, quote: PulseQuotationCreate):
        """Create new Pulse quotation"""
        db_quote = PulseQuotation(**quote.dict())
        self.db.add(db_quote)
        self.db.commit()
        self.db.refresh(db_quote)
        return db_quote
    
    def update_pulse_quotation(self, quote_id: int, quote_update: PulseQuotationUpdate):
        """Update Pulse quotation"""
        db_quote = self.get_pulse_quotation(quote_id)
        
        update_data = quote_update.dict(exclude_unset=True)
        
        for field, value in update_data.items():
            setattr(db_quote, field, value)
        
        db_quote.updated_at = now_ist()
        self.db.commit()
        self.db.refresh(db_quote)
        return db_quote
    
    def delete_pulse_quotation(self, quote_id: int):
        """Delete Pulse quotation"""
        db_quote = self.get_pulse_quotation(quote_id)
        self.db.delete(db_quote)
        self.db.commit()
        return {"message": "Pulse quotation deleted successfully"}
    
    def bulk_delete_pulse_quotations(self, quote_ids: List[int]):
        """Delete multiple Pulse quotations"""
        self.db.query(PulseQuotation).filter(PulseQuotation.id.in_(quote_ids)).delete(synchronize_session=False)
        self.db.commit()
        return {"message": f"{len(quote_ids)} Pulse quotations deleted successfully"}
    
    # ==================== REGULAR BANDHAN CRUD ====================
    
    def get_regular_bandhan(self, skip: int = 0, limit: Optional[int] = 100, search: Optional[str] = None):
        """Get all Regular Bandhan records with optional search"""
        query = self.db.query(RegularBandhan)
        
        if search:
            search_term = f"%{search}%"
            query = query.filter(
                or_(
                    RegularBandhan.quotation_ref_no.ilike(search_term),
                    RegularBandhan.company_name.ilike(search_term),
                    RegularBandhan.engine_no.ilike(search_term),
                    RegularBandhan.instance_id.ilike(search_term)
                )
            )
        
        query = query.order_by(RegularBandhan.created_at.desc()).offset(skip)
        
        # Only apply limit if it's not None
        if limit is not None:
            query = query.limit(limit)
        
        return query.all()
    
    def get_regular_bandhan_record(self, record_id: int):
        """Get single Regular Bandhan record by ID"""
        record = self.db.query(RegularBandhan).filter(RegularBandhan.id == record_id).first()
        if not record:
            raise HTTPException(status_code=404, detail="Regular Bandhan record not found")
        return record
    
    def create_regular_bandhan(self, record: RegularBandhanCreate):
        """Create new Regular Bandhan record"""
        db_record = RegularBandhan(**record.dict())
        self.db.add(db_record)
        self.db.commit()
        self.db.refresh(db_record)
        return db_record
    
    def update_regular_bandhan(self, record_id: int, record_update: RegularBandhanUpdate):
        """Update Regular Bandhan record"""
        db_record = self.get_regular_bandhan_record(record_id)
        
        update_data = record_update.dict(exclude_unset=True)
        
        for field, value in update_data.items():
            setattr(db_record, field, value)
        
        db_record.updated_at = now_ist()
        self.db.commit()
        self.db.refresh(db_record)
        return db_record
    
    def delete_regular_bandhan(self, record_id: int):
        """Delete Regular Bandhan record"""
        db_record = self.get_regular_bandhan_record(record_id)
        self.db.delete(db_record)
        self.db.commit()
        return {"message": "Regular Bandhan record deleted successfully"}
    
    def bulk_delete_regular_bandhan(self, record_ids: List[int]):
        """Delete multiple Regular Bandhan records"""
        self.db.query(RegularBandhan).filter(RegularBandhan.id.in_(record_ids)).delete(synchronize_session=False)
        self.db.commit()
        return {"message": f"{len(record_ids)} Regular Bandhan records deleted successfully"}
    
    # ==================== LMS DATA CRUD ====================
    
    def get_lms_data(self, skip: int = 0, limit: Optional[int] = 100, search: Optional[str] = None):
        """Get all LMS data with optional search"""
        query = self.db.query(LMSData)
        
        if search:
            search_term = f"%{search}%"
            query = query.filter(
                or_(
                    LMSData.lead_number.ilike(search_term),
                    LMSData.account_name.ilike(search_term),
                    LMSData.lead_raised_by.ilike(search_term),
                    LMSData.instance_id.ilike(search_term)
                )
            )
        
        query = query.order_by(LMSData.lead_created_date.desc()).offset(skip)
        
        # Only apply limit if it's not None
        if limit is not None:
            query = query.limit(limit)
        
        return query.all()
    
    def get_lms_record(self, record_id: int):
        """Get single LMS record by ID"""
        record = self.db.query(LMSData).filter(LMSData.id == record_id).first()
        if not record:
            raise HTTPException(status_code=404, detail="LMS record not found")
        return record
    
    def create_lms_record(self, record: LMSDataCreate):
        """Create new LMS record"""
        db_record = LMSData(**record.dict())
        self.db.add(db_record)
        self.db.commit()
        self.db.refresh(db_record)
        return db_record
    
    def update_lms_record(self, record_id: int, record_update: LMSDataUpdate):
        """Update LMS record"""
        db_record = self.get_lms_record(record_id)
        
        update_data = record_update.dict(exclude_unset=True)
        
        for field, value in update_data.items():
            setattr(db_record, field, value)
        
        db_record.updated_at = now_ist()
        self.db.commit()
        self.db.refresh(db_record)
        return db_record
    
    def delete_lms_record(self, record_id: int):
        """Delete LMS record"""
        db_record = self.get_lms_record(record_id)
        self.db.delete(db_record)
        self.db.commit()
        return {"message": "LMS record deleted successfully"}
    
    def bulk_delete_lms_records(self, record_ids: List[int]):
        """Delete multiple LMS records"""
        self.db.query(LMSData).filter(LMSData.id.in_(record_ids)).delete(synchronize_session=False)
        self.db.commit()
        return {"message": f"{len(record_ids)} LMS records deleted successfully"}
    
    # ==================== OPEN SR LOAD REPORT CRUD ====================
    
    def get_open_sr_load_reports(self, skip: int = 0, limit: Optional[int] = 100, search: Optional[str] = None):
        """Get all Open SR Load Reports with optional search"""
        query = self.db.query(OpenSRLoadReport)
        
        if search:
            search_term = f"%{search}%"
            query = query.filter(
                or_(
                    OpenSRLoadReport.service_request_no.ilike(search_term),
                    OpenSRLoadReport.customer_name.ilike(search_term),
                    OpenSRLoadReport.engine_serial_no.ilike(search_term),
                    OpenSRLoadReport.instance_id.ilike(search_term),
                    OpenSRLoadReport.account.ilike(search_term)
                )
            )
        
        query = query.order_by(OpenSRLoadReport.sr_due_date.desc()).offset(skip)
        
        # Only apply limit if it's not None
        if limit is not None:
            query = query.limit(limit)
        
        return query.all()
    
    def get_open_sr_load_report(self, report_id: int):
        """Get single Open SR Load Report by ID"""
        report = self.db.query(OpenSRLoadReport).filter(OpenSRLoadReport.id == report_id).first()
        if not report:
            raise HTTPException(status_code=404, detail="Open SR Load Report not found")
        return report
    
    def create_open_sr_load_report(self, report: OpenSRLoadReportCreate):
        """Create new Open SR Load Report"""
        db_report = OpenSRLoadReport(**report.dict())
        self.db.add(db_report)
        self.db.commit()
        self.db.refresh(db_report)
        return db_report
    
    def update_open_sr_load_report(self, report_id: int, report_update: OpenSRLoadReportUpdate):
        """Update Open SR Load Report"""
        db_report = self.get_open_sr_load_report(report_id)
        
        update_data = report_update.dict(exclude_unset=True)
        
        for field, value in update_data.items():
            setattr(db_report, field, value)
        
        db_report.updated_at = now_ist()
        self.db.commit()
        self.db.refresh(db_report)
        return db_report
    
    def delete_open_sr_load_report(self, report_id: int):
        """Delete Open SR Load Report"""
        db_report = self.get_open_sr_load_report(report_id)
        self.db.delete(db_report)
        self.db.commit()
        return {"message": "Open SR Load Report deleted successfully"}
    
    def bulk_delete_open_sr_load_reports(self, report_ids: List[int]):
        """Delete multiple Open SR Load Reports"""
        self.db.query(OpenSRLoadReport).filter(OpenSRLoadReport.id.in_(report_ids)).delete(synchronize_session=False)
        self.db.commit()
        return {"message": f"{len(report_ids)} Open SR Load Reports deleted successfully"}
    
    # ==================== DATA RETRIEVAL BY INSTANCE ID ====================
    
    def get_amc_agreements_by_instance(self, instance_id: str):
        """Get all AMC agreements for an instance"""
        return self.db.query(AMCAgreement).filter(
            AMCAgreement.instance_id == instance_id
        ).order_by(desc(AMCAgreement.agreement_start_date)).all()
    
    def get_asset_detailed_by_instance(self, instance_id: str):
        """Get asset detailed records by instance ID"""
        return self.db.query(AssetDetailed).filter(
            AssetDetailed.instance_id == instance_id
        ).order_by(desc(AssetDetailed.created_at)).all()
    
    def get_asset_services_by_instance(self, instance_id: str):
        """Get asset service records by instance ID"""
        return self.db.query(AssetService).filter(
            AssetService.instance_id == instance_id
        ).order_by(desc(AssetService.last_oil_change_date)).all()
    
    def get_anubandhan_plus_quotes_by_instance(self, instance_id: str):
        """Get Anubandhan Plus quotes by instance ID"""
        return self.db.query(AnubandhanPlusQuote).filter(
            AnubandhanPlusQuote.instance_id == instance_id
        ).order_by(desc(AnubandhanPlusQuote.created_date_time)).all()
    
    def get_anubandhan_quotes_by_instance(self, instance_id: str):
        """Get Anubandhan quotes by instance ID"""
        return self.db.query(AnubandhanQuote).filter(
            AnubandhanQuote.instance_id == instance_id
        ).order_by(desc(AnubandhanQuote.created_date_time)).all()
    
    def get_bandhan_plus_quotes_by_instance(self, instance_id: str):
        """Get Bandhan Plus quotes by instance ID"""
        return self.db.query(BandhanPlusQuote).filter(
            BandhanPlusQuote.instance_id == instance_id
        ).order_by(desc(BandhanPlusQuote.created_date_time)).all()
    
    def get_pulse_quotations_by_instance(self, instance_id: str):
        """Get Pulse quotations by instance ID"""
        return self.db.query(PulseQuotation).filter(
            PulseQuotation.instance_id == instance_id
        ).order_by(desc(PulseQuotation.creation_date)).all()
    
    def get_regular_bandhan_by_instance(self, instance_id: str):
        """Get Regular Bandhan records by instance ID"""
        return self.db.query(RegularBandhan).filter(
            RegularBandhan.instance_id == instance_id
        ).order_by(desc(RegularBandhan.created_at)).all()
    
    def get_lms_data_by_instance(self, instance_id: str):
        """Get LMS data by instance ID"""
        return self.db.query(LMSData).filter(
            LMSData.instance_id == instance_id
        ).order_by(desc(LMSData.lead_created_date)).all()
    
    @staticmethod
    def _sr_closed_in_maxttr():
        """EXISTS(...) that is true when an Open SR row has already been closed.

        The 'MaxTTR - Oil Change SR Zero Labour Flag' file IS the closure
        record — every row of it carries a real SR CLOSE DATE — so an SR is
        closed exactly when the same (instance_id, sr_number) is present there.
        Matched on BOTH columns, never on the SR number alone: that pair is the
        upsert key of both tables."""
        return exists().where(and_(
            MaxTTROilChangeSRZeroLabourFlag.instance_id == OpenSRLoadReport.instance_id,
            MaxTTROilChangeSRZeroLabourFlag.sr_number == OpenSRLoadReport.service_request_no,
        ))

    def get_open_sr_load_reports_by_instance(self, instance_id: str, include_closed: bool = False):
        """Get the STILL-OPEN Open SR Load Report rows of one instance.

        Every SR the Open SR file has ever carried is kept in the table, so
        "open" is decided here, at read time: a row is returned only while no
        MaxTTR row closes it. include_closed=True skips that check and returns
        the customer's full raw SR record — the Customers Data Hub only."""
        query = self.db.query(OpenSRLoadReport).filter(
            OpenSRLoadReport.instance_id == instance_id
        )
        if not include_closed:
            query = query.filter(~self._sr_closed_in_maxttr())
        return query.order_by(desc(OpenSRLoadReport.sr_due_date)).all()

    # ==================== OPEN SR DATA ====================

    def get_open_sr_data_count(self, search: Optional[str] = None):
        """Get total count of MaxTTR - Oil Change SR rows with optional search"""
        query = self.db.query(MaxTTROilChangeSRZeroLabourFlag)
        if search:
            search_term = f"%{search}%"
            query = query.filter(
                or_(
                    MaxTTROilChangeSRZeroLabourFlag.instance_id.ilike(search_term),
                    MaxTTROilChangeSRZeroLabourFlag.branch_id.ilike(search_term),
                    MaxTTROilChangeSRZeroLabourFlag.branch_name.ilike(search_term),
                    MaxTTROilChangeSRZeroLabourFlag.account_name.ilike(search_term),
                    MaxTTROilChangeSRZeroLabourFlag.sr_number.ilike(search_term),
                    MaxTTROilChangeSRZeroLabourFlag.sr_type.ilike(search_term),
                    MaxTTROilChangeSRZeroLabourFlag.engine_serial_no.ilike(search_term),
                    MaxTTROilChangeSRZeroLabourFlag.oil_change_flag.ilike(search_term),
                    MaxTTROilChangeSRZeroLabourFlag.zero_labour_flag.ilike(search_term)
                )
            )
        return query.count()

    def get_open_sr_data(self, skip: int = 0, limit: Optional[int] = 100, search: Optional[str] = None):
        """Get all MaxTTR - Oil Change SR rows with optional search + pagination"""
        query = self.db.query(MaxTTROilChangeSRZeroLabourFlag)
        if search:
            search_term = f"%{search}%"
            query = query.filter(
                or_(
                    MaxTTROilChangeSRZeroLabourFlag.instance_id.ilike(search_term),
                    MaxTTROilChangeSRZeroLabourFlag.branch_id.ilike(search_term),
                    MaxTTROilChangeSRZeroLabourFlag.branch_name.ilike(search_term),
                    MaxTTROilChangeSRZeroLabourFlag.account_name.ilike(search_term),
                    MaxTTROilChangeSRZeroLabourFlag.sr_number.ilike(search_term),
                    MaxTTROilChangeSRZeroLabourFlag.sr_type.ilike(search_term),
                    MaxTTROilChangeSRZeroLabourFlag.engine_serial_no.ilike(search_term),
                    MaxTTROilChangeSRZeroLabourFlag.oil_change_flag.ilike(search_term),
                    MaxTTROilChangeSRZeroLabourFlag.zero_labour_flag.ilike(search_term)
                )
            )
        query = query.order_by(desc(MaxTTROilChangeSRZeroLabourFlag.updated_at)).offset(skip)
        if limit is not None:
            query = query.limit(limit)
        return [self._open_sr_data_to_dict(r) for r in query.all()]

    def get_open_sr_data_by_instance(self, instance_id: str):
        """Get MaxTTR - Oil Change SR rows by instance ID (one row per instance)"""
        return self.db.query(MaxTTROilChangeSRZeroLabourFlag).filter(
            MaxTTROilChangeSRZeroLabourFlag.instance_id == instance_id
        ).all()

    def delete_open_sr_data(self, record_id: int):
        """Delete one MaxTTR - Oil Change SR row"""
        rec = self.db.query(MaxTTROilChangeSRZeroLabourFlag).filter(MaxTTROilChangeSRZeroLabourFlag.id == record_id).first()
        if not rec:
            raise HTTPException(status_code=404, detail="MaxTTR - Oil Change SR record not found")
        self.db.delete(rec)
        self.db.commit()
        return {"message": "MaxTTR - Oil Change SR record deleted successfully"}

    def bulk_delete_open_sr_data(self, record_ids: List[int]):
        """Delete multiple MaxTTR - Oil Change SR rows"""
        self.db.query(MaxTTROilChangeSRZeroLabourFlag).filter(MaxTTROilChangeSRZeroLabourFlag.id.in_(record_ids)).delete(synchronize_session=False)
        self.db.commit()
        return {"message": f"{len(record_ids)} MaxTTR - Oil Change SR records deleted successfully"}

    def _open_sr_data_to_dict(self, rec):
        if not rec:
            return None
        return {
            "id": rec.id,
            "instance_id": rec.instance_id,
            "zone_name": rec.zone_name,
            "asm_name": rec.asm_name,
            "sd_id": rec.sd_id,
            "sd_name": rec.sd_name,
            "branch_id": rec.branch_id,
            "branch_name": rec.branch_name,
            "application_code": rec.application_code,
            "engine_serial_no": rec.engine_serial_no,
            "engine_model": rec.engine_model,
            "segment": rec.segment,
            "product_segment": rec.product_segment,
            "account_name": rec.account_name,
            "sr_number": rec.sr_number,
            "sr_type": rec.sr_type,
            "sr_subtype": rec.sr_subtype,
            "sr_open_date": rec.sr_open_date,
            "sr_close_date": rec.sr_close_date,
            "mode_of_sr": rec.mode_of_sr,
            "zero_labour_flag": rec.zero_labour_flag,
            "oil_change_flag": rec.oil_change_flag,
            "count_of_tasks": rec.count_of_tasks,
            "extra_data": rec.extra_data,
            "created_at": rec.created_at,
            "updated_at": rec.updated_at
        }
    
    # ==================== RESPONSE TIME & MAXTTR ====================

    def _response_time_maxttr_search_filter(self, query, search: Optional[str]):
        if search:
            search_term = f"%{search}%"
            query = query.filter(
                or_(
                    ResponseTimeMaxTTR.instance_id.ilike(search_term),
                    ResponseTimeMaxTTR.branch_id.ilike(search_term),
                    ResponseTimeMaxTTR.branch_name.ilike(search_term),
                    ResponseTimeMaxTTR.account_name.ilike(search_term),
                    ResponseTimeMaxTTR.sr_number.ilike(search_term),
                    ResponseTimeMaxTTR.sr_type.ilike(search_term),
                    ResponseTimeMaxTTR.engine_serial_no.ilike(search_term),
                    ResponseTimeMaxTTR.se_name.ilike(search_term),
                    ResponseTimeMaxTTR.se_ticket_num.ilike(search_term)
                )
            )
        return query

    def get_response_time_maxttr_count(self, search: Optional[str] = None):
        """Get total count of Response Time & MaxTTR rows with optional search"""
        query = self._response_time_maxttr_search_filter(self.db.query(ResponseTimeMaxTTR), search)
        return query.count()

    def get_response_time_maxttr(self, skip: int = 0, limit: Optional[int] = 100, search: Optional[str] = None):
        """Get all Response Time & MaxTTR rows with optional search + pagination"""
        query = self._response_time_maxttr_search_filter(self.db.query(ResponseTimeMaxTTR), search)
        query = query.order_by(desc(ResponseTimeMaxTTR.updated_at)).offset(skip)
        if limit is not None:
            query = query.limit(limit)
        return [self._response_time_maxttr_to_dict(r) for r in query.all()]

    def get_response_time_maxttr_by_instance(self, instance_id: str):
        """Get Response Time & MaxTTR rows by instance ID"""
        return self.db.query(ResponseTimeMaxTTR).filter(
            ResponseTimeMaxTTR.instance_id == instance_id
        ).order_by(desc(ResponseTimeMaxTTR.sr_open_date)).all()

    def delete_response_time_maxttr(self, record_id: int):
        """Delete one Response Time & MaxTTR row"""
        rec = self.db.query(ResponseTimeMaxTTR).filter(ResponseTimeMaxTTR.id == record_id).first()
        if not rec:
            raise HTTPException(status_code=404, detail="Response Time & MaxTTR record not found")
        self.db.delete(rec)
        self.db.commit()
        return {"message": "Response Time & MaxTTR record deleted successfully"}

    def bulk_delete_response_time_maxttr(self, record_ids: List[int]):
        """Delete multiple Response Time & MaxTTR rows"""
        self.db.query(ResponseTimeMaxTTR).filter(ResponseTimeMaxTTR.id.in_(record_ids)).delete(synchronize_session=False)
        self.db.commit()
        return {"message": f"{len(record_ids)} Response Time & MaxTTR records deleted successfully"}

    def _response_time_maxttr_to_dict(self, rec):
        if not rec:
            return None
        return {
            "id": rec.id,
            "instance_id": rec.instance_id,
            "zone_name": rec.zone_name,
            "asm_name": rec.asm_name,
            "sd_id": rec.sd_id,
            "sd_name": rec.sd_name,
            "branch_id": rec.branch_id,
            "branch_name": rec.branch_name,
            "application_code": rec.application_code,
            "engine_serial_no": rec.engine_serial_no,
            "segment": rec.segment,
            "product_segment": rec.product_segment,
            "goem_oem": rec.goem_oem,
            "account_name": rec.account_name,
            "sr_number": rec.sr_number,
            "sr_type": rec.sr_type,
            "sr_subtype": rec.sr_subtype,
            "sr_open_date": rec.sr_open_date,
            "sr_task_start_date": rec.sr_task_start_date,
            "sr_task_end_date": rec.sr_task_end_date,
            "sr_close_date": rec.sr_close_date,
            "engineer_remarks": rec.engineer_remarks,
            "se_name": rec.se_name,
            "se_ticket_num": rec.se_ticket_num,
            "response_time_range_in_hrs": rec.response_time_range_in_hrs,
            "response_time": rec.response_time,
            "maxttr_on_task_closed_in_hrs": rec.maxttr_on_task_closed_in_hrs,
            "maxttr_on_sr_closed_in_hrs": rec.maxttr_on_sr_closed_in_hrs,
            "extra_data": rec.extra_data,
            "created_at": rec.created_at,
            "updated_at": rec.updated_at
        }

    # ==================== CDI DETAIL REPORT ====================
    # Standalone table (no instance_id link): filled ONLY by the 'CDI Detail
    # Report' import and read back by the Customer page.

    def _cdi_detail_report_search_filter(self, query, search: Optional[str]):
        if search:
            search_term = f"%{search}%"
            query = query.filter(
                or_(
                    CDIDetailReport.instance_id.ilike(search_term),
                    CDIDetailReport.sr_number.ilike(search_term),
                    CDIDetailReport.branch_name.ilike(search_term),
                    CDIDetailReport.x_technician_id.ilike(search_term),
                    CDIDetailReport.x_technician_name.ilike(search_term),
                    CDIDetailReport.cdi_category.ilike(search_term),
                    CDIDetailReport.x_account_name.ilike(search_term),
                    CDIDetailReport.overall_experience.ilike(search_term)
                )
            )
        return query

    def get_cdi_detail_report_count(self, search: Optional[str] = None):
        """Get total count of CDI Detail Report rows with optional search"""
        query = self._cdi_detail_report_search_filter(self.db.query(CDIDetailReport), search)
        return query.count()

    def get_cdi_detail_report(self, skip: int = 0, limit: Optional[int] = 100, search: Optional[str] = None):
        """Get all CDI Detail Report rows with optional search + pagination"""
        query = self._cdi_detail_report_search_filter(self.db.query(CDIDetailReport), search)
        query = query.order_by(desc(CDIDetailReport.updated_at)).offset(skip)
        if limit is not None:
            query = query.limit(limit)
        return [self._cdi_detail_report_to_dict(r) for r in query.all()]

    def delete_cdi_detail_report(self, record_id: int):
        """Delete one CDI Detail Report row"""
        rec = self.db.query(CDIDetailReport).filter(CDIDetailReport.id == record_id).first()
        if not rec:
            raise HTTPException(status_code=404, detail="CDI Detail Report record not found")
        self.db.delete(rec)
        self.db.commit()
        return {"message": "CDI Detail Report record deleted successfully"}

    def bulk_delete_cdi_detail_report(self, record_ids: List[int]):
        """Delete multiple CDI Detail Report rows"""
        self.db.query(CDIDetailReport).filter(CDIDetailReport.id.in_(record_ids)).delete(synchronize_session=False)
        self.db.commit()
        return {"message": f"{len(record_ids)} CDI Detail Report records deleted successfully"}

    def _cdi_detail_report_to_dict(self, rec):
        if not rec:
            return None
        return {
            "id": rec.id,
            "instance_id": rec.instance_id,
            "sr_number": rec.sr_number,
            "branch_name": rec.branch_name,
            "x_technician_id": rec.x_technician_id,
            "x_technician_name": rec.x_technician_name,
            "cdi_category": rec.cdi_category,
            "x_account_name": rec.x_account_name,
            "feedback_customer_name": rec.feedback_customer_name,
            "feedback_customer_number": rec.feedback_customer_number,
            "overall_experience": rec.overall_experience,
            "activity_end_date": rec.activity_end_date,
            "extra_data": rec.extra_data,
            "created_at": rec.created_at,
            "updated_at": rec.updated_at
        }

    # ==================== EFSR REPORT ====================
    # Standalone table (no instance_id link): filled ONLY by the 'EFSR Report'
    # import and read back by the Customer page.

    def _efsr_report_search_filter(self, query, search: Optional[str]):
        if search:
            search_term = f"%{search}%"
            query = query.filter(
                or_(
                    EFSRReport.instance_id.ilike(search_term),
                    EFSRReport.service_request_no.ilike(search_term),
                    EFSRReport.appointment_number.ilike(search_term),
                    EFSRReport.sd_branch_code.ilike(search_term),
                    EFSRReport.sr_type.ilike(search_term),
                    EFSRReport.sr_status.ilike(search_term),
                    EFSRReport.service_engineer_name.ilike(search_term),
                    EFSRReport.service_engineer_uid.ilike(search_term),
                    EFSRReport.account.ilike(search_term)
                )
            )
        return query

    def get_efsr_report_count(self, search: Optional[str] = None):
        """Get total count of EFSR Report rows with optional search"""
        query = self._efsr_report_search_filter(self.db.query(EFSRReport), search)
        return query.count()

    def get_efsr_report(self, skip: int = 0, limit: Optional[int] = 100, search: Optional[str] = None):
        """Get all EFSR Report rows with optional search + pagination"""
        query = self._efsr_report_search_filter(self.db.query(EFSRReport), search)
        query = query.order_by(desc(EFSRReport.updated_at)).offset(skip)
        if limit is not None:
            query = query.limit(limit)
        return [self._efsr_report_to_dict(r) for r in query.all()]

    def delete_efsr_report(self, record_id: int):
        """Delete one EFSR Report row"""
        rec = self.db.query(EFSRReport).filter(EFSRReport.id == record_id).first()
        if not rec:
            raise HTTPException(status_code=404, detail="EFSR Report record not found")
        self.db.delete(rec)
        self.db.commit()
        return {"message": "EFSR Report record deleted successfully"}

    def bulk_delete_efsr_report(self, record_ids: List[int]):
        """Delete multiple EFSR Report rows"""
        self.db.query(EFSRReport).filter(EFSRReport.id.in_(record_ids)).delete(synchronize_session=False)
        self.db.commit()
        return {"message": f"{len(record_ids)} EFSR Report records deleted successfully"}

    def _efsr_report_to_dict(self, rec):
        if not rec:
            return None
        return {
            "id": rec.id,
            "instance_id": rec.instance_id,
            "service_request_no": rec.service_request_no,
            "appointment_number": rec.appointment_number,
            "sd_branch_code": rec.sd_branch_code,
            "sr_type": rec.sr_type,
            "task_assigned_date": rec.task_assigned_date,
            "task_end_date": rec.task_end_date,
            "sr_closed_date": rec.sr_closed_date,
            "sr_status": rec.sr_status,
            "service_engineer_name": rec.service_engineer_name,
            "service_engineer_uid": rec.service_engineer_uid,
            "account": rec.account,
            "installation_site_address": rec.installation_site_address,
            "customer_name": rec.customer_name,
            "customer_contact_number": rec.customer_contact_number,
            "extra_data": rec.extra_data,
            "created_at": rec.created_at,
            "updated_at": rec.updated_at
        }

    # ==================== LMS INSIA ====================
    # Second LMS layout, keyed on LEAD NUMBER. The file has no genset column,
    # so instance_id is resolved from LEAD SR NUMBER at import time and is null
    # on leads whose SR has not been uploaded yet. Read back by the Customer
    # page and by the per-instance data hub.

    def _lms_insia_search_filter(self, query, search: Optional[str]):
        if search:
            search_term = f"%{search}%"
            query = query.filter(
                or_(
                    LMSInsia.lead_number.ilike(search_term),
                    LMSInsia.instance_id.ilike(search_term),
                    LMSInsia.branch_id.ilike(search_term),
                    LMSInsia.account_name.ilike(search_term),
                    LMSInsia.lead_sr_number.ilike(search_term),
                    LMSInsia.service_engineer_name.ilike(search_term)
                )
            )
        return query

    def get_lms_insia_count(self, search: Optional[str] = None):
        """Get total count of LMS Data from Insia rows with optional search"""
        query = self._lms_insia_search_filter(self.db.query(LMSInsia), search)
        return query.count()

    def get_lms_insia(self, skip: int = 0, limit: Optional[int] = 100, search: Optional[str] = None):
        """Get all LMS Data from Insia rows with optional search + pagination"""
        query = self._lms_insia_search_filter(self.db.query(LMSInsia), search)
        query = query.order_by(desc(LMSInsia.updated_at)).offset(skip)
        if limit is not None:
            query = query.limit(limit)
        return [self._lms_insia_to_dict(r) for r in query.all()]

    def get_lms_insia_by_instance(self, instance_id: str):
        """Get LMS Data from Insia rows by instance ID"""
        return self.db.query(LMSInsia).filter(LMSInsia.instance_id == instance_id).all()

    def delete_lms_insia(self, record_id: int):
        """Delete one LMS Data from Insia row"""
        rec = self.db.query(LMSInsia).filter(LMSInsia.id == record_id).first()
        if not rec:
            raise HTTPException(status_code=404, detail="LMS Data from Insia record not found")
        self.db.delete(rec)
        self.db.commit()
        return {"message": "LMS Data from Insia record deleted successfully"}

    def bulk_delete_lms_insia(self, record_ids: List[int]):
        """Delete multiple LMS Data from Insia rows"""
        self.db.query(LMSInsia).filter(LMSInsia.id.in_(record_ids)).delete(synchronize_session=False)
        self.db.commit()
        return {"message": f"{len(record_ids)} LMS Data from Insia records deleted successfully"}

    def _lms_insia_to_dict(self, rec):
        if not rec:
            return None
        return {
            "id": rec.id,
            "instance_id": rec.instance_id,
            "lead_number": rec.lead_number,
            "lead_created_date": rec.lead_created_date,
            "branch_id": rec.branch_id,
            "account_name": rec.account_name,
            "lead_sr_number": rec.lead_sr_number,
            "service_engineer_name": rec.service_engineer_name,
            "order_creation_date": rec.order_creation_date,
            "extra_data": rec.extra_data,
            "created_at": rec.created_at,
            "updated_at": rec.updated_at
        }

    # ==================== AMC AGREEMENT EXPIRY PLANNER ====================
    # Instance-linked table: filled by the 'AMC Agreement Expiry Planner'
    # import, which also tops up the customer master. Read back by the
    # Customer page and by the per-instance data hub.

    def _amc_expiry_planner_search_filter(self, query, search: Optional[str]):
        if search:
            search_term = f"%{search}%"
            query = query.filter(
                or_(
                    AMCExpiryPlanner.instance_id.ilike(search_term),
                    AMCExpiryPlanner.agreement_number.ilike(search_term),
                    AMCExpiryPlanner.branch_id.ilike(search_term),
                    AMCExpiryPlanner.account_name.ilike(search_term),
                    AMCExpiryPlanner.installation_site_address.ilike(search_term)
                )
            )
        return query

    def get_amc_expiry_planner_count(self, search: Optional[str] = None):
        """Get total count of AMC Agreement Expiry Planner rows with optional search"""
        query = self._amc_expiry_planner_search_filter(self.db.query(AMCExpiryPlanner), search)
        return query.count()

    def get_amc_expiry_planner(self, skip: int = 0, limit: Optional[int] = 100,
                               search: Optional[str] = None):
        """Get all AMC Agreement Expiry Planner rows with optional search + pagination"""
        query = self._amc_expiry_planner_search_filter(self.db.query(AMCExpiryPlanner), search)
        # Soonest expiry first — the whole point of a planner. Rows with no end
        # date sort last rather than heading the list. The nulls-last flag has
        # to be a CASE: SQL Server has no boolean type, so ordering directly on
        # `col.is_(None)` is a syntax error ("Incorrect syntax near 'IS'").
        query = query.order_by(
            case((AMCExpiryPlanner.agreement_end_date.is_(None), 1), else_=0),
            AMCExpiryPlanner.agreement_end_date.asc()
        ).offset(skip)
        if limit is not None:
            query = query.limit(limit)
        return [self._amc_expiry_planner_to_dict(r) for r in query.all()]

    def get_cdi_detail_report_by_instance(self, instance_id: str):
        """Get CDI Detail Report rows by instance ID (ASSET NUMBER in the file)"""
        return self.db.query(CDIDetailReport).filter(
            CDIDetailReport.instance_id == instance_id
        ).order_by(desc(CDIDetailReport.activity_end_date)).all()

    def get_efsr_report_by_instance(self, instance_id: str):
        """Get EFSR Report rows by instance ID"""
        return self.db.query(EFSRReport).filter(
            EFSRReport.instance_id == instance_id
        ).order_by(desc(EFSRReport.task_assigned_date)).all()

    def get_amc_expiry_planner_by_instance(self, instance_id: str):
        """Get AMC Agreement Expiry Planner rows by instance ID"""
        return self.db.query(AMCExpiryPlanner).filter(
            AMCExpiryPlanner.instance_id == instance_id
        ).order_by(desc(AMCExpiryPlanner.agreement_end_date)).all()

    def delete_amc_expiry_planner(self, record_id: int):
        """Delete one AMC Agreement Expiry Planner row"""
        rec = self.db.query(AMCExpiryPlanner).filter(AMCExpiryPlanner.id == record_id).first()
        if not rec:
            raise HTTPException(status_code=404,
                                detail="AMC Agreement Expiry Planner record not found")
        self.db.delete(rec)
        self.db.commit()
        return {"message": "AMC Agreement Expiry Planner record deleted successfully"}

    def bulk_delete_amc_expiry_planner(self, record_ids: List[int]):
        """Delete multiple AMC Agreement Expiry Planner rows"""
        self.db.query(AMCExpiryPlanner).filter(
            AMCExpiryPlanner.id.in_(record_ids)).delete(synchronize_session=False)
        self.db.commit()
        return {"message": f"{len(record_ids)} AMC Agreement Expiry Planner records deleted successfully"}

    def _amc_expiry_planner_to_dict(self, rec):
        if not rec:
            return None
        return {
            "id": rec.id,
            "instance_id": rec.instance_id,
            "agreement_number": rec.agreement_number,
            "branch_id": rec.branch_id,
            "account_name": rec.account_name,
            "installation_site_address": rec.installation_site_address,
            "agreement_end_date": rec.agreement_end_date,
            "extra_data": rec.extra_data,
            "created_at": rec.created_at,
            "updated_at": rec.updated_at
        }

    # ==================== ALL INVOICE DETAILED REPORT ====================
    # Instance-linked table: filled by the 'All Invoice Detailed Report' import.
    # Only its Service lines carry an Instance Id (OTC / Agreement lines have no
    # genset), so the per-instance hub shows the service invoices of that genset
    # while the Customer page grid shows every line in the file.

    def _all_invoice_search_filter(self, query, search: Optional[str]):
        if search:
            search_term = f"%{search}%"
            query = query.filter(
                or_(
                    AllInvoiceReport.invoice_number.ilike(search_term),
                    AllInvoiceReport.instance_id.ilike(search_term),
                    AllInvoiceReport.branch_id.ilike(search_term),
                    AllInvoiceReport.branch_name.ilike(search_term),
                    AllInvoiceReport.account_name.ilike(search_term),
                    AllInvoiceReport.invoice_type.ilike(search_term),
                    AllInvoiceReport.invoice_segment.ilike(search_term),
                    AllInvoiceReport.invoice_status.ilike(search_term)
                )
            )
        return query

    def get_all_invoice_report_count(self, search: Optional[str] = None):
        """Get total count of All Invoice Detailed Report rows with optional search"""
        query = self._all_invoice_search_filter(self.db.query(AllInvoiceReport), search)
        return query.count()

    def get_all_invoice_report(self, skip: int = 0, limit: Optional[int] = 100,
                               search: Optional[str] = None):
        """Get all All Invoice Detailed Report rows with optional search + pagination"""
        query = self._all_invoice_search_filter(self.db.query(AllInvoiceReport), search)
        # Newest invoice first; undated rows last rather than heading the list.
        # The nulls-last flag has to be a CASE: SQL Server has no boolean type,
        # so ordering directly on `col.is_(None)` is a syntax error.
        query = query.order_by(
            case((AllInvoiceReport.invoice_date.is_(None), 1), else_=0),
            AllInvoiceReport.invoice_date.desc()
        ).offset(skip)
        if limit is not None:
            query = query.limit(limit)
        return [self._all_invoice_report_to_dict(r) for r in query.all()]

    def get_all_invoice_report_by_instance(self, instance_id: str):
        """Get All Invoice Detailed Report rows by instance ID"""
        return self.db.query(AllInvoiceReport).filter(
            AllInvoiceReport.instance_id == instance_id
        ).order_by(desc(AllInvoiceReport.invoice_date)).all()

    def delete_all_invoice_report(self, record_id: int):
        """Delete one All Invoice Detailed Report row"""
        rec = self.db.query(AllInvoiceReport).filter(AllInvoiceReport.id == record_id).first()
        if not rec:
            raise HTTPException(status_code=404,
                                detail="All Invoice Detailed Report record not found")
        self.db.delete(rec)
        self.db.commit()
        return {"message": "All Invoice Detailed Report record deleted successfully"}

    def bulk_delete_all_invoice_report(self, record_ids: List[int]):
        """Delete multiple All Invoice Detailed Report rows"""
        self.db.query(AllInvoiceReport).filter(
            AllInvoiceReport.id.in_(record_ids)).delete(synchronize_session=False)
        self.db.commit()
        return {"message": f"{len(record_ids)} All Invoice Detailed Report records deleted successfully"}

    def _all_invoice_report_to_dict(self, rec):
        if not rec:
            return None
        return {
            "id": rec.id,
            "invoice_number": rec.invoice_number,
            "instance_id": rec.instance_id,
            "branch_id": rec.branch_id,
            "branch_name": rec.branch_name,
            "account_name": rec.account_name,
            "invoice_date": rec.invoice_date,
            "invoice_status": rec.invoice_status,
            "invoice_segment": rec.invoice_segment,
            "invoice_type": rec.invoice_type,
            "invoice_amount": rec.invoice_amount,
            "extra_data": rec.extra_data,
            "created_at": rec.created_at,
            "updated_at": rec.updated_at
        }

    # ==================== COMPLETE CUSTOMER DATA ====================
    
    def get_customer_complete_data(self, instance_id: str, include_closed: bool = False):
        """Get customer with ALL data from all tables based on instance_id.

        include_closed applies to the Open SR Load Reports only: False (the
        default, used by the Drive / Non-Drive pages) returns just the SRs that
        are still open — i.e. not yet closed in the MaxTTR file. True (Customers
        Data Hub) returns the customer's full raw SR record instead."""
        customer = self.get_customer_by_instance_id(instance_id)
        if not customer:
            return None

        # Run each count query ONCE and reuse for both the per-table count field
        # and the total_records sum (was: every count executed twice).
        amc_agreements_count = self.db.query(AMCAgreement).filter(AMCAgreement.instance_id == instance_id).count()
        asset_detailed_count = self.db.query(AssetDetailed).filter(AssetDetailed.instance_id == instance_id).count()
        asset_services_count = self.db.query(AssetService).filter(AssetService.instance_id == instance_id).count()
        anubandhan_plus_quotes_count = self.db.query(AnubandhanPlusQuote).filter(AnubandhanPlusQuote.instance_id == instance_id).count()
        anubandhan_quotes_count = self.db.query(AnubandhanQuote).filter(AnubandhanQuote.instance_id == instance_id).count()
        bandhan_plus_quotes_count = self.db.query(BandhanPlusQuote).filter(BandhanPlusQuote.instance_id == instance_id).count()
        pulse_quotations_count = self.db.query(PulseQuotation).filter(PulseQuotation.instance_id == instance_id).count()
        regular_bandhan_count = self.db.query(RegularBandhan).filter(RegularBandhan.instance_id == instance_id).count()
        lms_data_count = self.db.query(LMSData).filter(LMSData.instance_id == instance_id).count()
        open_sr_query = self.db.query(OpenSRLoadReport).filter(OpenSRLoadReport.instance_id == instance_id)
        if not include_closed:
            open_sr_query = open_sr_query.filter(~self._sr_closed_in_maxttr())
        open_sr_load_reports_count = open_sr_query.count()
        amc_expiry_planner_count = self.db.query(AMCExpiryPlanner).filter(AMCExpiryPlanner.instance_id == instance_id).count()
        cdi_detail_report_count = self.db.query(CDIDetailReport).filter(CDIDetailReport.instance_id == instance_id).count()
        efsr_report_count = self.db.query(EFSRReport).filter(EFSRReport.instance_id == instance_id).count()
        lms_insia_count = self.db.query(LMSInsia).filter(LMSInsia.instance_id == instance_id).count()
        all_invoice_report_count = self.db.query(AllInvoiceReport).filter(AllInvoiceReport.instance_id == instance_id).count()

        complete_data = {
            "customer": self._customer_to_dict(customer),
            "amc_agreements": [self._amc_agreement_to_dict(a) for a in self.get_amc_agreements_by_instance(instance_id)],
            "asset_detailed": [self._asset_detailed_to_dict(a) for a in self.get_asset_detailed_by_instance(instance_id)],
            "asset_services": [self._asset_service_to_dict(a) for a in self.get_asset_services_by_instance(instance_id)],
            "anubandhan_plus_quotes": [self._anubandhan_plus_to_dict(a) for a in self.get_anubandhan_plus_quotes_by_instance(instance_id)],
            "anubandhan_quotes": [self._anubandhan_to_dict(a) for a in self.get_anubandhan_quotes_by_instance(instance_id)],
            "bandhan_plus_quotes": [self._bandhan_plus_to_dict(a) for a in self.get_bandhan_plus_quotes_by_instance(instance_id)],
            "pulse_quotations": [self._pulse_to_dict(a) for a in self.get_pulse_quotations_by_instance(instance_id)],
            "regular_bandhan": [self._regular_bandhan_to_dict(a) for a in self.get_regular_bandhan_by_instance(instance_id)],
            "lms_data": [self._lms_data_to_dict(a) for a in self.get_lms_data_by_instance(instance_id)],
            "open_sr_load_reports": [self._open_sr_load_report_to_dict(a) for a in self.get_open_sr_load_reports_by_instance(instance_id, include_closed)],
            "open_sr_data": [self._open_sr_data_to_dict(a) for a in self.get_open_sr_data_by_instance(instance_id)],
            "response_time_maxttr": [self._response_time_maxttr_to_dict(a) for a in self.get_response_time_maxttr_by_instance(instance_id)],
            "amc_expiry_planner": [self._amc_expiry_planner_to_dict(a) for a in self.get_amc_expiry_planner_by_instance(instance_id)],
            "cdi_detail_report": [self._cdi_detail_report_to_dict(a) for a in self.get_cdi_detail_report_by_instance(instance_id)],
            "efsr_report": [self._efsr_report_to_dict(a) for a in self.get_efsr_report_by_instance(instance_id)],
            "lms_insia": [self._lms_insia_to_dict(a) for a in self.get_lms_insia_by_instance(instance_id)],
            "all_invoice_report": [self._all_invoice_report_to_dict(a) for a in self.get_all_invoice_report_by_instance(instance_id)],

            "amc_agreements_count": amc_agreements_count,
            "asset_detailed_count": asset_detailed_count,
            "asset_services_count": asset_services_count,
            "anubandhan_plus_quotes_count": anubandhan_plus_quotes_count,
            "anubandhan_quotes_count": anubandhan_quotes_count,
            "bandhan_plus_quotes_count": bandhan_plus_quotes_count,
            "pulse_quotations_count": pulse_quotations_count,
            "regular_bandhan_count": regular_bandhan_count,
            "lms_data_count": lms_data_count,
            "open_sr_load_reports_count": open_sr_load_reports_count,
            "amc_expiry_planner_count": amc_expiry_planner_count,
            "cdi_detail_report_count": cdi_detail_report_count,
            "efsr_report_count": efsr_report_count,
            "lms_insia_count": lms_insia_count,
            "all_invoice_report_count": all_invoice_report_count,
            "total_records": (
                amc_agreements_count +
                asset_detailed_count +
                asset_services_count +
                anubandhan_plus_quotes_count +
                anubandhan_quotes_count +
                bandhan_plus_quotes_count +
                pulse_quotations_count +
                regular_bandhan_count +
                lms_data_count +
                open_sr_load_reports_count +
                amc_expiry_planner_count +
                cdi_detail_report_count +
                efsr_report_count +
                lms_insia_count +
                all_invoice_report_count
            )
        }
        
        return complete_data
    
    # ==================== CONVERSION METHODS ====================
    
    def _customer_to_dict(self, customer):
        if not customer:
            return {}
        return {
            "id": customer.id,
            "instance_id": customer.instance_id,
            "customer_name": customer.customer_name,
            "phone_number": customer.phone_number,
            "email": customer.email,
            "location": customer.location,
            "branch_id": customer.branch_id,
            "last_updated_by": customer.last_updated_by,
            "created_at": customer.created_at,
            "updated_at": customer.updated_at
        }
    
    def _amc_agreement_to_dict(self, agreement):
        if not agreement:
            return None
        return {
            "id": agreement.id,
            "instance_id": agreement.instance_id,
            "zone_name": agreement.zone_name,
            "sd_id": agreement.sd_id,
            "sd_name": agreement.sd_name,
            "branch_id": agreement.branch_id,
            "branch_name": agreement.branch_name,
            "segment": agreement.segment,
            "kva_rating": agreement.kva_rating,
            "engine_model": agreement.engine_model,
            "agreement_number": agreement.agreement_number,
            "number_of_agreement_years": agreement.number_of_agreement_years,
            "agreement_name": agreement.agreement_name,
            "agreement_status": agreement.agreement_status,
            "agreement_type": agreement.agreement_type,
            "agreement_created_date": agreement.agreement_created_date,
            "agreement_start_date": agreement.agreement_start_date,
            "agreement_end_date": agreement.agreement_end_date,
            "agreement_product_name": agreement.agreement_product_name,
            "last_agreement_number": agreement.last_agreement_number,
            "last_agreement_no_of_years": agreement.last_agreement_no_of_years,
            "last_agreement_type": agreement.last_agreement_type,
            "last_agreement_status": agreement.last_agreement_status,
            "last_agreement_product_name": agreement.last_agreement_product_name,
            "last_agreement_start_date": agreement.last_agreement_start_date,
            "last_agreement_end_date": agreement.last_agreement_end_date,
            "extra_data": agreement.extra_data,
            "created_at": agreement.created_at,
            "updated_at": agreement.updated_at
        }
    
    def _asset_detailed_to_dict(self, asset):
        if not asset:
            return None
        return {
            "id": asset.id,
            "instance_id": asset.instance_id,
            "zone_name": asset.zone_name,
            "sd_id": asset.sd_id,
            "sd_name": asset.sd_name,
            "branch_id": asset.branch_id,
            "branch_name": asset.branch_name,
            "district": asset.district,
            "asset_number": asset.asset_number,
            "commissioning_date": asset.commissioning_date,
            "installation_date": asset.installation_date,
            "goem_oem": asset.goem_oem,
            "application_code": asset.application_code,
            "engine_serial_no": asset.engine_serial_no,
            "engine_model": asset.engine_model,
            "account_name": asset.account_name,
            "customer_name": asset.customer_name,
            "contact_phone_number": asset.contact_phone_number,
            "contact_email_id": asset.contact_email_id,
            "warranty_expiry_date": asset.warranty_expiry_date,
            "installation_site_address": asset.installation_site_address,
            "product_segment": asset.product_segment,
            "segment": asset.segment,
            "customer_segment": asset.customer_segment,
            "asset_operational_status": asset.asset_operational_status,
            "krm_number": asset.krm_number,
            "krm_status": asset.krm_status,
            "krm_active_date": asset.krm_active_date,
            "krm_inactive_date": asset.krm_inactive_date,
            "krm_subscription_start_date": asset.krm_subscription_start_date,
            "krm_subscription_end_date": asset.krm_subscription_end_date,
            "kva_rating": asset.kva_rating,
            "extra_data": asset.extra_data,
            "created_at": asset.created_at,
            "updated_at": asset.updated_at
        }
    
    def _asset_service_to_dict(self, service):
        if not service:
            return None
        return {
            "id": service.id,
            "instance_id": service.instance_id,
            "zone_name": service.zone_name,
            "sd_id": service.sd_id,
            "sd_name": service.sd_name,
            "branch_id": service.branch_id,
            "branch_name": service.branch_name,
            "asset_number": service.asset_number,
            "commissioning_date": service.commissioning_date,
            "product_segment": service.product_segment,
            "application_code": service.application_code,
            "engine_serial_no": service.engine_serial_no,
            "account_name": service.account_name,
            "contact_phone_number": service.contact_phone_number,
            "last_closed_sr_number": service.last_closed_sr_number,
            "last_sr_type": service.last_sr_type,
            "last_sr_subtype": service.last_sr_subtype,
            "last_sr_close_date": service.last_sr_close_date,
            "last_oil_change_sr_number": service.last_oil_change_sr_number,
            "last_oil_change_sr_type": service.last_oil_change_sr_type,
            "last_oil_change_sr_sub_type": service.last_oil_change_sr_sub_type,
            "last_oil_change_date": service.last_oil_change_date,
            "installation_site_address": service.installation_site_address,
            "last_service_hrs": service.last_service_hrs,
            "extra_data": service.extra_data,
            "created_at": service.created_at,
            "updated_at": service.updated_at
        }
    
    def _anubandhan_plus_to_dict(self, quote):
        if not quote:
            return None
        return {
            "id": quote.id,
            "instance_id": quote.instance_id,
            "id_col": quote.id_col,
            "quotation_ref_no": quote.quotation_ref_no,
            "company_name": quote.company_name,
            "engine_no": quote.engine_no,
            "contact_person_name": quote.contact_person_name,
            "mobile_no": quote.mobile_no,
            "email_id": quote.email_id,
            "genset_kva": quote.genset_kva,
            "zone": quote.zone,
            "state": quote.state,
            "city": quote.city,
            "location": quote.location,
            "no_of_years": quote.no_of_years,
            "genset_running_per_year": quote.genset_running_per_year,
            "created_date_time": quote.created_date_time,
            "status": quote.status,
            "payment_type": quote.payment_type,
            "transaction_id": quote.transaction_id,
            "bank_name": quote.bank_name,
            "account_no": quote.account_no,
            "date_of_payment": quote.date_of_payment,
            "payment_update_date_time": quote.payment_update_date_time,
            "is_neft_confirm": quote.is_neft_confirm,
            "is_cheque_confirm": quote.is_cheque_confirm,
            "cheque_deposited_address": quote.cheque_deposited_address,
            "cheque_given_dealership": quote.cheque_given_dealership,
            "cheque_deposited": quote.cheque_deposited,
            "cheque_to_dealer": quote.cheque_to_dealer,
            "employee_name": quote.employee_name,
            "pulse_id": quote.pulse_id,
            "is_invoice_sent": quote.is_invoice_sent,
            "is_refund": quote.is_refund,
            "agent_id": quote.agent_id,
            "quote_price": quote.quote_price,
            "quotation_value_including_tax": quote.quotation_value_including_tax,
            "name_of_agent": quote.name_of_agent,
            "actual_amount": quote.actual_amount,
            "reason_of_short_payment": quote.reason_of_short_payment,
            "status_updated_by_admin": quote.status_updated_by_admin,
            "quotation_expiry_date": quote.quotation_expiry_date,
            "is_expired": quote.is_expired,
            "payment_updated_month": quote.payment_updated_month,
            "pulse_instance_id": quote.pulse_instance_id,
            "new_price_applicable": quote.new_price_applicable,
            "quotation_type": quote.quotation_type,
            "extra_data": quote.extra_data,
            "created_at": quote.created_at,
            "updated_at": quote.updated_at
        }
    
    def _anubandhan_to_dict(self, quote):
        if not quote:
            return None
        return {
            "id": quote.id,
            "instance_id": quote.instance_id,
            "id_col": quote.id_col,
            "quotation_ref_no": quote.quotation_ref_no,
            "company_name": quote.company_name,
            "engine_no": quote.engine_no,
            "contact_person_name": quote.contact_person_name,
            "mobile_no": quote.mobile_no,
            "email_id": quote.email_id,
            "genset_kva": quote.genset_kva,
            "zone": quote.zone,
            "state": quote.state,
            "city": quote.city,
            "location": quote.location,
            "no_of_years": quote.no_of_years,
            "genset_running_per_year": quote.genset_running_per_year,
            "created_date_time": quote.created_date_time,
            "status": quote.status,
            "payment_type": quote.payment_type,
            "transaction_id": quote.transaction_id,
            "bank_name": quote.bank_name,
            "account_no": quote.account_no,
            "date_of_payment": quote.date_of_payment,
            "payment_update_date_time": quote.payment_update_date_time,
            "is_neft_confirm": quote.is_neft_confirm,
            "is_cheque_confirm": quote.is_cheque_confirm,
            "cheque_deposited_address": quote.cheque_deposited_address,
            "cheque_given_dealership": quote.cheque_given_dealership,
            "cheque_deposited": quote.cheque_deposited,
            "cheque_to_dealer": quote.cheque_to_dealer,
            "employee_name": quote.employee_name,
            "pulse_id": quote.pulse_id,
            "is_invoice_sent": quote.is_invoice_sent,
            "is_refund": quote.is_refund,
            "agent_id": quote.agent_id,
            "quote_price": quote.quote_price,
            "quotation_value_including_tax": quote.quotation_value_including_tax,
            "name_of_agent": quote.name_of_agent,
            "actual_amount": quote.actual_amount,
            "reason_of_short_payment": quote.reason_of_short_payment,
            "status_updated_by_admin": quote.status_updated_by_admin,
            "quotation_expiry_date": quote.quotation_expiry_date,
            "is_expired": quote.is_expired,
            "payment_updated_month": quote.payment_updated_month,
            "pulse_instance_id": quote.pulse_instance_id,
            "new_price_applicable": quote.new_price_applicable,
            "quotation_type": quote.quotation_type,
            "extra_data": quote.extra_data,
            "created_at": quote.created_at,
            "updated_at": quote.updated_at
        }
    
    def _bandhan_plus_to_dict(self, quote):
        if not quote:
            return None
        return {
            "id": quote.id,
            "instance_id": quote.instance_id,
            "id_col": quote.id_col,
            "quotation_ref_no": quote.quotation_ref_no,
            "company_name": quote.company_name,
            "engine_no": quote.engine_no,
            "contact_person_name": quote.contact_person_name,
            "mobile_no": quote.mobile_no,
            "email_id": quote.email_id,
            "genset_kva": quote.genset_kva,
            "zone": quote.zone,
            "state": quote.state,
            "city": quote.city,
            "location": quote.location,
            "no_of_years": quote.no_of_years,
            "genset_running_per_year": quote.genset_running_per_year,
            "created_date_time": quote.created_date_time,
            "status": quote.status,
            "payment_type": quote.payment_type,
            "transaction_id": quote.transaction_id,
            "bank_name": quote.bank_name,
            "account_no": quote.account_no,
            "date_of_payment": quote.date_of_payment,
            "payment_update_date_time": quote.payment_update_date_time,
            "is_neft_confirm": quote.is_neft_confirm,
            "is_cheque_confirm": quote.is_cheque_confirm,
            "cheque_deposited_address": quote.cheque_deposited_address,
            "cheque_given_dealership": quote.cheque_given_dealership,
            "cheque_deposited": quote.cheque_deposited,
            "cheque_to_dealer": quote.cheque_to_dealer,
            "employee_name": quote.employee_name,
            "pulse_id": quote.pulse_id,
            "is_invoice_sent": quote.is_invoice_sent,
            "is_refund": quote.is_refund,
            "agent_id": quote.agent_id,
            "quote_price": quote.quote_price,
            "quotation_value_including_tax": quote.quotation_value_including_tax,
            "name_of_agent": quote.name_of_agent,
            "actual_amount": quote.actual_amount,
            "reason_of_short_payment": quote.reason_of_short_payment,
            "status_updated_by_admin": quote.status_updated_by_admin,
            "quotation_expiry_date": quote.quotation_expiry_date,
            "is_expired": quote.is_expired,
            "payment_updated_month": quote.payment_updated_month,
            "pulse_instance_id": quote.pulse_instance_id,
            "new_price_applicable": quote.new_price_applicable,
            "quotation_type": quote.quotation_type,
            "extra_data": quote.extra_data,
            "created_at": quote.created_at,
            "updated_at": quote.updated_at
        }
    
    def _pulse_to_dict(self, quote):
        if not quote:
            return None
        return {
            "id": quote.id,
            "instance_id": quote.instance_id,
            "creation_date": quote.creation_date,
            "quote_id": quote.quote_id,
            "first_level_observations": quote.first_level_observations,
            "quote_status": quote.quote_status,
            "sr_type": quote.sr_type,
            "sr_sub_type": quote.sr_sub_type,
            "instance_id_col": quote.instance_id_col,
            "account": quote.account,
            "bill_to_address": quote.bill_to_address,
            "ship_to_address": quote.ship_to_address,
            "first_name": quote.first_name,
            "last_name": quote.last_name,
            "contact_phone_number": quote.contact_phone_number,
            "installation_site_address": quote.installation_site_address,
            "contact_primary_email": quote.contact_primary_email,
            "service_dealer": quote.service_dealer,
            "labor_amount": quote.labor_amount,
            "parts_amount": quote.parts_amount,
            "total_amount": quote.total_amount,
            "prepared_by": quote.prepared_by,
            "recommended_by": quote.recommended_by,
            "finance_company_address": quote.finance_company_address,
            "account_number": quote.account_number,
            "purpose_of_quotation": quote.purpose_of_quotation,
            "sr_number": quote.sr_number,
            "quote_revised_flag": quote.quote_revised_flag,
            "quote_submitted_date": quote.quote_submitted_date,
            "exception_enquiry_no": quote.exception_enquiry_no,
            "lead_no": quote.lead_no,
            "quotation_lead_assigned_name": quote.quotation_lead_assigned_name,
            "quotation_lead_assigned_job_title": quote.quotation_lead_assigned_job_title,
            "quotation_lead_assigned_phone": quote.quotation_lead_assigned_phone,
            "quotation_lead_assigned_uid": quote.quotation_lead_assigned_uid,
            "extra_data": quote.extra_data,
            "created_at": quote.created_at,
            "updated_at": quote.updated_at
        }
    
    def _regular_bandhan_to_dict(self, record):
        if not record:
            return None
        return {
            "id": record.id,
            "instance_id": record.instance_id,
            "branch_id": record.branch_id,
            "id_col": record.id_col,
            "quotation_ref_no": record.quotation_ref_no,
            "company_name": record.company_name,
            "engine_no": record.engine_no,
            "contact_person_name": record.contact_person_name,
            "mobile_no": record.mobile_no,
            "email_id": record.email_id,
            "genset_kva": record.genset_kva,
            "zone": record.zone,
            "state": record.state,
            "city": record.city,
            "location": record.location,
            "no_of_years": record.no_of_years,
            "genset_running_per_year": record.genset_running_per_year,
            "created_date_time": record.created_date_time,
            "status": record.status,
            "payment_type": record.payment_type,
            "transaction_id": record.transaction_id,
            "bank_name": record.bank_name,
            "account_no": record.account_no,
            "date_of_payment": record.date_of_payment,
            "payment_update_date_time": record.payment_update_date_time,
            "is_neft_confirm": record.is_neft_confirm,
            "is_cheque_confirm": record.is_cheque_confirm,
            "cheque_deposited_address": record.cheque_deposited_address,
            "cheque_given_dealership": record.cheque_given_dealership,
            "cheque_deposited": record.cheque_deposited,
            "cheque_to_dealer": record.cheque_to_dealer,
            "employee_name": record.employee_name,
            "pulse_id": record.pulse_id,
            "is_invoice_sent": record.is_invoice_sent,
            "is_refund": record.is_refund,
            "agent_id": record.agent_id,
            "quote_price": record.quote_price,
            "quotation_value_including_tax": record.quotation_value_including_tax,
            "name_of_agent": record.name_of_agent,
            "actual_amount": record.actual_amount,
            "reason_of_short_payment": record.reason_of_short_payment,
            "status_updated_by_admin": record.status_updated_by_admin,
            "quotation_expiry_date": record.quotation_expiry_date,
            "is_expired": record.is_expired,
            "payment_updated_month": record.payment_updated_month,
            "new_price_applicable": record.new_price_applicable,
            "quotation_type": record.quotation_type,
            "first_pm_date": record.first_pm_date,
            "agreement_start_date": record.agreement_start_date,
            "extra_data": record.extra_data,
            "created_at": record.created_at,
            "updated_at": record.updated_at
        }
    
    def _lms_data_to_dict(self, record):
        if not record:
            return None
        return {
            "id": record.id,
            "instance_id": record.instance_id,
            "lead_number": record.lead_number,
            "lead_created_date": record.lead_created_date,
            "mode_of_lead_creation": record.mode_of_lead_creation,
            "lead_raised_by": record.lead_raised_by,
            "lead_raised_for": record.lead_raised_for,
            "sd_name": record.sd_name,
            "sd_id": record.sd_id,
            "branch_name": record.branch_name,
            "branch_id": record.branch_id,
            "product_list": record.product_list,
            "product_type": record.product_type,
            "lead_assigned_to": record.lead_assigned_to,
            "lead_status": record.lead_status,
            "account_id": record.account_id,
            "account_name": record.account_name,
            "zone": record.zone,
            "lead_sr_number": record.lead_sr_number,
            "instance_id_col": record.instance_id_col,
            "engine_model": record.engine_model,
            "kva_rating": record.kva_rating,
            "service_engineer_name": record.service_engineer_name,
            "tele_caller_name": record.tele_caller_name,
            "quotation_number": record.quotation_number,
            "quotation_submit_date": record.quotation_submit_date,
            "quotation_approval_date": record.quotation_approval_date,
            "order_number": record.order_number,
            "order_creation_date": record.order_creation_date,
    
            # ---- NEW columns for the new LMS file format ----
            "sr_type": record.sr_type,
            "sr_sub_type": record.sr_sub_type,
            "sr_sub_type_2": record.sr_sub_type_2,
            "account_contact_number": record.account_contact_number,
            "account_contact_email_id": record.account_contact_email_id,
            "tele_caller_uid": record.tele_caller_uid,
            "tele_caller_mobile_number": record.tele_caller_mobile_number,
            "enquiry_allocation_remarks": record.enquiry_allocation_remarks,
            "engine_app_code": record.engine_app_code,
            "engine_serial_no": record.engine_serial_no,
            "pin_code": record.pin_code,
            "segment": record.segment,
            "commissioning_date": record.commissioning_date,
            "installation_site_address": record.installation_site_address,
            "city": record.city,
            "district": record.district,
            "state": record.state,
            "asset_contact_name": record.asset_contact_name,
            "asset_contact_phone_number": record.asset_contact_phone_number,
            "efsr_contact_name": record.efsr_contact_name,
            "efsr_customer_number": record.efsr_customer_number,
            "qualifying_date": record.qualifying_date,
            "quotation_type": record.quotation_type,
            "quotation_labour_amt": record.quotation_labour_amt,
            "quotation_part_amt": record.quotation_part_amt,
            "total_quote_amount": record.total_quote_amount,
            "quotation_lead_assigned_name": record.quotation_lead_assigned_name,
            "quotation_lead_assigned_uid": record.quotation_lead_assigned_uid,
            "quotation_lead_assigned_job_title": record.quotation_lead_assigned_job_title,
            "enquiry_loss_reason": record.enquiry_loss_reason,
            "service_engineer_uid": record.service_engineer_uid,
            "service_engineer_mobile_number": record.service_engineer_mobile_number,
            "sic_code": record.sic_code,
            "sic_code_type": record.sic_code_type,
            "labour_invoice_number": record.labour_invoice_number,
            "labour_invoice_amount": record.labour_invoice_amount,
            "part_invoice_amount": record.part_invoice_amount,
            "part_invoice_number": record.part_invoice_number,
            "lead_source": record.lead_source,
            "next_action_required": record.next_action_required,
            "new_contact": record.new_contact,
            "lead_contact_number": record.lead_contact_number,
            "next_action_date": record.next_action_date,
            "lead_assign_to_sd": record.lead_assign_to_sd,
    
            "extra_data": record.extra_data,
            "created_at": record.created_at,
            "updated_at": record.updated_at
        }
    
    def _open_sr_load_report_to_dict(self, report):
        if not report:
            return None
        return {
            "id": report.id,
            "instance_id": report.instance_id,
            "service_request_no": report.service_request_no,
            "sr_due_date": report.sr_due_date,
            "appointment_date": report.appointment_date,
            "service_dealer": report.service_dealer,
            "status": report.status,
            "sr_type": report.sr_type,
            "sr_sub_type": report.sr_sub_type,
            "problem_code": report.problem_code,
            "installation_site_address": report.installation_site_address,
            "engine_app_code": report.engine_app_code,
            "voc": report.voc,
            "engine_serial_no": report.engine_serial_no,
            "engine_series": report.engine_series,
            "engine_model": report.engine_model,
            "ticket_no": report.ticket_no,
            "segment": report.segment,
            "task_start_date": report.task_start_date,
            "task_end_date": report.task_end_date,
            "account": report.account,
            "under_monitoring_date": report.under_monitoring_date,
            "under_monitoring_remark": report.under_monitoring_remark,
            "convert_pm_to_wet_pm_flag": report.convert_pm_to_wet_pm_flag,
            "efsr_engineer_remarks": report.efsr_engineer_remarks,
            "quick_ticket_sr_comments": report.quick_ticket_sr_comments,
            "actual_sr_due_date": report.actual_sr_due_date,
            "convert_pm_to_wet_pm_flag_updated_date": report.convert_pm_to_wet_pm_flag_updated_date,
            "convert_pm_to_wet_pm_flag_updated_by": report.convert_pm_to_wet_pm_flag_updated_by,
            "customer_name": report.customer_name,
            "contact_last_name": report.contact_last_name,
            "customer_mobile_no": report.customer_mobile_no,
            "genset_appcode": report.genset_appcode,
            "contact_name": report.contact_name,
            "primary_phone_no": report.primary_phone_no,
            "mode": report.mode,
            "close_date_time": report.close_date_time,
            "repeat": report.repeat,
            "assigned_to": report.assigned_to,
            "oil_change_flg": report.oil_change_flg,
            "claim_created": report.claim_created,
            "agreement_no": report.agreement_no,
            "cancellation_reason": report.cancellation_reason,
            "csp_cancellation_reasons": report.csp_cancellation_reasons,
            "csp_cancellation_remarks": report.csp_cancellation_remarks,
            "asm_ase_remarks": report.asm_ase_remarks,
            "asm_ase_remarks_date": report.asm_ase_remarks_date,
            "battery_charger_availability": report.battery_charger_availability,
            "wet_pm_due_flag": report.wet_pm_due_flag,
            "cap_limit_approval_remarks": report.cap_limit_approval_remarks,
            "cap_limit_deviation_remarks": report.cap_limit_deviation_remarks,
            "cap_limit_deviation_status": report.cap_limit_deviation_status,
            "cap_limit_user_details": report.cap_limit_user_details,
            "csp_prepone_flag": report.csp_prepone_flag,
            "csp_prepone_flag_updated_by": report.csp_prepone_flag_updated_by,
            "bandhan_pm_sr_closure_within_15_days_flag": report.bandhan_pm_sr_closure_within_15_days_flag,
            "bandhan_pm_lock_removal_flag_updated_by": report.bandhan_pm_lock_removal_flag_updated_by,
            "bandhan_pm_lock_removal_flag_updated_date": report.bandhan_pm_lock_removal_flag_updated_date,
            "bandhan_pm_sr_closure_90_days_max_after_pm_due_date_flag": report.bandhan_pm_sr_closure_90_days_max_after_pm_due_date_flag,
            "bandhan_pm_due_date_lock_removal_flag_updated_by": report.bandhan_pm_due_date_lock_removal_flag_updated_by,
            "bandhan_pm_due_date_lock_removal_flag_updated_date": report.bandhan_pm_due_date_lock_removal_flag_updated_date,
            "bandhan_job_card_creation_prior_to_60_days_flag": report.bandhan_job_card_creation_prior_to_60_days_flag,
            "bandhan_pm_jc_creation_lock_removal_flag_updated_by": report.bandhan_pm_jc_creation_lock_removal_flag_updated_by,
            "bandhan_pm_jc_creation_lock_removal_flag_updated_date": report.bandhan_pm_jc_creation_lock_removal_flag_updated_date,
            "account_id": report.account_id,
            "sr_created_by": report.sr_created_by,
            "sr_created_date": report.sr_created_date,
            "efsr_krm_number": report.efsr_krm_number,
            "dry_csp_approved_by": report.dry_csp_approved_by,
            "dry_csp_approved_date": report.dry_csp_approved_date,
            "extra_data": report.extra_data,
            "created_at": report.created_at,
            "updated_at": report.updated_at
        }
    
    def export_selected_records(self, table_name: str, record_ids: List[int]):
        """Export specific records by their IDs"""
        model_map = {
            'customers': Customer,
            'amc_agreements': AMCAgreement,
            'asset_detailed': AssetDetailed,
            'asset_services': AssetService,
            'anubandhan_plus': AnubandhanPlusQuote,
            'anubandhan': AnubandhanQuote,
            'bandhan_plus': BandhanPlusQuote,
            'pulse': PulseQuotation,
            'regular_bandhan': RegularBandhan,
            'lms_data': LMSData,
            'open_sr_load_reports': OpenSRLoadReport,
            'open_sr_data': MaxTTROilChangeSRZeroLabourFlag,
            'response_time_maxttr': ResponseTimeMaxTTR,
            'cdi_detail_report': CDIDetailReport,
            'efsr_report': EFSRReport,
            'amc_expiry_planner': AMCExpiryPlanner,
            'lms_insia': LMSInsia,
            'all_invoice_report': AllInvoiceReport
        }
        
        if table_name not in model_map:
            raise HTTPException(status_code=400, detail="Invalid table name")
        
        model = model_map[table_name]
        records = self.db.query(model).filter(model.id.in_(record_ids)).all()
        
        # Convert to list of dicts for CSV export
        result = []
        for record in records:
            record_dict = {c.name: getattr(record, c.name) for c in record.__table__.columns}
            result.append(record_dict)
        
        return result    