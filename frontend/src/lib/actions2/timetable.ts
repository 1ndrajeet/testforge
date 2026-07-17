// lib/actions/timetable.ts
'use server';

import { revalidatePath } from 'next/cache';

import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/lib/db';
import { blockAllocations, students, timetable } from '@/lib/db/schema';
import { logger } from '@/lib/misc/logger';
import { getExamCenterId, requireExamCenter } from '@/lib/session';

const MODULE = 'timetable';

// ============================================
// Validation Schemas
// ============================================

const TimetableEntrySchema = z.object({
  examDay: z.number().int().min(1).max(366).nullable().optional(),
  date: z.date(),
  session: z.enum(['Morning', 'Afternoon', 'All']),
  timeSlot: z.string().min(1, 'Time slot is required'),
  subjectCode: z.string().min(1, 'Subject code is required'),
  subjectName: z.string().min(1, 'Subject name is required'),
  scheme: z.string().min(1, 'Scheme is required'),
  subjectAbbr: z.string().optional().nullable(),
  totalStudents: z.number().int().min(0).default(0),
  absentNumbers: z.array(z.number().int()).default([]),
  cpsStudents: z.array(z.number().int()).default([]),
});

const BulkImportSchema = z.object({
  entries: z.array(TimetableEntrySchema),
  overwrite: z.boolean().default(false),
});

const UpdateEntrySchema = z.object({
  id: z.string().uuid('Invalid ID'),
  totalStudents: z.number().int().min(0).optional(),
  absentNumbers: z.array(z.number().int()).optional(),
  cpsStudents: z.array(z.number().int()).optional(),
});

const MarkAbsentSchema = z.object({
  subjectCode: z.string().min(1),
  scheme: z.string().min(1),
  date: z.date(),
  session: z.enum(['Morning', 'Afternoon', 'All']),
  absentNumbers: z.array(z.number().int()),
});

const MarkCopyCaseSchema = z.object({
  subjectCode: z.string().min(1),
  scheme: z.string().min(1),
  date: z.date(),
  session: z.enum(['Morning', 'Afternoon', 'All']),
  cpsStudents: z.array(z.number().int()),
});

// ============================================
// Read Operations
// ============================================

export async function getTimetable(params?: {
  date?: Date | string;
  session?: 'Morning' | 'Afternoon';
  subjectCode?: string;
  scheme?: string;
}) {
  const MODULE_FN = `${MODULE}.getTimetable`;

  try {
    const examCenterId = await getExamCenterId();

    if (!examCenterId) {
      logger.debug(MODULE_FN, 'No exam center found');
      return { success: true, data: [], hasData: false };
    }

    const conditions = [eq(timetable.examCenterId, examCenterId)];

    if (params?.date) {
      const dateObj = typeof params.date === 'string' ? new Date(params.date) : params.date;
      conditions.push(eq(timetable.date, dateObj));
    }
    if (params?.session) {
      conditions.push(eq(timetable.session, params.session));
    }
    if (params?.subjectCode) {
      conditions.push(eq(timetable.subjectCode, params.subjectCode));
    }
    if (params?.scheme) {
      conditions.push(eq(timetable.scheme, params.scheme));
    }

    const entries = await db.query.timetable.findMany({
      where: and(...conditions),
      orderBy: [timetable.date, timetable.session, timetable.timeSlot],
    });

    // Check if block allocations exist for any of these entries
    let isBlockAllocated = false;
    if (params?.date && params?.session) {
      const allocations = await db.query.blockAllocations.findMany({
        where: and(
          eq(blockAllocations.examCenterId, examCenterId),
          eq(blockAllocations.date, new Date(params.date)),
          eq(blockAllocations.session, params.session),
        ),
        limit: 1,
      });
      isBlockAllocated = allocations.length > 0;
    }

    logger.debug(MODULE_FN, `Fetched ${entries.length} timetable entries`, {
      examCenterId,
      filters: params,
    });

    return {
      success: true,
      data: entries,
      hasData: entries.length > 0,
      isBlockAllocated,
    };
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to fetch timetable', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      data: [],
      hasData: false,
    };
  }
}

