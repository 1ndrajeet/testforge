// components/shared/file-uploader.tsx

'use client';

import { useCallback, useEffect, useState } from 'react';

import {
  AlertCircle,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Download,
  FileCheck,
  FileSignature,
  FileUp,
  Info,
  LayoutGrid,
  Loader2,
  Package,
  Play,
  RefreshCw,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { getConnectedInstitutes } from '@/lib/actions/institute';
import { type UploadFileType as ActionFileType, getStoredFilename, getUploadStatus } from '@/lib/actions/upload';
import { cn } from '@/lib/utils';

// ============================================================================
// Types & Constants
// ============================================================================

export type FileType = 'timetable' | 'seatingchart' | 'seatingarrangement' | 'emarksheet' | 'inventory';

interface FileTypeConfig {
  id: FileType;
  name: string;
  description: string;
  icon: React.ReactNode;
  acceptedFormats: string[];
  maxSize: number;
  expectedColumns?: string[];
  isHtml?: boolean;
  backendPrefix: string;
}

interface UploadStatus {
  fileExists: boolean;
  isProcessed: boolean;
  fileName?: string;
  storedFilename?: string;
  lastUploaded?: string;
  recordCount?: number;
  status?: string;
}

interface ValidationResult {
  valid: boolean;
  error?: string;
  warnings?: string[];
  data?: any[];
  recordCount?: number;
}

interface ConnectedInstitute {
  id: string;
  CODE: string;
  NAME: string;
}

interface InstituteUploadState {
  instituteId: string;
  instituteCode: string;
  instituteName: string;
  storedFilename: string | null;
  file: File | null;
  status: 'idle' | 'uploading' | 'uploaded' | 'processing' | 'processed' | 'failed';
  uploadProgress: number;
  recordCount: number | null;
  error: string | null;
  uploadedAt: string | null;
  processedAt: string | null;
}

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// ============================================================================
// Validation Schemas
// ============================================================================

const VALIDATION_SCHEMAS: Record<FileType, Record<string, string>> = {
  emarksheet: {
    SHEET_NO: 'string',
    SUBJECT_NAME: 'string',
    SCHEME: 'string',
    SUBJECT_HEAD: 'string',
    PAPER_CODE: 'string',
    FILE_NAME: 'string',
  },
  seatingchart: {
    SEAT_NUMBER: 'number',
    ENROLLMENT_NUMBER: 'string',
    NAME: 'string',
    SCHEME: 'string',
    SUBJECT_APPEARING_FOR: 'string',
  },
  seatingarrangement: {
    SR_NO: 'number',
    SEAT_NUMBER: 'number',
    INST_CODE: 'string',
    COURSE_CODE: 'string',
    SEMESTER: 'number',
    MASTER_CODE: 'string',
    PAPER_CODE: 'string',
  },
  inventory: { SUBJECT_CODE: 'string', STUDENT_COUNT: 'number', NO_OF_PACKETS: 'number' },
  timetable: {
    DATE: 'string',
    SESSION: 'string',
    TIME_SLOT: 'string',
    SUBJECT_CODE: 'string',
    SUBJECT_NAME: 'string',
    SCHEME: 'string',
  },
};

// ============================================================================
// File Type Configurations
// ============================================================================

const FILE_TYPE_CONFIGS: Record<FileType, FileTypeConfig> = {
  timetable: {
    id: 'timetable',
    name: 'Timetable',
    description: 'Upload MSBTE examination timetable',
    icon: <Calendar className="h-5 w-5" />,
    acceptedFormats: ['.html', '.htm', '.xlsx', '.xls', '.csv'],
    maxSize: MAX_FILE_SIZE,
    isHtml: true,
    expectedColumns: ['Date', 'Session', 'Time Slot', 'Subject Code', 'Subject Name', 'Scheme'],
    backendPrefix: 'tt',
  },
  seatingchart: {
    id: 'seatingchart',
    name: 'Seating Chart',
    description: 'Upload student seating chart data',
    icon: <Users className="h-5 w-5" />,
    acceptedFormats: ['.xlsx', '.xls', '.csv'],
    maxSize: MAX_FILE_SIZE,
    expectedColumns: ['Seat Number', 'Enrollment Number', 'Name', 'Scheme', 'Subject Appearing For'],
    backendPrefix: 'sc',
  },
  seatingarrangement: {
    id: 'seatingarrangement',
    name: 'Seating Arrangement',
    description: 'Upload final seating arrangement',
    icon: <LayoutGrid className="h-5 w-5" />,
    acceptedFormats: ['.xlsx', '.xls', '.csv'],
    maxSize: MAX_FILE_SIZE,
    expectedColumns: ['SR No', 'Seat Number', 'Inst Code', 'Course Code', 'Semester', 'Master Code', 'Paper Code'],
    backendPrefix: 'sa',
  },
  emarksheet: {
    id: 'emarksheet',
    name: 'E-Marksheet',
    description: 'Upload e-marksheet data',
    icon: <FileSignature className="h-5 w-5" />,
    acceptedFormats: ['.xlsx', '.xls', '.csv'],
    maxSize: MAX_FILE_SIZE,
    expectedColumns: ['Sheet No', 'Subject Name', 'Scheme', 'Subject Head', 'Paper Code', 'File Name'],
    backendPrefix: 'em',
  },
  inventory: {
    id: 'inventory',
    name: 'Inventory',
    description: 'Upload question paper inventory',
    icon: <Package className="h-5 w-5" />,
    acceptedFormats: ['.xlsx', '.xls', '.csv'],
    maxSize: MAX_FILE_SIZE,
    expectedColumns: ['Subject Code', 'Student Count', 'No of Packets'],
    backendPrefix: 'inv',
  },
};

// ============================================================================
// Utilities
// ============================================================================

const sanitizeHtml = (html: string) =>
  html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/\s*on\w+="[^"]*"/gi, '')
    .replace(/\s*on\w+='[^']*'/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
    .replace(/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, '');

const parseDate = (dateStr: string) => {
  const parts = dateStr.split('-');
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
};

const getFileExtension = (filename: string) => '.' + filename.split('.').pop()?.toLowerCase();

// ============================================================================
// HTML Timetable Parser
// ============================================================================

