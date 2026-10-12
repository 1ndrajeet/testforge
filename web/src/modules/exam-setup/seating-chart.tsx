// modules/exam-setup/seating-chart.tsx
'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

import departments from '@/config/course_codes.json';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Download,
  Eye,
  Loader2,
  RefreshCw,
  Search,
  Upload,
  Users,
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

import { UniversalFileUploaderWrapper } from '@/components/shared/file-uploader';

// ============================================================================
// Types (public exports preserved)
// ============================================================================

export interface StudentSeatingData {
  id: string;
  seatNumber: number;
  enrollmentNumber: string | null;
  name: string | null;
  scheme: string | null;
  instituteCode: string;
  instituteName: string;
  subjects: string[];
  subCodes: string[];
}

export interface SeatingChartStats {
  totalStudents: number;
  totalInstitutes: number;
  totalSchemes: number;
}

interface InstituteInfo {
  code: string;
  name: string;
  count: number;
}

interface InstituteJoin {
  institute_name: string | null;
}

interface StudentRow {
  id: string;
  seat_number: number;
  enrollment_number: string | null;
  name: string | null;
  scheme: string | null;
  institute_code: string | null;
  subjects?: unknown;
  sub_codes?: unknown;
  connected_institutes?: InstituteJoin | InstituteJoin[] | null;
}

interface Filters {
  instituteCode: string;
  scheme: string;
  search: string;
}

interface Meta {
  totalStudents: number;
  institutes: InstituteInfo[];
  schemes: string[];
}

type SortColumn = 'seatNumber' | 'enrollmentNumber' | 'name' | 'scheme' | 'instituteCode';
type SortDirection = 'asc' | 'desc';

// ============================================================================
// Constants & helpers
// ============================================================================

