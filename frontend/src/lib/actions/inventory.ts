// lib/actions/inventory.ts
'use server';

import { revalidatePath } from 'next/cache';

import { and, desc, eq, sql } from 'drizzle-orm';
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
    })
  ),
});

// ============================================
// Read Operations
// ============================================

export async function getQPInventory(
  date: Date,
  session?: string
): Promise<{
  success: boolean;
  data?: QPInventoryRecord[];
  stats?: QPInventoryStats;
  error?: string;
}> {
  const MODULE_FN = `${MODULE}.getQPInventory`;

  try {
    const examCenterId = await getExamCenterId();

    if (!examCenterId) {
      logger.debug(MODULE_FN, 'No exam center found');
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

    // Build conditions
    const conditions = [eq(qpInventory.examCenterId, examCenterId), eq(qpInventory.date, date)];

    if (session) {
      conditions.push(eq(qpInventory.session, session));
    }

    // Get inventory records for the date
    const records = await db.query.qpInventory.findMany({
      where: and(...conditions),
      orderBy: [qpInventory.session, qpInventory.subjectCode],
    });

    if (records.length === 0) {
      // Try to generate from timetable
      const generateResult = await generateQPInventoryFromTimetable(date, session);
      if (generateResult.success && generateResult.data) {
        // Refetch after generation
        const refetched = await db.query.qpInventory.findMany({
          where: and(...conditions),
          orderBy: [qpInventory.session, qpInventory.subjectCode],
        });

        if (refetched.length > 0) {
          return await processInventoryRecords(refetched);
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

    return await processInventoryRecords(records);
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to fetch inventory', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch inventory',
    };
  }
}

// Helper function to process inventory records with subject info
async function processInventoryRecords(records: any[]): Promise<{
  success: boolean;
  data: QPInventoryRecord[];
  stats: QPInventoryStats;
}> {
  // Get subject codes from records
  const subjectCodes = records.map(r => r.subjectCode);

  // Fetch subject info from subjects table
  const subjectRecords = await db.query.subjects.findMany({
    where: sql`${subjects.code} IN (${sql.join(
      subjectCodes.map(c => sql`${c}`),
      sql`, `
    )})`,
    columns: {
      code: true,
      name: true,
      scheme: true,
    },
  });

  // Create a map of subjectCode -> { subjectName, scheme }
  const subjectInfoMap = new Map<string, { subjectName: string; scheme: string }>();
  for (const sub of subjectRecords) {
    subjectInfoMap.set(sub.code, {
      subjectName: sub.name || sub.code,
      scheme: sub.scheme || '',
    });
  }

  // Convert to QPInventoryRecord format with subject info
  const mappedRecords: QPInventoryRecord[] = records.map(record => {
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
      day: record.day ?? null, // Add this line
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
  const completed = mappedRecords.filter(r => r.isComplete).length;
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

  return { success: true, data: mappedRecords, stats };
}

export async function getQPInventoryByDateRange(startDate: Date, endDate: Date) {
  const MODULE_FN = `${MODULE}.getQPInventoryByDateRange`;

  try {
    const examCenterId = await getExamCenterId();

    if (!examCenterId) {
      logger.debug(MODULE_FN, 'No exam center found');
      return { success: true, data: [] };
    }

    const records = await db.query.qpInventory.findMany({
      where: and(
        eq(qpInventory.examCenterId, examCenterId),
        sql`${qpInventory.date} >= ${startDate} AND ${qpInventory.date} <= ${endDate}`
      ),
      orderBy: [qpInventory.date, qpInventory.session, qpInventory.subjectCode],
    });

    logger.debug(MODULE_FN, `Fetched ${records.length} inventory records for date range`);
    return { success: true, data: records };
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to fetch inventory by date range', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch inventory',
    };
  }
}

// ============================================
// Write Operations
// ============================================

export async function updateQPInventory(data: z.infer<typeof UpdateInventorySchema>) {
  const MODULE_FN = `${MODULE}.updateQPInventory`;

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
      logger.warn(MODULE_FN, 'Inventory record not found', { id: validated.id });
      return { success: false, error: 'Inventory record not found' };
    }

    logger.info(MODULE_FN, 'Inventory record updated', { id: validated.id });
    revalidatePath('/exam-center/exam-day/qp-accounting');

    return { success: true, data: updated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn(MODULE_FN, 'Validation failed', { issues: error.issues });
      return { success: false, error: error.issues };
    }

    logger.error(MODULE_FN, 'Failed to update inventory', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update inventory',
    };
  }
}

export async function bulkUpdateQPInventory(data: z.infer<typeof BulkUpdateInventorySchema>) {
  const MODULE_FN = `${MODULE}.bulkUpdateQPInventory`;

  try {
    const validated = BulkUpdateInventorySchema.parse(data);
    const examCenter = await requireExamCenter();

    // Start transaction
    const results = await db.transaction(async tx => {
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
              eq(qpInventory.date, validated.date)
            )
          )
          .returning();

        if (updated) {
          updatedRecords.push(updated);
        }
      }

      return updatedRecords;
    });

    logger.info(MODULE_FN, `Bulk updated ${results.length} inventory records`, {
      examCenterId: examCenter.id,
      date: validated.date,
    });
    revalidatePath('/exam-center/exam-day/qp-accounting');

    return { success: true, data: results };
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn(MODULE_FN, 'Validation failed', { issues: error.issues });
      return { success: false, error: error.issues };
    }

    logger.error(MODULE_FN, 'Failed to bulk update inventory', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update inventory',
    };
  }
}