function validateAndParseHtmlTimetable(html: string): ValidationResult {
  if (!html.includes('<table') && !html.includes('<TABLE')) {
    return { valid: false, error: 'No HTML table found in the file' };
  }

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const tables = Array.from(doc.querySelectorAll('table'));
  const targetTable =
    tables.find(t =>
      ['time table', 'subject code', 'scheme', 'schema'].some(k => t.textContent?.toLowerCase().includes(k))
    ) || tables.find(t => t.querySelectorAll('tr').length > 2);

  if (!targetTable) return { valid: false, error: 'Could not find timetable table in HTML' };

  const allRows = targetTable.querySelectorAll('tr');
  let headerCells: Element[] = [];
  let dataStartIndex = 0;

  for (let i = 0; i < Math.min(allRows.length, 5); i++) {
    const cells = allRows[i].querySelectorAll('th, td');
    if (
      cells.length > 0 &&
      Array.from(cells).some(c =>
        ['subject code', 'paper code', 'subject name'].some(k => c.textContent?.toLowerCase().includes(k))
      )
    ) {
      headerCells = Array.from(cells);
      dataStartIndex = i + 1;
      break;
    }
  }

  const colMap: Record<string, number> = {
    sr_no: 0,
    day: 1,
    session_col: 2,
    time: 3,
    subject_code: 4,
    subject_name: 5,
    scheme: 6,
  };
  if (headerCells.length > 0) {
    headerCells.forEach((cell, i) => {
      const text = cell.textContent?.toLowerCase().trim() || '';
      if (text.includes('sr no') || text.includes('sr.')) colMap.sr_no = i;
      else if (text.includes('day')) colMap.day = i;
      else if (text.includes('session') && !text.includes('subject')) colMap.session_col = i;
      else if (text.includes('time') || text.includes('slot')) colMap.time = i;
      else if (text.includes('subject code') || text.includes('paper code')) colMap.subject_code = i;
      else if (text.includes('subject name')) colMap.subject_name = i;
      else if (text.includes('scheme') || text.includes('schema')) colMap.scheme = i;
    });
  }

  const headerMap = new Map<Element, { date: string; session: string; day: number }>();
  doc.querySelectorAll('.timetable-session-header, .session-header, [class*="session"]').forEach(el => {
    const text = el.textContent || '';
    const dateMatch = text.match(/Date:\s*(\d{2}-\d{2}-\d{4})/);
    if (dateMatch) {
      const dateStr = dateMatch[1];
      const parts = dateStr.split('-');
      headerMap.set(el, {
        date: `${parts[2]}-${parts[1]}-${parts[0]}`,
        session: text.includes('Afternoon') || text.includes('') || text.includes('') ? 'Afternoon' : 'Morning',
        day: parseInt(text.match(/Day:\s*(\d+)/)?.[1] || '0'),
      });
    }
  });

  let currentHeader: { date: string; session: string; day: number } | null = null;
  let prev = targetTable.previousElementSibling;
  while (prev) {
    if (headerMap.has(prev)) {
      currentHeader = headerMap.get(prev)!;
      break;
    }
    prev = prev.previousElementSibling;
  }

  const entries: any[] = [];
  for (let i = dataStartIndex; i < allRows.length; i++) {
    const cells = allRows[i].querySelectorAll('td');
    if (cells.length < 4) continue;

    const srNo = cells[colMap.sr_no]?.textContent?.trim() || '';
    if (!srNo || !srNo.match(/^\d+$/)) continue;

    const timeSlot = cells[colMap.time]?.textContent?.trim() || '';
    const subjectCode = cells[colMap.subject_code]?.textContent?.trim() || '';
    const subjectName = cells[colMap.subject_name]?.textContent?.trim() || '';
    const schemesRaw = cells[colMap.scheme]?.textContent?.trim() || '';

    if (!subjectCode || !subjectName) continue;

    let date = currentHeader?.date || '';
    if (!date) {
      const parent = cells[0].closest('div');
      const dateMatch = parent?.textContent?.match(/(\d{2}-\d{2}-\d{4})/);
      if (dateMatch) date = parseDate(dateMatch[1]);
    }

    const schemes = schemesRaw
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    const schemeList = schemes.length ? schemes : [''];

    for (const scheme of schemeList) {
      if (subjectCode && subjectName && date) {
        entries.push({ date, session: currentHeader?.session || '', timeSlot, subjectCode, subjectName, scheme });
      }
    }
  }

  if (!entries.length) return { valid: false, error: 'No valid timetable entries found in HTML' };
  return { valid: true, data: entries, recordCount: entries.length };
}

// ============================================================================
// Excel/CSV Validation
// ============================================================================

