from fastapi import APIRouter, Depends, HTTPException, Query, status, Response, Header
from sqlalchemy.orm import Session
from typing import List, Optional
import csv
import io

from app.database import SessionLocal
from app.controllers.customer_controller import CustomerController
from app.controllers.user_controller import UserController
from app.schemas.customer_schema import (
    # Customer Schemas
    Customer, CustomerCreate, CustomerUpdate,
    
    # AMC Agreement Schemas
    AMCAgreement, AMCAgreementCreate, AMCAgreementUpdate,
    
    # Asset Detailed Schemas
    AssetDetailed, AssetDetailedCreate, AssetDetailedUpdate,
    
    # Asset Service Schemas
    AssetService, AssetServiceCreate, AssetServiceUpdate,
    
    # Anubandhan Plus Quote Schemas
    AnubandhanPlusQuote, AnubandhanPlusQuoteCreate, AnubandhanPlusQuoteUpdate,
    
    # Anubandhan Quote Schemas
    AnubandhanQuote, AnubandhanQuoteCreate, AnubandhanQuoteUpdate,
    
    # Bandhan Plus Quote Schemas
    BandhanPlusQuote, BandhanPlusQuoteCreate, BandhanPlusQuoteUpdate,
    
    # Pulse Quotation Schemas
    PulseQuotation, PulseQuotationCreate, PulseQuotationUpdate,
    
    # Regular Bandhan Schemas
    RegularBandhan, RegularBandhanCreate, RegularBandhanUpdate,
    
    # LMS Data Schemas
    LMSData, LMSDataCreate, LMSDataUpdate,
    
    # Open SR Load Report Schemas
    OpenSRLoadReport, OpenSRLoadReportCreate, OpenSRLoadReportUpdate,
    
    # Response Schemas
    MessageResponse
)

# Create a request model for bulk delete
from pydantic import BaseModel

class BulkDeleteRequest(BaseModel):
    ids: List[int]

router = APIRouter(prefix="/customers", tags=["customers"])

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Helper function to check export permission
def check_export_permission(user_id: str, db: Session):
    """Check if user has export permission"""
    user = UserController.get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Admin always has permission, otherwise check can_export flag
    if user.role != "admin" and not user.can_export:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to export data"
        )
    return user

# ==================== Customer Export Endpoint ====================

@router.get("/export")
async def export_customers(
    user_id: str = Header(...),
    db: Session = Depends(get_db)
):
    """Export customers to CSV - checks if user has export permission"""
    # Check permission
    check_export_permission(user_id, db)
    
    # Get all customers
    controller = CustomerController(db)
    customers = controller.get_customers(skip=0, limit=None)  # None = get all
    
    # Create CSV
    output = io.StringIO()
    writer = csv.writer(output)
    
    if customers and len(customers) > 0:
        # Write header
        headers = [column for column in customers[0].__dict__.keys() if not column.startswith('_')]
        writer.writerow(headers)
        
        # Write data
        for customer in customers:
            row = [getattr(customer, header) for header in headers]
            writer.writerow(row)
    
    output.seek(0)
    
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=customers_export_{user_id}.csv"}
    )

# ==================== AMC Agreements Export Endpoint ====================

@router.get("/amc-agreements/export")
async def export_amc_agreements(
    user_id: str = Header(...),
    db: Session = Depends(get_db)
):
    """Export AMC agreements to CSV - checks if user has export permission"""
    # Check permission
    check_export_permission(user_id, db)
    
    # Get all AMC agreements
    controller = CustomerController(db)
    agreements = controller.get_amc_agreements(skip=0, limit=None)
    
    # Create CSV
    output = io.StringIO()
    writer = csv.writer(output)
    
    if agreements and len(agreements) > 0:
        # Write header
        headers = [column for column in agreements[0].__dict__.keys() if not column.startswith('_')]
        writer.writerow(headers)
        
        # Write data
        for agreement in agreements:
            row = [getattr(agreement, header) for header in headers]
            writer.writerow(row)
    
    output.seek(0)
    
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=amc_agreements_export.csv"}
    )

# ==================== Asset Detailed Export Endpoint ====================

@router.get("/asset-detailed/export")
async def export_asset_detailed(
    user_id: str = Header(...),
    db: Session = Depends(get_db)
):
    """Export asset detailed records to CSV - checks if user has export permission"""
    # Check permission
    check_export_permission(user_id, db)
    
    # Get all asset detailed records
    controller = CustomerController(db)
    assets = controller.get_asset_detailed(skip=0, limit=None)
    
    # Create CSV
    output = io.StringIO()
    writer = csv.writer(output)
    
    if assets and len(assets) > 0:
        # Write header
        headers = [column for column in assets[0].__dict__.keys() if not column.startswith('_')]
        writer.writerow(headers)
        
        # Write data
        for asset in assets:
            row = [getattr(asset, header) for header in headers]
            writer.writerow(row)
    
    output.seek(0)
    
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=asset_detailed_export.csv"}
    )

# ==================== Asset Services Export Endpoint ====================

@router.get("/asset-services/export")
async def export_asset_services(
    user_id: str = Header(...),
    db: Session = Depends(get_db)
):
    """Export asset services to CSV - checks if user has export permission"""
    # Check permission
    check_export_permission(user_id, db)
    
    # Get all asset services
    controller = CustomerController(db)
    services = controller.get_asset_services(skip=0, limit=None)
    
    # Create CSV
    output = io.StringIO()
    writer = csv.writer(output)
    
    if services and len(services) > 0:
        # Write header
        headers = [column for column in services[0].__dict__.keys() if not column.startswith('_')]
        writer.writerow(headers)
        
        # Write data
        for service in services:
            row = [getattr(service, header) for header in headers]
            writer.writerow(row)
    
    output.seek(0)
    
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=asset_services_export.csv"}
    )

