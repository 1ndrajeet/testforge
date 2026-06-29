// modules/exam-setup/seatingchart.tsx
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Download, Eye, RefreshCw, Upload, Users } from 'lucide-react';
import { toast } from 'sonner';

import { MSBTEContextBar } from '@/components/layout/msbte-context-bar';
import { PageEmpty, PageHeader, PageToolbar } from '@/components/layout/page-layout';
import { UniversalFileUploader } from '@/components/shared/file-uploader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import departments from '@/config/course_codes.json';
import { useUserInfo } from '@/hooks/useUserInfo';
import {
  type SeatingChartStats,
  type StudentSeatingData,
  getSeatingChartStats,
  getStudentSeatingData,
  getUniqueInstitutesForSeating,
  getUniqueSchemesForSeating,
  hasSeatingData,
} from '@/lib/actions/student';

const getDept = (code: string) => (departments as Record<string, string>)[code] || code;

// ============================================================================
// Helper Functions
// ============================================================================

const getValidSubjects = (subCodes: string[] | null | undefined) => {
  return (subCodes || []).filter(code => code && code.trim() !== '');
};

// ============================================================================
// Types
// ============================================================================

interface InstituteInfo {
  code: string;
  name: string;
  count: number;
}

// ============================================================================
// Stats Cards Component
// ============================================================================

const StatsCards = ({ stats }: { stats: SeatingChartStats }) => (
  <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
    <div className="rounded-lg border border-neutral-100 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
      <p className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">{stats.totalStudents}</p>
      <p className="text-xs text-neutral-500">Students</p>
    </div>
    <div className="rounded-lg border border-neutral-100 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
      <p className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">{stats.totalInstitutes}</p>
      <p className="text-xs text-neutral-500">Institutes</p>
    </div>
    <div className="rounded-lg border border-neutral-100 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
      <p className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">{stats.totalSchemes}</p>
      <p className="text-xs text-neutral-500">Schemes</p>
    </div>
  </div>
);

