// modules/automation/office-order-mail.tsx
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import departments from '@/config/course_codes.json';
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  Filter,
  Loader2,
  Mail,
  Plus,
  RefreshCw,
  Search,
  Send,
  Trash2,
  UserCheck,
  Users,
  Users2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

import { useUserInfo } from '@/hooks/useUserInfo';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

import { MSBTEContextBar } from '@/components/layout/msbte-context-bar';
import { PageHeader } from '@/components/layout/page-layout';

import { EmailUsageStats } from '@/components/admin/email-usage-stats';

// ============================================================
// Constants
// ============================================================

const EMAIL_EXCLUDES_KEY = 'order_email_excludes';
const LOG_KEY = 'order_email_log';
const LOG_LIMIT = 500;
const QUOTA_LIMIT = 80;

// ============================================================
// Types
// ============================================================

type OrderKind = 'supervision' | 'reliever' | 'chief';

interface Duty {
  date: string;
  session: string;
}

interface Recipient {
  selected: boolean;
  id: string;
  kind: OrderKind;
  name: string;
  email: string;
  department: string;
  role: string;
  post?: string;
  duties: Duty[];
}

interface ManualOfficerInput {
  name: string;
  department: string;
  email: string;
  role: string;
  post: string;
}

interface SendFailure {
  email: string;
  name: string;
  error?: string;
  errorCode?: string;
  errorKind?: string;
  attempts?: number;
}

interface SendReport {
  sent: number;
  failed: number;
  total: number;
  failures: SendFailure[];
  at: string;
}

interface LogEntry {
  id: string;
  at: string;
  email: string;
  name: string;
  subject: string;
  orderType: string;
  orderKey?: string;
  ok: boolean;
  error?: string;
  errorKind?: string;
  attempts?: number;
}

type MonitorTarget =
  | { type: 'section'; kind: OrderKind }
  | { type: 'recipient'; recipient: Recipient }
  | { type: 'exclusion'; value: string }
  | { type: 'failure'; failure: SendFailure }
  | { type: 'report' }
  | { type: 'reference'; field: 'orderKey' | 'collegeRefKey' }
  | { type: 'search' }
  | { type: 'logs' };

type MonitorAction =
  | { type: 'toggle-recipient'; kind: OrderKind; id: string }
  | { type: 'bulk-toggle'; kind: OrderKind }
  | { type: 'remove-officer'; id: string }
  | { type: 'remove-exclude'; value: string }
  | { type: 'retry-failure'; email: string }
  | { type: 'retry-all' }
  | { type: 'focus-search'; value: string }
  | { type: 'monitor-recipient-email'; email: string }
  | { type: 'monitor-failure'; failure: SendFailure }
  | { type: 'clear-logs' };

const ROLE_OPTIONS = ['Lecturer', 'HOD', 'Lab Assistant'] as const;
const POST_OPTIONS = [
  'Chief Officer In-Charge',
  'Officer In-Charge',
  'Sealing Supervisor',
  'Exam Controller',
] as const;

const KIND_META: Record<
  OrderKind,
  {
    label: string;
    plural: string;
    icon: React.ElementType;
    role: string;
    staffType: string | null;
    orderType: string | null;
  }
> = {
  supervision: {
    label: 'Supervisor',
    plural: 'Supervisors',
    icon: UserCheck,
    role: 'Block Supervisor',
    staffType: 'SUPERVISOR',
    orderType: 'supervision',
  },
  reliever: {
    label: 'Reliever',
    plural: 'Relievers',
    icon: Users2,
    role: 'Block Reliever',
    staffType: 'RELIEVER',
    orderType: 'reliever',
  },
  chief: {
    label: 'Officer',
    plural: 'Officers',
    icon: Users,
    role: 'Officer',
    staffType: null,
    orderType: null,
  },
};

// ============================================================
// Helpers
// ============================================================

const deptName = (code: string) => (departments as Record<string, string>)[code] || code || '—';

const fmtDate = (iso: string) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
};

const fmtDateTime = (iso: string) => {
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
};

const isEmailValid = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

const isExcluded = (email: string, excludes: string[]): boolean => {
  const n = email.trim().toLowerCase();
  if (!n) return false;
  for (const raw of excludes) {
    const rule = raw.trim().toLowerCase();
    if (!rule) continue;
    if (rule.startsWith('@')) {
      const at = n.lastIndexOf('@');
      if (at >= 0 && n.slice(at) === rule) return true;
    } else if (rule === n) return true;
  }
  return false;
};

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const getDefaultExcludes = (email?: string) => (email ? [email.toLowerCase()] : []);

const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

// ============================================================
// Email HTML builder
// ============================================================

interface EmailContext {
  examCenterName: string;
  examCenterCode: string;
  season: string;
  year: number;
  orderKey: string;
}

