// components/shared/file-uploader.tsx
'use client';

import { useCallback, useEffect, useState } from 'react';

import {
  AlertCircle,
  Calendar,
  CheckCircle2,
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
import { Progress } from '@/components/ui/progress';
import { type UploadFileType as ActionFileType, getUploadStatus } from '@/lib/actions/upload';
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
  storedFilename?: string; // ADD THIS
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

  // Find header row
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

  // Map columns
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

  // Get session headers
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

  // Find header for this table
  let currentHeader: { date: string; session: string; day: number } | null = null;
  let prev = targetTable.previousElementSibling;
  while (prev) {
    if (headerMap.has(prev)) {
      currentHeader = headerMap.get(prev)!;
      break;
    }
    prev = prev.previousElementSibling;
  }

  // Parse rows
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

const validateExcelFile = (file: File, schema: Record<string, string>): Promise<ValidationResult> =>
  new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const workbook = XLSX.read(new Uint8Array(e.target?.result as ArrayBuffer), { type: 'array' });
        if (!workbook.SheetNames.length) return resolve({ valid: false, error: 'No sheets found' });

        let validData: any[] = [];
        const warnings: string[] = [];

        for (const sheetName of workbook.SheetNames) {
          const rawData = XLSX.utils.sheet_to_json<any[]>(workbook.Sheets[sheetName], { header: 1, defval: '' });
          if (rawData.length < 2) {
            warnings.push(`Sheet "${sheetName}" is empty`);
            continue;
          }

          // Find header row
          let headerIdx = -1;
          let headers: string[] = [];
          const expectedHeaders = Object.keys(schema);
          for (let i = 0; i < Math.min(rawData.length, 10); i++) {
            const rowHeaders = rawData[i].map((h: any) =>
              String(h || '')
                .trim()
                .toUpperCase()
            );
            if (expectedHeaders.filter(h => rowHeaders.includes(h)).length >= expectedHeaders.length * 0.7) {
              headerIdx = i;
              headers = rowHeaders;
              break;
            }
          }
          if (headerIdx === -1) {
            warnings.push(`Sheet "${sheetName}": No header row found`);
            continue;
          }

          // Map columns
          const colIdx: Record<string, number> = {};
          for (const expected of expectedHeaders) {
            const idx = headers.findIndex(h => h === expected);
            if (idx !== -1) colIdx[expected] = idx;
          }

          // Parse data
          const jsonData: any[] = [];
          for (let rowIdx = headerIdx + 1; rowIdx < rawData.length; rowIdx++) {
            const row = rawData[rowIdx];
            if (!row || row.every((c: any) => !c || String(c).trim() === '')) continue;

            const record: any = {};
            let hasData = false;
            let invalid = false;

            for (const [col, type] of Object.entries(schema)) {
              const idx = colIdx[col];
              let value = idx !== undefined ? row[idx] : '';
              if (value !== undefined && value !== null && String(value).trim() !== '') {
                hasData = true;
                value = String(value).trim();
                if (type === 'number') {
                  const num = Number(value);
                  if (isNaN(num)) {
                    invalid = true;
                    record[col] = 0;
                  } else record[col] = num;
                } else record[col] = value;
              } else record[col] = type === 'number' ? 0 : '';
            }

            if (hasData && !invalid) jsonData.push(record);
          }

          if (jsonData.length) {
            validData = jsonData;
            break;
          }
        }

        if (!validData.length) return resolve({ valid: false, error: 'No valid data rows found', warnings });
        resolve({
          valid: true,
          data: validData,
          recordCount: validData.length,
          warnings: warnings.length ? warnings : undefined,
        });
      } catch (error) {
        resolve({ valid: false, error: `Error parsing file: ${error instanceof Error ? error.message : 'Unknown'}` });
      }
    };
    reader.onerror = () => resolve({ valid: false, error: 'Error reading file' });
    reader.readAsArrayBuffer(file);
  });

// ============================================================================
// Status Check Hook
// ============================================================================

const useUploadStatus = (fileType: FileType) => {
  const [status, setStatus] = useState<UploadStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const checkStatus = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getUploadStatus(fileType as ActionFileType);
      if (result.success) {
        const { data } = result;
        setStatus({
          fileExists: data.fileExists,
          isProcessed: data.isProcessed,
          fileName: data.fileName || undefined,
          storedFilename: data.storedFilename || undefined, // ADD THIS
          recordCount: data.recordCount || undefined,
          lastUploaded: data.uploadedAt ? new Date(data.uploadedAt).toISOString() : undefined,
          status: data.status || undefined,
        });
      } else setStatus({ fileExists: false, isProcessed: false });
    } catch {
      setStatus({ fileExists: false, isProcessed: false });
    } finally {
      setLoading(false);
    }
  }, [fileType]);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);
  return { status, loading, refetch: checkStatus };
};

// ============================================================================
// Reusable Components
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

const FileDropzone = ({ config, file, isDragActive, uploading, processing, getRootProps, getInputProps }: any) => (
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
);