# ==================== Anubandhan Plus Export Endpoint ====================

@router.get("/anubandhan-plus/export")
async def export_anubandhan_plus(
    user_id: str = Header(...),
    db: Session = Depends(get_db)
):
    """Export Anubandhan Plus quotes to CSV - checks if user has export permission"""
    # Check permission
    check_export_permission(user_id, db)
    
    # Get all Anubandhan Plus quotes
    controller = CustomerController(db)
    quotes = controller.get_anubandhan_plus_quotes(skip=0, limit=None)
    
    # Create CSV
    output = io.StringIO()
    writer = csv.writer(output)
    
    if quotes and len(quotes) > 0:
        # Write header
        headers = [column for column in quotes[0].__dict__.keys() if not column.startswith('_')]
        writer.writerow(headers)
        
        # Write data
        for quote in quotes:
            row = [getattr(quote, header) for header in headers]
            writer.writerow(row)
    
    output.seek(0)
    
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=anubandhan_plus_export.csv"}
    )

# ==================== Anubandhan Export Endpoint ====================

@router.get("/anubandhan/export")
async def export_anubandhan(
    user_id: str = Header(...),
    db: Session = Depends(get_db)
):
    """Export Anubandhan quotes to CSV - checks if user has export permission"""
    # Check permission
    check_export_permission(user_id, db)
    
    # Get all Anubandhan quotes
    controller = CustomerController(db)
    quotes = controller.get_anubandhan_quotes(skip=0, limit=None)
    
    # Create CSV
    output = io.StringIO()
    writer = csv.writer(output)
    
    if quotes and len(quotes) > 0:
        # Write header
        headers = [column for column in quotes[0].__dict__.keys() if not column.startswith('_')]
        writer.writerow(headers)
        
        # Write data
        for quote in quotes:
            row = [getattr(quote, header) for header in headers]
            writer.writerow(row)
    
    output.seek(0)
    
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=anubandhan_export.csv"}
    )

# ==================== Bandhan Plus Export Endpoint ====================

@router.get("/bandhan-plus/export")
async def export_bandhan_plus(
    user_id: str = Header(...),
    db: Session = Depends(get_db)
):
    """Export Bandhan Plus quotes to CSV - checks if user has export permission"""
    # Check permission
    check_export_permission(user_id, db)
    
    # Get all Bandhan Plus quotes
    controller = CustomerController(db)
    quotes = controller.get_bandhan_plus_quotes(skip=0, limit=None)
    
    # Create CSV
    output = io.StringIO()
    writer = csv.writer(output)
    
    if quotes and len(quotes) > 0:
        # Write header
        headers = [column for column in quotes[0].__dict__.keys() if not column.startswith('_')]
        writer.writerow(headers)
        
        # Write data
        for quote in quotes:
            row = [getattr(quote, header) for header in headers]
            writer.writerow(row)
    
    output.seek(0)
    
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=bandhan_plus_export.csv"}
    )

# ==================== Pulse Quotations Export Endpoint ====================

@router.get("/pulse-quotations/export")
async def export_pulse_quotations(
    user_id: str = Header(...),
    db: Session = Depends(get_db)
):
    """Export Pulse quotations to CSV - checks if user has export permission"""
    # Check permission
    check_export_permission(user_id, db)
    
    # Get all Pulse quotations
    controller = CustomerController(db)
    quotations = controller.get_pulse_quotations(skip=0, limit=None)
    
    # Create CSV
    output = io.StringIO()
    writer = csv.writer(output)
    
    if quotations and len(quotations) > 0:
        # Write header
        headers = [column for column in quotations[0].__dict__.keys() if not column.startswith('_')]
        writer.writerow(headers)
        
        # Write data
        for quotation in quotations:
            row = [getattr(quotation, header) for header in headers]
            writer.writerow(row)
    
    output.seek(0)
    
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=pulse_quotations_export.csv"}
    )

# ==================== Regular Bandhan Export Endpoint ====================

@router.get("/regular-bandhan/export")
async def export_regular_bandhan(
    user_id: str = Header(...),
    db: Session = Depends(get_db)
):
    """Export Regular Bandhan records to CSV - checks if user has export permission"""
    # Check permission
    check_export_permission(user_id, db)
    
    # Get all Regular Bandhan records
    controller = CustomerController(db)
    records = controller.get_regular_bandhan(skip=0, limit=None)
    
    # Create CSV
    output = io.StringIO()
    writer = csv.writer(output)
    
    if records and len(records) > 0:
        # Write header
        headers = [column for column in records[0].__dict__.keys() if not column.startswith('_')]
        writer.writerow(headers)
        
        # Write data
        for record in records:
            row = [getattr(record, header) for header in headers]
            writer.writerow(row)
    
    output.seek(0)
    
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=regular_bandhan_export.csv"}
    )

# ==================== LMS Data Export Endpoint ====================

@router.get("/lms-data/export")
async def export_lms_data(
    user_id: str = Header(...),
    db: Session = Depends(get_db)
):
    """Export LMS data to CSV - checks if user has export permission"""
    # Check permission
    check_export_permission(user_id, db)
    
    # Get all LMS data
    controller = CustomerController(db)
    data = controller.get_lms_data(skip=0, limit=None)
    
    # Create CSV
    output = io.StringIO()
    writer = csv.writer(output)
    
    if data and len(data) > 0:
        # Write header
        headers = [column for column in data[0].__dict__.keys() if not column.startswith('_')]
        writer.writerow(headers)
        
        # Write data
        for record in data:
            row = [getattr(record, header) for header in headers]
            writer.writerow(row)
    
    output.seek(0)
    
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=lms_data_export.csv"}
    )

