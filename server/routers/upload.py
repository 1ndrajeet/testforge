# backend/routers/upload.py - ULTRA-FAST VERSION

import json
import logging
import os
from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

from auth import get_exam_center_id
from config import db, settings
from utils import (
    ALLOWED_FILE_TYPES,
    calculate_file_hash,
    generate_stored_filename,
    sanitize_emarksheet_excel,
    sanitize_inventory_excel,
    sanitize_seating_chart_excel,
    success_response,
    validate_excel_file,
    validate_html_file,
)

router = APIRouter(prefix="/upload", tags=["upload"])
logger = logging.getLogger(__name__)


# ============================================================================
# UPLOAD ENDPOINT - ULTRA-FAST
# ============================================================================


@router.post("/")
async def upload_file(
    file: UploadFile = File(...),
    file_type: str = Form(...),
    connected_institute_id: str = Form(None),
    exam_center_id: str = Depends(get_exam_center_id),
):
    """Unified file upload endpoint - optimized for NeonDB free tier"""
    
    # ============================================================
    # 1. VALIDATE FILE TYPE & EXTENSION
    # ============================================================
    if file_type not in ALLOWED_FILE_TYPES:
        raise HTTPException(400, f"Invalid file_type. Allowed: {', '.join(ALLOWED_FILE_TYPES)}")

    ext = os.path.splitext(file.filename)[1].lower()
    if file_type == "timetable":
        if ext not in [".html", ".htm"]:
            raise HTTPException(400, "Timetable only accepts HTML files (.html, .htm)")
    else:
        if ext not in [".xlsx", ".xls"]:
            raise HTTPException(400, f"{file_type} only accepts Excel files (.xlsx, .xls)")

    # ============================================================
    # 2. READ FILE
    # ============================================================
    content = await file.read()

    if len(content) > settings.MAX_UPLOAD_SIZE:
        raise HTTPException(
            400, f"File too large. Max size: {settings.MAX_UPLOAD_SIZE // 1024 // 1024}MB"
        )

    # ============================================================
    # 3. SANITIZE FILE (in-place)
    # ============================================================
    if file_type == "inventory":
        content = sanitize_inventory_excel(content)
        logger.debug("Inventory file sanitized")
    elif file_type == "seatingchart":
        content = sanitize_seating_chart_excel(content)
        logger.debug("Seating chart file sanitized")
    elif file_type == "emarksheet":
        content = sanitize_emarksheet_excel(content)
        logger.debug("E-Marksheet file sanitized")

    # ============================================================
    # 4. VALIDATE FILE CONTENT
    # ============================================================
    if file_type == "timetable":
        is_valid, processed_content, error = validate_html_file(content, file_type)
        if not is_valid:
            raise HTTPException(400, detail=error)
    else:
        is_valid, processed_content, error = validate_excel_file(content, file_type)
        if not is_valid:
            raise HTTPException(400, detail=error)

    # ============================================================
    # 5. OPTIMIZED: Single query to get institute info (if needed)
    # ============================================================
    institute_info = None
    if file_type == "seatingchart" and connected_institute_id:
        try:
            UUID(connected_institute_id)
            institute_info = db.execute_query(
                """
                SELECT id, institute_code, institute_name
                FROM connected_institutes
                WHERE id = :institute_id AND exam_center_id = :exam_center_id AND is_active = true
                """,
                {"institute_id": connected_institute_id, "exam_center_id": exam_center_id},
            )
            if not institute_info:
                raise HTTPException(404, "Connected institute not found or inactive")
        except ValueError:
            raise HTTPException(400, "Invalid connected_institute_id format")

    # ============================================================
    # 6. GENERATE STORED FILENAME
    # ============================================================
    stored_filename = generate_stored_filename(exam_center_id, file_type, file.filename)

    # Add institute code to filename for seating chart
    if file_type == "seatingchart" and institute_info:
        institute_code = institute_info[0]["institute_code"]
        base_name = stored_filename.rsplit(".", 1)[0] if "." in stored_filename else stored_filename
        ext_part = stored_filename.rsplit(".", 1)[1] if "." in stored_filename else "xlsx"
        file_parts = base_name.split("_")
        if len(file_parts) >= 2:
            stored_filename = f"{file_parts[0]}_{file_parts[1]}_{institute_code}_{'_'.join(file_parts[2:])}.{ext_part}"

    # ============================================================
    # 7. SAVE FILE
    # ============================================================
    file_path = os.path.join(settings.UPLOAD_DIR, stored_filename)
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)

    with open(file_path, "wb") as f:
        f.write(processed_content if file_type == "timetable" else content)

    file_hash = calculate_file_hash(content)
    
    metadata_json = json.dumps({
        "uploaded_at": datetime.now().isoformat(),
        "original_ext": ext,
        "connected_institute_id": connected_institute_id,
        "sanitized": file_type == "seatingchart",
    })

    # ============================================================
    # 8. OPTIMIZED: Single UPSERT query (no separate EXISTS check)
    # ============================================================
    
    # ✅ Use PostgreSQL ON CONFLICT for atomic UPSERT
    if connected_institute_id:
        db.execute_update(
            """
            INSERT INTO uploads (
                exam_center_id, file_type, original_filename, stored_filename,
                file_hash, file_size, status, connected_institute_id, metadata
            ) VALUES (
                :exam_center_id, :file_type, :original_filename, :stored_filename,
                :file_hash, :file_size, 'UPLOADED', :connected_institute_id, CAST(:metadata AS jsonb)
            )
            ON CONFLICT (exam_center_id, file_type, connected_institute_id) 
            WHERE connected_institute_id IS NOT NULL
            DO UPDATE SET
                original_filename = EXCLUDED.original_filename,
                stored_filename = EXCLUDED.stored_filename,
                file_hash = EXCLUDED.file_hash,
                file_size = EXCLUDED.file_size,
                status = 'UPLOADED',
                metadata = EXCLUDED.metadata,
                error_message = NULL,
                updated_at = NOW()
            """,
            {
                "exam_center_id": exam_center_id,
                "file_type": file_type,
                "original_filename": file.filename,
                "stored_filename": stored_filename,
                "file_hash": file_hash,
                "file_size": len(content),
                "connected_institute_id": connected_institute_id,
                "metadata": metadata_json,
            },
        )
    else:
        db.execute_update(
            """
            INSERT INTO uploads (
                exam_center_id, file_type, original_filename, stored_filename,
                file_hash, file_size, status, connected_institute_id, metadata
            ) VALUES (
                :exam_center_id, :file_type, :original_filename, :stored_filename,
                :file_hash, :file_size, 'UPLOADED', NULL, CAST(:metadata AS jsonb)
            )
            ON CONFLICT (exam_center_id, file_type) 
            WHERE connected_institute_id IS NULL
            DO UPDATE SET
                original_filename = EXCLUDED.original_filename,
                stored_filename = EXCLUDED.stored_filename,
                file_hash = EXCLUDED.file_hash,
                file_size = EXCLUDED.file_size,
                status = 'UPLOADED',
                metadata = EXCLUDED.metadata,
                error_message = NULL,
                updated_at = NOW()
            """,
            {
                "exam_center_id": exam_center_id,
                "file_type": file_type,
                "original_filename": file.filename,
                "stored_filename": stored_filename,
                "file_hash": file_hash,
                "file_size": len(content),
                "metadata": metadata_json,
            },
        )

    logger.info(f"File uploaded: {file_type} | {file.filename} -> {stored_filename}")

    return success_response(
        data={
            "stored_filename": stored_filename,
            "original_filename": file.filename,
            "file_type": file_type,
            "file_size": len(content),
            "file_hash": file_hash,
            "uploaded_at": datetime.now().isoformat(),
            "connected_institute_id": connected_institute_id,
            "sanitized": file_type == "seatingchart",
        },
        message=f"File uploaded successfully",
    )


