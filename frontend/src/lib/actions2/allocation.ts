// lib/actions/allocation.ts
'use server';

import { revalidatePath } from 'next/cache';

import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/lib/db';
import {
  blockAllocations,
  blocks,
  connectedInstitutes,
  qpInventory,
  staff,
  students,
  subjects,
  timetable,
} from '@/lib/db/schema';
import { orders as ordersTable } from '@/lib/db/schema';
import { logger } from '@/lib/misc/logger';
import { getExamCenterId, requireExamCenter } from '@/lib/session';
import { PackingSlipEntry, SupervisionReportEntry } from '@/lib/types';

const MODULE = 'allocation';

// ============================================
// Validation Schemas
// ============================================

const CreateAllocationSchema = z.object({
  date: z.date(),
  session: z.enum(['Morning', 'Afternoon', 'All']),
  timeslot: z.string().optional().nullable(),
  blockId: z.string().min(1),
  blockNo: z.string(),
  location: z.string(),
  scheme: z.string(),
  subjectCode: z.string(),
  subjectName: z.string(),
  seatNumbers: z.array(z.number()),
  firstSeat: z.number().optional().nullable(),
  lastSeat: z.number().optional().nullable(),
  assignedCount: z.number().optional().nullable(),
  strength: z.number().optional().nullable(),
  supervisorUid: z.string().optional().nullable(),
  supervisorName: z.string().optional().nullable(),
});

const UpdateAllocationSchema = z.object({
  id: z.string().min(1),
  supervisorUid: z.string().optional().nullable(),
  supervisorName: z.string().optional().nullable(),
  seatNumbers: z.array(z.number()).optional(),
  firstSeat: z.number().optional().nullable(),
  lastSeat: z.number().optional().nullable(),
  assignedCount: z.number().optional(),
});

const AssignSupervisorSchema = z.object({
  allocationId: z.string().min(1),
  supervisorUid: z.string(),
  supervisorName: z.string().optional(),
});

const BulkAssignSupervisorsSchema = z.object({
  date: z.date(),
  session: z.enum(['Morning', 'Afternoon', 'All']),
  assignments: z.array(
    z.object({
      blockNo: z.string(),
      supervisorUid: z.string(),
    }),
  ),
});

const AutoAllocateSchema = z.object({
  date: z.date(),
  session: z.enum(['Morning', 'Afternoon', 'All']),
});

const ClearAllocationsSchema = z.object({
  date: z.date().optional(),
  session: z.string().optional(),
});

// ============================================
// Read Operations
// ============================================

export async function getAllocations(params?: {
  date?: Date;
  session?: string;
  blockId?: string;
  subjectCode?: string;
  supervisorUid?: string;
}) {
  const MODULE_FN = `${MODULE}.getAllocations`;

  try {
    const examCenterId = await getExamCenterId();

    if (!examCenterId) {
      logger.debug(MODULE_FN, 'No exam center found');
      return { success: true, data: [] };
    }

    const conditions = [eq(blockAllocations.examCenterId, examCenterId)];

    if (params?.date) {
      conditions.push(eq(blockAllocations.date, params.date));
    }
    if (params?.session) {
      conditions.push(eq(blockAllocations.session, params.session));
    }
    if (params?.blockId) {
      conditions.push(eq(blockAllocations.blockId, params.blockId));
    }
    if (params?.subjectCode) {
      conditions.push(eq(blockAllocations.subjectCode, params.subjectCode));
    }
    if (params?.supervisorUid) {
      conditions.push(eq(blockAllocations.supervisorUid, params.supervisorUid));
    }

    const allocations = await db.query.blockAllocations.findMany({
      where: and(...conditions),
      orderBy: [
        asc(blockAllocations.date),
        asc(blockAllocations.session),
        asc(blockAllocations.blockNo),
      ],
    });

    logger.debug(MODULE_FN, `Fetched ${allocations.length} allocations`, { params });
    return { success: true, data: allocations };
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to fetch allocations', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function getAllocationById(id: string) {
  const MODULE_FN = `${MODULE}.getAllocationById`;

  try {
    const examCenterId = await getExamCenterId();

    if (!examCenterId) {
      logger.debug(MODULE_FN, 'No exam center found');
      return { success: true, data: null };
    }

    const allocation = await db.query.blockAllocations.findFirst({
      where: and(eq(blockAllocations.id, id), eq(blockAllocations.examCenterId, examCenterId)),
    });

    if (!allocation) {
      logger.debug(MODULE_FN, 'Allocation not found', { id });
      return { success: true, data: null };
    }

    logger.debug(MODULE_FN, 'Allocation fetched', { id });
    return { success: true, data: allocation };
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to fetch allocation', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function getAllocationsByDate(date: Date, session?: string) {
  return getAllocations({ date, session });
}

export async function getAllocationsBySupervisor(supervisorUid: string) {
  return getAllocations({ supervisorUid });
}

export async function getSupervisorSchedule(
  supervisorUid: string,
  startDate?: Date,
  endDate?: Date,
) {
  const MODULE_FN = `${MODULE}.getSupervisorSchedule`;

  try {
    const examCenterId = await getExamCenterId();

    if (!examCenterId) {
      logger.debug(MODULE_FN, 'No exam center found');
      return { success: true, data: [] };
    }

    const conditions = [
      eq(blockAllocations.examCenterId, examCenterId),
      eq(blockAllocations.supervisorUid, supervisorUid),
    ];

    if (startDate) {
      conditions.push(sql`${blockAllocations.date} >= ${startDate}`);
    }
    if (endDate) {
      conditions.push(sql`${blockAllocations.date} <= ${endDate}`);
    }

    const allocations = await db.query.blockAllocations.findMany({
      where: and(...conditions),
      orderBy: [asc(blockAllocations.date), asc(blockAllocations.session)],
    });

    logger.debug(
      MODULE_FN,
      `Fetched ${allocations.length} allocations for supervisor ${supervisorUid}`,
    );
    return { success: true, data: allocations };
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to fetch supervisor schedule', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================
// Write Operations
// ============================================

export async function createAllocation(data: z.infer<typeof CreateAllocationSchema>) {
  const MODULE_FN = `${MODULE}.createAllocation`;

  try {
    const validated = CreateAllocationSchema.parse(data);
    const examCenter = await requireExamCenter();

    // Check for duplicate allocation
    const existing = await db.query.blockAllocations.findFirst({
      where: and(
        eq(blockAllocations.examCenterId, examCenter.id),
        eq(blockAllocations.date, validated.date),
        eq(blockAllocations.session, validated.session),
        eq(blockAllocations.blockId, validated.blockId),
        eq(blockAllocations.subjectCode, validated.subjectCode),
      ),
    });

    if (existing) {
      logger.warn(MODULE_FN, 'Duplicate allocation detected', {
        date: validated.date,
        session: validated.session,
        blockId: validated.blockId,
        subjectCode: validated.subjectCode,
      });
      return {
        success: false,
        error: 'Allocation already exists for this block, date, session, and subject',
      };
    }

    const [created] = await db
      .insert(blockAllocations)
      .values({
        examCenterId: examCenter.id,
        ...validated,
      })
      .returning();

    logger.info(MODULE_FN, 'Allocation created', {
      id: created.id,
      date: created.date,
      session: created.session,
      blockNo: created.blockNo,
    });
    revalidatePath('/exam-center/block-allocation');

    return { success: true, data: created };
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn(MODULE_FN, 'Validation failed', { errors: error.issues });
      return { success: false, error: error.issues };
    }

    logger.error(MODULE_FN, 'Failed to create allocation', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create allocation',
    };
  }
}

export async function updateAllocation(data: z.infer<typeof UpdateAllocationSchema>) {
  const MODULE_FN = `${MODULE}.updateAllocation`;

  try {
    const validated = UpdateAllocationSchema.parse(data);
    const examCenter = await requireExamCenter();
    const { id, ...updates } = validated;

    const [updated] = await db
      .update(blockAllocations)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(blockAllocations.id, id), eq(blockAllocations.examCenterId, examCenter.id)))
      .returning();

    if (!updated) {
      logger.warn(MODULE_FN, 'Allocation not found', { id });
      return { success: false, error: 'Allocation not found' };
    }

    logger.info(MODULE_FN, 'Allocation updated', { id });
    revalidatePath('/exam-center/block-allocation');

    return { success: true, data: updated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn(MODULE_FN, 'Validation failed', { errors: error.issues });
      return { success: false, error: error.issues };
    }

    logger.error(MODULE_FN, 'Failed to update allocation', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update allocation',
    };
  }
}

export async function deleteAllocation(id: string) {
  const MODULE_FN = `${MODULE}.deleteAllocation`;

  try {
    const examCenter = await requireExamCenter();

    const [deleted] = await db
      .delete(blockAllocations)
      .where(and(eq(blockAllocations.id, id), eq(blockAllocations.examCenterId, examCenter.id)))
      .returning();

    if (!deleted) {
      logger.warn(MODULE_FN, 'Allocation not found', { id });
      return { success: false, error: 'Allocation not found' };
    }

    logger.info(MODULE_FN, 'Allocation deleted', { id });
    revalidatePath('/exam-center/block-allocation');

    return { success: true, data: deleted };
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to delete allocation', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete allocation',
    };
  }
}

