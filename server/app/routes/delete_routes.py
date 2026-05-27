from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from typing import Dict, Any
from pydantic import BaseModel
from app.database import SessionLocal
from app.controllers.delete_controller import DeleteController
from datetime import datetime
import logging
import traceback

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin", tags=["Admin Data Management"])

class BackupRequest(BaseModel):
    dataType: str

class DeleteRequest(BaseModel):
    confirm: str
    dataTypes: Dict[str, bool]

@router.post("/backup-data")
async def backup_data(request: BackupRequest):
    """Create backup of selected data type - Returns ZIP file containing Excel backups"""
    db = SessionLocal()
    try:        
        # Create backup
        zip_buffer = DeleteController.backup_data(db, request.dataType)
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"backup_{request.dataType}_{timestamp}.zip"
                
        return StreamingResponse(
            zip_buffer,
            media_type="application/zip",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    except Exception as e:
        error_details = traceback.format_exc()
        logger.error(f"Backup route error: {str(e)}")
        logger.error(f"Full traceback: {error_details}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()

@router.post("/delete-selected-data")
async def delete_selected_data(request: DeleteRequest):
    """Delete selected data types using TRUNCATE"""
    db = SessionLocal()
    try:        
        result = DeleteController.delete_selected_data(
            db=db,
            confirm=request.confirm,
            data_types=request.dataTypes
        )
        
        return result
    except Exception as e:
        error_details = traceback.format_exc()
        logger.error(f"Delete route error: {str(e)}")
        logger.error(f"Full traceback: {error_details}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()