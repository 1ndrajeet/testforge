// lib/actions/allocation.ts
'use server';

import { revalidatePath } from 'next/cache';
import { and, asc, desc, eq, sql, inArray } from 'drizzle-orm';
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
  orders as ordersTable,
} from '@/lib/db/schema';
import { logger } from '@/lib/misc/logger';
import { getExamCenterId, requireExamCenter } from '@/lib/session';
import { PackingSlipEntry, SupervisionReportEntry } from '@/lib/types';

const MODULE = 'allocation';

// ============================================
// Validation Schemas (unchanged)
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

const CreateRelieverOrderSchema = z.object({
  date: z.date(),
  session: z.enum(['Morning', 'Afternoon', 'All']),
  relieverIds: z.array(z.string()),
  relieverUids: z.array(z.string()),
});

const ResolveCopyCaseSchema = z.object({
  subjectCode: z.string().min(1),
  scheme: z.string().min(1),
  date: z.date(),
  session: z.enum(['Morning', 'Afternoon', 'All']),
  seatNumber: z.number().int().positive(),
});

export interface RelieverOrderData {
  id: string;
  date: Date;
  session: string;
  relieverId: string;
  relieverUid: string;
}

// ============================================
// Read Operations - OPTIMIZED
// ============================================

export async function getAllocations(params?: {
  date?: Date;
  session?: string;
  blockId?: string;
  subjectCode?: string;
  supervisorUid?: string;
}) {
  const fn = `${MODULE}.getAllocations`;
  const start = performance.now();

  try {
    const examCenterId = await getExamCenterId();
    if (!examCenterId) {
      logger.debug(fn, 'No exam center found');
      return { success: true, data: [] };
    }

    const conditions = [eq(blockAllocations.examCenterId, examCenterId)];
    if (params?.date) conditions.push(eq(blockAllocations.date, params.date));
    if (params?.session) conditions.push(eq(blockAllocations.session, params.session));
    if (params?.blockId) conditions.push(eq(blockAllocations.blockId, params.blockId));
    if (params?.subjectCode) conditions.push(eq(blockAllocations.subjectCode, params.subjectCode));
    if (params?.supervisorUid) conditions.push(eq(blockAllocations.supervisorUid, params.supervisorUid));

    const allocations = await db.query.blockAllocations.findMany({
      where: and(...conditions),
      orderBy: [asc(blockAllocations.date), asc(blockAllocations.session), asc(blockAllocations.blockNo)],
    });

    const duration = performance.now() - start;
    logger.debug(fn, `Fetched ${allocations.length} allocations in ${duration.toFixed(0)}ms`, { params });

    return { success: true, data: allocations };
  } catch (error) {
    logger.error(fn, 'Failed to fetch allocations', { error });
    return { success: false, error: 'Failed to fetch allocations', data: [] };
  }
}

export async function getAllocationById(id: string) {
  const fn = `${MODULE}.getAllocationById`;

  try {
    const examCenterId = await getExamCenterId();
    if (!examCenterId) {
      logger.debug(fn, 'No exam center found');
      return { success: true, data: null };
    }

    const allocation = await db.query.blockAllocations.findFirst({
      where: and(eq(blockAllocations.id, id), eq(blockAllocations.examCenterId, examCenterId)),
    });

    return { success: true, data: allocation || null };
  } catch (error) {
    logger.error(fn, 'Failed to fetch allocation', { error });
    return { success: false, error: 'Failed to fetch allocation', data: null };
  }
}

export async function getAllocationsByDate(date: Date, session?: string) {
  return getAllocations({ date, session });
}

export async function getAllocationsBySupervisor(supervisorUid: string) {
  return getAllocations({ supervisorUid });
}