export async function clearAllAllocations(data: z.infer<typeof ClearAllocationsSchema>) {
  const MODULE_FN = `${MODULE}.clearAllAllocations`;

  try {
    const validated = ClearAllocationsSchema.parse(data);
    const examCenter = await requireExamCenter();

    const conditions = [eq(blockAllocations.examCenterId, examCenter.id)];

    if (validated.date) {
      conditions.push(eq(blockAllocations.date, validated.date));
    }
    if (validated.session) {
      conditions.push(eq(blockAllocations.session, validated.session));
    }

    const deleted = await db
      .delete(blockAllocations)
      .where(and(...conditions))
      .returning();

    logger.warn(MODULE_FN, 'Cleared allocations', {
      examCenterId: examCenter.id,
      date: validated.date,
      session: validated.session,
      count: deleted.length,
    });
    revalidatePath('/exam-center/block-allocation');

    return { success: true, data: deleted };
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn(MODULE_FN, 'Validation failed', { errors: error.issues });
      return { success: false, error: error.issues };
    }

    logger.error(MODULE_FN, 'Failed to clear allocations', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to clear allocations',
    };
  }
}

// ============================================
// Supervisor Assignment Operations
// ============================================

export async function assignSupervisorToAllocation(data: z.infer<typeof AssignSupervisorSchema>) {
  const MODULE_FN = `${MODULE}.assignSupervisorToAllocation`;

  try {
    const validated = AssignSupervisorSchema.parse(data);
    const examCenter = await requireExamCenter();

    // Get supervisor name if not provided
    let supervisorName = validated.supervisorName;
    if (!supervisorName) {
      const supervisor = await db.query.staff.findFirst({
        where: and(
          eq(staff.examCenterId, examCenter.id),
          eq(staff.uid, validated.supervisorUid),
          eq(staff.staffType, 'SUPERVISOR'),
          eq(staff.isDeleted, false),
        ),
      });

      if (!supervisor) {
        logger.warn(MODULE_FN, 'Supervisor not found', { uid: validated.supervisorUid });
        return { success: false, error: 'Supervisor not found' };
      }
      supervisorName = supervisor.name;
    }

    const [updated] = await db
      .update(blockAllocations)
      .set({
        supervisorUid: validated.supervisorUid,
        supervisorName: supervisorName,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(blockAllocations.id, validated.allocationId),
          eq(blockAllocations.examCenterId, examCenter.id),
        ),
      )
      .returning();

    if (!updated) {
      logger.warn(MODULE_FN, 'Allocation not found', { id: validated.allocationId });
      return { success: false, error: 'Allocation not found' };
    }

    logger.info(MODULE_FN, 'Supervisor assigned to allocation', {
      allocationId: validated.allocationId,
      supervisorUid: validated.supervisorUid,
    });
    revalidatePath('/exam-center/block-allocation');

    return { success: true, data: updated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn(MODULE_FN, 'Validation failed', { errors: error.issues });
      return { success: false, error: error.issues };
    }

    logger.error(MODULE_FN, 'Failed to assign supervisor', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to assign supervisor',
    };
  }
}