const PAGE_SIZE_OPTIONS = [10, 20, 25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 20;
const EXPORT_BATCH_SIZE = 1000;
const EMPTY_FILTERS: Filters = { instituteCode: '', scheme: '', search: '' };

const SORT_COLUMN_DB: Record<SortColumn, string> = {
  seatNumber: 'seat_number',
  enrollmentNumber: 'enrollment_number',
  name: 'name',
  scheme: 'scheme',
  instituteCode: 'institute_code',
};

const STUDENT_PAGE_SELECT =
  'id, seat_number, enrollment_number, name, scheme, institute_code, subjects, sub_codes, connected_institutes(institute_name)';
const STUDENT_EXPORT_SELECT =
  'seat_number, enrollment_number, name, scheme, institute_code, sub_codes, connected_institutes(institute_name)';

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-neutral-950';

const getDept = (code: string) => (departments as Record<string, string>)[code] || code;

const getValidSubjects = (subCodes: unknown): string[] =>
  (Array.isArray(subCodes) ? (subCodes as unknown[]) : []).filter(
    (code): code is string => typeof code === 'string' && code.trim() !== '',
  );

function getInstituteName(joined: StudentRow['connected_institutes']): string {
  const row = Array.isArray(joined) ? joined[0] : joined;
  return row?.institute_name ?? '';
}

function mapStudent(s: StudentRow): StudentSeatingData {
  return {
    id: s.id,
    seatNumber: s.seat_number,
    enrollmentNumber: s.enrollment_number,
    name: s.name,
    scheme: s.scheme,
    instituteCode: s.institute_code || '',
    instituteName: getInstituteName(s.connected_institutes),
    subjects: Array.isArray(s.subjects) ? (s.subjects as string[]) : [],
    subCodes: Array.isArray(s.sub_codes) ? (s.sub_codes as string[]) : [],
  };
}

/**
 * Applies the active institute / scheme / search filters. Shared by the page query and
 * the CSV export so both always agree. The Supabase builder generics are intentionally
 * bypassed here; the filter values are still passed as parameters, never concatenated
 * into column names.
 */
function applyStudentFilters<T>(query: T, filters: Filters): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = query as any;
  if (filters.instituteCode) q = q.eq('institute_code', filters.instituteCode);
  if (filters.scheme) q = q.eq('scheme', filters.scheme);
  const sanitized = filters.search.trim().replace(/[,()%\\"]/g, '');
  if (sanitized) {
    q = q.or(
      `name.ilike.%${sanitized}%,enrollment_number.ilike.%${sanitized}%,seat_number_text.ilike.%${sanitized}%`,
    );
  }
  return q as T;
}

function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '""';
  let text = String(value);
  // Neutralise spreadsheet formula injection for text cells.
  if (typeof value === 'string' && /^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

// ── Subject dictionary: lazy, de-duplicated, cached only when complete ──

let cachedSubjectMap: Map<string, string> | null = null;
let subjectMapPromise: Promise<Map<string, string>> | null = null;

function getOrFetchSubjectMap(
  supabase: ReturnType<typeof createClient>,
): Promise<Map<string, string>> {
  if (cachedSubjectMap && cachedSubjectMap.size > 0) return Promise.resolve(cachedSubjectMap);
  if (subjectMapPromise) return subjectMapPromise;

  const CHUNK = 1000; // PostgREST row cap per request
  const fetchChunk = (from: number) =>
    supabase
      .from('subjects')
      .select('code, name')
      .eq('is_deleted', false)
      .range(from, from + CHUNK - 1);

  subjectMapPromise = (async () => {
    const map = new Map<string, string>();
    let complete = true;
    try {
      // MSBTE has ~3,200 subjects: fetch the first four chunks in parallel.
      const initial = await Promise.all([0, 1000, 2000, 3000].map(fetchChunk));
      let lastChunkFull = false;
      initial.forEach((res, idx) => {
        if (res.error) {
          complete = false;
          return;
        }
        for (const sub of res.data ?? []) {
          if (sub.code && sub.name) map.set(sub.code, sub.name);
        }
        if (idx === initial.length - 1) lastChunkFull = (res.data?.length ?? 0) === CHUNK;
      });

      // If the dictionary outgrows four chunks, keep paging until a short chunk arrives.
      for (let from = 4000; complete && lastChunkFull; from += CHUNK) {
        const res = await fetchChunk(from);
        if (res.error) {
          complete = false;
          break;
        }
        for (const sub of res.data ?? []) {
          if (sub.code && sub.name) map.set(sub.code, sub.name);
        }
        lastChunkFull = (res.data?.length ?? 0) === CHUNK;
      }
    } catch {
      complete = false;
    }
    // A partial dictionary is returned for display but never cached as final.
    if (complete && map.size > 0) cachedSubjectMap = map;
    return map;
  })().finally(() => {
    subjectMapPromise = null;
  });

  return subjectMapPromise;
}

// ============================================================================
// Overview
// ============================================================================

function StatsStrip({ stats }: { stats: SeatingChartStats }) {
  const items = [
    { label: 'Students', value: stats.totalStudents },
    { label: 'Institutes', value: stats.totalInstitutes },
    { label: 'Schemes', value: stats.totalSchemes },
  ];
  return (
    <section
      aria-labelledby="seating-overview"
      className="mt-5"
    >
      <h2
        id="seating-overview"
        className="sr-only"
      >
        Overall seating chart totals
      </h2>
      <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-neutral-200 bg-neutral-200 dark:border-neutral-800 dark:bg-neutral-800">
        {items.map((item) => (
          <div
            key={item.label}
            className="bg-white px-4 py-3 dark:bg-neutral-950"
          >
            <dt className="text-xs text-neutral-500">{item.label}</dt>
            <dd className="mt-0.5 text-xl font-semibold tracking-tight text-neutral-900 tabular-nums dark:text-neutral-50">
              {item.value.toLocaleString('en-IN')}
            </dd>
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

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/[0.06] py-0.5 pr-0.5 pl-2.5 text-xs text-emerald-900 dark:text-emerald-100">
      <span className="truncate">{label}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove filter: ${label}`}
        className={cn('rounded-full p-1 hover:bg-emerald-500/15', FOCUS_RING)}
      >
        <X
          aria-hidden
          className="h-3 w-3"
        />
      </button>
    </span>
  );
}

function SeatingToolbar({
  searchInput,
  onSearchInputChange,
  onSearchSubmit,
  filters,
  institutes,
  schemes,
  exporting,
  refreshing,
  onFilterChange,
  onRemoveSearch,
  onClearAll,
  onExport,
  onRefresh,
}: {
  searchInput: string;
  onSearchInputChange: (value: string) => void;
  onSearchSubmit: () => void;
  filters: Filters;
  institutes: InstituteInfo[];
  schemes: string[];
  exporting: boolean;
  refreshing: boolean;
  onFilterChange: (patch: Partial<Filters>) => void;
  onRemoveSearch: () => void;
  onClearAll: () => void;
  onExport: () => void;
  onRefresh: () => void;
}) {
  const baseId = useId();
  const hintId = `${baseId}-hint`;
  const hasActive = Boolean(filters.instituteCode || filters.scheme || filters.search);
  const instituteLabel =
    institutes.find((i) => i.code === filters.instituteCode)?.code ?? filters.instituteCode;

  return (
    <div className="mt-6 space-y-3">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <form
          role="search"
          aria-label="Search students"
          onSubmit={(e) => {
            e.preventDefault();
            onSearchSubmit();
          }}
          className="flex min-w-0 flex-1 gap-2"
        >
          <div className="relative min-w-0 flex-1">
            <label
              htmlFor={`${baseId}-search`}
              className="sr-only"
            >
              Search by student name, enrollment number or seat number
            </label>
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-neutral-400"
            />
            <Input
              id={`${baseId}-search`}
              type="search"
              value={searchInput}
              onChange={(e) => onSearchInputChange(e.target.value)}
              placeholder="Name, enrollment or seat number"
              autoComplete="off"
              aria-describedby={hintId}
              className="h-9 pl-9"
            />
          </div>
          <Button
            type="submit"
            size="sm"
            variant="outline"
            className="h-9 shrink-0"
          >
            Search
          </Button>
          <span
            id={hintId}
            className="sr-only"
          >
            Press Enter or choose Search to apply.
          </span>
        </form>

        <div className="grid grid-cols-2 gap-2 lg:w-auto lg:grid-cols-[minmax(0,220px)_minmax(0,150px)]">
          <NativeSelect
            id={`${baseId}-institute`}
            label="Filter by institute"
            value={filters.instituteCode}
            onChange={(instituteCode) => onFilterChange({ instituteCode })}
          >
            <option value="">All institutes</option>
            {institutes.map((i) => (
              <option
                key={i.code}
                value={i.code}
              >
                {i.code}
                {i.name ? ` – ${i.name}` : ''}
                {i.count > 0 ? ` (${i.count.toLocaleString('en-IN')})` : ''}
              </option>
            ))}
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

      {hasActive && (
        <div
          className="flex flex-wrap items-center gap-2"
          aria-label="Active filters"
          role="group"
        >
          {filters.search && (
            <FilterChip
              label={`Search: ${filters.search}`}
              onRemove={onRemoveSearch}
            />
          )}
          {filters.instituteCode && (
            <FilterChip
              label={`Institute: ${instituteLabel}`}
              onRemove={() => onFilterChange({ instituteCode: '' })}
            />
          )}
          {filters.scheme && (
            <FilterChip
              label={`Scheme: ${filters.scheme}`}
              onRemove={() => onFilterChange({ scheme: '' })}
            />
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClearAll}
            className="h-7 px-2 text-xs"
          >
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
  className,
}: {
  column: SortColumn;
  label: string;
  sortColumn: SortColumn;
  sortDirection: SortDirection;
  onSort: (column: SortColumn) => void;
  className?: string;
}) {
  const active = sortColumn === column;
  const Icon = !active ? ArrowUpDown : sortDirection === 'asc' ? ArrowUp : ArrowDown;
  return (
    <TableHead
      aria-sort={active ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={cn('h-10 px-4', className)}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className={cn(
          'group inline-flex items-center gap-1 rounded text-xs font-medium',
          active
            ? 'text-emerald-700 dark:text-emerald-400'
            : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100',
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

function SubjectCodesCell({ codes }: { codes: string[] }) {
  if (codes.length === 0) return <span className="text-neutral-400">None</span>;
  const shown = codes.slice(0, 3);
  const extra = codes.length - shown.length;
  return (
    <span
      title={codes.join(', ')}
      className="font-mono text-xs text-neutral-700 dark:text-neutral-300"
    >
      {shown.join(', ')}
      {extra > 0 && <span className="ml-1.5 font-sans text-neutral-500">+{extra} more</span>}
    </span>
  );
}

function StudentTable({
  entries,
  sortColumn,
  sortDirection,
  onSort,
  onOpen,
  busy,
}: {
  entries: StudentSeatingData[];
  sortColumn: SortColumn;
  sortDirection: SortDirection;
  onSort: (column: SortColumn) => void;
  onOpen: (student: StudentSeatingData) => void;
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
            Students and their seat numbers. Column headers are buttons that sort the full result
            set.
          </caption>
          <TableHeader className="bg-neutral-50 dark:bg-neutral-900/70">
            <TableRow className="hover:bg-transparent">
              <SortableHead
                column="seatNumber"
                label="Seat"
                className="w-24"
                {...head}
              />
              <SortableHead
                column="enrollmentNumber"
                label="Enrollment"
                className="w-40"
                {...head}
              />
              <SortableHead
                column="name"
                label="Name"
                {...head}
              />
              <SortableHead
                column="scheme"
                label="Scheme"
                className="w-24"
                {...head}
              />
              <SortableHead
                column="instituteCode"
                label="Institute"
                className="w-52"
                {...head}
              />
              <TableHead className="h-10 w-56 px-4 text-xs font-medium text-neutral-500">
                Subjects
              </TableHead>
              <TableHead className="h-10 w-14 px-4 text-right">
                <span className="sr-only">Details</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((student) => {
              const label = student.name || `seat ${student.seatNumber}`;
              const institute = student.instituteName || student.instituteCode;
              return (
                <TableRow
                  key={student.id}
                  onClick={() => onOpen(student)}
                  className="h-12 cursor-pointer hover:bg-emerald-500/[0.04]"
                >
                  <TableCell className="px-4 py-2.5 font-mono text-sm font-semibold tabular-nums">
                    {student.seatNumber}
                  </TableCell>
                  <TableCell className="px-4 py-2.5 font-mono text-sm text-neutral-700 tabular-nums dark:text-neutral-300">
                    {student.enrollmentNumber || '—'}
                  </TableCell>
                  <TableCell className="max-w-0 px-4 py-2.5">
                    <div
                      className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100"
                      title={student.name || undefined}
                    >
                      {student.name || '—'}
                    </div>
                  </TableCell>
                  <TableCell className="px-4 py-2.5 font-mono text-xs text-neutral-600 dark:text-neutral-400">
                    {student.scheme || '—'}
                  </TableCell>
                  <TableCell className="max-w-0 px-4 py-2.5">
                    <div className="text-sm font-medium tabular-nums">
                      {student.instituteCode || '—'}
                    </div>
                    {student.instituteName && (
                      <div
                        className="truncate text-xs text-neutral-500"
                        title={institute}
                      >
                        {student.instituteName}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="px-4 py-2.5">
                    <SubjectCodesCell codes={getValidSubjects(student.subCodes)} />
                  </TableCell>
                  <TableCell className="px-4 py-2.5 text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      aria-label={`View details for ${label}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpen(student);
                      }}
                    >
                      <Eye
                        aria-hidden
                        className="h-4 w-4"
                      />
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
}

function TableSkeleton() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="space-y-2"
    >
      <span className="sr-only">Loading students…</span>
      {Array.from({ length: 8 }, (_, i) => (
        <Skeleton
          key={i}
          className="h-12 w-full"
          aria-hidden
        />
      ))}
    </div>
  );
}

function PageSkeleton() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="space-y-6"
    >
      <span className="sr-only">Loading seating chart…</span>
      <div
        className="space-y-2"
        aria-hidden
      >
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <Skeleton
        className="h-16 w-full rounded-xl"
        aria-hidden
      />
      <Skeleton
        className="h-9 w-full"
        aria-hidden
      />
      <Skeleton
        className="h-96 w-full"
        aria-hidden
      />
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
  loading,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  totalPages: number;
  pageSize: number;
  total: number;
  overallTotal: number;
  loading: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}) {
  const sizeId = useId();
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);
  const atStart = page <= 1 || loading;
  const atEnd = page >= totalPages || loading;
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
        {total === 1 ? 'student' : 'students'}
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
            Students per page
          </label>
          <select
            id={sizeId}
            value={pageSize}
            disabled={loading}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className={cn(
              'h-8 rounded-md border border-neutral-200 bg-white px-2 text-sm tabular-nums disabled:opacity-60 dark:border-neutral-800 dark:bg-neutral-950',
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
// Student detail modal
// ============================================================================

function DetailItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-neutral-500">{label}</dt>
      <dd className="mt-1 text-sm break-words">{children}</dd>
    </div>
  );
}

const StudentDetailModal = ({
  student,
  open,
  onOpenChange,
  subjectMap,
  subjectsLoading,
}: {
  student: StudentSeatingData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subjectMap: Map<string, string>;
  subjectsLoading: boolean;
}) => {
  if (!student) return null;

  const codes = getValidSubjects(student.subCodes);
  const deptKey = student.scheme?.split('-')[0] || '';
  const department = deptKey ? getDept(deptKey) : '';
  const namesUnavailable = !subjectsLoading && subjectMap.size === 0 && codes.length > 0;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">{student.name || 'Unnamed student'}</DialogTitle>
          <DialogDescription>
            Seat {student.seatNumber}
            {student.instituteCode ? `, institute ${student.instituteCode}` : ''}
          </DialogDescription>
        </DialogHeader>

        <dl className="grid gap-x-8 gap-y-5 py-2 sm:grid-cols-2">
          <DetailItem label="Seat number">
            <span className="font-mono text-lg font-semibold tabular-nums">
              {student.seatNumber}
            </span>
          </DetailItem>
          <DetailItem label="Enrollment number">
            {student.enrollmentNumber ? (
              <span className="font-mono tabular-nums">{student.enrollmentNumber}</span>
            ) : (
              <span className="text-neutral-400">Not recorded</span>
            )}
          </DetailItem>
          <DetailItem label="Scheme">
            {student.scheme ? (
              <>
                <span className="font-mono">{student.scheme}</span>
                {department && department !== deptKey && (
                  <span className="mt-0.5 block text-neutral-600 dark:text-neutral-400">
                    {department}
                  </span>
                )}
              </>
            ) : (
              <span className="text-neutral-400">Not recorded</span>
            )}
          </DetailItem>
          <DetailItem label="Institute">
            {student.instituteName || student.instituteCode ? (
              <>
                <span className="font-medium">
                  {student.instituteName || student.instituteCode}
                </span>
                {student.instituteCode && student.instituteName && (
                  <span className="mt-0.5 block font-mono text-xs text-neutral-500">
                    Code {student.instituteCode}
                  </span>
                )}
              </>
            ) : (
              <span className="text-neutral-400">Not recorded</span>
            )}
          </DetailItem>
        </dl>

        <section
          aria-labelledby="student-subjects"
          className="border-t border-neutral-200 pt-4 dark:border-neutral-800"
        >
          <h3
            id="student-subjects"
            className="text-sm font-semibold"
          >
            Subjects{' '}
            <span className="font-normal text-neutral-500 tabular-nums">({codes.length})</span>
          </h3>

          {codes.length === 0 ? (
            <p className="mt-2 text-sm text-neutral-500">No subjects assigned.</p>
          ) : (
            <>
              {namesUnavailable && (
                <p
                  role="status"
                  className="mt-2 text-xs text-neutral-500"
                >
                  Subject names couldn’t be loaded, so only codes are shown.
                </p>
              )}
              <ul className="mt-2 max-h-72 divide-y divide-neutral-200 overflow-y-auto rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
                {codes.map((code) => {
                  const name = subjectMap.get(code);
                  return (
                    <li
                      key={code}
                      className="flex items-baseline gap-4 px-3 py-2 text-sm"
                    >
                      <span className="w-16 shrink-0 font-mono text-xs font-semibold tabular-nums">
                        {code}
                      </span>
                      <span
                        className={cn('min-w-0 flex-1 break-words', !name && 'text-neutral-400')}
                      >
                        {name ?? (subjectsLoading ? 'Loading name…' : 'Name unavailable')}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>
      </DialogContent>
    </Dialog>
  );
};

// ============================================================================
// Page
// ============================================================================

export default function SeatingChartPage() {
  const { examCenter, isLoading: userLoading } = useUserInfo();
  const centerId = examCenter?.id;

  // Exam-center level metadata (counts, institutes, schemes): loaded once, refreshed on demand.
  const [meta, setMeta] = useState<Meta | null>(null);
  const [metaLoaded, setMetaLoaded] = useState(false);
  const [metaError, setMetaError] = useState<string | null>(null);

  // Current page of students.
  const [entries, setEntries] = useState<StudentSeatingData[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentsError, setStudentsError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // View state.
  const [searchInput, setSearchInput] = useState('');
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [sortColumn, setSortColumn] = useState<SortColumn>('seatNumber');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [showUpload, setShowUpload] = useState(false);
  const [exporting, setExporting] = useState(false);
  const exportingRef = useRef(false);
  const metaRequestRef = useRef(0);

  // Detail modal + lazily-loaded subject dictionary.
  const [selectedStudent, setSelectedStudent] = useState<StudentSeatingData | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [subjectMap, setSubjectMap] = useState<Map<string, string>>(new Map());
  const [subjectsLoading, setSubjectsLoading] = useState(false);

  // ── Metadata (same RPCs and fallbacks as before) ──
  const loadMeta = useCallback(async () => {
    if (!centerId) return;
    const requestId = ++metaRequestRef.current;
    try {
      const supabase = createClient();

      const countPromise = supabase
        .from('students')
        .select('*', { count: 'exact', head: true })
        .eq('exam_center_id', centerId)
        .eq('is_deleted', false);

      const institutesPromise = supabase
        .rpc('get_seating_chart_institutes', { p_exam_center_id: centerId })
        .then(async (res): Promise<InstituteInfo[]> => {
          if (!res.error && res.data) {
            return (res.data as Array<{ code: string; name: string; count: number }>).map((i) => ({
              code: i.code,
              name: i.name,
              count: Number(i.count) || 0,
            }));
          }
          const fallback = await supabase
            .from('connected_institutes')
            .select('id, institute_code, institute_name')
            .eq('exam_center_id', centerId)
            .eq('is_active', true)
            .order('institute_code');
          return (fallback.data || []).map((i) => ({
            code: i.institute_code,
            name: i.institute_name,
            count: 0,
          }));
        });

      const schemesPromise = supabase
        .rpc('get_exam_center_schemes', { p_exam_center_id: centerId })
        .then(async (res): Promise<string[]> => {
          if (!res.error && res.data) {
            return (res.data as Array<{ scheme: string }>).map((r) => r.scheme).filter(Boolean);
          }
          const fallback = await supabase
            .from('students')
            .select('scheme')
            .eq('exam_center_id', centerId)
            .eq('is_deleted', false)
            .not('scheme', 'is', null)
            .limit(1000);
          return Array.from(
            new Set((fallback.data || []).map((s) => s.scheme).filter(Boolean)),
          ) as string[];
        });

      const [countRes, institutes, schemes] = await Promise.all([
        countPromise,
        institutesPromise,
        schemesPromise,
      ]);

      if (requestId !== metaRequestRef.current) return;
      if (countRes.error) throw countRes.error;

      setMeta({ totalStudents: countRes.count || 0, institutes, schemes });
      setMetaError(null);
    } catch (err) {
      if (requestId !== metaRequestRef.current) return;
      const message = err instanceof Error ? err.message : 'Failed to load seating chart';
      toast.error(message);
      setMetaError(message);
    } finally {
      if (requestId === metaRequestRef.current) setMetaLoaded(true);
    }
  }, [centerId]);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  const hasData = meta ? meta.totalStudents > 0 : null;

  // ── Students: only the requested page is fetched from the server ──
  useEffect(() => {
    if (!centerId || !hasData) return;
    let cancelled = false;

    (async () => {
      setStudentsLoading(true);
      try {
        const supabase = createClient();
        const offset = (page - 1) * pageSize;
        const ascending = sortDirection === 'asc';

        let query = applyStudentFilters(
          supabase
            .from('students')
            .select(STUDENT_PAGE_SELECT, { count: 'exact' })
            .eq('exam_center_id', centerId)
            .eq('is_deleted', false),
          filters,
        ).order(SORT_COLUMN_DB[sortColumn], { ascending });

        // Stable tie-breakers so rows never repeat or vanish across pages.
        if (sortColumn !== 'seatNumber') query = query.order('seat_number', { ascending: true });
        query = query.order('id', { ascending: true });

        const { data, count, error } = await query.range(offset, offset + pageSize - 1);
        if (cancelled) return;
        if (error) throw error;

        const total = count || 0;
        const rows = (data ?? []) as unknown as StudentRow[];

        // The dataset shrank (filter, refresh or upload): move to the last valid page.
        if (rows.length === 0 && page > 1) {
          setPage(Math.max(1, Math.ceil(total / pageSize)));
          return;
        }

        setEntries(rows.map(mapStudent));
        setTotalItems(total);
        setStudentsError(null);
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Failed to load students';
        toast.error(message);
        setStudentsError(message);
      } finally {
        if (!cancelled) setStudentsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    centerId,
    hasData,
    page,
    pageSize,
    filters.instituteCode,
    filters.scheme,
    filters.search,
    sortColumn,
    sortDirection,
    refreshKey,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ]);

  // ── Subject names: fetched only when a detail modal is first opened ──
  useEffect(() => {
    if (!modalOpen || subjectMap.size > 0) return;
    let cancelled = false;
    setSubjectsLoading(true);
    getOrFetchSubjectMap(createClient())
      .then((map) => {
        if (!cancelled) setSubjectMap(map);
      })
      .finally(() => {
        if (!cancelled) setSubjectsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [modalOpen, subjectMap.size]);

  // ── Derived ──
  const stats = useMemo<SeatingChartStats | null>(() => {
    if (!meta) return null;
    const activeInstitutes = meta.institutes.filter((i) => i.count > 0).length;
    return {
      totalStudents: meta.totalStudents,
      totalInstitutes: activeInstitutes || meta.institutes.length,
      totalSchemes: meta.schemes.length,
    };
  }, [meta]);

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const activeFilterCount = [filters.instituteCode, filters.scheme, filters.search].filter(
    Boolean,
  ).length;

  // ── Handlers (every view-changing action returns to page 1) ──
  const handleFilterChange = useCallback((patch: Partial<Filters>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
    setPage(1);
  }, []);

  const handleSearchSubmit = useCallback(() => {
    const trimmed = searchInput.trim();
    if (trimmed === filters.search) return;
    setFilters((prev) => ({ ...prev, search: trimmed }));
    setPage(1);
  }, [searchInput, filters.search]);

  const handleRemoveSearch = useCallback(() => {
    setSearchInput('');
    setFilters((prev) => ({ ...prev, search: '' }));
    setPage(1);
  }, []);

  const handleClearAll = useCallback(() => {
    setSearchInput('');
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

  const handleOpenStudent = useCallback((student: StudentSeatingData) => {
    setSelectedStudent(student);
    setModalOpen(true);
  }, []);

  const handleRefresh = useCallback(() => {
    void loadMeta();
    setRefreshKey((k) => k + 1);
  }, [loadMeta]);

  const handleUploadSuccess = useCallback(() => {
    toast.success('Seating chart uploaded successfully!');
    setShowUpload(false);
    setPage(1);
    handleRefresh();
  }, [handleRefresh]);

  // ── Export: every matching student, fetched in batches, all-or-nothing ──
  const handleExport = useCallback(async () => {
    if (!centerId || exportingRef.current) return;
    exportingRef.current = true;
    setExporting(true);
    const toastId = toast.loading('Preparing CSV export…');

    try {
      const supabase = createClient();
      const rows: StudentRow[] = [];

      for (let from = 0; ; from += EXPORT_BATCH_SIZE) {
        const { data, error } = await applyStudentFilters(
          supabase
            .from('students')
            .select(STUDENT_EXPORT_SELECT)
            .eq('exam_center_id', centerId)
            .eq('is_deleted', false),
          filters,
        )
          .order('seat_number', { ascending: true })
          .order('id', { ascending: true })
          .range(from, from + EXPORT_BATCH_SIZE - 1);

        if (error) throw error;
        const batch = (data ?? []) as unknown as StudentRow[];
        rows.push(...batch);
        toast.loading(`Preparing CSV export… ${rows.length.toLocaleString('en-IN')} students`, {
          id: toastId,
        });
        if (batch.length < EXPORT_BATCH_SIZE) break;
      }

      if (rows.length === 0) {
        toast.error('No data to export', { id: toastId });
        return;
      }

      const headers = [
        'Seat Number',
        'Enrollment Number',
        'Name',
        'Scheme',
        'Institute Code',
        'Institute Name',
        'Subjects',
      ];
      const lines = rows.map((entry) =>
        [
          entry.seat_number,
          entry.enrollment_number || '',
          entry.name || '',
          entry.scheme || '',
          entry.institute_code || '',
          getInstituteName(entry.connected_institutes),
          getValidSubjects(entry.sub_codes).join(', '),
        ]
          .map(csvCell)
          .join(','),
      );

      const csv = [headers.map(csvCell).join(','), ...lines].join('\r\n');
      const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `seating-chart-${examCenter?.code || 'export'}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);

      toast.success(`Exported ${rows.length.toLocaleString('en-IN')} students`, { id: toastId });
    } catch (err) {
      toast.error(
        err instanceof Error
          ? `Export failed: ${err.message}`
          : 'Export failed. Nothing was saved.',
        { id: toastId },
      );
    } finally {
      exportingRef.current = false;
      setExporting(false);
    }
  }, [centerId, filters, examCenter?.code]);

  const season = examCenter?.season as 'Summer' | 'Winter';
  const year = examCenter?.examYear ?? new Date().getFullYear();

  // ── Render states ──
  if (userLoading || (centerId && !metaLoaded)) {
    return <PageSkeleton />;
  }

  if (!centerId) {
    return (
      <div>
        <PageHeader
          title="Seating Chart"
          description="View and manage student seating data."
          icon={Users}
        />
        <div className="mt-6">
          <PageEmpty
            title="No exam center found"
            description="Set up an exam center before uploading a seating chart."
          />
        </div>
      </div>
    );
  }

  if (metaError && !meta) {
    return (
      <div>
        <PageHeader
          title="Seating Chart"
          description="View and manage student seating data."
          icon={Users}
        />
        <div
          role="alert"
          className="mt-8 rounded-xl border border-dashed border-red-500/30 px-6 py-12 text-center"
        >
          <p className="text-sm font-medium">We couldn’t load the seating chart</p>
          <p className="mt-1 text-sm break-words text-neutral-600 dark:text-neutral-400">
            {metaError}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-5 gap-1.5"
            onClick={() => void loadMeta()}
          >
            <RefreshCw
              aria-hidden
              className="h-3.5 w-3.5"
            />
            Try again
          </Button>
        </div>
      </div>
    );
  }

  if (!hasData || showUpload) {
    return (
      <div>
        <PageHeader
          title="Seating Chart"
          description={
            hasData
              ? 'Upload a new seating chart for this exam center.'
              : 'No students yet. Upload the MSBTE seating chart to begin exam configuration.'
          }
          icon={Users}
          actions={
            hasData ? (
              <Button
                variant="ghost"
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
          <UniversalFileUploaderWrapper
            ecCode={examCenter?.code || ''}
            allowedTypes={['seatingchart']}
            defaultType="seatingchart"
            onSuccess={handleUploadSuccess}
            onProcessingComplete={handleUploadSuccess}
          />
        </div>
      </div>
    );
  }

  const initialLoad = studentsLoading && entries.length === 0;

  return (
    <div>
      <PageHeader
        title="Seating Chart"
        description="Find students, check their seats and subjects, and export the list."
        icon={Users}
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
            Upload seating chart
          </Button>
        }
      />

      <MSBTEContextBar
        season={season}
        year={year}
      />

      {stats && <StatsStrip stats={stats} />}

      <SeatingToolbar
        searchInput={searchInput}
        onSearchInputChange={setSearchInput}
        onSearchSubmit={handleSearchSubmit}
        filters={filters}
        institutes={meta?.institutes ?? []}
        schemes={meta?.schemes ?? []}
        exporting={exporting}
        refreshing={studentsLoading}
        onFilterChange={handleFilterChange}
        onRemoveSearch={handleRemoveSearch}
        onClearAll={handleClearAll}
        onExport={() => void handleExport()}
        onRefresh={handleRefresh}
      />

      <div className="mt-4">
        {studentsError ? (
          <div
            role="alert"
            className="rounded-xl border border-dashed border-red-500/30 px-6 py-10 text-center"
          >
            <p className="text-sm font-medium">We couldn’t load this page of students</p>
            <p className="mt-1 text-sm break-words text-neutral-600 dark:text-neutral-400">
              {studentsError}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-4 gap-1.5"
              onClick={() => setRefreshKey((k) => k + 1)}
              disabled={studentsLoading}
            >
              <RefreshCw
                aria-hidden
                className="h-3.5 w-3.5"
              />
              Try again
            </Button>
          </div>
        ) : initialLoad ? (
          <TableSkeleton />
        ) : entries.length === 0 ? (
          <div className="rounded-xl border border-dashed border-neutral-300 py-6 dark:border-neutral-700">
            <PageEmpty
              title="No matching students"
              description="No students match your search or filters."
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
          <StudentTable
            entries={entries}
            sortColumn={sortColumn}
            sortDirection={sortDirection}
            onSort={handleSort}
            onOpen={handleOpenStudent}
            busy={studentsLoading}
          />
        )}
      </div>

      <Pagination
        page={Math.min(page, totalPages)}
        totalPages={totalPages}
        pageSize={pageSize}
        total={totalItems}
        overallTotal={meta?.totalStudents ?? totalItems}
        loading={studentsLoading}
        onPageChange={handlePageChange}
        onPageSizeChange={handlePageSizeChange}
      />

      <StudentDetailModal
        student={selectedStudent}
        open={modalOpen}
        onOpenChange={setModalOpen}
        subjectMap={subjectMap}
        subjectsLoading={subjectsLoading}
      />
    </div>
  );
}
