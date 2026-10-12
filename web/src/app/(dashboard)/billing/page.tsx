// app/billing/page.tsx
'use client';

import React, { Suspense, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

import pricingPlans from '@/config/pricing.json';
import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  Info,
  Loader2,
  Lock,
  RefreshCw,
  X,
} from 'lucide-react';

import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// ─────────────────────────────────────────────────────────────
// Types (unchanged)
// ─────────────────────────────────────────────────────────────

interface Payment {
  id: string;
  planName: string;
  amount: number;
  status: string;
  createdAt: Date;
  endDate: Date | null;
}

interface PaymentRow {
  id: string;
  plan_name: string | null;
  amount: number | null;
  status: string | null;
  created_at: string;
  end_date: string | null;
}

interface Plan {
  id: string;
  title: string;
  price: string;
  period: string;
  description: string;
  features: string[];
  popular?: boolean;
  offer?: boolean;
  originalPrice?: string;
  savings?: string;
  highlight?: string;
  highlightDetail?: string;
  cta: string;
  disabled?: boolean;
  amount: number;
}

interface SubscriptionInfo {
  tier: string;
  planName: string;
  expiresAt: string | null;
  isActive: boolean;
}

interface SessionUser {
  id: string;
  name: string;
  email: string;
}

interface ExamCenterInfo {
  id: string;
  name: string;
  code: string;
}

interface BootstrapData {
  user: SessionUser | null;
  examCenter: ExamCenterInfo | null;
  subscription: SubscriptionInfo | null;
  payments: Payment[];
}

interface AppliedPromo {
  code: string;
  durationDays: number;
  amount: number;
  expiresAt: string | null;
}

interface RazorpaySuccess {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

type Tone = 'positive' | 'warning' | 'danger' | 'neutral';
type BannerTone = 'success' | 'error' | 'info';
type Phase = 'idle' | 'creating' | 'awaiting' | 'verifying';

interface Feedback {
  tone: BannerTone;
  text: string;
}

declare global {
  interface Window {
    Razorpay: any;
  }
}

// ─────────────────────────────────────────────────────────────
// Logging (unchanged)
// ─────────────────────────────────────────────────────────────

const LOG_PREFIX = '[billing]';
function warn(...args: unknown[]) {
  console.warn(LOG_PREFIX, ...args);
}
function error(...args: unknown[]) {
  console.error(LOG_PREFIX, ...args);
}

// ─────────────────────────────────────────────────────────────
// Plans (unchanged)
// ─────────────────────────────────────────────────────────────

const PLANS = pricingPlans as Plan[];
const ACTIVE_PLANS = PLANS.filter((p) => !p.disabled);
const UNAVAILABLE_PLANS = PLANS.filter((p) => p.disabled);
const ORDERED_PLANS = [...ACTIVE_PLANS, ...UNAVAILABLE_PLANS];
const DEFAULT_PLAN_ID = (PLANS.find((p) => p.popular && !p.disabled) ?? ACTIVE_PLANS[0])?.id ?? '';

// ─────────────────────────────────────────────────────────────
// Razorpay loader (unchanged)
// ─────────────────────────────────────────────────────────────

let razorpayLoadPromise: Promise<void> | null = null;
let razorpayLoaded = false;

async function ensureRazorpay(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (window.Razorpay || razorpayLoaded) {
    razorpayLoaded = true;
    return;
  }
  if (razorpayLoadPromise) return razorpayLoadPromise;

  razorpayLoadPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(
      'script[src="https://checkout.razorpay.com/v1/checkout.js"]',
    );
    const onLoaded = () => {
      if (window.Razorpay) {
        razorpayLoaded = true;
        razorpayLoadPromise = null;
        resolve();
      } else {
        razorpayLoadPromise = null;
        reject(new Error('Razorpay loaded but SDK unavailable'));
      }
    };
    if (existing) {
      if (window.Razorpay) return onLoaded();
      existing.addEventListener('load', onLoaded, { once: true });
      existing.addEventListener(
        'error',
        () => {
          razorpayLoadPromise = null;
          reject(new Error('Failed to load Razorpay SDK'));
        },
        { once: true },
      );
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = onLoaded;
    script.onerror = () => {
      razorpayLoadPromise = null;
      reject(new Error('Failed to load Razorpay SDK'));
    };
    document.head.appendChild(script);
  });

  return razorpayLoadPromise;
}

function openRazorpay(options: Record<string, unknown>, onDismiss: () => void) {
  if (!window.Razorpay) throw new Error('Razorpay SDK not available');
  const rzp = new window.Razorpay({ ...options, modal: { ondismiss: onDismiss } });
  rzp.open();
}

// ─────────────────────────────────────────────────────────────
// Helpers (unchanged)
// ─────────────────────────────────────────────────────────────

function formatDateShort(d: Date | string) {
  return new Date(d).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatDateTime(d: Date | string) {
  return new Date(d).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount / 100);
}

function shortReference(id: string) {
  return id.length > 12 ? `${id.slice(0, 4)}…${id.slice(-6)}` : id;
}

function mapPayment(p: PaymentRow): Payment {
  return {
    id: p.id,
    planName: p.plan_name ?? 'Plan',
    amount: p.amount ?? 0,
    status: p.status ?? 'unknown',
    createdAt: new Date(p.created_at),
    endDate: p.end_date ? new Date(p.end_date) : null,
  };
}

function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  el.focus({ preventScroll: true });
}

// ─────────────────────────────────────────────────────────────
// Access state (unchanged)
// ─────────────────────────────────────────────────────────────

interface AccessState {
  label: string;
  detail: string;
  tone: Tone;
  daysRemaining: number | null;
  validUntil: string;
  timeLeft: string;
  action: string | null;
  actionPrimary: boolean;
}

