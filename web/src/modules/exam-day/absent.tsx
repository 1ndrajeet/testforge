// modules/exam-day-edits/absent.tsx
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { format } from 'date-fns';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronLeft,
  Copy,
  Loader2,
  RefreshCw,
  Save,
  Search,
  UserX,
} from 'lucide-react';
import { toast } from 'sonner';

import { createClient } from '@/lib/supabase/client';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

import { MSBTEContextBar } from '@/components/layout/msbte-context-bar';
import { PageHeader } from '@/components/layout/page-layout';

import { SessionSelector } from '@/components/shared/date-selector';

// ============================================================================
// Configuration
// ============================================================================

type Mode = 'absent' | 'copycase';

interface ModeConfig {
  mode: Mode;
  title: string;
  description: string;
  icon: typeof UserX | typeof Copy;
  buttonColor: string;
  badgeColor: string;
  textColor: string;
}

const MODE_CONFIGS: Record<Mode, ModeConfig> = {
  absent: {
    mode: 'absent',
    title: 'Mark Absent Students',
    description: 'Record student absences by selecting date, block, and subject',
    icon: UserX,
    buttonColor: 'bg-rose-600 hover:bg-rose-700',
    badgeColor: 'bg-rose-500',
    textColor: 'text-rose-600',
  },
  copycase: {
    mode: 'copycase',
    title: 'Mark Copy Case Students',
    description: 'Record students involved in copying cases',
    icon: Copy,
    buttonColor: 'bg-amber-600 hover:bg-amber-700',
    badgeColor: 'bg-amber-500',
    textColor: 'text-amber-600',
  },
};

// ============================================================================
// Types
// ============================================================================

interface SchemeEntry {
  id: string;
  subjectCode: string;
  subjectName: string;
  scheme: string;
  blocks: Array<{
    blockNo: string;
    location: string;
    seatNumbers: number[];
    assignedCount: number;
  }>;
  /** Sum of assignedCount across all blocks. */
  totalStudents: number;
  absentNumbers: number[];
  cpsNumbers: number[];
  loadError: string | null;
  hasTimetableRow: boolean;
}

interface BlockGroup {
  blockNo: string;
  location: string;
  schemes: SchemeEntry[];
}

interface StatsData {
  totalStudents: number;
  totalMarked: number;
  totalRemaining: number;
  markedPercentage: number;
}

interface AllocationRow {
  block_no: string | null;
  location: string | null;
  subject_code: string | null;
  subject_name: string | null;
  scheme: string | null;
  seat_numbers: unknown;
  assigned_count: number | null;
}

interface TimetableMarkRow {
  subject_code: string | null;
  scheme: string | null;
  absent_numbers: number[] | null;
  cps_students: number[] | null;
}

interface SubjectRow {
  code: string;
  name: string | null;
  scheme: string | null;
}

// ============================================================================
// Pure helpers
// ============================================================================

const schemeKey = (subjectCode: string, scheme: string) => `${subjectCode}::${scheme}`;

function sortUniqueNumbers(values: number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}

function normalizeNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const out: number[] = [];
  for (const v of value) {
    const n = typeof v === 'number' ? v : Number(v);
    if (Number.isFinite(n)) out.push(Math.trunc(n));
  }
  return sortUniqueNumbers(out);
}

function arraysEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function validateMutualExclusion(
  mode: Mode,
  seatNo: number,
  absentSeats: number[],
  copyCaseSeats: number[],
): { isValid: boolean; message?: string } {
  if (mode === 'absent' && copyCaseSeats.includes(seatNo)) {
    return {
      isValid: false,
      message: `Seat ${seatNo} is marked as a copy case. Clear copy case first.`,
    };
  }
  if (mode === 'copycase' && absentSeats.includes(seatNo)) {
    return {
      isValid: false,
      message: `Seat ${seatNo} is marked absent. Clear absent first.`,
    };
  }
  return { isValid: true };
}

function calculateStats(entries: SchemeEntry[], mode: Mode): StatsData {
  let totalStudents = 0;
  let totalMarked = 0;

  for (const entry of entries) {
    totalStudents += entry.totalStudents;
    totalMarked += mode === 'absent' ? entry.absentNumbers.length : entry.cpsNumbers.length;
  }

  return {
    totalStudents,
    totalMarked,
    totalRemaining: Math.max(0, totalStudents - totalMarked),
    markedPercentage: totalStudents > 0 ? (totalMarked / totalStudents) * 100 : 0,
  };
}

// ============================================================================
// Data access
// ============================================================================
//
// Three batched queries, no per-row fetches:
//   1. block_allocations for the session (narrow column list)
//   2. timetable marks for the session (id intentionally excluded — it's
//      not used downstream)
//   3. subjects by code, batched by `.in()`
//
// Subjects are only fetched if any allocation carried a code we haven't
// already resolved from the allocation row's own subject_name.

