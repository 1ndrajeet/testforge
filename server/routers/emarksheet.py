# backend/routers/emarksheet.py - OPTIMIZED FOR NEONDB FREE TIER

import json
import logging
import os
import time
from typing import Dict, List, Optional

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth import get_exam_center_id
from config import db, settings
from utils import success_response

router = APIRouter(prefix="/emarksheet", tags=["emarksheet"])
logger = logging.getLogger(__name__)


# ============================================================================
# Pydantic Models
# ============================================================================


class ProcessEMarksheetRequest(BaseModel):
    stored_filename: str


# ============================================================================
# E-Marksheet Processor - OPTIMIZED
# ============================================================================


class EMarksheetProcessor:
    """Process E-Marksheet from uploaded Excel files with NeonDB optimizations"""

    BATCH_SIZE = 250  # ✅ Same as other processors

    def __init__(self, exam_center_id: str):
        self.exam_center_id = exam_center_id

    def _get_uploaded_file(self, stored_filename: str) -> Optional[Dict]:
        """Get a specific uploaded emarksheet file by stored_filename"""
        result = db.execute_query(
            """
            SELECT stored_filename, status, original_filename
            FROM uploads
            WHERE exam_center_id = :exam_center_id 
                AND file_type = 'emarksheet'
                AND stored_filename = :stored_filename
            """,
            {"exam_center_id": self.exam_center_id, "stored_filename": stored_filename},
        )

        if not result:
            return None

        file_path = os.path.join(settings.UPLOAD_DIR, result[0]["stored_filename"])
        return {
            "stored_filename": result[0]["stored_filename"],
            "file_path": file_path,
            "status": result[0]["status"],
            "original_filename": result[0]["original_filename"],
        }

    def _parse_int(self, val) -> int:
        """Safely parse integer from various formats"""
        try:
            cleaned = str(val).strip().replace(",", "").replace(" ", "")
            if cleaned in ["nan", "None", "", "-", "nan"]:
                return 0
            return int(float(cleaned))
        except (ValueError, TypeError):
            return 0

    def _parse_excel_file(self, file_path: str) -> List[Dict]:
        """Parse E-Marksheet Excel file"""
        try:
            # Try reading with headers first
            df = pd.read_excel(file_path, dtype=str).fillna("")

            logger.info(f"E-Marksheet file columns: {list(df.columns)}")

            # Check if this looks like a sanitized file
            expected_columns = ["Sheet No.", "Subject Name", "Scheme", "Subject Head", "Paper Code", "File Name"]
            actual_columns = [str(c).strip() for c in df.columns]
            
            # Check if we have the expected columns
            has_expected = all(any(exp in col for col in actual_columns) for exp in expected_columns[:3])

            items = []
            
            if has_expected:
                # Sanitized format - parse directly
                for _, row in df.iterrows():
                    sheet_no = str(row.get("Sheet No.", "")).strip()
                    if not sheet_no or sheet_no in ["nan", "None", ""]:
                        continue

                    if any(k in sheet_no.lower() for k in ["total", "certify", "signature"]):
                        continue

                    items.append({
                        "sheet_no": sheet_no,
                        "subject_name": str(row.get("Subject Name", "")).strip(),
                        "scheme": str(row.get("Scheme", "")).strip(),
                        "subject_head": str(row.get("Subject Head", "")).strip(),
                        "paper_code": str(row.get("Paper Code", "")).strip(),
                        "file_name": str(row.get("File Name", "")).strip(),
                    })
            else:
                # Raw format - try to find header row
                df_raw = pd.read_excel(file_path, header=None, dtype=str).fillna("")
                
                # Find header row
                header_row_idx = None
                expected_headers = ["Sheet No.", "Subject Name", "Scheme", "Subject Head", "Paper Code", "File Name"]
                
                for idx in range(min(20, len(df_raw))):
                    row_values = [str(v).strip() for v in df_raw.iloc[idx].values if str(v).strip()]
                    header_matches = sum(
                        1 for h in expected_headers
                        if any(h.lower() in str(v).lower() for v in row_values)
                    )
                    if header_matches >= 3:
                        header_row_idx = idx
                        logger.info(f"Found E-Marksheet header row at index {idx}")
                        break
                
                if header_row_idx is None:
                    # Try using first row as header if it looks reasonable
                    first_row = [str(v).strip().lower() for v in df_raw.iloc[0].values]
                    if any("sheet" in v for v in first_row) and any("subject" in v for v in first_row):
                        header_row_idx = 0
                        logger.info("Using first row as header")
                    else:
                        raise ValueError("Could not find header row in the file")
                
                # Map columns
                header_row = df_raw.iloc[header_row_idx].values
                header_mapping = {}
                
                for idx, val in enumerate(header_row):
                    val_str = str(val).strip().lower()
                    if "sheet" in val_str:
                        header_mapping["sheet_no"] = idx
                    elif "subject" in val_str and "name" in val_str:
                        header_mapping["subject_name"] = idx
                    elif "scheme" in val_str:
                        header_mapping["scheme"] = idx
                    elif "subject" in val_str and "head" in val_str:
                        header_mapping["subject_head"] = idx
                    elif "paper" in val_str and "code" in val_str:
                        header_mapping["paper_code"] = idx
                    elif "file" in val_str and "name" in val_str:
                        header_mapping["file_name"] = idx
                
                # Extract data
                for idx in range(header_row_idx + 1, len(df_raw)):
                    row = df_raw.iloc[idx]
                    
                    if all(str(v).strip() in ["", "nan", "None"] for v in row.values):
                        continue
                    
                    sheet_no = str(row[header_mapping["sheet_no"]]).strip() if "sheet_no" in header_mapping else ""
                    if not sheet_no or sheet_no in ["nan", "None", ""]:
                        continue
                    
                    if any(k in sheet_no.lower() for k in ["total", "certify", "signature"]):
                        continue
                    
                    items.append({
                        "sheet_no": sheet_no,
                        "subject_name": str(row[header_mapping["subject_name"]]).strip() if "subject_name" in header_mapping else "",
                        "scheme": str(row[header_mapping["scheme"]]).strip() if "scheme" in header_mapping else "",
                        "subject_head": str(row[header_mapping["subject_head"]]).strip() if "subject_head" in header_mapping else "",
                        "paper_code": str(row[header_mapping["paper_code"]]).strip() if "paper_code" in header_mapping else "",
                        "file_name": str(row[header_mapping["file_name"]]).strip() if "file_name" in header_mapping else "",
                    })

            logger.info(f"Parsed {len(items)} E-Marksheet items from {file_path}")
            return items

        except Exception as e:
            logger.error(f"Error parsing E-Marksheet file {file_path}: {e}")
            import traceback
            traceback.print_exc()
            return []

    # ============================================================
    # ✅ OPTIMIZED: Batch Insert E-Marksheet Items
    # ============================================================

    def _insert_emarksheet_items(self, items: List[Dict]) -> Dict:
        """
        ✅ OPTIMIZED: Batch insert E-Marksheet items
        """
        if not items:
            return {"inserted": 0, "total": 0}

        # ✅ Set statement timeout
        db.execute_update("SET LOCAL statement_timeout = '60s'")

        # Delete existing entries for this exam center
        db.execute_update(
            """
            DELETE FROM e_marksheets 
            WHERE exam_center_id = :exam_center_id
            """,
            {"exam_center_id": self.exam_center_id},
        )

        inserted = 0
        total = len(items)
        batch_size = self.BATCH_SIZE

        logger.info(f"Inserting {total} E-Marksheet items in batches of {batch_size}")

        # Process in batches
        for i in range(0, total, batch_size):
            batch = items[i:i + batch_size]
            batch_start = time.time()

            # ✅ Build batch INSERT
            values = []
            params = {}

            for idx, item in enumerate(batch):
                values.append(f"""
                    (:ec_{idx}, :sheet_{idx}, :subname_{idx}, :scheme_{idx}, 
                     :subhead_{idx}, :paper_{idx}, :file_{idx}, NOW())
                """)

                params[f"ec_{idx}"] = self.exam_center_id
                params[f"sheet_{idx}"] = item.get("sheet_no", "")
                params[f"subname_{idx}"] = item.get("subject_name", "")
                params[f"scheme_{idx}"] = item.get("scheme", "")
                params[f"subhead_{idx}"] = item.get("subject_head", "")
                params[f"paper_{idx}"] = item.get("paper_code", "")
                params[f"file_{idx}"] = item.get("file_name", "")

            if values:
                query = f"""
                    INSERT INTO e_marksheets (
                        exam_center_id, sheet_no, subject_name, scheme,
                        subject_head, paper_code, file_name, processed_at
                    ) VALUES {','.join(values)}
                """
                db.execute_update(query, params)
                inserted += len(batch)

            batch_duration = time.time() - batch_start
            logger.debug(f"Batch {i//batch_size + 1}: inserted {len(batch)} items in {batch_duration:.2f}s")

            if i + batch_size < total:
                time.sleep(0.05)

        logger.info(f"Inserted {inserted} E-Marksheet items")
        return {"inserted": inserted, "total": total}

    def process(self, stored_filename: str) -> Dict:
        """Main processing function"""
        start_time = time.time()

        upload = self._get_uploaded_file(stored_filename)
        if not upload:
            return {"success": False, "error": f"File not found: {stored_filename}"}

        if not os.path.exists(upload["file_path"]):
            return {"success": False, "error": f"File not found on server: {stored_filename}"}

        # Update status to PROCESSING
        db.execute_update(
            """
            UPDATE uploads SET status = 'PROCESSING', updated_at = NOW()
            WHERE exam_center_id = :exam_center_id AND file_type = 'emarksheet' AND stored_filename = :stored_filename
            """,
            {"exam_center_id": self.exam_center_id, "stored_filename": stored_filename},
        )

        try:
            # Parse file
            parse_start = time.time()
            items = self._parse_excel_file(upload["file_path"])
            parse_duration = time.time() - parse_start
            logger.info(f"Parsed {len(items)} items in {parse_duration:.2f}s")

            if not items:
                db.execute_update(
                    """
                    UPDATE uploads SET status = 'FAILED', error_message = 'No valid E-Marksheet data found', updated_at = NOW()
                    WHERE exam_center_id = :exam_center_id AND file_type = 'emarksheet' AND stored_filename = :stored_filename
                    """,
                    {"exam_center_id": self.exam_center_id, "stored_filename": stored_filename},
                )
                return {"success": False, "error": "No valid E-Marksheet data found in file"}

            # Insert items
            insert_start = time.time()
            stats = self._insert_emarksheet_items(items)
            insert_duration = time.time() - insert_start
            logger.info(f"Inserted items in {insert_duration:.2f}s")

            # Update status to PROCESSED
            db.execute_update(
                """
                UPDATE uploads SET status = 'PROCESSED', record_count = :count, processed_at = NOW(), updated_at = NOW()
                WHERE exam_center_id = :exam_center_id AND file_type = 'emarksheet' AND stored_filename = :stored_filename
                """,
                {
                    "count": stats["total"],
                    "exam_center_id": self.exam_center_id,
                    "stored_filename": stored_filename,
                },
            )

            total_duration = time.time() - start_time
            logger.info(
                f"E-Marksheet processed in {total_duration:.2f}s: {stats['inserted']} items"
            )

            return {
                "success": True,
                "message": "E-Marksheet processed successfully",
                "data": {
                    "total_items": stats["total"],
                    "inserted": stats["inserted"],
                    "exam_center_id": self.exam_center_id,
                    "stored_filename": stored_filename,
                    "processing_time_seconds": round(total_duration, 2),
                },
            }

        except Exception as e:
            logger.error(f"E-Marksheet processing failed: {e}")
            import traceback
            traceback.print_exc()

            db.execute_update(
                """
                UPDATE uploads SET status = 'FAILED', error_message = :error, updated_at = NOW()
                WHERE exam_center_id = :exam_center_id AND file_type = 'emarksheet' AND stored_filename = :stored_filename
                """,
                {"error": str(e), "exam_center_id": self.exam_center_id, "stored_filename": stored_filename},
            )
            return {"success": False, "error": f"Processing failed: {str(e)}"}


# ============================================================================
# API Endpoint
# ============================================================================


@router.post("/process")
async def process_emarksheet(
    request: ProcessEMarksheetRequest, exam_center_id: str = Depends(get_exam_center_id)
):
    """Process a specific uploaded E-Marksheet file"""
    processor = EMarksheetProcessor(exam_center_id)
    result = processor.process(request.stored_filename)

    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])

    return success_response(data=result.get("data"), message=result["message"])