export async function getSupervisorSchedule(supervisorUid: string, startDate?: Date, endDate?: Date) {
  const fn = `${MODULE}.getSupervisorSchedule`;

  try {
    const examCenterId = await getExamCenterId();
    if (!examCenterId) {
      logger.debug(fn, 'No exam center found');
      return { success: true, data: [] };
    }

    const conditions = [
      eq(blockAllocations.examCenterId, examCenterId),
      eq(blockAllocations.supervisorUid, supervisorUid),
    ];
    if (startDate) conditions.push(sql`${blockAllocations.date} >= ${startDate}`);
    if (endDate) conditions.push(sql`${blockAllocations.date} <= ${endDate}`);

    const allocations = await db.query.blockAllocations.findMany({
      where: and(...conditions),
      orderBy: [asc(blockAllocations.date), asc(blockAllocations.session)],
    });

    return { success: true, data: allocations };
  } catch (error) {
    logger.error(fn, 'Failed to fetch supervisor schedule', { error });
    return { success: false, error: 'Failed to fetch schedule', data: [] };
  }
}

// ============================================
// OPTIMIZED: getAllocationsByDateSession - SINGLE JOIN QUERY
// ============================================

export async function getAllocationsByDateSession(
  date: Date,
  session: string,
): Promise<{
  success: boolean;
  data?: any[];
  error?: string;
}> {
  const fn = `${MODULE}.getAllocationsByDateSession`;
  const start = performance.now();

  try {
    const examCenterId = await getExamCenterId();
    if (!examCenterId) {
      logger.debug(fn, 'No exam center found');
      return { success: true, data: [] };
    }

    // ✅ SINGLE QUERY with all joins
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

    // Fetch timetable entries in parallel
    const timetableEntries = await db.query.timetable.findMany({
      where: and(
        eq(timetable.examCenterId, examCenterId),
        eq(timetable.date, date),
        eq(timetable.session, session),
      ),
    });

    // Build map for absent/cps data
    const timetableMap = new Map<string, { absentNumbers: number[]; cpsStudents: number[] }>();
    timetableEntries.forEach((entry) => {
      const key = `${entry.subjectCode}_${entry.scheme}`;
      timetableMap.set(key, {
        absentNumbers: entry.absentNumbers || [],
        cpsStudents: entry.cpsStudents || [],
      });
    });

    // Merge data
    const mergedAllocations = allocations.map((alloc) => {
      const key = `${alloc.subjectCode}_${alloc.scheme}`;
      const timetableData = timetableMap.get(key) || { absentNumbers: [], cpsStudents: [] };
      const { connectedInstitute, ...rest } = alloc;
      return {
        ...rest,
        instituteCode: connectedInstitute?.instituteCode ?? '',
        instituteName: connectedInstitute?.instituteName ?? '',
        absentNumbers: timetableData.absentNumbers,
        cpsStudents: timetableData.cpsStudents,
      };
    });

    const duration = performance.now() - start;
    logger.debug(fn, `Fetched ${mergedAllocations.length} allocations in ${duration.toFixed(0)}ms`);

    return { success: true, data: mergedAllocations };
  } catch (error) {
    logger.error(fn, 'Failed to fetch allocations by date/session', { error });
    return { success: false, error: 'Failed to fetch allocations', data: [] };
  }
}

// ============================================
// OPTIMIZED: checkExistingAllocations - SINGLE QUERY
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
  const fn = `${MODULE}.checkExistingAllocations`;
  const start = performance.now();

  try {
    const examCenterId = await getExamCenterId();
    if (!examCenterId) {
      return {
        success: true,
        data: { hasAllocations: false, count: 0, allocations: [] },
      };
    }

    // ✅ SINGLE QUERY with join
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

    const duration = performance.now() - start;
    logger.debug(fn, `Checked existing allocations in ${duration.toFixed(0)}ms`, {
      count: allocations.length,
    });

    return {
      success: true,
      data: {
        hasAllocations: allocations.length > 0,
        count: allocations.length,
        allocations: mappedAllocations,
      },
    };
  } catch (error) {
    logger.error(fn, 'Failed to check allocations', { error });
    return {
      success: false,
      error: 'Failed to check allocations',
      data: { hasAllocations: false, count: 0, allocations: [] },
    };
  }
}

