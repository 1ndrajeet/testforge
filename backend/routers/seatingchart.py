# backend/routers/seatingchart.py - COMPLETE FIXED VERSION

import json
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
# Seating Chart Processor
# ============================================================================


class SeatingChartProcessor:
    """Process seating chart from uploaded Excel files (V2 schema)"""

    def __init__(self, exam_center_id: str):
        self.exam_center_id = exam_center_id
        self.scheme_data = self._load_scheme_data()
        self.institute_cache = self._load_institute_cache()

    def _sanitize_scheme(self, scheme: str) -> str:
        """Convert scheme to alphanumeric only for matching"""
        if not scheme:
            return ""
        # Remove all non-alphanumeric characters (keep only letters and numbers)
        return re.sub(r"[^a-zA-Z0-9]", "", scheme).upper()

    def _load_scheme_data(self) -> Dict[str, Dict[str, str]]:
        """Load scheme data mapping (scheme -> abbr -> code)"""
        result = db.execute_query("""
            SELECT code, abbr, scheme
            FROM subjects
            WHERE is_deleted = false
        """)

        scheme_data = {}
        for row in result:
            scheme = row["scheme"]
            # Store with both original and sanitized scheme
            sanitized = self._sanitize_scheme(scheme)

            if scheme not in scheme_data:
                scheme_data[scheme] = {}
            if sanitized not in scheme_data:
                scheme_data[sanitized] = {}

            if row["abbr"]:
                scheme_data[scheme][row["abbr"]] = row["code"]
                scheme_data[sanitized][row["abbr"]] = row["code"]

        logger.info(f"Loaded scheme data for {len(scheme_data)} schemes")
        return scheme_data

    def _load_institute_cache(self) -> Dict[str, Dict]:
        """Load connected institutes for this exam center"""
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
            cache[row["institute_code"]] = {"id": row["id"], "name": row["institute_name"]}

        logger.info(f"Loaded {len(cache)} connected institutes")
        return cache

    def _get_uploaded_file(self, stored_filename: str) -> Optional[Dict]:
        """Get a specific uploaded seating chart file by stored_filename"""
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

    def _get_subject_codes(self, subject_string: str, scheme: str) -> tuple:
        """Extract subject abbreviations and codes from subject string"""
        if not subject_string or subject_string == "nan":
            return [], []

        subjects = set()
        for sub in subject_string.split(","):
            sub = sub.strip().upper()
            if sub:
                subjects.add(sub)

        sub_codes = set()

        # Try with original scheme
        scheme_subjects = self.scheme_data.get(scheme, {})
        if not scheme_subjects:
            # Try with sanitized scheme
            sanitized = self._sanitize_scheme(scheme)
            scheme_subjects = self.scheme_data.get(sanitized, {})

        for subject in subjects:
            if subject in scheme_subjects:
                sub_codes.add(scheme_subjects[subject])
            else:
                # Try partial matching
                base_subject = subject.split("-")[0] if "-" in subject else subject
                for abbr, code in scheme_subjects.items():
                    if abbr and abbr.startswith(base_subject):
                        sub_codes.add(code)
                        break

        return list(subjects), list(sub_codes)

    def _parse_excel_file(self, file_path: str, institute_code: str) -> List[Dict]:
        """Parse seating chart Excel file - handles sanitized files with headers"""
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

                students.append(
                    {
                        "seat_number": int(seat_value),
                        "enrollment_number": enrollment_number,
                        "name": name,
                        "scheme": scheme,
                        "subjects": subjects,
                        "sub_codes": sub_codes,
                        "institute_code": institute_code,
                    }
                )

            logger.info(f"Parsed {len(students)} students from {file_path}")
            return students

        except Exception as e:
            logger.error(f"Error parsing Excel file {file_path}: {e}")
            import traceback

            traceback.print_exc()
            return []

    def _insert_students(self, students: List[Dict], connected_institute_id: str) -> Dict:
        """Insert or update students in database with specific connected_institute_id"""

        inserted = 0
        updated = 0
        skipped = 0

        # Get institute info
        inst = db.execute_query(
            """
            SELECT id, institute_code, institute_name
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

        for student in students:
            student["institute_code"] = institute_code

            # Convert lists to JSON strings
            subjects_json = json.dumps(student["subjects"])
            sub_codes_json = json.dumps(student["sub_codes"])

            # Check if student already exists for this seat number
            existing = db.execute_query(
                """
                SELECT id FROM students
                WHERE exam_center_id = :exam_center_id AND seat_number = :seat_number
                AND is_deleted = false
            """,
                {"exam_center_id": self.exam_center_id, "seat_number": student["seat_number"]},
            )

            if existing:
                # Update existing student
                db.execute_update(
                    """
                    UPDATE students
                    SET connected_institute_id = :institute_id,
                        enrollment_number = :enrollment_number,
                        name = :name,
                        scheme = :scheme,
                        subjects = CAST(:subjects AS jsonb),
                        sub_codes = CAST(:sub_codes AS jsonb),
                        updated_at = NOW()
                    WHERE exam_center_id = :exam_center_id AND seat_number = :seat_number
                """,
                    {
                        "exam_center_id": self.exam_center_id,
                        "institute_id": institute_id,
                        "seat_number": student["seat_number"],
                        "enrollment_number": student["enrollment_number"],
                        "name": student["name"],
                        "scheme": student["scheme"],
                        "subjects": subjects_json,
                        "sub_codes": sub_codes_json,
                    },
                )
                updated += 1
            else:
                # Insert new student
                db.execute_update(
                    """
                    INSERT INTO students (
                        id, exam_center_id, connected_institute_id, seat_number,
                        institute_code, enrollment_number, name, scheme,
                        subjects, sub_codes, is_deleted
                    ) VALUES (
                        gen_random_uuid(), :exam_center_id, :institute_id, :seat_number,
                        :institute_code, :enrollment_number, :name, :scheme,
                        CAST(:subjects AS jsonb), CAST(:sub_codes AS jsonb), false
                    )
                """,
                    {
                        "exam_center_id": self.exam_center_id,
                        "institute_id": institute_id,
                        "seat_number": student["seat_number"],
                        "institute_code": institute_code,
                        "enrollment_number": student["enrollment_number"],
                        "name": student["name"],
                        "scheme": student["scheme"],
                        "subjects": subjects_json,
                        "sub_codes": sub_codes_json,
                    },
                )
                inserted += 1

        logger.info(f"Inserted {inserted}, Updated {updated}, Skipped {skipped}")
        return {
            "inserted": inserted,
            "updated": updated,
            "skipped": skipped,
            "total": len(students),
        }

    def _update_timetable_counts(self) -> int:
        """Update total_students in timetable table based on seating chart data"""

        # ============================================
        # Step 1: Create lookup maps for fast matching
        # ============================================

        # Get all subjects for lookup
        all_subjects = db.execute_query("""
            SELECT code, abbr, scheme
            FROM subjects
            WHERE is_deleted = false
        """)

        # Create maps: (code, scheme_sanitized) -> count
        subject_lookup = {}
        for sub in all_subjects:
            code = sub["code"]
            scheme = sub["scheme"]
            scheme_sanitized = self._sanitize_scheme(scheme)
            abbr = sub["abbr"]

            # Store by code + sanitized scheme
            key = (code, scheme_sanitized)
            subject_lookup[key] = {
                "code": code,
                "scheme": scheme,
                "scheme_sanitized": scheme_sanitized,
                "abbr": abbr,
            }

            # Store by abbr + sanitized scheme if abbr exists
            if abbr:
                key_abbr = (abbr, scheme_sanitized)
                subject_lookup[key_abbr] = {
                    "code": code,
                    "scheme": scheme,
                    "scheme_sanitized": scheme_sanitized,
                    "abbr": abbr,
                }

        logger.info(f"Loaded {len(subject_lookup)} subject lookup entries")

        # ============================================
        # Step 2: Get all students and count by subject
        # ============================================

        students = db.execute_query(
            """
            SELECT 
                s.sub_codes,
                s.scheme
            FROM students s
            WHERE s.exam_center_id = :exam_center_id AND s.is_deleted = false
        """,
            {"exam_center_id": self.exam_center_id},
        )

        # Count students per subject (code + sanitized scheme)
        subject_counts = {}

        for student in students:
            sub_codes = student.get("sub_codes", [])
            if isinstance(sub_codes, str):
                sub_codes = json.loads(sub_codes)

            scheme = student.get("scheme", "")
            scheme_sanitized = self._sanitize_scheme(scheme)

            for sub_code in sub_codes:
                if not sub_code:
                    continue

                # Try to find the subject code in the lookup
                found_code = None
                found_scheme = None

                # Try direct match with sanitized scheme
                key = (sub_code, scheme_sanitized)
                if key in subject_lookup:
                    found_code = sub_code
                    found_scheme = scheme_sanitized
                else:
                    # Try to find by abbr
                    for lookup_key, lookup_val in subject_lookup.items():
                        if lookup_val["code"] == sub_code:
                            found_code = lookup_val["code"]
                            found_scheme = lookup_val["scheme_sanitized"]
                            break

                if found_code and found_scheme:
                    count_key = (found_code, found_scheme)
                    subject_counts[count_key] = subject_counts.get(count_key, 0) + 1
                else:
                    # Store with original code and sanitized scheme even if not in lookup
                    # This will be used to update timetable entries that might not have a subject record
                    count_key = (sub_code, scheme_sanitized)
                    subject_counts[count_key] = subject_counts.get(count_key, 0) + 1

        logger.info(f"Calculated counts for {len(subject_counts)} subjects")

        # ============================================
        # Step 3: Update timetable entries
        # ============================================

        # Get all timetable entries for this exam center
        timetable_entries = db.execute_query(
            """
            SELECT id, subject_code, scheme
            FROM timetable
            WHERE exam_center_id = :exam_center_id
        """,
            {"exam_center_id": self.exam_center_id},
        )

        updated = 0

        for entry in timetable_entries:
            subject_code = entry["subject_code"]
            scheme = entry["scheme"]
            scheme_sanitized = self._sanitize_scheme(scheme)

            count = 0

            # Try with sanitized scheme
            key = (subject_code, scheme_sanitized)
            if key in subject_counts:
                count = subject_counts[key]
            else:
                # Try to find by abbr in the subject lookup
                for lookup_key, lookup_val in subject_lookup.items():
                    if (
                        lookup_val["code"] == subject_code
                        and lookup_val["scheme_sanitized"] == scheme_sanitized
                    ):
                        if lookup_key in subject_counts:
                            count = subject_counts[lookup_key]
                            break

            # Always update to ensure counts are correct (even if 0)
            db.execute_update(
                """
                UPDATE timetable
                SET total_students = :count, updated_at = NOW()
                WHERE id = :id
            """,
                {"count": count, "id": entry["id"]},
            )
            updated += 1

        logger.info(f"Updated {updated} timetable entries with student counts")
        return updated

    def process(self, stored_filename: str) -> Dict:
        """Main processing function for a specific file"""

        # Get the specific uploaded file
        upload = self._get_uploaded_file(stored_filename)
        if not upload:
            return {"success": False, "error": f"File not found: {stored_filename}"}

        if not os.path.exists(upload["file_path"]):
            return {"success": False, "error": f"File not found on server: {stored_filename}"}

        # Get connected_institute_id from the upload record
        connected_institute_id = upload.get("connected_institute_id")
        if not connected_institute_id:
            return {"success": False, "error": "No connected_institute_id found for this file"}

        # Update status to PROCESSING
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

        # Parse the file
        students = self._parse_excel_file(upload["file_path"], "")

        if not students:
            # Update status to FAILED
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

        # Insert students with the connected_institute_id
        stats = self._insert_students(students, connected_institute_id)

        # Update timetable counts
        timetable_updated = self._update_timetable_counts()

        # Update upload status to PROCESSED
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

        logger.info(
            f"Seating chart processed: {stats['inserted']} inserted, {stats['updated']} updated"
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
            },
        }


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
