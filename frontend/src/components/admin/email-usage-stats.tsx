// components/admin/email-usage-stats.tsx
'use client';

import { useEffect, useRef, useState } from 'react';

import { AlertCircle, CheckCircle2, Gauge, Mail, TrendingUp, Users } from 'lucide-react';

import { getUsageStatsForCurrentCenter } from '@/lib/actions/email-usage';
import { cn } from '@/lib/utils';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';

interface UsageStats {
  daily: {
    sent: number;
    failed: number;
    total: number;
    limit: number;
    remaining: number;
    percentage: number;
    isOverLimit: boolean;
  };
  monthly: { total: number; limit: number; remaining: number; percentage: number };
  global: {
    totalSent: number;
    totalFailed: number;
    total: number;
    limit: number;
    remaining: number;
    percentage: number;
    isOverLimit: boolean;
    centers: Array<{
      examCenterCode: string;
      examCenterName: string;
      sent: number;
      failed: number;
      total: number;
      percentage: number;
    }>;
  };
}

export function EmailUsageStats() {
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getUsageStatsForCurrentCenter()
      .then((data) => setStats(data as UsageStats))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading)
    return (
      <div className="space-y-3">
        <Skeleton className="h-[88px] w-full rounded-xl" />
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-[72px] rounded-xl" />
          <Skeleton className="h-[72px] rounded-xl" />
        </div>
      </div>
    );

  if (error || !stats)
    return (
      <div className="flex items-center gap-2 rounded-xl border border-rose-200/60 bg-rose-50/50 px-4 py-3 text-sm text-rose-600 dark:border-rose-800/30 dark:bg-rose-950/10 dark:text-rose-400">
        <AlertCircle className="h-4 w-4 shrink-0" />
        <span>{error || 'Failed to load usage stats'}</span>
      </div>
    );

  const { daily, monthly, global } = stats;
  const isNearLimit = daily.percentage > 80 || monthly.percentage > 80;
  const isOverLimit = daily.isOverLimit || monthly.percentage >= 100;

  const status = isOverLimit ? 'danger' : isNearLimit ? 'warning' : 'success';
  const colors = {
    danger: {
      light: 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400',
      bar: 'bg-rose-500',
    },
    warning: {
      light: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400',
      bar: 'bg-amber-500',
    },
    success: {
      light: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400',
      bar: 'bg-emerald-500',
    },
  };

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      {/* Daily */}
      <Card className="border-neutral-200/60 bg-white shadow-sm dark:border-white/5 dark:bg-neutral-950">
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="grid h-8 w-8 place-items-center rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
                  <Mail className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Daily</p>
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="font-medium text-emerald-600 dark:text-emerald-400">
                      {daily.sent}
                    </span>
                    <span className="text-neutral-400">sent</span>
                    {daily.failed > 0 && (
                      <>
                        <span className="h-1 w-1 rounded-full bg-rose-400" />
                        <span className="font-medium text-rose-500">{daily.failed}</span>
                        <span className="text-neutral-400">failed</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold tracking-tight">{daily.total}</span>
                  <span className="text-xs text-neutral-400">/ {daily.limit}</span>
                </div>
              </div>
            </div>
            <Badge
              className={cn(
                'border-0 font-medium',
                status === 'danger' && colors.danger.light,
                status === 'warning' && colors.warning.light,
                status === 'success' && colors.success.light,
              )}
            >
              <span className="flex items-center gap-1.5">
                {status === 'danger' ? (
                  <AlertCircle className="h-3 w-3" />
                ) : status === 'warning' ? (
                  <Gauge className="h-3 w-3" />
                ) : (
                  <CheckCircle2 className="h-3 w-3" />
                )}
                {status === 'danger'
                  ? `${daily.remaining} left`
                  : status === 'warning'
                    ? `${daily.remaining} left`
                    : `${daily.remaining} remaining`}
              </span>
            </Badge>
          </div>
          <div className="mt-3.5 space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-neutral-400">{Math.round(daily.percentage)}% used</span>
              <span className="text-neutral-400">{daily.remaining} remaining</span>
            </div>
            <Progress
              value={daily.percentage}
              className={cn(
                'h-1.5 bg-neutral-200/50 dark:bg-white/5',
                status === 'danger' && '[&>div]:bg-rose-500',
                status === 'warning' && '[&>div]:bg-amber-500',
                status === 'success' && '[&>div]:bg-emerald-500',
              )}
            />
          </div>
        </CardContent>
      </Card>

      {/* Monthly */}
      <Card className="border-neutral-200/60 bg-white shadow-sm dark:border-white/5 dark:bg-neutral-950">
        <CardContent className="p-4">
          <div className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 place-items-center rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400">
              <TrendingUp className="h-4 w-4" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold">Monthly</p>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold tracking-tight">{monthly.total}</span>
                <span className="text-xs text-neutral-400">/ {monthly.limit}</span>
              </div>
            </div>
          </div>
          <div className="mt-3 space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-neutral-400">{Math.round(monthly.percentage)}% used</span>
              <span className="text-neutral-400">{monthly.remaining} left</span>
            </div>
            <Progress
              value={monthly.percentage}
              className="h-1.5 bg-neutral-200/50 dark:bg-white/5 [&>div]:bg-blue-500"
            />
          </div>
        </CardContent>
      </Card>

      {/* Global */}
      <Card className="border-neutral-200/60 bg-white shadow-sm dark:border-white/5 dark:bg-neutral-950">
        <CardContent className="p-4">
          <div className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 place-items-center rounded-xl bg-violet-100 text-violet-600 dark:bg-violet-500/20 dark:text-violet-400">
              <Users className="h-4 w-4" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold">Global</p>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold tracking-tight">{global.total}</span>
                <span className="text-xs text-neutral-400">/ {global.limit}</span>
              </div>
            </div>
            {global.totalFailed > 0 && (
              <Badge
                variant="outline"
                className="border-rose-200/60 bg-rose-50/50 text-rose-600 dark:border-rose-800/30 dark:bg-rose-500/10 dark:text-rose-400"
              >
                {global.totalFailed} failed
              </Badge>
            )}
          </div>
          <div className="mt-3 space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-neutral-400">{Math.round(global.percentage)}% used</span>
              <span className="text-neutral-400">{global.remaining} left</span>
            </div>
            <Progress
              value={global.percentage}
              className={cn(
                'h-1.5 bg-neutral-200/50 dark:bg-white/5',
                global.isOverLimit ? '[&>div]:bg-rose-500' : '[&>div]:bg-violet-500',
              )}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Compact Sidebar Version with Lazy Loading ──────────────

interface DailyUsage {
  sent: number;
  failed: number;
  total: number;
  limit: number;
  remaining: number;
  percentage: number;
  isOverLimit: boolean;
}

export function EmailDailyUsage() {
  const [data, setData] = useState<DailyUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting && !hasLoaded) {
          setHasLoaded(true);
          getUsageStatsForCurrentCenter()
            .then((res) => setData(res.daily))
            .catch(() => setData(null))
            .finally(() => setLoading(false));
        }
      },
      {
        rootMargin: '200px', // Start loading slightly before it enters viewport
        threshold: 0.1,
      }
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [hasLoaded]);

  // Show placeholder while not loaded
  if (!hasLoaded) {
    return (
      <div ref={containerRef} className="space-y-1.5">
        <div className="h-3 w-20 animate-pulse rounded bg-neutral-200/60 dark:bg-white/10" />
        <div className="h-1 w-full animate-pulse rounded bg-neutral-200/60 dark:bg-white/10" />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-1.5">
        <div className="h-3 w-20 animate-pulse rounded bg-neutral-200/60 dark:bg-white/10" />
        <div className="h-1 w-full animate-pulse rounded bg-neutral-200/60 dark:bg-white/10" />
      </div>
    );
  }

  if (!data) return null;

  const { sent, failed, total, limit, remaining, percentage, isOverLimit } = data;
  const isNear = percentage > 80 && !isOverLimit;
  const color = isOverLimit ? 'rose' : isNear ? 'amber' : 'emerald';

  return (
    <div ref={containerRef} className="group relative rounded-md border border-neutral-200/60 bg-white px-2.5 py-2 dark:border-neutral-800/60 dark:bg-neutral-950">
      <div
        className={cn(
          'absolute -top-6 -right-6 h-14 w-14 rounded-full opacity-0 blur-2xl transition-opacity duration-500',
          color === 'emerald' && 'bg-emerald-500/20',
          color === 'amber' && 'bg-amber-500/20',
          color === 'rose' && 'bg-rose-500/20',
        )}
      />

      <div className="relative space-y-1.5">
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
              <Mail className="h-2.5 w-2.5" />
            </div>
            <span className="text-[10px] font-medium text-neutral-500">Daily</span>
          </div>
          <div className="flex items-center gap-1">
            {isOverLimit ? (
              <AlertCircle className="h-3 w-3 text-rose-500" />
            ) : isNear ? (
              <Gauge className="h-3 w-3 text-amber-500" />
            ) : (
              <CheckCircle2 className="h-3 w-3 text-emerald-500" />
            )}
            <span
              className={cn(
                'text-[9px] font-medium',
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
            <span className="text-lg font-bold tracking-tight">{total}</span>
            <span className="text-[9px] text-neutral-400">/ {limit}</span>
          </div>
          <span className="text-[9px] text-neutral-400">
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