// lib/actions/exam-center.ts
'use server';

import { revalidatePath } from 'next/cache';

import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { examCenters } from '@/lib/db/schema';
import { getCurrentOrg } from '@/lib/session';

export async function getExamCenter() {
  const { orgId } = await getCurrentOrg();

  const examCenter = await db.query.examCenters.findFirst({
    where: eq(examCenters.orgId, orgId),
  });

  return examCenter;
}

export async function updateExamCenter(data: {
  code?: string;
  name?: string;
  address?: string;
  officerIncharge?: string;
  sealingSupervisor?: string;
  distCenterCode?: string;
  distCenterName?: string;
  season?: string;
  examYear?: number;
  startDate?: Date;
  endDate?: Date;
  departments?: string[];
}) {
  const { orgId } = await getCurrentOrg();

  const existing = await db.query.examCenters.findFirst({
    where: eq(examCenters.orgId, orgId),
  });

  if (!existing) {
    const [examCenter] = await db
      .insert(examCenters)
      .values({
        orgId,
        ...data,
      } as any)
      .returning();
    revalidatePath('/exam-center/settings');
    return examCenter;
  }

  const [examCenter] = await db
    .update(examCenters)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(examCenters.orgId, orgId))
    .returning();

  revalidatePath('/exam-center/settings');
  return examCenter;
}

export async function checkExamCenterExists() {
  const { orgId } = await getCurrentOrg();

  const examCenter = await db.query.examCenters.findFirst({
    where: eq(examCenters.orgId, orgId),
  });

  return !!examCenter;
}
