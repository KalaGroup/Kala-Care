from fastapi import APIRouter, Depends, HTTPException, Query, logger
from sqlalchemy.orm import Session
from sqlalchemy import func, distinct
from typing import List, Optional
from app.database import SessionLocal
from app.controllers import TADA_HO_controller
from app.models.TADA_model import TADAImport
from pydantic import BaseModel

router = APIRouter(prefix="/tada-ho", tags=["TADA HO"])

# Pydantic model for updating TADA records
class TADAUpdateData(BaseModel):
    two_way_km: Optional[str] = None
    ho_corrected_km: Optional[str] = None
    km_rate_applied: Optional[str] = None
    da_amount: Optional[str] = None
    total_amount: Optional[str] = None
    branch_verified_km: Optional[str] = None
    km_verification_remark: Optional[str] = None
    ho_remark: Optional[str] = None
    verification_status: Optional[str] = None

# Response Models
class BranchResponse(BaseModel):
    branch_code: str
    branch_name: str
    engineer_count: int

class EngineerResponse(BaseModel):
    service_engineer_name: str
    service_engineer_uid: str
    branch_code: str
    branch_name: str

class PaidDateUpdate(BaseModel):
    paid_date: Optional[str] = None

class BulkPaidDateUpdate(BaseModel):
    record_ids: List[int]
    paid_date: Optional[str] = None    

class TADARecordResponse(BaseModel):
    id: int
    appointment_number: str
    installation_site_address: Optional[str] = None
    account: Optional[str] = None
    service_request_no: Optional[str] = None
    sr_type: Optional[str] = None
    sr_sub_type: Optional[str] = None
    sr_due_date: Optional[str] = None
    task_start_date: Optional[str] = None
    task_end_date: Optional[str] = None
    task_status: Optional[str] = None
    task_assigned_datetime: Optional[str] = None
    task_assign_vs_trip_start: Optional[str] = None
    sr_trip_start_datetime: Optional[str] = None
    sr_reach_at_site_datetime: Optional[str] = None
    sr_trip_start_lat_long: Optional[str] = None
    sr_reach_at_site_lat_long: Optional[str] = None
    kms_travelled: Optional[str] = None
    sr_closed_date: Optional[str] = None
    sr_status: Optional[str] = None
    # NEW COLUMNS
    branch_verified_km: Optional[str] = None
    km_verification_remark: Optional[str] = None
    two_way_km: Optional[str] = None
    ho_corrected_km: Optional[str] = None
    km_rate_applied: Optional[str] = None
    da_amount: Optional[str] = None
    total_amount: Optional[str] = None
    ho_remark: Optional[str] = None
    verification_status: Optional[str] = None
    branch_code: Optional[str] = None
    sd_branch_code: Optional[str] = None
    service_engineer_uid: Optional[str] = None
    service_engineer_name: Optional[str] = None
    file_name: Optional[str] = None

class BranchSummaryResponse(BaseModel):
    branches: List[dict]
    total_branches: int
    total_engineers: int

class MoveSelectedToHistoryRequest(BaseModel):
    record_ids: List[int]   
    submitted_by_name: Optional[str] = None
    submitted_by_uid: Optional[str] = None 

# Dependency to get DB session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.get("/branches", response_model=List[BranchResponse])
def get_branches_with_engineers(
    db: Session = Depends(get_db)
):
    """Get all branches that have TADA records with engineers"""
    return TADA_HO_controller.get_branches_with_engineers(db)

@router.get("/branch-summary", response_model=BranchSummaryResponse)
def get_branch_summary(
    db: Session = Depends(get_db)
):
    """Get complete branch summary with engineers and record counts"""
    return TADA_HO_controller.get_branch_summary(db)

@router.get("/engineers", response_model=List[EngineerResponse])
def get_engineers_by_branch(
    branch_code: str = Query(..., description="Branch code to filter engineers"),
    db: Session = Depends(get_db)
):
    """Get all engineers for a specific branch"""
    engineers = TADA_HO_controller.get_engineers_by_branch(db, branch_code)
    return engineers

