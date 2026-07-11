from sqlalchemy.orm import Session
from sqlalchemy import func, distinct, and_, or_
from typing import List, Dict, Any, Optional
from collections import defaultdict
from app.models.TADA_model import TADAImport
from app.models.TADA_history_model import TADAHistory

# Branch mapping - ONLY these 15 branches are allowed
BRANCH_MAP = {
    'HO': 'Pune Office',
    '420435_1': 'Ch.Sambhaji Nagar',
    '420435_2': 'Ahilyanagar',
    '420435_3': 'Beed',
    '420435_4': 'Nanded',
    '420435_5': 'Babhaleshwar',
    '420435_6': 'Latur',
    '420435_7': 'Parbhani',
    '420435_8': 'Hubli',
    '420435_9': 'Belagavi',
    '420435_10': 'Hospet',
    '420435_11': 'Ballari',
    '420435_12': 'Bagalkot',
    '420435_13': 'Gulbarga',
    '420435_14': 'Bijapur'
}

# Allowed branch codes
ALLOWED_BRANCH_CODES = set(BRANCH_MAP.keys())

def get_engineer_correct_branch(db: Session, engineer_uid: str) -> Optional[str]:
    """
    Find the correct allowed branch for an engineer based on the UPLOADER's branch_code
    (i.e., who submitted the record from branch admin side), not the Excel's sd_branch_code.
    - If engineer has records uploaded by allowed branches, use the most common one
    - Otherwise default to 'HO'
    """
    # Query all uploader-branches this engineer appears in that are in the allowed list
    allowed_branches = db.query(
        TADAImport.branch_code,
        func.count(TADAImport.id).label('record_count')
    ).filter(
        and_(
            TADAImport.service_engineer_uid == engineer_uid,
            TADAImport.branch_code.in_(ALLOWED_BRANCH_CODES)
        )
    ).group_by(
        TADAImport.branch_code
    ).order_by(
        func.count(TADAImport.id).desc()
    ).all()
    
    if allowed_branches:
        # Return the uploader-branch with most records
        return allowed_branches[0].branch_code
    
    # No allowed branch found, default to HO
    return 'HO'

def _batch_engineer_correct_branches(db: Session, engineer_uids) -> Dict[str, str]:
    """
    Batched equivalent of calling get_engineer_correct_branch once per engineer.

    Runs ONE grouped query per 1000 uids (MSSQL 2100-parameter cap) instead of
    one query per engineer, then picks each engineer's most-frequent allowed
    branch (rows are ordered by count desc, so the first branch seen per uid
    wins — same rule as the per-engineer query). Any uid that is not resolved
    from the batched result falls back to the original per-engineer helper, so
    the returned value is identical for every uid (including the 'HO' default).
    """
    uids = [u for u in dict.fromkeys(engineer_uids) if u is not None]
    best: Dict[str, str] = {}
    for i in range(0, len(uids), 1000):
        chunk = uids[i:i + 1000]
        rows = db.query(
            TADAImport.service_engineer_uid,
            TADAImport.branch_code,
            func.count(TADAImport.id).label('record_count')
        ).filter(
            and_(
                TADAImport.service_engineer_uid.in_(chunk),
                TADAImport.branch_code.in_(ALLOWED_BRANCH_CODES)
            )
        ).group_by(
            TADAImport.service_engineer_uid,
            TADAImport.branch_code
        ).order_by(
            func.count(TADAImport.id).desc()
        ).all()
        for row in rows:
            if row.service_engineer_uid not in best:
                best[row.service_engineer_uid] = row.branch_code

    resolved: Dict[str, str] = {}
    for uid in uids:
        if uid in best:
            resolved[uid] = best[uid]
        else:
            # Not resolvable from the batch (no allowed-branch records, or the
            # grouped representative differs from this exact string) — use the
            # original per-engineer query so behaviour is identical.
            resolved[uid] = get_engineer_correct_branch(db, uid)
    return resolved

