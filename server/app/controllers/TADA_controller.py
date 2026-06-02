import pandas as pd
import numpy as np
from collections import Counter, defaultdict
from sqlalchemy.orm import Session
from sqlalchemy import desc
from datetime import datetime, timedelta
from typing import List, Dict, Tuple, Optional
from fastapi import HTTPException
import logging

from app.models import TADA_model as models
from app.models.expenseAddingData_model import BranchKMRate, BranchEmployee
from app.models.branch_upload_limit_model import BranchUploadLimit
from app.models.TADAImport_temp_model import TADAImportTemp
from app.models.TADA_history_model import TADAHistory
from app.controllers.voucher_controller import generate_voucher_no

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

EXPECTED_COLUMNS = [
    "SD Branch Name", "SD Branch Code", "Installation Site Address", "Instance ID",
    "Engine Application Code", "Engine Serial Number", "Account", "Account ID",
    "Service Request No.", "Appointment Number", "SR Type", "SR Sub Type",
    "SR Due date", "Task Start Date", "Task End Date", "Task Status",
    "Task Assigned Date & Time", "Task Assign v.s Trip Start",
    "SR Trip Start Date & Time", "SR Reach at Site Date & Time",
    "SR Trip Start Lat Long", "SR Reach at site Lat long", "KMs Travelled",
    "SR Closed Date", "SR Status", "Asset Primary Contact No.", "VOC",
    "Service Engineer Name", "Service Engineer UID", "Customer Name",
    "Customer contact number", "Customer Remark", "Problem Summary",
    "Nature of Failure", "Action Taken", "Engineer Remark", "Exception Remark",
    "OTP Remark", "PDF Generated"
]

COLUMN_MAPPING = {
    "SD Branch Name": "sd_branch_name",
    "SD Branch Code": "sd_branch_code",
    "Installation Site Address": "installation_site_address",
    "Instance ID": "instance_id",
    "Engine Application Code": "engine_application_code",
    "Engine Serial Number": "engine_serial_number",
    "Account": "account",
    "Account ID": "account_id",
    "Service Request No.": "service_request_no",
    "Appointment Number": "appointment_number",
    "SR Type": "sr_type",
    "SR Sub Type": "sr_sub_type",
    "SR Due date": "sr_due_date",
    "Task Start Date": "task_start_date",
    "Task End Date": "task_end_date",
    "Task Status": "task_status",
    "Task Assigned Date & Time": "task_assigned_datetime",
    "Task Assign v.s Trip Start": "task_assign_vs_trip_start",
    "SR Trip Start Date & Time": "sr_trip_start_datetime",
    "SR Reach at Site Date & Time": "sr_reach_at_site_datetime",
    "SR Trip Start Lat Long": "sr_trip_start_lat_long",
    "SR Reach at site Lat long": "sr_reach_at_site_lat_long",
    "KMs Travelled": "kms_travelled",
    "SR Closed Date": "sr_closed_date",
    "SR Status": "sr_status",
    "Asset Primary Contact No.": "asset_primary_contact_no",
    "VOC": "voc",
    "Service Engineer Name": "service_engineer_name",
    "Service Engineer UID": "service_engineer_uid",
    "Customer Name": "customer_name",
    "Customer contact number": "customer_contact_number",
    "Customer Remark": "customer_remark",
    "Problem Summary": "problem_summary",
    "Nature of Failure": "nature_of_failure",
    "Action Taken": "action_taken",
    "Engineer Remark": "engineer_remark",
    "Exception Remark": "exception_remark",
    "OTP Remark": "otp_remark",
    "PDF Generated": "pdf_generated"
}


def parse_as_string(value):
    """Parse any value as string exactly as it appears in Excel"""
    if pd.isna(value) or value is None:
        return None
    # Convert to string and strip whitespace
    str_value = str(value).strip()
    # Return empty string if it's 'nan' or empty
    if str_value.lower() == 'nan' or str_value == '':
        return None
    return str_value


