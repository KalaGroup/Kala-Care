# import_router.py
from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from typing import List
import uuid
import time
from datetime import datetime

from app.database import SessionLocal
from app.controllers.import_controller import ImportController

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
    "AMC Agreement History",
    "Asset Detailed Report",
    "Asset Details with Last Oil Service",
    "Anubandhan Plus Quotes Report",
    "Anubandhan Quotes Report",
    "BandhanPlus Quotes Report",
    "Pulse Quotation - Service Only",
    "Regular Bandhan Customers Report",
    "LMS Data for ERP",
    "Open SR Load Report"
]


def run_import_job(job_id: str, file_contents: bytes, filename: str, file_type: str):
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
        result = controller.process_file(fake_file, file_type)

        import_jobs[job_id].update({
            "status": "done",
            "imported_count": result["imported"],
            "updated_count": result["updated"],
            "total_processed": result["total_processed"],
            "message": (
                f"Successfully processed {result['total_processed']} records from {file_type} "
                f"(New: {result['imported']}, Updated: {result['updated']})"
            ),
            "finished_at": datetime.utcnow().isoformat(),
        })

    except Exception as e:
        import_jobs[job_id].update({
            "status": "failed",
            "message": str(e),
            "finished_at": datetime.utcnow().isoformat(),
        })
    finally:
        db.close()


@router.post("/excel")
async def import_excel(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    file_type: str = Form(...),
):
    """
    Accepts the file and immediately returns a job_id.
    The actual import runs in the background so large files never time out.
    Poll GET /import/status/{job_id} to check progress.
    """
    if file_type not in FILE_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type. Must be one of: {', '.join(FILE_TYPES)}"
        )
    if not file.filename.endswith((".xlsx", ".xls")):
        raise HTTPException(
            status_code=400,
            detail="File must be an Excel file (.xlsx or .xls)"
        )

    # Read the entire file into memory NOW (before the request closes)
    contents = await file.read()

    job_id = str(uuid.uuid4())
    import_jobs[job_id] = {
        "status": "queued",
        "file_type": file_type,
        "filename": file.filename,
        "created_at": datetime.utcnow().isoformat(),
        "message": "Import queued, processing will begin shortly",
        "imported_count": 0,
        "updated_count": 0,
        "total_processed": 0,
    }

    background_tasks.add_task(run_import_job, job_id, contents, file.filename, file_type)

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
async def get_import_status(job_id: str):
    """Poll this endpoint to check if the background import finished"""
    job = import_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.post("/multiple")
async def import_multiple(
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(...),
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

        contents = await file.read()
        job_id = str(uuid.uuid4())
        import_jobs[job_id] = {
            "status": "queued",
            "file_type": file_type,
            "filename": file.filename,
            "created_at": datetime.utcnow().isoformat(),
            "message": "Import queued",
            "imported_count": 0,
            "updated_count": 0,
            "total_processed": 0,
        }
        background_tasks.add_task(run_import_job, job_id, contents, file.filename, file_type)
        job_ids.append({"filename": file.filename, "job_id": job_id, "status": "queued"})

    return {"jobs": job_ids}


@router.get("/file-types")
async def get_file_types():
    return {"file_types": FILE_TYPES}