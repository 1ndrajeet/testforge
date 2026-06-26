// app/(dashboard)/exam-center/page.tsx
'use client';

import { useCallback, useEffect, useState } from 'react';

import { useTheme } from 'next-themes';

import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Title,
  Tooltip,
} from 'chart.js';
import { format } from 'date-fns';
import { motion } from 'framer-motion';
import {
  AlertCircle,
  AlertTriangle,
  Blocks,
  BookOpen,
  Building2,
  Calendar,
  CheckCircle,
  ChevronRight,
  ClipboardList,
  Clock,
  Download,
  FileText,
  Grid3x3,
  LayoutDashboard,
  MapPin,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  User,
  UserCheck,
  UserX,
  Users,
} from 'lucide-react';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useUserInfo } from '@/hooks/useUserInfo';
import { type ExamOfficerDashboardData, getExamOfficerDashboard } from '@/lib/actions/dashboard';
import { cn } from '@/lib/utils';

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
  Filler
);

// ============================================================================
// Color System (from Design System)
// ============================================================================

const COLORS = {
  brand: {
    50: '#ECFDF5',
    100: '#D1FAE5',
    200: '#A7F3D0',
    300: '#6EE7B7',
    400: '#34D399',
    500: '#10B981',
    600: '#059669',
    700: '#047857',
  },
  neutral: {
    50: '#FAFAFA',
    100: '#F5F5F5',
    200: '#E5E5E5',
    300: '#D4D4D4',
    400: '#A3A3A3',
    500: '#737373',
    600: '#525252',
    700: '#404040',
    800: '#262626',
    900: '#171717',
    950: '#0A0A0A',
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
    '#A7F3D0',
    '#3B82F6',
    '#60A5FA',
    '#93C5FD',
    '#8B5CF6',
    '#A78BFA',
    '#C4B5FD',
    '#F59E0B',
    '#FBBF24',
    '#FCD34D',
    '#EF4444',
    '#F87171',
    '#FCA5A5',
  ],
};

// ============================================================================
// Chart Options
// ============================================================================

const getBarChartOptions = (isDark: boolean) => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: isDark ? COLORS.neutral[800] : COLORS.neutral[50],
      titleColor: isDark ? COLORS.neutral[50] : COLORS.neutral[900],
      bodyColor: isDark ? COLORS.neutral[300] : COLORS.neutral[600],
      padding: 12,
      cornerRadius: 8,
      borderColor: isDark ? COLORS.neutral[700] : COLORS.neutral[200],
      borderWidth: 1,
    },
  },
  scales: {
    y: {
      beginAtZero: true,
      grid: {
        color: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
      },
      ticks: {
        color: isDark ? COLORS.neutral[400] : COLORS.neutral[500],
        font: { size: 11 },
      },
    },
    x: {
      grid: { display: false },
      ticks: {
        color: isDark ? COLORS.neutral[400] : COLORS.neutral[500],
        font: { size: 11 },
      },
    },
  },
});

const getDoughnutChartOptions = (isDark: boolean) => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'right' as const,
      labels: {
        color: isDark ? COLORS.neutral[400] : COLORS.neutral[500],
        usePointStyle: true,
        pointStyle: 'circle',
        padding: 16,
        font: { size: 11 },
        boxWidth: 12,
      },
    },
    tooltip: {
      backgroundColor: isDark ? COLORS.neutral[800] : COLORS.neutral[50],
      titleColor: isDark ? COLORS.neutral[50] : COLORS.neutral[900],
      bodyColor: isDark ? COLORS.neutral[300] : COLORS.neutral[600],
      padding: 12,
      cornerRadius: 8,
      borderColor: isDark ? COLORS.neutral[700] : COLORS.neutral[200],
      borderWidth: 1,
      callbacks: {
        label: (context: { dataset: { data: number[] }; raw: any; label: any; formattedValue: any }) => {
          const total = (context.dataset.data as number[]).reduce((a, b) => a + b, 0);
          const percentage = total > 0 ? Math.round((Number(context.raw) / total) * 100) : 0;
          return `${context.label}: ${context.formattedValue} (${percentage}%)`;
        },
      },
    },
  },
  cutout: '65%',
});

