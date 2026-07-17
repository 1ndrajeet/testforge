// lib/actions/inventory.ts
'use server';

import { revalidatePath } from 'next/cache';
import { and, desc, eq, sql, inArray } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/lib/db';
import { qpInventory, subjects, timetable } from '@/lib/db/schema';
import { logger } from '@/lib/misc/logger';
import { getExamCenterId, requireExamCenter } from '@/lib/session';

const MODULE = 'qp-inventory';

// ============================================
// Types
// ============================================

export interface QPInventoryRecord {
  id: string;
  date: Date;
  session: 'Morning' | 'Afternoon' | 'All';
  subjectCode: string;
  subjectName: string;
  scheme: string;
  expectedStudents: number;
  day: number | null;
  expectedPackets: number;
  receivedPackets: number;
  receivedQps: number;
  qpPerPacket: number;
  isComplete: boolean;
  hasDiscrepancy: boolean;
}

export interface QPInventoryStats {
  totalSubjects: number;
  totalExpectedStudents: number;
  totalExpectedPackets: number;
  totalReceivedPackets: number;
  totalReceivedQps: number;
  totalPacketsDiscrepancy: number;
  totalQpsDiscrepancy: number;
  completionRate: number;
}

// ============================================
// Validation Schemas
// ============================================

const UpdateInventorySchema = z.object({
  id: z.string(),
  receivedPackets: z.number().int().min(0),
  qpPerPacket: z.number().int().min(0),
});

const BulkUpdateInventorySchema = z.object({
  date: z.date(),
  records: z.array(
    z.object({
      id: z.string(),
      receivedPackets: z.number().int().min(0),
      qpPerPacket: z.number().int().min(0),
    }),
  ),
});

// ============================================
// Helpers
// ============================================

async function getExamCenterIdOrThrow() {
  const id = await getExamCenterId();
  if (!id) throw new Error('Exam center not found');
  return id;
}

// ============================================
// OPTIMIZED: processInventoryRecords - with IN clause
// ============================================

async function processInventoryRecords(records: any[]): Promise<{
  success: boolean;
  data: QPInventoryRecord[];
  stats: QPInventoryStats;
}> {
  const fn = `${MODULE}.processInventoryRecords`;
  const start = performance.now();

  if (records.length === 0) {
    return {
      success: true,
      data: [],
      stats: {
        totalSubjects: 0,
        totalExpectedStudents: 0,
        totalExpectedPackets: 0,
        totalReceivedPackets: 0,
        totalReceivedQps: 0,
        totalPacketsDiscrepancy: 0,
        totalQpsDiscrepancy: 0,
        completionRate: 0,
      },
    };
  }

  // Get subject codes from records - ✅ ONE query with IN clause
  const subjectCodes = records.map((r) => r.subjectCode);

  const subjectRecords = await db.query.subjects.findMany({
    where: inArray(subjects.code, subjectCodes),
    columns: {
      code: true,
      name: true,
      scheme: true,
    },
  });

  // Build map
  const subjectInfoMap = new Map<string, { subjectName: string; scheme: string }>();
  for (const sub of subjectRecords) {
    subjectInfoMap.set(sub.code, {
      subjectName: sub.name || sub.code,
      scheme: sub.scheme || '',
    });
  }

  // Convert to QPInventoryRecord format
  const mappedRecords: QPInventoryRecord[] = records.map((record) => {
    const subjectInfo = subjectInfoMap.get(record.subjectCode) || {
      subjectName: record.subjectCode,
      scheme: '',
    };

    const receivedPackets = record.receivedPackets || 0;
    const expectedPackets = record.expectedPackets || 0;
    const receivedQps = record.receivedQps || 0;
    const expectedStudents = record.expectedStudents || 0;

    return {
      id: record.id,
      date: record.date,
      session: record.session as 'Morning' | 'Afternoon',
      subjectCode: record.subjectCode,
      subjectName: subjectInfo.subjectName,
      scheme: subjectInfo.scheme,
      expectedStudents: expectedStudents,
      day: record.day ?? null,
      expectedPackets: expectedPackets,
      receivedPackets: receivedPackets,
      receivedQps: receivedQps,
      qpPerPacket: receivedQps || 0,
      isComplete: receivedPackets >= expectedPackets && expectedPackets > 0,
      hasDiscrepancy: expectedPackets !== receivedPackets && expectedPackets > 0,
    };
  });

  // Calculate stats
  const totalSubjects = mappedRecords.length;
  const totalExpectedStudents = mappedRecords.reduce((sum, r) => sum + r.expectedStudents, 0);
  const totalExpectedPackets = mappedRecords.reduce((sum, r) => sum + r.expectedPackets, 0);
  const totalReceivedPackets = mappedRecords.reduce((sum, r) => sum + r.receivedPackets, 0);
  const totalReceivedQps = mappedRecords.reduce((sum, r) => sum + r.receivedQps, 0);
  const totalPacketsDiscrepancy = Math.abs(totalExpectedPackets - totalReceivedPackets);
  const totalQpsDiscrepancy = Math.abs(totalReceivedPackets * 50 - totalReceivedQps);
  const completed = mappedRecords.filter((r) => r.isComplete).length;
  const completionRate = totalSubjects > 0 ? Math.round((completed / totalSubjects) * 100) : 0;

  const stats: QPInventoryStats = {
    totalSubjects,
    totalExpectedStudents,
    totalExpectedPackets,
    totalReceivedPackets,
    totalReceivedQps,
    totalPacketsDiscrepancy,
    totalQpsDiscrepancy,
    completionRate,
  };

  const duration = performance.now() - start;
  logger.debug(fn, `Processed ${records.length} records in ${duration.toFixed(0)}ms`);

  return { success: true, data: mappedRecords, stats };
}