export async function bulkAssignSupervisors(data: z.infer<typeof BulkAssignSupervisorsSchema>) {
  const MODULE_FN = `${MODULE}.bulkAssignSupervisors`;

  try {
    const validated = BulkAssignSupervisorsSchema.parse(data);
    const examCenter = await requireExamCenter();

    // Start transaction
    const results = await db.transaction(async (tx) => {
      const updates = [];

      for (const assignment of validated.assignments) {
        // Get supervisor name
        const supervisor = await tx.query.staff.findFirst({
          where: and(
            eq(staff.examCenterId, examCenter.id),
            eq(staff.uid, assignment.supervisorUid),
            eq(staff.staffType, 'SUPERVISOR'),
            eq(staff.isDeleted, false),
          ),
        });

        if (!supervisor) {
          throw new Error(`Supervisor with UID ${assignment.supervisorUid} not found`);
        }

        // Update all allocations for this block on the given date/session
        const [updated] = await tx
          .update(blockAllocations)
          .set({
            supervisorUid: assignment.supervisorUid,
            supervisorName: supervisor.name,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(blockAllocations.examCenterId, examCenter.id),
              eq(blockAllocations.date, validated.date),
              eq(blockAllocations.session, validated.session),
              eq(blockAllocations.blockNo, assignment.blockNo),
            ),
          )
          .returning();

        if (updated) {
          updates.push(updated);
        }
      }

      return updates;
    });

    logger.info(MODULE_FN, 'Bulk assigned supervisors', {
      examCenterId: examCenter.id,
      date: validated.date,
      session: validated.session,
      count: results.length,
    });
    revalidatePath('/exam-center/block-allocation');

    return { success: true, data: results };
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn(MODULE_FN, 'Validation failed', { errors: error.issues });
      return { success: false, error: error.issues };
    }

    logger.error(MODULE_FN, 'Failed to bulk assign supervisors', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to assign supervisors',
    };
  }
}

// ============================================
// Auto Allocation Operations
// ============================================

export async function autoAllocateStudents(data: z.infer<typeof AutoAllocateSchema>) {
  const MODULE_FN = `${MODULE}.autoAllocateStudents`;

  try {
    const validated = AutoAllocateSchema.parse(data);
    const examCenter = await requireExamCenter();

    // Get timetable for the date and session
    const timetableEntries = await db.query.timetable.findMany({
      where: and(
        eq(timetable.examCenterId, examCenter.id),
        eq(timetable.date, validated.date),
        eq(timetable.session, validated.session),
      ),
      orderBy: [timetable.timeSlot],
    });

    if (timetableEntries.length === 0) {
      logger.warn(MODULE_FN, 'No timetable entries found', {
        date: validated.date,
        session: validated.session,
      });
      return {
        success: false,
        error: 'No timetable entries found for the specified date and session',
      };
    }

    // Get all available blocks
    const availableBlocks = await db.query.blocks.findMany({
      where: and(eq(blocks.examCenterId, examCenter.id), eq(blocks.isDeleted, false)),
      orderBy: [asc(blocks.blockNo)],
    });

    if (availableBlocks.length === 0) {
      logger.warn(MODULE_FN, 'No blocks configured');
      return { success: false, error: 'No blocks configured' };
    }

    // Get students for each subject
    const allocations = [];
    let blockIndex = 0;

    for (const entry of timetableEntries) {
      // FIX: Correct JSONB contains operator syntax
      // Use @> with proper JSONB array format
      const studentsList = await db.query.students.findMany({
        where: and(
          eq(students.examCenterId, examCenter.id),
          // Fix 1: Use proper JSONB contains operator
          sql`${students.subCodes} @> ${JSON.stringify([entry.subjectCode])}::jsonb`,
          // Fix 2: Also check for exact match if needed
          sql`NOT (${students.subCodes} = '[""]'::jsonb)`,
          eq(students.isDeleted, false),
        ),
        orderBy: [asc(students.seatNumber)],
      });

      const studentSeats = studentsList.map((s) => s.seatNumber);

      if (studentSeats.length === 0) {
        logger.warn(MODULE_FN, 'No students found for subject', {
          subjectCode: entry.subjectCode,
          scheme: entry.scheme,
        });
        continue;
      }

      // Distribute students across blocks
      let currentBlock = availableBlocks[blockIndex % availableBlocks.length];
      let currentSeats: number[] = [];
      let currentCount = 0;

      for (const seat of studentSeats) {
        if (currentCount >= currentBlock.strength) {
          // Save current block allocation
          if (currentSeats.length > 0) {
            allocations.push({
              examCenterId: examCenter.id,
              date: validated.date,
              session: validated.session,
              timeslot: entry.timeSlot,
              blockId: currentBlock.id,
              blockNo: currentBlock.blockNo,
              location: currentBlock.location,
              scheme: entry.scheme,
              subjectCode: entry.subjectCode,
              subjectName: entry.subjectName,
              seatNumbers: [...currentSeats],
              firstSeat: Math.min(...currentSeats),
              lastSeat: Math.max(...currentSeats),
              assignedCount: currentSeats.length,
              strength: currentBlock.strength,
            });
          }

          // Move to next block
          blockIndex++;
          currentBlock = availableBlocks[blockIndex % availableBlocks.length];
          currentSeats = [];
          currentCount = 0;
        }

        currentSeats.push(seat);
        currentCount++;
      }

      // Save last block allocation
      if (currentSeats.length > 0) {
        allocations.push({
          examCenterId: examCenter.id,
          date: validated.date,
          session: validated.session,
          timeslot: entry.timeSlot,
          blockId: currentBlock.id,
          blockNo: currentBlock.blockNo,
          location: currentBlock.location,
          scheme: entry.scheme,
          subjectCode: entry.subjectCode,
          subjectName: entry.subjectName,
          seatNumbers: [...currentSeats],
          firstSeat: Math.min(...currentSeats),
          lastSeat: Math.max(...currentSeats),
          assignedCount: currentSeats.length,
          strength: currentBlock.strength,
        });
      }

      blockIndex++;
    }

    // Delete existing allocations for this date/session
    await db
      .delete(blockAllocations)
      .where(
        and(
          eq(blockAllocations.examCenterId, examCenter.id),
          eq(blockAllocations.date, validated.date),
          eq(blockAllocations.session, validated.session),
        ),
      );

    // Insert new allocations
    let insertedAllocations: (typeof blockAllocations.$inferSelect)[] = [];
    if (allocations.length > 0) {
      insertedAllocations = await db.insert(blockAllocations).values(allocations).returning();
    }

    logger.info(MODULE_FN, 'Auto-allocated students', {
      examCenterId: examCenter.id,
      date: validated.date,
      session: validated.session,
      allocationCount: insertedAllocations.length,
      studentCount: allocations.reduce((sum, a) => sum + a.seatNumbers.length, 0),
    });
    revalidatePath('/exam-center/block-allocation');

    return { success: true, data: insertedAllocations };
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn(MODULE_FN, 'Validation failed', { errors: error.issues });
      return { success: false, error: error.issues };
    }

    logger.error(MODULE_FN, 'Failed to auto-allocate students', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to auto-allocate students',
    };
  }
}

// ============================================
// Report Generation
// ============================================

// lib/actions/allocation.ts - FIXED getPackingSlip

