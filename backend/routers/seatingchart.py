# backend/routers/seatingchart.py
from fastapi import APIRouter, HTTPException, Depends
import os
import logging
from datetime import datetime
from typing import List, Dict, Optional, Any
import pandas as pd
from sqlalchemy import text
from pydantic import BaseModel
from uuid import uuid4

from config import settings, db
from auth import get_exam_center_id
from utils import success_response, error_response

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


class SeatingChartProcessRequest(BaseModel):
    connected_institute_id: Optional[str] = None


# ============================================================================
# Seating Chart Processor
# ============================================================================

class SeatingChartProcessor:
    """Process seating chart from uploaded Excel files (V2 schema)"""
    
    def __init__(self, exam_center_id: str):
        self.exam_center_id = exam_center_id
        self.scheme_data = self._load_scheme_data()
        self.institute_cache = self._load_institute_cache()
    
    def _load_scheme_data(self) -> Dict[str, Dict[str, str]]:
        """Load scheme data mapping (scheme -> abbr -> code)"""
        result = db.execute_query("""
            SELECT code, abbr, scheme
            FROM subjects
            WHERE is_deleted = false
        """)
        
        scheme_data = {}
        for row in result:
            scheme = row['scheme']
            if scheme not in scheme_data:
                scheme_data[scheme] = {}
            scheme_data[scheme][row['abbr']] = row['code']
        
        logger.info(f"Loaded scheme data for {len(scheme_data)} schemes")
        return scheme_data
    
    def _load_institute_cache(self) -> Dict[str, Dict]:
        """Load connected institutes for this exam center"""
        result = db.execute_query("""
            SELECT id, institute_code, institute_name
            FROM connected_institutes
            WHERE exam_center_id = :exam_center_id AND is_active = true
        """, {"exam_center_id": self.exam_center_id})
        
        cache = {}
        for row in result:
            cache[row['institute_code']] = {
                'id': row['id'],
                'name': row['institute_name']
            }
        
        logger.info(f"Loaded {len(cache)} connected institutes")
        return cache
    
    def _get_uploaded_file(self) -> Optional[Dict]:
        """Get the uploaded seating chart Excel file"""
        result = db.execute_query("""
            SELECT stored_filename, status
            FROM uploads
            WHERE exam_center_id = :exam_center_id AND file_type = 'seatingchart'
            ORDER BY created_at DESC
            LIMIT 1
        """, {"exam_center_id": self.exam_center_id})
        
        if not result:
            return None
        
        file_path = os.path.join(settings.UPLOAD_DIR, result[0]['stored_filename'])
        return {
            'stored_filename': result[0]['stored_filename'],
            'file_path': file_path,
            'status': result[0]['status']
        }
    
    def _get_subject_codes(self, subject_string: str, scheme: str) -> tuple:
        """
        Extract subject abbreviations and codes from subject string.
        Returns: (list of subjects, list of sub_codes)
        """
        if not subject_string or subject_string == 'nan':
            return [], []
        
        # Parse subjects - format: "CM-TH, CM-PR" or similar
        subjects = set()
        for sub in subject_string.split(','):
            sub = sub.strip().upper()
            if sub:
                subjects.add(sub)
        
        # Get codes from scheme data
        sub_codes = set()
        scheme_subjects = self.scheme_data.get(scheme, {})
        
        for subject in subjects:
            # Try exact match first
            if subject in scheme_subjects:
                sub_codes.add(scheme_subjects[subject])
            else:
                # Try without type suffix (e.g., "CM" instead of "CM-TH")
                base_subject = subject.split('-')[0] if '-' in subject else subject
                for abbr, code in scheme_subjects.items():
                    if abbr.startswith(base_subject):
                        sub_codes.add(code)
                        break
        
        return list(subjects), list(sub_codes)
    
    def _get_or_create_institute(self, institute_code: str, institute_name: str) -> Optional[str]:
        """Get existing institute ID or create new one"""
        if institute_code in self.institute_cache:
            return self.institute_cache[institute_code]['id']
        
        # Create new connected institute
        try:
            institute_id = str(uuid4())
            db.execute_update("""
                INSERT INTO connected_institutes (
                    id, exam_center_id, institute_code, institute_name, is_active
                ) VALUES (
                    :id, :exam_center_id, :institute_code, :institute_name, true
                )
            """, {
                "id": institute_id,
                "exam_center_id": self.exam_center_id,
                "institute_code": institute_code,
                "institute_name": institute_name
            })
            
            # Update cache
            self.institute_cache[institute_code] = {
                'id': institute_id,
                'name': institute_name
            }
            
            logger.info(f"Created new institute: {institute_code} - {institute_name}")
            return institute_id
            
        except Exception as e:
            logger.error(f"Failed to create institute {institute_code}: {e}")
            return None
    
    def _parse_excel_file(self, file_path: str, institute_code: str) -> List[Dict]:
        """Parse seating chart Excel file"""
        try:
            # Read Excel without header (raw data)
            df = pd.read_excel(file_path, header=None, dtype=str).fillna('')
            
            # Find first row with seat number (numeric in column 1)
            first_row_idx = None
            for idx, row in df.iterrows():
                seat_val = str(row[1]).strip() if len(row) > 1 else ''
                if seat_val and seat_val.isdigit():
                    first_row_idx = idx
                    break
            
            if first_row_idx is None:
                logger.warning(f"No valid data rows found in {file_path}")
                return []
            
            # Process from first data row
            df = df.iloc[first_row_idx:].reset_index(drop=True)
            
            # Expected columns (0-indexed):
            # 0: SR No.
            # 1: Seat Number
            # 2: Enrollment Number
            # 3: Name
            # 4: Scheme
            # 5: Subject Appearing For
            
            students = []
            for _, row in df.iterrows():
                seat_number = str(row[1]).strip()
                if not seat_number or not seat_number.isdigit():
                    continue
                
                enrollment_number = str(row[2]).strip()
                if enrollment_number == 'nan':
                    enrollment_number = None
                
                name = str(row[3]).strip()
                if name == 'nan':
                    name = None
                
                scheme = str(row[4]).strip()
                if scheme == 'nan':
                    scheme = ''
                
                subject_string = str(row[5]).strip()
                if subject_string == 'nan':
                    subject_string = ''
                
                subjects, sub_codes = self._get_subject_codes(subject_string, scheme)
                
                students.append({
                    'seat_number': int(seat_number),
                    'enrollment_number': enrollment_number,
                    'name': name,
                    'scheme': scheme,
                    'subjects': subjects,
                    'sub_codes': sub_codes,
                    'institute_code': institute_code
                })
            
            return students
            
        except Exception as e:
            logger.error(f"Error parsing Excel file {file_path}: {e}")
            return []
    
    def _parse_multiple_files(self, upload_dir: str) -> List[Dict]:
        """Parse all seating chart files for this exam center"""
        # Pattern: seatingchart_{exam_center_id}_*.xlsx or files with institute code
        all_students = []
        
        # First, try to get the main uploaded file
        upload = self._get_uploaded_file()
        if upload and os.path.exists(upload['file_path']):
            # Try to extract institute code from filename or use default
            students = self._parse_excel_file(upload['file_path'], 'DEFAULT')
            all_students.extend(students)
            logger.info(f"Processed main file: {len(students)} students")
        
        # Also look for institute-specific files
        for filename in os.listdir(upload_dir):
            if filename.startswith(f"seatingchart_{self.exam_center_id}_") and filename.endswith(('.xlsx', '.xls')):
                # Extract institute code from filename
                parts = filename.replace('.xlsx', '').replace('.xls', '').split('_')
                institute_code = parts[-1] if len(parts) > 3 else 'UNKNOWN'
                
                file_path = os.path.join(upload_dir, filename)
                if os.path.exists(file_path) and file_path != (upload['file_path'] if upload else None):
                    students = self._parse_excel_file(file_path, institute_code)
                    all_students.extend(students)
                    logger.info(f"Processed institute file {institute_code}: {len(students)} students")
        
        return all_students
    
    def _insert_students(self, students: List[Dict]) -> Dict:
        """Insert or update students in database"""
        inserted = 0
        updated = 0
        skipped = 0
        
        for student in students:
            institute_code = student['institute_code']
            institute_id = self._get_or_create_institute(institute_code, f"Institute {institute_code}")
            
            if not institute_id:
                logger.warning(f"Skipping student with unknown institute: {institute_code}")
                skipped += 1
                continue
            
            # Check if student already exists
            existing = db.execute_query("""
                SELECT id FROM students
                WHERE exam_center_id = :exam_center_id AND seat_number = :seat_number
                AND is_deleted = false
            """, {
                "exam_center_id": self.exam_center_id,
                "seat_number": student['seat_number']
            })
            
            if existing:
                # Update existing student
                db.execute_update("""
                    UPDATE students
                    SET enrollment_number = :enrollment_number,
                        name = :name,
                        scheme = :scheme,
                        subjects = CAST(:subjects AS jsonb),
                        sub_codes = CAST(:sub_codes AS jsonb),
                        updated_at = NOW()
                    WHERE exam_center_id = :exam_center_id AND seat_number = :seat_number
                """, {
                    "exam_center_id": self.exam_center_id,
                    "seat_number": student['seat_number'],
                    "enrollment_number": student['enrollment_number'],
                    "name": student['name'],
                    "scheme": student['scheme'],
                    "subjects": student['subjects'],
                    "sub_codes": student['sub_codes']
                })
                updated += 1
            else:
                # Insert new student
                db.execute_update("""
                    INSERT INTO students (
                        id, exam_center_id, connected_institute_id, seat_number,
                        institute_code, enrollment_number, name, scheme,
                        subjects, sub_codes, is_deleted
                    ) VALUES (
                        gen_random_uuid(), :exam_center_id, :institute_id, :seat_number,
                        :institute_code, :enrollment_number, :name, :scheme,
                        CAST(:subjects AS jsonb), CAST(:sub_codes AS jsonb), false
                    )
                """, {
                    "exam_center_id": self.exam_center_id,
                    "institute_id": institute_id,
                    "seat_number": student['seat_number'],
                    "institute_code": institute_code,
                    "enrollment_number": student['enrollment_number'],
                    "name": student['name'],
                    "scheme": student['scheme'],
                    "subjects": student['subjects'],
                    "sub_codes": student['sub_codes']
                })
                inserted += 1
        
        return {
            'inserted': inserted,
            'updated': updated,
            'skipped': skipped,
            'total': len(students)
        }
    
    def _update_timetable_counts(self) -> int:
        """Update total_students in timetable table based on seating chart data"""
        # Get all students grouped by subject code and scheme
        students = db.execute_query("""
            SELECT 
                s.sub_codes,
                s.scheme
            FROM students s
            WHERE s.exam_center_id = :exam_center_id AND s.is_deleted = false
        """, {"exam_center_id": self.exam_center_id})
        
        # Count students per subject
        subject_counts = {}
        for student in students:
            sub_codes = student.get('sub_codes', [])
            if isinstance(sub_codes, str):
                import json
                sub_codes = json.loads(sub_codes)
            
            for sub_code in sub_codes:
                key = (sub_code, student['scheme'])
                subject_counts[key] = subject_counts.get(key, 0) + 1
        
        # Update timetable
        updated = 0
        for (sub_code, scheme), count in subject_counts.items():
            result = db.execute_update("""
                UPDATE timetable
                SET total_students = :count, updated_at = NOW()
                WHERE exam_center_id = :exam_center_id 
                    AND subject_code = :sub_code 
                    AND scheme = :scheme
            """, {
                "exam_center_id": self.exam_center_id,
                "sub_code": sub_code,
                "scheme": scheme,
                "count": count
            })
            updated += result
        
        logger.info(f"Updated {updated} timetable entries with student counts")
        return updated
    
    def process(self) -> Dict:
        """Main processing function"""
        upload_dir = settings.UPLOAD_DIR
        
        # Parse all seating chart files
        students = self._parse_multiple_files(upload_dir)
        
        if not students:
            return {'success': False, 'error': 'No valid student data found in uploaded files'}
        
        # Insert into database
        stats = self._insert_students(students)
        
        # Update timetable counts
        timetable_updated = self._update_timetable_counts()
        
        # Update upload status
        db.execute_update("""
            UPDATE uploads 
            SET status = 'PROCESSED', 
                record_count = :count,
                processed_at = NOW(),
                updated_at = NOW()
            WHERE exam_center_id = :exam_center_id AND file_type = 'seatingchart'
        """, {
            "count": stats['total'],
            "exam_center_id": self.exam_center_id
        })
        
        logger.info(f"Seating chart processed: {stats['inserted']} inserted, {stats['updated']} updated for exam center {self.exam_center_id}")
        
        return {
            'success': True,
            'message': 'Seating chart processed successfully',
            'data': {
                'total_students': stats['total'],
                'inserted': stats['inserted'],
                'updated': stats['updated'],
                'skipped': stats['skipped'],
                'timetable_entries_updated': timetable_updated,
                'exam_center_id': self.exam_center_id
            }
        }