# ==================== Open SR Load Reports Export Endpoint ====================

@router.get("/open-sr-load-reports/export")
async def export_open_sr_load_reports(
    user_id: str = Header(...),
    db: Session = Depends(get_db)
):
    """Export Open SR Load Reports to CSV - checks if user has export permission"""
    # Check permission
    check_export_permission(user_id, db)
    
    # Get all Open SR Load Reports
    controller = CustomerController(db)
    reports = controller.get_open_sr_load_reports(skip=0, limit=None)
    
    # Create CSV
    output = io.StringIO()
    writer = csv.writer(output)
    
    if reports and len(reports) > 0:
        # Write header
        headers = [column for column in reports[0].__dict__.keys() if not column.startswith('_')]
        writer.writerow(headers)
        
        # Write data
        for report in reports:
            row = [getattr(report, header) for header in headers]
            writer.writerow(row)
    
    output.seek(0)
    
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=open_sr_load_reports_export.csv"}
    )

# ==================== Customer Endpoints ====================

@router.get("/", response_model=List[Customer])
async def get_customers(
    response: Response,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1),
    search: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Get all customers with pagination"""
    controller = CustomerController(db)
    
    # Get total count
    total_count = controller.get_customers_count(search)
    
    # Set header BEFORE returning
    response.headers["X-Total-Count"] = str(total_count)
    response.headers["Access-Control-Expose-Headers"] = "X-Total-Count"  # Important for CORS
    
    # Get paginated results
    results = controller.get_customers(skip, limit, search)
    
    return results

@router.get("/with-summary", response_model=List[dict])
async def get_customers_with_summary(
    response: Response,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=-1),  # Allow -1 for all records
    search: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Get all customers with summary data from all tables (use limit=-1 for all records)"""
    controller = CustomerController(db)
    
    # Get total count
    total_count = controller.get_customers_count(search)
    response.headers["X-Total-Count"] = str(total_count)
    
    # If limit is -1, get all records (pass None to controller)
    actual_limit = None if limit == -1 else limit
    
    # Get paginated results
    return controller.get_all_customers_with_summary(skip, actual_limit, search)


@router.get("/instance/{instance_id}/complete-data", response_model=dict)
async def get_customer_complete_data(
    instance_id: str,
    db: Session = Depends(get_db)
):
    """Get customer by instance ID with ALL data from all tables"""
    controller = CustomerController(db)
    result = controller.get_customer_complete_data(instance_id)
    if not result:
        raise HTTPException(status_code=404, detail="Customer not found")
    return result


@router.get("/{customer_id}", response_model=Customer)
async def get_customer(customer_id: int, db: Session = Depends(get_db)):
    """Get single customer by ID"""
    controller = CustomerController(db)
    return controller.get_customer(customer_id)


@router.post("/", response_model=Customer, status_code=status.HTTP_201_CREATED)
async def create_customer(customer: CustomerCreate, db: Session = Depends(get_db)):
    """Create new customer"""
    controller = CustomerController(db)
    return controller.create_customer(customer)


@router.put("/{customer_id}", response_model=Customer)
async def update_customer(
    customer_id: int, 
    customer: CustomerUpdate, 
    db: Session = Depends(get_db)
):
    """Update customer"""
    controller = CustomerController(db)
    return controller.update_customer(customer_id, customer)


@router.delete("/{customer_id}", response_model=MessageResponse)
async def delete_customer(customer_id: int, db: Session = Depends(get_db)):
    """Delete customer"""
    controller = CustomerController(db)
    return controller.delete_customer(customer_id)


@router.post("/bulk-delete", response_model=MessageResponse)
async def bulk_delete_customers(
    request: BulkDeleteRequest,
    db: Session = Depends(get_db)
):
    """Delete multiple customers"""
    controller = CustomerController(db)
    success_count = 0
    for customer_id in request.ids:
        try:
            controller.delete_customer(customer_id)
            success_count += 1
        except:
            pass
    return {"message": f"{success_count} customers deleted successfully"}


# ==================== AMC Agreement Endpoints ====================

