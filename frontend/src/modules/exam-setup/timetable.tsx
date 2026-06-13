// modules/exam-setup/timetable.tsx
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { format } from 'date-fns';
import { Calendar, ChevronLeft, ChevronRight, RefreshCw, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';

import { MSBTEContextBar } from '@/components/layout/msbte-context-bar';
import { PageEmpty, PageHeader, PageToolbar } from '@/components/layout/page-layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useUserInfo } from '@/hooks/useUserInfo';
import { deleteAllTimetable, getTimetable, getTimetableStats, hasTimetable } from '@/lib/actions/timetable';
import { TimetableEntry, TimetableStats } from '@/lib/types';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

// ============================================================================
// Helper Functions
// ============================================================================

const formatDateShort = (date: Date) => format(date, 'dd/MM');

// ============================================================================
// Stats Cards Component
// ============================================================================

const StatsCards = ({ stats }: { stats: TimetableStats }) => {
  const minDate = stats.dateRange?.min ? new Date(stats.dateRange.min) : null;
  const maxDate = stats.dateRange?.max ? new Date(stats.dateRange.max) : null;
  const examDays =
    minDate && maxDate ? Math.ceil((maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24)) + 1 : 0;

  return (
    <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
      <div className="rounded-lg border border-neutral-100 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
        <p className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">{stats.uniqueSubjects}</p>
        <p className="text-xs text-neutral-500">Subjects</p>
      </div>
      <div className="rounded-lg border border-neutral-100 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
        <p className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
          {stats.totalStudents?.toLocaleString()}
        </p>
        <p className="text-xs text-neutral-500">Students</p>
      </div>
      <div className="rounded-lg border border-neutral-100 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
        <p className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">{examDays}</p>
        <p className="text-xs text-neutral-500">Exam Days</p>
      </div>
      <div className="rounded-lg border border-neutral-100 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
        <p className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">{stats.totalEntries}</p>
        <p className="text-xs text-neutral-500">Sessions</p>
      </div>
    </div>
  );
};

// ============================================================================
// Data Table Component
// ============================================================================

const DataTable = ({
  entries,
  sortColumn,
  sortDirection,
  onSort,
}: {
  entries: TimetableEntry[];
  sortColumn: string;
  sortDirection: 'asc' | 'desc';
  onSort: (column: string) => void;
}) => {
  const getSortIcon = (column: string) => {
    if (sortColumn !== column) return null;
    return sortDirection === 'asc' ? '↑' : '↓';
  };

  if (entries.length === 0) {
    return (
      <PageEmpty title="No matching records" description="Try adjusting your filters or upload a new timetable." />
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader className="bg-neutral-50 dark:bg-neutral-900">
            <TableRow>
              <TableHead
                className="w-20 cursor-pointer text-xs font-medium tracking-wide uppercase"
                onClick={() => onSort('examDay')}
              >
                Day {getSortIcon('examDay')}
              </TableHead>
              <TableHead
                className="w-24 cursor-pointer text-xs font-medium tracking-wide uppercase"
                onClick={() => onSort('date')}
              >
                Date {getSortIcon('date')}
              </TableHead>
              <TableHead
                className="w-28 cursor-pointer text-xs font-medium tracking-wide uppercase"
                onClick={() => onSort('session')}
              >
                Session {getSortIcon('session')}
              </TableHead>
              <TableHead
                className="w-28 cursor-pointer text-xs font-medium tracking-wide uppercase"
                onClick={() => onSort('subjectCode')}
              >
                Code {getSortIcon('subjectCode')}
              </TableHead>
              <TableHead
                className="cursor-pointer text-xs font-medium tracking-wide uppercase"
                onClick={() => onSort('subjectName')}
              >
                Subject Name {getSortIcon('subjectName')}
              </TableHead>
              <TableHead
                className="w-28 cursor-pointer text-xs font-medium tracking-wide uppercase"
                onClick={() => onSort('scheme')}
              >
                Scheme {getSortIcon('scheme')}
              </TableHead>
              <TableHead
                className="w-24 cursor-pointer text-right text-xs font-medium tracking-wide uppercase"
                onClick={() => onSort('totalStudents')}
              >
                Students {getSortIcon('totalStudents')}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map(entry => (
              <TableRow key={entry.id} className="h-12 cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-900">
                <TableCell className="px-4 py-3 text-center font-mono text-sm">
                  <Badge variant="secondary" className="text-xs">
                    Day {entry.examDay || '?'}
                  </Badge>
                </TableCell>
                <TableCell className="px-4 py-3 font-mono text-sm">{formatDateShort(entry.date)}</TableCell>
                <TableCell className="px-4 py-3">
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-xs',
                      entry.session === 'Morning'
                        ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400'
                        : 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-400'
                    )}
                  >
                    {entry.session}
                  </Badge>
                </TableCell>
                <TableCell className="px-4 py-3">
                  <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs dark:bg-neutral-800">
                    {entry.subjectCode}
                  </code>
                </TableCell>
                <TableCell className="px-4 py-3 text-sm">
                  {entry.subjectName || String(entry.subjectAbbr)?.split('-')[0] || entry.subjectCode}
                </TableCell>
                <TableCell className="px-4 py-3">
                  <Badge variant="outline" className="font-mono text-xs">
                    {entry.scheme}
                  </Badge>
                </TableCell>
                <TableCell className="px-4 py-3 text-right text-sm font-medium tabular-nums">
                  {entry.totalStudents.toLocaleString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

// ============================================================================
// Main Component
// ============================================================================

export default function TimetablePage() {
  const { examCenter, isLoading: userLoading } = useUserInfo();

  const [entries, setEntries] = useState<TimetableEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<TimetableStats | null>(null);
  const [hasData, setHasData] = useState<boolean | null>(null);
  const [showUpload, setShowUpload] = useState(false);

  // Filter state
  const [filters, setFilters] = useState({
    subjectCode: '',
    subjectName: '',
    session: '',
    scheme: '',
    date: '',
  });

  // Table state
  const [sortColumn, setSortColumn] = useState('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 25;

  // In component, fix fetchData:
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [hasDataResult, timetableResult, statsResult] = await Promise.all([
        hasTimetable(),
        getTimetable(),
        getTimetableStats(),
      ]);

      if (!hasDataResult.success) throw new Error(hasDataResult.error);
      if (!timetableResult.success) throw new Error(timetableResult.error);

      setHasData(hasDataResult.data);
      setEntries(timetableResult.data as TimetableEntry[]);

      if (statsResult.success && statsResult.data) {
        setStats(statsResult.data);
      }

      setShowUpload(!hasDataResult.data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load timetable');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const schemes = useMemo(() => {
    return [...new Set(entries.map(e => e.scheme))].sort();
  }, [entries]);

  const filteredEntries = useMemo(() => {
    return entries.filter(entry => {
      if (filters.subjectCode && !entry.subjectCode.toLowerCase().includes(filters.subjectCode.toLowerCase())) {
        return false;
      }
      if (filters.subjectName && !(entry.subjectName || '').toLowerCase().includes(filters.subjectName.toLowerCase())) {
        if (!String(entry.subjectAbbr).toLowerCase().includes(filters.subjectName.toLowerCase())) {
          return false;
        }
      }
      if (filters.session && entry.session !== filters.session) return false;
      if (filters.scheme && entry.scheme !== filters.scheme) return false;
      if (filters.date) {
        const filterDate = new Date(filters.date);
        if (format(filterDate, 'dd/MM/yyyy') !== format(entry.date, 'dd/MM/yyyy')) return false;
      }
      return true;
    });
  }, [entries, filters]);

  const sortedEntries = useMemo(() => {
    const sorted = [...filteredEntries];
    sorted.sort((a, b) => {
      let aVal: any, bVal: any;
      switch (sortColumn) {
        case 'date':
          aVal = a.date.getTime();
          bVal = b.date.getTime();
          break;
        case 'session':
          aVal = a.session;
          bVal = b.session;
          break;
        case 'subjectCode':
          aVal = a.subjectCode;
          bVal = b.subjectCode;
          break;
        case 'subjectName':
          aVal = a.subjectName || a.subjectAbbr;
          bVal = b.subjectName || b.subjectAbbr;
          break;
        case 'scheme':
          aVal = a.scheme;
          bVal = b.scheme;
          break;
        case 'totalStudents':
          aVal = a.totalStudents;
          bVal = b.totalStudents;
          break;
        default:
          return 0;
      }
      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [filteredEntries, sortColumn, sortDirection]);

  const totalPages = Math.ceil(sortedEntries.length / pageSize);
  const paginatedEntries = sortedEntries.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const handleClearFilters = () => {
    setFilters({
      subjectCode: '',
      subjectName: '',
      session: '',
      scheme: '',
      date: '',
    });
    setCurrentPage(1);
  };

  const handleDeleteAll = async () => {
    if (!confirm('This will delete ALL timetable entries. This action cannot be undone. Are you sure?')) return;
    try {
      const result = await deleteAllTimetable();
      if (!result.success) {
        throw new Error(result.error);
      }
      toast.success('All entries deleted');
      await fetchData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete');
    }
  };
  // Filter bar options
  const filterOptions = [
    {
      id: 'session',
      label: 'Session',
      options: [
        { value: 'Morning', label: 'Morning' },
        { value: 'Afternoon', label: 'Afternoon' },
      ],
      value: filters.session || 'all',
    },
    {
      id: 'scheme',
      label: 'Scheme',
      options: schemes.map(s => ({ value: s, label: s })),
      value: filters.scheme || 'all',
    },
  ];

  const toolbarActions = [
    {
      id: 'refresh',
      label: 'Refresh',
      icon: <RefreshCw className="h-3.5 w-3.5" />,
      onClick: fetchData,
      variant: 'outline' as const,
    },
    {
      id: 'upload',
      label: 'Upload',
      icon: <Upload className="h-3.5 w-3.5" />,
      onClick: () => setShowUpload(!showUpload),
      variant: 'outline' as const,
    },
    {
      id: 'delete',
      label: 'Delete All',
      icon: <Trash2 className="h-3.5 w-3.5" />,
      onClick: handleDeleteAll,
      variant: 'destructive' as const,
    },
  ];

  // Loading state
  if ((loading && hasData === null) || userLoading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  // Show upload screen when no data
  if (!hasData && !loading) {
    return (
      <div>
        <PageHeader
          title="Examination Timetable"
          description="Upload the MSBTE timetable to begin exam configuration."
          icon={Calendar}
        />
        <MSBTEContextBar season={examCenter?.season as 'Summer' | 'Winter'} year={examCenter?.examYear!} />
        {/* <UploadSection onSuccess={fetchData} /> */} {/* Implemented as shared screen  */}
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Examination Timetable"
        description="View and manage your examination schedule."
        icon={Calendar}
        actions={
          <Button variant="ghost" size="sm" onClick={() => setShowUpload(!showUpload)} className="gap-1.5">
            <Upload className="h-4 w-4" />
            {showUpload ? 'Hide Upload' : 'Upload New'}
          </Button>
        }
      />

      <MSBTEContextBar season={examCenter?.season as 'Summer' | 'Winter'} year={examCenter?.examYear!} />

      {/* Conditional Upload Section */}
      {showUpload && <div className="mb-8">{/* <UploadSection onSuccess={fetchData} /> */}</div>}

      {/* Stats Cards */}
      {stats && <StatsCards stats={stats} />}

      {/* Toolbar with Filters */}
      <PageToolbar
        filters={filterOptions}
        onFilterChange={(id, value) => {
          if (id === 'session') {
            setFilters(prev => ({ ...prev, session: value === 'all' ? '' : value }));
          } else if (id === 'scheme') {
            setFilters(prev => ({ ...prev, scheme: value === 'all' ? '' : value }));
          }
          setCurrentPage(1);
        }}
        searchValue={filters.subjectCode}
        onSearchChange={value => {
          setFilters(prev => ({ ...prev, subjectCode: value }));
          setCurrentPage(1);
        }}
        searchPlaceholder="Search by subject code..."
        actions={toolbarActions}
      />

      {/* Results info */}
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs text-neutral-500">
          {filteredEntries.length} record{filteredEntries.length !== 1 ? 's' : ''}
        </p>
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="h-7 px-2 text-xs"
            >
              <ChevronLeft className="h-3 w-3" />
            </Button>
            <span className="px-2 text-xs text-neutral-500">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="h-7 px-2 text-xs"
            >
              <ChevronRight className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>

      {/* Data Table */}
      <DataTable entries={paginatedEntries} sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} />

      {/* Filters reset when filters are active */}
      {Object.values(filters).some(v => v !== '') && (
        <div className="mt-4 flex justify-end">
          <Button variant="ghost" size="sm" onClick={handleClearFilters} className="text-xs">
            Clear all filters
          </Button>
        </div>
      )}
    </div>
  );
}
