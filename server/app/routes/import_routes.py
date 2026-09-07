# import_router.py
from fastapi import APIRouter, UploadFile, File, Form, Depends, Header, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, text, inspect
from typing import List, Optional
import uuid
import time
from datetime import datetime, timezone

from app.database import SessionLocal
from app.controllers.import_controller import ImportController
from app.controllers.user_controller import can_upload_import_file
from app.time_utils import now_ist
from app.models.user_model import User
from app.models.customer_model import (
    AMCAgreement, AssetDetailed, AssetService,
    AnubandhanPlusQuote, AnubandhanQuote, BandhanPlusQuote,
    PulseQuotation, RegularBandhan, LMSData, OpenSRLoadReport, MaxTTROilChangeSRZeroLabourFlag,
    ResponseTimeMaxTTR, CDIDetailReport, EFSRReport, AMCExpiryPlanner, LMSInsia,
    AllInvoiceReport, ImportUploadLog
)

router = APIRouter(prefix="/import", tags=["import"])

# In-memory job store (replace with Redis/DB if you need persistence across restarts)
import_jobs = {}

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

FILE_TYPES = [
    "AMC Population Report",
    "Asset Detailed Report",
    "Asset Details with Last Oil Service",
    "Anubandhan Plus Quotes Report",
    "Anubandhan Quotes Report",
    "BandhanPlus Quotes Report",
    "Pulse Quotation - Service Only",
    "Regular Bandhan Customers Report",
    "LMS Data for ERP",
    "Open SR Load Report",
    "MaxTTR - Oil Change SR Zero Labour Flag",
    "Response Time & MaxTTR Details",
    "CDI Detail Report",
    "EFSR Report",
    "AMC Agreement Expiry Planner",
    "LMS Data from Insia",
    "All Invoice Detailed Report"
]

# Old file-type names still accepted from clients running a cached JS bundle.
# What an upload may be NAMED. read_upload_table() sniffs the real content and
# reads .xlsx, legacy binary .xls, the HTML tables some portals name ".xls", and
# CSV/TSV — so this is only a first-glance filter, and it has to allow every
# format that reader handles. It used to allow Excel alone, which turned away
# the CSV exports (SR Closed under FTR / FVR come out that way).
ACCEPTED_UPLOAD_EXTENSIONS = (".xlsx", ".xls", ".xlsm", ".csv", ".tsv", ".txt")

LEGACY_FILE_TYPES = {
    "Open SR Data": "MaxTTR - Oil Change SR Zero Labour Flag",
    "LMS Insia": "LMS Data from Insia",
}


def normalize_file_type(file_type: str) -> str:
    """Map a legacy file-type name onto its current one (pass-through otherwise)."""
    return LEGACY_FILE_TYPES.get(file_type, file_type)


def _require_upload_rights(db: Session, user_id: Optional[str], file_type: str) -> User:
    """Who may upload THIS file: the Master Admin always; anyone else needs the
    per-user Data Upload flag, and their per-file list (users.import_files) then
    says which files — both granted from the Profile page. Resolved from the DB,
    never from anything the client claims about itself."""
    user = (db.query(User).filter(User.user_id == (user_id or "")).first()
            if user_id else None)
    if not user or getattr(user, "is_deleted", False) or user.is_blocked:
        raise HTTPException(status_code=403,
                            detail="You do not have access to the Data Upload page")
    if not can_upload_import_file(user, file_type):
        raise HTTPException(status_code=403,
                            detail=f"You are not allowed to upload '{file_type}'")
    return user


def run_import_job(job_id: str, file_contents: bytes, filename: str, file_type: str,
                   column_mapping: dict = None, uploaded_by: str = None):
    """Background task — runs the actual import with its own DB session"""
    db = SessionLocal()
    try:
        import_jobs[job_id]["status"] = "processing"

        # Reconstruct a file-like object the controller expects
        import io
        from fastapi import UploadFile
        from starlette.datastructures import UploadFile as StarletteUploadFile

        file_like = io.BytesIO(file_contents)
        # Wrap in a simple object that matches what controller calls (.file.read())
        class FakeUploadFile:
            def __init__(self, content: bytes, name: str):
                self.filename = name
                self.file = io.BytesIO(content)

        fake_file = FakeUploadFile(file_contents, filename)

        controller = ImportController(db)
        result = controller.process_file(fake_file, file_type, column_mapping=column_mapping)

        import_jobs[job_id].update({
            "status": "done",
            "imported_count": result["imported"],
            "updated_count": result["updated"],
            "total_processed": result["total_processed"],
            "message": (
                f"Successfully processed {result['total_processed']} records from {file_type} "
                f"(New: {result['imported']}, Updated: {result['updated']})"
            ),
            "finished_at": now_ist().isoformat(),
        })
        # WHO uploaded — the page's "Last data update" line names the uploader
        # from this log (the data tables themselves only carry updated_at).
        try:
            db.add(ImportUploadLog(
                file_type=file_type, file_name=(filename or "")[:255],
                uploaded_by=uploaded_by,
                imported_count=result["imported"], updated_count=result["updated"],
                total_processed=result["total_processed"],
            ))
            db.commit()
        except Exception:
            db.rollback()          # the log must never fail an import that succeeded
        # New data landed → drop cached last-updated so the next read is fresh
        _last_updated_cache.clear()

    except Exception as e:
        import_jobs[job_id].update({
            "status": "failed",
            "message": str(e),
            "finished_at": now_ist().isoformat(),
        })
    finally:
        db.close()


