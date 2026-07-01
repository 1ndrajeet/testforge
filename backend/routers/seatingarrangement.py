# backend/routers/seatingarrangement.py

import json
import logging
import os
from datetime import datetime
from typing import Dict, List, Optional
from uuid import uuid4

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth import get_exam_center_id
from config import db, settings
from utils import success_response

router = APIRouter(prefix="/seatingarrangement", tags=["seatingarrangement"])
logger = logging.getLogger(__name__)


# ============================================================================
# Pydantic Models
# ============================================================================


class ProcessSeatingArrangementRequest(BaseModel):
    stored_filename: str


class FixMismatchesRequest(BaseModel):
    temp_session_id: str
    action: str  # "CONFIRM_FIX" or "CANCEL"


# ============================================================================
# Seating Arrangement Processor
# ============================================================================


class SeatingArrangementProcessor:
    """
    Process MSBTE seating arrangement file.

    Format: SR No | Seat Number | Inst Code | Course Code | Semester | Master Code | Paper Code

    Students appear for multiple papers (one row per paper per student).
    This processor groups papers by student and validates against DB.
    """

    def __init__(self, exam_center_id: str):
        self.exam_center_id = exam_center_id
        self.temp_sessions = {}  # Store temp data for correction flow

    def _get_uploaded_file(self, stored_filename: str) -> Optional[Dict]:
        """Get the uploaded seating arrangement file"""
        result = db.execute_query(
            """
            SELECT stored_filename, status, original_filename, connected_institute_id
            FROM uploads
            WHERE exam_center_id = :exam_center_id 
                AND file_type = 'seatingarrangement'
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
            "connected_institute_id": result[0].get("connected_institute_id"),
        }

    def _parse_seating_arrangement(self, file_path: str) -> Dict:
        """
        Parse seating arrangement Excel file.
        Returns grouped data: { seat_number: { scheme, paper_codes: [] } }
        """
        try:
            df = pd.read_excel(file_path, dtype=str).fillna("")

            columns = list(df.columns)
            logger.info(f"Seating arrangement columns: {columns}")

            # Map columns by position (MSBTE format)
            seat_col = 1
            inst_col = 2
            course_col = 3
            semester_col = 4
            master_col = 5
            paper_col = 6

            # Try to find columns by name if available
            for idx, col in enumerate(columns):
                col_str = str(col).strip().lower()
                if "seat" in col_str and "number" in col_str:
                    seat_col = idx
                elif "inst" in col_str and "code" in col_str:
                    inst_col = idx
                elif "course" in col_str and "code" in col_str:
                    course_col = idx
                elif "semester" in col_str:
                    semester_col = idx
                elif "master" in col_str and "code" in col_str:
                    master_col = idx
                elif "paper" in col_str and "code" in col_str:
                    paper_col = idx

            grouped = {}

            for _, row in df.iterrows():
                # Get seat number
                seat_val = str(row.iloc[seat_col] if seat_col < len(row) else "").strip()
                if not seat_val or not seat_val.isdigit():
                    continue

                seat_number = int(seat_val)
                paper_code = str(row.iloc[paper_col] if paper_col < len(row) else "").strip()

                # Skip if no paper code
                if not paper_code or paper_code in ["nan", "None", ""]:
                    continue

                # Get other fields
                institute_code = str(row.iloc[inst_col] if inst_col < len(row) else "").strip()
                course_code = str(row.iloc[course_col] if course_col < len(row) else "").strip()
                semester = str(row.iloc[semester_col] if semester_col < len(row) else "").strip()
                master_code = str(row.iloc[master_col] if master_col < len(row) else "").strip()

                # Build scheme from Course + Semester + Master
                scheme = course_code
                if semester:
                    scheme += f"-{semester}"
                if master_code:
                    scheme += f"-{master_code}"

                # Map institute code to connected institute ID
                institute_id = self._get_institute_id(institute_code)

                # Initialize student record if not exists
                if seat_number not in grouped:
                    grouped[seat_number] = {
                        "seat_number": seat_number,
                        "institute_code": institute_code,
                        "institute_id": institute_id,
                        "scheme": scheme,
                        "paper_codes": [],
                    }

                # Add paper code if not already present
                if paper_code not in grouped[seat_number]["paper_codes"]:
                    grouped[seat_number]["paper_codes"].append(paper_code)

            logger.info(f"Parsed {len(grouped)} students from seating arrangement file")
            return grouped

        except Exception as e:
            logger.error(f"Error parsing seating arrangement: {e}")
            import traceback

            traceback.print_exc()
            return {}

    def _get_institute_id(self, institute_code: str) -> Optional[str]:
        """Get connected institute ID from code"""
        if not institute_code:
            return None

        result = db.execute_query(
            """
            SELECT id FROM connected_institutes
            WHERE exam_center_id = :exam_center_id 
                AND institute_code = :institute_code 
                AND is_active = true
        """,
            {"exam_center_id": self.exam_center_id, "institute_code": institute_code},
        )

        return result[0]["id"] if result else None

    def _clean_sub_codes(self, sub_codes) -> List[str]:
        """
        Clean sub_codes from database - filter out empty strings and strip whitespace.
        Returns list of strings that can be converted to int.
        """
        if isinstance(sub_codes, str):
            sub_codes = json.loads(sub_codes) if sub_codes else []
        elif sub_codes is None:
            sub_codes = []

        # Filter out empty strings and strip whitespace
        return [str(code).strip() for code in sub_codes if code and str(code).strip()]

    def _convert_to_int_set(self, codes: List[str]) -> set:
        """Convert list of string codes to set of integers"""
        int_set = set()
        for code in codes:
            try:
                int_set.add(int(code))
            except (ValueError, TypeError):
                # If code can't be converted to int, skip it
                pass
        return int_set

    def _validate_seating_arrangement(self, parsed_data: Dict) -> Dict:
        """
        Validate each student's paper codes against DB.
        Returns validation result with mismatches.
        """
        mismatches = []

        # Get existing students from DB for seat number lookup
        db_students = db.execute_query(
            """
            SELECT 
                seat_number,
                sub_codes,
                scheme
            FROM students
            WHERE exam_center_id = :exam_center_id AND is_deleted = false
        """,
            {"exam_center_id": self.exam_center_id},
        )

        # Build DB map: seat_number -> set of integer sub_codes
        db_seat_map = {}
        for student in db_students:
            seat = student.get("seat_number")
            if seat:
                sub_codes = self._clean_sub_codes(student.get("sub_codes"))
                db_seat_map[seat] = self._convert_to_int_set(sub_codes)

        # Build parsed map: seat_number -> set of integer paper_codes
        parsed_seat_map = {}
        for seat_number, student_data in parsed_data.items():
            paper_codes = student_data.get("paper_codes", [])
            paper_codes = [str(p).strip() for p in paper_codes if p and str(p).strip()]
            parsed_seat_map[seat_number] = self._convert_to_int_set(paper_codes)

        # Compare each seat
        all_seats = set(parsed_seat_map.keys()) | set(db_seat_map.keys())

        for seat_number in all_seats:
            parsed_codes = parsed_seat_map.get(seat_number, set())
            db_codes = db_seat_map.get(seat_number, set())

            # Find differences
            missing = db_codes - parsed_codes
            extra = parsed_codes - db_codes

            if missing or extra:
                mismatches.append(
                    {
                        "seat_number": seat_number,
                        "expected_subjects": sorted(list(db_codes)),
                        "actual_subjects": sorted(list(parsed_codes)),
                        "missing_subjects": sorted(list(missing)),
                        "extra_subjects": sorted(list(extra)),
                        "issue_type": self._determine_issue_type(missing, extra),
                    }
                )

        if mismatches:
            temp_session_id = str(uuid4())
            self.temp_sessions[temp_session_id] = {
                "parsed_data": parsed_data,
                "mismatches": mismatches,
                "created_at": datetime.now().isoformat(),
            }
            return {
                "status": "needs_correction",
                "mismatches": mismatches,
                "temp_session_id": temp_session_id,
                "total_students": len(parsed_seat_map),
                "mismatch_count": len(mismatches),
            }

        return {"status": "saved", "mismatches": []}

    def _determine_issue_type(self, missing: set, extra: set) -> str:
        """Determine the type of issue based on missing and extra codes"""
        if missing and extra:
            return "BOTH_MISSING_AND_EXTRA"
        elif missing:
            return "MISSING_SUBJECTS"
        elif extra:
            return "EXTRA_SUBJECTS"
        return "UNKNOWN"

    def _apply_corrections(self, parsed_data: Dict) -> Dict:
        """
        Auto-correct using DB student data as truth.
        For existing students, use DB sub_codes and scheme.
        For new students, keep parsed data.
        """
        corrected = {}

        # Get existing students from DB
        db_students = db.execute_query(
            """
            SELECT 
                seat_number,
                sub_codes,
                scheme
            FROM students
            WHERE exam_center_id = :exam_center_id AND is_deleted = false
        """,
            {"exam_center_id": self.exam_center_id},
        )

        db_seat_map = {}
        for student in db_students:
            seat = student.get("seat_number")
            if seat:
                sub_codes = self._clean_sub_codes(student.get("sub_codes"))
                db_seat_map[seat] = {"sub_codes": sub_codes, "scheme": student.get("scheme", "")}

        for seat_number, student_data in parsed_data.items():
            # If student exists in DB, use DB data
            if seat_number in db_seat_map:
                db_data = db_seat_map[seat_number]
                corrected[seat_number] = {
                    "seat_number": seat_number,
                    "institute_code": student_data.get("institute_code", ""),
                    "institute_id": student_data.get("institute_id"),
                    "scheme": db_data.get("scheme", student_data.get("scheme", "")),
                    "paper_codes": db_data.get("sub_codes", []),
                }
            else:
                # New student - keep parsed data
                paper_codes = student_data.get("paper_codes", [])
                paper_codes = [str(p).strip() for p in paper_codes if p and str(p).strip()]

                corrected[seat_number] = {
                    "seat_number": seat_number,
                    "institute_code": student_data.get("institute_code", ""),
                    "institute_id": student_data.get("institute_id"),
                    "scheme": student_data.get("scheme", ""),
                    "paper_codes": paper_codes,
                }

        return corrected

    def _insert_seating_arrangement(self, students_data: Dict, connected_institute_id: str) -> Dict:
        """Insert or update students in database"""

        inserted = 0
        updated = 0
        skipped = 0

        for seat_number, student_data in students_data.items():
            institute_id = student_data.get("institute_id") or connected_institute_id

            if not institute_id:
                logger.warning(f"No institute ID for seat {seat_number}, skipping")
                skipped += 1
                continue

            # Get institute info
            inst = db.execute_query(
                """
                SELECT id, institute_code, institute_name
                FROM connected_institutes
                WHERE id = :institute_id AND exam_center_id = :exam_center_id AND is_active = true
            """,
                {"institute_id": institute_id, "exam_center_id": self.exam_center_id},
            )

            if not inst:
                logger.warning(f"Institute {institute_id} not found, skipping seat {seat_number}")
                skipped += 1
                continue

            institute_code = inst[0]["institute_code"]

            paper_codes = student_data.get("paper_codes", [])
            scheme = student_data.get("scheme", "")

            # Get subject names for display (subjects array)
            subjects = []
            if paper_codes:
                subject_result = db.execute_query(
                    """
                    SELECT name FROM subjects
                    WHERE code = ANY(:codes) AND scheme = :scheme AND is_deleted = false
                """,
                    {"codes": paper_codes, "scheme": scheme},
                )
                subjects = [row["name"] for row in subject_result]

            subjects_json = json.dumps(subjects)
            sub_codes_json = json.dumps(paper_codes)

            # Check if student exists
            existing = db.execute_query(
                """
                SELECT id FROM students
                WHERE exam_center_id = :exam_center_id AND seat_number = :seat_number
                AND is_deleted = false
            """,
                {"exam_center_id": self.exam_center_id, "seat_number": seat_number},
            )

            if existing:
                db.execute_update(
                    """
                    UPDATE students
                    SET connected_institute_id = :institute_id,
                        institute_code = :institute_code,
                        scheme = :scheme,
                        subjects = CAST(:subjects AS jsonb),
                        sub_codes = CAST(:sub_codes AS jsonb),
                        updated_at = NOW()
                    WHERE exam_center_id = :exam_center_id AND seat_number = :seat_number
                """,
                    {
                        "exam_center_id": self.exam_center_id,
                        "institute_id": institute_id,
                        "institute_code": institute_code,
                        "seat_number": seat_number,
                        "scheme": scheme,
                        "subjects": subjects_json,
                        "sub_codes": sub_codes_json,
                    },
                )
                updated += 1
            else:
                db.execute_update(
                    """
                    INSERT INTO students (
                        id, exam_center_id, connected_institute_id, seat_number,
                        institute_code, scheme, subjects, sub_codes, is_deleted
                    ) VALUES (
                        gen_random_uuid(), :exam_center_id, :institute_id, :seat_number,
                        :institute_code, :scheme, CAST(:subjects AS jsonb), 
                        CAST(:sub_codes AS jsonb), false
                    )
                """,
                    {
                        "exam_center_id": self.exam_center_id,
                        "institute_id": institute_id,
                        "institute_code": institute_code,
                        "seat_number": seat_number,
                        "scheme": scheme,
                        "subjects": subjects_json,
                        "sub_codes": sub_codes_json,
                    },
                )
                inserted += 1

        return {
            "inserted": inserted,
            "updated": updated,
            "skipped": skipped,
            "total": inserted + updated + skipped,
        }

    def _update_timetable_counts(self) -> int:
        """Update timetable student counts based on seating arrangement"""
        # Get all students grouped by subject and scheme
        students = db.execute_query(
            """
            SELECT sub_codes, scheme
            FROM students
            WHERE exam_center_id = :exam_center_id AND is_deleted = false
        """,
            {"exam_center_id": self.exam_center_id},
        )

        # Count students per subject+scheme
        subject_counts = {}
        for student in students:
            sub_codes = self._clean_sub_codes(student.get("sub_codes"))
            scheme = str(student.get("scheme", "")).strip()

            for code in sub_codes:
                key = f"{code}_{scheme}"
                subject_counts[key] = subject_counts.get(key, 0) + 1

        # Update timetable
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
            key = f"{entry['subject_code']}_{entry['scheme']}"
            count = subject_counts.get(key, 0)

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

    # ============================================================
    # MAIN PROCESSING
    # ============================================================

    def process(self, stored_filename: str) -> Dict:
        """Main processing function"""

        upload = self._get_uploaded_file(stored_filename)
        if not upload:
            return {"success": False, "error": f"File not found: {stored_filename}"}

        if not os.path.exists(upload["file_path"]):
            return {"success": False, "error": f"File not found on server: {stored_filename}"}

        connected_institute_id = upload.get("connected_institute_id")

        # Update status to PROCESSING
        db.execute_update(
            """
            UPDATE uploads 
            SET status = 'PROCESSING', updated_at = NOW()
            WHERE exam_center_id = :exam_center_id 
                AND file_type = 'seatingarrangement'
                AND stored_filename = :stored_filename
        """,
            {"exam_center_id": self.exam_center_id, "stored_filename": stored_filename},
        )

        # Parse the file
        parsed_data = self._parse_seating_arrangement(upload["file_path"])

        if not parsed_data:
            db.execute_update(
                """
                UPDATE uploads 
                SET status = 'FAILED', 
                    error_message = 'No valid seating arrangement data found',
                    updated_at = NOW()
                WHERE exam_center_id = :exam_center_id 
                    AND file_type = 'seatingarrangement'
                    AND stored_filename = :stored_filename
            """,
                {"exam_center_id": self.exam_center_id, "stored_filename": stored_filename},
            )
            return {"success": False, "error": "No valid seating arrangement data found in file"}

        # STEP 1: Validate against DB
        validation_result = self._validate_seating_arrangement(parsed_data)

        # STEP 2: If validation fails, return correction request
        if validation_result["status"] == "needs_correction":
            return {
                "success": True,
                "status": "needs_correction",
                "data": {
                    "temp_session_id": validation_result["temp_session_id"],
                    "total_students": validation_result["total_students"],
                    "mismatch_count": validation_result["mismatch_count"],
                    "mismatches": validation_result["mismatches"],
                },
                "message": f"Found {validation_result['mismatch_count']} mismatches. Please review and confirm fixes.",
            }

        # STEP 3: No mismatches - insert directly
        stats = self._insert_seating_arrangement(parsed_data, connected_institute_id)
        timetable_updated = self._update_timetable_counts()

        # Update status to PROCESSED
        db.execute_update(
            """
            UPDATE uploads 
            SET status = 'PROCESSED', 
                record_count = :count,
                processed_at = NOW(),
                updated_at = NOW()
            WHERE exam_center_id = :exam_center_id 
                AND file_type = 'seatingarrangement'
                AND stored_filename = :stored_filename
        """,
            {
                "count": stats["total"],
                "exam_center_id": self.exam_center_id,
                "stored_filename": stored_filename,
            },
        )

        logger.info(
            f"Seating arrangement processed: {stats['inserted']} inserted, {stats['updated']} updated"
        )

        return {
            "success": True,
            "status": "saved",
            "message": "Seating arrangement processed successfully",
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

    # ============================================================
    # FIX MISMATCHES
    # ============================================================

    def fix_mismatches(self, temp_session_id: str, action: str) -> Dict:
        """Apply fixes to mismatches or cancel the session"""

        if temp_session_id not in self.temp_sessions:
            return {"success": False, "error": "Invalid or expired session ID"}

        session_data = self.temp_sessions[temp_session_id]
        parsed_data = session_data["parsed_data"]
        mismatches = session_data["mismatches"]

        if action == "CANCEL":
            del self.temp_sessions[temp_session_id]
            return {
                "success": True,
                "status": "cancelled",
                "message": f"Cancelled correction for {len(mismatches)} mismatches. No changes made.",
            }

        if action == "CONFIRM_FIX":
            # Apply corrections using DB truth
            corrected_data = self._apply_corrections(parsed_data)

            # Get connected_institute_id from the first student or from session
            connected_institute_id = None
            for seat, data in corrected_data.items():
                if data.get("institute_id"):
                    connected_institute_id = data["institute_id"]
                    break

            # Insert corrected data
            stats = self._insert_seating_arrangement(corrected_data, connected_institute_id)
            timetable_updated = self._update_timetable_counts()

            # Get stored_filename from session
            stored_filename = session_data.get("stored_filename", "unknown")

            # Update upload status
            db.execute_update(
                """
                UPDATE uploads 
                SET status = 'PROCESSED', 
                    record_count = :count,
                    processed_at = NOW(),
                    updated_at = NOW()
                WHERE exam_center_id = :exam_center_id 
                    AND file_type = 'seatingarrangement'
                    AND stored_filename = :stored_filename
            """,
                {
                    "count": stats["total"],
                    "exam_center_id": self.exam_center_id,
                    "stored_filename": stored_filename,
                },
            )

            del self.temp_sessions[temp_session_id]

            return {
                "success": True,
                "status": "fixed",
                "message": f"Fixed {len(mismatches)} mismatches and saved data",
                "data": {
                    "total_students": stats["total"],
                    "inserted": stats["inserted"],
                    "updated": stats["updated"],
                    "skipped": stats["skipped"],
                    "timetable_entries_updated": timetable_updated,
                    "mismatches_fixed": len(mismatches),
                },
            }

        return {"success": False, "error": "Invalid action. Use CONFIRM_FIX or CANCEL"}


# ============================================================================
# API Endpoints
# ============================================================================


@router.post("/process")
async def process_seating_arrangement(
    request: ProcessSeatingArrangementRequest, exam_center_id: str = Depends(get_exam_center_id)
):
    """Process a specific uploaded seating arrangement file with validation"""
    processor = SeatingArrangementProcessor(exam_center_id)
    result = processor.process(request.stored_filename)

    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])

    return success_response(
        data=result.get("data"), message=result.get("message", "Processing complete")
    )


@router.post("/fix-mismatches")
async def fix_seating_mismatches(
    request: FixMismatchesRequest, exam_center_id: str = Depends(get_exam_center_id)
):
    """Fix mismatches in seating arrangement data"""
    processor = SeatingArrangementProcessor(exam_center_id)
    result = processor.fix_mismatches(request.temp_session_id, request.action)

    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])

    return success_response(data=result.get("data"), message=result.get("message"))


@router.get("/temp-session/{temp_session_id}")
async def get_temp_session_status(
    temp_session_id: str, exam_center_id: str = Depends(get_exam_center_id)
):
    """Get status of a temporary correction session"""
    processor = SeatingArrangementProcessor(exam_center_id)

    if temp_session_id not in processor.temp_sessions:
        raise HTTPException(status_code=404, detail="Session not found or expired")

    session_data = processor.temp_sessions[temp_session_id]

    return success_response(
        data={
            "temp_session_id": temp_session_id,
            "mismatch_count": len(session_data.get("mismatches", [])),
            "created_at": session_data.get("created_at"),
            "mismatches": session_data.get("mismatches", []),
        },
        message=f"Found {len(session_data.get('mismatches', []))} mismatches",
    )