def calculate_two_way_km(kms_travelled_value: Optional[str]) -> Optional[str]:
    """Calculate two way KM based on KMs Travelled (double the value)"""
    if not kms_travelled_value:
        return None
    try:
        # Convert to float, multiply by 2, then back to string
        km_value = float(kms_travelled_value)
        two_way_km = km_value * 2
        return str(two_way_km)
    except (ValueError, TypeError):
        return None


# ─── SR Closed Date day-limit filter helpers ─────────────────────────────────

def get_tada_days_limit(db: Session, branch_code: str) -> int:
    """
    Fetch TADA upload day-limit for a branch from BranchUploadLimit table.
    Falls back to 30 days if no row is configured.
    """
    limit_row = db.query(BranchUploadLimit).filter(
        BranchUploadLimit.branch_code == branch_code
    ).first()
    if limit_row and limit_row.tada_days and limit_row.tada_days > 0:
        return limit_row.tada_days
    logger.warning(
        f"No TADA upload limit configured for branch '{branch_code}' — "
        f"falling back to default 30 days"
    )
    return 30


def parse_sr_closed_date(value) -> Optional[datetime]:
    """
    Parse SR Closed Date from various formats Excel may produce.
    Examples seen in file:
        '1/9/2026, 5:36 PM'
        '1/15/2026, 5:50 PM'
        '1/27/2026, 3:56 PM'
    Returns a datetime object, or None if value is blank / unparseable.
    """
    if not value:
        return None
    str_val = str(value).strip()
    if str_val in ('', 'nan', 'None', '-'):
        return None

    # Try formats from most specific to least specific
    formats = [
        '%m/%d/%Y, %I:%M %p',   # 1/9/2026, 5:36 PM   ← primary format from Excel
        '%m/%d/%Y %I:%M %p',    # 1/9/2026 5:36 PM
        '%m/%d/%Y, %H:%M',      # 1/9/2026, 17:36
        '%m/%d/%Y %H:%M',       # 1/9/2026 17:36
        '%m/%d/%Y',             # 1/9/2026
        '%d/%m/%Y, %I:%M %p',   # 9/1/2026, 5:36 PM  (alternate locale)
        '%d/%m/%Y %I:%M %p',    # 9/1/2026 5:36 PM
        '%d/%m/%Y',             # 9/1/2026
        '%Y-%m-%d %H:%M:%S',    # 2026-01-09 17:36:00
        '%Y-%m-%d',             # 2026-01-09
    ]
    for fmt in formats:
        try:
            return datetime.strptime(str_val, fmt)
        except ValueError:
            continue

    logger.warning(f"parse_sr_closed_date: could not parse '{str_val}'")
    return None


def is_within_last_30_days(raw_value, days: int = 30) -> bool:
    """
    Returns True  → row should be IMPORTED (within last `days` days, blank, or unparseable)
    Returns False → row should be SKIPPED  (older than `days` days)
    """
    parsed = parse_sr_closed_date(raw_value)
    if parsed is None:
        return True
    cutoff = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=days)
    return parsed >= cutoff

def reach_date_key(raw_value) -> Optional[str]:
    """Date portion (YYYY-MM-DD) of SR Reach at Site Date & Time, for SR-per-day grouping."""
    parsed = parse_sr_closed_date(raw_value)   # generic multi-format parser
    return parsed.date().isoformat() if parsed else None    

# ─────────────────────────────────────────────────────────────────────────────


def get_branch_km_rate(db: Session, branch_code: str) -> Optional[BranchKMRate]:
    """Get KM rate for a specific branch"""
    return db.query(BranchKMRate).filter(BranchKMRate.branch_code == branch_code).first()


