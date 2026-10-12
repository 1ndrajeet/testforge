// modules/exam-setup/qp-inventory.tsx
'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Download,
  Eye,
  Loader2,
  Package,
  RefreshCw,
  Search,
  Upload,
  X,
  XCircle,
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

import { UniversalFileUploader } from '@/components/shared/file-uploader';

// ============================================================================
// Types (public exports preserved)
// ============================================================================

export interface QPInventoryRecord {
  id: string;
  day: number | null;
  date: Date | string | null;
  session: string;
  subjectCode: string;
  subjectName: string; // not persisted; falls back to subjectCode
  scheme: string; // not persisted; empty
  expectedStudents: number;
  expectedPackets: number;
  receivedPackets: number;
  receivedQps: number;
  qpPerPacket: number;
  remainingPackets: number;
  damagedPackets: number; // not persisted; always 0
  receiptStatus?: string;
  receivedBy?: string | null;
  receivedAt?: Date | null;
}

export interface QPInventoryStats {
  totalPapers: number;
  totalPackets: number;
  totalStudents: number;
  receivedPackets: number;
  pendingPackets: number;
  damagedPackets: number;
  receiptRate: number;
  totalSubjects: number;
  totalExpectedPackets: number;
  totalReceivedPackets: number;
  completionRate: number;
}

// DB row shape (only columns that actually exist in qp_inventory)
interface QPInventoryRow {
  id: string;
  day: number | null;
  date: string | null;
  session: string | null;
  subject_code: string | null;
  expected_students: number | null;
  expected_packets: number | null;
  received_packets: number | null;
  received_qps: number | null;
  created_at: string;
  updated_at: string;
}

type SortColumn =
  | 'day'
  | 'subjectCode'
  | 'expectedStudents'
  | 'expectedPackets'
  | 'receivedPackets'
  | 'remainingPackets';

type SortDirection = 'asc' | 'desc';

type StatusFilter = 'all' | 'pending' | 'discrepancies' | 'completed';

interface Filters {
  search: string;
  session: string;
  status: StatusFilter;
}

// ============================================================================
// Constants & helpers
// ============================================================================

const PAGE_SIZE_OPTIONS = [10, 20, 25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 10;
const DEFAULT_QP_PER_PACKET = 50;
const EMPTY_FILTERS: Filters = { search: '', session: '', status: 'all' };

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-neutral-950';

// Numeric coercion that preserves legitimate zeros and only guards null/undefined/NaN.
function toNumber(value: unknown, fallback = 0): number {
  if (value === null || value === undefined) return fallback;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function mapInventoryRow(row: QPInventoryRow): QPInventoryRecord {
  const expectedPackets = toNumber(row.expected_packets);
  const receivedPackets = toNumber(row.received_packets);
  const expectedStudents = toNumber(row.expected_students);
  const receivedQps = toNumber(row.received_qps, receivedPackets * DEFAULT_QP_PER_PACKET);
  const subjectCode = row.subject_code || '';

  return {
    id: row.id,
    day: row.day,
    date: row.date ? new Date(row.date) : null,
    session: row.session || '',
    subjectCode,
    // subject_name is not stored in qp_inventory; use code as the display name.
    subjectName: subjectCode,
    scheme: '',
    expectedStudents,
    expectedPackets,
    receivedPackets,
    receivedQps,
    qpPerPacket: DEFAULT_QP_PER_PACKET,
    remainingPackets: Math.max(0, expectedPackets - receivedPackets),
    damagedPackets: 0,
    receiptStatus: undefined,
    receivedBy: null,
    receivedAt: null,
  };
}

// Status is purely derived from counts — never persisted.
function getRecordStatus(record: QPInventoryRecord): {
  kind: 'complete' | 'pending' | 'shortage' | 'excess' | 'empty';
  label: string;
} {
  const { expectedPackets, receivedPackets } = record;
  if (expectedPackets === 0) {
    // Zero expected: not automatically "complete".
    return receivedPackets > 0
      ? { kind: 'excess', label: 'Received (no expectation)' }
      : { kind: 'empty', label: 'No expectation' };
  }
  if (receivedPackets === 0) return { kind: 'pending', label: 'Pending' };
  if (receivedPackets < expectedPackets) return { kind: 'shortage', label: 'Shortage' };
  if (receivedPackets > expectedPackets) return { kind: 'excess', label: 'Excess' };
  return { kind: 'complete', label: 'Complete' };
}

function hasDiscrepancy(record: QPInventoryRecord): boolean {
  return record.expectedPackets > 0 && record.expectedPackets !== record.receivedPackets;
}

function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '""';
  let text = String(value);
  if (typeof value === 'string' && /^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function formatDate(value: Date | string | null): string {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ============================================================================
// Overview
// ============================================================================

function InventoryOverview({ stats }: { stats: QPInventoryStats }) {
  const items = [
    {
      label: 'Subjects',
      value: stats.totalSubjects.toLocaleString('en-IN'),
      hint: 'Inventory records',
    },
    {
      label: 'Expected packets',
      value: stats.totalExpectedPackets.toLocaleString('en-IN'),
      hint: `${stats.totalStudents.toLocaleString('en-IN')} students`,
    },
    {
      label: 'Received packets',
      value: stats.totalReceivedPackets.toLocaleString('en-IN'),
      hint: `${stats.receiptRate}% received`,
    },
    {
      label: 'Pending packets',
      value: stats.pendingPackets.toLocaleString('en-IN'),
      hint: stats.pendingPackets === 0 ? 'All received' : 'Awaiting receipt',
    },
  ];

  return (
    <section
      aria-labelledby="inventory-overview"
      className="mt-5"
    >
      <h2
        id="inventory-overview"
        className="sr-only"
      >
        Overall inventory totals
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
            <p className="mt-0.5 truncate text-xs text-neutral-500">{item.hint}</p>
          </div>
        ))}
      </dl>
    </section>
  );
}

// ============================================================================
// Status badge (text + color; color is never the only indicator)
// ============================================================================

function StatusBadge({ record }: { record: QPInventoryRecord }) {
  const status = getRecordStatus(record);
  const base =
    'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap';

  switch (status.kind) {
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
          {status.label}
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
          <XCircle
            aria-hidden
            className="h-3 w-3"
          />
          {status.label}
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
          <ArrowDown
            aria-hidden
            className="h-3 w-3"
          />
          {status.label}
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
          <ArrowUp
            aria-hidden
            className="h-3 w-3"
          />
          {status.label}
        </span>
      );
    default:
      return (
        <span className={cn(base, 'border-neutral-300 text-neutral-500 dark:border-neutral-700')}>
          —
        </span>
      );
  }
}

