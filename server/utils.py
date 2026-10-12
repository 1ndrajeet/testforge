# backend/utils.py - COMPLETE CLEAN VERSION

import hashlib
import io
import logging
import os
import re
import uuid
from typing import Any, Optional, Tuple

logger = logging.getLogger(__name__)

# ============================================================================
# Configuration
# ============================================================================

ALLOWED_FILE_TYPES = ["timetable", "seatingchart", "seatingarrangement", "emarksheet", "inventory"]

# ============================================================================
# EXCEL_SCHEMAS - Define schemas for validation
# ============================================================================

EXCEL_SCHEMAS = {
    "emarksheet": {
        "Sheet No.": "string",
        "Subject Name": "string",
        "Scheme": "string",
        "Subject Head": "string",
        "Paper Code": "string",
        "File Name": "string",
    },
    "seatingchart": {
        "Seat Number": "number",
        "Enrollment Number": "string",
        "Name": "string",
        "Scheme": "string",
        "Subject Appearing For": "string",
    },
    "seatingarrangement": {
        "SR No": "number",
        "Seat Number": "number",
        "Inst Code": "string",
        "Course Code": "string",
        "Semester": "number",
        "Master Code": "string",
        "Paper Code": "string",
    },
    "inventory": {
        "Region": "string",
        "DC": "string",
        "EC": "string",
        "DAY": "string",
        "SESSION": "string",
        "PAPER_CODE": "string",
        "No_of_Candidates": "number",
        "No_of_Packets_Required": "number",
        "Total_Packets_Session": "number",
        "Total_Packets_Day": "number",
    },
}

# ============================================================================
# HTML Sanitization
# ============================================================================


def sanitize_html(html: str) -> str:
    """Remove dangerous HTML content while preserving structure"""
    patterns = [
        (r"<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>", "", re.IGNORECASE),
        (r"<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>", "", re.IGNORECASE),
        (r'<link\b[^>]*rel=["\']?stylesheet["\']?[^>]*>', "", re.IGNORECASE),
        (r'\s*on\w+="[^"]*"', "", re.IGNORECASE),
        (r"\s*on\w+='[^']*'", "", re.IGNORECASE),
        (r"javascript:", "", re.IGNORECASE),
        (r"<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>", "", re.IGNORECASE),
        (r"<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>", "", re.IGNORECASE),
        (r"<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>", "", re.IGNORECASE),
        (r'<meta[^>]*http-equiv=["\']?refresh["\']?[^>]*>', "", re.IGNORECASE),
        (r'\sstyle="[^"]*"', "", re.IGNORECASE),
        (r"\sstyle='[^']*'", "", re.IGNORECASE),
    ]

    sanitized = html
    for pattern, replacement, flags in patterns:
        sanitized = re.sub(pattern, replacement, sanitized, flags=flags)
    return sanitized


# ============================================================================
# HTML Validation
# ============================================================================


def validate_html_file(
    content: bytes, file_type: str
) -> Tuple[bool, Optional[bytes], Optional[str]]:
    """Validate HTML file for timetable"""
    try:
        html = content.decode("utf-8")
        sanitized = sanitize_html(html)

        if "<table" not in sanitized.lower():
            return False, None, "No tables found in HTML file"

        if "<html" not in sanitized.lower():
            sanitized = f"<!DOCTYPE html>\n<html>\n<body>\n{sanitized}\n</body>\n</html>"

        return True, sanitized.encode("utf-8"), None

    except UnicodeDecodeError:
        return False, None, "File is not valid HTML (encoding error)"
    except Exception as e:
        return False, None, f"HTML validation failed: {str(e)}"


# ============================================================================
# Excel Validation - Main Entry Point
# ============================================================================


def validate_excel_file(
    content: bytes, file_type: str
) -> Tuple[bool, Optional[bytes], Optional[str]]:
    """
    Validate and sanitize Excel file.
    Returns: (is_valid, sanitized_content, error_message)
    """
    try:
        # Sanitize specific file types first
        if file_type == "inventory":
            return _validate_inventory_file(content)
        elif file_type == "emarksheet":
            return _validate_emarksheet_file(content)
        elif file_type == "seatingchart":
            return _validate_seating_chart_file(content)
        elif file_type == "seatingarrangement":
            return _validate_seating_arrangement_file(content)  # ADD THIS
        else:
            return _validate_generic_excel_file(content, file_type)

    except Exception as e:
        logger.error(f"Excel validation error: {e}")
        return False, content, f"Excel validation failed: {str(e)}"


