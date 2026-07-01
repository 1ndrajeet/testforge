// lib/actions/student.ts
'use server';

import { revalidatePath } from 'next/cache';

import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { connectedInstitutes, students, subjects } from '@/lib/db/schema';
import { logger } from '@/lib/misc/logger';
import { getCurrentExamCenter, getExamCenterId } from '@/lib/session';

const MODULE = 'student';

export interface StudentSeatingData {
  id: string;
  seatNumber: number;
  enrollmentNumber: string | null;
  name: string | null;
  scheme: string | null;
  instituteCode: string;
  instituteName: string;
  subjects: string[];
  subCodes: string[];
}

export interface SeatingChartStats {
  totalStudents: number;
  totalInstitutes: number;
  totalSchemes: number;
}

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

  if (params?.instituteId) conditions.push(eq(students.connectedInstituteId, params.instituteId));
  if (params?.seatNumber) conditions.push(eq(students.seatNumber, params.seatNumber));
  if (params?.enrollmentNumber)
    conditions.push(eq(students.enrollmentNumber, params.enrollmentNumber));
  if (params?.scheme) conditions.push(eq(students.scheme, params.scheme));

  return db.query.students.findMany({
    where: and(...conditions),
    orderBy: (students, { asc }) => [asc(students.seatNumber)],
    limit: params?.limit,
    offset: params?.offset,
  });
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
      eq(students.isDeleted, false),
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
      eq(students.isDeleted, false),
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
  },
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
  }>,
) {
  const examCenter = await getCurrentExamCenter();
  if (!examCenter?.id) throw new Error('Exam center not found');

  const values = studentsData.map((student) => ({
    examCenterId: examCenter.id,
    subjects: student.subjects || [],
    subCodes: student.subCodes || [],
    ...student,
  }));

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
          eq(students.isDeleted, false),
        ),
      )
      .then((res) => Number(res[0]?.count || 0));

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
      eq(students.isDeleted, false),
    ),
    orderBy: (students, { asc }) => [asc(students.seatNumber)],
  });
}

