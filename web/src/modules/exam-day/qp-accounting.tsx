// app/(exam-center)/exam-day/qp-accounting/page.tsx
'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

import { format } from 'date-fns';
import {
  AlertTriangle,
  Calculator,
  Calendar,
  CheckCircle2,
  Download,
  Info,
  Loader2,
  Package,
  Printer,
  RefreshCw,
  Save,
  Search,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

import { useUserInfo } from '@/hooks/useUserInfo';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { PageEmpty, PageHeader } from '@/components/layout/page-layout';

// ─────────────────────────────────────────────────────────────
// Field semantics (verified against 0001_init.sql)
//
// qp_inventory columns: id, exam_center_id, day, date, session,
//   subject_code, expected_students, expected_packets,
//   received_packets, received_qps, created_at, updated_at.
//
// Confirmed business rule:
//   1 packet = 50 question papers.
//
// - received_packets = number of packets received (editable).
// - received_qps     = total question papers received (editable).
//   When the user edits received_packets, received_qps is auto-set to
//   received_packets * QP_PER_PACKET. Editing received_qps directly
//   leaves received_packets unchanged so a manual correction is not
//   silently overwritten.
// ─────────────────────────────────────────────────────────────

const QP_PER_PACKET = 50;

interface QPInventoryRecord {
  id: string;
  date: string;
  session: string;
  subjectCode: string;
  subjectName: string; // joined from `subjects`, not stored in qp_inventory
  scheme: string; // joined from `subjects`, not stored in qp_inventory
  expectedStudents: number;
  day: number | null;
  expectedPackets: number;
  receivedPackets: number;
  receivedQps: number;
}

interface QPInventoryStats {
  totalSubjects: number;
  totalExpectedStudents: number;
  totalExpectedPackets: number;
  totalReceivedPackets: number;
  totalReceivedQps: number;
  discrepancySubjects: number;
  netPacketDiscrepancy: number;
  completionRate: number;
}

type RecordStatus = 'complete' | 'shortage' | 'excess' | 'pending' | 'no-expectation';

type StatusFilter = 'all' | 'pending' | 'complete' | 'discrepancies';

interface Filters {
  search: string;
  status: StatusFilter;
}

const EMPTY_FILTERS: Filters = { search: '', status: 'all' };

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-neutral-950';

// ─────────────────────────────────────────────────────────────
// Derived status — single source of truth, used by the table,
// statistics, dialog, and CSV export.
// ─────────────────────────────────────────────────────────────

function getRecordStatus(record: {
  expectedPackets: number;
  receivedPackets: number;
}): RecordStatus {
  const { expectedPackets, receivedPackets } = record;
  if (expectedPackets === 0) {
    return receivedPackets > 0 ? 'excess' : 'no-expectation';
  }
  if (receivedPackets === 0) return 'pending';
  if (receivedPackets < expectedPackets) return 'shortage';
  if (receivedPackets > expectedPackets) return 'excess';
  return 'complete';
}

function hasDiscrepancy(record: { expectedPackets: number; receivedPackets: number }): boolean {
  return record.expectedPackets > 0 && record.expectedPackets !== record.receivedPackets;
}

// ─────────────────────────────────────────────────────────────
// Data access
// ─────────────────────────────────────────────────────────────

function dateToIsoDate(date: Date | string): string {
  if (typeof date === 'string') return date.split('T')[0];
  return date.toISOString().split('T')[0];
}

interface RawInventoryRow {
  id: string;
  day: number | null;
  date: string;
  session: string | null;
  subject_code: string | null;
  expected_students: number | null;
  expected_packets: number | null;
  received_packets: number | null;
  received_qps: number | null;
}

function toInt(value: unknown, fallback = 0): number {
  if (value === null || value === undefined) return fallback;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

async function fetchInventoryRecords(
  examCenterId: string,
  date: Date | string,
  session?: string,
): Promise<QPInventoryRecord[]> {
  const supabase = createClient();
  const dateStr = dateToIsoDate(date);

  let query = supabase
    .from('qp_inventory')
    .select(
      'id, day, date, session, subject_code, expected_students, expected_packets, received_packets, received_qps',
    )
    .eq('exam_center_id', examCenterId)
    .eq('date', dateStr);

  if (session && session !== 'All') {
    query = query.eq('session', session);
  }

  const { data, error } = await query.order('session').order('subject_code');
  if (error) throw error;
  if (!data || data.length === 0) return [];

  const rows = data as unknown as RawInventoryRow[];

  // Subject metadata is joined separately — subject_name and scheme do
  // not exist on qp_inventory.
  const codes = [...new Set(rows.map((r) => r.subject_code).filter(Boolean))] as string[];
  const subjectMap = new Map<string, { subjectName: string; scheme: string }>();

  if (codes.length > 0) {
    const { data: subjects, error: subErr } = await supabase
      .from('subjects')
      .select('code, name, scheme')
      .in('code', codes);

    if (!subErr && subjects) {
      for (const s of subjects) {
        if (!subjectMap.has(s.code)) {
          subjectMap.set(s.code, { subjectName: s.name || s.code, scheme: s.scheme || '' });
        }
      }
    }
  }

  return rows.map((r) => {
    const code = r.subject_code ?? '';
    const info = subjectMap.get(code) ?? { subjectName: code, scheme: '' };
    return {
      id: r.id,
      date: r.date,
      session: r.session ?? '',
      subjectCode: code,
      subjectName: info.subjectName,
      scheme: info.scheme,
      expectedStudents: toInt(r.expected_students),
      day: r.day ?? null,
      expectedPackets: toInt(r.expected_packets),
      receivedPackets: toInt(r.received_packets),
      receivedQps: toInt(r.received_qps),
    };
  });
}

// ─────────────────────────────────────────────────────────────
// Save — honest, non-atomic, per-row tracking
// ─────────────────────────────────────────────────────────────

interface SaveUpdate {
  id: string;
  receivedPackets: number;
  receivedQps: number;
}

interface SaveResult {
  succeeded: string[];
  failed: Array<{ id: string; message: string }>;
}

async function bulkSaveInventory(examCenterId: string, updates: SaveUpdate[]): Promise<SaveResult> {
  const supabase = createClient();
  const succeeded: string[] = [];
  const failed: Array<{ id: string; message: string }> = [];

  // Sequential, not Promise.all: we want per-row outcomes reported
  // accurately, and we do not want to hammer the API with N parallel
  // writes for a large inventory.
  for (const u of updates) {
    const { data, error } = await supabase
      .from('qp_inventory')
      .update({
        received_packets: u.receivedPackets,
        received_qps: u.receivedQps,
        updated_at: new Date().toISOString(),
      })
      .eq('id', u.id)
      .eq('exam_center_id', examCenterId)
      .select('id');

    if (error) {
      failed.push({ id: u.id, message: error.message });
    } else if ((data?.length ?? 0) === 0) {
      failed.push({ id: u.id, message: 'Row not found in this exam center' });
    } else {
      succeeded.push(u.id);
    }
  }

  return { succeeded, failed };
}

// ─────────────────────────────────────────────────────────────
// CSV helpers
// ─────────────────────────────────────────────────────────────

function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '""';
  let text = String(value);
  if (typeof value === 'string' && /^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

// ─────────────────────────────────────────────────────────────
// Overview
// ─────────────────────────────────────────────────────────────

function Overview({ stats }: { stats: QPInventoryStats }) {
  const fmt = (n: number) => n.toLocaleString('en-IN');
  const items = [
    { label: 'Subjects', value: fmt(stats.totalSubjects), hint: 'On this date' },
    { label: 'Expected students', value: fmt(stats.totalExpectedStudents), hint: '' },
    {
      label: 'Received packets',
      value: fmt(stats.totalReceivedPackets),
      hint: `of ${fmt(stats.totalExpectedPackets)} expected`,
    },
    {
      label: 'Received QPs',
      value: fmt(stats.totalReceivedQps),
      hint: 'Total across records',
    },
  ];

  return (
    <section
      aria-labelledby="qp-overview"
      className="mt-5"
    >
      <h2
        id="qp-overview"
        className="sr-only"
      >
        Inventory totals for the selected date
      </h2>
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-neutral-200 bg-neutral-200 sm:grid-cols-4 dark:border-neutral-800 dark:bg-neutral-800">
        {items.map((item) => (
          <div
            key={item.label}
            className="bg-white px-4 py-3.5 dark:bg-neutral-950"
          >
            <dt className="text-xs text-neutral-500">{item.label}</dt>
            <dd className="mt-1 text-xl font-semibold tracking-tight text-neutral-900 tabular-nums dark:text-neutral-50">
              {item.value}
            </dd>
            {item.hint && <p className="mt-0.5 truncate text-xs text-neutral-500">{item.hint}</p>}
          </div>
        ))}
      </dl>

      {(stats.discrepancySubjects > 0 || stats.completionRate !== 100) && (
        <p className="mt-2 text-xs text-neutral-500">
          {stats.completionRate}% of subjects complete
          {stats.discrepancySubjects > 0 && (
            <>
              {' · '}
              <span className="text-amber-600 dark:text-amber-400">
                {stats.discrepancySubjects}{' '}
                {stats.discrepancySubjects === 1
                  ? 'subject with a discrepancy'
                  : 'subjects with discrepancies'}
              </span>
            </>
          )}
        </p>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// Status badge — text + icon, never color alone
// ─────────────────────────────────────────────────────────────

function StatusBadge({ record }: { record: QPInventoryRecord }) {
  const status = getRecordStatus(record);
  const base =
    'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap';

  switch (status) {
    case 'complete':
      return (
        <span
          className={cn(
            base,
            'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
          )}
        >
          <CheckCircle2
            aria-hidden
            className="h-3 w-3"
          />
          Complete
        </span>
      );
    case 'shortage':
      return (
        <span
          className={cn(
            base,
            'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
          )}
        >
          <AlertTriangle
            aria-hidden
            className="h-3 w-3"
          />
          Shortage
        </span>
      );
    case 'excess':
      return (
        <span
          className={cn(
            base,
            'border-indigo-500/30 bg-indigo-500/10 text-indigo-700 dark:text-indigo-400',
          )}
        >
          Excess
        </span>
      );
    case 'pending':
      return (
        <span
          className={cn(
            base,
            'border-neutral-300 bg-neutral-100 text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300',
          )}
        >
          Pending
        </span>
      );
    default:
      return (
        <span className={cn(base, 'border-neutral-300 text-neutral-500 dark:border-neutral-700')}>
          No expectation
        </span>
      );
  }
}

// ─────────────────────────────────────────────────────────────
// Editable numeric input — keeps raw string while editing so an
// empty field does not silently become 0, and invalid input is
// never committed.
// ─────────────────────────────────────────────────────────────

function QuantityInput({
  id,
  label,
  value,
  disabled,
  invalid,
  onCommit,
}: {
  id: string;
  label: string;
  value: number;
  disabled?: boolean;
  invalid?: boolean;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string>(String(value));
  const [focused, setFocused] = useState(false);

  // Keep the draft in sync when the underlying value changes externally
  // (e.g. after a refresh) — but never while the user is editing.
  useEffect(() => {
    if (!focused) setDraft(String(value));
  }, [value, focused]);

  return (
    <Input
      id={id}
      type="number"
      inputMode="numeric"
      min={0}
      step={1}
      disabled={disabled}
      aria-label={label}
      value={draft}
      onChange={(e) => {
        const raw = e.target.value;
        setDraft(raw);
        // Only commit a valid, non-negative integer while typing.
        if (raw === '') return;
        const n = Number(raw);
        if (!Number.isFinite(n) || n < 0) return;
        onCommit(Math.trunc(n));
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        // On blur, normalise the draft to the committed value.
        setDraft(String(value));
      }}
      className={cn(
        'h-8 w-20 text-center font-mono text-sm tabular-nums',
        invalid && 'border-amber-500 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30',
        FOCUS_RING,
      )}
    />
  );
}

// ─────────────────────────────────────────────────────────────
// Table
// ─────────────────────────────────────────────────────────────

function InventoryTable({
  records,
  onUpdate,
  busy,
}: {
  records: QPInventoryRecord[];
  onUpdate: (id: string, field: 'receivedPackets' | 'receivedQps', value: number) => void;
  busy: boolean;
}) {
  const baseId = useId();

  return (
    <div
      aria-busy={busy}
      className={cn(
        'overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm transition-opacity motion-reduce:transition-none dark:border-neutral-800 dark:bg-neutral-950 print:border-0 print:shadow-none',
        busy && 'opacity-60',
      )}
    >
      <div className="overflow-x-auto">
        <Table className="min-w-[900px]">
          <caption className="sr-only">
            Question paper inventory for the selected date. Received packets and received question
            papers are editable.
          </caption>
          <TableHeader className="bg-neutral-50 dark:bg-neutral-900/70 print:bg-white">
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-10 px-4 text-xs font-medium text-neutral-500">Date</TableHead>
              <TableHead className="h-10 px-4 text-xs font-medium text-neutral-500">
                Session
              </TableHead>
              <TableHead className="h-10 px-4 text-xs font-medium text-neutral-500">Code</TableHead>
              <TableHead className="h-10 px-4 text-xs font-medium text-neutral-500">
                Subject
              </TableHead>
              <TableHead className="h-10 px-4 text-xs font-medium text-neutral-500">
                Scheme
              </TableHead>
              <TableHead className="h-10 px-4 text-right text-xs font-medium text-neutral-500">
                Expected students
              </TableHead>
              <TableHead className="h-10 px-4 text-right text-xs font-medium text-neutral-500">
                Expected packets
              </TableHead>
              <TableHead className="h-10 px-4 text-right text-xs font-medium text-neutral-500">
                Received packets
              </TableHead>
              <TableHead className="h-10 px-4 text-right text-xs font-medium text-neutral-500">
                Received QPs
              </TableHead>
              <TableHead className="h-10 px-4 text-center text-xs font-medium text-neutral-500">
                Status
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.map((record) => {
              const discrepancy = hasDiscrepancy(record);
              return (
                <TableRow
                  key={record.id}
                  className={cn(
                    'h-12',
                    discrepancy && 'bg-amber-500/[0.04] dark:bg-amber-500/[0.06]',
                  )}
                >
                  <TableCell className="px-4 py-2.5 text-sm text-neutral-600 tabular-nums dark:text-neutral-400">
                    {format(new Date(record.date), 'dd MMM')}
                  </TableCell>
                  <TableCell className="px-4 py-2.5 text-sm text-neutral-700 dark:text-neutral-300">
                    {record.session || '—'}
                  </TableCell>
                  <TableCell className="px-4 py-2.5">
                    <span className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs font-semibold text-neutral-800 dark:bg-neutral-800 dark:text-neutral-100 print:bg-transparent print:px-0">
                      {record.subjectCode || '—'}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-0 px-4 py-2.5">
                    <div
                      className="truncate text-sm"
                      title={record.subjectName}
                    >
                      {record.subjectName || '—'}
                    </div>
                  </TableCell>
                  <TableCell className="px-4 py-2.5 font-mono text-xs text-neutral-600 dark:text-neutral-400">
                    {record.scheme || '—'}
                  </TableCell>
                  <TableCell className="px-4 py-2.5 text-right text-sm text-neutral-700 tabular-nums dark:text-neutral-300">
                    {record.expectedStudents.toLocaleString('en-IN')}
                  </TableCell>
                  <TableCell className="px-4 py-2.5 text-right text-sm font-medium text-neutral-900 tabular-nums dark:text-neutral-100">
                    {record.expectedPackets.toLocaleString('en-IN')}
                  </TableCell>

                  {/* Received packets — editable, print shows text */}
                  <TableCell className="px-4 py-2.5 text-right">
                    <span className="hidden tabular-nums print:inline">
                      {record.receivedPackets.toLocaleString('en-IN')}
                    </span>
                    <span className="print:hidden">
                      <QuantityInput
                        id={`${baseId}-rp-${record.id}`}
                        label={`Received packets for ${record.subjectCode}`}
                        value={record.receivedPackets}
                        invalid={discrepancy}
                        onCommit={(v) => onUpdate(record.id, 'receivedPackets', v)}
                      />
                    </span>
                  </TableCell>

                  {/* Received QPs — editable, print shows text */}
                  <TableCell className="px-4 py-2.5 text-right">
                    <span className="hidden tabular-nums print:inline">
                      {record.receivedQps.toLocaleString('en-IN')}
                    </span>
                    <span className="print:hidden">
                      <QuantityInput
                        id={`${baseId}-rq-${record.id}`}
                        label={`Received question papers for ${record.subjectCode}`}
                        value={record.receivedQps}
                        onCommit={(v) => onUpdate(record.id, 'receivedQps', v)}
                      />
                    </span>
                  </TableCell>

                  <TableCell className="px-4 py-2.5 text-center">
                    <StatusBadge record={record} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="space-y-2"
    >
      <span className="sr-only">Loading inventory…</span>
      {Array.from({ length: 6 }, (_, i) => (
        <Skeleton
          key={i}
          className="h-12 w-full"
          aria-hidden
        />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Confirmation dialog
// ─────────────────────────────────────────────────────────────

function ConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  records,
  dirtyIds,
  isSubmitting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  records: QPInventoryRecord[];
  dirtyIds: Set<string>;
  isSubmitting: boolean;
}) {
  const dirty = records.filter((r) => dirtyIds.has(r.id));
  const discrepancies = dirty.filter(hasDiscrepancy);
  const complete = dirty.filter((r) => getRecordStatus(r) === 'complete');
  const hasDiscrepancies = discrepancies.length > 0;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent className="max-h-[88vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {hasDiscrepancies ? (
              <>
                <AlertTriangle
                  aria-hidden
                  className="h-5 w-5 text-amber-500"
                />
                Submit with discrepancies
              </>
            ) : (
              <>
                <CheckCircle2
                  aria-hidden
                  className="h-5 w-5 text-emerald-500"
                />
                Confirm submission
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {dirty.length === 0
              ? 'No changes to submit.'
              : `You are about to save ${dirty.length} ${
                  dirty.length === 1 ? 'record' : 'records'
                }.`}
          </DialogDescription>
        </DialogHeader>

        {dirty.length > 0 && (
          <div className="space-y-3 text-sm">
            <dl className="grid grid-cols-3 gap-3 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
              <div>
                <dt className="text-xs text-neutral-500">Records</dt>
                <dd className="text-lg font-semibold tabular-nums">{dirty.length}</dd>
              </div>
              <div>
                <dt className="text-xs text-neutral-500">Complete</dt>
                <dd className="text-lg font-semibold text-emerald-600 tabular-nums dark:text-emerald-400">
                  {complete.length}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-neutral-500">With discrepancies</dt>
                <dd
                  className={cn(
                    'text-lg font-semibold tabular-nums',
                    hasDiscrepancies
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-neutral-900 dark:text-neutral-100',
                  )}
                >
                  {discrepancies.length}
                </dd>
              </div>
            </dl>

            {hasDiscrepancies && (
              <div className="max-h-56 space-y-1.5 overflow-y-auto rounded-lg border border-amber-500/30 bg-amber-500/[0.06] p-3">
                {discrepancies.map((d) => {
                  const diff = d.expectedPackets - d.receivedPackets;
                  const qpDiff = Math.abs(diff) * QP_PER_PACKET;
                  return (
                    <div
                      key={d.id}
                      className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-xs"
                    >
                      <span className="font-mono font-semibold">{d.subjectCode}</span>
                      <span className="text-amber-800 tabular-nums dark:text-amber-300">
                        expected {d.expectedPackets.toLocaleString('en-IN')} · received{' '}
                        {d.receivedPackets.toLocaleString('en-IN')} (
                        {diff > 0
                          ? `−${diff.toLocaleString('en-IN')}`
                          : `+${Math.abs(diff).toLocaleString('en-IN')}`}
                        {qpDiff > 0 && (
                          <span className="text-amber-600 dark:text-amber-400">
                            {' '}
                            · {diff > 0 ? '−' : '+'}
                            {qpDiff.toLocaleString('en-IN')} QPs
                          </span>
                        )}
                        )
                      </span>
                    </div>
                  );
                })}
                <p className="mt-2 flex items-start gap-1.5 border-t border-amber-500/20 pt-2 text-xs text-amber-700 dark:text-amber-400">
                  <Info
                    aria-hidden
                    className="mt-0.5 h-3 w-3 shrink-0"
                  />
                  Each packet contains 50 question papers. Submitting records the quantities you
                  entered; it does not resolve the mismatch with the distribution center.
                </p>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isSubmitting || dirty.length === 0}
            className={cn(
              hasDiscrepancies &&
                'bg-amber-600 text-white hover:bg-amber-700 dark:bg-amber-500 dark:text-neutral-950 dark:hover:bg-amber-400',
            )}
          >
            {isSubmitting ? (
              <>
                <Loader2
                  aria-hidden
                  className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none"
                />
                Saving…
              </>
            ) : (
              <>
                <Save
                  aria-hidden
                  className="mr-2 h-4 w-4"
                />
                {hasDiscrepancies ? 'Submit with discrepancies' : 'Submit inventory'}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────

export default function QPAccountingPage() {
  const { examCenter, isLoading: userLoading } = useUserInfo();
  const examCenterId = examCenter?.id;

  const [records, setRecords] = useState<QPInventoryRecord[]>([]);
  const [initialReceipts, setInitialReceipts] = useState<Map<string, { rp: number; rq: number }>>(
    new Map(),
  );
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedSession, setSelectedSession] = useState<string>('');
  const [loadedScope, setLoadedScope] = useState<{ date: string; session: string } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const requestIdRef = useRef(0);
  const submittingRef = useRef(false);

  // ── Fetch ──
  const fetchInventory = useCallback(async () => {
    if (!examCenterId) return;
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setLoadError(null);

    try {
      const data = await fetchInventoryRecords(
        examCenterId,
        selectedDate,
        selectedSession || undefined,
      );
      if (requestId !== requestIdRef.current) return;

      setRecords(data);
      setInitialReceipts(
        new Map(data.map((r) => [r.id, { rp: r.receivedPackets, rq: r.receivedQps }])),
      );
      setLoadedScope({ date: selectedDate, session: selectedSession });
      setLoadError(null);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      const message = err instanceof Error ? err.message : 'Failed to load inventory';
      setLoadError(message);
      toast.error(message);
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        setLoaded(true);
      }
    }
  }, [examCenterId, selectedDate, selectedSession]);

  // Initial load only.
  useEffect(() => {
    if (!userLoading && examCenterId && !loaded) {
      void fetchInventory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userLoading, examCenterId]);

  // ── Derived ──
  const dirtyIds = useMemo(() => {
    const set = new Set<string>();
    for (const r of records) {
      const init = initialReceipts.get(r.id);
      if (!init) continue;
      if (init.rp !== r.receivedPackets || init.rq !== r.receivedQps) set.add(r.id);
    }
    return set;
  }, [records, initialReceipts]);

  const stats = useMemo<QPInventoryStats | null>(() => {
    if (records.length === 0) return null;
    let totalExpectedStudents = 0;
    let totalExpectedPackets = 0;
    let totalReceivedPackets = 0;
    let totalReceivedQps = 0;
    let discrepancySubjects = 0;
    let completed = 0;

    for (const r of records) {
      totalExpectedStudents += r.expectedStudents;
      totalExpectedPackets += r.expectedPackets;
      totalReceivedPackets += r.receivedPackets;
      totalReceivedQps += r.receivedQps;
      if (hasDiscrepancy(r)) discrepancySubjects += 1;
      if (getRecordStatus(r) === 'complete') completed += 1;
    }

    return {
      totalSubjects: records.length,
      totalExpectedStudents,
      totalExpectedPackets,
      totalReceivedPackets,
      totalReceivedQps,
      discrepancySubjects,
      netPacketDiscrepancy: totalReceivedPackets - totalExpectedPackets,
      completionRate: records.length > 0 ? Math.round((completed / records.length) * 100) : 0,
    };
  }, [records]);

  const filteredRecords = useMemo(() => {
    const search = filters.search.trim().toLowerCase();
    return records.filter((r) => {
      if (filters.status !== 'all') {
        const status = getRecordStatus(r);
        if (filters.status === 'pending' && status !== 'pending') return false;
        if (filters.status === 'complete' && status !== 'complete') return false;
        if (filters.status === 'discrepancies' && !hasDiscrepancy(r)) return false;
      }
      if (search) {
        const hay = `${r.subjectCode} ${r.subjectName}`.toLowerCase();
        if (!hay.includes(search)) return false;
      }
      return true;
    });
  }, [records, filters]);

  const activeFilterCount = [filters.search, filters.status !== 'all' ? filters.status : ''].filter(
    Boolean,
  ).length;

  const scopeStale =
    loadedScope !== null &&
    (loadedScope.date !== selectedDate || loadedScope.session !== selectedSession);

  // ── Handlers ──
  //
  // Editing received packets auto-sets received QPs (1 packet = 50 QPs).
  // Editing received QPs directly leaves received packets untouched so a
  // manual correction is preserved.
  const handleUpdate = useCallback(
    (id: string, field: 'receivedPackets' | 'receivedQps', value: number) => {
      setRecords((prev) =>
        prev.map((r) => {
          if (r.id !== id) return r;
          const v = Number.isFinite(value) && value >= 0 ? Math.trunc(value) : 0;
          if (field === 'receivedPackets') {
            return { ...r, receivedPackets: v, receivedQps: v * QP_PER_PACKET };
          }
          return { ...r, receivedQps: v };
        }),
      );
    },
    [],
  );

  const handleFetch = useCallback(() => {
    if (dirtyIds.size > 0) {
      const ok = window.confirm(
        `You have unsaved changes in ${dirtyIds.size} ${
          dirtyIds.size === 1 ? 'record' : 'records'
        }. Fetching will discard them. Continue?`,
      );
      if (!ok) return;
    }
    void fetchInventory();
  }, [dirtyIds, fetchInventory]);

  const handleRefresh = useCallback(() => {
    if (dirtyIds.size > 0) {
      const ok = window.confirm(
        `You have unsaved changes in ${dirtyIds.size} ${
          dirtyIds.size === 1 ? 'record' : 'records'
        }. Refreshing will discard them. Continue?`,
      );
      if (!ok) return;
    }
    void fetchInventory();
  }, [dirtyIds, fetchInventory]);

  const handleSubmitClick = useCallback(() => {
    if (dirtyIds.size === 0) {
      toast.info('No changes to submit.');
      return;
    }
    setShowConfirmDialog(true);
  }, [dirtyIds]);

  const handleConfirmSubmit = useCallback(async () => {
    if (!examCenterId || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setShowConfirmDialog(false);

    const updates = records
      .filter((r) => dirtyIds.has(r.id))
      .map((r) => ({
        id: r.id,
        receivedPackets: r.receivedPackets,
        receivedQps: r.receivedQps,
      }));

    try {
      const result = await bulkSaveInventory(examCenterId, updates);

      if (result.failed.length === 0) {
        toast.success(
          `Saved ${result.succeeded.length} ${
            result.succeeded.length === 1 ? 'record' : 'records'
          }.`,
        );
        await fetchInventory();
      } else {
        // Partial save: report honestly. Keep the in-memory records for
        // failed rows so the user can retry without re-entering.
        toast.error(
          `Saved ${result.succeeded.length} of ${updates.length}. ${result.failed.length} failed.`,
          {
            description: result.failed
              .slice(0, 3)
              .map((f) => {
                const rec = records.find((r) => r.id === f.id);
                return `${rec?.subjectCode ?? f.id}: ${f.message}`;
              })
              .join(' · '),
            duration: 8000,
          },
        );

        const failedIds = new Set(result.failed.map((f) => f.id));
        const pendingEdits = new Map(
          records
            .filter((r) => failedIds.has(r.id))
            .map((r) => [r.id, { rp: r.receivedPackets, rq: r.receivedQps }]),
        );

        const fresh = await fetchInventoryRecords(
          examCenterId,
          selectedDate,
          selectedSession || undefined,
        );
        const merged = fresh.map((r) => {
          const pending = pendingEdits.get(r.id);
          return pending ? { ...r, receivedPackets: pending.rp, receivedQps: pending.rq } : r;
        });
        setRecords(merged);
        setInitialReceipts(
          new Map(fresh.map((r) => [r.id, { rp: r.receivedPackets, rq: r.receivedQps }])),
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit inventory');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }, [examCenterId, records, dirtyIds, selectedDate, selectedSession, fetchInventory]);

  const handleExport = useCallback(() => {
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
      'Received QPs',
      'Status',
    ];
    const lines = records.map((r) =>
      [
        format(new Date(r.date), 'dd/MM/yyyy'),
        r.session,
        r.subjectCode,
        r.subjectName,
        r.scheme,
        r.expectedStudents,
        r.expectedPackets,
        r.receivedPackets,
        r.receivedQps,
        getRecordStatus(r),
      ]
        .map(csvCell)
        .join(','),
    );
    const csv = [headers.map(csvCell).join(','), ...lines].join('\r\n');
    const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `qp-accounting-${selectedDate}${
      selectedSession ? `-${selectedSession.toLowerCase()}` : ''
    }.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    toast.success(`Exported ${records.length} records`);
  }, [records, selectedDate, selectedSession]);

  const season = (examCenter?.season as 'Summer' | 'Winter') || 'Summer';
  const year = examCenter?.examYear ?? new Date().getFullYear();

  // ── Render ──
  if (userLoading || !loaded) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  if (!examCenterId) {
    return (
      <div>
        <PageHeader
          title="QP Accounting"
          description="Reconcile question paper packets for each examination session."
          icon={Calculator}
        />
        <div className="mt-6">
          <PageEmpty
            title="No exam center found"
            description="Set up an exam center before recording question paper receipts."
          />
        </div>
      </div>
    );
  }

  const showEmpty = !loadError && filteredRecords.length === 0;

  return (
    <div className="print:bg-white">
      <PageHeader
        title="QP Accounting"
        description="Record received question paper packets and question papers for the selected session."
        icon={Calculator}
      />

      <MSBTEContextBar
        season={season}
        year={year}
      />

      {/* Date / session selector */}
      <section
        aria-labelledby="qp-scope"
        className="mt-5 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950 print:hidden"
      >
        <h2
          id="qp-scope"
          className="sr-only"
        >
          Examination scope
        </h2>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-end">
            <div className="min-w-0">
              <label
                htmlFor="qp-date"
                className="mb-1 block text-xs font-medium text-neutral-500"
              >
                Examination date
              </label>
              <div className="flex items-center gap-2">
                <Input
                  id="qp-date"
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="h-9 w-44 tabular-nums"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedDate(format(new Date(), 'yyyy-MM-dd'))}
                  className="h-9 gap-1.5 text-xs"
                >
                  <Calendar
                    aria-hidden
                    className="h-3.5 w-3.5"
                  />
                  Today
                </Button>
              </div>
            </div>

            <div className="min-w-0">
              <label
                htmlFor="qp-session"
                className="mb-1 block text-xs font-medium text-neutral-500"
              >
                Session
              </label>
              <select
                id="qp-session"
                value={selectedSession}
                onChange={(e) => setSelectedSession(e.target.value)}
                className={cn(
                  'h-9 w-40 rounded-md border border-neutral-200 bg-white px-3 text-sm text-neutral-900 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100',
                  FOCUS_RING,
                )}
              >
                <option value="">All sessions</option>
                <option value="Morning">Morning</option>
                <option value="Afternoon">Afternoon</option>
              </select>
            </div>

            <Button
              type="button"
              onClick={handleFetch}
              disabled={loading || submitting}
              className="h-9 gap-1.5 bg-emerald-600 text-white hover:bg-emerald-500 dark:bg-emerald-500 dark:text-neutral-950 dark:hover:bg-emerald-400"
            >
              {loading ? (
                <Loader2
                  aria-hidden
                  className="h-4 w-4 animate-spin motion-reduce:animate-none"
                />
              ) : (
                <Package
                  aria-hidden
                  className="h-4 w-4"
                />
              )}
              {loading ? 'Loading…' : 'Fetch inventory'}
            </Button>
          </div>

          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={loading || submitting}
              className="h-9 gap-1.5 text-xs"
            >
              <RefreshCw
                aria-hidden
                className={cn('h-3.5 w-3.5', loading && 'animate-spin motion-reduce:animate-none')}
              />
              Refresh
            </Button>
          </div>
        </div>

        {scopeStale && !loading && (
          <p
            role="status"
            className="mt-3 flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400"
          >
            <Info
              aria-hidden
              className="h-3.5 w-3.5"
            />
            The selection has changed. Choose Fetch inventory to load{' '}
            {selectedSession || 'all sessions'} for {format(new Date(selectedDate), 'dd MMM yyyy')}.
          </p>
        )}
      </section>

      {stats && <Overview stats={stats} />}

      {/* Toolbar: search + status filter + export/print */}
      <div className="mt-6 flex flex-col gap-2 lg:flex-row lg:items-center print:hidden">
        <div className="relative min-w-0 flex-1">
          <label
            htmlFor="qp-search"
            className="sr-only"
          >
            Search by subject code or name
          </label>
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-neutral-400"
          />
          <Input
            id="qp-search"
            type="search"
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            placeholder="Search subject code or name"
            autoComplete="off"
            className="h-9 pl-9"
          />
        </div>

        <div className="flex items-center gap-2 lg:w-auto">
          <select
            aria-label="Filter by status"
            value={filters.status}
            onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value as StatusFilter }))}
            className={cn(
              'h-9 rounded-md border bg-white px-3 text-sm text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100',
              filters.status !== 'all'
                ? 'border-emerald-500/60 dark:border-emerald-500/50'
                : 'border-neutral-200 dark:border-neutral-800',
              FOCUS_RING,
            )}
          >
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="complete">Complete</option>
            <option value="discrepancies">Discrepancies</option>
          </select>

          {activeFilterCount > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setFilters(EMPTY_FILTERS)}
              className="h-9 gap-1.5 px-2 text-xs"
            >
              <X
                aria-hidden
                className="h-3.5 w-3.5"
              />
              Clear
            </Button>
          )}

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleExport}
            disabled={records.length === 0}
            className="h-9 gap-1.5 text-xs"
          >
            <Download
              aria-hidden
              className="h-3.5 w-3.5"
            />
            Export CSV
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => window.print()}
            disabled={records.length === 0}
            className="h-9 gap-1.5 text-xs"
          >
            <Printer
              aria-hidden
              className="h-3.5 w-3.5"
            />
            Print
          </Button>
        </div>
      </div>

      {/* Table / states */}
      <div className="mt-4">
        {loadError ? (
          <div
            role="alert"
            className="rounded-xl border border-dashed border-red-500/30 px-6 py-10 text-center"
          >
            <p className="text-sm font-medium">We couldn’t load inventory</p>
            <p className="mt-1 text-sm break-words text-neutral-600 dark:text-neutral-400">
              {loadError}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-4 gap-1.5"
              onClick={handleRefresh}
              disabled={loading}
            >
              <RefreshCw
                aria-hidden
                className="h-3.5 w-3.5"
              />
              Try again
            </Button>
          </div>
        ) : loading && records.length === 0 ? (
          <TableSkeleton />
        ) : showEmpty ? (
          <div className="rounded-xl border border-dashed border-neutral-300 py-6 dark:border-neutral-700">
            <PageEmpty
              title={records.length === 0 ? 'No inventory for this date' : 'No matching records'}
              description={
                records.length === 0
                  ? 'Upload the question paper inventory from the QP Inventory page, or pick a different date.'
                  : 'No records match the current search or status filter.'
              }
            />
            {activeFilterCount > 0 && records.length > 0 && (
              <div className="flex justify-center">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setFilters(EMPTY_FILTERS)}
                >
                  Clear filters
                </Button>
              </div>
            )}
          </div>
        ) : (
          <InventoryTable
            records={filteredRecords}
            onUpdate={handleUpdate}
            busy={loading}
          />
        )}
      </div>

      {/* Persistent submission bar */}
      {records.length > 0 && (
        <div className="mt-4 flex flex-col gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between dark:border-neutral-800 dark:bg-neutral-950 print:hidden">
          <p className="text-xs text-neutral-500">
            {dirtyIds.size === 0 ? (
              'No unsaved changes'
            ) : (
              <span className="font-medium text-neutral-800 dark:text-neutral-200">
                {dirtyIds.size} unsaved {dirtyIds.size === 1 ? 'change' : 'changes'}
              </span>
            )}
            {filteredRecords.length !== records.length && (
              <span className="text-neutral-500">
                {' '}
                · {filteredRecords.length} of {records.length} shown
              </span>
            )}
          </p>
          <Button
            type="button"
            onClick={handleSubmitClick}
            disabled={dirtyIds.size === 0 || submitting || loading}
            className="h-9 gap-1.5"
          >
            {submitting ? (
              <Loader2
                aria-hidden
                className="h-4 w-4 animate-spin motion-reduce:animate-none"
              />
            ) : (
              <Save
                aria-hidden
                className="h-4 w-4"
              />
            )}
            {submitting ? 'Saving…' : 'Submit inventory'}
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={showConfirmDialog}
        onOpenChange={setShowConfirmDialog}
        onConfirm={handleConfirmSubmit}
        records={records}
        dirtyIds={dirtyIds}
        isSubmitting={submitting}
      />
    </div>
  );
}
