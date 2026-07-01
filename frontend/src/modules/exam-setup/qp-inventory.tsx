// modules/exam-setup/qp-inventory.tsx
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  Package,
  RefreshCw,
  Upload,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  getAllInventoryRecords,
  hasInventoryData,
  type QPInventoryRecord,
  type QPInventoryStats,
} from '@/lib/actions/inventory';

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

import { UniversalFileUploader } from '@/components/shared/file-uploader';

// ============================================================================
// Stats Cards Component
// ============================================================================

const StatsCards = ({ stats }: { stats: QPInventoryStats }) => (
  <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
    <div className="rounded-lg border border-neutral-100 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
      <p className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
        {stats.totalSubjects}
      </p>
      <p className="text-xs text-neutral-500">Subjects</p>
    </div>
    <div className="rounded-lg border border-neutral-100 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
      <p className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
        {stats.totalExpectedPackets}
      </p>
      <p className="text-xs text-neutral-500">Expected Packets</p>
    </div>
    <div className="rounded-lg border border-neutral-100 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
      <p className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
        {stats.totalReceivedPackets}
      </p>
      <p className="text-xs text-neutral-500">Received Packets</p>
    </div>
    <div className="rounded-lg border border-neutral-100 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
      <p className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
        {stats.completionRate}%
      </p>
      <p className="text-xs text-neutral-500">Completion Rate</p>
    </div>
  </div>
);

// ============================================================================
// Inventory Detail Modal
// ============================================================================

// ============================================================================
// Inventory Detail Modal
// ============================================================================

