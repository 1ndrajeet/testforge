// components/shared/file-uploader.tsx
'use client';

import { useCallback, useEffect, useState } from 'react';

import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Download,
  FileSignature,
  FileUp,
  Info,
  LayoutGrid,
  Loader2,
  Package,
  RefreshCw,
  Trash2,
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
import { cn } from '@/lib/utils';

// ============================================================================
// Types
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
  lastUploaded?: string;
  recordCount?: number;
  fileSize?: number;
}

interface ValidationResult {
  valid: boolean;
  error?: string;
  warnings?: string[];
  data?: any[];
  recordCount?: number;
}

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
  inventory: {
    SUBJECT_CODE: 'string',
    STUDENT_COUNT: 'number',
    NO_OF_PACKETS: 'number',
  },
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
    maxSize: 10 * 1024 * 1024,
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
    maxSize: 10 * 1024 * 1024,
    expectedColumns: ['Seat Number', 'Enrollment Number', 'Name', 'Scheme', 'Subject Appearing For'],
    backendPrefix: 'sc',
  },
  seatingarrangement: {
    id: 'seatingarrangement',
    name: 'Seating Arrangement',
    description: 'Upload final seating arrangement',
    icon: <LayoutGrid className="h-5 w-5" />,
    acceptedFormats: ['.xlsx', '.xls', '.csv'],
    maxSize: 10 * 1024 * 1024,
    expectedColumns: ['SR No', 'Seat Number', 'Inst Code', 'Course Code', 'Semester', 'Master Code', 'Paper Code'],
    backendPrefix: 'sa',
  },
  emarksheet: {
    id: 'emarksheet',
    name: 'E-Marksheet',
    description: 'Upload e-marksheet data',
    icon: <FileSignature className="h-5 w-5" />,
    acceptedFormats: ['.xlsx', '.xls', '.csv'],
    maxSize: 10 * 1024 * 1024,
    expectedColumns: ['Sheet No', 'Subject Name', 'Scheme', 'Subject Head', 'Paper Code', 'File Name'],
    backendPrefix: 'em',
  },
  inventory: {
    id: 'inventory',
    name: 'Inventory',
    description: 'Upload question paper inventory',
    icon: <Package className="h-5 w-5" />,
    acceptedFormats: ['.xlsx', '.xls', '.csv'],
    maxSize: 10 * 1024 * 1024,
    expectedColumns: ['Subject Code', 'Student Count', 'No of Packets'],
    backendPrefix: 'inv',
  },
};

// ============================================================================
// HTML Sanitization
// ============================================================================

function sanitizeHtml(html: string): string {
  let sanitized = html;

  sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  sanitized = sanitized.replace(/\s*on\w+="[^"]*"/gi, '');
  sanitized = sanitized.replace(/\s*on\w+='[^']*'/gi, '');
  sanitized = sanitized.replace(/javascript:/gi, '');
  sanitized = sanitized.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');
  sanitized = sanitized.replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '');
  sanitized = sanitized.replace(/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, '');

  return sanitized;
}

// ============================================================================
// HTML Timetable Parser with Validation
// ============================================================================