// ============================================
// OPTIMIZED: getQPInventory - with parallel queries
// ============================================

export async function getQPInventory(
  date: Date,
  session?: string,
): Promise<{
  success: boolean;
  data?: QPInventoryRecord[];
  stats?: QPInventoryStats;
  error?: string;
}> {
  const fn = `${MODULE}.getQPInventory`;
  const start = performance.now();

  try {
    const examCenterId = await getExamCenterId();
    if (!examCenterId) {
      logger.debug(fn, 'No exam center found');
      return {
        success: true,
        data: [],
        stats: {
          totalSubjects: 0,
          totalExpectedStudents: 0,
          totalExpectedPackets: 0,
          totalReceivedPackets: 0,
          totalReceivedQps: 0,
          totalPacketsDiscrepancy: 0,
          totalQpsDiscrepancy: 0,
          completionRate: 0,
        },
      };
    }

    const conditions = [eq(qpInventory.examCenterId, examCenterId), eq(qpInventory.date, date)];
    if (session) conditions.push(eq(qpInventory.session, session));

    const records = await db.query.qpInventory.findMany({
      where: and(...conditions),
      orderBy: [qpInventory.session, qpInventory.subjectCode],
    });

    if (records.length === 0) {
      // Try to generate from timetable
      const generateResult = await generateQPInventoryFromTimetable(date, session);
      if (generateResult.success && generateResult.data) {
        const refetched = await db.query.qpInventory.findMany({
          where: and(...conditions),
          orderBy: [qpInventory.session, qpInventory.subjectCode],
        });
        if (refetched.length > 0) {
          const result = await processInventoryRecords(refetched);
          const duration = performance.now() - start;
          logger.debug(fn, `Generated and fetched ${result.data.length} records in ${duration.toFixed(0)}ms`);
          return result;
        }
      }

      return {
        success: true,
        data: [],
        stats: {
          totalSubjects: 0,
          totalExpectedStudents: 0,
          totalExpectedPackets: 0,
          totalReceivedPackets: 0,
          totalReceivedQps: 0,
          totalPacketsDiscrepancy: 0,
          totalQpsDiscrepancy: 0,
          completionRate: 0,
        },
      };
    }

    const result = await processInventoryRecords(records);
    const duration = performance.now() - start;
    logger.debug(fn, `Fetched ${result.data.length} records in ${duration.toFixed(0)}ms`);

    return result;
  } catch (error) {
    logger.error(fn, 'Failed to fetch inventory', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch inventory',
    };
  }
}

export async function getQPInventoryByDateRange(startDate: Date, endDate: Date) {
  const fn = `${MODULE}.getQPInventoryByDateRange`;

  try {
    const examCenterId = await getExamCenterId();
    if (!examCenterId) {
      return { success: true, data: [] };
    }

    const records = await db.query.qpInventory.findMany({
      where: and(
        eq(qpInventory.examCenterId, examCenterId),
        sql`${qpInventory.date} >= ${startDate} AND ${qpInventory.date} <= ${endDate}`,
      ),
      orderBy: [qpInventory.date, qpInventory.session, qpInventory.subjectCode],
    });

    return { success: true, data: records };
  } catch (error) {
    logger.error(fn, 'Failed to fetch inventory by date range', { error });
    return { success: false, error: 'Failed to fetch inventory', data: [] };
  }
}