# ============================================================================
# API Endpoints
# ============================================================================

@router.post("/process")
async def process_seating_chart(
    exam_center_id: str = Depends(get_exam_center_id)
):
    """Process uploaded seating chart Excel file(s)"""
    processor = SeatingChartProcessor(exam_center_id)
    result = processor.process()
    
    if not result['success']:
        raise HTTPException(status_code=400, detail=result['error'])
    
    return success_response(
        data=result.get('data'),
        message=result['message']
    )


@router.get("/students")
async def get_students(
    exam_center_id: str = Depends(get_exam_center_id),
    institute_code: Optional[str] = None,
    scheme: Optional[str] = None,
    limit: int = 100,
    offset: int = 0
):
    """Get students from seating chart data"""
    query = """
        SELECT 
            s.id,
            s.seat_number,
            s.enrollment_number,
            s.name,
            s.scheme,
            s.subjects,
            s.sub_codes,
            ci.institute_code,
            ci.institute_name
        FROM students s
        JOIN connected_institutes ci ON ci.id = s.connected_institute_id
        WHERE s.exam_center_id = :exam_center_id AND s.is_deleted = false
    """
    
    params = {"exam_center_id": exam_center_id}
    
    if institute_code:
        query += " AND ci.institute_code = :institute_code"
        params["institute_code"] = institute_code
    
    if scheme:
        query += " AND s.scheme = :scheme"
        params["scheme"] = scheme
    
    query += " ORDER BY s.seat_number LIMIT :limit OFFSET :offset"
    params["limit"] = limit
    params["offset"] = offset
    
    students = db.execute_query(query, params)
    
    # Parse JSON fields
    for student in students:
        if student.get('subjects') and isinstance(student['subjects'], str):
            import json
            student['subjects'] = json.loads(student['subjects'])
        if student.get('sub_codes') and isinstance(student['sub_codes'], str):
            import json
            student['sub_codes'] = json.loads(student['sub_codes'])
    
    return success_response(
        data=students,
        message=f"Found {len(students)} students"
    )


