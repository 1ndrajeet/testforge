// lib/actions/upload.ts
'use server';

import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { uploads } from '@/lib/db/schema';
import { logger } from '@/lib/misc/logger';
import { getExamCenterId } from '@/lib/session';

const MODULE = 'upload-status';

// ============================================
// Types
// ============================================

export type UploadFileType = 'timetable' | 'seatingchart' | 'seatingarrangement' | 'emarksheet' | 'inventory';

export interface UploadRecord {
  exists: boolean;
  status: 'UPLOADED' | 'PROCESSING' | 'PROCESSED' | 'FAILED' | null;
  fileName: string | null;
  storedFilename: string | null;
  fileSize: number | null;
  recordCount: number | null;
  uploadedAt: Date | null;
  processedAt: Date | null;
  errorMessage: string | null;
}

// ============================================
// Read Operations
// ============================================

export async function getUploadRecord(fileType: UploadFileType): Promise<{
  success: boolean;
  data: UploadRecord;
  error?: string;
}> {
  const MODULE_FN = `${MODULE}.getUploadRecord`;

  try {
    const examCenterId = await getExamCenterId();

    if (!examCenterId) {
      logger.debug(MODULE_FN, 'No exam center found');
      return {
        success: true,
        data: {
          exists: false,
          status: null,
          fileName: null,
          storedFilename: null,
          fileSize: null,
          recordCount: null,
          uploadedAt: null,
          processedAt: null,
          errorMessage: null,
        },
      };
    }

    const record = await db.query.uploads.findFirst({
      where: and(eq(uploads.examCenterId, examCenterId), eq(uploads.fileType, fileType)),
    });

    if (!record) {
      logger.debug(MODULE_FN, 'No upload record found', { fileType });
      return {
        success: true,
        data: {
          exists: false,
          status: null,
          fileName: null,
          storedFilename: null,
          fileSize: null,
          recordCount: null,
          uploadedAt: null,
          processedAt: null,
          errorMessage: null,
        },
      };
    }

    logger.debug(MODULE_FN, 'Upload record fetched', {
      fileType,
      status: record.status,
      recordCount: record.recordCount,
    });

    return {
      success: true,
      data: {
        exists: true,
        status: record.status as 'UPLOADED' | 'PROCESSING' | 'PROCESSED' | 'FAILED',
        fileName: record.originalFilename,
        storedFilename: record.storedFilename,
        fileSize: record.fileSize,
        recordCount: record.recordCount,
        uploadedAt: record.createdAt,
        processedAt: record.processedAt,
        errorMessage: record.errorMessage,
      },
    };
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to fetch upload record', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch upload status',
      data: {
        exists: false,
        status: null,
        fileName: null,
        storedFilename: null,
        fileSize: null,
        recordCount: null,
        uploadedAt: null,
        processedAt: null,
        errorMessage: null,
      },
    };
  }
}

export async function getUploadStatus(fileType: UploadFileType): Promise<{
  success: boolean;
  data: {
    fileExists: boolean;
    isProcessed: boolean;
    status: string | null;
    fileName: string | null;
    storedFilename: string | null;
    recordCount: number | null;
    uploadedAt: Date | null;
    processedAt: Date | null;
  };
  error?: string;
}> {
  const MODULE_FN = `${MODULE}.getUploadStatus`;

  try {
    const result = await getUploadRecord(fileType);

    if (!result.success) {
      return {
        success: false,
        error: result.error,
        data: {
          fileExists: false,
          isProcessed: false,
          status: null,
          fileName: null,
          storedFilename: null,
          recordCount: null,
          uploadedAt: null,
          processedAt: null,
        },
      };
    }

    const { data } = result;

    return {
      success: true,
      data: {
        fileExists: data.exists,
        isProcessed: data.status === 'PROCESSED',
        status: data.status,
        fileName: data.fileName,
        storedFilename: data.storedFilename,
        recordCount: data.recordCount,
        uploadedAt: data.uploadedAt,
        processedAt: data.processedAt,
      },
    };
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to get upload status', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get upload status',
      data: {
        fileExists: false,
        isProcessed: false,
        status: null,
        storedFilename: null,
        fileName: null,
        recordCount: null,
        uploadedAt: null,
        processedAt: null,
      },
    };
  }
}

// ============================================
// Write Operations
// ============================================

export async function updateUploadStatus(
  fileType: UploadFileType,
  status: 'UPLOADED' | 'PROCESSING' | 'PROCESSED' | 'FAILED',
  data?: {
    recordCount?: number;
    errorMessage?: string;
    processedAt?: Date;
  }
): Promise<{
  success: boolean;
  data?: any;
  error?: string;
}> {
  const MODULE_FN = `${MODULE}.updateUploadStatus`;

  try {
    const examCenterId = await getExamCenterId();

    if (!examCenterId) {
      logger.warn(MODULE_FN, 'No exam center found');
      return { success: false, error: 'Exam center not found' };
    }

    const updateData: any = {
      status,
      updatedAt: new Date(),
    };

    if (data?.recordCount !== undefined) {
      updateData.recordCount = data.recordCount;
    }
    if (data?.errorMessage !== undefined) {
      updateData.errorMessage = data.errorMessage;
    }
    if (data?.processedAt) {
      updateData.processedAt = data.processedAt;
    }

    const [updated] = await db
      .update(uploads)
      .set(updateData)
      .where(and(eq(uploads.examCenterId, examCenterId), eq(uploads.fileType, fileType)))
      .returning();

    if (!updated) {
      logger.warn(MODULE_FN, 'Upload record not found', { fileType });
      return { success: false, error: 'Upload record not found' };
    }

    logger.info(MODULE_FN, 'Upload status updated', {
      fileType,
      status,
      recordCount: data?.recordCount,
    });

    return { success: true, data: updated };
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to update upload status', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update upload status',
    };
  }
}

export async function deleteUploadRecord(fileType: UploadFileType): Promise<{
  success: boolean;
  data?: any;
  error?: string;
}> {
  const MODULE_FN = `${MODULE}.deleteUploadRecord`;

  try {
    const examCenterId = await getExamCenterId();

    if (!examCenterId) {
      logger.warn(MODULE_FN, 'No exam center found');
      return { success: false, error: 'Exam center not found' };
    }

    const [deleted] = await db
      .delete(uploads)
      .where(and(eq(uploads.examCenterId, examCenterId), eq(uploads.fileType, fileType)))
      .returning();

    if (!deleted) {
      logger.warn(MODULE_FN, 'Upload record not found', { fileType });
      return { success: false, error: 'Upload record not found' };
    }

    logger.info(MODULE_FN, 'Upload record deleted', { fileType });
    return { success: true, data: deleted };
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to delete upload record', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete upload record',
    };
  }
}