// ============================================
// OPTIMIZED: getAllocationStats - SINGLE QUERY
// ============================================

export async function getAllocationStats() {
  const fn = `${MODULE}.getAllocationStats`;
  const start = performance.now();

  try {
    const examCenterId = await getExamCenterId();
    if (!examCenterId) {
      logger.debug(fn, 'No exam center found');
      return {
        success: true,
        data: { totalAllocations: 0, totalSeats: 0, allocatedSupervisors: 0, unassignedAllocations: 0, dates: [] },
      };
    }

    // ✅ SINGLE QUERY with all stats
    const result = await db.execute(sql`
      WITH stats AS (
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE supervisor_uid IS NULL) as unassigned,
          COALESCE(SUM(assigned_count), 0) as seats
        FROM block_allocations
        WHERE exam_center_id = ${examCenterId}
      ),
      dates AS (
        SELECT DISTINCT date
        FROM block_allocations
        WHERE exam_center_id = ${examCenterId}
        ORDER BY date DESC
      )
      SELECT
        s.total,
        s.unassigned,
        s.seats,
        (s.total - s.unassigned) as assigned,
        array_agg(d.date) as dates
      FROM stats s
      CROSS JOIN dates d
      GROUP BY s.total, s.unassigned, s.seats
    `);

    const row = result.rows[0] as any;

    const stats = {
      totalAllocations: Number(row?.total || 0),
      totalSeats: Number(row?.seats || 0),
      allocatedSupervisors: Number(row?.assigned || 0),
      unassignedAllocations: Number(row?.unassigned || 0),
      dates: row?.dates || [],
    };

    const duration = performance.now() - start;
    logger.debug(fn, `Stats fetched in ${duration.toFixed(0)}ms`, stats);

    return { success: true, data: stats };
  } catch (error) {
    logger.error(fn, 'Failed to fetch allocation stats', { error });
    return {
      success: false,
      error: 'Failed to fetch stats',
      data: { totalAllocations: 0, totalSeats: 0, allocatedSupervisors: 0, unassignedAllocations: 0, dates: [] },
    };
  }
}

export async function hasAllocations(date?: Date, session?: string) {
  const fn = `${MODULE}.hasAllocations`;

  try {
    const examCenterId = await getExamCenterId();
    if (!examCenterId) {
      return { success: true, data: false };
    }

    const conditions = [eq(blockAllocations.examCenterId, examCenterId)];
    if (date) conditions.push(eq(blockAllocations.date, date));
    if (session) conditions.push(eq(blockAllocations.session, session));

    // ✅ Use EXISTS for better performance
    const result = await db.execute(sql`
      SELECT EXISTS(
        SELECT 1 FROM block_allocations
        WHERE exam_center_id = ${examCenterId}
        ${date ? sql`AND date = ${date}` : sql``}
        ${session ? sql`AND session = ${session}` : sql``}
        LIMIT 1
      ) as exists
    `);

    const hasData = (result.rows[0] as any)?.exists === true;
    return { success: true, data: hasData };
  } catch (error) {
    logger.error(fn, 'Failed to check allocations', { error });
    return { success: false, error: 'Failed to check allocations', data: false };
  }
}

// ============================================
// Write Operations (unchanged - already efficient)
// ============================================

export async function createAllocation(data: z.infer<typeof CreateAllocationSchema>) {
  const fn = `${MODULE}.createAllocation`;

  try {
    const validated = CreateAllocationSchema.parse(data);
    const examCenter = await requireExamCenter();

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
      logger.warn(fn, 'Duplicate allocation detected', {
        date: validated.date,
        session: validated.session,
        blockId: validated.blockId,
        subjectCode: validated.subjectCode,
      });
      return { success: false, error: 'Allocation already exists' };
    }

    const [created] = await db
      .insert(blockAllocations)
      .values({
        examCenterId: examCenter.id,
        ...validated,
      })
      .returning();

    logger.info(fn, 'Allocation created', { id: created.id });
    revalidatePath('/exam-center/block-allocation');
    return { success: true, data: created };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues };
    }
    logger.error(fn, 'Failed to create allocation', { error });
    return { success: false, error: 'Failed to create allocation' };
  }
}