# ============================================================================
# Excel Validation - Specific File Types
# ============================================================================
# ADD THIS NEW FUNCTION
def _validate_seating_arrangement_file(
    content: bytes,
) -> Tuple[bool, Optional[bytes], Optional[str]]:
    """Validate seating arrangement Excel file - skip header row"""
    try:
        from io import BytesIO

        import pandas as pd

        # Read the file with no header (raw data)
        df = pd.read_excel(BytesIO(content), header=None, dtype=str).fillna("")

        if df.empty:
            return False, content, "Seating arrangement file is empty"

        # Skip first row (header) and check if we have data
        if len(df) < 2:
            return False, content, "No data rows found in seating arrangement file"

        # Check if first row looks like a header (has text like "SR No", "Seat Number", etc.)
        header_row = df.iloc[0].values
        header_text = " ".join([str(v).lower() for v in header_row if str(v).strip()])

        is_header = any(
            keyword in header_text
            for keyword in ["sr no", "seat number", "inst code", "course code", "paper code"]
        )

        if not is_header:
            # If no header, use first row as data
            return True, content, None

        # Create new DataFrame without the header row
        data_df = df.iloc[1:].copy()
        data_df.reset_index(drop=True, inplace=True)

        # Basic validation - check if we have seat numbers and paper codes
        if len(data_df) == 0:
            return False, content, "No data rows found after removing header"

        # Check that column 1 (seat number) and column 6 (paper code) exist and have values
        valid_rows = 0
        for idx, row in data_df.iterrows():
            seat_val = str(row[1] if len(row) > 1 else "").strip()
            paper_val = str(row[6] if len(row) > 6 else "").strip()
            if seat_val and seat_val.isdigit() and paper_val:
                valid_rows += 1

        if valid_rows == 0:
            return (
                False,
                content,
                "No valid seating arrangement records found. Please check the file format.",
            )

        # Write the data without header to a new Excel file
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine="openpyxl") as writer:
            data_df.to_excel(writer, sheet_name="Sheet1", index=False, header=False)

        sanitized_content = output.getvalue()

        logger.info(f"Seating arrangement validated: {valid_rows} rows found")
        return True, sanitized_content, None

    except Exception as e:
        logger.error(f"Seating arrangement validation error: {e}")
        return False, content, f"Seating arrangement validation failed: {str(e)}"


# backend/utils.py - FIXED _validate_inventory_file

def _validate_inventory_file(content: bytes) -> Tuple[bool, Optional[bytes], Optional[str]]:
    """Validate inventory Excel file"""
    try:
        from io import BytesIO

        import pandas as pd

        # First sanitize the file
        sanitized = sanitize_inventory_excel(content)
        
        # Try to read the sanitized file
        try:
            df = pd.read_excel(BytesIO(sanitized), dtype=str).fillna("")
        except Exception as e:
            logger.error(f"Error reading sanitized inventory: {e}")
            return False, content, f"Failed to read inventory file: {str(e)}"

        if df.empty:
            return False, content, "Inventory file is empty after sanitization"

        # Check for required columns
        required = ["Region", "DC", "EC", "DAY", "SESSION", "PAPER_CODE"]
        actual = [str(c).strip() for c in df.columns]
        missing = [col for col in required if col not in actual]

        if missing:
            logger.warning(f"Missing columns in sanitized file: {missing}")
            # Try to rename columns if they're close
            rename_map = {}
            for req in missing:
                for col in actual:
                    if req.lower() in col.lower() or col.lower() in req.lower():
                        rename_map[col] = req
                        break
            
            if rename_map:
                df = df.rename(columns=rename_map)
                logger.info(f"Renamed columns: {rename_map}")
            
            # Check again
            actual = [str(c).strip() for c in df.columns]
            missing = [col for col in required if col not in actual]
            
            if missing:
                return False, content, f"Missing columns: {', '.join(missing)}"

        # Check for data rows
        if len(df) < 1:
            return False, content, "No data rows found"

        # Write the validated data back
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine="openpyxl") as writer:
            df.to_excel(writer, sheet_name="Inventory", index=False)
        
        logger.info(f"Inventory validated: {len(df)} rows found")
        return True, output.getvalue(), None

    except Exception as e:
        logger.error(f"Inventory validation error: {e}")
        import traceback
        traceback.print_exc()
        return False, content, f"Inventory validation failed: {str(e)}"

        

def _validate_emarksheet_file(content: bytes) -> Tuple[bool, Optional[bytes], Optional[str]]:
    """Validate E-Marksheet Excel file"""
    try:
        from io import BytesIO

        import pandas as pd

        sanitized = sanitize_emarksheet_excel(content)
        df = pd.read_excel(BytesIO(sanitized), dtype=str).fillna("")

        if df.empty:
            return False, content, "E-Marksheet file is empty after sanitization"

        required = [
            "Sheet No.",
            "Subject Name",
            "Scheme",
            "Subject Head",
            "Paper Code",
            "File Name",
        ]
        actual = [str(c).strip() for c in df.columns]
        missing = [col for col in required if col not in actual]

        if missing:
            return False, content, f"Missing columns: {', '.join(missing)}"

        if len(df) < 1:
            return False, content, "No data rows found"

        return True, sanitized, None

    except Exception as e:
        logger.error(f"E-Marksheet validation error: {e}")
        return False, content, f"E-Marksheet validation failed: {str(e)}"


