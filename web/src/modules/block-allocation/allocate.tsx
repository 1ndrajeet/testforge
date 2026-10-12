// app/(dashboard)/exam-setup/block-allocation/page.tsx

'use client';

import { useEffect, useMemo, useState } from 'react';

import { useRouter } from 'next/navigation';

import { format } from 'date-fns';
import { AlertCircle, Calendar, Check, ChevronLeft, X } from 'lucide-react';
import { toast } from 'sonner';

import {
  addLocalAllocation,
  clearLocalAllocations,
  clearLocalTimetable,
  clearSessionContext,
  getLocalAllocations,
  getSessionContext,
  hasLocalData,
  type LocalAllocation,
  removeLocalAllocation,
  setLocalTimetable,
  setSessionContext,
  updateLocalTimetable,
} from '@/lib/misc/local-storage';
import { createClient } from '@/lib/supabase/client';
import { Block, ExistingAllocation, SessionInfo, StaffMember, TimetableEntry } from '@/lib/types';
import { cn } from '@/lib/utils';

import { useUserInfo } from '@/hooks/useUserInfo';

import { Alert } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { MSBTEContextBar } from '@/components/layout/msbte-context-bar';
import { PageHeader } from '@/components/layout/page-layout';

import { SessionSelector } from '@/components/shared/date-selector';

// ============================================================================
// Normalization
// ============================================================================

const normScheme = (v: unknown): string =>
  String(v ?? '')
    .trim()
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase();

const normCode = (v: unknown): string =>
  String(v ?? '')
    .trim()
    .toUpperCase();

const toDateStr = (d: Date | string): string =>
  typeof d === 'string' ? d.split('T')[0] : d.toISOString().split('T')[0];

// ============================================================================
// Data access — all reads/writes go through the browser Supabase client.
// ============================================================================

type Supabase = ReturnType<typeof createClient>;

async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const PAGE = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw error;
    const batch = data ?? [];
    out.push(...batch);
    if (batch.length < PAGE) break;
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

async function fetchBlocks(supabase: Supabase, examCenterId: string): Promise<Block[]> {
  const { data, error } = await supabase
    .from('blocks')
    .select(
      'id, exam_center_id, block_no, location, name, strength, distribution, template, is_deleted, created_at, updated_at',
    )
    .eq('exam_center_id', examCenterId)
    .eq('is_deleted', false)
    .order('block_no');
  if (error) throw error;
  return (data ?? []).map((b: any) => ({
    id: b.id,
    examCenterId: b.exam_center_id,
    blockNo: b.block_no,
    location: b.location,
    name: b.name,
    strength: b.strength,
    distribution: (b.distribution as number[]) || [10, 10, 10, 10],
    template: b.template || 1,
    isDeleted: b.is_deleted,
    createdAt: new Date(b.created_at),
    updatedAt: new Date(b.updated_at),
  }));
}

async function fetchSupervisors(supabase: Supabase, examCenterId: string): Promise<StaffMember[]> {
  const { data, error } = await supabase
    .from('staff')
    .select(
      'id, uid, name, department, email, staff_type, role, designation, post_held_in_examination, is_deleted, created_at, updated_at',
    )
    .eq('exam_center_id', examCenterId)
    .eq('is_deleted', false)
    .eq('staff_type', 'SUPERVISOR')
    .order('name');
  if (error) throw error;
  return (data ?? []).map((s: any) => ({
    id: s.id,
    uid: s.uid,
    name: s.name,
    department: s.department,
    email: s.email,
    staffType: s.staff_type,
    role: s.role,
    designation: s.designation,
    postHeldInExamination: s.post_held_in_examination,
    isDeleted: s.is_deleted,
    createdAt: new Date(s.created_at),
    updatedAt: new Date(s.updated_at),
  }));
}

async function fetchTimetable(
  supabase: Supabase,
  examCenterId: string,
  date: string,
  session: string,
): Promise<TimetableEntry[]> {
  const { data, error } = await supabase
    .from('timetable')
    .select(
      'id, exam_center_id, date, session, time_slot, subject_code, subject_name, scheme, total_students, exam_day, absent_numbers, cps_students, created_at, updated_at',
    )
    .eq('exam_center_id', examCenterId)
    .eq('date', date)
    .eq('session', session)
    .order('subject_code');
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: row.id,
    examCenterId: row.exam_center_id,
    date: row.date,
    session: row.session,
    timeSlot: row.time_slot,
    subjectCode: row.subject_code,
    subjectName: row.subject_name,
    scheme: row.scheme,
    semester: row.semester,
    totalStudents: row.total_students,
    examDay: row.exam_day,
    studentRollNumbers: row.student_roll_numbers,
    absentNumbers: row.absent_numbers,
    cpsStudents: row.cps_students,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })) as unknown as TimetableEntry[];
}

async function fetchExistingAllocations(
  supabase: Supabase,
  examCenterId: string,
  date: string,
  session: string,
): Promise<ExistingAllocation[]> {
  const { data, error } = await supabase
    .from('block_allocations')
    .select('id, location, scheme, subject_code, supervisor_name, assigned_count')
    .eq('exam_center_id', examCenterId)
    .eq('date', date)
    .eq('session', session);
  if (error) throw error;
  return (data ?? []).map((a: any) => ({
    blockName: a.location,
    scheme: a.scheme,
    subjectCode: a.subject_code,
    supervisorName: a.supervisor_name,
    assignedCount: a.assigned_count,
  })) as ExistingAllocation[];
}

async function fetchSupervisionOrders(
  supabase: Supabase,
  examCenterId: string,
  date: string,
): Promise<Set<string>> {
  const { data: orderList, error: orderErr } = await supabase
    .from('orders')
    .select('id, staff_id, session')
    .eq('exam_center_id', examCenterId)
    .eq('order_type', 'supervision')
    .eq('date', date);
  if (orderErr) throw orderErr;
  if (!orderList || orderList.length === 0) return new Set();

  const staffIds = Array.from(new Set(orderList.map((o: any) => o.staff_id).filter(Boolean)));
  if (staffIds.length === 0) return new Set();

  const { data: staffList, error: staffErr } = await supabase
    .from('staff')
    .select('id, uid')
    .in('id', staffIds);
  if (staffErr) throw staffErr;

  const uidById = new Map((staffList ?? []).map((s: any) => [s.id, s.uid]));
  const out = new Set<string>();
  for (const o of orderList as any[]) {
    const uid = uidById.get(o.staff_id);
    if (uid) out.add(uid);
  }
  return out;
}

// ----------------------------------------------------------------------------
// Allocation submission — mirrors the server action's semantics.
// Reads students scoped to the payload's schemes only, then inserts.
// ----------------------------------------------------------------------------

interface AllocationDraft {
  blockName: string;
  scheme: string;
  subCode: string;
  supervisor: string;
  numberOfCandidates: number;
  startFrom: number;
  timeslot: string;
}

