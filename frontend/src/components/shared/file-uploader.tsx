// components/shared/file-uploader.tsx
'use client';

import { useCallback, useState } from 'react';

import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, CheckCircle2, File, FileSpreadsheet, FileText, Trash2, Upload, X } from 'lucide-react';
import { useDropzone } from 'react-dropzone';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export interface FileUploaderProps {
  // Core props
  onUpload: (files: File[]) => Promise<any>;
  accept?: Record<string, string[]>;
  maxSize?: number;
  maxFiles?: number;

  // Visual props
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  className?: string;
  dropzoneClassName?: string;

  // Behavior
  multiple?: boolean;
  disabled?: boolean;
  showPreview?: boolean;
  showProgress?: boolean;

  // Callbacks
  onSuccess?: (result: any) => void;
  onError?: (error: Error) => void;
  onFileSelect?: (files: File[]) => void;

  // Validation
  validateFile?: (file: File) => { valid: boolean; error?: string };

  // Upload configuration
  endpoint?: string;
  formDataBuilder?: (files: File[]) => FormData;
}

interface FileWithPreview extends File {
  preview?: string;
}

export function FileUploader({
  onUpload,
  accept,
  maxSize = 10 * 1024 * 1024, // 10MB default
  maxFiles = 1,
  title = 'Upload Files',
  description = 'Drag and drop files here, or click to browse',
  icon,
  className,
  dropzoneClassName,
  multiple = false,
  disabled = false,
  showPreview = true,
  showProgress = true,
  onSuccess,
  onError,
  onFileSelect,
  validateFile: customValidate,
  endpoint,
  formDataBuilder,
}: FileUploaderProps) {
  const [files, setFiles] = useState<FileWithPreview[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const validateFile = useCallback(
    (file: File): { valid: boolean; error?: string } => {
      // Size validation
      if (file.size > maxSize) {
        return {
          valid: false,
          error: `File exceeds ${maxSize / 1024 / 1024}MB limit`,
        };
      }

      // Type validation
      if (accept) {
        const allowedMimeTypes = Object.values(accept).flat();
        const allowedExtensions = Object.keys(accept).flatMap(key => accept[key].map(ext => ext.toLowerCase()));

        const fileExt = '.' + file.name.split('.').pop()?.toLowerCase();
        const isValidType = allowedMimeTypes.includes(file.type) || allowedExtensions.includes(fileExt);

        if (!isValidType) {
          return {
            valid: false,
            error: `Invalid file type. Allowed: ${allowedExtensions.join(', ')}`,
          };
        }
      }

      // Custom validation
      if (customValidate) {
        return customValidate(file);
      }

      return { valid: true };
    },
    [maxSize, accept, customValidate]
  );

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const validFiles: FileWithPreview[] = [];
      const errors: string[] = [];

      for (const file of acceptedFiles) {
        const validation = validateFile(file);
        if (validation.valid) {
          const fileWithPreview = Object.assign(file, {
            preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
          });
          validFiles.push(fileWithPreview);
        } else if (validation.error) {
          errors.push(`${file.name}: ${validation.error}`);
        }
      }

      if (errors.length > 0) {
        setError(errors.join('\n'));
      } else {
        setError(null);
      }

      const newFiles = multiple ? [...files, ...validFiles] : validFiles;
      const limitedFiles = newFiles.slice(0, maxFiles);

      setFiles(limitedFiles);
      onFileSelect?.(limitedFiles);
    },
    [validateFile, multiple, files, maxFiles, onFileSelect]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept,
    maxSize,
    multiple,
    disabled: disabled || uploading,
  });

  const removeFile = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (files[index].preview) {
      URL.revokeObjectURL(files[index].preview!);
    }
    setFiles(prev => prev.filter((_, i) => i !== index));
    setError(null);
    setSuccess(false);
  };

  const handleUpload = async () => {
    if (files.length === 0) {
      setError('Please select files to upload');
      return;
    }

    setUploading(true);
    setProgress(0);
    setError(null);
    setSuccess(false);

    try {
      let uploadPromise;

      if (endpoint) {
        // Use endpoint with XHR for progress tracking
        const formData = formDataBuilder
          ? formDataBuilder(files)
          : (() => {
              const fd = new FormData();
              files.forEach(file => fd.append('files', file));
              return fd;
            })();

        uploadPromise = new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.upload.addEventListener('progress', e => {
            if (e.lengthComputable) {
              setProgress(Math.round((e.loaded * 100) / e.total));
            }
          });
          xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                resolve(JSON.parse(xhr.responseText));
              } catch {
                resolve({ success: true });
              }
            } else {
              reject(new Error(`Upload failed: ${xhr.statusText}`));
            }
          });
          xhr.addEventListener('error', () => reject(new Error('Network error')));
          xhr.open('POST', endpoint);
          xhr.send(formData);
        });
      } else {
        // Use the provided onUpload function
        uploadPromise = onUpload(files);
      }

      const result = await uploadPromise;
      setSuccess(true);
      onSuccess?.(result);

      // Clear files after successful upload
      setTimeout(() => {
        files.forEach(file => {
          if (file.preview) URL.revokeObjectURL(file.preview);
        });
        setFiles([]);
        setTimeout(() => setSuccess(false), 2000);
      }, 1500);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      setError(message);
      onError?.(err instanceof Error ? err : new Error(message));
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  const getFileIcon = (file: File) => {
    if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      return <FileSpreadsheet className="h-5 w-5 text-green-600" />;
    }
    if (file.name.endsWith('.html') || file.name.endsWith('.htm')) {
      return <FileText className="h-5 w-5 text-blue-600" />;
    }
    return <File className="h-5 w-5 text-gray-500" />;
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className={cn('w-full', className)}>
      {/* Dropzone Area */}
      <div
        {...getRootProps()}
        className={cn(
          'relative cursor-pointer rounded-xl border-2 border-dashed transition-all duration-200',
          isDragActive && 'border-primary bg-primary/5',
          files.length > 0 && 'border-green-500 bg-green-50/50 dark:bg-green-950/20',
          error && 'border-red-500 bg-red-50/50 dark:bg-red-950/20',
          disabled && 'cursor-not-allowed opacity-50',
          dropzoneClassName
        )}
      >
        <input {...getInputProps()} />

        <div className="flex flex-col items-center justify-center p-8 text-center">
          {icon || (
            <div className={cn('mb-4 rounded-full p-3 transition-colors', isDragActive ? 'bg-primary/10' : 'bg-muted')}>
              <Upload className={cn('h-8 w-8', isDragActive ? 'text-primary' : 'text-muted-foreground')} />
            </div>
          )}

          <h3 className="mb-1 text-lg font-semibold">{isDragActive ? 'Drop files here' : title}</h3>

          <p className="text-muted-foreground mb-2 text-sm">{description}</p>

          <p className="text-muted-foreground text-xs">
            Max size: {maxSize / 1024 / 1024}MB | {multiple ? `Up to ${maxFiles} files` : 'Single file'}
          </p>
        </div>
      </div>

      {/* File List Preview */}
      {showPreview && files.length > 0 && (
        <div className="mt-4 space-y-2">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium">
              Selected Files ({files.length} / {maxFiles})
            </p>
            {!uploading && !success && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  files.forEach(f => f.preview && URL.revokeObjectURL(f.preview));
                  setFiles([]);
                }}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="mr-1 h-4 w-4" />
                Clear All
              </Button>
            )}
          </div>

          <div className="max-h-64 space-y-2 overflow-y-auto">
            <AnimatePresence>
              {files.map((file, index) => (
                <motion.div
                  key={`${file.name}-${index}`}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="bg-card flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    {getFileIcon(file)}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{file.name}</p>
                      <p className="text-muted-foreground text-xs">{formatFileSize(file.size)}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {!uploading && !success && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button type="button" variant="ghost" size="icon-sm" onClick={e => removeFile(index, e)}>
                              <X className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Remove file</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}

                    {uploading && (
                      <Badge variant="outline" className="animate-pulse">
                        Uploading...
                      </Badge>
                    )}

                    {success && <CheckCircle2 className="h-5 w-5 text-green-500" />}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* Upload Progress */}
      {showProgress && uploading && (
        <div className="mt-4 space-y-2">
          <Progress value={progress} className="h-2" />
          <p className="text-muted-foreground text-center text-sm">Uploading... {progress}%</p>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-950/20">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-600" />
            <p className="text-sm whitespace-pre-wrap text-red-600 dark:text-red-400">{error}</p>
          </div>
        </div>
      )}

      {/* Success Message */}
      {success && !uploading && (
        <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-950/20">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <p className="text-sm text-green-600 dark:text-green-400">Upload completed successfully!</p>
          </div>
        </div>
      )}

      {/* Upload Button */}
      {files.length > 0 && !uploading && !success && (
        <div className="mt-4 flex justify-end">
          <Button onClick={handleUpload} disabled={disabled}>
            Upload {files.length} File{files.length > 1 ? 's' : ''}
          </Button>
        </div>
      )}
    </div>
  );
}
