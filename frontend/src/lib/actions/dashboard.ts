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

const MODULE = 'dashboard';
const getDeptFullName = (code: string): string => {
  return departmentsMap[code as keyof typeof departmentsMap] || code;
};

// ============================================================
// TYPES
// ============================================================

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

// ============================================================
// DASHBOARD SERVICE
// ============================================================

export async function getExamOfficerDashboard(): Promise<{
  success: boolean;
  data?: ExamOfficerDashboardData;
  error?: string;
}> {
  const fn = `${MODULE}.getExamOfficerDashboard`;
  const start = performance.now();

  try {
    const examCenterId = await getExamCenterId();
    if (!examCenterId) {
      logger.warn(fn, 'No exam center found');
      return { success: false, error: 'Exam center not found' };
    }

    // ============================================================
    // BATCH 1: Base data - ALL queries in parallel
    // ============================================================

    const [
      centerResult,
      connectedInsts,
      staffStats,
      blockList,
      timetableStats,
      studentCounts,
      allocationCount,
      orderCount,
      qpData,
      todayExams,
      resolvedData,
      cpsByDateData,
    ] = await Promise.all([
      // 1. Center details
      db.select().from(examCenters).where(eq(examCenters.id, examCenterId)).limit(1),

      // 2. Connected Institutes with student counts
      db
        .select({
          code: connectedInstitutes.instituteCode,
          name: connectedInstitutes.instituteName,
          isActive: connectedInstitutes.isActive,
          studentCount: sql<number>`count(${students.id})`,
        })
        .from(connectedInstitutes)
        .leftJoin(students, eq(connectedInstitutes.id, students.connectedInstituteId))
        .where(eq(connectedInstitutes.examCenterId, examCenterId))
        .groupBy(connectedInstitutes.id),

      // 3. Staff stats
      db
        .select({
          byType: sql<string>`${staff.staffType}`,
          typeCount: sql<number>`count(*)`,
        })
        .from(staff)
        .where(eq(staff.examCenterId, examCenterId))
        .groupBy(staff.staffType),

      // 4. Blocks with allocation count
      db
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
        .groupBy(blocks.id),

      // 5. Timetable stats - SINGLE QUERY
      db
        .select({
          totalEntries: sql<number>`count(*)`,
          uniqueSubjects: sql<number>`count(DISTINCT ${timetable.subjectCode})`,
          uniqueSchemes: sql<number>`count(DISTINCT ${timetable.scheme})`,
          totalAbsent: sql<number>`COALESCE(sum(jsonb_array_length(${timetable.absentNumbers})), 0)`,
          totalCps: sql<number>`COALESCE(sum(jsonb_array_length(${timetable.cpsStudents})), 0)`,
          totalStudents: sql<number>`COALESCE(sum(${timetable.totalStudents}), 0)`,
          minDate: sql<Date | null>`min(${timetable.date})`,
          maxDate: sql<Date | null>`max(${timetable.date})`,
        })
        .from(timetable)
        .where(eq(timetable.examCenterId, examCenterId)),

      // 6. Student counts
      db
        .select({
          totalExaminees: sql<number>`count(*)`,
          uniqueStudents: sql<number>`count(DISTINCT ${students.enrollmentNumber})`,
        })
        .from(students)
        .where(eq(students.examCenterId, examCenterId)),

      // 7. Allocations count
      db
        .select({ count: sql<number>`count(*)` })
        .from(blockAllocations)
        .where(eq(blockAllocations.examCenterId, examCenterId)),

      // 8. Orders count
      db
        .select({ count: sql<number>`count(*)` })
        .from(orders)
        .where(eq(orders.examCenterId, examCenterId)),

      // 9. QP Inventory
      db
        .select({
          expected: sql<number>`COALESCE(sum(${qpInventory.expectedPackets}), 0)`,
          received: sql<number>`COALESCE(sum(${qpInventory.receivedPackets}), 0)`,
        })
        .from(qpInventory)
        .where(eq(qpInventory.examCenterId, examCenterId)),

      // 10. Today's exams
      db
        .select({ count: sql<number>`count(*)` })
        .from(timetable)
        .where(
          and(
            eq(timetable.examCenterId, examCenterId),
            sql`date(${timetable.date}) = CURRENT_DATE`,
          ),
        ),

      // 11. Resolved CPS
      db
        .select({
          resolved: sql<number>`COALESCE(sum(jsonb_array_length(${timetable.cpsResolved})), 0)`,
        })
        .from(timetable)
        .where(eq(timetable.examCenterId, examCenterId)),

      // 12. CPS by date
      db
        .select({
          date: timetable.date,
          cpsCount: sql<number>`COALESCE(jsonb_array_length(${timetable.cpsStudents}), 0)`,
        })
        .from(timetable)
        .where(
          and(
            eq(timetable.examCenterId, examCenterId),
            sql`${timetable.cpsStudents} IS NOT NULL AND ${timetable.cpsStudents} != '[]'::jsonb`,
          ),
        ),
    ]);

    // ============================================================
    // BATCH 2: Derived queries (depend on BATCH 1 results)
    // ============================================================

    const center = centerResult[0];
    if (!center) {
      return { success: false, error: 'Exam center not found' };
    }

    // Department distribution
    const deptData = await db
      .select({
        department: students.scheme,
        studentCount: sql<number>`count(*)`,
      })
      .from(students)
      .where(eq(students.examCenterId, examCenterId))
      .groupBy(students.scheme);

    const deptMap = new Map<string, number>();
    let totalDeptStudents = 0;
    deptData.forEach((row: any) => {
      const dept = getDeptFullName(row.department?.split('-')[0]?.toUpperCase()) || 'Unknown';
      const count = Number(row.studentCount);
      deptMap.set(dept, (deptMap.get(dept) || 0) + count);
      totalDeptStudents += count;
    });

    const departmentDistribution = Array.from(deptMap.entries())
      .map(([dept, count]) => ({
        department: dept,
        staffCount: count,
        percentage: totalDeptStudents > 0 ? Math.round((count / totalDeptStudents) * 100) : 0,
      }))
      .sort((a, b) => b.staffCount - a.staffCount);

    // ============================================================
    // BATCH 3: Session distribution & subject enrollment
    // ============================================================

    const [sessionData, subjectEnrollmentData] = await Promise.all([
      // Session distribution
      db
        .select({
          date: timetable.date,
          session: timetable.session,
          students: sql<number>`sum(${timetable.totalStudents})`,
        })
        .from(timetable)
        .where(eq(timetable.examCenterId, examCenterId))
        .groupBy(timetable.date, timetable.session)
        .orderBy(timetable.date),

      // Subject enrollment
      db
        .select({
          subjectCode: timetable.subjectCode,
          subjectName: timetable.subjectName,
          scheme: timetable.scheme,
          totalStudents: sql<number>`sum(${timetable.totalStudents})`,
        })
        .from(timetable)
        .where(eq(timetable.examCenterId, examCenterId))
        .groupBy(timetable.subjectCode, timetable.subjectName, timetable.scheme)
        .orderBy(sql`sum(${timetable.totalStudents}) DESC`),
    ]);

    // ============================================================
    // BATCH 4: Attendance extremes
    // ============================================================

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

    // ============================================================
    // BATCH 5: Daily schedule
    // ============================================================

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
        `,
      )
      .where(eq(timetable.examCenterId, examCenterId))
      .groupBy(timetable.date, timetable.session)
      .orderBy(timetable.date);

    // ============================================================
    // PROCESS RESULTS
    // ============================================================

    const statsRow = timetableStats[0];
    const ttStats = {
      totalEntries: Number(statsRow?.totalEntries || 0),
      uniqueSubjects: Number(statsRow?.uniqueSubjects || 0),
      uniqueSchemes: Number(statsRow?.uniqueSchemes || 0),
      totalStudents: Number(statsRow?.totalStudents || 0),
      totalAbsent: Number(statsRow?.totalAbsent || 0),
      totalCps: Number(statsRow?.totalCps || 0),
      dateRange: statsRow?.minDate && statsRow?.maxDate
        ? { min: new Date(statsRow.minDate), max: new Date(statsRow.maxDate) }
        : null,
    };

    const studentRow = studentCounts[0];
    const totalExaminees = Number(studentRow?.totalExaminees || 0);
    const totalStudents = Number(studentRow?.uniqueStudents || 0);

    // Attendance rate
    const attendanceRate = totalExaminees > 0
      ? Math.round(((totalExaminees - ttStats.totalAbsent) / totalExaminees) * 100)
      : 0;

    // Exam days
    let totalExamDays = 0;
    if (ttStats.dateRange) {
      const diff = Math.abs(
        new Date(ttStats.dateRange.max).getTime() - new Date(ttStats.dateRange.min).getTime()
      );
      totalExamDays = Math.ceil(diff / (1000 * 60 * 60 * 24)) + 1;
    }

    // Staff stats
    let totalStaff = 0;
    let totalSupervisors = 0;
    let totalRelievers = 0;
    staffStats.forEach((row: any) => {
      const count = Number(row.typeCount);
      totalStaff += count;
      if (row.byType === 'SUPERVISOR') totalSupervisors += count;
      if (row.byType === 'RELIEVER') totalRelievers += count;
    });

    // Block utilization
    const blockUtilization = blockList.map((block: any) => ({
      blockNo: block.blockNo,
      location: block.location,
      strength: block.strength || 40,
      totalAllocated: Number(block.allocated) || 0,
      utilization: block.strength
        ? Math.min(Math.round((Number(block.allocated) / block.strength) * 100), 100)
        : 0,
    }));

    // Subject enrollment
    const sorted = subjectEnrollmentData.map((s: any) => ({
      code: s.subjectCode,
      name: s.subjectName || s.subjectCode,
      students: Number(s.totalStudents) || 0,
      scheme: s.scheme,
    }));
    const highestEnrollment = sorted.slice(0, 5);
    const lowestEnrollment = sorted.filter((s: any) => s.students > 0).slice(-5).reverse();

    // Attendance extremes
    const formattedAttendance = attendanceData.map((row: any) => ({
      date: new Date(row.date),
      session: row.session || 'Unknown',
      students: Number(row.totalStudents) || 0,
      subjectCode: row.subjectCode,
      subjectName: row.subjectName || row.subjectCode,
    }));
    const highest = formattedAttendance.length > 0 ? formattedAttendance[0] : null;
    const lowest = formattedAttendance.length > 0 ? formattedAttendance[formattedAttendance.length - 1] : null;

    // QP Inventory
    const qpRow = qpData[0];
    const qpStatus = {
      totalExpected: Number(qpRow?.expected || 0),
      totalReceived: Number(qpRow?.received || 0),
      pending: Math.max(0, (Number(qpRow?.expected || 0) - Number(qpRow?.received || 0))),
      completion: (Number(qpRow?.expected || 1) > 0)
        ? Math.round(((Number(qpRow?.received || 0) / Number(qpRow?.expected || 1)) * 100))
        : 0,
    };

    // Session distribution
    const sessionMap = new Map<string, { morning: number; afternoon: number }>();
    sessionData.forEach((row: any) => {
      const dateStr = new Date(row.date).toLocaleDateString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
      });
      if (!sessionMap.has(dateStr)) {
        sessionMap.set(dateStr, { morning: 0, afternoon: 0 });
      }
      const studentsCount = Number(row.students) || 0;
      if (row.session?.toLowerCase().includes('morning')) {
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

    // Malpractice cases
    const totalCPS = ttStats.totalCps;
    const resolvedCPS = Number(resolvedData[0]?.resolved || 0);
    const pendingCPS = totalCPS - resolvedCPS;

    const cpsByDate = cpsByDateData
      .filter((row: any) => Number(row.cpsCount) > 0)
      .map((row: any) => ({
        date: new Date(row.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
        count: Number(row.cpsCount),
      }));

    // Daily schedule
    const dailySchedule = dailyScheduleData.map((row: any) => ({
      date: new Date(row.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
      session: row.session || 'Unknown',
      subjects: Number(row.subjects) || 0,
      students: Number(row.students) || 0,
      blocks: Number(row.blocks) || 0,
    }));

    // Real-time
    const today = new Date();
    const currentHour = today.getHours();

    // ============================================================
    // BUILD RESPONSE
    // ============================================================

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
        totalSubjects: ttStats.uniqueSubjects,
        totalConnectedInstitutes: connectedInsts.length,
        totalExamDays,
        totalSessions: ttStats.totalEntries,
        totalPapers: ttStats.totalStudents,
        totalAllocations: Number(allocationCount[0]?.count || 0),
        totalOrders: Number(orderCount[0]?.count || 0),
      },
      departmentDistribution,
      sessionDistribution,
      subjectEnrollment: { highest: highestEnrollment, lowest: lowestEnrollment },
      attendanceExtremes: {
        highest: highest ? {
          date: highest.date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
          session: highest.session,
          students: highest.students,
          subjectCode: highest.subjectCode,
          subjectName: highest.subjectName,
        } : { date: '', session: '', students: 0, subjectCode: '', subjectName: '' },
        lowest: lowest ? {
          date: lowest.date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
          session: lowest.session,
          students: lowest.students,
          subjectCode: lowest.subjectCode,
          subjectName: lowest.subjectName,
        } : { date: '', session: '', students: 0, subjectCode: '', subjectName: '' },
      },
      blockUtilization,
      staffDuty: {
        totalSupervisors,
        totalRelievers,
        onDutyToday: totalSupervisors + totalRelievers,
        available: Math.max(0, totalStaff - totalSupervisors - totalRelievers),
      },
      qpInventoryStatus: qpStatus,
      dailySchedule: dailySchedule.slice(0, 10),
      malpracticeCases: {
        total: totalCPS,
        pending: pendingCPS,
        resolved: resolvedCPS,
        byDate: cpsByDate,
      },
      connectedInstitutes: connectedInsts.map((inst: any) => ({
        code: inst.code || 'N/A',
        name: inst.name || 'N/A',
        students: Number(inst.studentCount) || 0,
        isActive: inst.isActive || false,
      })),
      realtimeStatus: {
        currentSession: currentHour < 12 ? 'Morning' : 'Afternoon',
        currentDate: today.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
        examsInProgress: Number(todayExams[0]?.count || 0),
        examsCompleted: ttStats.totalEntries - Number(todayExams[0]?.count || 0),
        attendanceRate,
      },
      message: `Exam data for ${center.name} - ${center.season} ${center.examYear}`,
      lastUpdated: new Date(),
    };

    const duration = performance.now() - start;
    logger.info(fn, `Dashboard data fetched in ${duration.toFixed(0)}ms`, {
      examCenterId,
      totalStudents,
      totalStaff,
      uniqueSubjects: ttStats.uniqueSubjects,
      attendanceRate,
    });

    return { success: true, data: dashboardData };
  } catch (error) {
    logger.error(fn, 'Failed to fetch dashboard data', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch dashboard data',
    };
  }
}