function getAccessState(sub: SubscriptionInfo): AccessState {
  const expiresAt = sub.expiresAt;
  const expired = !!expiresAt && new Date(expiresAt) < new Date();
  const days =
    expiresAt && !expired
      ? Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000)
      : null;
  const timeLeft = days === null ? '—' : `${days} ${days === 1 ? 'day' : 'days'}`;
  const validUntil = expiresAt ? formatDateShort(expiresAt) : '—';
  const expiringSoon = days !== null && days <= 7;

  if (sub.tier === 'enterprise') {
    return {
      label: 'Lifetime access',
      detail: 'This center has permanent access. No renewal needed.',
      tone: 'positive',
      daysRemaining: null,
      validUntil: 'No expiry',
      timeLeft: 'Unlimited',
      action: null,
      actionPrimary: false,
    };
  }
  if (sub.tier === 'inactive') {
    return {
      label: 'No active access',
      detail: 'Choose a plan to start running examinations.',
      tone: 'warning',
      daysRemaining: null,
      validUntil: '—',
      timeLeft: '—',
      action: 'Choose a plan',
      actionPrimary: true,
    };
  }
  if (expired) {
    return {
      label: 'Expired',
      detail: 'Renew to continue running examinations.',
      tone: 'danger',
      daysRemaining: null,
      validUntil,
      timeLeft: '—',
      action: 'Renew access',
      actionPrimary: true,
    };
  }
  if (sub.tier === 'trial') {
    return {
      label: 'Trial',
      detail: 'Upgrade before the trial ends to avoid interruption.',
      tone: expiringSoon ? 'warning' : 'positive',
      daysRemaining: days,
      validUntil,
      timeLeft,
      action: 'Upgrade',
      actionPrimary: true,
    };
  }
  return {
    label: 'Active',
    detail: expiringSoon
      ? 'Your access ends soon. You can renew from the plans below.'
      : 'Full examination access for this center.',
    tone: expiringSoon ? 'warning' : 'positive',
    daysRemaining: days,
    validUntil,
    timeLeft,
    action: 'Change plan',
    actionPrimary: false,
  };
}

// ─────────────────────────────────────────────────────────────
// Bootstrap (unchanged)
// ─────────────────────────────────────────────────────────────

async function bootstrapBillingData(): Promise<BootstrapData> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { user: null, examCenter: null, subscription: null, payments: [] };
  }

  const sessionUser: SessionUser = {
    id: user.id,
    name: (user.user_metadata?.name as string) || user.email?.split('@')[0] || 'User',
    email: user.email || '',
  };

  const { data: ec } = await supabase
    .from('exam_centers')
    .select('id, name, code, subscription_tier, subscription_expires_at')
    .eq('owner_id', user.id)
    .eq('is_active', true)
    .eq('is_deleted', false)
    .maybeSingle();

  if (!ec) {
    return {
      user: sessionUser,
      examCenter: null,
      subscription: {
        tier: 'inactive',
        planName: 'No Active Access',
        expiresAt: null,
        isActive: false,
      },
      payments: [],
    };
  }

  const examCenter: ExamCenterInfo = { id: ec.id, name: ec.name, code: ec.code };

  const { data: paymentsRaw } = await supabase
    .from('payments')
    .select('id, plan_name, amount, status, created_at, end_date')
    .eq('exam_center_id', ec.id)
    .order('created_at', { ascending: false });

  const payments: Payment[] = ((paymentsRaw ?? []) as unknown as PaymentRow[]).map(mapPayment);

  const tier = (ec.subscription_tier as string) || 'inactive';
  const expiresAt = ec.subscription_expires_at as string | null;
  const isExpired = expiresAt ? new Date(expiresAt) < new Date() : false;
  const isActive = tier !== 'inactive' && !isExpired;

  const lastPaid = payments.find((p) => p.status === 'paid');
  const planName =
    lastPaid?.planName ||
    (tier === 'trial'
      ? 'Trial Access'
      : tier === 'inactive'
        ? 'No Active Access'
        : 'Premium Access');

  return {
    user: sessionUser,
    examCenter,
    subscription: { tier, planName, expiresAt, isActive },
    payments,
  };
}

// ─────────────────────────────────────────────────────────────
// Design tokens
// ─────────────────────────────────────────────────────────────

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-emerald-400 dark:focus-visible:ring-offset-neutral-950';

const PRIMARY_BUTTON =
  'bg-emerald-700 text-white hover:bg-emerald-800 disabled:bg-emerald-700/50 disabled:text-white/70 dark:bg-emerald-500 dark:text-emerald-950 dark:hover:bg-emerald-400 dark:disabled:bg-emerald-500/40';

const DOT_TONES: Record<Tone, string> = {
  positive: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-red-500',
  neutral: 'bg-neutral-400',
};

// Chip tones for the status indicator.
const CHIP_TONES: Record<Tone, string> = {
  positive:
    'border-emerald-700/25 bg-emerald-500/[0.08] text-emerald-900 dark:border-emerald-400/25 dark:bg-emerald-500/[0.10] dark:text-emerald-100',
  warning:
    'border-amber-700/25 bg-amber-500/[0.08] text-amber-900 dark:border-amber-400/25 dark:bg-amber-500/[0.10] dark:text-amber-100',
  danger:
    'border-red-700/25 bg-red-500/[0.06] text-red-900 dark:border-red-400/25 dark:bg-red-500/[0.10] dark:text-red-100',
  neutral:
    'border-neutral-300 bg-neutral-100 text-neutral-700 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300',
};

const SECTION_EYEBROW =
  'font-mono text-[11px] uppercase tracking-[0.18em] text-neutral-500 dark:text-neutral-400';

const SECTION_RULE = 'border-t border-neutral-200 dark:border-neutral-800';