@router.get("/engineer-records", response_model=List[TADARecordResponse])
def get_engineer_records(
    engineer_uid: str = Query(..., description="Engineer UID"),
    branch_code: str = Query(..., description="Branch code"),
    db: Session = Depends(get_db)
):
    """Get all TADA records for a specific engineer. Returns [] if all have been submitted to history."""
    records = TADA_HO_controller.get_engineer_records(db, engineer_uid, branch_code)
    return records or []

@router.put("/engineer-records/{record_id}")
def update_tada_record(
    record_id: int,
    update_data: TADAUpdateData,
    db: Session = Depends(get_db)
):
    """Update TADA record fields (KM, DA, Remarks, Verification, etc.)"""
    try:
        record = db.query(TADAImport).filter(TADAImport.id == record_id).first()
        if not record:
            raise HTTPException(status_code=404, detail="Record not found")
        
        # Update only provided fields
        if update_data.two_way_km is not None:
            record.two_way_km = update_data.two_way_km
        if update_data.ho_corrected_km is not None:
            record.ho_corrected_km = update_data.ho_corrected_km
        if update_data.km_rate_applied is not None:
            record.km_rate_applied = update_data.km_rate_applied
        if update_data.da_amount is not None:
            record.da_amount = update_data.da_amount
        if update_data.total_amount is not None:
            record.total_amount = update_data.total_amount
        if update_data.branch_verified_km is not None:
            record.branch_verified_km = update_data.branch_verified_km
        if update_data.km_verification_remark is not None:
            record.km_verification_remark = update_data.km_verification_remark
        if update_data.ho_remark is not None:
            record.ho_remark = update_data.ho_remark
        if update_data.verification_status is not None:
            record.verification_status = update_data.verification_status
        
        db.commit()
        db.refresh(record)
        
        return {
            "message": "Record updated successfully",
            "id": record.id,
            "updated_fields": {k: v for k, v in update_data.dict().items() if v is not None}
        }
    except Exception as e:
        logger.error(f"Error updating record {record_id}: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/debug/branch-data")
def debug_branch_data(db: Session = Depends(get_db)):
    """Debug endpoint to see raw branch data distribution"""
    
    # Get raw data grouped by sd_branch_code
    results = db.query(
        TADAImport.sd_branch_code,
        func.count(distinct(TADAImport.service_engineer_uid)).label('unique_engineers'),
        func.count(TADAImport.id).label('total_records'),
        func.count(TADAImport.service_engineer_name).label('records_with_names')
    ).filter(
        TADAImport.sd_branch_code.isnot(None),
        TADAImport.sd_branch_code != ''
    ).group_by(
        TADAImport.sd_branch_code
    ).order_by(
        TADAImport.sd_branch_code
    ).all()
    
    debug_data = []
    for result in results:
        debug_data.append({
            'sd_branch_code': result.sd_branch_code,
            'mapped_branch_name': TADA_HO_controller.get_branch_display_name(result.sd_branch_code),
            'unique_engineers': result.unique_engineers,
            'total_records': result.total_records,
            'records_with_names': result.records_with_names
        })
    
    # Also get sample data for first few branches
    sample_data = []
    for result in results[:3]:
        samples = db.query(
            TADAImport.service_engineer_name,
            TADAImport.service_engineer_uid
        ).filter(
            TADAImport.sd_branch_code == result.sd_branch_code
        ).limit(5).all()
        
        sample_data.append({
            'branch': result.sd_branch_code,
            'sample_engineers': [
                {'name': s.service_engineer_name, 'uid': s.service_engineer_uid}
                for s in samples
            ]
        })
    
    return {
        'branch_distribution': debug_data,
        'sample_data': sample_data,
        'branch_mapping': TADA_HO_controller.BRANCH_MAP
    }

@router.get("/all-engineers")
def get_all_engineers_with_branches(
    db: Session = Depends(get_db)
):
    """Get ALL engineers with their branch codes (unique combinations)"""
    engineers = TADA_HO_controller.get_all_engineers_with_branches(db)
    return {
        'total_unique_combinations': len(engineers),
        'engineers': engineers
    }

