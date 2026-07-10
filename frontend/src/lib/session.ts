// lib/session.ts
'use server';

// ============================================
// Imports
// ============================================
import { cache } from 'react';

import { headers } from 'next/headers';

import { and, count, eq } from 'drizzle-orm';

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  blockAllocations,
  blocks,
  connectedInstitutes,
  examCenters,
  organizations,
  orgMembers,
  staff,
  students,
  subjects,
  timetable,
} from '@/lib/db/schema';
import { logger } from '@/lib/misc/logger';
// lib/session.ts - Add this

export async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) throw new Error('Unauthorized');

  const member = await db.query.orgMembers.findFirst({
    where: eq(orgMembers.userId, user.id),
  });

  if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
    throw new Error('Forbidden: Admin access required');
  }

  return { user, member };
}
const MODULE = 'session';

// ============================================
// Types
// ============================================

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  image?: string | null;
}

export interface OrganizationData {
  id: string;
  name: string;
  slug: string;
  subscriptionTier: string;
  subscriptionExpiresAt: Date | null;
}

export interface ExamCenterData {
  id: string;
  orgId: string;
  code: string;
  name: string;
  address: string | null;
  officerIncharge: string | null;
  sealingSupervisor: string | null;
  distCenterCode: string | null;
  distCenterName: string | null;
  season: 'Summer' | 'Winter' | null;
  examYear: number | null;
  startDate: Date | null;
  endDate: Date | null;
  departments: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CurrentOrgResponse {
  user: SessionUser;
  org: OrganizationData;
  orgId: string;
  role: string;
}

// ============================================
// Core Session Helpers (cached)
// ============================================

export const getSession = cache(async () => {
  const MODULE_FN = `${MODULE}.getSession`;

  try {
    const session = await auth.api.getSession({ headers: await headers() });
    logger.debug(MODULE_FN, 'Session retrieved', {
      hasUser: !!session?.user,
    });
    return session;
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to get session', { error });
    return null;
  }
});

export const getCurrentUser = cache(async (): Promise<SessionUser> => {
  const MODULE_FN = `${MODULE}.getCurrentUser`;

  const session = await getSession();
  if (!session?.user) {
    logger.warn(MODULE_FN, 'Unauthorized access attempt');
    throw new Error('Unauthorized');
  }

  logger.debug(MODULE_FN, 'Current user retrieved', { userId: session.user.id });
  return session.user;
});

export const getCurrentOrg = cache(async (): Promise<CurrentOrgResponse> => {
  const MODULE_FN = `${MODULE}.getCurrentOrg`;

  const user = await getCurrentUser();

  const member = await db.query.orgMembers.findFirst({
    where: eq(orgMembers.userId, user.id),
  });

  if (!member) {
    logger.warn(MODULE_FN, 'User has no organization', { userId: user.id });
    throw new Error('Organization not found');
  }

  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, member.orgId),
  });

  if (!org) {
    logger.warn(MODULE_FN, 'Organization not found', { orgId: member.orgId });
    throw new Error('Organization not found');
  }

  logger.debug(MODULE_FN, 'Current organization retrieved', {
    orgId: org.id,
    userId: user.id,
    role: member.role,
  });

  return {
    user,
    org: {
      id: org.id,
      name: org.name,
      slug: org.slug,
      subscriptionTier: org.subscriptionTier,
      subscriptionExpiresAt: org.subscriptionExpiresAt,
    },
    orgId: org.id,
    role: member.role,
  };
});

export const getCurrentOrgId = cache(async (): Promise<string> => {
  const { orgId } = await getCurrentOrg();
  return orgId;
});

// ============================================
// Exam Center Helpers (cached)
// ============================================

