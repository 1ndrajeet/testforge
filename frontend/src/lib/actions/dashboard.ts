// lib/actions/dashboard.ts
'use server';

import { and, eq, sql } from 'drizzle-orm';

import departmentsMap from '@/config/course_codes.json';
import { db } from '@/lib/db';
import {
  blockAllocations,
  blocks,
  connectedInstitutes,
  examCenters,
  orders,
  qpInventory,
  staff,
  students,
  timetable,
} from '@/lib/db/schema';
import { logger } from '@/lib/misc/logger';
import { getExamCenterId } from '@/lib/session';

import { getTimetableStats } from './timetable';

const getDeptFullName = (code: string): string => {
  return departmentsMap[code as keyof typeof departmentsMap] || code;
};

const MODULE = 'dashboard';

export interface ExamOfficerDashboardData {
  examCenter: {
    id: string;
    code: string;
    name: string;
    season: string;
    year: number;
    officerIncharge: string;
    sealingSupervisor: string;
    distCenterCode: string;
    distCenterName: string;
    startDate: Date;
    endDate: Date;
    departments: string[];
  };
  metrics: {
    totalStudents: number;
    totalExaminees: number;
    totalStaff: number;
    totalBlocks: number;
    totalSubjects: number;
    totalConnectedInstitutes: number;
    totalExamDays: number;
    totalSessions: number;
    totalPapers: number;
    totalAllocations: number;
    totalOrders: number;
  };
  departmentDistribution: Array<{
    department: string;
    staffCount: number;
    percentage: number;
  }>;
  sessionDistribution: Array<{
    date: string;
    morning: number;
    afternoon: number;
    total: number;
  }>;
  subjectEnrollment: {
    highest: Array<{ code: string; name: string; students: number; scheme: string }>;
    lowest: Array<{ code: string; name: string; students: number; scheme: string }>;
  };
  attendanceExtremes: {
    highest: {
      date: string;
      session: string;
      students: number;
      subjectCode: string;
      subjectName: string;
    };
    lowest: {
      date: string;
      session: string;
      students: number;
      subjectCode: string;
      subjectName: string;
    };
  };
  blockUtilization: Array<{
    blockNo: string;
    location: string;
    strength: number;
    totalAllocated: number;
    utilization: number;
  }>;
  staffDuty: {
    totalSupervisors: number;
    totalRelievers: number;
    onDutyToday: number;
    available: number;
  };
  qpInventoryStatus: {
    totalExpected: number;
    totalReceived: number;
    pending: number;
    completion: number;
  };
  dailySchedule: Array<{
    date: string;
    session: string;
    subjects: number;
    students: number;
    blocks: number;
  }>;
  malpracticeCases: {
    total: number;
    pending: number;
    resolved: number;
    byDate: Array<{ date: string; count: number }>;
  };
  connectedInstitutes: Array<{
    code: string;
    name: string;
    students: number;
    isActive: boolean;
  }>;
  realtimeStatus: {
    currentSession: string;
    currentDate: string;
    examsInProgress: number;
    examsCompleted: number;
    attendanceRate: number;
  };
  message: string;
  lastUpdated: Date;
}

