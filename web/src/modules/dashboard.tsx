'use client';

import { useCallback, useEffect, useState } from 'react';

import Link from 'next/link';

import departmentsMap from '@/config/course_codes.json';
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Title,
  Tooltip,
} from 'chart.js';
import { format } from 'date-fns';
import {
  Blocks,
  BookOpen,
  Building2,
  Calendar,
  ClipboardList,
  Clock,
  Download,
  FileText,
  Grid3x3,
  LayoutDashboard,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  UserCheck,
  Users,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import { toast } from 'sonner';

import { createClient } from '@/lib/supabase/client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

import { PageEmpty, PageHeader, PageToolbar } from '@/components/layout/page-layout';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement,
  Filler,
);

// ============================================================================
// Types
// ============================================================================

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

const getDeptFullName = (code: string): string => {
  return (departmentsMap as Record<string, string>)[code] || code;
};

// ============================================================================
// Direct Supabase Query Function
// ============================================================================

export async function getExamOfficerDashboard(): Promise<{
  success: boolean;
  data?: ExamOfficerDashboardData;
  error?: string;
}> {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return { success: false, error: 'User not authenticated' };
    }

    // 1. Center details for logged-in user
    const { data: center, error: centerErr } = await supabase
      .from('exam_centers')
      .select(
        'id, code, name, season, exam_year, officer_incharge, sealing_supervisor, dist_center_code, dist_center_name, start_date, end_date, departments',
      )
      .eq('owner_id', user.id)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (centerErr || !center) {
      return {
        success: false,
        error: 'Exam center not found. Please complete onboarding first.',
      };
    }

    const examCenterId = center.id;

    // 2. Parallel queries for dashboard metrics & aggregates
    const [
      { count: totalExaminees },
      { count: totalStaff },
      { count: totalBlocks },
      { count: supervisorsCount },
      { count: relieversCount },
      { count: totalAllocations },
      { count: totalOrders },
      { data: qpItems },
      { data: timetableRows },
      { data: connectedInsts },
      { data: blockRows },
      { data: studentSchemes },
      { data: allocationsData },
    ] = await Promise.all([
      supabase
        .from('students')
        .select('*', { count: 'exact', head: true })
        .eq('exam_center_id', examCenterId)
        .eq('is_deleted', false),
      supabase
        .from('staff')
        .select('*', { count: 'exact', head: true })
        .eq('exam_center_id', examCenterId)
        .eq('is_deleted', false),
      supabase
        .from('blocks')
        .select('*', { count: 'exact', head: true })
        .eq('exam_center_id', examCenterId)
        .eq('is_deleted', false),
      supabase
        .from('staff')
        .select('*', { count: 'exact', head: true })
        .eq('exam_center_id', examCenterId)
        .eq('staff_type', 'SUPERVISOR')
        .eq('is_deleted', false),
      supabase
        .from('staff')
        .select('*', { count: 'exact', head: true })
        .eq('exam_center_id', examCenterId)
        .eq('staff_type', 'RELIEVER')
        .eq('is_deleted', false),
      supabase
        .from('block_allocations')
        .select('*', { count: 'exact', head: true })
        .eq('exam_center_id', examCenterId),
      supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('exam_center_id', examCenterId),
      supabase
        .from('qp_inventory')
        .select('expected_packets, received_packets')
        .eq('exam_center_id', examCenterId),
      supabase
        .from('timetable')
        .select(
          'date, session, subject_code, subject_name, scheme, total_students, absent_numbers, cps_students, cps_resolved',
        )
        .eq('exam_center_id', examCenterId),
      supabase
        .from('connected_institutes')
        .select('id, institute_code, institute_name, is_active')
        .eq('exam_center_id', examCenterId),
      supabase
        .from('blocks')
        .select('id, block_no, location, strength')
        .eq('exam_center_id', examCenterId)
        .eq('is_deleted', false),
      supabase
        .from('students')
        .select('scheme, enrollment_number, connected_institute_id')
        .eq('exam_center_id', examCenterId)
        .eq('is_deleted', false),
      supabase
        .from('block_allocations')
        .select('block_id, date, session, assigned_count')
        .eq('exam_center_id', examCenterId),
    ]);

    // QP Inventory Calculations
    let qpExpected = 0;
    let qpReceived = 0;
    for (const q of qpItems || []) {
      qpExpected += q.expected_packets || 0;
      qpReceived += q.received_packets || 0;
    }
    const qpStatus = {
      totalExpected: qpExpected,
      totalReceived: qpReceived,
      pending: Math.max(0, qpExpected - qpReceived),
      completion: qpExpected > 0 ? Math.round((qpReceived / qpExpected) * 100) : 0,
    };

    // Timetable calculations
    const ttList = timetableRows || [];
    const dates = ttList
      .map((t) => t.date)
      .filter(Boolean)
      .sort();
    const minDate = dates.length > 0 ? new Date(dates[0]) : null;
    const maxDate = dates.length > 0 ? new Date(dates[dates.length - 1]) : null;
    let totalExamDays = 0;
    if (minDate && maxDate) {
      const diffTime = maxDate.getTime() - minDate.getTime();
      totalExamDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    }

    const uniqueSubjects = new Set(ttList.map((t) => t.subject_code).filter(Boolean)).size;
    let totalPapers = 0;
    let totalAbsent = 0;
    let totalCPS = 0;
    let resolvedCPS = 0;

    const todayStr = new Date().toISOString().split('T')[0];
    let todayExamsCount = 0;

    const cpsDateMap = new Map<string, number>();
    const sessionMap = new Map<string, { morning: number; afternoon: number }>();
    const subjectEnrollMap = new Map<string, { name: string; students: number; scheme: string }>();

    for (const tt of ttList) {
      totalPapers += tt.total_students || 0;
      if (tt.date === todayStr) todayExamsCount++;

      const absents = Array.isArray(tt.absent_numbers) ? tt.absent_numbers.length : 0;
      totalAbsent += absents;

      const cps = Array.isArray(tt.cps_students) ? tt.cps_students.length : 0;
      totalCPS += cps;
      const res = Array.isArray(tt.cps_resolved) ? tt.cps_resolved.length : 0;
      resolvedCPS += res;

      if (cps > 0 && tt.date) {
        cpsDateMap.set(tt.date, (cpsDateMap.get(tt.date) || 0) + cps);
      }

      // Session map
      if (tt.date) {
        if (!sessionMap.has(tt.date)) {
          sessionMap.set(tt.date, { morning: 0, afternoon: 0 });
        }
        const s = (tt.session || '').toLowerCase();
        const stds = tt.total_students || 0;
        if (s.includes('morning')) {
          sessionMap.get(tt.date)!.morning += stds;
        } else {
          sessionMap.get(tt.date)!.afternoon += stds;
        }
      }

      // Subject enrollment
      const subKey = `${tt.subject_code || 'SUB'}_${tt.scheme || ''}`;
      const prev = subjectEnrollMap.get(subKey) || {
        name: tt.subject_name || tt.subject_code || 'Subject',
        students: 0,
        scheme: tt.scheme || '',
      };
      prev.students += tt.total_students || 0;
      subjectEnrollMap.set(subKey, prev);
    }

    // Department distribution
    const deptMap = new Map<string, number>();
    let totalDeptStudents = 0;
    for (const s of studentSchemes || []) {
      const deptCode = (s.scheme || '').split('-')[0]?.toUpperCase() || 'UNKNOWN';
      const dept = getDeptFullName(deptCode);
      deptMap.set(dept, (deptMap.get(dept) || 0) + 1);
      totalDeptStudents++;
    }

    const departmentDistribution = Array.from(deptMap.entries())
      .map(([dept, count]) => ({
        department: dept,
        staffCount: count,
        percentage: totalDeptStudents > 0 ? Math.round((count / totalDeptStudents) * 100) : 0,
      }))
      .sort((a, b) => b.staffCount - a.staffCount);

    // Block utilization
    const blockAllocCount = new Map<string, number>();
    for (const a of allocationsData || []) {
      if (a.block_id) {
        blockAllocCount.set(
          a.block_id,
          (blockAllocCount.get(a.block_id) || 0) + (a.assigned_count || 1),
        );
      }
    }

    const blockUtilization = (blockRows || []).map((block) => {
      const allocated = blockAllocCount.get(block.id) || 0;
      const strength = block.strength || 40;
      return {
        blockNo: block.block_no,
        location: block.location || 'Building',
        strength,
        totalAllocated: allocated,
        utilization: strength ? Math.min(Math.round((allocated / strength) * 100), 100) : 0,
      };
    });

    // Connected institutes student counts
    const instStudentMap = new Map<string, number>();
    for (const s of studentSchemes || []) {
      if (s.connected_institute_id) {
        instStudentMap.set(
          s.connected_institute_id,
          (instStudentMap.get(s.connected_institute_id) || 0) + 1,
        );
      }
    }

    // Session distribution
    const sessionDistribution = Array.from(sessionMap.entries()).map(([date, data]) => ({
      date,
      morning: data.morning,
      afternoon: data.afternoon,
      total: data.morning + data.afternoon,
    }));

    // Subject enrollment highest / lowest
    const sortedSubjects = Array.from(subjectEnrollMap.entries())
      .map(([key, val]) => ({
        code: key.split('_')[0],
        name: val.name,
        students: val.students,
        scheme: val.scheme,
      }))
      .sort((a, b) => b.students - a.students);

    const highestEnrollment = sortedSubjects.slice(0, 5);
    const lowestEnrollment = sortedSubjects
      .filter((s) => s.students > 0)
      .slice(-5)
      .reverse();

    // Attendance extremes
    const sortedByStudents = [...ttList].sort(
      (a, b) => (b.total_students || 0) - (a.total_students || 0),
    );
    const highestItem = sortedByStudents[0];
    const lowestItem = sortedByStudents[sortedByStudents.length - 1];

    // CPS by date
    const cpsByDate = Array.from(cpsDateMap.entries()).map(([date, count]) => ({
      date,
      count,
    }));

    // Daily schedule
    const scheduleMap = new Map<
      string,
      {
        date: string;
        session: string;
        subjects: Set<string>;
        students: number;
        blocks: Set<string>;
      }
    >();
    for (const tt of ttList) {
      const key = `${tt.date}_${tt.session}`;
      if (!scheduleMap.has(key)) {
        scheduleMap.set(key, {
          date: tt.date || '',
          session: tt.session || '',
          subjects: new Set(),
          students: 0,
          blocks: new Set(),
        });
      }
      const entry = scheduleMap.get(key)!;
      if (tt.subject_code) entry.subjects.add(tt.subject_code);
      entry.students += tt.total_students || 0;
    }

    for (const a of allocationsData || []) {
      const key = `${a.date}_${a.session}`;
      if (scheduleMap.has(key) && a.block_id) {
        scheduleMap.get(key)!.blocks.add(a.block_id);
      }
    }

    const dailySchedule = Array.from(scheduleMap.values())
      .map((d) => ({
        date: d.date,
        session: d.session,
        subjects: d.subjects.size,
        students: d.students,
        blocks: d.blocks.size,
      }))
      .slice(0, 10);

    const currentHour = new Date().getHours();
    const currentSession = currentHour < 12 ? 'Morning' : 'Afternoon';
    const examineesCount = totalExaminees || 0;
    const attendanceRate =
      examineesCount > 0 ? Math.round(((examineesCount - totalAbsent) / examineesCount) * 100) : 0;

    const dashboardData: ExamOfficerDashboardData = {
      examCenter: {
        id: center.id,
        code: center.code || 'N/A',
        name: center.name || 'N/A',
        season: center.season || 'WINTER',
        year: center.exam_year || new Date().getFullYear(),
        officerIncharge: center.officer_incharge || 'Not Assigned',
        sealingSupervisor: center.sealing_supervisor || 'Not Assigned',
        distCenterCode: center.dist_center_code || 'N/A',
        distCenterName: center.dist_center_name || 'N/A',
        startDate: center.start_date ? new Date(center.start_date) : new Date(),
        endDate: center.end_date ? new Date(center.end_date) : new Date(),
        departments: (center.departments as string[]) || [],
      },
      metrics: {
        totalStudents:
          new Set((studentSchemes || []).map((s) => s.enrollment_number).filter(Boolean)).size ||
          examineesCount,
        totalExaminees: examineesCount,
        totalStaff: totalStaff || 0,
        totalBlocks: totalBlocks || 0,
        totalSubjects: uniqueSubjects,
        totalConnectedInstitutes: (connectedInsts || []).length,
        totalExamDays,
        totalSessions: ttList.length,
        totalPapers,
        totalAllocations: totalAllocations || 0,
        totalOrders: totalOrders || 0,
      },
      departmentDistribution,
      sessionDistribution,
      subjectEnrollment: {
        highest: highestEnrollment,
        lowest: lowestEnrollment,
      },
      attendanceExtremes: {
        highest: highestItem
          ? {
              date: highestItem.date ? String(highestItem.date).split('T')[0] : '',
              session: highestItem.session || '',
              students: highestItem.total_students || 0,
              subjectCode: highestItem.subject_code || '',
              subjectName: highestItem.subject_name || '',
            }
          : { date: '', session: '', students: 0, subjectCode: '', subjectName: '' },
        lowest: lowestItem
          ? {
              date: lowestItem.date ? String(lowestItem.date).split('T')[0] : '',
              session: lowestItem.session || '',
              students: lowestItem.total_students || 0,
              subjectCode: lowestItem.subject_code || '',
              subjectName: lowestItem.subject_name || '',
            }
          : { date: '', session: '', students: 0, subjectCode: '', subjectName: '' },
      },
      blockUtilization,
      staffDuty: {
        totalSupervisors: supervisorsCount || 0,
        totalRelievers: relieversCount || 0,
        onDutyToday: (supervisorsCount || 0) + (relieversCount || 0),
        available: Math.max(
          0,
          (totalStaff || 0) - ((supervisorsCount || 0) + (relieversCount || 0)),
        ),
      },
      qpInventoryStatus: qpStatus,
      dailySchedule,
      malpracticeCases: {
        total: totalCPS,
        pending: Math.max(0, totalCPS - resolvedCPS),
        resolved: resolvedCPS,
        byDate: cpsByDate,
      },
      connectedInstitutes: (connectedInsts || []).map((inst) => ({
        code: inst.institute_code || 'N/A',
        name: inst.institute_name || 'N/A',
        students: instStudentMap.get(inst.id) || 0,
        isActive: inst.is_active || false,
      })),
      realtimeStatus: {
        currentSession,
        currentDate: new Date().toLocaleDateString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        }),
        examsInProgress: todayExamsCount,
        examsCompleted: Math.max(0, ttList.length - todayExamsCount),
        attendanceRate,
      },
      message: `Exam data for ${center.name} - ${center.season || 'WINTER'} ${
        center.exam_year || ''
      }`,
      lastUpdated: new Date(),
    };

    return { success: true, data: dashboardData };
  } catch (error) {
    console.error('Failed to fetch dashboard data:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch dashboard data',
    };
  }
}