def _validate_generic_excel_file(
    content: bytes, file_type: str
) -> Tuple[bool, Optional[bytes], Optional[str]]:
    """Validate generic Excel file against schema"""
    try:
        from io import BytesIO

        import pandas as pd

        schema = EXCEL_SCHEMAS.get(file_type)
        if not schema:
            return True, content, None

        df = pd.read_excel(BytesIO(content), nrows=10, header=0, dtype=str).fillna("")

        if df.empty:
            return False, content, "Excel file is empty"

        required_columns = list(schema.keys())
        actual_columns = [str(c).strip().upper() for c in df.columns]

        missing_columns = [col for col in required_columns if col.upper() not in actual_columns]
        if missing_columns:
            return False, content, f"Missing columns: {', '.join(missing_columns)}"

        return True, content, None

    except Exception as e:
        logger.error(f"Generic Excel validation error: {e}")
        return False, content, f"Excel validation failed: {str(e)}"


# ============================================================================
# INVENTORY SANITIZATION
# ============================================================================


# backend/utils.py - FIXED sanitize_inventory_excel

def sanitize_inventory_excel(content: bytes) -> bytes:
    """Sanitize inventory Excel file - handles MSBTE format with multi-row headers"""
    try:
        from io import BytesIO

        import pandas as pd

        df = pd.read_excel(BytesIO(content), header=None, dtype=str).fillna("")

        if df.empty:
            logger.warning("Inventory file is empty")
            return content

        logger.info(f"Inventory sanitization: raw file has {len(df)} rows, {len(df.columns)} columns")

        # ============================================================
        # STEP 1: Find the header row with actual column names
        # ============================================================
        header_row_idx = None
        
        # Look for rows containing "PAPER CODE" or "Paper Code" or "PAPER_CODE"
        for idx in range(min(30, len(df))):
            row_text = " ".join([str(v).lower() for v in df.iloc[idx].values if str(v).strip()])
            
            # Check for paper code header
            has_paper = "paper" in row_text and ("code" in row_text or "no." in row_text)
            has_region = "region" in row_text
            has_ec = "ec" in row_text or "examination center" in row_text
            has_day = "day" in row_text
            has_session = "session" in row_text
            has_candidate = "candidate" in row_text or "no. of candidate" in row_text
            has_packet = "packet" in row_text
            
            # Multiple matches indicate this is the data header row
            matches = sum([has_paper, has_region, has_ec, has_day, has_session, has_candidate, has_packet])
            
            if matches >= 4:
                header_row_idx = idx
                logger.info(f"Found inventory header at row {idx}")
                break

        if header_row_idx is None:
            logger.warning("Could not find inventory header row")
            return content

        # ============================================================
        # STEP 2: Map columns
        # ============================================================
        header_row = df.iloc[header_row_idx]
        mapping = {}
        
        for col_idx, val in enumerate(header_row):
            val_str = str(val).strip().lower()
            
            # Clean column name for matching
            val_clean = val_str.replace(" ", "_").replace(".", "").replace("no", "no")
            
            if "region" in val_str:
                mapping["REGION"] = col_idx
            elif "dc" in val_str and "region" not in val_str:
                mapping["DC"] = col_idx
            elif "ec" in val_str and "examination" not in val_str:
                mapping["EC"] = col_idx
            elif "day" in val_str:
                mapping["DAY"] = col_idx
            elif "session" in val_str:
                mapping["SESSION"] = col_idx
            elif "paper" in val_str and ("code" in val_str or "no" in val_str):
                mapping["PAPER_CODE"] = col_idx
            elif "candidate" in val_str or ("no" in val_str and "of" in val_str and "candidate" in val_str):
                mapping["NO_OF_CANDIDATES"] = col_idx
            elif "packet" in val_str and "required" in val_str:
                mapping["NO_OF_PACKETS_REQUIRED"] = col_idx
            elif "total" in val_str and "packet" in val_str and "session" in val_str:
                mapping["TOTAL_PACKETS_SESSION"] = col_idx
            elif "total" in val_str and "packet" in val_str and "day" in val_str:
                mapping["TOTAL_PACKETS_DAY"] = col_idx

        # Validate required columns
        required = ["REGION", "DC", "EC", "DAY", "SESSION", "PAPER_CODE"]
        missing = [req for req in required if req not in mapping]
        if missing:
            logger.warning(f"Missing required columns: {missing}")
            # Try to find them by position if possible
            # Based on the Excel file, columns are: Region, DC, EC, DAY, SESSION, PAPER_CODE, No_of_Candidate, No_of_packets_Required, Total_Packets_session, Total_Packets_Day
            # So we can use position-based fallback
            if "REGION" not in mapping:
                mapping["REGION"] = 0
            if "DC" not in mapping:
                mapping["DC"] = 1
            if "EC" not in mapping:
                mapping["EC"] = 2
            if "DAY" not in mapping:
                mapping["DAY"] = 3
            if "SESSION" not in mapping:
                mapping["SESSION"] = 4
            if "PAPER_CODE" not in mapping:
                mapping["PAPER_CODE"] = 5
            if "NO_OF_CANDIDATES" not in mapping:
                mapping["NO_OF_CANDIDATES"] = 6
            if "NO_OF_PACKETS_REQUIRED" not in mapping:
                mapping["NO_OF_PACKETS_REQUIRED"] = 7
            if "TOTAL_PACKETS_SESSION" not in mapping:
                mapping["TOTAL_PACKETS_SESSION"] = 8
            if "TOTAL_PACKETS_DAY" not in mapping:
                mapping["TOTAL_PACKETS_DAY"] = 9

        logger.info(f"Column mapping: {mapping}")

        # ============================================================
        # STEP 3: Parse data rows
        # ============================================================
        
        def parse_int(val):
            try:
                cleaned = str(val).strip().replace(",", "").replace(" ", "")
                if cleaned in ["nan", "None", "", "-", "nan"]:
                    return 0
                # Handle values like "1 -" or "1 - 2"
                if "-" in cleaned:
                    cleaned = cleaned.split("-")[0].strip()
                return int(float(cleaned))
            except (ValueError, TypeError):
                return 0

        clean_data = []
        skipped_rows = 0
        
        for idx in range(header_row_idx + 1, len(df)):
            row = df.iloc[idx]
            
            # Check if row is empty
            row_values = [str(v).strip() for v in row.values if str(v).strip()]
            if not row_values:
                continue
                
            # Get paper code - this is the most important field
            paper_code_idx = mapping.get("PAPER_CODE")
            if paper_code_idx is None or paper_code_idx >= len(row):
                skipped_rows += 1
                continue
                
            paper_code = str(row[paper_code_idx]).strip()
            
            # Skip if no paper code
            if not paper_code or paper_code in ["nan", "None", "", "-"]:
                skipped_rows += 1
                continue
                
            # Skip summary rows
            paper_lower = paper_code.lower()
            if any(k in paper_lower for k in ["total", "certify", "signature", "this is to certify", "name of the officer"]):
                skipped_rows += 1
                continue

            # Extract values with safe access
            def get_col(key, default=""):
                idx = mapping.get(key)
                if idx is None or idx >= len(row):
                    return default
                return str(row[idx]).strip()

            # Parse day
            day_val = get_col("DAY", "0")
            try:
                day = int(float(day_val)) if day_val.isdigit() or day_val.replace('.', '').isdigit() else 0
            except:
                day = 0

            # Parse candidates
            candidates_val = get_col("NO_OF_CANDIDATES", "0")
            no_of_candidates = parse_int(candidates_val)

            # Parse packets required
            packets_val = get_col("NO_OF_PACKETS_REQUIRED", "0")
            no_of_packets_required = parse_int(packets_val)

            # Parse session packets
            session_packets_val = get_col("TOTAL_PACKETS_SESSION", "0")
            total_packets_session = parse_int(session_packets_val)

            # Parse day packets
            day_packets_val = get_col("TOTAL_PACKETS_DAY", "0")
            total_packets_day = parse_int(day_packets_val)

            clean_data.append({
                "Region": get_col("REGION"),
                "DC": get_col("DC"),
                "EC": get_col("EC"),
                "DAY": str(day),
                "SESSION": get_col("SESSION", "M").upper(),
                "PAPER_CODE": paper_code,
                "No_of_Candidates": no_of_candidates,
                "No_of_Packets_Required": no_of_packets_required,
                "Total_Packets_Session": total_packets_session,
                "Total_Packets_Day": total_packets_day,
            })

        if not clean_data:
            logger.warning(f"No valid data rows found. Skipped {skipped_rows} rows")
            return content

        # ============================================================
        # STEP 4: Create clean DataFrame
        # ============================================================
        clean_df = pd.DataFrame(clean_data)
        output = io.BytesIO()
        
        with pd.ExcelWriter(output, engine="openpyxl") as writer:
            clean_df.to_excel(writer, sheet_name="Inventory", index=False)

        logger.info(f"Inventory sanitized: {len(clean_data)} rows extracted, {skipped_rows} rows skipped")
        return output.getvalue()

    except Exception as e:
        logger.error(f"Error sanitizing inventory: {e}")
        import traceback
        traceback.print_exc()
        return content


