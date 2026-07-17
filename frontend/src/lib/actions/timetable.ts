// lib/actions/timetable.ts
'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, sql, inArray } from 'drizzle-orm';
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

const ResolveCopyCaseSchema = z.object({
  subjectCode: z.string().min(1),
  scheme: z.string().min(1),
  date: z.date(),
  session: z.enum(['Morning', 'Afternoon', 'All']),
  seatNumber: z.number().int().positive(),
});

// ============================================
// Read Operations - OPTIMIZED
// ============================================

export async function getTimetable(params?: {
  date?: Date | string;
  session?: 'Morning' | 'Afternoon';
  subjectCode?: string;
  scheme?: string;
}) {
  const fn = `${MODULE}.getTimetable`;
  const start = performance.now();

  try {
    const examCenterId = await getExamCenterId();
    if (!examCenterId) {
      logger.debug(fn, 'No exam center found');
      return { success: true, data: [], hasData: false, isBlockAllocated: false };
    }

    const conditions = [eq(timetable.examCenterId, examCenterId)];

    if (params?.date) {
      const dateObj = typeof params.date === 'string' ? new Date(params.date) : params.date;
      conditions.push(eq(timetable.date, dateObj));
    }
    if (params?.session) conditions.push(eq(timetable.session, params.session));
    if (params?.subjectCode) conditions.push(eq(timetable.subjectCode, params.subjectCode));
    if (params?.scheme) conditions.push(eq(timetable.scheme, params.scheme));

    // Fetch timetable and block allocation check in parallel
    const [entries, allocations] = await Promise.all([
      db.query.timetable.findMany({
        where: and(...conditions),
        orderBy: [timetable.date, timetable.session, timetable.timeSlot],
      }),
      params?.date && params?.session
        ? db.query.blockAllocations.findMany({
            where: and(
              eq(blockAllocations.examCenterId, examCenterId),
              eq(blockAllocations.date, new Date(params.date)),
              eq(blockAllocations.session, params.session),
            ),
            limit: 1,
          })
        : Promise.resolve([]),
    ]);

    const duration = performance.now() - start;
    logger.debug(fn, `Fetched ${entries.length} entries in ${duration.toFixed(0)}ms`, {
      examCenterId,
      filters: params,
    });

    return {
      success: true,
      data: entries,
      hasData: entries.length > 0,
      isBlockAllocated: allocations.length > 0,
    };
  } catch (error) {
    logger.error(fn, 'Failed to fetch timetable', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      data: [],
      hasData: false,
      isBlockAllocated: false,
    };
  }
}

export async function getTimetableEntryById(id: string) {
  const fn = `${MODULE}.getTimetableEntryById`;

  try {
    const examCenterId = await getExamCenterId();
    if (!examCenterId) {
      logger.debug(fn, 'No exam center found');
      return { success: true, data: null };
    }

    const entry = await db.query.timetable.findFirst({
      where: and(eq(timetable.id, id), eq(timetable.examCenterId, examCenterId)),
    });

    return { success: true, data: entry || null };
  } catch (error) {
    logger.error(fn, 'Failed to fetch timetable entry', { error });
    return { success: false, error: 'Failed to fetch entry', data: null };
  }
}

export async function getUniqueDates() {
  const fn = `${MODULE}.getUniqueDates`;

  try {
    const examCenterId = await getExamCenterId();
    if (!examCenterId) {
      logger.debug(fn, 'No exam center found');
      return { success: true, data: [] };
    }

    const results = await db
      .selectDistinct({ date: timetable.date })
      .from(timetable)
      .where(eq(timetable.examCenterId, examCenterId))
      .orderBy(timetable.date);

    return { success: true, data: results.map((r) => r.date) };
  } catch (error) {
    logger.error(fn, 'Failed to fetch unique dates', { error });
    return { success: false, error: 'Failed to fetch dates', data: [] };
  }
}

export async function getUniqueSessions() {
  const fn = `${MODULE}.getUniqueSessions`;

  try {
    const examCenterId = await getExamCenterId();
    if (!examCenterId) {
      logger.debug(fn, 'No exam center found');
      return { success: true, data: [] };
    }

    const results = await db
      .selectDistinct({ session: timetable.session })
      .from(timetable)
      .where(eq(timetable.examCenterId, examCenterId));

    return { success: true, data: results.map((r) => r.session) };
  } catch (error) {
    logger.error(fn, 'Failed to fetch unique sessions', { error });
    return { success: false, error: 'Failed to fetch sessions', data: [] };
  }
}