// ============================================================================
// Color System
// ============================================================================

const COLORS = {
  brand: {
    400: '#34D399',
    500: '#10B981',
    600: '#059669',
  },
  semantic: {
    success: '#10B981',
    warning: '#F59E0B',
    destructive: '#EF4444',
    info: '#3B82F6',
  },
  chart: [
    '#10B981',
    '#34D399',
    '#6EE7B7',
    '#3B82F6',
    '#60A5FA',
    '#8B5CF6',
    '#A78BFA',
    '#F59E0B',
    '#FBBF24',
    '#EF4444',
  ],
};

// ============================================================================
// Chart Options
// ============================================================================

const getBarOptions = (isDark: boolean) => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: isDark ? '#262626' : '#FFFFFF',
      titleColor: isDark ? '#F5F5F5' : '#171717',
      bodyColor: isDark ? '#A3A3A3' : '#525252',
      padding: 8,
      cornerRadius: 6,
      borderColor: isDark ? '#404040' : '#E5E5E5',
      borderWidth: 1,
    },
  },
  scales: {
    y: {
      beginAtZero: true,
      grid: { color: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' },
      ticks: { color: isDark ? '#A3A3A3' : '#737373', font: { size: 10 } },
    },
    x: {
      grid: { display: false },
      ticks: { color: isDark ? '#A3A3A3' : '#737373', font: { size: 9 } },
    },
  },
});