# ============================================================================
# E-MARKSHEET SANITIZATION
# ============================================================================


def sanitize_emarksheet_excel(content: bytes) -> bytes:
    """Sanitize E-Marksheet Excel file - remove clutter and keep clean data"""
    try:
        from io import BytesIO

        import pandas as pd

        df = pd.read_excel(BytesIO(content), header=None, dtype=str).fillna("")

        if df.empty:
            logger.warning("E-Marksheet file is empty")
            return content

        logger.info(f"E-Marksheet sanitization: raw file has {len(df)} rows")

        # Find header row
        header_row_idx = None
        for idx in range(min(30, len(df))):
            row_values = [str(v).strip() for v in df.iloc[idx].values if str(v).strip()]
            row_text = " ".join([str(v).lower() for v in row_values])

            has_sheet = "sheet" in row_text and (
                "no" in row_text or "no." in row_text or "#" in row_text
            )
            has_subject = "subject" in row_text
            has_scheme = "scheme" in row_text
            has_head = "head" in row_text
            has_paper = "paper" in row_text and "code" in row_text
            has_file = "file" in row_text and "name" in row_text

            matches = sum([has_sheet, has_subject, has_scheme, has_head, has_paper, has_file])

            if matches >= 4:
                header_row_idx = idx
                logger.info(f"Found E-Marksheet header at row {idx}")
                break

        if header_row_idx is None:
            logger.warning("Could not find E-Marksheet header")
            return content

        # Map columns
        header_row = df.iloc[header_row_idx]
        mapping = {}
        for col_idx, val in enumerate(header_row):
            val_str = str(val).strip().lower()
            if "sheet" in val_str and ("no" in val_str or "no." in val_str or "#" in val_str):
                mapping["Sheet No."] = col_idx
            elif "subject" in val_str and "name" in val_str:
                mapping["Subject Name"] = col_idx
            elif "scheme" in val_str:
                mapping["Scheme"] = col_idx
            elif "subject" in val_str and "head" in val_str:
                mapping["Subject Head"] = col_idx
            elif "paper" in val_str and "code" in val_str:
                mapping["Paper Code"] = col_idx
            elif "file" in val_str and "name" in val_str:
                mapping["File Name"] = col_idx

        # Validate required columns
        required = [
            "Sheet No.",
            "Subject Name",
            "Scheme",
            "Subject Head",
            "Paper Code",
            "File Name",
        ]
        for req in required:
            if req not in mapping:
                logger.warning(f"Required column '{req}' not found")
                return content

        # Extract data
        clean_data = []
        for idx in range(header_row_idx + 1, len(df)):
            row = df.iloc[idx]
            if all(str(v).strip() in ["", "nan", "None", "-"] for v in row):
                continue

            sheet_no = str(row[mapping["Sheet No."]]).strip()
            if not sheet_no or sheet_no in ["nan", "None", "", "-"]:
                continue
            if any(k in sheet_no.lower() for k in ["total", "certify", "signature"]):
                continue

            clean_data.append(
                {
                    "Sheet No.": sheet_no,
                    "Subject Name": str(row[mapping.get("Subject Name", 0)]).strip(),
                    "Scheme": str(row[mapping.get("Scheme", 0)]).strip(),
                    "Subject Head": str(row[mapping.get("Subject Head", 0)]).strip(),
                    "Paper Code": str(row[mapping.get("Paper Code", 0)]).strip(),
                    "File Name": str(row[mapping.get("File Name", 0)]).strip(),
                }
            )

        if not clean_data:
            logger.warning("No valid data rows found")
            return content

        clean_df = pd.DataFrame(clean_data)
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine="openpyxl") as writer:
            clean_df.to_excel(writer, sheet_name="E-Marksheet", index=False)

        logger.info(f"E-Marksheet sanitized: {len(clean_data)} rows extracted")
        return output.getvalue()

    except Exception as e:
        logger.error(f"Error sanitizing E-Marksheet: {e}")
        return content