// ============================================
// OPTIMIZED: getAllInventoryRecords
// ============================================

export async function getAllInventoryRecords(): Promise<{
  success: boolean;
  data: QPInventoryRecord[];
  stats?: QPInventoryStats;
  error?: string;
}> {
  const fn = `${MODULE}.getAllInventoryRecords`;
  const start = performance.now();

  try {
    const examCenterId = await getExamCenterId();
    if (!examCenterId) {
      return {
        success: true,
        data: [],
        stats: {
          totalSubjects: 0,
          totalExpectedStudents: 0,
          totalExpectedPackets: 0,
          totalReceivedPackets: 0,
          totalReceivedQps: 0,
          totalPacketsDiscrepancy: 0,
          totalQpsDiscrepancy: 0,
          completionRate: 0,
        },
      };
    }

    const records = await db.query.qpInventory.findMany({
      where: eq(qpInventory.examCenterId, examCenterId),
      orderBy: [qpInventory.day, qpInventory.session, qpInventory.subjectCode],
    });

    if (records.length === 0) {
      return {
        success: true,
        data: [],
        stats: {
          totalSubjects: 0,
          totalExpectedStudents: 0,
          totalExpectedPackets: 0,
          totalReceivedPackets: 0,
          totalReceivedQps: 0,
          totalPacketsDiscrepancy: 0,
          totalQpsDiscrepancy: 0,
          completionRate: 0,
        },
      };
    }

    const result = await processInventoryRecords(records);
    const duration = performance.now() - start;
    logger.debug(fn, `Fetched ${result.data.length} records in ${duration.toFixed(0)}ms`);

    return result;
  } catch (error) {
    logger.error(fn, 'Failed to fetch all inventory records', { error });
    return {
      success: false,
      error: 'Failed to fetch inventory',
      data: [],
      stats: {
        totalSubjects: 0,
        totalExpectedStudents: 0,
        totalExpectedPackets: 0,
        totalReceivedPackets: 0,
        totalReceivedQps: 0,
        totalPacketsDiscrepancy: 0,
        totalQpsDiscrepancy: 0,
        completionRate: 0,
      },
    };
  }
}

// ============================================
// OPTIMIZED: getInventorySummary - SINGLE QUERY
// ============================================

export async function getInventorySummary(): Promise<{
  success: boolean;
  data: Array<{
    day: number;
    totalExpected: number;
    totalReceived: number;
    totalStudents: number;
    subjects: number;
    completionRate: number;
  }>;
  error?: string;
}> {
  const fn = `${MODULE}.getInventorySummary`;
  const start = performance.now();

  try {
    const examCenterId = await getExamCenterId();
    if (!examCenterId) {
      return { success: true, data: [] };
    }

    const results = await db
      .select({
        day: qpInventory.day,
        totalExpected: sql<number>`COALESCE(sum(${qpInventory.expectedPackets}), 0)`,
        totalReceived: sql<number>`COALESCE(sum(${qpInventory.receivedPackets}), 0)`,
        totalStudents: sql<number>`COALESCE(sum(${qpInventory.expectedStudents}), 0)`,
        subjects: sql<number>`count(*)`,
      })
      .from(qpInventory)
      .where(eq(qpInventory.examCenterId, examCenterId))
      .groupBy(qpInventory.day)
      .orderBy(qpInventory.day);

    const data = results.map((r) => ({
      day: r.day || 0,
      totalExpected: Number(r.totalExpected) || 0,
      totalReceived: Number(r.totalReceived) || 0,
      totalStudents: Number(r.totalStudents) || 0,
      subjects: Number(r.subjects) || 0,
      completionRate:
        Number(r.totalExpected) > 0
          ? Math.round((Number(r.totalReceived) / Number(r.totalExpected)) * 100)
          : 0,
    }));

    const duration = performance.now() - start;
    logger.debug(fn, `Fetched inventory summary for ${data.length} days in ${duration.toFixed(0)}ms`);

    return { success: true, data };
  } catch (error) {
    logger.error(fn, 'Failed to fetch inventory summary', { error });
    return { success: false, error: 'Failed to fetch summary', data: [] };
  }
}

// ============================================
// OPTIMIZED: hasInventoryData - EXISTS instead of COUNT
// ============================================