@router.post("/excel")
async def import_excel(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    file_type: str = Form(...),
    column_mapping: str = Form(None),
    user_id: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """
    Accepts the file and immediately returns a job_id.
    The actual import runs in the background so large files never time out.
    Poll GET /import/status/{job_id} to check progress.
    """
    file_type = normalize_file_type(file_type)
    if file_type not in FILE_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type. Must be one of: {', '.join(FILE_TYPES)}"
        )
    _require_upload_rights(db, user_id, file_type)
    if not file.filename.lower().endswith(ACCEPTED_UPLOAD_EXTENSIONS):
        raise HTTPException(
            status_code=400,
            detail=("Unsupported file. Upload the report as "
                    + ", ".join(ACCEPTED_UPLOAD_EXTENSIONS))
        )

    # Optional user-defined header mapping {"file header": "important column"}
    # from the Import page — lets a file with e.g. "Dt" upload as "SR Due Date".
    mapping = None
    if column_mapping:
        import json as _json
        try:
            parsed = _json.loads(column_mapping)
            if isinstance(parsed, dict):
                mapping = {
                    str(k): str(v) for k, v in parsed.items()
                    if isinstance(k, str) and isinstance(v, str) and k.strip() and v.strip()
                }
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail="column_mapping must be valid JSON")

    # Read the entire file into memory NOW (before the request closes)
    contents = await file.read()

    job_id = str(uuid.uuid4())
    import_jobs[job_id] = {
        "status": "queued",
        "file_type": file_type,
        "filename": file.filename,
        "created_at": now_ist().isoformat(),
        "message": "Import queued, processing will begin shortly",
        "imported_count": 0,
        "updated_count": 0,
        "total_processed": 0,
    }

    background_tasks.add_task(run_import_job, job_id, contents, file.filename, file_type,
                              mapping, user_id)

    # Return immediately — no timeout possible
    return JSONResponse(
        status_code=202,
        content={
            "job_id": job_id,
            "status": "queued",
            "message": "File accepted. Poll /import/status/{job_id} for progress.",
        },
    )


@router.get("/status/{job_id}")
def get_import_status(job_id: str):
    """Poll this endpoint to check if the background import finished"""
    job = import_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


# Maps each UI file type to the table whose updated_at we read
FILE_TYPE_MODELS = {
    "AMC Population Report": AMCAgreement,
    "Asset Detailed Report": AssetDetailed,
    "Asset Details with Last Oil Service": AssetService,
    "Anubandhan Plus Quotes Report": AnubandhanPlusQuote,
    "Anubandhan Quotes Report": AnubandhanQuote,
    "BandhanPlus Quotes Report": BandhanPlusQuote,
    "Pulse Quotation - Service Only": PulseQuotation,
    "Regular Bandhan Customers Report": RegularBandhan,
    "LMS Data for ERP": LMSData,
    "Open SR Load Report": OpenSRLoadReport,
    "MaxTTR - Oil Change SR Zero Labour Flag": MaxTTROilChangeSRZeroLabourFlag,
    "Response Time & MaxTTR Details": ResponseTimeMaxTTR,
    "CDI Detail Report": CDIDetailReport,
    "EFSR Report": EFSRReport,
    "AMC Agreement Expiry Planner": AMCExpiryPlanner,
    "LMS Data from Insia": LMSInsia,
    "All Invoice Detailed Report": AllInvoiceReport,
}

# In-memory cache so clicking through the dropdown doesn't re-hit the DB.
# Cleared after every successful import; the TTL is a backstop for outside changes.
_last_updated_cache = {}      # {file_type: {"payload": {...}, "ts": float}}
_LAST_UPDATED_TTL = 300       # seconds

