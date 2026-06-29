// modules/exam-setup/emarksheet.tsx
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FileSignature,
  RefreshCw,
  Upload,
} from 'lucide-react';
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
  type EMarksheetRecord,
  type EMarksheetStats,
  getEMarksheets,
  hasEMarksheetData,
} from '@/lib/actions/emarksheet';

const getDept = (code: string) => (departments as Record<string, string>)[code] || code;

// ============================================================================
// Stats Cards Component
// ============================================================================

const StatsCards = ({ stats }: { stats: EMarksheetStats }) => (
  <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
    <div className="rounded-lg border border-neutral-100 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
      <p className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">{stats.totalRecords}</p>
      <p className="text-xs text-neutral-500">Records</p>
    </div>
    <div className="rounded-lg border border-neutral-100 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
      <p className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">{stats.totalSchemes}</p>
      <p className="text-xs text-neutral-500">Schemes</p>
    </div>
    <div className="rounded-lg border border-neutral-100 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
      <p className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">{stats.totalSubjects}</p>
      <p className="text-xs text-neutral-500">Subjects</p>
    </div>
    <div className="rounded-lg border border-neutral-100 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
      <p className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">{stats.processedCount}</p>
      <p className="text-xs text-neutral-500">Processed</p>
    </div>
  </div>
);

// ============================================================================
// E-Marksheet Detail Modal
// ============================================================================

