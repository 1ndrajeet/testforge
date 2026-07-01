# backend/routers/emarksheet.py - E-MARKSHEET MODULE (PROCESS ONLY)

import logging
import os
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
# E-Marksheet Processor
# ============================================================================


class EMarksheetProcessor:
    """Process E-Marksheet from uploaded Excel files"""

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

    def _parse_excel_file(self, file_path: str) -> List[Dict]:
        """Parse E-Marksheet Excel file"""
        try:
            df = pd.read_excel(file_path, dtype=str).fillna("")

            logger.info(f"E-Marksheet file columns: {list(df.columns)}")

            items = []
            for _, row in df.iterrows():
                sheet_no = str(row.get("Sheet No.", "")).strip()
                if not sheet_no or sheet_no in ["nan", "None", ""]:
                    continue

                # Skip summary rows
                if any(k in sheet_no.lower() for k in ["total", "certify", "signature"]):
                    continue

                items.append(
                    {
                        "sheet_no": sheet_no,
                        "subject_name": str(row.get("Subject Name", "")).strip(),
                        "scheme": str(row.get("Scheme", "")).strip(),
                        "subject_head": str(row.get("Subject Head", "")).strip(),
                        "paper_code": str(row.get("Paper Code", "")).strip(),
                        "file_name": str(row.get("File Name", "")).strip(),
                    }
                )

            logger.info(f"Parsed {len(items)} E-Marksheet items from {file_path}")
            return items

        except Exception as e:
            logger.error(f"Error parsing E-Marksheet file {file_path}: {e}")
            import traceback

            traceback.print_exc()
            return []

    def _insert_emarksheet_items(self, items: List[Dict]) -> Dict:
        """Insert E-Marksheet items into eMarksheets table"""

        # First, delete existing emarksheet entries for this exam center
        db.execute_update(
            """
            DELETE FROM e_marksheets 
            WHERE exam_center_id = :exam_center_id
        """,
            {"exam_center_id": self.exam_center_id},
        )

        inserted = 0
        for item in items:
            db.execute_update(
                """
                INSERT INTO e_marksheets (
                    exam_center_id,
                    sheet_no,
                    subject_name,
                    scheme,
                    subject_head,
                    paper_code,
                    file_name,
                    processed_at
                ) VALUES (
                    :exam_center_id,
                    :sheet_no,
                    :subject_name,
                    :scheme,
                    :subject_head,
                    :paper_code,
                    :file_name,
                    NOW()
                )
            """,
                {
                    "exam_center_id": self.exam_center_id,
                    "sheet_no": item["sheet_no"],
                    "subject_name": item["subject_name"],
                    "scheme": item["scheme"],
                    "subject_head": item["subject_head"],
                    "paper_code": item["paper_code"],
                    "file_name": item["file_name"],
                },
            )
            inserted += 1

        return {"inserted": inserted, "total": len(items)}

    def process(self, stored_filename: str) -> Dict:
        """Main processing function"""

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

        # Parse file
        items = self._parse_excel_file(upload["file_path"])

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
        stats = self._insert_emarksheet_items(items)

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

        logger.info(
            f"E-Marksheet processed: {stats['inserted']} items for exam center {self.exam_center_id}"
        )

        return {
            "success": True,
            "message": "E-Marksheet processed successfully",
            "data": {
                "total_items": stats["total"],
                "inserted": stats["inserted"],
                "exam_center_id": self.exam_center_id,
                "stored_filename": stored_filename,
            },
        }


# ============================================================================
# API Endpoint - ONLY PROCESS
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
