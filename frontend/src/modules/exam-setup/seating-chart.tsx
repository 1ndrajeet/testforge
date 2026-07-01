// modules/exam-setup/seatingchart.tsx
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import departments from '@/config/course_codes.json';
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  RefreshCw,
  Upload,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  getPaginatedStudentSeatingData,
  getSeatingChartStats,
  getUniqueInstitutesForSeating,
  getUniqueSchemesForSeating,
  hasSeatingData,
  type SeatingChartStats,
  type StudentSeatingData,
} from '@/lib/actions/student';

import { useUserInfo } from '@/hooks/useUserInfo';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { MSBTEContextBar } from '@/components/layout/msbte-context-bar';
import { PageEmpty, PageHeader, PageToolbar } from '@/components/layout/page-layout';

import { UniversalFileUploaderWrapper } from '@/components/shared/file-uploader';

const getDept = (code: string) => (departments as Record<string, string>)[code] || code;

const getValidSubjects = (subCodes: string[] | null | undefined) => {
  return (subCodes || []).filter((code) => code && code.trim() !== '');
};

interface InstituteInfo {
  code: string;
  name: string;
  count: number;
}

const StatsCards = ({ stats }: { stats: SeatingChartStats }) => (
  <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
    <div className="rounded-lg border border-neutral-100 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
      <p className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
        {stats.totalStudents}
      </p>
      <p className="text-xs text-neutral-500">Students</p>
    </div>
    <div className="rounded-lg border border-neutral-100 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
      <p className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
        {stats.totalInstitutes}
      </p>
      <p className="text-xs text-neutral-500">Institutes</p>
    </div>
    <div className="rounded-lg border border-neutral-100 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
      <p className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
        {stats.totalSchemes}
      </p>
      <p className="text-xs text-neutral-500">Schemes</p>
    </div>
  </div>
);

