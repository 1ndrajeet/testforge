// lib/actions/institute.ts
'use server';

import { revalidatePath } from 'next/cache';

import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { connectedInstitutes } from '@/lib/db/schema';
import { getCurrentExamCenter } from '@/lib/session';

export async function getConnectedInstitutes() {
  const examCenter = await getCurrentExamCenter();
  if (!examCenter?.id) throw new Error('Exam center not found');

  return db.query.connectedInstitutes.findMany({
    where: eq(connectedInstitutes.examCenterId, examCenter.id),
    orderBy: (institutes, { asc }) => [asc(institutes.instituteCode)],
  });
}

export async function getInstituteById(id: string) {
  const examCenter = await getCurrentExamCenter();
  if (!examCenter?.id) throw new Error('Exam center not found');

  return db.query.connectedInstitutes.findFirst({
    where: and(eq(connectedInstitutes.id, id), eq(connectedInstitutes.examCenterId, examCenter.id)),
  });
}

export async function createInstitute(data: { instituteCode: string; instituteName: string }) {
  const examCenter = await getCurrentExamCenter();
  if (!examCenter?.id) throw new Error('Exam center not found');

  // Check for duplicate
  const existing = await db.query.connectedInstitutes.findFirst({
    where: and(
      eq(connectedInstitutes.examCenterId, examCenter.id),
      eq(connectedInstitutes.instituteCode, data.instituteCode)
    ),
  });

  if (existing) {
    throw new Error(`Institute with code ${data.instituteCode} already exists`);
  }

  const [institute] = await db
    .insert(connectedInstitutes)
    .values({
      examCenterId: examCenter.id,
      ...data,
    })
    .returning();

  revalidatePath('/exam-center/exam-setup/institutes');
  return institute;
}

export async function updateInstitute(
  id: string,
  data: {
    instituteCode?: string;
    instituteName?: string;
    isActive?: boolean;
  }
) {
  const examCenter = await getCurrentExamCenter();
  if (!examCenter?.id) throw new Error('Exam center not found');

  const [institute] = await db
    .update(connectedInstitutes)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(connectedInstitutes.id, id), eq(connectedInstitutes.examCenterId, examCenter.id)))
    .returning();

  revalidatePath('/exam-center/exam-setup/institutes');
  return institute;
}

export async function deleteInstitute(id: string) {
  const examCenter = await getCurrentExamCenter();
  if (!examCenter?.id) throw new Error('Exam center not found');

  await db
    .delete(connectedInstitutes)
    .where(and(eq(connectedInstitutes.id, id), eq(connectedInstitutes.examCenterId, examCenter.id)));

  revalidatePath('/exam-center/exam-setup/institutes');
}

export async function bulkCreateInstitutes(institutes: Array<{ instituteCode: string; instituteName: string }>) {
  const examCenter = await getCurrentExamCenter();
  if (!examCenter?.id) throw new Error('Exam center not found');

  const values = institutes.map(inst => ({
    examCenterId: examCenter.id,
    instituteCode: inst.instituteCode,
    instituteName: inst.instituteName,
  }));

  const results = await db.insert(connectedInstitutes).values(values).returning();

  revalidatePath('/exam-center/exam-setup/institutes');
  return results;
}
