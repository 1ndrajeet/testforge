// lib/actions/staff.ts
'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, sql, inArray } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/lib/db';
import { blockAllocations, staff } from '@/lib/db/schema';
import { logger } from '@/lib/misc/logger';
import { getExamCenterId, requireExamCenter } from '@/lib/session';
import { StaffAllocation, StaffStats, StaffType, StaffWithAllocations } from '@/lib/types';

const MODULE = 'staff';

// ============================================
// Validation Schemas
// ============================================

const CreateStaffSchema = z.object({
  uid: z.string().min(1, 'UID is required'),
  name: z.string().min(1, 'Name is required'),
  department: z.string().min(1, 'Department is required'),
  email: z.string().email('Invalid email').optional().nullable(),
  staffType: z.enum(['SUPERVISOR', 'RELIEVER', 'CONTROL_ROOM']),
  role: z.string().optional().nullable(),
  designation: z.string().optional().nullable(),
  postHeldInExamination: z.string().optional().nullable(),
});

const UpdateStaffSchema = CreateStaffSchema.omit({ uid: true })
  .partial()
  .extend({
    id: z.string().uuid('Invalid ID'),
  });

const BulkCreateStaffSchema = z.object({
  staff: z.array(CreateStaffSchema),
  overwrite: z.boolean().default(false),
});

const AssignSupervisorsSchema = z.object({
  date: z.date(),
  session: z.enum(['Morning', 'Afternoon', 'All']),
  assignments: z.array(
    z.object({
      allocationId: z.string().uuid(),
      supervisorUid: z.string(),
    }),
  ),
});

const ReplaceStaffSchema = z.object({
  date: z.date(),
  session: z.enum(['Morning', 'Afternoon', 'All']),
  oldUid: z.string(),
  newUid: z.string(),
  staffType: z.enum(['SUPERVISOR', 'RELIEVER']),
});

// ============================================
// Read Operations - OPTIMIZED
// ============================================

export async function getStaff(type?: StaffType) {
  const fn = `${MODULE}.getStaff`;
  const start = performance.now();

  try {
    const examCenterId = await getExamCenterId();
    if (!examCenterId) {
      logger.debug(fn, 'No exam center found');
      return { success: true, data: [] };
    }

    const conditions = [eq(staff.examCenterId, examCenterId), eq(staff.isDeleted, false)];
    if (type) conditions.push(eq(staff.staffType, type));

    const staffMembers = await db.query.staff.findMany({
      where: and(...conditions),
      orderBy: (staff, { asc }) => [asc(staff.name)],
    });

    const duration = performance.now() - start;
    logger.debug(fn, `Fetched ${staffMembers.length} staff members in ${duration.toFixed(0)}ms`, {
      type: type || 'all',
    });

    return { success: true, data: staffMembers };
  } catch (error) {
    logger.error(fn, 'Failed to fetch staff', { error });
    return { success: false, error: 'Failed to fetch staff', data: [] };
  }
}

export async function getStaffById(id: string) {
  const fn = `${MODULE}.getStaffById`;

  try {
    const examCenterId = await getExamCenterId();
    if (!examCenterId) {
      logger.debug(fn, 'No exam center found');
      return { success: true, data: null };
    }

    const staffMember = await db.query.staff.findFirst({
      where: and(
        eq(staff.id, id),
        eq(staff.examCenterId, examCenterId),
        eq(staff.isDeleted, false),
      ),
    });

    return { success: true, data: staffMember || null };
  } catch (error) {
    logger.error(fn, 'Failed to fetch staff member', { error });
    return { success: false, error: 'Failed to fetch staff', data: null };
  }
}

export async function getStaffByUid(uid: string) {
  const fn = `${MODULE}.getStaffByUid`;

  try {
    const examCenterId = await getExamCenterId();
    if (!examCenterId) {
      logger.debug(fn, 'No exam center found');
      return { success: true, data: null };
    }

    const staffMember = await db.query.staff.findFirst({
      where: and(
        eq(staff.uid, uid),
        eq(staff.examCenterId, examCenterId),
        eq(staff.isDeleted, false),
      ),
    });

    return { success: true, data: staffMember || null };
  } catch (error) {
    logger.error(fn, 'Failed to fetch staff by UID', { error });
    return { success: false, error: 'Failed to fetch staff', data: null };
  }
}

