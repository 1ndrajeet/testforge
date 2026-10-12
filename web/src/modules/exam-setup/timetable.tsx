// modules/exam-setup/timetable.tsx
'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

import { format } from 'date-fns';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Calendar,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Download,
  RefreshCw,
  Search,
  Sun,
  Sunset,
  Upload,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import { createClient } from '@/lib/supabase/client';
import { TimetableEntry, TimetableStats } from '@/lib/types';
import { cn } from '@/lib/utils';

import { Button } from '@/components/ui/button';
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
// Types & constants
// ============================================================================

interface TimetableRow {
  id: string;
  exam_day: number | null;
  date: string;
  session: string;
  time_slot: string | null;
  subject_code: string;
  subject_name: string | null;
  scheme: string;
  subject_abbr: string | null;
  total_students: number | null;
  absent_numbers: number[] | null;
  cps_students: number[] | null;
  created_at: string;
  updated_at: string;
}

interface ExamCenterRow {
  id: string;
  code: string | null;
  season?: string | null;
  exam_year?: number | null;
  examYear?: number | null;
}

interface Filters {
  search: string;
  session: string;
  scheme: string;
  date: string; // yyyy-MM-dd
}

type SortColumn =
  'examDay' | 'date' | 'session' | 'subjectCode' | 'subjectName' | 'scheme' | 'totalStudents';
type SortDirection = 'asc' | 'desc';

const PAGE_SIZE_OPTIONS = [10, 20, 25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 10;
const EMPTY_FILTERS: Filters = { search: '', session: '', scheme: '', date: '' };

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-neutral-950';

// ============================================================================
// Helpers
// ============================================================================

function mapTimetableRecord(t: TimetableRow): TimetableEntry {
  return {
    id: t.id,
    examDay: t.exam_day,
    date: new Date(t.date),
    session: t.session as TimetableEntry['session'],
    timeSlot: t.time_slot,
    subjectCode: t.subject_code,
    subjectName: t.subject_name,
    scheme: t.scheme,
    subjectAbbr: t.subject_abbr,
    // The existing data model treats a missing student count as 0.
    totalStudents: t.total_students || 0,
    absentNumbers: (t.absent_numbers as number[]) || [],
    cpsStudents: (t.cps_students as number[]) || [],
    createdAt: new Date(t.created_at),
    updatedAt: new Date(t.updated_at),
  } as TimetableEntry;
}

/** Overall statistics for the whole timetable (never affected by view filters). */
function computeStats(entries: TimetableEntry[]): TimetableStats {
  const subjects = new Set<string>();
  const schemes = new Set<string>();
  let examinees = 0;
  let totalAbsent = 0;
  let totalCps = 0;
  const timestamps: number[] = [];

  for (const e of entries) {
    if (e.subjectCode) subjects.add(e.subjectCode);
    if (e.scheme) schemes.add(e.scheme);
    examinees += e.totalStudents || 0;
    totalAbsent += Array.isArray(e.absentNumbers) ? e.absentNumbers.length : 0;
    totalCps += Array.isArray(e.cpsStudents) ? e.cpsStudents.length : 0;
    if (e.date) timestamps.push(e.date.getTime());
  }

  timestamps.sort((a, b) => a - b);
  const dateRange =
    timestamps.length > 0
      ? { min: new Date(timestamps[0]), max: new Date(timestamps[timestamps.length - 1]) }
      : null;

  return {
    totalEntries: entries.length,
    uniqueSubjects: subjects.size,
    uniqueSchemes: schemes.size,
    examinees,
    students: examinees,
    totalAbsent,
    totalCps,
    dateRange,
  } as TimetableStats;
}

function getDisplayName(entry: TimetableEntry): string {
  return entry.subjectName || String(entry.subjectAbbr ?? '').split('-')[0] || entry.subjectCode;
}

const SESSION_ORDER: Record<string, number> = { Morning: 0, Afternoon: 1 };

function compareValues(a: string | number, b: string | number): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), 'en', { numeric: true, sensitivity: 'base' });
}