const getLineChartOptions = (isDark: boolean) => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: isDark ? COLORS.neutral[800] : COLORS.neutral[50],
      titleColor: isDark ? COLORS.neutral[50] : COLORS.neutral[900],
      bodyColor: isDark ? COLORS.neutral[300] : COLORS.neutral[600],
      padding: 12,
      cornerRadius: 8,
      borderColor: isDark ? COLORS.neutral[700] : COLORS.neutral[200],
      borderWidth: 1,
    },
  },
  scales: {
    y: {
      beginAtZero: true,
      grid: {
        color: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
      },
      ticks: {
        color: isDark ? COLORS.neutral[400] : COLORS.neutral[500],
        font: { size: 11 },
      },
    },
    x: {
      grid: { display: false },
      ticks: {
        color: isDark ? COLORS.neutral[400] : COLORS.neutral[500],
        font: { size: 11 },
      },
    },
  },
});

// ============================================================================
// Types
// ============================================================================

interface ModuleQuickLink {
  id: string;
  name: string;
  icon: React.ElementType;
  route: string;
  color: string;
  description: string;
}

// ============================================================================
// Stats Card Component
// ============================================================================

interface StatsCardProps {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  color?: string;
  subtitle?: string;
  trend?: { value: number; label: string };
  className?: string;
}