const InventoryDetailModal = ({
  record,
  open,
  onOpenChange,
}: {
  record: QPInventoryRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  if (!record) return null;

  const isComplete = record.receivedPackets >= record.expectedPackets && record.expectedPackets > 0;
  const hasDiscrepancy =
    record.expectedPackets !== record.receivedPackets && record.expectedPackets > 0;
  const discrepancyAmount = record.expectedPackets - record.receivedPackets;
  const isOver = discrepancyAmount < 0;
  const isUnder = discrepancyAmount > 0;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Inventory Details</DialogTitle>
          <DialogDescription>
            Complete information for {record.subjectCode} - {record.subjectName}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-neutral-500">Subject Code</p>
              <p className="font-mono text-lg font-semibold">{record.subjectCode}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-neutral-500">Subject Name</p>
              <p className="text-lg font-medium">{record.subjectName}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-neutral-500">Day</p>
              <Badge
                variant="outline"
                className="mt-1"
              >
                Day {record.day}
              </Badge>
            </div>
            <div>
              <p className="text-sm font-medium text-neutral-500">Session</p>
              <Badge
                variant={record.session === 'Morning' ? 'default' : 'secondary'}
                className="mt-1"
              >
                {record.session}
              </Badge>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-neutral-500">Students</p>
              <p className="text-lg font-semibold">{record.expectedStudents}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-neutral-500">Scheme</p>
              <Badge variant="outline">{record.scheme || 'N/A'}</Badge>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-neutral-500">Expected Packets</p>
              <p className="text-lg font-semibold">{record.expectedPackets}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-neutral-500">Received Packets</p>
              <p className="text-lg font-semibold">{record.receivedPackets}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-neutral-500">Received QPs</p>
              <p className="text-lg font-semibold">{record.receivedQps}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-neutral-500">QPs Per Packet</p>
              <p className="text-lg font-semibold">{record.qpPerPacket || 50}</p>
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-neutral-500">Status</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {isComplete ? (
                <Badge className="bg-green-500">
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  Complete
                </Badge>
              ) : (
                <Badge variant="destructive">
                  <XCircle className="mr-1 h-3 w-3" />
                  Pending
                </Badge>
              )}
              {hasDiscrepancy && (
                <Badge
                  variant="outline"
                  className="border-amber-500 text-amber-500"
                >
                  Discrepancy
                </Badge>
              )}
            </div>

            {/* Discrepancy Details */}
            {hasDiscrepancy && (
              <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/20">
                <p className="text-sm font-medium text-amber-800 dark:text-amber-400">
                  Packet Discrepancy Detected
                </p>
                <div className="mt-2 space-y-1 text-sm text-amber-700 dark:text-amber-300">
                  {isUnder && (
                    <>
                      <p>
                        <span className="font-medium">Shortage:</span> {Math.abs(discrepancyAmount)}{' '}
                        packet
                        {Math.abs(discrepancyAmount) !== 1 ? 's' : ''} missing
                      </p>
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        Expected {record.expectedPackets} packets but received only{' '}
                        {record.receivedPackets} packets
                      </p>
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        Estimated QPs shortage:{' '}
                        {Math.abs(discrepancyAmount) * (record.qpPerPacket || 50)} question papers
                      </p>
                    </>
                  )}
                  {isOver && (
                    <>
                      <p>
                        <span className="font-medium">Excess:</span> {Math.abs(discrepancyAmount)}{' '}
                        extra packet
                        {Math.abs(discrepancyAmount) !== 1 ? 's' : ''} received
                      </p>
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        Expected {record.expectedPackets} packets but received{' '}
                        {record.receivedPackets} packets
                      </p>
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        Estimated excess QPs:{' '}
                        {Math.abs(discrepancyAmount) * (record.qpPerPacket || 50)} question papers
                      </p>
                    </>
                  )}
                  <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                    Please verify with the distribution center.
                  </p>
                </div>
              </div>
            )}

            {/* Completion Details */}
            {isComplete && !hasDiscrepancy && (
              <div className="mt-4 rounded-md border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950/20">
                <p className="text-sm font-medium text-green-800 dark:text-green-400">
                  All packets received successfully
                </p>
                <p className="mt-1 text-sm text-green-700 dark:text-green-300">
                  Received {record.receivedPackets} packets for {record.expectedStudents} students
                </p>
              </div>
            )}

            {!isComplete && !hasDiscrepancy && (
              <div className="mt-4 rounded-md border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-900/50">
                <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  Awaiting Packet Receipt
                </p>
                <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                  Expected {record.expectedPackets} packets for {record.expectedStudents} students
                </p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  {record.receivedPackets} packets received so far
                </p>
              </div>
            )}
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
  entries: QPInventoryRecord[];
  sortColumn: string;
  sortDirection: 'asc' | 'desc';
  onSort: (column: string) => void;
  onRowClick: (record: QPInventoryRecord) => void;
}) => {
  const getSortIcon = (column: string) => {
    if (sortColumn !== column) return null;
    return sortDirection === 'asc' ? (
      <ArrowUp className="h-3 w-3" />
    ) : (
      <ArrowDown className="h-3 w-3" />
    );
  };

  if (entries.length === 0) {
    return (
      <PageEmpty
        title="No inventory records"
        description="Upload inventory data to get started."
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
                className="w-16 cursor-pointer text-xs font-medium tracking-wide uppercase"
                onClick={() => onSort('day')}
              >
                Day {getSortIcon('day')}
              </TableHead>
              <TableHead
                className="cursor-pointer text-xs font-medium tracking-wide uppercase"
                onClick={() => onSort('subjectCode')}
              >
                Code {getSortIcon('subjectCode')}
              </TableHead>
              <TableHead
                className="cursor-pointer text-xs font-medium tracking-wide uppercase"
                onClick={() => onSort('subjectName')}
              >
                Subject {getSortIcon('subjectName')}
              </TableHead>
              <TableHead
                className="w-20 cursor-pointer text-xs font-medium tracking-wide uppercase"
                onClick={() => onSort('scheme')}
              >
                Scheme {getSortIcon('scheme')}
              </TableHead>
              <TableHead
                className="w-20 cursor-pointer text-xs font-medium tracking-wide uppercase"
                onClick={() => onSort('session')}
              >
                Session {getSortIcon('session')}
              </TableHead>
              <TableHead
                className="w-20 cursor-pointer text-right text-xs font-medium tracking-wide uppercase"
                onClick={() => onSort('expectedStudents')}
              >
                Students {getSortIcon('expectedStudents')}
              </TableHead>
              <TableHead
                className="w-24 cursor-pointer text-right text-xs font-medium tracking-wide uppercase"
                onClick={() => onSort('expectedPackets')}
              >
                Expected {getSortIcon('expectedPackets')}
              </TableHead>
              <TableHead
                className="w-24 cursor-pointer text-right text-xs font-medium tracking-wide uppercase"
                onClick={() => onSort('receivedPackets')}
              >
                Received {getSortIcon('receivedPackets')}
              </TableHead>
              <TableHead className="w-24 text-center text-xs font-medium tracking-wide uppercase">
                Status
              </TableHead>
              <TableHead className="w-12 text-right text-xs font-medium tracking-wide uppercase">
                View
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((record) => {
              const isComplete =
                record.receivedPackets >= record.expectedPackets && record.expectedPackets > 0;
              const hasDiscrepancy =
                record.expectedPackets !== record.receivedPackets && record.expectedPackets > 0;

              return (
                <TableRow
                  key={record.id}
                  className="h-12 cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-900"
                  onClick={() => onRowClick(record)}
                >
                  <TableCell className="px-4 py-3 text-center font-mono text-sm">
                    <Badge
                      variant="secondary"
                      className="text-xs"
                    >
                      Day {record.day}
                    </Badge>
                  </TableCell>
                  <TableCell className="px-4 py-3 font-mono text-sm">
                    {record.subjectCode}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-sm font-medium">
                    {record.subjectName?.length > 25
                      ? `${record.subjectName.slice(0, 25)}...`
                      : record.subjectName}
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <Badge
                      variant="outline"
                      className="font-mono text-xs"
                    >
                      {record.scheme || '-'}
                    </Badge>
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <Badge
                      variant={record.session === 'Morning' ? 'default' : 'secondary'}
                      className="text-[10px]"
                    >
                      {record.session}
                    </Badge>
                  </TableCell>
                  <TableCell className="px-4 py-3 text-right font-mono text-sm">
                    {record.expectedStudents}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-right font-mono text-sm">
                    {record.expectedPackets}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-right font-mono text-sm">
                    {record.receivedPackets}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      {isComplete ? (
                        <Badge className="bg-green-500 text-[10px]">
                          <CheckCircle2 className="mr-0.5 h-3 w-3" />
                          Complete
                        </Badge>
                      ) : (
                        <Badge
                          variant="destructive"
                          className="text-[10px]"
                        >
                          <XCircle className="mr-0.5 h-3 w-3" />
                          Pending
                        </Badge>
                      )}
                      {hasDiscrepancy && (
                        <Badge
                          variant="outline"
                          className="border-amber-500 text-[10px] text-amber-500"
                        >
                          Discrepancy
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

export default function InventoryPage() {
  const { examCenter, isLoading: userLoading } = useUserInfo();

  const [entries, setEntries] = useState<QPInventoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<QPInventoryStats | null>(null);
  const [hasData, setHasData] = useState<boolean | null>(null);
  const [showUpload, setShowUpload] = useState(false);

  const [selectedRecord, setSelectedRecord] = useState<QPInventoryRecord | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const [filters, setFilters] = useState({
    session: '',
    search: '',
  });

  const [sortColumn, setSortColumn] = useState('day');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 25;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [hasDataResult, recordsResult] = await Promise.all([
        hasInventoryData(),
        getAllInventoryRecords(),
      ]);

      if (!hasDataResult.success) throw new Error(hasDataResult.error);
      if (!recordsResult.success) throw new Error(recordsResult.error);

      setHasData(hasDataResult.data);
      setEntries(recordsResult.data || []);
      if (recordsResult.stats) setStats(recordsResult.stats);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load inventory');
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

  const handleRowClick = (record: QPInventoryRecord) => {
    setSelectedRecord(record);
    setModalOpen(true);
  };

  const handleExport = () => {
    if (!filteredEntries.length) {
      toast.error('No data to export');
      return;
    }

    const headers = [
      'Day',
      'Subject Code',
      'Subject Name',
      'Scheme',
      'Session',
      'Students',
      'Expected Packets',
      'Received Packets',
      'Status',
    ];
    const rows = filteredEntries.map((entry) => [
      entry.day || '',
      entry.subjectCode,
      entry.subjectName,
      entry.scheme || '',
      entry.session,
      entry.expectedStudents,
      entry.expectedPackets,
      entry.receivedPackets,
      entry.receivedPackets >= entry.expectedPackets ? 'Complete' : 'Pending',
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${cell ?? ''}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'inventory.csv';
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Exported successfully');
  };

  const filteredEntries = useMemo(() => {
    const hasActiveFilters = filters.session || filters.search;
    if (!hasActiveFilters) return entries;

    return entries.filter((entry) => {
      if (filters.session && entry.session !== filters.session) return false;
      if (filters.search) {
        const search = filters.search.toLowerCase();
        return (
          entry.subjectCode.toLowerCase().includes(search) ||
          entry.subjectName.toLowerCase().includes(search) ||
          (entry.scheme || '').toLowerCase().includes(search)
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
        case 'day':
          aVal = a.day || 0;
          bVal = b.day || 0;
          break;
        case 'subjectCode':
          aVal = a.subjectCode;
          bVal = b.subjectCode;
          break;
        case 'subjectName':
          aVal = a.subjectName;
          bVal = b.subjectName;
          break;
        case 'scheme':
          aVal = a.scheme || '';
          bVal = b.scheme || '';
          break;
        case 'session':
          aVal = a.session;
          bVal = b.session;
          break;
        case 'expectedStudents':
          aVal = a.expectedStudents;
          bVal = b.expectedStudents;
          break;
        case 'expectedPackets':
          aVal = a.expectedPackets;
          bVal = b.expectedPackets;
          break;
        case 'receivedPackets':
          aVal = a.receivedPackets;
          bVal = b.receivedPackets;
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
  const paginatedEntries = sortedEntries.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const handleClearFilters = () => {
    setFilters({ session: '', search: '' });
    setCurrentPage(1);
  };

  const handleUploadSuccess = () => {
    toast.success('Inventory uploaded successfully!');
    fetchData();
    setShowUpload(false);
  };

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
            title="Question Paper Inventory"
            description="Upload inventory data to manage question paper packets."
            icon={Package}
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
          <UniversalFileUploader
            fileType="inventory"
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
        title="Question Paper Inventory"
        description="View and manage question paper inventory."
        icon={Package}
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

      <PageToolbar
        filters={filterOptions}
        onFilterChange={(id, value) => {
          if (id === 'session') {
            setFilters((prev) => ({ ...prev, session: value === 'all' ? '' : value }));
          }
          setCurrentPage(1);
        }}
        searchValue={filters.search}
        onSearchChange={(value) => {
          setFilters((prev) => ({ ...prev, search: value }));
          setCurrentPage(1);
        }}
        searchPlaceholder="Search by subject code, name, or scheme..."
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
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
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
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
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

      {Object.values(filters).some((v) => v !== '') && (
        <div className="mt-4 flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearFilters}
            className="text-xs"
          >
            Clear all filters
          </Button>
        </div>
      )}

      <InventoryDetailModal
        record={selectedRecord}
        open={modalOpen}
        onOpenChange={setModalOpen}
      />
    </div>
  );
}
