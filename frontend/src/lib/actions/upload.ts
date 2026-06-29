// lib/actions/upload.ts
'use server';

import { and, eq, isNull } from 'drizzle-orm';

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
  connectedInstituteId: string | null;
}

export interface UploadStatusData {
  fileExists: boolean;
  isProcessed: boolean;
  status: string | null;
  fileName: string | null;
  storedFilename: string | null;
  recordCount: number | null;
  uploadedAt: Date | null;
  processedAt: Date | null;
  connectedInstituteId: string | null;
}

// ============================================
// Read Operations
// ============================================

export async function getUploadRecord(
  fileType: UploadFileType,
  connectedInstituteId?: string | null
): Promise<{
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
          connectedInstituteId: null,
        },
      };
    }

    // Build conditions
    const conditions = [eq(uploads.examCenterId, examCenterId), eq(uploads.fileType, fileType)];

    if (connectedInstituteId) {
      conditions.push(eq(uploads.connectedInstituteId, connectedInstituteId));
    } else {
      // For non-institute files, only return records with NULL connected_institute_id
      conditions.push(isNull(uploads.connectedInstituteId));
    }

    const record = await db.query.uploads.findFirst({
      where: and(...conditions),
      orderBy: (uploads, { desc }) => [desc(uploads.createdAt)],
    });

    if (!record) {
      logger.debug(MODULE_FN, 'No upload record found', { fileType, connectedInstituteId });
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
          connectedInstituteId: null,
        },
      };
    }

    logger.debug(MODULE_FN, 'Upload record fetched', {
      fileType,
      status: record.status,
      recordCount: record.recordCount,
      connectedInstituteId: record.connectedInstituteId,
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
        connectedInstituteId: record.connectedInstituteId,
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
        connectedInstituteId: null,
      },
    };
  }
}

export async function getUploadStatus(
  fileType: UploadFileType,
  connectedInstituteId?: string | null
): Promise<{
  success: boolean;
  data: UploadStatusData;
  error?: string;
}> {
  const MODULE_FN = `${MODULE}.getUploadStatus`;

  try {
    const result = await getUploadRecord(fileType, connectedInstituteId);

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
          connectedInstituteId: null,
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
        connectedInstituteId: data.connectedInstituteId,
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
        fileName: null,
        storedFilename: null,
        recordCount: null,
        uploadedAt: null,
        processedAt: null,
        connectedInstituteId: null,
      },
    };
  }
}

// ============================================
// Get All Uploads for a File Type
// ============================================

