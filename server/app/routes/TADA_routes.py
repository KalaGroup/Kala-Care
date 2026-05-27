from fastapi import APIRouter, Depends, UploadFile, File, Query, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
import os
import shutil
from datetime import datetime
import pandas as pd
from urllib.parse import unquote
import logging
from pydantic import BaseModel

from app.database import SessionLocal
from app.controllers import TADA_controller as controller
from app.models import TADA_model as models

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/tada", tags=["TADA Management"])

# Pydantic model for KM verification update
class KMVerificationUpdate(BaseModel):
    branch_verified_km: Optional[str] = None
    km_verification_remark: Optional[str] = None
    freight_charges: Optional[str] = None

class SubmitTempRequest(BaseModel):
    temp_ids: List[int]
    branch_code: str    

class VerifyTempRequest(BaseModel):
    temp_ids: List[int]
    branch_code: str    

class UnverifyTempRequest(BaseModel):
    temp_ids: List[int]
    branch_code: str    

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.post("/upload")
async def upload_tada_file(
    file: UploadFile = File(...),
    branch_code: str = Query(..., description="Branch code"),
    uploaded_by: str = Query(..., description="Name of person uploading"),
    db: Session = Depends(get_db)
):
    """Upload and process TADA Excel file"""
    
    try:
        # Decode URL encoded parameters
        branch_code = unquote(branch_code)
        uploaded_by = unquote(uploaded_by)
                
        # Check file extension
        if not file.filename.endswith(('.xlsx', '.xls')):
            raise HTTPException(status_code=400, detail="Please upload an Excel file (.xlsx or .xls)")
        
        # Save file temporarily
        temp_dir = "temp_uploads"
        os.makedirs(temp_dir, exist_ok=True)
        temp_path = os.path.join(temp_dir, f"{datetime.now().timestamp()}_{file.filename}")
        
        try:
            with open(temp_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
            
            # Process file
            result = controller.process_tada_file(db, temp_path, branch_code, uploaded_by, file.filename)
            
            # Create message
            message_parts = []
            if result["new_records"] > 0:
                message_parts.append(f"{result['new_records']} new")
            if result["updated_records"] > 0:
                message_parts.append(f"{result['updated_records']} updated")
            if result.get("duplicate_skipped", 0) > 0:
                message_parts.append(f"{result['duplicate_skipped']} duplicates in file skipped")
            if result.get("already_submitted_skipped", 0) > 0:
                message_parts.append(f"{result['already_submitted_skipped']} already submitted to HO")
            if result.get("history_skipped", 0) > 0:
                message_parts.append(f"{result['history_skipped']} already in history")
            if result.get("date_skipped", 0) > 0:
                days = result.get("days_limit", 30)
                message_parts.append(f"{result['date_skipped']} rows older than {days} days skipped")
            if result.get("error_records", 0) > 0:
                message_parts.append(f"{result['error_records']} errors")
            
            # Build status flag + message based on what actually happened
            total_added = result["new_records"] + result["updated_records"]
            total_skipped_dup = (
                result.get("duplicate_skipped", 0)
                + result.get("already_submitted_skipped", 0)
                + result.get("history_skipped", 0)
            )
            
            if total_added == 0 and total_skipped_dup > 0:
                # Nothing added — all were duplicates
                status = "duplicate"
                if result.get("history_skipped", 0) > 0:
                    message = f"Duplicate! Record already exists in History table ({', '.join(message_parts)})"
                elif result.get("already_submitted_skipped", 0) > 0:
                    message = f"Duplicate! Record already submitted to HO ({', '.join(message_parts)})"
                else:
                    message = f"Duplicate! Record already exists ({', '.join(message_parts)})"
            elif total_added == 0 and result.get("error_records", 0) > 0:
                status = "error"
                message = f"No records added ({', '.join(message_parts)})"
            elif total_added == 0:
                status = "warning"
                message = f"No records added ({', '.join(message_parts)})" if message_parts else "No records added"
            else:
                status = "success"
                message = f"Successfully processed {result['total_processed']} records ({', '.join(message_parts)})"
            
            return {
                "status": status,
                "message": message,
                "total_processed": result["total_processed"],
                "new_records": result["new_records"],
                "updated_records": result["updated_records"],
                "error_records": result.get("error_records", 0),
                "duplicate_skipped": result.get("duplicate_skipped", 0),
                "already_submitted_skipped": result.get("already_submitted_skipped", 0),
                "history_skipped": result.get("history_skipped", 0),
                "date_skipped": result.get("date_skipped", 0),
                "days_limit": result.get("days_limit", 30),
            }
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error processing file: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}")
        finally:
            # Clean up temp file
            if os.path.exists(temp_path):
                os.remove(temp_path)
                
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Upload error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


