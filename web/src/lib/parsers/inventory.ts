import * as XLSX from 'xlsx';

import { parseIntSafe, sanitizePaperCode } from './shared';

export interface ParsedInventoryItem {
  region: string;
  dc: string;
  ec: string;
  day: number;
  session: string;
  paper_code: string;
  no_of_candidates: number;
  no_of_packets_required: number;
  total_packets_session: number;
  total_packets_day: number;
  timetable_date?: string | null;
  timetable_session?: string | null;
  subject_code?: string;
  scheme?: string;
}

export interface TimetableLookupEntry {
  subject_code: string;
  date: string;
  session: string;
  scheme: string;
  subject_abbr?: string | null;
}

export class TimetableLookupCache {
  private exactMap = new Map<string, TimetableLookupEntry>();
  private sanitizedMap = new Map<string, TimetableLookupEntry>();
  private abbrMap = new Map<string, TimetableLookupEntry>();

  constructor(entries: TimetableLookupEntry[]) {
    for (const e of entries) {
      const code = e.subject_code.trim();
      this.exactMap.set(code, e);

      const sanitized = sanitizePaperCode(code);
      if (sanitized && !this.sanitizedMap.has(sanitized)) {
        this.sanitizedMap.set(sanitized, e);
      }

      if (e.subject_abbr) {
        const abbrClean = sanitizePaperCode(e.subject_abbr);
        if (abbrClean && !this.abbrMap.has(abbrClean)) {
          this.abbrMap.set(abbrClean, e);
        }
      }
    }
  }

  lookup(paperCode: string): TimetableLookupEntry | undefined {
    if (!paperCode) return undefined;
    const clean = paperCode.trim();

    if (this.exactMap.has(clean)) return this.exactMap.get(clean);

    const sanitized = sanitizePaperCode(clean);
    if (sanitized && this.sanitizedMap.has(sanitized)) {
      return this.sanitizedMap.get(sanitized);
    }

    if (sanitized && this.abbrMap.has(sanitized)) {
      return this.abbrMap.get(sanitized);
    }

    // Partial match
    for (const [code, entry] of this.exactMap.entries()) {
      if (code.includes(clean) || clean.includes(code)) {
        return entry;
      }
    }

    return undefined;
  }
}

/**
 * Parses question paper inventory Excel buffer.
 */
export function parseInventoryExcel(
  fileBuffer: Buffer | ArrayBuffer,
  timetableCache?: TimetableLookupCache,
): ParsedInventoryItem[] {
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

  // Find header row
  let headerIndex = -1;
  const colMap: Record<string, number> = {
    region: 0,
    dc: 1,
    ec: 2,
    day: 3,
    session: 4,
    paper_code: 5,
    no_of_candidates: 6,
    no_of_packets_required: 7,
  };

  for (let i = 0; i < Math.min(rawRows.length, 30); i++) {
    const row = rawRows[i];
    if (!row || row.length === 0) continue;

    const rowStrs = row.map((c) =>
      String(c || '')
        .trim()
        .toLowerCase(),
    );
    const rowText = rowStrs.join(' ');

    const hasPaper =
      rowText.includes('paper') && (rowText.includes('code') || rowText.includes('no'));
    const hasRegion = rowText.includes('region');
    const hasEc = rowText.includes('ec') || rowText.includes('examination');
    const hasDay = rowText.includes('day');
    const hasSession = rowText.includes('session');
    const hasCandidate = rowText.includes('candidate');
    const hasPacket = rowText.includes('packet');

    const matches = [
      hasPaper,
      hasRegion,
      hasEc,
      hasDay,
      hasSession,
      hasCandidate,
      hasPacket,
    ].filter(Boolean).length;
    if (matches >= 4) {
      headerIndex = i;
      rowStrs.forEach((val, idx) => {
        if (val.includes('region')) colMap.region = idx;
        else if (val.includes('dc') && !val.includes('region')) colMap.dc = idx;
        else if (val.includes('ec') && !val.includes('examination')) colMap.ec = idx;
        else if (val.includes('day')) colMap.day = idx;
        else if (val.includes('session')) colMap.session = idx;
        else if (val.includes('paper') && (val.includes('code') || val.includes('no')))
          colMap.paper_code = idx;
        else if (val.includes('candidate')) colMap.no_of_candidates = idx;
        else if (val.includes('packet') && val.includes('required'))
          colMap.no_of_packets_required = idx;
      });
      break;
    }
  }

  const startRow = headerIndex >= 0 ? headerIndex + 1 : 1;
  const items: ParsedInventoryItem[] = [];

  for (let i = startRow; i < rawRows.length; i++) {
    const row = rawRows[i];
    if (!row || row.length === 0) continue;

    const paperCode = String(row[colMap.paper_code] || '').trim();
    if (!paperCode || paperCode.toLowerCase() === 'nan' || paperCode.toLowerCase() === 'none')
      continue;

    const lower = paperCode.toLowerCase();
    if (lower.includes('total') || lower.includes('certify') || lower.includes('signature'))
      continue;

    const timetableInfo = timetableCache?.lookup(paperCode);

    const dayRaw = String(row[colMap.day] || '0').trim();
    const day = parseIntSafe(dayRaw, 0);

    const candidates = parseIntSafe(row[colMap.no_of_candidates], 0);
    const packets = parseIntSafe(row[colMap.no_of_packets_required], 0);

    let session = String(row[colMap.session] || 'M')
      .trim()
      .toUpperCase();
    if (session.startsWith('M') || session.includes('MORNING')) {
      session = 'Morning';
    } else if (session.startsWith('A') || session.includes('AFTERNOON')) {
      session = 'Afternoon';
    }

    items.push({
      region: String(row[colMap.region] || '').trim(),
      dc: String(row[colMap.dc] || '').trim(),
      ec: String(row[colMap.ec] || '').trim(),
      day,
      session,
      paper_code: paperCode,
      no_of_candidates: candidates,
      no_of_packets_required: packets,
      total_packets_session: 0,
      total_packets_day: 0,
      timetable_date: timetableInfo?.date || null,
      timetable_session: timetableInfo?.session || session,
      subject_code: timetableInfo?.subject_code || paperCode,
      scheme: timetableInfo?.scheme || '',
    });
  }

  return items;
}