export async function updateAllocation(data: z.infer<typeof UpdateAllocationSchema>) {
  const fn = `${MODULE}.updateAllocation`;

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
      return { success: false, error: 'Allocation not found' };
    }

    logger.info(fn, 'Allocation updated', { id });
    revalidatePath('/exam-center/block-allocation');
    return { success: true, data: updated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues };
    }
    logger.error(fn, 'Failed to update allocation', { error });
    return { success: false, error: 'Failed to update allocation' };
  }
}

export async function deleteAllocation(id: string) {
  const fn = `${MODULE}.deleteAllocation`;

  try {
    const examCenter = await requireExamCenter();

    const [deleted] = await db
      .delete(blockAllocations)
      .where(and(eq(blockAllocations.id, id), eq(blockAllocations.examCenterId, examCenter.id)))
      .returning();

    if (!deleted) {
      return { success: false, error: 'Allocation not found' };
    }

    logger.info(fn, 'Allocation deleted', { id });
    revalidatePath('/exam-center/block-allocation');
    return { success: true, data: deleted };
  } catch (error) {
    logger.error(fn, 'Failed to delete allocation', { error });
    return { success: false, error: 'Failed to delete allocation' };
  }
}

export async function clearAllAllocations(data: z.infer<typeof ClearAllocationsSchema>) {
  const fn = `${MODULE}.clearAllAllocations`;

  try {
    const validated = ClearAllocationsSchema.parse(data);
    const examCenter = await requireExamCenter();

    const conditions = [eq(blockAllocations.examCenterId, examCenter.id)];
    if (validated.date) conditions.push(eq(blockAllocations.date, validated.date));
    if (validated.session) conditions.push(eq(blockAllocations.session, validated.session));

    const deleted = await db
      .delete(blockAllocations)
      .where(and(...conditions))
      .returning();

    logger.warn(fn, 'Cleared allocations', { count: deleted.length });
    revalidatePath('/exam-center/block-allocation');
    return { success: true, data: deleted };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues };
    }
    logger.error(fn, 'Failed to clear allocations', { error });
    return { success: false, error: 'Failed to clear allocations' };
  }
}

export async function clearAllocationsForSession(date: Date, session: string) {
  const fn = `${MODULE}.clearAllocationsForSession`;

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

    logger.info(fn, 'Cleared allocations for session', { date, session, count: deleted.length });
    revalidatePath('/exam-center/block-allocation');
    return { success: true, data: deleted };
  } catch (error) {
    logger.error(fn, 'Failed to clear allocations', { error });
    return { success: false, error: 'Failed to clear allocations' };
  }
}

// ============================================
// Supervisor Assignment Operations (unchanged)
// ============================================

export async function assignSupervisorToAllocation(data: z.infer<typeof AssignSupervisorSchema>) {
  const fn = `${MODULE}.assignSupervisorToAllocation`;

  try {
    const validated = AssignSupervisorSchema.parse(data);
    const examCenter = await requireExamCenter();

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
      return { success: false, error: 'Allocation not found' };
    }

    logger.info(fn, 'Supervisor assigned to allocation', {
      allocationId: validated.allocationId,
      supervisorUid: validated.supervisorUid,
    });
    revalidatePath('/exam-center/block-allocation');
    return { success: true, data: updated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues };
    }
    logger.error(fn, 'Failed to assign supervisor', { error });
    return { success: false, error: 'Failed to assign supervisor' };
  }
}