@router.get("/branches-with-admins")
def get_branches_with_admins(
    db: Session = Depends(get_db)
):
    """Get all branches with their branch admin names from users table"""
    from app.models.user_model import User
    
    # Get all branches from BRANCH_MAP
    branches = []
    for branch_code, branch_name in TADA_HO_controller.BRANCH_MAP.items():
        # Find branch admin from users table
        branch_admin = db.query(User).filter(
            User.branch == branch_code,
            User.role == 'branch_admin'
        ).first()
        
        # Count engineers for this branch
        engineer_count = db.query(func.count(distinct(TADAImport.service_engineer_uid))).filter(
            TADAImport.sd_branch_code == branch_code,
            TADAImport.service_engineer_uid.isnot(None),
            TADAImport.service_engineer_uid != ''
        ).scalar() or 0
        
        branches.append({
            'branch_code': branch_code,
            'branch_name': branch_name,
            'branch_admin_name': branch_admin.name if branch_admin else None,
            'engineer_count': engineer_count
        })
    
    return branches


@router.get("/branch-engineers-summary")
def get_branch_engineers_summary(
    branch_code: str = Query(..., description="Branch code"),
    db: Session = Depends(get_db)
):
    """Get summary of all engineers for a branch with their SR counts and total amounts"""
    from sqlalchemy import cast, Float
    from sqlalchemy import or_
    
    # Get all engineers for this branch
    engineers = TADA_HO_controller.get_engineers_by_branch(db, branch_code)
    
    summary = []
    for engineer in engineers:
        engineer_uid = engineer['service_engineer_uid']
        
        # Get all records for this engineer
        records = db.query(TADAImport).filter(
            TADAImport.service_engineer_uid == engineer_uid
        ).all()
        
        total_sr_count = len(records)
        verified_sr_count = len([r for r in records if r.verification_status == 'Verified'])
        
        # Calculate total amount from verified records
        total_amount = 0
        for record in records:
            if record.verification_status == 'Verified' and record.total_amount:
                try:
                    total_amount += float(record.total_amount)
                except (ValueError, TypeError):
                    pass
        
        from dateutil import parser as date_parser
        from datetime import datetime, timedelta
        
        # Reasonable date range — reject garbage like year 2099 or 1900
        min_valid = datetime(2020, 1, 1)
        max_valid = datetime.now() + timedelta(days=30)
        
        date_pairs = []
        for r in records:
            raw = r.sr_reach_at_site_datetime
            if not raw:
                continue
            raw_str = str(raw).strip()
            if not raw_str or raw_str.lower() in ('null', 'none', '-', 'nan', '0'):
                continue
            try:
                # dayfirst=True handles DD/MM/YYYY format (Indian format)
                # fuzzy=False to avoid mis-parsing strings with extra junk
                parsed = date_parser.parse(raw_str, dayfirst=False, fuzzy=False)
                
                # Reject dates outside reasonable range (handles future/garbage data)
                if parsed < min_valid or parsed > max_valid:
                    continue
                
                date_pairs.append((parsed, raw_str))
            except (ValueError, TypeError, OverflowError) as e:
                continue
        
        if date_pairs:
            # Sort all dates so we can debug what's happening
            sorted_pairs = sorted(date_pairs, key=lambda x: x[0])
                        
            start_date = sorted_pairs[0][1]
            end_date = sorted_pairs[-1][1]
        else:
            start_date = None
            end_date = None
        
        summary.append({
            'engineer_name': engineer['service_engineer_name'],
            'engineer_uid': engineer_uid,
            'total_sr_count': total_sr_count,
            'verified_sr_count': verified_sr_count,
            'total_amount': total_amount,
            'start_date': start_date,
            'end_date': end_date
        })
    
    return summary

@router.get("/branches-with-managers")
def get_branches_with_managers(
    db: Session = Depends(get_db)
):
    """Get all branches with their branch managers from users table and engineer counts"""
    from app.models.user_model import User
    
    branches = []
    for branch_code, branch_name in TADA_HO_controller.BRANCH_MAP.items():
        # Find branch manager from users table
        branch_manager = db.query(User).filter(
            User.branch == branch_code,
            User.role == 'branch_admin'
        ).first()
        
        # Count unique engineers for this branch using the controller's logic
        engineer_count = 0
        engineers_data = TADA_HO_controller.get_engineers_by_branch(db, branch_code)
        engineer_count = len(engineers_data)
        
        branches.append({
            'branch_code': branch_code,
            'branch_name': branch_name,
            'branch_manager': branch_manager.name if branch_manager else None,
            'engineer_count': engineer_count
        })
    
    return branches