export async function getAllUploads(fileType: UploadFileType): Promise<{
  success: boolean;
  data: UploadRecord[];
  error?: string;
}> {
  const MODULE_FN = `${MODULE}.getAllUploads`;

  try {
    const examCenterId = await getExamCenterId();

    if (!examCenterId) {
      logger.debug(MODULE_FN, 'No exam center found');
      return { success: true, data: [] };
    }

    const records = await db.query.uploads.findMany({
      where: and(eq(uploads.examCenterId, examCenterId), eq(uploads.fileType, fileType)),
      orderBy: (uploads, { desc }) => [desc(uploads.createdAt)],
    });

    const mappedRecords: UploadRecord[] = records.map(record => ({
      exists: true,
      status: record.status as 'UPLOADED' | 'PROCESSING' | 'PROCESSED' | 'FAILED',
      fileName: record.originalFilename,
      storedFilename: record.storedFilename,
      fileSize: record.fileSize,
      recordCount: record.recordCount,
      uploadedAt: record.createdAt,
      processedAt: record.processedAt,
      errorMessage: record.errorMessage,
      connectedInstituteId: record.connectedInstituteId,
    }));

    logger.debug(MODULE_FN, `Fetched ${records.length} upload records`, { fileType });
    return { success: true, data: mappedRecords };
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to fetch upload records', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch upload records',
      data: [],
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
    connectedInstituteId?: string | null;
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

    // Build conditions
    const conditions = [eq(uploads.examCenterId, examCenterId), eq(uploads.fileType, fileType)];

    if (data?.connectedInstituteId) {
      conditions.push(eq(uploads.connectedInstituteId, data.connectedInstituteId));
    } else {
      conditions.push(isNull(uploads.connectedInstituteId));
    }

    const [updated] = await db
      .update(uploads)
      .set(updateData)
      .where(and(...conditions))
      .returning();

    if (!updated) {
      logger.warn(MODULE_FN, 'Upload record not found', { fileType });
      return { success: false, error: 'Upload record not found' };
    }

    logger.info(MODULE_FN, 'Upload status updated', {
      fileType,
      status,
      recordCount: data?.recordCount,
      connectedInstituteId: data?.connectedInstituteId,
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

export async function deleteUploadRecord(
  fileType: UploadFileType,
  connectedInstituteId?: string | null
): Promise<{
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

    const conditions = [eq(uploads.examCenterId, examCenterId), eq(uploads.fileType, fileType)];

    if (connectedInstituteId) {
      conditions.push(eq(uploads.connectedInstituteId, connectedInstituteId));
    } else {
      conditions.push(isNull(uploads.connectedInstituteId));
    }

    const [deleted] = await db
      .delete(uploads)
      .where(and(...conditions))
      .returning();

    if (!deleted) {
      logger.warn(MODULE_FN, 'Upload record not found', { fileType, connectedInstituteId });
      return { success: false, error: 'Upload record not found' };
    }

    logger.info(MODULE_FN, 'Upload record deleted', { fileType, connectedInstituteId });
    return { success: true, data: deleted };
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to delete upload record', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete upload record',
    };
  }
}

// ============================================
// Upsert Upload Record
// ============================================

export async function upsertUploadRecord(data: {
  fileType: UploadFileType;
  originalFilename: string;
  storedFilename: string;
  fileHash: string;
  fileSize: number;
  connectedInstituteId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<{
  success: boolean;
  data?: any;
  error?: string;
}> {
  const MODULE_FN = `${MODULE}.upsertUploadRecord`;

  try {
    const examCenterId = await getExamCenterId();

    if (!examCenterId) {
      logger.warn(MODULE_FN, 'No exam center found');
      return { success: false, error: 'Exam center not found' };
    }

    const { fileType, connectedInstituteId, ...rest } = data;

    // Check if record exists
    const conditions = [eq(uploads.examCenterId, examCenterId), eq(uploads.fileType, fileType)];

    if (connectedInstituteId) {
      conditions.push(eq(uploads.connectedInstituteId, connectedInstituteId));
    } else {
      conditions.push(isNull(uploads.connectedInstituteId));
    }

    const existing = await db.query.uploads.findFirst({
      where: and(...conditions),
    });

    let result;

    if (existing) {
      // Update existing
      const [updated] = await db
        .update(uploads)
        .set({
          ...rest,
          status: 'UPLOADED',
          updatedAt: new Date(),
          errorMessage: null,
        })
        .where(and(...conditions))
        .returning();
      result = updated;
    } else {
      // Insert new
      const [inserted] = await db
        .insert(uploads)
        .values({
          examCenterId,
          fileType,
          ...rest,
          status: 'UPLOADED',
          recordCount: 0,
        })
        .returning();
      result = inserted;
    }

    logger.info(MODULE_FN, 'Upload record upserted', {
      fileType,
      connectedInstituteId,
      isUpdate: !!existing,
    });

    return { success: true, data: result };
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to upsert upload record', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to upsert upload record',
    };
  }
}

// lib/actions/upload.ts - Add this function

export async function getStoredFilename(
  fileType: UploadFileType,
  connectedInstituteId: string
): Promise<{
  success: boolean;
  data: { storedFilename: string | null; status: string | null };
  error?: string;
}> {
  const MODULE_FN = `${MODULE}.getStoredFilename`;

  try {
    const examCenterId = await getExamCenterId();

    if (!examCenterId) {
      return {
        success: false,
        error: 'Exam center not found',
        data: { storedFilename: null, status: null },
      };
    }

    const record = await db.query.uploads.findFirst({
      where: and(
        eq(uploads.examCenterId, examCenterId),
        eq(uploads.fileType, fileType),
        eq(uploads.connectedInstituteId, connectedInstituteId)
      ),
      columns: {
        storedFilename: true,
        status: true,
      },
    });

    if (!record) {
      return {
        success: true,
        data: { storedFilename: null, status: null },
      };
    }

    return {
      success: true,
      data: {
        storedFilename: record.storedFilename,
        status: record.status,
      },
    };
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to get stored filename', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      data: { storedFilename: null, status: null },
    };
  }
}