const StudentDetailModal = ({
  student,
  open,
  onOpenChange,
  subjectMap,
}: {
  student: StudentSeatingData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subjectMap: Map<string, string>;
}) => {
  if (!student) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Student Details</DialogTitle>
          <DialogDescription>
            Complete information for {student.name || 'Student'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-neutral-500">Seat Number</p>
              <p className="font-mono text-lg font-semibold">{student.seatNumber}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-neutral-500">Enrollment</p>
              <p className="font-mono">{student.enrollmentNumber || 'N/A'}</p>
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-neutral-500">Name</p>
            <p className="text-lg font-medium">{student.name || 'N/A'}</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-neutral-500">Scheme</p>
              <Badge
                variant="outline"
                className="mt-1"
              >
                {student.scheme || 'N/A'}
              </Badge>
              <br />
              <Badge
                variant="default"
                className="mt-1 h-fit w-full break-words whitespace-normal"
              >
                {getDept(student.scheme?.split('-')[0] || '')}
              </Badge>
            </div>
            <div>
              <p className="text-sm font-medium text-neutral-500">Institute</p>
              <div className="mt-1">
                <p className="font-medium">{student.instituteName}</p>
                <p className="text-sm text-neutral-500">Code: {student.instituteCode}</p>
              </div>
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-neutral-500">Subjects</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {getValidSubjects(student.subCodes).map((code) => (
                <Badge
                  key={code}
                  variant="secondary"
                  className="text-xs"
                >
                  {subjectMap.get(code) || code}
                </Badge>
              ))}
              {getValidSubjects(student.subCodes).length === 0 && (
                <span className="text-sm text-neutral-400">No subjects assigned</span>
              )}
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-neutral-500">Subject Codes</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {getValidSubjects(student.subCodes).map((code) => (
                <Badge
                  key={code}
                  variant="outline"
                  className="font-mono text-xs"
                >
                  {code}
                </Badge>
              ))}
              {getValidSubjects(student.subCodes).length === 0 && (
                <span className="text-sm text-neutral-400">No subject codes</span>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const DataTable = ({
  entries,
  sortColumn,
  sortDirection,
  onSort,
  onRowClick,
  loading,
}: {
  entries: StudentSeatingData[];
  sortColumn: string;
  sortDirection: 'asc' | 'desc';
  onSort: (column: string) => void;
  onRowClick: (student: StudentSeatingData) => void;
  loading?: boolean;
}) => {
  const getSortIcon = (column: string) => {
    if (sortColumn !== column) return null;
    return sortDirection === 'asc' ? (
      <ArrowUp className="h-3 w-3" />
    ) : (
      <ArrowDown className="h-3 w-3" />
    );
  };

  if (loading) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <Skeleton
            key={i}
            className="h-12 w-full"
          />
        ))}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <PageEmpty
        title="No matching students"
        description="Try adjusting your filters or upload a seating chart."
      />
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
                onClick={() => onSort('seatNumber')}
              >
                Seat {getSortIcon('seatNumber')}
              </TableHead>
              <TableHead
                className="w-32 cursor-pointer text-xs font-medium tracking-wide uppercase"
                onClick={() => onSort('enrollmentNumber')}
              >
                Enrollment {getSortIcon('enrollmentNumber')}
              </TableHead>
              <TableHead
                className="cursor-pointer text-xs font-medium tracking-wide uppercase"
                onClick={() => onSort('name')}
              >
                Name {getSortIcon('name')}
              </TableHead>
              <TableHead
                className="w-24 cursor-pointer text-xs font-medium tracking-wide uppercase"
                onClick={() => onSort('scheme')}
              >
                Scheme {getSortIcon('scheme')}
              </TableHead>
              <TableHead
                className="cursor-pointer text-xs font-medium tracking-wide uppercase"
                onClick={() => onSort('instituteCode')}
              >
                Institute {getSortIcon('instituteCode')}
              </TableHead>
              <TableHead className="w-32 text-xs font-medium tracking-wide uppercase">
                Subjects
              </TableHead>
              <TableHead className="w-12 text-right text-xs font-medium tracking-wide uppercase">
                View
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((student) => (
              <TableRow
                key={student.id}
                className="h-12 cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-900"
                onClick={() => onRowClick(student)}
              >
                <TableCell className="px-4 py-3 font-mono text-sm">{student.seatNumber}</TableCell>
                <TableCell className="px-4 py-3 font-mono text-sm">
                  {student.enrollmentNumber || '-'}
                </TableCell>
                <TableCell className="px-4 py-3 text-sm font-medium">
                  {student.name || '-'}
                </TableCell>
                <TableCell className="px-4 py-3">
                  <Badge
                    variant="outline"
                    className="font-mono text-xs"
                  >
                    {student.scheme || '-'}
                  </Badge>
                </TableCell>
                <TableCell className="px-4 py-3">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{student.instituteCode}</span>
                    <span className="max-w-32 truncate text-xs text-neutral-500">
                      {student.instituteName?.length > 20
                        ? `${student.instituteName.slice(0, 20)}...`
                        : student.instituteName}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {getValidSubjects(student.subCodes)
                      .slice(0, 3)
                      .map((code) => (
                        <Badge
                          key={code}
                          variant="secondary"
                          className="font-mono text-[10px]"
                        >
                          {code}
                        </Badge>
                      ))}
                    {getValidSubjects(student.subCodes).length > 3 && (
                      <Badge
                        variant="secondary"
                        className="text-[10px]"
                      >
                        +{getValidSubjects(student.subCodes).length - 3}
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="px-4 py-3 text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRowClick(student);
                    }}
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default function SeatingChartPage() {
  const { examCenter, isLoading: userLoading } = useUserInfo();

  const [entries, setEntries] = useState<StudentSeatingData[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<SeatingChartStats | null>(null);
  const [hasData, setHasData] = useState<boolean | null>(null);
  const [showUpload, setShowUpload] = useState(false);

  const [selectedStudent, setSelectedStudent] = useState<StudentSeatingData | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const [searchInput, setSearchInput] = useState('');
  const [filters, setFilters] = useState({
    instituteCode: '',
    scheme: '',
    search: '',
  });

  const [sortColumn, setSortColumn] = useState('seatNumber');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [subjectMap, setSubjectMap] = useState<Map<string, string>>(new Map());
  const pageSize = 100;

  const [institutes, setInstitutes] = useState<InstituteInfo[]>([]);
  const [schemes, setSchemes] = useState<string[]>([]);

  const searchInputRef = useRef<HTMLInputElement>(null);

  const fetchData = useCallback(
    async (page: number = 1) => {
      setLoading(true);
      try {
        const [hasDataResult, statsResult, institutesResult, schemesResult] = await Promise.all([
          hasSeatingData(),
          getSeatingChartStats(),
          getUniqueInstitutesForSeating(),
          getUniqueSchemesForSeating(),
        ]);

        if (!hasDataResult.success) throw new Error(hasDataResult.error);
        if (!statsResult.success) throw new Error(statsResult.error);

        setHasData(hasDataResult.data);
        setStats(statsResult.data);

        if (institutesResult.success) setInstitutes(institutesResult.data);

        if (schemesResult.success) {
          const map = new Map<string, string>();
          const allEntry = schemesResult.data.find((s) => s.scheme === '__ALL__');
          if (allEntry) {
            allEntry.subjects.forEach((subject) => {
              map.set(subject.code, subject.name);
            });
          } else {
            schemesResult.data.forEach((schemeData) => {
              schemeData.subjects.forEach((subject) => {
                map.set(subject.code, subject.name);
              });
            });
          }
          setSubjectMap(map);
          setSchemes(schemesResult.data.map((s) => s.scheme).filter((s) => s !== '__ALL__'));
        }

        const studentsResult = await getPaginatedStudentSeatingData({
          instituteCode: filters.instituteCode || undefined,
          scheme: filters.scheme || undefined,
          search: filters.search || undefined,
          page,
          limit: pageSize,
        });

        if (!studentsResult.success) throw new Error(studentsResult.error);

        setEntries(studentsResult.data);
        setTotalPages(studentsResult.pagination.totalPages);
        setTotalItems(studentsResult.pagination.total);
        setCurrentPage(studentsResult.pagination.page);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to load seating chart');
      } finally {
        setLoading(false);
      }
    },
    [filters],
  );

  useEffect(() => {
    fetchData(1);
  }, [fetchData]);

  const handleSearch = () => {
    const trimmed = searchInput.trim();
    setFilters((prev) => ({ ...prev, search: trimmed }));
    setCurrentPage(1);
    if (searchInputRef.current) {
      searchInputRef.current.blur();
    }
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearch();
    }
  };

  const handleClearFilters = () => {
    setSearchInput('');
    setFilters({ instituteCode: '', scheme: '', search: '' });
    setCurrentPage(1);
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  };

  const handleRowClick = (student: StudentSeatingData) => {
    setSelectedStudent(student);
    setModalOpen(true);
  };

  const handleExport = async () => {
    try {
      const result = await getPaginatedStudentSeatingData({
        instituteCode: filters.instituteCode || undefined,
        scheme: filters.scheme || undefined,
        search: filters.search || undefined,
        page: 1,
        limit: 9999,
      });

      if (!result.success) throw new Error(result.error);

      if (!result.data.length) {
        toast.error('No data to export');
        return;
      }

      const headers = [
        'Seat Number',
        'Enrollment Number',
        'Name',
        'Scheme',
        'Institute Code',
        'Institute Name',
        'Subjects',
      ];
      const rows = result.data.map((entry) => [
        entry.seatNumber,
        entry.enrollmentNumber || '',
        entry.name || '',
        entry.scheme || '',
        entry.instituteCode,
        entry.instituteName,
        getValidSubjects(entry.subCodes).join(', '),
      ]);

      const csv = [headers, ...rows]
        .map((row) => row.map((cell) => `"${cell ?? ''}"`).join(','))
        .join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'seating-chart.csv';
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Exported successfully');
    } catch (error) {
      toast.error('Failed to export data');
    }
  };

  const sortedEntries = useMemo(() => {
    const sorted = [...entries];
    sorted.sort((a, b) => {
      let aVal: any, bVal: any;
      switch (sortColumn) {
        case 'seatNumber':
          aVal = a.seatNumber;
          bVal = b.seatNumber;
          break;
        case 'enrollmentNumber':
          aVal = a.enrollmentNumber || '';
          bVal = b.enrollmentNumber || '';
          break;
        case 'name':
          aVal = a.name || '';
          bVal = b.name || '';
          break;
        case 'scheme':
          aVal = a.scheme || '';
          bVal = b.scheme || '';
          break;
        case 'instituteCode':
          aVal = a.instituteCode;
          bVal = b.instituteCode;
          break;
        default:
          return 0;
      }
      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [entries, sortColumn, sortDirection]);

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const handleUploadSuccess = () => {
    toast.success('Seating chart uploaded successfully!');
    fetchData(1);
    setShowUpload(false);
  };

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      fetchData(page);
    }
  };

  const filterOptions = [
    {
      id: 'instituteCode',
      label: 'Institute',
      options: institutes.map((i) => ({ value: i.code, label: `${i.code} (${i.count})` })),
      value: filters.instituteCode || 'all',
    },
    {
      id: 'scheme',
      label: 'Scheme',
      options: schemes.map((s) => ({ value: s, label: s })),
      value: filters.scheme || 'all',
    },
  ];

  const toolbarActions = [
    {
      id: 'export',
      label: 'Export',
      icon: <Download className="h-3.5 w-3.5" />,
      onClick: handleExport,
      variant: 'ghost' as const,
    },
    {
      id: 'refresh',
      label: 'Refresh',
      icon: <RefreshCw className="h-3.5 w-3.5" />,
      onClick: () => fetchData(currentPage),
      variant: 'outline' as const,
    },
  ];

  if ((loading && hasData === null) || userLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!hasData || showUpload) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <PageHeader
            title="Seating Chart"
            description="Upload student seating chart data to begin exam configuration."
            icon={Users}
          />
          {hasData && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowUpload(false)}
            >
              Cancel
            </Button>
          )}
        </div>
        <MSBTEContextBar
          season={examCenter?.season as 'Summer' | 'Winter'}
          year={examCenter?.examYear!}
        />
        <div className="rounded-lg border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-950">
          <UniversalFileUploaderWrapper
            ecCode={examCenter?.code || ''}
            allowedTypes={['seatingchart']}
            defaultType="seatingchart"
            onSuccess={handleUploadSuccess}
            onProcessingComplete={handleUploadSuccess}
          />
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Seating Chart"
        description="View and manage student seating data."
        icon={Users}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowUpload(true)}
            className="gap-1.5"
          >
            <Upload className="h-4 w-4" />
            Upload New
          </Button>
        }
      />

      <MSBTEContextBar
        season={examCenter?.season as 'Summer' | 'Winter'}
        year={examCenter?.examYear!}
      />

      {stats && <StatsCards stats={stats} />}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="relative flex flex-1 items-center gap-2">
            <Input
              ref={searchInputRef}
              placeholder="Search by seat, name, or enrollment..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              className="h-9 max-w-sm"
            />
            <Button
              variant="default"
              size="sm"
              onClick={handleSearch}
              className="h-9"
            >
              Search
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {toolbarActions.map((action) => (
            <Button
              key={action.id}
              variant={action.variant}
              size="sm"
              onClick={action.onClick}
              className="h-9 gap-1.5"
            >
              {action.icon}
              <span className="hidden sm:inline">{action.label}</span>
            </Button>
          ))}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <select
          className="h-9 rounded-md border border-neutral-200 bg-white px-3 text-sm dark:border-neutral-800 dark:bg-neutral-950"
          value={filters.instituteCode || 'all'}
          onChange={(e) => {
            const value = e.target.value;
            setFilters((prev) => ({ ...prev, instituteCode: value === 'all' ? '' : value }));
            setCurrentPage(1);
          }}
        >
          <option value="all">All Institutes</option>
          {institutes.map((i) => (
            <option
              key={i.code}
              value={i.code}
            >
              {i.code} ({i.count})
            </option>
          ))}
        </select>

        <select
          className="h-9 rounded-md border border-neutral-200 bg-white px-3 text-sm dark:border-neutral-800 dark:bg-neutral-950"
          value={filters.scheme || 'all'}
          onChange={(e) => {
            const value = e.target.value;
            setFilters((prev) => ({ ...prev, scheme: value === 'all' ? '' : value }));
            setCurrentPage(1);
          }}
        >
          <option value="all">All Schemes</option>
          {schemes.map((s) => (
            <option
              key={s}
              value={s}
            >
              {s}
            </option>
          ))}
        </select>

        {(filters.instituteCode || filters.scheme || filters.search) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearFilters}
            className="h-9 text-xs"
          >
            Clear Filters
          </Button>
        )}
      </div>

      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs text-neutral-500">
          {totalItems} student{totalItems !== 1 ? 's' : ''}
          {filters.search && ` matching "${filters.search}"`}
        </p>
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1 || loading}
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
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages || loading}
              className="h-7 px-2 text-xs"
            >
              <ChevronRight className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>

      <DataTable
        entries={sortedEntries}
        sortColumn={sortColumn}
        sortDirection={sortDirection}
        onSort={handleSort}
        onRowClick={handleRowClick}
        loading={loading}
      />

      <StudentDetailModal
        student={selectedStudent}
        open={modalOpen}
        onOpenChange={setModalOpen}
        subjectMap={subjectMap}
      />
    </div>
  );
}