const validateExcelFile = (
  file: File,
  schema: Record<string, string>,
  fileType?: FileType
): Promise<ValidationResult> =>
  new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, {
          type: 'array',
          cellDates: false,
          cellNF: false,
          cellText: false,
          raw: true,
          codepage: 65001,
        });

        if (!workbook.SheetNames.length) {
          return resolve({ valid: false, error: 'No sheets found' });
        }

        let validData: any[] = [];
        const warnings: string[] = [];
        const allErrors: string[] = [];

        for (const sheetName of workbook.SheetNames) {
          const sheet = workbook.Sheets[sheetName];
          const rawData: any[][] = XLSX.utils.sheet_to_json(sheet, {
            header: 1,
            defval: '',
            raw: false,
          });

          if (rawData.length < 2) {
            warnings.push(`Sheet "${sheetName}" is empty or has no data rows`);
            continue;
          }

          let headerRowIndex = -1;
          let headers: string[] = [];

          if (fileType === 'seatingchart') {
            for (let i = 0; i < Math.min(rawData.length, 5); i++) {
              const row = rawData[i];
              if (!row || row.length === 0) continue;

              const firstCell = String(row[0] || '').trim();
              const secondCell = String(row[1] || '').trim();

              const isHeaderRow =
                firstCell.toLowerCase().includes('seat') ||
                secondCell.toLowerCase().includes('enrollment') ||
                firstCell.toLowerCase().includes('sr') ||
                row.some(
                  (cell: any) =>
                    String(cell || '')
                      .toLowerCase()
                      .includes('seat number') ||
                    String(cell || '')
                      .toLowerCase()
                      .includes('enrollment')
                );

              const isDataRow = !isNaN(Number(firstCell)) && firstCell.length > 0;

              if (isHeaderRow && !isDataRow) {
                headerRowIndex = i;
                headers = row.map((h: any) => String(h || '').trim());
                break;
              }
            }

            if (headerRowIndex === -1 && rawData.length > 0) {
              headerRowIndex = 0;
              headers = rawData[0].map((h: any) => String(h || '').trim());
              warnings.push('Using first row as header');
            }

            const jsonData: any[] = [];

            for (let rowIdx = headerRowIndex + 1; rowIdx < rawData.length; rowIdx++) {
              const row = rawData[rowIdx];
              if (!row || row.length === 0 || row.every((c: any) => !c || String(c).trim() === '')) {
                continue;
              }

              const seatNumber = String(row[0] || '').trim();
              if (!seatNumber || isNaN(Number(seatNumber))) {
                continue;
              }

              const record: any = {
                SEAT_NUMBER: Number(seatNumber),
                ENROLLMENT_NUMBER: String(row[1] || '').trim(),
                NAME: String(row[2] || '').trim(),
                SCHEME: String(row[3] || '').trim(),
                SUBJECT_APPEARING_FOR: String(row[4] || '').trim(),
              };

              const hasRequiredFields =
                record.SEAT_NUMBER > 0 && record.ENROLLMENT_NUMBER && record.NAME && record.SCHEME;

              if (hasRequiredFields) {
                jsonData.push(record);
              } else {
                allErrors.push(`Row ${rowIdx + 1}: Missing required fields`);
              }
            }

            if (jsonData.length > 0) {
              validData = jsonData;
              break;
            } else {
              allErrors.push('No valid seating chart records found');
            }
          } else {
            for (let i = 0; i < Math.min(rawData.length, 10); i++) {
              const row = rawData[i];
              if (!row || row.length === 0) continue;

              const rowHeaders = row.map((h: any) =>
                String(h || '')
                  .trim()
                  .toUpperCase()
                  .replace(/[^A-Z0-9_]/g, '')
              );

              const expectedHeaders = Object.keys(schema);
              const matchedHeaders = expectedHeaders.filter(h =>
                rowHeaders.some(rh => rh === h || rh.includes(h) || h.includes(rh))
              );

              if (matchedHeaders.length >= expectedHeaders.length * 0.5) {
                headerRowIndex = i;
                headers = row.map((h: any) => String(h || '').trim());
                break;
              }
            }

            if (headerRowIndex === -1) {
              for (let i = 0; i < Math.min(rawData.length, 10); i++) {
                const row = rawData[i];
                if (row && row.some((c: any) => c && String(c).trim())) {
                  headerRowIndex = i;
                  headers = row.map((h: any) => String(h || '').trim());
                  break;
                }
              }

              if (headerRowIndex === -1) {
                warnings.push(`Sheet "${sheetName}": Could not find header row`);
                continue;
              }
            }

            const colIdx: Record<string, number> = {};
            const headerUpper = headers.map(h => h.toUpperCase().trim());

            for (const expected of Object.keys(schema)) {
              const expectedUpper = expected.toUpperCase();
              let idx = headerUpper.findIndex(h => h === expectedUpper);
              if (idx === -1) {
                idx = headerUpper.findIndex(h => h.includes(expectedUpper) || expectedUpper.includes(h));
              }
              if (idx !== -1) {
                colIdx[expected] = idx;
              }
            }

            const jsonData: any[] = [];
            for (let rowIdx = headerRowIndex + 1; rowIdx < rawData.length; rowIdx++) {
              const row = rawData[rowIdx];
              if (!row || row.every((c: any) => !c || String(c).trim() === '')) {
                continue;
              }

              const record: any = {};
              let hasData = false;
              let invalid = false;

              for (const [col, type] of Object.entries(schema)) {
                const idx = colIdx[col];
                let value = '';
                if (idx !== undefined && idx < row.length) {
                  value = row[idx];
                  if (value !== undefined && value !== null && String(value).trim() !== '') {
                    hasData = true;
                    const strValue = String(value).trim();

                    if (type === 'number') {
                      const num = Number(strValue);
                      if (isNaN(num)) {
                        invalid = true;
                        allErrors.push(`Row ${rowIdx + 1}, Column "${col}": Invalid number "${strValue}"`);
                        record[col] = null;
                      } else {
                        record[col] = num;
                      }
                    } else {
                      record[col] = strValue;
                    }
                  } else {
                    record[col] = type === 'number' ? null : '';
                  }
                } else {
                  record[col] = type === 'number' ? null : '';
                }
              }

              if (hasData && !invalid) {
                jsonData.push(record);
              }
            }

            if (jsonData.length > 0) {
              validData = jsonData;
              break;
            }
          }
        }

        if (!validData.length) {
          const errorMsg =
            allErrors.length > 0
              ? `Found ${allErrors.length} errors. ${allErrors.slice(0, 3).join('; ')}`
              : 'No valid data rows found. Please check your file format.';
          return resolve({
            valid: false,
            error: errorMsg,
            warnings: warnings.length ? warnings : undefined,
          });
        }

        resolve({
          valid: true,
          data: validData,
          recordCount: validData.length,
          warnings: warnings.length ? warnings : undefined,
        });
      } catch (error) {
        resolve({
          valid: false,
          error: `Error parsing file: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    };
    reader.onerror = () => resolve({ valid: false, error: 'Error reading file' });
    reader.readAsArrayBuffer(file);
  });

// ============================================================================
// Status Alert Component
// ============================================================================

const StatusAlert = ({ variant, icon: Icon, title, description, children }: any) => (
  <Alert
    variant={variant}
    className={cn(
      variant === 'default' && 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20',
      variant === 'destructive' && '',
      variant === 'success' && 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/20'
    )}
  >
    <Icon className="h-4 w-4" />
    <AlertTitle>{title}</AlertTitle>
    <AlertDescription>
      {description}
      {children}
    </AlertDescription>
  </Alert>
);

// ============================================================================
// Institute Upload Card
// ============================================================================

const InstituteUploadCard = ({
  institute,
  state,
  isSelected,
  onSelect,
  onDrop,
  fileType,
}: {
  institute: ConnectedInstitute;
  state: InstituteUploadState;
  isSelected: boolean;
  onSelect: () => void;
  onDrop: (instituteId: string, file: File) => void;
  fileType: FileType;
}) => {
  const config = FILE_TYPE_CONFIGS[fileType];
  const isUploading = state.status === 'uploading';
  const isUploaded = state.status === 'uploaded';
  const isProcessing = state.status === 'processing';
  const isProcessed = state.status === 'processed';
  const isFailed = state.status === 'failed';

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: async ([file]) => {
      if (file) {
        onDrop(institute.id, file);
      }
    },
    accept: config.acceptedFormats.reduce(
      (acc, f) => ({ ...acc, [`application/${f.slice(1)}`]: [f], [`text/${f.slice(1)}`]: [f] }),
      {}
    ),
    maxFiles: 1,
    multiple: false,
    disabled: isUploading || isProcessing || isUploaded || isProcessed,
  });

  const getStatusConfig = () => {
    switch (state.status) {
      case 'uploading':
        return {
          icon: <Loader2 className="h-5 w-5 animate-spin text-blue-500" />,
          label: `Uploading ${state.uploadProgress}%`,
          color: 'text-blue-500',
          bg: 'bg-blue-50 dark:bg-blue-950/20',
          border: 'border-blue-200 dark:border-blue-800',
        };
      case 'uploaded':
        return {
          icon: <Clock className="h-5 w-5 text-yellow-500" />,
          label: 'Uploaded - Ready to Process',
          color: 'text-yellow-500',
          bg: 'bg-yellow-50 dark:bg-yellow-950/20',
          border: 'border-yellow-200 dark:border-yellow-800',
        };
      case 'processing':
        return {
          icon: <Loader2 className="h-5 w-5 animate-spin text-indigo-500" />,
          label: 'Processing...',
          color: 'text-indigo-500',
          bg: 'bg-indigo-50 dark:bg-indigo-950/20',
          border: 'border-indigo-200 dark:border-indigo-800',
        };
      case 'processed':
        return {
          icon: <CheckCircle2 className="h-5 w-5 text-green-500" />,
          label: `Processed ${state.recordCount ? `(${state.recordCount} records)` : ''}`,
          color: 'text-green-500',
          bg: 'bg-green-50 dark:bg-green-950/20',
          border: 'border-green-200 dark:border-green-800',
        };
      case 'failed':
        return {
          icon: <AlertCircle className="h-5 w-5 text-red-500" />,
          label: state.error || 'Failed',
          color: 'text-red-500',
          bg: 'bg-red-50 dark:bg-red-950/20',
          border: 'border-red-200 dark:border-red-800',
        };
      default:
        return {
          icon: <Upload className="text-muted-foreground h-5 w-5" />,
          label: 'Drop file or click to upload',
          color: 'text-muted-foreground',
          bg: 'bg-muted/30',
          border: 'border-muted',
        };
    }
  };

  const statusConfig = getStatusConfig();
  const isDone = isUploaded || isProcessed || isFailed;

  return (
    <div
      {...(!isDone ? getRootProps() : {})}
      className={cn(
        'group relative cursor-pointer rounded-xl border-2 transition-all duration-300',
        isDragActive && 'border-primary bg-primary/5 scale-[1.02]',
        isSelected && !isDone && 'border-primary ring-primary/20 ring-2',
        statusConfig.border,
        statusConfig.bg,
        isDone && 'cursor-default',
        isProcessed && 'border-green-500',
        isFailed && 'border-red-500'
      )}
    >
      <input {...getInputProps()} />

      <div className="p-5">
        <div className="flex items-center gap-4">
          {/* Institute Info */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Building2 className={cn('h-4 w-4', statusConfig.color)} />
              <span className="truncate text-base font-semibold">{institute.CODE}</span>
              <span className="text-muted-foreground truncate text-sm">- {institute.NAME}</span>
            </div>

            <div className="mt-1.5 flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                {statusConfig.icon}
                <span className={cn('text-xs font-medium', statusConfig.color)}>{statusConfig.label}</span>
              </div>

              {state.recordCount && state.recordCount > 0 && (
                <Badge variant="outline" className="h-5 px-2 py-0 text-[10px]">
                  {state.recordCount} records
                </Badge>
              )}

              {state.file && (
                <Badge variant="secondary" className="h-5 max-w-[120px] truncate px-2 py-0 text-[10px]">
                  {state.file.name}
                </Badge>
              )}
            </div>

            {state.uploadedAt && (
              <div className="text-muted-foreground mt-1 text-[10px]">
                {state.processedAt ? 'Processed' : 'Uploaded'}: {new Date(state.uploadedAt).toLocaleString()}
              </div>
            )}
          </div>

          {/* Status Badge */}
          {isDone && (
            <div className="flex-shrink-0">
              {isProcessed ? (
                <Badge className="gap-1 bg-green-500 text-white hover:bg-green-600">
                  <Check className="h-3 w-3" /> Done
                </Badge>
              ) : isUploaded ? (
                <Badge variant="default" className="gap-1">
                  <Clock className="h-3 w-3" /> Uploaded
                </Badge>
              ) : (
                isFailed && (
                  <Badge variant="destructive" className="gap-1">
                    <AlertCircle className="h-3 w-3" /> Failed
                  </Badge>
                )
              )}
            </div>
          )}

          {/* Action Button */}
          {isUploaded && !isProcessed && !isFailed && (
            <Button
              size="sm"
              variant="outline"
              className="flex-shrink-0 gap-1 border-indigo-200 text-indigo-600 hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-400"
              onClick={e => {
                e.stopPropagation();
                const event = new CustomEvent('process-institute', { detail: { instituteId: institute.id } });
                document.dispatchEvent(event);
              }}
            >
              <Play className="h-3.5 w-3.5" /> Process
            </Button>
          )}

          {/* Select indicator for idle state */}
          {!isDone && (
            <div
              className={cn(
                'h-2 w-2 flex-shrink-0 rounded-full transition-all',
                isSelected ? 'bg-primary' : 'bg-muted-foreground/30'
              )}
            />
          )}
        </div>

        {/* Upload Progress */}
        {isUploading && (
          <div className="mt-3">
            <Progress value={state.uploadProgress} className="h-1.5" />
          </div>
        )}

        {/* Drag indicator */}
        {isDragActive && !isDone && <div className="text-primary mt-3 text-xs font-medium">Drop your file here</div>}

        {/* Error message */}
        {state.error && <div className="mt-2 truncate text-xs text-red-500">{state.error}</div>}
      </div>
    </div>
  );
};

// ============================================================================
// Status Hook
// ============================================================================

function useUploadStatus(fileType: FileType, instituteId?: string) {
  const [status, setStatus] = useState<UploadStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const checkStatus = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getUploadStatus(fileType as ActionFileType, instituteId);
      if (result.success) {
        const { data } = result;
        setStatus({
          fileExists: data.fileExists,
          isProcessed: data.isProcessed,
          fileName: data.fileName || undefined,
          storedFilename: data.storedFilename || undefined,
          recordCount: data.recordCount || undefined,
          lastUploaded: data.uploadedAt ? new Date(data.uploadedAt).toISOString() : undefined,
          status: data.status || undefined,
        });
      } else {
        setStatus({ fileExists: false, isProcessed: false });
      }
    } catch {
      setStatus({ fileExists: false, isProcessed: false });
    } finally {
      setLoading(false);
    }
  }, [fileType, instituteId]);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  return { status, loading, refetch: checkStatus };
}

// ============================================================================
// Wrapper Component - MAIN UPLOADER
// ============================================================================

interface UniversalFileUploaderWrapperProps {
  ecCode: string;
  allowedTypes?: FileType[];
  defaultType?: FileType;
  onSuccess?: () => void;
  onProcessingComplete?: () => void;
}

export function UniversalFileUploaderWrapper({
  ecCode,
  allowedTypes = ['timetable', 'seatingchart', 'seatingarrangement', 'emarksheet', 'inventory'],
  defaultType = 'timetable',
  onSuccess,
  onProcessingComplete,
}: UniversalFileUploaderWrapperProps) {
  const [selectedType, setSelectedType] = useState<FileType>(defaultType);
  const [institutes, setInstitutes] = useState<ConnectedInstitute[]>([]);
  const [selectedInstituteId, setSelectedInstituteId] = useState<string>('');
  const [loadingInstitutes, setLoadingInstitutes] = useState(false);
  const [uploadKey, setUploadKey] = useState(0);
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Institute upload states
  const [instituteStates, setInstituteStates] = useState<Record<string, InstituteUploadState>>({});
  const [allUploaded, setAllUploaded] = useState(false);

  const config = FILE_TYPE_CONFIGS[selectedType];

  // Load institutes when seating chart is selected
  useEffect(() => {
    if (selectedType === 'seatingchart') {
      fetchInstitutes();
    } else {
      setInstitutes([]);
      setInstituteStates({});
      setAllUploaded(false);
    }
  }, [selectedType]);

  // Listen for process events from cards
  useEffect(() => {
    const handleProcess = (e: CustomEvent) => {
      const { instituteId } = e.detail;
      handleProcessFile(instituteId);
    };
    document.addEventListener('process-institute', handleProcess as EventListener);
    return () => document.removeEventListener('process-institute', handleProcess as EventListener);
  }, []);

  const fetchInstitutes = async () => {
    setLoadingInstitutes(true);
    try {
      const result = await getConnectedInstitutes();
      if (result.success) {
        const instData = result.data || [];
        setInstitutes(instData);

        const newStates: Record<string, InstituteUploadState> = {};

        const statusPromises = instData.map(async inst => {
          try {
            const statusResult = await getUploadStatus('seatingchart' as ActionFileType, inst.id);

            if (statusResult.success && statusResult.data.fileExists) {
              const { data } = statusResult;
              const status =
                data.status === 'UPLOADED'
                  ? 'uploaded'
                  : data.status === 'PROCESSING'
                  ? 'processing'
                  : data.status === 'PROCESSED'
                  ? 'processed'
                  : data.status === 'FAILED'
                  ? 'failed'
                  : data.isProcessed
                  ? 'processed'
                  : 'uploaded';

              return {
                id: inst.id,
                state: {
                  instituteId: inst.id,
                  instituteCode: inst.CODE,
                  instituteName: inst.NAME,
                  storedFilename: data.storedFilename || null, // ✅ Store the filename
                  file: null,
                  status,
                  uploadProgress: 0,
                  recordCount: data.recordCount || null,
                  error: null,
                  uploadedAt: data.uploadedAt ? data.uploadedAt.toISOString() : null,
                  processedAt: data.processedAt ? data.processedAt.toISOString() : null,
                },
              };
            }
          } catch (error) {
            console.error(`Failed to fetch status for institute ${inst.CODE}:`, error);
          }

          return {
            id: inst.id,
            state: {
              instituteId: inst.id,
              instituteCode: inst.CODE,
              instituteName: inst.NAME,
              storedFilename: null,
              file: null,
              status: 'idle',
              uploadProgress: 0,
              recordCount: null,
              error: null,
              uploadedAt: null,
              processedAt: null,
            },
          };
        });

        const results = await Promise.all(statusPromises);

        results.forEach(({ id, state }) => {
          newStates[id] = state;
        });

        setInstituteStates(newStates);

        if (instData.length > 0) {
          setSelectedInstituteId(instData[0].id);
        }

        const hasUploaded = Object.values(newStates).some(s => s.status === 'uploaded' || s.status === 'processed');
        if (hasUploaded) {
          const allDone = Object.values(newStates).every(s => s.status === 'uploaded' || s.status === 'processed');
          setAllUploaded(allDone);
        }
      } else {
        toast.error('Failed to load institutes');
      }
    } catch (error) {
      console.error('Error loading institutes:', error);
      toast.error('Error loading institutes');
    } finally {
      setLoadingInstitutes(false);
    }
  };

  const handleFileUpload = async (instituteId: string, file: File) => {
    const ext = getFileExtension(file.name);
    if (file.size > config.maxSize) {
      toast.error(`File too large. Max: ${config.maxSize / 1024 / 1024}MB`);
      return;
    }
    if (!config.acceptedFormats.includes(ext)) {
      toast.error(`Invalid type. Accepted: ${config.acceptedFormats.join(', ')}`);
      return;
    }

    setInstituteStates(prev => ({
      ...prev,
      [instituteId]: {
        ...prev[instituteId],
        file,
        status: 'uploading',
        uploadProgress: 0,
        error: null,
      },
    }));

    const formData = new FormData();
    formData.append('file', file);
    formData.append('file_type', selectedType);
    formData.append('connected_institute_id', instituteId);

    const progressInterval = setInterval(() => {
      setInstituteStates(prev => ({
        ...prev,
        [instituteId]: {
          ...prev[instituteId],
          uploadProgress: Math.min((prev[instituteId]?.uploadProgress || 0) + 10, 90),
        },
      }));
    }, 200);

    try {
      const res = await fetch(`${BACKEND_URL}/api/upload/`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      clearInterval(progressInterval);

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.detail || 'Upload failed');
      }

      const data = await res.json();

      setInstituteStates(prev => ({
        ...prev,
        [instituteId]: {
          ...prev[instituteId],
          status: 'uploaded',
          uploadProgress: 100,
          storedFilename: data.stored_filename || null,
          recordCount: data.recordCount || null,
          uploadedAt: new Date().toISOString(),
          error: null,
        },
      }));

      toast.success(`File uploaded for ${instituteStates[instituteId]?.instituteCode || 'institute'}`);
      checkAllUploaded();
      onSuccess?.();
    } catch (err: any) {
      clearInterval(progressInterval);
      setInstituteStates(prev => ({
        ...prev,
        [instituteId]: {
          ...prev[instituteId],
          status: 'failed',
          error: err.message || 'Upload failed',
        },
      }));
      toast.error(err.message || 'Upload failed');
    }
  };

  const handleProcessFile = async (instituteId: string) => {
    // ✅ Get stored filename directly from database
    const result = await getStoredFilename(selectedType as ActionFileType, instituteId);

    if (!result.success || !result.data.storedFilename) {
      toast.error('No file found for this institute');
      return;
    }

    const storedFilename = result.data.storedFilename;
    const instituteCode = instituteStates[instituteId]?.instituteCode || '';

    setInstituteStates(prev => ({
      ...prev,
      [instituteId]: {
        ...prev[instituteId],
        status: 'processing',
        error: null,
      },
    }));

    try {
      const res = await fetch(`${BACKEND_URL}/api/${selectedType}/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stored_filename: storedFilename }),
        credentials: 'include',
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.detail || 'Processing failed');
      }

      const data = await res.json();

      setInstituteStates(prev => ({
        ...prev,
        [instituteId]: {
          ...prev[instituteId],
          status: 'processed',
          processedAt: new Date().toISOString(),
          recordCount: data.data?.total_students || prev[instituteId]?.recordCount || null,
          error: null,
        },
      }));

      toast.success(`File processed for ${instituteCode}`);
      onProcessingComplete?.();
    } catch (err: any) {
      setInstituteStates(prev => ({
        ...prev,
        [instituteId]: {
          ...prev[instituteId],
          status: 'failed',
          error: err.message || 'Processing failed',
        },
      }));
      toast.error(err.message || 'Processing failed');
    }
  };
  const checkAllUploaded = () => {
    const states = Object.values(instituteStates);
    const allDone = states.length > 0 && states.every(s => s.status === 'uploaded' || s.status === 'processed');
    setAllUploaded(allDone);
    if (allDone) {
      toast.success('All institutes have been uploaded. Ready to process.');
    }
  };

  // Institute selector for seating chart
  const renderInstituteSelector = () => {
    if (selectedType !== 'seatingchart') return null;

    if (loadingInstitutes) {
      return (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      );
    }

    if (institutes.length === 0) {
      return (
        <Alert variant="default" className="border-amber-200 bg-amber-50 dark:border-amber-800">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>No Connected Institutes</AlertTitle>
          <AlertDescription>
            Please add connected institutes first before uploading seating charts.
            <Button
              variant="link"
              className="ml-1 h-auto p-0 text-sm"
              onClick={() => (window.location.href = '/exam-center/configuration/institutes')}
            >
              Manage Institutes
            </Button>
          </AlertDescription>
        </Alert>
      );
    }

    const uploadedInst = institutes.filter(
      i => instituteStates[i.id]?.status === 'uploaded' || instituteStates[i.id]?.status === 'processed'
    );
    const notUploadedInst = institutes.filter(
      i => instituteStates[i.id]?.status === 'idle' || instituteStates[i.id]?.status === 'failed'
    );

    const total = institutes.length;
    const uploaded = uploadedInst.length;

    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-semibold">
              <Building2 className="h-5 w-5" />
              Institute Seating Charts
            </h3>
            <p className="text-muted-foreground text-sm">
              {uploaded}/{total} uploaded •{' '}
              {uploaded === total ? 'All institutes ready for processing' : 'Upload a file for each institute'}
            </p>
          </div>
          {uploaded > 0 && uploaded < total && (
            <Badge variant="outline" className="gap-1">
              <Clock className="h-3 w-3" />
              {uploaded} uploaded
            </Badge>
          )}
        </div>

        {uploadedInst.length > 0 && (
          <div className="space-y-2">
            <p className="text-muted-foreground text-xs font-medium tracking-wider uppercase">Uploaded</p>
            <div className="space-y-2">
              {uploadedInst.map(inst => {
                const state = instituteStates[inst.id];
                return (
                  <InstituteUploadCard
                    key={inst.id}
                    institute={inst}
                    state={state}
                    isSelected={selectedInstituteId === inst.id}
                    onSelect={() => setSelectedInstituteId(inst.id)}
                    onDrop={handleFileUpload}
                    fileType={selectedType}
                  />
                );
              })}
            </div>
          </div>
        )}

        {notUploadedInst.length > 0 && (
          <div className="space-y-2">
            {uploadedInst.length > 0 && (
              <p className="text-muted-foreground pt-1 text-xs font-medium tracking-wider uppercase">Pending Upload</p>
            )}
            <div className="space-y-2">
              {notUploadedInst.map(inst => {
                const state = instituteStates[inst.id];
                return (
                  <InstituteUploadCard
                    key={inst.id}
                    institute={inst}
                    state={state}
                    isSelected={selectedInstituteId === inst.id}
                    onSelect={() => setSelectedInstituteId(inst.id)}
                    onDrop={handleFileUpload}
                    fileType={selectedType}
                  />
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderUploadStatus = () => {
    if (selectedType !== 'seatingchart') return null;
    if (institutes.length === 0) return null;

    const stats = {
      total: institutes.length,
      uploaded: Object.values(instituteStates).filter(s => s.status === 'uploaded' || s.status === 'processed').length,
      processed: Object.values(instituteStates).filter(s => s.status === 'processed').length,
      failed: Object.values(instituteStates).filter(s => s.status === 'failed').length,
    };

    if (stats.uploaded === 0) return null;

    return (
      <div className="bg-muted/30 flex items-center gap-4 rounded-lg border p-3 text-sm">
        <span className="font-medium">Progress:</span>
        <span className="text-green-600">{stats.uploaded} uploaded</span>
        {stats.processed > 0 && <span className="text-blue-600">{stats.processed} processed</span>}
        {stats.failed > 0 && <span className="text-red-600">{stats.failed} failed</span>}
        <span className="text-muted-foreground">of {stats.total}</span>
        {stats.uploaded === stats.total && <Badge className="ml-2 bg-green-500 text-white">All Uploaded</Badge>}
      </div>
    );
  };

  // For non-seating chart types, use the basic uploader
  if (selectedType !== 'seatingchart') {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {allowedTypes.map(type => {
            const config = FILE_TYPE_CONFIGS[type];
            return (
              <Button
                key={type}
                variant={selectedType === type ? 'default' : 'outline'}
                onClick={() => setSelectedType(type)}
                className="flex items-center gap-2"
              >
                {config.icon} {config.name}
              </Button>
            );
          })}
        </div>
        <UniversalFileUploader
          key={selectedType}
          fileType={selectedType}
          ecCode={ecCode}
          onSuccess={onSuccess}
          onProcessingComplete={onProcessingComplete}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {allowedTypes.map(type => {
          const config = FILE_TYPE_CONFIGS[type];
          return (
            <Button
              key={type}
              variant={selectedType === type ? 'default' : 'outline'}
              onClick={() => {
                setSelectedType(type);
                setUploadKey(prev => prev + 1);
              }}
              className="flex items-center gap-2"
            >
              {config.icon} {config.name}
            </Button>
          );
        })}
      </div>

      {renderUploadStatus()}
      {renderInstituteSelector()}
    </div>
  );
}

// ============================================================================
// Basic Uploader (for non-seating chart types)
// ============================================================================

interface UniversalFileUploaderProps {
  fileType: FileType;
  ecCode: string;
  selectedInstituteId?: string;
  onSuccess?: () => void;
  onError?: (error: string) => void;
  onProcessingComplete?: () => void;
  className?: string;
}

export function UniversalFileUploader({
  fileType,
  ecCode,
  selectedInstituteId,
  onSuccess,
  onError,
  onProcessingComplete,
  className,
}: UniversalFileUploaderProps) {
  const config = FILE_TYPE_CONFIGS[fileType];
  const schema = VALIDATION_SCHEMAS[fileType];
  const { status, loading: statusLoading, refetch } = useUploadStatus(fileType, selectedInstituteId);

  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [validationWarnings, setValidationWarnings] = useState<string[]>([]);
  const [processing, setProcessing] = useState(false);
  const [parsedData, setParsedData] = useState<any>(null);
  const [validatedRecordCount, setValidatedRecordCount] = useState(0);

  const validateFile = useCallback(
    async (file: File): Promise<boolean> => {
      setValidationError(null);
      setValidationWarnings([]);
      setValidatedRecordCount(0);

      const ext = getFileExtension(file.name);
      if (file.size > config.maxSize)
        return (setValidationError(`File too large. Max: ${config.maxSize / 1024 / 1024}MB`), false);
      if (!config.acceptedFormats.includes(ext))
        return (setValidationError(`Invalid type. Accepted: ${config.acceptedFormats.join(', ')}`), false);

      try {
        const isHtml = ['.html', '.htm'].includes(ext);

        const result =
          isHtml && config.isHtml
            ? validateAndParseHtmlTimetable(sanitizeHtml(await file.text()))
            : await validateExcelFile(file, schema, fileType);
        if (!result.valid) return (setValidationError(result.error || 'Validation failed'), false);
        if (result.warnings?.length) {
          setValidationWarnings(result.warnings);
          result.warnings.forEach(w => toast.warning(w));
        }

        setParsedData(result.data);
        setValidatedRecordCount(result.recordCount || 0);
        toast.success(`Validated ${result.recordCount || 0} records`);
        return true;
      } catch (err) {
        setValidationError(err instanceof Error ? err.message : 'Validation failed');
        return false;
      }
    },
    [config, schema, fileType]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: async ([file]) => {
      if (await validateFile(file)) {
        setFile(file);
        setValidationError(null);
      }
    },
    accept: config.acceptedFormats.reduce(
      (acc, f) => ({ ...acc, [`application/${f.slice(1)}`]: [f], [`text/${f.slice(1)}`]: [f] }),
      {}
    ),
    maxFiles: 1,
    multiple: false,
    disabled: uploading || processing,
  });

  const uploadFile = async () => {
    if (!file || !(await validateFile(file))) return toast.error('Please fix validation errors');

    if (fileType === 'seatingchart' && !selectedInstituteId) {
      toast.error('Please select a connected institute for the seating chart');
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('file_type', fileType);

    if (fileType === 'seatingchart' && selectedInstituteId) {
      formData.append('connected_institute_id', selectedInstituteId);
    }

    const progressInterval = setInterval(() => setUploadProgress(p => Math.min(p + 10, 90)), 200);

    try {
      const res = await fetch(`${BACKEND_URL}/api/upload/`, { method: 'POST', body: formData, credentials: 'include' });
      clearInterval(progressInterval);
      setUploadProgress(100);
      if (!res.ok) throw new Error((await res.json()).detail || 'Upload failed');

      toast.success((await res.json()).message || 'File uploaded!');
      await refetch();
      setFile(null);
      setParsedData(null);
      setValidatedRecordCount(0);
      onSuccess?.();
    } catch (err: any) {
      setValidationError(err.message);
      toast.error(err.message);
      onError?.(err.message);
    } finally {
      clearInterval(progressInterval);
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const processFile = async () => {
    if (!status?.fileExists) return toast.error('No file to process');
    setProcessing(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/${fileType}/process`, { method: 'POST', credentials: 'include' });
      if (!res.ok) throw new Error((await res.json()).detail || 'Processing failed');
      toast.success((await res.json()).message || 'File processed!');
      await refetch();
      onProcessingComplete?.();
    } catch (err: any) {
      toast.error(err.message);
      onError?.(err.message);
    } finally {
      setProcessing(false);
    }
  };

  const downloadFile = async () => {
    const fileToDownload = status?.storedFilename || status?.fileName;
    if (!fileToDownload) {
      toast.error('No file to download');
      return;
    }
    try {
      const res = await fetch(
        `${BACKEND_URL}/api/upload/download?file_name=${encodeURIComponent(fileToDownload)}&file_type=${fileType}`,
        { credentials: 'include' }
      );
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.detail || 'Download failed');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = status?.fileName || fileToDownload;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Download started');
    } catch (err: any) {
      toast.error(err.message || 'Download failed');
    }
  };

  if (statusLoading) {
    return (
      <Card className={cn('w-full', className)}>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  if (status?.fileExists) {
    return (
      <Card className={cn('w-full', className)}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-primary/10 rounded-lg p-2">{config.icon}</div>
              <div>
                <CardTitle className="text-xl">{config.name}</CardTitle>
                <CardDescription>{status.isProcessed ? 'File processed' : 'File uploaded'}</CardDescription>
              </div>
            </div>
            <Badge variant={status.isProcessed ? 'secondary' : 'default'}>
              {status.isProcessed ? 'Processed' : 'Uploaded'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert variant={'default'}>
            {status.isProcessed ? <CheckCircle2 className="h-4 w-4" /> : <FileCheck className="h-4 w-4" />}
            <AlertTitle>{status.isProcessed ? 'File Processed' : 'File Ready for Processing'}</AlertTitle>
            <AlertDescription>
              <div className="mt-2 space-y-1 text-sm">
                <p>
                  <span className="font-medium">File:</span> <span className="font-mono">{status.fileName}</span>
                </p>
                {status.recordCount !== undefined && status.recordCount !== null && (
                  <p>
                    <span className="font-medium">Records:</span> {status.recordCount}
                  </p>
                )}
                {status.lastUploaded && (
                  <p>
                    <span className="font-medium">Uploaded:</span> {new Date(status.lastUploaded).toLocaleString()}
                  </p>
                )}
              </div>
            </AlertDescription>
          </Alert>
          <div className="flex flex-wrap gap-2">
            {!status.isProcessed && (
              <Button onClick={processFile} disabled={processing} className="gap-2">
                {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Process File
              </Button>
            )}
            <Button variant="outline" onClick={downloadFile} className="gap-2">
              <Download className="h-4 w-4" /> Download
            </Button>
            <Button variant="ghost" onClick={refetch} className="gap-2">
              <RefreshCw className="h-4 w-4" /> Refresh
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn('w-full', className)}>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 rounded-lg p-2">{config.icon}</div>
          <div>
            <CardTitle className="text-xl">{config.name}</CardTitle>
            <CardDescription>{config.description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {validationError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Validation Error</AlertTitle>
            <AlertDescription>{validationError}</AlertDescription>
          </Alert>
        )}
        {validationWarnings.length > 0 && (
          <Alert variant="default" className="border-amber-200 bg-amber-50">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Validation Warnings</AlertTitle>
            <AlertDescription>
              {validationWarnings.slice(0, 3).map((w, i) => (
                <p key={i} className="text-sm">
                  {w}
                </p>
              ))}
              {validationWarnings.length > 3 && (
                <p className="text-muted-foreground text-sm">+{validationWarnings.length - 3} more</p>
              )}
            </AlertDescription>
          </Alert>
        )}

        <div
          {...getRootProps()}
          className={cn(
            'cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-all',
            isDragActive && 'border-primary bg-primary/5',
            file && 'border-green-500 bg-green-50/50 dark:bg-green-950/20',
            (uploading || processing) && 'pointer-events-none opacity-50'
          )}
        >
          <input {...getInputProps()} />
          <div className="flex flex-col items-center gap-3">
            <div className={cn('rounded-full p-3', isDragActive ? 'bg-primary/10' : 'bg-muted')}>
              <FileUp className={cn('h-8 w-8', isDragActive ? 'text-primary' : 'text-muted-foreground')} />
            </div>
            <div>
              <p className="text-lg font-medium">
                {isDragActive ? 'Drop your file here' : file ? file.name : `Upload ${config.name} File`}
              </p>
              <p className="text-muted-foreground mt-1 text-sm">
                {config.acceptedFormats.join(', ')} • Max {config.maxSize / 1024 / 1024}MB
              </p>
            </div>
          </div>
        </div>

        {file && (
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="flex items-center gap-3">
                {config.icon}
                <div>
                  <p className="font-medium">{file.name}</p>
                  <p className="text-muted-foreground text-xs">
                    {(file.size / 1024).toFixed(0)} KB • {file.type || 'Unknown'}
                  </p>
                  {validatedRecordCount > 0 && (
                    <p className="text-xs text-green-600">{validatedRecordCount} valid records</p>
                  )}
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setFile(null)} disabled={uploading}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            {parsedData && validatedRecordCount > 0 && (
              <Alert variant="default">
                <CheckCircle2 className="h-4 w-4" />
                <AlertTitle>Validation Passed</AlertTitle>
                <AlertDescription>
                  Found {validatedRecordCount} valid record{validatedRecordCount !== 1 ? 's' : ''}
                </AlertDescription>
              </Alert>
            )}

            {uploading && (
              <div className="space-y-2">
                <Progress value={uploadProgress} className="h-2" />
                <p className="text-muted-foreground text-center text-sm">Uploading... {uploadProgress}%</p>
              </div>
            )}

            <Button onClick={uploadFile} disabled={uploading || processing || !parsedData} className="w-full">
              {uploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Uploading...
                </>
              ) : (
                <>
                  <FileUp className="mr-2 h-4 w-4" /> Upload File
                </>
              )}
            </Button>
          </div>
        )}

        <Alert variant="default" className="bg-muted/50">
          <Info className="h-4 w-4" />
          <AlertTitle>File Requirements</AlertTitle>
          <AlertDescription className="mt-2 space-y-1 text-sm">
            {config.isHtml ? (
              <>
                <p>• HTML file should contain the MSBTE timetable table</p>
                <p>• Must include date, session, time slot, subject code, subject name, and scheme columns</p>
              </>
            ) : (
              <>
                <p>• Ensure all required columns are present and correctly formatted</p>
                <p>• Remove merged cells and complex formatting</p>
              </>
            )}
            <p className="font-mono text-xs">Expected: {config.expectedColumns?.join(', ')}</p>
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}