export async function getTimetableEntries(params?: {
  date?: Date;
  session?: 'Morning' | 'Afternoon';
  subjectCode?: string;
  scheme?: string;
}) {
  const fn = `${MODULE}.getTimetableEntries`;

  try {
    const examCenterId = await getExamCenterId();
    if (!examCenterId) {
      logger.debug(fn, 'No exam center found');
      return { success: true, data: [] };
    }

    const conditions = [eq(timetable.examCenterId, examCenterId)];
    if (params?.date) conditions.push(eq(timetable.date, params.date));
    if (params?.session) conditions.push(eq(timetable.session, params.session));
    if (params?.subjectCode) conditions.push(eq(timetable.subjectCode, params.subjectCode));
    if (params?.scheme) conditions.push(eq(timetable.scheme, params.scheme));

    const entries = await db.query.timetable.findMany({
      where: and(...conditions),
      orderBy: [timetable.date, timetable.session, timetable.timeSlot],
    });

    return { success: true, data: entries };
  } catch (error) {
    logger.error(fn, 'Failed to fetch timetable entries', { error });
    return { success: false, error: 'Failed to fetch entries', data: [] };
  }
}

export async function getTimetableBySubject(subjectCode: string, scheme?: string) {
  const fn = `${MODULE}.getTimetableBySubject`;

  try {
    const examCenterId = await getExamCenterId();
    if (!examCenterId) {
      logger.debug(fn, 'No exam center found');
      return { success: true, data: [] };
    }

    const conditions = [
      eq(timetable.examCenterId, examCenterId),
      eq(timetable.subjectCode, subjectCode),
    ];
    if (scheme) conditions.push(eq(timetable.scheme, scheme));

    const entries = await db.query.timetable.findMany({
      where: and(...conditions),
      orderBy: [timetable.date, timetable.session],
    });

    return { success: true, data: entries };
  } catch (error) {
    logger.error(fn, 'Failed to fetch timetable by subject', { error });
    return { success: false, error: 'Failed to fetch entries', data: [] };
  }
}

// ============================================
// Statistics - OPTIMIZED with SINGLE QUERY
// ============================================

export async function getTimetableStats() {
  const fn = `${MODULE}.getTimetableStats`;
  const start = performance.now();

  try {
    const examCenterId = await getExamCenterId();
    if (!examCenterId) {
      logger.debug(fn, 'No exam center found');
      return {
        success: true,
        data: {
          totalEntries: 0,
          uniqueSubjects: 0,
          uniqueSchemes: 0,
          examinees: 0,
          students: 0,
          dateRange: null,
          totalAbsent: 0,
          totalCps: 0,
        },
      };
    }

    // ✅ SINGLE QUERY with all stats + student counts in one go
    const result = await db.execute(sql`
      WITH timetable_stats AS (
        SELECT
          COUNT(*) as total_entries,
          COUNT(DISTINCT subject_code) as unique_subjects,
          COUNT(DISTINCT scheme) as unique_schemes,
          COALESCE(SUM(jsonb_array_length(absent_numbers)), 0) as total_absent,
          COALESCE(SUM(jsonb_array_length(cps_students)), 0) as total_cps,
          MIN(date) as min_date,
          MAX(date) as max_date,
          COALESCE(SUM(total_students), 0) as total_students
        FROM timetable
        WHERE exam_center_id = ${examCenterId}
      ),
      student_stats AS (
        SELECT
          COUNT(DISTINCT seat_number) as examinees,
          COUNT(DISTINCT enrollment_number) as students
        FROM students
        WHERE exam_center_id = ${examCenterId} AND is_deleted = false
      )
      SELECT
        ts.*,
        ss.examinees,
        ss.students
      FROM timetable_stats ts
      CROSS JOIN student_stats ss
    `);

    const row = result.rows[0] as any;

    const statsData = {
      totalEntries: Number(row?.total_entries || 0),
      uniqueSubjects: Number(row?.unique_subjects || 0),
      uniqueSchemes: Number(row?.unique_schemes || 0),
      examinees: Number(row?.examinees || 0),
      students: Number(row?.students || 0),
      totalAbsent: Number(row?.total_absent || 0),
      totalCps: Number(row?.total_cps || 0),
      totalStudents: Number(row?.total_students || 0),
      dateRange: row?.min_date && row?.max_date
        ? { min: new Date(row.min_date), max: new Date(row.max_date) }
        : null,
    };

    const duration = performance.now() - start;
    logger.debug(fn, `Stats fetched in ${duration.toFixed(0)}ms (1 query)`, statsData);

    return { success: true, data: statsData };
  } catch (error) {
    logger.error(fn, 'Failed to fetch timetable stats', { error });
    return {
      success: false,
      error: 'Failed to fetch stats',
      data: {
        totalEntries: 0,
        uniqueSubjects: 0,
        uniqueSchemes: 0,
        examinees: 0,
        students: 0,
        dateRange: null,
        totalAbsent: 0,
        totalCps: 0,
      },
    };
  }
}