export async function getTimetableEntryById(id: string) {
  const MODULE_FN = `${MODULE}.getTimetableEntryById`;

  try {
    const examCenterId = await getExamCenterId();

    if (!examCenterId) {
      logger.debug(MODULE_FN, 'No exam center found');
      return { success: true, data: null };
    }

    const entry = await db.query.timetable.findFirst({
      where: and(eq(timetable.id, id), eq(timetable.examCenterId, examCenterId)),
    });

    if (!entry) {
      logger.debug(MODULE_FN, 'Timetable entry not found', { id });
      return { success: true, data: null };
    }

    logger.debug(MODULE_FN, 'Timetable entry fetched', { id });
    return { success: true, data: entry };
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to fetch timetable entry', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function getUniqueDates() {
  const MODULE_FN = `${MODULE}.getUniqueDates`;

  try {
    const examCenterId = await getExamCenterId();

    if (!examCenterId) {
      logger.debug(MODULE_FN, 'No exam center found');
      return { success: true, data: [] };
    }

    const results = await db
      .selectDistinct({ date: timetable.date })
      .from(timetable)
      .where(eq(timetable.examCenterId, examCenterId))
      .orderBy(timetable.date);

    const dates = results.map((r) => r.date);

    logger.debug(MODULE_FN, `Fetched ${dates.length} unique dates`);
    return { success: true, data: dates };
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to fetch unique dates', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function getUniqueSessions() {
  const MODULE_FN = `${MODULE}.getUniqueSessions`;

  try {
    const examCenterId = await getExamCenterId();

    if (!examCenterId) {
      logger.debug(MODULE_FN, 'No exam center found');
      return { success: true, data: [] };
    }

    const results = await db
      .selectDistinct({ session: timetable.session })
      .from(timetable)
      .where(eq(timetable.examCenterId, examCenterId));

    const sessions = results.map((r) => r.session);

    logger.debug(MODULE_FN, `Fetched ${sessions.length} unique sessions`);
    return { success: true, data: sessions };
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to fetch unique sessions', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================
// Write Operations
// ============================================

export async function importTimetable(data: z.infer<typeof BulkImportSchema>) {
  const MODULE_FN = `${MODULE}.importTimetable`;

  try {
    const validated = BulkImportSchema.parse(data);
    const examCenter = await requireExamCenter();

    if (validated.entries.length === 0) {
      return { success: false, error: 'No entries to import' };
    }

    // Start transaction
    const result = await db.transaction(async (tx) => {
      // If overwrite is true, delete existing entries for this exam center
      if (validated.overwrite) {
        await tx.delete(timetable).where(eq(timetable.examCenterId, examCenter.id));
        logger.info(MODULE_FN, 'Cleared existing timetable entries', {
          examCenterId: examCenter.id,
        });
      }

      // Prepare values
      const values = validated.entries.map((entry) => ({
        examCenterId: examCenter.id,
        examDay: entry.examDay,
        date: entry.date,
        session: entry.session,
        timeSlot: entry.timeSlot,
        subjectCode: entry.subjectCode,
        subjectName: entry.subjectName,
        scheme: entry.scheme,
        subjectAbbr: entry.subjectAbbr,
        totalStudents: entry.totalStudents,
        absentNumbers: entry.absentNumbers,
        cpsStudents: entry.cpsStudents,
      }));

      // Insert in batches to avoid overwhelming the DB
      const BATCH_SIZE = 500;
      const insertedEntries = [];

      for (let i = 0; i < values.length; i += BATCH_SIZE) {
        const batch = values.slice(i, i + BATCH_SIZE);
        const inserted = await tx.insert(timetable).values(batch).returning();
        insertedEntries.push(...inserted);
      }

      return insertedEntries;
    });

    logger.info(MODULE_FN, `Imported ${result.length} timetable entries`, {
      examCenterId: examCenter.id,
      overwrite: validated.overwrite,
      count: result.length,
    });
    revalidatePath('/exam-center/exam-setup/timetable');

    return { success: true, data: result };
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn(MODULE_FN, 'Validation failed', { issues: error.issues });
      return { success: false, error: error.issues };
    }

    logger.error(MODULE_FN, 'Failed to import timetable', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to import timetable',
    };
  }
}

export async function updateTimetableEntry(data: z.infer<typeof UpdateEntrySchema>) {
  const MODULE_FN = `${MODULE}.updateTimetableEntry`;

  try {
    const validated = UpdateEntrySchema.parse(data);
    const examCenter = await requireExamCenter();
    const { id, ...updates } = validated;

    const [updated] = await db
      .update(timetable)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(timetable.id, id), eq(timetable.examCenterId, examCenter.id)))
      .returning();

    if (!updated) {
      logger.warn(MODULE_FN, 'Timetable entry not found', { id });
      return { success: false, error: 'Timetable entry not found' };
    }

    logger.info(MODULE_FN, 'Timetable entry updated', { id });
    revalidatePath('/exam-center/exam-setup/timetable');

    return { success: true, data: updated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn(MODULE_FN, 'Validation failed', { issues: error.issues });
      return { success: false, error: error.issues };
    }

    logger.error(MODULE_FN, 'Failed to update timetable entry', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update timetable entry',
    };
  }
}

export async function deleteTimetableEntry(id: string) {
  const MODULE_FN = `${MODULE}.deleteTimetableEntry`;

  try {
    const examCenter = await requireExamCenter();

    const [deleted] = await db
      .delete(timetable)
      .where(and(eq(timetable.id, id), eq(timetable.examCenterId, examCenter.id)))
      .returning();

    if (!deleted) {
      logger.warn(MODULE_FN, 'Timetable entry not found', { id });
      return { success: false, error: 'Timetable entry not found' };
    }

    logger.info(MODULE_FN, 'Timetable entry deleted', { id });
    revalidatePath('/exam-center/exam-setup/timetable');

    return { success: true, data: deleted };
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to delete timetable entry', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete timetable entry',
    };
  }
}

