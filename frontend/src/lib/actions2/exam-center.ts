// lib/actions/exam-center.ts - FIXED
'use server';

import { revalidatePath } from 'next/cache';

import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { examCenters } from '@/lib/db/schema';
import { getCurrentOrg } from '@/lib/session';

export async function getExamCenter() {
  try {
    const { orgId } = await getCurrentOrg();

    const examCenter = await db.query.examCenters.findFirst({
      where: eq(examCenters.orgId, orgId),
    });

    // Ensure consistent type conversion
    const formattedCenter = examCenter
      ? {
          ...examCenter,
          season: examCenter.season as 'Summer' | 'Winter' | null,
          startDate: examCenter.startDate ? new Date(examCenter.startDate) : null,
          endDate: examCenter.endDate ? new Date(examCenter.endDate) : null,
        }
      : null;

    return { success: true, data: formattedCenter };
  } catch (error) {
    console.error('Failed to fetch exam center:', error);
    return { success: false, error: 'Failed to fetch exam center', data: null };
  }
}

export async function updateExamCenter(data: {
  name: string;
  address?: string | null;
  officerIncharge?: string | null;
  sealingSupervisor?: string | null;
  distCenterCode?: string | null;
  distCenterName?: string | null;
  season?: 'Summer' | 'Winter' | null;
  examYear?: number | null;
  startDate?: Date | null;
  endDate?: Date | null;
  departments?: string[];
}) {
  try {
    const { orgId } = await getCurrentOrg();

    const existing = await db.query.examCenters.findFirst({
      where: eq(examCenters.orgId, orgId),
    });

    let examCenter;

    if (!existing) {
      // Generate code from name if not provided
      const generatedCode = data.name
        .substring(0, 10)
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '');

      const [created] = await db
        .insert(examCenters)
        .values({
          orgId,
          code: generatedCode,
          name: data.name,
          address: data.address,
          officerIncharge: data.officerIncharge,
          sealingSupervisor: data.sealingSupervisor,
          distCenterCode: data.distCenterCode,
          distCenterName: data.distCenterName,
          season: data.season,
          examYear: data.examYear,
          startDate: data.startDate,
          endDate: data.endDate,
          departments: data.departments || [],
        })
        .returning();
      examCenter = created;
    } else {
      const [updated] = await db
        .update(examCenters)
        .set({
          name: data.name,
          address: data.address,
          officerIncharge: data.officerIncharge,
          sealingSupervisor: data.sealingSupervisor,
          distCenterCode: data.distCenterCode,
          distCenterName: data.distCenterName,
          season: data.season,
          examYear: data.examYear,
          startDate: data.startDate,
          endDate: data.endDate,
          departments: data.departments,
          updatedAt: new Date(),
        })
        .where(eq(examCenters.orgId, orgId))
        .returning();
      examCenter = updated;
    }

    revalidatePath('/exam-center/settings');
    revalidatePath('/exam-center/configuration');

    // Return with consistent date types
    return {
      success: true,
      data: {
        ...examCenter,
        season: examCenter.season as 'Summer' | 'Winter' | null,
        startDate: examCenter.startDate ? new Date(examCenter.startDate) : null,
        endDate: examCenter.endDate ? new Date(examCenter.endDate) : null,
      },
    };
  } catch (error) {
    console.error('Failed to update exam center:', error);
    return { success: false, error: 'Failed to update exam center' };
  }
}