// ─────────────────────────────────────────────────────────────
// Small atoms
// ─────────────────────────────────────────────────────────────

function StatusDot({ tone }: { tone: Tone }) {
  return (
    <span
      aria-hidden
      className={cn('inline-block h-1.5 w-1.5 rounded-full', DOT_TONES[tone])}
    />
  );
}

const BANNER_STYLES: Record<BannerTone, { box: string; icon: React.ElementType }> = {
  success: {
    box: 'border-emerald-700/25 bg-emerald-500/[0.06] text-emerald-900 dark:text-emerald-100',
    icon: CheckCircle2,
  },
  error: {
    box: 'border-red-700/25 bg-red-500/[0.05] text-red-900 dark:text-red-100',
    icon: AlertCircle,
  },
  info: {
    box: 'border-neutral-300 bg-transparent text-neutral-700 dark:border-neutral-700 dark:text-neutral-300',
    icon: Info,
  },
};

function Banner({
  tone,
  children,
  onDismiss,
  actionLabel,
  onAction,
  className,
}: {
  tone: BannerTone;
  children: React.ReactNode;
  onDismiss?: () => void;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}) {
  const { box, icon: Icon } = BANNER_STYLES[tone];
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-3 rounded-md border-y-0 border-r-0 border-l-2 px-4 py-3 text-sm',
        box,
        className,
      )}
    >
      <Icon
        aria-hidden
        className="mt-0.5 h-4 w-4 shrink-0"
      />
      <div className="min-w-0 flex-1 break-words">{children}</div>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className={cn('shrink-0 rounded font-medium underline underline-offset-2', FOCUS_RING)}
        >
          {actionLabel}
        </button>
      )}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss message"
          className={cn('shrink-0 rounded p-0.5 opacity-60 hover:opacity-100', FOCUS_RING)}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Loaders
// ─────────────────────────────────────────────────────────────

function BillingSkeleton() {
  return (
    <div
      className="mx-auto w-full max-w-5xl px-6 py-16 sm:px-10 sm:py-24"
      role="status"
      aria-live="polite"
    >
      <span className="sr-only">Loading billing…</span>
      <div
        className="animate-pulse space-y-16 motion-reduce:animate-none"
        aria-hidden
      >
        <div className="space-y-3">
          <div className="h-3 w-24 rounded bg-neutral-200 dark:bg-neutral-800" />
          <div className="h-9 w-72 rounded-md bg-neutral-200 dark:bg-neutral-800" />
        </div>
        <div className="h-40 rounded-md bg-neutral-200 dark:bg-neutral-900" />
        <div className="space-y-4">
          <div className="h-3 w-28 rounded bg-neutral-200 dark:bg-neutral-800" />
          <div className="h-28 rounded-md bg-neutral-200 dark:bg-neutral-900" />
          <div className="h-28 rounded-md bg-neutral-200 dark:bg-neutral-900" />
        </div>
      </div>
    </div>
  );
}

function FullPageLoader() {
  return (
    <div className="min-h-screen bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <BillingSkeleton />
    </div>
  );
}

function FullPageError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white p-6 dark:bg-neutral-950">
      <div
        role="alert"
        className="max-w-md text-center"
      >
        <AlertCircle
          aria-hidden
          className="mx-auto mb-4 h-7 w-7 text-red-500"
        />
        <h1 className="text-xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
          We couldn't load billing
        </h1>
        <p className="mt-2 text-sm break-words text-neutral-600 dark:text-neutral-400">{message}</p>
        <Button
          onClick={onRetry}
          variant="outline"
          className="mt-6"
        >
          <RefreshCw
            aria-hidden
            className="mr-2 h-4 w-4"
          />
          Try again
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Page header
// ─────────────────────────────────────────────────────────────

function PageHeader({
  examCenter,
  refreshing,
  onRefresh,
}: {
  examCenter: ExamCenterInfo | null;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <header className="flex items-start justify-between gap-6 border-b border-neutral-200 pb-6 dark:border-neutral-800">
      <div className="min-w-0">
        <p className={SECTION_EYEBROW}>Account · Billing</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Billing</h1>
        <p className="mt-2 max-w-xl text-sm text-neutral-600 dark:text-neutral-400">
          {examCenter ? (
            <>
              Subscription and payment records for{' '}
              <span className="font-medium text-neutral-900 dark:text-neutral-100">
                {examCenter.name}
              </span>
              {examCenter.code && (
                <span className="ml-2 font-mono text-xs text-neutral-500">{examCenter.code}</span>
              )}
            </>
          ) : (
            'No active exam center is linked to this account.'
          )}
        </p>
      </div>
      <button
        type="button"
        onClick={onRefresh}
        disabled={refreshing}
        aria-label={refreshing ? 'Refreshing billing data' : 'Refresh billing data'}
        className={cn(
          'mt-1 inline-flex shrink-0 items-center gap-2 rounded text-xs font-medium text-neutral-500 transition-colors hover:text-neutral-900 disabled:opacity-50 dark:hover:text-neutral-100',
          FOCUS_RING,
        )}
      >
        <RefreshCw
          aria-hidden
          className={cn('h-3.5 w-3.5', refreshing && 'animate-spin motion-reduce:animate-none')}
        />
        <span className="hidden sm:inline">{refreshing ? 'Refreshing…' : 'Refresh'}</span>
      </button>
    </header>
  );
}

// ─────────────────────────────────────────────────────────────
// Access overview — strengthened hierarchy
// ─────────────────────────────────────────────────────────────

