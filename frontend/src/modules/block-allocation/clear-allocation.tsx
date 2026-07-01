// modules/block-allocation/clear-session.tsx
'use client';

import { useCallback, useEffect, useState } from 'react';

import { format } from 'date-fns';
import { AlertTriangle, ChevronLeft, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import {
  clearAllocationsForSession,
  getAllocations,
  getUniqueDates,
  getUniqueSessions,
} from '@/lib/actions/allocation';

import { useUserInfo } from '@/hooks/useUserInfo';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { PageEmpty, PageHeader } from '@/components/layout/page-layout';

import { SessionSelector } from '@/components/shared/date-selector';

interface Allocation {
  id: string;
  date: Date;
  session: string;
  blockNo: string;
  location: string;
  scheme: string;
  subjectCode: string;
  subjectName: string;
  assignedCount: number;
  supervisorUid: string | null;
  supervisorName: string | null;
}

interface GroupedBlock {
  blockNo: string;
  location: string;
  subjects: Array<{
    id: string;
    scheme: string;
    subjectCode: string;
    subjectName: string;
    assignedCount: number;
  }>;
  supervisorUid: string | null;
  supervisorName: string | null;
}

export default function ClearSessionPage() {
  const { examCenter } = useUserInfo();

  const [step, setStep] = useState<'select' | 'preview'>('select');
  const [dates, setDates] = useState<Date[]>([]);
  const [sessions, setSessions] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedSession, setSelectedSession] = useState('');
  const [groupedBlocks, setGroupedBlocks] = useState<GroupedBlock[]>([]);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    const fetchMeta = async () => {
      const [d, s] = await Promise.all([getUniqueDates(), getUniqueSessions()]);
      if (d.success && d.data) setDates(d.data);
      if (s.success && s.data) setSessions(s.data);
    };
    fetchMeta();
  }, []);

  const groupAllocationsByBlock = useCallback((allocations: Allocation[]): GroupedBlock[] => {
    const blockMap = new Map<string, GroupedBlock>();

    for (const alloc of allocations) {
      const key = alloc.blockNo;

      if (!blockMap.has(key)) {
        blockMap.set(key, {
          blockNo: alloc.blockNo,
          location: alloc.location,
          subjects: [],
          supervisorUid: alloc.supervisorUid,
          supervisorName: alloc.supervisorName,
        });
      }

      const block = blockMap.get(key)!;
      block.subjects.push({
        id: alloc.id,
        scheme: alloc.scheme,
        subjectCode: alloc.subjectCode,
        subjectName: alloc.subjectName,
        assignedCount: alloc.assignedCount,
      });
    }

    return Array.from(blockMap.values());
  }, []);

  const loadAllocations = useCallback(
    async (date: string, session: string) => {
      setLoading(true);
      try {
        const res = await getAllocations({ date: new Date(date), session });
        if (res.success && res.data) {
          const allocations = res.data as unknown as Allocation[];
          const grouped = groupAllocationsByBlock(allocations);
          setGroupedBlocks(grouped);
        } else {
          toast.error('Failed to load allocations');
        }
      } catch {
        toast.error('Failed to load allocations');
      } finally {
        setLoading(false);
      }
    },
    [groupAllocationsByBlock],
  );

  const handleSessionSelect = async (session: {
    date: string;
    session: 'Morning' | 'Afternoon' | 'All';
  }) => {
    setSelectedDate(session.date);
    setSelectedSession(session.session);
    await loadAllocations(session.date, session.session);
    setStep('preview');
  };

  const handleClearSession = async () => {
    setDeleting(true);
    try {
      const res = await clearAllocationsForSession(new Date(selectedDate), selectedSession);
      if (res.success) {
        toast.success(
          `Cleared ${res.data?.length || 0} allocation(s) for ${format(new Date(selectedDate), 'dd MMM yyyy')} · ${selectedSession}`,
        );
        setStep('select');
        setDialogOpen(false);
        setGroupedBlocks([]);
      } else {
        toast.error('Failed to clear allocations');
      }
    } catch {
      toast.error('Failed to clear allocations');
    } finally {
      setDeleting(false);
    }
  };

  if (step === 'select') {
    return (
      <div className="mx-auto max-w-[1400px] space-y-5 px-6 py-5">
        <PageHeader
          title="Clear Session"
          description="Select examination date and session to clear all block allocations"
          icon={Trash2}
        />
        <SessionSelector
          availableDates={dates}
          availableSessions={sessions}
          onSessionSelect={handleSessionSelect}
          compact
          isLoading={loading}
          title="Select Session to Clear"
          description="Choose a date and session to remove all block allocations"
        />
      </div>
    );
  }

  const totalStudents = groupedBlocks.reduce(
    (sum, block) => sum + block.subjects.reduce((s, sub) => s + sub.assignedCount, 0),
    0,
  );
  const totalSubjects = groupedBlocks.reduce((sum, block) => sum + block.subjects.length, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clear Session"
        description={`${format(new Date(selectedDate), 'dd MMM yyyy')} · ${selectedSession}`}
        icon={Trash2}
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setStep('select')}
            className="gap-1.5"
          >
            <ChevronLeft className="h-4 w-4" />
            Change Session
          </Button>
        }
      />

      <MSBTEContextBar
        season={examCenter?.season as 'Summer' | 'Winter'}
        year={examCenter?.examYear!}
      />

      {/* Warning Alert */}
      <Alert
        variant="destructive"
        className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30"
      >
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription className="text-sm">
          This action will permanently delete all block allocations for this session. This cannot be
          undone.
        </AlertDescription>
      </Alert>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
          <p className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
            {groupedBlocks.length}
          </p>
          <p className="text-xs text-neutral-500">Blocks</p>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
          <p className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
            {totalSubjects}
          </p>
          <p className="text-xs text-neutral-500">Subjects</p>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
          <p className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
            {totalStudents}
          </p>
          <p className="text-xs text-neutral-500">Students</p>
        </div>
      </div>

      {/* Data Table */}
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs text-neutral-500">
          {groupedBlocks.length} block{groupedBlocks.length !== 1 ? 's' : ''} to be cleared
        </p>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => setDialogOpen(true)}
          className="gap-1.5"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Clear All Blocks
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : groupedBlocks.length === 0 ? (
        <PageEmpty
          title="No allocations found"
          description="No blocks allocated for this date and session."
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-neutral-50 dark:bg-neutral-900">
                <TableRow>
                  <TableHead className="w-20 text-xs font-medium tracking-wide uppercase">
                    Block No
                  </TableHead>
                  <TableHead className="w-28 text-xs font-medium tracking-wide uppercase">
                    Location
                  </TableHead>
                  <TableHead className="text-xs font-medium tracking-wide uppercase">
                    Subjects
                  </TableHead>
                  <TableHead className="w-48 text-xs font-medium tracking-wide uppercase">
                    Supervisor
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groupedBlocks.map((block, idx) => (
                  <TableRow
                    key={block.blockNo}
                    className="hover:bg-neutral-50 dark:hover:bg-neutral-900"
                  >
                    <TableCell className="px-4 py-3 text-center font-mono text-sm">
                      <Badge
                        variant="secondary"
                        className="text-xs"
                      >
                        {idx + 1}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-4 py-3 font-mono text-sm">{block.location}</TableCell>
                    <TableCell className="px-4 py-3">
                      <div className="space-y-1">
                        {block.subjects.map((sub, subIdx) => (
                          <div
                            key={subIdx}
                            className="text-sm"
                          >
                            <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs dark:bg-neutral-800">
                              {sub.subjectCode}
                            </code>
                            <span className="mx-1">-</span>
                            <span>{sub.subjectName}</span>
                            <span className="text-muted-foreground ml-2 text-xs">
                              ({sub.assignedCount} students)
                            </span>
                          </div>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      {block.supervisorName ? (
                        <span className="text-sm font-medium">{block.supervisorName}</span>
                      ) : (
                        <Badge
                          variant="outline"
                          className="border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400"
                        >
                          Not Assigned
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Confirmation Dialog */}
      <Dialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              Clear All Allocations?
            </DialogTitle>
            <DialogDescription>This action cannot be undone.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="rounded-lg bg-red-50 p-4 dark:bg-red-950/20">
              <p className="text-sm font-medium text-red-800 dark:text-red-300">
                You are about to clear:
              </p>
              <ul className="mt-2 space-y-1 text-sm text-red-700 dark:text-red-400">
                <li>• {groupedBlocks.length} block(s)</li>
                <li>• {totalSubjects} subject(s)</li>
                <li>• {totalStudents} student(s)</li>
              </ul>
              <p className="mt-3 text-sm font-medium text-red-800 dark:text-red-300">
                Session: {format(new Date(selectedDate), 'dd MMM yyyy')} · {selectedSession}
              </p>
            </div>

            <div className="bg-muted rounded-lg p-3">
              <p className="text-muted-foreground text-xs">
                This will permanently delete all block allocations for this session. You will need
                to re-allocate blocks if you clear them by mistake.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleClearSession}
              disabled={deleting}
            >
              {deleting && (
                <span className="mr-2 h-4 w-4 animate-spin">
                  <Loader2 />
                </span>
              )}
              Yes, Clear All {groupedBlocks.length} Block(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