def get_branches_with_engineers(db: Session, _uid_branch_map: Optional[Dict[str, str]] = None) -> List[Dict[str, Any]]:
    """Get ONLY the 15 allowed branches with their engineer counts"""

    # First, build a mapping of engineer -> their correct branch
    engineer_branch_map = {}

    # Get all unique engineers
    all_engineers = db.query(
        distinct(TADAImport.service_engineer_uid)
    ).filter(
        and_(
            TADAImport.service_engineer_uid.isnot(None),
            TADAImport.service_engineer_uid != '',
            TADAImport.service_engineer_uid != 'null',
            TADAImport.service_engineer_name.isnot(None),
            TADAImport.service_engineer_name != '',
            TADAImport.service_engineer_name != 'null'
        )
    ).all()

    engineer_uids = [engineer[0] for engineer in all_engineers]
    if _uid_branch_map is not None:
        engineer_branch_map = {
            uid: (_uid_branch_map[uid] if uid in _uid_branch_map
                  else get_engineer_correct_branch(db, uid))
            for uid in engineer_uids
        }
    else:
        engineer_branch_map = _batch_engineer_correct_branches(db, engineer_uids)

    # Count engineers per branch
    branch_engineer_counts = defaultdict(int)
    for engineer_uid, branch_code in engineer_branch_map.items():
        branch_engineer_counts[branch_code] += 1
    
    # Build response for all 15 branches
    branch_list = []
    for branch_code in ALLOWED_BRANCH_CODES:
        branch_list.append({
            'branch_code': branch_code,
            'branch_name': BRANCH_MAP[branch_code],
            'engineer_count': branch_engineer_counts.get(branch_code, 0)
        })
    
    # Sort by branch name
    branch_list.sort(key=lambda x: x['branch_name'])
    
    return branch_list

def get_engineers_by_branch(db: Session, branch_code: str,
                            _all_engineers_data: Optional[List[Any]] = None,
                            _uid_branch_map: Optional[Dict[str, str]] = None) -> List[Dict[str, Any]]:
    """Get all engineers that belong to this branch (after mapping)"""

    # First, get all engineers and map them to their correct branch
    if _all_engineers_data is not None:
        all_engineers_data = _all_engineers_data
    else:
        all_engineers_data = db.query(
            TADAImport.service_engineer_name,
            TADAImport.service_engineer_uid
        ).filter(
            and_(
                TADAImport.service_engineer_uid.isnot(None),
                TADAImport.service_engineer_uid != '',
                TADAImport.service_engineer_uid != 'null',
                TADAImport.service_engineer_name.isnot(None),
                TADAImport.service_engineer_name != '',
                TADAImport.service_engineer_name != 'null'
            )
        ).distinct().all()

    # Resolve every engineer's correct branch in one batched pass
    # (was one query per engineer row)
    if _uid_branch_map is None:
        _uid_branch_map = _batch_engineer_correct_branches(
            db, [e.service_engineer_uid for e in all_engineers_data]
        )

    # Map each engineer to their correct branch
    engineer_branch_map = {}
    for engineer in all_engineers_data:
        engineer_uid = engineer.service_engineer_uid
        engineer_name = engineer.service_engineer_name
        if engineer_uid in _uid_branch_map:
            correct_branch = _uid_branch_map[engineer_uid]
        else:
            correct_branch = get_engineer_correct_branch(db, engineer_uid)
        engineer_branch_map[engineer_uid] = {
            'name': engineer_name,
            'branch': correct_branch
        }
    
    # Filter for the requested branch
    branch_engineers = []
    for uid, info in engineer_branch_map.items():
        if info['branch'] == branch_code:
            branch_engineers.append({
                'service_engineer_name': info['name'],
                'service_engineer_uid': uid,
                'branch_code': branch_code,
                'branch_name': BRANCH_MAP[branch_code]
            })
    
    # Sort by name
    branch_engineers.sort(key=lambda x: x['service_engineer_name'])
    
    return branch_engineers

