// lib/actions/configuration.ts
'use server';

import { revalidatePath } from 'next/cache';

import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/lib/db';
import { blockAllocations, examCenters, orders, staff, students, timetable } from '@/lib/db/schema';
import { logger } from '@/lib/misc/logger';
import { getCurrentExamCenter, getExamCenterId, requireExamCenter } from '@/lib/session';

const MODULE = 'configuration';

// ============================================
// Validation Schemas
// ============================================

const UpdateExamCenterSchema = z.object({
  code: z.string().min(1, 'Exam center code is required'),
  name: z.string().min(1, 'Exam center name is required'),
  address: z.string().optional().nullable(),
  officerIncharge: z.string().optional().nullable(),
  sealingSupervisor: z.string().optional().nullable(),
  distCenterCode: z.string().optional().nullable(),
  distCenterName: z.string().optional().nullable(),
  season: z.enum(['Summer', 'Winter']).optional().nullable(),
  examYear: z.number().int().min(2000).max(2100).optional().nullable(),
  startDate: z.date().optional().nullable(),
  endDate: z.date().optional().nullable(),
  departments: z.array(z.string()).default([]),
});

const UpdateDepartmentsSchema = z.object({
  departments: z.array(z.string()),
});

// ============================================
// Read Operations
// ============================================