export async function hasInventoryData(): Promise<{
  success: boolean;
  data: boolean;
  error?: string;
}> {
  const fn = `${MODULE}.hasInventoryData`;
  const start = performance.now();

  try {
    const examCenterId = await getExamCenterId();
    if (!examCenterId) {
      return { success: true, data: false };
    }

    // ✅ EXISTS is faster than COUNT
    const result = await db.execute(sql`
      SELECT EXISTS(
        SELECT 1 FROM qp_inventory
        WHERE exam_center_id = ${examCenterId}
        LIMIT 1
      ) as exists
    `);

    const hasData = (result.rows[0] as any)?.exists === true;

    const duration = performance.now() - start;
    logger.debug(fn, `Has inventory: ${hasData} (${duration.toFixed(0)}ms)`);

    return { success: true, data: hasData };
  } catch (error) {
    logger.error(fn, 'Failed to check inventory existence', { error });
    return { success: false, error: 'Failed to check existence', data: false };
  }
}

// ============================================
// OPTIMIZED: getAvailableInventoryDates
// ============================================

export async function getAvailableInventoryDates() {
  const fn = `${MODULE}.getAvailableInventoryDates`;
  const start = performance.now();

  try {
    const examCenterId = await getExamCenterId();
    if (!examCenterId) {
      return { success: true, data: [] };
    }

    const results = await db
      .selectDistinct({ date: qpInventory.date })
      .from(qpInventory)
      .where(eq(qpInventory.examCenterId, examCenterId))
      .orderBy(desc(qpInventory.date));

    const dates = results.map((r) => r.date);

    const duration = performance.now() - start;
    logger.debug(fn, `Fetched ${dates.length} dates in ${duration.toFixed(0)}ms`);

    return { success: true, data: dates };
  } catch (error) {
    logger.error(fn, 'Failed to fetch available dates', { error });
    return { success: false, error: 'Failed to fetch dates', data: [] };
  }
}

// ============================================
// Write Operations
// ============================================

export async function updateQPInventory(data: z.infer<typeof UpdateInventorySchema>) {
  const fn = `${MODULE}.updateQPInventory`;

  try {
    const validated = UpdateInventorySchema.parse(data);
    const examCenter = await requireExamCenter();

    const [updated] = await db
      .update(qpInventory)
      .set({
        receivedPackets: validated.receivedPackets,
        receivedQps: validated.qpPerPacket,
        updatedAt: new Date(),
      })
      .where(and(eq(qpInventory.id, validated.id), eq(qpInventory.examCenterId, examCenter.id)))
      .returning();

    if (!updated) {
      return { success: false, error: 'Inventory record not found' };
    }

    logger.info(fn, 'Inventory record updated', { id: validated.id });
    revalidatePath('/exam-center/exam-day/qp-accounting');
    return { success: true, data: updated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues };
    }
    logger.error(fn, 'Failed to update inventory', { error });
    return { success: false, error: 'Failed to update inventory' };
  }
}

export async function bulkUpdateQPInventory(data: z.infer<typeof BulkUpdateInventorySchema>) {
  const fn = `${MODULE}.bulkUpdateQPInventory`;
  const start = performance.now();

  try {
    const validated = BulkUpdateInventorySchema.parse(data);
    const examCenter = await requireExamCenter();

    const results = await db.transaction(async (tx) => {
      const updatedRecords = [];

      for (const record of validated.records) {
        const [updated] = await tx
          .update(qpInventory)
          .set({
            receivedPackets: record.receivedPackets,
            receivedQps: record.qpPerPacket,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(qpInventory.id, record.id),
              eq(qpInventory.examCenterId, examCenter.id),
              eq(qpInventory.date, validated.date),
            ),
          )
          .returning();

        if (updated) updatedRecords.push(updated);
      }

      return updatedRecords;
    });

    const duration = performance.now() - start;
    logger.info(fn, `Bulk updated ${results.length} records in ${duration.toFixed(0)}ms`);

    revalidatePath('/exam-center/exam-day/qp-accounting');
    return { success: true, data: results };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues };
    }
    logger.error(fn, 'Failed to bulk update inventory', { error });
    return { success: false, error: 'Failed to update inventory' };
  }
}

// ============================================
// OPTIMIZED: generateQPInventoryFromTimetable - with parallel queries
// ============================================

