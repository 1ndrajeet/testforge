import * as XLSX from 'xlsx';

export interface GroupedStudentArrangement {
  seat_number: number;
  institute_code: string;
  institute_id?: string | null;
  scheme: string;
  paper_codes: string[];
}

export interface ArrangementMismatch {
  seat_number: number;
  scheme: string;
  db_scheme: string | null;
  expected_subjects: string[];
  actual_subjects: string[];
  missing_subjects: string[];
  extra_subjects: string[];
  invalid_papers?: string[];
  issue_type:
    | 'MISSING_SUBJECTS'
    | 'EXTRA_SUBJECTS'
    | 'BOTH_MISSING_AND_EXTRA'
    | 'SCHEME_MISMATCH'
    | 'UNKNOWN';
}

export interface ArrangementValidationResult {
  status: 'saved' | 'needs_correction';
  mismatches: ArrangementMismatch[];
  temp_session_id?: string;
  total_students: number;
  mismatch_count: number;
}

/**
 * Parses seating arrangement Excel buffer into grouped student arrangements.
 * Each row in the file represents one paper for a student.
 */
export function parseSeatingArrangementExcel(
  fileBuffer: Buffer | ArrayBuffer,
): Map<number, GroupedStudentArrangement> {
  const workbook = XLSX.read(fileBuffer, { type: 'buffer', raw: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return new Map();

  const worksheet = workbook.Sheets[sheetName];
  const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: '',
    raw: false,
  });

  if (!rawRows || rawRows.length < 2) return new Map();

  // Find column indices
  let headerIndex = -1;
  let seatCol = 1;
  let instCol = 2;
  let courseCol = 3;
  let semesterCol = 4;
  let masterCol = 5;
  let paperCol = 6;

  for (let i = 0; i < Math.min(rawRows.length, 5); i++) {
    const row = rawRows[i];
    if (!row || row.length === 0) continue;

    const rowStrs = row.map((c) =>
      String(c || '')
        .trim()
        .toLowerCase(),
    );
    const hasSeat = rowStrs.some((s) => s.includes('seat'));
    const hasPaper = rowStrs.some((s) => s.includes('paper') || s.includes('course'));

    if (hasSeat && hasPaper) {
      headerIndex = i;
      rowStrs.forEach((s, idx) => {
        if (s.includes('seat')) seatCol = idx;
        else if (s.includes('inst')) instCol = idx;
        else if (s.includes('course')) courseCol = idx;
        else if (s.includes('semester') || s.includes('sem')) semesterCol = idx;
        else if (s.includes('master')) masterCol = idx;
        else if (s.includes('paper')) paperCol = idx;
      });
      break;
    }
  }

  const startRow = headerIndex >= 0 ? headerIndex + 1 : 1;
  const grouped = new Map<number, GroupedStudentArrangement>();

  for (let i = startRow; i < rawRows.length; i++) {
    const row = rawRows[i];
    if (!row || row.length === 0) continue;

    const seatVal = String(row[seatCol] || '').trim();
    const paperVal = String(row[paperCol] || '').trim();

    if (!seatVal || !/^\d+$/.test(seatVal) || !paperVal) continue;

    const seatNumber = parseInt(seatVal, 10);
    const instCode = String(row[instCol] || '').trim();
    const courseCode = String(row[courseCol] || '').trim();
    const semester = String(row[semesterCol] || '').trim();
    const masterCode = String(row[masterCol] || '').trim();

    let scheme = courseCode;
    if (semester) scheme += `-${semester}`;
    if (masterCode) scheme += `-${masterCode}`;

    if (!grouped.has(seatNumber)) {
      grouped.set(seatNumber, {
        seat_number: seatNumber,
        institute_code: instCode,
        scheme,
        paper_codes: [],
      });
    }

    const student = grouped.get(seatNumber)!;
    if (!student.paper_codes.includes(paperVal)) {
      student.paper_codes.push(paperVal);
    }
  }

  return grouped;
}

export interface DbStudentRef {
  seat_number: number;
  sub_codes: string[];
  scheme: string | null;
}

/**
 * Validates parsed student paper codes against database records.
 */
export function validateSeatingArrangement(
  parsedData: Map<number, GroupedStudentArrangement>,
  dbStudents: DbStudentRef[],
  tempSessionId?: string,
): ArrangementValidationResult {
  const dbMap = new Map<number, { codes: Set<string>; scheme: string }>();

  for (const s of dbStudents) {
    const codes = new Set<string>();
    for (const c of s.sub_codes || []) {
      const clean = String(c).trim();
      if (clean) codes.add(clean);
    }
    dbMap.set(s.seat_number, { codes, scheme: s.scheme || '' });
  }

  const mismatches: ArrangementMismatch[] = [];

  // Check all seats in parsedData
  for (const [seatNumber, student] of parsedData.entries()) {
    const dbRecord = dbMap.get(seatNumber);
    if (!dbRecord) continue; // New student, no mismatch against DB

    const parsedCodes = new Set(student.paper_codes.map((p) => String(p).trim()).filter(Boolean));
    const expectedCodes = dbRecord.codes;

    const missing: string[] = [];
    for (const c of expectedCodes) {
      if (!parsedCodes.has(c)) missing.push(c);
    }

    const extra: string[] = [];
    for (const c of parsedCodes) {
      if (!expectedCodes.has(c)) extra.push(c);
    }

    if (missing.length > 0 || extra.length > 0) {
      let issueType: ArrangementMismatch['issue_type'] = 'UNKNOWN';
      if (missing.length > 0 && extra.length > 0) {
        issueType = 'BOTH_MISSING_AND_EXTRA';
      } else if (missing.length > 0) {
        issueType = 'MISSING_SUBJECTS';
      } else if (extra.length > 0) {
        issueType = 'EXTRA_SUBJECTS';
      }

      mismatches.push({
        seat_number: seatNumber,
        scheme: student.scheme,
        db_scheme: dbRecord.scheme || null,
        expected_subjects: Array.from(expectedCodes).sort(),
        actual_subjects: Array.from(parsedCodes).sort(),
        missing_subjects: missing.sort(),
        extra_subjects: extra.sort(),
        issue_type: issueType,
      });
    }
  }

  if (mismatches.length > 0) {
    return {
      status: 'needs_correction',
      mismatches,
      temp_session_id: tempSessionId,
      total_students: parsedData.size,
      mismatch_count: mismatches.length,
    };
  }

  return {
    status: 'saved',
    mismatches: [],
    total_students: parsedData.size,
    mismatch_count: 0,
  };
}

/**
 * Auto-corrects parsed data using database student records as ground truth.
 */
export function applyArrangementCorrections(
  parsedData: Map<number, GroupedStudentArrangement>,
  dbStudents: DbStudentRef[],
): Map<number, GroupedStudentArrangement> {
  const dbMap = new Map<number, { codes: string[]; scheme: string }>();

  for (const s of dbStudents) {
    const codes = (s.sub_codes || []).map((c) => String(c).trim()).filter(Boolean);
    dbMap.set(s.seat_number, { codes, scheme: s.scheme || '' });
  }

  const corrected = new Map<number, GroupedStudentArrangement>();

  for (const [seatNumber, student] of parsedData.entries()) {
    const dbRecord = dbMap.get(seatNumber);
    if (dbRecord) {
      corrected.set(seatNumber, {
        seat_number: seatNumber,
        institute_code: student.institute_code,
        institute_id: student.institute_id,
        scheme: dbRecord.scheme || student.scheme,
        paper_codes: dbRecord.codes,
      });
    } else {
      corrected.set(seatNumber, { ...student });
    }
  }

  return corrected;
}
