# backend/routers/upload.py - COMPLETE FIXED VERSION
from typing import Optional
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Depends
from fastapi.responses import FileResponse
import os
import logging
from datetime import datetime
import json
from uuid import UUID
import pandas as pd
import io

from config import settings, db
from auth import get_exam_center_id
from utils import (
    ALLOWED_FILE_TYPES, validate_excel_file, validate_html_file,
    calculate_file_hash, generate_stored_filename,
    success_response, error_response
)

router = APIRouter(prefix="/upload", tags=["upload"])
logger = logging.getLogger(__name__)


# ============================================================================
# SANITIZATION FUNCTION
# ============================================================================

def sanitize_seating_chart_excel(content: bytes) -> bytes:
    """Sanitize seating chart Excel file - handles both clean and messy formats"""
    try:
        df = pd.read_excel(io.BytesIO(content), header=None, dtype=str).fillna('')
        
        header_row_idx = None
        header_columns = []
        
        for idx in range(min(15, len(df))):
            row = df.iloc[idx]
            row_text = ' '.join([str(c).lower() for c in row if str(c).strip()])
            
            has_seat = 'seat' in row_text
            has_enroll = 'enroll' in row_text or 'enrollment' in row_text
            has_name = 'name' in row_text or 'candidate' in row_text
            has_scheme = 'scheme' in row_text
            has_subject = 'subject' in row_text or 'appearing' in row_text
            
            matches = sum([has_seat, has_enroll, has_name, has_scheme, has_subject])
            
            if matches >= 3:
                header_row_idx = idx
                header_columns = [str(c).strip().lower() for c in row]
                logger.info(f"Found header at row {idx}: {header_columns}")
                break
        
        if header_row_idx is None:
            logger.warning("Could not find header row, returning original file")
            return content
        
        # Map columns
        column_mapping = {}
        for idx, col_name in enumerate(header_columns):
            col_clean = col_name.strip().lower()
            
            if col_clean == 'seat' or col_clean == 'seat number' or col_clean == 'seat no':
                column_mapping['seat_number'] = idx
            elif (col_clean == 'sr' or col_clean == 'sr no') and 'seat_number' not in column_mapping:
                column_mapping['seat_number'] = idx
            
            if 'enroll' in col_clean or 'enrollment' in col_clean:
                column_mapping['enrollment_number'] = idx
            
            if 'name' in col_clean or 'candidate' in col_clean:
                column_mapping['name'] = idx
            
            if 'scheme' in col_clean:
                column_mapping['scheme'] = idx
            
            if 'subject' in col_clean or 'appearing' in col_clean:
                column_mapping['subject_appearing_for'] = idx
        
        # Fix: If we have both SR and Seat, use Seat column
        sr_idx = None
        seat_idx = None
        for idx, col in enumerate(header_columns):
            if 'sr' in col and 'no' in col:
                sr_idx = idx
            if col == 'seat' or col == 'seat no':
                seat_idx = idx
        
        if sr_idx is not None and seat_idx is not None:
            column_mapping['seat_number'] = seat_idx
            logger.info(f"Using Seat column (index {seat_idx}) instead of SR (index {sr_idx})")
        
        logger.info(f"Final column mapping: {column_mapping}")
        
        # Extract data
        clean_data = []
        start_row = header_row_idx + 1
        
        for idx in range(start_row, len(df)):
            row = df.iloc[idx]
            
            if not any(str(c).strip() for c in row):
                continue
            
            seat_idx = column_mapping.get('seat_number')
            if seat_idx is None or seat_idx >= len(row):
                continue
                
            seat_value = str(row[seat_idx]).strip()
            if not seat_value or not seat_value.isdigit():
                continue
            
            enroll_idx = column_mapping.get('enrollment_number')
            enrollment_number = ''
            if enroll_idx is not None and enroll_idx < len(row):
                enrollment_number = str(row[enroll_idx]).strip()
                if enrollment_number == 'nan':
                    enrollment_number = ''
            
            name_idx = column_mapping.get('name')
            name = ''
            if name_idx is not None and name_idx < len(row):
                name = str(row[name_idx]).strip()
                if name == 'nan':
                    name = ''
            
            scheme_idx = column_mapping.get('scheme')
            scheme = ''
            if scheme_idx is not None and scheme_idx < len(row):
                scheme = str(row[scheme_idx]).strip()
                if scheme == 'nan':
                    scheme = ''
            
            subject_idx = column_mapping.get('subject_appearing_for')
            subject_string = ''
            if subject_idx is not None and subject_idx < len(row):
                subject_string = str(row[subject_idx]).strip()
                if subject_string == 'nan':
                    subject_string = ''
            
            if not name and not enrollment_number and not subject_string:
                continue
            
            clean_row = {
                'Seat Number': seat_value,
                'Enrollment Number': enrollment_number,
                'Name': name,
                'Scheme': scheme,
                'Subject Appearing For': subject_string
            }
            clean_data.append(clean_row)
        
        if not clean_data:
            logger.warning("No valid data rows found in sanitization")
            return content
        
        clean_df = pd.DataFrame(clean_data)
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            clean_df.to_excel(writer, sheet_name='Seating Chart', index=False)
        
        cleaned_content = output.getvalue()
        logger.info(f"Sanitized seating chart: {len(clean_data)} rows extracted")
        return cleaned_content
        
    except Exception as e:
        logger.error(f"Error sanitizing seating chart: {e}")
        import traceback
        traceback.print_exc()
        return content