async function submitAllocations(
  supabase: Supabase,
  examCenterId: string,
  date: string,
  session: string,
  allocations: AllocationDraft[],
): Promise<{ created: number }> {
  const allocSchemeKeys = new Set<string>();
  const allocCodeKeys = new Set<string>();
  const allocLocations = new Set<string>();
  const allocSupervisorUids = new Set<string>();

  for (const a of allocations) {
    const s = normScheme(a.scheme);
    const c = normCode(a.subCode);
    if (s) allocSchemeKeys.add(s);
    if (c) allocCodeKeys.add(c);
    if (a.blockName) allocLocations.add(String(a.blockName));
    if (a.supervisor) allocSupervisorUids.add(String(a.supervisor));
  }

  // 1. Raw scheme variants present in this centre that normalize to one of
  //    the schemes we are allocating. One-column projection, paginated.
  const schemeRows = await fetchAll<{ scheme: string | null }>((from, to) =>
    supabase
      .from('students')
      .select('scheme')
      .eq('exam_center_id', examCenterId)
      .eq('is_deleted', false)
      .not('scheme', 'is', null)
      .range(from, to),
  );
  const rawSchemeVariants = Array.from(
    new Set(
      schemeRows
        .map((r) => String(r.scheme ?? ''))
        .filter((v) => v && allocSchemeKeys.has(normScheme(v))),
    ),
  );

  // 2. Students in those schemes, paginated, ordered by seat_number so the
  //    startFrom offsets remain deterministic.
  const allStudents =
    rawSchemeVariants.length > 0
      ? await fetchAll<{
          seat_number: number;
          scheme: string | null;
          sub_codes: unknown;
          connected_institute_id: string | null;
        }>((from, to) =>
          supabase
            .from('students')
            .select('seat_number, scheme, sub_codes, connected_institute_id')
            .eq('exam_center_id', examCenterId)
            .eq('is_deleted', false)
            .in('scheme', rawSchemeVariants)
            .order('seat_number')
            .range(from, to),
        )
      : [];

  // 3. Subjects, blocks, and staff — only what the payload references.
  const allSubjects =
    allocCodeKeys.size > 0
      ? await (async () => {
          const { data, error } = await supabase
            .from('subjects')
            .select('code, name, scheme')
            .in('code', Array.from(allocCodeKeys));
          if (error) throw error;
          return (data ?? []) as Array<{
            code: string;
            name: string | null;
            scheme: string | null;
          }>;
        })()
      : [];

  const allBlocks =
    allocLocations.size > 0
      ? await (async () => {
          const { data, error } = await supabase
            .from('blocks')
            .select('id, location, strength, block_no')
            .eq('exam_center_id', examCenterId)
            .eq('is_deleted', false)
            .in('location', Array.from(allocLocations));
          if (error) throw error;
          return (data ?? []) as Array<{
            id: string;
            location: string;
            strength: number;
            block_no: string | null;
          }>;
        })()
      : [];

  const allStaff =
    allocSupervisorUids.size > 0
      ? await (async () => {
          const { data, error } = await supabase
            .from('staff')
            .select('uid, name')
            .eq('exam_center_id', examCenterId)
            .eq('is_deleted', false)
            .in('uid', Array.from(allocSupervisorUids));
          if (error) throw error;
          return (data ?? []) as Array<{ uid: string; name: string | null }>;
        })()
      : [];

  const blockByLocation = new Map(allBlocks.map((b) => [String(b.location), b]));
  const staffByUid = new Map(allStaff.map((s) => [String(s.uid), s]));
  const subjectByNameKey = new Map<string, { name: string | null }>();
  for (const sub of allSubjects) {
    const key = `${normScheme(sub.scheme)}::${normCode(sub.code)}`;
    if (!subjectByNameKey.has(key)) subjectByNameKey.set(key, { name: sub.name });
  }

  const studentsBySchemeAndCode = new Map<string, typeof allStudents>();
  for (const st of allStudents) {
    const schemeKey = normScheme(st.scheme);
    if (!schemeKey) continue;
    if (!Array.isArray(st.sub_codes)) continue;
    for (const raw of st.sub_codes as unknown[]) {
      const codeKey = normCode(raw);
      if (!codeKey) continue;
      const key = `${schemeKey}::${codeKey}`;
      const bucket = studentsBySchemeAndCode.get(key) ?? [];
      bucket.push(st);
      studentsBySchemeAndCode.set(key, bucket);
    }
  }

  const rows: Record<string, unknown>[] = [];
  const unresolved: string[] = [];
  const assignSequence = new Map<string, number>();
  let seq = 1;
  for (const alloc of allocations) {
    if (!assignSequence.has(alloc.blockName)) {
      assignSequence.set(alloc.blockName, seq);
      seq += 1;
    }
  }
  for (const alloc of allocations) {
    const allocSchemeKey = normScheme(alloc.scheme);
    const allocCodeKey = normCode(alloc.subCode);
    const lookupKey = `${allocSchemeKey}::${allocCodeKey}`;

    const pool = studentsBySchemeAndCode.get(lookupKey) ?? [];
    const offset = Math.max(0, alloc.startFrom - 1);
    const allocated = pool.slice(offset, offset + alloc.numberOfCandidates);

    if (allocated.length === 0 && alloc.numberOfCandidates > 0) {
      unresolved.push(`${alloc.blockName}/${alloc.scheme}/${alloc.subCode}`);
      continue;
    }

    const seatNumbers = allocated.map((s) => s.seat_number);
    const firstSeat = seatNumbers.length > 0 ? seatNumbers[0] : null;
    const lastSeat = seatNumbers.length > 0 ? seatNumbers[seatNumbers.length - 1] : null;
    const connectedInstituteId = allocated.length > 0 ? allocated[0].connected_institute_id : null;

    const blockData = blockByLocation.get(String(alloc.blockName));
    const supervisor = staffByUid.get(String(alloc.supervisor));
    const subject = subjectByNameKey.get(lookupKey);
    const blockNo = String(assignSequence.get(String(alloc.blockName)) ?? '');

    rows.push({
      exam_center_id: examCenterId,
      connected_institute_id: connectedInstituteId,
      date,
      session,
      timeslot: alloc.timeslot || null,
      block_id: blockData?.id || null,
      block_no: blockNo,
      location: alloc.blockName,
      scheme: allocSchemeKey,
      subject_code: allocCodeKey,
      subject_name: subject?.name || '',
      seat_numbers: seatNumbers,
      first_seat: firstSeat,
      last_seat: lastSeat,
      assigned_count: seatNumbers.length,
      strength: blockData?.strength ?? 0,
      supervisor_uid: alloc.supervisor || null,
      supervisor_name: supervisor?.name || '',
    });
  }

  if (unresolved.length > 0) {
    throw new Error(
      `No students matched for: ${unresolved.join(', ')}. No rows were written. Check that the subject codes and schemes on the timetable match the students.`,
    );
  }
  if (rows.length === 0) {
    throw new Error('No allocations to write.');
  }

  const { error } = await supabase.from('block_allocations').insert(rows);
  if (error) throw error;

  return { created: rows.length };
}

// ============================================================================
// UI components
// ============================================================================

interface BlockSummaryStripProps {
  totalBlocks: number;
  totalCapacity: number;
  totalSubjects: number;
  totalAllocated: number;
  remainingStudents: number;
}