export async function getStaffByDepartment(department: string, type?: StaffType) {
  const fn = `${MODULE}.getStaffByDepartment`;

  try {
    const examCenterId = await getExamCenterId();
    if (!examCenterId) {
      logger.debug(fn, 'No exam center found');
      return { success: true, data: [] };
    }

    const conditions = [
      eq(staff.examCenterId, examCenterId),
      eq(staff.department, department),
      eq(staff.isDeleted, false),
    ];
    if (type) conditions.push(eq(staff.staffType, type));

    const staffMembers = await db.query.staff.findMany({
      where: and(...conditions),
      orderBy: (staff, { asc }) => [asc(staff.name)],
    });

    return { success: true, data: staffMembers };
  } catch (error) {
    logger.error(fn, 'Failed to fetch staff by department', { error });
    return { success: false, error: 'Failed to fetch staff', data: [] };
  }
}

export async function getSupervisors() {
  return getStaff('SUPERVISOR');
}

export async function getRelievers() {
  return getStaff('RELIEVER');
}

export async function getControlRoomStaff() {
  return getStaff('CONTROL_ROOM');
}

// ============================================
// OPTIMIZED: getAvailableSupervisors - SINGLE QUERY
// ============================================

export async function getAvailableSupervisors(date?: Date, session?: string) {
  const fn = `${MODULE}.getAvailableSupervisors`;
  const start = performance.now();

  try {
    const examCenterId = await getExamCenterId();
    if (!examCenterId) {
      logger.debug(fn, 'No exam center found');
      return { success: true, data: [] };
    }

    // If no date/session, just return all supervisors
    if (!date || !session) {
      const supervisors = await db.query.staff.findMany({
        where: and(
          eq(staff.examCenterId, examCenterId),
          eq(staff.staffType, 'SUPERVISOR'),
          eq(staff.isDeleted, false),
        ),
      });
      return { success: true, data: supervisors };
    }

    // ✅ SINGLE QUERY with NOT EXISTS
    const result = await db.execute(sql`
      SELECT s.*
      FROM staff s
      WHERE s.exam_center_id = ${examCenterId}
        AND s.staff_type = 'SUPERVISOR'
        AND s.is_deleted = false
        AND NOT EXISTS (
          SELECT 1
          FROM block_allocations ba
          WHERE ba.exam_center_id = s.exam_center_id
            AND ba.supervisor_uid = s.uid
            AND ba.date = ${date}
            AND ba.session = ${session}
        )
      ORDER BY s.name ASC
    `);

    const supervisors = result.rows as any[];
    const duration = performance.now() - start;

    logger.debug(fn, `Fetched ${supervisors.length} available supervisors in ${duration.toFixed(0)}ms`);

    return { success: true, data: supervisors };
  } catch (error) {
    logger.error(fn, 'Failed to fetch available supervisors', { error });
    return { success: false, error: 'Failed to fetch supervisors', data: [] };
  }
}

// ============================================
// OPTIMIZED: getStaffWithAllocations - SINGLE JOIN
// ============================================

export async function getStaffWithAllocations(staffId: string) {
  const fn = `${MODULE}.getStaffWithAllocations`;

  try {
    const examCenterId = await getExamCenterId();
    if (!examCenterId) {
      logger.debug(fn, 'No exam center found');
      return { success: true, data: null };
    }

    const staffMember = await db.query.staff.findFirst({
      where: and(
        eq(staff.id, staffId),
        eq(staff.examCenterId, examCenterId),
        eq(staff.isDeleted, false),
      ),
    });

    if (!staffMember) {
      return { success: true, data: null };
    }

    let allocations: StaffAllocation[] = [];
    if (staffMember.staffType === 'SUPERVISOR') {
      allocations = await db.query.blockAllocations.findMany({
        where: and(
          eq(blockAllocations.examCenterId, examCenterId),
          eq(blockAllocations.supervisorUid, staffMember.uid),
        ),
        orderBy: [blockAllocations.date, blockAllocations.session],
        columns: {
          id: true,
          date: true,
          session: true,
          blockNo: true,
          location: true,
          subjectCode: true,
          scheme: true,
        },
      });
    }

    const result: StaffWithAllocations = {
      ...staffMember,
      allocations: allocations.length > 0 ? allocations : undefined,
    };

    return { success: true, data: result };
  } catch (error) {
    logger.error(fn, 'Failed to fetch staff with allocations', { error });
    return { success: false, error: 'Failed to fetch staff', data: null };
  }
}