export async function bulkAssignSupervisors(data: z.infer<typeof BulkAssignSupervisorsSchema>) {
  const fn = `${MODULE}.bulkAssignSupervisors`;

  try {
    const validated = BulkAssignSupervisorsSchema.parse(data);
    const examCenter = await requireExamCenter();

    const results = await db.transaction(async (tx) => {
      const updates = [];

      for (const assignment of validated.assignments) {
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

        if (updated) updates.push(updated);
      }

      return updates;
    });

    logger.info(fn, 'Bulk assigned supervisors', { count: results.length });
    revalidatePath('/exam-center/block-allocation');
    return { success: true, data: results };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues };
    }
    logger.error(fn, 'Failed to bulk assign supervisors', { error });
    return { success: false, error: 'Failed to assign supervisors' };
  }
}

// ============================================
// Auto Allocation (unchanged - complex logic)
// ============================================

export async function autoAllocateStudents(data: z.infer<typeof AutoAllocateSchema>) {
  const fn = `${MODULE}.autoAllocateStudents`;

  try {
    const validated = AutoAllocateSchema.parse(data);
    const examCenter = await requireExamCenter();

    const [timetableEntries, availableBlocks] = await Promise.all([
      db.query.timetable.findMany({
        where: and(
          eq(timetable.examCenterId, examCenter.id),
          eq(timetable.date, validated.date),
          eq(timetable.session, validated.session),
        ),
        orderBy: [timetable.timeSlot],
      }),
      db.query.blocks.findMany({
        where: and(eq(blocks.examCenterId, examCenter.id), eq(blocks.isDeleted, false)),
        orderBy: [asc(blocks.blockNo)],
      }),
    ]);

    if (timetableEntries.length === 0) {
      return { success: false, error: 'No timetable entries found' };
    }
    if (availableBlocks.length === 0) {
      return { success: false, error: 'No blocks configured' };
    }

    const allocations = [];
    let blockIndex = 0;

    for (const entry of timetableEntries) {
      const studentsList = await db.query.students.findMany({
        where: and(
          eq(students.examCenterId, examCenter.id),
          sql`${students.subCodes} @> ${JSON.stringify([entry.subjectCode])}::jsonb`,
          eq(students.isDeleted, false),
        ),
        orderBy: [asc(students.seatNumber)],
      });

      const studentSeats = studentsList.map((s) => s.seatNumber);
      if (studentSeats.length === 0) continue;

      let currentBlock = availableBlocks[blockIndex % availableBlocks.length];
      let currentSeats: number[] = [];
      let currentCount = 0;

      for (const seat of studentSeats) {
        if (currentCount >= currentBlock.strength) {
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
          currentBlock = availableBlocks[blockIndex % availableBlocks.length];
          currentSeats = [];
          currentCount = 0;
        }
        currentSeats.push(seat);
        currentCount++;
      }

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

    await db
      .delete(blockAllocations)
      .where(
        and(
          eq(blockAllocations.examCenterId, examCenter.id),
          eq(blockAllocations.date, validated.date),
          eq(blockAllocations.session, validated.session),
        ),
      );

    let insertedAllocations: (typeof blockAllocations.$inferSelect)[] = [];
    if (allocations.length > 0) {
      insertedAllocations = await db.insert(blockAllocations).values(allocations).returning();
    }

    logger.info(fn, 'Auto-allocated students', {
      allocationCount: insertedAllocations.length,
      studentCount: allocations.reduce((sum, a) => sum + a.seatNumbers.length, 0),
    });
    revalidatePath('/exam-center/block-allocation');

    return { success: true, data: insertedAllocations };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues };
    }
    logger.error(fn, 'Failed to auto-allocate students', { error });
    return { success: false, error: 'Failed to auto-allocate students' };
  }
}

// ============================================
// Report Generation - OPTIMIZED
// ============================================

