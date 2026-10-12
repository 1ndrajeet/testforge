// modules/block-allocation/clear-session.tsx

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { format } from 'date-fns';
import { AlertTriangle, ChevronLeft, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { createClient } from '@/lib/supabase/client';

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

// ----------------------------------------------------------------------------

type Supabase = ReturnType<typeof createClient>;

type SpecificSession = 'Morning' | 'Afternoon';

const PAGE_LIMIT = 1000;

interface Allocation {
  id: string;
  blockId: string | null;
  blockNo: string;
  location: string;
  scheme: string;
  subjectCode: string;
  subjectName: string;
  assignedCount: number;
  supervisorName: string | null;
}

interface GroupedBlock {
  key: string;
  blockId: string | null;
  blockNo: string;
  location: string;
  subjects: Array<{
    id: string;
    scheme: string;
    subjectCode: string;
    subjectName: string;
    assignedCount: number;
  }>;
  supervisorName: string | null;
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

const toDateStr = (d: Date | string): string =>
  typeof d === 'string' ? d.split('T')[0] : d.toISOString().split('T')[0];

async function fetchUniqueDates(supabase: Supabase, examCenterId: string): Promise<Date[]> {
  const { data, error } = await supabase
    .from('timetable')
    .select('date')
    .eq('exam_center_id', examCenterId)
    .order('date');
  if (error) throw error;
  const seen = new Set<string>();
  const out: Date[] = [];
  for (const r of (data ?? []) as Array<{ date: string | null }>) {
    if (!r.date) continue;
    const iso = r.date.split('T')[0];
    if (seen.has(iso)) continue;
    seen.add(iso);
    out.push(new Date(r.date));
  }
  return out;
}

async function fetchAllocations(
  supabase: Supabase,
  examCenterId: string,
  date: string,
  session: SpecificSession,
): Promise<{ rows: Allocation[]; truncated: boolean }> {
  const out: Allocation[] = [];
  let truncated = false;

  for (let from = 0; ; from += PAGE_LIMIT) {
    const { data, error } = await supabase
      .from('block_allocations')
      .select(
        'id, block_id, block_no, location, scheme, subject_code, subject_name, assigned_count, supervisor_name',
      )
      .eq('exam_center_id', examCenterId)
      .eq('date', date)
      .eq('session', session)
      .order('block_no')
      .order('location')
      .range(from, from + PAGE_LIMIT - 1);
    if (error) throw error;

    const batch = (data ?? []) as Array<Record<string, unknown>>;
    for (const r of batch) {
      out.push({
        id: String(r.id),
        blockId: (r.block_id as string | null) ?? null,
        blockNo: (r.block_no as string | null) ?? '',
        location: (r.location as string | null) ?? '',
        scheme: String(r.scheme ?? ''),
        subjectCode: String(r.subject_code ?? ''),
        subjectName: String(r.subject_name ?? ''),
        assignedCount: Number(r.assigned_count ?? 0),
        supervisorName: (r.supervisor_name as string | null) ?? null,
      });
    }

    if (batch.length < PAGE_LIMIT) break;
    if (from + PAGE_LIMIT >= PAGE_LIMIT * 10) {
      // Hard cap at 10 pages; anything beyond is a data-integrity problem,
      // not a normal session. Report and stop.
      truncated = true;
      break;
    }
  }

  return { rows: out, truncated };
}

async function deleteAllocationsForSession(
  supabase: Supabase,
  examCenterId: string,
  date: string,
  session: SpecificSession,
): Promise<{ deleted: number; ids: string[] }> {
  const { data, error } = await supabase
    .from('block_allocations')
    .delete()
    .eq('exam_center_id', examCenterId)
    .eq('date', date)
    .eq('session', session)
    .select('id');

  if (error) throw error;
  const ids = (data ?? []).map((r: { id: string }) => r.id);
  return { deleted: ids.length, ids };
}

// ----------------------------------------------------------------------------
// Grouping — key on block_id first; falls back to a composite that
// cannot collide across locations.
// ----------------------------------------------------------------------------

function groupAllocationsByBlock(allocations: Allocation[]): GroupedBlock[] {
  const map = new Map<string, GroupedBlock>();

  for (const alloc of allocations) {
    const key = alloc.blockId
      ? `id:${alloc.blockId}`
      : alloc.location || alloc.blockNo
        ? `lo:${alloc.location}::${alloc.blockNo}`
        : `rec:${alloc.id}`;

    let entry = map.get(key);
    if (!entry) {
      entry = {
        key,
        blockId: alloc.blockId,
        blockNo: alloc.blockNo,
        location: alloc.location,
        subjects: [],
        supervisorName: alloc.supervisorName,
      };
      map.set(key, entry);
    }

    entry.subjects.push({
      id: alloc.id,
      scheme: alloc.scheme,
      subjectCode: alloc.subjectCode,
      subjectName: alloc.subjectName,
      assignedCount: alloc.assignedCount,
    });

    if (!entry.supervisorName && alloc.supervisorName) {
      entry.supervisorName = alloc.supervisorName;
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    const an = Number(a.blockNo);
    const bn = Number(b.blockNo);
    if (Number.isFinite(an) && Number.isFinite(bn) && an !== bn) return an - bn;
    if (a.blockNo !== b.blockNo) return a.blockNo.localeCompare(b.blockNo);
    return a.location.localeCompare(b.location);
  });
}

// ----------------------------------------------------------------------------

export default function ClearSessionPage() {
  const { examCenter, isLoading: userLoading } = useUserInfo();
  const examCenterId = examCenter?.id;

  const [step, setStep] = useState<'select' | 'preview'>('select');
  const [dates, setDates] = useState<Date[]>([]);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedSession, setSelectedSession] = useState<SpecificSession | ''>('');
  const [groupedBlocks, setGroupedBlocks] = useState<GroupedBlock[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const requestIdRef = useRef(0);

  const sessions = useMemo(() => ['Morning', 'Afternoon'], []);

  // ── Metadata ──
  useEffect(() => {
    if (!examCenterId) return;
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const d = await fetchUniqueDates(supabase, examCenterId);
        if (!cancelled) setDates(d);
      } catch (err) {
        if (!cancelled) {
          setMetaError(err instanceof Error ? err.message : 'Failed to load dates');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [examCenterId]);

  // ── Load ──
  const loadAllocations = useCallback(
    async (date: string, session: SpecificSession) => {
      if (!examCenterId) return;
      const requestId = ++requestIdRef.current;
      setLoading(true);
      setTruncated(false);
      try {
        const supabase = createClient();
        const { rows, truncated: tr } = await fetchAllocations(
          supabase,
          examCenterId,
          date,
          session,
        );
        if (requestId !== requestIdRef.current) return;
        setTruncated(tr);
        setGroupedBlocks(groupAllocationsByBlock(rows));
      } catch (err) {
        if (requestId !== requestIdRef.current) return;
        toast.error(err instanceof Error ? err.message : 'Failed to load allocations');
        setGroupedBlocks([]);
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    },
    [examCenterId],
  );

  const handleSessionSelect = useCallback(
    async (selection: { date: string; session: 'Morning' | 'Afternoon' | 'All' }) => {
      if (selection.session !== 'Morning' && selection.session !== 'Afternoon') {
        toast.error('Choose Morning or Afternoon. "All sessions" is not supported here.');
        return;
      }
      setSelectedDate(selection.date);
      setSelectedSession(selection.session);
      setGroupedBlocks([]);
      setStep('preview');
      await loadAllocations(selection.date, selection.session);
    },
    [loadAllocations],
  );

  // ── Delete ──
  const handleClearSession = useCallback(async () => {
    if (!examCenterId || deleting) return;
    if (selectedSession !== 'Morning' && selectedSession !== 'Afternoon') {
      toast.error('Select Morning or Afternoon before clearing.');
      return;
    }
    if (groupedBlocks.length === 0) {
      toast.error('Nothing to clear.');
      return;
    }

    setDeleting(true);
    try {
      const supabase = createClient();
      const { deleted } = await deleteAllocationsForSession(
        supabase,
        examCenterId,
        selectedDate,
        selectedSession,
      );

      if (deleted === 0) {
        toast.info('No allocations were deleted for this session.');
      } else {
        toast.success(
          `Cleared ${deleted} allocation${deleted === 1 ? '' : 's'} for ${format(
            new Date(selectedDate),
            'dd MMM yyyy',
          )} · ${selectedSession}`,
        );
      }

      setDialogOpen(false);
      setGroupedBlocks([]);
      setStep('select');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to clear allocations');
    } finally {
      setDeleting(false);
    }
  }, [examCenterId, deleting, groupedBlocks.length, selectedDate, selectedSession]);

  // ── Derived totals ──
  const totalStudents = useMemo(
    () =>
      groupedBlocks.reduce(
        (sum, b) => sum + b.subjects.reduce((s, x) => s + x.assignedCount, 0),
        0,
      ),
    [groupedBlocks],
  );
  const totalSubjects = useMemo(
    () => groupedBlocks.reduce((sum, b) => sum + b.subjects.length, 0),
    [groupedBlocks],
  );

  const canDelete =
    !loading &&
    !deleting &&
    groupedBlocks.length > 0 &&
    (selectedSession === 'Morning' || selectedSession === 'Afternoon');

  // ── Render ──
  if (userLoading || !examCenterId) {
    return (
      <div className="mx-auto max-w-[1400px] space-y-5 px-6 py-5">
        <PageHeader
          title="Clear Session"
          description="Loading..."
          icon={Trash2}
        />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (step === 'select') {
    return (
      <div className="mx-auto max-w-[1400px] space-y-5 px-6 py-5">
        <PageHeader
          title="Clear Session"
          description="Select examination date and session to clear all block allocations"
          icon={Trash2}
        />
        {metaError && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{metaError}</AlertDescription>
          </Alert>
        )}
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clear Session"
        description={`${selectedDate ? format(new Date(selectedDate), 'dd MMM yyyy') : ''} · ${selectedSession}`}
        icon={Trash2}
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setStep('select')}
            className="gap-1.5"
            disabled={deleting}
          >
            <ChevronLeft className="h-4 w-4" />
            Change Session
          </Button>
        }
      />

      <MSBTEContextBar
        season={examCenter?.season as 'Summer' | 'Winter'}
        year={examCenter?.examYear ?? new Date().getFullYear()}
      />

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

      {truncated && (
        <Alert
          variant="default"
          className="border-amber-300 bg-amber-50 dark:bg-amber-950/20"
        >
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-sm text-amber-800 dark:text-amber-300">
            The preview could not load every allocation. The delete action removes every allocation
            for this date and session regardless of what is shown.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
          <p className="text-2xl font-semibold text-neutral-900 tabular-nums dark:text-neutral-50">
            {groupedBlocks.length}
          </p>
          <p className="text-xs text-neutral-500">Blocks</p>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
          <p className="text-2xl font-semibold text-neutral-900 tabular-nums dark:text-neutral-50">
            {totalSubjects}
          </p>
          <p className="text-xs text-neutral-500">Subjects</p>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
          <p className="text-2xl font-semibold text-neutral-900 tabular-nums dark:text-neutral-50">
            {totalStudents}
          </p>
          <p className="text-xs text-neutral-500">Students</p>
        </div>
      </div>

      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs text-neutral-500">
          {groupedBlocks.length} block{groupedBlocks.length !== 1 ? 's' : ''} to be cleared
        </p>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => setDialogOpen(true)}
          disabled={!canDelete}
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
                    Block
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
                {groupedBlocks.map((block) => (
                  <TableRow
                    key={block.key}
                    className="hover:bg-neutral-50 dark:hover:bg-neutral-900"
                  >
                    <TableCell className="px-4 py-3 text-center font-mono text-sm">
                      <Badge
                        variant="secondary"
                        className="text-xs"
                      >
                        {block.blockNo || '—'}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-4 py-3 font-mono text-sm">
                      {block.location || '—'}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <div className="space-y-1">
                        {block.subjects.map((sub) => (
                          <div
                            key={sub.id}
                            className="text-sm"
                          >
                            <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs dark:bg-neutral-800">
                              {sub.subjectCode}
                            </code>
                            <span className="mx-1">-</span>
                            <span>{sub.subjectName}</span>
                            <span className="text-muted-foreground ml-2 text-xs tabular-nums">
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

      <Dialog
        open={dialogOpen}
        onOpenChange={(o) => !deleting && setDialogOpen(o)}
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
              <ul className="mt-2 space-y-1 text-sm text-red-700 tabular-nums dark:text-red-400">
                <li>• {groupedBlocks.length} block(s)</li>
                <li>• {totalSubjects} subject(s)</li>
                <li>• {totalStudents} student(s)</li>
              </ul>
              <p className="mt-3 text-sm font-medium text-red-800 dark:text-red-300">
                Session: {selectedDate ? format(new Date(selectedDate), 'dd MMM yyyy') : ''} ·{' '}
                {selectedSession}
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
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleClearSession}
              disabled={deleting}
            >
              {deleting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" />
              )}
              Yes, Clear All {groupedBlocks.length} Block(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