export async function hasTimetable(): Promise<{ success: true; data: boolean } | { success: false; error: string }> {
  const fn = `${MODULE}.hasTimetable`;

  try {
    const examCenterId = await getExamCenterId();
    if (!examCenterId) {
      logger.debug(fn, 'No exam center found');
      return { success: true, data: false };
    }

    // ✅ Use EXISTS instead of COUNT for better performance
    const result = await db.execute(sql`
      SELECT EXISTS(
        SELECT 1 FROM timetable WHERE exam_center_id = ${examCenterId} LIMIT 1
      ) as exists
    `);

    const hasData = (result.rows[0] as any)?.exists === true;
    logger.debug(fn, `Timetable exists: ${hasData}`);
    return { success: true, data: hasData };
  } catch (error) {
    logger.error(fn, 'Failed to check timetable existence', { error });
    return { success: false, error: 'Failed to check existence' };
  }
}

// ============================================
// Write Operations - OPTIMIZED BATCH INSERT
// ============================================

export async function importTimetable(data: z.infer<typeof BulkImportSchema>) {
  const fn = `${MODULE}.importTimetable`;
  const start = performance.now();

  try {
    const validated = BulkImportSchema.parse(data);
    const examCenter = await requireExamCenter();

    if (validated.entries.length === 0) {
      return { success: false, error: 'No entries to import' };
    }

    const result = await db.transaction(async (tx) => {
      if (validated.overwrite) {
        await tx.delete(timetable).where(eq(timetable.examCenterId, examCenter.id));
        logger.info(fn, 'Cleared existing timetable entries', { examCenterId: examCenter.id });
      }

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

      // Batch insert with conflict handling
      const BATCH_SIZE = 500;
      const insertedEntries = [];

      for (let i = 0; i < values.length; i += BATCH_SIZE) {
        const batch = values.slice(i, i + BATCH_SIZE);
        const inserted = await tx.insert(timetable).values(batch).returning();
        insertedEntries.push(...inserted);
      }

      return insertedEntries;
    });

    const duration = performance.now() - start;
    logger.info(fn, `Imported ${result.length} entries in ${duration.toFixed(0)}ms`, {
      examCenterId: examCenter.id,
      overwrite: validated.overwrite,
    });

    revalidatePath('/exam-center/exam-setup/timetable');
    return { success: true, data: result };
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn(fn, 'Validation failed', { issues: error.issues });
      return { success: false, error: error.issues };
    }
    logger.error(fn, 'Failed to import timetable', { error });
    return { success: false, error: 'Failed to import timetable' };
  }
}

export async function updateTimetableEntry(data: z.infer<typeof UpdateEntrySchema>) {
  const fn = `${MODULE}.updateTimetableEntry`;

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
      logger.warn(fn, 'Timetable entry not found', { id });
      return { success: false, error: 'Timetable entry not found' };
    }

    logger.info(fn, 'Timetable entry updated', { id });
    revalidatePath('/exam-center/exam-setup/timetable');
    return { success: true, data: updated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn(fn, 'Validation failed', { issues: error.issues });
      return { success: false, error: error.issues };
    }
    logger.error(fn, 'Failed to update timetable entry', { error });
    return { success: false, error: 'Failed to update entry' };
  }
}

export async function deleteTimetableEntry(id: string) {
  const fn = `${MODULE}.deleteTimetableEntry`;

  try {
    const examCenter = await requireExamCenter();

    const [deleted] = await db
      .delete(timetable)
      .where(and(eq(timetable.id, id), eq(timetable.examCenterId, examCenter.id)))
      .returning();

    if (!deleted) {
      logger.warn(fn, 'Timetable entry not found', { id });
      return { success: false, error: 'Timetable entry not found' };
    }

    logger.info(fn, 'Timetable entry deleted', { id });
    revalidatePath('/exam-center/exam-setup/timetable');
    return { success: true, data: deleted };
  } catch (error) {
    logger.error(fn, 'Failed to delete timetable entry', { error });
    return { success: false, error: 'Failed to delete entry' };
  }
}

