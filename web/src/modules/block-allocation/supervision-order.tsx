// modules/block-allocation/supervision-order.tsx
'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

import { createPortal } from 'react-dom';

import departments from '@/config/course_codes.json';
import { format } from 'date-fns';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  Loader2,
  RefreshCw,
  Save,
  Search,
  Undo2,
  X,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';

import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

import { useUserInfo } from '@/hooks/useUserInfo';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';

/*
 * Persistence note
 * ────────────────
 * The browser Supabase client cannot run several requests in one transaction, and no
 * order-replacement RPC was visible to this module, so the save below is NOT atomic.
 * It is a position-keyed diff (update changed slots → insert new slots → delete
 * leftovers) that never deletes before replacement data exists, re-checks the persisted
 * rows immediately before writing, verifies every affected-row count, and re-reads the
 * result afterwards. A true all-or-nothing save needs a SECURITY INVOKER RPC; see the
 * delivery notes.
 */

// ────────────────────────────────────────────────────────────
// Types & constants
// ────────────────────────────────────────────────────────────

type Supabase = ReturnType<typeof createClient>;
type Session = 'Morning' | 'Afternoon';
type OrderType = 'supervision' | 'reliever';
type StaffType = 'SUPERVISOR' | 'RELIEVER';
type Slots = Array<string | null>; // staff ids by position; null = empty

interface StaffMember {
  id: string;
  uid: string;
  name: string;
  department: string;
  staffType: StaffType;
}

interface OrderRow {
  id: string;
  staff_id: string;
  order_type: OrderType;
  order_key: string | null;
}

interface StaleStaffInfo {
  name: string;
  uid: string;
  removed: boolean;
}

interface SessionSnapshot {
  date: string;
  session: Session;
  totalStudents: number;
  totalSource: 'timetable' | 'allocations';
  schemes: string[];
  warnings: string[];
  requiredSupervisors: number;
  requiredRelievers: number;
  orders: OrderRow[];
  supervisorSlots: Slots;
  relieverSlots: Slots;
  needsNormalise: boolean;
  staleStaff: Map<string, StaleStaffInfo>;
}

interface BlockConfig {
  value: number;
  source: 'blocks' | 'cache' | 'default';
}

interface SlotNote {
  severity: 'error' | 'warning';
  text: string;
}

interface ListAnalysis {
  required: number;
  filledRequired: number;
  poolSize: number;
  notes: Array<SlotNote | null>;
  duplicates: number;
  missingRecords: number;
  ineligible: number;
  beyond: number;
}

interface Issue {
  id: string;
  severity: 'error' | 'warning';
  kind: 'incomplete' | 'invalid' | 'info';
  message: string;
  hint?: string;
}

interface ChangeLine {
  label: string;
  from: string;
  to: string;
}

const MIN_SUPERVISORS = 2;
const RELIEVER_RATIO = 3;
const STAFF_PER_BLOCK_KEY = 'staffPerBlock';
const STAFF_PER_BLOCK_CENTER_KEY = 'staffPerBlockCenter';
const DEFAULT_STAFF_PER_BLOCK = 30;
const PAGE_LIMIT = 1000;

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-neutral-950';

const getDept = (code: string) => (departments as Record<string, string>)[code] || code;

// ────────────────────────────────────────────────────────────
// Local storage (SSR-safe, failure-safe, scoped by exam center)
// ────────────────────────────────────────────────────────────

function readCachedStaffPerBlock(centerId: string): number | null {
  if (typeof window === 'undefined') return null;
  try {
    // The cache is only trusted when it was written for this exam center.
    if (window.localStorage.getItem(STAFF_PER_BLOCK_CENTER_KEY) !== centerId) return null;
    const n = Number(window.localStorage.getItem(STAFF_PER_BLOCK_KEY));
    return Number.isInteger(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

function writeCachedStaffPerBlock(centerId: string, value: number): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STAFF_PER_BLOCK_KEY, String(value));
    window.localStorage.setItem(STAFF_PER_BLOCK_CENTER_KEY, centerId);
  } catch {
    /* storage unavailable: ignore */
  }
}

// ────────────────────────────────────────────────────────────
// Supabase reads (browser client, RLS applies)
// ────────────────────────────────────────────────────────────

async function fetchAllRows<T>(
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE_LIMIT) {
    const { data, error } = await page(from, from + PAGE_LIMIT - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE_LIMIT) break;
  }
  return out;
}

async function fetchStaffPool(
  supabase: Supabase,
  centerId: string,
  staffType: StaffType,
): Promise<StaffMember[]> {
  const rows = await fetchAllRows<{
    id: string;
    uid: string;
    name: string;
    department: string | null;
  }>((from, to) =>
    supabase
      .from('staff')
      .select('id, uid, name, department, staff_type')
      .eq('exam_center_id', centerId)
      .eq('is_deleted', false)
      .eq('staff_type', staffType)
      .order('name')
      .order('id')
      .range(from, to),
  );
  return rows.map((s) => ({
    id: s.id,
    uid: s.uid,
    name: s.name,
    department: s.department ?? '',
    staffType,
  }));
}

async function fetchBlockStrengths(supabase: Supabase, centerId: string): Promise<number[]> {
  const rows = await fetchAllRows<{ strength: number | null }>((from, to) =>
    supabase
      .from('blocks')
      .select('strength')
      .eq('exam_center_id', centerId)
      .eq('is_deleted', false)
      .order('id')
      .range(from, to),
  );
  return rows.map((b) => Number(b.strength ?? 0)).filter((n) => Number.isFinite(n) && n > 0);
}

async function fetchTimetable(
  supabase: Supabase,
  centerId: string,
  date: string,
  session: Session,
) {
  const rows = await fetchAllRows<{
    scheme: string | null;
    subject_code: string | null;
    total_students: number | null;
  }>((from, to) =>
    supabase
      .from('timetable')
      .select('scheme, subject_code, total_students')
      .eq('exam_center_id', centerId)
      .eq('date', date)
      .eq('session', session)
      .order('id')
      .range(from, to),
  );

  let total = 0;
  const schemes = new Set<string>();
  const seen = new Set<string>();
  let possibleDuplicates = 0;
  for (const r of rows) {
    total += Number(r.total_students ?? 0);
    if (r.scheme) schemes.add(r.scheme);
    const key = `${r.scheme ?? ''}|${r.subject_code ?? ''}`;
    if (seen.has(key)) possibleDuplicates += 1;
    seen.add(key);
  }
  return { total, rowCount: rows.length, schemes: [...schemes], possibleDuplicates };
}

async function fetchAllocations(
  supabase: Supabase,
  centerId: string,
  date: string,
  session: Session,
) {
  const rows = await fetchAllRows<{ scheme: string | null; assigned_count: number | null }>(
    (from, to) =>
      supabase
        .from('block_allocations')
        .select('scheme, assigned_count')
        .eq('exam_center_id', centerId)
        .eq('date', date)
        .eq('session', session)
        .order('id')
        .range(from, to),
  );
  let total = 0;
  const schemes = new Set<string>();
  for (const r of rows) {
    total += Number(r.assigned_count ?? 0);
    if (r.scheme) schemes.add(r.scheme);
  }
  return { total, rowCount: rows.length, schemes: [...schemes] };
}