def find_branch_for_engineer(
    db: Session,
    engineer_uid: str,
    current_branch_code: str,
    file_branch_hints: Optional[List[str]] = None,
) -> str:
    """
    Resolve the correct branch for an engineer when the row's branch
    is not configured in BranchKMRate.

    Priority:
      1. Collect engineer's branches from current file (file_branch_hints)
         + engineer's branches from existing DB records.
      2. Keep only branches that exist in BranchKMRate.
      3. If multiple valid branches → return the MAJORITY (most frequent).
      4. If none found → fall back to 'HO'.
    """
    branch_votes: List[str] = []

    # (a) Branches seen for this engineer in the CURRENT file being uploaded
    if file_branch_hints:
        branch_votes.extend([b for b in file_branch_hints if b])

    # (b) Branches seen for this engineer in EXISTING DB records
    if engineer_uid:
        engineer_records = db.query(models.TADAImport).filter(
            models.TADAImport.service_engineer_uid == engineer_uid,
            models.TADAImport.sd_branch_code.isnot(None),
            models.TADAImport.sd_branch_code != ''
        ).all()
        branch_votes.extend([r.sd_branch_code for r in engineer_records if r.sd_branch_code])

    # Keep only branches that actually exist in BranchKMRate
    valid_votes = [b for b in branch_votes if get_branch_km_rate(db, b)]

    if valid_votes:
        # Majority wins (Counter.most_common returns highest count first)
        majority_branch, count = Counter(valid_votes).most_common(1)[0]
        logger.debug(
            f"Engineer {engineer_uid}: majority branch = {majority_branch} "
            f"(votes={count}, total_valid_votes={len(valid_votes)})"
        )
        return majority_branch

    # No valid branch anywhere → fall back to HO
    logger.debug(
        f"Engineer {engineer_uid}: no valid branch found in file or DB — "
        f"falling back to 'HO'"
    )
    return 'HO'


def branch_has_rates(branch_rate) -> bool:
    """True if the branch master has any non-zero rate/DA slab configured."""
    if not branch_rate:
        return False
    fields = (
        'single_low_rate', 'single_low_da', 'multi_low_rate', 'multi_low_da',
        'single_high_rate', 'single_high_da', 'multi_high_rate', 'multi_high_da',
    )
    return any(float(getattr(branch_rate, f) or 0) > 0 for f in fields)


def pick_rate_da(branch_rate, effective_km, sr_count: int):
    """Pick (rate, da) from the 2×2 master: (1 vs >1 SR/day) × (km ≤ vs > threshold)."""
    if not branch_rate or effective_km is None:
        return 0.0, 0.0
    threshold = float(branch_rate.km_threshold or 100)
    high = float(effective_km) > threshold          # km == threshold counts as LOW
    multi = (sr_count or 1) > 1
    if multi and high:
        return float(branch_rate.multi_high_rate or 0), float(branch_rate.multi_high_da or 0)
    if multi and not high:
        return float(branch_rate.multi_low_rate or 0), float(branch_rate.multi_low_da or 0)
    if (not multi) and high:
        return float(branch_rate.single_high_rate or 0), float(branch_rate.single_high_da or 0)
    return float(branch_rate.single_low_rate or 0), float(branch_rate.single_low_da or 0)


def update_record_calculations(
    db: Session,
    record,
    file_branch_hints: Optional[List[str]] = None,
    sr_count: int = 1,
) -> bool:
    """
    Update calculated fields for a single record:
      - Two Way KM from KMs Travelled
      - KM Rate from the 2×2 branch master, picked by (SR-per-day count) × (km vs threshold)

    NOTE on DA: DA is a PER-DAY amount, not per-SR. The km rate (and km amount)
    applies to every SR, but the slab DA is applied only to the LAST SR of the
    engineer's day; all earlier same-day SRs get DA = 0. DA is not stored here —
    it is computed downstream (frontend matrix + HO/Sales controllers), which own
    the "last SR of the day" decision. This function only stamps the per-SR rate.
    """
    updated = False
    old_two_way_km = record.two_way_km
    old_km_rate = record.km_rate_applied

    # 1. Two Way KM
    new_two_way_km = calculate_two_way_km(record.kms_travelled)
    if new_two_way_km != old_two_way_km:
        record.two_way_km = new_two_way_km
        updated = True

    # 2. Resolve branch (fall back to engineer's majority branch / HO if unconfigured)
    branch_code_to_use = record.sd_branch_code
    branch_rate = get_branch_km_rate(db, branch_code_to_use)
    if not branch_has_rates(branch_rate) and record.service_engineer_uid:
        corrected = find_branch_for_engineer(
            db, record.service_engineer_uid, branch_code_to_use,
            file_branch_hints=file_branch_hints,
        )
        if corrected != branch_code_to_use:
            branch_code_to_use = corrected
            branch_rate = get_branch_km_rate(db, branch_code_to_use)

    # 3. Effective KM = two_way_km at branch stage
    eff_km = None
    if record.two_way_km:
        try:
            eff_km = float(record.two_way_km)
        except (ValueError, TypeError):
            eff_km = None

    rate, _da = pick_rate_da(branch_rate, eff_km, sr_count)
    new_km_rate = str(rate) if rate else None
    if new_km_rate != old_km_rate:
        record.km_rate_applied = new_km_rate
        updated = True

    return updated


