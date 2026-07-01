// hooks/useFileUpload.ts
'use client';

import { useCallback, useRef, useState } from 'react';

import { toast } from 'sonner';

export interface FileValidationResult {
  valid: boolean;
  error?: string;
}

export interface FileUploadOptions {
  allowedTypes?: string[];
  allowedExtensions?: string[];
  maxSizeMB?: number;
  maxFiles?: number;
  validateContent?: (file: File) => Promise<boolean | string>;
}

export interface UseFileUploadReturn {
  // State
  files: File[];
  isUploading: boolean;
  uploadProgress: number;
  error: string | null;

  // Actions
  setFiles: (files: File[]) => void;
  addFiles: (files: File[]) => void;
  removeFile: (index: number) => void;
  clearFiles: () => void;

  // Validation
  validateFile: (file: File) => FileValidationResult;
  validateAll: () => boolean;

  // Upload
  uploadFiles: (endpoint: string, formDataBuilder?: (files: File[]) => FormData) => Promise<any>;

  // UI Helpers
  getTotalSize: () => string;
  getStatus: () => { isValid: boolean; errors: string[] };
}

const DEFAULT_OPTIONS: Required<Omit<FileUploadOptions, 'validateContent'>> = {
  allowedTypes: [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/html',
    'application/xhtml+xml',
  ],
  allowedExtensions: ['.xlsx', '.xls', '.html', '.htm'],
  maxSizeMB: 10,
  maxFiles: 1,
};

export function useFileUpload(options: FileUploadOptions = {}): UseFileUploadReturn {
  const mergedOptions = { ...DEFAULT_OPTIONS, ...options };
  const [files, setFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const validateFile = useCallback(
    (file: File): FileValidationResult => {
      // Check file extension
      const extension = '.' + file.name.split('.').pop()?.toLowerCase();
      if (!mergedOptions.allowedExtensions.includes(extension)) {
        return {
          valid: false,
          error: `Invalid file type. Allowed: ${mergedOptions.allowedExtensions.join(', ')}`,
        };
      }

      // Check MIME type
      if (!mergedOptions.allowedTypes.includes(file.type) && file.type !== '') {
        return {
          valid: false,
          error: `Invalid file format. Please upload a valid file.`,
        };
      }

      // Check file size
      const maxSizeBytes = mergedOptions.maxSizeMB * 1024 * 1024;
      if (file.size > maxSizeBytes) {
        return {
          valid: false,
          error: `File size exceeds ${mergedOptions.maxSizeMB}MB limit. Current: ${(file.size / 1024 / 1024).toFixed(2)}MB`,
        };
      }

      return { valid: true };
    },
    [mergedOptions],
  );

  const validateAll = useCallback((): boolean => {
    for (const file of files) {
      const result = validateFile(file);
      if (!result.valid) {
        setError(result.error || 'Invalid file');
        return false;
      }
    }
    setError(null);
    return true;
  }, [files, validateFile]);

  const addFiles = useCallback(
    (newFiles: File[]) => {
      const validFiles: File[] = [];
      const errors: string[] = [];

      for (const file of newFiles) {
        const result = validateFile(file);
        if (result.valid) {
          validFiles.push(file);
        } else {
          errors.push(`${file.name}: ${result.error}`);
        }
      }

      if (errors.length > 0) {
        toast.error(errors.join('\n'));
      }

      const updatedFiles = [...files, ...validFiles];
      if (updatedFiles.length > mergedOptions.maxFiles) {
        toast.error(`Maximum ${mergedOptions.maxFiles} file(s) allowed`);
        setFiles(updatedFiles.slice(0, mergedOptions.maxFiles));
      } else {
        setFiles(updatedFiles);
      }
    },
    [files, validateFile, mergedOptions.maxFiles],
  );

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setError(null);
  }, []);

  const clearFiles = useCallback(() => {
    setFiles([]);
    setError(null);
    setUploadProgress(0);
  }, []);

  const uploadFiles = useCallback(
    async (endpoint: string, formDataBuilder?: (files: File[]) => FormData): Promise<any> => {
      if (!validateAll()) {
        throw new Error('File validation failed');
      }

      if (files.length === 0) {
        throw new Error('No files to upload');
      }

      setIsUploading(true);
      setUploadProgress(0);
      setError(null);

      abortControllerRef.current = new AbortController();

      try {
        const formData = formDataBuilder
          ? formDataBuilder(files)
          : (() => {
              const fd = new FormData();
              files.forEach((file) => fd.append('files', file));
              return fd;
            })();

        const xhr = new XMLHttpRequest();

        const uploadPromise = new Promise((resolve, reject) => {
          xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
              const percentComplete = Math.round((e.loaded * 100) / e.total);
              setUploadProgress(percentComplete);
            }
          });

          xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                const response = JSON.parse(xhr.responseText);
                resolve(response);
              } catch {
                resolve({ success: true });
              }
            } else {
              try {
                const error = JSON.parse(xhr.responseText);
                reject(new Error(error.error || error.message || 'Upload failed'));
              } catch {
                reject(new Error(`Upload failed with status ${xhr.status}`));
              }
            }
          });

          xhr.addEventListener('error', () => reject(new Error('Network error occurred')));
          xhr.addEventListener('abort', () => reject(new Error('Upload cancelled')));

          xhr.open('POST', endpoint);
          xhr.send(formData);
        });

        const result = await uploadPromise;
        toast.success('Upload completed successfully');
        clearFiles();
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Upload failed';
        setError(message);
        toast.error(message);
        throw err;
      } finally {
        setIsUploading(false);
        setUploadProgress(0);
        abortControllerRef.current = null;
      }
    },
    [files, validateAll, clearFiles],
  );

  const getTotalSize = useCallback((): string => {
    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    if (totalBytes === 0) return '0 B';
    if (totalBytes < 1024) return `${totalBytes} B`;
    if (totalBytes < 1024 * 1024) return `${(totalBytes / 1024).toFixed(2)} KB`;
    return `${(totalBytes / 1024 / 1024).toFixed(2)} MB`;
  }, [files]);

  const getStatus = useCallback(() => {
    const errors: string[] = [];
    for (const file of files) {
      const result = validateFile(file);
      if (!result.valid && result.error) {
        errors.push(`${file.name}: ${result.error}`);
      }
    }
    return { isValid: errors.length === 0, errors };
  }, [files, validateFile]);

  return {
    files,
    isUploading,
    uploadProgress,
    error,
    setFiles,
    addFiles,
    removeFile,
    clearFiles,
    validateFile,
    validateAll,
    uploadFiles,
    getTotalSize,
    getStatus,
  };
}