async function fetchOrders(
  supabase: Supabase,
  centerId: string,
  date: string,
  session: Session,
): Promise<OrderRow[]> {
  return fetchAllRows<OrderRow>((from, to) =>
    supabase
      .from('orders')
      .select('id, staff_id, order_type, order_key')
      .eq('exam_center_id', centerId)
      .eq('date', date)
      .eq('session', session)
      .in('order_type', ['supervision', 'reliever'])
      .order('id')
      .range(from, to),
  );
}

async function fetchStaleStaff(
  supabase: Supabase,
  centerId: string,
  ids: string[],
): Promise<Map<string, StaleStaffInfo>> {
  const out = new Map<string, StaleStaffInfo>();
  if (ids.length === 0) return out;
  try {
    const { data, error } = await supabase
      .from('staff')
      .select('id, uid, name, is_deleted')
      .eq('exam_center_id', centerId)
      .in('id', ids);
    if (error) return out;
    for (const s of (data ?? []) as Array<{
      id: string;
      uid: string;
      name: string;
      is_deleted: boolean | null;
    }>) {
      out.set(s.id, { name: s.name, uid: s.uid, removed: !!s.is_deleted });
    }
  } catch {
    /* details are optional */
  }
  return out;
}

// ────────────────────────────────────────────────────────────
// Pure helpers
// ────────────────────────────────────────────────────────────

function buildOrderKey(prefix: 'SUP' | 'REL', date: string, session: Session, position: number) {
  return `${prefix}-${date.replace(/-/g, '')}-${session.toUpperCase()}-${String(position + 1).padStart(2, '0')}`;
}

/** Position encoded in the key suffix (…-03 → index 2). Null if absent. */
function parsePosition(key: string | null): number | null {
  const m = key?.match(/-(\d{1,3})$/);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 ? n - 1 : null;
}

function requiredStaffing(totalStudents: number, staffPerBlock: number) {
  // Business formulas, unchanged.
  const requiredSupervisors = Math.max(
    MIN_SUPERVISORS,
    Math.ceil(totalStudents / staffPerBlock) + 1,
  );
  const requiredRelievers = Math.max(1, Math.ceil(requiredSupervisors / RELIEVER_RATIO));
  return { requiredSupervisors, requiredRelievers };
}

/** Associates persisted rows with positions via order_key, never via array order. */
function buildSlots(rows: OrderRow[], minLength: number): { slots: Slots; normalise: boolean } {
  const slots: Slots = Array.from({ length: minLength }, () => null);
  const used = new Set<number>();
  const unplaced: OrderRow[] = [];
  const sorted = [...rows].sort(
    (a, b) => (a.order_key ?? '').localeCompare(b.order_key ?? '') || a.id.localeCompare(b.id),
  );

  for (const r of sorted) {
    const p = parsePosition(r.order_key);
    if (p !== null && !used.has(p)) {
      while (slots.length <= p) slots.push(null);
      slots[p] = r.staff_id;
      used.add(p);
    } else {
      unplaced.push(r);
    }
  }
  for (const r of unplaced) {
    const free = slots.findIndex((s) => s === null);
    if (free >= 0) slots[free] = r.staff_id;
    else slots.push(r.staff_id);
  }
  return { slots, normalise: unplaced.length > 0 };
}

function trimTrailingEmpty(slots: Slots): Slots {
  let end = slots.length;
  while (end > 0 && slots[end - 1] === null) end -= 1;
  return slots.slice(0, end);
}

function slotsEqual(a: Slots, b: Slots): boolean {
  const x = trimTrailingEmpty(a);
  const y = trimTrailingEmpty(b);
  return x.length === y.length && x.every((v, i) => v === y[i]);
}

function fingerprint(rows: OrderRow[]): string {
  return rows
    .map((r) => `${r.id}|${r.order_type}|${r.staff_id}|${r.order_key ?? ''}`)
    .sort()
    .join('\n');
}

function analyzeList(
  slots: Slots,
  required: number,
  pool: StaffMember[],
  staffIndex: Map<string, StaffMember>,
  stale: Map<string, StaleStaffInfo>,
  typeLabel: string,
): ListAnalysis {
  const poolIds = new Set(pool.map((s) => s.id));
  const counts = new Map<string, number>();
  for (const id of slots) if (id) counts.set(id, (counts.get(id) ?? 0) + 1);

  let filledRequired = 0;
  let duplicates = 0;
  let missingRecords = 0;
  let ineligible = 0;
  let beyond = 0;

  const notes = slots.map((id, i): SlotNote | null => {
    if (!id) {
      return i < required
        ? { severity: 'warning', text: `${typeLabel} needed for this position.` }
        : null;
    }
    if (i < required) filledRequired += 1;
    if (i >= required) {
      beyond += 1;
      return {
        severity: 'error',
        text: `Beyond the current requirement of ${required}. Clear this slot.`,
      };
    }
    const member = staffIndex.get(id);
    if (!member) {
      missingRecords += 1;
      const info = stale.get(id);
      return {
        severity: 'error',
        text: info
          ? `${info.name} (${info.uid}) ${info.removed ? 'was removed from the staff list' : 'is not an active staff member'}. Replace or clear this slot.`
          : 'This staff record could not be found. Replace or clear this slot.',
      };
    }
    if (!poolIds.has(id)) {
      ineligible += 1;
      return {
        severity: 'error',
        text: `${member.name} is registered as ${member.staffType.toLowerCase()}, so is not eligible here. Replace this slot.`,
      };
    }
    if ((counts.get(id) ?? 0) > 1) {
      duplicates += 1;
      return {
        severity: 'error',
        text: `${member.name} is assigned more than once. Clear one slot.`,
      };
    }
    return null;
  });

  return {
    required,
    filledRequired,
    poolSize: pool.length,
    notes,
    duplicates,
    missingRecords,
    ineligible,
    beyond,
  };
}

type Coverage = 'complete' | 'incomplete' | 'invalid';
function coverageOf(a: ListAnalysis): Coverage {
  if (a.duplicates + a.missingRecords + a.ineligible + a.beyond > 0) return 'invalid';
  return a.filledRequired >= a.required ? 'complete' : 'incomplete';
}

/** Minimal position-keyed write plan for one order type. */
function planWrites(
  existing: OrderRow[],
  target: string[],
  orderType: OrderType,
  prefix: 'SUP' | 'REL',
  date: string,
  session: Session,
) {
  const byPosition = new Map<number, OrderRow>();
  const leftovers: OrderRow[] = [];
  for (const r of [...existing].sort((a, b) => a.id.localeCompare(b.id))) {
    const p = parsePosition(r.order_key);
    if (p !== null && p < target.length && !byPosition.has(p)) byPosition.set(p, r);
    else leftovers.push(r);
  }

  const updates: Array<{ id: string; staff_id: string; order_key: string }> = [];
  const inserts: Array<{
    staff_id: string;
    order_type: OrderType;
    date: string;
    session: Session;
    order_key: string;
  }> = [];

  target.forEach((staffId, position) => {
    const key = buildOrderKey(prefix, date, session, position);
    const row = byPosition.get(position);
    if (!row) {
      inserts.push({ staff_id: staffId, order_type: orderType, date, session, order_key: key });
    } else if (row.staff_id !== staffId || row.order_key !== key) {
      updates.push({ id: row.id, staff_id: staffId, order_key: key });
    }
  });

  return { updates, inserts, deletes: leftovers.map((r) => r.id) };
}

