import * as XLSX from 'xlsx';

import { normalizeScheme } from './shared';

export interface ParsedStudent {
  seat_number: number;
  enrollment_number: string | null;
  name: string | null;
  scheme: string;
  subjects: string[];
  sub_codes: string[];
}

export type SchemeSubjectMap = Map<string, Map<string, string>>;

export function buildSchemeSubjectMap(
  subjects: Array<{ code: string; abbr: string | null; scheme: string }>,
): SchemeSubjectMap {
  const map: SchemeSubjectMap = new Map();

  for (const row of subjects) {
    if (!row.abbr) continue;
    const scheme = row.scheme || '';
    const normScheme = normalizeScheme(scheme);

    if (!map.has(scheme)) map.set(scheme, new Map());
    if (!map.has(normScheme)) map.set(normScheme, new Map());

    map.get(scheme)!.set(row.abbr.toUpperCase(), row.code);
    map.get(normScheme)!.set(row.abbr.toUpperCase(), row.code);
  }

  return map;
}

export function resolveSubjectCodes(
  subjectString: string,
  scheme: string,
  schemeMap?: SchemeSubjectMap,
): { subjects: string[]; subCodes: string[] } {
  if (!subjectString || subjectString === 'nan') {
    return { subjects: [], subCodes: [] };
  }

  const subjectsSet = new Set<string>();
  const subCodesSet = new Set<string>();

  const parts = subjectString.split(',');
  for (const part of parts) {
    const clean = part.trim().toUpperCase();
    if (clean) {
      subjectsSet.add(clean);
    }
  }

  if (schemeMap) {
    const schemeSubjects = schemeMap.get(scheme) || schemeMap.get(normalizeScheme(scheme));

    for (const sub of subjectsSet) {
      if (schemeSubjects && schemeSubjects.has(sub)) {
        subCodesSet.add(schemeSubjects.get(sub)!);
      } else if (schemeSubjects) {
        // Fallback: prefix match (e.g. ENG-1 vs ENG)
        const base = sub.includes('-') ? sub.split('-')[0] : sub;
        let matched = false;
        for (const [abbr, code] of schemeSubjects.entries()) {
          if (abbr.startsWith(base)) {
            subCodesSet.add(code);
            matched = true;
            break;
          }
        }
        if (!matched) {
          // If already a numeric code
          if (/^\d+$/.test(sub)) {
            subCodesSet.add(sub);
          }
        }
      } else if (/^\d+$/.test(sub)) {
        subCodesSet.add(sub);
      }
    }
  } else {
    for (const sub of subjectsSet) {
      if (/^\d+$/.test(sub)) {
        subCodesSet.add(sub);
      }
    }
  }

  return {
    subjects: Array.from(subjectsSet),
    subCodes: Array.from(subCodesSet),
  };
}

/**
 * Parses seating chart Excel buffer into student records.
 */
export function parseSeatingChartExcel(
  fileBuffer: Buffer | ArrayBuffer,
  schemeMap?: SchemeSubjectMap,
): ParsedStudent[] {
  const workbook = XLSX.read(fileBuffer, { type: 'buffer', raw: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];

  const worksheet = workbook.Sheets[sheetName];
  const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: '',
    raw: false,
  });

  if (!rawRows || rawRows.length < 2) return [];

  // Determine header row
  let headerIndex = -1;
  let seatCol = -1;
  let enrollCol = -1;
  let nameCol = -1;
  let schemeCol = -1;
  let subjectCol = -1;

  for (let i = 0; i < Math.min(rawRows.length, 10); i++) {
    const row = rawRows[i];
    if (!row || row.length === 0) continue;

    const rowStrs = row.map((c) =>
      String(c || '')
        .trim()
        .toLowerCase(),
    );
    const hasSeat = rowStrs.some((s) => s.includes('seat'));
    const hasEnroll = rowStrs.some((s) => s.includes('enroll'));
    const hasName = rowStrs.some((s) => s.includes('name'));

    if (hasSeat && (hasEnroll || hasName)) {
      headerIndex = i;
      rowStrs.forEach((s, idx) => {
        if (s.includes('seat')) seatCol = idx;
        else if (s.includes('enroll')) enrollCol = idx;
        else if (s.includes('name')) nameCol = idx;
        else if (s.includes('scheme')) schemeCol = idx;
        else if (s.includes('subject') || s.includes('appearing') || s.includes('paper'))
          subjectCol = idx;
      });
      break;
    }
  }

  // Fallback to default columns if header not matched
  if (headerIndex === -1) {
    headerIndex = 0;
    seatCol = 0;
    enrollCol = 1;
    nameCol = 2;
    schemeCol = 3;
    subjectCol = 4;
  }

  const students: ParsedStudent[] = [];

  for (let i = headerIndex + 1; i < rawRows.length; i++) {
    const row = rawRows[i];
    if (!row || row.length === 0) continue;

    const seatRaw = String(row[seatCol] || '').trim();
    if (!seatRaw || !/^\d+$/.test(seatRaw)) continue;

    const seatNumber = parseInt(seatRaw, 10);
    const enrollRaw = enrollCol >= 0 ? String(row[enrollCol] || '').trim() : '';
    const nameRaw = nameCol >= 0 ? String(row[nameCol] || '').trim() : '';
    const schemeRaw = schemeCol >= 0 ? String(row[schemeCol] || '').trim() : '';
    const subjectRaw = subjectCol >= 0 ? String(row[subjectCol] || '').trim() : '';

    if (!nameRaw && !enrollRaw && !subjectRaw) continue;

    const { subjects, subCodes } = resolveSubjectCodes(subjectRaw, schemeRaw, schemeMap);

    students.push({
      seat_number: seatNumber,
      enrollment_number: enrollRaw || null,
      name: nameRaw || null,
      scheme: schemeRaw,
      subjects,
      sub_codes: subCodes,
    });
  }

  return students;
}
