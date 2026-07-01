# backend/routers/timetable.py
import logging
import os
import re
from typing import Dict, List, Optional

from bs4 import BeautifulSoup
from fastapi import APIRouter, Depends, HTTPException

from auth import get_exam_center_id
from config import db, settings
from utils import success_response

router = APIRouter(prefix="/timetable", tags=["timetable"])
logger = logging.getLogger(__name__)


class TimetableProcessor:
    """Process timetable from uploaded HTML file"""

    def __init__(self, exam_center_id: str):
        self.exam_center_id = exam_center_id
        self.subject_cache = self._load_subject_cache()

    def _normalize_scheme(self, scheme: str) -> str:
        """Remove hyphens and extra characters from scheme for matching"""
        if not scheme:
            return ""
        # Remove hyphens and trim
        return scheme.replace("-", "").strip()

    def _load_subject_cache(self) -> Dict[str, Dict]:
        """Load subjects into cache with multiple key variations"""
        result = db.execute_query("""
            SELECT code, scheme, abbr, id, name
            FROM subjects
            WHERE is_deleted = false
        """)

        cache = {}
        for row in result:
            # Store with original scheme
            original_key = f"{row['code']}_{row['scheme']}"
            cache[original_key] = {
                "abbr": row["abbr"],
                "id": row["id"],
                "name": row["name"],
                "original_scheme": row["scheme"],
            }

            # Store with normalized scheme (no hyphens)
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
        """Get the most recent uploaded timetable file"""
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
        """Parse timetable HTML and extract entries"""
        with open(file_path, "r", encoding="utf-8") as f:
            html = f.read()

        soup = BeautifulSoup(html, "html.parser")
        entries = []

        # Find all tables
        tables = soup.find_all("table")

        for table in tables:
            # Find the session header div BEFORE the table
            # MSBTE structure: <div class="timetable-session-header">...</div> followed by <table>
            header = table.find_previous_sibling(
                "div", class_=re.compile(r"timetable-session-header|session-header")
            )

            if not header:
                # Try finding any div with date info before the table
                header = table.find_previous_sibling("div")

            if not header:
                # Last resort: look for any previous element containing date pattern
                prev = table.find_previous_sibling()
                if prev and ("Date:" in prev.get_text() or "Date" in prev.get_text()):
                    header = prev

            if not header:
                logger.warning("No header found for table, skipping")
                continue

            header_text = header.get_text(" ", strip=True)
            logger.debug(f"Header text: {header_text}")

            # Extract date - Format: "Date: 24-04-2026"
            date_match = re.search(r"Date:\s*(\d{2}-\d{2}-\d{4})", header_text)
            if not date_match:
                # Try alternative format
                date_match = re.search(r"(\d{2}-\d{2}-\d{4})", header_text)

            if not date_match:
                logger.warning(f"No date found in header: {header_text}")
                continue

            date_str = date_match.group(1)
            # Convert from DD-MM-YYYY to YYYY-MM-DD
            parts = date_str.split("-")
            formatted_date = f"{parts[2]}-{parts[1]}-{parts[0]}"

            # Extract exam day
            day_match = re.search(r"Day:\s*(\d+)", header_text)
            exam_day = int(day_match.group(1)) if day_match else 0

            # Extract session (Morning/Afternoon)
            session = "Morning"
            if "Afternoon" in header_text or "🌙" in header_text:
                session = "Afternoon"
            elif "Morning" in header_text or "🌅" in header_text:
                session = "Morning"

            # Parse table rows
            rows = table.find_all("tr")
            for row in rows:
                cells = row.find_all("td")

                # MSBTE timetable has 7+ columns
                if len(cells) >= 7:
                    # Column indices based on actual MSBTE structure
                    # 0: SR No.
                    # 1: Seat No. (or empty)
                    # 2: Enrollment (or empty)
                    # 3: Time
                    # 4: Subject Code
                    # 5: Subject Name
                    # 6: Scheme

                    sr_no = cells[0].get_text(strip=True) if len(cells) > 0 else ""

                    # Skip header rows (SR No is not a number)
                    if not sr_no or not sr_no.isdigit():
                        continue

                    time_slot = cells[3].get_text(strip=True) if len(cells) > 3 else ""
                    subject_code = cells[4].get_text(strip=True) if len(cells) > 4 else ""
                    subject_name = cells[5].get_text(strip=True) if len(cells) > 5 else ""
                    schemes_raw = cells[6].get_text(strip=True) if len(cells) > 6 else ""

                    if not subject_code or not subject_name:
                        continue

                    # Handle multiple schemes (comma separated)
                    schemes = [s.strip() for s in schemes_raw.split(",") if s.strip()]
                    if not schemes:
                        schemes = [""]  # Empty scheme if none provided

                    for scheme in schemes:
                        entries.append(
                            {
                                "exam_day": exam_day,
                                "date": formatted_date,
                                "session": session,
                                "time_slot": time_slot,
                                "subject_code": subject_code,
                                "subject_name": subject_name,
                                "scheme": scheme if scheme else None,
                            }
                        )

        if not entries:
            # Try alternative parsing method - look for tables within divs
            logger.warning("No entries found with primary parser, trying alternative...")
            entries = self._parse_html_alternative(soup)

        if not entries:
            raise ValueError("No valid timetable entries found in HTML")

        logger.info(f"Parsed {len(entries)} timetable entries")
        return entries

    def _parse_html_alternative(self, soup: BeautifulSoup) -> List[Dict]:
        """Alternative parser for different MSBTE HTML structures"""
        entries = []

        # Look for any div containing session info followed by a table
        session_blocks = soup.find_all("div", class_=re.compile(r"session|header", re.I))

        for block in session_blocks:
            header_text = block.get_text(" ", strip=True)

            # Check if this looks like a session header
            if "Date:" not in header_text and "date" not in header_text.lower():
                continue

            # Find the next table
            table = block.find_next("table")
            if not table:
                continue

            # Extract date
            date_match = re.search(r"Date:\s*(\d{2}-\d{2}-\d{4})", header_text)
            if not date_match:
                date_match = re.search(r"(\d{2}-\d{2}-\d{4})", header_text)

            if not date_match:
                continue

            date_str = date_match.group(1)
            parts = date_str.split("-")
            formatted_date = f"{parts[2]}-{parts[1]}-{parts[0]}"

            # Extract day
            day_match = re.search(r"Day:\s*(\d+)", header_text)
            exam_day = int(day_match.group(1)) if day_match else 0

            # Extract session
            session = "Morning"
            if "Afternoon" in header_text or "🌙" in header_text:
                session = "Afternoon"
            elif "Morning" in header_text or "🌅" in header_text:
                session = "Morning"

            # Parse rows
            rows = table.find_all("tr")
            for row in rows:
                cells = row.find_all("td")
                if len(cells) >= 4:
                    sr_no = cells[0].get_text(strip=True) if len(cells) > 0 else ""
                    if not sr_no or not sr_no.isdigit():
                        continue

                    # Try different column mappings
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
                            entries.append(
                                {
                                    "exam_day": exam_day,
                                    "date": formatted_date,
                                    "session": session,
                                    "time_slot": time_slot,
                                    "subject_code": subject_code,
                                    "subject_name": subject_name,
                                    "scheme": scheme if scheme else None,
                                }
                            )

        return entries

    def _get_subject_info(self, subject_code: str, scheme: str) -> Optional[Dict]:
        """Get subject ID and abbreviation from cache"""
        if not scheme:
            # Try to find subject without scheme
            for key, value in self.subject_cache.items():
                if key.startswith(f"{subject_code}_"):
                    return value
            return None

        # Try exact match first
        key = f"{subject_code}_{scheme}"
        if key in self.subject_cache:
            return self.subject_cache[key]

        # Try normalized scheme (no hyphens)
        normalized_scheme = self._normalize_scheme(scheme)
        if normalized_scheme != scheme:
            norm_key = f"{subject_code}_{normalized_scheme}"
            if norm_key in self.subject_cache:
                return self.subject_cache[norm_key]

        # Try finding by subject code only (fallback)
        for cache_key, cache_value in self.subject_cache.items():
            if cache_key.startswith(f"{subject_code}_"):
                logger.debug(
                    f"Fallback match for {subject_code} scheme '{scheme}' -> '{cache_value['original_scheme']}'"
                )
                return cache_value

        return None

    def _insert_timetable_entries(self, entries: List[Dict]) -> int:
        """Insert parsed entries into timetable table"""
        # First, delete existing entries for this exam center
        db.execute_update(
            """
            DELETE FROM timetable WHERE exam_center_id = :exam_center_id
        """,
            {"exam_center_id": self.exam_center_id},
        )

        inserted = 0
        for entry in entries:
            # Get subject info from cache
            subject_info = self._get_subject_info(entry["subject_code"], entry["scheme"])

            db.execute_update(
                """
                INSERT INTO timetable (
                    exam_center_id, exam_day, date, session, time_slot,
                    subject_code, subject_name, scheme, subject_id, subject_abbr
                ) VALUES (
                    :exam_center_id, :exam_day, :date, :session, :time_slot,
                    :subject_code, :subject_name, :scheme, :subject_id, :subject_abbr
                )
            """,
                {
                    "exam_center_id": self.exam_center_id,
                    "exam_day": entry["exam_day"],
                    "date": entry["date"],
                    "session": entry["session"],
                    "time_slot": entry["time_slot"],
                    "subject_code": entry["subject_code"],
                    "subject_name": entry["subject_name"],
                    "scheme": entry["scheme"],
                    "subject_id": subject_info["id"] if subject_info else None,
                    "subject_abbr": subject_info["abbr"] if subject_info else None,
                },
            )
            inserted += 1

        return inserted

    def process(self) -> Dict:
        """Main processing function"""
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

            # Insert into timetable table
            count = self._insert_timetable_entries(entries)

            # Update upload status to PROCESSED
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
                "message": "Timetable processed successfully",
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
