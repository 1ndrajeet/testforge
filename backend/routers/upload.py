# backend/routers/upload.py - COMPLETE CLEAN VERSION

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
# UPLOAD ENDPOINT
# ============================================================================


@router.post("/")
async def upload_file(
    file: UploadFile = File(...),
    file_type: str = Form(...),
    connected_institute_id: str = Form(None),
    exam_center_id: str = Depends(get_exam_center_id),
):
    """Unified file upload endpoint with automatic sanitization"""

    if file_type not in ALLOWED_FILE_TYPES:
        raise HTTPException(400, f"Invalid file_type. Allowed: {', '.join(ALLOWED_FILE_TYPES)}")

    ext = os.path.splitext(file.filename)[1].lower()
    if file_type == "timetable":
        if ext not in [".html", ".htm"]:
            raise HTTPException(400, "Timetable only accepts HTML files (.html, .htm)")
    else:
        if ext not in [".xlsx", ".xls"]:
            raise HTTPException(400, f"{file_type} only accepts Excel files (.xlsx, .xls)")

    content = await file.read()

    if len(content) > settings.MAX_UPLOAD_SIZE:
        raise HTTPException(
            400, f"File too large. Max size: {settings.MAX_UPLOAD_SIZE // 1024 // 1024}MB"
        )

    # SANITIZE files before validation
    if file_type == "inventory":
        content = sanitize_inventory_excel(content)
        logger.info("Inventory file sanitized")

    if file_type == "seatingchart":
        content = sanitize_seating_chart_excel(content)
        logger.info("Seating chart file sanitized")

    if file_type == "emarksheet":
        content = sanitize_emarksheet_excel(content)
        logger.info("E-Marksheet file sanitized")

    # Validate connected_institute_id for seating chart
    if file_type == "seatingchart" and connected_institute_id:
        try:
            UUID(connected_institute_id)

            institute = db.execute_query(
                """
                SELECT id, institute_code, institute_name
                FROM connected_institutes
                WHERE id = :institute_id AND exam_center_id = :exam_center_id AND is_active = true
            """,
                {"institute_id": connected_institute_id, "exam_center_id": exam_center_id},
            )

            if not institute:
                raise HTTPException(404, "Connected institute not found or inactive")

            logger.info(
                f"Uploading seating chart for institute: {institute[0]['institute_code']} - {institute[0]['institute_name']}"
            )
        except ValueError:
            raise HTTPException(400, "Invalid connected_institute_id format")

    # Validate file content
    if file_type == "timetable":
        is_valid, processed_content, error = validate_html_file(content, file_type)
    else:
        is_valid, processed_content, error = validate_excel_file(content, file_type)

    if not is_valid:
        raise HTTPException(400, detail=error)

    # Generate stored filename
    stored_filename = generate_stored_filename(exam_center_id, file_type, file.filename)

    # Add institute code to filename for seating chart
    if file_type == "seatingchart" and connected_institute_id:
        institute = db.execute_query(
            """
            SELECT institute_code FROM connected_institutes
            WHERE id = :institute_id
        """,
            {"institute_id": connected_institute_id},
        )

        if institute:
            institute_code = institute[0]["institute_code"]
            base_name = (
                stored_filename.rsplit(".", 1)[0] if "." in stored_filename else stored_filename
            )
            ext_part = stored_filename.rsplit(".", 1)[1] if "." in stored_filename else "xlsx"
            file_parts = base_name.split("_")
            if len(file_parts) >= 2:
                stored_filename = f"{file_parts[0]}_{file_parts[1]}_{institute_code}_{'_'.join(file_parts[2:])}.{ext_part}"

    file_path = os.path.join(settings.UPLOAD_DIR, stored_filename)
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)

    # Save file
    with open(file_path, "wb") as f:
        if file_type == "timetable":
            f.write(processed_content)
        else:
            f.write(content)

    file_hash = calculate_file_hash(content)

    metadata_json = json.dumps(
        {
            "uploaded_at": datetime.now().isoformat(),
            "original_ext": ext,
            "connected_institute_id": connected_institute_id,
            "sanitized": file_type == "seatingchart",
        }
    )

    # Upsert logic with EXISTS check
    if connected_institute_id:
        # Check if record exists for this institute
        existing = db.execute_query(
            """
            SELECT id FROM uploads
            WHERE exam_center_id = :exam_center_id 
                AND file_type = :file_type 
                AND connected_institute_id = :connected_institute_id
        """,
            {
                "exam_center_id": exam_center_id,
                "file_type": file_type,
                "connected_institute_id": connected_institute_id,
            },
        )

        if existing:
            db.execute_update(
                """
                UPDATE uploads SET
                    original_filename = :original_filename,
                    stored_filename = :stored_filename,
                    file_hash = :file_hash,
                    file_size = :file_size,
                    status = 'UPLOADED',
                    metadata = CAST(:metadata AS jsonb),
                    error_message = NULL,
                    updated_at = NOW()
                WHERE exam_center_id = :exam_center_id 
                    AND file_type = :file_type 
                    AND connected_institute_id = :connected_institute_id
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
                    :file_hash, :file_size, 'UPLOADED', :connected_institute_id, CAST(:metadata AS jsonb)
                )
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
        # For files without institute (timetable, emarksheet, etc.)
        existing = db.execute_query(
            """
            SELECT id FROM uploads
            WHERE exam_center_id = :exam_center_id 
                AND file_type = :file_type 
                AND connected_institute_id IS NULL
        """,
            {"exam_center_id": exam_center_id, "file_type": file_type},
        )

        if existing:
            db.execute_update(
                """
                UPDATE uploads SET
                    original_filename = :original_filename,
                    stored_filename = :stored_filename,
                    file_hash = :file_hash,
                    file_size = :file_size,
                    status = 'UPLOADED',
                    metadata = CAST(:metadata AS jsonb),
                    error_message = NULL,
                    updated_at = NOW()
                WHERE exam_center_id = :exam_center_id 
                    AND file_type = :file_type 
                    AND connected_institute_id IS NULL
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
        message=f"File uploaded successfully. Stored as: {stored_filename}",
    )