export async function getPackingSlip(date: Date, session: string) {
  const MODULE_FN = `${MODULE}.getPackingSlip`;

  try {
    const examCenter = await requireExamCenter();

    // Get ALL timetable entries for the date/session (don't filter by subject/scheme)
    const timetableEntries = await db.query.timetable.findMany({
      where: and(
        eq(timetable.examCenterId, examCenter.id),
        eq(timetable.date, date),
        eq(timetable.session, session),
      ),
      orderBy: [timetable.subjectCode, timetable.scheme],
    });

    if (timetableEntries.length === 0) {
      logger.warn(MODULE_FN, 'No timetable entries found', { date, session });
      return { success: true, data: [] };
    }

    // Get block allocations for this date/session to get institute info
    const allocations = await db.query.blockAllocations.findMany({
      where: and(
        eq(blockAllocations.examCenterId, examCenter.id),
        eq(blockAllocations.date, date),
        eq(blockAllocations.session, session),
      ),
      with: {
        connectedInstitute: {
          columns: {
            instituteCode: true,
            instituteName: true,
          },
        },
      },
    });

    // Create a map of subjectCode+scheme to institute info
    const instituteMap = new Map<string, { instituteCode: string; instituteName: string }>();

    for (const alloc of allocations) {
      const key = `${alloc.subjectCode}_${alloc.scheme}`;
      if (alloc.connectedInstitute) {
        instituteMap.set(key, {
          instituteCode: alloc.connectedInstitute.instituteCode,
          instituteName: alloc.connectedInstitute.instituteName,
        });
      }
    }

    // If no allocations found, try to get institute from connected institutes
    if (instituteMap.size === 0) {
      const connectedInst = await db.query.connectedInstitutes.findFirst({
        where: eq(connectedInstitutes.examCenterId, examCenter.id),
      });

      if (connectedInst) {
        for (const entry of timetableEntries) {
          const key = `${entry.subjectCode}_${entry.scheme}`;
          if (!instituteMap.has(key)) {
            instituteMap.set(key, {
              instituteCode: connectedInst.instituteCode,
              instituteName: connectedInst.instituteName,
            });
          }
        }
      }
    }

    const packingSlip: PackingSlipEntry[] = [];

    // Process EACH timetable entry individually (don't deduplicate)
    for (const entry of timetableEntries) {
      const absentNumbers = entry.absentNumbers || [];
      const cpsNumbers = entry.cpsStudents || [];

      // Get institute info for this subject/scheme
      const key = `${entry.subjectCode}_${entry.scheme}`;
      const instituteInfo = instituteMap.get(key) || {
        instituteCode: examCenter.code || '',
        instituteName: examCenter.name || '',
      };

      // Generate sheet number for each entry
      const sheetNo = `SHEET-${entry.subjectCode}-${entry.scheme}-${entry.id.substring(0, 8)}`;

      packingSlip.push({
        instituteCode: instituteInfo.instituteCode,
        instituteName: instituteInfo.instituteName,
        date: date.toISOString().split('T')[0],
        session: session,
        timeSlot: entry.timeSlot,
        scheme: entry.scheme,
        subjectCode: entry.subjectCode,
        totalStudents: entry.totalStudents || 0,
        sheetNo: sheetNo,
        subjectName: entry.subjectName || entry.subjectCode,
        absentNumbers,
        cpsNumbers,
      });
    }

    logger.info(MODULE_FN, 'Generated packing slip', {
      examCenterId: examCenter.id,
      date,
      session,
      entries: packingSlip.length,
    });

    return { success: true, data: packingSlip };
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to generate packing slip', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate packing slip',
    };
  }
}

export async function getSupervisionReport(date: Date, session: string) {
  const MODULE_FN = `${MODULE}.getSupervisionReport`;

  try {
    const examCenter = await requireExamCenter();

    const allocations = await db.query.blockAllocations.findMany({
      where: and(
        eq(blockAllocations.examCenterId, examCenter.id),
        eq(blockAllocations.date, date),
        eq(blockAllocations.session, session),
      ),
      orderBy: [asc(blockAllocations.blockNo)],
    });

    if (allocations.length === 0) {
      logger.debug(MODULE_FN, 'No allocations found', { date, session });
      return { success: true, data: [] };
    }

    // Group by block and supervisor
    const groupedData = new Map<string, SupervisionReportEntry>();

    for (const allocation of allocations) {
      const key = `${allocation.blockNo}_${allocation.location}_${allocation.supervisorUid}`;

      if (!groupedData.has(key)) {
        groupedData.set(key, {
          blockNo: allocation.blockNo!,
          location: allocation.location!,
          supervisorName: allocation.supervisorName || 'Not Assigned',
          supervisorUid: allocation.supervisorUid || '',
          schemes: [],
        });
      }

      const entry = groupedData.get(key)!;
      entry.schemes.push({
        scheme: allocation.scheme,
        subjectCode: allocation.subjectCode,
        subjectName: allocation.subjectName,
        totalStudents: allocation.assignedCount || 0,
        instituteCode: '', // Would need to join with institutes table
        timeslot: allocation.timeslot || '',
      });
    }

    const report = Array.from(groupedData.values());

    logger.info(MODULE_FN, 'Generated supervision report', {
      examCenterId: examCenter.id,
      date,
      session,
      blocks: report.length,
    });

    return { success: true, data: report };
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to generate supervision report', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate supervision report',
    };
  }
}

export async function getQuestionPaperReport(date: Date, session?: string) {
  const MODULE_FN = `${MODULE}.getQuestionPaperReport`;

  try {
    const examCenter = await requireExamCenter();

    const conditions = [eq(timetable.examCenterId, examCenter.id), eq(timetable.date, date)];

    if (session) {
      conditions.push(eq(timetable.session, session));
    }

    const entries = await db.query.timetable.findMany({
      where: and(...conditions),
      orderBy: [asc(timetable.subjectCode)],
    });

    // TODO: Join with inventory table when available
    const report = entries.map((entry) => ({
      scheme: entry.scheme,
      subjectAbbr: entry.subjectAbbr || '',
      subjectCode: entry.subjectCode,
      receivedQps: 0, // From inventory table
      totalStudents: entry.totalStudents,
      absentNumbers: entry.absentNumbers || [],
      date: entry.date.toISOString().split('T')[0],
      session: entry.session,
    }));

    logger.info(MODULE_FN, 'Generated question paper report', {
      examCenterId: examCenter.id,
      date,
      session: session || 'all',
      entries: report.length,
    });

    return { success: true, data: report };
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to generate question paper report', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate report',
    };
  }
}

// ============================================
// Statistics
// ============================================