const ActionButtons = ({
  actions,
}: {
  actions: Array<{
    label: string;
    icon?: React.ReactNode;
    onClick: () => void;
    variant?: string;
    disabled?: boolean;
    loading?: boolean;
  }>;
}) => (
  <div className="flex flex-wrap gap-2">
    {actions.map((action, i) => (
      <Button
        key={i}
        onClick={action.onClick}
        disabled={action.disabled}
        variant={(action.variant as any) || 'default'}
        size="sm"
        className="gap-2"
      >
        {action.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : action.icon}
        {action.label}
      </Button>
    ))}
  </div>
);

// ============================================================================
// Main Component
// ============================================================================

interface UniversalFileUploaderProps {
  fileType: FileType;
  ecCode: string;
  onSuccess?: () => void;
  onError?: (error: string) => void;
  onProcessingComplete?: () => void;
  className?: string;
}

export function UniversalFileUploader({
  fileType,
  ecCode,
  onSuccess,
  onError,
  onProcessingComplete,
  className,
}: UniversalFileUploaderProps) {
  const config = FILE_TYPE_CONFIGS[fileType];
  const schema = VALIDATION_SCHEMAS[fileType];
  const { status, loading: statusLoading, refetch } = useUploadStatus(fileType);

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
            : await validateExcelFile(file, schema);

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
    [config, schema]
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

    setUploading(true);
    setUploadProgress(0);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('file_type', fileType);

    const progressInterval = setInterval(() => setUploadProgress(p => Math.min(p + 10, 90)), 200);

    try {
      const res = await fetch(`${BACKEND_URL}/api/upload/`, { method: 'POST', body: formData });
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
      const res = await fetch(`${BACKEND_URL}/api/${fileType}/process`, { method: 'POST' });
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
    const fileToDownload = status?.storedFilename || status?.fileName; // Use storedFilename first
    if (!fileToDownload) {
      toast.error('No file to download');
      return;
    }
    try {
      const res = await fetch(
        `${BACKEND_URL}/api/upload/download?file_name=${encodeURIComponent(fileToDownload)}&file_type=${fileType}`
      );
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.detail || 'Download failed');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = status?.fileName || fileToDownload; // Use original filename for download name
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

  // Status helper
  const getStatusProps = (isProcessed: boolean) => ({
    badge: isProcessed ? { label: 'Processed', variant: 'secondary' } : { label: 'Uploaded', variant: 'default' },
    alert: isProcessed
      ? { variant: 'success', icon: CheckCircle2, title: 'File Processed', desc: 'File processed successfully' }
      : {
          variant: 'default',
          icon: FileCheck,
          title: 'File Ready for Processing',
          desc: 'Uploaded successfully. Needs processing.',
        },
    actions: isProcessed
      ? [{ label: 'Download', icon: <Download className="h-4 w-4" />, onClick: downloadFile, variant: 'outline' }]
      : [
          {
            label: 'Process File',
            icon: processing ? undefined : <Play className="h-4 w-4" />,
            onClick: processFile,
            loading: processing,
          },
          { label: 'Download', icon: <Download className="h-4 w-4" />, onClick: downloadFile, variant: 'outline' },
        ],
  });

  if (status?.fileExists) {
    const props = getStatusProps(status.isProcessed);
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
            <Badge variant={props.badge.variant as any}>{props.badge.label}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <StatusAlert
            variant={props.alert.variant as any}
            icon={props.alert.icon}
            title={props.alert.title}
            description={props.alert.desc}
          >
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
          </StatusAlert>
          <ActionButtons
            actions={[
              ...props.actions,
              { label: 'Refresh', icon: <RefreshCw className="h-4 w-4" />, onClick: refetch, variant: 'ghost' },
            ]}
          />
        </CardContent>
      </Card>
    );
  }

  // Upload screen
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
          <StatusAlert
            variant="destructive"
            icon={AlertCircle}
            title="Validation Error"
            description={validationError}
          />
        )}
        {validationWarnings.length > 0 && (
          <StatusAlert variant="default" icon={AlertCircle} title="Validation Warnings">
            {validationWarnings.slice(0, 3).map((w, i) => (
              <p key={i} className="text-sm">
                {w}
              </p>
            ))}
            {validationWarnings.length > 3 && (
              <p className="text-muted-foreground text-sm">+{validationWarnings.length - 3} more</p>
            )}
          </StatusAlert>
        )}

        <FileDropzone {...{ config, file, isDragActive, uploading, processing, getRootProps, getInputProps }} />

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
              <StatusAlert
                variant="success"
                icon={CheckCircle2}
                title="Validation Passed"
                description={`Found ${validatedRecordCount} valid record${validatedRecordCount !== 1 ? 's' : ''}`}
              />
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
                <p className="font-mono text-xs">Expected: {config.expectedColumns?.join(', ')}</p>
              </>
            ) : (
              <>
                <p>• Ensure all required columns are present and correctly formatted</p>
                <p>• Remove merged cells and complex formatting</p>
                <p className="font-mono text-xs">Expected: {config.expectedColumns?.join(', ')}</p>
              </>
            )}
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Wrapper Component
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

  return (
    <div className="space-y-6">
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
