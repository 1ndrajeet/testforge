import crypto from 'crypto';

/**
 * Normalizes an educational scheme string (e.g. 'I-Scheme', 'i - 1' -> 'I1' or cleaned string).
 */
export function normalizeScheme(scheme: string): string {
  if (!scheme) return '';
  return scheme
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .trim();
}

/**
 * Strips dashes and trims scheme (e.g. 'I - 1' -> 'I 1').
 */
export function stripSchemeDashes(scheme: string): string {
  if (!scheme) return '';
  return scheme.replace(/-/g, '').trim();
}

/**
 * Sanitizes a paper / subject code by removing all non-alphanumeric characters.
 */
export function sanitizePaperCode(code: string): string {
  if (!code) return '';
  return code
    .toString()
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .trim();
}

/**
 * Safely parses an integer from various raw Excel/text values (e.g. "12", "12.0", "12 - 14", "1,200").
 */
export function parseIntSafe(val: any, defaultVal = 0): number {
  if (val === null || val === undefined) return defaultVal;
  let cleaned = String(val).trim().replace(/,/g, '').replace(/\s+/g, '');
  if (
    cleaned === '' ||
    cleaned === '-' ||
    cleaned.toLowerCase() === 'nan' ||
    cleaned.toLowerCase() === 'none'
  ) {
    return defaultVal;
  }
  if (cleaned.includes('-')) {
    cleaned = cleaned.split('-')[0].trim();
  }
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? defaultVal : Math.trunc(parsed);
}

/**
 * Parses date string in DD-MM-YYYY format to YYYY-MM-DD.
 */
export function parseDate(dateStr: string): string {
  if (!dateStr) return '';
  const match = dateStr.match(/(\d{2})[-/](\d{2})[-/](\d{4})/);
  if (match) {
    const [, day, month, year] = match;
    return `${year}-${month}-${day}`;
  }
  // If already YYYY-MM-DD
  const isoMatch = dateStr.match(/(\d{4})[-/](\d{2})[-/](\d{2})/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${year}-${month}-${day}`;
  }
  return dateStr;
}

/**
 * Computes SHA-256 hash of a buffer or string.
 */
export function computeFileHash(content: Buffer | string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Splits an array into chunks of given size.
 */
export function chunkArray<T>(items: T[], chunkSize = 250): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}
