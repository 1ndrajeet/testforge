# backend/utils.py
import re
import hashlib
import uuid
import os
from typing import Tuple, Any
import logging

logger = logging.getLogger(__name__)

# ============================================================================
# Configuration
# ============================================================================

ALLOWED_FILE_TYPES = ["timetable", "seatingchart", "seatingarrangement", "emarksheet", "inventory"]

# ============================================================================
# HTML Sanitization - Remove dangerous content only
# ============================================================================

def sanitize_html(html: str) -> str:
    sanitized = re.sub(
        r'<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>',
        '',
        html,
        flags=re.IGNORECASE,
    )

    sanitized = re.sub(
        r'<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>',
        '',
        sanitized,
        flags=re.IGNORECASE,
    )

    sanitized = re.sub(
        r'<link\b[^>]*rel=["\']?stylesheet["\']?[^>]*>',
        '',
        sanitized,
        flags=re.IGNORECASE,
    )

    sanitized = re.sub(r'\s*on\w+="[^"]*"', '', sanitized, flags=re.IGNORECASE)
    sanitized = re.sub(r"\s*on\w+='[^']*'", '', sanitized, flags=re.IGNORECASE)

    sanitized = re.sub(r'javascript:', '', sanitized, flags=re.IGNORECASE)

    sanitized = re.sub(
        r'<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>',
        '',
        sanitized,
        flags=re.IGNORECASE,
    )

    sanitized = re.sub(
        r'<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>',
        '',
        sanitized,
        flags=re.IGNORECASE,
    )

    sanitized = re.sub(
        r'<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>',
        '',
        sanitized,
        flags=re.IGNORECASE,
    )

    sanitized = re.sub(
        r'<meta[^>]*http-equiv=["\']?refresh["\']?[^>]*>',
        '',
        sanitized,
        flags=re.IGNORECASE,
    )

    sanitized = re.sub(r'\sstyle="[^"]*"', '', sanitized, flags=re.IGNORECASE)
    sanitized = re.sub(r"\sstyle='[^']*'", '', sanitized, flags=re.IGNORECASE)

    return sanitized
    
# ============================================================================
# HTML Validation - Check if safe and has tables
# ============================================================================

def validate_html_file(content: bytes, file_type: str) -> Tuple[bool, bytes, str]:
    """
    Validate HTML file for timetable.
    - Checks if it's valid HTML
    - Sanitizes dangerous content
    - Verifies tables exist
    - Returns sanitized content for storage
    """
    try:
        html = content.decode('utf-8')
        
        # Sanitize
        sanitized = sanitize_html(html)
        
        # Quick check for tables (timetable data lives in tables)
        if '<table' not in sanitized.lower():
            return False, None, "No tables found in HTML file"
        
        # Basic HTML wrapper if missing (for proper parsing later)
        if '<html' not in sanitized.lower():
            sanitized = f"<!DOCTYPE html>\n<html>\n<body>\n{sanitized}\n</body>\n</html>"
        
        return True, sanitized.encode('utf-8'), None
        
    except UnicodeDecodeError:
        return False, None, "File is not valid HTML (encoding error)"
    except Exception as e:
        return False, None, f"HTML validation failed: {str(e)}"

# ============================================================================
# Excel Validation - Check columns exist (no data parsing)
# ============================================================================

EXCEL_SCHEMAS = {
    "emarksheet": {
        "SHEET_NO": "string",
        "SUBJECT_NAME": "string",
        "SCHEME": "string",
        "SUBJECT_HEAD": "string",
        "PAPER_CODE": "string",
        "FILE_NAME": "string",
    },
    "seatingchart": {
        "SEAT_NUMBER": "number",
        "ENROLLMENT_NUMBER": "string",
        "NAME": "string",
        "SCHEME": "string",
        "SUBJECT_APPEARING_FOR": "string",
    },
    "seatingarrangement": {
        "SR_NO": "number",
        "SEAT_NUMBER": "number",
        "INST_CODE": "string",
        "COURSE_CODE": "string",
        "SEMESTER": "number",
        "MASTER_CODE": "string",
        "PAPER_CODE": "string",
    },
    "inventory": {
        "SUBJECT_CODE": "string",
        "STUDENT_COUNT": "number",
        "NO_OF_PACKETS": "number",
    },
}

def validate_excel_file(content: bytes, file_type: str) -> Tuple[bool, None, str]:
    """
    Validate Excel file.
    - Checks if required columns exist
    - Does NOT parse data (that's for the specific module)
    - Returns validation result only
    """
    try:
        import pandas as pd
        from io import BytesIO
        
        schema = EXCEL_SCHEMAS.get(file_type)
        if not schema:
            return False, None, f"Unknown file type: {file_type}"
        
        # Read only headers (first few rows)
        df = pd.read_excel(BytesIO(content), nrows=5, header=None, dtype=str).fillna('')
        
        if df.empty:
            return False, None, "Excel file is empty"
        
        # Find header row (first row with any of the expected columns)
        required_columns = list(schema.keys())
        header_row_idx = None
        headers = []
        
        for idx, row in df.iterrows():
            row_headers = [str(cell).strip().upper() if pd.notna(cell) else '' for cell in row.values]
            found_columns = [col for col in required_columns if col in row_headers]
            if len(found_columns) >= len(required_columns) * 0.5:  # At least 50% match
                header_row_idx = idx
                headers = row_headers
                break
        
        if header_row_idx is None:
            return False, None, f"Could not find headers. Expected columns: {', '.join(required_columns)}"
        
        # Check for missing columns
        missing_columns = [col for col in required_columns if col not in headers]
        if missing_columns:
            return False, None, f"Missing columns: {', '.join(missing_columns)}"
        
        # File is valid
        return True, None, None
        
    except Exception as e:
        return False, None, f"Excel validation failed: {str(e)}"

# ============================================================================
# Helpers
# ============================================================================

def calculate_file_hash(content: bytes) -> str:
    """Calculate SHA256 hash of file content"""
    return hashlib.sha256(content).hexdigest()

def generate_stored_filename(exam_center_id: str, file_type: str, original_filename: str) -> str:
    """Generate unique stored filename"""
    ext = os.path.splitext(original_filename)[1].lower()
    unique_id = uuid.uuid4().hex[:8]
    return f"{file_type}_{exam_center_id}_{unique_id}{ext}"

def success_response(data: Any = None, message: str = "Success") -> dict:
    return {"success": True, "message": message, "data": data, "error": None}

def error_response(message: str, error: str = None, status_code: int = 400) -> tuple:
    return {"success": False, "message": message, "data": None, "error": error or message}, status_code