const getDoughnutOptions = (isDark: boolean) => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'right' as const,
      labels: {
        color: isDark ? '#A3A3A3' : '#737373',
        usePointStyle: true,
        pointStyle: 'circle',
        padding: 8,
        font: { size: 10 },
        boxWidth: 8,
      },
    },
    tooltip: {
      backgroundColor: isDark ? '#262626' : '#FFFFFF',
      titleColor: isDark ? '#F5F5F5' : '#171717',
      bodyColor: isDark ? '#A3A3A3' : '#525252',
      padding: 8,
      cornerRadius: 6,
    },
  },
  cutout: '65%',
});

const getLineOptions = (isDark: boolean) => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: isDark ? '#262626' : '#FFFFFF',
      titleColor: isDark ? '#F5F5F5' : '#171717',
      bodyColor: isDark ? '#A3A3A3' : '#525252',
      padding: 8,
      cornerRadius: 6,
    },
  },
  scales: {
    y: {
      beginAtZero: true,
      grid: { color: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' },
      ticks: { color: isDark ? '#A3A3A3' : '#737373', font: { size: 10 } },
    },
    x: {
      grid: { display: false },
      ticks: { color: isDark ? '#A3A3A3' : '#737373', font: { size: 9 } },
    },
  },
});

// ============================================================================
// Stats Card Component
// ============================================================================