function BlockSummaryStrip({
  totalBlocks,
  totalCapacity,
  totalSubjects,
  totalAllocated,
  remainingStudents,
}: BlockSummaryStripProps) {
  const progress =
    totalAllocated + remainingStudents > 0
      ? (totalAllocated / (totalAllocated + remainingStudents)) * 100
      : 0;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-6 border-y border-neutral-200 py-2 text-xs dark:border-neutral-800">
        <StatItem
          value={totalBlocks}
          label="blocks"
        />
        <Divider />
        <StatItem
          value={totalCapacity}
          label="capacity"
        />
        <Divider />
        <StatItem
          value={totalSubjects}
          label="subjects"
        />
        <Divider />
        <StatItem
          value={totalAllocated}
          label="assigned"
          highlighted
        />
        <Divider />
        <StatItem
          value={remainingStudents}
          label="remaining"
          isRemaining
        />
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
        <div
          className="bg-primary h-full transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

const StatItem = ({
  value,
  label,
  highlighted = false,
  isRemaining = false,
}: {
  value: number;
  label: string;
  highlighted?: boolean;
  isRemaining?: boolean;
}) => (
  <div className="flex items-center gap-2">
    <span
      className={cn(
        'font-mono text-sm font-semibold',
        highlighted && 'text-primary dark:text-primary',
        isRemaining && value > 0 && 'text-amber-600 dark:text-amber-400',
        isRemaining && value === 0 && 'text-primary dark:text-primary',
      )}
    >
      {value}
    </span>
    <span className="text-neutral-500">{label}</span>
  </div>
);

const Divider = () => <div className="h-3 w-px bg-neutral-200 dark:bg-neutral-800" />;

interface AvailableBlocksProps {
  blocks: Block[];
  isLoading?: boolean;
  selectedBlockId?: string;
  onSelectBlock?: (blockId: string) => void;
  allocatedBlocks?: Map<string, number>;
}

function AvailableBlocks({
  blocks,
  isLoading,
  selectedBlockId,
  onSelectBlock,
  allocatedBlocks,
}: AvailableBlocksProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        <SectionHeader title="Available Blocks" />
        <div className="flex gap-2 overflow-x-auto pb-1">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton
              key={i}
              className="h-16 w-28 shrink-0 rounded-md"
            />
          ))}
        </div>
      </div>
    );
  }

  if (blocks.length === 0) {
    return (
      <div className="space-y-2">
        <SectionHeader title="Available Blocks" />
        <EmptyState message="No blocks configured" />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <SectionHeader
        title="Available Blocks"
        badge={`${blocks.length} blocks`}
      />
      <div className="flex gap-2 overflow-x-auto pb-1">
        {blocks.map((block) => {
          const allocated = allocatedBlocks?.get(block.location) || 0;
          const remaining = block.strength - allocated;
          const isFull = remaining === 0;

          return (
            <BlockCard
              key={block.id}
              block={block}
              remaining={remaining}
              isFull={isFull}
              isSelected={selectedBlockId === block.location}
              onSelect={() => !isFull && onSelectBlock?.(block.location)}
            />
          );
        })}
      </div>
    </div>
  );
}

const SectionHeader = ({ title, badge }: { title: string; badge?: string }) => (
  <div className="flex items-center gap-2">
    <div className="h-1.5 w-1.5 rounded-full bg-neutral-400" />
    <h3 className="text-xs font-medium tracking-wide text-neutral-500 uppercase">{title}</h3>
    {badge && <span className="ml-auto text-[10px] text-neutral-400">{badge}</span>}
  </div>
);

const EmptyState = ({ message }: { message: string }) => (
  <div className="rounded-md border border-dashed border-neutral-200 bg-neutral-50 py-6 text-center dark:border-neutral-800 dark:bg-neutral-900/50">
    <p className="text-xs text-neutral-500">{message}</p>
  </div>
);

const BlockCard = ({
  block,
  remaining,
  isFull,
  isSelected,
  onSelect,
}: {
  block: Block;
  remaining: number;
  isFull: boolean;
  isSelected: boolean;
  onSelect: () => void;
}) => (
  <button
    onClick={onSelect}
    disabled={isFull}
    className={cn(
      'group relative flex h-16 w-28 shrink-0 flex-col items-center justify-center rounded-md border transition-all',
      isSelected
        ? 'border-neutral-800 bg-neutral-900 text-white dark:border-neutral-200 dark:bg-neutral-100 dark:text-neutral-900'
        : isFull
          ? 'cursor-not-allowed border-neutral-200 bg-neutral-100 text-neutral-400 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-600'
          : 'border-neutral-200 bg-white hover:border-neutral-300 hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950 dark:hover:border-neutral-700',
    )}
  >
    <span className="text-sm font-medium">{block.location}</span>
    <span
      className={cn(
        'text-xs',
        isSelected ? 'text-neutral-300 dark:text-neutral-500' : 'text-neutral-500',
      )}
    >
      {remaining}/{block.strength}
    </span>
    {isSelected && (
      <div className="bg-primary absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full">
        <Check className="h-2.5 w-2.5 text-white" />
      </div>
    )}
    {isFull && !isSelected && (
      <div className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-neutral-400">
        <X className="h-2.5 w-2.5 text-white" />
      </div>
    )}
  </button>
);

interface TimetableTableProps {
  entries: TimetableEntry[];
  date: string;
  session: string;
  isLoading?: boolean;
  onSelectScheme?: (scheme: string) => void;
  selectedScheme?: string;
  remainingStudents?: Map<string, number>;
}