export async function getPackingSlip(date: Date, session: string) {
  const fn = `${MODULE}.getPackingSlip`;
  const start = performance.now();

  try {
    const examCenter = await requireExamCenter();

    const [timetableEntries, allocations] = await Promise.all([
      db.query.timetable.findMany({
        where: and(
          eq(timetable.examCenterId, examCenter.id),
          eq(timetable.date, date),
          eq(timetable.session, session),
        ),
        orderBy: [timetable.subjectCode, timetable.scheme],
      }),
      db.query.blockAllocations.findMany({
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
      }),
    ]);

    if (timetableEntries.length === 0) {
      return { success: true, data: [] };
    }

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

    const packingSlip: PackingSlipEntry[] = timetableEntries.map((entry) => {
      const key = `${entry.subjectCode}_${entry.scheme}`;
      const instituteInfo = instituteMap.get(key) || {
        instituteCode: examCenter.code || '',
        instituteName: examCenter.name || '',
      };

      return {
        instituteCode: instituteInfo.instituteCode,
        instituteName: instituteInfo.instituteName,
        date: date.toISOString().split('T')[0],
        session: session,
        timeSlot: entry.timeSlot,
        scheme: entry.scheme,
        subjectCode: entry.subjectCode,
        totalStudents: entry.totalStudents || 0,
        sheetNo: `SHEET-${entry.subjectCode}-${entry.scheme}-${entry.id.substring(0, 8)}`,
        subjectName: entry.subjectName || entry.subjectCode,
        absentNumbers: entry.absentNumbers || [],
        cpsNumbers: entry.cpsStudents || [],
      };
    });

    const duration = performance.now() - start;
    logger.info(fn, `Generated ${packingSlip.length} packing slip entries in ${duration.toFixed(0)}ms`);

    return { success: true, data: packingSlip };
  } catch (error) {
    logger.error(fn, 'Failed to generate packing slip', { error });
    return { success: false, error: 'Failed to generate packing slip' };
  }
}

export async function getSupervisionReport(date: Date, session: string) {
  const fn = `${MODULE}.getSupervisionReport`;

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
        instituteCode: '',
        timeslot: allocation.timeslot || '',
      });
    }

    return { success: true, data: Array.from(groupedData.values()) };
  } catch (error) {
    logger.error(fn, 'Failed to generate supervision report', { error });
    return { success: false, error: 'Failed to generate supervision report' };
  }
}

export async function getSupervisionReportV2(date: Date, session: string) {
  const fn = `${MODULE}.getSupervisionReportV2`;

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

    const groupedData: Record<string, { date: string; session: string; supervisionRecords: SupervisionReportEntry[] }> = {};

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

      record.schemes.push({
        scheme: allocation.scheme,
        subjectCode: allocation.subjectCode,
        subjectName: allocation.subjectName,
        totalStudents: allocation.assignedCount || 0,
        instituteCode: '',
        timeslot: allocation.timeslot || '',
      });
    }

    return { success: true, data: Object.values(groupedData) };
  } catch (error) {
    logger.error(fn, 'Failed to generate supervision report V2', { error });
    return { success: false, error: 'Failed to generate supervision report' };
  }
}

export async function getQuestionPaperReport(date: Date, session?: string) {
  const fn = `${MODULE}.getQuestionPaperReport`;

  try {
    const examCenter = await requireExamCenter();

    const conditions = [eq(timetable.examCenterId, examCenter.id), eq(timetable.date, date)];
    if (session) conditions.push(eq(timetable.session, session));

    const entries = await db.query.timetable.findMany({
      where: and(...conditions),
      orderBy: [asc(timetable.subjectCode)],
    });

    const report = entries.map((entry) => ({
      scheme: entry.scheme,
      subjectAbbr: entry.subjectAbbr || '',
      subjectCode: entry.subjectCode,
      receivedQps: 0,
      totalStudents: entry.totalStudents,
      absentNumbers: entry.absentNumbers || [],
      date: entry.date.toISOString().split('T')[0],
      session: entry.session,
    }));

    return { success: true, data: report };
  } catch (error) {
    logger.error(fn, 'Failed to generate question paper report', { error });
    return { success: false, error: 'Failed to generate report' };
  }
}