export const getCurrentExamCenter = cache(async (): Promise<ExamCenterData | null> => {
  const MODULE_FN = `${MODULE}.getCurrentExamCenter`;

  try {
    const { orgId } = await getCurrentOrg();

    const examCenter = await db.query.examCenters.findFirst({
      where: eq(examCenters.orgId, orgId),
    });

    if (!examCenter) {
      logger.debug(MODULE_FN, 'No exam center configured', { orgId });
      return null;
    }

    logger.debug(MODULE_FN, 'Exam center retrieved', {
      id: examCenter.id,
      code: examCenter.code,
    });

    return {
      id: examCenter.id,
      orgId: examCenter.orgId,
      code: examCenter.code,
      name: examCenter.name,
      address: examCenter.address,
      officerIncharge: examCenter.officerIncharge,
      sealingSupervisor: examCenter.sealingSupervisor,
      distCenterCode: examCenter.distCenterCode,
      distCenterName: examCenter.distCenterName,
      season: examCenter.season as 'Summer' | 'Winter' | null,
      examYear: examCenter.examYear,
      startDate: examCenter.startDate,
      endDate: examCenter.endDate,
      departments: examCenter.departments || [],
      isActive: examCenter.isActive ?? true,
      createdAt: examCenter.createdAt,
      updatedAt: examCenter.updatedAt,
    };
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to get exam center', { error });
    return null;
  }
});

export const requireExamCenter = cache(async (): Promise<ExamCenterData> => {
  const MODULE_FN = `${MODULE}.requireExamCenter`;

  const examCenter = await getCurrentExamCenter();
  if (!examCenter) {
    logger.warn(MODULE_FN, 'Exam center required but not configured');
    throw new Error('Exam center not configured');
  }

  return examCenter;
});

export const getExamCenterOrThrow = requireExamCenter;

// ============================================
// Quick Access Utilities
// ============================================

export async function getExamCenterId(): Promise<string | null> {
  const MODULE_FN = `${MODULE}.getExamCenterId`;

  try {
    const examCenter = await getCurrentExamCenter();
    const id = examCenter?.id || null;

    logger.debug(MODULE_FN, `Exam center ID: ${id || 'none'}`);
    return id;
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to get exam center ID', { error });
    return null;
  }
}

export async function getExamCenterIdOrThrow(): Promise<string> {
  const examCenter = await requireExamCenter();
  return examCenter.id;
}

export async function getExamCenterCode(): Promise<string | null> {
  const examCenter = await getCurrentExamCenter();
  return examCenter?.code || null;
}

export async function getExamCenterName(): Promise<string | null> {
  const examCenter = await getCurrentExamCenter();
  return examCenter?.name || null;
}

export async function getExamSeason(): Promise<string | null> {
  const examCenter = await getCurrentExamCenter();
  return examCenter?.season || null;
}

export async function getExamYear(): Promise<number | null> {
  const examCenter = await getCurrentExamCenter();
  return examCenter?.examYear || null;
}

export async function getExamInfo(): Promise<{
  season: string;
  year: number;
  centerCode: string;
  centerName: string;
} | null> {
  const examCenter = await getCurrentExamCenter();

  if (!examCenter) {
    return null;
  }

  return {
    season: examCenter.season || '',
    year: examCenter.examYear || new Date().getFullYear(),
    centerCode: examCenter.code,
    centerName: examCenter.name,
  };
}

export async function getOfficerIncharge(): Promise<string | null> {
  const examCenter = await getCurrentExamCenter();
  return examCenter?.officerIncharge || null;
}

export async function getSealingSupervisor(): Promise<string | null> {
  const examCenter = await getCurrentExamCenter();
  return examCenter?.sealingSupervisor || null;
}

export async function getDepartments(): Promise<string[]> {
  const examCenter = await getCurrentExamCenter();
  return examCenter?.departments || [];
}

// ============================================
// Check Helpers
// ============================================

export async function hasExamCenter(): Promise<boolean> {
  const examCenter = await getCurrentExamCenter();
  return !!examCenter;
}

export async function isExamCenterConfigured(): Promise<boolean> {
  const examCenter = await getCurrentExamCenter();

  const isConfigured = !!(
    examCenter?.code &&
    examCenter?.name &&
    examCenter?.season &&
    examCenter?.examYear &&
    examCenter?.distCenterCode
  );

  return isConfigured;
}

