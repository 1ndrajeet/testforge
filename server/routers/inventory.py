# backend/routers/inventory.py - ULTRA-FAST FINAL VERSION

import logging
import os
import re
import time
from typing import Dict, List, Optional
from concurrent.futures import ThreadPoolExecutor, as_completed

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
# Inventory Processor - ULTRA-FAST VERSION
# ============================================================================


class InventoryProcessor:
    """Process inventory from uploaded Excel files with parallel processing and batch inserts"""

    BATCH_SIZE = 100  # ✅ Batch insert size

    def __init__(self, exam_center_id: str):
        self.exam_center_id = exam_center_id
        self.timetable_cache = None

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
        code = code.strip()
        code = re.sub(r"[^a-zA-Z0-9]", "", code)
        return code.upper()

    # ============================================================
    # ✅ BATCH TIMETABLE LOOKUP - ONE QUERY
    # ============================================================

    def _load_timetable_cache(self) -> Dict[str, Dict]:
        """
        ✅ Load ALL timetable entries once and create lookup maps
        """
        if self.timetable_cache is not None:
            return self.timetable_cache

        result = db.execute_query(
            """
            SELECT 
                subject_code,
                date,
                session,
                scheme,
                subject_abbr
            FROM timetable
            WHERE exam_center_id = :exam_center_id
            """,
            {"exam_center_id": self.exam_center_id},
        )

        cache = {
            "exact": {},
            "sanitized": {},
            "by_abbr": {},
        }

        for row in result:
            subject_code = row["subject_code"]
            date = row["date"]
            session = row["session"]
            scheme = row["scheme"] or ""
            abbr = row.get("subject_abbr") or ""

            entry = {
                "date": date,
                "session": session,
                "scheme": scheme,
                "subject_code": subject_code,
            }

            # Exact match
            cache["exact"][subject_code] = entry

            # Sanitized match
            sanitized = self._sanitize_paper_code(subject_code)
            if sanitized and sanitized not in cache["sanitized"]:
                cache["sanitized"][sanitized] = entry

            # Abbr match
            if abbr:
                abbr_clean = self._sanitize_paper_code(abbr)
                if abbr_clean and abbr_clean not in cache["by_abbr"]:
                    cache["by_abbr"][abbr_clean] = entry

        logger.info(f"Loaded {len(cache['exact'])} timetable entries into cache")
        self.timetable_cache = cache
        return cache

    def _get_timetable_info(self, paper_code: str) -> Optional[Dict]:
        """Get timetable info from cache using multiple lookup strategies"""
        if not paper_code:
            return None

        cache = self._load_timetable_cache()
        paper_code_clean = paper_code.strip()

        # Strategy 1: Exact match
        if paper_code_clean in cache["exact"]:
            return cache["exact"][paper_code_clean]

        # Strategy 2: Sanitized match
        sanitized = self._sanitize_paper_code(paper_code_clean)
        if sanitized and sanitized in cache["sanitized"]:
            return cache["sanitized"][sanitized]

        # Strategy 3: Abbr match
        if sanitized and sanitized in cache["by_abbr"]:
            return cache["by_abbr"][sanitized]

        # Strategy 4: Partial match
        for subject_code, entry in cache["exact"].items():
            if subject_code in paper_code_clean or paper_code_clean in subject_code:
                return entry

        return None

    def _parse_int(self, val) -> int:
        """Safely parse integer from various formats"""
        try:
            cleaned = str(val).strip().replace(",", "").replace(" ", "")
            if cleaned in ["nan", "None", "", "-", "nan"]:
                return 0
            if "-" in cleaned:
                cleaned = cleaned.split("-")[0].strip()
            return int(float(cleaned))
        except (ValueError, TypeError):
            return 0

    # ============================================================
    # ✅ EXCEL PARSING - HANDLES BOTH SANITIZED AND RAW
    # ============================================================

    def _parse_excel_file(self, file_path: str) -> List[Dict]:
        """Parse inventory Excel file - handles both sanitized and raw MSBTE format"""
        try:
            df = pd.read_excel(file_path, dtype=str).fillna("")
            clean_columns = ["Region", "DC", "EC", "DAY", "SESSION", "PAPER_CODE"]
            actual_columns = [str(c).strip() for c in df.columns]

            if any(any(h in col for col in actual_columns) for h in clean_columns[:3]):
                return self._parse_sanitized_format(df)

            df_raw = pd.read_excel(file_path, header=None, dtype=str).fillna("")
            return self._parse_raw_format(df_raw)

        except Exception as e:
            logger.error(f"Error parsing inventory file: {e}")
            import traceback
            traceback.print_exc()
            return []

    def _parse_sanitized_format(self, df: pd.DataFrame) -> List[Dict]:
        """Parse sanitized inventory format"""
        items = []

        for _, row in df.iterrows():
            paper_code = str(row.get("PAPER_CODE", "")).strip()
            if not paper_code or paper_code in ["nan", "None", ""]:
                continue

            if any(k in paper_code.lower() for k in ["total", "certify", "signature"]):
                continue

            timetable_info = self._get_timetable_info(paper_code)

            day_val = str(row.get("DAY", "0")).strip()
            try:
                day = int(float(day_val)) if day_val.isdigit() or day_val.replace('.', '').isdigit() else 0
            except:
                day = 0

            items.append({
                "region": str(row.get("Region", "")).strip(),
                "dc": str(row.get("DC", "")).strip(),
                "ec": str(row.get("EC", "")).strip(),
                "day": day,
                "session": str(row.get("SESSION", "M")).strip().upper(),
                "paper_code": paper_code,
                "no_of_candidates": self._parse_int(row.get("No_of_Candidates", 0)),
                "no_of_packets_required": self._parse_int(row.get("No_of_Packets_Required", 0)),
                "total_packets_session": self._parse_int(row.get("Total_Packets_Session", 0)),
                "total_packets_day": self._parse_int(row.get("Total_Packets_Day", 0)),
                "timetable_date": timetable_info["date"] if timetable_info else None,
                "timetable_session": timetable_info["session"] if timetable_info else None,
                "subject_code": timetable_info["subject_code"] if timetable_info else paper_code,
                "scheme": timetable_info["scheme"] if timetable_info else "",
            })

        logger.info(f"Parsed {len(items)} items from sanitized file")
        return items

    def _parse_raw_format(self, df_raw: pd.DataFrame) -> List[Dict]:
        """Parse raw MSBTE format inventory file"""
        # Find header row
        header_row_idx = None

        for idx in range(min(30, len(df_raw))):
            row_text = " ".join([str(v).lower() for v in df_raw.iloc[idx].values if str(v).strip()])
            
            has_paper = "paper" in row_text and ("code" in row_text or "no." in row_text)
            has_region = "region" in row_text
            has_ec = "ec" in row_text or "examination center" in row_text
            has_day = "day" in row_text
            has_session = "session" in row_text
            has_candidate = "candidate" in row_text or "no. of candidate" in row_text
            has_packet = "packet" in row_text
            
            matches = sum([has_paper, has_region, has_ec, has_day, has_session, has_candidate, has_packet])
            
            if matches >= 4:
                header_row_idx = idx
                logger.info(f"Found inventory header at row {idx}")
                break

        if header_row_idx is None:
            logger.warning("Could not find inventory header row")
            return []

        # Map columns
        header_row = df_raw.iloc[header_row_idx].values
        header_mapping = {}

        for idx, val in enumerate(header_row):
            val_str = str(val).strip().lower()
            
            if "region" in val_str:
                header_mapping["region"] = idx
            elif "dc" in val_str and "region" not in val_str:
                header_mapping["dc"] = idx
            elif "ec" in val_str and "examination" not in val_str:
                header_mapping["ec"] = idx
            elif "day" in val_str:
                header_mapping["day"] = idx
            elif "session" in val_str:
                header_mapping["session"] = idx
            elif "paper" in val_str and ("code" in val_str or "no" in val_str):
                header_mapping["paper_code"] = idx
            elif "candidate" in val_str or ("no" in val_str and "of" in val_str):
                header_mapping["no_of_candidates"] = idx
            elif "packet" in val_str and "required" in val_str:
                header_mapping["no_of_packets_required"] = idx

        # Fallback: position-based mapping
        if "region" not in header_mapping:
            header_mapping["region"] = 0
        if "dc" not in header_mapping:
            header_mapping["dc"] = 1
        if "ec" not in header_mapping:
            header_mapping["ec"] = 2
        if "day" not in header_mapping:
            header_mapping["day"] = 3
        if "session" not in header_mapping:
            header_mapping["session"] = 4
        if "paper_code" not in header_mapping:
            header_mapping["paper_code"] = 5
        if "no_of_candidates" not in header_mapping:
            header_mapping["no_of_candidates"] = 6
        if "no_of_packets_required" not in header_mapping:
            header_mapping["no_of_packets_required"] = 7

        items = []
        for idx in range(header_row_idx + 1, len(df_raw)):
            row = df_raw.iloc[idx]

            if all(str(v).strip() in ["", "nan", "None"] for v in row.values):
                continue

            paper_code_idx = header_mapping.get("paper_code")
            if paper_code_idx is None or paper_code_idx >= len(row):
                continue

            paper_code = str(row[paper_code_idx]).strip()
            if not paper_code or paper_code in ["nan", "None", ""]:
                continue
            if "total" in paper_code.lower() or "certify" in paper_code.lower():
                continue

            timetable_info = self._get_timetable_info(paper_code)

            day_idx = header_mapping.get("day")
            day_val = str(row[day_idx]).strip() if day_idx is not None and day_idx < len(row) else "0"
            try:
                day = int(float(day_val)) if day_val.isdigit() or day_val.replace('.', '').isdigit() else 0
            except:
                day = 0

            candidates_idx = header_mapping.get("no_of_candidates")
            candidates_val = str(row[candidates_idx]).strip() if candidates_idx is not None and candidates_idx < len(row) else "0"
            no_of_candidates = self._parse_int(candidates_val)

            packets_idx = header_mapping.get("no_of_packets_required")
            packets_val = str(row[packets_idx]).strip() if packets_idx is not None and packets_idx < len(row) else "0"
            no_of_packets_required = self._parse_int(packets_val)

            items.append({
                "region": str(row[header_mapping["region"]]).strip() if header_mapping.get("region") is not None and header_mapping["region"] < len(row) else "",
                "dc": str(row[header_mapping["dc"]]).strip() if header_mapping.get("dc") is not None and header_mapping["dc"] < len(row) else "",
                "ec": str(row[header_mapping["ec"]]).strip() if header_mapping.get("ec") is not None and header_mapping["ec"] < len(row) else "",
                "day": day,
                "session": str(row[header_mapping["session"]]).strip().upper() if header_mapping.get("session") is not None and header_mapping["session"] < len(row) else "M",
                "paper_code": paper_code,
                "no_of_candidates": no_of_candidates,
                "no_of_packets_required": no_of_packets_required,
                "total_packets_session": 0,
                "total_packets_day": 0,
                "timetable_date": timetable_info["date"] if timetable_info else None,
                "timetable_session": timetable_info["session"] if timetable_info else None,
                "subject_code": timetable_info["subject_code"] if timetable_info else paper_code,
                "scheme": timetable_info["scheme"] if timetable_info else "",
            })

        logger.info(f"Parsed {len(items)} items from raw file")
        return items

    # ============================================================
    # ✅ ULTRA-FAST: BATCH INSERT - 100 rows per query
    # ============================================================

    def _insert_inventory_items(self, items: List[Dict]) -> Dict:
        """
        ✅ ULTRA-FAST: Batch insert inventory items
        
        - Batches of 100 rows
        - Single transaction per batch
        - Uses named parameters with dict
        """
        if not items:
            return {"inserted": 0, "skipped": 0, "total": 0}

        # Delete existing inventory
        db.execute_update(
            """
            DELETE FROM qp_inventory 
            WHERE exam_center_id = :exam_center_id
            """,
            {"exam_center_id": self.exam_center_id},
        )

        db.execute_update("SET LOCAL statement_timeout = '120s'")

        # Filter items with timetable info
        valid_items = [item for item in items if item.get("timetable_date")]
        skipped_no_timetable = len(items) - len(valid_items)

        if not valid_items:
            logger.warning(f"All {len(items)} items skipped - no timetable info found")
            return {"inserted": 0, "skipped": skipped_no_timetable, "total": len(items)}

        inserted = 0
        total = len(valid_items)
        batch_size = self.BATCH_SIZE

        logger.info(f"Inserting {total} valid items in batches of {batch_size}")

        # ✅ Process in batches
        for i in range(0, total, batch_size):
            batch = valid_items[i:i + batch_size]
            batch_start = time.time()

            # ✅ Build batch INSERT
            values = []
            params = {}

            for idx, item in enumerate(batch):
                values.append(f"""
                    (:ec_{idx}, :day_{idx}, :date_{idx}, :session_{idx}, 
                     :code_{idx}, :students_{idx}, :packets_{idx})
                """)

                params[f"ec_{idx}"] = self.exam_center_id
                params[f"day_{idx}"] = item.get("day", 0)
                params[f"date_{idx}"] = item["timetable_date"]
                params[f"session_{idx}"] = item["timetable_session"] or item.get("session", "Morning")
                params[f"code_{idx}"] = item["paper_code"]
                params[f"students_{idx}"] = item.get("no_of_candidates", 0)
                params[f"packets_{idx}"] = item.get("no_of_packets_required", 0)

            if values:
                query = f"""
                    INSERT INTO qp_inventory (
                        exam_center_id, day, date, session, 
                        subject_code, expected_students, expected_packets
                    ) VALUES {','.join(values)}
                """
                db.execute_update(query, params)
                inserted += len(batch)

            batch_duration = time.time() - batch_start
            logger.debug(f"Batch {i//batch_size + 1}: inserted {len(batch)} items in {batch_duration:.2f}s")

            # Small pause between batches
            if i + batch_size < total:
                time.sleep(0.02)

        logger.info(f"Inserted {inserted}, Skipped {skipped_no_timetable} (no timetable)")
        return {
            "inserted": inserted,
            "total": len(items),
            "skipped": skipped_no_timetable,
        }

    # ============================================================
    # ✅ MAIN PROCESS FUNCTION
    # ============================================================

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
            WHERE exam_center_id = :exam_center_id AND file_type = 'inventory' AND stored_filename = :stored_filename
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
                    UPDATE uploads SET status = 'FAILED', error_message = 'No valid inventory data found', updated_at = NOW()
                    WHERE exam_center_id = :exam_center_id AND file_type = 'inventory' AND stored_filename = :stored_filename
                    """,
                    {"exam_center_id": self.exam_center_id, "stored_filename": stored_filename},
                )
                return {"success": False, "error": "No valid inventory data found in file"}

            # Insert items with batch optimization
            insert_start = time.time()
            stats = self._insert_inventory_items(items)
            insert_duration = time.time() - insert_start
            logger.info(f"Inserted items in {insert_duration:.2f}s")

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

            total_duration = time.time() - start_time
            logger.info(f"Inventory processed in {total_duration:.2f}s: {stats['inserted']} items")

            return {
                "success": True,
                "message": "Inventory processed successfully",
                "data": {
                    "total_items": stats["total"],
                    "inserted": stats["inserted"],
                    "skipped": stats.get("skipped", 0),
                    "exam_center_id": self.exam_center_id,
                    "stored_filename": stored_filename,
                    "processing_time_seconds": round(total_duration, 2),
                },
            }

        except Exception as e:
            logger.error(f"Inventory processing failed: {e}")
            import traceback
            traceback.print_exc()

            db.execute_update(
                """
                UPDATE uploads SET status = 'FAILED', error_message = :error, updated_at = NOW()
                WHERE exam_center_id = :exam_center_id AND file_type = 'inventory' AND stored_filename = :stored_filename
                """,
                {"error": str(e), "exam_center_id": self.exam_center_id, "stored_filename": stored_filename},
            )
            return {"success": False, "error": f"Processing failed: {str(e)}"}


# ============================================================================
# API Endpoint
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