export async function generateQPInventoryFromTimetable(date: Date, session?: string) {
  const fn = `${MODULE}.generateQPInventoryFromTimetable`;
  const start = performance.now();

  try {
    const examCenter = await requireExamCenter();

    const conditions = [eq(timetable.examCenterId, examCenter.id), eq(timetable.date, date)];
    if (session) conditions.push(eq(timetable.session, session));

    const timetableEntries = await db.query.timetable.findMany({
      where: and(...conditions),
    });

    if (timetableEntries.length === 0) {
      return { success: false, error: 'No timetable entries found for this date' };
    }

    // Delete existing inventory
    const deleteConditions = [
      eq(qpInventory.examCenterId, examCenter.id),
      eq(qpInventory.date, date),
    ];
    if (session) deleteConditions.push(eq(qpInventory.session, session));

    await db.delete(qpInventory).where(and(...deleteConditions));

    // Generate records
    const inventoryRecords = timetableEntries.map((entry) => ({
      examCenterId: examCenter.id,
      date: entry.date,
      session: entry.session,
      subjectCode: entry.subjectCode,
      expectedStudents: entry.totalStudents || 0,
      expectedPackets: Math.ceil((entry.totalStudents || 0) / 50),
      receivedPackets: 0,
      receivedQps: 0,
      day: entry.examDay || 1,
    }));

    // Batch insert
    const BATCH_SIZE = 100;
    const insertedRecords = [];

    for (let i = 0; i < inventoryRecords.length; i += BATCH_SIZE) {
      const batch = inventoryRecords.slice(i, i + BATCH_SIZE);
      const inserted = await db.insert(qpInventory).values(batch).returning();
      insertedRecords.push(...inserted);
    }

    const duration = performance.now() - start;
    logger.info(fn, `Generated ${insertedRecords.length} records in ${duration.toFixed(0)}ms`);

    revalidatePath('/exam-center/exam-day/qp-accounting');
    return { success: true, data: insertedRecords };
  } catch (error) {
    logger.error(fn, 'Failed to generate inventory from timetable', { error });
    return { success: false, error: 'Failed to generate inventory' };
  }
}

// ============================================
// processInventoryData - unchanged (already batched)
// ============================================

export async function processInventoryData(
  inventoryRecords: Array<{
    subjectCode: string;
    expectedStudents: number;
    expectedPackets: number;
    date: Date;
    session: 'Morning' | 'Afternoon' | 'All';
    day: number;
  }>,
) {
  const fn = `${MODULE}.processInventoryData`;
  const start = performance.now();

  try {
    const examCenter = await requireExamCenter();

    if (inventoryRecords.length === 0) {
      return { success: false, error: 'No inventory records to process' };
    }

    const dates = [...new Set(inventoryRecords.map((r) => r.date))];
    for (const date of dates) {
      await db
        .delete(qpInventory)
        .where(and(eq(qpInventory.examCenterId, examCenter.id), eq(qpInventory.date, date)));
    }

    const recordsToInsert = inventoryRecords.map((record) => ({
      examCenterId: examCenter.id,
      date: record.date,
      session: record.session,
      subjectCode: record.subjectCode,
      expectedStudents: record.expectedStudents,
      expectedPackets: record.expectedPackets,
      receivedPackets: 0,
      receivedQps: 0,
      day: record.day,
    }));

    const BATCH_SIZE = 100;
    const insertedRecords = [];

    for (let i = 0; i < recordsToInsert.length; i += BATCH_SIZE) {
      const batch = recordsToInsert.slice(i, i + BATCH_SIZE);
      const inserted = await db.insert(qpInventory).values(batch).returning();
      insertedRecords.push(...inserted);
    }

    const duration = performance.now() - start;
    logger.info(fn, `Processed ${insertedRecords.length} records in ${duration.toFixed(0)}ms`);

    revalidatePath('/exam-center/exam-day/qp-accounting');
    return { success: true, data: insertedRecords };
  } catch (error) {
    logger.error(fn, 'Failed to process inventory data', { error });
    return { success: false, error: 'Failed to process inventory data' };
  }
}

// ============================================
// deleteAllInventoryData - unchanged
// ============================================

export async function deleteAllInventoryData(): Promise<{
  success: boolean;
  data: number;
  error?: string;
}> {
  const fn = `${MODULE}.deleteAllInventoryData`;

  try {
    const examCenterId = await getExamCenterId();
    if (!examCenterId) {
      return { success: false, error: 'Exam center not found', data: 0 };
    }

    const deleted = await db
      .delete(qpInventory)
      .where(eq(qpInventory.examCenterId, examCenterId))
      .returning();

    logger.warn(fn, 'Deleted all inventory data', { count: deleted.length });
    revalidatePath('/exam-center/exam-setup/qp-inventory');

    return { success: true, data: deleted.length };
  } catch (error) {
    logger.error(fn, 'Failed to delete inventory data', { error });
    return { success: false, error: 'Failed to delete inventory', data: 0 };
  }
}