@router.post("/validate")
async def validate_tada_file(file: UploadFile = File(...)):
    """Validate file format without uploading"""
    if not file.filename.endswith(('.xlsx', '.xls')):
        return {"valid": False, "message": "Please upload an Excel file (.xlsx or .xls)"}
    
    temp_dir = "temp_uploads"
    os.makedirs(temp_dir, exist_ok=True)
    temp_path = os.path.join(temp_dir, f"validate_{datetime.now().timestamp()}_{file.filename}")
    
    try:
        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        df = pd.read_excel(temp_path)
        is_valid, missing_columns = controller.validate_file_format(df)
        
        if is_valid:
            return {
                "valid": True, 
                "message": "File format is valid",
                "total_rows": len(df),
                "total_columns": len(df.columns)
            }
        else:
            return {
                "valid": False, 
                "message": f"Missing columns: {', '.join(missing_columns[:10])}",
                "missing_columns": missing_columns[:20]
            }
    except Exception as e:
        logger.error(f"Validation error: {str(e)}")
        return {"valid": False, "message": str(e)}
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)


@router.get("/records")
def get_tada_records(
    branch_code: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """Get all TADA records"""
    try:
        if branch_code:
            branch_code = unquote(branch_code)
        records = controller.get_all_tada_records(db, branch_code, skip, limit)
        # Convert to list of dicts for JSON serialization - don't convert dates
        result = []
        for record in records:
            result.append({
                "id": record.id,
                "appointment_number": record.appointment_number,
                "sd_branch_name": record.sd_branch_name,
                "sd_branch_code": record.sd_branch_code,
                "installation_site_address": record.installation_site_address,
                "instance_id": record.instance_id,
                "engine_application_code": record.engine_application_code,
                "engine_serial_number": record.engine_serial_number,
                "account": record.account,
                "account_id": record.account_id,
                "service_request_no": record.service_request_no,
                "sr_type": record.sr_type,
                "sr_sub_type": record.sr_sub_type,
                "sr_due_date": record.sr_due_date,  # Return as string directly
                "task_start_date": record.task_start_date,  # Return as string directly
                "task_end_date": record.task_end_date,  # Return as string directly
                "task_status": record.task_status,
                "task_assigned_datetime": record.task_assigned_datetime,  # Return as string directly
                "task_assign_vs_trip_start": record.task_assign_vs_trip_start,
                "sr_trip_start_datetime": record.sr_trip_start_datetime,  # Return as string directly
                "sr_reach_at_site_datetime": record.sr_reach_at_site_datetime,  # Return as string directly
                "sr_trip_start_lat_long": record.sr_trip_start_lat_long,
                "sr_reach_at_site_lat_long": record.sr_reach_at_site_lat_long,
                "kms_travelled": record.kms_travelled,  # Return as string directly
                "sr_closed_date": record.sr_closed_date,  # Return as string directly
                "sr_status": record.sr_status,
                "asset_primary_contact_no": record.asset_primary_contact_no,
                "voc": record.voc,
                "service_engineer_name": record.service_engineer_name,
                "service_engineer_uid": record.service_engineer_uid,
                "employee_id": getattr(record, "employee_id", None),
                "customer_name": record.customer_name,
                "customer_contact_number": record.customer_contact_number,
                "customer_remark": record.customer_remark,
                "problem_summary": record.problem_summary,
                "nature_of_failure": record.nature_of_failure,
                "action_taken": record.action_taken,
                "engineer_remark": record.engineer_remark,
                "exception_remark": record.exception_remark,
                "otp_remark": record.otp_remark,
                "pdf_generated": record.pdf_generated,
                # NEW COLUMNS - Branch verification fields
                "two_way_km": record.two_way_km,
                "branch_verified_km": record.branch_verified_km,
                "km_verification_remark": record.km_verification_remark,
                "freight_charges": record.freight_charges,
                "verification_status": record.verification_status,
                "branch_code": record.branch_code,
                "uploaded_by": record.uploaded_by,
                "uploaded_at": str(record.uploaded_at) if record.uploaded_at else None,
                "file_name": record.file_name
            })
        return result
    except Exception as e:
        logger.error(f"Error getting records: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/records/{record_id}")
def get_tada_record(record_id: int, db: Session = Depends(get_db)):
    """Get single TADA record by ID"""
    try:
        record = controller.get_tada_record(db, record_id)
        if not record:
            raise HTTPException(status_code=404, detail="Record not found")
        return {
            "id": record.id,
            "appointment_number": record.appointment_number,
            "sd_branch_name": record.sd_branch_name,
            "sd_branch_code": record.sd_branch_code,
            "installation_site_address": record.installation_site_address,
            "instance_id": record.instance_id,
            "engine_application_code": record.engine_application_code,
            "engine_serial_number": record.engine_serial_number,
            "account": record.account,
            "account_id": record.account_id,
            "service_request_no": record.service_request_no,
            "sr_type": record.sr_type,
            "sr_sub_type": record.sr_sub_type,
            "sr_due_date": record.sr_due_date,
            "task_start_date": record.task_start_date,
            "task_end_date": record.task_end_date,
            "task_status": record.task_status,
            "kms_travelled": record.kms_travelled,
            "sr_status": record.sr_status,
            "customer_name": record.customer_name,
            "service_engineer_name": record.service_engineer_name,
            "two_way_km": record.two_way_km,
            "branch_verified_km": record.branch_verified_km,
            "km_verification_remark": record.km_verification_remark,
            "freight_charges": record.freight_charges,
            "verification_status": record.verification_status,
            "uploaded_at": str(record.uploaded_at) if record.uploaded_at else None
        }
    except Exception as e:
        logger.error(f"Error getting record {record_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/records/{record_id}/verify-km")
def update_km_verification(
    record_id: int,
    verification_data: KMVerificationUpdate,
    db: Session = Depends(get_db)
):
    """Update branch verified KM and remarks for a TADA record"""
    try:
        record = db.query(models.TADAImport).filter(models.TADAImport.id == record_id).first()
        if not record:
            raise HTTPException(status_code=404, detail="Record not found")
        
        if verification_data.branch_verified_km is not None:
            record.branch_verified_km = verification_data.branch_verified_km
        if verification_data.km_verification_remark is not None:
            record.km_verification_remark = verification_data.km_verification_remark
        
        db.commit()
        db.refresh(record)
        
        return {
            "message": "KM verification updated successfully",
            "id": record.id,
            "branch_verified_km": record.branch_verified_km,
            "km_verification_remark": record.km_verification_remark
        }
    except Exception as e:
        logger.error(f"Error updating KM verification: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/statistics")
def get_tada_statistics(
    branch_code: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Get TADA statistics"""
    try:
        if branch_code:
            branch_code = unquote(branch_code)
        stats = controller.get_tada_statistics(db, branch_code)
        return stats
    except Exception as e:
        logger.error(f"Error getting statistics: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
    
@router.get("/temp/records")
def get_temp_records(
    branch_code: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    """List staging (un-submitted) TADA records."""
    if branch_code:
        branch_code = unquote(branch_code)
    records = controller.get_all_temp_records(db, branch_code, skip, limit)

    result = []
    for r in records:
        result.append({
            "id": r.id,
            "appointment_number": r.appointment_number,
            "sd_branch_name": r.sd_branch_name,
            "sd_branch_code": r.sd_branch_code,
            "installation_site_address": r.installation_site_address,
            "instance_id": r.instance_id,
            "engine_application_code": r.engine_application_code,
            "engine_serial_number": r.engine_serial_number,
            "account": r.account,
            "account_id": r.account_id,
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
            "asset_primary_contact_no": r.asset_primary_contact_no,
            "voc": r.voc,
            "service_engineer_name": r.service_engineer_name,
            "service_engineer_uid": r.service_engineer_uid,
            "customer_name": r.customer_name,
            "customer_contact_number": r.customer_contact_number,
            "customer_remark": r.customer_remark,
            "problem_summary": r.problem_summary,
            "nature_of_failure": r.nature_of_failure,
            "action_taken": r.action_taken,
            "engineer_remark": r.engineer_remark,
            "exception_remark": r.exception_remark,
            "otp_remark": r.otp_remark,
            "pdf_generated": r.pdf_generated,
            "two_way_km": r.two_way_km,
            "branch_verified_km": r.branch_verified_km,
            "km_verification_remark": r.km_verification_remark,
            "freight_charges": r.freight_charges,
            "employee_id": getattr(r, "employee_id", None),
            "verification_status": r.verification_status or "Pending",
            "branch_code": r.branch_code,
            "uploaded_by": r.uploaded_by,
            "uploaded_at": str(r.uploaded_at) if r.uploaded_at else None,
            "file_name": r.file_name,
        })
    return result


@router.put("/temp/records/{record_id}/verify-km")
def update_temp_km(
    record_id: int,
    verification_data: KMVerificationUpdate,
    db: Session = Depends(get_db),
):
    rec = controller.update_temp_km_verification(
        db, record_id,
        verification_data.branch_verified_km,
        verification_data.km_verification_remark,
        verification_data.freight_charges,
    )
    if not rec:
        raise HTTPException(status_code=404, detail="Draft record not found")
    return {
        "message": "Updated",
        "id": rec.id,
        "branch_verified_km": rec.branch_verified_km,
        "km_verification_remark": rec.km_verification_remark,
        "freight_charges": rec.freight_charges,
    }


@router.delete("/temp/records/{record_id}")
def delete_temp_row(record_id: int, db: Session = Depends(get_db)):
    ok = controller.delete_temp_record(db, record_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Draft record not found")
    return {"message": "Draft deleted"}


@router.post("/temp/submit")
def submit_temp(payload: SubmitTempRequest, db: Session = Depends(get_db)):
    """Move selected drafts to main TADAImport. Day-rule must be enforced
    on the frontend (it's branch-policy, not a DB constraint)."""
    result = controller.submit_temp_to_main(db, payload.temp_ids, payload.branch_code)
    return {
        "message": f"Submitted {result['moved_count']} record(s)",
        **result,
    }    

@router.get("/submitted/records")
def get_submitted_records(
    branch_code: str = Query(..., description="Branch code"),
    db: Session = Depends(get_db),
):
    """Get all records from TADAImport (main) for this branch — i.e. records
    already submitted from drafts but not yet moved to history."""
    branch_code = unquote(branch_code)
    records = (
        db.query(models.TADAImport)
        .filter(models.TADAImport.branch_code == branch_code)
        .order_by(models.TADAImport.uploaded_at.desc())
        .all()
    )
    result = []
    for r in records:
        result.append({
            "id": r.id,
            "appointment_number": r.appointment_number,
            "sd_branch_name": r.sd_branch_name,
            "sd_branch_code": r.sd_branch_code,
            "installation_site_address": r.installation_site_address,
            "instance_id": r.instance_id,
            "engine_application_code": r.engine_application_code,
            "engine_serial_number": r.engine_serial_number,
            "account": r.account,
            "account_id": r.account_id,
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
            "asset_primary_contact_no": r.asset_primary_contact_no,
            "voc": r.voc,
            "service_engineer_name": r.service_engineer_name,
            "service_engineer_uid": r.service_engineer_uid,
            "customer_name": r.customer_name,
            "customer_contact_number": r.customer_contact_number,
            "customer_remark": r.customer_remark,
            "problem_summary": r.problem_summary,
            "nature_of_failure": r.nature_of_failure,
            "action_taken": r.action_taken,
            "engineer_remark": r.engineer_remark,
            "exception_remark": r.exception_remark,
            "otp_remark": r.otp_remark,
            "pdf_generated": r.pdf_generated,
            "two_way_km": r.two_way_km,
            "branch_verified_km": r.branch_verified_km,
            "km_verification_remark": r.km_verification_remark,
            "ho_corrected_km": r.ho_corrected_km,
            "km_rate_applied": r.km_rate_applied,
            "da_amount": getattr(r, "da_amount", None),
            "freight_charges": r.freight_charges,
            "total_amount": getattr(r, "total_amount", None),
            "ho_remark": r.ho_remark,
            "employee_id": getattr(r, "employee_id", None),
            "verification_status": r.verification_status or "Pending",
            "voucher_no": getattr(r, "voucher_no", None),
            "branch_code": r.branch_code,
            "uploaded_by": r.uploaded_by,
            "uploaded_at": str(r.uploaded_at) if r.uploaded_at else None,
            "file_name": r.file_name,
        })
    return result

@router.post("/temp/verify")
def verify_temp(payload: VerifyTempRequest, db: Session = Depends(get_db)):
    """Branch-level verification — moves rows from Drafts → Verified in the UI.
    Rows remain in TADAImportTemp; only verification_status flips to 'Verified'."""
    result = controller.verify_temp_records(db, payload.temp_ids, payload.branch_code)
    msg_parts = [f"Verified {result['verified_count']} record(s)"]
    if result.get("skipped_no_km"): msg_parts.append(f"{result['skipped_no_km']} skipped (no KM)")
    if result.get("skipped_no_remark"): msg_parts.append(f"{result['skipped_no_remark']} skipped (no remark)")
    if result.get("skipped_already"): msg_parts.append(f"{result['skipped_already']} already verified")
    return {"message": ", ".join(msg_parts), **result}

@router.post("/temp/unverify")
def unverify_temp(payload: UnverifyTempRequest, db: Session = Depends(get_db)):
    """Reverse of /temp/verify — flips verification_status from 'Verified'
    back to 'Pending' so rows reappear in the Drafts tab and become editable."""
    result = controller.unverify_temp_records(db, payload.temp_ids, payload.branch_code)
    msg_parts = [f"Unverified {result['unverified_count']} record(s)"]
    if result.get("skipped_not_verified"):
        msg_parts.append(f"{result['skipped_not_verified']} were not verified")
    if result.get("skipped_not_found"):
        msg_parts.append(f"{result['skipped_not_found']} not found")
    return {"message": ", ".join(msg_parts), **result}    

@router.get("/employees/branch/{branch_code}")
def get_branch_employees(branch_code: str, db: Session = Depends(get_db)):
    from app.models.expenseAddingData_model import BranchEmployee
    employees = db.query(BranchEmployee).filter(
        BranchEmployee.branch_code == branch_code,
        BranchEmployee.is_active == True
    ).order_by(BranchEmployee.employee_name).all()
    return [
        {
            "id": e.id,
            "employee_name": e.employee_name,
            "employee_id": e.employee_id,
            "employee_uid": e.employee_uid,
            "designation": e.designation,
        }
        for e in employees
    ]