@router.get("/students/count")
async def get_student_count(
    exam_center_id: str = Depends(get_exam_center_id)
):
    """Get total student count per institute and scheme"""
    result = db.execute_query("""
        SELECT 
            ci.institute_code,
            ci.institute_name,
            s.scheme,
            COUNT(*) as student_count
        FROM students s
        JOIN connected_institutes ci ON ci.id = s.connected_institute_id
        WHERE s.exam_center_id = :exam_center_id AND s.is_deleted = false
        GROUP BY ci.institute_code, ci.institute_name, s.scheme
        ORDER BY ci.institute_code, s.scheme
    """, {"exam_center_id": exam_center_id})
    
    total = db.execute_query("""
        SELECT COUNT(*) as total
        FROM students
        WHERE exam_center_id = :exam_center_id AND is_deleted = false
    """, {"exam_center_id": exam_center_id})
    
    return success_response(
        data={
            "by_institute_and_scheme": result,
            "total_students": total[0]['total'] if total else 0
        },
        message="Student count retrieved"
    )


@router.get("/status")
async def get_seating_chart_status(
    exam_center_id: str = Depends(get_exam_center_id)
):
    """Get seating chart processing status"""
    result = db.execute_query("""
        SELECT status, record_count, processed_at, created_at, error_message
        FROM uploads
        WHERE exam_center_id = :exam_center_id AND file_type = 'seatingchart'
    """, {"exam_center_id": exam_center_id})
    
    if not result:
        return success_response(
            data={
                "has_file": False,
                "is_processed": False,
                "status": None
            },
            message="No seating chart file found"
        )
    
    record = result[0]
    return success_response(
        data={
            "has_file": True,
            "is_processed": record['status'] == 'PROCESSED',
            "status": record['status'],
            "record_count": record['record_count'],
            "processed_at": record['processed_at'].isoformat() if record['processed_at'] else None,
            "uploaded_at": record['created_at'].isoformat() if record['created_at'] else None,
            "error_message": record['error_message']
        },
        message="Seating chart status retrieved"
    )