const buildOrderEmailHtml = (r: Recipient, ctx: EmailContext): string => {
  const isChief = r.kind === 'chief';
  const role = r.role || KIND_META[r.kind].role;
  const post = r.post || role;

  const rows = r.duties
    .map(
      (d, i) => `
    <tr>
      <td style="border:1px solid #000;padding:6px 12px;text-align:center;">${i + 1}</td>
      <td style="border:1px solid #000;padding:6px 12px;text-align:center;">${escapeHtml(fmtDate(d.date))}</td>
      <td style="border:1px solid #000;padding:6px 12px;text-align:center;text-transform:uppercase;">${escapeHtml(d.session)}</td>
    </tr>`,
    )
    .join('');

  const body = isChief
    ? `As per norms and directions from MSBTE, you are hereby appointed as <strong>${escapeHtml(post)}</strong> for the ${escapeHtml(ctx.season)} ${ctx.year} exam at exam center ${escapeHtml(ctx.examCenterCode)}. You will look after all examination related duties and ensure the examination is conducted smoothly.`
    : `You have been appointed as ${escapeHtml(KIND_META[r.kind].role)} for the MSBTE Theory Examination of ${escapeHtml(ctx.season)} ${ctx.year} as per the following schedule. Please ensure all necessary arrangements are made for the smooth conduct of the examination.`;

  const table =
    !isChief && r.duties.length > 0
      ? `<table style="width:100%;border-collapse:collapse;margin:16px 0;">
         <thead><tr>
           <th style="background:#f0f0f0;border:1px solid #000;padding:6px 12px;">Sr. No</th>
           <th style="background:#f0f0f0;border:1px solid #000;padding:6px 12px;">Date</th>
           <th style="background:#f0f0f0;border:1px solid #000;padding:6px 12px;">Slot</th>
         </tr></thead>
         <tbody>${rows}</tbody>
       </table>`
      : '';

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Office Order - ${escapeHtml(role)}</title></head>
<body style="font-family:'Times New Roman',serif;margin:0;padding:40px;background:#f5f5f5;">
<div style="max-width:800px;margin:0 auto;background:#fff;padding:40px;border:1px solid #ddd;">
  <div style="text-align:center;border-bottom:2px solid #000;padding-bottom:20px;margin-bottom:30px;">
    <h1 style="font-size:24px;margin:0;text-transform:uppercase;">${escapeHtml(ctx.examCenterName)}</h1>
    <h2 style="font-size:18px;margin:10px 0 0;text-transform:uppercase;">Office Order</h2>
    <div style="font-size:12px;color:#666;margin-top:4px;">Ref: ${escapeHtml(ctx.orderKey)}</div>
  </div>
  <div style="font-size:14px;line-height:1.6;">
    <p><strong>To,</strong><br/>
       <strong>${escapeHtml(r.name)}</strong><br/>
       ${escapeHtml(role)}, ${escapeHtml(deptName(r.department))}<br/>
       ${escapeHtml(r.email)}<br/>
       <strong>${escapeHtml(ctx.examCenterName)}</strong></p>
    <p><strong>Subject:</strong> ${isChief ? `Appointment of ${escapeHtml(post)}` : `Order of ${escapeHtml(KIND_META[r.kind].role)}`} for ${escapeHtml(ctx.season)} Exam – ${ctx.year}</p>
    <p><strong>Reference:</strong> ${escapeHtml(ctx.orderKey)}</p>
    <p>Sir/Madam,</p>
    <p>${body}</p>
    ${table}
    ${isChief ? '<p>Thanking You,</p>' : ''}
    <div style="margin-top:40px;text-align:right;border-top:1px solid #000;padding-top:20px;">
      <p style="margin:2px 0;"><strong>${isChief ? 'Director' : 'Chief Officer In-charge'}</strong></p>
      <p style="margin:2px 0;">${escapeHtml(ctx.examCenterCode)} - ${escapeHtml(ctx.examCenterName)}</p>
    </div>
  </div>
  <div style="margin-top:30px;text-align:center;font-size:10px;color:#999;border-top:1px solid #ddd;padding-top:15px;">
    Generated by TestForge © ${new Date().getFullYear()}
  </div>
</div></body></html>`;
};

// ============================================================
// Preview document
// ============================================================

const OrderPreviewDocument = ({ recipient, ctx }: { recipient: Recipient; ctx: EmailContext }) => {
  const isChief = recipient.kind === 'chief';
  const role = recipient.role || KIND_META[recipient.kind].role;
  const post = recipient.post || role;
  return (
    <article className="mx-auto max-w-[800px] bg-white p-10 font-serif text-[14px] leading-relaxed text-black">
      <header className="border-b-2 border-black pb-5 text-center">
        <h1 className="text-2xl font-bold tracking-wide uppercase">{ctx.examCenterName}</h1>
        <h2 className="mt-2 text-lg font-bold uppercase">Office Order</h2>
        <p className="mt-1 text-xs text-neutral-500">Ref: {ctx.orderKey}</p>
      </header>
      <section className="mt-6 space-y-3">
        <p>
          <strong>To,</strong>
          <br />
          <strong>{recipient.name}</strong>
          <br />
          {role}, {deptName(recipient.department)}
          <br />
          {recipient.email}
          <br />
          <strong>{ctx.examCenterName}</strong>
        </p>
        <p>
          <strong>Subject:</strong>{' '}
          {isChief ? `Appointment of ${post}` : `Order of ${KIND_META[recipient.kind].role}`} for{' '}
          {ctx.season} Exam – {ctx.year}
        </p>
        <p>
          <strong>Reference:</strong> {ctx.orderKey}
        </p>
        <p>Sir/Madam,</p>
        <p>
          {isChief ? (
            <>
              As per norms and directions from MSBTE, you are hereby appointed as{' '}
              <strong>{post}</strong> for the {ctx.season} {ctx.year} exam at exam center{' '}
              {ctx.examCenterCode}.
            </>
          ) : (
            <>
              You have been appointed as {KIND_META[recipient.kind].role} for the MSBTE Theory
              Examination of {ctx.season} {ctx.year} as per the following schedule.
            </>
          )}
        </p>
        {!isChief && recipient.duties.length > 0 && (
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                <th className="border border-black bg-neutral-100 px-3 py-1.5">Sr. No</th>
                <th className="border border-black bg-neutral-100 px-3 py-1.5">Date</th>
                <th className="border border-black bg-neutral-100 px-3 py-1.5">Slot</th>
              </tr>
            </thead>
            <tbody>
              {recipient.duties.map((d, i) => (
                <tr key={i}>
                  <td className="border border-black px-3 py-1.5 text-center">{i + 1}</td>
                  <td className="border border-black px-3 py-1.5 text-center">{fmtDate(d.date)}</td>
                  <td className="border border-black px-3 py-1.5 text-center uppercase">
                    {d.session}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {isChief && <p>Thanking You,</p>}
        <div className="mt-10 border-t border-black pt-5 text-right">
          <p className="font-bold">{isChief ? 'Director' : 'Chief Officer In-charge'}</p>
          <p>
            {ctx.examCenterCode} - {ctx.examCenterName}
          </p>
        </div>
      </section>
      <footer className="mt-8 border-t border-neutral-200 pt-3 text-center text-[10px] text-neutral-400">
        Generated by TestForge © {new Date().getFullYear()}
      </footer>
    </article>
  );
};

// ============================================================
// Small building blocks
// ============================================================

const Metric = ({
  label,
  value,
  hint,
}: {
  label: string;
  value: number | string;
  hint?: string;
}) => (
  <div className="border-border flex min-w-[120px] flex-col gap-0.5 border-l pl-3 first:border-l-0 first:pl-0">
    <span className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
      {label}
    </span>
    <span className="text-lg font-semibold tabular-nums">{value}</span>
    {hint && <span className="text-muted-foreground text-[11px]">{hint}</span>}
  </div>
);

const MonitorStat = ({ label, value }: { label: string; value: number | string }) => (
  <div className="bg-muted/30 rounded border px-2 py-1.5">
    <div className="text-muted-foreground text-[10px] tracking-wide uppercase">{label}</div>
    <div className="truncate text-sm font-semibold tabular-nums">{value}</div>
  </div>
);

const MonitorRow = ({ label, value, mono }: { label: string; value: string; mono?: boolean }) => (
  <div className="flex items-start justify-between gap-3 text-xs">
    <span className="text-muted-foreground">{label}</span>
    <span className={cn('truncate text-right', mono && 'font-mono')}>{value}</span>
  </div>
);

const MonitorLoading = () => (
  <div className="text-muted-foreground flex items-center gap-2 py-2 text-xs">
    <Loader2 className="h-3 w-3 animate-spin" /> Loading…
  </div>
);

const MonitorError = ({ msg, onRetry }: { msg: string; onRetry: () => void }) => (
  <div className="border-destructive/30 bg-destructive/5 text-destructive flex items-center gap-2 rounded border px-2 py-1.5 text-xs">
    <AlertCircle className="h-3 w-3" />
    <span className="flex-1 truncate">{msg}</span>
    <button
      onClick={onRetry}
      className="underline"
    >
      Retry
    </button>
  </div>
);

// ============================================================
// Recipient row
// ============================================================

interface RowProps {
  recipient: Recipient;
  selected: boolean;
  onToggle: (id: string) => void;
  disabled: boolean;
  excluded: boolean;
  invalidEmail: boolean;
  onRemove?: (id: string) => void;
  onMonitor?: (r: Recipient) => void;
}

const RecipientRow = ({
  recipient,
  selected,
  onToggle,
  disabled,
  excluded,
  invalidEmail,
  onRemove,
  onMonitor,
}: RowProps) => {
  const blocked = excluded || invalidEmail;
  return (
    <div
      className={cn(
        'flex items-start gap-3 px-3 py-2.5 transition-colors',
        blocked ? 'opacity-55' : 'hover:bg-muted/40',
      )}
    >
      <Checkbox
        className="mt-0.5"
        checked={selected && !blocked}
        disabled={blocked || disabled}
        onCheckedChange={() => !blocked && onToggle(recipient.id)}
        aria-label={`Select ${recipient.name}`}
      />
      <button
        type="button"
        onClick={() => onMonitor?.(recipient)}
        className="min-w-0 flex-1 text-left"
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={cn('truncate text-sm font-medium', blocked && 'line-through')}>
            {recipient.name || '—'}
          </span>
          <Badge
            variant="secondary"
            className="text-[10px]"
          >
            {recipient.role || KIND_META[recipient.kind].role}
          </Badge>
          {recipient.post && (
            <Badge
              variant="outline"
              className="text-[10px]"
            >
              {recipient.post}
            </Badge>
          )}
          {recipient.duties.length > 0 && (
            <Badge
              variant="outline"
              className="text-[10px] tabular-nums"
            >
              {recipient.duties.length} duties
            </Badge>
          )}
          {excluded && (
            <Badge
              variant="outline"
              className="text-muted-foreground text-[10px]"
            >
              Excluded
            </Badge>
          )}
          {invalidEmail && (
            <Badge
              variant="outline"
              className="text-[10px] text-amber-600 dark:text-amber-500"
            >
              No email
            </Badge>
          )}
        </div>
        <div className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
          <span className="truncate">{recipient.email || '—'}</span>
          <span aria-hidden>·</span>
          <span>{deptName(recipient.department)}</span>
        </div>
      </button>
      {onRemove && (
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-destructive h-7 w-7"
          onClick={() => onRemove(recipient.id)}
          aria-label={`Remove ${recipient.name}`}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
};

// ============================================================
// Lazy hook
// ============================================================

type LazyState<T> = { loading: boolean; error: string | null; data: T | null };

const useLazy = <T,>(
  fetcher: () => Promise<T>,
  deps: unknown[],
  enabled: boolean,
): LazyState<T> & { reload: () => void } => {
  const [state, setState] = useState<LazyState<T>>({ loading: false, error: null, data: null });
  const tokenRef = useRef(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const reload = useCallback(() => {
    if (!enabled) return;
    const token = ++tokenRef.current;
    setState({ loading: true, error: null, data: null });
    fetcherRef
      .current()
      .then((data) => {
        if (token === tokenRef.current) setState({ loading: false, error: null, data });
      })
      .catch((e) => {
        if (token === tokenRef.current)
          setState({ loading: false, error: e?.message ?? 'Error', data: null });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps]);

  useEffect(() => {
    reload();
  }, [reload]);
  return { ...state, reload };
};

// ============================================================
// Log store (frontend-only, localStorage)
// ============================================================

const loadLogs = (): LogEntry[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveLogs = (logs: LogEntry[]) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify(logs.slice(0, LOG_LIMIT)));
  } catch {
    /* quota */
  }
};

const appendLogs = (entries: LogEntry[]) => {
  const existing = loadLogs();
  const next = [...entries, ...existing].slice(0, LOG_LIMIT);
  saveLogs(next);
  return next;
};

// ============================================================
// Monitor drawer
// ============================================================

interface MonitorDrawerProps {
  target: MonitorTarget | null;
  onClose: () => void;
  version: number;
  logs: LogEntry[];
  ctx: {
    orderKey: string;
    collegeRefKey: string;
    search: string;
    excludes: string[];
    supervisors: Recipient[];
    relievers: Recipient[];
    officers: Recipient[];
    remainingQuota: number;
    report: SendReport | null;
  };
  onAction: (action: MonitorAction) => void;
}

const MonitorDrawer = ({ target, onClose, ctx, onAction, version, logs }: MonitorDrawerProps) => {
  const open = target !== null;
  const supabase = useMemo(() => createClient(), []);

  // ---------- Lazy: section DB detail ----------
  const sectionFetch = useLazy(
    async () => {
      if (target?.type !== 'section') return null;
      const staffType =
        target.kind === 'supervision'
          ? 'SUPERVISOR'
          : target.kind === 'reliever'
            ? 'RELIEVER'
            : null;
      if (!staffType) return { source: 'local' as const, rows: [] };
      const { data, error } = await supabase
        .from('staff')
        .select('id, uid, name, email, department, role, staff_type')
        .eq('staff_type', staffType)
        .eq('is_deleted', false)
        .limit(500);
      if (error) throw error;
      return { source: 'staff' as const, rows: data ?? [] };
    },
    [target?.type, target?.type === 'section' ? target.kind : null, version],
    target?.type === 'section',
  );

  // ---------- Lazy: recipient email history (only when opened) ----------
  const recipientFetch = useLazy(
    async () => {
      if (target?.type !== 'recipient' || !target.recipient.email) return { logs: [] };
      const { data, error } = await supabase
        .from('email_logs')
        .select('id, subject, status, error_message, created_at, order_type, order_key')
        .eq('recipient_email', target.recipient.email)
        .order('created_at', { ascending: false })
        .limit(25);
      if (error) throw error;
      return { logs: data ?? [] };
    },
    [target?.type, target?.type === 'recipient' ? target.recipient.email : null, version],
    target?.type === 'recipient',
  );

  // ---------- Lazy: exclusion impact from DB ----------
  const exclusionFetch = useLazy(
    async () => {
      if (target?.type !== 'exclusion') return { rows: [] };
      const rule = target.value;
      const isDomain = rule.startsWith('@');
      const base = supabase
        .from('staff')
        .select('id, uid, name, email, department, staff_type')
        .eq('is_deleted', false)
        .limit(200);
      const { data, error } = isDomain
        ? await base.ilike('email', `%${rule}`)
        : await base.eq('email', rule);
      if (error) throw error;
      return { rows: data ?? [] };
    },
    [target?.type, target?.type === 'exclusion' ? target.value : null, version],
    target?.type === 'exclusion',
  );

  // ---------- Frontend-filtered logs for this email or global ----------
  const logsForEmail = useMemo(() => {
    if (target?.type !== 'recipient' || !target.recipient.email) return [];
    return logs.filter((l) => l.email === target.recipient.email).slice(0, 25);
  }, [logs, target]);

  const title = useMemo(() => {
    if (!target) return '';
    switch (target.type) {
      case 'section':
        return `${KIND_META[target.kind].plural} — Monitor`;
      case 'recipient':
        return target.recipient.name || target.recipient.email;
      case 'exclusion':
        return `Exclusion: ${target.value}`;
      case 'failure':
        return `Failure: ${target.failure.email}`;
      case 'report':
        return 'Send report';
      case 'reference':
        return target.field === 'orderKey' ? 'Order Ref Key' : 'College Ref Key';
      case 'search':
        return 'Search';
      case 'logs':
        return 'Send log';
    }
  }, [target]);

  const description = useMemo(() => {
    if (!target) return '';
    switch (target.type) {
      case 'section':
        return 'Live breakdown · click a row to toggle';
      case 'recipient':
        return `${target.recipient.role} · ${deptName(target.recipient.department)}`;
      case 'exclusion':
        return 'Matches from DB (lazy)';
      case 'failure':
        return target.failure.errorKind ? `${target.failure.errorKind} error` : 'Delivery failure';
      case 'report':
        return ctx.report ? new Date(ctx.report.at).toLocaleString() : '';
      case 'reference':
        return 'Used on every office order in this batch';
      case 'search':
        return ctx.search || '(no query)';
      case 'logs':
        return `Last ${logs.length} attempts (local)`;
    }
  }, [target, ctx.report, ctx.search, logs.length]);

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <SheetContent
        side="right"
        className="w-full overflow-y-auto sm:max-w-lg"
      >
        <SheetHeader>
          <SheetTitle className="truncate">{title}</SheetTitle>
          <SheetDescription className="truncate">{description}</SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {target?.type === 'section' &&
            (() => {
              const pool =
                target.kind === 'supervision'
                  ? ctx.supervisors
                  : target.kind === 'reliever'
                    ? ctx.relievers
                    : ctx.officers;
              const eligible = pool.filter(
                (r) => !isExcluded(r.email, ctx.excludes) && isEmailValid(r.email),
              );
              const selected = pool.filter((r) => r.selected);
              const totalDuties = pool.reduce((n, r) => n + r.duties.length, 0);
              const f = sectionFetch;
              return (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <MonitorStat
                      label="In memory"
                      value={pool.length}
                    />
                    <MonitorStat
                      label="Selected"
                      value={selected.length}
                    />
                    <MonitorStat
                      label="Eligible"
                      value={eligible.length}
                    />
                    <MonitorStat
                      label="Excluded"
                      value={pool.length - eligible.length}
                    />
                    <MonitorStat
                      label="Total duties"
                      value={totalDuties}
                    />
                    <MonitorStat
                      label="Can still select"
                      value={Math.min(eligible.length - selected.length, ctx.remainingQuota)}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => onAction({ type: 'bulk-toggle', kind: target.kind })}
                    >
                      {selected.length === eligible.length ? 'Deselect all' : 'Select all eligible'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={() => onAction({ type: 'focus-search', value: '' })}
                    >
                      Clear search
                    </Button>
                  </div>
                  <Separator />
                  <h4 className="text-muted-foreground text-xs font-semibold uppercase">
                    In memory ({pool.length})
                  </h4>
                  <div className="max-h-[220px] space-y-1 overflow-y-auto">
                    {pool.map((r) => {
                      const ex = isExcluded(r.email, ctx.excludes);
                      const bad = !isEmailValid(r.email);
                      return (
                        <button
                          key={r.id}
                          onClick={() =>
                            onAction({ type: 'toggle-recipient', kind: r.kind, id: r.id })
                          }
                          className={cn(
                            'hover:bg-muted/50 w-full rounded border px-2 py-1.5 text-left text-xs',
                            r.selected ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-border',
                            (ex || bad) && 'opacity-60',
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                'h-1.5 w-1.5 rounded-full',
                                r.selected ? 'bg-emerald-500' : 'bg-muted-foreground/40',
                              )}
                            />
                            <span className="truncate font-medium">{r.name || r.email}</span>
                            {ex && (
                              <Badge
                                variant="outline"
                                className="text-[9px]"
                              >
                                excluded
                              </Badge>
                            )}
                            {bad && (
                              <Badge
                                variant="outline"
                                className="text-[9px]"
                              >
                                no email
                              </Badge>
                            )}
                          </div>
                          <div className="text-muted-foreground truncate">
                            {r.email} · {r.duties.length} duties
                          </div>
                        </button>
                      );
                    })}
                    {pool.length === 0 && (
                      <p className="text-muted-foreground text-xs">No recipients.</p>
                    )}
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <h4 className="text-muted-foreground text-xs font-semibold uppercase">
                      From Supabase {f.data ? `(${f.data.rows.length})` : ''}
                    </h4>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-[10px]"
                      onClick={f.reload}
                    >
                      <RefreshCw className={cn('h-3 w-3', f.loading && 'animate-spin')} />
                    </Button>
                  </div>
                  {f.loading && <MonitorLoading />}
                  {f.error && (
                    <MonitorError
                      msg={f.error}
                      onRetry={f.reload}
                    />
                  )}
                  {f.data && f.data.rows.length === 0 && f.data.source === 'staff' && (
                    <p className="text-muted-foreground text-xs">No DB records for this section.</p>
                  )}
                  {f.data?.source === 'local' && (
                    <p className="text-muted-foreground text-xs">
                      Chief officers are local-only (not in staff table).
                    </p>
                  )}
                  {f.data?.source === 'staff' && f.data.rows.length > 0 && (
                    <div className="max-h-[200px] space-y-1 overflow-y-auto">
                      {f.data.rows.slice(0, 60).map((s: any) => (
                        <div
                          key={s.id}
                          className="rounded border px-2 py-1.5 text-xs"
                        >
                          <div className="truncate font-medium">{s.name || s.email}</div>
                          <div className="text-muted-foreground truncate">
                            {s.email} · {deptName(s.department)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              );
            })()}

          {target?.type === 'recipient' &&
            (() => {
              const r = target.recipient;
              const ex = isExcluded(r.email, ctx.excludes);
              const bad = !isEmailValid(r.email);
              const status = bad
                ? 'No email'
                : ex
                  ? 'Excluded'
                  : r.selected
                    ? 'Selected'
                    : 'Not selected';
              const f = recipientFetch;
              return (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <MonitorStat
                      label="Status"
                      value={status}
                    />
                    <MonitorStat
                      label="Duties"
                      value={r.duties.length}
                    />
                    <MonitorStat
                      label="Role"
                      value={r.role || KIND_META[r.kind].role}
                    />
                    <MonitorStat
                      label="Department"
                      value={deptName(r.department)}
                    />
                  </div>
                  <Separator />
                  <MonitorRow
                    label="Email"
                    value={r.email || '—'}
                    mono
                  />
                  {r.post && (
                    <MonitorRow
                      label="Post"
                      value={r.post}
                    />
                  )}
                  <MonitorRow
                    label="Type"
                    value={KIND_META[r.kind].label}
                  />
                  <Separator />
                  <h4 className="text-muted-foreground mb-2 text-xs font-semibold uppercase">
                    Duties
                  </h4>
                  {r.duties.length === 0 ? (
                    <p className="text-muted-foreground text-xs">No duties assigned.</p>
                  ) : (
                    <div className="max-h-[160px] divide-y overflow-y-auto rounded border text-xs">
                      {r.duties.map((d, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between px-2 py-1.5"
                        >
                          <span>
                            {i + 1}. {fmtDate(d.date)}
                          </span>
                          <Badge
                            variant="secondary"
                            className="text-[10px] uppercase"
                          >
                            {d.session}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                  <Separator />
                  <h4 className="text-muted-foreground mb-2 text-xs font-semibold uppercase">
                    This session ({logsForEmail.length})
                  </h4>
                  {logsForEmail.length === 0 ? (
                    <p className="text-muted-foreground text-xs">No sends this session.</p>
                  ) : (
                    <div className="max-h-[160px] space-y-1 overflow-y-auto">
                      {logsForEmail.map((l) => (
                        <div
                          key={l.id}
                          className={cn(
                            'rounded border px-2 py-1.5 text-xs',
                            l.ok
                              ? 'border-emerald-500/30 bg-emerald-500/5'
                              : 'border-destructive/30 bg-destructive/5',
                          )}
                        >
                          <div className="flex items-center gap-2">
                            {l.ok ? (
                              <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                            ) : (
                              <AlertCircle className="text-destructive h-3 w-3" />
                            )}
                            <span className="truncate font-medium">{l.subject}</span>
                            <span className="text-muted-foreground ml-auto text-[10px]">
                              {fmtDateTime(l.at)}
                            </span>
                          </div>
                          {l.error && (
                            <div className="text-destructive/90 mt-0.5 truncate">{l.error}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  <Separator />
                  <div className="flex items-center justify-between">
                    <h4 className="text-muted-foreground text-xs font-semibold uppercase">
                      From Supabase {f.data ? `(${f.data.logs.length})` : ''}
                    </h4>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-[10px]"
                      onClick={f.reload}
                    >
                      <RefreshCw className={cn('h-3 w-3', f.loading && 'animate-spin')} />
                    </Button>
                  </div>
                  {f.loading && <MonitorLoading />}
                  {f.error && (
                    <MonitorError
                      msg={f.error}
                      onRetry={f.reload}
                    />
                  )}
                  {f.data && f.data.logs.length === 0 && (
                    <p className="text-muted-foreground text-xs">No DB history for this address.</p>
                  )}
                  {f.data && f.data.logs.length > 0 && (
                    <div className="max-h-[200px] space-y-1 overflow-y-auto">
                      {f.data.logs.map((l) => (
                        <div
                          key={l.id}
                          className={cn(
                            'rounded border px-2 py-1.5 text-xs',
                            l.status === 'sent'
                              ? 'border-emerald-500/30 bg-emerald-500/5'
                              : 'border-destructive/30 bg-destructive/5',
                          )}
                        >
                          <div className="flex items-center gap-2">
                            {l.status === 'sent' ? (
                              <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                            ) : (
                              <AlertCircle className="text-destructive h-3 w-3" />
                            )}
                            <span className="truncate font-medium">{l.subject}</span>
                            <span className="text-muted-foreground ml-auto text-[10px]">
                              {new Date(l.created_at).toLocaleDateString()}
                            </span>
                          </div>
                          {l.error_message && (
                            <div className="text-destructive/90 mt-0.5 truncate">
                              {l.error_message}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  <Separator />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      disabled={ex || bad}
                      onClick={() => onAction({ type: 'toggle-recipient', kind: r.kind, id: r.id })}
                    >
                      {r.selected ? 'Deselect' : 'Select'}
                    </Button>
                    {r.kind === 'chief' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive h-7 text-xs"
                        onClick={() => onAction({ type: 'remove-officer', id: r.id })}
                      >
                        Remove officer
                      </Button>
                    )}
                  </div>
                </>
              );
            })()}

          {target?.type === 'exclusion' &&
            (() => {
              const rule = target.value;
              const inMemory = [...ctx.supervisors, ...ctx.relievers, ...ctx.officers].filter((r) =>
                isExcluded(r.email, [rule]),
              );
              const f = exclusionFetch;
              return (
                <>
                  <MonitorRow
                    label="Rule"
                    value={rule}
                    mono
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <MonitorStat
                      label="In memory"
                      value={inMemory.length}
                    />
                    <MonitorStat
                      label="In DB"
                      value={f.data?.rows.length ?? '—'}
                    />
                  </div>
                  <Separator />
                  <h4 className="text-muted-foreground text-xs font-semibold uppercase">
                    In-memory matches
                  </h4>
                  <div className="max-h-[140px] space-y-1 overflow-y-auto">
                    {inMemory.length === 0 && (
                      <p className="text-muted-foreground text-xs">None.</p>
                    )}
                    {inMemory.map((r) => (
                      <button
                        key={r.id}
                        className="hover:bg-muted/50 w-full rounded border px-2 py-1.5 text-left text-xs"
                        onClick={() =>
                          onAction({ type: 'toggle-recipient', kind: r.kind, id: r.id })
                        }
                      >
                        <div className="truncate font-medium">{r.name || r.email}</div>
                        <div className="text-muted-foreground truncate">{r.email}</div>
                      </button>
                    ))}
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <h4 className="text-muted-foreground text-xs font-semibold uppercase">
                      From Supabase {f.data ? `(${f.data.rows.length})` : ''}
                    </h4>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-[10px]"
                      onClick={f.reload}
                    >
                      <RefreshCw className={cn('h-3 w-3', f.loading && 'animate-spin')} />
                    </Button>
                  </div>
                  {f.loading && <MonitorLoading />}
                  {f.error && (
                    <MonitorError
                      msg={f.error}
                      onRetry={f.reload}
                    />
                  )}
                  {f.data && f.data.rows.length === 0 && (
                    <p className="text-muted-foreground text-xs">No DB records match.</p>
                  )}
                  {f.data && f.data.rows.length > 0 && (
                    <div className="max-h-[200px] space-y-1 overflow-y-auto">
                      {f.data.rows.map((s: any) => (
                        <div
                          key={s.id}
                          className="rounded border px-2 py-1.5 text-xs"
                        >
                          <div className="truncate font-medium">{s.name || s.email}</div>
                          <div className="text-muted-foreground truncate">
                            {s.email} · {s.staff_type}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <Separator />
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive h-7 text-xs"
                    onClick={() => onAction({ type: 'remove-exclude', value: rule })}
                  >
                    Remove exclusion
                  </Button>
                </>
              );
            })()}

          {target?.type === 'failure' &&
            (() => {
              const f = target.failure;
              const r = [...ctx.supervisors, ...ctx.relievers, ...ctx.officers].find(
                (x) => x.email === f.email,
              );
              const history = logs.filter((l) => l.email === f.email).slice(0, 10);
              return (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <MonitorStat
                      label="Attempts"
                      value={f.attempts ?? 1}
                    />
                    <MonitorStat
                      label="Kind"
                      value={f.errorKind ?? 'unknown'}
                    />
                  </div>
                  <Separator />
                  <MonitorRow
                    label="Name"
                    value={f.name || '—'}
                  />
                  <MonitorRow
                    label="Email"
                    value={f.email}
                    mono
                  />
                  {f.errorCode && (
                    <MonitorRow
                      label="Error code"
                      value={f.errorCode}
                      mono
                    />
                  )}
                  {f.error && (
                    <div className="border-destructive/30 bg-destructive/5 text-destructive rounded border p-2 text-xs">
                      {f.error}
                    </div>
                  )}
                  {history.length > 0 && (
                    <>
                      <Separator />
                      <h4 className="text-muted-foreground mb-2 text-xs font-semibold uppercase">
                        Recent attempts
                      </h4>
                      <div className="max-h-[140px] space-y-1 overflow-y-auto">
                        {history.map((l) => (
                          <div
                            key={l.id}
                            className={cn(
                              'rounded border px-2 py-1 text-xs',
                              l.ok
                                ? 'border-emerald-500/30 bg-emerald-500/5'
                                : 'border-destructive/30 bg-destructive/5',
                            )}
                          >
                            <div className="flex items-center gap-2">
                              {l.ok ? (
                                <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                              ) : (
                                <AlertCircle className="text-destructive h-3 w-3" />
                              )}
                              <span className="truncate">{l.subject}</span>
                              <span className="text-muted-foreground ml-auto text-[10px]">
                                {fmtDateTime(l.at)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                  <Separator />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => onAction({ type: 'retry-failure', email: f.email })}
                    >
                      <RefreshCw className="h-3 w-3" /> Retry this
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={() => onAction({ type: 'retry-all' })}
                    >
                      Retry all failures
                    </Button>
                    {r && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                        onClick={() =>
                          onAction({ type: 'monitor-recipient-email', email: f.email })
                        }
                      >
                        Open recipient
                      </Button>
                    )}
                  </div>
                </>
              );
            })()}

          {target?.type === 'report' &&
            ctx.report &&
            (() => {
              const r = ctx.report;
              const reportLogs = logs.filter(
                (l) => Math.abs(new Date(l.at).getTime() - new Date(r.at).getTime()) < 5 * 60_000,
              );
              return (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <MonitorStat
                      label="Sent"
                      value={r.sent}
                    />
                    <MonitorStat
                      label="Failed"
                      value={r.failed}
                    />
                    <MonitorStat
                      label="Total"
                      value={r.total}
                    />
                    <MonitorStat
                      label="Success rate"
                      value={`${Math.round((r.sent / Math.max(1, r.total)) * 100)}%`}
                    />
                  </div>
                  <Separator />
                  <MonitorRow
                    label="Timestamp"
                    value={new Date(r.at).toLocaleString()}
                  />
                  <MonitorRow
                    label="Local log rows"
                    value={String(reportLogs.length)}
                  />
                  <Separator />
                  <h4 className="text-muted-foreground text-xs font-semibold uppercase">
                    Failures
                  </h4>
                  <div className="max-h-[200px] space-y-1 overflow-y-auto">
                    {r.failures.length === 0 && (
                      <p className="text-muted-foreground text-xs">None — clean send.</p>
                    )}
                    {r.failures.map((fail, i) => (
                      <button
                        key={i}
                        onClick={() => onAction({ type: 'monitor-failure', failure: fail })}
                        className="border-destructive/20 bg-destructive/5 hover:bg-destructive/10 w-full rounded border px-2 py-1 text-left text-xs"
                      >
                        <div className="truncate font-medium">{fail.name || fail.email}</div>
                        <div className="text-muted-foreground truncate">{fail.error}</div>
                      </button>
                    ))}
                  </div>
                  {r.failures.length > 0 && (
                    <>
                      <Separator />
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => onAction({ type: 'retry-all' })}
                      >
                        <RefreshCw className="h-3 w-3" /> Retry all failures
                      </Button>
                    </>
                  )}
                </>
              );
            })()}

          {target?.type === 'reference' && (
            <>
              <MonitorRow
                label={target.field === 'orderKey' ? 'Order Ref Key' : 'College Ref Key'}
                value={(target.field === 'orderKey' ? ctx.orderKey : ctx.collegeRefKey) || '—'}
                mono
              />
              <Separator />
              <div className="text-muted-foreground space-y-1 text-xs">
                <p>
                  Used in the email body as{' '}
                  <code className="bg-muted rounded px-1">Reference:</code> and header.
                </p>
                <p>
                  Idempotency key:{' '}
                  <code className="bg-muted rounded px-1">
                    order-{'{orderKey}'}-{'{email}'}
                  </code>
                  .
                </p>
              </div>
            </>
          )}

          {target?.type === 'search' && (
            <>
              <MonitorRow
                label="Query"
                value={ctx.search || '(empty)'}
              />
              <Separator />
              <div className="text-muted-foreground text-xs">
                Matches against name, email, department, role and post.
              </div>
            </>
          )}

          {target?.type === 'logs' && (
            <LogPanel
              logs={logs}
              onClear={() => onAction({ type: 'clear-logs' })}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

// ============================================================
// Log panel (frontend-only filtering)
// ============================================================

const LogPanel = ({ logs, onClear }: { logs: LogEntry[]; onClear: () => void }) => {
  const [q, setQ] = useState('');
  const [range, setRange] = useState<'all' | 'today' | '7d' | '30d'>('all');
  const [status, setStatus] = useState<'all' | 'ok' | 'fail'>('all');

  const filtered = useMemo(() => {
    const now = Date.now();
    const cutoffs = {
      all: 0,
      today: new Date().setHours(0, 0, 0, 0),
      '7d': now - 7 * 864e5,
      '30d': now - 30 * 864e5,
    };
    const since = cutoffs[range];
    const needle = q.trim().toLowerCase();
    return logs.filter((l) => {
      if (new Date(l.at).getTime() < since) return false;
      if (status === 'ok' && !l.ok) return false;
      if (status === 'fail' && l.ok) return false;
      if (!needle) return true;
      return (
        l.email.toLowerCase().includes(needle) ||
        l.name.toLowerCase().includes(needle) ||
        l.subject.toLowerCase().includes(needle) ||
        (l.orderKey ?? '').toLowerCase().includes(needle)
      );
    });
  }, [logs, q, range, status]);

  const stats = useMemo(() => {
    const ok = filtered.filter((l) => l.ok).length;
    return { total: filtered.length, ok, fail: filtered.length - ok };
  }, [filtered]);

  return (
    <>
      <div className="grid grid-cols-3 gap-3">
        <MonitorStat
          label="Total"
          value={stats.total}
        />
        <MonitorStat
          label="Sent"
          value={stats.ok}
        />
        <MonitorStat
          label="Failed"
          value={stats.fail}
        />
      </div>
      <div className="space-y-2">
        <div className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search email, name, subject, ref…"
            className="h-8 pl-8 text-xs"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Select
            value={range}
            onValueChange={(v) => setRange(v as any)}
          >
            <SelectTrigger className="h-8 text-xs">
              <Filter className="mr-1 h-3 w-3" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All time</SelectItem>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={status}
            onValueChange={(v) => setStatus(v as any)}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="ok">Sent only</SelectItem>
              <SelectItem value="fail">Failed only</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <Separator />
      <div className="max-h-[400px] space-y-1 overflow-y-auto">
        {filtered.length === 0 && (
          <p className="text-muted-foreground py-4 text-center text-xs">No matching entries.</p>
        )}
        {filtered.map((l) => (
          <div
            key={l.id}
            className={cn(
              'rounded border px-2 py-1.5 text-xs',
              l.ok
                ? 'border-emerald-500/30 bg-emerald-500/5'
                : 'border-destructive/30 bg-destructive/5',
            )}
          >
            <div className="flex items-center gap-2">
              {l.ok ? (
                <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-600" />
              ) : (
                <AlertCircle className="text-destructive h-3 w-3 shrink-0" />
              )}
              <span className="truncate font-medium">{l.name || l.email}</span>
              <span className="text-muted-foreground ml-auto shrink-0 text-[10px]">
                {fmtDateTime(l.at)}
              </span>
            </div>
            <div className="text-muted-foreground mt-0.5 truncate">{l.email}</div>
            <div className="text-muted-foreground truncate">{l.subject}</div>
            {l.error && <div className="text-destructive/90 mt-0.5 truncate">{l.error}</div>}
          </div>
        ))}
      </div>
      {logs.length > 0 && (
        <>
          <Separator />
          <Button
            size="sm"
            variant="outline"
            className="text-destructive h-7 text-xs"
            onClick={onClear}
          >
            <Trash2 className="h-3 w-3" /> Clear all local logs
          </Button>
        </>
      )}
    </>
  );
};

// ============================================================
// Main
// ============================================================

export default function OfficeOrderMail() {
  const { examCenter, user, isLoading: userLoading } = useUserInfo();
  const fetchTokenRef = useRef(0);
  const sendTokenRef = useRef(0);

  const [orderKey, setOrderKey] = useState('');
  const [collegeRefKey, setCollegeRefKey] = useState('');
  const [supervisors, setSupervisors] = useState<Recipient[]>([]);
  const [relievers, setRelievers] = useState<Recipient[]>([]);
  const [officers, setOfficers] = useState<Recipient[]>([]);
  const [excludes, setExcludes] = useState<string[]>([]);
  const [newExclude, setNewExclude] = useState('');
  const [officerDraft, setOfficerDraft] = useState<ManualOfficerInput>({
    name: '',
    department: '',
    email: '',
    role: '',
    post: '',
  });
  const [officerErrors, setOfficerErrors] = useState<
    Partial<Record<keyof ManualOfficerInput, string>>
  >({});
  const [search, setSearch] = useState('');
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendReport, setSendReport] = useState<SendReport | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const [monitor, setMonitor] = useState<MonitorTarget | null>(null);
  const [monitorVersion, setMonitorVersion] = useState(0);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  // ---------- load logs once ----------
  useEffect(() => {
    setLogs(loadLogs());
  }, []);

  // ---------- excludes init ----------
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let next = getDefaultExcludes(user?.email);
    try {
      const saved = localStorage.getItem(EMAIL_EXCLUDES_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) next = Array.from(new Set([...parsed.map(String), ...next]));
      }
    } catch {
      /* ignore */
    }
    setExcludes(next);
  }, [user?.email]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(EMAIL_EXCLUDES_KEY, JSON.stringify(excludes));
  }, [excludes]);

  // ---------- derived ----------
  const allRecipients = useMemo(
    () => [...supervisors, ...relievers, ...officers],
    [supervisors, relievers, officers],
  );

  const matchesSearch = useCallback((r: Recipient, q: string) => {
    if (!q) return true;
    const s = q.toLowerCase();
    return (
      r.name.toLowerCase().includes(s) ||
      r.email.toLowerCase().includes(s) ||
      r.department.toLowerCase().includes(s) ||
      r.role.toLowerCase().includes(s) ||
      (r.post?.toLowerCase().includes(s) ?? false)
    );
  }, []);

  const visibleSupervisors = useMemo(
    () => supervisors.filter((r) => matchesSearch(r, search)),
    [supervisors, search, matchesSearch],
  );
  const visibleRelievers = useMemo(
    () => relievers.filter((r) => matchesSearch(r, search)),
    [relievers, search, matchesSearch],
  );
  const visibleOfficers = useMemo(
    () => officers.filter((r) => matchesSearch(r, search)),
    [officers, search, matchesSearch],
  );

  const exclusionInfo = useCallback(
    (r: Recipient) => ({
      excluded: isExcluded(r.email, excludes),
      invalidEmail: !isEmailValid(r.email),
    }),
    [excludes],
  );

  const selectableRecipients = useMemo(
    () =>
      allRecipients.filter((r) => {
        const { excluded, invalidEmail } = exclusionInfo(r);
        return !excluded && !invalidEmail;
      }),
    [allRecipients, exclusionInfo],
  );

  const selectedRecipients = useMemo(
    () => selectableRecipients.filter((r) => r.selected === true),
    [selectableRecipients],
  );

  const selectedCount = selectedRecipients.length;
  const remainingQuota = Math.max(0, QUOTA_LIMIT - selectedCount);

  const counts = useMemo(() => {
    const excludedCount = allRecipients.filter((r) => exclusionInfo(r).excluded).length;
    const invalidCount = allRecipients.filter(
      (r) => !exclusionInfo(r).excluded && exclusionInfo(r).invalidEmail,
    ).length;
    return { total: allRecipients.length, excludedCount, invalidCount };
  }, [allRecipients, exclusionInfo]);

  // ---------- mutators ----------
  const setSelection = useCallback((kind: OrderKind, id: string, selected: boolean) => {
    const setter =
      kind === 'supervision' ? setSupervisors : kind === 'reliever' ? setRelievers : setOfficers;
    setter((prev) => prev.map((r) => (r.id === id ? { ...r, selected } : r)));
    setMonitorVersion((v) => v + 1);
  }, []);

  const toggleSelection = useCallback(
    (kind: OrderKind, id: string) => {
      const target = allRecipients.find((r) => r.id === id);
      if (!target) return;
      const willSelect = !target.selected;
      if (willSelect && selectedCount >= QUOTA_LIMIT) {
        toast.warning(`Quota reached. Max ${QUOTA_LIMIT} recipients.`);
        return;
      }
      setSelection(kind, id, willSelect);
    },
    [allRecipients, selectedCount, setSelection],
  );

  const bulkToggle = useCallback(
    (kind: OrderKind) => {
      const pool =
        kind === 'supervision' ? supervisors : kind === 'reliever' ? relievers : officers;
      const eligible = pool.filter((r) => {
        const { excluded, invalidEmail } = exclusionInfo(r);
        return !excluded && !invalidEmail;
      });
      if (eligible.length === 0) return;
      const allSelected = eligible.every((r) => r.selected);
      const setter =
        kind === 'supervision' ? setSupervisors : kind === 'reliever' ? setRelievers : setOfficers;

      if (allSelected) {
        const ids = new Set(eligible.map((r) => r.id));
        setter((prev) => prev.map((r) => (ids.has(r.id) ? { ...r, selected: false } : r)));
        setMonitorVersion((v) => v + 1);
        return;
      }
      const budget = Math.max(0, QUOTA_LIMIT - selectedCount);
      const toSelect = eligible.filter((r) => !r.selected).slice(0, budget);
      const skipped = eligible.filter((r) => !r.selected).length - toSelect.length;
      if (toSelect.length === 0) {
        toast.warning(`Quota of ${QUOTA_LIMIT} reached.`);
        return;
      }
      const ids = new Set(toSelect.map((r) => r.id));
      setter((prev) => prev.map((r) => (ids.has(r.id) ? { ...r, selected: true } : r)));
      setMonitorVersion((v) => v + 1);
      if (skipped > 0)
        toast.warning(`Selected ${toSelect.length}. ${skipped} skipped — quota reached.`);
    },
    [supervisors, relievers, officers, exclusionInfo, selectedCount],
  );

  const clearAllSelection = useCallback(() => {
    setSupervisors((p) => p.map((r) => ({ ...r, selected: false })));
    setRelievers((p) => p.map((r) => ({ ...r, selected: false })));
    setOfficers((p) => p.map((r) => ({ ...r, selected: false })));
    setMonitorVersion((v) => v + 1);
  }, []);

  // ---------- fetch ----------
  const fetchAllocations = useCallback(async () => {
    if (!examCenter?.id) {
      toast.error('No exam center context.');
      return;
    }
    if (!orderKey.trim() || !collegeRefKey.trim()) {
      toast.error('Enter both reference keys.');
      return;
    }
    const token = ++fetchTokenRef.current;
    setFetching(true);
    setFetchError(null);
    try {
      const supabase = createClient();
      const [ordersRes, staffRes] = await Promise.all([
        supabase
          .from('orders')
          .select('id, staff_id, order_type, date, session')
          .in('order_type', ['supervision', 'reliever']),
        supabase
          .from('staff')
          .select('id, uid, name, department, email, staff_type, role')
          .in('staff_type', ['SUPERVISOR', 'RELIEVER'])
          .eq('is_deleted', false),
      ]);
      if (token !== fetchTokenRef.current) return;
      if (ordersRes.error) throw ordersRes.error;
      if (staffRes.error) throw staffRes.error;

      const staffById = new Map((staffRes.data ?? []).map((s) => [s.id, s]));
      const grouped = new Map<string, Recipient>();
      for (const o of ordersRes.data ?? []) {
        const s = staffById.get(o.staff_id);
        if (!s) continue;
        const kind: OrderKind = s.staff_type === 'RELIEVER' ? 'reliever' : 'supervision';
        const key = `${kind}:${s.uid}`;
        let r = grouped.get(key);
        if (!r) {
          r = {
            id: key,
            kind,
            name: s.name ?? '',
            email: s.email ?? '',
            department: s.department ?? '',
            role: s.role || KIND_META[kind].role,
            duties: [],
            selected: false,
          };
          grouped.set(key, r);
        }
        r.duties.push({
          date: o.date ? String(o.date).slice(0, 10) : '',
          session: o.session ?? 'Morning',
        });
      }
      for (const r of grouped.values()) r.duties.sort((a, b) => a.date.localeCompare(b.date));

      const sup: Recipient[] = [];
      const rel: Recipient[] = [];
      for (const r of grouped.values()) (r.kind === 'supervision' ? sup : rel).push(r);

      let budget = QUOTA_LIMIT;
      const auto = (list: Recipient[]) =>
        list.map((r) => {
          const ok = !isExcluded(r.email, excludes) && isEmailValid(r.email) && budget > 0;
          if (ok) budget -= 1;
          return { ...r, selected: ok };
        });

      setSupervisors(auto(sup));
      setRelievers(auto(rel));
      setMonitorVersion((v) => v + 1);
      toast.success(`Loaded ${sup.length + rel.length} staff with allocations.`);
    } catch (err) {
      if (token !== fetchTokenRef.current) return;
      const msg = err instanceof Error ? err.message : 'Failed to fetch allocations';
      setFetchError(msg);
      toast.error(msg);
    } finally {
      if (token === fetchTokenRef.current) setFetching(false);
    }
  }, [examCenter?.id, orderKey, collegeRefKey, excludes]);

  // ---------- officers ----------
  const validateOfficer = (d: ManualOfficerInput) => {
    const e: Partial<Record<keyof ManualOfficerInput, string>> = {};
    if (!d.name.trim()) e.name = 'Required';
    if (!d.department.trim()) e.department = 'Required';
    if (!d.email.trim()) e.email = 'Required';
    else if (!isEmailValid(d.email)) e.email = 'Invalid email';
    if (!d.role) e.role = 'Required';
    if (!d.post) e.post = 'Required';
    return e;
  };

  const addOfficer = () => {
    const e = validateOfficer(officerDraft);
    setOfficerErrors(e);
    if (Object.keys(e).length) {
      toast.error('Fix the highlighted fields.');
      return;
    }
    const r: Recipient = {
      id: `officer:${uid()}`,
      kind: 'chief',
      name: officerDraft.name.trim(),
      email: officerDraft.email.trim(),
      department: officerDraft.department.trim(),
      role: officerDraft.role,
      post: officerDraft.post,
      duties: [],
      selected:
        isEmailValid(officerDraft.email) &&
        !isExcluded(officerDraft.email, excludes) &&
        selectedCount < QUOTA_LIMIT,
    };
    setOfficers((p) => [r, ...p]);
    setOfficerDraft({ name: '', department: '', email: '', role: '', post: '' });
    setOfficerErrors({});
    setMonitorVersion((v) => v + 1);
    toast.success('Officer added.');
  };

  const removeOfficer = (id: string) => {
    setOfficers((p) => p.filter((r) => r.id !== id));
    setMonitorVersion((v) => v + 1);
  };

  // ---------- exclusions ----------
  const addExclude = () => {
    const raw = newExclude.trim().toLowerCase();
    if (!raw) return;
    if (!raw.startsWith('@') && !isEmailValid(raw)) {
      toast.error('Enter a full email or @domain rule.');
      return;
    }
    setExcludes((prev) => (prev.includes(raw) ? prev : [...prev, raw]));
    setNewExclude('');
    setMonitorVersion((v) => v + 1);
  };
  const removeExclude = (value: string) => {
    setExcludes((prev) => prev.filter((e) => e !== value));
    setMonitorVersion((v) => v + 1);
  };

  // ---------- send ----------
  const doSend = useCallback(
    async (override?: Recipient[]) => {
      const list = override ?? selectedRecipients;
      if (list.length === 0) {
        toast.error('No recipients selected.');
        return;
      }
      if (list.length > QUOTA_LIMIT) {
        toast.error('Quota exceeded.');
        return;
      }

      const token = ++sendTokenRef.current;
      setSending(true);
      setSendReport(null);

      const ctx: EmailContext = {
        examCenterName: examCenter?.name || 'Examination Center',
        examCenterCode: examCenter?.code || '',
        season: examCenter?.season || '',
        year: examCenter?.examYear || new Date().getFullYear(),
        orderKey: orderKey.trim(),
      };
      const batchAt = new Date().toISOString();

      try {
        const res = await fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipients: list.map((r) => ({
              email: r.email,
              name: r.name,
              html: buildOrderEmailHtml(r, ctx),
              subject: `Office Order - ${r.role} (${ctx.season} ${ctx.year})`,
            })),
            subject: `Office Order (${ctx.season} ${ctx.year})`,
            html: '',
            orderType: 'supervision',
            orderKey: ctx.orderKey || undefined,
          }),
        });
        const json = (await res.json().catch(() => null)) as {
          sent?: number;
          failed?: number;
          total?: number;
          failures?: SendFailure[];
          error?: string;
        } | null;
        if (token !== sendTokenRef.current) return;

        if (!res.ok) {
          const msg = json?.error || `Request failed (HTTP ${res.status})`;
          toast.error(msg);
          setSendReport({
            sent: 0,
            failed: list.length,
            total: list.length,
            failures: list.map((r) => ({ email: r.email, name: r.name, error: msg })),
            at: batchAt,
          });
          const entries: LogEntry[] = list.map((r) => ({
            id: uid(),
            at: batchAt,
            email: r.email,
            name: r.name,
            subject: `Office Order - ${r.role}`,
            orderType: 'supervision',
            orderKey: ctx.orderKey || undefined,
            ok: false,
            error: msg,
            errorKind: 'network',
          }));
          setLogs(appendLogs(entries));
          return;
        }

        const failures: SendFailure[] = json?.failures ?? [];
        const sent = json?.sent ?? 0;
        const failed = json?.failed ?? failures.length;
        const total = json?.total ?? list.length;
        setSendReport({ sent, failed, total, failures, at: batchAt });

        const failureEmails = new Set(failures.map((f) => f.email));
        const entries: LogEntry[] = list.map((r) => {
          const f = failures.find((x) => x.email === r.email);
          return {
            id: uid(),
            at: batchAt,
            email: r.email,
            name: r.name,
            subject: `Office Order - ${r.role} (${ctx.season} ${ctx.year})`,
            orderType: 'supervision',
            orderKey: ctx.orderKey || undefined,
            ok: !failureEmails.has(r.email),
            error: f?.error,
            errorKind: f?.errorKind,
            attempts: f?.attempts,
          };
        });
        setLogs(appendLogs(entries));

        if (failures.length === 0) toast.success(`Sent ${sent} of ${total}.`);
        else if (sent > 0) toast.warning(`Sent ${sent} of ${total}. ${failures.length} failed.`);
        else toast.error(`All ${total} sends failed.`);
      } catch (err) {
        if (token !== sendTokenRef.current) return;
        const msg = err instanceof Error ? err.message : 'Network error';
        toast.error(msg);
        setSendReport({
          sent: 0,
          failed: list.length,
          total: list.length,
          failures: list.map((r) => ({ email: r.email, name: r.name, error: msg })),
          at: batchAt,
        });
        const entries: LogEntry[] = list.map((r) => ({
          id: uid(),
          at: batchAt,
          email: r.email,
          name: r.name,
          subject: `Office Order - ${r.role}`,
          orderType: 'supervision',
          orderKey: ctx.orderKey || undefined,
          ok: false,
          error: msg,
          errorKind: 'network',
        }));
        setLogs(appendLogs(entries));
      } finally {
        if (token === sendTokenRef.current) setSending(false);
      }
    },
    [selectedRecipients, examCenter, orderKey],
  );

  const retryFailed = useCallback(async () => {
    if (!sendReport?.failures.length) return;
    const failed = new Set(sendReport.failures.map((f) => f.email));
    const toRetry = selectedRecipients.filter((r) => failed.has(r.email));
    if (toRetry.length === 0) {
      toast.error('Failed recipients no longer selected.');
      return;
    }
    await doSend(toRetry);
  }, [sendReport, selectedRecipients, doSend]);

  // ---------- monitor ----------
  const openMonitor = useCallback((t: MonitorTarget) => {
    setMonitor(t);
    setMonitorVersion((v) => v + 1);
  }, []);
  const closeMonitor = useCallback(() => setMonitor(null), []);

  const handleMonitorAction = useCallback(
    (action: MonitorAction) => {
      switch (action.type) {
        case 'toggle-recipient': {
          toggleSelection(action.kind, action.id);
          const pool =
            action.kind === 'supervision'
              ? supervisors
              : action.kind === 'reliever'
                ? relievers
                : officers;
          const next = pool.find((r) => r.id === action.id);
          if (next)
            setMonitor({ type: 'recipient', recipient: { ...next, selected: !next.selected } });
          break;
        }
        case 'bulk-toggle':
          bulkToggle(action.kind);
          break;
        case 'remove-officer':
          removeOfficer(action.id);
          setMonitor(null);
          break;
        case 'remove-exclude':
          removeExclude(action.value);
          setMonitor(null);
          break;
        case 'retry-failure': {
          const r = [...supervisors, ...relievers, ...officers].find(
            (x) => x.email === action.email,
          );
          if (r) void doSend([r]);
          break;
        }
        case 'retry-all':
          void retryFailed();
          break;
        case 'focus-search':
          setSearch(action.value);
          break;
        case 'monitor-recipient-email': {
          const r = [...supervisors, ...relievers, ...officers].find(
            (x) => x.email === action.email,
          );
          if (r) openMonitor({ type: 'recipient', recipient: r });
          break;
        }
        case 'monitor-failure':
          openMonitor({ type: 'failure', failure: action.failure });
          break;
        case 'clear-logs': {
          saveLogs([]);
          setLogs([]);
          toast.success('Local logs cleared.');
          break;
        }
      }
    },
    [
      toggleSelection,
      bulkToggle,
      removeOfficer,
      removeExclude,
      doSend,
      retryFailed,
      supervisors,
      relievers,
      officers,
      openMonitor,
    ],
  );

  // ---------- reset ----------
  const reset = () => {
    fetchTokenRef.current++;
    sendTokenRef.current++;
    setOrderKey('');
    setCollegeRefKey('');
    setSupervisors([]);
    setRelievers([]);
    setOfficers([]);
    setFetchError(null);
    setSendReport(null);
    setSearch('');
    setFetching(false);
    setSending(false);
    setMonitor(null);
    toast.success('Reset.');
  };

  // ---------- gates ----------
  if (userLoading) {
    return (
      <div className="container mx-auto max-w-7xl px-4 py-8">
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading your session…
        </div>
      </div>
    );
  }
  if (!user) {
    return (
      <div className="container mx-auto max-w-7xl px-4 py-8">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Please sign in to manage office orders.</AlertDescription>
        </Alert>
      </div>
    );
  }

  const previewCtx: EmailContext = {
    examCenterName: examCenter?.name || 'Examination Center',
    examCenterCode: examCenter?.code || '',
    season: examCenter?.season || '',
    year: examCenter?.examYear || new Date().getFullYear(),
    orderKey: orderKey.trim(),
  };

  const todayLogs = logs.filter((l) => new Date(l.at).toDateString() === new Date().toDateString());
  const todayOk = todayLogs.filter((l) => l.ok).length;
  const todayFail = todayLogs.length - todayOk;

  return (
    <div className="container mx-auto max-w-7xl space-y-6 px-4 py-6">
      <PageHeader
        title="Office Orders"
        description="Prepare official examination orders and distribute them to assigned staff."
        icon={Mail}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => openMonitor({ type: 'logs' })}
              className="h-8 gap-1.5 text-xs"
            >
              <Filter className="h-3.5 w-3.5" /> Logs ({logs.length})
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={reset}
              className="h-8 gap-1.5 text-xs"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Reset
            </Button>
            <Button
              size="sm"
              onClick={fetchAllocations}
              disabled={fetching || !orderKey.trim() || !collegeRefKey.trim()}
              className="h-8 gap-1.5 text-xs"
            >
              {fetching ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Users className="h-3.5 w-3.5" />
              )}
              {fetching ? 'Fetching…' : 'Fetch allocations'}
            </Button>
          </div>
        }
      />

      {examCenter && (
        <MSBTEContextBar
          season={examCenter.season as 'Summer' | 'Winter'}
          year={examCenter.examYear!}
          compact
        />
      )}

      {/* Summary */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-3 py-4">
          <button
            onClick={() => openMonitor({ type: 'section', kind: 'supervision' })}
            className="text-left"
          >
            <Metric
              label="Supervisors"
              value={supervisors.length}
            />
          </button>
          <button
            onClick={() => openMonitor({ type: 'section', kind: 'reliever' })}
            className="text-left"
          >
            <Metric
              label="Relievers"
              value={relievers.length}
            />
          </button>
          <button
            onClick={() => openMonitor({ type: 'section', kind: 'chief' })}
            className="text-left"
          >
            <Metric
              label="Officers"
              value={officers.length}
            />
          </button>
          <button
            onClick={() => openMonitor({ type: 'report' })}
            className="text-left"
            disabled={!sendReport}
          >
            <Metric
              label="Selected"
              value={selectedCount}
            />
          </button>
          <Metric
            label="Quota left"
            value={remainingQuota}
            hint={`of ${QUOTA_LIMIT}`}
          />
          <button
            onClick={() => openMonitor({ type: 'logs' })}
            className="text-left"
          >
            <Metric
              label="Today sent"
              value={todayOk}
              hint={todayFail > 0 ? `${todayFail} failed` : undefined}
            />
          </button>
          {counts.excludedCount > 0 && (
            <button
              onClick={() => openMonitor({ type: 'section', kind: 'supervision' })}
              className="text-left"
            >
              <Metric
                label="Excluded"
                value={counts.excludedCount}
              />
            </button>
          )}
          {counts.invalidCount > 0 && (
            <button
              onClick={() => openMonitor({ type: 'section', kind: 'chief' })}
              className="text-left"
            >
              <Metric
                label="No email"
                value={counts.invalidCount}
              />
            </button>
          )}
        </CardContent>
      </Card>

      <EmailUsageStats />

      {/* References */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Order references</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label
              htmlFor="orderKey"
              className="cursor-pointer text-xs font-medium"
              onClick={() => openMonitor({ type: 'reference', field: 'orderKey' })}
            >
              Order Ref Key <span className="text-destructive">*</span>
            </Label>
            <Input
              id="orderKey"
              value={orderKey}
              onChange={(e) => setOrderKey(e.target.value)}
              placeholder="e.g. MSBTE/EX/2025/001"
              className="h-9 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label
              htmlFor="collegeRefKey"
              className="cursor-pointer text-xs font-medium"
              onClick={() => openMonitor({ type: 'reference', field: 'collegeRefKey' })}
            >
              College Ref Key <span className="text-destructive">*</span>
            </Label>
            <Input
              id="collegeRefKey"
              value={collegeRefKey}
              onChange={(e) => setCollegeRefKey(e.target.value)}
              placeholder="e.g. 0123/EX/2025"
              className="h-9 text-sm"
            />
          </div>
        </CardContent>
        {fetchError && (
          <div className="px-6 pb-4">
            <Alert
              variant="destructive"
              className="flex items-center gap-2"
            >
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="flex-1">{fetchError}</AlertDescription>
              <Button
                size="sm"
                variant="outline"
                onClick={fetchAllocations}
                className="h-7 text-xs"
              >
                Retry
              </Button>
            </Alert>
          </div>
        )}
      </Card>

      {/* Search + bulk */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, department, role, or post"
            className="h-9 pl-8 text-sm"
            aria-label="Search recipients"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={clearAllSelection}
          disabled={selectedCount === 0}
          className="h-9 text-xs"
        >
          Clear selection
        </Button>
        <Badge
          variant="secondary"
          className="h-9 cursor-pointer px-3 text-xs tabular-nums"
          onClick={() => openMonitor({ type: 'search' })}
        >
          {selectedCount} / {QUOTA_LIMIT}
        </Badge>
      </div>

      {/* Sections */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {(['supervision', 'reliever', 'chief'] as const).map((kind) => {
          const meta = KIND_META[kind];
          const list =
            kind === 'supervision'
              ? visibleSupervisors
              : kind === 'reliever'
                ? visibleRelievers
                : visibleOfficers;
          const total =
            kind === 'supervision'
              ? supervisors.length
              : kind === 'reliever'
                ? relievers.length
                : officers.length;
          const Icon = meta.icon;
          return (
            <Card
              key={kind}
              className="flex flex-col"
            >
              <CardHeader className="border-b pb-3">
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => openMonitor({ type: 'section', kind })}
                    className="flex items-center gap-2 text-left"
                    aria-label={`Open ${meta.plural} monitor`}
                  >
                    <Icon className="text-muted-foreground h-4 w-4" />
                    <h3 className="text-sm font-semibold tracking-tight">{meta.plural}</h3>
                    <Badge
                      variant="secondary"
                      className="text-[10px] tabular-nums"
                    >
                      {total}
                    </Badge>
                  </button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => bulkToggle(kind)}
                    className="h-7 px-2 text-xs"
                    disabled={list.length === 0}
                  >
                    {list.length > 0 &&
                    list.every(
                      (r) => r.selected || isExcluded(r.email, excludes) || !isEmailValid(r.email),
                    )
                      ? 'Deselect all'
                      : 'Select all'}
                  </Button>
                </div>
              </CardHeader>

              {kind === 'chief' && (
                <div className="space-y-2 border-b p-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="col-span-2 space-y-1">
                      <Label className="text-xs">Name</Label>
                      <Input
                        value={officerDraft.name}
                        onChange={(e) => setOfficerDraft({ ...officerDraft, name: e.target.value })}
                        className="h-8 text-sm"
                      />
                      {officerErrors.name && (
                        <p className="text-destructive text-[11px]">{officerErrors.name}</p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Department</Label>
                      <Input
                        value={officerDraft.department}
                        onChange={(e) =>
                          setOfficerDraft({ ...officerDraft, department: e.target.value })
                        }
                        className="h-8 text-sm"
                      />
                      {officerErrors.department && (
                        <p className="text-destructive text-[11px]">{officerErrors.department}</p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Email</Label>
                      <Input
                        type="email"
                        value={officerDraft.email}
                        onChange={(e) =>
                          setOfficerDraft({ ...officerDraft, email: e.target.value })
                        }
                        className="h-8 text-sm"
                      />
                      {officerErrors.email && (
                        <p className="text-destructive text-[11px]">{officerErrors.email}</p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Role</Label>
                      <Select
                        value={officerDraft.role}
                        onValueChange={(v) => setOfficerDraft({ ...officerDraft, role: v })}
                      >
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLE_OPTIONS.map((r) => (
                            <SelectItem
                              key={r}
                              value={r}
                            >
                              {r}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {officerErrors.role && (
                        <p className="text-destructive text-[11px]">{officerErrors.role}</p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Post</Label>
                      <Select
                        value={officerDraft.post}
                        onValueChange={(v) => setOfficerDraft({ ...officerDraft, post: v })}
                      >
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                        <SelectContent>
                          {POST_OPTIONS.map((p) => (
                            <SelectItem
                              key={p}
                              value={p}
                            >
                              {p}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {officerErrors.post && (
                        <p className="text-destructive text-[11px]">{officerErrors.post}</p>
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={addOfficer}
                    className="h-8 w-full gap-1 text-xs"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add officer
                  </Button>
                </div>
              )}

              <ScrollArea className="h-[340px]">
                {list.length === 0 ? (
                  <div className="flex h-[320px] flex-col items-center justify-center gap-1 px-4 text-center">
                    <Icon className="text-muted-foreground/40 h-8 w-8" />
                    <p className="text-muted-foreground text-xs">
                      {total === 0
                        ? kind === 'chief'
                          ? 'Add officers using the form above.'
                          : `No ${meta.plural.toLowerCase()} loaded. Enter reference keys and fetch.`
                        : 'No matches for your search.'}
                    </p>
                  </div>
                ) : (
                  <div className="divide-border divide-y">
                    {list.map((r) => {
                      const { excluded, invalidEmail } = exclusionInfo(r);
                      const willDisable = !r.selected && selectedCount >= QUOTA_LIMIT;
                      return (
                        <RecipientRow
                          key={r.id}
                          recipient={r}
                          selected={!!r.selected}
                          onToggle={() => toggleSelection(r.kind, r.id)}
                          disabled={willDisable}
                          excluded={excluded}
                          invalidEmail={invalidEmail}
                          onRemove={kind === 'chief' ? removeOfficer : undefined}
                          onMonitor={(rec) => openMonitor({ type: 'recipient', recipient: rec })}
                        />
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </Card>
          );
        })}
      </div>

      {/* Exclusions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Exclusion preferences</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={newExclude}
              onChange={(e) => setNewExclude(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addExclude();
                }
              }}
              placeholder="Full email or @domain rule"
              className="h-8 min-w-[220px] flex-1 text-sm"
            />
            <Button
              size="sm"
              onClick={addExclude}
              className="h-8 text-xs"
            >
              Add exclusion
            </Button>
          </div>
          {excludes.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {excludes.map((e) => (
                <Badge
                  key={e}
                  variant="outline"
                  className="hover:bg-muted cursor-pointer gap-1 text-xs"
                  onClick={() => openMonitor({ type: 'exclusion', value: e })}
                >
                  {e}
                  <button
                    type="button"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      removeExclude(e);
                    }}
                    className="hover:bg-muted rounded-full p-0.5"
                    aria-label={`Remove exclusion ${e}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
          <p className="text-muted-foreground text-[11px]">
            Exclusions are exact-match. Domain rules begin with{' '}
            <code className="bg-muted rounded px-1">@</code>.
          </p>
        </CardContent>
      </Card>

      {/* Footer actions */}
      <div className="border-border bg-background/95 sticky bottom-0 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 backdrop-blur">
        <div className="text-muted-foreground flex items-center gap-3 text-xs">
          <span>
            <strong className="text-foreground tabular-nums">{selectedCount}</strong> selected
          </span>
          <span aria-hidden>·</span>
          <span>
            <strong className="text-foreground tabular-nums">{remainingQuota}</strong> quota
            remaining
          </span>
          <span aria-hidden>·</span>
          <button
            className="hover:text-foreground"
            onClick={() => openMonitor({ type: 'logs' })}
          >
            <strong className="tabular-nums">{logs.length}</strong> logged
          </button>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPreviewOpen(true)}
            disabled={selectedCount === 0}
            className="h-8 gap-1.5 text-xs"
          >
            <Eye className="h-3.5 w-3.5" /> Preview
          </Button>
          <Button
            size="sm"
            onClick={() => setConfirmOpen(true)}
            disabled={sending || selectedCount === 0}
            className="h-8 gap-1.5 text-xs"
          >
            {sending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            {sending ? 'Sending…' : `Send ${selectedCount}`}
          </Button>
        </div>
      </div>

      {/* Send report */}
      {sendReport && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <button
              type="button"
              onClick={() => openMonitor({ type: 'report' })}
              className="text-left"
            >
              <CardTitle className="text-sm font-semibold">
                Last send report
                <span className="text-muted-foreground ml-2 text-xs font-normal">
                  {new Date(sendReport.at).toLocaleTimeString()}
                </span>
              </CardTitle>
            </button>
            <div className="flex items-center gap-2">
              <Badge
                variant="secondary"
                className="text-[10px] tabular-nums"
              >
                <CheckCircle2 className="mr-1 h-3 w-3 text-emerald-600" />
                {sendReport.sent}
              </Badge>
              {sendReport.failed > 0 && (
                <>
                  <Badge
                    variant="outline"
                    className="text-destructive text-[10px] tabular-nums"
                  >
                    <AlertCircle className="mr-1 h-3 w-3" />
                    {sendReport.failed}
                  </Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={retryFailed}
                    disabled={sending}
                    className="h-7 gap-1 text-xs"
                  >
                    <RefreshCw className="h-3 w-3" /> Retry failed
                  </Button>
                </>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {sendReport.failures.length === 0 ? (
              <p className="text-muted-foreground text-xs">All emails sent successfully.</p>
            ) : (
              <div className="max-h-[260px] space-y-1 overflow-y-auto">
                {sendReport.failures.map((f, i) => (
                  <button
                    key={`${f.email}-${i}`}
                    type="button"
                    onClick={() => openMonitor({ type: 'failure', failure: f })}
                    className="border-destructive/20 bg-destructive/5 hover:bg-destructive/10 flex w-full items-start gap-2 rounded border px-2 py-1.5 text-left text-xs"
                  >
                    <AlertCircle className="text-destructive mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">{f.name || f.email}</span>
                        {f.errorKind && f.errorKind !== 'none' && (
                          <Badge
                            variant="outline"
                            className="text-[9px] uppercase"
                          >
                            {f.errorKind}
                          </Badge>
                        )}
                        {typeof f.attempts === 'number' && f.attempts > 1 && (
                          <span className="text-muted-foreground text-[10px]">
                            {f.attempts} attempts
                          </span>
                        )}
                      </div>
                      <div className="text-muted-foreground truncate">{f.email}</div>
                      {f.error && (
                        <div className="text-destructive/90 mt-0.5">
                          {f.error}
                          {f.errorCode && (
                            <span className="text-muted-foreground ml-1">({f.errorCode})</span>
                          )}
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Preview */}
      <Dialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
      >
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto p-0">
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Eye className="h-4 w-4" /> Preview
            </DialogTitle>
            <DialogDescription>
              {selectedCount} recipient{selectedCount === 1 ? '' : 's'} · {previewCtx.orderKey}
            </DialogDescription>
          </DialogHeader>
          <div className="bg-muted/30 space-y-4 p-6">
            {selectedRecipients.map((r) => (
              <div
                key={r.id}
                className="bg-background overflow-hidden rounded-md border"
              >
                <div className="bg-muted/40 flex items-center justify-between border-b px-4 py-2">
                  <span className="text-xs font-medium">
                    {r.name} · {r.email}
                  </span>
                  <Badge
                    variant="secondary"
                    className="text-[10px]"
                  >
                    {r.role}
                  </Badge>
                </div>
                <OrderPreviewDocument
                  recipient={r}
                  ctx={previewCtx}
                />
              </div>
            ))}
          </div>
          <DialogFooter className="border-t px-6 py-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPreviewOpen(false)}
              className="h-8 text-xs"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm */}
      <Dialog
        open={confirmOpen}
        onOpenChange={(v) => !sending && setConfirmOpen(v)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Send {selectedCount} office order{selectedCount === 1 ? '' : 's'}?
            </DialogTitle>
            <DialogDescription>Emails will be dispatched. This cannot be undone.</DialogDescription>
          </DialogHeader>
          <div className="bg-muted/40 text-muted-foreground rounded-md border p-3 text-xs">
            <p>
              <strong className="text-foreground">{selectedCount}</strong> recipients · quota{' '}
              {remainingQuota} remaining
            </p>
            <p className="mt-1">
              Reference: <span className="font-mono">{previewCtx.orderKey || '—'}</span>
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmOpen(false)}
              disabled={sending}
              className="h-8 text-xs"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={async () => {
                setConfirmOpen(false);
                await doSend();
              }}
              disabled={sending}
              className="h-8 gap-1.5 text-xs"
            >
              {sending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              {sending ? 'Sending…' : 'Confirm & send'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MonitorDrawer
        target={monitor}
        onClose={closeMonitor}
        onAction={handleMonitorAction}
        version={monitorVersion}
        logs={logs}
        ctx={{
          orderKey: orderKey.trim(),
          collegeRefKey: collegeRefKey.trim(),
          search,
          excludes,
          supervisors,
          relievers,
          officers,
          remainingQuota,
          report: sendReport,
        }}
      />
    </div>
  );
}