@router.get("/amc-agreements/", response_model=List[AMCAgreement])
async def get_amc_agreements(
    response: Response,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=-1),  # Allow -1 for all records
    search: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Get all AMC agreements with pagination (use limit=-1 for all records)"""
    controller = CustomerController(db)
    
    # Get total count
    total_count = controller.get_amc_agreements_count(search)
    response.headers["X-Total-Count"] = str(total_count)
    
    # If limit is -1, get all records (pass None to controller)
    actual_limit = None if limit == -1 else limit
    
    # Get paginated results
    return controller.get_amc_agreements(skip, actual_limit, search)


@router.get("/amc-agreements/{agreement_id}", response_model=AMCAgreement)
async def get_amc_agreement(agreement_id: int, db: Session = Depends(get_db)):
    """Get single AMC agreement by ID"""
    controller = CustomerController(db)
    return controller.get_amc_agreement(agreement_id)


@router.post("/amc-agreements/", response_model=AMCAgreement, status_code=status.HTTP_201_CREATED)
async def create_amc_agreement(agreement: AMCAgreementCreate, db: Session = Depends(get_db)):
    """Create new AMC agreement"""
    controller = CustomerController(db)
    return controller.create_amc_agreement(agreement)


@router.put("/amc-agreements/{agreement_id}", response_model=AMCAgreement)
async def update_amc_agreement(
    agreement_id: int,
    agreement: AMCAgreementUpdate,
    db: Session = Depends(get_db)
):
    """Update AMC agreement"""
    controller = CustomerController(db)
    return controller.update_amc_agreement(agreement_id, agreement)


@router.delete("/amc-agreements/{agreement_id}", response_model=MessageResponse)
async def delete_amc_agreement(agreement_id: int, db: Session = Depends(get_db)):
    """Delete AMC agreement"""
    controller = CustomerController(db)
    return controller.delete_amc_agreement(agreement_id)


@router.post("/amc-agreements/bulk-delete", response_model=MessageResponse)
async def bulk_delete_amc_agreements(
    request: BulkDeleteRequest,
    db: Session = Depends(get_db)
):
    """Delete multiple AMC agreements"""
    controller = CustomerController(db)
    return controller.bulk_delete_amc_agreements(request.ids)


# ==================== Asset Detailed Endpoints ====================

@router.get("/asset-detailed/", response_model=List[AssetDetailed])
async def get_asset_detailed(
    response: Response,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=-1),  # Allow -1 for all records
    search: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Get all asset detailed records with pagination (use limit=-1 for all records)"""
    controller = CustomerController(db)
    
    # Get total count
    total_count = controller.get_asset_detailed_count(search)
    response.headers["X-Total-Count"] = str(total_count)
    
    # If limit is -1, get all records (pass None to controller)
    actual_limit = None if limit == -1 else limit
    
    # Get paginated results
    return controller.get_asset_detailed(skip, actual_limit, search)


@router.get("/asset-detailed/{asset_id}", response_model=AssetDetailed)
async def get_asset_detailed_record(asset_id: int, db: Session = Depends(get_db)):
    """Get single asset detailed record by ID"""
    controller = CustomerController(db)
    return controller.get_asset_detailed_record(asset_id)


@router.post("/asset-detailed/", response_model=AssetDetailed, status_code=status.HTTP_201_CREATED)
async def create_asset_detailed(asset: AssetDetailedCreate, db: Session = Depends(get_db)):
    """Create new asset detailed record"""
    controller = CustomerController(db)
    return controller.create_asset_detailed(asset)


@router.put("/asset-detailed/{asset_id}", response_model=AssetDetailed)
async def update_asset_detailed(
    asset_id: int,
    asset: AssetDetailedUpdate,
    db: Session = Depends(get_db)
):
    """Update asset detailed record"""
    controller = CustomerController(db)
    return controller.update_asset_detailed(asset_id, asset)


@router.delete("/asset-detailed/{asset_id}", response_model=MessageResponse)
async def delete_asset_detailed(asset_id: int, db: Session = Depends(get_db)):
    """Delete asset detailed record"""
    controller = CustomerController(db)
    return controller.delete_asset_detailed(asset_id)


@router.post("/asset-detailed/bulk-delete", response_model=MessageResponse)
async def bulk_delete_asset_detailed(
    request: BulkDeleteRequest,
    db: Session = Depends(get_db)
):
    """Delete multiple asset detailed records"""
    controller = CustomerController(db)
    return controller.bulk_delete_asset_detailed(request.ids)


# ==================== Asset Service Endpoints ====================

@router.get("/asset-services/", response_model=List[AssetService])
async def get_asset_services(
    response: Response,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=-1),  # Allow -1 for all records
    search: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Get all asset services with pagination (use limit=-1 for all records)"""
    controller = CustomerController(db)
    
    # Get total count
    total_count = controller.get_asset_services_count(search)
    response.headers["X-Total-Count"] = str(total_count)
    
    # If limit is -1, get all records (pass None to controller)
    actual_limit = None if limit == -1 else limit
    
    # Get paginated results
    return controller.get_asset_services(skip, actual_limit, search)


@router.get("/asset-services/{service_id}", response_model=AssetService)
async def get_asset_service(service_id: int, db: Session = Depends(get_db)):
    """Get single asset service by ID"""
    controller = CustomerController(db)
    return controller.get_asset_service(service_id)


@router.post("/asset-services/", response_model=AssetService, status_code=status.HTTP_201_CREATED)
async def create_asset_service(service: AssetServiceCreate, db: Session = Depends(get_db)):
    """Create new asset service"""
    controller = CustomerController(db)
    return controller.create_asset_service(service)


@router.put("/asset-services/{service_id}", response_model=AssetService)
async def update_asset_service(
    service_id: int,
    service: AssetServiceUpdate,
    db: Session = Depends(get_db)
):
    """Update asset service"""
    controller = CustomerController(db)
    return controller.update_asset_service(service_id, service)


@router.delete("/asset-services/{service_id}", response_model=MessageResponse)
async def delete_asset_service(service_id: int, db: Session = Depends(get_db)):
    """Delete asset service"""
    controller = CustomerController(db)
    return controller.delete_asset_service(service_id)


@router.post("/asset-services/bulk-delete", response_model=MessageResponse)
async def bulk_delete_asset_services(
    request: BulkDeleteRequest,
    db: Session = Depends(get_db)
):
    """Delete multiple asset services"""
    controller = CustomerController(db)
    return controller.bulk_delete_asset_services(request.ids)


# ==================== Anubandhan Plus Quote Endpoints ====================

@router.get("/anubandhan-plus/", response_model=List[AnubandhanPlusQuote])
async def get_anubandhan_plus_quotes(
    response: Response,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=-1),  # Allow -1 for all records
    search: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Get all Anubandhan Plus quotes with pagination (use limit=-1 for all records)"""
    controller = CustomerController(db)
    
    # Get total count
    total_count = controller.get_anubandhan_plus_quotes_count(search)
    response.headers["X-Total-Count"] = str(total_count)
    
    # If limit is -1, get all records (pass None to controller)
    actual_limit = None if limit == -1 else limit
    
    # Get paginated results
    return controller.get_anubandhan_plus_quotes(skip, actual_limit, search)