async function loadSessionData(
  examCenterId: string,
  date: string,
  session: string,
): Promise<{ blocks: BlockGroup[]; entries: SchemeEntry[] }> {
  const supabase = createClient();

  const [allocRes, ttRes] = await Promise.all([
    supabase
      .from('block_allocations')
      .select(
        'block_no, location, subject_code, subject_name, scheme, seat_numbers, assigned_count',
      )
      .eq('exam_center_id', examCenterId)
      .eq('date', date)
      .eq('session', session)
      .order('block_no'),
    supabase
      .from('timetable')
      .select('subject_code, scheme, absent_numbers, cps_students')
      .eq('exam_center_id', examCenterId)
      .eq('date', date)
      .eq('session', session),
  ]);

  if (allocRes.error) throw allocRes.error;
  if (ttRes.error) throw ttRes.error;

  const allocations = (allocRes.data ?? []) as unknown as AllocationRow[];
  const timetableRows = (ttRes.data ?? []) as unknown as TimetableMarkRow[];

  // Only fetch subject names for codes whose allocation row lacks a name.
  const codesNeedingLookup = Array.from(
    new Set(
      allocations
        .filter((a) => (!a.subject_name || a.subject_name.length === 0) && a.subject_code)
        .map((a) => a.subject_code as string),
    ),
  );

  const subjectNameByCode = new Map<string, string>();
  if (codesNeedingLookup.length > 0) {
    const { data: subjData, error: subjErr } = await supabase
      .from('subjects')
      .select('code, name')
      .in('code', codesNeedingLookup);
    if (subjErr) throw subjErr;
    for (const s of (subjData ?? []) as SubjectRow[]) {
      if (s.code && s.name && !subjectNameByCode.has(s.code)) {
        subjectNameByCode.set(s.code, s.name);
      }
    }
  }

  // Merge allocations per (subject_code, scheme).
  const merged = new Map<string, SchemeEntry>();

  for (const a of allocations) {
    const subjectCode = a.subject_code ?? '';
    const scheme = a.scheme ?? '';
    if (!subjectCode || !scheme) continue;

    const seats = normalizeNumberArray(a.seat_numbers);
    const assigned = typeof a.assigned_count === 'number' ? a.assigned_count : seats.length;
    const key = schemeKey(subjectCode, scheme);

    let entry = merged.get(key);
    if (!entry) {
      entry = {
        id: key,
        subjectCode,
        subjectName: a.subject_name || subjectNameByCode.get(subjectCode) || subjectCode,
        scheme,
        blocks: [],
        totalStudents: 0,
        absentNumbers: [],
        cpsNumbers: [],
        loadError: null,
        hasTimetableRow: false,
      };
      merged.set(key, entry);
    }

    entry.blocks.push({
      blockNo: a.block_no || '?',
      location: a.location || '?',
      seatNumbers: seats,
      assignedCount: assigned,
    });
    entry.totalStudents += assigned;
  }

  // Attach timetable marks. Duplicates are a data-integrity violation.
  const marksByKey = new Map<string, TimetableMarkRow[]>();
  for (const row of timetableRows) {
    const subjectCode = row.subject_code ?? '';
    const scheme = row.scheme ?? '';
    if (!subjectCode || !scheme) continue;
    const key = schemeKey(subjectCode, scheme);
    const list = marksByKey.get(key);
    if (list) list.push(row);
    else marksByKey.set(key, [row]);
  }

  for (const entry of merged.values()) {
    const rows = marksByKey.get(entry.id);
    if (!rows || rows.length === 0) {
      entry.hasTimetableRow = false;
      continue;
    }
    if (rows.length > 1) {
      entry.loadError =
        'Multiple timetable rows match this subject and scheme. Resolve duplicates before editing.';
      continue;
    }
    entry.hasTimetableRow = true;
    entry.absentNumbers = normalizeNumberArray(rows[0].absent_numbers);
    entry.cpsNumbers = normalizeNumberArray(rows[0].cps_students);
  }

  // Group by block for the sidebar.
  const blockMap = new Map<string, BlockGroup>();
  for (const entry of merged.values()) {
    for (const b of entry.blocks) {
      let group = blockMap.get(b.blockNo);
      if (!group) {
        group = { blockNo: b.blockNo, location: b.location, schemes: [] };
        blockMap.set(b.blockNo, group);
      }
      group.schemes.push(entry);
    }
  }

  const blocks = Array.from(blockMap.values()).sort((a, b) =>
    a.blockNo.localeCompare(b.blockNo, undefined, { numeric: true }),
  );

  return { blocks, entries: Array.from(merged.values()) };
}

// ============================================================================
// Save — unchanged from the scheme-scoped contract
// ============================================================================

async function saveMarks(params: {
  examCenterId: string;
  mode: Mode;
  subjectCode: string;
  scheme: string;
  date: string;
  session: 'Morning' | 'Afternoon';
  seats: number[];
}): Promise<{ success: true } | { success: false; error: string }> {
  const { examCenterId, mode, subjectCode, scheme, date, session, seats } = params;

  if (session !== 'Morning' && session !== 'Afternoon') {
    return { success: false, error: 'Select a specific session before saving.' };
  }

  const supabase = createClient();

  const { data: rows, error: findError } = await supabase
    .from('timetable')
    .select('id')
    .eq('exam_center_id', examCenterId)
    .eq('subject_code', subjectCode)
    .eq('scheme', scheme)
    .eq('date', date)
    .eq('session', session);

  if (findError) return { success: false, error: findError.message };
  if (!rows || rows.length === 0) {
    return { success: false, error: 'No timetable entry found for this subject and scheme.' };
  }
  if (rows.length > 1) {
    return {
      success: false,
      error: 'Multiple timetable entries match. Resolve duplicates before saving.',
    };
  }

  const clean = sortUniqueNumbers(seats.filter((n) => Number.isFinite(n) && n >= 0));
  const patch = mode === 'absent' ? { absent_numbers: clean } : { cps_students: clean };

  const { error: updateError } = await supabase
    .from('timetable')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', rows[0].id)
    .eq('exam_center_id', examCenterId);

  if (updateError) return { success: false, error: updateError.message };
  return { success: true };
}

// ============================================================================
// Metadata fetchers (dates and sessions)
// ============================================================================

