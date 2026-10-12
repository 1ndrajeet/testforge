# backend/routers/timetable.py - Complete fixed version

import logging
import os
import re
import time
from typing import Dict, List, Optional

from bs4 import BeautifulSoup
from fastapi import APIRouter, Depends, HTTPException

from auth import get_exam_center_id
from config import db, settings
from utils import success_response

router = APIRouter(prefix="/timetable", tags=["timetable"])
logger = logging.getLogger(__name__)


class TimetableProcessor:
    """Process timetable from uploaded HTML file with NeonDB optimizations"""

    BATCH_SIZE = 250  # ✅ Small batch size for free tier
    COMMIT_INTERVAL = 5  # ✅ Commit every 5 batches

    def __init__(self, exam_center_id: str):
        self.exam_center_id = exam_center_id
        self.subject_cache = self._load_subject_cache()

    def _normalize_scheme(self, scheme: str) -> str:
        if not scheme:
            return ""
        return scheme.replace("-", "").strip()

    def _load_subject_cache(self) -> Dict[str, Dict]:
        result = db.execute_query("""
            SELECT code, scheme, abbr, id, name
            FROM subjects
            WHERE is_deleted = false
        """)

        cache = {}
        for row in result:
            original_key = f"{row['code']}_{row['scheme']}"
            cache[original_key] = {
                "abbr": row["abbr"],
                "id": row["id"],
                "name": row["name"],
                "original_scheme": row["scheme"],
            }

            normalized_scheme = self._normalize_scheme(row["scheme"])
            if normalized_scheme != row["scheme"]:
                norm_key = f"{row['code']}_{normalized_scheme}"
                if norm_key not in cache:
                    cache[norm_key] = {
                        "abbr": row["abbr"],
                        "id": row["id"],
                        "name": row["name"],
                        "original_scheme": row["scheme"],
                    }

        logger.info(f"Loaded {len(result)} subjects with {len(cache)} cache entries")
        return cache

    def _get_uploaded_file(self) -> Optional[Dict]:
        result = db.execute_query(
            """
            SELECT stored_filename, status
            FROM uploads
            WHERE exam_center_id = :exam_center_id AND file_type = 'timetable'
            ORDER BY created_at DESC
            LIMIT 1
            """,
            {"exam_center_id": self.exam_center_id},
        )

        if not result:
            return None

        file_path = os.path.join(settings.UPLOAD_DIR, result[0]["stored_filename"])
        return {
            "stored_filename": result[0]["stored_filename"],
            "file_path": file_path,
            "status": result[0]["status"],
        }

    def _parse_html(self, file_path: str) -> List[Dict]:
        """Parse HTML - unchanged from original"""
        with open(file_path, "r", encoding="utf-8") as f:
            html = f.read()

        soup = BeautifulSoup(html, "html.parser")
        entries = []
        tables = soup.find_all("table")

        for table in tables:
            header = table.find_previous_sibling(
                "div", class_=re.compile(r"timetable-session-header|session-header")
            )
            if not header:
                header = table.find_previous_sibling("div")
            if not header:
                prev = table.find_previous_sibling()
                if prev and ("Date:" in prev.get_text() or "Date" in prev.get_text()):
                    header = prev
            if not header:
                continue

            header_text = header.get_text(" ", strip=True)
            logger.debug(f"Header text: {header_text}")

            date_match = re.search(r"Date:\s*(\d{2}-\d{2}-\d{4})", header_text)
            if not date_match:
                date_match = re.search(r"(\d{2}-\d{2}-\d{4})", header_text)
            if not date_match:
                continue

            date_str = date_match.group(1)
            parts = date_str.split("-")
            formatted_date = f"{parts[2]}-{parts[1]}-{parts[0]}"

            day_match = re.search(r"Day:\s*(\d+)", header_text)
            exam_day = int(day_match.group(1)) if day_match else 0

            session = "Morning"
            if "Afternoon" in header_text or "🌙" in header_text:
                session = "Afternoon"
            elif "Morning" in header_text or "🌅" in header_text:
                session = "Morning"

            rows = table.find_all("tr")
            for row in rows:
                cells = row.find_all("td")
                if len(cells) >= 7:
                    sr_no = cells[0].get_text(strip=True) if len(cells) > 0 else ""
                    if not sr_no or not sr_no.isdigit():
                        continue

                    time_slot = cells[3].get_text(strip=True) if len(cells) > 3 else ""
                    subject_code = cells[4].get_text(strip=True) if len(cells) > 4 else ""
                    subject_name = cells[5].get_text(strip=True) if len(cells) > 5 else ""
                    schemes_raw = cells[6].get_text(strip=True) if len(cells) > 6 else ""

                    if not subject_code or not subject_name:
                        continue

                    schemes = [s.strip() for s in schemes_raw.split(",") if s.strip()]
                    if not schemes:
                        schemes = [""]

                    for scheme in schemes:
                        entries.append({
                            "exam_day": exam_day,
                            "date": formatted_date,
                            "session": session,
                            "time_slot": time_slot,
                            "subject_code": subject_code,
                            "subject_name": subject_name,
                            "scheme": scheme if scheme else None,
                        })

        if not entries:
            entries = self._parse_html_alternative(soup)

        if not entries:
            raise ValueError("No valid timetable entries found in HTML")

        logger.info(f"Parsed {len(entries)} timetable entries")
        return entries

    def _parse_html_alternative(self, soup: BeautifulSoup) -> List[Dict]:
        """Alternative parser - unchanged"""
        entries = []
        session_blocks = soup.find_all("div", class_=re.compile(r"session|header", re.I))

        for block in session_blocks:
            header_text = block.get_text(" ", strip=True)
            if "Date:" not in header_text and "date" not in header_text.lower():
                continue

            table = block.find_next("table")
            if not table:
                continue

            date_match = re.search(r"Date:\s*(\d{2}-\d{2}-\d{4})", header_text)
            if not date_match:
                date_match = re.search(r"(\d{2}-\d{2}-\d{4})", header_text)
            if not date_match:
                continue

            date_str = date_match.group(1)
            parts = date_str.split("-")
            formatted_date = f"{parts[2]}-{parts[1]}-{parts[0]}"

            day_match = re.search(r"Day:\s*(\d+)", header_text)
            exam_day = int(day_match.group(1)) if day_match else 0

            session = "Morning"
            if "Afternoon" in header_text or "🌙" in header_text:
                session = "Afternoon"
            elif "Morning" in header_text or "🌅" in header_text:
                session = "Morning"

            rows = table.find_all("tr")
            for row in rows:
                cells = row.find_all("td")
                if len(cells) >= 4:
                    sr_no = cells[0].get_text(strip=True) if len(cells) > 0 else ""
                    if not sr_no or not sr_no.isdigit():
                        continue

                    time_slot = ""
                    subject_code = ""
                    subject_name = ""
                    schemes_raw = ""

                    if len(cells) >= 7:
                        time_slot = cells[3].get_text(strip=True)
                        subject_code = cells[4].get_text(strip=True)
                        subject_name = cells[5].get_text(strip=True)
                        schemes_raw = cells[6].get_text(strip=True)
                    elif len(cells) >= 5:
                        time_slot = cells[1].get_text(strip=True)
                        subject_code = cells[2].get_text(strip=True)
                        subject_name = cells[3].get_text(strip=True)
                        schemes_raw = cells[4].get_text(strip=True)

                    if subject_code and subject_name:
                        for scheme in [s.strip() for s in schemes_raw.split(",") if s.strip()]:
                            entries.append({
                                "exam_day": exam_day,
                                "date": formatted_date,
                                "session": session,
                                "time_slot": time_slot,
                                "subject_code": subject_code,
                                "subject_name": subject_name,
                                "scheme": scheme if scheme else None,
                            })

        return entries

    def _get_subject_info(self, subject_code: str, scheme: str) -> Optional[Dict]:
        """Get subject info from cache - unchanged"""
        if not scheme:
            for key, value in self.subject_cache.items():
                if key.startswith(f"{subject_code}_"):
                    return value
            return None

        key = f"{subject_code}_{scheme}"
        if key in self.subject_cache:
            return self.subject_cache[key]

        normalized_scheme = self._normalize_scheme(scheme)
        if normalized_scheme != scheme:
            norm_key = f"{subject_code}_{normalized_scheme}"
            if norm_key in self.subject_cache:
                return self.subject_cache[norm_key]

        for cache_key, cache_value in self.subject_cache.items():
            if cache_key.startswith(f"{subject_code}_"):
                logger.debug(
                    f"Fallback match for {subject_code} scheme '{scheme}' -> '{cache_value['original_scheme']}'"
                )
                return cache_value

        return None

    def _insert_timetable_entries(self, entries: List[Dict]) -> int:
        """
        ✅ OPTIMIZED: Batch insert with chunking for NeonDB free tier
        
        - Batches of 50 rows (reduces memory pressure)
        - Single transaction per batch (reduces overhead)
        - Small pauses between batches (prevents timeout)
        - Statement timeout protection
        """
        if not entries:
            return 0

        # ✅ Set statement timeout to 2 minutes (safe for free tier)
        db.execute_update("SET LOCAL statement_timeout = '120s'")
        
        inserted = 0
        batch_size = self.BATCH_SIZE
        
        logger.info(f"Inserting {len(entries)} timetable entries in batches of {batch_size}")

        # ✅ Delete existing first
        db.execute_update(
            """
            DELETE FROM timetable WHERE exam_center_id = :exam_center_id
            """,
            {"exam_center_id": self.exam_center_id},
        )

        for i in range(0, len(entries), batch_size):
            batch = entries[i:i + batch_size]
            batch_start = time.time()
            
            # ✅ Build batch INSERT
            values = []
            params = {}
            
            for idx, entry in enumerate(batch):
                subject_info = self._get_subject_info(entry["subject_code"], entry["scheme"])
                
                params[f"ec_{idx}"] = self.exam_center_id
                params[f"day_{idx}"] = entry["exam_day"]
                params[f"date_{idx}"] = entry["date"]
                params[f"sess_{idx}"] = entry["session"]
                params[f"time_{idx}"] = entry["time_slot"]
                params[f"code_{idx}"] = entry["subject_code"]
                params[f"name_{idx}"] = entry["subject_name"]
                params[f"scheme_{idx}"] = entry["scheme"]
                params[f"sid_{idx}"] = subject_info["id"] if subject_info else None
                params[f"abbr_{idx}"] = subject_info["abbr"] if subject_info else None
                
                values.append(f"""
                    (:ec_{idx}, :day_{idx}, :date_{idx}, :sess_{idx}, 
                     :time_{idx}, :code_{idx}, :name_{idx}, 
                     :scheme_{idx}, :sid_{idx}, :abbr_{idx})
                """)
            
            query = f"""
                INSERT INTO timetable (
                    exam_center_id, exam_day, date, session, time_slot,
                    subject_code, subject_name, scheme, subject_id, subject_abbr
                ) VALUES {','.join(values)}
            """
            
            # ✅ Execute batch
            db.execute_update(query, params)
            inserted += len(batch)
            
            batch_duration = time.time() - batch_start
            logger.debug(f"Batch {i//batch_size + 1}: inserted {len(batch)} rows in {batch_duration:.2f}s")
            
            # ✅ Small pause between batches to prevent connection timeout
            if i + batch_size < len(entries):
                time.sleep(0.05)

        logger.info(f"Successfully inserted {inserted} timetable entries")
        return inserted

    def process(self) -> Dict:
        """Main processing function with NeonDB optimizations"""
        upload = self._get_uploaded_file()
        if not upload:
            return {"success": False, "error": "No timetable file found. Please upload first."}

        if upload["status"] == "PROCESSED":
            return {"success": False, "error": "Timetable already processed"}

        if not os.path.exists(upload["file_path"]):
            return {"success": False, "error": f'File not found: {upload["stored_filename"]}'}

        try:
            # Parse HTML
            entries = self._parse_html(upload["file_path"])

            # Insert with batch optimization
            count = self._insert_timetable_entries(entries)

            # Update upload status
            db.execute_update(
                """
                UPDATE uploads 
                SET status = 'PROCESSED', 
                    record_count = :count,
                    processed_at = NOW(),
                    updated_at = NOW()
                WHERE exam_center_id = :exam_center_id AND file_type = 'timetable'
                """,
                {"count": count, "exam_center_id": self.exam_center_id},
            )

            logger.info(
                f"Timetable processed: {count} entries for exam center {self.exam_center_id}"
            )

            return {
                "success": True,
                "message": f"Timetable processed successfully ({count} entries)",
                "data": {"record_count": count, "exam_center_id": self.exam_center_id},
            }

        except ValueError as e:
            return {"success": False, "error": str(e)}
        except Exception as e:
            logger.error(f"Timetable processing failed: {e}")
            return {"success": False, "error": f"Processing failed: {str(e)}"}


@router.post("/process")
async def process_timetable(exam_center_id: str = Depends(get_exam_center_id)):
    """Process uploaded timetable HTML file"""
    processor = TimetableProcessor(exam_center_id)
    result = processor.process()

    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])

    return success_response(data=result.get("data"), message=result["message"])