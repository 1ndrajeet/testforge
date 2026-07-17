// lib/actions/student.ts
'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, sql, inArray } from 'drizzle-orm';

import { db } from '@/lib/db';
import { connectedInstitutes, students, subjects } from '@/lib/db/schema';
import { logger } from '@/lib/misc/logger';
import { getExamCenterId } from '@/lib/session';

const MODULE = 'student';

// ============================================
// Types
// ============================================

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

// ============================================
// Helpers
// ============================================

async function getExamCenterIdOrThrow() {
  const id = await getExamCenterId();
  if (!id) throw new Error('Exam center not found');
  return id;
}

// ============================================
// Read Operations - OPTIMIZED
// ============================================

export async function getStudents(params?: {
  instituteId?: string;
  seatNumber?: number;
  enrollmentNumber?: string;
  scheme?: string;
  limit?: number;
  offset?: number;
}) {
  const fn = `${MODULE}.getStudents`;
  const start = performance.now();

  try {
    const examCenterId = await getExamCenterIdOrThrow();

    const conditions = [eq(students.examCenterId, examCenterId), eq(students.isDeleted, false)];
    if (params?.instituteId) conditions.push(eq(students.connectedInstituteId, params.instituteId));
    if (params?.seatNumber) conditions.push(eq(students.seatNumber, params.seatNumber));
    if (params?.enrollmentNumber) conditions.push(eq(students.enrollmentNumber, params.enrollmentNumber));
    if (params?.scheme) conditions.push(eq(students.scheme, params.scheme));

    const result = await db.query.students.findMany({
      where: and(...conditions),
      orderBy: (students, { asc }) => [asc(students.seatNumber)],
      limit: params?.limit,
      offset: params?.offset,
    });

    const duration = performance.now() - start;
    logger.debug(fn, `Fetched ${result.length} students in ${duration.toFixed(0)}ms`);

    return result;
  } catch (error) {
    logger.error(fn, 'Failed to fetch students', { error });
    throw error;
  }
}

export async function getStudentById(id: string) {
  const fn = `${MODULE}.getStudentById`;

  try {
    const examCenterId = await getExamCenterIdOrThrow();

    return await db.query.students.findFirst({
      where: and(eq(students.id, id), eq(students.examCenterId, examCenterId)),
    });
  } catch (error) {
    logger.error(fn, 'Failed to fetch student by id', { error });
    return null;
  }
}

export async function getStudentBySeatNumber(seatNumber: number) {
  const fn = `${MODULE}.getStudentBySeatNumber`;

  try {
    const examCenterId = await getExamCenterIdOrThrow();

    return await db.query.students.findFirst({
      where: and(
        eq(students.examCenterId, examCenterId),
        eq(students.seatNumber, seatNumber),
        eq(students.isDeleted, false),
      ),
    });
  } catch (error) {
    logger.error(fn, 'Failed to fetch student by seat number', { error });
    return null;
  }
}

export async function getStudentByEnrollment(enrollmentNumber: string) {
  const fn = `${MODULE}.getStudentByEnrollment`;

  try {
    const examCenterId = await getExamCenterIdOrThrow();

    return await db.query.students.findFirst({
      where: and(
        eq(students.examCenterId, examCenterId),
        eq(students.enrollmentNumber, enrollmentNumber),
        eq(students.isDeleted, false),
      ),
    });
  } catch (error) {
    logger.error(fn, 'Failed to fetch student by enrollment', { error });
    return null;
  }
}

// ============================================
// OPTIMIZED: getSeatingChartStats - SINGLE QUERY
// ============================================

export async function getSeatingChartStats(): Promise<{
  success: boolean;
  data: SeatingChartStats;
  error?: string;
}> {
  const fn = `${MODULE}.getSeatingChartStats`;
  const start = performance.now();

  try {
    const examCenterId = await getExamCenterId();
    if (!examCenterId) {
      return { success: true, data: { totalStudents: 0, totalInstitutes: 0, totalSchemes: 0 } };
    }

    // ✅ SINGLE QUERY with all stats
    const result = await db.execute(sql`
      SELECT
        COUNT(*) as total_students,
        COUNT(DISTINCT connected_institute_id) as total_institutes,
        COUNT(DISTINCT scheme) as total_schemes
      FROM students
      WHERE exam_center_id = ${examCenterId}
        AND is_deleted = false
    `);

    const row = result.rows[0] as any;

    const duration = performance.now() - start;
    logger.debug(fn, `Stats fetched in ${duration.toFixed(0)}ms`);

    return {
      success: true,
      data: {
        totalStudents: Number(row?.total_students || 0),
        totalInstitutes: Number(row?.total_institutes || 0),
        totalSchemes: Number(row?.total_schemes || 0),
      },
    };
  } catch (error) {
    logger.error(fn, 'Failed to fetch seating chart stats', { error });
    return {
      success: false,
      error: 'Failed to fetch stats',
      data: { totalStudents: 0, totalInstitutes: 0, totalSchemes: 0 },
    };
  }
}

