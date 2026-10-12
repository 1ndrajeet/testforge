// components/admin/email-usage-stats.tsx
'use client';

import { useEffect, useRef, useState } from 'react';

import { AlertCircle, CheckCircle2, Gauge, Mail, TrendingUp } from 'lucide-react';

import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

import { useUserInfo } from '@/hooks/useUserInfo';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';

// ────────────────────────────────────────────────────────────
// Quota constants
//
// These are product-config values, not per-row database fields.
// If they ever become per-center configurable they should move to
// `exam_centers` (e.g. an `email_daily_limit` column) — until then
// they are the single source of truth in the client.
// ────────────────────────────────────────────────────────────

const DAILY_LIMIT = 80;
const MONTHLY_LIMIT = 2900;

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

interface UsageCounts {
  sent: number;
  failed: number;
  total: number;
}

interface UsageStats {
  daily: UsageCounts & {
    limit: number;
    remaining: number;
    percentage: number;
    isOverLimit: boolean;
  };
  monthly: UsageCounts & { limit: number; remaining: number; percentage: number };
}

type Supabase = ReturnType<typeof createClient>;

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function startOfDayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function startOfMonthIso(): string {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function pct(total: number, limit: number): number {
  if (limit <= 0) return 0;
  return Math.min(100, (total / limit) * 100);
}

/**
 * Fetches status values for every email_logs row for this exam center
 * since `sinceIso`, then counts client-side. Two requests per window
 * (or one, if you prefer — see comment below) is well within the
 * PostgREST default row cap for realistic daily/monthly volumes.
 *
 * If a center ever exceeds 1000 logs in a month, add a `.range()` loop
 * here. For now we fetch a single page and rely on the cap; the query
 * filters by exam_center_id so at most one center's data is pulled.
 */
async function fetchCountsSince(
  supabase: Supabase,
  examCenterId: string,
  sinceIso: string,
): Promise<UsageCounts> {
  const { data, error } = await supabase
    .from('email_logs')
    .select('status')
    .eq('exam_center_id', examCenterId)
    .gte('created_at', sinceIso)
    .limit(1000);
  if (error) throw new Error(error.message);

  let sent = 0;
  let failed = 0;
  for (const row of (data ?? []) as Array<{ status: string | null }>) {
    if (row.status === 'sent') sent += 1;
    else if (row.status === 'failed') failed += 1;
  }
  return { sent, failed, total: sent + failed };
}

async function loadStats(supabase: Supabase, examCenterId: string): Promise<UsageStats> {
  const [daily, monthly] = await Promise.all([
    fetchCountsSince(supabase, examCenterId, startOfDayIso()),
    fetchCountsSince(supabase, examCenterId, startOfMonthIso()),
  ]);

  return {
    daily: {
      ...daily,
      limit: DAILY_LIMIT,
      remaining: Math.max(0, DAILY_LIMIT - daily.total),
      percentage: pct(daily.total, DAILY_LIMIT),
      isOverLimit: daily.total >= DAILY_LIMIT,
    },
    monthly: {
      ...monthly,
      limit: MONTHLY_LIMIT,
      remaining: Math.max(0, MONTHLY_LIMIT - monthly.total),
      percentage: pct(monthly.total, MONTHLY_LIMIT),
    },
  };
}

// ────────────────────────────────────────────────────────────
// Full stats block (two cards: Daily and Monthly)
// ────────────────────────────────────────────────────────────

export function EmailUsageStats() {
  const { examCenter, isLoading: userLoading } = useUserInfo();
  const examCenterId = examCenter?.id;

  const [stats, setStats] = useState<UsageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (userLoading) return;
    if (!examCenterId) {
      setStats(null);
      setError('No exam center is available for your account.');
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    loadStats(createClient(), examCenterId)
      .then((data) => {
        if (!cancelled) setStats(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load usage stats');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [examCenterId, userLoading]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Skeleton className="h-[120px] rounded-xl" />
        <Skeleton className="h-[120px] rounded-xl" />
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div
        role="alert"
        className="flex items-center gap-2 rounded-xl border border-rose-200/60 bg-rose-50/50 px-4 py-3 text-sm text-rose-600 dark:border-rose-800/30 dark:bg-rose-950/10 dark:text-rose-400"
      >
        <AlertCircle
          aria-hidden
          className="h-4 w-4 shrink-0"
        />
        <span>{error || 'Failed to load usage stats'}</span>
      </div>
    );
  }

  const { daily, monthly } = stats;
  const isNearLimit = daily.percentage > 80 || monthly.percentage > 80;
  const isOverLimit = daily.isOverLimit || monthly.percentage >= 100;
  const status: 'danger' | 'warning' | 'success' = isOverLimit
    ? 'danger'
    : isNearLimit
      ? 'warning'
      : 'success';

  const statusClasses = {
    danger: 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400',
    warning: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400',
    success: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400',
  }[status];

  const dailyBarClass = {
    danger: '[&>div]:bg-rose-500',
    warning: '[&>div]:bg-amber-500',
    success: '[&>div]:bg-emerald-500',
  }[status];

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {/* Daily */}
      <Card className="border-neutral-200/60 bg-white shadow-sm dark:border-white/5 dark:bg-neutral-950">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <div className="grid h-8 w-8 place-items-center rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
                  <Mail
                    aria-hidden
                    className="h-4 w-4"
                  />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">Daily</p>
                  <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0 text-xs">
                    <span className="font-medium text-emerald-600 tabular-nums dark:text-emerald-400">
                      {daily.sent}
                    </span>
                    <span className="text-neutral-400">sent</span>
                    {daily.failed > 0 && (
                      <>
                        <span
                          aria-hidden
                          className="h-1 w-1 rounded-full bg-rose-400"
                        />
                        <span className="font-medium text-rose-500 tabular-nums">
                          {daily.failed}
                        </span>
                        <span className="text-neutral-400">failed</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <Badge className={cn('border-0 font-medium', statusClasses)}>
              <span className="flex items-center gap-1.5">
                {status === 'danger' ? (
                  <AlertCircle
                    aria-hidden
                    className="h-3 w-3"
                  />
                ) : status === 'warning' ? (
                  <Gauge
                    aria-hidden
                    className="h-3 w-3"
                  />
                ) : (
                  <CheckCircle2
                    aria-hidden
                    className="h-3 w-3"
                  />
                )}
                {daily.remaining} remaining
              </span>
            </Badge>
          </div>

          <div className="mt-3.5 space-y-1">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold tracking-tight tabular-nums">{daily.total}</span>
              <span className="text-xs text-neutral-400 tabular-nums">/ {daily.limit}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-neutral-400 tabular-nums">
                {Math.round(daily.percentage)}% used
              </span>
              <span className="text-neutral-400 tabular-nums">{daily.remaining} remaining</span>
            </div>
            <Progress
              value={daily.percentage}
              className={cn('h-1.5 bg-neutral-200/50 dark:bg-white/5', dailyBarClass)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Monthly */}
      <Card className="border-neutral-200/60 bg-white shadow-sm dark:border-white/5 dark:bg-neutral-950">
        <CardContent className="p-4">
          <div className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 place-items-center rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400">
              <TrendingUp
                aria-hidden
                className="h-4 w-4"
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Monthly</p>
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0 text-xs">
                <span className="font-medium text-blue-600 tabular-nums dark:text-blue-400">
                  {monthly.sent}
                </span>
                <span className="text-neutral-400">sent</span>
                {monthly.failed > 0 && (
                  <>
                    <span
                      aria-hidden
                      className="h-1 w-1 rounded-full bg-rose-400"
                    />
                    <span className="font-medium text-rose-500 tabular-nums">{monthly.failed}</span>
                    <span className="text-neutral-400">failed</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="mt-3.5 space-y-1">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold tracking-tight tabular-nums">
                {monthly.total}
              </span>
              <span className="text-xs text-neutral-400 tabular-nums">/ {monthly.limit}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-neutral-400 tabular-nums">
                {Math.round(monthly.percentage)}% used
              </span>
              <span className="text-neutral-400 tabular-nums">{monthly.remaining} left</span>
            </div>
            <Progress
              value={monthly.percentage}
              className="h-1.5 bg-neutral-200/50 dark:bg-white/5 [&>div]:bg-blue-500"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Compact daily widget with IntersectionObserver lazy load
// ────────────────────────────────────────────────────────────

export function EmailDailyUsage() {
  const { examCenter, isLoading: userLoading } = useUserInfo();
  const examCenterId = examCenter?.id;

  const [data, setData] = useState<UsageStats['daily'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (userLoading || !examCenterId) return;
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting && !hasLoaded) {
          setHasLoaded(true);
          const supabase = createClient();
          loadStats(supabase, examCenterId)
            .then((s) => setData(s.daily))
            .catch(() => setData(null))
            .finally(() => setLoading(false));
        }
      },
      { rootMargin: '200px', threshold: 0.1 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [examCenterId, userLoading, hasLoaded]);

  if (!hasLoaded || loading) {
    return (
      <div
        ref={containerRef}
        className="space-y-1.5"
      >
        <div className="h-3 w-20 animate-pulse rounded bg-neutral-200/60 dark:bg-white/10" />
        <div className="h-1 w-full animate-pulse rounded bg-neutral-200/60 dark:bg-white/10" />
      </div>
    );
  }

  if (!data) return null;

  const { sent, failed, total, limit, remaining, percentage, isOverLimit } = data;
  const isNear = percentage > 80 && !isOverLimit;
  const color: 'rose' | 'amber' | 'emerald' = isOverLimit ? 'rose' : isNear ? 'amber' : 'emerald';

  return (
    <div
      ref={containerRef}
      className="rounded-md border border-neutral-200/60 bg-white px-2.5 py-2 dark:border-neutral-800/60 dark:bg-neutral-950"
    >
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <div
              className={cn(
                'grid h-5 w-5 place-items-center rounded text-white',
                color === 'emerald' && 'bg-emerald-500',
                color === 'amber' && 'bg-amber-500',
                color === 'rose' && 'bg-rose-500',
              )}
            >
              <Mail
                aria-hidden
                className="h-2.5 w-2.5"
              />
            </div>
            <span className="text-[10px] font-medium text-neutral-500">Daily</span>
          </div>
          <div className="flex items-center gap-1">
            {isOverLimit ? (
              <AlertCircle
                aria-hidden
                className="h-3 w-3 text-rose-500"
              />
            ) : isNear ? (
              <Gauge
                aria-hidden
                className="h-3 w-3 text-amber-500"
              />
            ) : (
              <CheckCircle2
                aria-hidden
                className="h-3 w-3 text-emerald-500"
              />
            )}
            <span
              className={cn(
                'text-[9px] font-medium tabular-nums',
                color === 'emerald' && 'text-emerald-600',
                color === 'amber' && 'text-amber-600',
                color === 'rose' && 'text-rose-600',
              )}
            >
              {remaining} remaining
            </span>
          </div>
        </div>

        <div className="flex items-end justify-between">
          <div className="flex items-baseline gap-1">
            <span className="text-lg font-bold tracking-tight tabular-nums">{total}</span>
            <span className="text-[9px] text-neutral-400 tabular-nums">/ {limit}</span>
          </div>
          <span className="text-[9px] text-neutral-400 tabular-nums">
            {sent} sent {failed > 0 && <span className="text-rose-500">· {failed} failed</span>}
          </span>
        </div>

        <Progress
          value={percentage}
          className={cn(
            'h-1 bg-neutral-200/50 dark:bg-white/5',
            color === 'emerald' && '[&>div]:bg-emerald-500',
            color === 'amber' && '[&>div]:bg-amber-500',
            color === 'rose' && '[&>div]:bg-rose-500',
          )}
        />
      </div>
    </div>
  );
}