// ============================================
// Write Operations
// ============================================

export async function createStaff(data: z.infer<typeof CreateStaffSchema>) {
  const fn = `${MODULE}.createStaff`;

  try {
    const validated = CreateStaffSchema.parse(data);
    const examCenter = await requireExamCenter();

    const existing = await db.query.staff.findFirst({
      where: and(
        eq(staff.examCenterId, examCenter.id),
        eq(staff.uid, validated.uid),
        eq(staff.isDeleted, false),
      ),
    });

    if (existing) {
      logger.warn(fn, 'Staff member already exists', { uid: validated.uid });
      return { success: false, error: `Staff member with UID ${validated.uid} already exists` };
    }

    if (validated.email) {
      const existingEmail = await db.query.staff.findFirst({
        where: and(
          eq(staff.examCenterId, examCenter.id),
          eq(staff.email, validated.email),
          eq(staff.isDeleted, false),
        ),
      });
      if (existingEmail) {
        return { success: false, error: `Staff member with email ${validated.email} already exists` };
      }
    }

    const [created] = await db
      .insert(staff)
      .values({
        examCenterId: examCenter.id,
        ...validated,
      })
      .returning();

    logger.info(fn, 'Staff member created', { id: created.id, uid: created.uid });
    revalidatePath('/exam-center/configuration/staff');
    revalidatePath('/exam-center/automation/orders');

    return { success: true, data: created };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, issues: error.issues };
    }
    logger.error(fn, 'Failed to create staff member', { error });
    return { success: false, error: 'Failed to create staff member' };
  }
}

export async function updateStaff(data: z.infer<typeof UpdateStaffSchema>) {
  const fn = `${MODULE}.updateStaff`;

  try {
    const validated = UpdateStaffSchema.parse(data);
    const examCenter = await requireExamCenter();
    const { id, ...updates } = validated;

    if (updates.email) {
      const existingEmail = await db.query.staff.findFirst({
        where: and(
          eq(staff.examCenterId, examCenter.id),
          eq(staff.email, updates.email),
          eq(staff.isDeleted, false),
          sql`${staff.id} != ${id}`,
        ),
      });
      if (existingEmail) {
        return { success: false, error: `Staff member with email ${updates.email} already exists` };
      }
    }

    const [updated] = await db
      .update(staff)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(staff.id, id), eq(staff.examCenterId, examCenter.id)))
      .returning();

    if (!updated) {
      return { success: false, error: 'Staff member not found' };
    }

    logger.info(fn, 'Staff member updated', { id });
    revalidatePath('/exam-center/configuration/staff');
    revalidatePath('/exam-center/automation/orders');

    return { success: true, data: updated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, issues: error.issues };
    }
    logger.error(fn, 'Failed to update staff member', { error });
    return { success: false, error: 'Failed to update staff member' };
  }
}

export async function deleteStaff(id: string) {
  const fn = `${MODULE}.deleteStaff`;

  try {
    const examCenter = await requireExamCenter();

    const staffMember = await db.query.staff.findFirst({
      where: and(eq(staff.id, id), eq(staff.examCenterId, examCenter.id)),
    });

    if (!staffMember) {
      return { success: false, error: 'Staff member not found' };
    }

    if (staffMember.staffType === 'SUPERVISOR') {
      // ✅ Use EXISTS for faster check
      const result = await db.execute(sql`
        SELECT EXISTS(
          SELECT 1 FROM block_allocations
          WHERE exam_center_id = ${examCenter.id}
            AND supervisor_uid = ${staffMember.uid}
            AND date >= CURRENT_DATE
          LIMIT 1
        ) as has_active
      `);
      const hasActive = (result.rows[0] as any)?.has_active === true;

      if (hasActive) {
        return {
          success: false,
          error: 'Cannot delete staff member with active block allocations. Please reassign first.',
        };
      }
    }

    const [deleted] = await db
      .update(staff)
      .set({ isDeleted: true, updatedAt: new Date() })
      .where(and(eq(staff.id, id), eq(staff.examCenterId, examCenter.id)))
      .returning();

    logger.info(fn, 'Staff member deleted (soft)', { id });
    revalidatePath('/exam-center/configuration/staff');
    revalidatePath('/exam-center/automation/orders');

    return { success: true, data: deleted };
  } catch (error) {
    logger.error(fn, 'Failed to delete staff member', { error });
    return { success: false, error: 'Failed to delete staff member' };
  }
}

