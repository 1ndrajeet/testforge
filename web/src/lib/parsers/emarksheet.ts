import * as XLSX from 'xlsx';

export interface ParsedEMarksheetItem {
  sheet_no: string;
  subject_name: string;
  scheme: string;
  subject_head: string;
  paper_code: string;
  file_name: string;
}

/**
 * Parses E-Marksheet Excel buffer.
 */
export function parseEMarksheetExcel(fileBuffer: Buffer | ArrayBuffer): ParsedEMarksheetItem[] {
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
    sheet_no: 0,
    subject_name: 1,
    scheme: 2,
    subject_head: 3,
    paper_code: 4,
    file_name: 5,
  };

  const expectedHeaders = ['sheet', 'subject', 'scheme', 'head', 'paper', 'file'];

  for (let i = 0; i < Math.min(rawRows.length, 25); i++) {
    const row = rawRows[i];
    if (!row || row.length === 0) continue;

    const rowStrs = row.map((c) =>
      String(c || '')
        .trim()
        .toLowerCase(),
    );
    const matches = expectedHeaders.filter((exp) => rowStrs.some((s) => s.includes(exp))).length;

    if (matches >= 3) {
      headerIndex = i;
      rowStrs.forEach((val, idx) => {
        if (val.includes('sheet')) colMap.sheet_no = idx;
        else if (val.includes('subject') && val.includes('name')) colMap.subject_name = idx;
        else if (val.includes('scheme')) colMap.scheme = idx;
        else if (val.includes('head')) colMap.subject_head = idx;
        else if (val.includes('paper') || (val.includes('code') && !val.includes('course')))
          colMap.paper_code = idx;
        else if (val.includes('file')) colMap.file_name = idx;
      });
      break;
    }
  }

  const startRow = headerIndex >= 0 ? headerIndex + 1 : 1;
  const items: ParsedEMarksheetItem[] = [];

  for (let i = startRow; i < rawRows.length; i++) {
    const row = rawRows[i];
    if (!row || row.length === 0) continue;

    const sheetNo = String(row[colMap.sheet_no] || '').trim();
    if (!sheetNo || sheetNo.toLowerCase() === 'nan' || sheetNo.toLowerCase() === 'none') continue;

    const lower = sheetNo.toLowerCase();
    if (lower.includes('total') || lower.includes('certify') || lower.includes('signature'))
      continue;

    items.push({
      sheet_no: sheetNo,
      subject_name: String(row[colMap.subject_name] || '').trim(),
      scheme: String(row[colMap.scheme] || '').trim(),
      subject_head: String(row[colMap.subject_head] || '').trim(),
      paper_code: String(row[colMap.paper_code] || '').trim(),
      file_name: String(row[colMap.file_name] || '').trim(),
    });
  }

  return items;
}