export async function getSeatingChartStats(): Promise<{
  success: boolean;
  data: SeatingChartStats;
  error?: string;
}> {
  try {
    const examCenter = await getCurrentExamCenter();
    if (!examCenter?.id) throw new Error('Exam center not found');

    const [{ count: studentCount }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(students)
      .where(and(eq(students.examCenterId, examCenter.id), eq(students.isDeleted, false)));

    const [{ count: instituteCount }] = await db
      .select({ count: sql<number>`count(distinct ${students.connectedInstituteId})` })
      .from(students)
      .where(and(eq(students.examCenterId, examCenter.id), eq(students.isDeleted, false)));

    const [{ count: schemeCount }] = await db
      .select({ count: sql<number>`count(distinct ${students.scheme})` })
      .from(students)
      .where(and(eq(students.examCenterId, examCenter.id), eq(students.isDeleted, false)));

    return {
      success: true,
      data: {
        totalStudents: Number(studentCount || 0),
        totalInstitutes: Number(instituteCount || 0),
        totalSchemes: Number(schemeCount || 0),
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      data: { totalStudents: 0, totalInstitutes: 0, totalSchemes: 0 },
    };
  }
}

export async function getUniqueInstitutesForSeating(): Promise<{
  success: boolean;
  data: Array<{ code: string; name: string; count: number }>;
  error?: string;
}> {
  try {
    const examCenter = await getCurrentExamCenter();
    if (!examCenter?.id) throw new Error('Exam center not found');

    const results = await db
      .select({
        code: connectedInstitutes.instituteCode,
        name: connectedInstitutes.instituteName,
        count: sql<number>`count(${students.id})`,
      })
      .from(connectedInstitutes)
      .leftJoin(students, eq(students.connectedInstituteId, connectedInstitutes.id))
      .where(
        and(eq(connectedInstitutes.examCenterId, examCenter.id), eq(students.isDeleted, false)),
      )
      .groupBy(connectedInstitutes.id)
      .orderBy(connectedInstitutes.instituteCode);

    return { success: true, data: results };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      data: [],
    };
  }
}

export async function hasSeatingData(): Promise<
  { success: true; data: boolean } | { success: false; error: string }
> {
  try {
    const examCenter = await getCurrentExamCenter();
    if (!examCenter?.id) throw new Error('Exam center not found');

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(students)
      .where(and(eq(students.examCenterId, examCenter.id), eq(students.isDeleted, false)));

    return { success: true, data: Number(count || 0) > 0 };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function getUniqueSchemesForSeating(): Promise<{
  success: boolean;
  data: Array<{ scheme: string; subjects: Array<{ code: string; name: string }> }>;
  error?: string;
}> {
  try {
    const examCenterId = await getExamCenterId();
    if (!examCenterId) {
      return { success: true, data: [] };
    }

    const [schemeResults, allSubjects] = await Promise.all([
      db
        .selectDistinct({ scheme: students.scheme })
        .from(students)
        .where(and(eq(students.examCenterId, examCenterId), eq(students.isDeleted, false)))
        .orderBy(students.scheme),
      db.query.subjects.findMany({
        where: eq(subjects.isDeleted, false),
        columns: { code: true, name: true, scheme: true },
      }),
    ]);

    const schemes = schemeResults.map((r) => r.scheme).filter(Boolean) as string[];
    const schemeMap = new Map<string, Array<{ code: string; name: string }>>();

    allSubjects.forEach((subject) => {
      if (!schemeMap.has(subject.scheme)) {
        schemeMap.set(subject.scheme, []);
      }
      schemeMap.get(subject.scheme)!.push({ code: subject.code, name: subject.name });
    });

    const result = schemes.map((scheme) => ({
      scheme,
      subjects: schemeMap.get(scheme) || [],
    }));

    result.push({
      scheme: '__ALL__',
      subjects: allSubjects.map((s) => ({ code: s.code, name: s.name })),
    });

    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      data: [],
    };
  }
}

export const getUniqueSchemes = getUniqueSchemesForSeating;

export async function getPaginatedStudentSeatingData(params?: {
  instituteCode?: string;
  scheme?: string;
  search?: string;
  page?: number;
  limit?: number;
}): Promise<{
  success: boolean;
  data: StudentSeatingData[];
  pagination: { total: number; page: number; limit: number; totalPages: number };
  error?: string;
}> {
  try {
    const examCenter = await getCurrentExamCenter();
    if (!examCenter?.id) throw new Error('Exam center not found');

    const page = Math.max(1, params?.page || 1);
    const limit = Math.min(100, params?.limit || 25);
    const offset = (page - 1) * limit;

    const conditions = [eq(students.examCenterId, examCenter.id), eq(students.isDeleted, false)];

    if (params?.instituteCode) {
      conditions.push(eq(connectedInstitutes.instituteCode, params.instituteCode));
    }
    if (params?.scheme) {
      conditions.push(eq(students.scheme, params.scheme));
    }

    let searchCondition = sql`1=1`;
    if (params?.search?.trim()) {
      const term = `%${params.search.trim()}%`;
      searchCondition = sql`
        ${students.seatNumber}::text ILIKE ${term} OR
        ${students.enrollmentNumber} ILIKE ${term} OR
        ${students.name} ILIKE ${term}
      `;
    }

    const [countResult, results] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)` })
        .from(students)
        .leftJoin(connectedInstitutes, eq(students.connectedInstituteId, connectedInstitutes.id))
        .where(and(...conditions, searchCondition)),
      db
        .select({
          id: students.id,
          seatNumber: students.seatNumber,
          enrollmentNumber: students.enrollmentNumber,
          name: students.name,
          scheme: students.scheme,
          instituteCode: connectedInstitutes.instituteCode,
          instituteName: connectedInstitutes.instituteName,
          subjects: students.subjects,
          subCodes: students.subCodes,
        })
        .from(students)
        .leftJoin(connectedInstitutes, eq(students.connectedInstituteId, connectedInstitutes.id))
        .where(and(...conditions, searchCondition))
        .orderBy(students.seatNumber)
        .limit(limit)
        .offset(offset),
    ]);

    const total = Number(countResult[0]?.count || 0);

    return {
      success: true,
      data: results as StudentSeatingData[],
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      data: [],
      pagination: { total: 0, page: 1, limit: 25, totalPages: 0 },
    };
  }
}