// ============================================
// OPTIMIZED: bulkCreateStaff - BATCH + SKIP DUPLICATES
// ============================================

export async function bulkCreateStaff(data: z.infer<typeof BulkCreateStaffSchema>) {
  const fn = `${MODULE}.bulkCreateStaff`;
  const start = performance.now();

  try {
    const validated = BulkCreateStaffSchema.parse(data);
    const examCenter = await requireExamCenter();

    if (validated.staff.length === 0) {
      return { success: false, error: 'No staff members to import' };
    }

    const existingStaff = await db.query.staff.findMany({
      where: and(eq(staff.examCenterId, examCenter.id), eq(staff.isDeleted, false)),
      columns: { uid: true },
    });

    const existingUids = new Set(existingStaff.map((s) => s.uid));

    const newStaff = validated.staff.filter((member) => !existingUids.has(member.uid));
    const skippedCount = validated.staff.length - newStaff.length;

    if (newStaff.length === 0) {
      logger.info(fn, 'All staff already exist - skipping import', {
        total: validated.staff.length,
      });
      return {
        success: true,
        data: [],
        message: `All ${validated.staff.length} staff members already exist.`,
        skipped: skippedCount,
      };
    }

    const result = await db.transaction(async (tx) => {
      if (validated.overwrite) {
        await tx
          .update(staff)
          .set({ isDeleted: true, updatedAt: new Date() })
          .where(eq(staff.examCenterId, examCenter.id));

        const allStaff = validated.staff.map((member) => ({
          examCenterId: examCenter.id,
          ...member,
        }));

        const BATCH_SIZE = 100;
        const insertedStaff = [];

        for (let i = 0; i < allStaff.length; i += BATCH_SIZE) {
          const batch = allStaff.slice(i, i + BATCH_SIZE);
          const inserted = await tx.insert(staff).values(batch).returning();
          insertedStaff.push(...inserted);
        }

        return insertedStaff;
      }

      const values = newStaff.map((member) => ({
        examCenterId: examCenter.id,
        ...member,
      }));

      const BATCH_SIZE = 100;
      const insertedStaff = [];

      for (let i = 0; i < values.length; i += BATCH_SIZE) {
        const batch = values.slice(i, i + BATCH_SIZE);
        const inserted = await tx.insert(staff).values(batch).returning();
        insertedStaff.push(...inserted);
      }

      return insertedStaff;
    });

    const duration = performance.now() - start;
    logger.info(fn, `Bulk created ${result.length} staff members in ${duration.toFixed(0)}ms`, {
      skipped: skippedCount,
      overwrite: validated.overwrite,
    });

    revalidatePath('/exam-center/configuration/staff');

    return {
      success: true,
      data: result,
      skipped: skippedCount,
      message:
        skippedCount > 0
          ? `Imported ${result.length} staff members (${skippedCount} skipped due to duplicates)`
          : `Successfully imported ${result.length} staff members`,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues };
    }

    if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
      return {
        success: false,
        error: 'Duplicate UIDs found. Please remove duplicates and try again.',
        duplicateError: true,
      };
    }

    logger.error(fn, 'Failed to bulk create staff', { error });
    return { success: false, error: 'Failed to import staff members' };
  }
}

// ============================================
// Assignment Operations
// ============================================

export async function assignSupervisors(data: z.infer<typeof AssignSupervisorsSchema>) {
  const fn = `${MODULE}.assignSupervisors`;

  try {
    const validated = AssignSupervisorsSchema.parse(data);
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
              eq(blockAllocations.id, assignment.allocationId),
              eq(blockAllocations.examCenterId, examCenter.id),
              eq(blockAllocations.date, validated.date),
              eq(blockAllocations.session, validated.session),
            ),
          )
          .returning();

        if (updated) updates.push(updated);
      }

      return updates;
    });

    logger.info(fn, `Assigned ${results.length} supervisors`);
    revalidatePath('/exam-center/block-allocation');
    return { success: true, data: results };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues };
    }
    logger.error(fn, 'Failed to assign supervisors', { error });
    return { success: false, error: 'Failed to assign supervisors' };
  }
}