def validate_file_format(df: pd.DataFrame) -> Tuple[bool, List[str]]:
    """Validate if file has expected columns"""
    actual_columns = [str(col).strip() for col in df.columns]
    missing_columns = []
    
    for expected in EXPECTED_COLUMNS:
        if expected not in actual_columns:
            missing_columns.append(expected)
    
    if missing_columns:
        logger.warning(f"Missing columns: {missing_columns[:10]}")
        return False, missing_columns
    
    return True, []


def process_tada_file(db: Session, file_path: str, branch_code: str, uploaded_by: str, file_name: str) -> Dict:
    """Process TADA Excel file and store in TADAImportTemp (staging).
    Rows already present in TADAImport (main) are skipped."""

    try:
        df = pd.read_excel(file_path, dtype=str, keep_default_na=False)
        df = df.fillna('')
        df.columns = [str(col).strip() for col in df.columns]
    except Exception as e:
        logger.error(f"Error reading Excel file: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Error reading Excel file: {str(e)}")

    is_valid, missing_columns = validate_file_format(df)
    if not is_valid:
        raise HTTPException(
            status_code=400,
            detail=f"File format invalid. Missing columns: {', '.join(missing_columns[:10])}"
        )

    days_limit = get_tada_days_limit(db, branch_code)
    logger.info(f"Branch '{branch_code}' TADA upload day-limit = {days_limit} days")

    engineer_file_branches: Dict[str, List[str]] = defaultdict(list)
    engineer_day_sr_count: Dict[Tuple[str, str], int] = defaultdict(int)
    for _, r in df.iterrows():
        eng_uid = parse_as_string(r.get("Service Engineer UID"))
        br_code = parse_as_string(r.get("SD Branch Code"))
        if eng_uid and br_code:
            engineer_file_branches[eng_uid].append(br_code)
        dkey = reach_date_key(r.get("SR Reach at Site Date & Time"))
        if eng_uid and dkey:
            engineer_day_sr_count[(eng_uid, dkey)] += 1

    new_count = 0
    updated_count = 0
    error_count = 0
    duplicate_skipped = 0
    already_submitted_skipped = 0
    history_skipped = 0
    date_skipped = 0
    processed_appointments = set()

    for index, row in df.iterrows():
        try:
            appointment_number = parse_as_string(row.get("Appointment Number"))
            task_start_date = parse_as_string(row.get("Task Start Date"))
            service_engineer_name = parse_as_string(row.get("Service Engineer Name"))

            # If Appointment Number is null/empty, allow import without duplicate checks
            if not appointment_number:
                # Generate a unique placeholder so the record can be stored
                appointment_number = f"MANUAL_{index}_{datetime.now().strftime('%Y%m%d%H%M%S%f')}"
                # Skip all duplicate checks for null-appointment rows — fall through to insert
                pass
            else:
                # Composite unique key = (appointment_number, task_start_date, service_engineer_name)
                unique_key = (appointment_number, task_start_date, service_engineer_name)

                if unique_key in processed_appointments:
                    duplicate_skipped += 1
                    continue
                processed_appointments.add(unique_key)

            # Skip if older than allowed window
            sr_closed_raw = row.get("SR Closed Date", "")
            if not is_within_last_30_days(sr_closed_raw, days_limit):
                date_skipped += 1
                continue

            is_manual_no_appt = appointment_number.startswith('MANUAL_')

            if not is_manual_no_appt:
                # Skip if already submitted to MAIN (match on appointment + task_start + engineer)
                already_in_main = db.query(models.TADAImport).filter(
                    models.TADAImport.appointment_number == appointment_number,
                    models.TADAImport.task_start_date == task_start_date,
                    models.TADAImport.service_engineer_name == service_engineer_name,
                ).first()
                if already_in_main:
                    already_submitted_skipped += 1
                    continue

                # Skip if already moved to HISTORY (archived/paid)
                already_in_history = db.query(TADAHistory).filter(
                    TADAHistory.appointment_number == appointment_number,
                    TADAHistory.task_start_date == task_start_date,
                    TADAHistory.service_engineer_name == service_engineer_name,
                ).first()
                if already_in_history:
                    history_skipped += 1
                    continue

                # Existing in TEMP? Skip as duplicate; otherwise create
                existing_temp = db.query(TADAImportTemp).filter(
                    TADAImportTemp.appointment_number == appointment_number,
                    TADAImportTemp.task_start_date == task_start_date,
                    TADAImportTemp.service_engineer_name == service_engineer_name,
                    TADAImportTemp.branch_code == branch_code,
                ).first()
                if existing_temp:
                    duplicate_skipped += 1
                    continue

            kms_travelled_value = parse_as_string(row.get("KMs Travelled"))
            two_way_km_value = calculate_two_way_km(kms_travelled_value)

            data = {
                "appointment_number": appointment_number,
                "sd_branch_name": parse_as_string(row.get("SD Branch Name")),
                "sd_branch_code": parse_as_string(row.get("SD Branch Code")),
                "installation_site_address": parse_as_string(row.get("Installation Site Address")),
                "instance_id": parse_as_string(row.get("Instance ID")),
                "engine_application_code": parse_as_string(row.get("Engine Application Code")),
                "engine_serial_number": parse_as_string(row.get("Engine Serial Number")),
                "account": parse_as_string(row.get("Account")),
                "account_id": parse_as_string(row.get("Account ID")),
                "service_request_no": parse_as_string(row.get("Service Request No.")),
                "sr_type": parse_as_string(row.get("SR Type")),
                "sr_sub_type": parse_as_string(row.get("SR Sub Type")),
                "sr_due_date": parse_as_string(row.get("SR Due date")),
                "task_start_date": parse_as_string(row.get("Task Start Date")),
                "task_end_date": parse_as_string(row.get("Task End Date")),
                "task_status": parse_as_string(row.get("Task Status")),
                "task_assigned_datetime": parse_as_string(row.get("Task Assigned Date & Time")),
                "task_assign_vs_trip_start": parse_as_string(row.get("Task Assign v.s Trip Start")),
                "sr_trip_start_datetime": parse_as_string(row.get("SR Trip Start Date & Time")),
                "sr_reach_at_site_datetime": parse_as_string(row.get("SR Reach at Site Date & Time")),
                "sr_trip_start_lat_long": parse_as_string(row.get("SR Trip Start Lat Long")),
                "sr_reach_at_site_lat_long": parse_as_string(row.get("SR Reach at site Lat long")),
                "kms_travelled": kms_travelled_value,
                "two_way_km": two_way_km_value,
                "sr_closed_date": parse_as_string(row.get("SR Closed Date")),
                "sr_status": parse_as_string(row.get("SR Status")),
                "asset_primary_contact_no": parse_as_string(row.get("Asset Primary Contact No.")),
                "voc": parse_as_string(row.get("VOC")),
                "service_engineer_name": parse_as_string(row.get("Service Engineer Name")),
                "service_engineer_uid": parse_as_string(row.get("Service Engineer UID")),
                "customer_name": parse_as_string(row.get("Customer Name")),
                "customer_contact_number": parse_as_string(row.get("Customer contact number")),
                "customer_remark": parse_as_string(row.get("Customer Remark")),
                "problem_summary": parse_as_string(row.get("Problem Summary")),
                "nature_of_failure": parse_as_string(row.get("Nature of Failure")),
                "action_taken": parse_as_string(row.get("Action Taken")),
                "engineer_remark": parse_as_string(row.get("Engineer Remark")),
                "exception_remark": parse_as_string(row.get("Exception Remark")),
                "otp_remark": parse_as_string(row.get("OTP Remark")),
                "pdf_generated": parse_as_string(row.get("PDF Generated")),
                "branch_code": branch_code,
                "uploaded_by": uploaded_by,
                "file_name": file_name,
                "verification_status": "Pending",
            }

            # Look up employee_id from BranchEmployee using service_engineer_uid
            engineer_uid_for_lookup = parse_as_string(row.get("Service Engineer UID"))
            engineer_name_for_lookup = parse_as_string(row.get("Service Engineer Name"))
            employee_id_value = None
            
            if engineer_uid_for_lookup:
                # Primary: match by UID
                branch_emp = db.query(BranchEmployee).filter(
                    BranchEmployee.employee_uid == engineer_uid_for_lookup,
                    BranchEmployee.is_active == True
                ).first()
                if branch_emp:
                    employee_id_value = branch_emp.employee_id
            
            # Fallback: if UID didn't find a match, try by engineer name
            if not employee_id_value and engineer_name_for_lookup:
                branch_emp = db.query(BranchEmployee).filter(
                    BranchEmployee.employee_name == engineer_name_for_lookup,
                    BranchEmployee.branch_code == branch_code,
                    BranchEmployee.is_active == True
                ).first()
                if branch_emp:
                    employee_id_value = branch_emp.employee_id
            
            data["employee_id"] = employee_id_value

            new_record = TADAImportTemp(**data)
            db.add(new_record)
            db.flush()
            hints = engineer_file_branches.get(new_record.service_engineer_uid, [])
            dkey = reach_date_key(new_record.sr_reach_at_site_datetime)
            sr_count = (
                engineer_day_sr_count.get((new_record.service_engineer_uid, dkey), 1)
                if dkey else 1
            )
            update_record_calculations(db, new_record, file_branch_hints=hints, sr_count=sr_count)
            new_count += 1

            if new_count % 100 == 0:
                db.commit()

        except Exception as e:
            logger.error(f"Error processing row {index}: {str(e)}")
            error_count += 1
            db.rollback()
            continue

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        logger.error(f"Error committing to database: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

    return {
        "total_processed": new_count + updated_count,
        "new_records": new_count,
        "updated_records": updated_count,
        "error_records": error_count,
        "duplicate_skipped": duplicate_skipped,
        "already_submitted_skipped": already_submitted_skipped,
        "history_skipped": history_skipped,
        "date_skipped": date_skipped,
        "days_limit": days_limit,
    }


def get_all_tada_records(db: Session, branch_code: Optional[str] = None, skip: int = 0, limit: int = 100):
    """Get all TADA records with optional branch filter"""
    try:
        query = db.query(models.TADAImport)
        if branch_code:
            query = query.filter(models.TADAImport.branch_code == branch_code)
        return query.order_by(desc(models.TADAImport.uploaded_at)).offset(skip).limit(limit).all()
    except Exception as e:
        logger.error(f"Error getting records: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


def get_tada_record(db: Session, record_id: int):
    """Get single TADA record by ID"""
    try:
        return db.query(models.TADAImport).filter(models.TADAImport.id == record_id).first()
    except Exception as e:
        logger.error(f"Error getting record {record_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


def update_km_verification(db: Session, record_id: int, verified_km: Optional[str], remark: Optional[str]):
    """Update branch verified KM and remarks for a record"""
    try:
        record = db.query(models.TADAImport).filter(models.TADAImport.id == record_id).first()
        if not record:
            return None
        
        if verified_km is not None:
            record.branch_verified_km = verified_km
        if remark is not None:
            record.km_verification_remark = remark
        
        db.commit()
        db.refresh(record)
        return record
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating KM verification: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


def update_ho_correction(db: Session, record_id: int, corrected_km: Optional[str], ho_remark: Optional[str], verification_status: Optional[str] = None):
    """Update HO corrected KM and remark for a record"""
    try:
        record = db.query(models.TADAImport).filter(models.TADAImport.id == record_id).first()
        if not record:
            return None
        
        if corrected_km is not None:
            record.ho_corrected_km = corrected_km
        if ho_remark is not None:
            record.ho_remark = ho_remark
        if verification_status is not None:
            record.verification_status = verification_status
        
        db.commit()
        db.refresh(record)
        return record
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating HO correction: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


def update_tada_record(db: Session, record_id: int, update_data: dict) -> Optional[models.TADAImport]:
    """Generic update for TADA record"""
    try:
        record = db.query(models.TADAImport).filter(models.TADAImport.id == record_id).first()
        if not record:
            return None
        
        # Update only provided fields
        for key, value in update_data.items():
            if hasattr(record, key) and key != "id":
                setattr(record, key, value)
        
        db.commit()
        db.refresh(record)
        return record
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating record {record_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


def get_tada_statistics(db: Session, branch_code: Optional[str] = None):
    """Get statistics for TADA records"""
    try:
        query = db.query(models.TADAImport)
        if branch_code:
            query = query.filter(models.TADAImport.branch_code == branch_code)
        
        total_records = query.count()
        unique_branches = db.query(models.TADAImport.sd_branch_code).distinct().count()
        
        return {
            "total_records": total_records,
            "unique_branches": unique_branches,
            "branch_code": branch_code
        }
    except Exception as e:
        logger.error(f"Error getting statistics: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    
# ─── TEMP / DRAFT operations ─────────────────────────────────────────────────

def get_all_temp_records(db: Session, branch_code: Optional[str] = None,
                        skip: int = 0, limit: int = 100):
    try:
        q = db.query(TADAImportTemp)
        if branch_code:
            q = q.filter(TADAImportTemp.branch_code == branch_code)
        return q.order_by(desc(TADAImportTemp.uploaded_at)).offset(skip).limit(limit).all()
    except Exception as e:
        logger.error(f"Error getting temp records: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


def update_temp_km_verification(db: Session, record_id: int,
                                verified_km: Optional[str], remark: Optional[str],
                                freight_charges: Optional[str] = None):
    try:
        rec = db.query(TADAImportTemp).filter(TADAImportTemp.id == record_id).first()
        if not rec:
            return None
        if verified_km is not None:
            rec.branch_verified_km = verified_km
        if remark is not None:
            rec.km_verification_remark = remark
        if freight_charges is not None:
            rec.freight_charges = freight_charges
        db.commit()
        db.refresh(rec)
        return rec
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating temp KM: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

def delete_temp_record(db: Session, record_id: int) -> bool:
    try:
        rec = db.query(TADAImportTemp).filter(TADAImportTemp.id == record_id).first()
        if not rec:
            return False
        db.delete(rec)
        db.commit()
        return True
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting temp record {record_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


_TEMP_TO_MAIN_FIELDS = [
    "appointment_number", "sd_branch_name", "sd_branch_code", "installation_site_address",
    "instance_id", "engine_application_code", "engine_serial_number", "account", "account_id",
    "service_request_no", "sr_type", "sr_sub_type", "sr_due_date", "task_start_date",
    "task_end_date", "task_status", "task_assigned_datetime", "task_assign_vs_trip_start",
    "sr_trip_start_datetime", "sr_reach_at_site_datetime", "sr_trip_start_lat_long",
    "sr_reach_at_site_lat_long", "kms_travelled", "sr_closed_date", "sr_status",
    "asset_primary_contact_no", "voc", "service_engineer_name", "service_engineer_uid",
    "customer_name", "customer_contact_number", "customer_remark", "problem_summary",
    "nature_of_failure", "action_taken", "engineer_remark", "exception_remark",
    "otp_remark", "pdf_generated",
    "branch_verified_km", "km_verification_remark",
    "freight_charges",
    "two_way_km", "km_rate_applied",
    "employee_id",
    "branch_code", "uploaded_by", "file_name",
]


def submit_temp_to_main(db, temp_ids, branch_code):
    if not temp_ids:
        return {"moved_count": 0, "skipped_existing": 0, "skipped_unverified": 0, "voucher_no": None}
    moved = skipped_existing = skipped_unverified = 0
    voucher_no = None
    try:
        temps = db.query(TADAImportTemp).filter(
            TADAImportTemp.id.in_(temp_ids),
            TADAImportTemp.branch_code == branch_code,
        ).all()

        movable = [t for t in temps if (t.verification_status or 'Pending') == 'Verified']
        if movable:
            voucher_no = generate_voucher_no(db, "TADA", branch_code)

        for t in temps:
            if (t.verification_status or 'Pending') != 'Verified':
                skipped_unverified += 1
                continue
            existing_main = db.query(models.TADAImport).filter(
                models.TADAImport.appointment_number == t.appointment_number,
                models.TADAImport.task_start_date == t.task_start_date,
                models.TADAImport.service_engineer_name == t.service_engineer_name,
            ).first()
            if existing_main:
                skipped_existing += 1
                db.delete(t)
                continue
            payload = {f: getattr(t, f) for f in _TEMP_TO_MAIN_FIELDS}
            payload["verification_status"] = "Pending"
            payload["voucher_no"] = voucher_no          # <-- only added line
            db.add(models.TADAImport(**payload))
            db.delete(t)
            moved += 1
        db.commit()
        return {"moved_count": moved, "skipped_existing": skipped_existing,
                "skipped_unverified": skipped_unverified, "voucher_no": voucher_no}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    
def verify_temp_records(db: Session, temp_ids: List[int], branch_code: str) -> Dict:
    """Branch-level verification: flip selected temp rows from 'Pending' to 'Verified'.
    Rows stay in TADAImportTemp; they just move from Drafts → Verified tab in the UI.
    Requires branch_verified_km and km_verification_remark to be filled."""
    if not temp_ids:
        return {"verified_count": 0, "skipped_no_km": 0, "skipped_no_remark": 0, "skipped_already": 0}

    verified = 0
    skipped_no_km = 0
    skipped_no_remark = 0
    skipped_already = 0

    try:
        temps = db.query(TADAImportTemp).filter(
            TADAImportTemp.id.in_(temp_ids),
            TADAImportTemp.branch_code == branch_code,
        ).all()

        for t in temps:
            if (t.verification_status or 'Pending') == 'Verified':
                skipped_already += 1
                continue
            t.verification_status = 'Verified'
            verified += 1

        db.commit()
        return {
            "verified_count": verified,
            "skipped_no_km": skipped_no_km,
            "skipped_no_remark": skipped_no_remark,
            "skipped_already": skipped_already,
        }
    except Exception as e:
        db.rollback()
        logger.error(f"verify_temp_records error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))   

def unverify_temp_records(db, temp_ids, branch_code):
    """Flip verification_status from 'Verified' back to 'Pending' for the
    given temp rows belonging to this branch. Rows stay in TADAImportTemp,
    so KM and remark remain intact and become editable again on the UI."""
    if not temp_ids:
        return {
            "unverified_count": 0,
            "skipped_not_verified": 0,
            "skipped_not_found": 0,
        }

    rows = (
        db.query(TADAImportTemp)
        .filter(
            TADAImportTemp.id.in_(temp_ids),
            TADAImportTemp.branch_code == branch_code,
        )
        .all()
    )

    found_ids = {r.id for r in rows}
    skipped_not_found = len([tid for tid in temp_ids if tid not in found_ids])

    unverified_count = 0
    skipped_not_verified = 0

    for r in rows:
        if (r.verification_status or "Pending") == "Verified":
            r.verification_status = "Pending"
            unverified_count += 1
        else:
            skipped_not_verified += 1

    db.commit()

    return {
        "unverified_count": unverified_count,
        "skipped_not_verified": skipped_not_verified,
        "skipped_not_found": skipped_not_found,
    }         