function validateAndParseHtmlTimetable(html: string): ValidationResult {
  const warnings: string[] = [];

  // Check for tables
  if (!html.includes('<table') && !html.includes('<TABLE')) {
    return { valid: false, error: 'No HTML table found in the file' };
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const entries: any[] = [];

  const tables = Array.from(doc.querySelectorAll('table'));
  let targetTable: Element | null = null;

  for (const table of tables) {
    const text = table.textContent?.toLowerCase() || '';
    if (text.includes('time table') || text.includes('subject code') || text.includes('scheme')) {
      targetTable = table;
      break;
    }
  }

  if (!targetTable) {
    targetTable = tables.find(t => t.querySelectorAll('tr').length > 2) || null;
  }

  if (!targetTable) {
    return { valid: false, error: 'Could not find timetable table in HTML' };
  }

  const rows = targetTable.querySelectorAll('tr');
  let currentDate = '';
  let currentSession = '';

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const cells = row.querySelectorAll('th, td');
    const rowText = row.textContent?.toLowerCase() || '';

    if (rowText.includes('date:') || rowText.includes('day:')) {
      const dateMatch = rowText.match(/(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/);
      if (dateMatch) {
        currentDate = dateMatch[1];
        if (currentDate.includes('-')) {
          const parts = currentDate.split('-');
          if (parts[2]?.length === 2) {
            currentDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
          }
        } else if (currentDate.includes('/')) {
          const parts = currentDate.split('/');
          if (parts[2]?.length === 2) {
            currentDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
          }
        }
      }
      currentSession = rowText.includes('morning') ? 'Morning' : rowText.includes('afternoon') ? 'Afternoon' : '';
      continue;
    }

    const headerKeywords = ['subject code', 'subject name', 'time', 'scheme', 'paper', 'code'];
    const isHeaderRow = headerKeywords.some(keyword => rowText.includes(keyword));
    if (isHeaderRow && cells.length >= 3) {
      continue;
    }

    if (cells.length >= 4) {
      const timeSlot = cells[0]?.textContent?.trim() || '';
      const subjectCode = cells[1]?.textContent?.trim() || '';
      const subjectName = cells[2]?.textContent?.trim() || '';
      let scheme = cells[3]?.textContent?.trim() || '';

      scheme = scheme.replace(/\s+/g, '').split(',')[0].trim();

      if (subjectCode && subjectName && scheme && currentDate) {
        entries.push({
          date: currentDate,
          session: currentSession,
          timeSlot,
          subjectCode,
          subjectName,
          scheme,
        });
      } else if (subjectCode || subjectName) {
        warnings.push(
          `Row ${i + 1}: Missing required data (date: ${currentDate || 'missing'}, scheme: ${scheme || 'missing'})`
        );
      }
    }
  }

  if (entries.length === 0) {
    return { valid: false, error: 'No valid timetable entries found in HTML' };
  }

  if (warnings.length > 0) {
    warnings.unshift(`Found ${entries.length} entries with ${warnings.length} warnings`);
  }

  return { valid: true, data: entries, recordCount: entries.length, warnings };
}

// ============================================================================
// Excel/CSV Validation with Enhanced Checks
// ============================================================================

async function validateExcelFile(file: File, schema: Record<string, string>): Promise<ValidationResult> {
  return new Promise(resolve => {
    const reader = new FileReader();

    reader.onload = e => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });

        if (!workbook.SheetNames.length) {
          resolve({ valid: false, error: 'No sheets found in the file' });
          return;
        }

        let validData: any[] = [];
        let lastError: string | null = null;
        const warnings: string[] = [];

        for (const sheetName of workbook.SheetNames) {
          try {
            const sheet = workbook.Sheets[sheetName];
            const rawData = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: '' });

            if (!rawData.length || rawData.length < 2) {
              warnings.push(`Sheet "${sheetName}" is empty or has no data`);
              continue;
            }

            let headerRowIndex = -1;
            let headers: string[] = [];

            // Find header row
            for (let i = 0; i < Math.min(rawData.length, 10); i++) {
              const row = rawData[i];
              if (row && row.length) {
                const rowHeaders = row.map((h: any) =>
                  String(h || '')
                    .trim()
                    .toUpperCase()
                );
                const expectedHeaders = Object.keys(schema);
                const matchCount = expectedHeaders.filter(h => rowHeaders.includes(h)).length;

                if (matchCount >= expectedHeaders.length * 0.7) {
                  headerRowIndex = i;
                  headers = rowHeaders;
                  break;
                }
              }
            }

            if (headerRowIndex === -1) {
              warnings.push(`Sheet "${sheetName}": Could not find header row with expected columns`);
              continue;
            }

            const expectedHeaders = Object.keys(schema);
            const columnIndices: Record<string, number> = {};
            const missingColumns: string[] = [];

            for (const expected of expectedHeaders) {
              const index = headers.findIndex(h => h === expected);
              if (index !== -1) {
                columnIndices[expected] = index;
              } else {
                missingColumns.push(expected);
              }
            }

            if (missingColumns.length > 0) {
              warnings.push(`Sheet "${sheetName}": Missing columns: ${missingColumns.join(', ')}`);
            }

            const jsonData = [];
            let emptyRows = 0;
            let invalidRows = 0;

            for (let rowIdx = headerRowIndex + 1; rowIdx < rawData.length; rowIdx++) {
              const row = rawData[rowIdx];
              if (!row || row.every((cell: any) => !cell || String(cell).trim() === '')) {
                emptyRows++;
                continue;
              }

              const record: any = {};
              let hasData = false;
              let rowInvalid = false;

              for (const [col, expectedType] of Object.entries(schema)) {
                const colIdx = columnIndices[col];
                let value = colIdx !== undefined && colIdx < row.length ? row[colIdx] : '';

                if (value !== undefined && value !== null && String(value).trim() !== '') {
                  hasData = true;
                  value = String(value).trim();

                  if (expectedType === 'number') {
                    const num = Number(value);
                    if (isNaN(num)) {
                      const extracted = value.match(/\d+/);
                      if (extracted) {
                        value = Number(extracted[0]);
                      } else {
                        rowInvalid = true;
                        record[col] = 0;
                        continue;
                      }
                    } else {
                      value = num;
                    }
                    record[col] = value;
                  } else {
                    record[col] = value;
                  }
                } else if (expectedType === 'number') {
                  record[col] = 0;
                } else {
                  record[col] = '';
                }
              }

              if (hasData && !rowInvalid) {
                jsonData.push(record);
              } else if (hasData && rowInvalid) {
                invalidRows++;
              }
            }

            if (jsonData.length > 0) {
              validData = jsonData;
              if (emptyRows > 0) warnings.push(`Sheet "${sheetName}": Skipped ${emptyRows} empty rows`);
              if (invalidRows > 0) warnings.push(`Sheet "${sheetName}": Skipped ${invalidRows} rows with invalid data`);
              break;
            } else if (jsonData.length === 0 && warnings.length === 0) {
              lastError = `Sheet "${sheetName}": No valid data rows found`;
            }
          } catch (err) {
            lastError = `Sheet "${sheetName}": ${err instanceof Error ? err.message : 'Parsing failed'}`;
            continue;
          }
        }

        if (validData.length === 0) {
          resolve({ valid: false, error: lastError || 'No valid data rows found in any sheet', warnings });
          return;
        }

        resolve({
          valid: true,
          data: validData,
          recordCount: validData.length,
          warnings: warnings.length > 0 ? warnings : undefined,
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
}

// ============================================================================
// Status Check Hook
// ============================================================================

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

function useUploadStatus(fileType: FileType, ecCode: string) {
  const [status, setStatus] = useState<UploadStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const checkStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${BACKEND_URL}/api/upload/status?file_type=${fileType}&exam_center_id=${ecCode}`);

      if (response.status === 404) {
        setStatus({ fileExists: false, isProcessed: false });
        return;
      }

      if (!response.ok) throw new Error('Failed to check status');
      const data = await response.json();
      setStatus(data.data || data);
    } catch (err) {
      console.warn(`Failed to check upload status for ${fileType}:`, err);
      setStatus({ fileExists: false, isProcessed: false });
    } finally {
      setLoading(false);
    }
  }, [fileType, ecCode]);

  useEffect(() => {
    if (ecCode) {
      checkStatus();
    }
  }, [checkStatus, ecCode]);

  return { status, loading, error, refetch: checkStatus };
}

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
  const { status, loading: statusLoading, error: statusError, refetch } = useUploadStatus(fileType, ecCode);

  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [validationWarnings, setValidationWarnings] = useState<string[]>([]);
  const [processing, setProcessing] = useState(false);
  const [parsedData, setParsedData] = useState<any>(null);
  const [validatedRecordCount, setValidatedRecordCount] = useState<number>(0);

  const validateFile = useCallback(
    async (file: File): Promise<boolean> => {
      setValidationError(null);
      setValidationWarnings([]);
      setValidatedRecordCount(0);

      // Check file size
      if (file.size > config.maxSize) {
        setValidationError(`File too large. Max size: ${config.maxSize / 1024 / 1024}MB`);
        return false;
      }

      // Check file extension
      const fileExt = '.' + file.name.split('.').pop()?.toLowerCase();
      const isValidType = config.acceptedFormats.includes(fileExt);

      if (!isValidType) {
        setValidationError(`Invalid file type. Accepted: ${config.acceptedFormats.join(', ')}`);
        return false;
      }

      const isHtml = fileExt === '.html' || fileExt === '.htm';

      try {
        let result: ValidationResult;

        if (isHtml && config.isHtml) {
          const html = await file.text();
          const sanitized = sanitizeHtml(html);
          if (sanitized !== html) {
            toast.warning('Potentially unsafe content was removed from the HTML file');
          }
          result = validateAndParseHtmlTimetable(sanitized);
        } else if (schema) {
          result = await validateExcelFile(file, schema);
        } else {
          setValidationError('No validation schema available for this file type');
          return false;
        }

        if (!result.valid) {
          setValidationError(result.error || 'Validation failed');
          return false;
        }

        // Show warnings if any
        if (result.warnings && result.warnings.length > 0) {
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

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) return;
      const selectedFile = acceptedFiles[0];
      const isValid = await validateFile(selectedFile);
      if (isValid) {
        setFile(selectedFile);
        setValidationError(null);
      }
    },
    [validateFile]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: config.acceptedFormats.reduce(
      (acc, format) => {
        if (format.startsWith('.')) {
          acc[`application/${format.slice(1)}`] = [format];
          acc[`text/${format.slice(1)}`] = [format];
        }
        return acc;
      },
      {} as Record<string, string[]>
    ),
    maxFiles: 1,
    multiple: false,
    disabled: uploading || processing,
  });

  const uploadFile = async () => {
    if (!file) return;

    // Final validation before upload
    const isValid = await validateFile(file);
    if (!isValid) {
      toast.error('Please fix validation errors before uploading');
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('file_type', fileType);

    // Simulate progress
    const progressInterval = setInterval(() => {
      setUploadProgress(prev => Math.min(prev + 10, 90));
    }, 200);

    try {
      const response = await fetch(`${BACKEND_URL}/api/upload/`, {
        method: 'POST',
        body: formData,
      });

      clearInterval(progressInterval);
      setUploadProgress(100);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || error.message || 'Upload failed');
      }

      const result = await response.json();
      toast.success(result.message || 'File uploaded successfully!');
      await refetch();
      setFile(null);
      setParsedData(null);
      setValidatedRecordCount(0);
      onSuccess?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      setValidationError(message);
      toast.error(message);
      onError?.(message);
    } finally {
      clearInterval(progressInterval);
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const processFile = async () => {
    if (!status?.fileExists) {
      toast.error('No file uploaded to process');
      return;
    }

    setProcessing(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/${fileType}/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || error.message || 'Processing failed');
      }

      const result = await response.json();
      toast.success(result.message || 'File processed successfully!');
      await refetch();
      onProcessingComplete?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Processing failed';
      toast.error(message);
      onError?.(message);
    } finally {
      setProcessing(false);
    }
  };

  const deleteFile = async () => {
    if (!status?.fileExists) return;

    try {
      const response = await fetch(`${BACKEND_URL}/api/upload/?file_type=${fileType}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Delete failed');

      toast.success('File deleted successfully!');
      await refetch();
      setFile(null);
      setParsedData(null);
      setValidatedRecordCount(0);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Delete failed';
      toast.error(message);
      onError?.(message);
    }
  };

  const downloadFile = async () => {
    if (!status?.fileName) return;

    try {
      const response = await fetch(
        `${BACKEND_URL}/api/upload/download?file_name=${status.fileName}&file_type=${fileType}`
      );

      if (!response.ok) throw new Error('Download failed');

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = status.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Download started');
    } catch {
      toast.error('Download failed');
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

  return (
    <Card className={cn('w-full', className)}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 rounded-lg p-2">{config.icon}</div>
            <div>
              <CardTitle className="text-xl">{config.name}</CardTitle>
              <CardDescription>{config.description}</CardDescription>
            </div>
          </div>
          {status?.fileExists && (
            <Badge variant={status.isProcessed ? 'secondary' : 'default'}>
              {status.isProcessed ? 'Processed' : 'Uploaded'}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {statusError && statusError !== 'Failed to check status' && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{statusError}</AlertDescription>
          </Alert>
        )}

        {validationError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Validation Error</AlertTitle>
            <AlertDescription>{validationError}</AlertDescription>
          </Alert>
        )}

        {validationWarnings.length > 0 && (
          <Alert
            variant="default"
            className="border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950/20"
          >
            <AlertCircle className="h-4 w-4 text-yellow-600" />
            <AlertTitle>Validation Warnings</AlertTitle>
            <AlertDescription className="space-y-1">
              {validationWarnings.slice(0, 3).map((w, i) => (
                <p key={i} className="text-sm">
                  {w}
                </p>
              ))}
              {validationWarnings.length > 3 && (
                <p className="text-muted-foreground text-sm">+{validationWarnings.length - 3} more warnings</p>
              )}
            </AlertDescription>
          </Alert>
        )}

        {status?.fileExists ? (
          <div className="space-y-4">
            <Alert variant="default" className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/20">
              <Info className="h-4 w-4 text-blue-600" />
              <AlertTitle>File Status</AlertTitle>
              <AlertDescription className="space-y-1">
                <p>
                  File: <span className="font-mono">{status.fileName}</span>
                </p>
                {status.lastUploaded && <p>Uploaded: {new Date(status.lastUploaded).toLocaleString()}</p>}
                {status.recordCount && <p>Records: {status.recordCount}</p>}
                {status.isProcessed ? (
                  <p className="text-green-600 dark:text-green-400">File has been processed</p>
                ) : (
                  <p className="text-amber-600 dark:text-amber-400">File uploaded but not processed</p>
                )}
              </AlertDescription>
            </Alert>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={downloadFile}>
                <Download className="mr-2 h-4 w-4" />
                Download
              </Button>
              <Button variant="destructive" size="sm" onClick={deleteFile}>
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
              {!status.isProcessed && (
                <Button onClick={processFile} disabled={processing} size="sm">
                  {processing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Process File
                    </>
                  )}
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={refetch}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh
              </Button>
            </div>
          </div>
        ) : (
          <>
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
                        {(file.size / 1024).toFixed(0)} KB • {file.type || 'Unknown type'}
                      </p>
                      {validatedRecordCount > 0 && (
                        <p className="text-xs text-green-600">{validatedRecordCount} valid records found</p>
                      )}
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setFile(null)} disabled={uploading}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                {parsedData && validatedRecordCount > 0 && (
                  <Alert className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/20">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
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
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <FileUp className="mr-2 h-4 w-4" />
                      Upload File
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
                    <p>• File must include date, session, time slot, subject code, subject name, and scheme columns</p>
                    <p>• Script tags and inline JavaScript will be automatically removed for security</p>
                    <p className="font-mono text-xs">Expected columns: {config.expectedColumns?.join(', ')}</p>
                  </>
                ) : (
                  <>
                    <p>• Ensure all required columns are present and correctly formatted</p>
                    <p>• Remove merged cells and complex formatting before uploading</p>
                    <p>• Each row should represent one record with consistent data types</p>
                    <p className="font-mono text-xs">Expected columns: {config.expectedColumns?.join(', ')}</p>
                  </>
                )}
              </AlertDescription>
            </Alert>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Wrapper Component with File Type Selector
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
              {config.icon}
              {config.name}
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