const EMarksheetDetailModal = ({
  record,
  open,
  onOpenChange,
}: {
  record: EMarksheetRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  if (!record) return null;

  const isProcessed = !!record.processedAt;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>E-Marksheet Details</DialogTitle>
          <DialogDescription>Complete information for {record.paperCode || 'Unknown Paper'}</DialogDescription>
        </DialogHeader>
        <div className="space-y-6 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-neutral-500">Sheet No</p>
              <p className="font-mono text-lg font-semibold">{record.sheetNo || 'N/A'}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-neutral-500">Paper Code</p>
              <p className="font-mono text-lg font-semibold">{record.paperCode || 'N/A'}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-neutral-500">Subject Name</p>
              <p className="text-lg font-medium">{record.subjectName || 'N/A'}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-neutral-500">Subject Head</p>
              <p className="text-lg font-medium">{record.subjectHead || 'N/A'}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-neutral-500">Scheme</p>
              <Badge variant="outline" className="mt-1">
                {record.scheme || 'N/A'}
              </Badge>
              <br />
              <Badge variant="default" className="mt-1 h-fit w-full break-words whitespace-normal">
                {getDept(record.scheme?.split('-')[0] || '')}
              </Badge>
            </div>
            <div>
              <p className="text-sm font-medium text-neutral-500">File Name</p>
              <p className="font-mono text-sm">{record.fileName || 'N/A'}</p>
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-neutral-500">Status</p>
            <div className="mt-2 flex items-center gap-2">
              {isProcessed ? (
                <Badge className="bg-green-500">Processed</Badge>
              ) : (
                <Badge variant="secondary">Pending</Badge>
              )}
              {record.processedAt && (
                <span className="text-xs text-neutral-500">
                  Processed:{' '}
                  {new Date(record.processedAt).toLocaleDateString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              )}
            </div>
          </div>

          {record.processedAt && (
            <div className="rounded-md border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950/20">
              <p className="text-sm font-medium text-green-800 dark:text-green-400">
                E-Marksheet Processed Successfully
              </p>
              <p className="mt-1 text-sm text-green-700 dark:text-green-300">
                Sheet {record.sheetNo} for {record.subjectName} has been processed.
              </p>
            </div>
          )}

          {!record.processedAt && (
            <div className="rounded-md border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-900/50">
              <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Awaiting Processing</p>
              <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                This e-marksheet has not been processed yet.
              </p>
            </div>
          )}
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
  entries: EMarksheetRecord[];
  sortColumn: string;
  sortDirection: 'asc' | 'desc';
  onSort: (column: string) => void;
  onRowClick: (record: EMarksheetRecord) => void;
}) => {
  const getSortIcon = (column: string) => {
    if (sortColumn !== column) return null;
    return sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
  };

  if (entries.length === 0) {
    return <PageEmpty title="No e-marksheet records" description="Upload e-marksheet data to get started." />;
  }

  return (
    <div className="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader className="bg-neutral-50 dark:bg-neutral-900">
            <TableRow>
              <TableHead
                className="w-24 cursor-pointer text-xs font-medium tracking-wide uppercase"
                onClick={() => onSort('sheetNo')}
              >
                Sheet No {getSortIcon('sheetNo')}
              </TableHead>
              <TableHead
                className="cursor-pointer text-xs font-medium tracking-wide uppercase"
                onClick={() => onSort('subjectName')}
              >
                Subject {getSortIcon('subjectName')}
              </TableHead>
              <TableHead
                className="w-24 cursor-pointer text-xs font-medium tracking-wide uppercase"
                onClick={() => onSort('scheme')}
              >
                Scheme {getSortIcon('scheme')}
              </TableHead>
              <TableHead
                className="w-28 cursor-pointer text-xs font-medium tracking-wide uppercase"
                onClick={() => onSort('paperCode')}
              >
                Paper Code {getSortIcon('paperCode')}
              </TableHead>
              <TableHead
                className="w-32 cursor-pointer text-xs font-medium tracking-wide uppercase"
                onClick={() => onSort('subjectHead')}
              >
                Subject Head {getSortIcon('subjectHead')}
              </TableHead>
              <TableHead className="w-24 text-center text-xs font-medium tracking-wide uppercase">Status</TableHead>
              <TableHead className="w-12 text-right text-xs font-medium tracking-wide uppercase">View</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map(record => {
              const isProcessed = !!record.processedAt;

              return (
                <TableRow
                  key={record.id}
                  className="h-12 cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-900"
                  onClick={() => onRowClick(record)}
                >
                  <TableCell className="px-4 py-3 font-mono text-sm">{record.sheetNo || '-'}</TableCell>
                  <TableCell className="px-4 py-3 text-sm font-medium">
                    {record.subjectName && record.subjectName?.length > 25
                      ? `${record.subjectName.slice(0, 25)}...`
                      : record.subjectName || '-'}
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <Badge variant="outline" className="font-mono text-xs">
                      {record.scheme || '-'}
                    </Badge>
                  </TableCell>
                  <TableCell className="px-4 py-3 font-mono text-sm">{record.paperCode || '-'}</TableCell>
                  <TableCell className="px-4 py-3 text-sm">
                    {record.subjectHead && record.subjectHead?.length > 20
                      ? `${record.subjectHead.slice(0, 20)}...`
                      : record.subjectHead || '-'}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-center">
                    {isProcessed ? (
                      <Badge className="bg-green-500 text-[10px]">Processed</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px]">
                        Pending
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={e => {
                        e.stopPropagation();
                        onRowClick(record);
                      }}
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

// ============================================================================
// Main Component
// ============================================================================

export default function EMarksheetPage() {
  const { examCenter, isLoading: userLoading } = useUserInfo();

  const [entries, setEntries] = useState<EMarksheetRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<EMarksheetStats | null>(null);
  const [hasData, setHasData] = useState<boolean | null>(null);
  const [showUpload, setShowUpload] = useState(false);

  const [selectedRecord, setSelectedRecord] = useState<EMarksheetRecord | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const [filters, setFilters] = useState({
    scheme: '',
    search: '',
  });

  const [sortColumn, setSortColumn] = useState('sheetNo');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 25;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [hasDataResult, recordsResult] = await Promise.all([hasEMarksheetData(), getEMarksheets()]);

      if (!hasDataResult.success) throw new Error(hasDataResult.error);
      if (!recordsResult.success) throw new Error(recordsResult.error);

      setHasData(hasDataResult.data);
      setEntries(recordsResult.data || []);
      if (recordsResult.stats) setStats(recordsResult.stats);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load e-marksheet');
      setEntries([]);
      setHasData(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!userLoading) {
      fetchData();
    }
  }, [fetchData, userLoading]);

  const handleRowClick = (record: EMarksheetRecord) => {
    setSelectedRecord(record);
    setModalOpen(true);
  };

  const handleExport = () => {
    if (!filteredEntries.length) {
      toast.error('No data to export');
      return;
    }

    const headers = ['Sheet No', 'Subject Name', 'Scheme', 'Subject Head', 'Paper Code', 'File Name', 'Status'];
    const rows = filteredEntries.map(entry => [
      entry.sheetNo || '',
      entry.subjectName || '',
      entry.scheme || '',
      entry.subjectHead || '',
      entry.paperCode || '',
      entry.fileName || '',
      entry.processedAt ? 'Processed' : 'Pending',
    ]);

    const csv = [headers, ...rows].map(row => row.map(cell => `"${cell ?? ''}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'emarksheet.csv';
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Exported successfully');
  };

  const filteredEntries = useMemo(() => {
    const hasActiveFilters = filters.scheme || filters.search;
    if (!hasActiveFilters) return entries;

    return entries.filter(entry => {
      if (filters.scheme && entry.scheme !== filters.scheme) return false;
      if (filters.search) {
        const search = filters.search.toLowerCase();
        return (
          (entry.subjectName || '').toLowerCase().includes(search) ||
          (entry.sheetNo || '').toLowerCase().includes(search) ||
          (entry.paperCode || '').toLowerCase().includes(search) ||
          (entry.subjectHead || '').toLowerCase().includes(search)
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
        case 'sheetNo':
          aVal = a.sheetNo || '';
          bVal = b.sheetNo || '';
          break;
        case 'subjectName':
          aVal = a.subjectName || '';
          bVal = b.subjectName || '';
          break;
        case 'scheme':
          aVal = a.scheme || '';
          bVal = b.scheme || '';
          break;
        case 'paperCode':
          aVal = a.paperCode || '';
          bVal = b.paperCode || '';
          break;
        case 'subjectHead':
          aVal = a.subjectHead || '';
          bVal = b.subjectHead || '';
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
    setFilters({ scheme: '', search: '' });
    setCurrentPage(1);
  };

  const handleUploadSuccess = () => {
    toast.success('E-Marksheet uploaded successfully!');
    fetchData();
    setShowUpload(false);
  };

  const filterOptions = [
    {
      id: 'scheme',
      label: 'Scheme',
      options: [
        ...new Set(entries.map(e => e.scheme).filter((s): s is string => s !== null && s !== undefined && s !== '')),
      ].map(s => ({ value: s, label: s })),
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

  // Upload or no data screen
  if (!hasData || showUpload) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <PageHeader
            title="E-Marksheet"
            description="Upload e-marksheet data to manage student marksheets."
            icon={FileSignature}
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
            fileType="emarksheet"
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
        title="E-Marksheet"
        description="View and manage e-marksheet data."
        icon={FileSignature}
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
          if (id === 'scheme') {
            setFilters(prev => ({ ...prev, scheme: value === 'all' ? '' : value }));
          }
          setCurrentPage(1);
        }}
        searchValue={filters.search}
        onSearchChange={value => {
          setFilters(prev => ({ ...prev, search: value }));
          setCurrentPage(1);
        }}
        searchPlaceholder="Search by subject, sheet, or paper code..."
        actions={toolbarActions}
      />

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

      <EMarksheetDetailModal record={selectedRecord} open={modalOpen} onOpenChange={setModalOpen} />
    </div>
  );
}
