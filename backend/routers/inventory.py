# backend/routers/inventory.py - FIXED VERSION

import logging
import os
import re
from typing import Dict, List, Optional

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth import get_exam_center_id
from config import db, settings
from utils import success_response

router = APIRouter(prefix="/inventory", tags=["inventory"])
logger = logging.getLogger(__name__)


# ============================================================================
# Pydantic Models
# ============================================================================


class ProcessInventoryRequest(BaseModel):
    stored_filename: str


# ============================================================================
# Inventory Processor
# ============================================================================


class InventoryProcessor:
    """Process inventory from uploaded Excel files"""

    def __init__(self, exam_center_id: str):
        self.exam_center_id = exam_center_id

    def _get_uploaded_file(self, stored_filename: str) -> Optional[Dict]:
        """Get a specific uploaded inventory file by stored_filename"""
        result = db.execute_query(
            """
            SELECT stored_filename, status, original_filename
            FROM uploads
            WHERE exam_center_id = :exam_center_id 
                AND file_type = 'inventory'
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

    def _sanitize_paper_code(self, code: str) -> str:
        """Clean paper code by removing spaces, special characters, and standardizing"""
        if not code:
            return ""
        # Remove extra spaces
        code = code.strip()
        # Remove hyphens and special chars
        code = re.sub(r"[^a-zA-Z0-9]", "", code)
        return code.upper()

    def _get_timetable_date_session(self, paper_code: str) -> Optional[Dict]:
        """Get date and session for a paper code from timetable"""
        # Try exact match first
        result = db.execute_query(
            """
            SELECT date, session, subject_code, scheme
            FROM timetable
            WHERE exam_center_id = :exam_center_id 
                AND subject_code = :paper_code
            LIMIT 1
        """,
            {"exam_center_id": self.exam_center_id, "paper_code": paper_code},
        )

        if result:
            return {
                "date": result[0]["date"],
                "session": result[0]["session"],
                "subject_code": result[0]["subject_code"],
                "scheme": result[0]["scheme"],
            }

        # Try sanitized match (remove hyphens)
        sanitized = self._sanitize_paper_code(paper_code)
        result = db.execute_query(
            """
            SELECT date, session, subject_code, scheme
            FROM timetable
            WHERE exam_center_id = :exam_center_id 
                AND REPLACE(subject_code, '-', '') = :sanitized
            LIMIT 1
        """,
            {"exam_center_id": self.exam_center_id, "sanitized": sanitized},
        )

        if result:
            return {
                "date": result[0]["date"],
                "session": result[0]["session"],
                "subject_code": result[0]["subject_code"],
                "scheme": result[0]["scheme"],
            }

        # Try partial match (if paper_code contains subject_code)
        result = db.execute_query(
            """
            SELECT date, session, subject_code, scheme
            FROM timetable
            WHERE exam_center_id = :exam_center_id 
                AND :paper_code LIKE '%' || subject_code || '%'
            LIMIT 1
        """,
            {"exam_center_id": self.exam_center_id, "paper_code": paper_code},
        )

        if result:
            return {
                "date": result[0]["date"],
                "session": result[0]["session"],
                "subject_code": result[0]["subject_code"],
                "scheme": result[0]["scheme"],
            }

        logger.warning(f"No timetable entry found for paper code: {paper_code}")
        return None

    def _parse_excel_file(self, file_path: str) -> List[Dict]:
        """Parse inventory Excel file - handles both sanitized and raw MSBTE format"""
        try:
            # First try to read with headers (sanitized format)
            df = pd.read_excel(file_path, dtype=str).fillna("")

            # Check if this is sanitized (has clean columns)
            clean_columns = ["Region", "DC", "EC", "DAY", "SESSION", "PAPER_CODE"]
            actual_columns = [str(c).strip() for c in df.columns]

            # If sanitized, parse directly
            if all(any(h in col for col in actual_columns) for h in clean_columns):
                items = []
                for _, row in df.iterrows():
                    paper_code = str(row.get("PAPER_CODE", "")).strip()
                    if not paper_code or paper_code in ["nan", "None", ""]:
                        continue

                    # Skip summary rows
                    if any(k in paper_code.lower() for k in ["total", "certify", "signature"]):
                        continue

                    # Get timetable info for this paper code
                    timetable_info = self._get_timetable_date_session(paper_code)

                    def parse_int(val):
                        try:
                            cleaned = str(val).strip().replace(",", "").replace(" ", "")
                            if cleaned in ["nan", "None", "", "-"]:
                                return 0
                            return int(float(cleaned))
                        except (ValueError, TypeError):
                            return 0

                    items.append(
                        {
                            "region": str(row.get("Region", "")).strip(),
                            "dc": str(row.get("DC", "")).strip(),
                            "ec": str(row.get("EC", "")).strip(),
                            "day": (
                                int(str(row.get("DAY", "0")).strip())
                                if str(row.get("DAY", "0")).strip().isdigit()
                                else 0
                            ),
                            "session": str(row.get("SESSION", "M")).strip().upper(),
                            "paper_code": paper_code,
                            "no_of_candidates": parse_int(row.get("No_of_Candidates", 0)),
                            "no_of_packets_required": parse_int(
                                row.get("No_of_Packets_Required", 0)
                            ),
                            "total_packets_session": parse_int(row.get("Total_Packets_Session", 0)),
                            "total_packets_day": parse_int(row.get("Total_Packets_Day", 0)),
                            "timetable_date": timetable_info["date"] if timetable_info else None,
                            "timetable_session": (
                                timetable_info["session"] if timetable_info else None
                            ),
                            "subject_code": (
                                timetable_info["subject_code"] if timetable_info else paper_code
                            ),
                            "scheme": timetable_info["scheme"] if timetable_info else "",
                        }
                    )

                logger.info(f"Parsed {len(items)} items from sanitized file")
                return items

            # Otherwise parse raw MSBTE format
            df_raw = pd.read_excel(file_path, header=None, dtype=str).fillna("")

            # Find header row
            header_row_idx = None
            expected_headers = [
                "Region",
                "DC",
                "EC",
                "DAY",
                "SESSION",
                "PAPER CODE",
                "No. of Candidate",
                "No. of packets Required",
            ]

            for idx in range(min(20, len(df_raw))):
                row_values = [str(v).strip() for v in df_raw.iloc[idx].values if str(v).strip()]
                header_matches = sum(
                    1
                    for h in expected_headers
                    if any(h.lower() in str(v).lower() for v in row_values)
                )
                if header_matches >= 4:
                    header_row_idx = idx
                    logger.info(f"Found header row at index {idx}")
                    break

            if header_row_idx is None:
                raise ValueError("Could not find header row in the file")

            # Map columns
            header_row = df_raw.iloc[header_row_idx].values
            header_mapping = {}

            for idx, val in enumerate(header_row):
                val_str = str(val).strip().lower()
                if "region" in val_str:
                    header_mapping["region"] = idx
                elif "dc" in val_str:
                    header_mapping["dc"] = idx
                elif "ec" in val_str:
                    header_mapping["ec"] = idx
                elif "day" in val_str:
                    header_mapping["day"] = idx
                elif "session" in val_str:
                    header_mapping["session"] = idx
                elif "paper" in val_str:
                    header_mapping["paper_code"] = idx
                elif "candidate" in val_str:
                    header_mapping["no_of_candidates"] = idx
                elif "packets required" in val_str:
                    header_mapping["no_of_packets_required"] = idx

            required = ["region", "dc", "ec", "day", "session", "paper_code"]
            for req in required:
                if req not in header_mapping:
                    raise ValueError(f"Required column '{req}' not found")

            items = []
            for idx in range(header_row_idx + 1, len(df_raw)):
                row = df_raw.iloc[idx]

                if all(str(v).strip() in ["", "nan", "None"] for v in row.values):
                    continue

                paper_code = str(row[header_mapping["paper_code"]]).strip()
                if not paper_code or paper_code in ["nan", "None", ""]:
                    continue
                if "total" in paper_code.lower() or "certify" in paper_code.lower():
                    continue

                # Get timetable info for this paper code
                timetable_info = self._get_timetable_date_session(paper_code)

                def parse_int(val):
                    try:
                        cleaned = str(val).strip().replace(",", "").replace(" ", "")
                        if cleaned in ["nan", "None", "", "-"]:
                            return 0
                        return int(float(cleaned))
                    except (ValueError, TypeError):
                        return 0

                items.append(
                    {
                        "region": str(row[header_mapping["region"]]).strip(),
                        "dc": str(row[header_mapping["dc"]]).strip(),
                        "ec": str(row[header_mapping["ec"]]).strip(),
                        "day": (
                            int(str(row[header_mapping["day"]]).strip())
                            if str(row[header_mapping["day"]]).strip().isdigit()
                            else 0
                        ),
                        "session": str(row[header_mapping["session"]]).strip().upper(),
                        "paper_code": paper_code,
                        "no_of_candidates": (
                            parse_int(row[header_mapping["no_of_candidates"]])
                            if "no_of_candidates" in header_mapping
                            else 0
                        ),
                        "no_of_packets_required": (
                            parse_int(row[header_mapping["no_of_packets_required"]])
                            if "no_of_packets_required" in header_mapping
                            else 0
                        ),
                        "total_packets_session": 0,
                        "total_packets_day": 0,
                        "timetable_date": timetable_info["date"] if timetable_info else None,
                        "timetable_session": timetable_info["session"] if timetable_info else None,
                        "subject_code": (
                            timetable_info["subject_code"] if timetable_info else paper_code
                        ),
                        "scheme": timetable_info["scheme"] if timetable_info else "",
                    }
                )

            logger.info(f"Parsed {len(items)} items from raw file")
            return items

        except Exception as e:
            logger.error(f"Error parsing inventory file: {e}")
            import traceback

            traceback.print_exc()
            return []

    def _insert_inventory_items(self, items: List[Dict]) -> Dict:
        """Insert inventory items into qpInventory table with proper date from timetable"""

        db.execute_update(
            """
            DELETE FROM qp_inventory 
            WHERE exam_center_id = :exam_center_id
        """,
            {"exam_center_id": self.exam_center_id},
        )

        inserted = 0
        skipped_no_timetable = 0

        for item in items:
            # Skip items without timetable info (can't determine date/session)
            if not item.get("timetable_date"):
                logger.warning(f"Skipping {item['paper_code']} - no timetable found")
                skipped_no_timetable += 1
                continue

            db.execute_update(
                """
                INSERT INTO qp_inventory (
                    exam_center_id,
                    day,
                    date,
                    session,
                    subject_code,
                    expected_students,
                    expected_packets
                ) VALUES (
                    :exam_center_id,
                    :day,
                    :date,
                    :session,
                    :paper_code,
                    :no_of_candidates,
                    :no_of_packets_required
                )
            """,
                {
                    "exam_center_id": self.exam_center_id,
                    "day": item["day"],
                    "date": item["timetable_date"],  # ✅ Use date from timetable
                    "session": item["timetable_session"],  # ✅ Use session from timetable
                    "paper_code": item["paper_code"],
                    "no_of_candidates": item["no_of_candidates"],
                    "no_of_packets_required": item["no_of_packets_required"],
                },
            )
            inserted += 1

        logger.info(f"Inserted {inserted}, Skipped {skipped_no_timetable} (no timetable)")
        return {"inserted": inserted, "total": len(items), "skipped": skipped_no_timetable}

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
            WHERE exam_center_id = :exam_center_id AND file_type = 'inventory' AND stored_filename = :stored_filename
        """,
            {"exam_center_id": self.exam_center_id, "stored_filename": stored_filename},
        )

        # Parse file
        items = self._parse_excel_file(upload["file_path"])

        if not items:
            db.execute_update(
                """
                UPDATE uploads SET status = 'FAILED', error_message = 'No valid inventory data found', updated_at = NOW()
                WHERE exam_center_id = :exam_center_id AND file_type = 'inventory' AND stored_filename = :stored_filename
            """,
                {"exam_center_id": self.exam_center_id, "stored_filename": stored_filename},
            )
            return {"success": False, "error": "No valid inventory data found in file"}

        # Insert items into qp_inventory
        stats = self._insert_inventory_items(items)

        # Update status to PROCESSED
        db.execute_update(
            """
            UPDATE uploads SET status = 'PROCESSED', record_count = :count, processed_at = NOW(), updated_at = NOW()
            WHERE exam_center_id = :exam_center_id AND file_type = 'inventory' AND stored_filename = :stored_filename
        """,
            {
                "count": stats["inserted"],
                "exam_center_id": self.exam_center_id,
                "stored_filename": stored_filename,
            },
        )

        logger.info(
            f"Inventory processed: {stats['inserted']} items for exam center {self.exam_center_id}"
        )

        return {
            "success": True,
            "message": "Inventory processed successfully",
            "data": {
                "total_items": stats["total"],
                "inserted": stats["inserted"],
                "skipped": stats.get("skipped", 0),
                "exam_center_id": self.exam_center_id,
                "stored_filename": stored_filename,
            },
        }


# ============================================================================
# API Endpoint - ONLY PROCESS
# ============================================================================


@router.post("/process")
async def process_inventory(
    request: ProcessInventoryRequest, exam_center_id: str = Depends(get_exam_center_id)
):
    """Process a specific uploaded inventory file"""
    processor = InventoryProcessor(exam_center_id)
    result = processor.process(request.stored_filename)

    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])

    return success_response(data=result.get("data"), message=result["message"])