@router.get("/anubandhan-plus/{quote_id}", response_model=AnubandhanPlusQuote)
async def get_anubandhan_plus_quote(quote_id: int, db: Session = Depends(get_db)):
    """Get single Anubandhan Plus quote by ID"""
    controller = CustomerController(db)
    return controller.get_anubandhan_plus_quote(quote_id)


@router.post("/anubandhan-plus/", response_model=AnubandhanPlusQuote, status_code=status.HTTP_201_CREATED)
async def create_anubandhan_plus_quote(quote: AnubandhanPlusQuoteCreate, db: Session = Depends(get_db)):
    """Create new Anubandhan Plus quote"""
    controller = CustomerController(db)
    return controller.create_anubandhan_plus_quote(quote)


@router.put("/anubandhan-plus/{quote_id}", response_model=AnubandhanPlusQuote)
async def update_anubandhan_plus_quote(
    quote_id: int,
    quote: AnubandhanPlusQuoteUpdate,
    db: Session = Depends(get_db)
):
    """Update Anubandhan Plus quote"""
    controller = CustomerController(db)
    return controller.update_anubandhan_plus_quote(quote_id, quote)


@router.delete("/anubandhan-plus/{quote_id}", response_model=MessageResponse)
async def delete_anubandhan_plus_quote(quote_id: int, db: Session = Depends(get_db)):
    """Delete Anubandhan Plus quote"""
    controller = CustomerController(db)
    return controller.delete_anubandhan_plus_quote(quote_id)


@router.post("/anubandhan-plus/bulk-delete", response_model=MessageResponse)
async def bulk_delete_anubandhan_plus_quotes(
    request: BulkDeleteRequest,
    db: Session = Depends(get_db)
):
    """Delete multiple Anubandhan Plus quotes"""
    controller = CustomerController(db)
    return controller.bulk_delete_anubandhan_plus_quotes(request.ids)


# ==================== Anubandhan Quote Endpoints ====================

@router.get("/anubandhan/", response_model=List[AnubandhanQuote])
async def get_anubandhan_quotes(
    response: Response,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=-1),  # Allow -1 for all records
    search: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Get all Anubandhan quotes with pagination (use limit=-1 for all records)"""
    controller = CustomerController(db)
    
    # Get total count
    total_count = controller.get_anubandhan_quotes_count(search)
    response.headers["X-Total-Count"] = str(total_count)
    
    # If limit is -1, get all records (pass None to controller)
    actual_limit = None if limit == -1 else limit
    
    # Get paginated results
    return controller.get_anubandhan_quotes(skip, actual_limit, search)


@router.get("/anubandhan/{quote_id}", response_model=AnubandhanQuote)
async def get_anubandhan_quote(quote_id: int, db: Session = Depends(get_db)):
    """Get single Anubandhan quote by ID"""
    controller = CustomerController(db)
    return controller.get_anubandhan_quote(quote_id)


@router.post("/anubandhan/", response_model=AnubandhanQuote, status_code=status.HTTP_201_CREATED)
async def create_anubandhan_quote(quote: AnubandhanQuoteCreate, db: Session = Depends(get_db)):
    """Create new Anubandhan quote"""
    controller = CustomerController(db)
    return controller.create_anubandhan_quote(quote)


@router.put("/anubandhan/{quote_id}", response_model=AnubandhanQuote)
async def update_anubandhan_quote(
    quote_id: int,
    quote: AnubandhanQuoteUpdate,
    db: Session = Depends(get_db)
):
    """Update Anubandhan quote"""
    controller = CustomerController(db)
    return controller.update_anubandhan_quote(quote_id, quote)


@router.delete("/anubandhan/{quote_id}", response_model=MessageResponse)
async def delete_anubandhan_quote(quote_id: int, db: Session = Depends(get_db)):
    """Delete Anubandhan quote"""
    controller = CustomerController(db)
    return controller.delete_anubandhan_quote(quote_id)


@router.post("/anubandhan/bulk-delete", response_model=MessageResponse)
async def bulk_delete_anubandhan_quotes(
    request: BulkDeleteRequest,
    db: Session = Depends(get_db)
):
    """Delete multiple Anubandhan quotes"""
    controller = CustomerController(db)
    return controller.bulk_delete_anubandhan_quotes(request.ids)


# ==================== Bandhan Plus Quote Endpoints ====================

@router.get("/bandhan-plus/", response_model=List[BandhanPlusQuote])
async def get_bandhan_plus_quotes(
    response: Response,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=-1),  # Allow -1 for all records
    search: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Get all Bandhan Plus quotes with pagination (use limit=-1 for all records)"""
    controller = CustomerController(db)
    
    # Get total count
    total_count = controller.get_bandhan_plus_quotes_count(search)
    response.headers["X-Total-Count"] = str(total_count)
    
    # If limit is -1, get all records (pass None to controller)
    actual_limit = None if limit == -1 else limit
    
    # Get paginated results
    return controller.get_bandhan_plus_quotes(skip, actual_limit, search)