# ============================================================================
# SEATING CHART SANITIZATION
# ============================================================================


def sanitize_seating_chart_excel(content: bytes) -> bytes:
    """
    Sanitize seating chart Excel files - handles multiple formats.

    Format 1: Seat | Enroll | Name | Scheme | Subjects | Status1 | Status2
    Format 2: SR No | Seat | Enroll | Name | Scheme | Subjects | Status1 | Status2
    Format 3: SR No | Seat | Roll No | Enrollment | Name | Scheme | Subjects | Status1 | Status2
    """
    try:
        import re
        from io import BytesIO

        import pandas as pd

        df = pd.read_excel(BytesIO(content), header=None, dtype=str).fillna("")

        if df.empty:
            logger.warning("Seating chart file is empty")
            return content

        logger.info(f"Seating chart: {len(df)} rows, {len(df.columns)} columns")

        # ============================================================
        # STEP 1: Detect data rows and column mapping
        # ============================================================
        data_start_row = None

        # First pass - find header row
        for idx in range(min(30, len(df))):
            row = df.iloc[idx]
            row_text = " ".join([str(c).lower() for c in row if str(c).strip()])

            # Look for column headers
            "sr" in row_text or "sr no" in row_text or "sr." in row_text
            has_seat = "seat" in row_text or "seat no" in row_text
            "enroll" in row_text or "enrollment" in row_text
            has_name = "name" in row_text
            has_scheme = "scheme" in row_text
            has_subject = "subject" in row_text or "appearing" in row_text or "paper" in row_text

            if has_seat and has_name and (has_scheme or has_subject):
                logger.info(f"Found header at row {idx}")
                data_start_row = idx + 1
                break

        # If no header found, try to find data directly
        if data_start_row is None:
            for idx in range(min(30, len(df))):
                col0 = str(df.iloc[idx, 0]).strip() if len(df.columns) > 0 else ""
                col1 = str(df.iloc[idx, 1]).strip() if len(df.columns) > 1 else ""

                # Check if first column is SR (small numbers) and second is seat (large numbers)
                if col0.isdigit() and col1.isdigit():
                    sr_num = int(col0)
                    seat_num = int(col1)
                    if 1 <= sr_num <= 100 and seat_num > 10000:
                        data_start_row = idx
                        logger.info(
                            f"Found data starting at row {idx} (SR in col A, Seat in col B)"
                        )
                        break

                # Check if first column is seat number directly
                if col0.isdigit() and int(col0) > 10000:
                    data_start_row = idx
                    logger.info(f"Found data starting at row {idx} (Seat in col A)")
                    break

        # If still no data found, try to detect by looking for numeric patterns
        if data_start_row is None:
            for idx in range(min(50, len(df))):
                row = df.iloc[idx]
                valid_seats = 0
                for col_idx in range(min(3, len(row))):
                    val = str(row[col_idx]).strip()
                    if val.isdigit() and int(val) > 10000:
                        valid_seats += 1
                if valid_seats >= 1:
                    data_start_row = idx
                    logger.info(f"Found numeric seat data at row {idx}")
                    break

        if data_start_row is None:
            logger.warning("Could not find data in seating chart")
            return content

        # ============================================================
        # STEP 2: Determine column mapping
        # ============================================================

        # Examine first data row to understand column structure
        sample_row = df.iloc[data_start_row] if data_start_row < len(df) else None
        num_cols = len(df.columns)

        # Initialize mapping
        col_mapping = {
            "seat_number": None,
            "enrollment_number": None,
            "name": None,
            "scheme": None,
            "subject_appearing_for": None,
            "sr_number": None,
        }

        if sample_row is not None:
            # Check each column in the sample row
            for col_idx in range(min(num_cols, 10)):
                val = str(sample_row[col_idx]).strip()

                # Detect SR number column (small number, 1-1000)
                if val.isdigit() and 1 <= int(val) <= 10000 and col_mapping["sr_number"] is None:
                    # Check if this is a seat number instead (large number)
                    if int(val) < 10000 and col_idx == 0:
                        # First column with small number is likely SR
                        col_mapping["sr_number"] = col_idx
                        continue

                # Detect Seat Number (large number, usually > 10000)
                if val.isdigit() and int(val) > 10000 and col_mapping["seat_number"] is None:
                    col_mapping["seat_number"] = col_idx
                    continue

                # Detect Enrollment Number (10+ digits)
                clean_val = re.sub(r"[^0-9]", "", val)
                if (
                    len(clean_val) >= 10
                    and clean_val.isdigit()
                    and col_mapping["enrollment_number"] is None
                ):
                    col_mapping["enrollment_number"] = col_idx
                    continue

                # Detect Name (contains letters and spaces)
                if re.search(r"[A-Za-z]", val) and len(val) > 2 and col_mapping["name"] is None:
                    # Check if it's a scheme (contains hyphen)
                    if "-" not in val:
                        col_mapping["name"] = col_idx
                        continue

                # Detect Scheme (contains hyphen, format like AE-3-I)
                if "-" in val and col_mapping["scheme"] is None:
                    col_mapping["scheme"] = col_idx
                    continue

                # Detect Subjects (contains comma separated codes)
                if (
                    "," in val
                    and ("ESE" in val or "SA" in val)
                    and col_mapping["subject_appearing_for"] is None
                ):
                    col_mapping["subject_appearing_for"] = col_idx
                    continue

        # ============================================================
        # STEP 3: Fill missing mapping using position-based defaults
        # ============================================================

        # If seat number not found, check if column 0 or 1 has it
        if col_mapping["seat_number"] is None:
            if sample_row is not None:
                col0 = str(sample_row[0]).strip() if len(sample_row) > 0 else ""
                col1 = str(sample_row[1]).strip() if len(sample_row) > 1 else ""

                if col0.isdigit() and int(col0) > 10000:
                    col_mapping["seat_number"] = 0
                elif col1.isdigit() and int(col1) > 10000:
                    col_mapping["seat_number"] = 1
                else:
                    col_mapping["seat_number"] = 1  # Default to column 1 (second column)

        # If enrollment not found, look for 10+ digit numbers
        if col_mapping["enrollment_number"] is None:
            if sample_row is not None:
                for col_idx in range(min(num_cols, 8)):
                    val = str(sample_row[col_idx]).strip()
                    clean_val = re.sub(r"[^0-9]", "", val)
                    if (
                        len(clean_val) >= 10
                        and clean_val.isdigit()
                        and col_idx != col_mapping["seat_number"]
                    ):
                        col_mapping["enrollment_number"] = col_idx
                        break

                # If still not found, use next available column
                if col_mapping["enrollment_number"] is None:
                    for col_idx in range(min(num_cols, 8)):
                        if (
                            col_idx != col_mapping["seat_number"]
                            and col_idx != col_mapping["sr_number"]
                        ):
                            col_mapping["enrollment_number"] = col_idx
                            break

        # If name not found, look for text columns
        if col_mapping["name"] is None:
            if sample_row is not None:
                for col_idx in range(min(num_cols, 8)):
                    val = str(sample_row[col_idx]).strip()
                    if re.search(r"[A-Za-z]", val) and len(val) > 2:
                        if (
                            col_idx != col_mapping["seat_number"]
                            and col_idx != col_mapping["enrollment_number"]
                        ):
                            if "-" not in val and "," not in val:
                                col_mapping["name"] = col_idx
                                break

                if col_mapping["name"] is None:
                    # Use first column that's not seat or enrollment
                    for col_idx in range(min(num_cols, 8)):
                        if col_idx not in [
                            col_mapping["seat_number"],
                            col_mapping["enrollment_number"],
                        ]:
                            col_mapping["name"] = col_idx
                            break

        # If scheme not found, look for columns with hyphen
        if col_mapping["scheme"] is None:
            if sample_row is not None:
                for col_idx in range(min(num_cols, 8)):
                    val = str(sample_row[col_idx]).strip()
                    if "-" in val and len(val) >= 3:
                        if col_idx not in [
                            col_mapping["seat_number"],
                            col_mapping["enrollment_number"],
                            col_mapping["name"],
                        ]:
                            col_mapping["scheme"] = col_idx
                            break

        # If subjects not found, look for comma separated codes
        if col_mapping["subject_appearing_for"] is None:
            if sample_row is not None:
                for col_idx in range(min(num_cols, 8)):
                    val = str(sample_row[col_idx]).strip()
                    if "," in val and ("ESE" in val or "SA" in val):
                        if col_idx not in [
                            col_mapping["seat_number"],
                            col_mapping["enrollment_number"],
                            col_mapping["name"],
                            col_mapping["scheme"],
                        ]:
                            col_mapping["subject_appearing_for"] = col_idx
                            break

        logger.info(f"Column mapping: {col_mapping}")

        # ============================================================
        # STEP 4: Extract data
        # ============================================================
        clean_data = []
        seen_seats = set()
        invalid_count = 0

        for idx in range(data_start_row, len(df)):
            row = df.iloc[idx]

            # Skip empty rows
            if not any(str(c).strip() for c in row):
                continue

            seat_idx = col_mapping.get("seat_number")
            if seat_idx is None or seat_idx >= len(row):
                continue

            seat_value = str(row[seat_idx]).strip()
            if not seat_value:
                continue

            # Extract seat number - handle both integer and string formats
            try:
                # Clean the seat value
                seat_clean = re.sub(r"[^0-9]", "", seat_value)
                if not seat_clean:
                    continue
                seat_num = int(seat_clean)
                if seat_num > 999999 or seat_num < 1:
                    continue
                # Skip if seat number is too small (likely an SR number that was mis-detected)
                if seat_num < 1000 and col_mapping.get("sr_number") is None:
                    # Check if this row might be an SR number
                    continue
            except (ValueError, TypeError):
                continue

            # Skip duplicate seats
            if seat_num in seen_seats:
                continue
            seen_seats.add(seat_num)

            # Extract enrollment
            enroll_idx = col_mapping.get("enrollment_number")
            enrollment = ""
            if enroll_idx is not None and enroll_idx < len(row):
                enrollment = str(row[enroll_idx]).strip()
                if enrollment in ["nan", "None", ""]:
                    enrollment = ""
                enrollment = re.sub(r"[^0-9]", "", enrollment)

            # Extract name
            name_idx = col_mapping.get("name")
            name = ""
            if name_idx is not None and name_idx < len(row):
                name = str(row[name_idx]).strip()
                if name in ["nan", "None", ""]:
                    name = ""
                name = " ".join(name.split())

            # Extract scheme
            scheme_idx = col_mapping.get("scheme")
            scheme = ""
            if scheme_idx is not None and scheme_idx < len(row):
                scheme = str(row[scheme_idx]).strip()
                if scheme in ["nan", "None", ""]:
                    scheme = ""

            # Extract subjects
            subject_idx = col_mapping.get("subject_appearing_for")
            subjects = ""
            if subject_idx is not None and subject_idx < len(row):
                subjects = str(row[subject_idx]).strip()
                if subjects in ["nan", "None", ""]:
                    subjects = ""
                # Clean up subjects
                subjects = re.sub(r"\s*,\s*", ",", subjects)
                subjects = re.sub(r",+", ",", subjects)

            # Skip if no meaningful data
            if not name and not enrollment and not subjects:
                invalid_count += 1
                continue

            clean_data.append(
                {
                    "Seat Number": str(seat_num),
                    "Enrollment Number": enrollment,
                    "Name": name,
                    "Scheme": scheme,
                    "Subject Appearing For": subjects,
                }
            )

        if not clean_data:
            logger.warning(f"No valid data rows extracted. Invalid: {invalid_count}")
            return content

        # ============================================================
        # STEP 5: Create clean DataFrame and save
        # ============================================================
        clean_df = pd.DataFrame(clean_data)

        # Ensure columns are in the right order
        column_order = [
            "Seat Number",
            "Enrollment Number",
            "Name",
            "Scheme",
            "Subject Appearing For",
        ]
        clean_df = clean_df[column_order]

        output = io.BytesIO()
        with pd.ExcelWriter(output, engine="openpyxl") as writer:
            clean_df.to_excel(writer, sheet_name="Seating Chart", index=False)

        logger.info(f"Successfully sanitized seating chart: {len(clean_data)} rows extracted")
        return output.getvalue()

    except Exception as e:
        logger.error(f"Error sanitizing seating chart: {e}")
        import traceback

        traceback.print_exc()
        return content