interface StatsCardProps {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  color?: string;
  subtitle?: string;
}

function StatsCard({ label, value, icon, color = COLORS.brand[500], subtitle }: StatsCardProps) {
  return (
    <Card className="border-neutral-200 transition-shadow hover:shadow-sm dark:border-neutral-800">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{label}</p>
            <p className="mt-1 text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
              {typeof value === 'number' ? value.toLocaleString() : value}
            </p>
            {subtitle && (
              <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">{subtitle}</p>
            )}
          </div>
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: `${color}15` }}
          >
            <div
              className="text-base"
              style={{ color }}
            >
              {icon}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Quick Links
// ============================================================================

const QUICK_LINKS = [
  {
    id: 'timetable',
    name: 'Timetable',
    icon: Calendar,
    route: '/exam-setup/timetable',
    color: COLORS.brand[500],
  },
  {
    id: 'blocks',
    name: 'Blocks',
    icon: Blocks,
    route: '/exam-setup/block',
    color: COLORS.semantic.info,
  },
  {
    id: 'supervisors',
    name: 'Staff',
    icon: UserCheck,
    route: '/exam-setup/supervisors',
    color: COLORS.semantic.warning,
  },
  {
    id: 'allocate',
    name: 'Allocate',
    icon: Grid3x3,
    route: '/block-allocation/allocate',
    color: COLORS.semantic.success,
  },
  {
    id: 'absent',
    name: 'Attendance',
    icon: ClipboardList,
    route: '/exam-day/absent',
    color: COLORS.semantic.destructive,
  },
  {
    id: 'reports',
    name: 'Reports',
    icon: FileText,
    route: '/msbte-reports/f1',
    color: COLORS.semantic.info,
  },
];