export async function hasActiveSubscription(): Promise<boolean> {
  const { org } = await getCurrentOrg();

  const isActive = !!(
    org.subscriptionExpiresAt &&
    new Date(org.subscriptionExpiresAt) > new Date() &&
    org.subscriptionTier !== 'inactive'
  );

  return isActive;
}

// ============================================
// Connected Institutes Helpers
// ============================================

export async function getConnectedInstitutes() {
  const MODULE_FN = `${MODULE}.getConnectedInstitutes`;

  try {
    const examCenterId = await getExamCenterId();

    if (!examCenterId) {
      logger.debug(MODULE_FN, 'No exam center found');
      return [];
    }

    const institutes = await db.query.connectedInstitutes.findMany({
      where: eq(connectedInstitutes.examCenterId, examCenterId),
      orderBy: (institutes, { asc }) => [asc(institutes.instituteCode)],
    });

    logger.debug(MODULE_FN, `Fetched ${institutes.length} institutes`);
    return institutes;
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to fetch institutes', { error });
    return [];
  }
}

export async function getInstituteByCode(instituteCode: string) {
  const MODULE_FN = `${MODULE}.getInstituteByCode`;

  try {
    const examCenterId = await getExamCenterId();

    if (!examCenterId) {
      logger.debug(MODULE_FN, 'No exam center found');
      return null;
    }

    const institute = await db.query.connectedInstitutes.findFirst({
      where: and(
        eq(connectedInstitutes.examCenterId, examCenterId),
        eq(connectedInstitutes.instituteCode, instituteCode),
      ),
    });

    return institute;
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to fetch institute', { error });
    return null;
  }
}

// ============================================
// Staff Helpers
// ============================================

export async function getSupervisors() {
  const MODULE_FN = `${MODULE}.getSupervisors`;

  try {
    const examCenterId = await getExamCenterId();

    if (!examCenterId) {
      logger.debug(MODULE_FN, 'No exam center found');
      return [];
    }

    const supervisors = await db.query.staff.findMany({
      where: and(
        eq(staff.examCenterId, examCenterId),
        eq(staff.staffType, 'SUPERVISOR'),
        eq(staff.isDeleted, false),
      ),
      orderBy: (staff, { asc }) => [asc(staff.name)],
    });

    logger.debug(MODULE_FN, `Fetched ${supervisors.length} supervisors`);
    return supervisors;
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to fetch supervisors', { error });
    return [];
  }
}

export async function getRelievers() {
  const MODULE_FN = `${MODULE}.getRelievers`;

  try {
    const examCenterId = await getExamCenterId();

    if (!examCenterId) {
      logger.debug(MODULE_FN, 'No exam center found');
      return [];
    }

    const relievers = await db.query.staff.findMany({
      where: and(
        eq(staff.examCenterId, examCenterId),
        eq(staff.staffType, 'RELIEVER'),
        eq(staff.isDeleted, false),
      ),
      orderBy: (staff, { asc }) => [asc(staff.name)],
    });

    logger.debug(MODULE_FN, `Fetched ${relievers.length} relievers`);
    return relievers;
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to fetch relievers', { error });
    return [];
  }
}

export async function getControlRoomStaff() {
  const MODULE_FN = `${MODULE}.getControlRoomStaff`;

  try {
    const examCenterId = await getExamCenterId();

    if (!examCenterId) {
      logger.debug(MODULE_FN, 'No exam center found');
      return [];
    }

    const staffMembers = await db.query.staff.findMany({
      where: and(
        eq(staff.examCenterId, examCenterId),
        eq(staff.staffType, 'CONTROL_ROOM'),
        eq(staff.isDeleted, false),
      ),
      orderBy: (staff, { asc }) => [asc(staff.name)],
    });

    logger.debug(MODULE_FN, `Fetched ${staffMembers.length} control room staff`);
    return staffMembers;
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to fetch control room staff', { error });
    return [];
  }
}

