// app/(exam-center)/exam-day/qp-accounting/page.tsx
'use client';

import { useCallback, useEffect, useState } from 'react';

import { format } from 'date-fns';
import {
  AlertTriangle,
  Calculator,
  Calendar,
  CheckCircle2,
  Download,
  Loader2,
  Package,
  Printer,
  RefreshCw,
  Save,
  Search,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  bulkUpdateQPInventory,
  generateQPInventoryFromTimetable,
  getQPInventory,
  type QPInventoryRecord,
  type QPInventoryStats,
} from '@/lib/actions2/inventory';
import { cn } from '@/lib/utils';

import { useUserInfo } from '@/hooks/useUserInfo';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { PageHeader, PageToolbar } from '@/components/layout/page-layout';

// ============================================================================
// Stats Cards Component
// ============================================================================

const StatsCards = ({
  stats,
  isLoading,
}: {
  stats: QPInventoryStats | null;
  isLoading: boolean;
}) => {
  if (isLoading) {
    return (
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton
            key={i}
            className="h-24 w-full rounded-lg"
          />
        ))}
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-5">
      <div className="rounded-lg border border-neutral-100 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
        <p className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
          {stats.totalSubjects}
        </p>
        <p className="text-xs text-neutral-500">Subjects</p>
      </div>
      <div className="rounded-lg border border-neutral-100 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
        <p className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
          {stats.totalExpectedStudents.toLocaleString()}
        </p>
        <p className="text-xs text-neutral-500">Expected Students</p>
      </div>
      <div className="rounded-lg border border-neutral-100 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
        <p className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
          {stats.totalReceivedPackets.toLocaleString()}
        </p>
        <p className="text-xs text-neutral-500">Received Packets</p>
      </div>
      <div className="rounded-lg border border-neutral-100 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
        <p className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
          {stats.totalPacketsDiscrepancy > 0 ? (
            <span className="text-amber-600">{stats.totalPacketsDiscrepancy}</span>
          ) : (
            stats.totalPacketsDiscrepancy
          )}
        </p>
        <p className="text-xs text-neutral-500">Packet Discrepancy</p>
      </div>
      <div className="rounded-lg border border-neutral-100 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
        <p className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
          {stats.completionRate}%
        </p>
        <p className="text-xs text-neutral-500">Completion Rate</p>
      </div>
    </div>
  );
};

// ============================================================================
// QP Inventory Table Component
// ============================================================================

interface QPInventoryTableProps {
  records: QPInventoryRecord[];
  isLoading?: boolean;
  onUpdate: (index: number, field: keyof QPInventoryRecord, value: number) => void;
  readOnly?: boolean;
}

