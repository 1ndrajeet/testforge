import * as cheerio from 'cheerio';

import { parseDate, stripSchemeDashes } from './shared';

export interface TimetableEntry {
  exam_day: number;
  date: string;
  session: 'Morning' | 'Afternoon';
  time_slot: string;
  subject_code: string;
  subject_name: string;
  scheme: string | null;
  subject_id?: string | null;
  subject_abbr?: string | null;
}

export interface SubjectCacheItem {
  id: string;
  code: string;
  scheme: string;
  abbr: string | null;
  name: string;
}

export function buildSubjectCache(subjects: SubjectCacheItem[]): Map<string, SubjectCacheItem> {
  const cache = new Map<string, SubjectCacheItem>();
  for (const sub of subjects) {
    const originalKey = `${sub.code}_${sub.scheme}`;
    cache.set(originalKey, sub);

    const normScheme = stripSchemeDashes(sub.scheme);
    if (normScheme !== sub.scheme) {
      const normKey = `${sub.code}_${normScheme}`;
      if (!cache.has(normKey)) {
        cache.set(normKey, sub);
      }
    }
  }
  return cache;
}

export function findSubjectInCache(
  cache: Map<string, SubjectCacheItem>,
  subjectCode: string,
  scheme?: string | null,
): SubjectCacheItem | undefined {
  if (!scheme) {
    for (const [key, val] of cache.entries()) {
      if (key.startsWith(`${subjectCode}_`)) {
        return val;
      }
    }
    return undefined;
  }

  const directKey = `${subjectCode}_${scheme}`;
  if (cache.has(directKey)) return cache.get(directKey);

  const normKey = `${subjectCode}_${stripSchemeDashes(scheme)}`;
  if (cache.has(normKey)) return cache.get(normKey);

  for (const [key, val] of cache.entries()) {
    if (key.startsWith(`${subjectCode}_`)) {
      return val;
    }
  }
  return undefined;
}

/**
 * Parses timetable HTML content using cheerio.
 */
export function parseTimetableHtml(
  htmlContent: string,
  subjectCache?: Map<string, SubjectCacheItem>,
): TimetableEntry[] {
  const $ = cheerio.load(htmlContent);
  const entries: TimetableEntry[] = [];
  const tables = $('table');

  tables.each((_, tableEl) => {
    const $table = $(tableEl);
    let headerEl = $table
      .prevAll('div.timetable-session-header, div.session-header, div[class*="session"]')
      .first();
    if (!headerEl.length) {
      headerEl = $table.prevAll('div').first();
    }
    if (!headerEl.length) {
      const prev = $table.prev();
      if (prev.length && (prev.text().includes('Date:') || prev.text().includes('Date'))) {
        headerEl = prev;
      }
    }

    const headerText = headerEl.text().replace(/\s+/g, ' ').trim();
    const dateMatch =
      headerText.match(/Date:\s*(\d{2}-\d{2}-\d{4})/) || headerText.match(/(\d{2}-\d{2}-\d{4})/);
    if (!dateMatch) return;

    const formattedDate = parseDate(dateMatch[1]);
    const dayMatch = headerText.match(/Day:\s*(\d+)/);
    const examDay = dayMatch ? parseInt(dayMatch[1], 10) : 0;

    let session: 'Morning' | 'Afternoon' = 'Morning';
    if (headerText.includes('Afternoon') || headerText.includes('🌙')) {
      session = 'Afternoon';
    } else if (headerText.includes('Morning') || headerText.includes('🌅')) {
      session = 'Morning';
    }

    $table.find('tr').each((__, rowEl) => {
      const cells = $(rowEl).find('td');
      if (cells.length < 4) return;

      const srNo = $(cells[0]).text().trim();
      if (!srNo || !/^\d+$/.test(srNo)) return;

      let timeSlot = '';
      let subjectCode = '';
      let subjectName = '';
      let schemesRaw = '';

      if (cells.length >= 7) {
        timeSlot = $(cells[3]).text().trim();
        subjectCode = $(cells[4]).text().trim();
        subjectName = $(cells[5]).text().trim();
        schemesRaw = $(cells[6]).text().trim();
      } else if (cells.length >= 5) {
        timeSlot = $(cells[1]).text().trim();
        subjectCode = $(cells[2]).text().trim();
        subjectName = $(cells[3]).text().trim();
        schemesRaw = $(cells[4]).text().trim();
      }

      if (!subjectCode || !subjectName) return;

      const schemes = schemesRaw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const schemeList = schemes.length ? schemes : [''];

      for (const scheme of schemeList) {
        const subInfo = subjectCache
          ? findSubjectInCache(subjectCache, subjectCode, scheme)
          : undefined;
        entries.push({
          exam_day: examDay,
          date: formattedDate,
          session,
          time_slot: timeSlot,
          subject_code: subjectCode,
          subject_name: subjectName,
          scheme: scheme || null,
          subject_id: subInfo?.id || null,
          subject_abbr: subInfo?.abbr || null,
        });
      }
    });
  });

  if (entries.length === 0) {
    // Alternative parsing approach for different HTML structure
    $('div[class*="session"], div[class*="header"]').each((_, blockEl) => {
      const headerText = $(blockEl).text().replace(/\s+/g, ' ').trim();
      if (!headerText.toLowerCase().includes('date')) return;

      const $table = $(blockEl).nextAll('table').first();
      if (!$table.length) return;

      const dateMatch =
        headerText.match(/Date:\s*(\d{2}-\d{2}-\d{4})/) || headerText.match(/(\d{2}-\d{2}-\d{4})/);
      if (!dateMatch) return;

      const formattedDate = parseDate(dateMatch[1]);
      const dayMatch = headerText.match(/Day:\s*(\d+)/);
      const examDay = dayMatch ? parseInt(dayMatch[1], 10) : 0;

      const session: 'Morning' | 'Afternoon' =
        headerText.includes('Afternoon') || headerText.includes('🌙') ? 'Afternoon' : 'Morning';

      $table.find('tr').each((__, rowEl) => {
        const cells = $(rowEl).find('td');
        if (cells.length < 4) return;

        const srNo = $(cells[0]).text().trim();
        if (!srNo || !/^\d+$/.test(srNo)) return;

        let timeSlot = '';
        let subjectCode = '';
        let subjectName = '';
        let schemesRaw = '';

        if (cells.length >= 7) {
          timeSlot = $(cells[3]).text().trim();
          subjectCode = $(cells[4]).text().trim();
          subjectName = $(cells[5]).text().trim();
          schemesRaw = $(cells[6]).text().trim();
        } else if (cells.length >= 5) {
          timeSlot = $(cells[1]).text().trim();
          subjectCode = $(cells[2]).text().trim();
          subjectName = $(cells[3]).text().trim();
          schemesRaw = $(cells[4]).text().trim();
        }

        if (subjectCode && subjectName) {
          const schemes = schemesRaw
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
          const schemeList = schemes.length ? schemes : [''];

          for (const scheme of schemeList) {
            const subInfo = subjectCache
              ? findSubjectInCache(subjectCache, subjectCode, scheme)
              : undefined;
            entries.push({
              exam_day: examDay,
              date: formattedDate,
              session,
              time_slot: timeSlot,
              subject_code: subjectCode,
              subject_name: subjectName,
              scheme: scheme || null,
              subject_id: subInfo?.id || null,
              subject_abbr: subInfo?.abbr || null,
            });
          }
        }
      });
    });
  }

  return entries;
}
