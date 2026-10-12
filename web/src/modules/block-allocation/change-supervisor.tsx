// modules/block-allocation/change-supervisor.tsx

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { format } from 'date-fns';
import { AlertTriangle, ChevronLeft, Loader2, RefreshCw, UserCog } from 'lucide-react';
import { toast } from 'sonner';

import { createClient } from '@/lib/supabase/client';

import { useUserInfo } from '@/hooks/useUserInfo';

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
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  supervisorUid: string | null;
  supervisorName: string | null;
}

interface Supervisor {
  uid: string;
  name: string;
  department: string;
}

interface BlockSubject {
  id: string;
  scheme: string;
  subjectCode: string;
  subjectName: string;
  assignedCount: number;
  supervisorUid: string | null;
  supervisorName: string | null;
}

interface GroupedBlock {
  key: string;
  blockId: string | null;
  blockNo: string;
  location: string;
  subjects: BlockSubject[];
  supervisorUids: string[];
  supervisorLabel: string;
  isMixed: boolean;
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

const toDateStr = (d: Date | string): string =>
  typeof d === 'string' ? d.split('T')[0] : d.toISOString().split('T')[0];

async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE_LIMIT) {
    const { data, error } = await build(from, from + PAGE_LIMIT - 1);
    if (error) throw error;
    const batch = data ?? [];
    out.push(...batch);
    if (batch.length < PAGE_LIMIT) break;
  }
  return out;
}

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

async function fetchSupervisors(supabase: Supabase, examCenterId: string): Promise<Supervisor[]> {
  const { data, error } = await supabase
    .from('staff')
    .select('uid, name, department')
    .eq('exam_center_id', examCenterId)
    .eq('is_deleted', false)
    .eq('staff_type', 'SUPERVISOR')
    .order('name');
  if (error) throw error;
  return (data ?? []).map((s: any) => ({
    uid: String(s.uid),
    name: String(s.name ?? ''),
    department: String(s.department ?? ''),
  }));
}

async function fetchAllocations(
  supabase: Supabase,
  examCenterId: string,
  date: string,
  session: SpecificSession,
): Promise<Allocation[]> {
  const rows = await fetchAll<{
    id: string;
    block_id: string | null;
    block_no: string | null;
    location: string | null;
    scheme: string | null;
    subject_code: string | null;
    subject_name: string | null;
    assigned_count: number | null;
    supervisor_uid: string | null;
    supervisor_name: string | null;
  }>((from, to) =>
    supabase
      .from('block_allocations')
      .select(
        'id, block_id, block_no, location, scheme, subject_code, subject_name, assigned_count, supervisor_uid, supervisor_name',
      )
      .eq('exam_center_id', examCenterId)
      .eq('date', date)
      .eq('session', session)
      .order('block_no')
      .order('location')
      .range(from, to),
  );

  return rows.map((r) => ({
    id: r.id,
    blockId: r.block_id ?? null,
    blockNo: r.block_no ?? '',
    location: r.location ?? '',
    scheme: r.scheme ?? '',
    subjectCode: r.subject_code ?? '',
    subjectName: r.subject_name ?? '',
    assignedCount: Number(r.assigned_count ?? 0),
    supervisorUid: r.supervisor_uid ?? null,
    supervisorName: r.supervisor_name ?? null,
  }));
}

async function updateAllocationSupervisor(
  supabase: Supabase,
  examCenterId: string,
  allocationId: string,
  supervisorUid: string,
  supervisorName: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from('block_allocations')
    .update({
      supervisor_uid: supervisorUid,
      supervisor_name: supervisorName,
      updated_at: new Date().toISOString(),
    })
    .eq('id', allocationId)
    .eq('exam_center_id', examCenterId)
    .select('id')
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'Allocation not found or not authorized' };
  return { ok: true };
}