function TimetableTable({
  entries,
  date,
  session,
  isLoading,
  onSelectScheme,
  selectedScheme,
  remainingStudents,
}: TimetableTableProps) {
  const totalStudents = useMemo(
    () => entries.reduce((sum, e) => sum + e.totalStudents, 0),
    [entries],
  );

  if (isLoading) {
    return (
      <div className="space-y-2">
        <SectionHeader title="Timetable" />
        <div className="rounded-md border border-neutral-200 dark:border-neutral-800">
          <div className="space-y-1 p-2">
            <Skeleton className="h-7 w-full" />
            <Skeleton className="h-7 w-full" />
            <Skeleton className="h-7 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="space-y-2">
        <SectionHeader title="Timetable" />
        <EmptyState message="No timetable entries" />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="h-1.5 w-1.5 rounded-full bg-neutral-400" />
        <h3 className="text-xs font-medium tracking-wide text-neutral-500 uppercase">Timetable</h3>
        <div className="ml-auto flex items-center gap-2">
          <Badge
            variant="secondary"
            className="h-5 text-[10px] font-normal"
          >
            {date}
          </Badge>
          <Badge
            variant="secondary"
            className="h-5 text-[10px] font-normal"
          >
            {session}
          </Badge>
          <span className="text-[10px] text-neutral-400">{totalStudents} total</span>
        </div>
      </div>

      <div className="overflow-hidden rounded-md border border-neutral-200 dark:border-neutral-800">
        <Table>
          <TableHeader className="bg-neutral-50 dark:bg-neutral-900">
            <TableRow className="border-b border-neutral-200 dark:border-neutral-800">
              <TableHead className="h-7 text-xs font-medium">Scheme</TableHead>
              <TableHead className="h-7 text-xs font-medium">Subject</TableHead>
              <TableHead className="h-7 w-20 text-right text-xs font-medium">Students</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => {
              const remaining = remainingStudents?.get(entry.scheme) ?? entry.totalStudents;
              const isCompleted = remaining === 0;

              return (
                <TableRow
                  key={entry.id}
                  className={cn(
                    'cursor-pointer transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-900',
                    selectedScheme === entry.scheme && 'bg-neutral-50 dark:bg-neutral-900',
                    isCompleted && 'opacity-50',
                  )}
                  onClick={() => !isCompleted && onSelectScheme?.(entry.scheme)}
                >
                  <TableCell className="py-2 font-mono text-xs">{entry.scheme}</TableCell>
                  <TableCell className="py-2">
                    <div className="flex items-center gap-2">
                      <code className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-[10px] dark:bg-neutral-800">
                        {entry.subjectCode}
                      </code>
                      <span className="text-xs text-neutral-500">{entry.subjectName}</span>
                    </div>
                  </TableCell>
                  <TableCell className="py-2 text-right font-mono text-xs">{remaining}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

interface AssignmentFormProps {
  blocks: Block[];
  supervisors: StaffMember[];
  timetable: TimetableEntry[];
  selectedScheme: string;
  selectedBlock: string;
  selectedSupervisor: string;
  candidateCount: number;
  onSchemeChange: (scheme: string) => void;
  onBlockChange: (block: string) => void;
  onSupervisorChange: (supervisor: string) => void;
  onCandidateCountChange: (count: number) => void;
  onSubmit: () => Promise<void>;
  isLoading?: boolean;
  isSubmitting?: boolean;
  blockRemainingCapacity?: Map<string, number>;
  schemeRemainingStudents?: Map<string, number>;
  localAllocations: LocalAllocation[];
  existingAllocationsByBlockScheme?: Set<string>;
  filterBySupervision: boolean;
  onFilterBySupervisionChange: (value: boolean) => void;
  hasSupervisionOrders: boolean;
  supervisionOrderSupervisors: Set<string>;
}

function AssignmentForm({
  blocks,
  supervisors,
  timetable,
  selectedScheme,
  selectedBlock,
  selectedSupervisor,
  candidateCount,
  onSchemeChange,
  onBlockChange,
  onSupervisorChange,
  onCandidateCountChange,
  onSubmit,
  isLoading,
  isSubmitting,
  blockRemainingCapacity,
  schemeRemainingStudents,
  localAllocations,
  existingAllocationsByBlockScheme,
  filterBySupervision,
  onFilterBySupervisionChange,
  supervisionOrderSupervisors,
  hasSupervisionOrders,
}: AssignmentFormProps) {
  const selectedTimetableEntry = timetable.find((t) => t.scheme === selectedScheme);
  const selectedBlockData = blocks.find((b) => b.location === selectedBlock);

  const blockRemaining =
    blockRemainingCapacity?.get(selectedBlock) ?? selectedBlockData?.strength ?? 0;
  const schemeRemaining =
    schemeRemainingStudents?.get(selectedScheme) ?? selectedTimetableEntry?.totalStudents ?? 0;

  const maxCandidates = Math.min(schemeRemaining, blockRemaining);
  const schemeDepartment = selectedScheme?.split('-')[0];

  const blockSupervisorMap = useMemo(() => {
    const map = new Map<string, string>();
    localAllocations.forEach((alloc) => {
      if (alloc.supervisor) map.set(alloc.blockName, alloc.supervisor);
    });
    return map;
  }, [localAllocations]);

  const lockedSupervisor = useMemo(
    () => blockSupervisorMap.get(selectedBlock) || null,
    [blockSupervisorMap, selectedBlock],
  );

  const isBlockLocked = useMemo(
    () => localAllocations.some((alloc) => alloc.blockName === selectedBlock),
    [localAllocations, selectedBlock],
  );

  const assignedSupervisorsSet = useMemo(() => {
    const set = new Set<string>();
    localAllocations.forEach((alloc) => {
      if (alloc.blockName !== selectedBlock && alloc.supervisor) set.add(alloc.supervisor);
    });
    return set;
  }, [localAllocations, selectedBlock]);

  const availableSchemes = useMemo(
    () =>
      timetable.filter(
        (entry) => (schemeRemainingStudents?.get(entry.scheme) ?? entry.totalStudents) > 0,
      ),
    [timetable, schemeRemainingStudents],
  );

  const filteredSupervisors = useMemo(() => {
    return supervisors.filter((sup) => {
      if (!schemeDepartment) return false;
      if (isBlockLocked && lockedSupervisor) return sup.uid === lockedSupervisor;
      if (!filterBySupervision && sup.department === schemeDepartment) return false;
      if (assignedSupervisorsSet.has(sup.uid)) return false;
      if (filterBySupervision && supervisionOrderSupervisors.size > 0) {
        return supervisionOrderSupervisors.has(sup.uid);
      }
      return true;
    });
  }, [
    supervisors,
    schemeDepartment,
    isBlockLocked,
    lockedSupervisor,
    assignedSupervisorsSet,
    filterBySupervision,
    supervisionOrderSupervisors,
  ]);

  useEffect(() => {
    if (isBlockLocked && lockedSupervisor) {
      if (selectedSupervisor !== lockedSupervisor) onSupervisorChange(lockedSupervisor);
    } else if (!isBlockLocked && selectedSupervisor) {
      onSupervisorChange('');
    }
  }, [isBlockLocked, lockedSupervisor, onSupervisorChange]);

  const isSchemeAlreadyInBlock = useMemo(
    () =>
      Boolean(
        selectedBlock &&
        selectedScheme &&
        existingAllocationsByBlockScheme?.has(`${selectedBlock}-${selectedScheme}`),
      ),
    [selectedBlock, selectedScheme, existingAllocationsByBlockScheme],
  );

  const showDepartmentWarning =
    selectedScheme &&
    selectedSupervisor &&
    supervisors.find((s) => s.uid === selectedSupervisor)?.department === schemeDepartment;

  const showSupervisorAllocatedWarning =
    selectedSupervisor && assignedSupervisorsSet.has(selectedSupervisor);

  const showNoSupervisorsWarning =
    selectedScheme && !isBlockLocked && filteredSupervisors.length === 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedScheme || !selectedBlock || !selectedSupervisor || candidateCount <= 0) {
      toast.error('Please fill all fields');
      return;
    }
    if (candidateCount > maxCandidates) {
      toast.error(`Cannot assign more than ${maxCandidates} candidates`);
      return;
    }
    if (isSchemeAlreadyInBlock) {
      toast.error(`Scheme ${selectedScheme} already assigned to block ${selectedBlock}`);
      return;
    }
    await onSubmit();
  };

  const isFormValid = useMemo(
    () =>
      Boolean(
        selectedScheme &&
        selectedBlock &&
        selectedSupervisor &&
        candidateCount > 0 &&
        maxCandidates > 0 &&
        !isSchemeAlreadyInBlock,
      ),
    [
      selectedScheme,
      selectedBlock,
      selectedSupervisor,
      candidateCount,
      maxCandidates,
      isSchemeAlreadyInBlock,
    ],
  );

  if (timetable.length === 0) {
    return (
      <div className="space-y-2">
        <SectionHeader title="Assignment" />
        <EmptyState message="Select a session first" />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <SectionHeader title="Assignment" />
        <div className="flex items-center gap-2">
          <label className="text-xs text-neutral-500">Supervision Orders</label>
          <Switch
            checked={filterBySupervision}
            onCheckedChange={() => onFilterBySupervisionChange(!filterBySupervision)}
          />
          {filterBySupervision && hasSupervisionOrders && (
            <Badge
              variant="outline"
              className="h-4 text-[10px]"
            >
              {supervisionOrderSupervisors.size} active
            </Badge>
          )}
        </div>
      </div>
      <div className="rounded-md border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-950">
        <form
          onSubmit={handleSubmit}
          className="space-y-3"
        >
          <FormSelect
            label="Scheme"
            value={selectedScheme}
            onValueChange={onSchemeChange}
            placeholder="Select scheme"
            items={availableSchemes.map((entry) => ({
              value: entry.scheme,
              label: entry.scheme,
              sublabel: `${entry.subjectCode} · ${schemeRemainingStudents?.get(entry.scheme) ?? entry.totalStudents} remaining`,
            }))}
          />

          <FormSelect
            label="Block"
            value={selectedBlock}
            onValueChange={onBlockChange}
            placeholder="Select block"
            items={blocks.map((block) => ({
              value: block.location,
              label: block.location,
              sublabel: `${block.name} · ${blockRemainingCapacity?.get(block.location) ?? block.strength} capacity`,
            }))}
          />

          <div className="space-y-1">
            <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
              Supervisor
            </label>
            <Select
              value={selectedSupervisor}
              onValueChange={onSupervisorChange}
              disabled={isBlockLocked}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue
                  placeholder={isBlockLocked ? 'Supervisor locked' : 'Select supervisor'}
                />
              </SelectTrigger>
              <SelectContent>
                {filteredSupervisors.map((sup) => (
                  <SelectItem
                    key={sup.id}
                    value={sup.uid}
                  >
                    <div className="flex w-full items-center justify-between gap-4">
                      <span className="font-medium">{sup.name}</span>
                      <span className="text-xs text-neutral-400">
                        {sup.uid} · {sup.department}
                      </span>
                    </div>
                  </SelectItem>
                ))}
                {filteredSupervisors.length === 0 && (
                  <div className="px-2 py-4 text-center text-xs text-neutral-500">
                    No available supervisors
                  </div>
                )}
              </SelectContent>
            </Select>

            {isBlockLocked && lockedSupervisor && (
              <p className="text-[10px] text-amber-600">
                Supervisor locked for this block ({lockedSupervisor}). Remove all allocations for
                this block to change.
              </p>
            )}
            {showDepartmentWarning && (
              <p className="text-[10px] text-red-500">
                Supervisor is from the same department as scheme ({schemeDepartment})
              </p>
            )}
            {showSupervisorAllocatedWarning && (
              <p className="text-[10px] text-amber-600">
                Supervisor already assigned to another block in this session
              </p>
            )}
            {showNoSupervisorsWarning && (
              <p className="text-[10px] text-amber-600">
                No available supervisors. Try selecting a different scheme or block.
              </p>
            )}
            {selectedScheme &&
              !isBlockLocked &&
              !showDepartmentWarning &&
              !showSupervisorAllocatedWarning &&
              filteredSupervisors.length > 0 && (
                <p className="text-[10px] text-neutral-500">
                  Select supervisor from different department than {schemeDepartment}
                </p>
              )}
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
              Candidates
            </label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                max={maxCandidates}
                value={candidateCount || ''}
                onChange={(e) => onCandidateCountChange(Number(e.target.value))}
                placeholder={`Max: ${maxCandidates}`}
                className="h-8 text-sm"
              />
              <Button
                type="submit"
                disabled={isSubmitting || isLoading || !isFormValid}
                size="sm"
                className="h-8 px-4"
              >
                {isSubmitting ? 'Assigning...' : 'Assign'}
              </Button>
            </div>
            {selectedScheme && selectedBlock && (
              <div className="flex justify-between text-[10px] text-neutral-500">
                <span>Students remaining: {schemeRemaining}</span>
                <span>Block capacity: {blockRemaining}</span>
              </div>
            )}
            {isSchemeAlreadyInBlock && (
              <p className="text-[10px] text-red-500">
                Scheme {selectedScheme} already assigned to block {selectedBlock}
              </p>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

const FormSelect = ({
  label,
  value,
  onValueChange,
  placeholder,
  items,
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  placeholder: string;
  items: Array<{ value: string; label: string; sublabel: string }>;
}) => (
  <div className="space-y-1">
    <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">{label}</label>
    <Select
      value={value}
      onValueChange={onValueChange}
    >
      <SelectTrigger className="h-8 text-sm">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem
            key={item.value}
            value={item.value}
          >
            <div className="flex w-full items-center justify-between gap-4">
              <span className="font-mono text-sm">{item.label}</span>
              <span className="text-xs text-neutral-400">{item.sublabel}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
);

interface DistributionTableProps {
  allocations: LocalAllocation[];
  onUpdate: () => Promise<void>;
  onClear: () => void;
  onRemoveAllocation: (id: string) => void;
  isLoading?: boolean;
  remainingStudents: number;
}

function DistributionTable({
  allocations,
  onUpdate,
  onClear,
  onRemoveAllocation,
  isLoading,
  remainingStudents,
}: DistributionTableProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const totalAllocated = allocations.reduce((sum, a) => sum + a.numberOfCandidates, 0);
  const canSubmit = remainingStudents === 0 && allocations.length > 0;

  const handleUpdate = async () => {
    if (!canSubmit) {
      toast.error(`Cannot submit: ${remainingStudents} students still need allocation`);
      return;
    }
    setIsUpdating(true);
    try {
      await onUpdate();
    } finally {
      setIsUpdating(false);
    }
  };

  if (allocations.length === 0) {
    return (
      <div className="space-y-2">
        <SectionHeader title="Block Distribution" />
        <EmptyState message="No allocations yet" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-1.5 rounded-full bg-neutral-400" />
          <h3 className="text-xs font-medium tracking-wide text-neutral-500 uppercase">
            Block Distribution
          </h3>
          <div className="flex items-center gap-1.5">
            <Badge
              variant="secondary"
              className="h-5 text-[10px] font-normal"
            >
              {allocations.length} allocations
            </Badge>
            <Badge
              variant="secondary"
              className="h-5 text-[10px] font-normal"
            >
              {totalAllocated} students
            </Badge>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            onClick={onClear}
            disabled={isLoading || isUpdating}
            size="sm"
            className="h-7 text-xs"
          >
            Clear all
          </Button>
          <Button
            onClick={handleUpdate}
            disabled={isLoading || isUpdating || !canSubmit}
            size="sm"
            className="h-7 px-3 text-xs"
          >
            {isUpdating ? 'Submitting...' : 'Submit all'}
          </Button>
        </div>
      </div>

      {!canSubmit && remainingStudents > 0 && (
        <Alert className="border-amber-600 bg-amber-50">
          <AlertCircle className="h-4 w-4 text-amber-600" />
          <span className="text-sm text-amber-600">
            {remainingStudents} student{remainingStudents !== 1 ? 's' : ''} still need allocation.
            Submit disabled until all students are allocated.
          </span>
        </Alert>
      )}

      <div className="overflow-hidden rounded-md border border-neutral-200 dark:border-neutral-800">
        <Table>
          <TableHeader className="bg-neutral-50 dark:bg-neutral-900">
            <TableRow className="border-b border-neutral-200 dark:border-neutral-800">
              <TableHead className="h-8 text-xs font-medium">Block</TableHead>
              <TableHead className="h-8 text-xs font-medium">Scheme</TableHead>
              <TableHead className="h-8 text-xs font-medium">Subject</TableHead>
              <TableHead className="h-8 text-xs font-medium">Supervisor</TableHead>
              <TableHead className="h-8 w-24 text-right text-xs font-medium">Students</TableHead>
              <TableHead className="h-8 w-10 text-right text-xs font-medium"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {allocations.map((alloc) => (
              <TableRow
                key={alloc.id}
                className="h-9 border-b border-neutral-100 dark:border-neutral-800"
              >
                <TableCell className="py-1.5 text-sm font-medium">
                  {alloc.blockName || 'Unknown'}
                </TableCell>
                <TableCell className="py-1.5 font-mono text-xs">{alloc.scheme}</TableCell>
                <TableCell className="py-1.5">
                  <code className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-[10px] dark:bg-neutral-800">
                    {alloc.subCode}
                  </code>
                </TableCell>
                <TableCell className="py-1.5 text-sm">{alloc.supervisor}</TableCell>
                <TableCell className="py-1.5 text-right font-mono text-sm font-medium">
                  {alloc.numberOfCandidates}
                </TableCell>
                <TableCell className="py-1.5 text-right">
                  <button
                    onClick={() => onRemoveAllocation(alloc.id)}
                    className="rounded p-1 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-red-600 dark:hover:bg-neutral-800"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function UnsaveChangesDialog({
  open,
  onClose,
  onDiscard,
  allocationCount,
}: {
  open: boolean;
  onClose: () => void;
  onDiscard: () => void;
  onContinue: () => void;
  allocationCount: number;
}) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={onClose}
    >
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-amber-500" />
            Discard Allocation Drafts?
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <p>
              You have <strong>{allocationCount}</strong> unsaved allocation draft
              {allocationCount !== 1 ? 's' : ''}.
            </p>
            <p>
              Changing the examination session will remove all draft allocations for the current
              session.
            </p>
            <p className="text-xs text-neutral-500">This action cannot be undone.</p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Continue Editing</AlertDialogCancel>
          <AlertDialogAction
            onClick={onDiscard}
            className="bg-red-600 hover:bg-red-700"
          >
            Discard Drafts
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ExistingAllocationsDialog({
  open,
  onClose,
  allocations,
  onNavigateToClear,
  onCancel,
}: {
  open: boolean;
  onClose: () => void;
  allocations: ExistingAllocation[];
  onNavigateToClear: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const totalStudents = allocations.reduce((sum, a) => sum + (a.assignedCount || 0), 0);

  const handleClearAndProceed = () => {
    onNavigateToClear();
    router.push('/exam-center/block-allocation/clear-allocation');
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={onClose}
    >
      <AlertDialogContent className="flex max-h-[90vh] max-w-4xl flex-col">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-amber-600">
            <AlertCircle className="h-5 w-5" />
            Existing Allocations Found
          </AlertDialogTitle>
        </AlertDialogHeader>

        <div className="flex flex-1 flex-col gap-4 overflow-hidden">
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            This date and session already has existing block allocations. You cannot create new
            allocations while existing ones exist.
          </p>

          <div className="flex-1 overflow-auto rounded-md border border-neutral-200">
            <Table>
              <TableHeader className="sticky top-0 bg-neutral-50">
                <TableRow>
                  <TableHead className="w-[100px] text-xs">Block</TableHead>
                  <TableHead className="w-[100px] text-xs">Scheme</TableHead>
                  <TableHead className="text-xs">Subject</TableHead>
                  <TableHead className="w-[80px] text-right text-xs">Students</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allocations.map((alloc, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="py-2 font-mono text-sm">
                      {alloc.blockName || 'Unknown'}
                    </TableCell>
                    <TableCell className="py-2 font-mono text-sm">{alloc.scheme}</TableCell>
                    <TableCell className="py-2 text-sm">
                      <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs dark:bg-neutral-800">
                        {alloc.subjectCode}
                      </code>
                    </TableCell>
                    <TableCell className="py-2 text-right text-sm font-medium">
                      {alloc.assignedCount || 0}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between border-t border-neutral-200 pt-3 dark:border-neutral-800">
            <p className="text-sm text-amber-600">
              You will be redirected to the allocation cleanup page to manage existing allocations.
            </p>
            <div className="rounded-md bg-neutral-100 px-3 py-1.5 dark:bg-neutral-800">
              <span className="text-sm font-medium">Total Students: </span>
              <span className="text-sm font-bold text-amber-600">{totalStudents}</span>
            </div>
          </div>
        </div>

        <AlertDialogFooter className="mt-4">
          <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleClearAndProceed}
            className="bg-amber-600 hover:bg-amber-700"
          >
            Go To Allocation Cleanup
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ============================================================================
// Main page
// ============================================================================

export default function BlockAllocationPage() {
  const { examCenter, isLoading: userLoading } = useUserInfo();
  const examCenterId = examCenter?.id;

  const [step, setStep] = useState<'select' | 'allocate'>('select');
  const [dates, setDates] = useState<Date[]>([]);
  const [sessions] = useState<string[]>(['Morning', 'Afternoon']);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedSession, setSelectedSession] = useState<string>('');
  const [isLoadingSession, setIsLoadingSession] = useState(false);

  const [blocks, setBlocks] = useState<Block[]>([]);
  const [supervisors, setSupervisors] = useState<StaffMember[]>([]);
  const [timetable, setTimetable] = useState<TimetableEntry[]>([]);
  const [localAllocations, setLocalAllocations] = useState<LocalAllocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [blocksLoading, setBlocksLoading] = useState(true);
  const [supervisorsLoading, setSupervisorsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [filterBySupervision, setFilterBySupervision] = useState(false);
  const [supervisionOrderSupervisors, setSupervisionOrderSupervisors] = useState<Set<string>>(
    new Set(),
  );

  const [selectedScheme, setSelectedScheme] = useState('');
  const [selectedBlock, setSelectedBlock] = useState('');
  const [selectedSupervisor, setSelectedSupervisor] = useState('');
  const [candidateCount, setCandidateCount] = useState<number>(0);

  const [blockAllocatedCount, setBlockAllocatedCount] = useState<Map<string, number>>(new Map());
  const [blockRemainingCapacity, setBlockRemainingCapacity] = useState<Map<string, number>>(
    new Map(),
  );
  const [schemeRemainingStudents, setSchemeRemainingStudents] = useState<Map<string, number>>(
    new Map(),
  );
  const [allocatedSupervisorsSet, setAllocatedSupervisorsSet] = useState<Set<string>>(new Set());
  const [existingAllocationsByBlockScheme, setExistingAllocationsByBlockScheme] = useState<
    Set<string>
  >(new Set());

  const [showExistingAllocations, setShowExistingAllocations] = useState(false);
  const [existingAllocations, setExistingAllocations] = useState<ExistingAllocation[]>([]);
  const [showUnsaveDialog, setShowUnsaveDialog] = useState(false);
  const [, setPendingSessionChange] = useState<{ date: string; session: string } | null>(null);

  const totalBlocks = blocks.length;
  const totalCapacity = blocks.reduce((sum, b) => sum + b.strength, 0);
  const totalSubjects = timetable.length;
  const totalAllocated = localAllocations.reduce((sum, a) => sum + a.numberOfCandidates, 0);
  const remainingStudents = Array.from(schemeRemainingStudents.values()).reduce((a, b) => a + b, 0);

  useEffect(() => {
    const newBlockAllocatedCount = new Map<string, number>();
    for (const block of blocks) newBlockAllocatedCount.set(block.location, 0);
    for (const alloc of localAllocations) {
      newBlockAllocatedCount.set(
        alloc.blockName,
        (newBlockAllocatedCount.get(alloc.blockName) || 0) + alloc.numberOfCandidates,
      );
    }
    setBlockAllocatedCount(newBlockAllocatedCount);

    const newBlockRemaining = new Map(blocks.map((b) => [b.location, b.strength]));
    for (const alloc of localAllocations) {
      const cur = newBlockRemaining.get(alloc.blockName) || 0;
      newBlockRemaining.set(alloc.blockName, cur - alloc.numberOfCandidates);
    }
    setBlockRemainingCapacity(newBlockRemaining);

    const newSchemeRemaining = new Map(timetable.map((t) => [t.scheme, t.totalStudents]));
    for (const alloc of localAllocations) {
      const cur = newSchemeRemaining.get(alloc.scheme) || 0;
      newSchemeRemaining.set(alloc.scheme, cur - alloc.numberOfCandidates);
    }
    setSchemeRemainingStudents(newSchemeRemaining);

    const newAllocatedSupervisors = new Set<string>();
    for (const alloc of localAllocations) newAllocatedSupervisors.add(alloc.supervisor);
    setAllocatedSupervisorsSet(newAllocatedSupervisors);

    const newExistingPairs = new Set<string>();
    for (const alloc of localAllocations)
      newExistingPairs.add(`${alloc.blockName}-${alloc.scheme}`);
    setExistingAllocationsByBlockScheme(newExistingPairs);
  }, [localAllocations, blocks, timetable]);

  useEffect(() => {
    if (!filterBySupervision || !selectedDate || !selectedSession) {
      setSupervisionOrderSupervisors(new Set());
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const result = examCenterId
          ? await fetchSupervisionOrders(supabase, examCenterId, selectedDate)
          : new Set<string>();
        if (!cancelled) setSupervisionOrderSupervisors(result);
      } catch (err) {
        if (!cancelled) {
          console.error('Error fetching supervision orders:', err);
          setSupervisionOrderSupervisors(new Set());
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filterBySupervision, selectedDate, selectedSession, examCenterId]);

  const loadSessionData = async (date: string, session: string, fromLocal: boolean = false) => {
    if (!examCenterId) return;
    setIsLoadingSession(true);
    try {
      const supabase = createClient();

      const existing = await fetchExistingAllocations(supabase, examCenterId, date, session);
      if (existing.length > 0 && !fromLocal) {
        setExistingAllocations(existing);
        setShowExistingAllocations(true);
        return;
      }

      const tt = await fetchTimetable(supabase, examCenterId, date, session);
      if (tt.length === 0) {
        toast.error(
          'No timetable entries found for this date and session. Please upload a timetable first.',
        );
        return;
      }

      const filteredTimetable = tt.filter((entry) => entry.totalStudents > 0);
      if (filteredTimetable.length === 0) {
        toast.error(
          'All timetable entries have zero students. Please check your seating chart data.',
        );
        return;
      }

      setTimetable(filteredTimetable);

      setLocalTimetable({
        date,
        session,
        entries: filteredTimetable.map((entry) => ({
          scheme: entry.scheme,
          subjectCode: entry.subjectCode,
          subjectName: entry.subjectName,
          totalStudents: entry.totalStudents,
          timeSlot: entry.timeSlot,
          allocatedCount: 0,
        })),
      });

      if (fromLocal) {
        const saved = getLocalAllocations();
        setLocalAllocations(saved);
        const supervisorSet = new Set<string>();
        saved.forEach((a) => a.supervisor && supervisorSet.add(a.supervisor));
        setAllocatedSupervisorsSet(supervisorSet);
      } else {
        clearLocalAllocations();
        setLocalAllocations([]);
        setAllocatedSupervisorsSet(new Set());
      }

      setSessionContext(date, session);
      setStep('allocate');
      setSelectedScheme('');
      setSelectedBlock('');
      setSelectedSupervisor('');
      setCandidateCount(0);
    } catch (err) {
      console.error('Error loading session:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setIsLoadingSession(false);
    }
  };

  useEffect(() => {
    if (!examCenterId) return;
    const savedContext = getSessionContext();
    if (savedContext && hasLocalData()) {
      setSelectedDate(savedContext.date);
      setSelectedSession(savedContext.session);
      void loadSessionData(savedContext.date, savedContext.session, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examCenterId]);

  useEffect(() => {
    if (!examCenterId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const supabase = createClient();
        const d = await fetchUniqueDates(supabase, examCenterId);
        if (!cancelled) setDates(d);
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : 'Failed to load dates');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [examCenterId]);

  useEffect(() => {
    if (!examCenterId) return;
    let cancelled = false;
    (async () => {
      setBlocksLoading(true);
      setSupervisorsLoading(true);
      try {
        const supabase = createClient();
        const [b, s] = await Promise.all([
          fetchBlocks(supabase, examCenterId),
          fetchSupervisors(supabase, examCenterId),
        ]);
        if (!cancelled) {
          setBlocks(b);
          setSupervisors(s);
        }
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : 'Failed to load blocks');
      } finally {
        if (!cancelled) {
          setBlocksLoading(false);
          setSupervisorsLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [examCenterId]);

  const handleNavigateToClear = () => {
    setShowExistingAllocations(false);
    clearLocalAllocations();
    clearLocalTimetable();
    clearSessionContext();
    setLocalAllocations([]);
  };

  const handleChangeSessionClick = () => {
    if (localAllocations.length > 0) {
      setShowUnsaveDialog(true);
    } else {
      clearLocalAllocations();
      clearLocalTimetable();
      clearSessionContext();
      setLocalAllocations([]);
      setSelectedScheme('');
      setSelectedBlock('');
      setSelectedSupervisor('');
      setCandidateCount(0);
      setStep('select');
    }
  };

  const handleDiscardAndChange = () => {
    clearLocalAllocations();
    clearLocalTimetable();
    clearSessionContext();
    setLocalAllocations([]);
    setSelectedScheme('');
    setSelectedBlock('');
    setSelectedSupervisor('');
    setCandidateCount(0);
    setBlockAllocatedCount(new Map());
    setBlockRemainingCapacity(new Map());
    setSchemeRemainingStudents(new Map());
    setAllocatedSupervisorsSet(new Set());
    setExistingAllocationsByBlockScheme(new Set());
    setTimetable([]);
    setShowUnsaveDialog(false);
    setPendingSessionChange(null);
    setStep('select');
    toast.success('All local data cleared. You can now select a new session.');
  };

  const handleAssign = async () => {
    if (!selectedScheme || !selectedBlock || !selectedSupervisor || candidateCount <= 0) {
      toast.error('Please fill all fields');
      return;
    }

    const blockSupervisor = localAllocations.find((a) => a.blockName === selectedBlock)?.supervisor;
    if (allocatedSupervisorsSet.has(selectedSupervisor) && blockSupervisor !== selectedSupervisor) {
      toast.error('Supervisor already assigned to another block in this session');
      return;
    }

    if (existingAllocationsByBlockScheme.has(`${selectedBlock}-${selectedScheme}`)) {
      toast.error(`Scheme ${selectedScheme} already assigned to block ${selectedBlock}`);
      return;
    }

    const schemeRemaining = schemeRemainingStudents.get(selectedScheme) || 0;
    const blockRemaining = blockRemainingCapacity.get(selectedBlock) || 0;
    const maxCandidates = Math.min(schemeRemaining, blockRemaining);
    if (candidateCount > maxCandidates) {
      toast.error(`Cannot assign more than ${maxCandidates} candidates`);
      return;
    }

    const selectedTimetableEntry = timetable.find((t) => t.scheme === selectedScheme);
    const schemeAllocations = localAllocations.filter((a) => a.scheme === selectedScheme);
    const totalAllocatedForScheme = schemeAllocations.reduce(
      (sum, a) => sum + a.numberOfCandidates,
      0,
    );
    const startFrom = totalAllocatedForScheme + 1;

    const newAllocation = addLocalAllocation({
      blockName: selectedBlock,
      scheme: selectedScheme,
      subCode: selectedTimetableEntry?.subjectCode || '',
      supervisor: selectedSupervisor,
      numberOfCandidates: candidateCount,
      startFrom,
      timeslot: selectedTimetableEntry?.timeSlot || '',
    });

    setLocalAllocations((prev) => [...prev, newAllocation]);
    updateLocalTimetable(selectedScheme, candidateCount);
    setSelectedScheme('');
    setSelectedBlock('');
    setSelectedSupervisor('');
    setAllocatedSupervisorsSet((prev) => new Set(prev).add(selectedSupervisor));
    setCandidateCount(0);
    toast.success(`Assigned ${candidateCount} students to ${selectedBlock} (saved locally)`);
  };

  const handleRemoveAllocation = (id: string) => {
    const allocation = localAllocations.find((a) => a.id === id);
    if (!allocation) return;

    removeLocalAllocation(id);
    setLocalAllocations((prev) => prev.filter((a) => a.id !== id));
    updateLocalTimetable(allocation.scheme, -allocation.numberOfCandidates);

    const remaining = localAllocations.filter((a) => a.id !== id);
    const stillUsed = remaining.some((a) => a.supervisor === allocation.supervisor);
    if (!stillUsed) {
      setAllocatedSupervisorsSet((prev) => {
        const next = new Set(prev);
        next.delete(allocation.supervisor);
        return next;
      });
    }
    toast.info('Allocation removed from local changes');
  };

  const handleSubmitAll = async () => {
    if (!examCenterId) return;
    if (localAllocations.length === 0) {
      toast.warning('No allocations to submit');
      return;
    }
    if (remainingStudents !== 0) {
      toast.error(`Cannot submit: ${remainingStudents} students still need allocation`);
      return;
    }
    const hasEmptySupervisor = localAllocations.some(
      (a) => !a.supervisor || a.supervisor.trim().length === 0,
    );
    if (hasEmptySupervisor) {
      toast.error('All allocations must have a supervisor assigned');
      return;
    }

    setIsSubmitting(true);
    try {
      const supabase = createClient();

      const existing = await fetchExistingAllocations(
        supabase,
        examCenterId,
        selectedDate,
        selectedSession,
      );
      if (existing.length > 0) {
        setExistingAllocations(existing);
        setShowExistingAllocations(true);
        toast.error('Existing allocations found for this session');
        return;
      }

      const payload: AllocationDraft[] = localAllocations.map((a) => ({
        blockName: a.blockName,
        scheme: a.scheme,
        subCode: a.subCode,
        supervisor: a.supervisor,
        numberOfCandidates: a.numberOfCandidates,
        startFrom: a.startFrom,
        timeslot: a.timeslot,
      }));

      await submitAllocations(supabase, examCenterId, selectedDate, selectedSession, payload);

      toast.success(`Successfully submitted ${localAllocations.length} allocations`);
      clearLocalAllocations();
      clearLocalTimetable();
      clearSessionContext();
      setLocalAllocations([]);
      setStep('select');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit allocations');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClearAllLocal = () => {
    if (localAllocations.length === 0) return;
    clearLocalAllocations();
    clearLocalTimetable();
    setLocalAllocations([]);
    toast.info('All local changes cleared');
  };

  const isLoadingAny = userLoading || loading || blocksLoading || supervisorsLoading;

  if (isLoadingAny && step === 'select') {
    return (
      <div className="mx-auto max-w-[1400px] space-y-5 px-6 py-5">
        <PageHeader
          title="Block Allocation"
          description="Loading..."
          icon={Calendar}
        />
        <Skeleton className="mx-auto h-80 w-full max-w-xl rounded-lg" />
      </div>
    );
  }

  if (step === 'select') {
    return (
      <div className="mx-auto max-w-[1400px] space-y-5 px-6 py-5">
        <PageHeader
          title="Block Allocation"
          description="Select examination date and session to begin"
          icon={Calendar}
        />
        <SessionSelector
          availableDates={dates}
          availableSessions={sessions}
          onSessionSelect={async (session: SessionInfo) => {
            setSelectedDate(session.date);
            setSelectedSession(session.session);
            await loadSessionData(session.date, session.session, false);
          }}
          compact
          isLoading={isLoadingSession}
          title="Select Examination Session"
          description="Choose a date and session to begin block allocation"
        />
        <ExistingAllocationsDialog
          open={showExistingAllocations}
          onClose={() => setShowExistingAllocations(false)}
          allocations={existingAllocations}
          onNavigateToClear={handleNavigateToClear}
          onCancel={() => setStep('select')}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 px-6 py-5">
      <PageHeader
        title="Block Allocation"
        description={`${format(new Date(selectedDate), 'dd MMMM yyyy')} · ${selectedSession}`}
        icon={Calendar}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={handleChangeSessionClick}
            className="h-7 text-xs"
          >
            <ChevronLeft className="mr-1 h-3 w-3" />
            Change Session
          </Button>
        }
      />

      <MSBTEContextBar
        season={examCenter?.season as 'Summer' | 'Winter'}
        year={examCenter?.examYear!}
      />

      <BlockSummaryStrip
        totalBlocks={totalBlocks}
        totalCapacity={totalCapacity}
        totalSubjects={totalSubjects}
        totalAllocated={totalAllocated}
        remainingStudents={remainingStudents}
      />

      <AvailableBlocks
        blocks={blocks}
        isLoading={blocksLoading}
        selectedBlockId={selectedBlock}
        onSelectBlock={setSelectedBlock}
        allocatedBlocks={blockAllocatedCount}
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.8fr_1fr]">
        <TimetableTable
          entries={timetable}
          date={format(new Date(selectedDate), 'dd MMM')}
          session={selectedSession}
          isLoading={isLoadingSession}
          selectedScheme={selectedScheme}
          onSelectScheme={(scheme) => {
            setSelectedScheme(scheme);
            setSelectedSupervisor('');
          }}
          remainingStudents={schemeRemainingStudents}
        />
        <AssignmentForm
          blocks={blocks}
          supervisors={supervisors}
          timetable={timetable}
          selectedScheme={selectedScheme}
          selectedBlock={selectedBlock}
          filterBySupervision={filterBySupervision}
          onFilterBySupervisionChange={setFilterBySupervision}
          hasSupervisionOrders={supervisionOrderSupervisors.size > 0}
          selectedSupervisor={selectedSupervisor}
          candidateCount={candidateCount}
          onSchemeChange={setSelectedScheme}
          onBlockChange={setSelectedBlock}
          localAllocations={localAllocations}
          onSupervisorChange={setSelectedSupervisor}
          onCandidateCountChange={setCandidateCount}
          supervisionOrderSupervisors={supervisionOrderSupervisors}
          onSubmit={handleAssign}
          isLoading={isLoadingSession}
          isSubmitting={isSubmitting}
          blockRemainingCapacity={blockRemainingCapacity}
          schemeRemainingStudents={schemeRemainingStudents}
          existingAllocationsByBlockScheme={existingAllocationsByBlockScheme}
        />
      </div>

      <DistributionTable
        allocations={localAllocations}
        onUpdate={handleSubmitAll}
        onClear={handleClearAllLocal}
        onRemoveAllocation={handleRemoveAllocation}
        isLoading={isLoadingSession}
        remainingStudents={remainingStudents}
      />

      <UnsaveChangesDialog
        open={showUnsaveDialog}
        onClose={() => setShowUnsaveDialog(false)}
        onDiscard={handleDiscardAndChange}
        onContinue={() => {
          setShowUnsaveDialog(false);
          setPendingSessionChange(null);
        }}
        allocationCount={localAllocations.length}
      />
    </div>
  );
}
