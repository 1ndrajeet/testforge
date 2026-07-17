// app/(authenticated)/onboarding/page.tsx
'use client';

import React, { Suspense, useCallback, useEffect, useRef, useState, useTransition } from 'react';

import { useRouter, useSearchParams } from 'next/navigation';

import pricingPlans from '@/config/pricing.json';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Calendar,
  Check,
  CheckCircle2,
  FileText,
  LayoutDashboard,
  Loader2,
  Rocket,
  Users,
  X,
} from 'lucide-react';
import { ArrowRight, LogOut, ShieldCheck } from 'lucide-react';
import { HashLoader } from 'react-spinners';

import { getInstituteInfo } from '@/lib/actions2/institute';
import {
  checkSlugAvailability,
  createOrganization,
  getOnboardingStatus,
  saveExamCenter,
} from '@/lib/actions2/onboarding';
import { applyTrialPromo, validatePromoCode } from '@/lib/actions2/promo.actions';
import { authClient } from '@/lib/auth-client';
import { cn } from '@/lib/utils';

import { useUserInfo } from '@/hooks/useUserInfo';

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

import { useAppStore } from '@/stores/appStore';

import { LAUNCH_OFFER_PRICE } from '../../page';

// Types
export interface Plan {
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

export interface SetupSummaryData {
  orgName?: string;
  orgId?: string;
  centerCode?: string;
  centerName?: string;
  centerId?: string;
  season?: string;
  examYear?: number;
}

export type StepId = 'organization' | 'exam_center' | 'subscription' | 'review' | 'complete';
const ONBOARDING_COOKIE = 'onboarding_complete';

// Storage helpers
const STORAGE_KEYS = {
  EXAM_CENTER: 'onboarding_ec_data',
  SELECTED_PLAN: 'onboarding_selected_plan',
} as const;

export function readStorage<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}

function setOnboardingComplete() {
  document.cookie = `onboarding_complete=true; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax; ${process.env.NODE_ENV === 'production' ? 'Secure;' : ''}`;
}

