// modules/exam-setup/seating-arrangement.tsx
'use client';

import { useState } from 'react';

import { AlertCircle, CheckCircle2, Info, LayoutGrid, Upload } from 'lucide-react';
import { toast } from 'sonner';

import { MSBTEContextBar } from '@/components/layout/msbte-context-bar';
import { PageHeader } from '@/components/layout/page-layout';
import { UniversalFileUploader } from '@/components/shared/file-uploader';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useUserInfo } from '@/hooks/useUserInfo';
import { cn } from '@/lib/utils';

// ============================================================================
// Main Component
// ============================================================================

export default function SeatingArrangementPage() {
  const { examCenter, isLoading: userLoading } = useUserInfo();
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploaded' | 'processing' | 'complete'>('idle');
  const [fileName, setFileName] = useState<string | null>(null);

  const handleUploadSuccess = () => {
    setUploadStatus('uploaded');
    toast.success('Seating arrangement file uploaded successfully!');
  };

  const handleProcessingComplete = () => {
    setUploadStatus('complete');
    toast.success('Seating arrangement processed successfully!');
  };

  // Loading state
  if (userLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
        <div className="h-64 w-full animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Seating Arrangement"
        description="Upload the official MSBTE seating arrangement for verification."
        icon={LayoutGrid}
      />

      <MSBTEContextBar season={examCenter?.season as 'Summer' | 'Winter'} year={examCenter?.examYear!} />

      {/* Info Alert */}
      <Alert className="mb-6 border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/20">
        <Info className="h-4 w-4 text-blue-600" />
        <AlertTitle>Official MSBTE Seating Arrangement</AlertTitle>
        <AlertDescription className="space-y-2">
          <p>
            This page is for uploading the official seating arrangement provided by MSBTE. The data is used for
            verification and correction purposes only.
          </p>
          <div className="mt-2 flex flex-wrap gap-4 text-sm">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span>Institute-wise allocation verification</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span>Subject mapping validation</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span>Student seat assignment verification</span>
            </div>
          </div>
        </AlertDescription>
      </Alert>

      {/* Upload Status Cards */}
      {uploadStatus !== 'idle' && (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-green-100 p-2 dark:bg-green-900">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-green-700 dark:text-green-300">File Uploaded</p>
                  <p className="text-xs text-green-600 dark:text-green-400">
                    {uploadStatus === 'uploaded' ? 'Pending processing' : 'Completed'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card
            className={cn(
              uploadStatus === 'complete'
                ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/20'
                : 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20'
            )}
          >
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    'rounded-full p-2',
                    uploadStatus === 'complete' ? 'bg-green-100 dark:bg-green-900' : 'bg-amber-100 dark:bg-amber-900'
                  )}
                >
                  {uploadStatus === 'complete' ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-amber-600" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
                    {uploadStatus === 'complete' ? 'Processing Complete' : 'Awaiting Processing'}
                  </p>
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    {uploadStatus === 'complete' ? 'Data ready for verification' : 'File needs to be processed'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-neutral-100 p-2 dark:bg-neutral-800">
                  <LayoutGrid className="h-4 w-4 text-neutral-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Status</p>
                  <p className="text-xs text-neutral-600 dark:text-neutral-400">
                    {uploadStatus === 'uploaded' && 'File uploaded, ready to process'}
                    {uploadStatus === 'processing' && 'Processing in progress...'}
                    {uploadStatus === 'complete' && 'Ready for verification'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Upload Section */}
      <div className="rounded-lg border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-950">
        <UniversalFileUploader
          fileType="seatingarrangement"
          ecCode={examCenter?.code || ''}
          onSuccess={handleUploadSuccess}
          onProcessingComplete={handleProcessingComplete}
        />
      </div>

      {/* Information Section */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">What this does</CardTitle>
            <CardDescription className="text-xs">Understanding the seating arrangement upload</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="text-neutral-600 dark:text-neutral-400">
              The seating arrangement file from MSBTE contains the final seat allocation for all students.
            </p>
            <ul className="list-disc space-y-1 pl-4 text-xs text-neutral-500 dark:text-neutral-400">
              <li>Validates institute-wise student allocation</li>
              <li>Verifies subject mapping against the timetable</li>
              <li>Cross-checks seat numbers with the seating chart</li>
              <li>Identifies any discrepancies in the arrangement</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">What to expect</CardTitle>
            <CardDescription className="text-xs">After uploading the seating arrangement</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="text-neutral-600 dark:text-neutral-400">
              The system will process the official seating arrangement for verification.
            </p>
            <ul className="list-disc space-y-1 pl-4 text-xs text-neutral-500 dark:text-neutral-400">
              <li>All students are mapped to their assigned seats</li>
              <li>Subject allocations are validated against the timetable</li>
              <li>Any discrepancies are flagged for review</li>
              <li>The data is used for block allocation preparation</li>
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* File Requirements */}
      <Alert className="bg-muted/50 mt-6">
        <Info className="h-4 w-4" />
        <AlertTitle>File Requirements</AlertTitle>
        <AlertDescription className="mt-2 space-y-1 text-sm">
          <p>• Excel file (.xlsx, .xls) containing the official MSBTE seating arrangement</p>
          <p>• Must include columns: SR No, Seat Number, Inst Code, Course Code, Semester, Master Code, Paper Code</p>
          <p>• File should be the exact format provided by MSBTE</p>
          <p className="font-mono text-xs">
            Expected columns: SR No, Seat Number, Inst Code, Course Code, Semester, Master Code, Paper Code
          </p>
        </AlertDescription>
      </Alert>
    </div>
  );
}