const QPInventoryTable = ({
  records,
  isLoading,
  onUpdate,
  readOnly = false,
}: QPInventoryTableProps) => {
  const [searchTerm, setSearchTerm] = useState('');

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton
            key={i}
            className="h-12 w-full"
          />
        ))}
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-neutral-200 bg-gradient-to-b from-neutral-50 to-white py-16 dark:border-neutral-800 dark:from-neutral-900/50 dark:to-neutral-950">
        <Package className="mb-4 h-16 w-16 text-neutral-300 dark:text-neutral-700" />
        <h3 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
          No Inventory Records
        </h3>
        <p className="mt-2 text-sm text-neutral-500">Select a date to fetch QP inventory data.</p>
      </div>
    );
  }

  const filteredRecords = records.filter(
    (record) =>
      record.subjectCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      record.subjectName.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return (
    <div className="space-y-4">
      <div className="relative max-w-xs">
        <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-neutral-400" />
        <Input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search subjects..."
          className="h-9 pl-9 text-sm"
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-800">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-gradient-to-r from-neutral-50 to-neutral-100 dark:from-neutral-900 dark:to-neutral-900/80">
              <TableRow>
                <TableHead className="text-xs font-semibold tracking-wide uppercase">
                  Date
                </TableHead>
                <TableHead className="text-xs font-semibold tracking-wide uppercase">
                  Session
                </TableHead>
                <TableHead className="text-xs font-semibold tracking-wide uppercase">
                  Subject Code
                </TableHead>
                <TableHead className="text-xs font-semibold tracking-wide uppercase">
                  Subject Name
                </TableHead>
                <TableHead className="text-xs font-semibold tracking-wide uppercase">
                  Scheme
                </TableHead>
                <TableHead className="text-right text-xs font-semibold tracking-wide uppercase">
                  Expected
                </TableHead>
                <TableHead className="text-right text-xs font-semibold tracking-wide uppercase">
                  Expected Packets
                </TableHead>
                <TableHead className="text-right text-xs font-semibold tracking-wide uppercase">
                  Received Packets
                </TableHead>
                <TableHead className="text-right text-xs font-semibold tracking-wide uppercase">
                  QP Per Packet
                </TableHead>
                <TableHead className="text-right text-xs font-semibold tracking-wide uppercase">
                  Status
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRecords.map((record, index) => {
                const isDiscrepancy = record.expectedPackets !== record.receivedPackets;
                const isComplete = record.receivedPackets >= record.expectedPackets;

                return (
                  <TableRow
                    key={record.id || index}
                    className={cn(
                      'transition-colors',
                      isDiscrepancy ? 'bg-amber-50/50 dark:bg-amber-950/20' : '',
                      record.session === 'Afternoon'
                        ? 'border-t border-neutral-200 dark:border-neutral-800'
                        : '',
                    )}
                  >
                    <TableCell className="px-4 py-3 font-mono text-sm">
                      {format(new Date(record.date), 'dd MMM')}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-xs',
                          record.session === 'Morning'
                            ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400'
                            : 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-400',
                        )}
                      >
                        {record.session}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-4 py-3 font-mono text-sm font-medium">
                      {record.subjectCode}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm">{record.subjectName}</TableCell>
                    <TableCell className="px-4 py-3 font-mono text-sm">{record.scheme}</TableCell>
                    <TableCell className="px-4 py-3 text-right font-mono text-sm">
                      {record.expectedStudents.toLocaleString()}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right font-mono text-sm">
                      {record.expectedPackets}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right">
                      {readOnly ? (
                        <span
                          className={cn(
                            'font-mono text-sm',
                            isDiscrepancy
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-emerald-600',
                          )}
                        >
                          {record.receivedPackets}
                        </span>
                      ) : (
                        <Input
                          type="number"
                          min={0}
                          value={record.receivedPackets || ''}
                          onChange={(e) =>
                            onUpdate(index, 'receivedPackets', Number(e.target.value))
                          }
                          className={cn(
                            'h-8 w-20 text-center font-mono text-sm',
                            isDiscrepancy
                              ? 'border-amber-500 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30'
                              : '',
                          )}
                        />
                      )}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      {readOnly ? (
                        <span className="font-mono text-sm">{record.qpPerPacket || 0}</span>
                      ) : (
                        <Input
                          type="number"
                          min={0}
                          value={record.qpPerPacket || ''}
                          onChange={(e) => onUpdate(index, 'qpPerPacket', Number(e.target.value))}
                          className="h-8 w-20 text-center font-mono text-sm"
                        />
                      )}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right">
                      {isComplete ? (
                        <Badge
                          variant="default"
                          className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400"
                        >
                          Complete
                        </Badge>
                      ) : isDiscrepancy ? (
                        <Badge
                          variant="destructive"
                          className="bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400"
                        >
                          Warning Mismatch
                        </Badge>
                      ) : (
                        <Badge
                          variant="secondary"
                          className="bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-400"
                        >
                          Pending
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-neutral-500">
        <span>{filteredRecords.length} records</span>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full bg-amber-500" />
            <span>Discrepancy</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            <span>Complete</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full bg-neutral-400" />
            <span>Pending</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// Confirmation Dialog
// ============================================================================

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  discrepancies: Array<{ subjectCode: string; expected: number; received: number }>;
  isSubmitting: boolean;
}

function ConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  discrepancies,
  isSubmitting,
}: ConfirmDialogProps) {
  const hasDiscrepancies = discrepancies.length > 0;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {hasDiscrepancies ? (
              <>
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                Packet Discrepancy Found
              </>
            ) : (
              <>
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                Confirm Submission
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {hasDiscrepancies
              ? 'The following subjects have packet count mismatches. Submitting will record these discrepancies.'
              : 'All packet counts match. Confirm to save the inventory data.'}
          </DialogDescription>
        </DialogHeader>

        {hasDiscrepancies && (
          <div className="max-h-60 overflow-y-auto rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/20">
            <div className="space-y-1">
              {discrepancies.map((d, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="font-mono">{d.subjectCode}</span>
                  <span className="text-amber-600 dark:text-amber-400">
                    Expected: {d.expected}, Received: {d.received}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-md bg-neutral-50 p-3 dark:bg-neutral-900">
          <p className="text-xs text-neutral-500">
            {hasDiscrepancies
              ? 'Submitting will log these discrepancies for audit purposes. The data will be saved with the received values.'
              : 'All expected packet counts match received values. Data will be saved successfully.'}
          </p>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isSubmitting}
            variant={hasDiscrepancies ? 'default' : 'default'}
            className={hasDiscrepancies ? 'bg-amber-600 hover:bg-amber-700' : ''}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                {hasDiscrepancies ? 'Submit with Discrepancies' : 'Submit Inventory'}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export default function QPAccountingPage() {
  const { examCenter, isLoading: userLoading } = useUserInfo();

  const [records, setRecords] = useState<QPInventoryRecord[]>([]);
  const [stats, setStats] = useState<QPInventoryStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedSession, setSelectedSession] = useState<string>('');
  const [hasData, setHasData] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const fetchInventory = useCallback(async () => {
    setLoading(true);
    try {
      const dateObj = new Date(selectedDate);
      const result = await getQPInventory(dateObj, selectedSession || undefined);

      if (result.success && result.data) {
        setRecords(result.data);
        setStats(result.stats || null);
        setHasData(result.data.length > 0);

        if (result.data.length === 0) {
          toast.info('No inventory found for this date');
        } else {
          toast.success(`Loaded ${result.data.length} inventory records`);
        }
      } else {
        toast.error(result.error || 'Failed to fetch inventory');
      }
    } catch (error) {
      console.error('Failed to fetch inventory:', error);
      toast.error('Failed to fetch inventory data');
    } finally {
      setLoading(false);
    }
  }, [selectedDate, selectedSession]);

  useEffect(() => {
    fetchInventory();
  }, [fetchInventory]);

  const handleUpdate = (index: number, field: keyof QPInventoryRecord, value: number) => {
    const updatedRecords = [...records];
    updatedRecords[index] = {
      ...updatedRecords[index],
      [field]: value,
    };

    // Auto-calculate QP per packet if received packets change
    if (field === 'receivedPackets') {
      updatedRecords[index].receivedQps = value * 50;
      updatedRecords[index].qpPerPacket = value * 50;
    }

    // Update status flags
    updatedRecords[index].isComplete =
      updatedRecords[index].receivedPackets >= updatedRecords[index].expectedPackets;
    updatedRecords[index].hasDiscrepancy =
      updatedRecords[index].expectedPackets !== updatedRecords[index].receivedPackets;

    setRecords(updatedRecords);
  };

  const handleSubmit = async () => {
    setShowConfirmDialog(true);
  };

  const handleConfirmSubmit = async () => {
    setSubmitting(true);
    setShowConfirmDialog(false);

    try {
      const updateData = {
        date: new Date(selectedDate),
        records: records.map((r) => ({
          id: r.id,
          receivedPackets: r.receivedPackets,
          qpPerPacket: r.qpPerPacket,
        })),
      };

      const result = await bulkUpdateQPInventory(updateData);

      if (result.success) {
        toast.success('Inventory data submitted successfully!');
        await fetchInventory();
      } else {
        const errorMessage = Array.isArray(result.error)
          ? result.error.map((issue) => issue.message).join(', ')
          : result.error || 'Failed to submit inventory';

        toast.error(errorMessage);
      }
    } catch (error) {
      console.error('Failed to submit inventory:', error);
      toast.error('Failed to submit inventory data');
    } finally {
      setSubmitting(false);
    }
  };

  const handleExport = () => {
    if (records.length === 0) {
      toast.error('No data to export');
      return;
    }

    const headers = [
      'Date',
      'Session',
      'Subject Code',
      'Subject Name',
      'Scheme',
      'Expected Students',
      'Expected Packets',
      'Received Packets',
      'QP Per Packet',
      'Status',
    ];
    const rows = records.map((r) => [
      format(new Date(r.date), 'dd/MM/yyyy'),
      r.session,
      r.subjectCode,
      r.subjectName,
      r.scheme,
      r.expectedStudents,
      r.expectedPackets,
      r.receivedPackets,
      r.qpPerPacket || 0,
      r.isComplete ? 'Complete' : r.hasDiscrepancy ? 'Discrepancy' : 'Pending',
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${cell ?? ''}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `qp-inventory-${selectedDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    toast.success('Export started');
  };

  const handleRefresh = () => {
    fetchInventory();
    toast.success('Refreshed');
  };

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const dateObj = new Date(selectedDate);
      const result = await generateQPInventoryFromTimetable(dateObj, selectedSession || undefined);

      if (result.success) {
        toast.success(`Generated ${result.data?.length || 0} inventory records`);
        await fetchInventory();
      } else {
        toast.error(result.error || 'Failed to generate inventory');
      }
    } catch (error) {
      console.error('Failed to generate inventory:', error);
      toast.error('Failed to generate inventory');
    } finally {
      setLoading(false);
    }
  };

  const discrepancies = records.filter((r) => r.expectedPackets !== r.receivedPackets);
  const hasDiscrepancies = discrepancies.length > 0;

  const toolbarActions = [
    {
      id: 'refresh',
      label: 'Refresh',
      icon: <RefreshCw className="h-3.5 w-3.5" />,
      onClick: handleRefresh,
      variant: 'outline' as const,
    },
    {
      id: 'generate',
      label: 'Generate',
      icon: <Package className="h-3.5 w-3.5" />,
      onClick: handleGenerate,
      variant: 'outline' as const,
    },
    {
      id: 'export',
      label: 'Export',
      icon: <Download className="h-3.5 w-3.5" />,
      onClick: handleExport,
      variant: 'ghost' as const,
    },
    {
      id: 'print',
      label: 'Print',
      icon: <Printer className="h-3.5 w-3.5" />,
      onClick: () => window.print(),
      variant: 'ghost' as const,
    },
  ];

  if (userLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="QP Accounting"
        description="Manage question paper inventory for examination sessions"
        icon={Calculator}
        actions={
          <div className="flex items-center gap-2">
            {hasData && (
              <div className="flex items-center gap-2">
                {hasDiscrepancies && (
                  <Badge
                    variant="destructive"
                    className="bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400"
                  >
                    {discrepancies.length} Discrepancies
                  </Badge>
                )}
                {!hasDiscrepancies && records.length > 0 && (
                  <Badge
                    variant="default"
                    className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400"
                  >
                    All Matched
                  </Badge>
                )}
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedDate(format(new Date(), 'yyyy-MM-dd'))}
              className="h-8 gap-1.5 text-xs"
            >
              <Calendar className="h-3.5 w-3.5" />
              Today
            </Button>
          </div>
        }
      />

      <MSBTEContextBar
        season={examCenter?.season as 'Summer' | 'Winter'}
        year={examCenter?.examYear || new Date().getFullYear()}
        compact
      />

      {/* Date and Session Selector */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-end sm:gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium tracking-wide text-neutral-500 uppercase">
                  Examination Date
                </Label>
                <Input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="h-9 w-48"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium tracking-wide text-neutral-500 uppercase">
                  Session
                </Label>
                <select
                  value={selectedSession}
                  onChange={(e) => setSelectedSession(e.target.value)}
                  className="h-9 rounded-md border border-neutral-200 bg-white px-3 text-sm dark:border-neutral-800 dark:bg-neutral-950"
                >
                  <option value="">All Sessions</option>
                  <option value="Morning">Morning</option>
                  <option value="Afternoon">Afternoon</option>
                </select>
              </div>
              <Button
                onClick={fetchInventory}
                disabled={loading}
                className="h-9 gap-1.5"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Package className="h-4 w-4" />
                )}
                {loading ? 'Loading...' : 'Fetch Inventory'}
              </Button>
            </div>

            {hasData && (
              <div className="flex items-center gap-2">
                <Button
                  onClick={handleSubmit}
                  disabled={loading || submitting || records.length === 0}
                  className="h-9 gap-1.5"
                >
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  {submitting ? 'Saving...' : 'Submit Inventory'}
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <StatsCards
        stats={stats}
        isLoading={loading}
      />

      {/* Toolbar */}
      <PageToolbar
        actions={toolbarActions}
        searchValue=""
        onSearchChange={() => {}}
        searchPlaceholder=""
      />

      {/* Inventory Table */}
      <QPInventoryTable
        records={records}
        isLoading={loading}
        onUpdate={handleUpdate}
        readOnly={!hasData}
      />

      {/* Confirmation Dialog */}
      <ConfirmDialog
        open={showConfirmDialog}
        onOpenChange={setShowConfirmDialog}
        onConfirm={handleConfirmSubmit}
        discrepancies={records
          .filter((r) => r.expectedPackets !== r.receivedPackets)
          .map((r) => ({
            subjectCode: r.subjectCode,
            expected: r.expectedPackets,
            received: r.receivedPackets,
          }))}
        isSubmitting={submitting}
      />

      {/* Footer */}
      {hasData && (
        <div className="border-t border-neutral-200 pt-4 dark:border-neutral-800">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-400">
            <span>
              {records.length} records • {records.filter((r) => r.isComplete).length} complete •{' '}
              {records.filter((r) => r.hasDiscrepancy).length} discrepancies
            </span>
            <span>Last updated: {format(new Date(), 'dd MMM yyyy, HH:mm:ss')}</span>
          </div>
        </div>
      )}
    </div>
  );
}