# ============================================================================
# UPLOAD ENDPOINT
# ============================================================================

# backend/routers/upload.py - FIXED upload_file function

@router.post("/")
async def upload_file(
    file: UploadFile = File(...),
    file_type: str = Form(...),
    connected_institute_id: str = Form(None),
    exam_center_id: str = Depends(get_exam_center_id)
):
    """Unified file upload endpoint with automatic sanitization"""
    
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
    
    # ✅ SANITIZE seating chart files before validation
    if file_type == "seatingchart":
        sanitized_content = sanitize_seating_chart_excel(content)
        content = sanitized_content
    
    # ✅ Validate connected_institute_id
    if file_type == "seatingchart" and connected_institute_id:
        try:
            UUID(connected_institute_id)
            
            institute = db.execute_query("""
                SELECT id, institute_code, institute_name
                FROM connected_institutes
                WHERE id = :institute_id AND exam_center_id = :exam_center_id AND is_active = true
            """, {
                "institute_id": connected_institute_id,
                "exam_center_id": exam_center_id
            })
            
            if not institute:
                raise HTTPException(404, "Connected institute not found or inactive")
            
            logger.info(f"Uploading seating chart for institute: {institute[0]['institute_code']} - {institute[0]['institute_name']}")
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
        institute = db.execute_query("""
            SELECT institute_code FROM connected_institutes
            WHERE id = :institute_id
        """, {"institute_id": connected_institute_id})
        
        if institute:
            institute_code = institute[0]['institute_code']
            base_name = stored_filename.rsplit('.', 1)[0] if '.' in stored_filename else stored_filename
            ext_part = stored_filename.rsplit('.', 1)[1] if '.' in stored_filename else 'xlsx'
            file_parts = base_name.split('_')
            if len(file_parts) >= 2:
                stored_filename = f"{file_parts[0]}_{file_parts[1]}_{institute_code}_{'_'.join(file_parts[2:])}.{ext_part}"
    
    file_path = os.path.join(settings.UPLOAD_DIR, stored_filename)
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    
    # Save file
    with open(file_path, 'wb') as f:
        if file_type == "timetable":
            f.write(processed_content)
        else:
            f.write(content)
    
    file_hash = calculate_file_hash(content)
    
    metadata_json = json.dumps({
        "uploaded_at": datetime.now().isoformat(),
        "original_ext": ext,
        "connected_institute_id": connected_institute_id,
        "sanitized": file_type == "seatingchart"
    })
    
    # ✅ FIX: Use EXISTS check instead of ON CONFLICT
    if connected_institute_id:
        # Check if record exists for this institute
        existing = db.execute_query("""
            SELECT id FROM uploads
            WHERE exam_center_id = :exam_center_id 
                AND file_type = :file_type 
                AND connected_institute_id = :connected_institute_id
        """, {
            "exam_center_id": exam_center_id,
            "file_type": file_type,
            "connected_institute_id": connected_institute_id
        })
        
        if existing:
            # Update existing record
            db.execute_update("""
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
            """, {
                "exam_center_id": exam_center_id,
                "file_type": file_type,
                "original_filename": file.filename,
                "stored_filename": stored_filename,
                "file_hash": file_hash,
                "file_size": len(content),
                "connected_institute_id": connected_institute_id,
                "metadata": metadata_json
            })
        else:
            # Insert new record
            db.execute_update("""
                INSERT INTO uploads (
                    exam_center_id, file_type, original_filename, stored_filename,
                    file_hash, file_size, status, connected_institute_id, metadata
                ) VALUES (
                    :exam_center_id, :file_type, :original_filename, :stored_filename,
                    :file_hash, :file_size, 'UPLOADED', :connected_institute_id, CAST(:metadata AS jsonb)
                )
            """, {
                "exam_center_id": exam_center_id,
                "file_type": file_type,
                "original_filename": file.filename,
                "stored_filename": stored_filename,
                "file_hash": file_hash,
                "file_size": len(content),
                "connected_institute_id": connected_institute_id,
                "metadata": metadata_json
            })
    else:
        # For files without institute (timetable, emarksheet, etc.)
        # Check if record exists without institute
        existing = db.execute_query("""
            SELECT id FROM uploads
            WHERE exam_center_id = :exam_center_id 
                AND file_type = :file_type 
                AND connected_institute_id IS NULL
        """, {
            "exam_center_id": exam_center_id,
            "file_type": file_type
        })
        
        if existing:
            # Update existing record
            db.execute_update("""
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
            """, {
                "exam_center_id": exam_center_id,
                "file_type": file_type,
                "original_filename": file.filename,
                "stored_filename": stored_filename,
                "file_hash": file_hash,
                "file_size": len(content),
                "metadata": metadata_json
            })
        else:
            # Insert new record
            db.execute_update("""
                INSERT INTO uploads (
                    exam_center_id, file_type, original_filename, stored_filename,
                    file_hash, file_size, status, connected_institute_id, metadata
                ) VALUES (
                    :exam_center_id, :file_type, :original_filename, :stored_filename,
                    :file_hash, :file_size, 'UPLOADED', NULL, CAST(:metadata AS jsonb)
                )
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
            "uploaded_at": datetime.now().isoformat(),
            "connected_institute_id": connected_institute_id,
            "sanitized": file_type == "seatingchart"
        },
        message=f"File uploaded successfully. Stored as: {stored_filename}"
    )
    

# ============================================================================
# STATUS ENDPOINT - Updated for per-institute status
# ============================================================================

@router.get("/status")
async def get_upload_status(
    file_type: str,
    connected_institute_id: Optional[str] = None,
    exam_center_id: str = Depends(get_exam_center_id)
):
    """Get upload status - optionally filtered by institute"""
    
    if file_type not in ALLOWED_FILE_TYPES:
        raise HTTPException(400, f"Invalid file_type. Allowed: {', '.join(ALLOWED_FILE_TYPES)}")
    
    # Build query
    query = """
        SELECT original_filename, stored_filename, status, file_size, record_count,
               error_message, metadata, connected_institute_id, created_at, updated_at, processed_at
        FROM uploads
        WHERE exam_center_id = :exam_center_id AND file_type = :file_type
    """
    params = {"exam_center_id": exam_center_id, "file_type": file_type}
    
    if connected_institute_id:
        query += " AND connected_institute_id = :institute_id"
        params["institute_id"] = connected_institute_id
        query += " ORDER BY created_at DESC LIMIT 1"
    else:
        # For non-institute files, ensure connected_institute_id IS NULL
        query += " AND connected_institute_id IS NULL"
        query += " ORDER BY created_at DESC LIMIT 1"
    
    result = db.execute_query(query, params)
    
    if not result:
        return success_response(
            data={"file_exists": False, "file_type": file_type},
            message="No file uploaded for this type"
        )
    
    record = result[0]
    institute_info = None
    if record.get("connected_institute_id"):
        inst = db.execute_query("""
            SELECT id, institute_code, institute_name
            FROM connected_institutes
            WHERE id = :institute_id
        """, {"institute_id": record["connected_institute_id"]})
        if inst:
            institute_info = {
                "id": inst[0]["id"],
                "code": inst[0]["institute_code"],
                "name": inst[0]["institute_name"]
            }
    
    return success_response(
        data={
            "file_exists": True,
            "original_filename": record["original_filename"],
            "stored_filename": record["stored_filename"],
            "status": record["status"],
            "record_count": record["record_count"],
            "file_size": record["file_size"],
            "uploaded_at": record["created_at"].isoformat() if record["created_at"] else None,
            "processed_at": record["processed_at"].isoformat() if record["processed_at"] else None,
            "connected_institute_id": record.get("connected_institute_id"),
            "institute_info": institute_info
        },
        message="Upload status retrieved"
    )


@router.get("/status/all")
async def get_all_upload_status(
    file_type: str,
    exam_center_id: str = Depends(get_exam_center_id)
):
    """Get all upload records for a file type (including per-institute)"""
    
    if file_type not in ALLOWED_FILE_TYPES:
        raise HTTPException(400, f"Invalid file_type. Allowed: {', '.join(ALLOWED_FILE_TYPES)}")
    
    result = db.execute_query("""
        SELECT original_filename, stored_filename, status, file_size, record_count,
               error_message, metadata, connected_institute_id, created_at, updated_at, processed_at
        FROM uploads
        WHERE exam_center_id = :exam_center_id AND file_type = :file_type
        ORDER BY connected_institute_id NULLS FIRST, created_at DESC
    """, {"exam_center_id": exam_center_id, "file_type": file_type})
    
    records = []
    for record in result:
        institute_info = None
        if record.get("connected_institute_id"):
            inst = db.execute_query("""
                SELECT id, institute_code, institute_name
                FROM connected_institutes
                WHERE id = :institute_id
            """, {"institute_id": record["connected_institute_id"]})
            if inst:
                institute_info = {
                    "id": inst[0]["id"],
                    "code": inst[0]["institute_code"],
                    "name": inst[0]["institute_name"]
                }
        
        records.append({
            "file_exists": True,
            "original_filename": record["original_filename"],
            "stored_filename": record["stored_filename"],
            "status": record["status"],
            "record_count": record["record_count"],
            "file_size": record["file_size"],
            "uploaded_at": record["created_at"].isoformat() if record["created_at"] else None,
            "processed_at": record["processed_at"].isoformat() if record["processed_at"] else None,
            "connected_institute_id": record.get("connected_institute_id"),
            "institute_info": institute_info
        })
    
    return success_response(
        data={"records": records, "count": len(records)},
        message=f"Found {len(records)} upload records"
    )


# ============================================================================
# DOWNLOAD & DELETE - Updated for per-institute
# ============================================================================

@router.get("/download")
async def download_file(
    file_name: str,
    file_type: str,
    connected_institute_id: Optional[str] = None,
    exam_center_id: str = Depends(get_exam_center_id)
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
    media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" if ext in ['.xlsx'] else \
                 "application/vnd.ms-excel" if ext in ['.xls'] else \
                 "text/html" if ext in ['.html', '.htm'] else \
                 "application/octet-stream"
    
    return FileResponse(
        path=file_path,
        filename=record['original_filename'],
        media_type=media_type,
        headers={
            "Content-Disposition": f"attachment; filename={record['original_filename']}"
        }
    )   


@router.delete("/")
async def delete_upload(
    file_type: str,
    connected_institute_id: Optional[str] = None,
    exam_center_id: str = Depends(get_exam_center_id)
):
    """Delete an uploaded file - optionally for specific institute"""
    
    if file_type not in ALLOWED_FILE_TYPES:
        raise HTTPException(400, f"Invalid file_type. Allowed: {', '.join(ALLOWED_FILE_TYPES)}")
    
    # Build delete query
    query = """
        SELECT stored_filename FROM uploads
        WHERE exam_center_id = :exam_center_id AND file_type = :file_type
    """
    params = {"exam_center_id": exam_center_id, "file_type": file_type}
    
    if connected_institute_id:
        query += " AND connected_institute_id = :institute_id"
        params["institute_id"] = connected_institute_id
    else:
        query += " AND connected_institute_id IS NULL"
    
    result = db.execute_query(query, params)
    
    if result:
        stored_filename = result[0]["stored_filename"]
        file_path = os.path.join(settings.UPLOAD_DIR, stored_filename)
        if os.path.exists(file_path):
            os.remove(file_path)
            logger.info(f"Deleted file: {file_path}")
    
    # Delete from database
    db.execute_update(query.replace("SELECT stored_filename", "DELETE"), params)
    
    return success_response(message=f"Uploaded file for {file_type} deleted successfully")