# Index on updated_at makes MAX(updated_at) a fast tail read instead of a full
# table scan. Checked once per process; only the genuinely-missing ones are added.
_indexes_ensured = False
_UPDATED_AT_TABLES = [
    "amc_agreements", "asset_detailed", "oil_services",
    "anubandhan_plus_quotes", "anubandhan_quotes", "bandhan_plus_quotes",
    "pulse_quotations", "regular_bandhan", "lms_data", "open_sr_load_reports",
    "maxttr_oil_change_sr_zero_labour_flag", "response_time_maxttr",
    "cdi_detail_report", "efsr_report", "amc_expiry_planner", "lms_insia",
    "all_invoice_report",
]


def _ensure_updated_at_indexes(db: Session):
    """Add an updated_at index to each report table — ONLY where one is missing,
    and only once per process so it's never re-checked on later requests."""
    global _indexes_ensured
    if _indexes_ensured:
        return

    inspector = inspect(db.get_bind())
    for table in _UPDATED_AT_TABLES:
        try:
            existing = inspector.get_indexes(table)
        except Exception:
            existing = []

        # If any index already covers updated_at, leave it alone — don't add again
        already = any("updated_at" in (ix.get("column_names") or []) for ix in existing)
        if already:
            continue

        idx = f"ix_{table}_updated_at"
        try:
            db.execute(text(f"CREATE INDEX {idx} ON {table} (updated_at)"))
            db.commit()
        except Exception:
            db.rollback()

    _indexes_ensured = True


@router.get("/last-updated")
def get_last_updated(file_type: str, db: Session = Depends(get_db)):
    """Newest updated_at + record count for a file type. Served from cache when fresh."""
    file_type = normalize_file_type(file_type)
    model = FILE_TYPE_MODELS.get(file_type)
    if model is None:
        raise HTTPException(status_code=400, detail=f"Unknown file type: {file_type}")

    cached = _last_updated_cache.get(file_type)
    if cached and (time.time() - cached["ts"] < _LAST_UPDATED_TTL):
        return cached["payload"]

    # First uncached request of the process makes sure the indexes exist
    _ensure_updated_at_indexes(db)

    # One round trip instead of two: MAX(updated_at) and COUNT(id) in a single SELECT
    last_updated, total_records = db.query(
        func.max(model.updated_at),
        func.count(model.id),
    ).one()

    # Stored timestamps are naive IST (now_ist). Send them naive — tagging a
    # timezone would make the browser shift the wall-clock again.
    last_updated_iso = (
        last_updated.replace(tzinfo=None).isoformat()
        if last_updated else None
    )

    # WHO uploaded last — from the upload log (older data predates the log, so
    # the fields stay null there and the page simply shows no uploader).
    uploaded_by = uploaded_by_name = None
    try:
        last_log = (db.query(ImportUploadLog)
                    .filter(ImportUploadLog.file_type == file_type)
                    .order_by(ImportUploadLog.id.desc()).first())
        if last_log and last_log.uploaded_by:
            uploaded_by = last_log.uploaded_by
            uploader = (db.query(User)
                        .filter(User.user_id == last_log.uploaded_by).first())
            uploaded_by_name = uploader.name if uploader else last_log.uploaded_by
    except Exception:
        pass                      # the uploader line is optional, never a 500

    payload = {
        "file_type": file_type,
        "last_updated": last_updated_iso,
        "total_records": total_records or 0,
        "uploaded_by": uploaded_by,
        "uploaded_by_name": uploaded_by_name,
    }
    _last_updated_cache[file_type] = {"payload": payload, "ts": time.time()}
    return payload


@router.post("/multiple")
async def import_multiple(
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(...),
    user_id: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Queue multiple files at once, returns a list of job IDs"""
    job_ids = []

    for file in files:
        file_type = next(
            (ft for ft in FILE_TYPES if ft.lower() in file.filename.lower()), None
        )
        if not file_type:
            job_ids.append({
                "filename": file.filename,
                "status": "skipped",
                "message": "Could not determine file type from filename",
            })
            continue

        # Same per-user, per-file right as the single upload; a blocked file is
        # skipped with a message instead of failing the whole batch.
        try:
            _require_upload_rights(db, user_id, file_type)
        except HTTPException as e:
            job_ids.append({
                "filename": file.filename,
                "status": "skipped",
                "message": e.detail,
            })
            continue

        contents = await file.read()
        job_id = str(uuid.uuid4())
        import_jobs[job_id] = {
            "status": "queued",
            "file_type": file_type,
            "filename": file.filename,
            "created_at": now_ist().isoformat(),
            "message": "Import queued",
            "imported_count": 0,
            "updated_count": 0,
            "total_processed": 0,
        }
        background_tasks.add_task(run_import_job, job_id, contents, file.filename, file_type,
                                  None, user_id)
        job_ids.append({"filename": file.filename, "job_id": job_id, "status": "queued"})

    return {"jobs": job_ids}


@router.get("/file-types")
def get_file_types():
    return {"file_types": FILE_TYPES}