function sortValue(entry: TimetableEntry, column: SortColumn): string | number {
  switch (column) {
    case 'examDay':
      return entry.examDay ?? 0;
    case 'date':
      return entry.date.getTime();
    case 'session':
      return SESSION_ORDER[entry.session] ?? 99;
    case 'subjectCode':
      return entry.subjectCode;
    case 'subjectName':
      return entry.subjectName || entry.subjectAbbr || '';
    case 'scheme':
      return entry.scheme;
    case 'totalStudents':
      return entry.totalStudents;
  }
}

function compareEntries(
  a: TimetableEntry,
  b: TimetableEntry,
  column: SortColumn,
  direction: SortDirection,
): number {
  const primary = compareValues(sortValue(a, column), sortValue(b, column));
  if (primary !== 0) return direction === 'asc' ? primary : -primary;
  // Deterministic tie-breakers keep pagination stable.
  return (
    a.date.getTime() - b.date.getTime() ||
    (SESSION_ORDER[a.session] ?? 99) - (SESSION_ORDER[b.session] ?? 99) ||
    compareValues(a.subjectCode, b.subjectCode)
  );
}

function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '""';
  let text = String(value);
  // Neutralise spreadsheet formula injection for text cells.
  if (typeof value === 'string' && /^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

// ============================================================================
// Summary strip (overall timetable, unaffected by filters)
// ============================================================================

function StatsStrip({ stats }: { stats: TimetableStats }) {
  const minDate = stats.dateRange?.min ? new Date(stats.dateRange.min) : null;
  const maxDate = stats.dateRange?.max ? new Date(stats.dateRange.max) : null;

  // Calendar span between first and last exam date, inclusive (unchanged semantics).
  const examDays =
    minDate && maxDate
      ? Math.ceil((maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
      : 0;

  const items = [
    {
      label: 'Subjects',
      value: stats.uniqueSubjects.toLocaleString('en-IN'),
      hint: 'Scheduled papers',
    },
    {
      label: 'Total examinees',
      value: (stats.examinees || stats.students || 0).toLocaleString('en-IN'),
      hint: 'Student appearances',
    },
    {
      label: 'Exam days',
      value: String(examDays),
      hint:
        minDate && maxDate
          ? `${format(minDate, 'dd MMM')} to ${format(maxDate, 'dd MMM')}`
          : 'No dates yet',
    },
    { label: 'Schemes', value: String(stats.uniqueSchemes), hint: 'Curriculums covered' },
  ];

  return (
    <section
      aria-labelledby="timetable-summary"
      className="mt-5"
    >
      <h2
        id="timetable-summary"
        className="sr-only"
      >
        Overall timetable summary
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
    <div>
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
          value
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

function ZeroStudentToggle({
  checked,
  zeroCount,
  onChange,
}: {
  checked: boolean;
  zeroCount: number;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn('inline-flex items-center gap-2.5 rounded-md py-1 text-sm', FOCUS_RING)}
    >
      <span
        aria-hidden
        className={cn(
          'relative h-5 w-9 shrink-0 rounded-full transition-colors motion-reduce:transition-none',
          checked ? 'bg-emerald-600' : 'bg-neutral-300 dark:bg-neutral-700',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform motion-reduce:transition-none',
            checked && 'translate-x-4',
          )}
        />
      </span>
      <span className="text-neutral-800 dark:text-neutral-200">Show records with 0 students</span>
      <span className="text-xs text-neutral-500 tabular-nums">{zeroCount}</span>
    </button>
  );
}

function TimetableToolbar({
  filters,
  schemes,
  showZero,
  zeroCount,
  activeFilterCount,
  refreshing,
  canExport,
  onFilterChange,
  onShowZeroChange,
  onClear,
  onRefresh,
  onExport,
}: {
  filters: Filters;
  schemes: string[];
  showZero: boolean;
  zeroCount: number;
  activeFilterCount: number;
  refreshing: boolean;
  canExport: boolean;
  onFilterChange: (patch: Partial<Filters>) => void;
  onShowZeroChange: (next: boolean) => void;
  onClear: () => void;
  onRefresh: () => void;
  onExport: () => void;
}) {
  const baseId = useId();

  return (
    <div
      className="mt-6 space-y-3"
      role="search"
      aria-label="Filter timetable"
    >
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_150px_150px_160px]">
        <div className="relative sm:col-span-2 lg:col-span-1">
          <label
            htmlFor={`${baseId}-search`}
            className="sr-only"
          >
            Search by subject code or name
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
            placeholder="Search subject code or name"
            autoComplete="off"
            className="h-9 pl-9"
          />
        </div>

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
          id={`${baseId}-scheme`}
          label="Filter by scheme"
          value={filters.scheme}
          onChange={(scheme) => onFilterChange({ scheme })}
        >
          <option value="">All schemes</option>
          {schemes.map((s) => (
            <option
              key={s}
              value={s}
            >
              {s}
            </option>
          ))}
        </NativeSelect>

        <div>
          <label
            htmlFor={`${baseId}-date`}
            className="sr-only"
          >
            Filter by exam date
          </label>
          <Input
            id={`${baseId}-date`}
            type="date"
            value={filters.date}
            onChange={(e) => onFilterChange({ date: e.target.value })}
            className={cn(
              'h-9 tabular-nums',
              filters.date && 'border-emerald-500/60 dark:border-emerald-500/50',
            )}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <ZeroStudentToggle
            checked={showZero}
            zeroCount={zeroCount}
            onChange={onShowZeroChange}
          />
          {activeFilterCount > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClear}
              className="h-8 gap-1.5 px-2 text-xs"
            >
              <X
                aria-hidden
                className="h-3.5 w-3.5"
              />
              Clear {activeFilterCount === 1 ? 'filter' : `${activeFilterCount} filters`}
            </Button>
          )}
        </div>

        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onExport}
            disabled={!canExport}
            className="h-8 gap-1.5 text-xs"
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
            onClick={onRefresh}
            disabled={refreshing}
            className="h-8 gap-1.5 text-xs"
          >
            <RefreshCw
              aria-hidden
              className={cn('h-3.5 w-3.5', refreshing && 'animate-spin motion-reduce:animate-none')}
            />
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </Button>
        </div>
      </div>
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

function SessionCell({ entry }: { entry: TimetableEntry }) {
  const morning = entry.session === 'Morning';
  const Icon = morning ? Sun : Sunset;
  return (
    <div className="flex flex-col">
      <span className="inline-flex items-center gap-1.5 text-sm text-neutral-800 dark:text-neutral-200">
        <Icon
          aria-hidden
          className={cn(
            'h-3.5 w-3.5',
            morning ? 'text-amber-500' : 'text-indigo-500 dark:text-indigo-400',
          )}
        />
        {entry.session}
      </span>
      {entry.timeSlot && (
        <span className="mt-0.5 pl-5 text-xs text-neutral-500 tabular-nums">{entry.timeSlot}</span>
      )}
    </div>
  );
}

function TimetableTable({
  entries,
  sortColumn,
  sortDirection,
  onSort,
  busy,
}: {
  entries: TimetableEntry[];
  sortColumn: SortColumn;
  sortDirection: SortDirection;
  onSort: (column: SortColumn) => void;
  busy: boolean;
}) {
  const head = { sortColumn, sortDirection, onSort };

  return (
    <div
      aria-busy={busy}
      className={cn(
        'overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm transition-opacity motion-reduce:transition-none dark:border-neutral-800 dark:bg-neutral-950',
        busy && 'opacity-70',
      )}
    >
      <div className="overflow-x-auto">
        <Table className="min-w-[780px]">
          <caption className="sr-only">
            Examination timetable. Column headers are buttons that sort the table.
          </caption>
          <TableHeader className="bg-neutral-50 dark:bg-neutral-900/70">
            <TableRow className="hover:bg-transparent">
              <SortableHead
                column="examDay"
                label="Day"
                className="w-20"
                {...head}
              />
              <SortableHead
                column="date"
                label="Date"
                className="w-40"
                {...head}
              />
              <SortableHead
                column="session"
                label="Session"
                className="w-36"
                {...head}
              />
              <SortableHead
                column="subjectCode"
                label="Code"
                className="w-28"
                {...head}
              />
              <SortableHead
                column="subjectName"
                label="Subject"
                {...head}
              />
              <SortableHead
                column="scheme"
                label="Scheme"
                className="w-24"
                {...head}
              />
              <SortableHead
                column="totalStudents"
                label="Students"
                align="right"
                className="w-28"
                {...head}
              />
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => {
              const name = getDisplayName(entry);
              return (
                <TableRow
                  key={entry.id}
                  className="h-12 hover:bg-emerald-500/[0.04]"
                >
                  <TableCell className="px-4 py-2.5 text-sm text-neutral-600 tabular-nums dark:text-neutral-400">
                    {entry.examDay ? `Day ${entry.examDay}` : '—'}
                  </TableCell>
                  <TableCell className="px-4 py-2.5 text-sm whitespace-nowrap text-neutral-800 tabular-nums dark:text-neutral-200">
                    {format(entry.date, 'EEE, dd MMM yyyy')}
                  </TableCell>
                  <TableCell className="px-4 py-2.5">
                    <SessionCell entry={entry} />
                  </TableCell>
                  <TableCell className="px-4 py-2.5">
                    <span className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs font-semibold text-neutral-800 dark:bg-neutral-800 dark:text-neutral-100">
                      {entry.subjectCode}
                    </span>
                  </TableCell>
                  <TableCell className="w-full max-w-0 px-4 py-2.5">
                    <div
                      className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100"
                      title={name}
                    >
                      {name}
                    </div>
                  </TableCell>
                  <TableCell className="px-4 py-2.5 font-mono text-xs text-neutral-600 dark:text-neutral-400">
                    {entry.scheme}
                  </TableCell>
                  <TableCell
                    className={cn(
                      'px-4 py-2.5 text-right text-sm font-semibold tabular-nums',
                      entry.totalStudents === 0
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-neutral-900 dark:text-neutral-100',
                    )}
                  >
                    {entry.totalStudents.toLocaleString('en-IN')}
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
      className="space-y-6"
      role="status"
      aria-live="polite"
    >
      <span className="sr-only">Loading timetable…</span>
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
  zeroHidden,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  totalPages: number;
  pageSize: number;
  total: number;
  overallTotal: number;
  zeroHidden: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}) {
  const sizeId = useId();
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);
  const atStart = page <= 1;
  const atEnd = page >= totalPages;

  return (
    <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <p
        aria-live="polite"
        className="text-sm text-neutral-600 dark:text-neutral-400"
      >
        Showing{' '}
        <span className="font-medium text-neutral-900 tabular-nums dark:text-neutral-100">
          {total === 0 ? '0' : `${rangeStart}–${rangeEnd}`}
        </span>{' '}
        of{' '}
        <span className="font-medium text-neutral-900 tabular-nums dark:text-neutral-100">
          {total}
        </span>{' '}
        {total === 1 ? 'record' : 'records'}
        {total !== overallTotal && (
          <span className="text-neutral-500"> (of {overallTotal} in the timetable)</span>
        )}
        {zeroHidden && (
          <span className="text-neutral-500">. Records with 0 students are hidden.</span>
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
            Page {page} of {totalPages}
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
// Main component
// ============================================================================

export default function TimetablePage() {
  const [examCenter, setExamCenter] = useState<ExamCenterRow | null>(null);
  const [entries, setEntries] = useState<TimetableEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);

  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [showZero, setShowZero] = useState(true);
  const [sortColumn, setSortColumn] = useState<SortColumn>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);

  const requestIdRef = useRef(0);

  // ── Data fetching (unchanged scoping: signed-in owner → their exam center) ──
  const fetchData = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (requestId !== requestIdRef.current) return;

      if (userError || !user) {
        toast.error('Unauthorized');
        setLoadError('You need to be signed in to view the timetable.');
        return;
      }

      const { data: center, error: centerErr } = await supabase
        .from('exam_centers')
        .select('*')
        .eq('owner_id', user.id)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (requestId !== requestIdRef.current) return;

      if (centerErr || !center) {
        setExamCenter(null);
        setEntries([]);
        setLoadError(null);
        return;
      }

      const centerRow = center as unknown as ExamCenterRow;
      setExamCenter(centerRow);

      const { data: timetableData, error: timetableErr } = await supabase
        .from('timetable')
        .select(
          'id, exam_day, date, session, time_slot, subject_code, subject_name, scheme, subject_abbr, total_students, absent_numbers, cps_students, cps_resolved, created_at, updated_at',
        )
        .eq('exam_center_id', centerRow.id)
        .order('date')
        .order('session')
        .order('subject_code');

      if (requestId !== requestIdRef.current) return;
      if (timetableErr) throw timetableErr;

      const rows = (timetableData ?? []) as unknown as TimetableRow[];
      setEntries(rows.map(mapTimetableRecord));
      setLoadError(null);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      console.error('Failed to load timetable:', err);
      const message = err instanceof Error ? err.message : 'Failed to load timetable';
      toast.error(message);
      setLoadError(message);
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        setLoaded(true);
      }
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // ── Derived data: overall stats → filtered → sorted → paginated ──
  const stats = useMemo(() => (entries.length > 0 ? computeStats(entries) : null), [entries]);

  const schemes = useMemo(
    () => [...new Set(entries.map((e) => e.scheme))].filter(Boolean).sort(),
    [entries],
  );

  const zeroCount = useMemo(() => entries.filter((e) => e.totalStudents === 0).length, [entries]);

  const visibleEntries = useMemo(() => {
    const search = filters.search.trim().toLowerCase();

    const filtered = entries.filter((entry) => {
      if (!showZero && entry.totalStudents === 0) return false;
      if (filters.session && entry.session !== filters.session) return false;
      if (filters.scheme && entry.scheme !== filters.scheme) return false;
      if (filters.date && format(entry.date, 'yyyy-MM-dd') !== filters.date) return false;
      if (search) {
        const haystack = [entry.subjectCode, entry.subjectName, entry.subjectAbbr]
          .map((v) => (v ?? '').toLowerCase())
          .join('\n');
        if (!haystack.includes(search)) return false;
      }
      return true;
    });

    return filtered.sort((a, b) => compareEntries(a, b, sortColumn, sortDirection));
  }, [entries, filters, showZero, sortColumn, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(visibleEntries.length / pageSize));
  // Clamp so a refresh or filter change can never leave us on a page that no longer exists.
  const page = Math.min(currentPage, totalPages);
  const pageEntries = useMemo(
    () => visibleEntries.slice((page - 1) * pageSize, page * pageSize),
    [visibleEntries, page, pageSize],
  );

  const activeFilterCount = Object.values(filters).filter((v) => v !== '').length;

  // ── Handlers (each view-changing action resets to page 1) ──
  const handleFilterChange = useCallback((patch: Partial<Filters>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
    setCurrentPage(1);
  }, []);

  const handleClearFilters = useCallback(() => {
    setFilters(EMPTY_FILTERS);
    setCurrentPage(1);
  }, []);

  const handleShowZeroChange = useCallback((next: boolean) => {
    setShowZero(next);
    setCurrentPage(1);
  }, []);

  const handleSort = useCallback(
    (column: SortColumn) => {
      if (column === sortColumn) {
        setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortColumn(column);
        setSortDirection('asc');
      }
      setCurrentPage(1);
    },
    [sortColumn],
  );

  const handlePageSizeChange = useCallback((size: number) => {
    setPageSize(size);
    setCurrentPage(1);
  }, []);

  const handleExport = useCallback(() => {
    if (visibleEntries.length === 0) {
      toast.error('No data to export');
      return;
    }

    const headers = [
      'Day',
      'Date',
      'Session',
      'Time Slot',
      'Subject Code',
      'Subject Name',
      'Scheme',
      'Students',
    ];

    const rows = visibleEntries.map((entry) => [
      entry.examDay ? `Day ${entry.examDay}` : '',
      format(entry.date, 'dd/MM/yyyy'),
      entry.session,
      entry.timeSlot || '',
      entry.subjectCode,
      entry.subjectName || entry.subjectAbbr || '',
      entry.scheme,
      entry.totalStudents,
    ]);

    const csv = [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');

    // BOM keeps non-ASCII subject names intact when opened in Excel.
    const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `timetable-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);

    toast.success(`Exported ${visibleEntries.length} records`);
  }, [visibleEntries]);

  const handleUploadSuccess = useCallback(() => {
    toast.success('Timetable uploaded successfully!');
    void fetchData();
    setShowUpload(false);
  }, [fetchData]);

  const season = (examCenter?.season as 'Summer' | 'Winter') || 'Summer';
  const year = examCenter?.exam_year || examCenter?.examYear || new Date().getFullYear();
  const hasData = entries.length > 0;

  // ── Loading ──
  if (!loaded) {
    return <TableSkeleton />;
  }

  // ── Load error with nothing to show ──
  if (loadError && !hasData) {
    return (
      <div>
        <PageHeader
          title="Examination Timetable"
          description="View and manage your examination schedule."
          icon={Calendar}
        />
        <div
          role="alert"
          className="mt-8 rounded-xl border border-dashed border-red-500/30 px-6 py-12 text-center"
        >
          <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
            We couldn’t load the timetable
          </p>
          <p className="mt-1 text-sm break-words text-neutral-600 dark:text-neutral-400">
            {loadError}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void fetchData()}
            disabled={loading}
            className="mt-5 gap-1.5"
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

  // ── Upload screen (no data, or upload requested) ──
  if (!hasData || showUpload) {
    return (
      <div>
        <PageHeader
          title="Examination Timetable"
          description="Upload the MSBTE timetable to begin exam configuration."
          icon={Calendar}
          actions={
            hasData ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowUpload(false)}
              >
                Back to timetable
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
            fileType="timetable"
            ecCode={examCenter?.code || ''}
            onSuccess={handleUploadSuccess}
            onProcessingComplete={handleUploadSuccess}
          />
        </div>
      </div>
    );
  }

  // ── Timetable view ──
  const refreshing = loading;

  return (
    <div>
      <PageHeader
        title="Examination Timetable"
        description="Review and manage the examination schedule for your center."
        icon={Calendar}
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
            Upload timetable
          </Button>
        }
      />

      <MSBTEContextBar
        season={season}
        year={year}
      />

      {stats && <StatsStrip stats={stats} />}

      <TimetableToolbar
        filters={filters}
        schemes={schemes}
        showZero={showZero}
        zeroCount={zeroCount}
        activeFilterCount={activeFilterCount}
        refreshing={refreshing}
        canExport={visibleEntries.length > 0}
        onFilterChange={handleFilterChange}
        onShowZeroChange={handleShowZeroChange}
        onClear={handleClearFilters}
        onRefresh={() => void fetchData()}
        onExport={handleExport}
      />

      <div className="mt-4">
        {visibleEntries.length === 0 ? (
          <div className="rounded-xl border border-dashed border-neutral-300 py-6 dark:border-neutral-700">
            <PageEmpty
              title="No matching records"
              description={
                !showZero && activeFilterCount === 0
                  ? 'Every record in this timetable has 0 students. Turn on “Show records with 0 students” to see them.'
                  : 'Try adjusting your search or filters.'
              }
            />
            {activeFilterCount > 0 && (
              <div className="flex justify-center">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleClearFilters}
                >
                  Clear filters
                </Button>
              </div>
            )}
          </div>
        ) : (
          <TimetableTable
            entries={pageEntries}
            sortColumn={sortColumn}
            sortDirection={sortDirection}
            onSort={handleSort}
            busy={refreshing}
          />
        )}
      </div>

      <Pagination
        page={page}
        totalPages={totalPages}
        pageSize={pageSize}
        total={visibleEntries.length}
        overallTotal={entries.length}
        zeroHidden={!showZero}
        onPageChange={(next) => setCurrentPage(Math.min(Math.max(1, next), totalPages))}
        onPageSizeChange={handlePageSizeChange}
      />
    </div>
  );
}