export async function getQuestionPaperReportV2(date: Date, session?: string) {
  const fn = `${MODULE}.getQuestionPaperReportV2`;

  try {
    const examCenter = await requireExamCenter();

    const conditions = [eq(timetable.examCenterId, examCenter.id), eq(timetable.date, date)];
    if (session) conditions.push(eq(timetable.session, session));

    const [entries, inventoryItems] = await Promise.all([
      db.query.timetable.findMany({
        where: and(...conditions),
        orderBy: [asc(timetable.subjectCode)],
      }),
      db.query.qpInventory.findMany({
        where: and(
          eq(qpInventory.examCenterId, examCenter.id),
          eq(qpInventory.date, date),
          session ? eq(qpInventory.session, session) : sql`1=1`,
        ),
      }),
    ]);

    const inventoryMap = new Map<string, number>();
    for (const inv of inventoryItems) {
      inventoryMap.set(inv.subjectCode, inv.receivedQps || 0);
    }

    const results = entries.map((entry) => ({
      scheme: entry.scheme,
      subjectAbbr: entry.subjectAbbr || '',
      subjectCode: entry.subjectCode,
      receivedQps: inventoryMap.get(entry.subjectCode) || 0,
      totalStudents: entry.totalStudents,
      absentNumbers: entry.absentNumbers || [],
      date: entry.date.toISOString().split('T')[0],
      session: entry.session,
    }));

    return { success: true, data: results };
  } catch (error) {
    logger.error(fn, 'Failed to generate QP report V2', { error });
    return { success: false, error: 'Failed to generate report' };
  }
}

// ============================================
// Reliever Order Management (unchanged)
// ============================================

