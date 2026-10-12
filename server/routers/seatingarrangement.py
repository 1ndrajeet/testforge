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

    Optimized: batches every DB call.
      - 1 query to load all connected_institutes for the center
      - 1 query to load all existing students for the center
      - 1 query to load all relevant subjects
      - 1 batch UPSERT for all students
      - 1 query to load timetable rows + 1 batch UPDATE via executemany
    """

    def __init__(self, exam_center_id: str):
        self.exam_center_id = exam_center_id
        self.temp_sessions = {}

    # ------------------------------------------------------------
    # Load helpers — one round-trip each
    # ------------------------------------------------------------

    def _load_upload(self, stored_filename: str) -> Optional[Dict]:
        rows = db.execute_query(
            """
            SELECT stored_filename, status, original_filename, connected_institute_id
            FROM uploads
            WHERE exam_center_id = :ec
              AND file_type = 'seatingarrangement'
              AND stored_filename = :sfn
            LIMIT 1
            """,
            {"ec": self.exam_center_id, "sfn": stored_filename},
        )
        if not rows:
            return None
        r = rows[0]
        return {
            "stored_filename": r["stored_filename"],
            "file_path": os.path.join(settings.UPLOAD_DIR, r["stored_filename"]),
            "status": r["status"],
            "original_filename": r["original_filename"],
            "connected_institute_id": r.get("connected_institute_id"),
        }

    def _load_institutes_map(self) -> Dict[str, str]:
        """code -> id, in one query."""
        rows = db.execute_query(
            """
            SELECT id, institute_code
            FROM connected_institutes
            WHERE exam_center_id = :ec AND is_active = true
            """,
            {"ec": self.exam_center_id},
        )
        return {str(r["institute_code"]).strip(): r["id"] for r in rows if r.get("institute_code")}

    def _load_existing_students(self) -> Dict[int, Dict]:
        """seat_number -> { id, sub_codes:[], scheme }"""
        rows = db.execute_query(
            """
            SELECT id, seat_number, sub_codes, scheme
            FROM students
            WHERE exam_center_id = :ec AND is_deleted = false
            """,
            {"ec": self.exam_center_id},
        )
        out: Dict[int, Dict] = {}
        for r in rows:
            seat = r.get("seat_number")
            if seat is None:
                continue
            out[int(seat)] = {
                "id": r["id"],
                "sub_codes": self._clean_sub_codes(r.get("sub_codes")),
                "scheme": r.get("scheme") or "",
            }
        return out

    def _load_subject_names(self, codes_schemes: set) -> Dict[tuple, str]:
        """
        codes_schemes: set of (code, scheme). Returns (code, scheme) -> name.
        Single query with two-column IN via OR — or split into batches if huge.
        """
        if not codes_schemes:
            return {}

        codes = list({c for c, _ in codes_schemes})
        schemes = list({s for _, s in codes_schemes})

        rows = db.execute_query(
            """
            SELECT code, scheme, name
            FROM subjects
            WHERE code = ANY(:codes) AND scheme = ANY(:schemes) AND is_deleted = false
            """,
            {"codes": codes, "schemes": schemes},
        )
        return {(str(r["code"]), str(r["scheme"])): r["name"] for r in rows}

    # ------------------------------------------------------------
    # Parsing (unchanged in behavior)
    # ------------------------------------------------------------

    def _parse_seating_arrangement(self, file_path: str, institutes_map: Dict[str, str]) -> Dict:
        try:
            df = pd.read_excel(file_path, dtype=str).fillna("")
            columns = list(df.columns)
            logger.info(f"Seating arrangement columns: {columns}")

            seat_col, inst_col, course_col = 1, 2, 3
            semester_col, master_col, paper_col = 4, 5, 6

            for idx, col in enumerate(columns):
                s = str(col).strip().lower()
                if "seat" in s and "number" in s:
                    seat_col = idx
                elif "inst" in s and "code" in s:
                    inst_col = idx
                elif "course" in s and "code" in s:
                    course_col = idx
                elif "semester" in s:
                    semester_col = idx
                elif "master" in s and "code" in s:
                    master_col = idx
                elif "paper" in s and "code" in s:
                    paper_col = idx

            grouped: Dict[int, Dict] = {}

            for row in df.itertuples(index=False, name=None):
                seat_val = str(row[seat_col] if seat_col < len(row) else "").strip()
                if not seat_val or not seat_val.isdigit():
                    continue

                seat_number = int(seat_val)
                paper_code = str(row[paper_col] if paper_col < len(row) else "").strip()
                if not paper_code or paper_code.lower() in ("nan", "none", ""):
                    continue

                inst_code = str(row[inst_col] if inst_col < len(row) else "").strip()
                course = str(row[course_col] if course_col < len(row) else "").strip()
                sem = str(row[semester_col] if semester_col < len(row) else "").strip()
                master = str(row[master_col] if master_col < len(row) else "").strip()

                scheme = course
                if sem:
                    scheme += f"-{sem}"
                if master:
                    scheme += f"-{master}"

                entry = grouped.get(seat_number)
                if entry is None:
                    entry = {
                        "seat_number": seat_number,
                        "institute_code": inst_code,
                        "institute_id": institutes_map.get(inst_code),
                        "scheme": scheme,
                        "paper_codes": [],
                    }
                    grouped[seat_number] = entry

                if paper_code not in entry["paper_codes"]:
                    entry["paper_codes"].append(paper_code)

            logger.info(f"Parsed {len(grouped)} students")
            return grouped

        except Exception as e:
            logger.error(f"Error parsing seating arrangement: {e}")
            import traceback
            traceback.print_exc()
            return {}

    # ------------------------------------------------------------
    # Cleaning / conversion helpers (unchanged)
    # ------------------------------------------------------------

    def _clean_sub_codes(self, sub_codes) -> List[str]:
        if isinstance(sub_codes, str):
            sub_codes = json.loads(sub_codes) if sub_codes else []
        elif sub_codes is None:
            sub_codes = []
        return [str(c).strip() for c in sub_codes if c and str(c).strip()]

    def _to_int_set(self, codes: List[str]) -> set:
        out = set()
        for c in codes:
            try:
                out.add(int(c))
            except (ValueError, TypeError):
                pass
        return out

    # ------------------------------------------------------------
    # Validation (in-memory; no DB hits)
    # ------------------------------------------------------------

    def _validate(self, parsed: Dict, existing: Dict[int, Dict]) -> Dict:
        mismatches = []

        db_map = {seat: self._to_int_set(s["sub_codes"]) for seat, s in existing.items()}
        parsed_map = {seat: self._to_int_set(s["paper_codes"]) for seat, s in parsed.items()}

        for seat in set(db_map) | set(parsed_map):
            a = parsed_map.get(seat, set())
            b = db_map.get(seat, set())
            missing = b - a
            extra = a - b
            if missing or extra:
                mismatches.append({
                    "seat_number": seat,
                    "expected_subjects": sorted(b),
                    "actual_subjects": sorted(a),
                    "missing_subjects": sorted(missing),
                    "extra_subjects": sorted(extra),
                    "issue_type": self._issue_type(missing, extra),
                })

        if mismatches:
            sid = str(uuid4())
            self.temp_sessions[sid] = {
                "parsed_data": parsed,
                "mismatches": mismatches,
                "created_at": datetime.now().isoformat(),
            }
            return {
                "status": "needs_correction",
                "mismatches": mismatches,
                "temp_session_id": sid,
                "total_students": len(parsed_map),
                "mismatch_count": len(mismatches),
            }

        return {"status": "saved", "mismatches": []}

    def _issue_type(self, missing: set, extra: set) -> str:
        if missing and extra:
            return "BOTH_MISSING_AND_EXTRA"
        if missing:
            return "MISSING_SUBJECTS"
        if extra:
            return "EXTRA_SUBJECTS"
        return "UNKNOWN"

    # ------------------------------------------------------------
    # Correction (in-memory; no DB hits)
    # ------------------------------------------------------------

    def _apply_corrections(self, parsed: Dict, existing: Dict[int, Dict]) -> Dict:
        corrected = {}
        for seat, s in parsed.items():
            if seat in existing:
                db_row = existing[seat]
                corrected[seat] = {
                    "seat_number": seat,
                    "institute_code": s.get("institute_code", ""),
                    "institute_id": s.get("institute_id"),
                    "scheme": db_row["scheme"] or s.get("scheme", ""),
                    "paper_codes": db_row["sub_codes"],
                }
            else:
                corrected[seat] = {
                    **s,
                    "paper_codes": [str(p).strip() for p in s.get("paper_codes", []) if p and str(p).strip()],
                }
        return corrected

    # ------------------------------------------------------------
    # Batch persistence
    # ------------------------------------------------------------

    def _batch_upsert_students(
        self,
        students: Dict[int, Dict],
        default_institute_id: Optional[str],
        existing: Dict[int, Dict],
        subject_names: Dict[tuple, str],
    ) -> Dict[str, int]:
        """
        One INSERT ... ON CONFLICT per row is still N queries.
        Cheaper: build a single VALUES list and send one statement.
        """
        rows_to_update = []
        rows_to_insert = []

        for seat, s in students.items():
            institute_id = s.get("institute_id") or default_institute_id
            if not institute_id:
                logger.warning(f"Skipping seat {seat}: no institute")
                continue

            paper_codes = s.get("paper_codes", [])
            scheme = s.get("scheme", "")
            subjects = [
                subject_names.get((str(code), scheme))
                for code in paper_codes
                if subject_names.get((str(code), scheme))
            ]

            payload = {
                "seat_number": seat,
                "institute_id": institute_id,
                "institute_code": s.get("institute_code", ""),
                "scheme": scheme,
                "subjects": json.dumps(subjects),
                "sub_codes": json.dumps(paper_codes),
            }

            if seat in existing:
                rows_to_update.append(payload)
            else:
                rows_to_insert.append(payload)

        # If everything is uniform, use executemany — one statement, N param sets
        if rows_to_update:
            db.execute_many(
                """
                UPDATE students
                SET connected_institute_id = :institute_id,
                    institute_code = :institute_code,
                    scheme = :scheme,
                    subjects = CAST(:subjects AS jsonb),
                    sub_codes = CAST(:sub_codes AS jsonb),
                    updated_at = NOW()
                WHERE exam_center_id = :ec AND seat_number = :seat_number AND is_deleted = false
                """,
                [{**r, "ec": self.exam_center_id} for r in rows_to_update],
            )

        if rows_to_insert:
            db.execute_many(
                """
                INSERT INTO students (
                    id, exam_center_id, connected_institute_id, seat_number,
                    institute_code, scheme, subjects, sub_codes, is_deleted
                ) VALUES (
                    gen_random_uuid(), :ec, :institute_id, :seat_number,
                    :institute_code, :scheme,
                    CAST(:subjects AS jsonb), CAST(:sub_codes AS jsonb), false
                )
                """,
                [{**r, "ec": self.exam_center_id} for r in rows_to_insert],
            )

        return {
            "inserted": len(rows_to_insert),
            "updated": len(rows_to_update),
            "skipped": len(students) - len(rows_to_insert) - len(rows_to_update),
            "total": len(students),
        }

    def _batch_update_timetable(self) -> int:
        """Single UPDATE via JOIN — replaces N round-trips."""
        # Count students per (subject_code, scheme) in one query
        rows = db.execute_query(
            """
            SELECT
                jsonb_array_elements_text(sub_codes) AS code,
                scheme,
                COUNT(*) AS cnt
            FROM students
            WHERE exam_center_id = :ec AND is_deleted = false
            GROUP BY code, scheme
            """,
            {"ec": self.exam_center_id},
        )

        if not rows:
            return 0

        # Build a VALUES table (code, scheme, count) and JOIN
        values_sql = ", ".join(
            f"(:c{i}, :s{i}, :n{i})" for i in range(len(rows))
        )
        params: Dict[str, object] = {"ec": self.exam_center_id}
        for i, r in enumerate(rows):
            params[f"c{i}"] = str(r["code"]).strip()
            params[f"s{i}"] = str(r["scheme"]).strip()
            params[f"n{i}"] = int(r["cnt"])

        db.execute_update(
            f"""
            UPDATE timetable t
            SET total_students = v.cnt, updated_at = NOW()
            FROM (VALUES {values_sql}) AS v(subject_code, scheme, cnt)
            WHERE t.exam_center_id = :ec
              AND t.subject_code = v.subject_code
              AND t.scheme = v.scheme
            """,
            params,
        )
        return len(rows)

    # ------------------------------------------------------------
    # Main
    # ------------------------------------------------------------

    def process(self, stored_filename: str) -> Dict:
        upload = self._load_upload(stored_filename)
        if not upload:
            return {"success": False, "error": f"File not found: {stored_filename}"}
        if not os.path.exists(upload["file_path"]):
            return {"success": False, "error": f"File missing on disk: {stored_filename}"}

        # Mark PROCESSING (1 query)
        db.execute_update(
            """
            UPDATE uploads SET status = 'PROCESSING', updated_at = NOW()
            WHERE exam_center_id = :ec AND file_type = 'seatingarrangement' AND stored_filename = :sfn
            """,
            {"ec": self.exam_center_id, "sfn": stored_filename},
        )

        # Preload everything in 3 queries
        institutes_map = self._load_institutes_map()
        existing = self._load_existing_students()

        parsed = self._parse_seating_arrangement(upload["file_path"], institutes_map)

        if not parsed:
            db.execute_update(
                """
                UPDATE uploads SET status = 'FAILED',
                    error_message = 'No valid seating arrangement data found',
                    updated_at = NOW()
                WHERE exam_center_id = :ec AND file_type = 'seatingarrangement' AND stored_filename = :sfn
                """,
                {"ec": self.exam_center_id, "sfn": stored_filename},
            )
            return {"success": False, "error": "No valid seating arrangement data found"}

        # Validate in-memory
        validation = self._validate(parsed, existing)
        if validation["status"] == "needs_correction":
            # stash stored_filename for the fix flow
            self.temp_sessions[validation["temp_session_id"]]["stored_filename"] = stored_filename
            return {
                "success": True,
                "status": "needs_correction",
                "data": {
                    "temp_session_id": validation["temp_session_id"],
                    "total_students": validation["total_students"],
                    "mismatch_count": validation["mismatch_count"],
                    "mismatches": validation["mismatches"],
                },
                "message": f"Found {validation['mismatch_count']} mismatches. Please review and confirm fixes.",
            }

        # No mismatches → persist
        subject_names = self._load_subject_names(
            {(str(code), s["scheme"]) for seat, s in parsed.items() for code in s["paper_codes"]}
        )

        stats = self._batch_upsert_students(
            parsed, upload.get("connected_institute_id"), existing, subject_names
        )
        tt_updated = self._batch_update_timetable()

        db.execute_update(
            """
            UPDATE uploads SET status = 'PROCESSED',
                record_count = :count, processed_at = NOW(), updated_at = NOW()
            WHERE exam_center_id = :ec AND file_type = 'seatingarrangement' AND stored_filename = :sfn
            """,
            {"count": stats["total"], "ec": self.exam_center_id, "sfn": stored_filename},
        )

        return {
            "success": True,
            "status": "saved",
            "message": "Seating arrangement processed successfully",
            "data": {
                **stats,
                "timetable_entries_updated": tt_updated,
                "exam_center_id": self.exam_center_id,
                "stored_filename": stored_filename,
            },
        }

    def fix_mismatches(self, temp_session_id: str, action: str) -> Dict:
        session = self.temp_sessions.get(temp_session_id)
        if not session:
            return {"success": False, "error": "Invalid or expired session ID"}

        mismatches = session["mismatches"]
        stored_filename = session.get("stored_filename", "unknown")

        if action == "CANCEL":
            del self.temp_sessions[temp_session_id]
            return {
                "success": True,
                "status": "cancelled",
                "message": f"Cancelled correction for {len(mismatches)} mismatches.",
            }

        if action != "CONFIRM_FIX":
            return {"success": False, "error": "Invalid action"}

        # Reload existing students (they might have changed since process ran)
        existing = self._load_existing_students()
        corrected = self._apply_corrections(session["parsed_data"], existing)

        subject_names = self._load_subject_names(
            {(str(code), s["scheme"]) for seat, s in corrected.items() for code in s["paper_codes"]}
        )

        # Connected institute: any from corrected, else None
        default_institute = next(
            (s.get("institute_id") for s in corrected.values() if s.get("institute_id")), None
        )

        stats = self._batch_upsert_students(corrected, default_institute, existing, subject_names)
        tt_updated = self._batch_update_timetable()

        db.execute_update(
            """
            UPDATE uploads SET status = 'PROCESSED',
                record_count = :count, processed_at = NOW(), updated_at = NOW()
            WHERE exam_center_id = :ec AND file_type = 'seatingarrangement' AND stored_filename = :sfn
            """,
            {"count": stats["total"], "ec": self.exam_center_id, "sfn": stored_filename},
        )

        del self.temp_sessions[temp_session_id]

        return {
            "success": True,
            "status": "fixed",
            "message": f"Fixed {len(mismatches)} mismatches and saved data",
            "data": {**stats, "timetable_entries_updated": tt_updated, "mismatches_fixed": len(mismatches)},
        }
        

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