export async function deleteAllTimetable() {
  const MODULE_FN = `${MODULE}.deleteAllTimetable`;

  try {
    const examCenter = await requireExamCenter();

    const deleted = await db
      .delete(timetable)
      .where(eq(timetable.examCenterId, examCenter.id))
      .returning();

    logger.warn(MODULE_FN, 'Deleted all timetable entries', {
      examCenterId: examCenter.id,
      count: deleted.length,
    });
    revalidatePath('/exam-center/exam-setup/timetable');

    return { success: true, data: deleted };
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to delete all timetable entries', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete timetable entries',
    };
  }
}

// ============================================
// Student Status Operations
// ============================================

export async function markAbsent(data: z.infer<typeof MarkAbsentSchema>) {
  const MODULE_FN = `${MODULE}.markAbsent`;

  try {
    const validated = MarkAbsentSchema.parse(data);
    const examCenter = await requireExamCenter();

    // Find the timetable entry
    const entry = await db.query.timetable.findFirst({
      where: and(
        eq(timetable.examCenterId, examCenter.id),
        eq(timetable.subjectCode, validated.subjectCode),
        eq(timetable.scheme, validated.scheme),
        eq(timetable.date, validated.date),
        eq(timetable.session, validated.session),
      ),
    });

    if (!entry) {
      logger.warn(MODULE_FN, 'Timetable entry not found', {
        subjectCode: validated.subjectCode,
        scheme: validated.scheme,
        date: validated.date,
        session: validated.session,
      });
      return { success: false, error: 'Timetable entry not found' };
    }

    const [updated] = await db
      .update(timetable)
      .set({
        absentNumbers: [...new Set(validated.absentNumbers)].sort(),
        updatedAt: new Date(),
      })
      .where(eq(timetable.id, entry.id))
      .returning();

    logger.info(MODULE_FN, 'Absent students marked', {
      id: entry.id,
      count: validated.absentNumbers.length,
    });
    revalidatePath('/exam-center/exam-setup/timetable');

    return { success: true, data: updated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn(MODULE_FN, 'Validation failed', { issues: error.issues });
      return { success: false, error: error.issues };
    }

    logger.error(MODULE_FN, 'Failed to mark absent students', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to mark absent students',
    };
  }
}

