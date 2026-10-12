// app/(authenticated)/onboarding/page.tsx
'use client';

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useRouter, useSearchParams } from 'next/navigation';

import instituteMap from '@/config/institute_map.json';
import pricingPlans from '@/config/pricing.json';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertCircle,
  ArrowRight,
  Calendar,
  Check,
  CheckCircle2,
  FileText,
  LayoutDashboard,
  Loader2,
  LogOut,
  RefreshCw,
  Rocket,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { HashLoader } from 'react-spinners';

import { logger } from '@/lib/misc/logger';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';

// ─────────────────────────────────────────────────────────────
// Debug logger — always prints to console
// ─────────────────────────────────────────────────────────────

const DEBUG = true;
const LOG_PREFIX = '[onboarding]';

function log(...args: unknown[]) {
  if (DEBUG) console.log(LOG_PREFIX, ...args);
}
function warn(...args: unknown[]) {
  console.warn(LOG_PREFIX, ...args);
}
function error(...args: unknown[]) {
  console.error(LOG_PREFIX, ...args);
}

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface Plan {
  id: string;
  title: string;
  description: string;
  price: string;
  period: string;
  amount: number;
  features: string[];
  popular?: boolean;
  offer?: boolean;
  originalPrice?: string;
}

type StepId = 'loading' | 'error' | 'exam_center' | 'subscription' | 'review' | 'complete';

interface ExamCenterForm {
  id: string;
  code: string;
  name: string;
  address: string;
  officerIncharge: string;
  sealingSupervisor: string;
  examController: string;
  distCenterCode: string;
  distCenterName: string;
  season: 'Summer' | 'Winter';
  examYear: number;
}

interface LastPaymentInfo {
  id: string;
  status: 'pending' | 'paid' | 'failed' | 'refunded' | string;
  planName: string;
  planId: string;
  amount: number;
  endDate: string | null;
  createdAt: string;
}

interface BootstrapResult {
  userId: string;
  userEmail: string;
  userName: string;
  examCenter: ExamCenterForm | null;
  lastPayment: LastPaymentInfo | null;
  hasActiveSubscription: boolean;
  initialStep: Exclude<StepId, 'loading' | 'error'>;
}

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const ONBOARDING_COOKIE = 'onboarding_complete';
const ONBOARDING_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

const BOOTSTRAP_TIMEOUT_MS = 12_000; // watchdog: 12s

const STORAGE_KEYS = {
  SELECTED_PLAN: 'onboarding_selected_plan',
} as const;

const EC_DEFAULTS: ExamCenterForm = {
  id: '',
  code: '',
  name: '',
  address: '',
  officerIncharge: '',
  sealingSupervisor: '',
  examController: '',
  distCenterCode: '',
  distCenterName: '',
  season: 'Summer',
  examYear: new Date().getFullYear(),
};

const YEARS = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() + i);

const STEPS: { id: Exclude<StepId, 'loading' | 'error'>; label: string }[] = [
  { id: 'exam_center', label: 'Exam center' },
  { id: 'subscription', label: 'Subscription' },
  { id: 'review', label: 'Review & pay' },
  { id: 'complete', label: 'Complete' },
];

const STEP_INDEX: Record<Exclude<StepId, 'loading' | 'error'>, number> = {
  exam_center: 0,
  subscription: 1,
  review: 2,
  complete: 3,
};

const STEP_ORDER: Exclude<StepId, 'loading' | 'error'>[] = [
  'exam_center',
  'subscription',
  'review',
  'complete',
];

// ─────────────────────────────────────────────────────────────
// Storage / cookie helpers
// ─────────────────────────────────────────────────────────────

function readStorage<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const v = window.localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: unknown) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

function setOnboardingComplete() {
  const secure = process.env.NODE_ENV === 'production' ? ' Secure;' : '';
  document.cookie = `${ONBOARDING_COOKIE}=true; path=/; max-age=${ONBOARDING_COOKIE_MAX_AGE}; SameSite=Lax;${secure}`;
}

// ─────────────────────────────────────────────────────────────
// Institute lookup
// ─────────────────────────────────────────────────────────────

function getInstituteInfo(instituteCode: string) {
  if (!instituteCode) return { success: false as const, error: 'Code required', data: null };
  const code = instituteCode.trim().toUpperCase();
  const map = instituteMap as Record<string, string>;
  const padded = code.padStart(4, '0');
  const unpadded = code.replace(/^0+/, '');
  const name = map[code] || map[padded] || (unpadded ? map[unpadded] : undefined);
  if (!name) return { success: false as const, error: `Institute ${code} not found`, data: null };
  return { success: true as const, data: { CODE: code, NAME: name.trim() }, error: null };
}

// ─────────────────────────────────────────────────────────────
// Razorpay loader
// ─────────────────────────────────────────────────────────────

declare global {
  interface Window {
    Razorpay: any;
  }
}

let razorpayLoadPromise: Promise<void> | null = null;
let razorpayLoaded = false;