# ============================================================
# STRICT validation function
# ============================================================


def _validate_seating_chart_file(content: bytes) -> Tuple[bool, Optional[bytes], Optional[str]]:
    """Validate seating chart Excel file - STRICT validation"""
    try:
        from io import BytesIO

        import pandas as pd

        # Sanitize first
        sanitized = sanitize_seating_chart_excel(content)

        # Verify sanitized data with STRICT checks
        try:
            df = pd.read_excel(BytesIO(sanitized), dtype=str).fillna("")

            if df.empty:
                return False, content, "No data after sanitization"

            # Check columns
            actual_cols = [str(c).strip() for c in df.columns]

            # We need at least Seat Number and one of Name/Enrollment/Subjects
            has_seat = "Seat Number" in actual_cols
            has_name = "Name" in actual_cols
            has_enroll = "Enrollment Number" in actual_cols
            has_subject = "Subject Appearing For" in actual_cols

            if not has_seat:
                return False, content, "Missing 'Seat Number' column"

            if not (has_name or has_enroll or has_subject):
                return False, content, "Need at least Name, Enrollment, or Subject columns"

            # Count valid rows (must have at least one seat number)
            valid_rows = 0
            for _, row in df.iterrows():
                seat = str(row.get("Seat Number", "")).strip()
                if seat and seat.isdigit():
                    valid_rows += 1

            if valid_rows == 0:
                return False, content, "No valid seating records found (seat numbers required)"

            logger.info(f"Seating chart validated: {valid_rows} rows found")
            return True, sanitized, None

        except Exception as e:
            logger.error(f"Seating chart validation error: {e}")
            return False, content, f"Validation failed: {str(e)}"

    except Exception as e:
        logger.error(f"Seating chart validation error: {e}")
        return False, content, f"Seating chart validation failed: {str(e)}"


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
    """Standard success response"""
    return {"success": True, "message": message, "data": data, "error": None}


def error_response(message: str, error: str = None, status_code: int = 400) -> tuple:
    """Standard error response"""
    return {
        "success": False,
        "message": message,
        "data": None,
        "error": error or message,
    }, status_code
