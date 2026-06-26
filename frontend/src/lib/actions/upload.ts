// lib/actions/upload-status.ts
'use server';

import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { uploads } from '@/lib/db/schema';
import { getExamCenterId } from '@/lib/session';

export type UploadFileType = 'timetable' | 'seatingchart' | 'seatingarrangement' | 'emarksheet' | 'inventory';

export interface UploadRecord {
  exists: boolean;
  status: 'UPLOADED' | 'PROCESSED' | 'FAILED' | null;
  fileName: string | null;
  storedFilename: string | null;
  fileSize: number | null;
  recordCount: number | null;
  uploadedAt: Date | null;
  processedAt: Date | null;
}

export async function getUploadRecord(fileType: UploadFileType): Promise<UploadRecord> {
  const examCenterId = await getExamCenterId();

  if (!examCenterId) {
    return {
      exists: false,
      status: null,
      fileName: null,
      storedFilename: null,
      fileSize: null,
      recordCount: null,
      uploadedAt: null,
      processedAt: null,
    };
  }

  const record = await db.query.uploads.findFirst({
    where: and(eq(uploads.examCenterId, examCenterId), eq(uploads.fileType, fileType)),
  });

  if (!record) {
    return {
      exists: false,
      status: null,
      fileName: null,
      storedFilename: null,
      fileSize: null,
      recordCount: null,
      uploadedAt: null,
      processedAt: null,
    };
  }

  return {
    exists: true,
    status: record.status as 'UPLOADED' | 'PROCESSED' | 'FAILED',
    fileName: record.originalFilename,
    storedFilename: record.storedFilename,
    fileSize: record.fileSize,
    recordCount: record.recordCount,
    uploadedAt: record.createdAt,
    processedAt: record.processedAt,
  };
}
