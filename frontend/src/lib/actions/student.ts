// lib/actions/student.ts
'use server';

import { revalidatePath } from 'next/cache';

import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { connectedInstitutes, students } from '@/lib/db/schema';
import { getCurrentExamCenter } from '@/lib/session';

export async function getStudents(params?: {
  instituteId?: string;
  seatNumber?: number;
  enrollmentNumber?: string;
  scheme?: string;
  limit?: number;
  offset?: number;
}) {
  const examCenter = await getCurrentExamCenter();
  if (!examCenter?.id) throw new Error('Exam center not found');

  const conditions = [eq(students.examCenterId, examCenter.id), eq(students.isDeleted, false)];

  if (params?.instituteId) {
    conditions.push(eq(students.connectedInstituteId, params.instituteId));
  }
  if (params?.seatNumber) {
    conditions.push(eq(students.seatNumber, params.seatNumber));
  }
  if (params?.enrollmentNumber) {
    conditions.push(eq(students.enrollmentNumber, params.enrollmentNumber));
  }
  if (params?.scheme) {
    conditions.push(eq(students.scheme, params.scheme));
  }

  const query = db.query.students.findMany({
    where: and(...conditions),
    orderBy: (students, { asc }) => [asc(students.seatNumber)],
    limit: params?.limit,
    offset: params?.offset,
  });

  return query;
}

export async function getStudentById(id: string) {
  const examCenter = await getCurrentExamCenter();
  if (!examCenter?.id) throw new Error('Exam center not found');

  return db.query.students.findFirst({
    where: and(eq(students.id, id), eq(students.examCenterId, examCenter.id)),
  });
}

export async function getStudentBySeatNumber(seatNumber: number) {
  const examCenter = await getCurrentExamCenter();
  if (!examCenter?.id) throw new Error('Exam center not found');

  return db.query.students.findFirst({
    where: and(
      eq(students.examCenterId, examCenter.id),
      eq(students.seatNumber, seatNumber),
      eq(students.isDeleted, false)
    ),
  });
}

export async function getStudentByEnrollment(enrollmentNumber: string) {
  const examCenter = await getCurrentExamCenter();
  if (!examCenter?.id) throw new Error('Exam center not found');

  return db.query.students.findFirst({
    where: and(
      eq(students.examCenterId, examCenter.id),
      eq(students.enrollmentNumber, enrollmentNumber),
      eq(students.isDeleted, false)
    ),
  });
}

export async function createStudent(data: {
  connectedInstituteId: string;
  seatNumber: number;
  instituteCode?: string;
  enrollmentNumber?: string;
  name?: string;
  scheme?: string;
  subjects?: string[];
  subCodes?: string[];
}) {
  const examCenter = await getCurrentExamCenter();
  if (!examCenter?.id) throw new Error('Exam center not found');

  // Check for duplicate seat number
  const existing = await getStudentBySeatNumber(data.seatNumber);
  if (existing) {
    throw new Error(`Student with seat number ${data.seatNumber} already exists`);
  }

  const [student] = await db
    .insert(students)
    .values({
      examCenterId: examCenter.id,
      subjects: data.subjects || [],
      subCodes: data.subCodes || [],
      ...data,
    })
    .returning();

  revalidatePath('/exam-center/students');
  return student;
}

export async function updateStudent(
  id: string,
  data: {
    connectedInstituteId?: string;
    seatNumber?: number;
    instituteCode?: string;
    enrollmentNumber?: string;
    name?: string;
    scheme?: string;
    subjects?: string[];
    subCodes?: string[];
  }
) {
  const examCenter = await getCurrentExamCenter();
  if (!examCenter?.id) throw new Error('Exam center not found');

  const [student] = await db
    .update(students)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(students.id, id), eq(students.examCenterId, examCenter.id)))
    .returning();

  revalidatePath('/exam-center/students');
  return student;
}

export async function deleteStudent(id: string) {
  const examCenter = await getCurrentExamCenter();
  if (!examCenter?.id) throw new Error('Exam center not found');

  await db
    .update(students)
    .set({ isDeleted: true, updatedAt: new Date() })
    .where(and(eq(students.id, id), eq(students.examCenterId, examCenter.id)));

  revalidatePath('/exam-center/students');
}

export async function bulkCreateStudents(
  studentsData: Array<{
    connectedInstituteId: string;
    seatNumber: number;
    instituteCode?: string;
    enrollmentNumber?: string;
    name?: string;
    scheme?: string;
    subjects?: string[];
    subCodes?: string[];
  }>
) {
  const examCenter = await getCurrentExamCenter();
  if (!examCenter?.id) throw new Error('Exam center not found');

  const values = studentsData.map(student => ({
    examCenterId: examCenter.id,
    subjects: student.subjects || [],
    subCodes: student.subCodes || [],
    ...student,
  }));

  // Use insert with conflict handling
  const results = await db.insert(students).values(values).returning();

  revalidatePath('/exam-center/students');
  return results;
}

export async function getStudentCountByInstitute() {
  const examCenter = await getCurrentExamCenter();
  if (!examCenter?.id) throw new Error('Exam center not found');

  const institutes = await db.query.connectedInstitutes.findMany({
    where: eq(connectedInstitutes.examCenterId, examCenter.id),
  });

  const counts: Record<string, number> = {};

  for (const institute of institutes) {
    const count = await db
      .select({ count: sql<number>`count(*)` })
      .from(students)
      .where(
        and(
          eq(students.examCenterId, examCenter.id),
          eq(students.connectedInstituteId, institute.id),
          eq(students.isDeleted, false)
        )
      )
      .then(res => Number(res[0]?.count || 0));

    counts[institute.id] = count;
  }

  return counts;
}

export async function getStudentBySubject(subjectCode: string) {
  const examCenter = await getCurrentExamCenter();
  if (!examCenter?.id) throw new Error('Exam center not found');

  return db.query.students.findMany({
    where: and(
      eq(students.examCenterId, examCenter.id),
      sql`${students.subCodes} @> ARRAY[${subjectCode}]::text[]`,
      eq(students.isDeleted, false)
    ),
    orderBy: (students, { asc }) => [asc(students.seatNumber)],
  });
}