@router.post("/engineer/{engineer_uid}/move-selected-to-history")
def move_selected_verified_to_history(
    engineer_uid: str,
    request: MoveSelectedToHistoryRequest,
    db: Session = Depends(get_db)
):
    """
    Move selected verified records of an engineer to history table
    """
    try:
        result = TADA_HO_controller.move_selected_records_to_history(
            db, 
            engineer_uid, 
            request.record_ids,
            submitted_by_name=request.submitted_by_name,
            submitted_by_uid=request.submitted_by_uid
        )
        
        if result["success"]:
            return {
                "message": result["message"],
                "moved_count": result["moved_count"]
            }
        else:
            raise HTTPException(status_code=400, detail=result["message"])
            
    except Exception as e:
        logger.error(f"Error moving selected records: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
    
@router.get("/branch-history")
def get_branch_history(
    branch_code: str = Query(..., description="Branch code"),
    db: Session = Depends(get_db)
):
    """Get all history records for a specific branch"""
    from app.models.TADA_history_model import TADAHistory
    
    records = db.query(TADAHistory).filter(
        TADAHistory.sd_branch_code == branch_code
    ).order_by(TADAHistory.moved_at.desc()).all()
    
    result = []
    for r in records:
        result.append({
            "id": r.id,
            "original_id": r.original_id,
            "appointment_number": r.appointment_number,
            "sd_branch_name": r.sd_branch_name,
            "sd_branch_code": r.sd_branch_code,
            "installation_site_address": r.installation_site_address,
            "account": r.account,
            "service_request_no": r.service_request_no,
            "sr_type": r.sr_type,
            "sr_sub_type": r.sr_sub_type,
            "sr_due_date": r.sr_due_date,
            "task_start_date": r.task_start_date,
            "task_end_date": r.task_end_date,
            "task_status": r.task_status,
            "task_assigned_datetime": r.task_assigned_datetime,
            "task_assign_vs_trip_start": r.task_assign_vs_trip_start,
            "sr_trip_start_datetime": r.sr_trip_start_datetime,
            "sr_reach_at_site_datetime": r.sr_reach_at_site_datetime,
            "sr_trip_start_lat_long": r.sr_trip_start_lat_long,
            "sr_reach_at_site_lat_long": r.sr_reach_at_site_lat_long,
            "kms_travelled": r.kms_travelled,
            "sr_closed_date": r.sr_closed_date,
            "sr_status": r.sr_status,
            "service_engineer_name": r.service_engineer_name,
            "service_engineer_uid": r.service_engineer_uid,
            "customer_name": r.customer_name,
            "branch_verified_km": r.branch_verified_km,
            "km_verification_remark": r.km_verification_remark,
            "two_way_km": r.two_way_km,
            "ho_corrected_km": r.ho_corrected_km,
            "km_rate_applied": r.km_rate_applied,
            "da_amount": r.da_amount,
            "total_amount": r.total_amount,
            "ho_remark": r.ho_remark,
            "verification_status": r.verification_status,
            "branch_code": r.branch_code,
            "uploaded_by": r.uploaded_by,
            "file_name": r.file_name,
            "moved_by": r.moved_by,
            "moved_at": str(r.moved_at) if r.moved_at else None,
            "moved_from_branch": r.moved_from_branch,
            "submitted_by_name": r.submitted_by_name,
            "submitted_by_uid": r.submitted_by_uid,
            "paid_date": r.paid_date,
        })
    
    return result    

@router.get("/check-export-permission")
def check_export_permission(
    user_id: str = Query(..., description="User ID to check"),
    db: Session = Depends(get_db)
):
    """Check if a user has export permission"""
    from app.models.user_model import User
    
    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    return {
        "user_id": user_id,
        "can_export": user.can_export,
        "name": user.name
    }    

@router.get("/branch-history-grouped")
def get_branch_history_grouped(
    branch_code: str = Query(..., description="Branch code"),
    db: Session = Depends(get_db)
):
    """Group branch history into submission periods (7-day for weekly rule, 15-day for monthly)."""
    from app.models.TADA_history_model import TADAHistory
    from app.models.branch_submit_limit_model import BranchSubmitLimit
    from dateutil import parser as date_parser
    from datetime import datetime, timedelta
    from collections import defaultdict

    submit_rule = db.query(BranchSubmitLimit).filter(
        BranchSubmitLimit.branch_code == branch_code
    ).first()

    if submit_rule and submit_rule.rule_type == 'weekdays':
        rule_type = 'weekdays'
        period_days = 7
    else:
        rule_type = 'month_dates'
        period_days = 15

    records = db.query(TADAHistory).filter(
        TADAHistory.sd_branch_code == branch_code
    ).all()

    min_valid = datetime(2020, 1, 1)
    max_valid = datetime.now() + timedelta(days=30)
    parsed = []
    for r in records:
        raw = r.sr_reach_at_site_datetime
        if not raw:
            continue
        raw_str = str(raw).strip()
        if not raw_str or raw_str.lower() in ('null', 'none', '-', 'nan', '0'):
            continue
        try:
            d = date_parser.parse(raw_str, dayfirst=False, fuzzy=False)
            if d < min_valid or d > max_valid:
                continue
            parsed.append((d, r))
        except (ValueError, TypeError, OverflowError):
            continue

    if not parsed:
        return {
            'rule_type': rule_type, 'period_days': period_days,
            'total_groups': 0, 'groups': []
        }

    parsed.sort(key=lambda x: x[0])
    anchor = parsed[0][0].replace(hour=0, minute=0, second=0, microsecond=0)

    buckets = defaultdict(list)
    for d, r in parsed:
        bucket_idx = (d - anchor).days // period_days
        uploader = (r.uploaded_by or 'Unknown').strip() or 'Unknown'
        buckets[(uploader, bucket_idx)].append((d, r))

    groups = []
    for (uploader, _idx), items in buckets.items():
        items.sort(key=lambda x: x[0])
        period_start = items[0][0]
        period_end = items[-1][0]
        total_amount = 0.0
        record_ids = []
        paid_dates_set = set()
        paid_count = 0
        for _, r in items:
            try:
                total_amount += float(r.total_amount or 0)
            except (ValueError, TypeError):
                pass
            record_ids.append(r.id)
            if r.paid_date and str(r.paid_date).strip():
                paid_dates_set.add(str(r.paid_date).strip())
                paid_count += 1

        # If every record in this period shares one paid date, surface it; else None
        common_paid_date = None
        if len(paid_dates_set) == 1 and paid_count == len(items):
            common_paid_date = next(iter(paid_dates_set))

        groups.append({
            'period_start': period_start.strftime('%Y-%m-%d'),
            'period_end': period_end.strftime('%Y-%m-%d'),
            'period_start_display': period_start.strftime('%d %b %Y'),
            'period_end_display': period_end.strftime('%d %b %Y'),
            'uploaded_by': uploader,
            'total_amount': round(total_amount, 2),
            'record_count': len(items),
            'record_ids': record_ids,
            'paid_date': common_paid_date,        # NEW
            'paid_count': paid_count,             # NEW: how many of the rows have any paid_date
        })

    groups.sort(key=lambda x: x['period_start'], reverse=True)

    return {
        'rule_type': rule_type, 'period_days': period_days,
        'total_groups': len(groups), 'groups': groups
    }

@router.put("/history/{record_id}/paid-date")
def update_history_paid_date(
    record_id: int,
    data: PaidDateUpdate,
    db: Session = Depends(get_db)
):
    """Update paid_date for a single history record."""
    from app.models.TADA_history_model import TADAHistory
    record = db.query(TADAHistory).filter(TADAHistory.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    record.paid_date = (data.paid_date or '').strip() or None
    db.commit()
    db.refresh(record)
    return {"id": record.id, "paid_date": record.paid_date}


@router.put("/history/bulk-paid-date")
def bulk_update_history_paid_date(
    data: BulkPaidDateUpdate,
    db: Session = Depends(get_db)
):
    """Set the same paid_date on many history records at once (used for whole-week apply)."""
    from app.models.TADA_history_model import TADAHistory
    if not data.record_ids:
        raise HTTPException(status_code=400, detail="No record IDs provided")
    new_val = (data.paid_date or '').strip() or None
    db.query(TADAHistory).filter(TADAHistory.id.in_(data.record_ids)).update(
        {"paid_date": new_val}, synchronize_session=False
    )
    db.commit()
    return {"updated_count": len(data.record_ids), "paid_date": new_val}