# ============================================================================
# DOWNLOAD ENDPOINT - OPTIMIZED
# ============================================================================


@router.get("/download")
async def download_file(
    file_name: str,
    file_type: str,
    connected_institute_id: Optional[str] = None,
    exam_center_id: str = Depends(get_exam_center_id),
):
    """Download an uploaded file - optimized"""
    
    if file_type not in ALLOWED_FILE_TYPES:
        raise HTTPException(400, f"Invalid file_type. Allowed: {', '.join(ALLOWED_FILE_TYPES)}")

    # ✅ Single query with optional institute filter
    if connected_institute_id:
        result = db.execute_query(
            """
            SELECT original_filename, stored_filename, file_type
            FROM uploads
            WHERE exam_center_id = :exam_center_id 
                AND file_type = :file_type 
                AND stored_filename = :file_name
                AND connected_institute_id = :institute_id
            """,
            {
                "exam_center_id": exam_center_id,
                "file_type": file_type,
                "file_name": file_name,
                "institute_id": connected_institute_id,
            },
        )
    else:
        result = db.execute_query(
            """
            SELECT original_filename, stored_filename, file_type
            FROM uploads
            WHERE exam_center_id = :exam_center_id 
                AND file_type = :file_type 
                AND stored_filename = :file_name
                AND connected_institute_id IS NULL
            """,
            {"exam_center_id": exam_center_id, "file_type": file_type, "file_name": file_name},
        )

    if not result:
        raise HTTPException(404, "File not found or access denied")

    record = result[0]
    file_path = os.path.join(settings.UPLOAD_DIR, file_name)

    if not os.path.exists(file_path):
        raise HTTPException(404, "File not found on server")

    # Determine media type
    ext = os.path.splitext(file_name)[1].lower()
    media_type = (
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        if ext == ".xlsx"
        else "application/vnd.ms-excel"
        if ext == ".xls"
        else "text/html"
        if ext in [".html", ".htm"]
        else "application/octet-stream"
    )

    return FileResponse(
        path=file_path,
        filename=record["original_filename"],
        media_type=media_type,
        headers={"Content-Disposition": f"attachment; filename={record['original_filename']}"},
    )