function AccessOverview({
  subscription,
  user,
  onChoosePlan,
  onViewHistory,
}: {
  subscription: SubscriptionInfo;
  user: SessionUser | null;
  onChoosePlan: () => void;
  onViewHistory: () => void;
}) {
  const access = getAccessState(subscription);

  return (
    <section
      aria-labelledby="access-heading"
      className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_280px]"
    >
      <div className="min-w-0">
        <p
          id="access-heading"
          className={SECTION_EYEBROW}
        >
          Current access
        </p>

        {/* Status chip — the answer to "is this account active?" promoted to primary position. */}
        <div className="mt-4">
          <span
            className={cn(
              'inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-medium tracking-wider uppercase',
              CHIP_TONES[access.tone],
            )}
          >
            <StatusDot tone={access.tone} />
            {access.label}
          </span>
        </div>

        <p className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
          {subscription.planName}
        </p>
        <p className="mt-3 max-w-lg text-sm text-neutral-600 dark:text-neutral-400">
          {access.detail}
        </p>

        <div className="mt-7 flex flex-wrap items-center gap-x-3 gap-y-2">
          {access.action && (
            <button
              type="button"
              onClick={onChoosePlan}
              className={cn(
                'inline-flex items-center gap-1.5 rounded text-sm font-medium text-emerald-700 underline-offset-4 hover:underline dark:text-emerald-400',
                FOCUS_RING,
              )}
            >
              {access.action}
              <ArrowRight
                aria-hidden
                className="h-3.5 w-3.5"
              />
            </button>
          )}
          <span
            aria-hidden
            className="text-neutral-300 dark:text-neutral-700"
          >
            ·
          </span>
          <button
            type="button"
            onClick={onViewHistory}
            className={cn(
              'rounded text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100',
              FOCUS_RING,
            )}
          >
            Payment history
          </button>
        </div>
      </div>

      {/*
        Facts column.
        Expiry is the primary question once access is active, so it leads.
        Account owner is context, so it recedes.
      */}
      <dl className="space-y-5 self-start border-t border-neutral-200 pt-6 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8 dark:border-neutral-800">
        <div>
          <dt className="text-[11px] tracking-[0.16em] text-neutral-500 uppercase">Valid until</dt>
          <dd className="mt-1 text-base font-semibold tabular-nums">{access.validUntil}</dd>
        </div>
        <div>
          <dt className="text-[11px] tracking-[0.16em] text-neutral-500 uppercase">Time left</dt>
          <dd
            className={cn(
              'mt-1 text-base font-semibold tabular-nums',
              access.daysRemaining !== null &&
                access.daysRemaining <= 7 &&
                'text-amber-600 dark:text-amber-400',
            )}
          >
            {access.timeLeft}
          </dd>
        </div>
        {user && (
          <div className="pt-1">
            <dt className="text-[11px] tracking-[0.16em] text-neutral-500 uppercase">
              Account owner
            </dt>
            <dd className="mt-1 truncate text-sm text-neutral-700 dark:text-neutral-300">
              {user.name}
            </dd>
            {user.email && <dd className="truncate text-xs text-neutral-500">{user.email}</dd>}
          </div>
        )}
      </dl>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// Plan row — clearer price and stronger selection signal
// ─────────────────────────────────────────────────────────────

function PlanRow({
  plan,
  selected,
  busy,
  onSelect,
}: {
  plan: Plan;
  selected: boolean;
  busy: boolean;
  onSelect: (id: string) => void;
}) {
  const unavailable = !!plan.disabled;
  const locked = unavailable || busy;

  return (
    <label className={cn('block', locked ? 'cursor-not-allowed' : 'cursor-pointer')}>
      <input
        type="radio"
        name="billing-plan"
        value={plan.id}
        checked={selected}
        disabled={locked}
        onChange={() => onSelect(plan.id)}
        className="peer sr-only"
      />
      <div
        className={cn(
          'group relative grid grid-cols-[20px_minmax(0,1fr)_auto] items-start gap-x-4 gap-y-2 py-5 pr-3 transition-colors motion-reduce:transition-none',
          'peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-600 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-white dark:peer-focus-visible:ring-offset-neutral-950',
          !selected && !locked && 'hover:bg-neutral-50 dark:hover:bg-neutral-900/40',
          selected && 'bg-emerald-500/[0.04] dark:bg-emerald-500/[0.06]',
          unavailable && 'opacity-50',
        )}
      >
        {/* Selection indicator — radio dot, not just a rule. */}
        <span className="row-span-2 mt-1 flex h-4 w-4 items-center justify-center">
          <span
            aria-hidden
            className={cn(
              'flex h-4 w-4 items-center justify-center rounded-full border transition-colors motion-reduce:transition-none',
              selected
                ? 'border-emerald-600 bg-emerald-600 dark:border-emerald-400 dark:bg-emerald-400'
                : 'border-neutral-300 dark:border-neutral-600',
            )}
          >
            {selected && <span className="h-1.5 w-1.5 rounded-full bg-white dark:bg-neutral-950" />}
          </span>
        </span>

        <div className="col-start-2 min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <p className="text-base font-semibold tracking-tight">{plan.title}</p>
            {plan.popular && !unavailable && (
              <span className="rounded-full border border-emerald-700/25 bg-emerald-500/[0.08] px-1.5 py-0.5 font-mono text-[10px] tracking-[0.14em] text-emerald-800 uppercase dark:border-emerald-400/25 dark:bg-emerald-500/[0.12] dark:text-emerald-200">
                Recommended
              </span>
            )}
            {unavailable && (
              <span className="font-mono text-[10px] tracking-[0.16em] text-neutral-500 uppercase">
                Coming soon
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{plan.description}</p>

          {plan.highlight && !unavailable && (
            <p className="mt-2 text-xs text-neutral-700 dark:text-neutral-300">
              <span className="font-medium">{plan.highlight}</span>
              {plan.highlightDetail && (
                <span className="text-neutral-500"> {plan.highlightDetail}</span>
              )}
            </p>
          )}

          {!unavailable && plan.features.length > 0 && (
            <ul className="mt-3 grid gap-x-8 gap-y-1.5 sm:grid-cols-2">
              {plan.features.map((feature) => (
                <li
                  key={feature}
                  className="flex items-start gap-2 text-xs text-neutral-600 dark:text-neutral-400"
                >
                  <Check
                    aria-hidden
                    className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600 dark:text-emerald-400"
                  />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Price — larger and top-aligned with the plan title for comparison. */}
        <div className="col-start-3 row-span-2 text-right">
          <p className="font-mono text-2xl leading-none font-semibold tracking-tight tabular-nums">
            {plan.price}
          </p>
          <p className="mt-1 text-[11px] tracking-wider text-neutral-500 uppercase">
            / {plan.period}
          </p>
          {plan.originalPrice && (
            <p className="mt-1.5 text-[11px] text-neutral-500">
              <span className="font-mono line-through">{plan.originalPrice}</span>
              {plan.savings && (
                <span className="ml-1.5 text-emerald-700 dark:text-emerald-400">
                  {plan.savings}
                </span>
              )}
            </p>
          )}
        </div>
      </div>
    </label>
  );
}

// ─────────────────────────────────────────────────────────────
// Promo field (logic unchanged)
// ─────────────────────────────────────────────────────────────

function PromoField({
  applied,
  disabled,
  onApplied,
  onRemove,
}: {
  applied: AppliedPromo | null;
  disabled: boolean;
  onApplied: (promo: AppliedPromo) => void;
  onRemove: () => void;
}) {
  const baseId = useId();
  const inputId = `${baseId}-promo`;
  const helpId = `${baseId}-promo-help`;
  const errorId = `${baseId}-promo-error`;
  const inputRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const apply = useCallback(async () => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;
    setLoading(true);
    setErrorText(null);
    try {
      const supabase = createClient();
      const { data: promo, error: promoErr } = await supabase
        .from('promo_codes')
        .select('id, code, type, duration_days, amount, is_used, expires_at')
        .eq('code', trimmed)
        .maybeSingle();

      if (promoErr) throw new Error(promoErr.message);
      if (!promo) throw new Error('Invalid promo code');
      if (promo.is_used) throw new Error('Promo code already used');
      if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
        throw new Error('Promo code expired');
      }
      if (promo.type !== 'trial') throw new Error('Unsupported promo type');

      onApplied({
        code: promo.code,
        durationDays: promo.duration_days,
        amount: promo.amount,
        expiresAt: promo.expires_at ?? null,
      });
      setOpen(false);
      setCode('');
    } catch (err) {
      error('handleApplyPromo failed', err);
      setErrorText(err instanceof Error ? err.message : 'Could not apply promo code');
    } finally {
      setLoading(false);
    }
  }, [code, onApplied]);

  if (applied) {
    return (
      <div className="flex items-start justify-between gap-3 border-l-2 border-emerald-600 py-2 pl-3 dark:border-emerald-500">
        <div className="min-w-0 text-sm">
          <p className="flex items-center gap-1.5 font-medium">
            <Check
              aria-hidden
              className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
            />
            <span className="font-mono text-xs">{applied.code}</span>
            <span className="font-sans text-xs text-neutral-500">applied</span>
          </p>
          <p className="mt-0.5 text-xs text-neutral-500">
            Trial access for {applied.durationDays} days
            {applied.expiresAt && `, code valid until ${formatDateShort(applied.expiresAt)}`}
          </p>
        </div>
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          className={cn(
            'shrink-0 rounded text-xs font-medium text-neutral-500 underline underline-offset-2 hover:text-neutral-900 disabled:opacity-50 dark:hover:text-neutral-100',
            FOCUS_RING,
          )}
        >
          Remove
          <span className="sr-only"> promo code {applied.code}</span>
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        aria-expanded={false}
        aria-controls={inputId}
        className={cn(
          'rounded text-xs text-neutral-500 underline underline-offset-2 hover:text-neutral-900 disabled:opacity-50 dark:hover:text-neutral-100',
          FOCUS_RING,
        )}
      >
        Have a promo code?
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!loading && code.length >= 3) void apply();
      }}
    >
      <label
        htmlFor={inputId}
        className="text-xs font-medium text-neutral-600 dark:text-neutral-400"
      >
        Promo code
      </label>
      <div className="mt-2 flex gap-2">
        <Input
          id={inputId}
          ref={inputRef}
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase().trim());
            if (errorText) setErrorText(null);
          }}
          placeholder="Enter code"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          disabled={loading || disabled}
          aria-invalid={errorText ? true : undefined}
          aria-describedby={errorText ? errorId : helpId}
          className="h-9 flex-1 font-mono text-xs tracking-wider"
        />
        <Button
          type="submit"
          variant="outline"
          size="sm"
          className="h-9"
          disabled={loading || disabled || code.length < 3}
        >
          {loading ? (
            <>
              <Loader2
                aria-hidden
                className="mr-1.5 h-3 w-3 animate-spin"
              />
              Checking
            </>
          ) : (
            'Apply'
          )}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-9 px-2"
          disabled={loading}
          onClick={() => {
            setOpen(false);
            setCode('');
            setErrorText(null);
          }}
          aria-label="Close promo code field"
        >
          <X
            aria-hidden
            className="h-3.5 w-3.5"
          />
        </Button>
      </div>
      {errorText ? (
        <p
          id={errorId}
          role="alert"
          className="mt-1.5 text-xs text-red-600 dark:text-red-400"
        >
          {errorText}
        </p>
      ) : (
        <p
          id={helpId}
          className="mt-1.5 text-xs text-neutral-500"
        >
          Trial codes give access at a reduced price.
        </p>
      )}
    </form>
  );
}