// ============================================
// OPTIMIZED: getUniqueInstitutesForSeating - SINGLE QUERY
// ============================================

export async function getUniqueInstitutesForSeating(): Promise<{
  success: boolean;
  data: Array<{ code: string; name: string; count: number }>;
  error?: string;
}> {
  const fn = `${MODULE}.getUniqueInstitutesForSeating`;
  const start = performance.now();

  try {
    const examCenterId = await getExamCenterId();
    if (!examCenterId) {
      return { success: true, data: [] };
    }

    const results = await db
      .select({
        code: connectedInstitutes.instituteCode,
        name: connectedInstitutes.instituteName,
        count: sql<number>`count(${students.id})`,
      })
      .from(connectedInstitutes)
      .leftJoin(students, eq(students.connectedInstituteId, connectedInstitutes.id))
      .where(
        and(
          eq(connectedInstitutes.examCenterId, examCenterId),
          eq(students.isDeleted, false),
        ),
      )
      .groupBy(connectedInstitutes.id)
      .orderBy(connectedInstitutes.instituteCode);

    const duration = performance.now() - start;
    logger.debug(fn, `Fetched ${results.length} institutes in ${duration.toFixed(0)}ms`);

    return { success: true, data: results };
  } catch (error) {
    logger.error(fn, 'Failed to fetch unique institutes', { error });
    return { success: false, error: 'Failed to fetch institutes', data: [] };
  }
}

// ============================================
// OPTIMIZED: hasSeatingData - EXISTS instead of COUNT
// ============================================

export async function hasSeatingData(): Promise<
  { success: true; data: boolean } | { success: false; error: string }
> {
  const fn = `${MODULE}.hasSeatingData`;
  const start = performance.now();

  try {
    const examCenterId = await getExamCenterId();
    if (!examCenterId) {
      return { success: true, data: false };
    }

    // ✅ EXISTS is faster than COUNT
    const result = await db.execute(sql`
      SELECT EXISTS(
        SELECT 1 FROM students
        WHERE exam_center_id = ${examCenterId}
          AND is_deleted = false
        LIMIT 1
      ) as exists
    `);

    const hasData = (result.rows[0] as any)?.exists === true;

    const duration = performance.now() - start;
    logger.debug(fn, `Checked seating data in ${duration.toFixed(0)}ms: ${hasData}`);

    return { success: true, data: hasData };
  } catch (error) {
    logger.error(fn, 'Failed to check seating data', { error });
    return { success: false, error: 'Failed to check seating data' };
  }
}

// ============================================
// OPTIMIZED: getUniqueSchemesForSeating - with IN clause
// ============================================

export async function getUniqueSchemesForSeating(): Promise<{
  success: boolean;
  data: Array<{ scheme: string; subjects: Array<{ code: string; name: string }> }>;
  error?: string;
}> {
  const fn = `${MODULE}.getUniqueSchemesForSeating`;
  const start = performance.now();

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

    for (const subject of allSubjects) {
      if (!schemeMap.has(subject.scheme)) {
        schemeMap.set(subject.scheme, []);
      }
      schemeMap.get(subject.scheme)!.push({ code: subject.code, name: subject.name });
    }

    const result = schemes.map((scheme) => ({
      scheme,
      subjects: schemeMap.get(scheme) || [],
    }));

    result.push({
      scheme: '__ALL__',
      subjects: allSubjects.map((s) => ({ code: s.code, name: s.name })),
    });

    const duration = performance.now() - start;
    logger.debug(fn, `Fetched ${result.length} schemes in ${duration.toFixed(0)}ms`);

    return { success: true, data: result };
  } catch (error) {
    logger.error(fn, 'Failed to fetch unique schemes', { error });
    return { success: false, error: 'Failed to fetch schemes', data: [] };
  }
}

export const getUniqueSchemes = getUniqueSchemesForSeating;

// ============================================
// OPTIMIZED: getPaginatedStudentSeatingData
// ============================================

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
  const fn = `${MODULE}.getPaginatedStudentSeatingData`;
  const start = performance.now();

  try {
    const examCenterId = await getExamCenterId();
    if (!examCenterId) {
      return {
        success: true,
        data: [],
        pagination: { total: 0, page: 1, limit: 25, totalPages: 0 },
      };
    }

    const page = Math.max(1, params?.page || 1);
    const limit = Math.min(100, params?.limit || 25);
    const offset = (page - 1) * limit;

    const conditions = [eq(students.examCenterId, examCenterId), eq(students.isDeleted, false)];

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
    const totalPages = Math.ceil(total / limit);

    const duration = performance.now() - start;
    logger.debug(fn, `Fetched ${results.length} students (page ${page}/${totalPages}) in ${duration.toFixed(0)}ms`);

    return {
      success: true,
      data: results as StudentSeatingData[],
      pagination: {
        total,
        page,
        limit,
        totalPages,
      },
    };
  } catch (error) {
    logger.error(fn, 'Failed to fetch paginated seating data', { error });
    return {
      success: false,
      error: 'Failed to fetch seating data',
      data: [],
      pagination: { total: 0, page: 1, limit: 25, totalPages: 0 },
    };
  }
}