// Add to lib/actions/timetable.ts

// ============================================
// Get Timetable Entries with Filters
// ============================================

export async function getTimetableEntries(params?: {
  date?: Date;
  session?: 'Morning' | 'Afternoon';
  subjectCode?: string;
  scheme?: string;
}): Promise<{
  success: boolean;
  data?: any[];
  error?: string;
}> {
  const MODULE_FN = `${MODULE}.getTimetableEntries`;

  try {
    const examCenterId = await getExamCenterId();

    if (!examCenterId) {
      logger.debug(MODULE_FN, 'No exam center found');
      return { success: true, data: [] };
    }

    const conditions = [eq(timetable.examCenterId, examCenterId)];

    if (params?.date) {
      conditions.push(eq(timetable.date, params.date));
    }
    if (params?.session) {
      conditions.push(eq(timetable.session, params.session));
    }
    if (params?.subjectCode) {
      conditions.push(eq(timetable.subjectCode, params.subjectCode));
    }
    if (params?.scheme) {
      conditions.push(eq(timetable.scheme, params.scheme));
    }

    const entries = await db.query.timetable.findMany({
      where: and(...conditions),
      orderBy: [timetable.date, timetable.session, timetable.timeSlot],
    });

    logger.debug(MODULE_FN, `Fetched ${entries.length} timetable entries`);
    return { success: true, data: entries };
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to fetch timetable entries', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function markCopyCase(data: z.infer<typeof MarkCopyCaseSchema>) {
  const MODULE_FN = `${MODULE}.markCopyCase`;

  try {
    const validated = MarkCopyCaseSchema.parse(data);
    const examCenter = await requireExamCenter();

    // Find the timetable entry
    const entry = await db.query.timetable.findFirst({
      where: and(
        eq(timetable.examCenterId, examCenter.id),
        eq(timetable.subjectCode, validated.subjectCode),
        eq(timetable.scheme, validated.scheme),
        eq(timetable.date, validated.date),
        eq(timetable.session, validated.session),
      ),
    });

    if (!entry) {
      logger.warn(MODULE_FN, 'Timetable entry not found', {
        subjectCode: validated.subjectCode,
        scheme: validated.scheme,
        date: validated.date,
        session: validated.session,
      });
      return { success: false, error: 'Timetable entry not found' };
    }

    const [updated] = await db
      .update(timetable)
      .set({
        cpsStudents: [...new Set(validated.cpsStudents)].sort(),
        updatedAt: new Date(),
      })
      .where(eq(timetable.id, entry.id))
      .returning();

    logger.info(MODULE_FN, 'Copy case students marked', {
      id: entry.id,
      count: validated.cpsStudents.length,
    });
    revalidatePath('/exam-center/exam-setup/timetable');

    return { success: true, data: updated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn(MODULE_FN, 'Validation failed', { issues: error.issues });
      return { success: false, error: error.issues };
    }

    logger.error(MODULE_FN, 'Failed to mark copy case students', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to mark copy case students',
    };
  }
}

// ============================================
// Export Operations
// ============================================

export async function exportTimetable() {
  const MODULE_FN = `${MODULE}.exportTimetable`;

  try {
    const examCenter = await requireExamCenter();

    const entries = await db.query.timetable.findMany({
      where: eq(timetable.examCenterId, examCenter.id),
      orderBy: [timetable.date, timetable.session],
    });

    // Convert dates to ISO strings for JSON export
    const exportData = entries.map((entry) => ({
      ...entry,
      date: entry.date.toISOString(),
      createdAt: entry.createdAt.toISOString(),
      updatedAt: entry.updatedAt.toISOString(),
    }));

    logger.info(MODULE_FN, `Exported ${exportData.length} timetable entries`, {
      examCenterId: examCenter.id,
      count: exportData.length,
    });

    return { success: true, data: exportData };
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to export timetable', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to export timetable',
    };
  }
}