// ────────────────────────────────────────────────────────────
// Staff picker (searchable, keyboard-operable combobox)
// ────────────────────────────────────────────────────────────

function StaffPicker({
  label,
  pool,
  takenIds,
  currentId,
  disabled,
  invalid,
  children,
  onSelect,
}: {
  label: string;
  pool: StaffMember[];
  takenIds: Set<string>;
  currentId: string | null;
  disabled: boolean;
  invalid: boolean;
  children: React.ReactNode;
  onSelect: (id: string) => void;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const flat = useMemo(() => {
    const q = query.trim().toLowerCase();
    return pool
      .filter(
        (s) =>
          !q ||
          s.name.toLowerCase().includes(q) ||
          s.uid.toLowerCase().includes(q) ||
          s.department.toLowerCase().includes(q),
      )
      .sort(
        (a, b) =>
          (a.department || '~').localeCompare(b.department || '~') || a.name.localeCompare(b.name),
      );
  }, [pool, query]);

  const isTaken = useCallback(
    (s: StaffMember) => takenIds.has(s.id) && s.id !== currentId,
    [takenIds, currentId],
  );

  const reposition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const MENU_H = 340;
    const below = window.innerHeight - r.bottom;
    const up = below < MENU_H && r.top > below;
    setRect({
      top: up ? Math.max(8, r.top - MENU_H - 4) : r.bottom + 4,
      left: r.left,
      width: Math.max(r.width, 280),
    });
  }, []);

  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    setQuery('');
    if (refocus) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    reposition();
    const onMouseDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      close(false);
    };
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    document.addEventListener('mousedown', onMouseDown, true);
    const t = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
      document.removeEventListener('mousedown', onMouseDown, true);
      window.clearTimeout(t);
    };
  }, [open, reposition, close]);

  const move = (dir: 1 | -1) => {
    if (flat.length === 0) return;
    let i = active;
    for (let step = 0; step < flat.length; step += 1) {
      i = (i + dir + flat.length) % flat.length;
      if (!isTaken(flat[i])) {
        setActive(i);
        return;
      }
    }
  };

  const choose = (s: StaffMember) => {
    if (isTaken(s)) return;
    onSelect(s.id);
    close(true);
  };

  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      move(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      move(-1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const s = flat[active];
      if (s) choose(s);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close(true);
    } else if (e.key === 'Tab') {
      close(false);
    }
  };

  const optionId = (i: number) => `${listId}-opt-${i}`;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          setActive(0);
          setOpen((o) => !o);
        }}
        className={cn(
          'flex min-h-9 w-full items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-left text-sm transition-colors motion-reduce:transition-none',
          invalid
            ? 'border-red-400 bg-red-500/[0.04] dark:border-red-700'
            : currentId
              ? 'border-neutral-200 bg-white hover:border-neutral-400 dark:border-neutral-800 dark:bg-neutral-950 dark:hover:border-neutral-600'
              : 'border-dashed border-neutral-300 bg-neutral-50 text-neutral-500 hover:border-neutral-400 dark:border-neutral-700 dark:bg-neutral-900/40',
          disabled && 'cursor-not-allowed opacity-60',
          FOCUS_RING,
        )}
      >
        <span className="min-w-0 flex-1">{children}</span>
        <ChevronDown
          aria-hidden
          className="h-3.5 w-3.5 shrink-0 text-neutral-400"
        />
      </button>

      {open &&
        rect &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: 'fixed',
              top: rect.top,
              left: rect.left,
              width: rect.width,
              zIndex: 9999,
            }}
            className="overflow-hidden rounded-md border border-neutral-200 bg-white shadow-xl dark:border-neutral-800 dark:bg-neutral-950"
          >
            <div className="flex items-center gap-2 border-b border-neutral-200 px-2.5 py-1.5 dark:border-neutral-800">
              <Search
                aria-hidden
                className="h-3.5 w-3.5 text-neutral-400"
              />
              <input
                ref={searchRef}
                role="combobox"
                aria-label={`Search staff for ${label}`}
                aria-expanded
                aria-controls={listId}
                aria-activedescendant={flat[active] ? optionId(active) : undefined}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
                onKeyDown={onSearchKey}
                placeholder="Search name, ID or department"
                className="w-full bg-transparent text-sm outline-none"
              />
            </div>
            <div
              id={listId}
              role="listbox"
              aria-label={label}
              className="max-h-72 overflow-y-auto py-1"
            >
              {flat.length === 0 && (
                <p className="px-3 py-3 text-center text-xs text-neutral-500">
                  {pool.length === 0
                    ? 'No eligible staff are registered.'
                    : 'No staff match your search.'}
                </p>
              )}
              {flat.map((s, i) => {
                const taken = isTaken(s);
                const showHeader = i === 0 || flat[i - 1].department !== s.department;
                return (
                  <div key={s.id}>
                    {showHeader && (
                      <div className="px-3 pt-2 pb-1 text-[11px] font-medium text-neutral-500">
                        {s.department ? getDept(s.department) : 'No department'}
                      </div>
                    )}
                    <div
                      id={optionId(i)}
                      role="option"
                      aria-selected={s.id === currentId}
                      aria-disabled={taken}
                      onMouseEnter={() => !taken && setActive(i)}
                      onClick={() => choose(s)}
                      className={cn(
                        'flex cursor-pointer items-center justify-between gap-3 px-3 py-1.5 text-sm',
                        i === active && !taken && 'bg-emerald-500/10',
                        taken && 'cursor-not-allowed text-neutral-400',
                        s.id === currentId && 'font-medium',
                      )}
                    >
                      <span className="min-w-0 truncate">{s.name}</span>
                      <span className="shrink-0 text-xs text-neutral-500">
                        {taken ? 'Already assigned' : <span className="font-mono">{s.uid}</span>}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

// ────────────────────────────────────────────────────────────
// Assignment list (one per order type)
// ────────────────────────────────────────────────────────────

function CoverageLabel({ coverage }: { coverage: Coverage }) {
  const map = {
    complete: {
      Icon: CheckCircle2,
      text: 'Complete',
      cls: 'text-emerald-700 dark:text-emerald-400',
    },
    incomplete: {
      Icon: CircleDashed,
      text: 'Incomplete',
      cls: 'text-amber-700 dark:text-amber-400',
    },
    invalid: { Icon: XCircle, text: 'Needs attention', cls: 'text-red-700 dark:text-red-400' },
  }[coverage];
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-medium', map.cls)}>
      <map.Icon
        aria-hidden
        className="h-3.5 w-3.5"
      />
      {map.text}
    </span>
  );
}

function AssignmentList({
  title,
  typeLabel,
  slots,
  analysis,
  pool,
  staffIndex,
  staleStaff,
  disabled,
  onChange,
}: {
  title: string;
  typeLabel: string;
  slots: Slots;
  analysis: ListAnalysis;
  pool: StaffMember[];
  staffIndex: Map<string, StaffMember>;
  staleStaff: Map<string, StaleStaffInfo>;
  disabled: boolean;
  onChange: (index: number, id: string | null) => void;
}) {
  const coverage = coverageOf(analysis);
  const takenIds = useMemo(() => new Set(slots.filter((s): s is string => !!s)), [slots]);
  // Show every required slot, plus any occupied slot beyond the requirement.
  const visibleCount = Math.max(analysis.required, trimTrailingEmpty(slots).length);
  const shortage = analysis.poolSize < analysis.required;

  return (
    <section aria-label={title}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-neutral-200 pb-2 dark:border-neutral-800">
        <h3 className="text-sm font-semibold">
          {title}{' '}
          <span className="font-normal text-neutral-500 tabular-nums">
            {analysis.filledRequired} of {analysis.required} assigned
          </span>
        </h3>
        <CoverageLabel coverage={coverage} />
      </div>

      {shortage && (
        <p
          role="status"
          className="mt-2 flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400"
        >
          <AlertTriangle
            aria-hidden
            className="mt-0.5 h-3.5 w-3.5 shrink-0"
          />
          Only {analysis.poolSize} eligible {typeLabel.toLowerCase()}
          {analysis.poolSize === 1 ? '' : 's'} registered for {analysis.required} positions. Add
          staff to fully cover this session.
        </p>
      )}

      <ol className="mt-2 divide-y divide-neutral-100 dark:divide-neutral-900">
        {Array.from({ length: visibleCount }, (_, i) => {
          const id = slots[i] ?? null;
          const member = id ? staffIndex.get(id) : undefined;
          const note = analysis.notes[i] ?? null;
          const stale = id && !member ? staleStaff.get(id) : undefined;
          const noteId = `${title.replace(/\s/g, '')}-note-${i}`;
          return (
            <li
              key={i}
              className="grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-start gap-2 py-2"
            >
              <span className="pt-2 text-right font-mono text-xs text-neutral-500 tabular-nums">
                {i + 1}
              </span>
              <div
                className="min-w-0"
                aria-describedby={note ? noteId : undefined}
              >
                <StaffPicker
                  label={`${typeLabel} position ${i + 1}`}
                  pool={pool}
                  takenIds={takenIds}
                  currentId={id}
                  disabled={disabled}
                  invalid={note?.severity === 'error'}
                  onSelect={(next) => onChange(i, next)}
                >
                  {id ? (
                    member ? (
                      <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                        <span className="font-medium">{member.name}</span>
                        <span className="font-mono text-xs text-neutral-500">{member.uid}</span>
                        {member.department && (
                          <span className="truncate text-xs text-neutral-500">
                            {getDept(member.department)}
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-red-700 dark:text-red-400">
                        <AlertTriangle
                          aria-hidden
                          className="h-3.5 w-3.5 shrink-0"
                        />
                        {stale ? `${stale.name} (${stale.uid})` : 'Unknown staff record'}
                      </span>
                    )
                  ) : (
                    <span>Choose {typeLabel.toLowerCase()}</span>
                  )}
                </StaffPicker>
                {note && (
                  <p
                    id={noteId}
                    className={cn(
                      'mt-1 text-xs',
                      note.severity === 'error'
                        ? 'text-red-700 dark:text-red-400'
                        : 'text-amber-700 dark:text-amber-400',
                    )}
                  >
                    {note.text}
                  </p>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                disabled={disabled || !id}
                onClick={() => onChange(i, null)}
                aria-label={`Clear ${typeLabel.toLowerCase()} position ${i + 1}`}
              >
                <X
                  aria-hidden
                  className="h-4 w-4"
                />
              </Button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

// ────────────────────────────────────────────────────────────
// Overview metric
// ────────────────────────────────────────────────────────────

function Metric({
  label,
  value,
  detail,
  coverage,
}: {
  label: string;
  value: string;
  detail: string;
  coverage?: Coverage;
}) {
  return (
    <div className="bg-white px-4 py-3 dark:bg-neutral-950">
      <dt className="text-xs text-neutral-500">{label}</dt>
      <dd className="mt-0.5 text-xl font-semibold tracking-tight tabular-nums">{value}</dd>
      <div className="mt-0.5 min-h-4 text-xs text-neutral-500">
        {coverage ? <CoverageLabel coverage={coverage} /> : detail}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Page
// ────────────────────────────────────────────────────────────

export default function SupervisionOrder() {
  const { examCenter, isLoading: userLoading } = useUserInfo();
  const centerId = examCenter?.id;

  const [date, setDate] = useState<string>(() => format(new Date(), 'yyyy-MM-dd'));
  const [session, setSession] = useState<Session>('Morning');
  const [reloadKey, setReloadKey] = useState(0);

  const [blockConfig, setBlockConfig] = useState<BlockConfig | null>(null);
  const [blockConfigError, setBlockConfigError] = useState<string | null>(null);

  const [supervisorPool, setSupervisorPool] = useState<StaffMember[]>([]);
  const [relieverPool, setRelieverPool] = useState<StaffMember[]>([]);

  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [draftSup, setDraftSup] = useState<Slots>([]);
  const [draftRel, setDraftRel] = useState<Slots>([]);

  const [saving, setSaving] = useState(false);
  const [staleReason, setStaleReason] = useState<null | 'partial' | 'refresh'>(null);
  const [reviewOpen, setReviewOpen] = useState(false);

  const requestRef = useRef(0);
  const saveLockRef = useRef(false);

  // ── Block strength (average students per block): verified, never silently defaulted ──
  useEffect(() => {
    if (!centerId) return;
    let cancelled = false;
    (async () => {
      const cached = readCachedStaffPerBlock(centerId);
      if (cached !== null) {
        setBlockConfig({ value: cached, source: 'cache' });
        setBlockConfigError(null);
        return;
      }
      try {
        const strengths = await fetchBlockStrengths(createClient(), centerId);
        if (cancelled) return;
        if (strengths.length > 0) {
          const avg = Math.round(strengths.reduce((a, b) => a + b, 0) / strengths.length);
          const value = avg > 0 ? avg : DEFAULT_STAFF_PER_BLOCK;
          if (avg > 0) writeCachedStaffPerBlock(centerId, value);
          setBlockConfig({ value, source: avg > 0 ? 'blocks' : 'default' });
        } else {
          // Verified: no blocks configured. Use the default but label it, and do not cache it.
          setBlockConfig({ value: DEFAULT_STAFF_PER_BLOCK, source: 'default' });
        }
        setBlockConfigError(null);
      } catch (err) {
        if (cancelled) return;
        setBlockConfig(null);
        setBlockConfigError(
          err instanceof Error ? err.message : 'Failed to read block configuration',
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [centerId, reloadKey]);

  // ── Session loader: authoritative reads, stale-response safe ──
  const loadSession = useCallback(
    async (d: string, s: Session): Promise<SessionSnapshot | null> => {
      if (!centerId || !blockConfig) return null;
      const requestId = ++requestRef.current;
      setLoading(true);
      setLoadError(null);
      try {
        const supabase = createClient();
        const [tt, alloc, orders, sup, rel] = await Promise.allSettled([
          fetchTimetable(supabase, centerId, d, s),
          fetchAllocations(supabase, centerId, d, s),
          fetchOrders(supabase, centerId, d, s),
          fetchStaffPool(supabase, centerId, 'SUPERVISOR'),
          fetchStaffPool(supabase, centerId, 'RELIEVER'),
        ]);
        if (requestId !== requestRef.current) return null;

        const fail = (label: string, r: PromiseSettledResult<unknown>) =>
          r.status === 'rejected'
            ? `${label}: ${r.reason instanceof Error ? r.reason.message : 'request failed'}`
            : null;
        const blocking = [
          fail('Timetable', tt),
          fail('Existing orders', orders),
          fail('Supervisor list', sup),
          fail('Reliever list', rel),
        ].filter(Boolean);
        if (
          blocking.length > 0 ||
          tt.status !== 'fulfilled' ||
          orders.status !== 'fulfilled' ||
          sup.status !== 'fulfilled' ||
          rel.status !== 'fulfilled'
        ) {
          throw new Error(`${blocking.join('; ')}. Totals could not be verified.`);
        }

        const warnings: string[] = [];
        let totalStudents = tt.value.total;
        let totalSource: SessionSnapshot['totalSource'] = 'timetable';
        let schemes = tt.value.schemes;

        if (alloc.status === 'rejected') {
          if (tt.value.rowCount === 0) {
            throw new Error(
              'The timetable has no entries and allocations could not be checked, so a zero-student session cannot be confirmed.',
            );
          }
          warnings.push(
            'Block allocations could not be read, so the timetable total was not cross-checked.',
          );
        } else {
          if (tt.value.total === 0 && alloc.value.total > 0) {
            totalStudents = alloc.value.total;
            totalSource = 'allocations';
            schemes = alloc.value.schemes;
            warnings.push(
              `The timetable has no students for this session, but allocations assign ${alloc.value.total}. Requirements use the allocation total. Check the timetable.`,
            );
          } else if (
            tt.value.total > 0 &&
            alloc.value.total > 0 &&
            tt.value.total !== alloc.value.total
          ) {
            warnings.push(
              `Timetable reports ${tt.value.total} students but allocations report ${alloc.value.total}. Requirements use the timetable. Reconcile before the exam.`,
            );
          }
        }
        if (tt.value.possibleDuplicates > 0) {
          warnings.push(
            `${tt.value.possibleDuplicates} timetable row(s) repeat a scheme and subject, so the student total may be overstated.`,
          );
        }

        const { requiredSupervisors, requiredRelievers } =
          totalStudents > 0
            ? requiredStaffing(totalStudents, blockConfig.value)
            : { requiredSupervisors: 0, requiredRelievers: 0 };

        const staffIndex = new Map<string, StaffMember>();
        for (const m of [...sup.value, ...rel.value]) staffIndex.set(m.id, m);

        const supRows = orders.value.filter((o) => o.order_type === 'supervision');
        const relRows = orders.value.filter((o) => o.order_type === 'reliever');
        const supBuilt = buildSlots(supRows, requiredSupervisors);
        const relBuilt = buildSlots(relRows, requiredRelievers);

        const unresolved = [...supBuilt.slots, ...relBuilt.slots].filter(
          (id): id is string => !!id && !staffIndex.has(id),
        );
        const staleStaff = await fetchStaleStaff(supabase, centerId, [...new Set(unresolved)]);
        if (requestId !== requestRef.current) return null;

        const snap: SessionSnapshot = {
          date: d,
          session: s,
          totalStudents,
          totalSource,
          schemes,
          warnings,
          requiredSupervisors,
          requiredRelievers,
          orders: orders.value,
          supervisorSlots: supBuilt.slots,
          relieverSlots: relBuilt.slots,
          needsNormalise: supBuilt.normalise || relBuilt.normalise,
          staleStaff,
        };

        setSupervisorPool(sup.value);
        setRelieverPool(rel.value);
        setSnapshot(snap);
        setDraftSup(supBuilt.slots);
        setDraftRel(relBuilt.slots);
        setStaleReason(null);
        return snap;
      } catch (err) {
        if (requestId !== requestRef.current) return null;
        setSnapshot(null);
        setLoadError(err instanceof Error ? err.message : 'Failed to load session');
        return null;
      } finally {
        if (requestId === requestRef.current) setLoading(false);
      }
    },
    [centerId, blockConfig],
  );

  // Load whenever the selection (or reload counter) changes. Selection handlers have
  // already dealt with unsaved drafts, so this may replace the draft.
  useEffect(() => {
    if (!centerId || !blockConfig || !date) return;
    void loadSession(date, session);
  }, [centerId, blockConfig, date, session, reloadKey, loadSession]);

  // ── Derived state ──
  const staffIndex = useMemo(() => {
    const m = new Map<string, StaffMember>();
    for (const s of [...supervisorPool, ...relieverPool]) m.set(s.id, s);
    return m;
  }, [supervisorPool, relieverPool]);

  const supAnalysis = useMemo(
    () =>
      snapshot
        ? analyzeList(
            draftSup,
            snapshot.requiredSupervisors,
            supervisorPool,
            staffIndex,
            snapshot.staleStaff,
            'Supervisor',
          )
        : null,
    [snapshot, draftSup, supervisorPool, staffIndex],
  );
  const relAnalysis = useMemo(
    () =>
      snapshot
        ? analyzeList(
            draftRel,
            snapshot.requiredRelievers,
            relieverPool,
            staffIndex,
            snapshot.staleStaff,
            'Reliever',
          )
        : null,
    [snapshot, draftRel, relieverPool, staffIndex],
  );

  const isDirty = useMemo(() => {
    if (!snapshot) return false;
    return (
      snapshot.needsNormalise ||
      !slotsEqual(draftSup, snapshot.supervisorSlots) ||
      !slotsEqual(draftRel, snapshot.relieverSlots)
    );
  }, [snapshot, draftSup, draftRel]);

  const nameOf = useCallback(
    (id: string | null) => {
      if (!id) return 'Empty';
      const m = staffIndex.get(id);
      if (m) return `${m.name} (${m.uid})`;
      const stale = snapshot?.staleStaff.get(id);
      return stale ? `${stale.name} (${stale.uid}), unavailable` : 'Unknown staff record';
    },
    [staffIndex, snapshot],
  );

  const changes = useMemo<ChangeLine[]>(() => {
    if (!snapshot) return [];
    const out: ChangeLine[] = [];
    const diff = (label: string, base: Slots, draft: Slots) => {
      const len = Math.max(base.length, draft.length);
      for (let i = 0; i < len; i += 1) {
        const a = base[i] ?? null;
        const b = draft[i] ?? null;
        if (a !== b) out.push({ label: `${label} ${i + 1}`, from: nameOf(a), to: nameOf(b) });
      }
    };
    diff('Supervisor', snapshot.supervisorSlots, draftSup);
    diff('Reliever', snapshot.relieverSlots, draftRel);
    return out;
  }, [snapshot, draftSup, draftRel, nameOf]);

  const issues = useMemo<Issue[]>(() => {
    if (!snapshot || !supAnalysis || !relAnalysis) return [];
    const out: Issue[] = [];
    const add = (a: ListAnalysis, label: string, lower: string) => {
      const missing = a.required - a.filledRequired;
      if (missing > 0) {
        out.push({
          id: `${lower}-incomplete`,
          severity: 'error',
          kind: 'incomplete',
          message: `${missing} ${lower} position${missing === 1 ? '' : 's'} still empty.`,
          hint: 'Assign staff to every position.',
        });
      }
      if (a.poolSize < a.required) {
        out.push({
          id: `${lower}-shortage`,
          severity: 'error',
          kind: 'incomplete',
          message: `Only ${a.poolSize} eligible ${lower}${a.poolSize === 1 ? '' : 's'} for ${a.required} positions.`,
          hint: `Register more ${lower}s in staff settings.`,
        });
      }
      if (a.duplicates > 0) {
        out.push({
          id: `${lower}-dup`,
          severity: 'error',
          kind: 'invalid',
          message: `${label} assigned more than once.`,
          hint: 'Clear the repeated slots.',
        });
      }
      if (a.missingRecords > 0) {
        out.push({
          id: `${lower}-missing`,
          severity: 'error',
          kind: 'invalid',
          message: `${a.missingRecords} ${lower} slot${a.missingRecords === 1 ? '' : 's'} reference unavailable staff.`,
          hint: 'Replace or clear them.',
        });
      }
      if (a.ineligible > 0) {
        out.push({
          id: `${lower}-ineligible`,
          severity: 'error',
          kind: 'invalid',
          message: `${a.ineligible} ${lower} slot${a.ineligible === 1 ? '' : 's'} hold staff of another type.`,
          hint: 'Replace them with eligible staff.',
        });
      }
      if (a.beyond > 0) {
        out.push({
          id: `${lower}-beyond`,
          severity: 'error',
          kind: 'invalid',
          message: `${a.beyond} existing ${lower} order${a.beyond === 1 ? '' : 's'} exceed the current requirement of ${a.required}.`,
          hint: 'Clear the extra slots; saving will remove those orders.',
        });
      }
    };
    add(supAnalysis, 'A supervisor is', 'supervisor');
    add(relAnalysis, 'A reliever is', 'reliever');
    if (staleReason === 'partial') {
      out.push({
        id: 'stale-partial',
        severity: 'error',
        kind: 'invalid',
        message:
          'A previous save stopped part-way, so the stored orders may differ from what you see.',
        hint: 'Reload from the database before saving again.',
      });
    }
    if (staleReason === 'refresh') {
      out.push({
        id: 'stale-refresh',
        severity: 'error',
        kind: 'invalid',
        message:
          'Your changes were written, but the follow-up reload failed, so they are unverified.',
        hint: 'Reload to confirm what was stored.',
      });
    }
    for (const [i, w] of snapshot.warnings.entries()) {
      out.push({ id: `warn-${i}`, severity: 'warning', kind: 'info', message: w });
    }
    if (snapshot.needsNormalise) {
      out.push({
        id: 'normalise',
        severity: 'warning',
        kind: 'info',
        message:
          'Some existing orders have unexpected keys. Saving will renumber them by position.',
      });
    }
    return out;
  }, [snapshot, supAnalysis, relAnalysis, staleReason]);

  const errors = issues.filter((i) => i.severity === 'error');
  const hasInvalid = errors.some((i) => i.kind === 'invalid');
  const canSave =
    !!snapshot &&
    snapshot.totalStudents > 0 &&
    !loading &&
    !saving &&
    isDirty &&
    errors.length === 0;

  // Warn before the tab is closed with unsaved work.
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  // ── Handlers ──
  const setSlot = (kind: 'sup' | 'rel', index: number, id: string | null) => {
    const update = (prev: Slots) => {
      const next = [...prev];
      while (next.length <= index) next.push(null);
      next[index] = id;
      return next;
    };
    if (kind === 'sup') setDraftSup(update);
    else setDraftRel(update);
  };

  const confirmDiscard = (action: string) =>
    !isDirty ||
    window.confirm(`You have unsaved assignments. ${action} will discard them. Continue?`);

  const changeSelection = (next: { date?: string; session?: Session }) => {
    const nd = next.date ?? date;
    const ns = next.session ?? session;
    if (!nd || (nd === date && ns === session)) return;
    if (!confirmDiscard('Switching session')) return;
    // Clear immediately so the previous session is never shown under the new selection.
    setSnapshot(null);
    setDraftSup([]);
    setDraftRel([]);
    setLoadError(null);
    setDate(nd);
    setSession(ns);
  };

  const handleReload = () => {
    if (!confirmDiscard('Reloading')) return;
    setReloadKey((k) => k + 1);
  };

  const handleDiscard = () => {
    if (!snapshot) return;
    setDraftSup(snapshot.supervisorSlots);
    setDraftRel(snapshot.relieverSlots);
  };

  // ── Save ──
  const handleSave = async () => {
    if (saveLockRef.current || !canSave || !snapshot || !centerId) return;
    saveLockRef.current = true;
    setSaving(true);

    const supabase = createClient();
    const { date: d, session: s } = snapshot;
    let applied = 0;
    let total = 0;
    let stage = 'checking data';

    try {
      // 1. Re-read authoritative rows: refuse to overwrite changes made elsewhere.
      const [fresh, freshSup, freshRel] = await Promise.all([
        fetchOrders(supabase, centerId, d, s),
        fetchStaffPool(supabase, centerId, 'SUPERVISOR'),
        fetchStaffPool(supabase, centerId, 'RELIEVER'),
      ]);
      if (fingerprint(fresh) !== fingerprint(snapshot.orders)) {
        toast.error(
          'These orders were changed elsewhere since you loaded them. Reload to see the latest, then reapply your edits.',
        );
        setStaleReason('partial');
        return;
      }

      // 2. Validate every selected staff id against fresh eligibility data.
      const supIds = new Set(freshSup.map((m) => m.id));
      const relIds = new Set(freshRel.map((m) => m.id));
      const supTarget = draftSup.slice(0, snapshot.requiredSupervisors) as string[];
      const relTarget = draftRel.slice(0, snapshot.requiredRelievers) as string[];
      if (
        supTarget.some((id) => !id || !supIds.has(id)) ||
        relTarget.some((id) => !id || !relIds.has(id))
      ) {
        setSupervisorPool(freshSup);
        setRelieverPool(freshRel);
        toast.error(
          'Some selected staff are no longer eligible. The lists were refreshed. Review and retry.',
        );
        return;
      }

      // 3. Plan the minimal writes per order type.
      const supPlan = planWrites(
        fresh.filter((o) => o.order_type === 'supervision'),
        supTarget,
        'supervision',
        'SUP',
        d,
        s,
      );
      const relPlan = planWrites(
        fresh.filter((o) => o.order_type === 'reliever'),
        relTarget,
        'reliever',
        'REL',
        d,
        s,
      );
      const updates = [...supPlan.updates, ...relPlan.updates];
      const inserts = [...supPlan.inserts, ...relPlan.inserts];
      const deletes = [...supPlan.deletes, ...relPlan.deletes];
      total = updates.length + inserts.length + deletes.length;
      if (total === 0) {
        toast.info('Nothing to change.');
        return;
      }

      // 4a. Update changed slots (each scoped to center, date, session; row count verified).
      stage = 'updating assignments';
      for (const u of updates) {
        const { data, error } = await supabase
          .from('orders')
          .update({ staff_id: u.staff_id, order_key: u.order_key })
          .eq('id', u.id)
          .eq('exam_center_id', centerId)
          .eq('date', d)
          .eq('session', s)
          .select('id');
        if (error) throw new Error(error.message);
        if ((data ?? []).length !== 1) {
          throw new Error('The database did not accept the update. You may not have permission.');
        }
        applied += 1;
      }

      // 4b. Insert new slots in one request.
      stage = 'adding assignments';
      if (inserts.length > 0) {
        const { data, error } = await supabase
          .from('orders')
          .insert(inserts.map((r) => ({ exam_center_id: centerId, ...r })))
          .select('id');
        if (error) throw new Error(error.message);
        if ((data ?? []).length !== inserts.length) {
          throw new Error(
            `Only ${(data ?? []).length} of ${inserts.length} new orders were written.`,
          );
        }
        applied += inserts.length;
      }

      // 4c. Only now remove leftovers (extras / unplaceable legacy rows).
      stage = 'removing outdated orders';
      if (deletes.length > 0) {
        const { data, error } = await supabase
          .from('orders')
          .delete()
          .eq('exam_center_id', centerId)
          .eq('date', d)
          .eq('session', s)
          .in('order_type', ['supervision', 'reliever'])
          .in('id', deletes)
          .select('id');
        if (error) throw new Error(error.message);
        if ((data ?? []).length !== deletes.length) {
          throw new Error(
            `Only ${(data ?? []).length} of ${deletes.length} outdated orders were removed.`,
          );
        }
        applied += deletes.length;
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'Unknown error';
      if (applied > 0) {
        setStaleReason('partial');
        toast.error(
          `Save stopped while ${stage}: ${detail} ${applied} of ${total} changes were applied. Reload to see what is stored. Your draft is still on screen.`,
          { duration: 12000 },
        );
      } else {
        toast.error(
          `Save failed while ${stage}: ${detail} Nothing was changed, and your draft is kept.`,
        );
      }
      saveLockRef.current = false;
      setSaving(false);
      return;
    }

    // 5. Writes succeeded: refresh and verify against the database.
    const expectedSup = snapshot.requiredSupervisors;
    const expectedRel = snapshot.requiredRelievers;
    const expected = { sup: draftSup.slice(0, expectedSup), rel: draftRel.slice(0, expectedRel) };
    const reloaded = await loadSession(d, s);
    saveLockRef.current = false;
    setSaving(false);

    if (!reloaded) {
      setStaleReason('refresh');
      toast.warning(
        'Saved, but the reload failed, so the result is unverified. Reload to confirm.',
      );
      return;
    }
    if (
      !slotsEqual(reloaded.supervisorSlots, expected.sup) ||
      !slotsEqual(reloaded.relieverSlots, expected.rel)
    ) {
      toast.error(
        'Saved, but the stored orders differ from your selection. Review the lists now shown.',
        {
          duration: 10000,
        },
      );
      return;
    }
    toast.success('Orders saved and verified.');
  };

  // ── Render ──
  const contextReady = !userLoading && !!centerId;
  const configReady = !!blockConfig;

  if (userLoading) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 px-4 py-6 sm:px-6">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  if (!centerId) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <p
          role="alert"
          className="text-sm text-neutral-600 dark:text-neutral-400"
        >
          No exam center is available for your account, so orders can’t be managed.
        </p>
      </div>
    );
  }

  const supCoverage = supAnalysis ? coverageOf(supAnalysis) : undefined;
  const relCoverage = relAnalysis ? coverageOf(relAnalysis) : undefined;

  let saveState: { label: string; tone: 'ok' | 'warn' | 'bad' | 'busy' };
  if (saving) saveState = { label: 'Saving…', tone: 'busy' };
  else if (staleReason) saveState = { label: 'Reload needed', tone: 'bad' };
  else if (hasInvalid) saveState = { label: 'Needs attention', tone: 'bad' };
  else if (errors.length > 0) saveState = { label: 'Incomplete', tone: 'warn' };
  else if (isDirty) saveState = { label: 'Unsaved changes', tone: 'warn' };
  else saveState = { label: 'Saved', tone: 'ok' };

  const hasPanel = errors.length + (issues.length - errors.length) + changes.length > 0;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 pb-40 sm:px-6">
      {/* Header */}
      <header className="flex flex-col gap-4 border-b border-neutral-200 pb-4 lg:flex-row lg:items-end lg:justify-between dark:border-neutral-800">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">
            Supervision &amp; Reliever Orders
          </h1>
          <p className="mt-0.5 text-sm text-neutral-600 dark:text-neutral-400">
            Assign supervisors and relievers for one examination session.
            {examCenter?.code && (
              <span className="ml-1 font-mono text-xs">Center {examCenter.code}</span>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label
              htmlFor="supervision-date"
              className="mb-1 block text-xs text-neutral-500"
            >
              Exam date
            </label>
            <Input
              id="supervision-date"
              type="date"
              value={date}
              onChange={(e) => changeSelection({ date: e.target.value })}
              disabled={saving}
              className="h-9 w-40 tabular-nums"
            />
          </div>
          <div>
            <span
              id="session-label"
              className="mb-1 block text-xs text-neutral-500"
            >
              Session
            </span>
            <div
              role="radiogroup"
              aria-labelledby="session-label"
              className="inline-flex h-9 overflow-hidden rounded-md border border-neutral-200 dark:border-neutral-800"
            >
              {(['Morning', 'Afternoon'] as Session[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={session === s}
                  disabled={saving}
                  onClick={() => changeSelection({ session: s })}
                  className={cn(
                    'px-3 text-sm transition-colors disabled:opacity-60 motion-reduce:transition-none',
                    session === s
                      ? 'bg-emerald-600 text-white dark:bg-emerald-500 dark:text-neutral-950'
                      : 'bg-white text-neutral-700 hover:bg-neutral-50 dark:bg-neutral-950 dark:text-neutral-300 dark:hover:bg-neutral-900',
                    FOCUS_RING,
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 gap-1.5"
            disabled={loading || saving}
            onClick={handleReload}
          >
            <RefreshCw
              aria-hidden
              className={cn('h-3.5 w-3.5', loading && 'animate-spin motion-reduce:animate-none')}
            />
            {loading ? 'Loading…' : 'Reload'}
          </Button>
        </div>
      </header>

      {blockConfigError && (
        <div
          role="alert"
          className="mt-4 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/20 dark:text-red-300"
        >
          Block configuration could not be read ({blockConfigError}), so required staffing can’t be
          calculated.{' '}
          <button
            type="button"
            className="underline"
            onClick={() => setReloadKey((k) => k + 1)}
          >
            Retry
          </button>
        </div>
      )}

      {loadError && (
        <div
          role="alert"
          className="mt-4 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/20 dark:text-red-300"
        >
          Session data could not be verified: {loadError}{' '}
          <button
            type="button"
            className="underline"
            onClick={() => setReloadKey((k) => k + 1)}
          >
            Retry
          </button>
        </div>
      )}

      {contextReady &&
        (loading || !configReady) &&
        !snapshot &&
        !loadError &&
        !blockConfigError && (
          <div
            role="status"
            aria-live="polite"
            className="mt-6 space-y-3"
          >
            <span className="sr-only">Loading session data…</span>
            <Skeleton
              className="h-20 w-full"
              aria-hidden
            />
            <Skeleton
              className="h-72 w-full"
              aria-hidden
            />
          </div>
        )}

      {snapshot && snapshot.totalStudents === 0 && (
        <div className="mt-6 rounded-xl border border-dashed border-neutral-300 px-6 py-12 text-center dark:border-neutral-700">
          <p className="text-sm font-medium">No students are scheduled for this session</p>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
            The timetable
            {snapshot.warnings.length === 0 ? ' and block allocations both' : ''} show 0 students
            for {snapshot.date}, {snapshot.session}. No supervision orders are required.
          </p>
          {snapshot.orders.length > 0 && (
            <p className="mt-2 text-sm text-amber-700 dark:text-amber-400">
              {snapshot.orders.length} order{snapshot.orders.length === 1 ? '' : 's'} already exist
              for this session. Remove them from the orders list if they are no longer needed.
            </p>
          )}
        </div>
      )}

      {snapshot && snapshot.totalStudents > 0 && supAnalysis && relAnalysis && (
        <div
          className={cn('mt-6 space-y-6', loading && 'opacity-60')}
          aria-busy={loading}
        >
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-neutral-200 bg-neutral-200 sm:grid-cols-4 dark:border-neutral-800 dark:bg-neutral-800">
            <Metric
              label="Students"
              value={snapshot.totalStudents.toLocaleString('en-IN')}
              detail={`From ${snapshot.totalSource}`}
            />
            <Metric
              label="Supervisors"
              value={`${supAnalysis.filledRequired} / ${snapshot.requiredSupervisors}`}
              detail=""
              coverage={supCoverage}
            />
            <Metric
              label="Relievers"
              value={`${relAnalysis.filledRequired} / ${snapshot.requiredRelievers}`}
              detail=""
              coverage={relCoverage}
            />
            <Metric
              label="Students per block"
              value={String(blockConfig?.value ?? '—')}
              detail={
                blockConfig?.source === 'default'
                  ? 'Default, no blocks configured'
                  : 'Average of configured blocks'
              }
            />
          </dl>

          <div className="grid gap-x-10 gap-y-8 lg:grid-cols-2">
            <AssignmentList
              title="Supervisors"
              typeLabel="Supervisor"
              slots={draftSup}
              analysis={supAnalysis}
              pool={supervisorPool}
              staffIndex={staffIndex}
              staleStaff={snapshot.staleStaff}
              disabled={saving}
              onChange={(i, id) => setSlot('sup', i, id)}
            />
            <AssignmentList
              title="Relievers"
              typeLabel="Reliever"
              slots={draftRel}
              analysis={relAnalysis}
              pool={relieverPool}
              staffIndex={staffIndex}
              staleStaff={snapshot.staleStaff}
              disabled={saving}
              onChange={(i, id) => setSlot('rel', i, id)}
            />
          </div>
        </div>
      )}

      {/* Persistent save area */}
      {snapshot && snapshot.totalStudents > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            {reviewOpen && hasPanel && (
              <div
                id="review-panel"
                className="max-h-60 space-y-3 overflow-y-auto border-b border-neutral-200 py-3 text-sm dark:border-neutral-800"
              >
                {issues.length > 0 && (
                  <ul className="space-y-1.5">
                    {issues.map((i) => (
                      <li
                        key={i.id}
                        className="flex items-start gap-2"
                      >
                        {i.severity === 'error' ? (
                          <XCircle
                            aria-hidden
                            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600 dark:text-red-400"
                          />
                        ) : (
                          <AlertTriangle
                            aria-hidden
                            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400"
                          />
                        )}
                        <span>
                          <span className="sr-only">
                            {i.severity === 'error' ? 'Problem: ' : 'Warning: '}
                          </span>
                          {i.message}
                          {i.hint && <span className="text-neutral-500"> {i.hint}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {changes.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-medium text-neutral-500">
                      Changes to be saved ({changes.length})
                    </p>
                    <ul className="space-y-1 text-xs">
                      {changes.map((c) => (
                        <li
                          key={c.label}
                          className="flex flex-wrap gap-x-2"
                        >
                          <span className="font-medium">{c.label}</span>
                          <span className="text-neutral-500 line-through">{c.from}</span>
                          <span>{c.to}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
              <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                <span
                  role="status"
                  aria-live="polite"
                  className={cn(
                    'inline-flex items-center gap-1.5 text-sm font-medium',
                    saveState.tone === 'ok' && 'text-emerald-700 dark:text-emerald-400',
                    saveState.tone === 'warn' && 'text-amber-700 dark:text-amber-400',
                    saveState.tone === 'bad' && 'text-red-700 dark:text-red-400',
                    saveState.tone === 'busy' && 'text-neutral-700 dark:text-neutral-300',
                  )}
                >
                  {saveState.tone === 'ok' && (
                    <CheckCircle2
                      aria-hidden
                      className="h-4 w-4"
                    />
                  )}
                  {saveState.tone === 'warn' && (
                    <AlertTriangle
                      aria-hidden
                      className="h-4 w-4"
                    />
                  )}
                  {saveState.tone === 'bad' && (
                    <XCircle
                      aria-hidden
                      className="h-4 w-4"
                    />
                  )}
                  {saveState.tone === 'busy' && (
                    <Loader2
                      aria-hidden
                      className="h-4 w-4 animate-spin motion-reduce:animate-none"
                    />
                  )}
                  {saveState.label}
                </span>
                <span className="text-xs text-neutral-500">
                  {changes.length > 0
                    ? `${changes.length} change${changes.length === 1 ? '' : 's'} to save`
                    : isDirty
                      ? 'Orders will be renumbered'
                      : 'No changes'}
                  {errors.length > 0 && `, ${errors.length} to resolve`}
                </span>
                {hasPanel && (
                  <button
                    type="button"
                    aria-expanded={reviewOpen}
                    aria-controls="review-panel"
                    onClick={() => setReviewOpen((o) => !o)}
                    className={cn('rounded text-xs underline underline-offset-2', FOCUS_RING)}
                  >
                    {reviewOpen ? 'Hide details' : 'Review details'}
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                {staleReason && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9"
                    onClick={() => setReloadKey((k) => k + 1)}
                    disabled={loading || saving}
                  >
                    Reload from database
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-9 gap-1.5"
                  onClick={handleDiscard}
                  disabled={!isDirty || saving}
                >
                  <Undo2
                    aria-hidden
                    className="h-3.5 w-3.5"
                  />
                  Discard
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-9 gap-1.5 bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50 dark:bg-emerald-500 dark:text-neutral-950 dark:hover:bg-emerald-400"
                  onClick={() => void handleSave()}
                  disabled={!canSave}
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
                  {saving ? 'Saving…' : 'Save orders'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