export async function replaceStaff(data: z.infer<typeof ReplaceStaffSchema>) {
  const fn = `${MODULE}.replaceStaff`;

  try {
    const validated = ReplaceStaffSchema.parse(data);
    const examCenter = await requireExamCenter();

    const newStaff = await db.query.staff.findFirst({
      where: and(
        eq(staff.examCenterId, examCenter.id),
        eq(staff.uid, validated.newUid),
        eq(staff.staffType, validated.staffType),
        eq(staff.isDeleted, false),
      ),
    });

    if (!newStaff) {
      return { success: false, error: `${validated.staffType} with UID ${validated.newUid} not found` };
    }

    let updatedCount = 0;

    if (validated.staffType === 'SUPERVISOR') {
      const result = await db
        .update(blockAllocations)
        .set({
          supervisorUid: validated.newUid,
          supervisorName: newStaff.name,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(blockAllocations.examCenterId, examCenter.id),
            eq(blockAllocations.date, validated.date),
            eq(blockAllocations.session, validated.session),
            eq(blockAllocations.supervisorUid, validated.oldUid),
          ),
        );
      updatedCount = result.rowCount || 0;
    }

    logger.info(fn, `Replaced ${validated.staffType.toLowerCase()}`, { updatedCount });
    revalidatePath('/exam-center/block-allocation');
    revalidatePath('/exam-center/automation/orders');

    return { success: true, data: { updatedCount, newStaff } };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues };
    }
    logger.error(fn, 'Failed to replace staff', { error });
    return { success: false, error: 'Failed to replace staff' };
  }
}

// ============================================
// Statistics - OPTIMIZED with SINGLE QUERY
// ============================================

export async function getStaffStats() {
  const fn = `${MODULE}.getStaffStats`;
  const start = performance.now();

  try {
    const examCenterId = await getExamCenterId();
    if (!examCenterId) {
      logger.debug(fn, 'No exam center found');
      return {
        success: true,
        data: { total: 0, supervisors: 0, relievers: 0, controlRoom: 0 },
      };
    }

    // ✅ SINGLE QUERY with GROUP BY
    const result = await db.execute(sql`
      SELECT
        staff_type,
        COUNT(*) as count
      FROM staff
      WHERE exam_center_id = ${examCenterId}
        AND is_deleted = false
      GROUP BY staff_type
    `);

    let total = 0;
    let supervisors = 0;
    let relievers = 0;
    let controlRoom = 0;

    for (const row of result.rows as any[]) {
      const count = Number(row.count);
      total += count;
      if (row.staff_type === 'SUPERVISOR') supervisors = count;
      else if (row.staff_type === 'RELIEVER') relievers = count;
      else if (row.staff_type === 'CONTROL_ROOM') controlRoom = count;
    }

    const stats: StaffStats = { total, supervisors, relievers, controlRoom };

    const duration = performance.now() - start;
    logger.debug(fn, `Staff stats fetched in ${duration.toFixed(0)}ms`, stats);

    return { success: true, data: stats };
  } catch (error) {
    logger.error(fn, 'Failed to fetch staff stats', { error });
    return {
      success: false,
      error: 'Failed to fetch stats',
      data: { total: 0, supervisors: 0, relievers: 0, controlRoom: 0 },
    };
  }
}

export async function getStaffByTypeCounts() {
  return getStaffStats();
}

// ============================================
// Search Operations
// ============================================

export async function searchStaff(query: string, type?: StaffType) {
  const fn = `${MODULE}.searchStaff`;

  try {
    const examCenterId = await getExamCenterId();
    if (!examCenterId) {
      logger.debug(fn, 'No exam center found');
      return { success: true, data: [] };
    }

    const conditions = [
      eq(staff.examCenterId, examCenterId),
      eq(staff.isDeleted, false),
      sql`(
        ${staff.name} ILIKE ${`%${query}%`} OR
        ${staff.uid} ILIKE ${`%${query}%`} OR
        ${staff.department} ILIKE ${`%${query}%`} OR
        ${staff.email} ILIKE ${`%${query}%`}
      )`,
    ];

    if (type) conditions.push(eq(staff.staffType, type));

    const results = await db.query.staff.findMany({
      where: and(...conditions),
      orderBy: (staff, { asc }) => [asc(staff.name)],
      limit: 50,
    });

    return { success: true, data: results };
  } catch (error) {
    logger.error(fn, 'Failed to search staff', { error });
    return { success: false, error: 'Failed to search staff', data: [] };
  }
}