export async function getExamOfficerDashboard(): Promise<{
  success: boolean;
  data?: ExamOfficerDashboardData;
  error?: string;
}> {
  const MODULE_FN = `${MODULE}.getExamOfficerDashboard`;

  try {
    const examCenterId = await getExamCenterId();
    if (!examCenterId) {
      return { success: false, error: 'Exam center not found' };
    }

    // ============================================
    // 1. Get Exam Center Details
    // ============================================
    const centerDetails = await db.select().from(examCenters).where(eq(examCenters.id, examCenterId)).limit(1);

    if (!centerDetails || centerDetails.length === 0) {
      return { success: false, error: 'Exam center not found' };
    }

    const center = centerDetails[0];

    // ============================================
    // 2. Get Connected Institutes with Student Count
    // ============================================
    const connectedInsts = await db
      .select({
        code: connectedInstitutes.instituteCode,
        name: connectedInstitutes.instituteName,
        isActive: connectedInstitutes.isActive,
        studentCount: sql<number>`count(${students.id})`,
      })
      .from(connectedInstitutes)
      .leftJoin(students, eq(connectedInstitutes.id, students.connectedInstituteId))
      .where(eq(connectedInstitutes.examCenterId, examCenterId))
      .groupBy(connectedInstitutes.id);

    // ============================================
    // 3. Get Staff Statistics
    // ============================================
    // ============================================
    // 3. Get Department Distribution from STUDENTS (not staff)
    // ============================================
    const deptDistributionData = await db
      .select({
        department: students.scheme, // scheme = department
        studentCount: sql<number>`count(*)`,
      })
      .from(students)
      .where(eq(students.examCenterId, examCenterId))
      .groupBy(students.scheme);

    const deptMap = new Map<string, number>();
    let totalDeptStudents = 0;

    deptDistributionData.forEach((row: any) => {
      const dept = getDeptFullName(row.department?.split('-')[0]?.toUpperCase()) || 'Unknown';
      const count = Number(row.studentCount);
      deptMap.set(dept, (deptMap.get(dept) || 0) + count);
      totalDeptStudents += count;
    });

    const departmentDistribution = Array.from(deptMap.entries())
      .map(([dept, count]) => ({
        department: dept,
        staffCount: count, // This is actually student count
        percentage: totalDeptStudents > 0 ? Math.round((count / totalDeptStudents) * 100) : 0,
      }))
      .sort((a, b) => b.staffCount - a.staffCount);

    // ============================================
    // 3a. Get Staff Stats (separate)
    // ============================================
    const staffStats = await db
      .select({
        byType: sql<string>`${staff.staffType}`,
        typeCount: sql<number>`count(*)`,
      })
      .from(staff)
      .where(eq(staff.examCenterId, examCenterId))
      .groupBy(staff.staffType);

    let totalStaff = 0;
    let totalSupervisors = 0;
    let totalRelievers = 0;

    staffStats.forEach((row: any) => {
      const type = row.byType || '';
      const count = Number(row.typeCount);
      totalStaff += count;
      if (type === 'SUPERVISOR') totalSupervisors += count;
      if (type === 'RELIEVER') totalRelievers += count;
    });

    // ============================================
    // 4. Get Blocks
    // ============================================
    const blockList = await db
      .select({
        id: blocks.id,
        blockNo: blocks.blockNo,
        location: blocks.location,
        strength: blocks.strength,
        allocated: sql<number>`count(${blockAllocations.id})`,
      })
      .from(blocks)
      .leftJoin(blockAllocations, eq(blocks.id, blockAllocations.blockId))
      .where(eq(blocks.examCenterId, examCenterId))
      .groupBy(blocks.id);

    const blockUtilization = blockList.map((block: any) => ({
      blockNo: block.blockNo,
      location: block.location,
      strength: block.strength || 40,
      totalAllocated: Number(block.allocated) || 0,
      utilization: block.strength ? Math.min(Math.round((Number(block.allocated) / block.strength) * 100), 100) : 0,
    }));

    // ============================================
    // 5. Get Timetable Stats - USING THE EXISTING FUNCTION
    // ============================================
    // ============================================
    // 5. Get Timetable Stats
    // ============================================
    const statsResult = await getTimetableStats();
    const statsData =
      statsResult.success && statsResult.data
        ? statsResult.data
        : {
            totalEntries: 0,
            uniqueSubjects: 0,
            uniqueSchemes: 0,
            totalStudents: 0,
            totalAbsent: 0,
            totalCps: 0,
            dateRange: null,
          };

    const totalEntries = statsData.totalEntries;
    const uniqueSubjects = statsData.uniqueSubjects;
    const totalCPS = statsData.totalCps; // Keep this

    // ============================================
    // 5a. Get STUDENTS (unique) and EXAMINEES (all rows)
    // ============================================
    const studentCounts = await db
      .select({
        totalExaminees: sql<number>`count(*)`,
        uniqueStudents: sql<number>`count(DISTINCT ${students.enrollmentNumber})`,
      })
      .from(students)
      .where(eq(students.examCenterId, examCenterId));

    const totalExaminees = Number(studentCounts[0]?.totalExaminees) || 0;
    const totalStudents = Number(studentCounts[0]?.uniqueStudents) || 0;
    const totalPapers = statsData.totalStudents;
    const totalAbsent = statsData.totalAbsent;

    // ============================================
    // 6. Attendance Rate
    // ============================================
    const attendanceRate = totalExaminees > 0 ? Math.round(((totalExaminees - totalAbsent) / totalExaminees) * 100) : 0;

    // ============================================
    // 7. Exam Days
    // ============================================
    let totalExamDays = 0;
    if (statsData.dateRange) {
      const diffTime = Math.abs(
        new Date(statsData.dateRange.max).getTime() - new Date(statsData.dateRange.min).getTime()
      );
      totalExamDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    }

    // ============================================
    // 8. Session Distribution
    // ============================================
    const sessionData = await db
      .select({
        date: timetable.date,
        session: timetable.session,
        students: sql<number>`sum(${timetable.totalStudents})`,
      })
      .from(timetable)
      .where(eq(timetable.examCenterId, examCenterId))
      .groupBy(timetable.date, timetable.session)
      .orderBy(timetable.date);

    const sessionMap = new Map<string, { morning: number; afternoon: number }>();
    sessionData.forEach((row: any) => {
      const dateStr = new Date(row.date).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
      if (!sessionMap.has(dateStr)) {
        sessionMap.set(dateStr, { morning: 0, afternoon: 0 });
      }
      const session = row.session?.toLowerCase() || '';
      const studentsCount = Number(row.students) || 0;
      if (session.includes('morning')) {
        sessionMap.get(dateStr)!.morning += studentsCount;
      } else {
        sessionMap.get(dateStr)!.afternoon += studentsCount;
      }
    });

    const sessionDistribution = Array.from(sessionMap.entries()).map(([date, data]) => ({
      date,
      morning: data.morning,
      afternoon: data.afternoon,
      total: data.morning + data.afternoon,
    }));

    // ============================================
    // 9. Subject Enrollment
    // ============================================
    const subjectEnrollment = await db
      .select({
        subjectCode: timetable.subjectCode,
        subjectName: timetable.subjectName,
        scheme: timetable.scheme,
        totalStudents: sql<number>`sum(${timetable.totalStudents})`,
      })
      .from(timetable)
      .where(eq(timetable.examCenterId, examCenterId))
      .groupBy(timetable.subjectCode, timetable.subjectName, timetable.scheme)
      .orderBy(sql`sum(${timetable.totalStudents}) DESC`);

    const sorted = subjectEnrollment.map((s: any) => ({
      code: s.subjectCode,
      name: s.subjectName || s.subjectCode,
      students: Number(s.totalStudents) || 0,
      scheme: s.scheme,
    }));

    const highestEnrollment = sorted.slice(0, 5);
    const lowestEnrollment = sorted
      .filter((s: any) => s.students > 0)
      .slice(-5)
      .reverse();

    // ============================================
    // 10. Attendance Extremes
    // ============================================
    const attendanceData = await db
      .select({
        date: timetable.date,
        session: timetable.session,
        subjectCode: timetable.subjectCode,
        subjectName: timetable.subjectName,
        totalStudents: timetable.totalStudents,
      })
      .from(timetable)
      .where(eq(timetable.examCenterId, examCenterId))
      .orderBy(sql`${timetable.totalStudents} DESC`);

    const formattedAttendance = attendanceData.map((row: any) => ({
      date: new Date(row.date),
      session: row.session || 'Unknown',
      students: Number(row.totalStudents) || 0,
      subjectCode: row.subjectCode,
      subjectName: row.subjectName || row.subjectCode,
    }));

    const highest = formattedAttendance.length > 0 ? formattedAttendance[0] : null;
    const lowest = formattedAttendance.length > 0 ? formattedAttendance[formattedAttendance.length - 1] : null;

    // ============================================
    // 11. Block Allocations Count
    // ============================================
    const allocationCount = await db
      .select({
        count: sql<number>`count(*)`,
      })
      .from(blockAllocations)
      .where(eq(blockAllocations.examCenterId, examCenterId));

    const totalAllocations = Number(allocationCount[0]?.count) || 0;

    // ============================================
    // 12. Orders Count
    // ============================================
    const orderCount = await db
      .select({
        count: sql<number>`count(*)`,
      })
      .from(orders)
      .where(eq(orders.examCenterId, examCenterId));

    const totalOrders = Number(orderCount[0]?.count) || 0;

    // ============================================
    // 13. QP Inventory Status
    // ============================================
    const qpData = await db
      .select({
        expected: sql<number>`COALESCE(sum(${qpInventory.expectedPackets}), 0)`,
        received: sql<number>`COALESCE(sum(${qpInventory.receivedPackets}), 0)`,
      })
      .from(qpInventory)
      .where(eq(qpInventory.examCenterId, examCenterId));

    const qpStatus = {
      totalExpected: Number(qpData[0]?.expected) || 0,
      totalReceived: Number(qpData[0]?.received) || 0,
      pending: Math.max(0, (Number(qpData[0]?.expected) || 0) - (Number(qpData[0]?.received) || 0)),
      completion:
        (Number(qpData[0]?.expected) || 1) > 0
          ? Math.round(((Number(qpData[0]?.received) || 0) / (Number(qpData[0]?.expected) || 1)) * 100)
          : 0,
    };

    // ============================================
    // 14. Daily Schedule
    // ============================================
    const dailyScheduleData = await db
      .select({
        date: timetable.date,
        session: timetable.session,
        subjects: sql<number>`count(DISTINCT ${timetable.subjectCode})`,
        students: sql<number>`sum(${timetable.totalStudents})`,
        blocks: sql<number>`count(DISTINCT ${blockAllocations.blockId})`,
      })
      .from(timetable)
      .leftJoin(
        blockAllocations,
        sql`
                ${blockAllocations.date} = ${timetable.date} AND 
                ${blockAllocations.session} = ${timetable.session} AND
                ${blockAllocations.examCenterId} = ${timetable.examCenterId}
            `
      )
      .where(eq(timetable.examCenterId, examCenterId))
      .groupBy(timetable.date, timetable.session)
      .orderBy(timetable.date);

    const dailySchedule = dailyScheduleData.map((row: any) => ({
      date: new Date(row.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
      session: row.session || 'Unknown',
      subjects: Number(row.subjects) || 0,
      students: Number(row.students) || 0,
      blocks: Number(row.blocks) || 0,
    }));

    // ============================================
    // 15. Malpractice Cases
    // ============================================
    // For resolved, we need to query cpsResolved separately
    const resolvedData = await db
      .select({
        resolved: sql<number>`COALESCE(sum(jsonb_array_length(${timetable.cpsResolved})), 0)`,
      })
      .from(timetable)
      .where(eq(timetable.examCenterId, examCenterId));

    const resolvedCPS = Number(resolvedData[0]?.resolved) || 0;
    const pendingCPS = totalCPS - resolvedCPS;

    // Get CPS by date for trend
    const cpsByDateData = await db
      .select({
        date: timetable.date,
        cpsCount: sql<number>`COALESCE(jsonb_array_length(${timetable.cpsStudents}), 0)`,
      })
      .from(timetable)
      .where(
        and(
          eq(timetable.examCenterId, examCenterId),
          sql`${timetable.cpsStudents} IS NOT NULL AND ${timetable.cpsStudents} != '[]'::jsonb`
        )
      );

    const cpsByDate = cpsByDateData
      .filter((row: any) => Number(row.cpsCount) > 0)
      .map((row: any) => ({
        date: new Date(row.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
        count: Number(row.cpsCount),
      }));

    const malpracticeCases = {
      total: totalCPS,
      pending: pendingCPS,
      resolved: resolvedCPS,
      byDate: cpsByDate,
    };

    // ============================================
    // 16. Real-time Status
    // ============================================
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    const todayExams = await db
      .select({
        count: sql<number>`count(*)`,
      })
      .from(timetable)
      .where(and(eq(timetable.examCenterId, examCenterId), sql`date(${timetable.date}) = date(${todayStr})`));

    const currentHour = today.getHours();
    const currentSession = currentHour < 12 ? 'Morning' : 'Afternoon';

    // ============================================
    // Compile Dashboard Data
    // ============================================
    const dashboardData: ExamOfficerDashboardData = {
      examCenter: {
        id: center.id,
        code: center.code || 'N/A',
        name: center.name || 'N/A',
        season: center.season || 'WINTER',
        year: center.examYear || new Date().getFullYear(),
        officerIncharge: center.officerIncharge || 'Not Assigned',
        sealingSupervisor: center.sealingSupervisor || 'Not Assigned',
        distCenterCode: center.distCenterCode || 'N/A',
        distCenterName: center.distCenterName || 'N/A',
        startDate: center.startDate || new Date(),
        endDate: center.endDate || new Date(),
        departments: (center.departments as string[]) || [],
      },
      metrics: {
        totalStudents,
        totalExaminees,
        totalStaff,
        totalBlocks: blockList.length,
        totalSubjects: uniqueSubjects,
        totalConnectedInstitutes: connectedInsts.length,
        totalExamDays,
        totalSessions: totalEntries,
        totalPapers,
        totalAllocations,
        totalOrders,
      },
      departmentDistribution,
      sessionDistribution,
      subjectEnrollment: {
        highest: highestEnrollment,
        lowest: lowestEnrollment,
      },
      attendanceExtremes: {
        highest: highest
          ? {
              date: highest.date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
              session: highest.session,
              students: highest.students,
              subjectCode: highest.subjectCode,
              subjectName: highest.subjectName,
            }
          : { date: '', session: '', students: 0, subjectCode: '', subjectName: '' },
        lowest: lowest
          ? {
              date: lowest.date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
              session: lowest.session,
              students: lowest.students,
              subjectCode: lowest.subjectCode,
              subjectName: lowest.subjectName,
            }
          : { date: '', session: '', students: 0, subjectCode: '', subjectName: '' },
      },
      blockUtilization,
      staffDuty: {
        totalSupervisors,
        totalRelievers,
        onDutyToday: totalSupervisors + totalRelievers,
        available: Math.max(0, totalStaff - (totalSupervisors + totalRelievers)),
      },
      qpInventoryStatus: qpStatus,
      dailySchedule: dailySchedule.slice(0, 10),
      malpracticeCases,
      connectedInstitutes: connectedInsts.map((inst: any) => ({
        code: inst.code || 'N/A',
        name: inst.name || 'N/A',
        students: Number(inst.studentCount) || 0,
        isActive: inst.isActive || false,
      })),
      realtimeStatus: {
        currentSession: currentSession,
        currentDate: today.toLocaleDateString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        }),
        examsInProgress: Number(todayExams[0]?.count) || 0,
        examsCompleted: totalEntries - (Number(todayExams[0]?.count) || 0),
        attendanceRate,
      },
      message: `Exam data for ${center.name} - ${center.season} ${center.examYear}`,
      lastUpdated: new Date(),
    };

    logger.info(MODULE_FN, 'Exam Officer Dashboard data fetched successfully', {
      examCenterId,
      totalStudents,
      totalStaff,
      totalSubjects: uniqueSubjects,
      attendanceRate,
      totalAbsent,
    });

    return { success: true, data: dashboardData };
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to fetch dashboard data', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch dashboard data',
    };
  }
}