def get_engineer_records(db: Session, engineer_uid: str, requested_branch_code: str) -> List[Dict[str, Any]]:
    """Get all TADA records for an engineer, returning ONLY required columns"""
    
    # Get the engineer's correct branch (for verification)
    correct_branch = get_engineer_correct_branch(db, engineer_uid)
    
    # If requested branch doesn't match correct branch, still return records
    if requested_branch_code != correct_branch:
        print(f"Warning: Engineer {engineer_uid} belongs to {correct_branch} but requested {requested_branch_code}")
    
    # Get ALL records for this engineer (from any branch in the database).
    # Project ONLY the columns returned below — the full entity also carries
    # seven unused NVARCHAR(MAX) columns (remarks/summaries) that dominate the
    # row width, and this endpoint is called once per engineer by the HO page.
    _RECORD_COLS = [
        TADAImport.id, TADAImport.appointment_number,
        TADAImport.installation_site_address, TADAImport.account,
        TADAImport.service_request_no, TADAImport.sr_type, TADAImport.sr_sub_type,
        TADAImport.sr_due_date, TADAImport.task_start_date, TADAImport.task_end_date,
        TADAImport.task_status, TADAImport.task_assigned_datetime,
        TADAImport.task_assign_vs_trip_start, TADAImport.sr_trip_start_datetime,
        TADAImport.sr_reach_at_site_datetime, TADAImport.sr_trip_start_lat_long,
        TADAImport.sr_reach_at_site_lat_long, TADAImport.kms_travelled,
        TADAImport.sr_closed_date, TADAImport.sr_status,
        TADAImport.branch_verified_km, TADAImport.km_verification_remark,
        TADAImport.two_way_km, TADAImport.ho_corrected_km,
        TADAImport.km_rate_applied, TADAImport.da_amount,
        TADAImport.freight_charges, TADAImport.total_amount,
        TADAImport.ho_remark, TADAImport.verification_status,
        TADAImport.sd_branch_code, TADAImport.branch_code,
        TADAImport.service_engineer_uid, TADAImport.service_engineer_name,
        TADAImport.voucher_no, TADAImport.uploaded_by, TADAImport.file_name,
    ]
    results = db.query(*_RECORD_COLS).filter(
        TADAImport.service_engineer_uid == engineer_uid
    ).order_by(
        TADAImport.task_start_date.desc(),
        TADAImport.id.desc()
    ).all()

    records = []
    for record in results:
        # Convert row to dict with ALL required columns
        record_dict = {
            'id': record.id,
            'appointment_number': record.appointment_number,
            'installation_site_address': record.installation_site_address,
            'account': record.account,
            'service_request_no': record.service_request_no,
            'sr_type': record.sr_type,
            'sr_sub_type': record.sr_sub_type,
            'sr_due_date': record.sr_due_date,
            'task_start_date': record.task_start_date,
            'task_end_date': record.task_end_date,
            'task_status': record.task_status,
            'task_assigned_datetime': record.task_assigned_datetime,
            'task_assign_vs_trip_start': record.task_assign_vs_trip_start,
            'sr_trip_start_datetime': record.sr_trip_start_datetime,
            'sr_reach_at_site_datetime': record.sr_reach_at_site_datetime,
            'sr_trip_start_lat_long': record.sr_trip_start_lat_long,
            'sr_reach_at_site_lat_long': record.sr_reach_at_site_lat_long,
            'kms_travelled': record.kms_travelled,
            'sr_closed_date': record.sr_closed_date,
            'sr_status': record.sr_status,
            # NEW COLUMNS
            'branch_verified_km': record.branch_verified_km,
            'km_verification_remark': record.km_verification_remark,
            'two_way_km': record.two_way_km,
            'ho_corrected_km': record.ho_corrected_km,
            'km_rate_applied': record.km_rate_applied,
            'da_amount': record.da_amount,
            'freight_charges': record.freight_charges,
            'total_amount': record.total_amount,
            'ho_remark': record.ho_remark,
            'verification_status': record.verification_status,
            'sd_branch_code': record.sd_branch_code,
            'branch_code': record.branch_code,
            'service_engineer_uid': record.service_engineer_uid,
            'service_engineer_name': record.service_engineer_name,
            'voucher_no': record.voucher_no,
            'uploaded_by': record.uploaded_by,
            'file_name': record.file_name,
        }
        records.append(record_dict)
    
    return records