// ─────────────────────────────────────────────────────────────
// Plans + checkout
// ─────────────────────────────────────────────────────────────

function SummaryRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-neutral-500">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  );
}

function CyclePlansSection({
  user,
  examCenter,
  onPaymentVerified,
}: {
  user: SessionUser | null;
  examCenter: ExamCenterInfo | null;
  onPaymentVerified: () => void;
}) {
  const [selectedPlanId, setSelectedPlanId] = useState(DEFAULT_PLAN_ID);
  const [appliedPromo, setAppliedPromo] = useState<AppliedPromo | null>(null);
  const [promoKey, setPromoKey] = useState(0);
  const [phase, setPhase] = useState<Phase>('idle');
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const phaseRef = useRef<Phase>('idle');

  const selectedPlan = PLANS.find((p) => p.id === selectedPlanId);
  const busy = phase !== 'idle';

  const updatePhase = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  useEffect(() => {
    ensureRazorpay().catch((err) => warn('razorpay preload failed', err));
  }, []);

  const handleSelect = useCallback((id: string) => {
    setSelectedPlanId(id);
    setAppliedPromo(null);
    setFeedback(null);
  }, []);

  const handleRemovePromo = useCallback(() => {
    setAppliedPromo(null);
    setPromoKey((n) => n + 1);
  }, []);

  const handlePayment = useCallback(async () => {
    if (phaseRef.current !== 'idle') return;
    if (!user) {
      setFeedback({ tone: 'error', text: 'Please sign in to continue.' });
      return;
    }
    if (!selectedPlan || selectedPlan.disabled) return;

    setFeedback(null);
    updatePhase('creating');

    try {
      const res = await fetch('/api/payments/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          planId: selectedPlan.id,
          amount: selectedPlan.amount,
          promoCode: appliedPromo?.code,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? 'Order creation failed');
      }
      const { order, isTrial } = await res.json();

      await ensureRazorpay();
      updatePhase('awaiting');

      openRazorpay(
        {
          key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
          amount: order.amount,
          currency: order.currency,
          name: 'TestForge',
          description: isTrial
            ? `Trial — ${appliedPromo?.code}`
            : `${selectedPlan.title} Subscription`,
          order_id: order.id,
          handler: async (r: RazorpaySuccess) => {
            updatePhase('verifying');
            try {
              const v = await fetch('/api/payments/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  action: 'verify',
                  planId: selectedPlan.id,
                  razorpay_payment_id: r.razorpay_payment_id,
                  razorpay_order_id: r.razorpay_order_id,
                  razorpay_signature: r.razorpay_signature,
                }),
              });
              if (v.ok) {
                setAppliedPromo(null);
                setPromoKey((n) => n + 1);
                onPaymentVerified();
              } else {
                const j = await v.json().catch(() => ({}));
                setFeedback({
                  tone: 'error',
                  text: `${j.error || "We couldn't verify your payment."} If you were charged, refresh this page shortly or contact support.`,
                });
              }
            } catch (err) {
              error('verify failed', err);
              setFeedback({
                tone: 'error',
                text: "We couldn't verify your payment. If you were charged, refresh this page shortly or contact support.",
              });
            } finally {
              updatePhase('idle');
            }
          },
          prefill: { name: user.name || '', email: user.email || '' },
          theme: { color: '#047857' },
        },
        () => {
          if (phaseRef.current === 'awaiting') {
            updatePhase('idle');
            setFeedback({
              tone: 'info',
              text: 'Checkout was closed before the payment completed.',
            });
          }
        },
      );
    } catch (err) {
      error('handlePayment failed', err);
      setFeedback({
        tone: 'error',
        text: err instanceof Error ? err.message : 'Payment failed. Please try again.',
      });
      updatePhase('idle');
    }
  }, [user, selectedPlan, appliedPromo, onPaymentVerified, updatePhase]);

  const total = appliedPromo ? formatCurrency(appliedPromo.amount) : selectedPlan?.price;

  const payLabel: Record<Phase, React.ReactNode> = {
    idle: `Pay ${total ?? ''}`.trim(),
    creating: (
      <>
        <Loader2
          aria-hidden
          className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none"
        />
        Preparing checkout…
      </>
    ),
    awaiting: (
      <>
        <Loader2
          aria-hidden
          className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none"
        />
        Waiting for payment…
      </>
    ),
    verifying: (
      <>
        <Loader2
          aria-hidden
          className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none"
        />
        Verifying payment…
      </>
    ),
  };

  return (
    <section
      id="plans"
      tabIndex={-1}
      aria-labelledby="plans-heading"
      className="scroll-mt-8 focus:outline-none"
    >
      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-16">
        <div className="min-w-0">
          <p
            id="plans-heading"
            className={SECTION_EYEBROW}
          >
            Choose a plan
          </p>
          <p className="mt-3 max-w-lg text-sm text-neutral-600 dark:text-neutral-400">
            {examCenter?.name
              ? `Access plans for ${examCenter.name}${examCenter.code ? ` (${examCenter.code})` : ''}. Change or renew at any time.`
              : 'Access plans for your examination center. Change or renew at any time.'}
          </p>

          {ORDERED_PLANS.length === 0 ? (
            <p className="mt-8 text-sm text-neutral-500">No plans are available right now.</p>
          ) : (
            <fieldset className="mt-6 divide-y divide-neutral-200 border-t border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
              <legend className="sr-only">Select a plan</legend>
              {ORDERED_PLANS.map((plan) => (
                <PlanRow
                  key={plan.id}
                  plan={plan}
                  selected={plan.id === selectedPlanId}
                  busy={busy}
                  onSelect={handleSelect}
                />
              ))}
            </fieldset>
          )}
        </div>

        <aside
          aria-labelledby="summary-heading"
          className="self-start lg:sticky lg:top-8"
        >
          <p
            id="summary-heading"
            className={SECTION_EYEBROW}
          >
            Order summary
          </p>

          {selectedPlan && !selectedPlan.disabled ? (
            <div className="mt-4">
              {/* Plan block */}
              <dl className="space-y-2.5 text-sm">
                <SummaryRow label="Plan">{selectedPlan.title}</SummaryRow>
                <SummaryRow label="Billing">
                  <span className="capitalize">{selectedPlan.period}</span>
                </SummaryRow>
              </dl>

              {/* Discount block — visually distinct so the adjustment is legible. */}
              {appliedPromo && (
                <div className="mt-4 rounded-md border border-emerald-700/20 bg-emerald-500/[0.05] px-3 py-2.5 dark:border-emerald-400/20 dark:bg-emerald-500/[0.08]">
                  <dl className="space-y-1.5 text-sm">
                    <SummaryRow label="Plan price">
                      <span className="font-mono text-neutral-500 line-through">
                        {selectedPlan.price}
                      </span>
                    </SummaryRow>
                    <SummaryRow label="Trial access">
                      <span className="text-emerald-800 dark:text-emerald-300">
                        {appliedPromo.durationDays} days
                      </span>
                    </SummaryRow>
                  </dl>
                </div>
              )}

              {/* Total block — the terminal answer, separated. */}
              <div className="mt-5 border-t border-neutral-200 pt-5 dark:border-neutral-800">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-sm font-medium">Total today</span>
                  <span className="font-mono text-2xl font-semibold tracking-tight tabular-nums">
                    {total}
                  </span>
                </div>
                {appliedPromo && (
                  <p className="mt-1 text-right text-[11px] text-neutral-500">
                    Estimate. Confirmed when checkout opens.
                  </p>
                )}
              </div>

              <div className="mt-5">
                <PromoField
                  key={`${selectedPlan.id}-${promoKey}`}
                  applied={appliedPromo}
                  disabled={busy}
                  onApplied={setAppliedPromo}
                  onRemove={handleRemovePromo}
                />
              </div>

              <div
                aria-live="polite"
                className="mt-4 empty:mt-0 empty:hidden"
              >
                {feedback && (
                  <Banner
                    tone={feedback.tone}
                    onDismiss={() => setFeedback(null)}
                  >
                    {feedback.text}
                  </Banner>
                )}
              </div>

              <Button
                type="button"
                onClick={handlePayment}
                disabled={busy}
                aria-busy={busy}
                className={cn('mt-5 h-11 w-full font-medium', PRIMARY_BUTTON)}
              >
                {payLabel[phase]}
              </Button>

              <p className="mt-3 flex items-start gap-2 text-xs text-neutral-500">
                <Lock
                  aria-hidden
                  className="mt-0.5 h-3 w-3 shrink-0"
                />
                <span>
                  Payments are processed by Razorpay. Access updates once payment is verified.
                </span>
              </p>
            </div>
          ) : (
            <p className="mt-4 text-sm text-neutral-500">
              Select an available plan to see your total.
            </p>
          )}
        </aside>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// Transaction ledger (mobile spacing tightened)
// ─────────────────────────────────────────────────────────────

function CopyReference({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      warn('copy failed', err);
    }
  };

  return (
    <span className="inline-flex items-center">
      <button
        type="button"
        onClick={copy}
        title={value}
        aria-label={`Copy payment reference ${value}`}
        className={cn(
          'inline-flex items-center gap-1.5 rounded font-mono text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100',
          FOCUS_RING,
        )}
      >
        {shortReference(value)}
        {copied ? (
          <Check
            aria-hidden
            className="h-3 w-3 text-emerald-600 dark:text-emerald-400"
          />
        ) : (
          <Copy
            aria-hidden
            className="h-3 w-3"
          />
        )}
      </button>
      <span
        role="status"
        className="sr-only"
      >
        {copied ? 'Reference copied' : ''}
      </span>
    </span>
  );
}