// ----------------------------------------------------------------------------
// Grouping
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
        supervisorUids: [],
        supervisorLabel: '',
        isMixed: false,
      };
      map.set(key, entry);
    }

    entry.subjects.push({
      id: alloc.id,
      scheme: alloc.scheme,
      subjectCode: alloc.subjectCode,
      subjectName: alloc.subjectName,
      assignedCount: alloc.assignedCount,
      supervisorUid: alloc.supervisorUid,
      supervisorName: alloc.supervisorName,
    });
  }

  for (const entry of map.values()) {
    const uids = new Set<string>();
    let sawUnassigned = false;
    for (const sub of entry.subjects) {
      if (sub.supervisorUid) uids.add(sub.supervisorUid);
      else sawUnassigned = true;
    }
    entry.supervisorUids = Array.from(uids);

    if (uids.size === 0 && sawUnassigned) {
      entry.supervisorLabel = 'Not Assigned';
      entry.isMixed = false;
    } else if (uids.size === 1 && !sawUnassigned) {
      const onlyUid = entry.supervisorUids[0];
      const name = entry.subjects.find((s) => s.supervisorUid === onlyUid)?.supervisorName;
      entry.supervisorLabel = name || onlyUid;
      entry.isMixed = false;
    } else {
      entry.supervisorLabel = 'Mixed';
      entry.isMixed = true;
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

export default function ChangeSupervisorPage() {
  const { examCenter, isLoading: userLoading } = useUserInfo();
  const examCenterId = examCenter?.id;

  const [step, setStep] = useState<'select' | 'allocate'>('select');
  const [dates, setDates] = useState<Date[]>([]);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedSession, setSelectedSession] = useState<SpecificSession | ''>('');
  const [groupedBlocks, setGroupedBlocks] = useState<GroupedBlock[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [selectedBlockKey, setSelectedBlockKey] = useState<string | null>(null);
  const [supervisors, setSupervisors] = useState<Supervisor[]>([]);
  const [supervisorsError, setSupervisorsError] = useState<string | null>(null);
  const [selectedSupervisor, setSelectedSupervisor] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const requestIdRef = useRef(0);

  const selectedBlock = useMemo(
    () => groupedBlocks.find((b) => b.key === selectedBlockKey) ?? null,
    [groupedBlocks, selectedBlockKey],
  );

  const sessions = useMemo(() => ['Morning', 'Afternoon'], []);

  // ── Metadata ──
  useEffect(() => {
    if (!examCenterId) return;
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const [d, s, sup] = await Promise.all([
          fetchUniqueDates(supabase, examCenterId),
          Promise.resolve(['Morning', 'Afternoon']),
          fetchSupervisors(supabase, examCenterId).catch((err) => {
            if (!cancelled)
              setSupervisorsError(
                err instanceof Error ? err.message : 'Failed to load supervisors',
              );
            return [] as Supervisor[];
          }),
        ]);
        if (cancelled) return;
        setDates(d);
        setSupervisors(sup);
      } catch (err) {
        if (!cancelled)
          setMetaError(err instanceof Error ? err.message : 'Failed to load metadata');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [examCenterId]);

  // ── Load allocations ──
  const loadAllocations = useCallback(
    async (date: string, session: SpecificSession): Promise<boolean> => {
      if (!examCenterId) return false;
      const requestId = ++requestIdRef.current;
      setLoading(true);
      setTruncated(false);
      try {
        const supabase = createClient();
        const rows = await fetchAllocations(supabase, examCenterId, date, session);
        if (requestId !== requestIdRef.current) return false;
        if (rows.length >= PAGE_LIMIT) setTruncated(true);
        setGroupedBlocks(groupAllocationsByBlock(rows));
        return true;
      } catch (err) {
        if (requestId !== requestIdRef.current) return false;
        toast.error(err instanceof Error ? err.message : 'Failed to load allocations');
        setGroupedBlocks([]);
        return false;
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
      setSelectedBlockKey(null);
      setSelectedSupervisor('');
      const ok = await loadAllocations(selection.date, selection.session);
      if (ok) setStep('allocate');
    },
    [loadAllocations],
  );

  const handleRefresh = useCallback(async () => {
    if (selectedSession !== 'Morning' && selectedSession !== 'Afternoon') return;
    setDialogOpen(false);
    setSelectedBlockKey(null);
    setSelectedSupervisor('');
    await loadAllocations(selectedDate, selectedSession);
  }, [loadAllocations, selectedDate, selectedSession]);

  // ── Reassignment ──
  const handleChangeSupervisor = useCallback(async () => {
    if (!examCenterId || submitting) return;
    if (!selectedBlock || !selectedSupervisor) {
      toast.error('Select a supervisor before submitting.');
      return;
    }

    const sup = supervisors.find((s) => s.uid === selectedSupervisor);
    if (!sup) {
      toast.error('Selected supervisor is not valid for this exam center.');
      return;
    }

    const targets = selectedBlock.subjects.filter(
      (sub) => sub.supervisorUid !== selectedSupervisor,
    );
    if (targets.length === 0) {
      toast.info('All subjects in this block already have this supervisor.');
      return;
    }

    setSubmitting(true);
    const succeeded: string[] = [];
    const failed: Array<{ subject: BlockSubject; error: string }> = [];

    try {
      const supabase = createClient();
      for (const sub of targets) {
        const result = await updateAllocationSupervisor(
          supabase,
          examCenterId,
          sub.id,
          sup.uid,
          sup.name,
        );
        if (result.ok) {
          succeeded.push(sub.subjectCode || sub.id);
        } else {
          failed.push({ subject: sub, error: result.error });
        }
      }

      if (failed.length === 0) {
        toast.success(
          `Updated ${succeeded.length} subject${succeeded.length === 1 ? '' : 's'} in Block ${selectedBlock.blockNo || selectedBlock.location}.`,
        );
      } else if (succeeded.length === 0) {
        toast.error(
          `Could not update any subject in Block ${selectedBlock.blockNo || selectedBlock.location}. ${failed[0].error}`,
        );
      } else {
        const names = failed.map((f) => f.subject.subjectCode || f.subject.id).join(', ');
        toast.error(
          `Updated ${succeeded.length} of ${targets.length}. Failed: ${names}. Refresh and retry.`,
        );
      }

      setDialogOpen(false);
      setSelectedBlockKey(null);
      setSelectedSupervisor('');
      await loadAllocations(selectedDate, selectedSession as SpecificSession);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to change supervisor');
    } finally {
      setSubmitting(false);
    }
  }, [
    examCenterId,
    submitting,
    selectedBlock,
    selectedSupervisor,
    supervisors,
    selectedDate,
    selectedSession,
    loadAllocations,
  ]);

  // ── Render ──
  if (userLoading || !examCenterId) {
    return (
      <div className="mx-auto max-w-[1400px] space-y-5 px-6 py-5">
        <PageHeader
          title="Change Supervisor"
          description="Loading..."
          icon={UserCog}
        />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (step === 'select') {
    return (
      <div className="mx-auto max-w-[1400px] space-y-5 px-6 py-5">
        <PageHeader
          title="Change Supervisor"
          description="Select examination date and session"
          icon={UserCog}
        />
        {metaError && (
          <div
            role="alert"
            className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/20 dark:text-red-300"
          >
            {metaError}
          </div>
        )}
        <SessionSelector
          availableDates={dates}
          availableSessions={sessions}
          onSessionSelect={handleSessionSelect}
          compact
          isLoading={loading}
          title="Select Examination Session"
          description="Choose a date and session to modify supervisor assignments"
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Change Supervisor"
        description={`${selectedDate ? format(new Date(selectedDate), 'dd MMM yyyy') : ''} · ${selectedSession}`}
        icon={UserCog}
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setStep('select')}
            className="gap-1.5"
            disabled={submitting}
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

      {supervisorsError && (
        <div
          role="alert"
          className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-300"
        >
          Could not load supervisors: {supervisorsError}. Reassignment is disabled until this is
          resolved.
        </div>
      )}

      {truncated && (
        <div
          role="alert"
          className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-300"
        >
          The preview shows the first {PAGE_LIMIT} allocations. Some blocks may not be listed.
        </div>
      )}

      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs text-neutral-500 tabular-nums">
          {groupedBlocks.length} block{groupedBlocks.length !== 1 ? 's' : ''}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={loading || submitting}
          className="h-7 gap-1 text-xs"
        >
          <RefreshCw
            className={`h-3 w-3 ${loading ? 'animate-spin motion-reduce:animate-none' : ''}`}
          />
          Refresh
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
                  <TableHead className="w-56 text-xs font-medium tracking-wide uppercase">
                    Current Supervisor
                  </TableHead>
                  <TableHead className="w-24 text-xs font-medium tracking-wide uppercase" />
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
                      {block.isMixed ? (
                        <Badge
                          variant="outline"
                          className="border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300"
                        >
                          Mixed supervisors
                        </Badge>
                      ) : block.supervisorLabel === 'Not Assigned' ? (
                        <Badge
                          variant="outline"
                          className="border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400"
                        >
                          Not Assigned
                        </Badge>
                      ) : (
                        <span className="text-sm font-medium">{block.supervisorLabel}</span>
                      )}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedBlockKey(block.key);
                          setSelectedSupervisor(block.supervisorUids[0] ?? '');
                          setDialogOpen(true);
                        }}
                        disabled={submitting || !!supervisorsError}
                        className="gap-1.5"
                      >
                        <UserCog className="h-3.5 w-3.5" />
                        Change
                      </Button>
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
        onOpenChange={(next) => {
          if (submitting) return;
          setDialogOpen(next);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Change Supervisor</DialogTitle>
            <DialogDescription>
              Block {selectedBlock?.blockNo || '—'} · {selectedBlock?.location || '—'}
            </DialogDescription>
          </DialogHeader>

          {selectedBlock && (
            <div className="space-y-4 py-4">
              <div className="bg-muted rounded-lg p-3">
                <p className="text-muted-foreground text-xs">Current supervisor</p>
                {selectedBlock.isMixed ? (
                  <ul className="mt-1 space-y-0.5 text-sm">
                    {selectedBlock.subjects.map((s) => (
                      <li
                        key={s.id}
                        className="flex items-center justify-between gap-2"
                      >
                        <code className="font-mono text-xs">{s.subjectCode}</code>
                        <span>{s.supervisorName || 'Not Assigned'}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 font-medium">{selectedBlock.supervisorLabel}</p>
                )}
                <p className="text-muted-foreground mt-2 text-xs">
                  Changing will update {selectedBlock.subjects.length} subject
                  {selectedBlock.subjects.length === 1 ? '' : 's'} in this block.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="supervisor-select">New supervisor</Label>
                <Select
                  value={selectedSupervisor}
                  onValueChange={setSelectedSupervisor}
                  disabled={submitting || supervisors.length === 0}
                >
                  <SelectTrigger id="supervisor-select">
                    <SelectValue placeholder="Select a supervisor" />
                  </SelectTrigger>
                  <SelectContent>
                    {supervisors.map((s) => (
                      <SelectItem
                        key={s.uid}
                        value={s.uid}
                      >
                        {s.name} ({s.uid}) · {s.department}
                      </SelectItem>
                    ))}
                    {supervisors.length === 0 && (
                      <div className="text-muted-foreground px-2 py-4 text-center text-sm">
                        No supervisors available for this exam center.
                      </div>
                    )}
                  </SelectContent>
                </Select>
                {selectedSupervisor &&
                  selectedBlock.subjects.every((s) => s.supervisorUid === selectedSupervisor) && (
                    <p className="text-muted-foreground flex items-center gap-1 text-xs">
                      <AlertTriangle className="h-3 w-3" />
                      All subjects already have this supervisor. Nothing to change.
                    </p>
                  )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleChangeSupervisor}
              disabled={
                submitting ||
                !selectedSupervisor ||
                supervisors.length === 0 ||
                (selectedBlock !== null &&
                  selectedBlock.subjects.every((s) => s.supervisorUid === selectedSupervisor))
              }
            >
              {submitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" />
              )}
              Change Supervisor
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