export function writeStorage(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export function clearOnboardingStorage() {
  Object.values(STORAGE_KEYS).forEach((k) => {
    try {
      localStorage.removeItem(k);
    } catch {}
  });
}

export { STORAGE_KEYS };

// Razorpay helpers
declare global {
  interface Window {
    Razorpay: any;
  }
}

let razorpayLoadPromise: Promise<void> | null = null;
let razorpayLoaded = false;

export async function ensureRazorpay() {
  if (typeof window === 'undefined') return;

  if (window.Razorpay || razorpayLoaded) {
    razorpayLoaded = true;
    return;
  }

  if (razorpayLoadPromise) {
    return razorpayLoadPromise;
  }

  razorpayLoadPromise = new Promise<void>((resolve, reject) => {
    const existingScript = document.querySelector(
      'script[src="https://checkout.razorpay.com/v1/checkout.js"]',
    );

    if (existingScript) {
      if (window.Razorpay) {
        razorpayLoaded = true;
        razorpayLoadPromise = null;
        resolve();
        return;
      }

      existingScript.addEventListener(
        'load',
        () => {
          razorpayLoaded = true;
          razorpayLoadPromise = null;
          resolve();
        },
        { once: true },
      );

      existingScript.addEventListener(
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
    script.onload = () => {
      razorpayLoaded = true;
      razorpayLoadPromise = null;
      resolve();
    };
    script.onerror = () => {
      razorpayLoadPromise = null;
      reject(new Error('Failed to load Razorpay SDK'));
    };
    document.head.appendChild(script);
  });

  return razorpayLoadPromise;
}

export function openRazorpay(options: Record<string, unknown>, onDismiss: () => void) {
  const rzp = new window.Razorpay({
    ...options,
    modal: { ondismiss: onDismiss },
  });
  rzp.open();
}

// Step navigation config
export const STEPS: { id: StepId; label: string }[] = [
  { id: 'organization', label: 'Organization' },
  { id: 'exam_center', label: 'Exam center' },
  { id: 'subscription', label: 'Subscription' },
  { id: 'review', label: 'Review & pay' },
  { id: 'complete', label: 'Complete' },
];

export const STEP_INDEX: Record<StepId, number> = {
  organization: 0,
  exam_center: 1,
  subscription: 2,
  review: 3,
  complete: 4,
};

// SidebarProgress
function SidebarProgress({ currentStep }: { currentStep: StepId }) {
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
                    ? 'bg-primary'
                    : active
                      ? 'border-primary border-2 bg-transparent'
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
                  <div className="bg-primary h-2 w-2 rounded-full" />
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

// SetupSummary
function SetupSummary({ data }: { data: SetupSummaryData }) {
  const rows = [
    { label: 'Organization', value: data.orgName },
    {
      label: 'Exam center',
      value:
        data.centerCode && data.centerName
          ? `${data.centerCode} — ${data.centerName}`
          : data.centerName || data.centerCode,
    },
    {
      label: 'Session',
      value: data.season && data.examYear ? `${data.season} ${data.examYear}` : undefined,
    },
  ].filter((r) => r.value);

  if (!rows.length) return null;

  return (
    <div>
      <p className="mb-3 text-xs font-medium tracking-wider text-neutral-400 uppercase dark:text-neutral-500">
        Current setup
      </p>
      <dl className="space-y-2">
        {rows.map(({ label, value }) => (
          <div key={label}>
            <dt className="text-xs text-neutral-400 dark:text-neutral-500">{label}</dt>
            <dd className="truncate text-sm font-medium text-neutral-700 dark:text-neutral-300">
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// OnboardingShell
export function OnboardingShell({
  currentStep,
  summaryData,
  children,
}: {
  currentStep: StepId;
  summaryData: SetupSummaryData;
  children: React.ReactNode;
}) {
  const handleSignOut = async () => {
    await authClient.signOut();
    window.location.href = '/login';
  };

  return (
    <div className="flex min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <aside className="sticky top-0 hidden h-screen w-80 shrink-0 flex-col border-r border-neutral-200 bg-white px-8 py-10 lg:flex dark:border-neutral-800 dark:bg-neutral-950">
        <div className="mb-10">
          <div className="mb-1 flex items-center gap-2.5">
            <ShieldCheck
              className="text-primary h-5 w-5"
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

        <div className="mb-auto">
          <SetupSummary data={summaryData} />
        </div>

        <div className="space-y-4 border-t border-neutral-100 pt-8 dark:border-neutral-800">
          <div>
            <p className="mb-1 text-xs font-medium tracking-wider text-neutral-400 uppercase dark:text-neutral-500">
              Need help?
            </p>
            <a
              href={`mailto:support@${process.env.NEXT_PUBLIC_HOSTED_URL || 'testforge.tech'}`}
              className="hover:text-primary dark:hover:text-primary text-sm text-neutral-500 transition-colors"
            >
              support@{process.env.NEXT_PUBLIC_HOSTED_URL || 'testforge.tech'}
            </a>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => handleSignOut()}
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
              className="text-primary h-4 w-4"
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
            onClick={() => handleSignOut()}
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

// StepHeader
export function StepHeader({
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

// FormSection
export function FormSection({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      {title && (
        <p className="text-xs font-medium tracking-wider text-neutral-400 uppercase dark:text-neutral-500">
          {title}
        </p>
      )}
      {children}
    </div>
  );
}

// FormField
export function FormField({
  label,
  hint,
  required,
  error,
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
      {error ? (
        <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>
      ) : hint ? (
        <p className="text-xs text-neutral-400 dark:text-neutral-500">{hint}</p>
      ) : null}
    </div>
  );
}

// ActionBar
export function ActionBar({
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
        className="bg-primary hover:bg-primary h-11 px-8 font-medium text-white"
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

// SlugInput
type SlugState = 'idle' | 'checking' | 'available' | 'taken';

export function SlugInput({
  value,
  onChange,
  state,
  prefix = process.env.NEXT_PUBLIC_HOSTED_URL || 'testforge.tech/',
}: {
  value: string;
  onChange: (v: string) => void;
  state: SlugState;
  prefix?: string;
}) {
  const indicator =
    state === 'checking' ? (
      <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400" />
    ) : state === 'available' ? (
      <Check className="text-primary h-3.5 w-3.5" />
    ) : state === 'taken' ? (
      <span className="text-xs text-rose-500">Taken</span>
    ) : null;

  return (
    <div className="relative flex items-center">
      <span className="pointer-events-none absolute left-3 text-sm whitespace-nowrap text-neutral-400 select-none">
        {prefix}
      </span>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
        placeholder="your-org"
        required
        className={cn(
          'h-11 pr-10',
          state === 'available' && 'border-primary focus-visible:ring-primary',
          state === 'taken' && 'border-rose-400 focus-visible:ring-rose-400',
        )}
        style={{ paddingLeft: `${prefix.length * 7.5 + 12}px` }}
      />
      <div className="absolute right-3 flex items-center">{indicator}</div>
    </div>
  );
}

// Status to step mapping - ONLY FOR NEW USERS
const STATUS_TO_STEP: Record<string, StepId> = {
  needs_organization: 'organization',
  needs_exam_setup: 'exam_center',
  needs_subscription: 'subscription',
  complete: 'complete',
};

// EC defaults
const EC_DEFAULTS = {
  id: '',
  code: '',
  name: '',
  address: '',
  officerIncharge: '',
  sealingSupervisor: '',
  distCenterCode: '',
  distCenterName: '',
  season: 'Summer' as 'Summer' | 'Winter',
  examYear: new Date().getFullYear(),
};

const YEARS = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() + i);

//
// Step: Organization
//
function OrganizationStep({
  prefill,
  onComplete,
}: {
  prefill?: { name?: string; slug?: string };
  onComplete: (org: { name: string; id: string; slug: string }) => void;
}) {
  const [name, setName] = useState(prefill?.name ?? '');
  const [slug, setSlug] = useState(prefill?.slug ?? '');
  const [slugState, setSlugState] = useState<'idle' | 'checking' | 'available' | 'taken'>(
    prefill?.slug ? 'available' : 'idle',
  );
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const { setOrganizationFromDB } = useAppStore();

  const toSlug = (t: string) =>
    t
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setName(v);
    if (!slug || slug === toSlug(name)) setSlug(toSlug(v));
  };

  useEffect(() => {
    if (prefill?.slug && slug === prefill.slug) {
      setSlugState('available');
      return;
    }
    if (!slug || slug.length < 3) return setSlugState('idle');
    setSlugState('checking');
    const t = setTimeout(async () => {
      const { available } = await checkSlugAvailability(slug);
      setSlugState(available ? 'available' : 'taken');
    }, 500);
    return () => clearTimeout(t);
  }, [slug, prefill?.slug]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (slugState !== 'available') return setError('Choose a different URL');
    startTransition(async () => {
      const fd = new FormData();
      fd.append('name', name);
      fd.append('slug', slug);
      const result = await createOrganization(fd);
      if (result.error) return setError(result.error);
      if (result.organization) {
        setOrganizationFromDB(result.organization);
        onComplete({
          name: result.organization.name,
          id: result.organization.id,
          slug: result.organization.slug,
        });
      }
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
    >
      <StepHeader
        label="Step 1 of 4"
        title="Set up your organization"
        description="Your organization is the top-level account. Exam centers, staff, and documents all belong to it."
      />

      <div className="space-y-6">
        <FormSection title="Identity">
          <FormField
            label="Organization name"
            required
          >
            <Input
              value={name}
              onChange={handleNameChange}
              placeholder="e.g., Rajarambapu Institute of Technology, Sangli"
              required
              className="h-11"
              autoFocus
            />
          </FormField>

          <FormField
            label="Your URL"
            hint="Used in document links and staff access. Cannot be changed after setup."
            required
            error={
              slugState === 'taken' ? 'That URL is already in use — try a different one' : undefined
            }
          >
            <SlugInput
              value={slug}
              onChange={setSlug}
              state={slugState}
            />
          </FormField>
        </FormSection>

        {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}

        <ActionBar
          submitLabel="Create organization"
          loading={isPending}
          disabled={!name || !slug || slugState !== 'available'}
        />
      </div>
    </form>
  );
}

//
// Step: Exam Center - FIXED
//
function ExamCenterStep({
  prefill,
  onComplete,
  onBack,
}: {
  prefill?: Partial<typeof EC_DEFAULTS>;
  onComplete: (data: Partial<typeof EC_DEFAULTS>) => void;
  onBack: () => void;
}) {
  // Initialize with prefill data (from DB) or defaults
  const [form, setForm] = useState<typeof EC_DEFAULTS>(() => ({
    ...EC_DEFAULTS,
    ...prefill, // Prefill from DB takes precedence
  }));
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const { organization, setExamCenterFromDB } = useAppStore();
  const [instituteLoading, setInstituteLoading] = useState(false);

  const set = (k: keyof typeof EC_DEFAULTS, v: string | number) =>
    setForm((p) => ({ ...p, [k]: v }));

  // Fetch institute name from center code
  useEffect(() => {
    const fetchInstitute = async () => {
      const code = form.code?.trim();
      if (!code || code.length < 3) return;

      setInstituteLoading(true);
      try {
        const result = await getInstituteInfo(code.toUpperCase());
        if (result.success && result.data) {
          setForm((prev) => ({
            ...prev,
            name: result.data.NAME,
          }));
        }
      } catch {
        // Silent fail
      } finally {
        setInstituteLoading(false);
      }
    };

    const timer = setTimeout(fetchInstitute, 500);
    return () => clearTimeout(timer);
  }, [form.code]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, String(v)));
      fd.append('orgId', organization!.id);

      // If we have an existing center ID, pass it
      if (form.id) {
        fd.append('centerId', form.id);
      }

      const result = await saveExamCenter(fd);
      if (result.error) return setError(result.error);
      if (result.examCenter) {
        setExamCenterFromDB(result.examCenter);
        onComplete(form);
      }
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
    >
      <StepHeader
        label="Step 2 of 4"
        title="Configure your exam center"
        description="These details appear on all MSBTE-issued documents. Required fields are marked."
      />

      <div className="space-y-10">
        <FormSection title="Center information">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="Center code"
              required
            >
              <div className="relative">
                <Input
                  value={form.code}
                  onChange={(e) => set('code', e.target.value.toUpperCase())}
                  placeholder="1234"
                  required
                  className={cn('h-10 pr-8', instituteLoading && 'pr-10')}
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
                placeholder="Rajarambapu Institute of Technology, Sangli"
                required
                className="h-10"
              />
            </FormField>
          </div>
        </FormSection>

        <FormSection title="Examination session">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="Season"
              required
            >
              <RadioGroup
                value={form.season}
                onValueChange={(v) => set('season', v)}
                className="mt-2 flex gap-6"
              >
                {['Summer', 'Winter'].map((s) => (
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
        </FormSection>

        <FormSection title="Distribution center">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="Distribution code"
              required
            >
              <Input
                value={form.distCenterCode}
                onChange={(e) => set('distCenterCode', e.target.value.toUpperCase())}
                placeholder="DC001"
                required
                className="h-10"
              />
            </FormField>
            <FormField label="Distribution center name">
              <Input
                value={form.distCenterName}
                onChange={(e) => set('distCenterName', e.target.value)}
                placeholder="Walchand College of Engineering, Sangli"
                className="h-10"
              />
            </FormField>
          </div>
        </FormSection>

        <FormSection title="Administrative contacts">
          <div className="grid gap-4 sm:grid-cols-2">
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
          </div>
        </FormSection>

        <FormSection title="Location">
          <FormField label="Address">
            <Input
              value={form.address}
              onChange={(e) => set('address', e.target.value)}
              placeholder="Full postal address"
              className="h-10"
            />
          </FormField>
        </FormSection>

        {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}

        <ActionBar
          onBack={onBack}
          submitLabel="Save and continue"
          loading={isPending}
        />
      </div>
    </form>
  );
}

//
// Step: Subscription
//
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
        label="Step 3 of 4"
        title="Choose a subscription"
        description="All plans include full access to every feature. Select the one that matches your institution's exam cycle."
      />

      <div className="mb-10 space-y-3">
        {plans.map((plan) => {
          const isSelected = plan.id === selectedId;
          const isRecommended = plan.id === recommended.id;

          return (
            <button
              key={plan.id}
              type="button"
              onClick={() => onSelect(plan.id)}
              aria-pressed={isSelected}
              className={cn(
                'focus-visible:ring-primary w-full rounded-xl border-2 p-5 text-left transition-all focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
                isSelected
                  ? 'border-primary bg-white dark:bg-neutral-900'
                  : 'border-neutral-200 bg-white hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700',
                !isSelected && !isRecommended && 'opacity-80',
              )}
            >
              <div className="flex items-start gap-4">
                <div
                  className={cn(
                    'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                    isSelected
                      ? 'border-primary bg-primary'
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
                    <span
                      className={cn(
                        'font-semibold text-neutral-900 dark:text-neutral-100',
                        !isRecommended && !isSelected && 'text-neutral-600 dark:text-neutral-400',
                      )}
                    >
                      {plan.title}
                    </span>
                    {isRecommended && (
                      <span className="border-primary bg-primary text-primary-foreground rounded border px-2 py-0.5 text-[11px] font-medium">
                        Recommended
                      </span>
                    )}
                  </div>
                  <p
                    className={cn(
                      'mb-3 text-sm',
                      isRecommended || isSelected
                        ? 'text-neutral-500 dark:text-neutral-400'
                        : 'text-neutral-400 dark:text-neutral-500',
                    )}
                  >
                    {plan.description}
                  </p>

                  {(isRecommended || isSelected) && (
                    <ul className="space-y-1">
                      {plan.features.map((f) => (
                        <li
                          key={f}
                          className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400"
                        >
                          <Check className="text-primary h-3.5 w-3.5 shrink-0" />
                          {f}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="ml-4 shrink-0 text-right">
                  <div
                    className={cn(
                      'text-2xl font-semibold tracking-tight',
                      isRecommended || isSelected
                        ? 'text-neutral-900 dark:text-neutral-100'
                        : 'text-neutral-500 dark:text-neutral-500',
                    )}
                  >
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
          className="bg-primary hover:bg-primary h-11 px-8 font-medium text-white"
        >
          Review order
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

//
// Step: Payment Review
//
interface ReviewStepProps {
  summary: SetupSummaryData;
  plan: Plan;
  onConfirm: () => void;
  onBack: () => void;
  loading: boolean;
  promoCode: string;
  setPromoCode: (v: string) => void;
  promoStatus: { valid: boolean; error?: string } | null;
  isCheckingPromo: boolean;
  onCheckPromo: () => void;
  onActivatePromo: () => void;
}

function ReviewStep({
  summary,
  plan,
  onConfirm,
  onBack,
  loading,
  promoCode,
  setPromoCode,
  promoStatus,
  isCheckingPromo,
  onCheckPromo,
  onActivatePromo,
}: ReviewStepProps) {
  const [promoOpen, setPromoOpen] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && !window.Razorpay) {
      ensureRazorpay().catch(() => {});
    }
  }, []);

  const reviewRows = [
    { label: 'Organization', value: summary.orgName },
    {
      label: 'Exam center',
      value:
        summary.centerCode && summary.centerName
          ? `${summary.centerCode} — ${summary.centerName}`
          : summary.centerName || summary.centerCode,
    },
    {
      label: 'Session',
      value:
        summary.season && summary.examYear ? `${summary.season} ${summary.examYear}` : undefined,
    },
  ].filter((r) => r.value);

  return (
    <div>
      <StepHeader
        label="Step 4 of 4"
        title="Review your order"
        description="Confirm your setup details before payment. You can go back to make changes."
      />

      <div className="mb-10 space-y-8">
        <div>
          <p className="mb-4 text-xs font-medium tracking-wider text-neutral-400 uppercase dark:text-neutral-500">
            Your setup
          </p>
          <dl className="space-y-3">
            {reviewRows.map(({ label, value }) => (
              <div
                key={label}
                className="flex items-baseline justify-between gap-4"
              >
                <dt className="shrink-0 text-sm text-neutral-500 dark:text-neutral-400">{label}</dt>
                <dd className="text-right text-sm font-medium text-neutral-900 dark:text-neutral-100">
                  {value}
                </dd>
              </div>
            ))}
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
                    <Check className="text-primary h-3.5 w-3.5 shrink-0" />
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

        <div className="flex items-baseline justify-between">
          <span className="text-base font-medium text-neutral-900 dark:text-neutral-100">
            Total due today
          </span>
          <span className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
            {plan.price}
          </span>
        </div>

        <div>
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
                  onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                  placeholder="PROMO CODE"
                  className="h-9 flex-1 font-mono text-sm tracking-wider"
                  autoFocus
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onCheckPromo}
                  disabled={isCheckingPromo || !promoCode.trim()}
                >
                  {isCheckingPromo ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Apply'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setPromoOpen(false);
                    setPromoCode('');
                  }}
                  className="px-2 text-neutral-400"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
              {promoStatus && (
                <div
                  className={cn(
                    'flex items-center gap-2 text-sm',
                    promoStatus.valid
                      ? 'text-primary dark:text-primary'
                      : 'text-rose-600 dark:text-rose-400',
                  )}
                >
                  {promoStatus.valid ? (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      1st semester trial access for ₹{LAUNCH_OFFER_PRICE}
                      <Button
                        type="button"
                        size="sm"
                        onClick={onActivatePromo}
                        disabled={loading}
                        className="bg-primary hover:bg-primary ml-auto h-8"
                      >
                        {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Activate trial'}
                      </Button>
                    </>
                  ) : (
                    promoStatus.error
                  )}
                </div>
              )}
            </div>
          )}
        </div>
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
          disabled={loading}
          className="bg-primary hover:bg-primary h-11 px-8 font-medium text-white"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
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

//
// Step: Complete
//
function CompleteStep({ onComplete }: { onComplete: () => void }) {
  useEffect(() => {
    clearOnboardingStorage();
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
          <div className="bg-primary/10 dark:bg-primary/30 flex h-10 w-10 items-center justify-center rounded-full">
            <CheckCircle2 className="text-primary dark:text-primary h-5 w-5" />
          </div>
        </motion.div>
        <div>
          <p className="text-primary dark:text-primary text-xs font-medium tracking-wider uppercase">
            Setup complete
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            Your institution is ready
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
        className="bg-primary hover:bg-primary h-11 px-8 font-medium text-white"
      >
        <Rocket className="mr-2 h-4 w-4" />
        Go to dashboard
      </Button>
    </div>
  );
}

//
// Root page — orchestrates all steps + shell
//
function OnboardingPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useUserInfo();
  const statusCheckDone = useRef(false);

  // STATE
  const [currentStep, setCurrentStep] = useState<StepId>('organization');
  const [dbStatus, setDbStatus] = useState<any>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');
  const [promoCode, setPromoCode] = useState('');
  const [promoStatus, setPromoStatus] = useState<{
    valid: boolean;
    error?: string;
  } | null>(null);
  const [isCheckingPromo, setIsCheckingPromo] = useState(false);
  const [summary, setSummary] = useState<SetupSummaryData>({});

  // Get step from query param
  const getStepFromQuery = useCallback((): StepId | null => {
    const stepParam = searchParams.get('step');
    if (!stepParam) return null;
    const validSteps: StepId[] = [
      'organization',
      'exam_center',
      'subscription',
      'review',
      'complete',
    ];
    return validSteps.includes(stepParam as StepId) ? (stepParam as StepId) : null;
  }, [searchParams]);

  // Update URL with step
  const updateStepInUrl = useCallback(
    (step: StepId) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('step', step);
      router.replace(`/onboarding?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  // FETCH DB STATUS ON MOUNT - ONLY ONCE
  useEffect(() => {
    if (statusCheckDone.current) return;
    statusCheckDone.current = true;

    let isMounted = true;

    const fetchStatus = async () => {
      try {
        const result = await getOnboardingStatus();
        if (!isMounted) return;

        // ============================================================
        // CHECK 1: User already completed onboarding
        // ============================================================
        if (result.status === 'complete') {
          router.replace('/exam-center/dashboard');
          return;
        }

        // ============================================================
        // CHECK 2: Subscription expired or inactive (for existing users)
        // ============================================================
        // If user has already created org and exam center but subscription expired
        const data = result.data as any;
        const hasOrg = !!data?.organization;
        const hasExamCenter = !!data?.examCenter;

        if (hasOrg && hasExamCenter && result.status === 'needs_subscription') {
          // Check if subscription is actually expired or inactive
          const { getCurrentSubscription } = await import('@/lib/actions2/subscription');
          const sub = await getCurrentSubscription();

          // If subscription is inactive or expired, redirect to billing
          if (sub.tier === 'inactive' || !sub.isActive) {
            router.replace('/billing');
            return;
          }
        }

        // ============================================================
        // CHECK 3: Determine target step from status
        // ============================================================
        const queryStep = getStepFromQuery();
        let targetStep: StepId = 'organization';

        if (queryStep && queryStep !== 'complete') {
          targetStep = queryStep;
        } else {
          targetStep = STATUS_TO_STEP[result.status as string] || 'organization';
        }

        const plans: Plan[] = result.plans ?? pricingPlans;
        const preferred =
          readStorage<string>(STORAGE_KEYS.SELECTED_PLAN) ??
          plans.find((p) => p.popular)?.id ??
          plans[0]?.id ??
          '';

        // Batch updates
        React.startTransition(() => {
          setDbStatus(result);
          setCurrentStep(targetStep);
          setSummary({
            orgName: data?.organization?.name,
            orgId: data?.organization?.id,
            centerCode: data?.examCenter?.code,
            centerName: data?.examCenter?.name,
            centerId: data?.examCenter?.id,
            season: data?.examCenter?.season,
            examYear: data?.examCenter?.examYear,
          });
          setSelectedPlanId(preferred);
          setPageLoading(false);
        });

        if (!queryStep || queryStep !== targetStep) {
          updateStepInUrl(targetStep);
        }
      } catch (error) {
        console.error('Error fetching onboarding status:', error);
        if (isMounted) {
          setPageLoading(false);
        }
      }
    };

    fetchStatus();

    return () => {
      isMounted = false;
    };
  }, [router, getStepFromQuery, updateStepInUrl]);

  // Step navigation
  const goToStep = useCallback(
    (step: StepId) => {
      setCurrentStep(step);
      updateStepInUrl(step);
    },
    [updateStepInUrl],
  );

  // Razorpay helpers
  const verifyPayment = async (
    response: {
      razorpay_payment_id: string;
      razorpay_order_id: string;
      razorpay_signature: string;
    },
    planId: string,
  ) => {
    const res = await fetch('/api/payments/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'verify', planId, ...response }),
    });
    if (res.ok) {
      setOnboardingComplete();
      goToStep('complete');
    } else {
      alert('Payment verification failed. Please contact support.');
    }
    setPaymentLoading(false);
  };

  const prefill = { name: user?.name ?? '', email: user?.email ?? '' };
  const theme = { color: '#10b981' };

  const handlePay = async () => {
    const plans: Plan[] = dbStatus?.plans ?? pricingPlans;
    const plan = plans.find((p: Plan) => p.id === selectedPlanId);
    if (!plan) return;
    setPaymentLoading(true);
    try {
      const res = await fetch('/api/payments/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          planId: plan.id,
          amount: plan.amount,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Order failed');
      const { order } = await res.json();
      await ensureRazorpay();
      openRazorpay(
        {
          key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
          amount: order.amount,
          currency: order.currency,
          name: 'TestForge',
          description: `${plan.title} Subscription`,
          order_id: order.id,
          handler: (r: Parameters<typeof verifyPayment>[0]) => verifyPayment(r, plan.id),
          prefill,
          theme,
        },
        () => setPaymentLoading(false),
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Payment failed. Try again.');
      setPaymentLoading(false);
    }
  };

  const handleComplete = () => {
    document.cookie = `onboarding_complete=true; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax; ${process.env.NODE_ENV === 'production' ? 'Secure;' : ''}`;
    router.push('/exam-center/dashboard');
  };

  const handleCheckPromo = async () => {
    if (!promoCode.trim()) return;
    setIsCheckingPromo(true);
    try {
      const result = await validatePromoCode(promoCode);
      setPromoStatus(result);
    } catch {
      setPromoStatus({ valid: false, error: 'Could not validate code' });
    } finally {
      setIsCheckingPromo(false);
    }
  };

  const handleTrialPromo = async () => {
    if (!promoCode.trim()) return;
    setPaymentLoading(true);
    try {
      const result = await applyTrialPromo(promoCode);
      if (!result.success) {
        setPromoStatus({ valid: false, error: result.error });
        setPaymentLoading(false);
        return;
      }
      if (result.amount == null) {
        setPromoStatus({ valid: false, error: 'Invalid trial amount' });
        setPaymentLoading(false);
        return;
      }
      await ensureRazorpay();
      openRazorpay(
        {
          key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
          amount: (result.amount as number) * 100, // Convert to paise
          currency: 'INR',
          name: 'TestForge',
          description: '1st semester Trial Access',
          order_id: result.orderId,
          handler: (r: Parameters<typeof verifyPayment>[0]) => {
            setOnboardingComplete();
            verifyPayment(r, 'trial');
          },
          prefill,
          theme,
        },
        () => setPaymentLoading(false),
      );
    } catch {
      setPromoStatus({ valid: false, error: 'Failed to process trial' });
      setPaymentLoading(false);
    }
  };

  // LOADING SCREEN
  if (pageLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 dark:bg-neutral-950">
        <HashLoader
          size={60}
          color="#059669"
        />
      </div>
    );
  }

  // DATA
  const plans: Plan[] = dbStatus?.plans ?? pricingPlans;
  const selectedPlan = plans.find((p) => p.id === selectedPlanId);
  const dbData = dbStatus?.data as any;

  // RENDER
  return (
    <OnboardingShell
      currentStep={currentStep}
      summaryData={summary}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          {currentStep === 'organization' && (
            <OrganizationStep
              prefill={{
                name: dbData?.organization?.name,
                slug: dbData?.organization?.slug,
              }}
              onComplete={({ name, id, slug }) => {
                setSummary((s) => ({ ...s, orgName: name, orgId: id }));
                goToStep('exam_center');
              }}
            />
          )}

          {currentStep === 'exam_center' && (
            <ExamCenterStep
              prefill={dbData?.existingCenter ?? undefined}
              onComplete={(data) => {
                setSummary((s) => ({
                  ...s,
                  centerCode: data.code,
                  centerName: data.name,
                  centerId: data.id,
                  season: data.season,
                  examYear: data.examYear,
                }));
                goToStep('subscription');
              }}
              onBack={() => goToStep('organization')}
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

          {currentStep === 'review' && selectedPlan && (
            <ReviewStep
              summary={summary}
              plan={selectedPlan}
              onConfirm={handlePay}
              onBack={() => goToStep('subscription')}
              loading={paymentLoading}
              promoCode={promoCode}
              setPromoCode={setPromoCode}
              promoStatus={promoStatus}
              isCheckingPromo={isCheckingPromo}
              onCheckPromo={handleCheckPromo}
              onActivatePromo={handleTrialPromo}
            />
          )}

          {currentStep === 'complete' && (
            <CompleteStep onComplete={() => router.push('/exam-center/dashboard')} />
          )}
        </motion.div>
      </AnimatePresence>
    </OnboardingShell>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-neutral-50 dark:bg-neutral-950">
          <HashLoader
            size={60}
            color="#059669"
          />
        </div>
      }
    >
      <OnboardingPageContent />
    </Suspense>
  );
}