async function ensureRazorpay(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (window.Razorpay || razorpayLoaded) {
    razorpayLoaded = true;
    log('Razorpay already loaded');
    return;
  }
  if (razorpayLoadPromise) {
    log('Razorpay load already in-flight, awaiting');
    return razorpayLoadPromise;
  }

  log('Loading Razorpay SDK…');
  razorpayLoadPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(
      'script[src="https://checkout.razorpay.com/v1/checkout.js"]',
    );

    const onLoaded = () => {
      if (window.Razorpay) {
        razorpayLoaded = true;
        razorpayLoadPromise = null;
        log('Razorpay loaded');
        resolve();
      } else {
        razorpayLoadPromise = null;
        error('Razorpay script loaded but SDK unavailable');
        reject(new Error('Razorpay script loaded but SDK unavailable'));
      }
    };

    if (existing) {
      if (window.Razorpay) {
        onLoaded();
        return;
      }
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
  if (!window.Razorpay) {
    throw new Error('Razorpay SDK not available');
  }
  const rzp = new window.Razorpay({ ...options, modal: { ondismiss: onDismiss } });
  rzp.open();
}

// ─────────────────────────────────────────────────────────────
// Bootstrap with step-by-step logging
// ─────────────────────────────────────────────────────────────

async function bootstrapOnboarding(): Promise<BootstrapResult | 'unauthenticated'> {
  log('bootstrap: start');

  log('bootstrap: creating supabase client');
  let supabase;
  try {
    supabase = createClient();
    log('bootstrap: supabase client created', {
      hasAuth: !!supabase?.auth,
      hasFrom: typeof supabase?.from === 'function',
    });
  } catch (err) {
    error('bootstrap: createClient() threw', err);
    throw new Error(
      `Supabase client init failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  log('bootstrap: getUser()…');
  const userRes = await supabase.auth.getUser();
  log('bootstrap: getUser() returned', {
    hasUser: !!userRes?.data?.user,
    userId: userRes?.data?.user?.id ?? null,
    error: userRes?.error ? { name: userRes.error.name, message: userRes.error.message } : null,
  });

  const {
    data: { user },
    error: userErr,
  } = userRes;

  if (userErr && userErr.name !== 'AuthSessionMissingError') {
    throw new Error(`Auth error: ${userErr.message}`);
  }

  if (!user) {
    log('bootstrap: no user → unauthenticated');
    return 'unauthenticated';
  }

  const userName = (user.user_metadata?.name as string) || user.email?.split('@')[0] || 'User';
  const userEmail = user.email || '';
  log('bootstrap: user resolved', { userId: user.id, userName, userEmail });

  log('bootstrap: querying exam_centers…');
  const ecRes = await supabase
    .from('exam_centers')
    .select('*')
    .eq('owner_id', user.id)
    .eq('is_deleted', false)
    .maybeSingle();

  log('bootstrap: exam_centers response', {
    hasData: !!ecRes.data,
    error: ecRes.error
      ? { code: ecRes.error.code, message: ecRes.error.message, details: ecRes.error.details }
      : null,
  });

  if (ecRes.error) {
    throw new Error(`Failed to load exam center: ${ecRes.error.message}`);
  }

  let examCenter: ExamCenterForm | null = null;
  if (ecRes.data) {
    const ec = ecRes.data;
    examCenter = {
      id: ec.id,
      code: ec.code || '',
      name: ec.name || '',
      address: ec.address || '',
      officerIncharge: ec.officer_incharge || '',
      sealingSupervisor: ec.sealing_supervisor || '',
      examController: ec.exam_controller || '',
      distCenterCode: ec.dist_center_code || '',
      distCenterName: ec.dist_center_name || '',
      season: (ec.season as 'Summer' | 'Winter') || 'Summer',
      examYear: ec.exam_year || new Date().getFullYear(),
    };
    log('bootstrap: exam center mapped', { id: examCenter.id, code: examCenter.code });
  } else {
    log('bootstrap: no exam center yet');
  }

  let lastPayment: LastPaymentInfo | null = null;
  let hasActiveSubscription = false;

  if (examCenter?.id) {
    log('bootstrap: querying payments…');
    const payRes = await supabase
      .from('payments')
      .select('id, status, plan_id, plan_name, amount, end_date, created_at')
      .eq('exam_center_id', examCenter.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    log('bootstrap: payments response', {
      hasData: !!payRes.data,
      error: payRes.error ? { code: payRes.error.code, message: payRes.error.message } : null,
    });

    if (payRes.error) {
      warn('bootstrap: payments query failed (non-fatal)', payRes.error.message);
    } else if (payRes.data) {
      const p = payRes.data;
      lastPayment = {
        id: p.id,
        status: p.status,
        planId: p.plan_id,
        planName: p.plan_name,
        amount: p.amount,
        endDate: p.end_date,
        createdAt: p.created_at,
      };

      if (p.status === 'paid' && p.end_date) {
        hasActiveSubscription = new Date(p.end_date) > new Date();
      }
      log('bootstrap: lastPayment', {
        status: p.status,
        endDate: p.end_date,
        hasActiveSubscription,
      });
    } else {
      log('bootstrap: no payments yet');
    }
  }

  let initialStep: BootstrapResult['initialStep'];
  if (hasActiveSubscription) {
    initialStep = 'complete';
  } else if (!examCenter || !examCenter.id) {
    initialStep = 'exam_center';
  } else if (!examCenter.code || !examCenter.name || !examCenter.season || !examCenter.examYear) {
    initialStep = 'exam_center';
  } else {
    initialStep = 'subscription';
  }

  log('bootstrap: complete → initialStep =', initialStep);

  return {
    userId: user.id,
    userEmail,
    userName,
    examCenter,
    lastPayment,
    hasActiveSubscription,
    initialStep,
  };
}

// ─────────────────────────────────────────────────────────────
// Shared UI atoms
// ─────────────────────────────────────────────────────────────

function SidebarProgress({ currentStep }: { currentStep: StepId }) {
  if (currentStep === 'loading' || currentStep === 'error') return null;
  const current = STEP_INDEX[currentStep];

  return (
    <nav aria-label="Onboarding progress">
      <ul className="space-y-1">
        {STEPS.map(({ id, label }, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li
              key={id}
              className="flex items-center gap-3 py-1.5"
            >
              <div
                className={cn(
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-colors',
                  done
                    ? 'bg-emerald-500'
                    : active
                      ? 'border-2 border-emerald-500 bg-transparent'
                      : 'border border-neutral-300 bg-transparent dark:border-neutral-700',
                )}
                aria-hidden
              >
                {done ? (
                  <Check
                    className="h-3 w-3 text-white"
                    strokeWidth={2.5}
                  />
                ) : active ? (
                  <div className="h-2 w-2 rounded-full bg-emerald-500" />
                ) : null}
              </div>
              <span
                className={cn(
                  'text-sm transition-colors',
                  done
                    ? 'text-neutral-500 dark:text-neutral-400'
                    : active
                      ? 'font-medium text-neutral-900 dark:text-neutral-100'
                      : 'text-neutral-400 dark:text-neutral-600',
                )}
              >
                {label}
              </span>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function OnboardingShell({
  currentStep,
  centerName,
  children,
}: {
  currentStep: StepId;
  centerName?: string;
  children: React.ReactNode;
}) {
  const handleSignOut = async () => {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch (err) {
      error('signOut failed', err);
    } finally {
      window.location.href = '/login';
    }
  };

  return (
    <div className="flex min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <aside className="sticky top-0 hidden h-screen w-80 shrink-0 flex-col border-r border-neutral-200 bg-white px-8 py-10 lg:flex dark:border-neutral-800 dark:bg-neutral-950">
        <div className="mb-10">
          <div className="mb-1 flex items-center gap-2.5">
            <ShieldCheck
              className="h-5 w-5 text-emerald-500"
              aria-hidden
            />
            <span className="font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
              TestForge
            </span>
          </div>
          <p className="pl-7 text-xs text-neutral-400 dark:text-neutral-500">
            Examination Management Platform
          </p>
        </div>

        <div className="mb-10">
          <p className="mb-4 text-xs font-medium tracking-wider text-neutral-400 uppercase dark:text-neutral-500">
            Setup progress
          </p>
          <SidebarProgress currentStep={currentStep} />
        </div>

        {centerName && (
          <div className="mb-auto">
            <p className="mb-2 text-xs font-medium tracking-wider text-neutral-400 uppercase dark:text-neutral-500">
              Current setup
            </p>
            <p className="truncate text-sm font-medium text-neutral-700 dark:text-neutral-300">
              {centerName}
            </p>
          </div>
        )}

        <div className="space-y-4 border-t border-neutral-100 pt-8 dark:border-neutral-800">
          <div>
            <p className="mb-1 text-xs font-medium tracking-wider text-neutral-400 uppercase dark:text-neutral-500">
              Need help?
            </p>
            <a
              href={`mailto:support@${process.env.NEXT_PUBLIC_HOSTED_URL || 'testforge.tech'}`}
              className="text-sm text-neutral-500 transition-colors hover:text-emerald-500"
            >
              support@{process.env.NEXT_PUBLIC_HOSTED_URL || 'testforge.tech'}
            </a>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleSignOut}
            className="w-full justify-start px-0 font-normal text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
          >
            <LogOut
              className="mr-2 h-4 w-4"
              aria-hidden
            />
            Log out
          </Button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <div className="flex items-center justify-between border-b border-neutral-200 bg-white px-6 py-4 lg:hidden dark:border-neutral-800 dark:bg-neutral-950">
          <div className="flex items-center gap-2">
            <ShieldCheck
              className="h-4 w-4 text-emerald-500"
              aria-hidden
            />
            <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              TestForge
            </span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleSignOut}
            className="px-2 text-neutral-400"
          >
            <LogOut
              className="h-4 w-4"
              aria-hidden
            />
            <span className="sr-only">Log out</span>
          </Button>
        </div>

        <div className="mx-auto max-w-3xl px-6 py-12 lg:py-16">{children}</div>
      </main>
    </div>
  );
}

function StepHeader({
  label,
  title,
  description,
}: {
  label?: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="mb-10">
      {label && (
        <p className="mb-2 text-xs font-medium tracking-widest text-neutral-400 uppercase dark:text-neutral-500">
          {label}
        </p>
      )}
      <h1 className="mb-3 text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
        {title}
      </h1>
      {description && (
        <p className="max-w-lg text-[15px] leading-relaxed text-neutral-500 dark:text-neutral-400">
          {description}
        </p>
      )}
    </div>
  );
}

function FormField({
  label,
  hint,
  required,
  error: fieldError,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[13px] text-neutral-600 dark:text-neutral-400">
        {label}
        {required && (
          <span
            className="ml-0.5 text-rose-400"
            aria-hidden
          >
            *
          </span>
        )}
      </label>
      {children}
      {fieldError ? (
        <p className="text-xs text-rose-600 dark:text-rose-400">{fieldError}</p>
      ) : hint ? (
        <p className="text-xs text-neutral-400 dark:text-neutral-500">{hint}</p>
      ) : null}
    </div>
  );
}

function ActionBar({
  onBack,
  submitLabel = 'Continue',
  loading,
  disabled,
  note,
}: {
  onBack?: () => void;
  submitLabel?: string;
  loading?: boolean;
  disabled?: boolean;
  note?: string;
}) {
  return (
    <div className="mt-10 flex items-center gap-4 border-t border-neutral-100 pt-8 dark:border-neutral-800">
      {onBack && (
        <Button
          type="button"
          variant="ghost"
          onClick={onBack}
          className="font-normal text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
        >
          Back
        </Button>
      )}
      <Button
        type="submit"
        disabled={disabled || loading}
        className="h-11 bg-emerald-600 px-8 font-medium text-white hover:bg-emerald-700"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <>
            {submitLabel}
            <ArrowRight className="ml-2 h-4 w-4" />
          </>
        )}
      </Button>
      {note && <p className="ml-auto text-xs text-neutral-400 dark:text-neutral-500">{note}</p>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Loading / Error screens
// ─────────────────────────────────────────────────────────────

function FullPageLoader({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-neutral-50 dark:bg-neutral-950">
      <HashLoader
        size={60}
        color="#059669"
      />
      <p className="text-xs text-neutral-400">{label}</p>
    </div>
  );
}

function FullPageError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 p-6 dark:bg-neutral-950">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
          <AlertCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
        </div>
        <h2 className="mb-2 text-xl font-semibold text-neutral-900 dark:text-neutral-100">
          Something went wrong
        </h2>
        <p className="mb-6 text-sm break-words text-neutral-500 dark:text-neutral-400">{message}</p>
        <div className="flex justify-center gap-3">
          <Button
            onClick={onRetry}
            variant="outline"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Try again
          </Button>
          <Button
            onClick={() => (window.location.href = '/login')}
            className="bg-emerald-600 text-white hover:bg-emerald-700"
          >
            Back to login
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Step: Exam Center
// ─────────────────────────────────────────────────────────────

function ExamCenterStep({
  userId,
  prefill,
  onComplete,
  onBack,
  canGoBack,
}: {
  userId: string;
  prefill: ExamCenterForm | null;
  onComplete: (data: ExamCenterForm) => void;
  onBack?: () => void;
  canGoBack?: boolean;
}) {
  const [form, setForm] = useState<ExamCenterForm>(() => ({
    ...EC_DEFAULTS,
    ...(prefill ?? {}),
  }));
  const [instituteLoading, setInstituteLoading] = useState(false);
  const [distInstituteLoading, setDistInstituteLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const set = <K extends keyof ExamCenterForm>(k: K, v: ExamCenterForm[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    const code = form.code?.trim();
    if (!code || code.length < 3) return;
    setInstituteLoading(true);
    const t = setTimeout(() => {
      const result = getInstituteInfo(code.toUpperCase());
      if (result.success && result.data) {
        setForm((p) => ({ ...p, name: result.data!.NAME }));
      }
      setInstituteLoading(false);
    }, 500);
    return () => {
      clearTimeout(t);
      setInstituteLoading(false);
    };
  }, [form.code]);

  useEffect(() => {
    const code = form.distCenterCode?.trim();
    if (!code || code.length < 3) return;
    setDistInstituteLoading(true);
    const t = setTimeout(() => {
      const result = getInstituteInfo(code.toUpperCase());
      if (result.success && result.data) {
        setForm((p) => ({ ...p, distCenterName: result.data!.NAME }));
      }
      setDistInstituteLoading(false);
    }, 500);
    return () => {
      clearTimeout(t);
      setDistInstituteLoading(false);
    };
  }, [form.distCenterCode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!form.code.trim() || !form.name.trim()) {
      setErrorMsg('Center code and name are required');
      return;
    }
    if (!form.season) {
      setErrorMsg('Season is required');
      return;
    }
    if (!form.distCenterCode.trim()) {
      setErrorMsg('Distribution code is required');
      return;
    }

    setSaving(true);
    try {
      const supabase = createClient();

      const payload = {
        owner_id: userId,
        code: form.code.trim(),
        name: form.name.trim(),
        address: form.address.trim() || null,
        officer_incharge: form.officerIncharge.trim() || null,
        sealing_supervisor: form.sealingSupervisor.trim() || null,
        exam_controller: form.examController.trim() || null,
        dist_center_code: form.distCenterCode.trim() || null,
        dist_center_name: form.distCenterName.trim() || null,
        season: form.season,
        exam_year: Number(form.examYear),
        is_active: true,
        is_deleted: false,
      };

      log('ExamCenterStep: saving…', { id: form.id || '(new)', code: payload.code });

      if (form.id) {
        const { data, error: updateErr } = await supabase
          .from('exam_centers')
          .update(payload)
          .eq('id', form.id)
          .select()
          .single();
        if (updateErr) throw updateErr;
        log('ExamCenterStep: update OK', data.id);
        onComplete({ ...form, id: data.id });
      } else {
        const { data, error: insertErr } = await supabase
          .from('exam_centers')
          .insert(payload)
          .select()
          .single();
        if (insertErr) throw insertErr;
        log('ExamCenterStep: insert OK', data.id);
        onComplete({ ...form, id: data.id });
      }
    } catch (err) {
      error('ExamCenterStep: save failed', err);
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save exam center');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
    >
      <StepHeader
        label="Step 1 of 3"
        title="Configure your exam center"
        description="These details appear on all MSBTE-issued documents. Required fields are marked."
      />

      <div className="space-y-8">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="Center code"
            required
          >
            <div className="relative">
              <Input
                value={form.code}
                onChange={(e) => set('code', e.target.value.toUpperCase())}
                placeholder="0018"
                required
                className={cn('h-10', instituteLoading && 'pr-10')}
              />
              {instituteLoading && (
                <Loader2 className="absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 animate-spin text-neutral-400" />
              )}
            </div>
          </FormField>
          <FormField
            label="Center name"
            required
          >
            <Input
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Government Polytechnic, Pune"
              required
              className="h-10"
            />
          </FormField>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="Season"
            required
          >
            <RadioGroup
              value={form.season}
              onValueChange={(v) => set('season', v as 'Summer' | 'Winter')}
              className="mt-2 flex gap-6"
            >
              {(['Summer', 'Winter'] as const).map((s) => (
                <label
                  key={s}
                  className="flex cursor-pointer items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300"
                >
                  <RadioGroupItem value={s} />
                  {s}
                </label>
              ))}
            </RadioGroup>
          </FormField>
          <FormField
            label="Exam year"
            required
          >
            <Select
              value={String(form.examYear)}
              onValueChange={(v) => set('examYear', Number(v))}
            >
              <SelectTrigger className="h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {YEARS.map((y) => (
                  <SelectItem
                    key={y}
                    value={String(y)}
                  >
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="Distribution code"
            required
          >
            <div className="relative">
              <Input
                value={form.distCenterCode}
                onChange={(e) => set('distCenterCode', e.target.value.toUpperCase())}
                placeholder="DC001"
                required
                className={cn('h-10', distInstituteLoading && 'pr-10')}
              />
              {distInstituteLoading && (
                <Loader2 className="absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 animate-spin text-neutral-400" />
              )}
            </div>
          </FormField>
          <FormField label="Distribution center name">
            <Input
              value={form.distCenterName}
              onChange={(e) => set('distCenterName', e.target.value)}
              placeholder="Lead Center Pune"
              className="h-10"
            />
          </FormField>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <FormField label="Officer in-charge">
            <Input
              value={form.officerIncharge}
              onChange={(e) => set('officerIncharge', e.target.value)}
              placeholder="Full name"
              className="h-10"
            />
          </FormField>
          <FormField label="Sealing supervisor">
            <Input
              value={form.sealingSupervisor}
              onChange={(e) => set('sealingSupervisor', e.target.value)}
              placeholder="Full name"
              className="h-10"
            />
          </FormField>
          <FormField label="Exam controller">
            <Input
              value={form.examController}
              onChange={(e) => set('examController', e.target.value)}
              placeholder="Full name"
              className="h-10"
            />
          </FormField>
        </div>

        <FormField label="Address">
          <Input
            value={form.address}
            onChange={(e) => set('address', e.target.value)}
            placeholder="Full postal address"
            className="h-10"
          />
        </FormField>

        {errorMsg && <p className="text-sm text-rose-600 dark:text-rose-400">{errorMsg}</p>}

        <ActionBar
          submitLabel="Save and continue"
          loading={saving}
          onBack={canGoBack ? onBack : undefined}
        />
      </div>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────
// Step: Subscription
// ─────────────────────────────────────────────────────────────

function SubscriptionStep({
  plans,
  selectedId,
  onSelect,
  onContinue,
  onBack,
}: {
  plans: Plan[];
  selectedId: string;
  onSelect: (id: string) => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  const recommended = plans.find((p) => p.popular) ?? plans[0];

  return (
    <div>
      <StepHeader
        label="Step 2 of 3"
        title="Choose a subscription"
        description="All plans include full access to every feature. Pick the cycle that matches your institution."
      />

      <div className="mb-10 space-y-3">
        {plans.map((plan) => {
          const isSelected = plan.id === selectedId;
          const isRecommended = plan.id === recommended?.id;
          return (
            <button
              key={plan.id}
              type="button"
              onClick={() => onSelect(plan.id)}
              aria-pressed={isSelected}
              className={cn(
                'w-full rounded-xl border-2 p-5 text-left transition-all focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:outline-none',
                isSelected
                  ? 'border-emerald-500 bg-white dark:bg-neutral-900'
                  : 'border-neutral-200 bg-white hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700',
              )}
            >
              <div className="flex items-start gap-4">
                <div
                  className={cn(
                    'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                    isSelected
                      ? 'border-emerald-500 bg-emerald-500'
                      : 'border-neutral-300 dark:border-neutral-600',
                  )}
                >
                  {isSelected && (
                    <Check
                      className="h-3 w-3 text-white"
                      strokeWidth={2.5}
                    />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-baseline gap-3">
                    <span className="font-semibold text-neutral-900 dark:text-neutral-100">
                      {plan.title}
                    </span>
                    {isRecommended && (
                      <span className="rounded border border-emerald-500 bg-emerald-500 px-2 py-0.5 text-[11px] font-medium text-white">
                        Recommended
                      </span>
                    )}
                  </div>
                  <p className="mb-3 text-sm text-neutral-500 dark:text-neutral-400">
                    {plan.description}
                  </p>
                  <ul className="space-y-1">
                    {plan.features.map((f) => (
                      <li
                        key={f}
                        className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400"
                      >
                        <Check className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="ml-4 shrink-0 text-right">
                  <div className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
                    {plan.price}
                  </div>
                  <div className="text-xs text-neutral-400">per {plan.period}</div>
                  {plan.originalPrice && (
                    <div className="text-xs text-neutral-400 line-through">
                      {plan.originalPrice}
                    </div>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-4 border-t border-neutral-100 pt-8 dark:border-neutral-800">
        <Button
          type="button"
          variant="ghost"
          onClick={onBack}
          className="font-normal text-neutral-500 hover:text-neutral-700"
        >
          Back
        </Button>
        <Button
          type="button"
          onClick={onContinue}
          disabled={!selectedId}
          className="h-11 bg-emerald-600 px-8 font-medium text-white hover:bg-emerald-700"
        >
          Review order
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Step: Review & Pay
// ─────────────────────────────────────────────────────────────

function ReviewStep({
  center,
  plan,
  onConfirm,
  onBack,
  loading,
  promoLoading,
  onApplyPromo,
  onClearPromo,
  appliedPromo,
}: {
  center: ExamCenterForm;
  plan: Plan;
  onConfirm: () => void;
  onBack: () => void;
  loading: boolean;
  promoLoading: boolean;
  onApplyPromo: (code: string) => void;
  onClearPromo: () => void;
  appliedPromo: {
    code: string;
    durationDays: number;
    amount: number;
    expiresAt: string | null;
  } | null;
}) {
  const [promoOpen, setPromoOpen] = useState(false);
  const [promoCode, setPromoCode] = useState('');

  useEffect(() => {
    ensureRazorpay().catch((err) => warn('ReviewStep: preload razorpay failed', err));
  }, []);

  return (
    <div>
      <StepHeader
        label="Step 3 of 3"
        title="Review your order"
        description="Confirm your setup before payment. You can go back to make changes."
      />

      <div className="mb-10 space-y-8">
        <div>
          <p className="mb-4 text-xs font-medium tracking-wider text-neutral-400 uppercase dark:text-neutral-500">
            Your setup
          </p>
          <dl className="space-y-3">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="shrink-0 text-sm text-neutral-500 dark:text-neutral-400">
                Exam center
              </dt>
              <dd className="text-right text-sm font-medium text-neutral-900 dark:text-neutral-100">
                {center.code} — {center.name}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="shrink-0 text-sm text-neutral-500 dark:text-neutral-400">Session</dt>
              <dd className="text-right text-sm font-medium text-neutral-900 dark:text-neutral-100">
                {center.season} {center.examYear}
              </dd>
            </div>
          </dl>
        </div>

        <Separator />

        <div>
          <p className="mb-4 text-xs font-medium tracking-wider text-neutral-400 uppercase dark:text-neutral-500">
            Selected plan
          </p>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-semibold text-neutral-900 dark:text-neutral-100">{plan.title}</p>
              <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">
                {plan.description}
              </p>
              <ul className="mt-3 space-y-1">
                {plan.features.map((f) => (
                  <li
                    key={f}
                    className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400"
                  >
                    <Check className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
                {plan.price}
              </div>
              <div className="text-xs text-neutral-400">per {plan.period}</div>
            </div>
          </div>
        </div>

        <Separator />

        {appliedPromo ? (
          <>
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-neutral-500 dark:text-neutral-400">Original</span>
              <span className="text-base text-neutral-400 line-through dark:text-neutral-500">
                {plan.price}
              </span>
            </div>

            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="overflow-hidden rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] dark:border-emerald-500/20 dark:bg-emerald-500/[0.08]"
            >
              <div className="flex items-start gap-3 p-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
                  <Check
                    className="h-4 w-4"
                    strokeWidth={3}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                      Promo applied
                    </span>
                    <span className="rounded-md border border-emerald-500/30 bg-white px-2 py-0.5 font-mono text-[11px] font-medium tracking-wider text-emerald-700 dark:bg-neutral-900 dark:text-emerald-300">
                      {appliedPromo.code}
                    </span>
                  </div>
                  <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <span className="text-neutral-500 dark:text-neutral-500">Access duration</span>
                    <span className="font-medium text-neutral-800 dark:text-neutral-200">
                      {appliedPromo.durationDays} days
                    </span>
                    {appliedPromo.expiresAt && (
                      <>
                        <span className="text-neutral-500 dark:text-neutral-500">
                          Code valid until
                        </span>
                        <span className="font-medium text-neutral-800 dark:text-neutral-200">
                          {new Date(appliedPromo.expiresAt).toLocaleDateString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClearPromo}
                  disabled={promoLoading}
                  className="shrink-0 rounded-md p-1 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 disabled:opacity-50 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
                  aria-label="Remove promo code"
                >
                  ✕
                </button>
              </div>
            </motion.div>

            <div className="flex items-baseline justify-between border-t border-emerald-500/20 pt-4">
              <span className="text-base font-medium text-neutral-900 dark:text-neutral-100">
                Total due today
              </span>
              <div className="text-right">
                <div className="font-mono text-2xl font-semibold text-emerald-600 dark:text-emerald-400">
                  ₹{(appliedPromo.amount / 100).toFixed(0)}
                </div>
                <div className="text-xs text-neutral-400">Trial access</div>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-baseline justify-between">
              <span className="text-base font-medium text-neutral-900 dark:text-neutral-100">
                Total due today
              </span>
              <span className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
                {plan.price}
              </span>
            </div>

            <div className="pt-2">
              {!promoOpen ? (
                <button
                  type="button"
                  onClick={() => setPromoOpen(true)}
                  className="text-sm text-neutral-400 underline underline-offset-2 transition-colors hover:text-neutral-600 dark:hover:text-neutral-300"
                >
                  Have a promo code?
                </button>
              ) : (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Input
                      value={promoCode}
                      onChange={(e) => setPromoCode(e.target.value.toUpperCase().trim())}
                      placeholder="PROMO CODE"
                      className="h-9 flex-1 font-mono text-sm tracking-wider"
                      autoFocus
                      disabled={promoLoading}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={promoLoading || promoCode.length < 3}
                      onClick={() => onApplyPromo(promoCode)}
                    >
                      {promoLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Apply'}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={promoLoading}
                      onClick={() => {
                        setPromoOpen(false);
                        setPromoCode('');
                      }}
                      className="px-2 text-neutral-400"
                    >
                      ✕
                    </Button>
                  </div>
                  <p className="text-xs text-neutral-400 dark:text-neutral-500">
                    Trial codes grant 30 days of access at a reduced price.
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <div className="flex items-center gap-4 border-t border-neutral-100 pt-8 dark:border-neutral-800">
        <Button
          type="button"
          variant="ghost"
          onClick={onBack}
          className="font-normal text-neutral-500 hover:text-neutral-700"
        >
          Back
        </Button>
        <Button
          type="button"
          onClick={onConfirm}
          disabled={loading || promoLoading}
          className="h-11 bg-emerald-600 px-8 font-medium text-white hover:bg-emerald-700"
        >
          {loading || promoLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : appliedPromo ? (
            <>
              Pay ₹{(appliedPromo.amount / 100).toFixed(0)}
              <ArrowRight className="ml-2 h-4 w-4" />
            </>
          ) : (
            <>
              Pay {plan.price}
              <ArrowRight className="ml-2 h-4 w-4" />
            </>
          )}
        </Button>

        <p className="ml-auto text-xs text-neutral-400 dark:text-neutral-500">
          Secured by Razorpay
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Step: Complete
// ─────────────────────────────────────────────────────────────

function CompleteStep({ onComplete }: { onComplete: () => void }) {
  useEffect(() => {
    setOnboardingComplete();
  }, []);

  const nextSteps = [
    { icon: Calendar, label: 'Configure timetable', desc: 'Upload or build your exam schedule' },
    { icon: Users, label: 'Add supervisors', desc: 'Invite administrative staff' },
    { icon: LayoutDashboard, label: 'Set up seating', desc: 'Configure room layouts' },
    { icon: FileText, label: 'Generate reports', desc: 'MSBTE-compliant documents' },
  ];

  return (
    <div>
      <div className="mb-8 flex items-center gap-3">
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', damping: 20, stiffness: 300 }}
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10 dark:bg-emerald-500/30">
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
          </div>
        </motion.div>
        <div>
          <p className="text-xs font-medium tracking-wider text-emerald-500 uppercase">
            Setup complete
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            Your exam center is ready
          </h1>
        </div>
      </div>

      <p className="mb-10 max-w-lg text-[15px] leading-relaxed text-neutral-500 dark:text-neutral-400">
        Everything is configured. Here are the recommended next steps to get your exam center fully
        operational.
      </p>

      <div className="mb-10 space-y-3">
        {nextSteps.map(({ icon: Icon, label, desc }) => (
          <div
            key={label}
            className="flex items-start gap-4 rounded-lg border border-neutral-100 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-neutral-50 dark:bg-neutral-800">
              <Icon className="h-4 w-4 text-neutral-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200">{label}</p>
              <p className="mt-0.5 text-xs text-neutral-400 dark:text-neutral-500">{desc}</p>
            </div>
          </div>
        ))}
      </div>

      <Button
        onClick={onComplete}
        className="h-11 bg-emerald-600 px-8 font-medium text-white hover:bg-emerald-700"
      >
        <Rocket className="mr-2 h-4 w-4" />
        Go to dashboard
      </Button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Root
// ─────────────────────────────────────────────────────────────

function OnboardingPageContent() {
  log('OnboardingPageContent: mount');

  const router = useRouter();
  const searchParams = useSearchParams();
  const bootstrappedRef = useRef(false);

  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [examCenter, setExamCenter] = useState<ExamCenterForm | null>(null);
  const [currentStep, setCurrentStep] = useState<StepId>('loading');
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);

  const [promoLoading, setPromoLoading] = useState(false);

  const [appliedPromo, setAppliedPromo] = useState<{
    code: string;
    durationDays: number;
    amount: number;
    expiresAt: string | null;
  } | null>(null);

  // ─── WATCHDOG: if we're still on 'loading' after N seconds, force error ───
  useEffect(() => {
    if (currentStep !== 'loading') return;
    log('watchdog armed', { timeoutMs: BOOTSTRAP_TIMEOUT_MS });
    const t = setTimeout(() => {
      // Read latest value via functional update to avoid stale closure
      setCurrentStep((prev) => {
        if (prev === 'loading') {
          error('watchdog fired — bootstrap never resolved within timeout');
          setBootError(
            `Onboarding took longer than ${BOOTSTRAP_TIMEOUT_MS / 1000}s to load. ` +
              `Check the browser console for [onboarding] logs.`,
          );
          return 'error';
        }
        return prev;
      });
    }, BOOTSTRAP_TIMEOUT_MS);
    return () => {
      log('watchdog disarmed');
      clearTimeout(t);
    };
  }, [currentStep]);

  // ─── Bootstrap once ───────────────────────────────────────
  // ─── Bootstrap ────────────────────────────────────────────
  useEffect(() => {
    log('bootstrap effect: fired');

    let cancelled = false;

    (async () => {
      try {
        log('bootstrap: invoking bootstrapOnboarding()');
        const result = await bootstrapOnboarding();
        log('bootstrap: bootstrapOnboarding() resolved', {
          unauthenticated: result === 'unauthenticated',
          initialStep: result !== 'unauthenticated' ? result.initialStep : null,
        });

        // NOTE: Intentionally do NOT bail on `cancelled` here.
        // Under React StrictMode the first mount is discarded; the second
        // mount's effect will not re-run the async work if we bail, so we
        // must apply state regardless. React will silently ignore setState
        // on the unmounted instance, and the remount will re-run the effect
        // fresh (we removed the bootstrappedRef gate).

        if (result === 'unauthenticated') {
          warn('bootstrap: unauthenticated → error screen');
          setBootError('You are not signed in. Please log in again.');
          setCurrentStep('error');
          return;
        }

        setUserId(result.userId);
        setUserName(result.userName);
        setUserEmail(result.userEmail);
        setExamCenter(result.examCenter);

        const queryStepRaw = searchParams.get('step');
        log('bootstrap: query step =', queryStepRaw);

        const queryStep =
          queryStepRaw && STEP_ORDER.includes(queryStepRaw as any)
            ? (queryStepRaw as (typeof STEP_ORDER)[number])
            : null;

        let target: (typeof STEP_ORDER)[number] = result.initialStep;

        if (queryStep) {
          const dbIdx = STEP_INDEX[result.initialStep];
          const qIdx = STEP_INDEX[queryStep];
          if (qIdx <= dbIdx) target = queryStep;
        }

        const preferredPlan =
          readStorage<string>(STORAGE_KEYS.SELECTED_PLAN) ??
          (pricingPlans as Plan[]).find((p) => p.popular)?.id ??
          (pricingPlans as Plan[])[0]?.id ??
          '';

        log('bootstrap: setting state', { target, preferredPlan });
        setSelectedPlanId(preferredPlan);
        setCurrentStep(target);

        try {
          const params = new URLSearchParams(searchParams.toString());
          if (params.get('step') !== target) {
            params.set('step', target);
            router.replace(`/onboarding?${params.toString()}`, { scroll: false });
          }
        } catch (navErr) {
          warn('bootstrap: URL sync failed (non-fatal)', navErr);
        }
      } catch (err) {
        error('bootstrap: threw', err);
        // Same reasoning: surface the error even if cancelled.
        setBootError(err instanceof Error ? err.message : 'Failed to load onboarding');
        setCurrentStep('error');
      }
    })();

    return () => {
      log('bootstrap effect: cleanup');
      cancelled = true;
      // `cancelled` is now unused for gating state writes.
      // Kept in case you want to re-add fine-grained cancellation later.
      void cancelled;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Step navigation ─────────────────────────────────────
  const goToStep = useCallback(
    (step: Exclude<StepId, 'loading' | 'error'>) => {
      log('goToStep →', step);
      setCurrentStep(step);
      try {
        const params = new URLSearchParams(searchParams.toString());
        params.set('step', step);
        router.replace(`/onboarding?${params.toString()}`, { scroll: false });
      } catch (err) {
        warn('goToStep: URL sync failed (non-fatal)', err);
      }
    },
    [router, searchParams],
  );

  // ─── Payment ─────────────────────────────────────────────
  const verifyPayment = useCallback(
    async (
      response: {
        razorpay_payment_id: string;
        razorpay_order_id: string;
        razorpay_signature: string;
      },
      planId: string,
    ) => {
      log('verifyPayment: start', { planId });
      try {
        const res = await fetch('/api/payments/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'verify', planId, ...response }),
        });

        log('verifyPayment: response', { status: res.status, ok: res.ok });

        if (res.ok) {
          setAppliedPromo(null);
          setOnboardingComplete();
          goToStep('complete');
        } else {
          setAppliedPromo(null);
          const j = await res.json().catch(() => ({}));
          alert(j.error || 'Payment verification failed. Please contact support.');
        }
      } catch (err) {
        setAppliedPromo(null);
        error('verifyPayment: failed', err);
        alert('Could not verify payment. Please contact support.');
      } finally {
        setPaymentLoading(false);
      }
    },
    [goToStep],
  );

  const handlePay = useCallback(
    async (opts?: { promoCode?: string }) => {
      log('handlePay: start', {
        selectedPlanId,
        examCenterId: examCenter?.id,
        promo: opts?.promoCode,
      });
      const plan = (pricingPlans as Plan[]).find((p) => p.id === selectedPlanId);
      if (!plan || !examCenter?.id) {
        alert('Missing plan or exam center. Please go back and try again.');
        return;
      }
      setPaymentLoading(true);

      try {
        const res = await fetch('/api/payments/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'create',
            planId: plan.id,
            amount: plan.amount,
            promoCode: opts?.promoCode,
          }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error ?? 'Order creation failed');
        }
        const { order, isTrial } = await res.json();
        log('handlePay: order created', { orderId: order?.id, isTrial });

        await ensureRazorpay();

        openRazorpay(
          {
            key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
            amount: order.amount,
            currency: order.currency,
            name: 'TestForge',
            description: isTrial ? `Trial — ${opts?.promoCode}` : `${plan.title} Subscription`,
            order_id: order.id,
            handler: (r: Parameters<typeof verifyPayment>[0]) => verifyPayment(r, plan.id),
            prefill: { name: userName, email: userEmail },
            theme: { color: '#10b981' },
          },
          () => {
            log('handlePay: razorpay dismissed');
            setPaymentLoading(false);
          },
        );
      } catch (err) {
        error('handlePay: failed', err);
        alert(err instanceof Error ? err.message : 'Payment failed. Try again.');
        setPaymentLoading(false);
      }
    },
    [selectedPlanId, examCenter, userName, userEmail, verifyPayment],
  );

  const handleFinalComplete = () => {
    setOnboardingComplete();
    router.push('/exam-center/dashboard');
  };
  const handleApplyPromo = useCallback(async (code: string) => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;
    setPromoLoading(true);
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

      setAppliedPromo({
        code: promo.code,
        durationDays: promo.duration_days,
        amount: promo.amount,
        expiresAt: promo.expires_at ?? null,
      });
    } catch (err) {
      error('handleApplyPromo: failed', err);
      alert(err instanceof Error ? err.message : 'Could not apply promo code');
    } finally {
      setPromoLoading(false);
    }
  }, []);

  const handleClearPromo = useCallback(() => {
    setAppliedPromo(null);
  }, []);

  const plans = useMemo(() => pricingPlans as Plan[], []);
  const selectedPlan = useMemo(
    () => plans.find((p) => p.id === selectedPlanId),
    [plans, selectedPlanId],
  );

  log('render', { currentStep, hasUserId: !!userId, hasExamCenter: !!examCenter, selectedPlanId });

  // ─── Render ──────────────────────────────────────────────

  if (currentStep === 'loading') {
    return <FullPageLoader label="Checking your account…" />;
  }

  if (currentStep === 'error') {
    return (
      <FullPageError
        message={bootError ?? 'Something went wrong while loading onboarding.'}
        onRetry={() => {
          log('retry: reloading page');
          window.location.reload();
        }}
      />
    );
  }

  return (
    <OnboardingShell
      currentStep={currentStep}
      centerName={examCenter?.name}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          {currentStep === 'exam_center' && userId && (
            <ExamCenterStep
              userId={userId}
              prefill={examCenter}
              canGoBack={false}
              onComplete={(data) => {
                setExamCenter(data);
                goToStep('subscription');
              }}
            />
          )}

          {currentStep === 'subscription' && (
            <SubscriptionStep
              plans={plans}
              selectedId={selectedPlanId}
              onSelect={(id) => {
                setSelectedPlanId(id);
                writeStorage(STORAGE_KEYS.SELECTED_PLAN, id);
              }}
              onContinue={() => goToStep('review')}
              onBack={() => goToStep('exam_center')}
            />
          )}

          {currentStep === 'review' && examCenter && selectedPlan && (
            <ReviewStep
              center={examCenter}
              plan={selectedPlan}
              onConfirm={() => handlePay({ promoCode: appliedPromo?.code })}
              onBack={() => goToStep('subscription')}
              loading={paymentLoading}
              onApplyPromo={handleApplyPromo}
              onClearPromo={handleClearPromo}
              promoLoading={promoLoading}
              appliedPromo={appliedPromo}
            />
          )}
          {currentStep === 'review' && (!examCenter || !selectedPlan) && (
            <div className="py-16 text-center">
              <p className="text-sm text-neutral-500">
                Missing exam center or plan. Please go back.
              </p>
              <Button
                onClick={() => goToStep('subscription')}
                variant="outline"
                className="mt-4"
              >
                Back to plans
              </Button>
            </div>
          )}

          {currentStep === 'complete' && <CompleteStep onComplete={handleFinalComplete} />}
        </motion.div>
      </AnimatePresence>
    </OnboardingShell>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={<FullPageLoader label="Preparing onboarding…" />}>
      <OnboardingPageContent />
    </Suspense>
  );
}