// ============================================================================
// Toolbar
// ============================================================================

function NativeSelect({
  id,
  label,
  value,
  onChange,
  children,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <label
        htmlFor={id}
        className="sr-only"
      >
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          'h-9 w-full rounded-md border bg-white px-3 text-sm text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100',
          value && value !== 'all'
            ? 'border-emerald-500/60 dark:border-emerald-500/50'
            : 'border-neutral-200 dark:border-neutral-800',
          FOCUS_RING,
        )}
      >
        {children}
      </select>
    </div>
  );
}

function InventoryToolbar({
  filters,
  activeFilterCount,
  refreshing,
  exporting,
  onFilterChange,
  onClearAll,
  onRefresh,
  onExport,
}: {
  filters: Filters;
  activeFilterCount: number;
  refreshing: boolean;
  exporting: boolean;
  onFilterChange: (patch: Partial<Filters>) => void;
  onClearAll: () => void;
  onRefresh: () => void;
  onExport: () => void;
}) {
  const baseId = useId();

  return (
    <div className="mt-6 space-y-3">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1">
          <label
            htmlFor={`${baseId}-search`}
            className="sr-only"
          >
            Search by subject code
          </label>
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-neutral-400"
          />
          <Input
            id={`${baseId}-search`}
            type="search"
            value={filters.search}
            onChange={(e) => onFilterChange({ search: e.target.value })}
            placeholder="Search subject code"
            autoComplete="off"
            className="h-9 pl-9"
          />
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:w-auto lg:grid-cols-[minmax(0,150px)_minmax(0,170px)]">
          <NativeSelect
            id={`${baseId}-session`}
            label="Filter by session"
            value={filters.session}
            onChange={(session) => onFilterChange({ session })}
          >
            <option value="">All sessions</option>
            <option value="Morning">Morning</option>
            <option value="Afternoon">Afternoon</option>
          </NativeSelect>

          <NativeSelect
            id={`${baseId}-status`}
            label="Filter by receipt status"
            value={filters.status}
            onChange={(status) => onFilterChange({ status: status as StatusFilter })}
          >
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="discrepancies">Discrepancies</option>
            <option value="completed">Completed</option>
          </NativeSelect>
        </div>

        <div className="flex items-center gap-1 lg:ml-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onExport}
            disabled={exporting}
            className="h-9 gap-1.5 text-xs"
          >
            {exporting ? (
              <Loader2
                aria-hidden
                className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
              />
            ) : (
              <Download
                aria-hidden
                className="h-3.5 w-3.5"
              />
            )}
            {exporting ? 'Exporting…' : 'Export CSV'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            disabled={refreshing}
            className="h-9 gap-1.5 text-xs"
          >
            <RefreshCw
              aria-hidden
              className={cn('h-3.5 w-3.5', refreshing && 'animate-spin motion-reduce:animate-none')}
            />
            Refresh
          </Button>
        </div>
      </div>

      {activeFilterCount > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-neutral-500">
            {activeFilterCount === 1 ? '1 filter active' : `${activeFilterCount} filters active`}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClearAll}
            className="h-7 gap-1.5 px-2 text-xs"
          >
            <X
              aria-hidden
              className="h-3.5 w-3.5"
            />
            Clear all
          </Button>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Table
// ============================================================================

function SortableHead({
  column,
  label,
  sortColumn,
  sortDirection,
  onSort,
  align = 'left',
  className,
}: {
  column: SortColumn;
  label: string;
  sortColumn: SortColumn;
  sortDirection: SortDirection;
  onSort: (column: SortColumn) => void;
  align?: 'left' | 'right';
  className?: string;
}) {
  const active = sortColumn === column;
  const Icon = !active ? ArrowUpDown : sortDirection === 'asc' ? ArrowUp : ArrowDown;

  return (
    <TableHead
      aria-sort={active ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={cn('h-10 px-4', align === 'right' && 'text-right', className)}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className={cn(
          'group inline-flex items-center gap-1 rounded text-xs font-medium',
          active
            ? 'text-emerald-700 dark:text-emerald-400'
            : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100',
          align === 'right' && 'flex-row-reverse',
          FOCUS_RING,
        )}
      >
        {label}
        <Icon
          aria-hidden
          className={cn(
            'h-3 w-3',
            !active && 'opacity-0 group-hover:opacity-60 group-focus-visible:opacity-60',
          )}
        />
      </button>
    </TableHead>
  );
}

function PacketCell({ expected, received }: { expected: number; received: number }) {
  const complete = expected > 0 && received >= expected;
  const shortage = expected > 0 && received < expected;
  const excess = expected > 0 && received > expected;

  return (
    <div className="flex items-baseline justify-end gap-1.5 tabular-nums">
      <span className="font-medium text-neutral-900 dark:text-neutral-100">
        {received.toLocaleString('en-IN')}
      </span>
      <span className="text-xs text-neutral-400">/</span>
      <span className="text-neutral-500">{expected.toLocaleString('en-IN')}</span>
      {shortage && (
        <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
          (−{expected - received})
        </span>
      )}
      {excess && (
        <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400">
          (+{received - expected})
        </span>
      )}
      {complete && received === expected && (
        <CheckCircle2
          aria-hidden
          className="h-3.5 w-3.5 text-emerald-500"
        />
      )}
    </div>
  );
}

function InventoryTable({
  entries,
  sortColumn,
  sortDirection,
  onSort,
  onOpen,
  busy,
}: {
  entries: QPInventoryRecord[];
  sortColumn: SortColumn;
  sortDirection: SortDirection;
  onSort: (column: SortColumn) => void;
  onOpen: (record: QPInventoryRecord) => void;
  busy: boolean;
}) {
  const head = { sortColumn, sortDirection, onSort };

  return (
    <div
      aria-busy={busy}
      className={cn(
        'overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm transition-opacity motion-reduce:transition-none dark:border-neutral-800 dark:bg-neutral-950',
        busy && 'opacity-60',
      )}
    >
      <div className="overflow-x-auto">
        <Table className="min-w-[860px]">
          <caption className="sr-only">
            Question paper inventory. Column headers are buttons that sort the filtered result set.
          </caption>
          <TableHeader className="bg-neutral-50 dark:bg-neutral-900/70">
            <TableRow className="hover:bg-transparent">
              <SortableHead
                column="day"
                label="Day"
                className="w-20"
                {...head}
              />
              <SortableHead
                column="subjectCode"
                label="Code"
                className="w-28"
                {...head}
              />
              <TableHead className="h-10 px-4 text-xs font-medium text-neutral-500">Date</TableHead>
              <TableHead className="h-10 px-4 text-xs font-medium text-neutral-500">
                Session
              </TableHead>
              <SortableHead
                column="expectedStudents"
                label="Students"
                align="right"
                className="w-24"
                {...head}
              />
              <SortableHead
                column="expectedPackets"
                label="Expected"
                align="right"
                className="w-24"
                {...head}
              />
              <SortableHead
                column="receivedPackets"
                label="Received"
                align="right"
                className="w-24"
                {...head}
              />
              <TableHead className="h-10 px-4 text-center text-xs font-medium text-neutral-500">
                Status
              </TableHead>
              <TableHead className="h-10 w-14 px-4 text-right">
                <span className="sr-only">Details</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((record) => (
              <TableRow
                key={record.id}
                onClick={() => onOpen(record)}
                className="h-12 cursor-pointer hover:bg-emerald-500/[0.04]"
              >
                <TableCell className="px-4 py-2.5 text-sm text-neutral-600 tabular-nums dark:text-neutral-400">
                  {record.day ? `Day ${record.day}` : '—'}
                </TableCell>
                <TableCell className="px-4 py-2.5">
                  <span className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs font-semibold text-neutral-800 dark:bg-neutral-800 dark:text-neutral-100">
                    {record.subjectCode || '—'}
                  </span>
                </TableCell>
                <TableCell className="px-4 py-2.5 text-sm whitespace-nowrap text-neutral-700 tabular-nums dark:text-neutral-300">
                  {formatDate(record.date)}
                </TableCell>
                <TableCell className="px-4 py-2.5 text-sm text-neutral-700 dark:text-neutral-300">
                  {record.session || '—'}
                </TableCell>
                <TableCell className="px-4 py-2.5 text-right text-sm text-neutral-700 tabular-nums dark:text-neutral-300">
                  {record.expectedStudents.toLocaleString('en-IN')}
                </TableCell>
                <TableCell className="px-4 py-2.5 text-right text-sm font-medium text-neutral-900 tabular-nums dark:text-neutral-100">
                  {record.expectedPackets.toLocaleString('en-IN')}
                </TableCell>
                <TableCell className="px-4 py-2.5">
                  <PacketCell
                    expected={record.expectedPackets}
                    received={record.receivedPackets}
                  />
                </TableCell>
                <TableCell className="px-4 py-2.5 text-center">
                  <StatusBadge record={record} />
                </TableCell>
                <TableCell className="px-4 py-2.5 text-right">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    aria-label={`View details for ${record.subjectCode || 'record'}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpen(record);
                    }}
                  >
                    <Eye
                      aria-hidden
                      className="h-4 w-4"
                    />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
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
      className="space-y-6"
    >
      <span className="sr-only">Loading inventory…</span>
      <div
        className="space-y-2"
        aria-hidden
      >
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <Skeleton
        className="h-20 w-full rounded-xl"
        aria-hidden
      />
      <Skeleton
        className="h-9 w-full"
        aria-hidden
      />
      <div
        className="space-y-2"
        aria-hidden
      >
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton
            key={i}
            className="h-12 w-full"
          />
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Pagination
// ============================================================================

function Pagination({
  page,
  totalPages,
  pageSize,
  total,
  overallTotal,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  totalPages: number;
  pageSize: number;
  total: number;
  overallTotal: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}) {
  const sizeId = useId();
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);
  const atStart = page <= 1;
  const atEnd = page >= totalPages;
  const fmt = (n: number) => n.toLocaleString('en-IN');

  return (
    <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <p
        aria-live="polite"
        className="text-sm text-neutral-600 dark:text-neutral-400"
      >
        Showing{' '}
        <span className="font-medium text-neutral-900 tabular-nums dark:text-neutral-100">
          {total === 0 ? '0' : `${fmt(rangeStart)}–${fmt(rangeEnd)}`}
        </span>{' '}
        of{' '}
        <span className="font-medium text-neutral-900 tabular-nums dark:text-neutral-100">
          {fmt(total)}
        </span>{' '}
        {total === 1 ? 'record' : 'records'}
        {total !== overallTotal && (
          <span className="text-neutral-500"> (filtered from {fmt(overallTotal)})</span>
        )}
      </p>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <div className="flex items-center gap-2">
          <label
            htmlFor={sizeId}
            className="text-sm text-neutral-600 dark:text-neutral-400"
          >
            Records per page
          </label>
          <select
            id={sizeId}
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className={cn(
              'h-8 rounded-md border border-neutral-200 bg-white px-2 text-sm tabular-nums dark:border-neutral-800 dark:bg-neutral-950',
              FOCUS_RING,
            )}
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option
                key={size}
                value={size}
              >
                {size}
              </option>
            ))}
          </select>
        </div>

        <nav
          aria-label="Pagination"
          className="flex items-center gap-1"
        >
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => onPageChange(1)}
            disabled={atStart}
            aria-label="First page"
          >
            <ChevronsLeft
              aria-hidden
              className="h-4 w-4"
            />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => onPageChange(page - 1)}
            disabled={atStart}
            aria-label="Previous page"
          >
            <ChevronLeft
              aria-hidden
              className="h-4 w-4"
            />
          </Button>
          <span className="min-w-24 px-2 text-center text-sm text-neutral-600 tabular-nums dark:text-neutral-400">
            Page {fmt(page)} of {fmt(totalPages)}
          </span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => onPageChange(page + 1)}
            disabled={atEnd}
            aria-label="Next page"
          >
            <ChevronRight
              aria-hidden
              className="h-4 w-4"
            />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => onPageChange(totalPages)}
            disabled={atEnd}
            aria-label="Last page"
          >
            <ChevronsRight
              aria-hidden
              className="h-4 w-4"
            />
          </Button>
        </nav>
      </div>
    </div>
  );
}

// ============================================================================
// Detail modal
// ============================================================================

function DetailItem({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <dt className="text-xs text-neutral-500">{label}</dt>
      <dd className="mt-1 text-sm break-words">{children}</dd>
    </div>
  );
}

function InventoryDetailModal({
  record,
  open,
  onOpenChange,
}: {
  record: QPInventoryRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!record) return null;

  const status = getRecordStatus(record);
  const discrepancy = record.expectedPackets - record.receivedPackets;
  const isUnder = discrepancy > 0;
  const isOver = discrepancy < 0;
  const qpPerPacket = record.qpPerPacket || DEFAULT_QP_PER_PACKET;
  const absDiscrepancy = Math.abs(discrepancy);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-mono text-lg">
            {record.subjectCode || 'Inventory record'}
          </DialogTitle>
          <DialogDescription>
            {record.day ? `Day ${record.day}` : 'Day not set'}
            {record.session ? `, ${record.session} session` : ''}
            {record.date ? `, ${formatDate(record.date)}` : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* Subject & exam details */}
          <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
            <DetailItem label="Subject code">
              <span className="font-mono font-semibold">{record.subjectCode || '—'}</span>
            </DetailItem>
            <DetailItem label="Date">
              <span className="tabular-nums">{formatDate(record.date)}</span>
            </DetailItem>
            <DetailItem label="Session">
              {record.session || <span className="text-neutral-400">Not recorded</span>}
            </DetailItem>
            <DetailItem label="Expected students">
              <span className="tabular-nums">
                {record.expectedStudents.toLocaleString('en-IN')}
              </span>
            </DetailItem>
          </dl>

          {/* Packet reconciliation */}
          <section
            aria-labelledby="reconciliation-heading"
            className="border-t border-neutral-200 pt-4 dark:border-neutral-800"
          >
            <h3
              id="reconciliation-heading"
              className="text-sm font-semibold"
            >
              Packet reconciliation
            </h3>
            <dl className="mt-3 grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-4">
              <DetailItem label="Expected">
                <span className="text-lg font-semibold tabular-nums">
                  {record.expectedPackets.toLocaleString('en-IN')}
                </span>
              </DetailItem>
              <DetailItem label="Received">
                <span className="text-lg font-semibold tabular-nums">
                  {record.receivedPackets.toLocaleString('en-IN')}
                </span>
              </DetailItem>
              <DetailItem label="Remaining">
                <span
                  className={cn(
                    'text-lg font-semibold tabular-nums',
                    record.remainingPackets > 0 && 'text-amber-600 dark:text-amber-400',
                  )}
                >
                  {record.remainingPackets.toLocaleString('en-IN')}
                </span>
              </DetailItem>
              <DetailItem label="QPs per packet">
                <span className="text-lg font-semibold tabular-nums">{qpPerPacket}</span>
              </DetailItem>
            </dl>
            <dl className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-2">
              <DetailItem label="Received question papers">
                <span className="tabular-nums">{record.receivedQps.toLocaleString('en-IN')}</span>
              </DetailItem>
              <DetailItem label="Estimated QPs expected">
                <span className="tabular-nums">
                  {(record.expectedPackets * qpPerPacket).toLocaleString('en-IN')}
                </span>
              </DetailItem>
            </dl>
          </section>

          {/* Discrepancy explanation */}
          {(isUnder || isOver) && (
            <section
              aria-labelledby="discrepancy-heading"
              className="rounded-lg border border-amber-500/30 bg-amber-500/[0.06] p-4"
            >
              <h3
                id="discrepancy-heading"
                className="text-sm font-semibold text-amber-800 dark:text-amber-300"
              >
                {isUnder ? 'Shortage detected' : 'Excess packets detected'}
              </h3>
              <dl className="mt-2 space-y-1 text-sm text-amber-800 dark:text-amber-300">
                <div className="flex justify-between gap-4">
                  <dt>Expected quantity</dt>
                  <dd className="font-medium tabular-nums">
                    {record.expectedPackets.toLocaleString('en-IN')} packets
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Actual received</dt>
                  <dd className="font-medium tabular-nums">
                    {record.receivedPackets.toLocaleString('en-IN')} packets
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>{isUnder ? 'Packets short' : 'Packets in excess'}</dt>
                  <dd className="font-medium tabular-nums">
                    {absDiscrepancy.toLocaleString('en-IN')}
                  </dd>
                </div>
                <div className="flex justify-between gap-4 border-t border-amber-500/20 pt-1.5">
                  <dt>Estimated question-paper difference</dt>
                  <dd className="font-medium tabular-nums">
                    {isUnder ? '−' : '+'}
                    {(absDiscrepancy * qpPerPacket).toLocaleString('en-IN')}
                  </dd>
                </div>
              </dl>
              <p className="mt-3 text-xs text-amber-700 dark:text-amber-400">
                Estimated values assume {qpPerPacket} question papers per packet. Verify the
                discrepancy with the distribution center before relying on these figures.
              </p>
            </section>
          )}

          {/* Completion / pending explanation */}
          {!isUnder && !isOver && (
            <section
              aria-labelledby="receipt-heading"
              className={cn(
                'rounded-lg border p-4',
                status.kind === 'complete'
                  ? 'border-emerald-500/30 bg-emerald-500/[0.06]'
                  : 'border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900/50',
              )}
            >
              <h3
                id="receipt-heading"
                className={cn(
                  'text-sm font-semibold',
                  status.kind === 'complete'
                    ? 'text-emerald-800 dark:text-emerald-300'
                    : 'text-neutral-800 dark:text-neutral-200',
                )}
              >
                {status.kind === 'complete'
                  ? 'All packets received'
                  : record.expectedPackets === 0
                    ? 'No packets expected'
                    : 'Awaiting packet receipt'}
              </h3>
              <p
                className={cn(
                  'mt-1 text-sm',
                  status.kind === 'complete'
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-neutral-600 dark:text-neutral-400',
                )}
              >
                {status.kind === 'complete'
                  ? `${record.receivedPackets.toLocaleString('en-IN')} packets received for ${record.expectedStudents.toLocaleString('en-IN')} expected students.`
                  : record.expectedPackets === 0
                    ? 'This record has no expected packet count, so completion cannot be determined.'
                    : `${record.receivedPackets.toLocaleString('en-IN')} of ${record.expectedPackets.toLocaleString('en-IN')} expected packets received so far.`}
              </p>
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Main component
// ============================================================================

export default function InventoryPage() {
  const { examCenter, isLoading: userLoading } = useUserInfo();
  const centerId = examCenter?.id;

  const [entries, setEntries] = useState<QPInventoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [hasData, setHasData] = useState<boolean | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const [selectedRecord, setSelectedRecord] = useState<QPInventoryRecord | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [sortColumn, setSortColumn] = useState<SortColumn>('day');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [exporting, setExporting] = useState(false);
  const exportingRef = useRef(false);
  const requestIdRef = useRef(0);

  // ── Fetch full inventory (client-side filtering/sorting/pagination) ──
  const fetchData = useCallback(async () => {
    if (!centerId) return;
    const requestId = ++requestIdRef.current;
    setLoading(true);
    try {
      const supabase = createClient();

      const countRes = await supabase
        .from('qp_inventory')
        .select('*', { count: 'exact', head: true })
        .eq('exam_center_id', centerId);

      if (requestId !== requestIdRef.current) return;
      if (countRes.error) throw countRes.error;

      const totalCount = countRes.count || 0;

      if (totalCount === 0) {
        setEntries([]);
        setHasData(false);
        setLoadError(null);
        return;
      }

      const recordsRes = await supabase
        .from('qp_inventory')
        .select(
          'id, day, date, session, subject_code, expected_students, expected_packets, received_packets, received_qps, created_at, updated_at',
        )
        .eq('exam_center_id', centerId)
        .order('day')
        .order('session')
        .order('subject_code');

      if (requestId !== requestIdRef.current) return;
      if (recordsRes.error) throw recordsRes.error;

      const mapped = ((recordsRes.data ?? []) as unknown as QPInventoryRow[]).map(mapInventoryRow);

      setEntries(mapped);
      setHasData(mapped.length > 0);
      setLoadError(null);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      const message = err instanceof Error ? err.message : 'Failed to load inventory';
      toast.error(message);
      setLoadError(message);
      setEntries([]);
      setHasData(false);
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        setLoaded(true);
      }
    }
  }, [centerId]);

  useEffect(() => {
    if (!userLoading && centerId) {
      void fetchData();
    }
  }, [fetchData, userLoading, centerId, refreshKey]);

  // ── Stats (overall, unaffected by filters) ──
  const stats = useMemo<QPInventoryStats | null>(() => {
    if (entries.length === 0) return null;

    let totalExpectedPackets = 0;
    let totalReceivedPackets = 0;
    let totalStudents = 0;

    for (const e of entries) {
      totalExpectedPackets += e.expectedPackets;
      totalReceivedPackets += e.receivedPackets;
      totalStudents += e.expectedStudents;
    }

    const pendingPackets = Math.max(0, totalExpectedPackets - totalReceivedPackets);
    const receiptRate =
      totalExpectedPackets > 0
        ? Math.round((totalReceivedPackets / totalExpectedPackets) * 100)
        : 0;

    return {
      totalPapers: entries.length,
      totalPackets: totalExpectedPackets,
      totalStudents,
      receivedPackets: totalReceivedPackets,
      pendingPackets,
      damagedPackets: 0,
      receiptRate,
      totalSubjects: entries.length,
      totalExpectedPackets,
      totalReceivedPackets,
      completionRate: receiptRate,
    };
  }, [entries]);

  // ── Filter → sort → paginate (client-side) ──
  const filteredEntries = useMemo(() => {
    const search = filters.search.trim().toLowerCase();

    return entries.filter((entry) => {
      if (filters.session && entry.session !== filters.session) return false;

      if (filters.status !== 'all') {
        const status = getRecordStatus(entry);
        if (filters.status === 'pending' && status.kind !== 'pending') return false;
        if (filters.status === 'completed' && status.kind !== 'complete') return false;
        if (filters.status === 'discrepancies' && !hasDiscrepancy(entry)) return false;
      }

      if (search) {
        const haystack = entry.subjectCode.toLowerCase();
        if (!haystack.includes(search)) return false;
      }

      return true;
    });
  }, [entries, filters]);

  const sortedEntries = useMemo(() => {
    const sorted = [...filteredEntries];
    const dir = sortDirection === 'asc' ? 1 : -1;

    sorted.sort((a, b) => {
      let av: string | number;
      let bv: string | number;

      switch (sortColumn) {
        case 'day':
          av = a.day ?? 0;
          bv = b.day ?? 0;
          break;
        case 'subjectCode':
          av = a.subjectCode;
          bv = b.subjectCode;
          break;
        case 'expectedStudents':
          av = a.expectedStudents;
          bv = b.expectedStudents;
          break;
        case 'expectedPackets':
          av = a.expectedPackets;
          bv = b.expectedPackets;
          break;
        case 'receivedPackets':
          av = a.receivedPackets;
          bv = b.receivedPackets;
          break;
        case 'remainingPackets':
          av = a.remainingPackets;
          bv = b.remainingPackets;
          break;
        default:
          return 0;
      }

      let primary: number;
      if (typeof av === 'number' && typeof bv === 'number') {
        primary = av - bv;
      } else {
        primary = String(av).localeCompare(String(bv), 'en', {
          numeric: true,
          sensitivity: 'base',
        });
      }
      if (primary !== 0) return primary * dir;

      // Stable tie-breakers keep pagination consistent.
      return (
        a.subjectCode.localeCompare(b.subjectCode, 'en', { numeric: true }) ||
        a.id.localeCompare(b.id)
      );
    });

    return sorted;
  }, [filteredEntries, sortColumn, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(sortedEntries.length / pageSize));
  const page_ = Math.min(page, totalPages);
  const paginatedEntries = useMemo(
    () => sortedEntries.slice((page_ - 1) * pageSize, page_ * pageSize),
    [sortedEntries, page_, pageSize],
  );

  const activeFilterCount = [
    filters.search,
    filters.session,
    filters.status !== 'all' ? filters.status : '',
  ].filter(Boolean).length;

  // ── Handlers ──
  const handleFilterChange = useCallback((patch: Partial<Filters>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
    setPage(1);
  }, []);

  const handleClearAll = useCallback(() => {
    setFilters(EMPTY_FILTERS);
    setPage(1);
  }, []);

  const handleSort = useCallback(
    (column: SortColumn) => {
      if (column === sortColumn) {
        setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortColumn(column);
        setSortDirection('asc');
      }
      setPage(1);
    },
    [sortColumn],
  );

  const handlePageSizeChange = useCallback((size: number) => {
    setPageSize(size);
    setPage(1);
  }, []);

  const handlePageChange = useCallback(
    (next: number) => setPage(Math.min(Math.max(1, next), totalPages)),
    [totalPages],
  );

  const handleRowClick = useCallback((record: QPInventoryRecord) => {
    setSelectedRecord(record);
    setModalOpen(true);
  }, []);

  const handleRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  const handleUploadSuccess = useCallback(() => {
    toast.success('Inventory uploaded successfully!');
    setShowUpload(false);
    setPage(1);
    handleRefresh();
  }, [handleRefresh]);

  // ── CSV export: all filtered records, correct escaping, single-flight ──
  const handleExport = useCallback(() => {
    if (exportingRef.current) return;
    if (sortedEntries.length === 0) {
      toast.error('No data to export');
      return;
    }

    exportingRef.current = true;
    setExporting(true);
    const toastId = toast.loading('Preparing CSV export…');

    try {
      const headers = [
        'Day',
        'Date',
        'Session',
        'Subject Code',
        'Students',
        'Expected Packets',
        'Received Packets',
        'Remaining Packets',
        'Received QPs',
        'Status',
      ];

      const lines = sortedEntries.map((entry) => {
        const status = getRecordStatus(entry);
        return [
          entry.day ?? '',
          formatDate(entry.date),
          entry.session,
          entry.subjectCode,
          entry.expectedStudents,
          entry.expectedPackets,
          entry.receivedPackets,
          entry.remainingPackets,
          entry.receivedQps,
          status.label,
        ]
          .map(csvCell)
          .join(',');
      });

      const csv = [headers.map(csvCell).join(','), ...lines].join('\r\n');
      const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stamp = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `qp-inventory-${examCenter?.code || 'export'}-${stamp}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);

      toast.success(`Exported ${sortedEntries.length.toLocaleString('en-IN')} records`, {
        id: toastId,
      });
    } catch (err) {
      toast.error(err instanceof Error ? `Export failed: ${err.message}` : 'Export failed', {
        id: toastId,
      });
    } finally {
      exportingRef.current = false;
      setExporting(false);
    }
  }, [sortedEntries, examCenter?.code]);

  const season = (examCenter?.season as 'Summer' | 'Winter') || 'Summer';
  const year = examCenter?.examYear ?? new Date().getFullYear();

  // ── Render states ──
  if (userLoading || !loaded) {
    return <TableSkeleton />;
  }

  if (!centerId) {
    return (
      <div>
        <PageHeader
          title="Question Paper Inventory"
          description="Manage question paper packets for your examination center."
          icon={Package}
        />
        <div className="mt-6">
          <PageEmpty
            title="No exam center found"
            description="Set up an exam center before managing question paper inventory."
          />
        </div>
      </div>
    );
  }

  if (loadError && !hasData) {
    return (
      <div>
        <PageHeader
          title="Question Paper Inventory"
          description="Manage question paper packets for your examination center."
          icon={Package}
        />
        <div
          role="alert"
          className="mt-8 rounded-xl border border-dashed border-red-500/30 px-6 py-12 text-center"
        >
          <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
            We couldn’t load the inventory
          </p>
          <p className="mt-1 text-sm break-words text-neutral-600 dark:text-neutral-400">
            {loadError}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-5 gap-1.5"
            onClick={handleRefresh}
            disabled={loading}
          >
            <RefreshCw
              aria-hidden
              className={cn('h-3.5 w-3.5', loading && 'animate-spin motion-reduce:animate-none')}
            />
            Try again
          </Button>
        </div>
      </div>
    );
  }

  // Upload / empty screen
  if (!hasData || showUpload) {
    return (
      <div>
        <PageHeader
          title="Question Paper Inventory"
          description={
            hasData
              ? 'Upload a new inventory file for this exam center.'
              : 'No inventory yet. Upload the MSBTE question paper inventory to begin.'
          }
          icon={Package}
          actions={
            hasData ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowUpload(false)}
              >
                Cancel
              </Button>
            ) : undefined
          }
        />

        <MSBTEContextBar
          season={season}
          year={year}
        />

        <div className="mt-5 rounded-xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
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
        description="Track expected and received question paper packets for every subject."
        icon={Package}
        actions={
          <Button
            size="sm"
            onClick={() => setShowUpload(true)}
            className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-500 dark:bg-emerald-500 dark:text-neutral-950 dark:hover:bg-emerald-400"
          >
            <Upload
              aria-hidden
              className="h-4 w-4"
            />
            Upload new
          </Button>
        }
      />

      <MSBTEContextBar
        season={season}
        year={year}
      />

      {stats && <InventoryOverview stats={stats} />}

      <InventoryToolbar
        filters={filters}
        activeFilterCount={activeFilterCount}
        refreshing={loading}
        exporting={exporting}
        onFilterChange={handleFilterChange}
        onClearAll={handleClearAll}
        onRefresh={handleRefresh}
        onExport={handleExport}
      />

      <div className="mt-4">
        {sortedEntries.length === 0 ? (
          <div className="rounded-xl border border-dashed border-neutral-300 py-6 dark:border-neutral-700">
            <PageEmpty
              title="No matching records"
              description={
                activeFilterCount > 0
                  ? 'No inventory records match your search or filters.'
                  : 'No inventory records available.'
              }
            />
            {activeFilterCount > 0 && (
              <div className="flex justify-center">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleClearAll}
                >
                  Clear all filters
                </Button>
              </div>
            )}
          </div>
        ) : (
          <InventoryTable
            entries={paginatedEntries}
            sortColumn={sortColumn}
            sortDirection={sortDirection}
            onSort={handleSort}
            onOpen={handleRowClick}
            busy={loading}
          />
        )}
      </div>

      <Pagination
        page={page_}
        totalPages={totalPages}
        pageSize={pageSize}
        total={sortedEntries.length}
        overallTotal={entries.length}
        onPageChange={handlePageChange}
        onPageSizeChange={handlePageSizeChange}
      />

      <InventoryDetailModal
        record={selectedRecord}
        open={modalOpen}
        onOpenChange={setModalOpen}
      />
    </div>
  );
}