export async function getStaffByUid(uid: string) {
  const MODULE_FN = `${MODULE}.getStaffByUid`;

  try {
    const examCenterId = await getExamCenterId();

    if (!examCenterId) {
      logger.debug(MODULE_FN, 'No exam center found');
      return null;
    }

    const staffMember = await db.query.staff.findFirst({
      where: and(
        eq(staff.examCenterId, examCenterId),
        eq(staff.uid, uid),
        eq(staff.isDeleted, false),
      ),
    });

    return staffMember;
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to fetch staff by UID', { error });
    return null;
  }
}

// ============================================
// Subject Helpers
// ============================================

export async function getSubjects(scheme?: string) {
  const MODULE_FN = `${MODULE}.getSubjects`;

  try {
    const conditions = [eq(subjects.isDeleted, false)];

    if (scheme) {
      conditions.push(eq(subjects.scheme, scheme));
    }

    const subjectList = await db.query.subjects.findMany({
      where: and(...conditions),
      orderBy: (subjects, { asc }) => [asc(subjects.code)],
    });

    logger.debug(MODULE_FN, `Fetched ${subjectList.length} subjects`);
    return subjectList;
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to fetch subjects', { error });
    return [];
  }
}

export async function getSubjectByCode(code: string, scheme: string) {
  const MODULE_FN = `${MODULE}.getSubjectByCode`;

  try {
    const subject = await db.query.subjects.findFirst({
      where: and(
        eq(subjects.code, code),
        eq(subjects.scheme, scheme),
        eq(subjects.isDeleted, false),
      ),
    });

    return subject;
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to fetch subject', { error });
    return null;
  }
}

// ============================================
// Block Helpers
// ============================================

export async function getBlocks() {
  const MODULE_FN = `${MODULE}.getBlocks`;

  try {
    const examCenterId = await getExamCenterId();

    if (!examCenterId) {
      logger.debug(MODULE_FN, 'No exam center found');
      return [];
    }

    const blockList = await db.query.blocks.findMany({
      where: and(eq(blocks.examCenterId, examCenterId), eq(blocks.isDeleted, false)),
      orderBy: (blocks, { asc }) => [asc(blocks.blockNo)],
    });

    logger.debug(MODULE_FN, `Fetched ${blockList.length} blocks`);
    return blockList;
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to fetch blocks', { error });
    return [];
  }
}

export async function getBlockByLocation(location: string) {
  const MODULE_FN = `${MODULE}.getBlockByLocation`;

  try {
    const examCenterId = await getExamCenterId();

    if (!examCenterId) {
      logger.debug(MODULE_FN, 'No exam center found');
      return null;
    }

    const block = await db.query.blocks.findFirst({
      where: and(
        eq(blocks.examCenterId, examCenterId),
        eq(blocks.location, location),
        eq(blocks.isDeleted, false),
      ),
    });

    return block;
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to fetch block', { error });
    return null;
  }
}

// ============================================
// Student Helpers
// ============================================

export async function getStudents(params?: {
  instituteId?: string;
  seatNumber?: number;
  scheme?: string;
  limit?: number;
  offset?: number;
}) {
  const MODULE_FN = `${MODULE}.getStudents`;

  try {
    const examCenterId = await getExamCenterId();

    if (!examCenterId) {
      logger.debug(MODULE_FN, 'No exam center found');
      return [];
    }

    const conditions = [eq(students.examCenterId, examCenterId), eq(students.isDeleted, false)];

    if (params?.instituteId) {
      conditions.push(eq(students.connectedInstituteId, params.instituteId));
    }
    if (params?.seatNumber) {
      conditions.push(eq(students.seatNumber, params.seatNumber));
    }
    if (params?.scheme) {
      conditions.push(eq(students.scheme, params.scheme));
    }

    const studentList = await db.query.students.findMany({
      where: and(...conditions),
      orderBy: (students, { asc }) => [asc(students.seatNumber)],
      limit: params?.limit,
      offset: params?.offset,
    });

    logger.debug(MODULE_FN, `Fetched ${studentList.length} students`);
    return studentList;
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to fetch students', { error });
    return [];
  }
}

