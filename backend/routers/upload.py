# backend/routers/upload.py
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Depends
import os
import logging
from datetime import datetime
import json

from config import settings, db
from auth import get_exam_center_id
from utils import (
    ALLOWED_FILE_TYPES, validate_excel_file, validate_html_file,
    calculate_file_hash, generate_stored_filename,
    success_response, error_response
)

router = APIRouter(prefix="/upload", tags=["upload"])
logger = logging.getLogger(__name__)

@router.post("/")
async def upload_file(
    file: UploadFile = File(...),
    file_type: str = Form(...),
    exam_center_id: str = Depends(get_exam_center_id)
):
    """Unified file upload endpoint"""
    
    if file_type not in ALLOWED_FILE_TYPES:
        raise HTTPException(400, f"Invalid file_type. Allowed: {', '.join(ALLOWED_FILE_TYPES)}")
    
    ext = os.path.splitext(file.filename)[1].lower()
    if file_type == "timetable":
        if ext not in ['.html', '.htm']:
            raise HTTPException(400, "Timetable only accepts HTML files (.html, .htm)")
    else:
        if ext not in ['.xlsx', '.xls']:
            raise HTTPException(400, f"{file_type} only accepts Excel files (.xlsx, .xls)")
    
    content = await file.read()
    
    if len(content) > settings.MAX_UPLOAD_SIZE:
        raise HTTPException(400, f"File too large. Max size: {settings.MAX_UPLOAD_SIZE // 1024 // 1024}MB")
    
    if file_type == "timetable":
        is_valid, processed_content, error = validate_html_file(content, file_type)
    else:
        is_valid, processed_content, error = validate_excel_file(content, file_type)
    
    if not is_valid:
        raise HTTPException(400, detail=error)
    
    stored_filename = generate_stored_filename(exam_center_id, file_type, file.filename)
    file_path = os.path.join(settings.UPLOAD_DIR, stored_filename)
    
    with open(file_path, 'wb') as f:
        if file_type == "timetable":
            f.write(processed_content)
        else:
            f.write(content)
    
    file_hash = calculate_file_hash(content)
    
    metadata_json = json.dumps({
        "uploaded_at": datetime.now().isoformat(),
        "original_ext": ext
    })
    
    # Use dictionary parameters for clarity and type safety
    db.execute_update("""
        INSERT INTO uploads (
            exam_center_id, file_type, original_filename, stored_filename,
            file_hash, file_size, status, metadata
        ) VALUES (
            :exam_center_id, :file_type, :original_filename, :stored_filename,
            :file_hash, :file_size, 'UPLOADED', CAST(:metadata AS jsonb)
        )
        ON CONFLICT (exam_center_id, file_type) DO UPDATE SET
            original_filename = EXCLUDED.original_filename,
            stored_filename = EXCLUDED.stored_filename,
            file_hash = EXCLUDED.file_hash,
            file_size = EXCLUDED.file_size,
            status = 'UPLOADED',
            metadata = EXCLUDED.metadata,
            error_message = NULL,
            updated_at = NOW()
    """, {
        "exam_center_id": exam_center_id,
        "file_type": file_type,
        "original_filename": file.filename,
        "stored_filename": stored_filename,
        "file_hash": file_hash,
        "file_size": len(content),
        "metadata": metadata_json
    })
    
    logger.info(f"File uploaded: {file_type} | {file.filename} -> {stored_filename}")
    
    return success_response(
        data={
            "stored_filename": stored_filename,
            "original_filename": file.filename,
            "file_type": file_type,
            "file_size": len(content),
            "file_hash": file_hash,
            "uploaded_at": datetime.now().isoformat()
        },
        message=f"File uploaded successfully. Stored as: {stored_filename}"
    )


@router.get("/status")
async def get_upload_status(
    file_type: str,
    exam_center_id: str = Depends(get_exam_center_id)
):
    if file_type not in ALLOWED_FILE_TYPES:
        raise HTTPException(400, f"Invalid file_type. Allowed: {', '.join(ALLOWED_FILE_TYPES)}")
    
    result = db.execute_query("""
        SELECT original_filename, stored_filename, status, file_size, 
               error_message, metadata, created_at, updated_at
        FROM uploads
        WHERE exam_center_id = :exam_center_id AND file_type = :file_type
    """, {
        "exam_center_id": exam_center_id,
        "file_type": file_type
    })
    
    if not result:
        return success_response(
            data={"file_exists": False, "file_type": file_type},
            message="No file uploaded for this type"
        )
    
    record = result[0]
    return success_response(
        data={
            "file_exists": True,
            "original_filename": record["original_filename"],
            "stored_filename": record["stored_filename"],
            "status": record["status"],
            "file_size": record["file_size"],
            "uploaded_at": record["created_at"].isoformat() if record["created_at"] else None
        },
        message="Upload status retrieved"
    )


@router.delete("/")
async def delete_upload(
    file_type: str,
    exam_center_id: str = Depends(get_exam_center_id)
):
    if file_type not in ALLOWED_FILE_TYPES:
        raise HTTPException(400, f"Invalid file_type. Allowed: {', '.join(ALLOWED_FILE_TYPES)}")
    
    result = db.execute_query("""
        SELECT stored_filename FROM uploads
        WHERE exam_center_id = :exam_center_id AND file_type = :file_type
    """, {
        "exam_center_id": exam_center_id,
        "file_type": file_type
    })
    
    if result:
        stored_filename = result[0]["stored_filename"]
        file_path = os.path.join(settings.UPLOAD_DIR, stored_filename)
        if os.path.exists(file_path):
            os.remove(file_path)
            logger.info(f"Deleted file: {file_path}")
    
    db.execute_update("""
        DELETE FROM uploads
        WHERE exam_center_id = :exam_center_id AND file_type = :file_type
    """, {
        "exam_center_id": exam_center_id,
        "file_type": file_type
    })
    
    return success_response(message=f"Uploaded file for {file_type} deleted successfully")