async function fetchUniqueDates(examCenterId: string): Promise<Date[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('timetable')
    .select('date')
    .eq('exam_center_id', examCenterId)
    .order('date');
  if (error) throw error;
  const seen = new Set<string>();
  const out: Date[] = [];
  for (const r of data ?? []) {
    const raw = (r as { date?: string }).date;
    if (!raw) continue;
    const iso = raw.split('T')[0];
    if (seen.has(iso)) continue;
    seen.add(iso);
    out.push(new Date(raw));
  }
  return out;
}

async function fetchUniqueSessions(examCenterId: string): Promise<string[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('timetable')
    .select('session')
    .eq('exam_center_id', examCenterId);
  if (error) throw error;
  const set = new Set<string>();
  for (const r of data ?? []) {
    const s = (r as { session?: string | null }).session;
    if (s) set.add(s);
  }
  return Array.from(set);
}

// ============================================================================
// Compact stats strip
// ============================================================================

function CompactStats({ stats, config }: { stats: StatsData | null; config: ModeConfig }) {
  if (!stats) return null;
  const label = config.mode === 'absent' ? 'Absent' : 'Copy Case';

  const items: Array<{ label: string; value: string; className?: string }> = [
    { label: 'Allocated', value: stats.totalStudents.toLocaleString('en-IN') },
    { label, value: stats.totalMarked.toLocaleString('en-IN'), className: config.textColor },
    {
      label: 'Unmarked',
      value: stats.totalRemaining.toLocaleString('en-IN'),
      className: 'text-emerald-600 dark:text-emerald-400',
    },
    { label: 'Marked', value: `${stats.markedPercentage.toFixed(0)}%` },
  ];

  return (
    <section
      aria-label="Session summary"
      className="mb-4"
    >
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-neutral-200 bg-neutral-200 sm:grid-cols-4 dark:border-neutral-800 dark:bg-neutral-800">
        {items.map((item) => (
          <div
            key={item.label}
            className="bg-white px-4 py-3 dark:bg-neutral-950"
          >
            <dt className="text-xs text-neutral-500">{item.label}</dt>
            <dd
              className={cn(
                'mt-0.5 text-xl font-semibold tracking-tight text-neutral-900 tabular-nums dark:text-neutral-50',
                item.className,
              )}
            >
              {item.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

// ============================================================================
// Block navigation
// ============================================================================

function BlockNav({
  blocks,
  selectedBlockNo,
  selectedSchemeId,
  onSelectBlock,
  onSelectScheme,
  isLoading,
  config,
}: {
  blocks: BlockGroup[];
  selectedBlockNo: string | null;
  selectedSchemeId: string | null;
  onSelectBlock: (blockNo: string | null) => void;
  onSelectScheme: (schemeId: string) => void;
  isLoading?: boolean;
  config: ModeConfig;
}) {
  const getMarkedCount = (entry: SchemeEntry) =>
    config.mode === 'absent' ? entry.absentNumbers.length : entry.cpsNumbers.length;

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  if (blocks.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-200 p-4 text-center dark:border-neutral-800">
        <p className="text-xs text-neutral-500">No blocks allocated for this session</p>
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {blocks.map((block) => {
        const isExpanded = selectedBlockNo === block.blockNo;

        // Per-block header totals: unique by scheme within the block.
        // A scheme appears once per block, so no dedupe needed here.
        let blockMarked = 0;
        let blockStudents = 0;
        for (const s of block.schemes) {
          const b = s.blocks.find((x) => x.blockNo === block.blockNo);
          if (!b) continue;
          blockStudents += b.assignedCount;
          blockMarked += getMarkedCount(s);
        }

        return (
          <div key={block.blockNo}>
            <button
              type="button"
              onClick={() => onSelectBlock(isExpanded ? null : block.blockNo)}
              aria-expanded={isExpanded}
              className={cn(
                'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm',
                'transition-colors duration-150 motion-reduce:transition-none',
                isExpanded
                  ? 'bg-neutral-100 dark:bg-neutral-800'
                  : 'hover:bg-neutral-50 dark:hover:bg-neutral-900',
              )}
            >
              <div className="flex items-center gap-2">
                <ChevronLeft
                  aria-hidden
                  className={cn(
                    'h-3 w-3 transition-transform duration-150 motion-reduce:transition-none',
                    isExpanded && '-rotate-90',
                  )}
                />
                <span className="font-mono text-sm">Block {block.blockNo}</span>
                <span className="text-xs text-neutral-400">{block.location}</span>
              </div>
              <span className="text-[10px] text-neutral-400 tabular-nums">
                {blockStudents > 0 ? `${blockStudents} students` : '—'}
                {blockMarked > 0 && (
                  <span className={cn('ml-2 font-medium', config.textColor)}>{blockMarked}</span>
                )}
              </span>
            </button>

            {isExpanded && (
              <div className="ml-6 space-y-0.5 border-l border-neutral-200 pl-2 dark:border-neutral-800">
                {block.schemes.map((entry) => {
                  const isSelected = selectedSchemeId === entry.id;
                  const blockAllocation = entry.blocks.find((b) => b.blockNo === block.blockNo);
                  const blockStudents = blockAllocation?.assignedCount ?? 0;
                  const totalMarked = getMarkedCount(entry);

                  return (
                    <button
                      key={`${block.blockNo}-${entry.id}`}
                      type="button"
                      onClick={() => onSelectScheme(entry.id)}
                      className={cn(
                        'w-full rounded-md px-2 py-1.5 text-left text-sm',
                        'transition-colors duration-150 motion-reduce:transition-none',
                        isSelected
                          ? 'bg-neutral-100 dark:bg-neutral-800'
                          : 'hover:bg-neutral-50 dark:hover:bg-neutral-900',
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <code className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-xs dark:bg-neutral-800">
                              {entry.subjectCode}
                            </code>
                            <span className="truncate text-xs">{entry.subjectName}</span>
                          </div>
                          <div className="mt-0.5 flex items-center gap-2 text-[10px] text-neutral-400">
                            <span>{entry.scheme}</span>
                            <span aria-hidden>·</span>
                            <span className="tabular-nums">
                              {blockStudents} {blockStudents === 1 ? 'student' : 'students'} in this
                              block
                            </span>
                            {entry.loadError && (
                              <span className="text-amber-600 dark:text-amber-400">
                                · load failed
                              </span>
                            )}
                          </div>
                        </div>
                        {totalMarked > 0 && (
                          <div className="shrink-0 text-right">
                            <span
                              className={cn('text-xs font-medium tabular-nums', config.textColor)}
                            >
                              {totalMarked}
                            </span>
                            <span className="text-[10px] text-neutral-400 tabular-nums">
                              /{entry.totalStudents}
                            </span>
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
// Subject header
// ============================================================================

function SubjectHeader({
  entry,
  selectedBlockNo,
  config,
}: {
  entry: SchemeEntry;
  selectedBlockNo: string | null;
  config: ModeConfig;
}) {
  const markedCount =
    config.mode === 'absent' ? entry.absentNumbers.length : entry.cpsNumbers.length;
  const label = config.mode === 'absent' ? 'absent' : 'copy case';

  const block = selectedBlockNo
    ? entry.blocks.find((b) => b.blockNo === selectedBlockNo)
    : undefined;

  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded bg-white px-1.5 py-0.5 font-mono text-sm dark:bg-neutral-800">
              {entry.subjectCode}
            </code>
            <span className="truncate font-medium">{entry.subjectName}</span>
            <Badge
              variant="outline"
              className="font-mono text-[10px]"
            >
              {entry.scheme}
            </Badge>
          </div>
          <div className="mt-1 text-xs text-neutral-500">
            {block
              ? `Block ${block.blockNo} · ${block.location} · ${block.assignedCount} students`
              : `${entry.totalStudents} students total across all blocks`}
          </div>
        </div>
        <div className="text-right">
          <div className={cn('text-sm font-medium tabular-nums', config.textColor)}>
            {markedCount} {label}
          </div>
          <div className="text-[10px] text-neutral-500 tabular-nums">
            {entry.totalStudents > 0
              ? `${((markedCount / entry.totalStudents) * 100).toFixed(0)}% of scheme`
              : '0%'}
          </div>
        </div>
      </div>

      {entry.loadError && (
        <p
          role="alert"
          className="mt-2 flex items-start gap-1.5 rounded border border-amber-500/40 bg-amber-500/[0.08] px-2 py-1.5 text-xs text-amber-800 dark:text-amber-300"
        >
          <AlertCircle
            aria-hidden
            className="mt-0.5 h-3.5 w-3.5 shrink-0"
          />
          <span>{entry.loadError} Editing is disabled for this subject.</span>
        </p>
      )}
      {!entry.hasTimetableRow && !entry.loadError && (
        <p className="mt-2 text-xs text-neutral-500">
          No timetable entry exists for this subject yet. Marks cannot be saved.
        </p>
      )}
    </div>
  );
}

// ============================================================================
// Seat grid — scoped to the selected block
// ============================================================================

function SeatGrid({
  entry,
  seatNumbers,
  markedSeats,
  onToggleSeat,
  onBulkSet,
  isLoading,
  config,
  disabled,
}: {
  entry: SchemeEntry;
  seatNumbers: number[];
  markedSeats: number[];
  onToggleSeat: (seatNo: number) => void;
  onBulkSet: (next: number[]) => void;
  isLoading?: boolean;
  config: ModeConfig;
  disabled: boolean;
}) {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredSeats = useMemo(() => {
    if (!searchTerm) return seatNumbers;
    const q = searchTerm.trim();
    return seatNumbers.filter((seat) => seat.toString().includes(q));
  }, [seatNumbers, searchTerm]);

  const visibleSet = useMemo(() => new Set(seatNumbers), [seatNumbers]);

  const getSeatStatus = (seatNo: number): 'absent' | 'copycase' | 'present' => {
    if (entry.absentNumbers.includes(seatNo)) return 'absent';
    if (entry.cpsNumbers.includes(seatNo)) return 'copycase';
    return 'present';
  };

  const isSeatSelectable = (seatNo: number): boolean => {
    if (disabled) return false;
    const status = getSeatStatus(seatNo);
    if (config.mode === 'absent') return status !== 'copycase';
    return status !== 'absent';
  };

  const handleSeatClick = (seatNo: number) => {
    if (disabled) return;
    const validation = validateMutualExclusion(
      config.mode,
      seatNo,
      entry.absentNumbers,
      entry.cpsNumbers,
    );
    if (!validation.isValid) {
      toast.warning(validation.message);
      return;
    }
    onToggleSeat(seatNo);
  };

  const handleBulkMark = () => {
    if (disabled) return;
    const currentSet = new Set(markedSeats);
    const eligible: number[] = [];
    for (const seat of seatNumbers) {
      if (currentSet.has(seat)) continue;
      if (config.mode === 'absent') {
        if (entry.cpsNumbers.includes(seat)) continue;
      } else {
        if (entry.absentNumbers.includes(seat)) continue;
      }
      eligible.push(seat);
    }
    if (eligible.length === 0) {
      toast.info('No eligible seats to mark in this block.');
      return;
    }
    const next = sortUniqueNumbers([...markedSeats, ...eligible]);
    onBulkSet(next);
    toast.info(`Marked ${eligible.length} seat${eligible.length === 1 ? '' : 's'} (unsaved)`);
  };

  const handleClearAll = () => {
    if (disabled) return;
    const toRemove = markedSeats.filter((s) => visibleSet.has(s));
    if (toRemove.length === 0) {
      toast.info('Nothing to clear in this block.');
      return;
    }
    const toKeep = markedSeats.filter((s) => !visibleSet.has(s));
    onBulkSet(toKeep);
    toast.info(`Cleared ${toRemove.length} seat${toRemove.length === 1 ? '' : 's'} (unsaved)`);
  };

  const markedInThisBlock = useMemo(
    () => markedSeats.filter((s) => visibleSet.has(s)).length,
    [markedSeats, visibleSet],
  );

  if (isLoading) {
    return (
      <div className="grid grid-cols-6 gap-1 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12">
        {Array.from({ length: 24 }).map((_, i) => (
          <Skeleton
            key={i}
            className="aspect-square w-full rounded-md"
          />
        ))}
      </div>
    );
  }

  if (seatNumbers.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-neutral-200 dark:border-neutral-800">
        <p className="text-sm text-neutral-500">
          No seats allocated for this subject in this block.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="relative">
          <label
            htmlFor={`seat-search-${entry.id}`}
            className="sr-only"
          >
            Search seat number
          </label>
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400"
          />
          <Input
            id={`seat-search-${entry.id}`}
            type="search"
            placeholder="Search seat…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-8 w-48 pl-8 text-sm"
          />
        </div>
        <div className="flex gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleBulkMark}
            disabled={disabled}
            className="h-7 px-2 text-xs"
          >
            Mark all
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleClearAll}
            disabled={disabled}
            className="h-7 px-2 text-xs"
          >
            Clear all
          </Button>
        </div>
      </div>

      <div className="max-h-[450px] overflow-y-auto rounded-lg border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-950">
        <div className="grid grid-cols-6 gap-1 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12">
          {filteredSeats.map((seatNo) => {
            const status = getSeatStatus(seatNo);
            const isCurrentlyMarked = markedSeats.includes(seatNo);
            const selectable = isSeatSelectable(seatNo);

            const base =
              'relative aspect-square w-full rounded-md border text-sm font-mono transition-colors duration-150 motion-reduce:transition-none';
            let variant =
              'border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300 hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-300';
            if (!selectable) {
              variant =
                status === 'absent'
                  ? 'cursor-not-allowed border-rose-300 bg-rose-50/60 text-rose-700 dark:border-rose-800 dark:bg-rose-950/20 dark:text-rose-400'
                  : status === 'copycase'
                    ? 'cursor-not-allowed border-amber-300 bg-amber-50/60 text-amber-700 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-400'
                    : 'cursor-not-allowed border-neutral-200 bg-neutral-50 text-neutral-400 dark:border-neutral-800 dark:bg-neutral-900/40';
            } else if (isCurrentlyMarked) {
              variant =
                config.mode === 'absent'
                  ? 'border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-400'
                  : 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400';
            }

            let markColor = config.badgeColor;
            if (status === 'absent') markColor = 'bg-rose-500';
            if (status === 'copycase') markColor = 'bg-amber-500';

            const labelText =
              status === 'absent'
                ? `Seat ${seatNo}, absent`
                : status === 'copycase'
                  ? `Seat ${seatNo}, copy case`
                  : `Seat ${seatNo}, present`;

            return (
              <button
                key={seatNo}
                type="button"
                onClick={() => handleSeatClick(seatNo)}
                disabled={!selectable}
                aria-label={labelText}
                aria-pressed={isCurrentlyMarked}
                className={cn(
                  base,
                  variant,
                  'focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1 focus-visible:ring-offset-white focus-visible:outline-none dark:focus-visible:ring-offset-neutral-950',
                )}
              >
                {seatNo}
                {(status === 'absent' || status === 'copycase') && (
                  <span
                    aria-hidden
                    className={cn(
                      'absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full text-[9px] text-white',
                      markColor,
                    )}
                  >
                    <Check className="h-3 w-3" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="h-2.5 w-2.5 rounded-full bg-emerald-500"
            />
            <span className="text-neutral-500">Present</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="h-2.5 w-2.5 rounded-full bg-amber-500"
            />
            <span className="text-neutral-500">Copy case</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="h-2.5 w-2.5 rounded-full bg-rose-500"
            />
            <span className="text-neutral-500">Absent</span>
          </span>
        </div>
        <p className="text-neutral-400 tabular-nums">
          {markedInThisBlock} of {seatNumbers.length} marked{' '}
          {config.mode === 'absent' ? 'absent' : 'copy case'} in this block
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// Confirmation dialog
// ============================================================================

function ConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  entry,
  selectedBlockNo,
  count,
  isSubmitting,
  config,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  entry: SchemeEntry | null;
  selectedBlockNo: string | null;
  count: number;
  isSubmitting: boolean;
  config: ModeConfig;
}) {
  if (!entry) return null;

  const percentage = entry.totalStudents > 0 ? (count / entry.totalStudents) * 100 : 0;
  const isHigh = config.mode === 'absent' && percentage > 30;
  const label = config.mode === 'absent' ? 'absent' : 'copy case';
  const unmarked = Math.max(0, entry.totalStudents - count);

  const block = selectedBlockNo
    ? entry.blocks.find((b) => b.blockNo === selectedBlockNo)
    : undefined;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            {isHigh ? (
              <AlertCircle
                aria-hidden
                className="h-4 w-4 text-amber-500"
              />
            ) : (
              <CheckCircle2
                aria-hidden
                className="h-4 w-4 text-emerald-500"
              />
            )}
            Confirm {label === 'absent' ? 'absent' : 'copy case'} marking
          </DialogTitle>
          <DialogDescription className="text-xs">
            {entry.subjectCode} · {entry.subjectName} · {entry.scheme}
            {block ? ` · Block ${block.blockNo}` : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <dl className="grid grid-cols-3 gap-3 rounded-md border border-neutral-200 p-3 text-sm dark:border-neutral-800">
            <div>
              <dt className="text-xs text-neutral-500">Allocated</dt>
              <dd className="text-lg font-semibold tabular-nums">{entry.totalStudents}</dd>
            </div>
            <div>
              <dt className="text-xs text-neutral-500">Marked {label}</dt>
              <dd className={cn('text-lg font-semibold tabular-nums', config.textColor)}>
                {count}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-neutral-500">Unmarked</dt>
              <dd className="text-lg font-semibold text-emerald-600 tabular-nums dark:text-emerald-400">
                {unmarked}
              </dd>
            </div>
          </dl>

          {entry.blocks.length > 1 && (
            <p className="text-xs text-neutral-500">
              This scheme is allocated across blocks {entry.blocks.map((b) => b.blockNo).join(', ')}
              . Saving writes the full list for this subject and scheme, preserving marks from other
              blocks.
            </p>
          )}

          {isHigh && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              High absentee rate ({percentage.toFixed(0)}%).
            </p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={onConfirm}
            disabled={isSubmitting}
            className={cn('gap-1.5', config.buttonColor)}
          >
            {isSubmitting ? (
              <>
                <Loader2
                  aria-hidden
                  className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
                />
                Saving…
              </>
            ) : (
              <>
                <Save
                  aria-hidden
                  className="h-3.5 w-3.5"
                />
                Save {count} {label}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Main component
// ============================================================================

export default function ExamDayEditsPage({ mode = 'absent' }: { mode?: Mode }) {
  const { examCenter, isLoading: userLoading } = useUserInfo();
  const examCenterId = examCenter?.id;
  const config = MODE_CONFIGS[mode];

  const [step, setStep] = useState<'select' | 'mark'>('select');
  const [dates, setDates] = useState<Date[]>([]);
  const [sessions, setSessions] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedSession, setSelectedSession] = useState<'Morning' | 'Afternoon' | 'All' | ''>('');

  const [entries, setEntries] = useState<SchemeEntry[]>([]);
  const [blocks, setBlocks] = useState<BlockGroup[]>([]);
  const [selectedBlockNo, setSelectedBlockNo] = useState<string | null>(null);
  const [selectedSchemeId, setSelectedSchemeId] = useState<string | null>(null);
  const [pendingSeats, setPendingSeats] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const requestIdRef = useRef(0);

  // ── Metadata ──
  useEffect(() => {
    if (!examCenterId) return;
    let cancelled = false;
    (async () => {
      try {
        const [d, s] = await Promise.all([
          fetchUniqueDates(examCenterId),
          fetchUniqueSessions(examCenterId),
        ]);
        if (cancelled) return;
        setDates(d);
        setSessions(s);
      } catch (err) {
        if (cancelled) return;
        toast.error(err instanceof Error ? err.message : 'Failed to load sessions');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [examCenterId]);

  const selectedEntry = useMemo(
    () => entries.find((e) => e.id === selectedSchemeId) ?? null,
    [entries, selectedSchemeId],
  );

  // Seats visible to the user = the selected block's seats for the selected scheme.
  const visibleSeats = useMemo<number[]>(() => {
    if (!selectedEntry || !selectedBlockNo) return [];
    return selectedEntry.blocks.find((b) => b.blockNo === selectedBlockNo)?.seatNumbers ?? [];
  }, [selectedEntry, selectedBlockNo]);

  // Persisted snapshot for the selected scheme, used for dirty detection.
  const persistedSeats = useMemo<number[]>(() => {
    if (!selectedEntry) return [];
    const raw = config.mode === 'absent' ? selectedEntry.absentNumbers : selectedEntry.cpsNumbers;
    return sortUniqueNumbers(raw);
  }, [selectedEntry, config.mode]);

  // Load initial pending seats when the selected scheme changes.
  // We do not clear pending seats when the block is merely collapsed/expanded.
  useEffect(() => {
    if (!selectedEntry) {
      setPendingSeats([]);
      return;
    }
    setPendingSeats(sortUniqueNumbers(persistedSeats));
    // Re-run only when the entry identity changes, not on every entries mutation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEntry?.id, config.mode]);

  const isDirty = useMemo(
    () => !arraysEqual(sortUniqueNumbers(pendingSeats), persistedSeats),
    [pendingSeats, persistedSeats],
  );

  const stats = useMemo(
    () => (entries.length === 0 ? null : calculateStats(entries, config.mode)),
    [entries, config.mode],
  );

  const loadData = useCallback(
    async (date: string, session: string) => {
      if (!examCenterId) return;
      if (session !== 'Morning' && session !== 'Afternoon') {
        toast.error('Select a specific session before editing.');
        return;
      }

      const requestId = ++requestIdRef.current;
      setLoading(true);
      try {
        const { blocks: b, entries: e } = await loadSessionData(examCenterId, date, session);
        if (requestId !== requestIdRef.current) return;

        setEntries(e);
        setBlocks(b);
        setSelectedBlockNo(null);
        setSelectedSchemeId(null);
        setPendingSeats([]);
      } catch (err) {
        if (requestId !== requestIdRef.current) return;
        toast.error(err instanceof Error ? err.message : 'Failed to load data');
        setEntries([]);
        setBlocks([]);
        setSelectedBlockNo(null);
        setSelectedSchemeId(null);
        setPendingSeats([]);
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    },
    [examCenterId],
  );

  const handleSessionSelect = useCallback(
    async (selection: { date: string; session: 'Morning' | 'Afternoon' | 'All' }) => {
      setSelectedDate(selection.date);
      setSelectedSession(selection.session);
      if (selection.session === 'All') {
        setStep('mark');
        setEntries([]);
        setBlocks([]);
        setSelectedBlockNo(null);
        setSelectedSchemeId(null);
        setPendingSeats([]);
        return;
      }
      await loadData(selection.date, selection.session);
      setStep('mark');
    },
    [loadData],
  );

  const handleRefresh = useCallback(() => {
    if (!selectedDate || (selectedSession !== 'Morning' && selectedSession !== 'Afternoon')) {
      return;
    }
    if (isDirty) {
      const ok = window.confirm(
        'You have unsaved changes. Refreshing will discard them. Continue?',
      );
      if (!ok) return;
    }
    void loadData(selectedDate, selectedSession);
  }, [loadData, selectedDate, selectedSession, isDirty]);

  // Block toggle: does NOT clear selection or pending edits.
  const handleToggleBlock = useCallback((blockNo: string | null) => {
    setSelectedBlockNo(blockNo);
  }, []);

  // Scheme selection: only replace the current edit context when a
  // *different* scheme is chosen. Re-selecting the same scheme is a no-op.
  const handleSelectScheme = useCallback(
    (schemeId: string) => {
      if (schemeId === selectedSchemeId) return;
      if (isDirty) {
        const ok = window.confirm(
          'You have unsaved changes for the current subject. Selecting a different subject will discard them. Continue?',
        );
        if (!ok) return;
      }
      setSelectedSchemeId(schemeId);
    },
    [selectedSchemeId, isDirty],
  );

  const handleToggleSeat = useCallback(
    (seatNo: number) => {
      if (!selectedEntry) return;
      setPendingSeats((prev) =>
        prev.includes(seatNo)
          ? prev.filter((s) => s !== seatNo)
          : sortUniqueNumbers([...prev, seatNo]),
      );
    },
    [selectedEntry],
  );

  const handleBulkSet = useCallback((next: number[]) => {
    setPendingSeats(sortUniqueNumbers(next));
  }, []);

  const handleOpenConfirm = useCallback(() => {
    if (!selectedEntry) return;
    if (!selectedBlockNo) {
      toast.error('Select a block before saving.');
      return;
    }
    if (selectedEntry.loadError) {
      toast.error('Cannot save: the marks for this subject could not be loaded.');
      return;
    }
    if (!selectedEntry.hasTimetableRow) {
      toast.error('Cannot save: no timetable entry exists for this subject.');
      return;
    }
    if (selectedSession !== 'Morning' && selectedSession !== 'Afternoon') {
      toast.error('Select a specific session before saving.');
      return;
    }
    setDialogOpen(true);
  }, [selectedEntry, selectedBlockNo, selectedSession]);

  const handleSave = useCallback(async () => {
    if (!examCenterId || !selectedEntry) return;
    if (!selectedBlockNo) {
      toast.error('Select a block before saving.');
      return;
    }
    if (selectedSession !== 'Morning' && selectedSession !== 'Afternoon') {
      toast.error('Select a specific session before saving.');
      return;
    }

    const conflicts: number[] = [];
    for (const seat of pendingSeats) {
      if (config.mode === 'absent' && selectedEntry.cpsNumbers.includes(seat)) conflicts.push(seat);
      if (config.mode === 'copycase' && selectedEntry.absentNumbers.includes(seat))
        conflicts.push(seat);
    }
    if (conflicts.length > 0) {
      toast.error(
        `Cannot save: seat${conflicts.length === 1 ? '' : 's'} ${conflicts.join(', ')} already ${
          config.mode === 'absent' ? 'marked as copy case' : 'marked absent'
        }.`,
      );
      return;
    }

    setSaving(true);
    const snapshot = [...pendingSeats];

    try {
      const result = await saveMarks({
        examCenterId,
        mode: config.mode,
        subjectCode: selectedEntry.subjectCode,
        scheme: selectedEntry.scheme,
        date: selectedDate,
        session: selectedSession,
        seats: snapshot,
      });

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      setEntries((prev) =>
        prev.map((e) => {
          if (e.id !== selectedEntry.id) return e;
          return config.mode === 'absent'
            ? { ...e, absentNumbers: snapshot }
            : { ...e, cpsNumbers: snapshot };
        }),
      );

      toast.success(
        snapshot.length === 0
          ? `${config.mode === 'absent' ? 'Absent' : 'Copy case'} list cleared`
          : `${snapshot.length} seat${snapshot.length === 1 ? '' : 's'} marked ${
              config.mode === 'absent' ? 'absent' : 'copy case'
            }`,
      );
      setDialogOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }, [
    examCenterId,
    selectedEntry,
    selectedBlockNo,
    selectedSession,
    selectedDate,
    pendingSeats,
    config.mode,
  ]);

  if (userLoading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
        <div className="grid grid-cols-[280px_1fr] gap-6">
          <Skeleton className="h-96 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    );
  }

  if (step === 'select') {
    return (
      <div className="mx-auto max-w-[1400px] space-y-5 px-6 py-5">
        <PageHeader
          title={config.title}
          description={config.description}
          icon={config.icon}
        />
        <SessionSelector
          availableDates={dates}
          availableSessions={sessions}
          onSessionSelect={handleSessionSelect}
          compact
          isLoading={loading}
          title="Select session"
          description="Choose a date and a specific session (Morning or Afternoon)"
        />
      </div>
    );
  }

  const sessionIsSpecific = selectedSession === 'Morning' || selectedSession === 'Afternoon';

  return (
    <div className="space-y-4 px-6 py-5">
      <PageHeader
        title={config.title}
        description={
          selectedDate
            ? `${format(new Date(selectedDate), 'dd MMM yyyy')} · ${
                sessionIsSpecific ? selectedSession : 'Choose a session'
              }`
            : config.description
        }
        icon={config.icon}
        actions={
          <div className="flex items-center gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleRefresh}
                    disabled={loading || !sessionIsSpecific}
                    className="h-7 gap-1 text-xs"
                  >
                    <RefreshCw
                      aria-hidden
                      className={cn(
                        'h-3 w-3',
                        loading && 'animate-spin motion-reduce:animate-none',
                      )}
                    />
                    Refresh
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Reload from server</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setStep('select')}
              className="h-7 gap-1 text-xs"
            >
              <ChevronLeft
                aria-hidden
                className="h-3 w-3"
              />
              Change session
            </Button>
          </div>
        }
      />

      <MSBTEContextBar
        season={examCenter?.season as 'Summer' | 'Winter'}
        year={examCenter?.examYear || new Date().getFullYear()}
        compact
      />

      {!sessionIsSpecific ? (
        <div className="rounded-xl border border-dashed border-amber-500/40 bg-amber-500/[0.05] px-4 py-6 text-center text-sm text-amber-800 dark:text-amber-300">
          <p className="font-medium">Choose a specific session to record marks.</p>
          <p className="mt-1 text-xs">
            Absent and copy-case records are stored per session. Select Morning or Afternoon to
            continue.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => setStep('select')}
          >
            Change session
          </Button>
        </div>
      ) : (
        <>
          <CompactStats
            stats={stats}
            config={config}
          />

          <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
            <div className="space-y-2">
              <Label className="text-xs font-medium text-neutral-500">Blocks & subjects</Label>
              <ScrollArea className="h-[calc(100vh-420px)] rounded-md border border-neutral-200 p-2 dark:border-neutral-800">
                <BlockNav
                  blocks={blocks}
                  selectedBlockNo={selectedBlockNo}
                  selectedSchemeId={selectedSchemeId}
                  onSelectBlock={handleToggleBlock}
                  onSelectScheme={handleSelectScheme}
                  isLoading={loading}
                  config={config}
                />
              </ScrollArea>
            </div>

            <div className="space-y-3">
              {selectedEntry && selectedBlockNo ? (
                <>
                  <SubjectHeader
                    entry={selectedEntry}
                    selectedBlockNo={selectedBlockNo}
                    config={config}
                  />
                  <SeatGrid
                    entry={selectedEntry}
                    seatNumbers={visibleSeats}
                    markedSeats={pendingSeats}
                    onToggleSeat={handleToggleSeat}
                    onBulkSet={handleBulkSet}
                    config={config}
                    isLoading={loading}
                    disabled={Boolean(selectedEntry.loadError) || !selectedEntry.hasTimetableRow}
                  />
                  {selectedEntry.blocks.length > 1 && (
                    <p className="text-xs text-neutral-500">
                      Showing seats for Block {selectedBlockNo} only. Marks in{' '}
                      {selectedEntry.blocks
                        .filter((b) => b.blockNo !== selectedBlockNo)
                        .map((b) => `Block ${b.blockNo}`)
                        .join(', ')}{' '}
                      are preserved when you save.
                    </p>
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <p
                      className={cn(
                        'text-xs',
                        isDirty
                          ? 'font-medium text-amber-700 dark:text-amber-400'
                          : 'text-neutral-500',
                      )}
                    >
                      {isDirty ? 'Unsaved changes' : 'No unsaved changes'}
                    </p>
                    <Button
                      type="button"
                      onClick={handleOpenConfirm}
                      disabled={
                        saving ||
                        !isDirty ||
                        Boolean(selectedEntry.loadError) ||
                        !selectedEntry.hasTimetableRow
                      }
                      className={cn('h-8 gap-1.5', config.buttonColor)}
                      size="sm"
                    >
                      {saving ? (
                        <Loader2
                          aria-hidden
                          className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
                        />
                      ) : (
                        <Save
                          aria-hidden
                          className="h-3.5 w-3.5"
                        />
                      )}
                      Save {config.mode === 'absent' ? 'absent' : 'copy case'} list
                    </Button>
                  </div>
                </>
              ) : (
                <Card className="flex h-[calc(100vh-420px)] items-center justify-center border-dashed">
                  <CardContent className="text-center">
                    <config.icon className="mx-auto h-8 w-8 text-neutral-400" />
                    <p className="mt-2 text-sm text-neutral-500">
                      {selectedBlockNo
                        ? 'Select a subject from the left panel'
                        : 'Expand a block and select a subject to begin'}
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </>
      )}

      <ConfirmDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onConfirm={handleSave}
        entry={selectedEntry}
        selectedBlockNo={selectedBlockNo}
        config={config}
        count={pendingSeats.length}
        isSubmitting={saving}
      />
    </div>
  );
}