@router.get("/bandhan-plus/{quote_id}", response_model=BandhanPlusQuote)
async def get_bandhan_plus_quote(quote_id: int, db: Session = Depends(get_db)):
    """Get single Bandhan Plus quote by ID"""
    controller = CustomerController(db)
    return controller.get_bandhan_plus_quote(quote_id)


@router.post("/bandhan-plus/", response_model=BandhanPlusQuote, status_code=status.HTTP_201_CREATED)
async def create_bandhan_plus_quote(quote: BandhanPlusQuoteCreate, db: Session = Depends(get_db)):
    """Create new Bandhan Plus quote"""
    controller = CustomerController(db)
    return controller.create_bandhan_plus_quote(quote)


@router.put("/bandhan-plus/{quote_id}", response_model=BandhanPlusQuote)
async def update_bandhan_plus_quote(
    quote_id: int,
    quote: BandhanPlusQuoteUpdate,
    db: Session = Depends(get_db)
):
    """Update Bandhan Plus quote"""
    controller = CustomerController(db)
    return controller.update_bandhan_plus_quote(quote_id, quote)


@router.delete("/bandhan-plus/{quote_id}", response_model=MessageResponse)
async def delete_bandhan_plus_quote(quote_id: int, db: Session = Depends(get_db)):
    """Delete Bandhan Plus quote"""
    controller = CustomerController(db)
    return controller.delete_bandhan_plus_quote(quote_id)


@router.post("/bandhan-plus/bulk-delete", response_model=MessageResponse)
async def bulk_delete_bandhan_plus_quotes(
    request: BulkDeleteRequest,
    db: Session = Depends(get_db)
):
    """Delete multiple Bandhan Plus quotes"""
    controller = CustomerController(db)
    return controller.bulk_delete_bandhan_plus_quotes(request.ids)


# ==================== Pulse Quotation Endpoints ====================

@router.get("/pulse-quotations/", response_model=List[PulseQuotation])
async def get_pulse_quotations(
    response: Response,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=-1),  # Allow -1 for all records
    search: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Get all Pulse quotations with pagination (use limit=-1 for all records)"""
    controller = CustomerController(db)
    
    # Get total count
    total_count = controller.get_pulse_quotations_count(search)
    response.headers["X-Total-Count"] = str(total_count)
    
    # If limit is -1, get all records (pass None to controller)
    actual_limit = None if limit == -1 else limit
    
    # Get paginated results
    return controller.get_pulse_quotations(skip, actual_limit, search)


@router.get("/pulse-quotations/{quote_id}", response_model=PulseQuotation)
async def get_pulse_quotation(quote_id: int, db: Session = Depends(get_db)):
    """Get single Pulse quotation by ID"""
    controller = CustomerController(db)
    return controller.get_pulse_quotation(quote_id)


@router.post("/pulse-quotations/", response_model=PulseQuotation, status_code=status.HTTP_201_CREATED)
async def create_pulse_quotation(quote: PulseQuotationCreate, db: Session = Depends(get_db)):
    """Create new Pulse quotation"""
    controller = CustomerController(db)
    return controller.create_pulse_quotation(quote)


@router.put("/pulse-quotations/{quote_id}", response_model=PulseQuotation)
async def update_pulse_quotation(
    quote_id: int,
    quote: PulseQuotationUpdate,
    db: Session = Depends(get_db)
):
    """Update Pulse quotation"""
    controller = CustomerController(db)
    return controller.update_pulse_quotation(quote_id, quote)


@router.delete("/pulse-quotations/{quote_id}", response_model=MessageResponse)
async def delete_pulse_quotation(quote_id: int, db: Session = Depends(get_db)):
    """Delete Pulse quotation"""
    controller = CustomerController(db)
    return controller.delete_pulse_quotation(quote_id)


@router.post("/pulse-quotations/bulk-delete", response_model=MessageResponse)
async def bulk_delete_pulse_quotations(
    request: BulkDeleteRequest,
    db: Session = Depends(get_db)
):
    """Delete multiple Pulse quotations"""
    controller = CustomerController(db)
    return controller.bulk_delete_pulse_quotations(request.ids)


# ==================== Regular Bandhan Endpoints ====================

@router.get("/regular-bandhan/", response_model=List[RegularBandhan])
async def get_regular_bandhan(
    response: Response,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=-1),  # Allow -1 for all records
    search: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Get all Regular Bandhan records with pagination (use limit=-1 for all records)"""
    controller = CustomerController(db)
    
    # Get total count
    total_count = controller.get_regular_bandhan_count(search)
    response.headers["X-Total-Count"] = str(total_count)
    
    # If limit is -1, get all records (pass None to controller)
    actual_limit = None if limit == -1 else limit
    
    # Get paginated results
    return controller.get_regular_bandhan(skip, actual_limit, search)


@router.get("/regular-bandhan/{record_id}", response_model=RegularBandhan)
async def get_regular_bandhan_record(record_id: int, db: Session = Depends(get_db)):
    """Get single Regular Bandhan record by ID"""
    controller = CustomerController(db)
    return controller.get_regular_bandhan_record(record_id)


@router.post("/regular-bandhan/", response_model=RegularBandhan, status_code=status.HTTP_201_CREATED)
async def create_regular_bandhan(record: RegularBandhanCreate, db: Session = Depends(get_db)):
    """Create new Regular Bandhan record"""
    controller = CustomerController(db)
    return controller.create_regular_bandhan(record)


@router.put("/regular-bandhan/{record_id}", response_model=RegularBandhan)
async def update_regular_bandhan(
    record_id: int,
    record: RegularBandhanUpdate,
    db: Session = Depends(get_db)
):
    """Update Regular Bandhan record"""
    controller = CustomerController(db)
    return controller.update_regular_bandhan(record_id, record)


