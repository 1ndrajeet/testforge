// lib/actions/emarksheet.ts
'use server';

import { revalidatePath } from 'next/cache';

import { eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { eMarksheets } from '@/lib/db/schema';
import { logger } from '@/lib/misc/logger';
import { getExamCenterId } from '@/lib/session';

const MODULE = 'emarksheet';

// ============================================
// Types
// ============================================

export interface EMarksheetRecord {
  id: string;
  sheetNo: string | null;
  subjectName: string | null;
  scheme: string | null;
  subjectHead: string | null;
  paperCode: string | null;
  fileName: string | null;
  processedAt: Date | null;
  createdAt: Date;
}

export interface EMarksheetStats {
  totalRecords: number;
  totalSchemes: number;
  totalSubjects: number;
  processedCount: number;
}

// ============================================
// Read Operations
// ============================================

export async function getEMarksheets(): Promise<{
  success: boolean;
  data: EMarksheetRecord[];
  stats?: EMarksheetStats;
  error?: string;
}> {
  const MODULE_FN = `${MODULE}.getEMarksheets`;

  try {
    const examCenterId = await getExamCenterId();

    if (!examCenterId) {
      logger.debug(MODULE_FN, 'No exam center found');
      return {
        success: true,
        data: [],
        stats: {
          totalRecords: 0,
          totalSchemes: 0,
          totalSubjects: 0,
          processedCount: 0,
        },
      };
    }

    const records = await db.query.eMarksheets.findMany({
      where: eq(eMarksheets.examCenterId, examCenterId),
      orderBy: (eMarksheets, { asc }) => [asc(eMarksheets.sheetNo)],
    });

    // Calculate stats
    const uniqueSchemes = new Set(records.map((r) => r.scheme).filter(Boolean));
    const uniqueSubjects = new Set(records.map((r) => r.subjectName).filter(Boolean));
    const processedCount = records.filter((r) => r.processedAt).length;

    const stats: EMarksheetStats = {
      totalRecords: records.length,
      totalSchemes: uniqueSchemes.size,
      totalSubjects: uniqueSubjects.size,
      processedCount: processedCount,
    };

    logger.debug(MODULE_FN, `Fetched ${records.length} e-marksheet records`);
    return { success: true, data: records, stats };
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to fetch e-marksheets', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      data: [],
      stats: {
        totalRecords: 0,
        totalSchemes: 0,
        totalSubjects: 0,
        processedCount: 0,
      },
    };
  }
}

export async function hasEMarksheetData(): Promise<{
  success: boolean;
  data: boolean;
  error?: string;
}> {
  const MODULE_FN = `${MODULE}.hasEMarksheetData`;

  try {
    const examCenterId = await getExamCenterId();

    if (!examCenterId) {
      logger.debug(MODULE_FN, 'No exam center found');
      return { success: true, data: false };
    }

    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(eMarksheets)
      .where(eq(eMarksheets.examCenterId, examCenterId));

    const hasData = Number(result[0]?.count || 0) > 0;
    logger.debug(MODULE_FN, `Has e-marksheet data: ${hasData}`);
    return { success: true, data: hasData };
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to check e-marksheet existence', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      data: false,
    };
  }
}

// ============================================
// Write Operations
// ============================================

export async function deleteAllEMarksheets(): Promise<{
  success: boolean;
  data: number;
  error?: string;
}> {
  const MODULE_FN = `${MODULE}.deleteAllEMarksheets`;

  try {
    const examCenterId = await getExamCenterId();

    if (!examCenterId) {
      logger.warn(MODULE_FN, 'No exam center found');
      return { success: false, error: 'Exam center not found', data: 0 };
    }

    const deleted = await db
      .delete(eMarksheets)
      .where(eq(eMarksheets.examCenterId, examCenterId))
      .returning();

    logger.warn(MODULE_FN, 'Deleted all e-marksheet data', {
      examCenterId,
      count: deleted.length,
    });
    revalidatePath('/exam-center/exam-setup/emarksheet');

    return { success: true, data: deleted.length };
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to delete e-marksheet data', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      data: 0,
    };
  }
}
