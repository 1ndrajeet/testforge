# backend/routers/seatingchart.py - ULTRA-FAST VERSION

import json
import logging
import os
import re
import time
from typing import Dict, List, Optional, Tuple

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth import get_exam_center_id
from config import db, settings
from utils import success_response

router = APIRouter(prefix="/seatingchart", tags=["seatingchart"])
logger = logging.getLogger(__name__)


# ============================================================================
# Pydantic Models
# ============================================================================


class StudentSeatingData(BaseModel):
    seat_number: int
    enrollment_number: Optional[str] = None
    name: Optional[str] = None
    scheme: str
    subjects: List[str] = []
    sub_codes: List[str] = []


class ProcessFileRequest(BaseModel):
    stored_filename: str


# ============================================================================
# Seating Chart Processor - ULTRA-FAST VERSION
# ============================================================================


class SeatingChartProcessor:
    """Process seating chart from uploaded Excel files - optimized for NeonDB"""

    BATCH_SIZE = 250  # ✅ Same as timetable (proven to work)

    def __init__(self, exam_center_id: str):
        self.exam_center_id = exam_center_id
        self.scheme_data = self._load_scheme_data()
        self.institute_cache = self._load_institute_cache()

    def _sanitize_scheme(self, scheme: str) -> str:
        if not scheme:
            return ""
        return re.sub(r"[^a-zA-Z0-9]", "", scheme).upper()

    def _load_scheme_data(self) -> Dict[str, Dict[str, str]]:
        result = db.execute_query("""
            SELECT code, abbr, scheme
            FROM subjects
            WHERE is_deleted = false
        """)

        scheme_data = {}
        for row in result:
            scheme = row["scheme"]
            sanitized = self._sanitize_scheme(scheme)

            if scheme not in scheme_data:
                scheme_data[scheme] = {}
            if sanitized not in scheme_data:
                scheme_data[sanitized] = {}

            if row["abbr"]:
                scheme_data[scheme][row["abbr"]] = row["code"]
                scheme_data[sanitized][row["abbr"]] = row["code"]

        logger.info(f"Loaded {len(scheme_data)} scheme entries from {len(result)} subjects")
        return scheme_data

    def _load_institute_cache(self) -> Dict[str, Dict]:
        result = db.execute_query(
            """
            SELECT id, institute_code, institute_name
            FROM connected_institutes
            WHERE exam_center_id = :exam_center_id AND is_active = true
            """,
            {"exam_center_id": self.exam_center_id},
        )

        cache = {}
        for row in result:
            cache[row["institute_code"]] = {
                "id": row["id"],
                "name": row["institute_name"],
            }

        logger.info(f"Loaded {len(cache)} connected institutes")
        return cache

    def _get_uploaded_file(self, stored_filename: str) -> Optional[Dict]:
        result = db.execute_query(
            """
            SELECT stored_filename, status, connected_institute_id, original_filename
            FROM uploads
            WHERE exam_center_id = :exam_center_id 
                AND file_type = 'seatingchart'
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
            "connected_institute_id": result[0].get("connected_institute_id"),
            "original_filename": result[0]["original_filename"],
        }

    def _get_subject_codes(self, subject_string: str, scheme: str) -> Tuple[List[str], List[str]]:
        if not subject_string or subject_string == "nan":
            return [], []

        subjects = set()
        for sub in subject_string.split(","):
            sub = sub.strip().upper()
            if sub:
                subjects.add(sub)

        sub_codes = set()

        scheme_subjects = self.scheme_data.get(scheme, {})
        if not scheme_subjects:
            sanitized = self._sanitize_scheme(scheme)
            scheme_subjects = self.scheme_data.get(sanitized, {})

        for subject in subjects:
            if subject in scheme_subjects:
                sub_codes.add(scheme_subjects[subject])
            else:
                base_subject = subject.split("-")[0] if "-" in subject else subject
                for abbr, code in scheme_subjects.items():
                    if abbr and abbr.startswith(base_subject):
                        sub_codes.add(code)
                        break

        return list(subjects), list(sub_codes)

    def _parse_excel_file(self, file_path: str) -> List[Dict]:
        try:
            df = pd.read_excel(file_path, header=0, dtype=str).fillna("")

            logger.info(f"Columns in file: {list(df.columns)}")

            students = []

            for idx, row in df.iterrows():
                seat_value = str(row.get("Seat Number", "")).strip()
                if not seat_value or not seat_value.isdigit():
                    seat_value = str(row.get("Seat", "")).strip()
                    if not seat_value or not seat_value.isdigit():
                        continue

                enrollment_number = str(row.get("Enrollment Number", "")).strip()
                if not enrollment_number or enrollment_number == "nan":
                    enrollment_number = str(row.get("Enroll", "")).strip()
                    if not enrollment_number or enrollment_number == "nan":
                        enrollment_number = None

                name = str(row.get("Name", "")).strip()
                if not name or name == "nan":
                    name = str(row.get("Candidate Name", "")).strip()
                    if not name or name == "nan":
                        name = None

                scheme = str(row.get("Scheme", "")).strip()
                if scheme == "nan":
                    scheme = ""

                subject_string = str(row.get("Subject Appearing For", "")).strip()
                if subject_string == "nan":
                    subject_string = str(row.get("Subject", "")).strip()
                    if subject_string == "nan":
                        subject_string = ""

                if not name and not enrollment_number and not subject_string:
                    continue

                subjects, sub_codes = self._get_subject_codes(subject_string, scheme)

                students.append({
                    "seat_number": int(seat_value),
                    "enrollment_number": enrollment_number,
                    "name": name,
                    "scheme": scheme,
                    "subjects": subjects,
                    "sub_codes": sub_codes,
                })

            logger.info(f"Parsed {len(students)} students from {file_path}")
            return students

        except Exception as e:
            logger.error(f"Error parsing Excel file {file_path}: {e}")
            import traceback
            traceback.print_exc()
            return []

    # ============================================================
    # ✅ ULTRA-FAST: Batch Insert Students (same pattern as timetable)
    # ============================================================

    def _insert_students_batch(self, students: List[Dict], connected_institute_id: str) -> Dict:
        if not students:
            return {"inserted": 0, "updated": 0, "skipped": 0, "total": 0}

        # Institute info — one query
        inst = db.execute_query(
            """
            SELECT id, institute_code
            FROM connected_institutes
            WHERE id = :institute_id AND exam_center_id = :exam_center_id AND is_active = true
            """,
            {"institute_id": connected_institute_id, "exam_center_id": self.exam_center_id},
        )
        if not inst:
            logger.error(f"Connected institute {connected_institute_id} not found")
            return {"inserted": 0, "updated": 0, "skipped": len(students), "total": len(students)}

        institute_id = inst[0]["id"]
        institute_code = inst[0]["institute_code"]

        total = len(students)
        inserted = 0
        updated = 0
        batch_size = self.BATCH_SIZE

        logger.info(f"Upserting {total} students in batches of {batch_size}")

        for i in range(0, total, batch_size):
            batch = students[i:i + batch_size]
            batch_start = time.time()

            # Build one INSERT ... ON CONFLICT DO UPDATE per batch
            values_parts = []
            params = {"ec": self.exam_center_id, "inst_id": institute_id, "inst_code": institute_code}

            for idx, s in enumerate(batch):
                values_parts.append(
                    f"(gen_random_uuid(), :ec, :inst_id, :seat_{idx}, :inst_code, "
                    f":enroll_{idx}, :name_{idx}, :scheme_{idx}, "
                    f"CAST(:subs_{idx} AS jsonb), CAST(:scodes_{idx} AS jsonb), false)"
                )
                params[f"seat_{idx}"] = s["seat_number"]
                params[f"enroll_{idx}"] = s.get("enrollment_number")
                params[f"name_{idx}"] = s.get("name")
                params[f"scheme_{idx}"] = s.get("scheme", "")
                params[f"subs_{idx}"] = json.dumps(s.get("subjects", []))
                params[f"scodes_{idx}"] = json.dumps(s.get("sub_codes", []))

            query = f"""
                INSERT INTO students (
                    id, exam_center_id, connected_institute_id, seat_number,
                    institute_code, enrollment_number, name, scheme,
                    subjects, sub_codes, is_deleted
                ) VALUES {",".join(values_parts)}
                ON CONFLICT (exam_center_id, seat_number)
                DO UPDATE SET
                    connected_institute_id = EXCLUDED.connected_institute_id,
                    institute_code = EXCLUDED.institute_code,
                    enrollment_number = EXCLUDED.enrollment_number,
                    name = EXCLUDED.name,
                    scheme = EXCLUDED.scheme,
                    subjects = EXCLUDED.subjects,
                    sub_codes = EXCLUDED.sub_codes,
                    updated_at = NOW()
            """

            db.execute_update(query, params)

            # Count for reporting — we can't easily distinguish insert vs update from a
            # single ON CONFLICT statement, so we approximate by pre-counting the batch's
            # seat numbers. If exactness matters, do one EXISTS query before the batch.
            inserted += len(batch)  # approximate; see note below
            batch_duration = time.time() - batch_start
            logger.debug(
                f"Batch {i//batch_size + 1}: {len(batch)} rows upserted in {batch_duration:.2f}s"
            )

        logger.info(f"Upsert complete: {total} rows in {total // batch_size + 1} batches")
        return {
            "inserted": 0,       # exact count unknown without extra query
            "updated": total,     # every row went through ON CONFLICT path
            "skipped": 0,
            "total": total,
        }

    # ============================================================
    # ✅ ULTRA-FAST: Update Timetable Counts (same as timetable)
    # ============================================================

    def _normalize_scheme(self, scheme: str) -> str:
        if not scheme:
            return ""
        return re.sub(r"[^A-Z0-9]", "", str(scheme).upper())
    
    def _update_timetable_counts(self) -> int:
        """
        Update timetable.total_students by counting students whose sub_codes
        contain the timetable row's subject_code.

        Matching is on subject_code only — scheme strings differ between
        timetable (e.g. 'CW4I') and seating chart (e.g. 'CO-4-I') sources,
        so scheme is not used as a join key. Subject codes uniquely identify
        papers in MSBTE.
        """
        result = db.execute_query(
            """
            WITH code_counts AS (
                SELECT
                    LOWER(TRIM(c)) AS code,
                    COUNT(DISTINCT s.seat_number) AS cnt
                FROM students s,
                    jsonb_array_elements_text(s.sub_codes) AS c
                WHERE s.exam_center_id = :ec
                AND s.is_deleted = false
                AND c IS NOT NULL
                AND TRIM(c) <> ''
                GROUP BY LOWER(TRIM(c))
            )
            UPDATE timetable t
            SET total_students = COALESCE(cc.cnt, 0),
                updated_at = NOW()
            FROM code_counts cc
            WHERE t.exam_center_id = :ec
            AND LOWER(TRIM(t.subject_code)) = cc.code
            RETURNING t.id
            """,
            {"ec": self.exam_center_id},
        )

        updated = len(result) if result else 0
        logger.info(f"Updated {updated} timetable entries with student counts")
        return updated

    # ============================================================
    # Main Process Function
    # ============================================================

    def process(self, stored_filename: str) -> Dict:
        """Main processing function with NeonDB optimizations"""
        start_time = time.time()

        # Get the specific uploaded file
        upload = self._get_uploaded_file(stored_filename)
        if not upload:
            return {"success": False, "error": f"File not found: {stored_filename}"}

        if not os.path.exists(upload["file_path"]):
            return {"success": False, "error": f"File not found on server: {stored_filename}"}

        connected_institute_id = upload.get("connected_institute_id")
        if not connected_institute_id:
            return {"success": False, "error": "No connected_institute_id found for this file"}

        # ✅ Update status to PROCESSING
        db.execute_update(
            """
            UPDATE uploads 
            SET status = 'PROCESSING', updated_at = NOW()
            WHERE exam_center_id = :exam_center_id 
                AND file_type = 'seatingchart'
                AND stored_filename = :stored_filename
            """,
            {"exam_center_id": self.exam_center_id, "stored_filename": stored_filename},
        )

        try:
            # Parse the file
            parse_start = time.time()
            students = self._parse_excel_file(upload["file_path"])
            parse_duration = time.time() - parse_start
            logger.info(f"Parsed {len(students)} students in {parse_duration:.2f}s")

            if not students:
                db.execute_update(
                    """
                    UPDATE uploads 
                    SET status = 'FAILED', 
                        error_message = 'No valid student data found in file',
                        updated_at = NOW()
                    WHERE exam_center_id = :exam_center_id 
                        AND file_type = 'seatingchart'
                        AND stored_filename = :stored_filename
                    """,
                    {"exam_center_id": self.exam_center_id, "stored_filename": stored_filename},
                )
                return {"success": False, "error": "No valid student data found in file"}

            # ✅ Insert students with batch optimization
            insert_start = time.time()
            stats = self._insert_students_batch(students, connected_institute_id)
            insert_duration = time.time() - insert_start
            logger.info(f"Inserted/Updated students in {insert_duration:.2f}s")

            # ✅ Update timetable counts
            timetable_start = time.time()
            timetable_updated = self._update_timetable_counts()
            timetable_duration = time.time() - timetable_start
            logger.info(f"Updated timetable counts in {timetable_duration:.2f}s")

            # ✅ Update upload status to PROCESSED
            db.execute_update(
                """
                UPDATE uploads 
                SET status = 'PROCESSED', 
                    record_count = :count,
                    processed_at = NOW(),
                    updated_at = NOW()
                WHERE exam_center_id = :exam_center_id 
                    AND file_type = 'seatingchart'
                    AND stored_filename = :stored_filename
                """,
                {
                    "count": stats["total"],
                    "exam_center_id": self.exam_center_id,
                    "stored_filename": stored_filename,
                },
            )

            total_duration = time.time() - start_time
            logger.info(
                f"Seating chart processed in {total_duration:.2f}s: "
                f"{stats['inserted']} inserted, {stats['updated']} updated"
            )

            return {
                "success": True,
                "message": "Seating chart processed successfully",
                "data": {
                    "total_students": stats["total"],
                    "inserted": stats["inserted"],
                    "updated": stats["updated"],
                    "skipped": stats["skipped"],
                    "timetable_entries_updated": timetable_updated,
                    "exam_center_id": self.exam_center_id,
                    "connected_institute_id": connected_institute_id,
                    "stored_filename": stored_filename,
                    "processing_time_seconds": round(total_duration, 2),
                },
            }

        except Exception as e:
            logger.error(f"Seating chart processing failed: {e}")
            import traceback
            traceback.print_exc()

            db.execute_update(
                """
                UPDATE uploads 
                SET status = 'FAILED', 
                    error_message = :error,
                    updated_at = NOW()
                WHERE exam_center_id = :exam_center_id 
                    AND file_type = 'seatingchart'
                    AND stored_filename = :stored_filename
                """,
                {
                    "error": str(e),
                    "exam_center_id": self.exam_center_id,
                    "stored_filename": stored_filename,
                },
            )
            return {"success": False, "error": f"Processing failed: {str(e)}"}


# ============================================================================
# API Endpoints
# ============================================================================


@router.post("/process")
async def process_seating_chart(
    request: ProcessFileRequest, exam_center_id: str = Depends(get_exam_center_id)
):
    """Process a specific uploaded seating chart file"""
    processor = SeatingChartProcessor(exam_center_id)
    result = processor.process(request.stored_filename)

    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])

    return success_response(data=result.get("data"), message=result["message"])