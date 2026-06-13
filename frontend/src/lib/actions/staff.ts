// lib/actions/staff.ts
'use server';

import { revalidatePath } from 'next/cache';

import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/lib/db';
import { blockAllocations, orders, staff } from '@/lib/db/schema';
import { logger } from '@/lib/misc/logger';
import { getExamCenterId, requireExamCenter } from '@/lib/session';
import { StaffAllocation, StaffMember, StaffStats, StaffType, StaffWithAllocations } from '@/lib/types';

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
  session: z.enum(['Morning', 'Afternoon']),
  assignments: z.array(
    z.object({
      allocationId: z.string().uuid(),
      supervisorUid: z.string(),
    })
  ),
});

const AssignRelieversSchema = z.object({
  date: z.date(),
  session: z.enum(['Morning', 'Afternoon']),
  relieverUids: z.array(z.string()),
});

const ReplaceStaffSchema = z.object({
  date: z.date(),
  session: z.enum(['Morning', 'Afternoon']),
  oldUid: z.string(),
  newUid: z.string(),
  staffType: z.enum(['SUPERVISOR', 'RELIEVER']),
});

// ============================================
// Read Operations
// ============================================

export async function getStaff(type?: StaffType) {
  const MODULE_FN = `${MODULE}.getStaff`;

  try {
    const examCenterId = await getExamCenterId();

    if (!examCenterId) {
      logger.debug(MODULE_FN, 'No exam center found');
      return { success: true, data: [] };
    }

    const conditions = [eq(staff.examCenterId, examCenterId), eq(staff.isDeleted, false)];

    if (type) {
      conditions.push(eq(staff.staffType, type));
    }

    const staffMembers = await db.query.staff.findMany({
      where: and(...conditions),
      orderBy: (staff, { asc }) => [asc(staff.name)],
    });

    logger.debug(MODULE_FN, `Fetched ${staffMembers.length} staff members`, {
      type: type || 'all',
    });
    return { success: true, data: staffMembers };
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to fetch staff', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function getStaffById(id: string) {
  const MODULE_FN = `${MODULE}.getStaffById`;

  try {
    const examCenterId = await getExamCenterId();

    if (!examCenterId) {
      logger.debug(MODULE_FN, 'No exam center found');
      return { success: true, data: null };
    }

    const staffMember = await db.query.staff.findFirst({
      where: and(eq(staff.id, id), eq(staff.examCenterId, examCenterId), eq(staff.isDeleted, false)),
    });

    if (!staffMember) {
      logger.debug(MODULE_FN, 'Staff member not found', { id });
      return { success: true, data: null };
    }

    logger.debug(MODULE_FN, 'Staff member fetched', { id });
    return { success: true, data: staffMember };
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to fetch staff member', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function getStaffByUid(uid: string) {
  const MODULE_FN = `${MODULE}.getStaffByUid`;

  try {
    const examCenterId = await getExamCenterId();

    if (!examCenterId) {
      logger.debug(MODULE_FN, 'No exam center found');
      return { success: true, data: null };
    }

    const staffMember = await db.query.staff.findFirst({
      where: and(eq(staff.uid, uid), eq(staff.examCenterId, examCenterId), eq(staff.isDeleted, false)),
    });

    if (!staffMember) {
      logger.debug(MODULE_FN, 'Staff member not found', { uid });
      return { success: true, data: null };
    }

    logger.debug(MODULE_FN, 'Staff member fetched', { uid });
    return { success: true, data: staffMember };
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to fetch staff member by UID', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function getStaffByDepartment(department: string, type?: StaffType) {
  const MODULE_FN = `${MODULE}.getStaffByDepartment`;

  try {
    const examCenterId = await getExamCenterId();

    if (!examCenterId) {
      logger.debug(MODULE_FN, 'No exam center found');
      return { success: true, data: [] };
    }

    const conditions = [
      eq(staff.examCenterId, examCenterId),
      eq(staff.department, department),
      eq(staff.isDeleted, false),
    ];

    if (type) {
      conditions.push(eq(staff.staffType, type));
    }

    const staffMembers = await db.query.staff.findMany({
      where: and(...conditions),
      orderBy: (staff, { asc }) => [asc(staff.name)],
    });

    logger.debug(MODULE_FN, `Fetched ${staffMembers.length} staff members from ${department}`);
    return { success: true, data: staffMembers };
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to fetch staff by department', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
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

export async function getAvailableSupervisors(date?: Date, session?: string) {
  const MODULE_FN = `${MODULE}.getAvailableSupervisors`;

  try {
    const examCenterId = await getExamCenterId();

    if (!examCenterId) {
      logger.debug(MODULE_FN, 'No exam center found');
      return { success: true, data: [] };
    }

    // Get all supervisors
    const supervisors = await db.query.staff.findMany({
      where: and(eq(staff.examCenterId, examCenterId), eq(staff.staffType, 'SUPERVISOR'), eq(staff.isDeleted, false)),
    });

    // If no date/session provided, return all
    if (!date || !session) {
      logger.debug(MODULE_FN, `Fetched ${supervisors.length} available supervisors (no filters)`);
      return { success: true, data: supervisors };
    }

    // Get already allocated supervisor UIDs for this date/session
    const allocations = await db.query.blockAllocations.findMany({
      where: and(
        eq(blockAllocations.examCenterId, examCenterId),
        eq(blockAllocations.date, date),
        eq(blockAllocations.session, session)
      ),
      columns: { supervisorUid: true },
    });

    const allocatedUids = new Set(allocations.map(a => a.supervisorUid).filter(Boolean));

    // Filter out allocated supervisors
    const available = supervisors.filter(s => !allocatedUids.has(s.uid));

    logger.debug(MODULE_FN, `Fetched ${available.length} available supervisors`, {
      total: supervisors.length,
      allocated: allocatedUids.size,
    });
    return { success: true, data: available };
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to fetch available supervisors', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function getStaffWithAllocations(staffId: string) {
  const MODULE_FN = `${MODULE}.getStaffWithAllocations`;

  try {
    const examCenterId = await getExamCenterId();

    if (!examCenterId) {
      logger.debug(MODULE_FN, 'No exam center found');
      return { success: true, data: null };
    }

    const staffMember = await db.query.staff.findFirst({
      where: and(eq(staff.id, staffId), eq(staff.examCenterId, examCenterId), eq(staff.isDeleted, false)),
    });

    if (!staffMember) {
      logger.debug(MODULE_FN, 'Staff member not found', { staffId });
      return { success: true, data: null };
    }

    // Get allocations for this staff member (if supervisor)
    let allocations: StaffAllocation[] = [];
    if (staffMember.staffType === 'SUPERVISOR') {
      allocations = await db.query.blockAllocations.findMany({
        where: and(
          eq(blockAllocations.examCenterId, examCenterId),
          eq(blockAllocations.supervisorUid, staffMember.uid)
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

    logger.debug(MODULE_FN, 'Staff member with allocations fetched', {
      staffId,
      allocationCount: allocations.length,
    });
    return { success: true, data: result };
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to fetch staff with allocations', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================
// Write Operations
// ============================================

export async function createStaff(data: z.infer<typeof CreateStaffSchema>) {
  const MODULE_FN = `${MODULE}.createStaff`;

  try {
    const validated = CreateStaffSchema.parse(data);
    const examCenter = await requireExamCenter();

    // Check for duplicate UID
    const existing = await db.query.staff.findFirst({
      where: and(eq(staff.examCenterId, examCenter.id), eq(staff.uid, validated.uid), eq(staff.isDeleted, false)),
    });

    if (existing) {
      logger.warn(MODULE_FN, 'Staff member already exists', { uid: validated.uid });
      return {
        success: false,
        error: `Staff member with UID ${validated.uid} already exists`,
      };
    }

    // Check for duplicate email (if provided)
    if (validated.email) {
      const existingEmail = await db.query.staff.findFirst({
        where: and(eq(staff.examCenterId, examCenter.id), eq(staff.email, validated.email), eq(staff.isDeleted, false)),
      });

      if (existingEmail) {
        logger.warn(MODULE_FN, 'Staff member with email already exists', {
          email: validated.email,
        });
        return {
          success: false,
          error: `Staff member with email ${validated.email} already exists`,
        };
      }
    }

    const [created] = await db
      .insert(staff)
      .values({
        examCenterId: examCenter.id,
        ...validated,
      })
      .returning();

    logger.info(MODULE_FN, 'Staff member created', {
      id: created.id,
      uid: created.uid,
      type: created.staffType,
    });
    revalidatePath('/exam-center/configuration/staff');
    revalidatePath('/exam-center/automation/orders');

    return { success: true, data: created };
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn(MODULE_FN, 'Validation failed', { issue: error.issues });
      return { success: false, issues: error.issues };
    }

    logger.error(MODULE_FN, 'Failed to create staff member', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create staff member',
    };
  }
}

export async function updateStaff(data: z.infer<typeof UpdateStaffSchema>) {
  const MODULE_FN = `${MODULE}.updateStaff`;

  try {
    const validated = UpdateStaffSchema.parse(data);
    const examCenter = await requireExamCenter();
    const { id, ...updates } = validated;

    // If updating email, check for duplicates
    if (updates.email) {
      const existingEmail = await db.query.staff.findFirst({
        where: and(
          eq(staff.examCenterId, examCenter.id),
          eq(staff.email, updates.email),
          eq(staff.isDeleted, false),
          sql`${staff.id} != ${id}`
        ),
      });

      if (existingEmail) {
        logger.warn(MODULE_FN, 'Staff member with email already exists', {
          email: updates.email,
        });
        return {
          success: false,
          error: `Staff member with email ${updates.email} already exists`,
        };
      }
    }

    const [updated] = await db
      .update(staff)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(staff.id, id), eq(staff.examCenterId, examCenter.id)))
      .returning();

    if (!updated) {
      logger.warn(MODULE_FN, 'Staff member not found', { id });
      return { success: false, error: 'Staff member not found' };
    }

    logger.info(MODULE_FN, 'Staff member updated', { id });
    revalidatePath('/exam-center/configuration/staff');
    revalidatePath('/exam-center/automation/orders');

    return { success: true, data: updated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn(MODULE_FN, 'Validation failed', { issue: error.issues });
      return { success: false, issues: error.issues };
    }

    logger.error(MODULE_FN, 'Failed to update staff member', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update staff member',
    };
  }
}

export async function deleteStaff(id: string) {
  const MODULE_FN = `${MODULE}.deleteStaff`;

  try {
    const examCenter = await requireExamCenter();

    // Check if staff has any active allocations or orders before soft delete
    const staffMember = await db.query.staff.findFirst({
      where: and(eq(staff.id, id), eq(staff.examCenterId, examCenter.id)),
    });

    if (!staffMember) {
      logger.warn(MODULE_FN, 'Staff member not found', { id });
      return { success: false, error: 'Staff member not found' };
    }

    // Check for active allocations (only for supervisors)
    let hasActiveAllocations = false;
    if (staffMember.staffType === 'SUPERVISOR') {
      const allocations = await db.query.blockAllocations.findMany({
        where: and(
          eq(blockAllocations.examCenterId, examCenter.id),
          eq(blockAllocations.supervisorUid, staffMember.uid),
          sql`${blockAllocations.date} >= CURRENT_DATE`
        ),
        limit: 1,
      });
      hasActiveAllocations = allocations.length > 0;
    }

    if (hasActiveAllocations) {
      logger.warn(MODULE_FN, 'Cannot delete staff with active allocations', { id });
      return {
        success: false,
        error: 'Cannot delete staff member with active block allocations. Please reassign first.',
      };
    }

    const [deleted] = await db
      .update(staff)
      .set({ isDeleted: true, updatedAt: new Date() })
      .where(and(eq(staff.id, id), eq(staff.examCenterId, examCenter.id)))
      .returning();

    logger.info(MODULE_FN, 'Staff member deleted (soft)', { id });
    revalidatePath('/exam-center/configuration/staff');
    revalidatePath('/exam-center/automation/orders');

    return { success: true, data: deleted };
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to delete staff member', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete staff member',
    };
  }
}

export async function bulkCreateStaff(data: z.infer<typeof BulkCreateStaffSchema>) {
  const MODULE_FN = `${MODULE}.bulkCreateStaff`;

  try {
    const validated = BulkCreateStaffSchema.parse(data);
    const examCenter = await requireExamCenter();

    if (validated.staff.length === 0) {
      return { success: false, error: 'No staff members to import' };
    }

    // Start transaction
    const result = await db.transaction(async tx => {
      // If overwrite is true, soft delete existing staff
      if (validated.overwrite) {
        await tx
          .update(staff)
          .set({ isDeleted: true, updatedAt: new Date() })
          .where(eq(staff.examCenterId, examCenter.id));
        logger.info(MODULE_FN, 'Soft deleted existing staff', {
          examCenterId: examCenter.id,
        });
      }

      // Prepare values
      const values = validated.staff.map(member => ({
        examCenterId: examCenter.id,
        ...member,
      }));

      // Insert in batches
      const BATCH_SIZE = 100;
      const insertedStaff = [];

      for (let i = 0; i < values.length; i += BATCH_SIZE) {
        const batch = values.slice(i, i + BATCH_SIZE);
        const inserted = await tx.insert(staff).values(batch).returning();
        insertedStaff.push(...inserted);
      }

      return insertedStaff;
    });

    logger.info(MODULE_FN, `Bulk created ${result.length} staff members`, {
      examCenterId: examCenter.id,
      count: result.length,
      overwrite: validated.overwrite,
    });
    revalidatePath('/exam-center/configuration/staff');

    return { success: true, data: result };
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn(MODULE_FN, 'Validation failed', { issue: error.issues });
      return { success: false, error: error.issues };
    }

    logger.error(MODULE_FN, 'Failed to bulk create staff', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to import staff members',
    };
  }
}

// ============================================
// Assignment Operations
// ============================================

export async function assignSupervisors(data: z.infer<typeof AssignSupervisorsSchema>) {
  const MODULE_FN = `${MODULE}.assignSupervisors`;

  try {
    const validated = AssignSupervisorsSchema.parse(data);
    const examCenter = await requireExamCenter();

    // Start transaction
    const results = await db.transaction(async tx => {
      const updates = [];

      for (const assignment of validated.assignments) {
        // Get supervisor name
        const supervisor = await tx.query.staff.findFirst({
          where: and(
            eq(staff.examCenterId, examCenter.id),
            eq(staff.uid, assignment.supervisorUid),
            eq(staff.staffType, 'SUPERVISOR'),
            eq(staff.isDeleted, false)
          ),
        });

        if (!supervisor) {
          throw new Error(`Supervisor with UID ${assignment.supervisorUid} not found`);
        }

        // Update allocation
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
              eq(blockAllocations.session, validated.session)
            )
          )
          .returning();

        if (updated) {
          updates.push(updated);
        }
      }

      return updates;
    });

    logger.info(MODULE_FN, `Assigned ${results.length} supervisors`, {
      examCenterId: examCenter.id,
      date: validated.date,
      session: validated.session,
    });
    revalidatePath('/exam-center/block-allocation');

    return { success: true, data: results };
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn(MODULE_FN, 'Validation failed', { issue: error.issues });
      return { success: false, error: error.issues };
    }

    logger.error(MODULE_FN, 'Failed to assign supervisors', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to assign supervisors',
    };
  }
}

export async function replaceStaff(data: z.infer<typeof ReplaceStaffSchema>) {
  const MODULE_FN = `${MODULE}.replaceStaff`;

  try {
    const validated = ReplaceStaffSchema.parse(data);
    const examCenter = await requireExamCenter();

    // Get new staff member
    const newStaff = await db.query.staff.findFirst({
      where: and(
        eq(staff.examCenterId, examCenter.id),
        eq(staff.uid, validated.newUid),
        eq(staff.staffType, validated.staffType),
        eq(staff.isDeleted, false)
      ),
    });

    if (!newStaff) {
      logger.warn(MODULE_FN, 'New staff member not found', {
        uid: validated.newUid,
        type: validated.staffType,
      });
      return {
        success: false,
        error: `${validated.staffType} with UID ${validated.newUid} not found`,
      };
    }

    let updatedCount = 0;

    if (validated.staffType === 'SUPERVISOR') {
      // Update block allocations
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
            eq(blockAllocations.supervisorUid, validated.oldUid)
          )
        );
      updatedCount = result.rowCount || 0;
    }

    // TODO: Handle reliever replacement when reliever orders table is implemented

    logger.info(MODULE_FN, `Replaced ${validated.staffType.toLowerCase()}`, {
      examCenterId: examCenter.id,
      oldUid: validated.oldUid,
      newUid: validated.newUid,
      date: validated.date,
      session: validated.session,
      updatedCount,
    });
    revalidatePath('/exam-center/block-allocation');
    revalidatePath('/exam-center/automation/orders');

    return {
      success: true,
      data: { updatedCount, newStaff },
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn(MODULE_FN, 'Validation failed', { issue: error.issues });
      return { success: false, error: error.issues };
    }

    logger.error(MODULE_FN, 'Failed to replace staff', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to replace staff member',
    };
  }
}

// ============================================
// Statistics / Reports
// ============================================

export async function getStaffStats() {
  const MODULE_FN = `${MODULE}.getStaffStats`;

  try {
    const examCenterId = await getExamCenterId();

    if (!examCenterId) {
      logger.debug(MODULE_FN, 'No exam center found');
      return {
        success: true,
        data: { total: 0, supervisors: 0, relievers: 0, controlRoom: 0 },
      };
    }

    const [supervisors, relievers, controlRoom] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)` })
        .from(staff)
        .where(
          and(eq(staff.examCenterId, examCenterId), eq(staff.staffType, 'SUPERVISOR'), eq(staff.isDeleted, false))
        ),
      db
        .select({ count: sql<number>`count(*)` })
        .from(staff)
        .where(and(eq(staff.examCenterId, examCenterId), eq(staff.staffType, 'RELIEVER'), eq(staff.isDeleted, false))),
      db
        .select({ count: sql<number>`count(*)` })
        .from(staff)
        .where(
          and(eq(staff.examCenterId, examCenterId), eq(staff.staffType, 'CONTROL_ROOM'), eq(staff.isDeleted, false))
        ),
    ]);

    const stats: StaffStats = {
      total: Number(supervisors[0]?.count || 0) + Number(relievers[0]?.count || 0) + Number(controlRoom[0]?.count || 0),
      supervisors: Number(supervisors[0]?.count || 0),
      relievers: Number(relievers[0]?.count || 0),
      controlRoom: Number(controlRoom[0]?.count || 0),
    };

    logger.debug(MODULE_FN, 'Staff stats fetched', stats);
    return { success: true, data: stats };
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to fetch staff stats', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
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
  const MODULE_FN = `${MODULE}.searchStaff`;

  try {
    const examCenterId = await getExamCenterId();

    if (!examCenterId) {
      logger.debug(MODULE_FN, 'No exam center found');
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

    if (type) {
      conditions.push(eq(staff.staffType, type));
    }

    const results = await db.query.staff.findMany({
      where: and(...conditions),
      orderBy: (staff, { asc }) => [asc(staff.name)],
      limit: 50,
    });

    logger.debug(MODULE_FN, `Search found ${results.length} results`, { query, type });
    return { success: true, data: results };
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to search staff', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