export async function getAllocationStats() {
  const MODULE_FN = `${MODULE}.getAllocationStats`;

  try {
    const examCenterId = await getExamCenterId();

    if (!examCenterId) {
      logger.debug(MODULE_FN, 'No exam center found');
      return {
        success: true,
        data: {
          totalAllocations: 0,
          totalSeats: 0,
          allocatedSupervisors: 0,
          unassignedAllocations: 0,
          dates: [],
        },
      };
    }

    const [totalResult, unassignedResult, distinctDates] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)` })
        .from(blockAllocations)
        .where(eq(blockAllocations.examCenterId, examCenterId)),
      db
        .select({ count: sql<number>`count(*)` })
        .from(blockAllocations)
        .where(
          and(
            eq(blockAllocations.examCenterId, examCenterId),
            sql`${blockAllocations.supervisorUid} IS NULL`,
          ),
        ),
      db
        .selectDistinct({ date: blockAllocations.date })
        .from(blockAllocations)
        .where(eq(blockAllocations.examCenterId, examCenterId))
        .orderBy(desc(blockAllocations.date)),
    ]);

    const totalSeatsResult = await db
      .select({ sum: sql<number>`COALESCE(sum(${blockAllocations.assignedCount}), 0)` })
      .from(blockAllocations)
      .where(eq(blockAllocations.examCenterId, examCenterId));

    const stats = {
      totalAllocations: Number(totalResult[0]?.count || 0),
      totalSeats: Number(totalSeatsResult[0]?.sum || 0),
      allocatedSupervisors:
        Number(totalResult[0]?.count || 0) - Number(unassignedResult[0]?.count || 0),
      unassignedAllocations: Number(unassignedResult[0]?.count || 0),
      dates: distinctDates.map((d) => d.date),
    };

    logger.debug(MODULE_FN, 'Allocation stats fetched', stats);
    return { success: true, data: stats };
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to fetch allocation stats', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function hasAllocations(date?: Date, session?: string) {
  const MODULE_FN = `${MODULE}.hasAllocations`;

  try {
    const examCenterId = await getExamCenterId();

    if (!examCenterId) {
      return { success: true, data: false };
    }

    const conditions = [eq(blockAllocations.examCenterId, examCenterId)];

    if (date) {
      conditions.push(eq(blockAllocations.date, date));
    }
    if (session) {
      conditions.push(eq(blockAllocations.session, session));
    }

    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(blockAllocations)
      .where(and(...conditions));

    const hasData = Number(result[0]?.count || 0) > 0;

    logger.debug(MODULE_FN, `Has allocations: ${hasData}`);
    return { success: true, data: hasData };
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to check allocations', { error });
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
// ============================================
// Block Configuration Management (from blocks/route.ts)
// ============================================

const CreateBlockConfigSchema = z.object({
  date: z.date(),
  session: z.enum(['Morning', 'Afternoon', 'All']),
  blocks: z.array(
    z.object({
      blockName: z.string().min(1),
      scheme: z.string().min(1),
      subCode: z.string().min(1),
      supervisor: z.string().min(1),

      numberOfCandidates: z.number().int().positive(),
      startFrom: z.number().int().positive(),

      timeslot: z.string(),
    }),
  ),
});

// Fix in createBlockConfiguration function

export async function createBlockConfiguration(data: z.infer<typeof CreateBlockConfigSchema>) {
  const MODULE_FN = `${MODULE}.createBlockConfiguration`;

  try {
    const validated = CreateBlockConfigSchema.parse(data);
    const examCenter = await requireExamCenter();

    const results = await db.transaction(async (tx) => {
      // Delete existing configurations for this date/session
      await tx
        .delete(blockAllocations)
        .where(
          and(
            eq(blockAllocations.examCenterId, examCenter.id),
            eq(blockAllocations.date, validated.date),
            eq(blockAllocations.session, validated.session),
          ),
        );

      const allocations = [];
      let currentBlockNo = 1;
      const blockNumberMap: Record<string, number> = {};

      for (const block of validated.blocks) {
        // Get or assign block number
        if (!(block.blockName in blockNumberMap)) {
          blockNumberMap[block.blockName] = currentBlockNo;
          currentBlockNo++;
        }

        // FIX: Correct JSONB query syntax
        const studentsList = await tx.query.students.findMany({
          where: and(
            eq(students.examCenterId, examCenter.id),
            // Fix: Use proper JSONB contains operator
            sql`${students.subCodes} @> ${JSON.stringify([block.subCode])}::jsonb`,
            eq(students.scheme, block.scheme),
            eq(students.isDeleted, false),
          ),
          orderBy: [asc(students.seatNumber)],
          limit: block.numberOfCandidates,
          offset: block.startFrom - 1,
        });

        const seatNumbers = studentsList.map((s) => s.seatNumber);
        const firstSeat = seatNumbers.length ? seatNumbers[0] : null;
        const lastSeat = seatNumbers.length ? seatNumbers[seatNumbers.length - 1] : null;

        // Get block strength
        const blockData = await tx.query.blocks.findFirst({
          where: and(eq(blocks.examCenterId, examCenter.id), eq(blocks.location, block.blockName)),
        });

        allocations.push({
          examCenterId: examCenter.id,
          date: validated.date,
          session: validated.session,
          timeslot: block.timeslot,
          blockNo: String(blockNumberMap[block.blockName]),
          location: block.blockName,
          scheme: block.scheme,
          subjectCode: block.subCode,
          subjectName: '', // Would need to fetch from subjects table
          seatNumbers,
          firstSeat,
          lastSeat,
          assignedCount: seatNumbers.length,
          strength: blockData?.strength || 0,
          supervisorUid: block.supervisor,
          supervisorName: '', // Would need to fetch from staff table
        });
      }

      if (allocations.length > 0) {
        return await tx
          .insert(blockAllocations)
          .values(allocations as any)
          .returning();
      }
      return [];
    });

    logger.info(MODULE_FN, 'Block configuration created', {
      examCenterId: examCenter.id,
      date: validated.date,
      session: validated.session,
      blockCount: results.length,
    });
    revalidatePath('/exam-center/block-allocation');

    return { success: true, data: results };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create block configuration',
    };
  }
}
// Add to lib/actions/allocation.ts

export async function clearAllocationsForSession(date: Date, session: string) {
  const MODULE_FN = `${MODULE}.clearAllocationsForSession`;

  try {
    const examCenter = await requireExamCenter();

    const deleted = await db
      .delete(blockAllocations)
      .where(
        and(
          eq(blockAllocations.examCenterId, examCenter.id),
          eq(blockAllocations.date, date),
          eq(blockAllocations.session, session),
        ),
      )
      .returning();

    logger.info(MODULE_FN, 'Cleared allocations for session', {
      examCenterId: examCenter.id,
      date,
      session,
      count: deleted.length,
    });
    revalidatePath('/exam-center/block-allocation');

    return { success: true, data: deleted };
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to clear allocations', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to clear allocations',
    };
  }
}

export async function bulkCreateBlockConfigurations(data: {
  date: Date;
  session: 'Morning' | 'Afternoon' | 'All';
  allocations: Array<{
    blockName: string;
    scheme: string;
    subCode: string;
    supervisor: string;
    numberOfCandidates: number;
    startFrom: number;
    timeslot: string;
  }>;
}): Promise<{
  success: boolean;
  data?: any[];
  error?: string;
  existingCount?: number;
  existingAllocations?: Array<{
    blockName: string | null;
    scheme: string;
    subjectCode: string;
    supervisorName: string | null;
    assignedCount: number | null;
  }>;
}> {
  const MODULE_FN = `${MODULE}.bulkCreateBlockConfigurations`;

  // Helper to sanitize scheme (remove non-alphanumeric chars)
  const sanitizeScheme = (scheme: string): string => {
    if (!scheme) return '';
    return scheme.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  };

  try {
    const examCenter = await requireExamCenter();

    // Check for existing allocations first
    const existingAllocations = await db.query.blockAllocations.findMany({
      where: and(
        eq(blockAllocations.examCenterId, examCenter.id),
        eq(blockAllocations.date, data.date),
        eq(blockAllocations.session, data.session),
      ),
    });

    if (existingAllocations.length > 0) {
      return {
        success: false,
        error: `Existing allocations found for ${data.date.toLocaleDateString()} - ${data.session}. Please clear existing allocations before creating new ones.`,
        existingCount: existingAllocations.length,
        existingAllocations: existingAllocations.map((a) => ({
          blockName: a.location,
          scheme: a.scheme,
          subjectCode: a.subjectCode,
          supervisorName: a.supervisorName,
          assignedCount: a.assignedCount,
        })),
      };
    }

    const results = await db.transaction(async (tx) => {
      const allocations = [];
      let currentBlockNo = 1;
      const blockNumberMap: Record<string, number> = {};

      for (const alloc of data.allocations) {
        if (!(alloc.blockName in blockNumberMap)) {
          blockNumberMap[alloc.blockName] = currentBlockNo;
          currentBlockNo++;
        }

        // Sanitize scheme for matching
        const sanitizedScheme = sanitizeScheme(alloc.scheme);

        // Get students for this allocation - match using sanitized scheme
        const studentsList = await tx.query.students.findMany({
          where: and(
            eq(students.examCenterId, examCenter.id),
            sql`${students.subCodes}::jsonb @> ${JSON.stringify([alloc.subCode])}::jsonb`,
            sql`REPLACE(${students.scheme}, '-', '') = ${sanitizedScheme}`,
            eq(students.isDeleted, false),
          ),
          orderBy: [asc(students.seatNumber)],
          limit: alloc.numberOfCandidates,
          offset: alloc.startFrom - 1,
        });

        const seatNumbers = studentsList.map((s) => s.seatNumber);
        const firstSeat = seatNumbers.length ? seatNumbers[0] : null;
        const lastSeat = seatNumbers.length ? seatNumbers[seatNumbers.length - 1] : null;

        // Get the connectedInstituteId from the first student
        const connectedInstituteId =
          studentsList.length > 0 ? studentsList[0].connectedInstituteId : null;

        const blockData = await tx.query.blocks.findFirst({
          where: and(eq(blocks.examCenterId, examCenter.id), eq(blocks.location, alloc.blockName)),
        });

        // Get supervisor name
        const supervisor = await tx.query.staff.findFirst({
          where: and(
            eq(staff.examCenterId, examCenter.id),
            eq(staff.uid, alloc.supervisor),
            eq(staff.staffType, 'SUPERVISOR'),
            eq(staff.isDeleted, false),
          ),
        });

        // Get subject name - also sanitize scheme for matching
        const subject = await tx.query.subjects.findFirst({
          where: and(
            eq(subjects.code, alloc.subCode),
            sql`REPLACE(${subjects.scheme}, '-', '') = ${sanitizedScheme}`,
          ),
        });

        allocations.push({
          examCenterId: examCenter.id,
          connectedInstituteId: connectedInstituteId,
          date: data.date,
          session: data.session,
          timeslot: alloc.timeslot,
          blockNo: String(blockNumberMap[alloc.blockName]),
          location: alloc.blockName,
          scheme: alloc.scheme, // Keep original scheme format for display
          subjectCode: alloc.subCode,
          subjectName: subject?.name || '',
          seatNumbers,
          firstSeat,
          lastSeat,
          assignedCount: seatNumbers.length,
          strength: blockData?.strength || 0,
          supervisorUid: alloc.supervisor,
          supervisorName: supervisor?.name || '',
        });
      }

      if (allocations.length > 0) {
        return await tx.insert(blockAllocations).values(allocations).returning();
      }
      return [];
    });

    logger.info(MODULE_FN, 'Bulk block configurations created', {
      examCenterId: examCenter.id,
      date: data.date,
      session: data.session,
      allocationCount: results.length,
    });
    revalidatePath('/exam-center/block-allocation');

    return { success: true, data: results };
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to create block configurations', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create block configurations',
    };
  }
}

export async function getUniqueDates(): Promise<{
  success: boolean;
  data: Date[];
  error?: string;
}> {
  const MODULE_FN = `${MODULE}.getUniqueDates`;

  try {
    const examCenterId = await getExamCenterId();

    if (!examCenterId) {
      return { success: true, data: [] };
    }

    const results = await db
      .selectDistinct({ date: timetable.date })
      .from(timetable)
      .where(eq(timetable.examCenterId, examCenterId))
      .orderBy(timetable.date);

    const dates = results.map((r) => r.date);

    return { success: true, data: dates };
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to fetch unique dates', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      data: [],
    };
  }
}

export async function getUniqueSessions(): Promise<{
  success: boolean;
  data: string[];
  error?: string;
}> {
  const MODULE_FN = `${MODULE}.getUniqueSessions`;

  try {
    const examCenterId = await getExamCenterId();

    if (!examCenterId) {
      return { success: true, data: [] };
    }

    const results = await db
      .selectDistinct({ session: timetable.session })
      .from(timetable)
      .where(eq(timetable.examCenterId, examCenterId));

    const sessions = results.map((r) => r.session);

    return { success: true, data: sessions };
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to fetch unique sessions', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      data: [],
    };
  }
}
// ============================================
// Reliever Order Management (from rel-order/route.ts)
// ============================================

export interface RelieverOrderData {
  id: string;
  date: Date;
  session: string;
  relieverId: string;
  relieverUid: string;
}

const CreateRelieverOrderSchema = z.object({
  date: z.date(),
  session: z.enum(['Morning', 'Afternoon', 'All']),
  relieverIds: z.array(z.string()),
  relieverUids: z.array(z.string()),
});

export async function createRelieverOrders(data: z.infer<typeof CreateRelieverOrderSchema>) {
  const MODULE_FN = `${MODULE}.createRelieverOrders`;

  try {
    const validated = CreateRelieverOrderSchema.parse(data);
    const examCenter = await requireExamCenter();

    if (validated.relieverIds.length !== validated.relieverUids.length) {
      return { success: false, error: 'Reliever IDs and UIDs length mismatch' };
    }

    const createdOrders = await db.transaction(async (tx) => {
      // Delete existing orders - use the schema import, not local variable
      await tx.delete(ordersTable).where(
        // Rename import to ordersTable
        and(
          eq(ordersTable.examCenterId, examCenter.id),
          eq(ordersTable.date, validated.date),
          eq(ordersTable.session, validated.session),
          eq(ordersTable.orderType, 'reliever'),
        ),
      );

      const newOrders = [];
      for (let i = 0; i < validated.relieverIds.length; i++) {
        const [order] = await tx
          .insert(ordersTable)
          .values({
            examCenterId: examCenter.id,
            staffId: validated.relieverIds[i],
            orderType: 'reliever',
            date: validated.date,
            session: validated.session,
            orderKey: `REL-${validated.date.toISOString().split('T')[0]}-${validated.session}-${i}`,
          })
          .returning();
        newOrders.push(order);
      }
      return newOrders;
    });

    logger.info(MODULE_FN, 'Reliever orders created', {
      examCenterId: examCenter.id,
      date: validated.date,
      session: validated.session,
      count: createdOrders.length,
    });
    revalidatePath('/exam-center/automation/orders');

    return { success: true, data: createdOrders };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create reliever orders',
    };
  }
}

// ============================================
// Supervision Report (Enhanced from supervision/route.ts)
// ============================================

export async function getSupervisionReportV2(date: Date, session: string) {
  const MODULE_FN = `${MODULE}.getSupervisionReportV2`;

  try {
    const examCenter = await requireExamCenter();

    const allocations = await db.query.blockAllocations.findMany({
      where: and(
        eq(blockAllocations.examCenterId, examCenter.id),
        eq(blockAllocations.date, date),
        eq(blockAllocations.session, session),
      ),
      orderBy: [asc(blockAllocations.blockNo)],
    });

    if (allocations.length === 0) {
      return { success: true, data: [] };
    }

    // Group by date and session (V1 style grouping)
    const groupedData: Record<
      string,
      {
        date: string;
        session: string;
        supervisionRecords: SupervisionReportEntry[];
      }
    > = {};

    for (const allocation of allocations) {
      const dateKey = allocation.date.toISOString().split('T')[0];
      const mainKey = `${dateKey}_${allocation.session}`;

      if (!groupedData[mainKey]) {
        groupedData[mainKey] = {
          date: allocation.date.toLocaleDateString('en-IN'),
          session: allocation.session,
          supervisionRecords: [],
        };
      }

      // Find existing block-supervisor pair
      let record = groupedData[mainKey].supervisionRecords.find(
        (r) =>
          r.blockNo === allocation.blockNo &&
          r.location === allocation.location &&
          r.supervisorName === allocation.supervisorName,
      );

      if (!record) {
        record = {
          blockNo: allocation.blockNo!,
          location: allocation.location!,
          supervisorName: allocation.supervisorName || 'Not Assigned',
          supervisorUid: allocation.supervisorUid || '',
          schemes: [],
        };
        groupedData[mainKey].supervisionRecords.push(record);
      }

      // Add scheme data
      record.schemes.push({
        scheme: allocation.scheme,
        subjectCode: allocation.subjectCode,
        subjectName: allocation.subjectName,
        totalStudents: allocation.assignedCount || 0,
        instituteCode: '', // Would need to join with institutes
        timeslot: allocation.timeslot || '',
      });
    }

    const result = Object.values(groupedData);

    logger.info(MODULE_FN, 'Generated supervision report V2', {
      examCenterId: examCenter.id,
      date,
      session,
      sessions: result.length,
    });

    return { success: true, data: result };
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to generate supervision report V2', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate supervision report',
    };
  }
}

// ============================================
// Reliever Assignment (Group blocks by reliever)
// ============================================

export async function getRelieverAssignments(
  date: Date,
  session: string,
  blocksPerReliever: number = 3,
) {
  const MODULE_FN = `${MODULE}.getRelieverAssignments`;

  try {
    const examCenter = await requireExamCenter();

    // Get blocks with supervisors
    const allocations = await db.query.blockAllocations.findMany({
      where: and(
        eq(blockAllocations.examCenterId, examCenter.id),
        eq(blockAllocations.date, date),
        eq(blockAllocations.session, session),
        sql`${blockAllocations.supervisorUid} IS NOT NULL`,
      ),
      orderBy: [asc(blockAllocations.blockNo)],
    });

    if (allocations.length === 0) {
      return { success: true, data: [] };
    }

    // Get relievers assigned for this date/session
    const relieverOrders = await db.query.orders.findMany({
      where: and(
        eq(ordersTable.examCenterId, examCenter.id),
        eq(ordersTable.date, date),
        eq(ordersTable.session, session),
        eq(ordersTable.orderType, 'reliever'),
      ),
      with: {
        staff: true,
      },
    });

    // Group blocks into sets
    const blockGroups: (typeof allocations)[] = [];
    for (let i = 0; i < allocations.length; i += blocksPerReliever) {
      blockGroups.push(allocations.slice(i, i + blocksPerReliever));
    }

    const transformedData = relieverOrders
      .map((relieverOrder, index) => {
        const assignedBlocks = blockGroups[index] || [];
        // Type assertion for staff
        const staffMember = relieverOrder.staff as { name: string; department: string };

        return {
          name: staffMember?.name ?? 'Unknown',
          department: staffMember?.department ?? 'Unknown',
          blocks: assignedBlocks.map((block) => ({
            blockNo: block.blockNo ?? String(index),
            location: block.location ?? 'Unknown',
            supervisor: block.supervisorName,
            timeslot: block.timeslot,
          })),
        };
      })
      .filter((item) => item.blocks.length > 0);

    logger.info(MODULE_FN, 'Generated reliever assignments', {
      examCenterId: examCenter.id,
      date,
      session,
      relieverCount: transformedData.length,
    });

    return { success: true, data: transformedData };
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to get reliever assignments', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get reliever assignments',
    };
  }
}

// ============================================
// Question Paper Accountability Report (from qp-acc-rep/route.ts)
// ============================================

export async function getQuestionPaperReportV2(date: Date, session?: string) {
  const MODULE_FN = `${MODULE}.getQuestionPaperReportV2`;

  try {
    const examCenter = await requireExamCenter();

    const conditions = [eq(timetable.examCenterId, examCenter.id), eq(timetable.date, date)];

    if (session) {
      conditions.push(eq(timetable.session, session));
    }

    const entries = await db.query.timetable.findMany({
      where: and(...conditions),
      orderBy: [asc(timetable.subjectCode)],
    });

    // Join with qpInventory table
    const results = [];
    for (const entry of entries) {
      const inventory = await db.query.qpInventory.findFirst({
        where: and(
          eq(qpInventory.examCenterId, examCenter.id),
          eq(qpInventory.date, date),
          eq(qpInventory.subjectCode, entry.subjectCode),
        ),
      });

      results.push({
        scheme: entry.scheme,
        subjectAbbr: entry.subjectAbbr || '',
        subjectCode: entry.subjectCode,
        receivedQps: inventory?.receivedQps || 0,
        totalStudents: entry.totalStudents,
        absentNumbers: entry.absentNumbers || [],
        date: entry.date.toISOString().split('T')[0],
        session: entry.session,
      });
    }

    logger.info(MODULE_FN, 'Generated QP report V2', {
      examCenterId: examCenter.id,
      date,
      session: session || 'all',
      entries: results.length,
    });

    return { success: true, data: results };
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to generate QP report V2', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate QP report',
    };
  }
}
// Add to lib/actions/allocation.ts

// ============================================
// Get Allocations By Date and Session
// ============================================

// lib/actions/allocation.ts - Update getAllocationsByDateSession

export async function getAllocationsByDateSession(
  date: Date,
  session: string,
): Promise<{
  success: boolean;
  data?: any[];
  error?: string;
}> {
  const MODULE_FN = `${MODULE}.getAllocationsByDateSession`;

  try {
    const examCenterId = await getExamCenterId();

    if (!examCenterId) {
      logger.debug(MODULE_FN, 'No exam center found');
      return { success: true, data: [] };
    }

    const allocations = await db.query.blockAllocations.findMany({
      where: and(
        eq(blockAllocations.examCenterId, examCenterId),
        eq(blockAllocations.date, date),
        eq(blockAllocations.session, session),
      ),
      with: {
        connectedInstitute: {
          columns: {
            instituteCode: true,
            instituteName: true,
          },
        },
      },
      orderBy: [asc(blockAllocations.blockNo)],
    });

    // Map the results to include institute fields at the top level
    const transformedAllocations = allocations.map((alloc) => {
      const { connectedInstitute, ...rest } = alloc;
      return {
        ...rest,
        instituteCode: connectedInstitute?.instituteCode ?? '',
        instituteName: connectedInstitute?.instituteName ?? '',
      };
    });

    // Fetch timetable entries for this date/session to get absent numbers
    const timetableEntries = await db.query.timetable.findMany({
      where: and(
        eq(timetable.examCenterId, examCenterId),
        eq(timetable.date, date),
        eq(timetable.session, session),
      ),
    });

    // Create a map of subjectCode+scheme to absentNumbers and cpsStudents
    const timetableMap = new Map<string, { absentNumbers: number[]; cpsStudents: number[] }>();
    timetableEntries.forEach((entry) => {
      const key = `${entry.subjectCode}_${entry.scheme}`;
      timetableMap.set(key, {
        absentNumbers: entry.absentNumbers || [],
        cpsStudents: entry.cpsStudents || [],
      });
    });

    // Merge absent/cps data into allocations
    const mergedAllocations = transformedAllocations.map((alloc) => {
      const key = `${alloc.subjectCode}_${alloc.scheme}`;
      const timetableData = timetableMap.get(key);
      return {
        ...alloc,
        absentNumbers: timetableData?.absentNumbers || [],
        cpsStudents: timetableData?.cpsStudents || [],
      };
    });

    logger.debug(MODULE_FN, `Fetched ${mergedAllocations.length} allocations with timetable data`);
    return { success: true, data: mergedAllocations };
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to fetch allocations by date/session', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================
// Check Existing Allocations - Fixed version
// ============================================

export async function checkExistingAllocations(
  date: Date,
  session: string,
): Promise<{
  success: boolean;
  data: {
    hasAllocations: boolean;
    count: number;
    allocations: Array<{
      id: string;
      blockName: string | null;
      scheme: string;
      subjectCode: string;
      supervisorName: string | null;
      assignedCount: number | null;
      instituteCode: string | null;
      instituteName: string | null;
    }>;
  };
  error?: string;
}> {
  const MODULE_FN = `${MODULE}.checkExistingAllocations`;

  try {
    const examCenterId = await getExamCenterId();

    if (!examCenterId) {
      return {
        success: true,
        data: { hasAllocations: false, count: 0, allocations: [] },
      };
    }

    const allocations = await db.query.blockAllocations.findMany({
      where: and(
        eq(blockAllocations.examCenterId, examCenterId),
        eq(blockAllocations.date, date),
        eq(blockAllocations.session, session),
      ),
      with: {
        connectedInstitute: {
          columns: {
            instituteCode: true,
            instituteName: true,
          },
        },
      },
      columns: {
        id: true,
        location: true,
        scheme: true,
        subjectCode: true,
        supervisorName: true,
        assignedCount: true,
      },
    });

    const mappedAllocations = allocations.map((alloc) => ({
      id: alloc.id,
      blockName: alloc.location,
      scheme: alloc.scheme,
      subjectCode: alloc.subjectCode,
      supervisorName: alloc.supervisorName,
      assignedCount: alloc.assignedCount,
      instituteCode: alloc.connectedInstitute?.instituteCode ?? null,
      instituteName: alloc.connectedInstitute?.instituteName ?? null,
    }));

    return {
      success: true,
      data: {
        hasAllocations: allocations.length > 0,
        count: allocations.length,
        allocations: mappedAllocations,
      },
    };
  } catch (error) {
    console.error('SERVER ERROR in checkExistingAllocations:', error);
    logger.error(MODULE_FN, 'Failed to check allocations', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to check allocations',
      data: { hasAllocations: false, count: 0, allocations: [] },
    };
  }
}
