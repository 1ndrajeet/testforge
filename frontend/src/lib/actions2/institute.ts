// lib/actions/institute.ts
'use server';

import { revalidatePath } from 'next/cache';

import instituteNames from '@/config/institute_map.json';
import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { connectedInstitutes } from '@/lib/db/schema';
import { getCurrentExamCenter } from '@/lib/session';

export async function getInstituteInfo(instituteCode: string) {
  if (!instituteCode) {
    return { success: false, error: 'Institute code is required' };
  }

  const instituteName = (instituteNames as Record<string, string>)[instituteCode];

  if (!instituteName) {
    return { success: false, error: `Institute with code ${instituteCode} not found` };
  }

  return {
    success: true,
    data: { CODE: instituteCode, NAME: instituteName },
  };
}

export async function getConnectedInstitutes() {
  const examCenter = await getCurrentExamCenter();
  if (!examCenter?.id) {
    return { success: true, data: [] };
  }

  const institutes = await db.query.connectedInstitutes.findMany({
    where: eq(connectedInstitutes.examCenterId, examCenter.id),
    orderBy: (inst, { asc }) => [asc(inst.instituteCode)],
  });

  const transformed = institutes.map((inst) => ({
    id: inst.id,
    CODE: inst.instituteCode,
    NAME: inst.instituteName,
  }));

  return { success: true, data: transformed };
}

export async function addConnectedInstitute(data: {
  instituteCode: string;
  instituteName: string;
}) {
  const examCenter = await getCurrentExamCenter();
  if (!examCenter?.id) {
    return { success: false, error: 'Exam center not found' };
  }

  const existing = await db.query.connectedInstitutes.findFirst({
    where: and(
      eq(connectedInstitutes.examCenterId, examCenter.id),
      eq(connectedInstitutes.instituteCode, data.instituteCode),
    ),
  });

  if (existing) {
    return { success: false, error: `Institute ${data.instituteCode} already connected` };
  }

  const [institute] = await db
    .insert(connectedInstitutes)
    .values({
      examCenterId: examCenter.id,
      instituteCode: data.instituteCode,
      instituteName: data.instituteName,
    })
    .returning();

  revalidatePath('/exam-center/settings');

  return {
    success: true,
    data: { id: institute.id, CODE: institute.instituteCode, NAME: institute.instituteName },
  };
}

export async function removeConnectedInstitute(id: string) {
  const examCenter = await getCurrentExamCenter();
  if (!examCenter?.id) {
    return { success: false, error: 'Exam center not found' };
  }

  await db
    .delete(connectedInstitutes)
    .where(
      and(eq(connectedInstitutes.id, id), eq(connectedInstitutes.examCenterId, examCenter.id)),
    );

  revalidatePath('/exam-center/settings');
  return { success: true };
}

export async function updateInstituteName(id: string, newName: string) {
  const examCenter = await getCurrentExamCenter();
  if (!examCenter?.id) {
    return { success: false, error: 'Exam center not found' };
  }

  const [updated] = await db
    .update(connectedInstitutes)
    .set({ instituteName: newName, updatedAt: new Date() })
    .where(and(eq(connectedInstitutes.id, id), eq(connectedInstitutes.examCenterId, examCenter.id)))
    .returning();

  if (!updated) {
    return { success: false, error: 'Institute not found' };
  }

  revalidatePath('/exam-center/settings');
  return { success: true, data: updated };
}