export async function getExamCenter() {
  const MODULE_FN = `${MODULE}.getExamCenter`;

  try {
    const examCenter = await getCurrentExamCenter();

    if (!examCenter) {
      logger.debug(MODULE_FN, 'No exam center configured');
      return { success: true, data: null };
    }

    logger.debug(MODULE_FN, 'Exam center fetched', { id: examCenter.id });
    return { success: true, data: examCenter };
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to fetch exam center', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function getDepartments() {
  const MODULE_FN = `${MODULE}.getDepartments`;

  try {
    const examCenter = await getCurrentExamCenter();

    if (!examCenter) {
      logger.debug(MODULE_FN, 'No exam center configured');
      return { success: true, data: [] };
    }

    logger.debug(MODULE_FN, 'Departments fetched', {
      count: examCenter.departments?.length || 0,
    });
    return { success: true, data: examCenter.departments || [] };
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to fetch departments', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function getExamConfiguration() {
  const MODULE_FN = `${MODULE}.getExamConfiguration`;

  try {
    const examCenter = await getCurrentExamCenter();

    if (!examCenter) {
      logger.debug(MODULE_FN, 'No exam center configured');
      return { success: true, data: null };
    }

    const configuration = {
      code: examCenter.code,
      name: examCenter.name,
      address: examCenter.address,
      officerIncharge: examCenter.officerIncharge,
      sealingSupervisor: examCenter.sealingSupervisor,
      distCenterCode: examCenter.distCenterCode,
      distCenterName: examCenter.distCenterName,
      season: examCenter.season,
      examYear: examCenter.examYear,
      startDate: examCenter.startDate,
      endDate: examCenter.endDate,
      departments: examCenter.departments,
    };

    logger.debug(MODULE_FN, 'Exam configuration fetched');
    return { success: true, data: configuration };
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to fetch exam configuration', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function getExamStatistics() {
  const MODULE_FN = `${MODULE}.getExamStatistics`;

  try {
    const examCenterId = await getExamCenterId();

    if (!examCenterId) {
      logger.debug(MODULE_FN, 'No exam center configured');
      return { success: true, data: null };
    }

    // Get various counts in parallel
    const [staffCount, studentCount, timetableCount, allocationCount, orderCount] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)` })
        .from(staff)
        .where(eq(staff.examCenterId, examCenterId)),
      db
        .select({ count: sql<number>`count(*)` })
        .from(students)
        .where(eq(students.examCenterId, examCenterId)),
      db
        .select({ count: sql<number>`count(*)` })
        .from(timetable)
        .where(eq(timetable.examCenterId, examCenterId)),
      db
        .select({ count: sql<number>`count(*)` })
        .from(blockAllocations)
        .where(eq(blockAllocations.examCenterId, examCenterId)),
      db
        .select({ count: sql<number>`count(*)` })
        .from(orders)
        .where(eq(orders.examCenterId, examCenterId)),
    ]);

    const stats = {
      staff: Number(staffCount[0]?.count || 0),
      students: Number(studentCount[0]?.count || 0),
      timetableEntries: Number(timetableCount[0]?.count || 0),
      allocations: Number(allocationCount[0]?.count || 0),
      orders: Number(orderCount[0]?.count || 0),
    };

    logger.info(MODULE_FN, 'Exam statistics calculated', stats);
    return { success: true, data: stats };
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to fetch exam statistics', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================
// Write Operations
// ============================================

export async function updateExamCenter(data: z.infer<typeof UpdateExamCenterSchema>) {
  const MODULE_FN = `${MODULE}.updateExamCenter`;

  try {
    const validated = UpdateExamCenterSchema.parse(data);
    const { orgId } = await requireExamCenter(); // Throws if no exam center
    // Actually we need to get the org - let's get the current exam center first
    const currentExamCenter = await getCurrentExamCenter();

    if (!currentExamCenter) {
      // Create new exam center
      const [created] = await db
        .insert(examCenters)
        .values({
          ...validated,
          orgId,
        })
        .returning();

      logger.info(MODULE_FN, 'Exam center created', { id: created.id });
      revalidatePath('/exam-center/settings');
      revalidatePath('/onboarding');

      return { success: true, data: created };
    }

    // Update existing exam center
    const [updated] = await db
      .update(examCenters)
      .set({
        ...validated,
        updatedAt: new Date(),
      })
      .where(eq(examCenters.id, currentExamCenter.id))
      .returning();

    if (!updated) {
      return { success: false, error: 'Failed to update exam center' };
    }

    logger.info(MODULE_FN, 'Exam center updated', { id: updated.id });
    revalidatePath('/exam-center/settings');
    revalidatePath('/onboarding');

    return { success: true, data: updated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn(MODULE_FN, 'Validation failed', { issues: error.issues });
      return { success: false, error: error.issues };
    }

    logger.error(MODULE_FN, 'Failed to update exam center', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update exam center',
    };
  }
}

export async function updateDepartments(data: z.infer<typeof UpdateDepartmentsSchema>) {
  const MODULE_FN = `${MODULE}.updateDepartments`;

  try {
    const validated = UpdateDepartmentsSchema.parse(data);
    const examCenter = await getCurrentExamCenter();

    if (!examCenter) {
      return { success: false, error: 'Exam center not configured' };
    }

    const [updated] = await db
      .update(examCenters)
      .set({
        departments: validated.departments,
        updatedAt: new Date(),
      })
      .where(eq(examCenters.id, examCenter.id))
      .returning();

    if (!updated) {
      return { success: false, error: 'Failed to update departments' };
    }

    logger.info(MODULE_FN, 'Departments updated', {
      id: examCenter.id,
      count: validated.departments.length,
    });
    revalidatePath('/exam-center/settings');

    return { success: true, data: updated.departments || [] };
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn(MODULE_FN, 'Validation failed', { issues: error.issues });
      return { success: false, error: error.issues };
    }

    logger.error(MODULE_FN, 'Failed to update departments', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update departments',
    };
  }
}

export async function updateExamConfiguration(data: {
  season?: string;
  examYear?: number;
  startDate?: Date;
  endDate?: Date;
}) {
  const MODULE_FN = `${MODULE}.updateExamConfiguration`;

  try {
    const examCenter = await getCurrentExamCenter();

    if (!examCenter) {
      return { success: false, error: 'Exam center not configured' };
    }

    const [updated] = await db
      .update(examCenters)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(examCenters.id, examCenter.id))
      .returning();

    if (!updated) {
      return { success: false, error: 'Failed to update exam configuration' };
    }

    logger.info(MODULE_FN, 'Exam configuration updated', {
      id: examCenter.id,
      season: data.season,
      examYear: data.examYear,
    });
    revalidatePath('/exam-center/settings');
    revalidatePath('/onboarding');

    return { success: true, data: updated };
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to update exam configuration', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update exam configuration',
    };
  }
}

// ============================================
// Helper Operations
// ============================================

export async function checkExamCenterExists() {
  const MODULE_FN = `${MODULE}.checkExamCenterExists`;

  try {
    const examCenter = await getCurrentExamCenter();
    const exists = !!examCenter;

    logger.debug(MODULE_FN, `Exam center exists: ${exists}`);
    return { success: true, data: exists };
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to check exam center existence', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function isExamCenterConfigured() {
  const MODULE_FN = `${MODULE}.isExamCenterConfigured`;

  try {
    const examCenter = await getCurrentExamCenter();

    const configured =
      !!examCenter &&
      !!examCenter.code &&
      !!examCenter.name &&
      !!examCenter.season &&
      !!examCenter.examYear &&
      !!examCenter.distCenterCode;

    logger.debug(MODULE_FN, `Exam center configured: ${configured}`);
    return { success: true, data: configured };
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to check exam center configuration', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