export async function deleteAllTimetable() {
  const fn = `${MODULE}.deleteAllTimetable`;

  try {
    const examCenter = await requireExamCenter();

    const deleted = await db
      .delete(timetable)
      .where(eq(timetable.examCenterId, examCenter.id))
      .returning();

    logger.warn(fn, 'Deleted all timetable entries', {
      examCenterId: examCenter.id,
      count: deleted.length,
    });

    revalidatePath('/exam-center/exam-setup/timetable');
    return { success: true, data: deleted };
  } catch (error) {
    logger.error(fn, 'Failed to delete all timetable entries', { error });
    return { success: false, error: 'Failed to delete entries' };
  }
}

// ============================================
// Student Status Operations
// ============================================

export async function markAbsent(data: z.infer<typeof MarkAbsentSchema>) {
  const fn = `${MODULE}.markAbsent`;

  try {
    const validated = MarkAbsentSchema.parse(data);
    const examCenter = await requireExamCenter();

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
      logger.warn(fn, 'Timetable entry not found', {
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

    logger.info(fn, 'Absent students marked', {
      id: entry.id,
      count: validated.absentNumbers.length,
    });

    revalidatePath('/exam-center/exam-setup/timetable');
    return { success: true, data: updated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn(fn, 'Validation failed', { issues: error.issues });
      return { success: false, error: error.issues };
    }
    logger.error(fn, 'Failed to mark absent students', { error });
    return { success: false, error: 'Failed to mark absent' };
  }
}

export async function markCopyCase(data: z.infer<typeof MarkCopyCaseSchema>) {
  const fn = `${MODULE}.markCopyCase`;

  try {
    const validated = MarkCopyCaseSchema.parse(data);
    const examCenter = await requireExamCenter();

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
      logger.warn(fn, 'Timetable entry not found', {
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

    logger.info(fn, 'Copy case students marked', {
      id: entry.id,
      count: validated.cpsStudents.length,
    });

    revalidatePath('/exam-center/exam-setup/timetable');
    return { success: true, data: updated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn(fn, 'Validation failed', { issues: error.issues });
      return { success: false, error: error.issues };
    }
    logger.error(fn, 'Failed to mark copy case students', { error });
    return { success: false, error: 'Failed to mark copy case' };
  }
}

export async function resolveCopyCase(data: z.infer<typeof ResolveCopyCaseSchema>) {
  const fn = `${MODULE}.resolveCopyCase`;

  try {
    const validated = ResolveCopyCaseSchema.parse(data);
    const examCenter = await requireExamCenter();

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
      logger.warn(fn, 'Timetable entry not found');
      return { success: false, error: 'Timetable entry not found' };
    }

    const cpsStudents = entry.cpsStudents || [];
    if (!cpsStudents.includes(validated.seatNumber)) {
      logger.warn(fn, 'Seat number not in copy case list', { seatNumber: validated.seatNumber });
      return { success: false, error: 'This student is not marked as a copy case' };
    }

    const cpsResolved = entry.cpsResolved || [];
    if (cpsResolved.includes(validated.seatNumber)) {
      logger.warn(fn, 'Copy case already resolved', { seatNumber: validated.seatNumber });
      return { success: false, error: 'This copy case has already been resolved' };
    }

    const updatedResolved = [...cpsResolved, validated.seatNumber].sort();

    const [updated] = await db
      .update(timetable)
      .set({
        cpsResolved: updatedResolved,
        updatedAt: new Date(),
      })
      .where(eq(timetable.id, entry.id))
      .returning();

    logger.info(fn, 'Copy case resolved', {
      id: entry.id,
      seatNumber: validated.seatNumber,
      totalResolved: updatedResolved.length,
    });

    revalidatePath('/exam-center/exam-setup/timetable');
    revalidatePath('/msbte-reports/f13');
    return { success: true, data: updated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn(fn, 'Validation failed', { issues: error.issues });
      return { success: false, error: error.issues };
    }
    logger.error(fn, 'Failed to resolve copy case', { error });
    return { success: false, error: 'Failed to resolve copy case' };
  }
}

// ============================================
// Export Operations
// ============================================

export async function exportTimetable() {
  const fn = `${MODULE}.exportTimetable`;

  try {
    const examCenter = await requireExamCenter();

    const entries = await db.query.timetable.findMany({
      where: eq(timetable.examCenterId, examCenter.id),
      orderBy: [timetable.date, timetable.session],
    });

    const exportData = entries.map((entry) => ({
      ...entry,
      date: entry.date.toISOString(),
      createdAt: entry.createdAt.toISOString(),
      updatedAt: entry.updatedAt.toISOString(),
    }));

    logger.info(fn, `Exported ${exportData.length} timetable entries`, {
      examCenterId: examCenter.id,
    });

    return { success: true, data: exportData };
  } catch (error) {
    logger.error(fn, 'Failed to export timetable', { error });
    return { success: false, error: 'Failed to export timetable' };
  }
}