@router.delete("/regular-bandhan/{record_id}", response_model=MessageResponse)
async def delete_regular_bandhan(record_id: int, db: Session = Depends(get_db)):
    """Delete Regular Bandhan record"""
    controller = CustomerController(db)
    return controller.delete_regular_bandhan(record_id)


@router.post("/regular-bandhan/bulk-delete", response_model=MessageResponse)
async def bulk_delete_regular_bandhan(
    request: BulkDeleteRequest,
    db: Session = Depends(get_db)
):
    """Delete multiple Regular Bandhan records"""
    controller = CustomerController(db)
    return controller.bulk_delete_regular_bandhan(request.ids)


# ==================== LMS Data Endpoints ====================

@router.get("/lms-data/", response_model=List[LMSData])
async def get_lms_data(
    response: Response,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=-1),  # Allow -1 for all records
    search: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Get all LMS data with pagination (use limit=-1 for all records)"""
    controller = CustomerController(db)
    
    # Get total count
    total_count = controller.get_lms_data_count(search)
    response.headers["X-Total-Count"] = str(total_count)
    
    # If limit is -1, get all records (pass None to controller)
    actual_limit = None if limit == -1 else limit
    
    # Get paginated results
    return controller.get_lms_data(skip, actual_limit, search)


@router.get("/lms-data/{record_id}", response_model=LMSData)
async def get_lms_record(record_id: int, db: Session = Depends(get_db)):
    """Get single LMS record by ID"""
    controller = CustomerController(db)
    return controller.get_lms_record(record_id)


@router.post("/lms-data/", response_model=LMSData, status_code=status.HTTP_201_CREATED)
async def create_lms_record(record: LMSDataCreate, db: Session = Depends(get_db)):
    """Create new LMS record"""
    controller = CustomerController(db)
    return controller.create_lms_record(record)


@router.put("/lms-data/{record_id}", response_model=LMSData)
async def update_lms_record(
    record_id: int,
    record: LMSDataUpdate,
    db: Session = Depends(get_db)
):
    """Update LMS record"""
    controller = CustomerController(db)
    return controller.update_lms_record(record_id, record)


@router.delete("/lms-data/{record_id}", response_model=MessageResponse)
async def delete_lms_record(record_id: int, db: Session = Depends(get_db)):
    """Delete LMS record"""
    controller = CustomerController(db)
    return controller.delete_lms_record(record_id)


@router.post("/lms-data/bulk-delete", response_model=MessageResponse)
async def bulk_delete_lms_records(
    request: BulkDeleteRequest,
    db: Session = Depends(get_db)
):
    """Delete multiple LMS records"""
    controller = CustomerController(db)
    return controller.bulk_delete_lms_records(request.ids)


# ==================== Open SR Load Report Endpoints ====================

@router.get("/open-sr-load-reports/", response_model=List[OpenSRLoadReport])
async def get_open_sr_load_reports(
    response: Response,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=-1),  # Allow -1 for all records
    search: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Get all Open SR Load Reports with pagination (use limit=-1 for all records)"""
    controller = CustomerController(db)
    
    # Get total count
    total_count = controller.get_open_sr_load_reports_count(search)
    response.headers["X-Total-Count"] = str(total_count)
    
    # If limit is -1, get all records (pass None to controller)
    actual_limit = None if limit == -1 else limit
    
    # Get paginated results
    return controller.get_open_sr_load_reports(skip, actual_limit, search)


@router.get("/open-sr-load-reports/{report_id}", response_model=OpenSRLoadReport)
async def get_open_sr_load_report(report_id: int, db: Session = Depends(get_db)):
    """Get single Open SR Load Report by ID"""
    controller = CustomerController(db)
    return controller.get_open_sr_load_report(report_id)


@router.post("/open-sr-load-reports/", response_model=OpenSRLoadReport, status_code=status.HTTP_201_CREATED)
async def create_open_sr_load_report(report: OpenSRLoadReportCreate, db: Session = Depends(get_db)):
    """Create new Open SR Load Report"""
    controller = CustomerController(db)
    return controller.create_open_sr_load_report(report)


@router.put("/open-sr-load-reports/{report_id}", response_model=OpenSRLoadReport)
async def update_open_sr_load_report(
    report_id: int,
    report: OpenSRLoadReportUpdate,
    db: Session = Depends(get_db)
):
    """Update Open SR Load Report"""
    controller = CustomerController(db)
    return controller.update_open_sr_load_report(report_id, report)


@router.delete("/open-sr-load-reports/{report_id}", response_model=MessageResponse)
async def delete_open_sr_load_report(report_id: int, db: Session = Depends(get_db)):
    """Delete Open SR Load Report"""
    controller = CustomerController(db)
    return controller.delete_open_sr_load_report(report_id)


@router.post("/open-sr-load-reports/bulk-delete", response_model=MessageResponse)
async def bulk_delete_open_sr_load_reports(
    request: BulkDeleteRequest,
    db: Session = Depends(get_db)
):
    """Delete multiple Open SR Load Reports"""
    controller = CustomerController(db)
    return controller.bulk_delete_open_sr_load_reports(request.ids)


# ==================== Data Retrieval by Instance ID ====================

@router.get("/instance/{instance_id}/amc-agreements", response_model=List[AMCAgreement])
async def get_amc_agreements_by_instance(instance_id: str, db: Session = Depends(get_db)):
    """Get all AMC agreements for an instance"""
    controller = CustomerController(db)
    return controller.get_amc_agreements_by_instance(instance_id)