# ============================================================================
# DOWNLOAD & DELETE
# ============================================================================


@router.get("/download")
async def download_file(
    file_name: str,
    file_type: str,
    connected_institute_id: Optional[str] = None,
    exam_center_id: str = Depends(get_exam_center_id),
):
    """Download an uploaded file"""
    if file_type not in ALLOWED_FILE_TYPES:
        raise HTTPException(400, f"Invalid file_type. Allowed: {', '.join(ALLOWED_FILE_TYPES)}")

    query = """
        SELECT original_filename, stored_filename, file_type
        FROM uploads
        WHERE exam_center_id = :exam_center_id 
            AND file_type = :file_type 
            AND stored_filename = :file_name
    """
    params = {"exam_center_id": exam_center_id, "file_type": file_type, "file_name": file_name}

    if connected_institute_id:
        query += " AND connected_institute_id = :institute_id"
        params["institute_id"] = connected_institute_id

    result = db.execute_query(query, params)

    if not result:
        raise HTTPException(404, "File not found or access denied")

    record = result[0]
    file_path = os.path.join(settings.UPLOAD_DIR, file_name)

    if not os.path.exists(file_path):
        raise HTTPException(404, "File not found on server")

    ext = os.path.splitext(file_name)[1].lower()
    media_type = (
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        if ext in [".xlsx"]
        else (
            "application/vnd.ms-excel"
            if ext in [".xls"]
            else "text/html" if ext in [".html", ".htm"] else "application/octet-stream"
        )
    )

    return FileResponse(
        path=file_path,
        filename=record["original_filename"],
        media_type=media_type,
        headers={"Content-Disposition": f"attachment; filename={record['original_filename']}"},
    )