# ============================================================================
# GET UPLOAD STATUS - OPTIMIZED
# ============================================================================


@router.get("/status")
async def get_upload_status(
    file_type: str,
    connected_institute_id: Optional[str] = None,
    exam_center_id: str = Depends(get_exam_center_id),
):
    """Get upload status for a file type - optimized with EXISTS"""
    
    if file_type not in ALLOWED_FILE_TYPES:
        raise HTTPException(400, f"Invalid file_type. Allowed: {', '.join(ALLOWED_FILE_TYPES)}")

    # ✅ Use EXISTS for faster status check
    if connected_institute_id:
        result = db.execute_query(
            """
            SELECT 
                EXISTS(SELECT 1 FROM uploads WHERE exam_center_id = :exam_center_id AND file_type = :file_type AND connected_institute_id = :institute_id) as exists,
                stored_filename,
                status,
                original_filename,
                record_count,
                processed_at,
                created_at
            FROM uploads
            WHERE exam_center_id = :exam_center_id 
                AND file_type = :file_type 
                AND connected_institute_id = :institute_id
            ORDER BY created_at DESC
            LIMIT 1
            """,
            {
                "exam_center_id": exam_center_id,
                "file_type": file_type,
                "institute_id": connected_institute_id,
            },
        )
    else:
        result = db.execute_query(
            """
            SELECT 
                EXISTS(SELECT 1 FROM uploads WHERE exam_center_id = :exam_center_id AND file_type = :file_type AND connected_institute_id IS NULL) as exists,
                stored_filename,
                status,
                original_filename,
                record_count,
                processed_at,
                created_at
            FROM uploads
            WHERE exam_center_id = :exam_center_id 
                AND file_type = :file_type 
                AND connected_institute_id IS NULL
            ORDER BY created_at DESC
            LIMIT 1
            """,
            {"exam_center_id": exam_center_id, "file_type": file_type},
        )

    if not result:
        return success_response(data={"exists": False})

    row = result[0]
    return success_response(
        data={
            "exists": row["exists"],
            "stored_filename": row["stored_filename"],
            "status": row["status"],
            "original_filename": row["original_filename"],
            "record_count": row["record_count"],
            "processed_at": row["processed_at"],
            "created_at": row["created_at"],
        }
    )