export async function getStudentBySeatNumber(seatNumber: number) {
  const MODULE_FN = `${MODULE}.getStudentBySeatNumber`;

  try {
    const examCenterId = await getExamCenterId();

    if (!examCenterId) {
      logger.debug(MODULE_FN, 'No exam center found');
      return null;
    }

    const student = await db.query.students.findFirst({
      where: and(
        eq(students.examCenterId, examCenterId),
        eq(students.seatNumber, seatNumber),
        eq(students.isDeleted, false),
      ),
    });

    return student;
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to fetch student', { error });
    return null;
  }
}

// ============================================
// Timetable Helpers
// ============================================

export async function getTimetableEntries(params?: {
  date?: Date;
  session?: string;
  subjectCode?: string;
}) {
  const MODULE_FN = `${MODULE}.getTimetableEntries`;

  try {
    const examCenterId = await getExamCenterId();

    if (!examCenterId) {
      logger.debug(MODULE_FN, 'No exam center found');
      return [];
    }

    const conditions = [eq(timetable.examCenterId, examCenterId)];

    if (params?.date) {
      conditions.push(eq(timetable.date, params.date));
    }
    if (params?.session) {
      conditions.push(eq(timetable.session, params.session));
    }
    if (params?.subjectCode) {
      conditions.push(eq(timetable.subjectCode, params.subjectCode));
    }

    const entries = await db.query.timetable.findMany({
      where: and(...conditions),
      orderBy: [timetable.date, timetable.session],
    });

    logger.debug(MODULE_FN, `Fetched ${entries.length} timetable entries`);
    return entries;
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to fetch timetable entries', { error });
    return [];
  }
}

export async function hasTimetable(): Promise<boolean> {
  const MODULE_FN = `${MODULE}.hasTimetable`;

  try {
    const examCenterId = await getExamCenterId();

    if (!examCenterId) {
      logger.debug(MODULE_FN, 'No exam center found');
      return false;
    }

    const result = await db
      .select({ count: count() })
      .from(timetable)
      .where(eq(timetable.examCenterId, examCenterId));

    const hasData = result[0]?.count > 0;

    logger.debug(MODULE_FN, `Has timetable: ${hasData}`);
    return hasData;
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to check timetable', { error });
    return false;
  }
}

// ============================================
// Block Allocation Helpers
// ============================================

export async function getAllocations(params?: { date?: Date; session?: string; blockId?: string }) {
  const MODULE_FN = `${MODULE}.getAllocations`;

  try {
    const examCenterId = await getExamCenterId();

    if (!examCenterId) {
      logger.debug(MODULE_FN, 'No exam center found');
      return [];
    }

    const conditions = [eq(blockAllocations.examCenterId, examCenterId)];

    if (params?.date) {
      conditions.push(eq(blockAllocations.date, params.date));
    }
    if (params?.session) {
      conditions.push(eq(blockAllocations.session, params.session));
    }
    if (params?.blockId) {
      conditions.push(eq(blockAllocations.blockId, params.blockId));
    }

    const allocations = await db.query.blockAllocations.findMany({
      where: and(...conditions),
      orderBy: [blockAllocations.blockNo, blockAllocations.scheme],
    });

    logger.debug(MODULE_FN, `Fetched ${allocations.length} allocations`);
    return allocations;
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to fetch allocations', { error });
    return [];
  }
}

export async function hasAllocations(date?: Date, session?: string): Promise<boolean> {
  const MODULE_FN = `${MODULE}.hasAllocations`;

  try {
    const examCenterId = await getExamCenterId();

    if (!examCenterId) {
      logger.debug(MODULE_FN, 'No exam center found');
      return false;
    }

    const conditions = [eq(blockAllocations.examCenterId, examCenterId)];

    if (date) {
      conditions.push(eq(blockAllocations.date, date));
    }
    if (session) {
      conditions.push(eq(blockAllocations.session, session));
    }

    const result = await db
      .select({ count: count() })
      .from(blockAllocations)
      .where(and(...conditions));

    const hasData = result[0]?.count > 0;

    logger.debug(MODULE_FN, `Has allocations: ${hasData}`);
    return hasData;
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to check allocations', { error });
    return false;
  }
}