@router.get("/instance/{instance_id}/asset-detailed", response_model=List[AssetDetailed])
async def get_asset_detailed_by_instance(instance_id: str, db: Session = Depends(get_db)):
    """Get all asset detailed records for an instance"""
    controller = CustomerController(db)
    return controller.get_asset_detailed_by_instance(instance_id)


@router.get("/instance/{instance_id}/asset-services", response_model=List[AssetService])
async def get_asset_services_by_instance(instance_id: str, db: Session = Depends(get_db)):
    """Get all asset service records for an instance"""
    controller = CustomerController(db)
    return controller.get_asset_services_by_instance(instance_id)


@router.get("/instance/{instance_id}/anubandhan-plus", response_model=List[AnubandhanPlusQuote])
async def get_anubandhan_plus_by_instance(instance_id: str, db: Session = Depends(get_db)):
    """Get all Anubandhan Plus quotes for an instance"""
    controller = CustomerController(db)
    return controller.get_anubandhan_plus_quotes_by_instance(instance_id)


@router.get("/instance/{instance_id}/anubandhan", response_model=List[AnubandhanQuote])
async def get_anubandhan_by_instance(instance_id: str, db: Session = Depends(get_db)):
    """Get all Anubandhan quotes for an instance"""
    controller = CustomerController(db)
    return controller.get_anubandhan_quotes_by_instance(instance_id)


@router.get("/instance/{instance_id}/bandhan-plus", response_model=List[BandhanPlusQuote])
async def get_bandhan_plus_by_instance(instance_id: str, db: Session = Depends(get_db)):
    """Get all Bandhan Plus quotes for an instance"""
    controller = CustomerController(db)
    return controller.get_bandhan_plus_quotes_by_instance(instance_id)


@router.get("/instance/{instance_id}/pulse-quotations", response_model=List[PulseQuotation])
async def get_pulse_quotations_by_instance(instance_id: str, db: Session = Depends(get_db)):
    """Get all Pulse quotations for an instance"""
    controller = CustomerController(db)
    return controller.get_pulse_quotations_by_instance(instance_id)


@router.get("/instance/{instance_id}/regular-bandhan", response_model=List[RegularBandhan])
async def get_regular_bandhan_by_instance(instance_id: str, db: Session = Depends(get_db)):
    """Get all Regular Bandhan records for an instance"""
    controller = CustomerController(db)
    return controller.get_regular_bandhan_by_instance(instance_id)


@router.get("/instance/{instance_id}/lms-data", response_model=List[LMSData])
async def get_lms_data_by_instance(instance_id: str, db: Session = Depends(get_db)):
    """Get all LMS data for an instance"""
    controller = CustomerController(db)
    return controller.get_lms_data_by_instance(instance_id)


@router.get("/instance/{instance_id}/open-sr-load-reports", response_model=List[OpenSRLoadReport])
async def get_open_sr_load_reports_by_instance(instance_id: str, db: Session = Depends(get_db)):
    """Get all Open SR Load Reports for an instance"""
    controller = CustomerController(db)
    return controller.get_open_sr_load_reports_by_instance(instance_id)


@router.get("/export/selected")
async def export_selected_records(
    ids: str = Query(..., description="Comma-separated list of record IDs"),
    user_id: str = Header(..., alias="user-id"),
    db: Session = Depends(get_db)
):
    """Export selected records by their IDs"""
    # Check export permission
    # UserController might be using static methods
    user = UserController.get_user_by_id(db, user_id)  # Adjust this based on your UserController structure
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Check if user has export permission
    if user.role != "admin" and not user.can_export:
        raise HTTPException(status_code=403, detail="You don't have permission to export data")
    
    # Parse IDs
    try:
        record_ids = [int(id.strip()) for id in ids.split(',') if id.strip()]
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid ID format")
    
    # Get the records (assuming customers table for now)
    from app.models.customer_model import Customer
    records = db.query(Customer).filter(Customer.id.in_(record_ids)).all()
    
    # Convert to list of dicts
    result = []
    for record in records:
        record_dict = {c.name: getattr(record, c.name) for c in record.__table__.columns}
        result.append(record_dict)
    
    # Convert to CSV
    if not records:
        raise HTTPException(status_code=404, detail="No records found")
    
    import pandas as pd
    import io
    df = pd.DataFrame(result)
    
    # Create CSV response
    from fastapi.responses import Response
    output = io.StringIO()
    df.to_csv(output, index=False)
    output.seek(0)
    
    response = Response(content=output.getvalue())
    response.headers["Content-Disposition"] = f"attachment; filename=customers_selected_export.csv"
    response.headers["Content-Type"] = "text/csv"
    
    return response

# Add this new endpoint to get counts for all tables
@router.get("/counts/all")
async def get_all_table_counts(
    db: Session = Depends(get_db)
):
    """Get total counts for all tables"""
    controller = CustomerController(db)
    
    counts = {
        "customers": controller.get_customers_count(),
        "amc_agreements": controller.get_amc_agreements_count(),
        "asset_detailed": controller.get_asset_detailed_count(),
        "asset_services": controller.get_asset_services_count(),
        "anubandhan_plus": controller.get_anubandhan_plus_quotes_count(),
        "anubandhan": controller.get_anubandhan_quotes_count(),
        "bandhan_plus": controller.get_bandhan_plus_quotes_count(),
        "pulse": controller.get_pulse_quotations_count(),
        "regular_bandhan": controller.get_regular_bandhan_count(),
        "lms_data": controller.get_lms_data_count(),
        "open_sr_load_reports": controller.get_open_sr_load_reports_count()
    }
    
    return counts    