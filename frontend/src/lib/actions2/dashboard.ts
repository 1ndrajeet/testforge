// lib/actions/dashboard.ts
'use server';

import departmentsMap from '@/config/course_codes.json';
import { and, eq, sql } from 'drizzle-orm';

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

// ============================================
// OPTIMIZED HYBRID APPROACH
// ============================================
// NeonDB Free Tier Constraints:
// - Max 10-20 concurrent connections
// - Query timeout limits
// - Shared CPU resources
// - Data transfer limits
// 
// Strategy:
// 1. Use 1 query for counts (minimal data transfer)
// 2. Use 1 query for aggregates (GROUP BY with JSON aggregation)
// 3. Use 1 query for lists (raw data)
// Total: 3 queries maximum
// ============================================

export async function getExamOfficerDashboard(): Promise<{
  success: boolean;
  data?: ExamOfficerDashboardData;
  error?: string;
}> {
  const MODULE_FN = `${MODULE}.getExamOfficerDashboard`;
  const start = performance.now();

  try {
    const examCenterId = await getExamCenterId();
    if (!examCenterId) {
      return { success: false, error: 'Exam center not found' };
    }

    // ============================================
    // OPTIMIZATION: Execute 3 queries max (not 16)
    // ============================================
    const [
      centerResult,
      countsResult,
      aggregatesResult,
    ] = await Promise.all([
      // 1. Center details (single row)
      db
        .select()
        .from(examCenters)
        .where(eq(examCenters.id, examCenterId))
        .limit(1),

      // 2. All COUNT queries in ONE query
      // Uses jsonb_build_object to return all counts as a single row
      db.execute(sql`
        SELECT jsonb_build_object(
          'total_examinees', (SELECT COUNT(*) FROM students WHERE exam_center_id = ${examCenterId} AND is_deleted = false),
          'unique_students', (SELECT COUNT(DISTINCT enrollment_number) FROM students WHERE exam_center_id = ${examCenterId} AND is_deleted = false),
          'total_staff', (SELECT COUNT(*) FROM staff WHERE exam_center_id = ${examCenterId} AND is_deleted = false),
          'total_blocks', (SELECT COUNT(*) FROM blocks WHERE exam_center_id = ${examCenterId} AND is_deleted = false),
          'supervisors', (SELECT COUNT(*) FROM staff WHERE exam_center_id = ${examCenterId} AND staff_type = 'SUPERVISOR' AND is_deleted = false),
          'relievers', (SELECT COUNT(*) FROM staff WHERE exam_center_id = ${examCenterId} AND staff_type = 'RELIEVER' AND is_deleted = false),
          'total_allocations', (SELECT COUNT(*) FROM block_allocations WHERE exam_center_id = ${examCenterId}),
          'total_orders', (SELECT COUNT(*) FROM orders WHERE exam_center_id = ${examCenterId}),
          'qp_expected', (SELECT COALESCE(SUM(expected_packets), 0) FROM qp_inventory WHERE exam_center_id = ${examCenterId}),
          'qp_received', (SELECT COALESCE(SUM(received_packets), 0) FROM qp_inventory WHERE exam_center_id = ${examCenterId}),
          'today_exams', (SELECT COUNT(*) FROM timetable WHERE exam_center_id = ${examCenterId} AND DATE(date) = CURRENT_DATE),
          'cps_resolved', (SELECT COALESCE(SUM(jsonb_array_length(cps_resolved)), 0) FROM timetable WHERE exam_center_id = ${examCenterId}),
          'total_absent', (SELECT COALESCE(SUM(jsonb_array_length(absent_numbers)), 0) FROM timetable WHERE exam_center_id = ${examCenterId}),
          'total_cps', (SELECT COALESCE(SUM(jsonb_array_length(cps_students)), 0) FROM timetable WHERE exam_center_id = ${examCenterId}),
          'total_entries', (SELECT COUNT(*) FROM timetable WHERE exam_center_id = ${examCenterId}),
          'total_papers', (SELECT COALESCE(SUM(total_students), 0) FROM timetable WHERE exam_center_id = ${examCenterId}),
          'min_date', (SELECT MIN(date) FROM timetable WHERE exam_center_id = ${examCenterId}),
          'max_date', (SELECT MAX(date) FROM timetable WHERE exam_center_id = ${examCenterId})
        ) as counts
      `),

      // 3. ALL data aggregates in ONE query
      db.execute(sql`
        SELECT jsonb_build_object(
          'institutes', (
            SELECT jsonb_agg(
              jsonb_build_object(
                'code', ci.institute_code,
                'name', ci.institute_name,
                'is_active', ci.is_active,
                'student_count', COUNT(s.id)
              )
            )
            FROM connected_institutes ci
            LEFT JOIN students s ON s.connected_institute_id = ci.id AND s.is_deleted = false
            WHERE ci.exam_center_id = ${examCenterId}
            GROUP BY ci.id, ci.institute_code, ci.institute_name, ci.is_active
          ),
          'staff_stats', (
            SELECT jsonb_agg(
              jsonb_build_object(
                'byType', staff_type,
                'typeCount', COUNT(*)
              )
            )
            FROM staff
            WHERE exam_center_id = ${examCenterId} AND is_deleted = false
            GROUP BY staff_type
          ),
          'blocks', (
            SELECT jsonb_agg(
              jsonb_build_object(
                'id', b.id,
                'blockNo', b.block_no,
                'location', b.location,
                'strength', b.strength,
                'allocated', COUNT(ba.id)
              )
            )
            FROM blocks b
            LEFT JOIN block_allocations ba ON ba.block_id = b.id
            WHERE b.exam_center_id = ${examCenterId} AND b.is_deleted = false
            GROUP BY b.id, b.block_no, b.location, b.strength
          ),
          'dept_distribution', (
            SELECT jsonb_agg(
              jsonb_build_object(
                'department', scheme,
                'studentCount', COUNT(*)
              )
            )
            FROM students
            WHERE exam_center_id = ${examCenterId} AND is_deleted = false
            GROUP BY scheme
          ),
          'session_distribution', (
            SELECT jsonb_agg(
              jsonb_build_object(
                'date', date,
                'session', session,
                'students', total
              )
            )
            FROM (
              SELECT date, session, SUM(total_students) as total
              FROM timetable
              WHERE exam_center_id = ${examCenterId}
              GROUP BY date, session
              ORDER BY date
            ) sd
          ),
          'subject_enrollment', (
            SELECT jsonb_agg(
              jsonb_build_object(
                'subjectCode', subject_code,
                'subjectName', subject_name,
                'scheme', scheme,
                'totalStudents', total
              )
            )
            FROM (
              SELECT subject_code, subject_name, scheme, SUM(total_students) as total
              FROM timetable
              WHERE exam_center_id = ${examCenterId}
              GROUP BY subject_code, subject_name, scheme
              ORDER BY total DESC
            ) se
          ),
          'attendance_extremes', (
            SELECT jsonb_agg(
              jsonb_build_object(
                'date', date,
                'session', session,
                'subjectCode', subject_code,
                'subjectName', subject_name,
                'totalStudents', total_students
              )
            )
            FROM timetable
            WHERE exam_center_id = ${examCenterId}
            ORDER BY total_students DESC
          ),
          'cps_by_date', (
            SELECT jsonb_agg(
              jsonb_build_object(
                'date', date,
                'cpsCount', COALESCE(jsonb_array_length(cps_students), 0)
              )
            )
            FROM timetable
            WHERE exam_center_id = ${examCenterId}
              AND cps_students IS NOT NULL 
              AND cps_students != '[]'::jsonb
          ),
          'daily_schedule', (
            SELECT jsonb_agg(
              jsonb_build_object(
                'date', date,
                'session', session,
                'subjects', subjects,
                'students', students,
                'blocks', blocks
              )
            )
            FROM (
              SELECT 
                tt.date,
                tt.session,
                COUNT(DISTINCT tt.subject_code) as subjects,
                SUM(tt.total_students) as students,
                COUNT(DISTINCT ba.block_id) as blocks
              FROM timetable tt
              LEFT JOIN block_allocations ba 
                ON ba.date = tt.date 
                AND ba.session = tt.session 
                AND ba.exam_center_id = tt.exam_center_id
              WHERE tt.exam_center_id = ${examCenterId}
              GROUP BY tt.date, tt.session
              ORDER BY tt.date
            ) ds
          )
        ) as aggregates
      `),
    ]);

    // ============================================
    // PROCESS RESULTS
    // ============================================

    // 1. Center details
    if (!centerResult || centerResult.length === 0) {
      return { success: false, error: 'Exam center not found' };
    }
    const center = centerResult[0];

    // 2. Counts - parse from JSON
    const countsJson = countsResult.rows[0] as any;
    const counts = countsJson?.counts || {};
    
    const totalExaminees = Number(counts.total_examinees) || 0;
    const totalStudents = Number(counts.unique_students) || 0;
    const totalStaff = Number(counts.total_staff) || 0;
    const totalBlocks = Number(counts.total_blocks) || 0;
    const totalSupervisors = Number(counts.supervisors) || 0;
    const totalRelievers = Number(counts.relievers) || 0;
    const totalAllocations = Number(counts.total_allocations) || 0;
    const totalOrders = Number(counts.total_orders) || 0;
    const qpExpected = Number(counts.qp_expected) || 0;
    const qpReceived = Number(counts.qp_received) || 0;
    const todayExamsCount = Number(counts.today_exams) || 0;
    const resolvedCPS = Number(counts.cps_resolved) || 0;
    const totalAbsent = Number(counts.total_absent) || 0;
    const totalCPS = Number(counts.total_cps) || 0;
    const totalEntries = Number(counts.total_entries) || 0;
    const totalPapers = Number(counts.total_papers) || 0;
    const minDate = counts.min_date ? new Date(counts.min_date) : null;
    const maxDate = counts.max_date ? new Date(counts.max_date) : null;

    // 3. Aggregates - parse from JSON
    const aggJson = aggregatesResult.rows[0] as any;
    const agg = aggJson?.aggregates || {};

    const connectedInsts = agg.institutes || [];
    const staffStats = agg.staff_stats || [];
    const blockList = agg.blocks || [];
    const deptDistribution = agg.dept_distribution || [];
    const sessionData = agg.session_distribution || [];
    const subjectEnrollment = agg.subject_enrollment || [];
    const attendanceData = agg.attendance_extremes || [];
    const cpsByDateResult = agg.cps_by_date || [];
    const dailyScheduleResult = agg.daily_schedule || [];

    // ============================================
    // DERIVED CALCULATIONS
    // ============================================

    // Exam days
    let totalExamDays = 0;
    if (minDate && maxDate) {
      const diffTime = maxDate.getTime() - minDate.getTime();
      totalExamDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    }

    // Unique subjects
    const uniqueSubjects = new Set(subjectEnrollment.map((s: any) => s.subjectCode)).size;

    // Department distribution with full names
    const deptMap = new Map<string, number>();
    let totalDeptStudents = 0;
    deptDistribution.forEach((d: any) => {
      const dept = getDeptFullName(d.department?.split('-')[0]?.toUpperCase()) || 'Unknown';
      const count = Number(d.studentCount) || 0;
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

    // Session distribution
    const sessionMap = new Map<string, { morning: number; afternoon: number }>();
    sessionData.forEach((sd: any) => {
      const dateStr = new Date(sd.date).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
      if (!sessionMap.has(dateStr)) {
        sessionMap.set(dateStr, { morning: 0, afternoon: 0 });
      }
      const session = sd.session?.toLowerCase() || '';
      const count = Number(sd.students) || 0;
      if (session.includes('morning')) {
        sessionMap.get(dateStr)!.morning += count;
      } else {
        sessionMap.get(dateStr)!.afternoon += count;
      }
    });

    const sessionDistribution = Array.from(sessionMap.entries()).map(([date, data]) => ({
      date,
      morning: data.morning,
      afternoon: data.afternoon,
      total: data.morning + data.afternoon,
    }));

    // Subject enrollment
    const sorted = subjectEnrollment.map((s: any) => ({
      code: s.subjectCode,
      name: s.subjectName || s.subjectCode,
      students: Number(s.totalStudents) || 0,
      scheme: s.scheme,
    }));

    const highestEnrollment = sorted.slice(0, 5);
    const lowestEnrollment = sorted.filter((s: any) => s.students > 0).slice(-5).reverse();

    // Attendance extremes
    const formattedAttendance = attendanceData.map((a: any) => ({
      date: new Date(a.date),
      session: a.session || 'Unknown',
      students: Number(a.totalStudents) || 0,
      subjectCode: a.subjectCode,
      subjectName: a.subjectName || a.subjectCode,
    }));

    const highest = formattedAttendance.length > 0 ? formattedAttendance[0] : null;
    const lowest = formattedAttendance.length > 0 ? formattedAttendance[formattedAttendance.length - 1] : null;

    // QP Inventory status
    const qpStatus = {
      totalExpected: qpExpected,
      totalReceived: qpReceived,
      pending: Math.max(0, qpExpected - qpReceived),
      completion: qpExpected > 0 ? Math.round((qpReceived / qpExpected) * 100) : 0,
    };

    // CPS by date
    const cpsByDate = cpsByDateResult
      .filter((c: any) => Number(c.cpsCount) > 0)
      .map((c: any) => ({
        date: new Date(c.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
        count: Number(c.cpsCount),
      }));

    // Daily schedule
    const dailySchedule = dailyScheduleResult.map((d: any) => ({
      date: new Date(d.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
      session: d.session || 'Unknown',
      subjects: Number(d.subjects) || 0,
      students: Number(d.students) || 0,
      blocks: Number(d.blocks) || 0,
    }));

    // Real-time status
    const today = new Date();
    const currentHour = today.getHours();
    const currentSession = currentHour < 12 ? 'Morning' : 'Afternoon';

    // Attendance rate
    const attendanceRate =
      totalExaminees > 0 ? Math.round(((totalExaminees - totalAbsent) / totalExaminees) * 100) : 0;

    // Malpractice cases
    const pendingCPS = totalCPS - resolvedCPS;

    // ============================================
    // BUILD RESPONSE
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
        totalBlocks,
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
      malpracticeCases: {
        total: totalCPS,
        pending: pendingCPS,
        resolved: resolvedCPS,
        byDate: cpsByDate,
      },
      connectedInstitutes: connectedInsts.map((inst: any) => ({
        code: inst.code || 'N/A',
        name: inst.name || 'N/A',
        students: Number(inst.student_count) || 0,
        isActive: inst.is_active || false,
      })),
      realtimeStatus: {
        currentSession,
        currentDate: today.toLocaleDateString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        }),
        examsInProgress: todayExamsCount,
        examsCompleted: Math.max(0, totalEntries - todayExamsCount),
        attendanceRate,
      },
      message: `Exam data for ${center.name} - ${center.season} ${center.examYear}`,
      lastUpdated: new Date(),
    };

    const duration = performance.now() - start;
    logger.info(MODULE_FN, `Dashboard fetched in ${duration.toFixed(0)}ms (${Object.keys(dashboardData).length} metrics)`, {
      examCenterId,
      totalStudents,
      totalStaff,
      totalSubjects: uniqueSubjects,
      attendanceRate,
      queries: 3,
    });

    return { success: true, data: dashboardData };
  } catch (error) {
    const duration = performance.now() - start;
    logger.error(MODULE_FN, `Failed to fetch dashboard data after ${duration.toFixed(0)}ms`, { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch dashboard data',
    };
  }
}