// ============================================
// Statistics / Analytics
// ============================================

// lib/actions/timetable.ts or wherever getTimetableStats is defined

export async function getTimetableStats() {
  const MODULE_FN = `${MODULE}.getTimetableStats`;

  try {
    const examCenterId = await getExamCenterId();

    if (!examCenterId) {
      logger.debug(MODULE_FN, 'No exam center found');
      return {
        success: true,
        data: {
          totalEntries: 0,
          uniqueSubjects: 0,
          uniqueSchemes: 0,
          examinees: 0, // unique seat numbers
          students: 0, // unique enrollment numbers
          dateRange: null,
          totalAbsent: 0,
          totalCps: 0,
        },
      };
    }

    // Run queries in parallel for performance
    const [timetableStats, studentStats] = await Promise.all([
      // Timetable stats (entries, subjects, schemes, absent, cps)
      db
        .select({
          totalEntries: sql<number>`count(*)`,
          uniqueSubjects: sql<number>`count(DISTINCT ${timetable.subjectCode})`,
          uniqueSchemes: sql<number>`count(DISTINCT ${timetable.scheme})`,
          totalAbsent: sql<number>`COALESCE(sum(jsonb_array_length(${timetable.absentNumbers})), 0)`,
          totalCps: sql<number>`COALESCE(sum(jsonb_array_length(${timetable.cpsStudents})), 0)`,
          minDate: sql<Date | null>`min(${timetable.date})`,
          maxDate: sql<Date | null>`max(${timetable.date})`,
        })
        .from(timetable)
        .where(eq(timetable.examCenterId, examCenterId)),

      // Student stats (unique examinees and students)
      db
        .select({
          examinees: sql<number>`count(DISTINCT ${students.seatNumber})`,
          students: sql<number>`count(DISTINCT ${students.enrollmentNumber})`,
        })
        .from(students)
        .where(and(eq(students.examCenterId, examCenterId), eq(students.isDeleted, false))),
    ]);

    const ttResult = timetableStats[0];
    const stResult = studentStats[0];

    const statsData = {
      totalEntries: Number(ttResult?.totalEntries) || 0,
      uniqueSubjects: Number(ttResult?.uniqueSubjects) || 0,
      uniqueSchemes: Number(ttResult?.uniqueSchemes) || 0,
      examinees: Number(stResult?.examinees) || 0,
      students: Number(stResult?.students) || 0,
      totalAbsent: Number(ttResult?.totalAbsent) || 0,
      totalCps: Number(ttResult?.totalCps) || 0,
      dateRange:
        ttResult?.minDate && ttResult?.maxDate
          ? { min: new Date(ttResult.minDate), max: new Date(ttResult.maxDate) }
          : null,
    };

    logger.debug(MODULE_FN, 'Timetable stats calculated', statsData);
    return { success: true, data: statsData };
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to fetch timetable stats', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function hasTimetable(): Promise<
  { success: true; data: boolean } | { success: false; error: string }
> {
  const MODULE_FN = `${MODULE}.hasTimetable`;

  try {
    const examCenterId = await getExamCenterId();

    if (!examCenterId) {
      logger.debug(MODULE_FN, 'No exam center found');
      return { success: true, data: false };
    }

    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(timetable)
      .where(eq(timetable.examCenterId, examCenterId));

    const hasData = Number(result[0]?.count || 0) > 0;

    logger.debug(MODULE_FN, `Timetable exists: ${hasData}`);
    return { success: true, data: hasData };
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to check timetable existence', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function getTimetableBySubject(subjectCode: string, scheme?: string) {
  const MODULE_FN = `${MODULE}.getTimetableBySubject`;

  try {
    const examCenterId = await getExamCenterId();

    if (!examCenterId) {
      logger.debug(MODULE_FN, 'No exam center found');
      return { success: true, data: [] };
    }

    const conditions = [
      eq(timetable.examCenterId, examCenterId),
      eq(timetable.subjectCode, subjectCode),
    ];

    if (scheme) {
      conditions.push(eq(timetable.scheme, scheme));
    }

    const entries = await db.query.timetable.findMany({
      where: and(...conditions),
      orderBy: [timetable.date, timetable.session],
    });

    logger.debug(MODULE_FN, `Fetched ${entries.length} entries for subject ${subjectCode}`);
    return { success: true, data: entries };
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to fetch timetable by subject', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// lib/actions/timetable.ts - Add this function

// ============================================
// Resolve Copy Cases
// ============================================

const ResolveCopyCaseSchema = z.object({
  subjectCode: z.string().min(1),
  scheme: z.string().min(1),
  date: z.date(),
  session: z.enum(['Morning', 'Afternoon', 'All']),
  seatNumber: z.number().int().positive(),
});

export async function resolveCopyCase(data: z.infer<typeof ResolveCopyCaseSchema>) {
  const MODULE_FN = `${MODULE}.resolveCopyCase`;

  try {
    const validated = ResolveCopyCaseSchema.parse(data);
    const examCenter = await requireExamCenter();

    // Find the timetable entry
    const entry = await db.query.timetable.findFirst({
      where: and(
        eq(timetable.examCenterId, examCenter.id),
        eq(timetable.subjectCode, validated.subjectCode),
        eq(timetable.scheme, validated.scheme),
        eq(timetable.date, validated.date),
        eq(timetable.session, validated.session),
      ),
    });

    if (!entry) {
      logger.warn(MODULE_FN, 'Timetable entry not found', {
        subjectCode: validated.subjectCode,
        scheme: validated.scheme,
        date: validated.date,
        session: validated.session,
      });
      return { success: false, error: 'Timetable entry not found' };
    }

    // Check if the seat is in cpsStudents
    const cpsStudents = entry.cpsStudents || [];
    if (!cpsStudents.includes(validated.seatNumber)) {
      logger.warn(MODULE_FN, 'Seat number not in copy case list', {
        seatNumber: validated.seatNumber,
        cpsStudents,
      });
      return { success: false, error: 'This student is not marked as a copy case' };
    }

    // Check if already resolved
    const cpsResolved = entry.cpsResolved || [];
    if (cpsResolved.includes(validated.seatNumber)) {
      logger.warn(MODULE_FN, 'Copy case already resolved', {
        seatNumber: validated.seatNumber,
      });
      return { success: false, error: 'This copy case has already been resolved' };
    }

    // Add to resolved list
    const updatedResolved = [...cpsResolved, validated.seatNumber].sort();

    const [updated] = await db
      .update(timetable)
      .set({
        cpsResolved: updatedResolved,
        updatedAt: new Date(),
      })
      .where(eq(timetable.id, entry.id))
      .returning();

    logger.info(MODULE_FN, 'Copy case resolved', {
      id: entry.id,
      seatNumber: validated.seatNumber,
      totalResolved: updatedResolved.length,
    });
    revalidatePath('/exam-center/exam-setup/timetable');
    revalidatePath('/msbte-reports/f13');

    return { success: true, data: updated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn(MODULE_FN, 'Validation failed', { issues: error.issues });
      return { success: false, error: error.issues };
    }

    logger.error(MODULE_FN, 'Failed to resolve copy case', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to resolve copy case',
    };
  }
}
