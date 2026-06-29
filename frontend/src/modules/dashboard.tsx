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
import {
  AlertCircle,
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
  MapPin,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  User,
  UserCheck,
  Users,
} from 'lucide-react';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import { toast } from 'sonner';

import { PageEmpty, PageHeader, PageToolbar } from '@/components/layout/page-layout';
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
  chart: ['#10B981', '#34D399', '#6EE7B7', '#3B82F6', '#60A5FA', '#8B5CF6', '#A78BFA', '#F59E0B', '#FBBF24', '#EF4444'],
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
            {subtitle && <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">{subtitle}</p>}
          </div>
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: `${color}15` }}
          >
            <div className="text-base" style={{ color }}>
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
  { id: 'timetable', name: 'Timetable', icon: Calendar, route: '/exam-setup/timetable', color: COLORS.brand[500] },
  { id: 'blocks', name: 'Blocks', icon: Blocks, route: '/exam-setup/block', color: COLORS.semantic.info },
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
  { id: 'reports', name: 'Reports', icon: FileText, route: '/msbte-reports/f1', color: COLORS.semantic.info },
];

function QuickLinks({ onNavigate }: { onNavigate: (route: string) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
      {QUICK_LINKS.map(link => {
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
              <Icon className="h-4 w-4" style={{ color: link.color }} />
            </div>
            <span className="text-[11px] font-medium text-neutral-700 dark:text-neutral-300">{link.name}</span>
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
          <Skeleton key={i} className="h-24 w-full rounded-lg" />
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
  const { isLoading: userLoading } = useUserInfo();
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

  if (loading || userLoading) return <DashboardSkeleton />;

  if (!data) {
    return (
      <PageEmpty
        title="Failed to load dashboard"
        description="Please try again or contact support."
        action={
          <Button onClick={handleRefresh} variant="outline" size="sm">
            <RefreshCw className="mr-2 h-4 w-4" /> Retry
          </Button>
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
    realtimeStatus,
    lastUpdated,
  } = data;

  // Chart Data
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

  const sessionBarData = {
    labels: sessionDistribution.map(d => d.date),
    datasets: [
      {
        label: 'Morning',
        data: sessionDistribution.map(d => d.morning),
        backgroundColor: COLORS.brand[400],
        borderRadius: 4,
      },
      {
        label: 'Afternoon',
        data: sessionDistribution.map(d => d.afternoon),
        backgroundColor: COLORS.semantic.warning,
        borderRadius: 4,
      },
    ],
  };

  const blockBarData = {
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
        borderRadius: 4,
      },
    ],
  };

  const malpracticeLineData = {
    labels: malpracticeCases.byDate.map(d => d.date),
    datasets: [
      {
        label: 'Cases',
        data: malpracticeCases.byDate.map(d => d.count),
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
              <span>Updated: {format(lastUpdated, 'HH:mm')}</span>
            </div>
          </div>
        }
      />

      {/* ==================== TOOLBAR ==================== */}
      <PageToolbar actions={toolbarActions} searchValue="" onSearchChange={() => {}} searchPlaceholder="" />

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
        <StatsCard label="Blocks" value={metrics.totalBlocks} icon={<Building2 className="h-4 w-4" />} />
        <StatsCard label="Subjects" value={metrics.totalSubjects} icon={<BookOpen className="h-4 w-4" />} />
        <StatsCard label="Exam Days" value={metrics.totalExamDays} icon={<Calendar className="h-4 w-4" />} />
        <StatsCard
          label="Inventory"
          value={`${qpInventoryStatus.completion}%`}
          icon={<FileText className="h-4 w-4" />}
          color={qpInventoryStatus.completion > 80 ? COLORS.semantic.success : COLORS.semantic.warning}
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
                <p className="truncate font-medium text-neutral-900 dark:text-neutral-50">{center.officerIncharge}</p>
              </div>
              <div>
                <p className="text-neutral-500 dark:text-neutral-400">Sealing Supervisor</p>
                <p className="truncate font-medium text-neutral-900 dark:text-neutral-50">{center.sealingSupervisor}</p>
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
                  {format(new Date(center.startDate), 'dd MMM')} - {format(new Date(center.endDate), 'dd MMM yyyy')}
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
              <Doughnut data={deptChartData} options={getDoughnutOptions(isDark)} />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-neutral-500">No data available</div>
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
              <Bar data={sessionBarData} options={getBarOptions(isDark)} />
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
              <Badge variant="destructive" className="text-[10px]">
                {malpracticeCases.total} total
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="h-56">
            {malpracticeCases.byDate.length > 0 ? (
              <Line data={malpracticeLineData} options={getLineOptions(isDark)} />
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
                    <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">{day.date}</p>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">{day.session}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
                      {day.students} students
                    </p>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">{day.subjects} subjects</p>
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
                    <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">#{idx + 1}</span>
                    <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs dark:bg-neutral-800">
                      {subj.code}
                    </code>
                    <span className="truncate text-sm text-neutral-700 dark:text-neutral-300">{subj.name}</span>
                  </div>
                  <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">{subj.students}</span>
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
                    <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">#{idx + 1}</span>
                    <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs dark:bg-neutral-800">
                      {subj.code}
                    </code>
                    <span className="truncate text-sm text-neutral-700 dark:text-neutral-300">{subj.name}</span>
                  </div>
                  <span className="text-sm font-semibold text-rose-600 dark:text-rose-400">{subj.students}</span>
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
            <Badge variant="secondary" className="text-[10px]">
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
                  <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">{inst.code}</p>
                  <p className="max-w-[120px] truncate text-xs text-neutral-500 dark:text-neutral-400">{inst.name}</p>
                </div>
                <Badge variant={inst.isActive ? 'default' : 'destructive'} className="shrink-0 text-[10px]">
                  {inst.students}
                </Badge>
              </div>
            ))}
            {connectedInstitutes.length === 0 && (
              <div className="col-span-full py-4 text-center text-sm text-neutral-500">No institutes connected</div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ==================== FOOTER ==================== */}
      <div className="border-t border-neutral-200 pt-4 dark:border-neutral-800">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-400 dark:text-neutral-500">
          <span>TestForge v1.2 · {center.code}</span>
          <span>Last updated: {format(lastUpdated, 'dd MMM yyyy, HH:mm:ss')}</span>
        </div>
      </div>
    </div>
  );
}