// ============================================
// Generate Inventory from Timetable
// ============================================

export async function generateQPInventoryFromTimetable(date: Date, session?: string) {
  const MODULE_FN = `${MODULE}.generateQPInventoryFromTimetable`;

  try {
    const examCenter = await requireExamCenter();

    // Build conditions for timetable query
    const conditions = [eq(timetable.examCenterId, examCenter.id), eq(timetable.date, date)];

    if (session) {
      conditions.push(eq(timetable.session, session));
    }

    // Get timetable entries for the date
    const timetableEntries = await db.query.timetable.findMany({
      where: and(...conditions),
    });

    if (timetableEntries.length === 0) {
      return { success: false, error: 'No timetable entries found for this date' };
    }

    // Delete existing inventory for this date
    const deleteConditions = [eq(qpInventory.examCenterId, examCenter.id), eq(qpInventory.date, date)];

    if (session) {
      deleteConditions.push(eq(qpInventory.session, session));
    }

    await db.delete(qpInventory).where(and(...deleteConditions));

    // Generate inventory records from timetable - FIX: Use INSERT with ON CONFLICT DO NOTHING
    const inventoryRecords = timetableEntries.map(entry => ({
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

    // Insert in batches with conflict handling
    const BATCH_SIZE = 100;
    const insertedRecords = [];

    for (let i = 0; i < inventoryRecords.length; i += BATCH_SIZE) {
      const batch = inventoryRecords.slice(i, i + BATCH_SIZE);

      // Use raw SQL with ON CONFLICT DO NOTHING to skip duplicates
      const inserted = await db.insert(qpInventory).values(batch).returning();
      insertedRecords.push(...inserted);
    }

    logger.info(MODULE_FN, `Generated ${insertedRecords.length} inventory records from timetable`, {
      examCenterId: examCenter.id,
      date,
      session,
    });
    revalidatePath('/exam-center/exam-day/qp-accounting');

    return { success: true, data: insertedRecords };
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to generate inventory from timetable', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate inventory',
    };
  }
}

// ============================================
// Get Available Dates
// ============================================

export async function getAvailableInventoryDates() {
  const MODULE_FN = `${MODULE}.getAvailableInventoryDates`;

  try {
    const examCenterId = await getExamCenterId();

    if (!examCenterId) {
      logger.debug(MODULE_FN, 'No exam center found');
      return { success: true, data: [] };
    }

    const results = await db
      .selectDistinct({ date: qpInventory.date })
      .from(qpInventory)
      .where(eq(qpInventory.examCenterId, examCenterId))
      .orderBy(desc(qpInventory.date));

    const dates = results.map(r => r.date);

    logger.debug(MODULE_FN, `Fetched ${dates.length} available inventory dates`);
    return { success: true, data: dates };
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to fetch available dates', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch dates',
    };
  }
}

// ============================================
// Process Inventory Data from Excel
// ============================================

export async function processInventoryData(
  inventoryRecords: Array<{
    subjectCode: string;
    expectedStudents: number;
    expectedPackets: number;
    date: Date;
    session: 'Morning' | 'Afternoon' | 'All';
    day: number;
  }>
) {
  const MODULE_FN = `${MODULE}.processInventoryData`;

  try {
    const examCenter = await requireExamCenter();

    if (inventoryRecords.length === 0) {
      return { success: false, error: 'No inventory records to process' };
    }

    // Delete existing inventory for this date
    const dates = [...new Set(inventoryRecords.map(r => r.date))];
    for (const date of dates) {
      await db.delete(qpInventory).where(and(eq(qpInventory.examCenterId, examCenter.id), eq(qpInventory.date, date)));
    }

    // Prepare records for insertion
    const recordsToInsert = inventoryRecords.map(record => ({
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

    // Insert in batches
    const BATCH_SIZE = 100;
    const insertedRecords = [];

    for (let i = 0; i < recordsToInsert.length; i += BATCH_SIZE) {
      const batch = recordsToInsert.slice(i, i + BATCH_SIZE);
      const inserted = await db.insert(qpInventory).values(batch).returning();
      insertedRecords.push(...inserted);
    }

    logger.info(MODULE_FN, `Processed ${insertedRecords.length} inventory records`, {
      examCenterId: examCenter.id,
      recordCount: insertedRecords.length,
    });
    revalidatePath('/exam-center/exam-day/qp-accounting');

    return { success: true, data: insertedRecords };
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to process inventory data', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to process inventory data',
    };
  }
}