export async function createRelieverOrders(data: z.infer<typeof CreateRelieverOrderSchema>) {
  const fn = `${MODULE}.createRelieverOrders`;

  try {
    const validated = CreateRelieverOrderSchema.parse(data);
    const examCenter = await requireExamCenter();

    if (validated.relieverIds.length !== validated.relieverUids.length) {
      return { success: false, error: 'Reliever IDs and UIDs length mismatch' };
    }

    const createdOrders = await db.transaction(async (tx) => {
      await tx.delete(ordersTable).where(
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

    logger.info(fn, 'Reliever orders created', { count: createdOrders.length });
    revalidatePath('/exam-center/automation/orders');
    return { success: true, data: createdOrders };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues };
    }
    logger.error(fn, 'Failed to create reliever orders', { error });
    return { success: false, error: 'Failed to create reliever orders' };
  }
}

export async function getRelieverAssignments(date: Date, session: string, blocksPerReliever: number = 3) {
  const fn = `${MODULE}.getRelieverAssignments`;

  try {
    const examCenter = await requireExamCenter();

    const [allocations, relieverOrders] = await Promise.all([
      db.query.blockAllocations.findMany({
        where: and(
          eq(blockAllocations.examCenterId, examCenter.id),
          eq(blockAllocations.date, date),
          eq(blockAllocations.session, session),
          sql`${blockAllocations.supervisorUid} IS NOT NULL`,
        ),
        orderBy: [asc(blockAllocations.blockNo)],
      }),
      db.query.orders.findMany({
        where: and(
          eq(ordersTable.examCenterId, examCenter.id),
          eq(ordersTable.date, date),
          eq(ordersTable.session, session),
          eq(ordersTable.orderType, 'reliever'),
        ),
        with: {
          staff: true,
        },
      }),
    ]);

    if (allocations.length === 0) {
      return { success: true, data: [] };
    }

    const blockGroups: (typeof allocations)[] = [];
    for (let i = 0; i < allocations.length; i += blocksPerReliever) {
      blockGroups.push(allocations.slice(i, i + blocksPerReliever));
    }

    const transformedData = relieverOrders
      .map((relieverOrder, index) => {
        const assignedBlocks = blockGroups[index] || [];
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

    return { success: true, data: transformedData };
  } catch (error) {
    logger.error(fn, 'Failed to get reliever assignments', { error });
    return { success: false, error: 'Failed to get reliever assignments' };
  }
}

// ============================================
// Block Configuration - OPTIMIZED
// ============================================

export async function createBlockConfiguration(data: z.infer<typeof CreateBlockConfigSchema>) {
  const fn = `${MODULE}.createBlockConfiguration`;

  try {
    const validated = CreateBlockConfigSchema.parse(data);
    const examCenter = await requireExamCenter();

    const results = await db.transaction(async (tx) => {
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
        if (!(block.blockName in blockNumberMap)) {
          blockNumberMap[block.blockName] = currentBlockNo;
          currentBlockNo++;
        }

        const studentsList = await tx.query.students.findMany({
          where: and(
            eq(students.examCenterId, examCenter.id),
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
          subjectName: '',
          seatNumbers,
          firstSeat,
          lastSeat,
          assignedCount: seatNumbers.length,
          strength: blockData?.strength || 0,
          supervisorUid: block.supervisor,
          supervisorName: '',
        });
      }

      if (allocations.length > 0) {
        return await tx.insert(blockAllocations).values(allocations as any).returning();
      }
      return [];
    });

    logger.info(fn, 'Block configuration created', { blockCount: results.length });
    revalidatePath('/exam-center/block-allocation');
    return { success: true, data: results };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues };
    }
    logger.error(fn, 'Failed to create block configuration', { error });
    return { success: false, error: 'Failed to create block configuration' };
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
}) {
  const fn = `${MODULE}.bulkCreateBlockConfigurations`;
  const start = performance.now();

  const sanitizeScheme = (scheme: string): string => {
    if (!scheme) return '';
    return scheme.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  };

  try {
    const examCenter = await requireExamCenter();

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
        error: `Existing allocations found for ${data.date.toLocaleDateString()} - ${data.session}. Please clear existing allocations first.`,
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

        const sanitizedScheme = sanitizeScheme(alloc.scheme);

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

        const connectedInstituteId = studentsList.length > 0 ? studentsList[0].connectedInstituteId : null;

        const [blockData, supervisor, subject] = await Promise.all([
          tx.query.blocks.findFirst({
            where: and(eq(blocks.examCenterId, examCenter.id), eq(blocks.location, alloc.blockName)),
          }),
          tx.query.staff.findFirst({
            where: and(
              eq(staff.examCenterId, examCenter.id),
              eq(staff.uid, alloc.supervisor),
              eq(staff.staffType, 'SUPERVISOR'),
              eq(staff.isDeleted, false),
            ),
          }),
          tx.query.subjects.findFirst({
            where: and(
              eq(subjects.code, alloc.subCode),
              sql`REPLACE(${subjects.scheme}, '-', '') = ${sanitizedScheme}`,
            ),
          }),
        ]);

        allocations.push({
          examCenterId: examCenter.id,
          connectedInstituteId,
          date: data.date,
          session: data.session,
          timeslot: alloc.timeslot,
          blockNo: String(blockNumberMap[alloc.blockName]),
          location: alloc.blockName,
          scheme: alloc.scheme,
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

    const duration = performance.now() - start;
    logger.info(fn, `Created ${results.length} block configurations in ${duration.toFixed(0)}ms`);

    revalidatePath('/exam-center/block-allocation');
    return { success: true, data: results };
  } catch (error) {
    logger.error(fn, 'Failed to create block configurations', { error });
    return { success: false, error: 'Failed to create block configurations' };
  }
}

// ============================================
// Unique Dates & Sessions (delegated to timetable)
// ============================================

export async function getUniqueDates() {
  const fn = `${MODULE}.getUniqueDates`;

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