function StatsCard({ label, value, icon, color = COLORS.brand[500], subtitle, trend, className }: StatsCardProps) {
  return (
    <Card className={cn('overflow-hidden transition-all hover:shadow-md', className)}>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="truncate text-xs font-medium tracking-wide text-neutral-500 uppercase dark:text-neutral-400">
              {label}
            </p>
            <p className="mt-1 truncate text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
              {typeof value === 'number' ? value.toLocaleString() : value}
            </p>
            {subtitle && <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">{subtitle}</p>}
            {trend && (
              <div className="mt-1 flex items-center gap-1">
                <span className={cn('text-xs font-medium', trend.value >= 0 ? 'text-emerald-600' : 'text-rose-600')}>
                  {trend.value >= 0 ? '+' : ''}
                  {trend.value}%
                </span>
                <span className="text-xs text-neutral-500">{trend.label}</span>
              </div>
            )}
          </div>
          <div
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
            style={{ backgroundColor: `${color}15` }}
          >
            <div className="text-lg" style={{ color }}>
              {icon}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Module Quick Links Component
// ============================================================================

const QUICK_MODULES: ModuleQuickLink[] = [
  {
    id: 'timetable',
    name: 'Timetable',
    icon: Calendar,
    route: '/exam-setup/timetable',
    color: COLORS.brand[500],
    description: 'Upload & manage schedule',
  },
  {
    id: 'blocks',
    name: 'Block Config',
    icon: Blocks,
    route: '/exam-setup/block',
    color: COLORS.semantic.info,
    description: 'Configure classrooms',
  },
  {
    id: 'supervisors',
    name: 'Supervisors',
    icon: UserCheck,
    route: '/exam-setup/supervisors',
    color: COLORS.semantic.warning,
    description: 'Manage staff',
  },
  {
    id: 'allocate',
    name: 'Allocation',
    icon: Grid3x3,
    route: '/block-allocation/allocate',
    color: COLORS.semantic.success,
    description: 'Allocate students',
  },
  {
    id: 'absent',
    name: 'Absent Students',
    icon: UserX,
    route: '/exam-day/absent',
    color: COLORS.semantic.destructive,
    description: 'Mark absenteeism',
  },
  {
    id: 'reports',
    name: 'Reports',
    icon: FileText,
    route: '/msbte-reports/f1',
    color: COLORS.semantic.info,
    description: 'Generate reports',
  },
];

function ModuleQuickLinks({ onNavigate }: { onNavigate: (route: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {QUICK_MODULES.map(module => {
        const Icon = module.icon;
        return (
          <motion.button
            key={module.id}
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onNavigate(module.route)}
            className="group relative overflow-hidden rounded-xl border border-neutral-200 bg-white p-4 text-left transition-all hover:shadow-md dark:border-neutral-800 dark:bg-neutral-950"
          >
            <div
              className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg"
              style={{ backgroundColor: `${module.color}15` }}
            >
              <Icon className="h-5 w-5" style={{ color: module.color }} />
            </div>
            <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{module.name}</p>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">{module.description}</p>
            <ChevronRight className="absolute right-3 bottom-3 h-4 w-4 text-neutral-300 opacity-0 transition-all group-hover:opacity-100 dark:text-neutral-700" />
          </motion.button>
        );
      })}
    </div>
  );
}

// ============================================================================
// Loading Skeleton
// ============================================================================

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-12 w-full rounded-lg" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Skeleton className="h-80 w-full rounded-xl lg:col-span-2" />
        <Skeleton className="h-80 w-full rounded-xl" />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Skeleton className="h-72 w-full rounded-xl" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    </div>
  );
}

// ============================================================================
// Main Dashboard Component
// ============================================================================

export default function Dashboard() {
  const { isLoading: userLoading } = useUserInfo();
  const { theme } = useTheme();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ExamOfficerDashboardData | null>(null);
  const [isDark, setIsDark] = useState(false);

  // Detect dark mode
  useEffect(() => {
    setIsDark(theme === 'dark');
  }, [theme]);

  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getExamOfficerDashboard();

      if (result.success && result.data) {
        setData(result.data);
      } else {
        toast.error(result.error || 'Failed to load dashboard data');
      }
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const handleRefresh = () => {
    fetchDashboardData();
    toast.success('Dashboard refreshed');
  };

  const handleExport = () => {
    toast.success('Report exported');
  };

  const handleNavigate = (route: string) => {
    window.location.href = `/exam-center${route}`;
  };

  if (loading || userLoading) {
    return <DashboardSkeleton />;
  }

  if (!data) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center gap-4">
        <AlertCircle className="h-12 w-12 text-neutral-400" />
        <p className="text-sm text-neutral-500">Failed to load dashboard data</p>
        <Button onClick={handleRefresh} variant="outline" size="sm">
          <RefreshCw className="mr-2 h-4 w-4" />
          Retry
        </Button>
      </div>
    );
  }

  const {
    examCenter: center,
    metrics,
    departmentDistribution,
    sessionDistribution,
    subjectEnrollment,
    attendanceExtremes,
    blockUtilization,
    staffDuty,
    qpInventoryStatus,
    dailySchedule,
    malpracticeCases,
    connectedInstitutes,
    realtimeStatus,
    lastUpdated,
  } = data;

  // Chart Data
  const metricsChartData = {
    labels: ['Subjects', 'Students', 'Examinees', 'Papers'],
    datasets: [
      {
        label: 'Count',
        data: [metrics.totalSubjects, metrics.totalStudents, metrics.totalExaminees, metrics.totalPapers],
        backgroundColor: [COLORS.brand[400], COLORS.brand[500], COLORS.brand[600], '#60A5FA'],
        borderRadius: 6,
      },
    ],
  };

  const deptChartData = {
    labels: departmentDistribution.map(d => d.department),
    datasets: [
      {
        data: departmentDistribution.map(d => d.staffCount),
        backgroundColor: COLORS.chart.slice(0, departmentDistribution.length),
        borderWidth: 0,
      },
    ],
  };

  const sessionBarChartData = {
    labels: sessionDistribution.map(d => d.date),
    datasets: [
      {
        label: 'Morning',
        data: sessionDistribution.map(d => d.morning),
        backgroundColor: COLORS.brand[400],
        borderRadius: 6,
      },
      {
        label: 'Afternoon',
        data: sessionDistribution.map(d => d.afternoon),
        backgroundColor: COLORS.semantic.warning,
        borderRadius: 6,
      },
    ],
  };

  const blockChartData = {
    labels: blockUtilization.map(d => `Block ${d.blockNo}`),
    datasets: [
      {
        label: 'Utilization %',
        data: blockUtilization.map(d => d.utilization),
        backgroundColor: blockUtilization.map(d =>
          d.utilization > 80
            ? COLORS.semantic.success
            : d.utilization > 50
              ? COLORS.semantic.warning
              : COLORS.semantic.destructive
        ),
        borderRadius: 6,
      },
    ],
  };

  const malpracticeChartData = {
    labels: malpracticeCases.byDate.map(d => d.date),
    datasets: [
      {
        label: 'Malpractice Cases',
        data: malpracticeCases.byDate.map(d => d.count),
        borderColor: COLORS.semantic.destructive,
        backgroundColor: `${COLORS.semantic.destructive}20`,
        fill: true,
        tension: 0.3,
        pointRadius: 4,
      },
    ],
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-950/30">
              <LayoutDashboard className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50">
                Exam Officer Dashboard
              </h1>
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                Real-time examination overview and key metrics
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 text-xs text-neutral-500">
            <Clock className="h-3.5 w-3.5" />
            <span>Updated: {format(lastUpdated, 'HH:mm:ss')}</span>
          </div>
          <Button variant="outline" size="sm" onClick={handleRefresh} className="h-8 gap-1.5 text-xs">
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport} className="h-8 gap-1.5 text-xs">
            <Download className="h-3.5 w-3.5" />
            Export
          </Button>
        </div>
      </div>

      {/* Exam Center Info Bar */}
      <Card className="border-l-4 border-emerald-500">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-5">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-emerald-500" />
              <div>
                <p className="text-xs text-neutral-500">Exam Center</p>
                <p className="text-sm font-semibold">
                  {center.code} - {center.name}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-emerald-500" />
              <div>
                <p className="text-xs text-neutral-500">Season</p>
                <p className="text-sm font-semibold">
                  {center.season} {center.year}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-emerald-500" />
              <div>
                <p className="text-xs text-neutral-500">Officer Incharge</p>
                <p className="text-sm font-semibold">{center.officerIncharge}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-emerald-500" />
              <div>
                <p className="text-xs text-neutral-500">Distribution Center</p>
                <p className="text-sm font-semibold">
                  {center.distCenterCode} - {center.distCenterName}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-emerald-500" />
              <div>
                <p className="text-xs text-neutral-500">Duration</p>
                <p className="text-sm font-semibold">
                  {format(new Date(center.startDate), 'dd MMM')} - {format(new Date(center.endDate), 'dd MMM yyyy')}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Real-time Status */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
        <StatsCard
          label="Current Session"
          value={realtimeStatus.currentSession}
          icon={<Clock className="h-5 w-5" />}
          color={COLORS.semantic.info}
          subtitle={realtimeStatus.currentDate}
        />
        <StatsCard
          label="Exams Today"
          value={realtimeStatus.examsInProgress}
          icon={<ClipboardList className="h-5 w-5" />}
          color={COLORS.semantic.warning}
          subtitle="In Progress"
        />
        <StatsCard
          label="Exams Completed"
          value={realtimeStatus.examsCompleted}
          icon={<CheckCircle className="h-5 w-5" />}
          color={COLORS.semantic.success}
        />
        <StatsCard
          label="Attendance Rate"
          value={`${realtimeStatus.attendanceRate}%`}
          icon={<Users className="h-5 w-5" />}
          color={realtimeStatus.attendanceRate > 80 ? COLORS.semantic.success : COLORS.semantic.warning}
        />
        <StatsCard
          label="Staff on Duty"
          value={staffDuty.onDutyToday}
          icon={<UserCheck className="h-5 w-5" />}
          color={COLORS.semantic.info}
        />
        <StatsCard
          label="Malpractice Cases"
          value={malpracticeCases.total}
          icon={<AlertTriangle className="h-5 w-5" />}
          color={COLORS.semantic.destructive}
          subtitle={`${malpracticeCases.resolved} resolved`}
        />
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <StatsCard
          label="Total Students"
          value={metrics.totalStudents}
          icon={<Users className="h-5 w-5" />}
          color={COLORS.brand[500]}
        />
        <StatsCard
          label="Total Staff"
          value={metrics.totalStaff}
          icon={<UserCheck className="h-5 w-5" />}
          color={COLORS.semantic.info}
          subtitle={`${staffDuty.totalSupervisors} supervisors`}
        />
        <StatsCard
          label="Blocks"
          value={metrics.totalBlocks}
          icon={<Building2 className="h-5 w-5" />}
          color={COLORS.semantic.warning}
          subtitle={`${metrics.totalAllocations} allocations`}
        />
        <StatsCard
          label="Subjects"
          value={metrics.totalSubjects}
          icon={<BookOpen className="h-5 w-5" />}
          color={COLORS.semantic.destructive}
        />
        <StatsCard
          label="Exam Days"
          value={metrics.totalExamDays}
          icon={<Calendar className="h-5 w-5" />}
          color={COLORS.semantic.info}
          subtitle={`${metrics.totalSessions} sessions`}
        />
        <StatsCard
          label="QP Inventory"
          value={`${qpInventoryStatus.completion}%`}
          icon={<FileText className="h-5 w-5" />}
          color={qpInventoryStatus.completion > 80 ? COLORS.semantic.success : COLORS.semantic.warning}
          subtitle={`${qpInventoryStatus.totalReceived}/${qpInventoryStatus.totalExpected}`}
        />
      </div>

      {/* Quick Module Links */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-wide text-neutral-500 uppercase dark:text-neutral-400">
            Quick Access
          </h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleNavigate('/dashboard')}
            className="text-xs text-neutral-500"
          >
            View All Modules
            <ChevronRight className="ml-1 h-3.5 w-3.5" />
          </Button>
        </div>
        <ModuleQuickLinks onNavigate={handleNavigate} />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Department Distribution */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Department Distribution</CardTitle>
            <p className="text-xs text-neutral-500">Students by department</p>
          </CardHeader>
          <CardContent className="h-72">
            {departmentDistribution.length > 0 ? (
              <Doughnut data={deptChartData} options={getDoughnutChartOptions(isDark)} />
            ) : (
              <div className="flex h-full items-center justify-center">
                <p className="text-sm text-neutral-500">No data available</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Key Metrics Chart */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Key Metrics Overview</CardTitle>
            <p className="text-xs text-neutral-500">Examination statistics at a glance</p>
          </CardHeader>
          <CardContent className="h-72">
            <Bar data={metricsChartData} options={getBarChartOptions(isDark)} />
          </CardContent>
        </Card>

        {/* Session Distribution */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Session Distribution</CardTitle>
            <p className="text-xs text-neutral-500">Student distribution by date and session</p>
          </CardHeader>
          <CardContent className="h-72">
            {sessionDistribution.length > 0 ? (
              <Bar data={sessionBarChartData} options={getBarChartOptions(isDark)} />
            ) : (
              <div className="flex h-full items-center justify-center">
                <p className="text-sm text-neutral-500">No session data available</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Block Utilization */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Block Utilization</CardTitle>
            <p className="text-xs text-neutral-500">Capacity utilization by block</p>
          </CardHeader>
          <CardContent className="h-72">
            {blockUtilization.length > 0 ? (
              <Bar data={blockChartData} options={getBarChartOptions(isDark)} />
            ) : (
              <div className="flex h-full items-center justify-center">
                <p className="text-sm text-neutral-500">No block data available</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Malpractice Cases Trend */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Malpractice Cases Trend</CardTitle>
            <p className="text-xs text-neutral-500">Daily distribution of reported cases</p>
          </CardHeader>
          <CardContent className="h-72">
            {malpracticeCases.byDate.length > 0 ? (
              <Line data={malpracticeChartData} options={getLineChartOptions(isDark)} />
            ) : (
              <div className="flex h-full items-center justify-center">
                <p className="text-sm text-neutral-500">No malpractice cases reported</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Daily Schedule */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Daily Schedule</CardTitle>
            <p className="text-xs text-neutral-500">Upcoming exam sessions</p>
          </CardHeader>
          <CardContent>
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {dailySchedule.length > 0 ? (
                dailySchedule.slice(0, 8).map((day, idx) => (
                  <div key={idx} className="flex items-center justify-between rounded-lg border p-2.5">
                    <div>
                      <p className="text-sm font-medium">{day.date}</p>
                      <p className="text-xs text-neutral-500">{day.session}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold">{day.students}</p>
                      <p className="text-xs text-neutral-500">{day.subjects} subjects</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-neutral-500">No schedule available</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Subject Enrollment */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Subject Enrollment</CardTitle>
            <p className="text-xs text-neutral-500">Highest and lowest enrolled subjects</p>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <div className="flex items-center gap-2 text-emerald-600">
                  <TrendingUp className="h-4 w-4" />
                  <span className="text-sm font-medium">Highest Enrollment</span>
                </div>
                {subjectEnrollment.highest.slice(0, 3).map((subj, idx) => (
                  <div
                    key={idx}
                    className="mt-1 flex items-center justify-between border-b border-neutral-100 py-1.5 dark:border-neutral-800"
                  >
                    <span className="text-sm">{subj.code}</span>
                    <span className="text-sm font-semibold text-emerald-600">{subj.students}</span>
                  </div>
                ))}
              </div>
              <div>
                <div className="flex items-center gap-2 text-rose-600">
                  <TrendingDown className="h-4 w-4" />
                  <span className="text-sm font-medium">Lowest Enrollment</span>
                </div>
                {subjectEnrollment.lowest.slice(0, 3).map((subj, idx) => (
                  <div
                    key={idx}
                    className="mt-1 flex items-center justify-between border-b border-neutral-100 py-1.5 dark:border-neutral-800"
                  >
                    <span className="text-sm">{subj.code}</span>
                    <span className="text-sm font-semibold text-rose-600">{subj.students}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Attendance Extremes */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Attendance Extremes</CardTitle>
            <p className="text-xs text-neutral-500">Highest and lowest attendance sessions</p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900/50 dark:bg-emerald-950/20">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-emerald-600" />
                  <span className="text-sm font-medium text-emerald-700">Highest</span>
                </div>
                <p className="mt-1 text-2xl font-semibold text-emerald-700">{attendanceExtremes.highest.students}</p>
                <p className="text-xs text-emerald-600">
                  {attendanceExtremes.highest.date} - {attendanceExtremes.highest.session}
                </p>
                <p className="text-xs text-emerald-600">{attendanceExtremes.highest.subjectCode}</p>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/50 dark:bg-amber-950/20">
                <div className="flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-amber-600" />
                  <span className="text-sm font-medium text-amber-700">Lowest</span>
                </div>
                <p className="mt-1 text-2xl font-semibold text-amber-700">{attendanceExtremes.lowest.students}</p>
                <p className="text-xs text-amber-600">
                  {attendanceExtremes.lowest.date} - {attendanceExtremes.lowest.session}
                </p>
                <p className="text-xs text-amber-600">{attendanceExtremes.lowest.subjectCode}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Connected Institutes */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Connected Institutes</CardTitle>
          <p className="text-xs text-neutral-500">Institutes connected to this exam center</p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {connectedInstitutes.map((inst, idx) => (
              <div key={idx} className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">{inst.code}</p>
                  <p className="max-w-[180px] truncate text-xs text-neutral-500">{inst.name}</p>
                </div>
                <div className="text-right">
                  <Badge variant={inst.isActive ? 'default' : 'destructive'}>
                    {inst.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                  <p className="mt-1 text-xs text-neutral-500">{inst.students} students</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Footer */}
      <div className="border-t border-neutral-200 pt-4 dark:border-neutral-800">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-400">
          <span>TestForge v1.2 • {center.code}</span>
          <span>Last updated: {format(lastUpdated, 'dd MMM yyyy, HH:mm:ss')}</span>
        </div>
      </div>
    </div>
  );
}