def get_branch_summary(db: Session) -> Dict[str, Any]:
    """Get complete summary of all branches with engineers and their records"""

    # Hoisted out of the per-branch loop: fetch the engineer list ONCE and
    # resolve every engineer's correct branch ONCE (both were previously
    # re-executed inside get_branches_with_engineers / get_engineers_by_branch
    # for each of the 15 branches).
    all_engineers_data = db.query(
        TADAImport.service_engineer_name,
        TADAImport.service_engineer_uid
    ).filter(
        and_(
            TADAImport.service_engineer_uid.isnot(None),
            TADAImport.service_engineer_uid != '',
            TADAImport.service_engineer_uid != 'null',
            TADAImport.service_engineer_name.isnot(None),
            TADAImport.service_engineer_name != '',
            TADAImport.service_engineer_name != 'null'
        )
    ).distinct().all()

    uid_branch_map = _batch_engineer_correct_branches(
        db, [e.service_engineer_uid for e in all_engineers_data]
    )

    # Batched record counts (was one COUNT query per engineer), chunked at
    # 1000 uids per IN clause. Uids not found by exact key fall back to the
    # original per-engineer COUNT query below.
    record_counts: Dict[str, int] = {}
    count_uids = list(uid_branch_map.keys())
    for i in range(0, len(count_uids), 1000):
        chunk = count_uids[i:i + 1000]
        rows = db.query(
            TADAImport.service_engineer_uid,
            func.count(TADAImport.id)
        ).filter(
            TADAImport.service_engineer_uid.in_(chunk)
        ).group_by(
            TADAImport.service_engineer_uid
        ).all()
        for uid, cnt in rows:
            record_counts[uid] = cnt

    # Get all branches with engineers
    branches = get_branches_with_engineers(db, _uid_branch_map=uid_branch_map)

    # For each branch, get all engineers with their record counts
    for branch in branches:
        branch_code = branch['branch_code']
        engineers_in_branch = get_engineers_by_branch(
            db, branch_code,
            _all_engineers_data=all_engineers_data,
            _uid_branch_map=uid_branch_map,
        )

        # Add record counts for each engineer
        for engineer in engineers_in_branch:
            engineer_uid = engineer['service_engineer_uid']
            # Count all records for this engineer (from all branches)
            if engineer_uid in record_counts:
                record_count = record_counts[engineer_uid] or 0
            else:
                record_count = db.query(func.count(TADAImport.id)).filter(
                    TADAImport.service_engineer_uid == engineer_uid
                ).scalar() or 0
            engineer['record_count'] = record_count

        branch['engineers'] = engineers_in_branch
        branch['engineer_count'] = len(engineers_in_branch)
    
    return {
        'branches': branches,
        'total_branches': len(branches),
        'total_engineers': sum(branch['engineer_count'] for branch in branches)
    }

def get_unmapped_branches_data(db: Session) -> Dict[str, Any]:
    """Get data about uploader-branches not in the allowed list"""
    
    # Find all unique uploader branch_codes not in allowed list
    unmapped_branches = db.query(
        TADAImport.branch_code,
        func.count(distinct(TADAImport.service_engineer_uid)).label('engineer_count'),
        func.count(TADAImport.id).label('record_count')
    ).filter(
        and_(
            TADAImport.branch_code.isnot(None),
            TADAImport.branch_code != '',
            TADAImport.branch_code != 'null',
            TADAImport.branch_code.notin_(ALLOWED_BRANCH_CODES)
        )
    ).group_by(
        TADAImport.branch_code
    ).all()
    
    # For each unmapped branch, show which engineers and where they'll be mapped
    mapping_info = []
    for branch in unmapped_branches:
        engineers = db.query(
            TADAImport.service_engineer_uid,
            TADAImport.service_engineer_name
        ).filter(
            and_(
                TADAImport.branch_code == branch.branch_code,
                TADAImport.service_engineer_uid.isnot(None)
            )
        ).distinct().all()
        
        # Batched branch resolution (was one query per engineer)
        uid_branch = _batch_engineer_correct_branches(
            db, [eng.service_engineer_uid for eng in engineers]
        )

        engineer_mappings = []
        for eng in engineers:
            if eng.service_engineer_uid in uid_branch:
                correct_branch = uid_branch[eng.service_engineer_uid]
            else:
                correct_branch = get_engineer_correct_branch(db, eng.service_engineer_uid)
            engineer_mappings.append({
                'engineer_uid': eng.service_engineer_uid,
                'engineer_name': eng.service_engineer_name,
                'mapped_to_branch': correct_branch,
                'mapped_to_branch_name': BRANCH_MAP.get(correct_branch, correct_branch)
            })
        
        mapping_info.append({
            'original_branch_code': branch.branch_code,
            'engineer_count': branch.engineer_count,
            'record_count': branch.record_count,
            'engineers_mapping': engineer_mappings
        })
    
    return {
        'unmapped_branches': mapping_info,
        'total_unmapped_branches': len(unmapped_branches)
    }

