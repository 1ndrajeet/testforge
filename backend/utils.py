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

# backend/utils.py - Fix validate_excel_file

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
        df = pd.read_excel(BytesIO(content), nrows=10, header=None, dtype=str).fillna('')
        
        if df.empty:
            return False, None, "Excel file is empty"
        
        required_columns = list(schema.keys())
        header_row_idx = None
        headers = []
        
        # Special handling for seating chart - validate by position
        if file_type == "seatingchart":
            # Look for a row with "SEAT" or "ENROLLMENT" or "NAME" or "SCHEME" in any column
            for idx, row in df.iterrows():
                row_headers = [str(cell).strip().upper() if pd.notna(cell) else '' for cell in row.values]
                
                # Check if this row looks like a header
                is_header = False
                for h in row_headers:
                    h_clean = h.replace(' ', '').replace('.', '').replace('/', '')
                    if 'SEAT' in h_clean or 'SEATNUMBER' in h_clean:
                        is_header = True
                        break
                    if 'ENROLLMENT' in h_clean or 'ENROLLMENTNUMBER' in h_clean:
                        is_header = True
                        break
                    if 'NAME' in h_clean or 'STUDENTNAME' in h_clean:
                        is_header = True
                        break
                    if 'SCHEME' in h_clean:
                        is_header = True
                        break
                
                if is_header:
                    header_row_idx = idx
                    headers = row_headers
                    break
            
            # If no header found, look for first row with a numeric value in column 0 or 1
            if header_row_idx is None:
                for idx, row in df.iterrows():
                    col0 = str(row[0]).strip() if len(row) > 0 else ''
                    col1 = str(row[1]).strip() if len(row) > 1 else ''
                    if (col0 and col0.isdigit()) or (col1 and col1.isdigit()):
                        # This is data, header is above
                        if idx > 0:
                            header_row_idx = idx - 1
                            headers = [str(cell).strip().upper() if pd.notna(cell) else '' for cell in df.iloc[header_row_idx].values]
                        else:
                            header_row_idx = 0
                            headers = [str(cell).strip().upper() if pd.notna(cell) else '' for cell in df.iloc[0].values]
                        break
            
            # If still no header, use first row
            if header_row_idx is None:
                header_row_idx = 0
                headers = [str(cell).strip().upper() if pd.notna(cell) else '' for cell in df.iloc[0].values]
            
            # Check if we have data (at least one row with numeric seat number)
            has_data = False
            for idx in range(header_row_idx + 1, min(header_row_idx + 10, len(df))):
                row = df.iloc[idx]
                col0 = str(row[0]).strip() if len(row) > 0 else ''
                col1 = str(row[1]).strip() if len(row) > 1 else ''
                if (col0 and col0.isdigit()) or (col1 and col1.isdigit()):
                    has_data = True
                    break
            
            if not has_data:
                return False, None, "No valid seating chart data found. File should have Seat Number, Enrollment Number, Name, Scheme columns with data rows."
            
            # For seating chart, we don't need strict header matching
            # Just make sure we have at least 4 columns
            if len(headers) < 4:
                return False, None, "File must have at least 4 columns: Seat Number, Enrollment Number, Name, Scheme"
            
            # Check if we can find seat numbers in column 0 or 1
            return True, None, None
        
        else:
            # Original validation logic for other file types
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
        logger.error(f"Excel validation error: {e}")
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