// ============================================
// Write Operations - OPTIMIZED
// ============================================

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
  const fn = `${MODULE}.createStudent`;

  try {
    const examCenterId = await getExamCenterIdOrThrow();

    const existing = await getStudentBySeatNumber(data.seatNumber);
    if (existing) {
      throw new Error(`Student with seat number ${data.seatNumber} already exists`);
    }

    const [student] = await db
      .insert(students)
      .values({
        examCenterId,
        subjects: data.subjects || [],
        subCodes: data.subCodes || [],
        ...data,
      })
      .returning();

    logger.info(fn, 'Student created', { seatNumber: data.seatNumber });
    revalidatePath('/exam-center/students');
    return student;
  } catch (error) {
    logger.error(fn, 'Failed to create student', { error });
    throw error;
  }
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
  const fn = `${MODULE}.updateStudent`;

  try {
    const examCenterId = await getExamCenterIdOrThrow();

    const [student] = await db
      .update(students)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(students.id, id), eq(students.examCenterId, examCenterId)))
      .returning();

    logger.info(fn, 'Student updated', { id });
    revalidatePath('/exam-center/students');
    return student;
  } catch (error) {
    logger.error(fn, 'Failed to update student', { error });
    throw error;
  }
}

export async function deleteStudent(id: string) {
  const fn = `${MODULE}.deleteStudent`;

  try {
    const examCenterId = await getExamCenterIdOrThrow();

    await db
      .update(students)
      .set({ isDeleted: true, updatedAt: new Date() })
      .where(and(eq(students.id, id), eq(students.examCenterId, examCenterId)));

    logger.info(fn, 'Student deleted (soft)', { id });
    revalidatePath('/exam-center/students');
  } catch (error) {
    logger.error(fn, 'Failed to delete student', { error });
    throw error;
  }
}

// ============================================
// OPTIMIZED: bulkCreateStudents - BATCH INSERT
// ============================================

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
  const fn = `${MODULE}.bulkCreateStudents`;
  const start = performance.now();

  try {
    const examCenterId = await getExamCenterIdOrThrow();

    if (studentsData.length === 0) {
      return [];
    }

    const values = studentsData.map((student) => ({
      examCenterId,
      subjects: student.subjects || [],
      subCodes: student.subCodes || [],
      ...student,
    }));

    // Batch insert
    const BATCH_SIZE = 500;
    const results = [];

    for (let i = 0; i < values.length; i += BATCH_SIZE) {
      const batch = values.slice(i, i + BATCH_SIZE);
      const inserted = await db.insert(students).values(batch).returning();
      results.push(...inserted);
    }

    const duration = performance.now() - start;
    logger.info(fn, `Bulk created ${results.length} students in ${duration.toFixed(0)}ms`);

    revalidatePath('/exam-center/students');
    return results;
  } catch (error) {
    logger.error(fn, 'Failed to bulk create students', { error });
    throw error;
  }
}

// ============================================
// getStudentCountByInstitute - OPTIMIZED with GROUP BY
// ============================================

export async function getStudentCountByInstitute() {
  const fn = `${MODULE}.getStudentCountByInstitute`;
  const start = performance.now();

  try {
    const examCenterId = await getExamCenterId();
    if (!examCenterId) {
      return {};
    }

    // ✅ SINGLE QUERY with GROUP BY instead of loop
    const results = await db
      .select({
        instituteId: students.connectedInstituteId,
        count: sql<number>`count(*)`,
      })
      .from(students)
      .where(and(eq(students.examCenterId, examCenterId), eq(students.isDeleted, false)))
      .groupBy(students.connectedInstituteId);

    const counts: Record<string, number> = {};
    for (const row of results) {
      counts[row.instituteId] = Number(row.count);
    }

    const duration = performance.now() - start;
    logger.debug(fn, `Fetched counts for ${Object.keys(counts).length} institutes in ${duration.toFixed(0)}ms`);

    return counts;
  } catch (error) {
    logger.error(fn, 'Failed to fetch student count by institute', { error });
    return {};
  }
}

// ============================================
// getStudentBySubject - OPTIMIZED JSONB query
// ============================================

export async function getStudentBySubject(subjectCode: string) {
  const fn = `${MODULE}.getStudentBySubject`;

  try {
    const examCenterId = await getExamCenterIdOrThrow();

    return await db.query.students.findMany({
      where: and(
        eq(students.examCenterId, examCenterId),
        sql`${students.subCodes} @> ${JSON.stringify([subjectCode])}::jsonb`,
        eq(students.isDeleted, false),
      ),
      orderBy: (students, { asc }) => [asc(students.seatNumber)],
    });
  } catch (error) {
    logger.error(fn, 'Failed to fetch students by subject', { error });
    return [];
  }
}