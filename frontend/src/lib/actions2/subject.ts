// lib/actions/subject.ts
'use server';

import { revalidatePath } from 'next/cache';

import { and, eq, like, or } from 'drizzle-orm';

import { db } from '@/lib/db';
import { subjects } from '@/lib/db/schema';

export async function getSubjects(scheme?: string) {
  const conditions = [eq(subjects.isDeleted, false)];
  if (scheme) {
    conditions.push(eq(subjects.scheme, scheme));
  }

  return db.query.subjects.findMany({
    where: and(...conditions),
    orderBy: (subjects, { asc }) => [asc(subjects.code)],
  });
}

export async function getSubjectById(id: string) {
  return db.query.subjects.findFirst({
    where: eq(subjects.id, id),
  });
}

export async function getSubjectByCode(code: string, scheme: string) {
  return db.query.subjects.findFirst({
    where: and(eq(subjects.code, code), eq(subjects.scheme, scheme), eq(subjects.isDeleted, false)),
  });
}

export async function searchSubjects(query: string, scheme?: string) {
  const conditions = [
    eq(subjects.isDeleted, false),
    or(
      like(subjects.code, `%${query}%`),
      like(subjects.name, `%${query}%`),
      like(subjects.abbr, `%${query}%`),
    ),
  ];

  if (scheme) {
    conditions.push(eq(subjects.scheme, scheme));
  }

  return db.query.subjects.findMany({
    where: and(...conditions),
    limit: 20,
  });
}

export async function createSubject(data: {
  code: string;
  name: string;
  scheme: string;
  abbr?: string;
}) {
  // Check for duplicate
  const existing = await getSubjectByCode(data.code, data.scheme);
  if (existing) {
    throw new Error(`Subject with code ${data.code} already exists for scheme ${data.scheme}`);
  }

  const [subject] = await db.insert(subjects).values(data).returning();

  revalidatePath('/exam-center/subjects');
  return subject;
}

export async function updateSubject(
  id: string,
  data: {
    code?: string;
    name?: string;
    scheme?: string;
    abbr?: string;
  },
) {
  const [subject] = await db
    .update(subjects)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(subjects.id, id))
    .returning();

  revalidatePath('/exam-center/subjects');
  return subject;
}

export async function deleteSubject(id: string) {
  await db
    .update(subjects)
    .set({ isDeleted: true, updatedAt: new Date() })
    .where(eq(subjects.id, id));

  revalidatePath('/exam-center/subjects');
}

export async function getSchemes() {
  const results = await db
    .selectDistinct({ scheme: subjects.scheme })
    .from(subjects)
    .where(eq(subjects.isDeleted, false));

  return results.map((r) => r.scheme);
}
