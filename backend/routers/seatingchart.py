# backend/routers/seatingchart.py - COMPLETE FIXED VERSION

from fastapi import APIRouter, HTTPException, Depends
import os
import logging
from datetime import datetime
from typing import List, Dict, Optional, Any
import pandas as pd
from sqlalchemy import text
from pydantic import BaseModel
from uuid import uuid4
import json
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


class ProcessFileRequest(BaseModel):
    stored_filename: str  # ✅ Required: which file to process


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
            if row['abbr']:
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
    
    def _get_uploaded_file(self, stored_filename: str) -> Optional[Dict]:
        """Get a specific uploaded seating chart file by stored_filename"""
        result = db.execute_query("""
            SELECT stored_filename, status, connected_institute_id, original_filename
            FROM uploads
            WHERE exam_center_id = :exam_center_id 
                AND file_type = 'seatingchart'
                AND stored_filename = :stored_filename
        """, {
            "exam_center_id": self.exam_center_id,
            "stored_filename": stored_filename
        })
        
        if not result:
            return None
        
        file_path = os.path.join(settings.UPLOAD_DIR, result[0]['stored_filename'])
        return {
            'stored_filename': result[0]['stored_filename'],
            'file_path': file_path,
            'status': result[0]['status'],
            'connected_institute_id': result[0].get('connected_institute_id'),
            'original_filename': result[0]['original_filename']
        }
    
    def _get_subject_codes(self, subject_string: str, scheme: str) -> tuple:
        """Extract subject abbreviations and codes from subject string"""
        if not subject_string or subject_string == 'nan':
            return [], []
        
        subjects = set()
        for sub in subject_string.split(','):
            sub = sub.strip().upper()
            if sub:
                subjects.add(sub)
        
        sub_codes = set()
        scheme_subjects = self.scheme_data.get(scheme, {})
        
        for subject in subjects:
            if subject in scheme_subjects:
                sub_codes.add(scheme_subjects[subject])
            else:
                base_subject = subject.split('-')[0] if '-' in subject else subject
                for abbr, code in scheme_subjects.items():
                    if abbr and abbr.startswith(base_subject):
                        sub_codes.add(code)
                        break
        
        return list(subjects), list(sub_codes)
    
    def _parse_excel_file(self, file_path: str, institute_code: str) -> List[Dict]:
        """Parse seating chart Excel file - handles sanitized files with headers"""
        try:
            df = pd.read_excel(file_path, header=0, dtype=str).fillna('')
            
            logger.info(f"Columns in file: {list(df.columns)}")
            
            students = []
            
            for idx, row in df.iterrows():
                seat_value = str(row.get('Seat Number', '')).strip()
                if not seat_value or not seat_value.isdigit():
                    seat_value = str(row.get('Seat', '')).strip()
                    if not seat_value or not seat_value.isdigit():
                        continue
                
                enrollment_number = str(row.get('Enrollment Number', '')).strip()
                if not enrollment_number or enrollment_number == 'nan':
                    enrollment_number = str(row.get('Enroll', '')).strip()
                    if not enrollment_number or enrollment_number == 'nan':
                        enrollment_number = None
                
                name = str(row.get('Name', '')).strip()
                if not name or name == 'nan':
                    name = str(row.get('Candidate Name', '')).strip()
                    if not name or name == 'nan':
                        name = None
                
                scheme = str(row.get('Scheme', '')).strip()
                if scheme == 'nan':
                    scheme = ''
                
                subject_string = str(row.get('Subject Appearing For', '')).strip()
                if subject_string == 'nan':
                    subject_string = str(row.get('Subject', '')).strip()
                    if subject_string == 'nan':
                        subject_string = ''
                
                if not name and not enrollment_number and not subject_string:
                    continue
                
                subjects, sub_codes = self._get_subject_codes(subject_string, scheme)
                
                students.append({
                    'seat_number': int(seat_value),
                    'enrollment_number': enrollment_number,
                    'name': name,
                    'scheme': scheme,
                    'subjects': subjects,
                    'sub_codes': sub_codes,
                    'institute_code': institute_code
                })
            
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
        inst = db.execute_query("""
            SELECT id, institute_code, institute_name
            FROM connected_institutes
            WHERE id = :institute_id AND exam_center_id = :exam_center_id AND is_active = true
        """, {
            "institute_id": connected_institute_id,
            "exam_center_id": self.exam_center_id
        })
        
        if not inst:
            logger.error(f"Connected institute {connected_institute_id} not found")
            return {'inserted': 0, 'updated': 0, 'skipped': len(students), 'total': len(students)}
        
        institute_id = inst[0]['id']
        institute_code = inst[0]['institute_code']
        
        for student in students:
            # Use the connected_institute_id from the upload
            # Override the institute_code from the file with the actual one
            student['institute_code'] = institute_code
            
            # Convert lists to JSON strings
            subjects_json = json.dumps(student['subjects'])
            sub_codes_json = json.dumps(student['sub_codes'])
            
            # Check if student already exists for this seat number
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
                    SET connected_institute_id = :institute_id,
                        enrollment_number = :enrollment_number,
                        name = :name,
                        scheme = :scheme,
                        subjects = CAST(:subjects AS jsonb),
                        sub_codes = CAST(:sub_codes AS jsonb),
                        updated_at = NOW()
                    WHERE exam_center_id = :exam_center_id AND seat_number = :seat_number
                """, {
                    "exam_center_id": self.exam_center_id,
                    "institute_id": institute_id,
                    "seat_number": student['seat_number'],
                    "enrollment_number": student['enrollment_number'],
                    "name": student['name'],
                    "scheme": student['scheme'],
                    "subjects": subjects_json,
                    "sub_codes": sub_codes_json
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
                    "subjects": subjects_json,
                    "sub_codes": sub_codes_json
                })
                inserted += 1
        
        return {
            'inserted': inserted,
            'updated': updated,
            'skipped': skipped,
            'total': len(students)
        }
    
# backend/routers/seatingchart.py - FIXED _update_timetable_counts

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
        
        # Create maps: (code, scheme) -> count
        # Also create map for abbr lookup
        subject_lookup = {}
        for sub in all_subjects:
            code = sub['code']
            scheme = sub['scheme']
            abbr = sub['abbr']
            
            # Store by code + scheme
            key = (code, scheme)
            subject_lookup[key] = {
                'code': code,
                'scheme': scheme,
                'abbr': abbr
            }
            
            # Also store by abbr + scheme if abbr exists
            if abbr:
                key_abbr = (abbr, scheme)
                subject_lookup[key_abbr] = {
                    'code': code,
                    'scheme': scheme,
                    'abbr': abbr
                }
        
        logger.info(f"Loaded {len(subject_lookup)} subject lookup entries")
        
        # ============================================
        # Step 2: Get all students and count by subject
        # ============================================
        
        students = db.execute_query("""
            SELECT 
                s.sub_codes,
                s.scheme
            FROM students s
            WHERE s.exam_center_id = :exam_center_id AND s.is_deleted = false
        """, {"exam_center_id": self.exam_center_id})
        
        # Count students per subject (code + scheme)
        subject_counts = {}
        
        for student in students:
            sub_codes = student.get('sub_codes', [])
            if isinstance(sub_codes, str):
                sub_codes = json.loads(sub_codes)
            
            scheme = student['scheme']
            # ✅ Sanitize scheme: remove hyphens for matching
            scheme_clean = scheme.replace('-', '') if scheme else ''
            
            for sub_code in sub_codes:
                if not sub_code:
                    continue
                
                # Try to find the subject code in the lookup
                found_code = None
                found_scheme = None
                
                # Try direct match with sanitized scheme
                key = (sub_code, scheme_clean)
                if key in subject_lookup:
                    found_code = sub_code
                    found_scheme = scheme_clean
                else:
                    # Try with original scheme
                    key_orig = (sub_code, scheme)
                    if key_orig in subject_lookup:
                        found_code = sub_code
                        found_scheme = scheme
                    else:
                        # Try to find by abbr
                        for lookup_key, lookup_val in subject_lookup.items():
                            if lookup_key[0] == sub_code:
                                found_code = lookup_val['code']
                                found_scheme = lookup_val['scheme']
                                break
                
                if found_code and found_scheme:
                    count_key = (found_code, found_scheme)
                    subject_counts[count_key] = subject_counts.get(count_key, 0) + 1
                else:
                    logger.debug(f"Could not map subject: {sub_code} (scheme: {scheme})")
        
        logger.info(f"Calculated counts for {len(subject_counts)} subjects")
        
        # ============================================
        # Step 3: Update timetable entries
        # ============================================
        
        # Get all timetable entries for this exam center
        timetable_entries = db.execute_query("""
            SELECT id, subject_code, scheme
            FROM timetable
            WHERE exam_center_id = :exam_center_id
        """, {"exam_center_id": self.exam_center_id})
        
        updated = 0
        
        for entry in timetable_entries:
            subject_code = entry['subject_code']
            scheme = entry['scheme']
            
            # ✅ Sanitize scheme for matching
            scheme_clean = scheme.replace('-', '') if scheme else ''
            
            # Try to find count
            count = 0
            
            # Try with sanitized scheme
            key = (subject_code, scheme_clean)
            if key in subject_counts:
                count = subject_counts[key]
            else:
                # Try with original scheme
                key_orig = (subject_code, scheme)
                if key_orig in subject_counts:
                    count = subject_counts[key_orig]
                else:
                    # Try to find by abbr in the subject lookup
                    for lookup_key, lookup_val in subject_lookup.items():
                        if lookup_val['code'] == subject_code:
                            # Check if this scheme matches
                            if lookup_val['scheme'] == scheme or lookup_val['scheme'] == scheme_clean:
                                count_key = (subject_code, lookup_val['scheme'])
                                if count_key in subject_counts:
                                    count = subject_counts[count_key]
                                    break
            
            if count > 0:
                db.execute_update("""
                    UPDATE timetable
                    SET total_students = :count, updated_at = NOW()
                    WHERE id = :id
                """, {
                    "count": count,
                    "id": entry['id']
                })
                updated += 1
        
        logger.info(f"Updated {updated} timetable entries with student counts")
        return updated

        
    def process(self, stored_filename: str) -> Dict:
        """Main processing function for a specific file"""
        
        # Get the specific uploaded file
        upload = self._get_uploaded_file(stored_filename)
        if not upload:
            return {'success': False, 'error': f'File not found: {stored_filename}'}
        
        if not os.path.exists(upload['file_path']):
            return {'success': False, 'error': f'File not found on server: {stored_filename}'}
        
        # Get connected_institute_id from the upload record
        connected_institute_id = upload.get('connected_institute_id')
        if not connected_institute_id:
            return {'success': False, 'error': 'No connected_institute_id found for this file'}
        
        # Update status to PROCESSING
        db.execute_update("""
            UPDATE uploads 
            SET status = 'PROCESSING', updated_at = NOW()
            WHERE exam_center_id = :exam_center_id 
                AND file_type = 'seatingchart'
                AND stored_filename = :stored_filename
        """, {
            "exam_center_id": self.exam_center_id,
            "stored_filename": stored_filename
        })
        
        # Parse the file
        students = self._parse_excel_file(upload['file_path'], '')
        
        if not students:
            # Update status to FAILED
            db.execute_update("""
                UPDATE uploads 
                SET status = 'FAILED', 
                    error_message = 'No valid student data found in file',
                    updated_at = NOW()
                WHERE exam_center_id = :exam_center_id 
                    AND file_type = 'seatingchart'
                    AND stored_filename = :stored_filename
            """, {
                "exam_center_id": self.exam_center_id,
                "stored_filename": stored_filename
            })
            return {'success': False, 'error': 'No valid student data found in file'}
        
        # Insert students with the connected_institute_id
        stats = self._insert_students(students, connected_institute_id)
        
        # Update timetable counts
        timetable_updated = self._update_timetable_counts()
        
        # Update upload status to PROCESSED
        db.execute_update("""
            UPDATE uploads 
            SET status = 'PROCESSED', 
                record_count = :count,
                processed_at = NOW(),
                updated_at = NOW()
            WHERE exam_center_id = :exam_center_id 
                AND file_type = 'seatingchart'
                AND stored_filename = :stored_filename
        """, {
            "count": stats['total'],
            "exam_center_id": self.exam_center_id,
            "stored_filename": stored_filename
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
                'exam_center_id': self.exam_center_id,
                'connected_institute_id': connected_institute_id,
                'stored_filename': stored_filename
            }
        }


# ============================================================================
# API Endpoints
# ============================================================================

@router.post("/process")
async def process_seating_chart(
    request: ProcessFileRequest,
    exam_center_id: str = Depends(get_exam_center_id)
):
    """Process a specific uploaded seating chart file"""
    processor = SeatingChartProcessor(exam_center_id)
    result = processor.process(request.stored_filename)
    
    if not result['success']:
        raise HTTPException(status_code=400, detail=result['error'])
    
    return success_response(
        data=result.get('data'),
        message=result['message']
    )


@router.get("/files")
async def get_seating_chart_files(
    exam_center_id: str = Depends(get_exam_center_id)
):
    """Get all uploaded seating chart files with their status"""
    result = db.execute_query("""
        SELECT 
            u.id,
            u.stored_filename,
            u.original_filename,
            u.status,
            u.record_count,
            u.connected_institute_id,
            u.created_at,
            u.processed_at,
            ci.institute_code,
            ci.institute_name
        FROM uploads u
        LEFT JOIN connected_institutes ci ON ci.id = u.connected_institute_id
        WHERE u.exam_center_id = :exam_center_id 
            AND u.file_type = 'seatingchart'
        ORDER BY u.created_at DESC
    """, {"exam_center_id": exam_center_id})
    
    return success_response(
        data=result,
        message=f"Found {len(result)} seating chart files"
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
    
    for student in students:
        if student.get('subjects') and isinstance(student['subjects'], str):
            student['subjects'] = json.loads(student['subjects'])
        if student.get('sub_codes') and isinstance(student['sub_codes'], str):
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
    stored_filename: Optional[str] = None,
    exam_center_id: str = Depends(get_exam_center_id)
):
    """Get seating chart processing status - optionally for a specific file"""
    
    query = """
        SELECT 
            u.status, 
            u.record_count, 
            u.processed_at, 
            u.created_at, 
            u.error_message,
            u.connected_institute_id,
            u.stored_filename,
            u.original_filename,
            ci.institute_code,
            ci.institute_name
        FROM uploads u
        LEFT JOIN connected_institutes ci ON ci.id = u.connected_institute_id
        WHERE u.exam_center_id = :exam_center_id AND u.file_type = 'seatingchart'
    """
    params = {"exam_center_id": exam_center_id}
    
    if stored_filename:
        query += " AND u.stored_filename = :stored_filename"
        params["stored_filename"] = stored_filename
        query += " ORDER BY u.created_at DESC LIMIT 1"
    else:
        query += " ORDER BY u.created_at DESC"
    
    result = db.execute_query(query, params)
    
    if not result:
        return success_response(
            data={"has_file": False, "is_processed": False, "status": None},
            message="No seating chart file found"
        )
    
    if stored_filename:
        record = result[0]
        institute_info = None
        if record.get('connected_institute_id'):
            inst = db.execute_query("""
                SELECT id, institute_code, institute_name
                FROM connected_institutes
                WHERE id = :institute_id
            """, {"institute_id": record['connected_institute_id']})
            if inst:
                institute_info = {
                    "id": inst[0]['id'],
                    "code": inst[0]['institute_code'],
                    "name": inst[0]['institute_name']
                }
        
        return success_response(
            data={
                "has_file": True,
                "is_processed": record['status'] == 'PROCESSED',
                "status": record['status'],
                "record_count": record['record_count'],
                "processed_at": record['processed_at'].isoformat() if record['processed_at'] else None,
                "uploaded_at": record['created_at'].isoformat() if record['created_at'] else None,
                "error_message": record['error_message'],
                "connected_institute_id": record.get('connected_institute_id'),
                "stored_filename": record['stored_filename'],
                "original_filename": record['original_filename'],
                "institute_info": institute_info
            },
            message="Seating chart status retrieved"
        )
    
    # Return all files
    files = []
    for record in result:
        institute_info = None
        if record.get('connected_institute_id'):
            inst = db.execute_query("""
                SELECT id, institute_code, institute_name
                FROM connected_institutes
                WHERE id = :institute_id
            """, {"institute_id": record['connected_institute_id']})
            if inst:
                institute_info = {
                    "id": inst[0]['id'],
                    "code": inst[0]['institute_code'],
                    "name": inst[0]['institute_name']
                }
        
        files.append({
            "stored_filename": record['stored_filename'],
            "original_filename": record['original_filename'],
            "status": record['status'],
            "record_count": record['record_count'],
            "processed_at": record['processed_at'].isoformat() if record['processed_at'] else None,
            "uploaded_at": record['created_at'].isoformat() if record['created_at'] else None,
            "connected_institute_id": record.get('connected_institute_id'),
            "institute_info": institute_info
        })
    
    return success_response(
        data={"files": files, "count": len(files)},
        message=f"Found {len(files)} seating chart files"
    )


@router.delete("/")
async def delete_seating_chart(
    stored_filename: Optional[str] = None,
    exam_center_id: str = Depends(get_exam_center_id)
):
    """Delete seating chart data - optionally for a specific file"""
    
    if stored_filename:
        # Delete specific file's students
        # Get the connected_institute_id for this file
        upload = db.execute_query("""
            SELECT connected_institute_id FROM uploads
            WHERE exam_center_id = :exam_center_id 
                AND file_type = 'seatingchart'
                AND stored_filename = :stored_filename
        """, {
            "exam_center_id": exam_center_id,
            "stored_filename": stored_filename
        })
        
        if upload and upload[0].get('connected_institute_id'):
            # Soft delete students for this institute
            db.execute_update("""
                UPDATE students 
                SET is_deleted = true, updated_at = NOW()
                WHERE exam_center_id = :exam_center_id 
                    AND connected_institute_id = :institute_id
            """, {
                "exam_center_id": exam_center_id,
                "institute_id": upload[0]['connected_institute_id']
            })
        
        # Delete the upload record
        db.execute_update("""
            DELETE FROM uploads
            WHERE exam_center_id = :exam_center_id 
                AND file_type = 'seatingchart'
                AND stored_filename = :stored_filename
        """, {
            "exam_center_id": exam_center_id,
            "stored_filename": stored_filename
        })
        
        return success_response(
            message=f"Deleted seating chart file: {stored_filename}"
        )
    else:
        # Delete ALL seating chart data
        result = db.execute_update("""
            UPDATE students 
            SET is_deleted = true, updated_at = NOW()
            WHERE exam_center_id = :exam_center_id
        """, {"exam_center_id": exam_center_id})
        
        db.execute_update("""
            DELETE FROM uploads
            WHERE exam_center_id = :exam_center_id AND file_type = 'seatingchart'
        """, {"exam_center_id": exam_center_id})
        
        db.execute_update("""
            UPDATE timetable 
            SET total_students = 0, updated_at = NOW()
            WHERE exam_center_id = :exam_center_id
        """, {"exam_center_id": exam_center_id})
        
        return success_response(
            message=f"Deleted all seating chart data ({result} students)"
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