function PaymentStatus({ status }: { status: string }) {
  const paid = status === 'paid';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs font-medium',
        paid ? 'text-emerald-700 dark:text-emerald-400' : 'text-neutral-500',
      )}
    >
      {paid && (
        <Check
          aria-hidden
          className="h-3 w-3"
        />
      )}
      <span className="capitalize">{status}</span>
    </span>
  );
}

function TransactionLedger({ payments }: { payments: Payment[] }) {
  const paid = useMemo(() => payments.filter((p) => p.status === 'paid'), [payments]);

  if (paid.length === 0) {
    return (
      <p className="border-t border-neutral-200 py-8 text-sm text-neutral-500 dark:border-neutral-800">
        No payments yet. Completed payments for this center will appear here.
      </p>
    );
  }

  return (
    <>
      {/* Desktop ledger */}
      <table className="hidden w-full text-left text-sm md:table">
        <caption className="sr-only">Completed payments, newest first</caption>
        <thead>
          <tr className="border-y border-neutral-200 dark:border-neutral-800">
            <th
              scope="col"
              className="py-3 pr-4 font-mono text-[11px] font-normal tracking-[0.14em] text-neutral-500 uppercase"
            >
              Date
            </th>
            <th
              scope="col"
              className="py-3 pr-4 font-mono text-[11px] font-normal tracking-[0.14em] text-neutral-500 uppercase"
            >
              Plan
            </th>
            <th
              scope="col"
              className="py-3 pr-4 font-mono text-[11px] font-normal tracking-[0.14em] text-neutral-500 uppercase"
            >
              Reference
            </th>
            <th
              scope="col"
              className="py-3 pr-4 font-mono text-[11px] font-normal tracking-[0.14em] text-neutral-500 uppercase"
            >
              Status
            </th>
            <th
              scope="col"
              className="py-3 text-right font-mono text-[11px] font-normal tracking-[0.14em] text-neutral-500 uppercase"
            >
              Amount
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
          {paid.map((p) => (
            <tr
              key={p.id}
              className="align-top"
            >
              <td className="py-4 pr-4 whitespace-nowrap text-neutral-600 dark:text-neutral-400">
                {formatDateTime(p.createdAt)}
              </td>
              <td className="py-4 pr-4">
                <p className="font-medium">{p.planName}</p>
                {p.endDate && (
                  <p className="mt-0.5 text-xs text-neutral-500">
                    Valid until {formatDateShort(p.endDate)}
                  </p>
                )}
              </td>
              <td className="py-4 pr-4">
                <CopyReference value={p.id} />
              </td>
              <td className="py-4 pr-4">
                <PaymentStatus status={p.status} />
              </td>
              <td className="py-4 text-right font-mono font-medium tabular-nums">
                {formatCurrency(p.amount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Mobile ledger — separated blocks for readability. */}
      <ul className="divide-y divide-neutral-200 border-y border-neutral-200 md:hidden dark:divide-neutral-800 dark:border-neutral-800">
        {paid.map((p) => (
          <li
            key={p.id}
            className="py-4"
          >
            <div className="flex items-baseline justify-between gap-3">
              <p className="min-w-0 truncate text-sm font-medium">{p.planName}</p>
              <p className="shrink-0 font-mono text-sm font-medium tabular-nums">
                {formatCurrency(p.amount)}
              </p>
            </div>
            <div className="mt-1.5 flex items-center justify-between gap-3 text-xs text-neutral-500">
              <span>{formatDateTime(p.createdAt)}</span>
              <PaymentStatus status={p.status} />
            </div>
            {p.endDate && (
              <p className="mt-1 text-xs text-neutral-500">
                Valid until {formatDateShort(p.endDate)}
              </p>
            )}
            <div className="mt-2.5">
              <CopyReference value={p.id} />
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Root
// ─────────────────────────────────────────────────────────────

function BillingPageContent() {
  const [data, setData] = useState<BootstrapData | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState<Feedback | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const boot = await bootstrapBillingData();
        if (cancelled) return;
        setData(boot);
        setBootError(null);
      } catch (err) {
        error('bootstrap failed', err);
        if (!cancelled) {
          setBootError(err instanceof Error ? err.message : 'Failed to load billing');
        }
      } finally {
        if (!cancelled) setRefreshing(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [refreshTrigger]);

  const requestRefresh = useCallback(() => {
    setRefreshing(true);
    setBootError(null);
    setRefreshTrigger((n) => n + 1);
  }, []);

  const handlePaymentVerified = useCallback(() => {
    setNotice({
      tone: 'success',
      text: 'Payment verified. Your access details are refreshing below.',
    });
    requestRefresh();
    window.scrollTo({ top: 0 });
  }, [requestRefresh]);

  if (bootError && !data) {
    return (
      <FullPageError
        message={bootError}
        onRetry={requestRefresh}
      />
    );
  }

  if (!data) {
    return <FullPageLoader />;
  }

  const signedIn = data.user !== null && data.subscription !== null;

  return (
    <div className="min-h-screen bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <div className="mx-auto w-full max-w-5xl px-6 py-12 sm:px-10 sm:py-16">
        <PageHeader
          examCenter={data.examCenter}
          refreshing={refreshing}
          onRefresh={requestRefresh}
        />

        <div className="mt-6 space-y-3 empty:hidden">
          {notice && (
            <Banner
              tone={notice.tone}
              onDismiss={() => setNotice(null)}
            >
              {notice.text}
            </Banner>
          )}
          {bootError && (
            <Banner
              tone="error"
              actionLabel="Retry"
              onAction={requestRefresh}
            >
              Couldn't refresh billing data. {bootError}
            </Banner>
          )}
        </div>

        {signedIn && data.subscription ? (
          <div className="mt-12 space-y-16 sm:mt-14 sm:space-y-20">
            <AccessOverview
              subscription={data.subscription}
              user={data.user}
              onChoosePlan={() => scrollToId('plans')}
              onViewHistory={() => scrollToId('history')}
            />

            <div
              className={SECTION_RULE}
              aria-hidden
            />

            <CyclePlansSection
              user={data.user}
              examCenter={data.examCenter}
              onPaymentVerified={handlePaymentVerified}
            />

            <div
              className={SECTION_RULE}
              aria-hidden
            />

            <section
              id="history"
              tabIndex={-1}
              aria-labelledby="history-heading"
              className="scroll-mt-8 focus:outline-none"
            >
              <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
                <div>
                  <p
                    id="history-heading"
                    className={SECTION_EYEBROW}
                  >
                    Payment history
                  </p>
                  <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-400">
                    Completed payments for this center, newest first.
                  </p>
                </div>
                {data.payments.some((p) => p.status === 'paid') && (
                  <span className="font-mono text-[11px] tracking-[0.14em] text-neutral-500 uppercase">
                    {data.payments.filter((p) => p.status === 'paid').length} completed
                  </span>
                )}
              </div>
              <div className="mt-6">
                <TransactionLedger payments={data.payments} />
              </div>
            </section>
          </div>
        ) : (
          <div className="mt-16 border-t border-neutral-200 pt-10 dark:border-neutral-800">
            <p className="text-sm font-medium">You're not signed in</p>
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
              Sign in to view your billing and manage access.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function BillingPage() {
  return (
    <Suspense fallback={<FullPageLoader />}>
      <BillingPageContent />
    </Suspense>
  );
}