def move_selected_records_to_history(db: Session, engineer_uid: str, record_ids: List[int], submitted_by_name: str = None, submitted_by_uid: str = None) -> Dict[str, Any]:
    """
    Move selected verified records to history table
    """
    from app.models.TADA_history_model import TADAHistory
    
    try:
        # Get the selected verified records for this engineer
        selected_records = db.query(TADAImport).filter(
            TADAImport.id.in_(record_ids),
            TADAImport.service_engineer_uid == engineer_uid,
            TADAImport.verification_status == 'Verified'
        ).all()
        
        if not selected_records:
            return {
                "success": False,
                "message": "No verified records found for the selected IDs",
                "moved_count": 0
            }
        
        moved_count = 0
        moved_records = []
        
        for record in selected_records:
            # Create history record with all fields
            history_record = TADAHistory(
                original_id=record.id,
                appointment_number=record.appointment_number,
                sd_branch_name=record.sd_branch_name,
                sd_branch_code=record.sd_branch_code,
                installation_site_address=record.installation_site_address,
                instance_id=record.instance_id,
                engine_application_code=record.engine_application_code,
                engine_serial_number=record.engine_serial_number,
                account=record.account,
                account_id=record.account_id,
                service_request_no=record.service_request_no,
                sr_type=record.sr_type,
                sr_sub_type=record.sr_sub_type,
                sr_due_date=record.sr_due_date,
                task_start_date=record.task_start_date,
                task_end_date=record.task_end_date,
                task_status=record.task_status,
                task_assigned_datetime=record.task_assigned_datetime,
                task_assign_vs_trip_start=record.task_assign_vs_trip_start,
                sr_trip_start_datetime=record.sr_trip_start_datetime,
                sr_reach_at_site_datetime=record.sr_reach_at_site_datetime,
                sr_trip_start_lat_long=record.sr_trip_start_lat_long,
                sr_reach_at_site_lat_long=record.sr_reach_at_site_lat_long,
                kms_travelled=record.kms_travelled,
                sr_closed_date=record.sr_closed_date,
                sr_status=record.sr_status,
                asset_primary_contact_no=record.asset_primary_contact_no,
                voc=record.voc,
                service_engineer_name=record.service_engineer_name,
                service_engineer_uid=record.service_engineer_uid,
                customer_name=record.customer_name,
                customer_contact_number=record.customer_contact_number,
                customer_remark=record.customer_remark,
                problem_summary=record.problem_summary,
                nature_of_failure=record.nature_of_failure,
                action_taken=record.action_taken,
                engineer_remark=record.engineer_remark,
                exception_remark=record.exception_remark,
                otp_remark=record.otp_remark,
                pdf_generated=record.pdf_generated,
                branch_verified_km=record.branch_verified_km,
                km_verification_remark=record.km_verification_remark,
                two_way_km=record.two_way_km,
                ho_corrected_km=record.ho_corrected_km,
                km_rate_applied=record.km_rate_applied,
                da_amount=record.da_amount,
                freight_charges=record.freight_charges,
                total_amount=record.total_amount,
                ho_remark=record.ho_remark,
                verification_status=record.verification_status,
                branch_code=record.branch_code,
                voucher_no=record.voucher_no,
                uploaded_by=record.uploaded_by,
                file_name=record.file_name,
                moved_by=engineer_uid,
                moved_from_branch=record.branch_code,
                # Add the new fields
                submitted_by_name=submitted_by_name,
                submitted_by_uid=submitted_by_uid
            )
            db.add(history_record)
            moved_count += 1
            moved_records.append(record.id)
        
        # Delete the selected records from main table
        db.query(TADAImport).filter(
            TADAImport.id.in_(record_ids)
        ).delete(synchronize_session=False)
        
        db.commit()
        
        return {
            "success": True,
            "message": f"Successfully moved {moved_count} selected records to history",
            "moved_count": moved_count,
            "moved_record_ids": moved_records
        }
        
    except Exception as e:
        db.rollback()
        print(f"Error moving selected records: {str(e)}")
        return {
            "success": False,
            "message": f"Error moving records: {str(e)}",
            "moved_count": 0
        }