function QuickLinks({ onNavigate }: { onNavigate: (route: string) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
      {QUICK_LINKS.map((link) => {
        const Icon = link.icon;
        return (
          <button
            key={link.id}
            onClick={() => onNavigate(link.route)}
            className="group flex flex-col items-center gap-1.5 rounded-lg border border-neutral-200 bg-white p-2.5 transition-all hover:border-neutral-300 hover:shadow-sm dark:border-neutral-800 dark:bg-neutral-950 dark:hover:border-neutral-700"
          >
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg transition-transform group-hover:scale-105"
              style={{ backgroundColor: `${link.color}15` }}
            >
              <Icon
                className="h-4 w-4"
                style={{ color: link.color }}
              />
            </div>
            <span className="text-[11px] font-medium text-neutral-700 dark:text-neutral-300">
              {link.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ============================================================================
// Skeleton
// ============================================================================

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="grid grid-cols-3 gap-4 sm:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton
            key={i}
            className="h-24 w-full rounded-lg"
          />
        ))}
      </div>
      <Skeleton className="h-16 w-full rounded-lg" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Skeleton className="h-64 w-full rounded-lg lg:col-span-2" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    </div>
  );
}

// ============================================================================
// Main Dashboard
// ============================================================================

export default function Dashboard() {
  const { theme } = useTheme();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ExamOfficerDashboardData | null>(null);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => setIsDark(theme === 'dark'), [theme]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getExamOfficerDashboard();
      if (result.success && result.data) {
        setData(result.data);
      } else {
        toast.error(result.error || 'Failed to load dashboard');
      }
    } catch {
      toast.error('Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefresh = () => {
    fetchData();
    toast.success('Dashboard refreshed');
  };

  const handleExport = () => {
    toast.success('Report exported');
  };

  const handleNavigate = (route: string) => {
    window.location.href = `/exam-center${route}`;
  };

  // Toolbar Actions
  const toolbarActions = [
    {
      id: 'refresh',
      label: 'Refresh',
      icon: <RefreshCw className="h-3.5 w-3.5" />,
      onClick: handleRefresh,
      variant: 'outline' as const,
    },
    {
      id: 'export',
      label: 'Export',
      icon: <Download className="h-3.5 w-3.5" />,
      onClick: handleExport,
      variant: 'ghost' as const,
    },
  ];

  if (loading) return <DashboardSkeleton />;

  if (!data) {
    return (
      <PageEmpty
        title="Failed to load dashboard"
        description="Please complete onboarding to configure your exam center, or retry."
        action={
          <div className="flex items-center gap-2">
            <Button
              onClick={handleRefresh}
              variant="outline"
              size="sm"
            >
              <RefreshCw className="mr-2 h-4 w-4" /> Retry
            </Button>
            <Button
              asChild
              size="sm"
            >
              <Link href="/onboarding">Setup Exam Center</Link>
            </Button>
          </div>
        }
      />
    );
  }

  const {
    examCenter: center,
    metrics,
    departmentDistribution,
    sessionDistribution,
    subjectEnrollment,
    blockUtilization,
    staffDuty,
    qpInventoryStatus,
    dailySchedule,
    malpracticeCases,
    connectedInstitutes,
    lastUpdated,
  } = data;

  // Chart Data
  const deptChartData = {
    labels: departmentDistribution.map((d) => d.department),
    datasets: [
      {
        data: departmentDistribution.map((d) => d.staffCount),
        backgroundColor: COLORS.chart.slice(0, departmentDistribution.length),
        borderWidth: 0,
      },
    ],
  };

  const sessionBarData = {
    labels: sessionDistribution.map((d) => d.date),
    datasets: [
      {
        label: 'Morning',
        data: sessionDistribution.map((d) => d.morning),
        backgroundColor: COLORS.brand[400],
        borderRadius: 4,
      },
      {
        label: 'Afternoon',
        data: sessionDistribution.map((d) => d.afternoon),
        backgroundColor: COLORS.semantic.warning,
        borderRadius: 4,
      },
    ],
  };

  const blockBarData = {
    labels: blockUtilization.map((d) => `Block ${d.blockNo}`),
    datasets: [
      {
        label: 'Utilization %',
        data: blockUtilization.map((d) => d.utilization),
        backgroundColor: blockUtilization.map((d) =>
          d.utilization > 80
            ? COLORS.semantic.success
            : d.utilization > 50
              ? COLORS.semantic.warning
              : COLORS.semantic.destructive,
        ),
        borderRadius: 4,
      },
    ],
  };

  const malpracticeLineData = {
    labels: malpracticeCases.byDate.map((d) => d.date),
    datasets: [
      {
        label: 'Cases',
        data: malpracticeCases.byDate.map((d) => d.count),
        borderColor: COLORS.semantic.destructive,
        backgroundColor: `${COLORS.semantic.destructive}20`,
        fill: true,
        tension: 0.3,
        pointRadius: 3,
      },
    ],
  };

  return (
    <div className="space-y-6">
      {/* ==================== HEADER ==================== */}
      <PageHeader
        title="Dashboard"
        description={`${center.code} · ${center.name} · ${center.season} ${center.year}`}
        icon={LayoutDashboard}
        actions={
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
              <Clock className="h-3.5 w-3.5" />
              <span>Updated: {format(new Date(lastUpdated), 'HH:mm')}</span>
            </div>
          </div>
        }
      />

      {/* ==================== TOOLBAR ==================== */}
      <PageToolbar
        actions={toolbarActions}
        searchValue=""
        onSearchChange={() => {}}
        searchPlaceholder=""
      />

      {/* ==================== QUICK STATS ==================== */}
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        <StatsCard
          label="Students"
          value={metrics.totalStudents}
          icon={<Users className="h-4 w-4" />}
          subtitle={`${metrics.totalExaminees} examinees`}
        />
        <StatsCard
          label="Staff"
          value={metrics.totalStaff}
          icon={<UserCheck className="h-4 w-4" />}
          subtitle={`${staffDuty.totalSupervisors} supervisors`}
        />
        <StatsCard
          label="Blocks"
          value={metrics.totalBlocks}
          icon={<Building2 className="h-4 w-4" />}
        />
        <StatsCard
          label="Subjects"
          value={metrics.totalSubjects}
          icon={<BookOpen className="h-4 w-4" />}
        />
        <StatsCard
          label="Exam Days"
          value={metrics.totalExamDays}
          icon={<Calendar className="h-4 w-4" />}
        />
        <StatsCard
          label="Inventory"
          value={`${qpInventoryStatus.completion}%`}
          icon={<FileText className="h-4 w-4" />}
          color={
            qpInventoryStatus.completion > 80 ? COLORS.semantic.success : COLORS.semantic.warning
          }
          subtitle={`${qpInventoryStatus.totalReceived}/${qpInventoryStatus.totalExpected}`}
        />
      </div>

      {/* ==================== EXAM CENTER INFO + QUICK LINKS ==================== */}
      <div className="flex flex-col gap-4 lg:flex-row">
        <Card className="flex-1">
          <CardContent className="p-4">
            <div className="grid grid-cols-2 gap-4 text-xs sm:grid-cols-3 lg:grid-cols-4">
              <div>
                <p className="text-neutral-500 dark:text-neutral-400">Officer Incharge</p>
                <p className="truncate font-medium text-neutral-900 dark:text-neutral-50">
                  {center.officerIncharge}
                </p>
              </div>
              <div>
                <p className="text-neutral-500 dark:text-neutral-400">Sealing Supervisor</p>
                <p className="truncate font-medium text-neutral-900 dark:text-neutral-50">
                  {center.sealingSupervisor}
                </p>
              </div>
              <div>
                <p className="text-neutral-500 dark:text-neutral-400">Distribution Center</p>
                <p className="font-medium text-neutral-900 dark:text-neutral-50">
                  {center.distCenterCode} · {center.distCenterName}
                </p>
              </div>
              <div>
                <p className="text-neutral-500 dark:text-neutral-400">Exam Duration</p>
                <p className="font-medium text-neutral-900 dark:text-neutral-50">
                  {format(new Date(center.startDate), 'dd MMM')} -{' '}
                  {format(new Date(center.endDate), 'dd MMM yyyy')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="lg:w-auto">
          <QuickLinks onNavigate={handleNavigate} />
        </div>
      </div>

      {/* ==================== CHARTS ==================== */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Department Distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Department Distribution</CardTitle>
          </CardHeader>
          <CardContent className="h-56">
            {departmentDistribution.length > 0 ? (
              <Doughnut
                data={deptChartData}
                options={getDoughnutOptions(isDark)}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-neutral-500">
                No data available
              </div>
            )}
          </CardContent>
        </Card>

        {/* Session Distribution */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Session Distribution</CardTitle>
          </CardHeader>
          <CardContent className="h-56">
            {sessionDistribution.length > 0 ? (
              <Bar
                data={sessionBarData}
                options={getBarOptions(isDark)}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-neutral-500">
                No session data available
              </div>
            )}
          </CardContent>
        </Card>

        {/* Malpractice Trend */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              Malpractice Cases Trend
              <Badge
                variant="destructive"
                className="text-[10px]"
              >
                {malpracticeCases.total} total
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="h-56">
            {malpracticeCases.byDate.length > 0 ? (
              <Line
                data={malpracticeLineData}
                options={getLineOptions(isDark)}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-neutral-500">
                No malpractice cases reported
              </div>
            )}
          </CardContent>
        </Card>

        {/* Daily Schedule */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Today's Schedule</CardTitle>
          </CardHeader>
          <CardContent className="max-h-56 space-y-1.5 overflow-y-auto">
            {dailySchedule.length > 0 ? (
              dailySchedule.slice(0, 6).map((day, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-2.5 dark:border-neutral-800 dark:bg-neutral-950"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                      {day.date}
                    </p>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">{day.session}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
                      {day.students} students
                    </p>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">
                      {day.subjects} subjects
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="flex h-32 items-center justify-center text-sm text-neutral-500">
                No schedule available
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ==================== BLOCK UTILIZATION ==================== */}
      {blockUtilization.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Block Utilization</CardTitle>
          </CardHeader>
          <CardContent className="h-56">
            <Bar
              data={blockBarData}
              options={getBarOptions(isDark)}
            />
          </CardContent>
        </Card>
      )}

      {/* ==================== SUBJECT ENROLLMENT ==================== */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <TrendingUp className="h-4 w-4 text-emerald-600" />
              Highest Enrollment
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {subjectEnrollment.highest.slice(0, 5).map((subj, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between border-b border-neutral-100 py-1.5 last:border-0 dark:border-neutral-800"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                      #{idx + 1}
                    </span>
                    <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs dark:bg-neutral-800">
                      {subj.code}
                    </code>
                    <span className="truncate text-sm text-neutral-700 dark:text-neutral-300">
                      {subj.name}
                    </span>
                  </div>
                  <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                    {subj.students}
                  </span>
                </div>
              ))}
              {subjectEnrollment.highest.length === 0 && (
                <div className="py-4 text-center text-sm text-neutral-500">No data available</div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <TrendingDown className="h-4 w-4 text-rose-600" />
              Lowest Enrollment
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {subjectEnrollment.lowest.slice(0, 5).map((subj, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between border-b border-neutral-100 py-1.5 last:border-0 dark:border-neutral-800"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                      #{idx + 1}
                    </span>
                    <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs dark:bg-neutral-800">
                      {subj.code}
                    </code>
                    <span className="truncate text-sm text-neutral-700 dark:text-neutral-300">
                      {subj.name}
                    </span>
                  </div>
                  <span className="text-sm font-semibold text-rose-600 dark:text-rose-400">
                    {subj.students}
                  </span>
                </div>
              ))}
              {subjectEnrollment.lowest.length === 0 && (
                <div className="py-4 text-center text-sm text-neutral-500">No data available</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ==================== CONNECTED INSTITUTES ==================== */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Building2 className="h-4 w-4 text-neutral-500" />
            Connected Institutes
            <Badge
              variant="secondary"
              className="text-[10px]"
            >
              {connectedInstitutes.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {connectedInstitutes.map((inst, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-950"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                    {inst.code}
                  </p>
                  <p className="max-w-[120px] truncate text-xs text-neutral-500 dark:text-neutral-400">
                    {inst.name}
                  </p>
                </div>
                <Badge
                  variant={inst.isActive ? 'default' : 'destructive'}
                  className="shrink-0 text-[10px]"
                >
                  {inst.students}
                </Badge>
              </div>
            ))}
            {connectedInstitutes.length === 0 && (
              <div className="col-span-full py-4 text-center text-sm text-neutral-500">
                No institutes connected
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ==================== FOOTER ==================== */}
      <div className="border-t border-neutral-200 pt-4 dark:border-neutral-800">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-400 dark:text-neutral-500">
          <span>TestForge v1.2 · {center.code}</span>
          <span>Last updated: {format(new Date(lastUpdated), 'dd MMM yyyy, HH:mm:ss')}</span>
        </div>
      </div>
    </div>
  );
}