// ============================================================================
// Student Detail Modal
// ============================================================================

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Student Details</DialogTitle>
          <DialogDescription>Complete information for {student.name || 'Student'}</DialogDescription>
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
              <Badge variant="outline" className="mt-1">
                {student.scheme || 'N/A'}
              </Badge>
              <br />
              <Badge variant="default" className="mt-1 h-fit w-full break-words whitespace-normal">
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
              {getValidSubjects(student.subCodes).map(code => (
                <Badge key={code} variant="secondary" className="text-xs">
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
              {getValidSubjects(student.subCodes).map(code => (
                <Badge key={code} variant="outline" className="font-mono text-xs">
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

// ============================================================================
// Data Table Component
// ============================================================================

const DataTable = ({
  entries,
  sortColumn,
  sortDirection,
  onSort,
  onRowClick,
}: {
  entries: StudentSeatingData[];
  sortColumn: string;
  sortDirection: 'asc' | 'desc';
  onSort: (column: string) => void;
  onRowClick: (student: StudentSeatingData) => void;
}) => {
  const getSortIcon = (column: string) => {
    if (sortColumn !== column) return null;
    return sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
  };

  if (entries.length === 0) {
    return (
      <PageEmpty title="No matching students" description="Try adjusting your filters or upload a seating chart." />
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
              <TableHead className="w-32 text-xs font-medium tracking-wide uppercase">Subjects</TableHead>
              <TableHead className="w-12 text-right text-xs font-medium tracking-wide uppercase">View</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map(student => (
              <TableRow
                key={student.id}
                className="h-12 cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-900"
                onClick={() => onRowClick(student)}
              >
                <TableCell className="px-4 py-3 font-mono text-sm">{student.seatNumber}</TableCell>
                <TableCell className="px-4 py-3 font-mono text-sm">{student.enrollmentNumber || '-'}</TableCell>
                <TableCell className="px-4 py-3 text-sm font-medium">{student.name || '-'}</TableCell>
                <TableCell className="px-4 py-3">
                  <Badge variant="outline" className="font-mono text-xs">
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
                      .map(code => (
                        <Badge key={code} variant="secondary" className="font-mono text-[10px]">
                          {code}
                        </Badge>
                      ))}
                    {getValidSubjects(student.subCodes).length > 3 && (
                      <Badge variant="secondary" className="text-[10px]">
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
                    onClick={e => {
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

// ============================================================================
// Main Component
// ============================================================================

export default function SeatingChartPage() {
  const { examCenter, isLoading: userLoading } = useUserInfo();

  const [entries, setEntries] = useState<StudentSeatingData[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<SeatingChartStats | null>(null);
  const [hasData, setHasData] = useState<boolean | null>(null);
  const [showUpload, setShowUpload] = useState(false);

  const [selectedStudent, setSelectedStudent] = useState<StudentSeatingData | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const [filters, setFilters] = useState({
    instituteCode: '',
    scheme: '',
    search: '',
  });

  const [sortColumn, setSortColumn] = useState('seatNumber');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [subjectMap, setSubjectMap] = useState<Map<string, string>>(new Map());
  const pageSize = 25;

  const [institutes, setInstitutes] = useState<InstituteInfo[]>([]);
  const [schemes, setSchemes] = useState<string[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [hasDataResult, studentsResult, statsResult, institutesResult, schemesResult] = await Promise.all([
        hasSeatingData(),
        getStudentSeatingData({ limit: 1000 }),
        getSeatingChartStats(),
        getUniqueInstitutesForSeating(),
        getUniqueSchemesForSeating(),
      ]);

      if (!hasDataResult.success) throw new Error(hasDataResult.error);
      if (!studentsResult.success) throw new Error(studentsResult.error);
      if (!statsResult.success) throw new Error(statsResult.error);

      setHasData(hasDataResult.data);
      setEntries(studentsResult.data);
      setStats(statsResult.data);

      if (institutesResult.success) setInstitutes(institutesResult.data);

      if (schemesResult.success) {
        const map = new Map<string, string>();
        const allEntry = schemesResult.data.find(s => s.scheme === '__ALL__');
        if (allEntry) {
          allEntry.subjects.forEach(subject => {
            map.set(subject.code, subject.name);
          });
        } else {
          schemesResult.data.forEach(schemeData => {
            schemeData.subjects.forEach(subject => {
              map.set(subject.code, subject.name);
            });
          });
        }
        setSubjectMap(map);
        setSchemes(schemesResult.data.map(s => s.scheme).filter(s => s !== '__ALL__'));
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load seating chart');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRowClick = (student: StudentSeatingData) => {
    setSelectedStudent(student);
    setModalOpen(true);
  };

  const handleExport = () => {
    if (!filteredEntries.length) {
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
    const rows = filteredEntries.map(entry => [
      entry.seatNumber,
      entry.enrollmentNumber || '',
      entry.name || '',
      entry.scheme || '',
      entry.instituteCode,
      entry.instituteName,
      getValidSubjects(entry.subCodes).join(', '),
    ]);

    const csv = [headers, ...rows].map(row => row.map(cell => `"${cell ?? ''}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'seating-chart.csv';
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Exported successfully');
  };

  const filteredEntries = useMemo(() => {
    const hasActiveFilters = filters.instituteCode || filters.scheme || filters.search;
    if (!hasActiveFilters) return entries;

    return entries.filter(entry => {
      if (filters.instituteCode && entry.instituteCode !== filters.instituteCode) return false;
      if (filters.scheme && entry.scheme !== filters.scheme) return false;
      if (filters.search) {
        const search = filters.search.toLowerCase();
        return (
          String(entry.seatNumber).includes(search) ||
          (entry.name || '').toLowerCase().includes(search) ||
          (entry.enrollmentNumber || '').toLowerCase().includes(search)
        );
      }
      return true;
    });
  }, [entries, filters]);

  const sortedEntries = useMemo(() => {
    const sorted = [...filteredEntries];
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
    setFilters({ instituteCode: '', scheme: '', search: '' });
    setCurrentPage(1);
  };

  const handleUploadSuccess = () => {
    toast.success('Seating chart uploaded successfully!');
    fetchData();
    setShowUpload(false);
  };

  const filterOptions = [
    {
      id: 'instituteCode',
      label: 'Institute',
      options: institutes.map(i => ({ value: i.code, label: `${i.code} (${i.count})` })),
      value: filters.instituteCode || 'all',
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
      onClick: fetchData,
      variant: 'outline' as const,
    },
  ];

  // Loading state
  if ((loading && hasData === null) || userLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  // Upload screen
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
            <Button variant="ghost" size="sm" onClick={() => setShowUpload(false)}>
              Cancel
            </Button>
          )}
        </div>
        <MSBTEContextBar season={examCenter?.season as 'Summer' | 'Winter'} year={examCenter?.examYear!} />
        <div className="rounded-lg border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-950">
          <UniversalFileUploader
            fileType="seatingchart"
            ecCode={examCenter?.code || ''}
            onSuccess={handleUploadSuccess}
            onProcessingComplete={handleUploadSuccess}
          />
        </div>
      </div>
    );
  }

  // Table view
  return (
    <div>
      <PageHeader
        title="Seating Chart"
        description="View and manage student seating data."
        icon={Users}
        actions={
          <Button variant="outline" size="sm" onClick={() => setShowUpload(true)} className="gap-1.5">
            <Upload className="h-4 w-4" />
            Upload New
          </Button>
        }
      />

      <MSBTEContextBar season={examCenter?.season as 'Summer' | 'Winter'} year={examCenter?.examYear!} />

      {stats && <StatsCards stats={stats} />}

      <PageToolbar
        filters={filterOptions}
        onFilterChange={(id, value) => {
          if (id === 'instituteCode') {
            setFilters(prev => ({ ...prev, instituteCode: value === 'all' ? '' : value }));
          } else if (id === 'scheme') {
            setFilters(prev => ({ ...prev, scheme: value === 'all' ? '' : value }));
          }
          setCurrentPage(1);
        }}
        searchValue={filters.search}
        onSearchChange={value => {
          setFilters(prev => ({ ...prev, search: value }));
          setCurrentPage(1);
        }}
        searchPlaceholder="Search by seat, name, or enrollment..."
        actions={toolbarActions}
      />

      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs text-neutral-500">
          {filteredEntries.length} student{filteredEntries.length !== 1 ? 's' : ''}
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

      <DataTable
        entries={paginatedEntries}
        sortColumn={sortColumn}
        sortDirection={sortDirection}
        onSort={handleSort}
        onRowClick={handleRowClick}
      />

      {Object.values(filters).some(v => v !== '') && (
        <div className="mt-4 flex justify-end">
          <Button variant="ghost" size="sm" onClick={handleClearFilters} className="text-xs">
            Clear all filters
          </Button>
        </div>
      )}

      <StudentDetailModal
        student={selectedStudent}
        open={modalOpen}
        onOpenChange={setModalOpen}
        subjectMap={subjectMap}
      />
    </div>
  );
}