@router.delete("/")
async def delete_seating_chart(
    exam_center_id: str = Depends(get_exam_center_id)
):
    """Delete all seating chart data for this exam center"""
    # Soft delete students
    result = db.execute_update("""
        UPDATE students 
        SET is_deleted = true, updated_at = NOW()
        WHERE exam_center_id = :exam_center_id
    """, {"exam_center_id": exam_center_id})
    
    # Reset upload status
    db.execute_update("""
        UPDATE uploads 
        SET status = 'UPLOADED', 
            record_count = 0,
            processed_at = NULL,
            updated_at = NOW()
        WHERE exam_center_id = :exam_center_id AND file_type = 'seatingchart'
    """, {"exam_center_id": exam_center_id})
    
    # Reset timetable counts
    db.execute_update("""
        UPDATE timetable 
        SET total_students = 0, updated_at = NOW()
        WHERE exam_center_id = :exam_center_id
    """, {"exam_center_id": exam_center_id})
    
    return success_response(
        message=f"Soft deleted {result} students successfully"
    )


@router.get("/subjects")
async def get_student_subjects(
    exam_center_id: str = Depends(get_exam_center_id)
):
    """Get unique subjects from student data"""
    result = db.execute_query("""
        SELECT DISTINCT 
            jsonb_array_elements_text(sub_codes) as subject_code
        FROM students
        WHERE exam_center_id = :exam_center_id 
            AND is_deleted = false
            AND sub_codes IS NOT NULL
            AND jsonb_array_length(sub_codes) > 0
    """, {"exam_center_id": exam_center_id})
    
    subjects = [row['subject_code'] for row in result if row['subject_code']]
    
    return success_response(
        data=subjects,
        message=f"Found {len(subjects)} unique subjects"
    )