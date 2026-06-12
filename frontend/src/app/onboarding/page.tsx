// ─────────────────────────────────────────────────────────────────────────────
// page.tsx  —  Enterprise onboarding for MSBTE exam coordinators
// ─────────────────────────────────────────────────────────────────────────────
'use client';

import { useEffect, useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';
import Script from 'next/script';

import {
  checkSlugAvailability,
  createOrganization,
  getOnboardingStatus,
  saveExamCenter,
} from '@/app/actions/onboarding';
import { applyTrialPromo, validatePromoCode } from '@/app/actions/promo.actions';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Infinity as InfinityIcon,
  Calendar,
  Check,
  CheckCircle2,
  Crown,
  FileText,
  LayoutDashboard,
  Loader2,
  Rocket,
  Users,
  Zap,
} from 'lucide-react';
import { ArrowRight, LogOut, ShieldCheck } from 'lucide-react';

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

import { useUser } from '@/hooks/useUser';

import { cn } from '@/lib/utils';

import { useAppStore } from '@/stores/appStore';

import pricingPlans from '@/config/pricing.json';

// ─── Types ────────────────────────────────────────────────────────────────────

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
  centerCode?: string;
  centerName?: string;
  season?: string;
  examYear?: number;
}

export type StepId = 'organization' | 'exam_center' | 'subscription' | 'review' | 'complete';

// ─── Storage helpers ──────────────────────────────────────────────────────────

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

// ─── Razorpay helpers ─────────────────────────────────────────────────────────

declare global {
  interface Window {
    Razorpay: any;
  }
}

export async function ensureRazorpay() {
  if (typeof window !== 'undefined' && window.Razorpay) return;
  await new Promise<void>((resolve) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve();
    document.body.appendChild(s);
  });
}

export function openRazorpay(options: Record<string, unknown>, onDismiss: () => void) {
  const rzp = new window.Razorpay({
    ...options,
    modal: { ondismiss: onDismiss },
  });
  rzp.open();
}

// ─── Step navigation config ───────────────────────────────────────────────────

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

// ─── SidebarProgress ─────────────────────────────────────────────────────────

function SidebarProgress({ currentStep }: { currentStep: StepId }) {
  const current = STEP_INDEX[currentStep];

  return (
    <nav aria-label="Onboarding progress">
      <ul className="space-y-1">
        {STEPS.map(({ id, label }, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li key={id} className="flex items-center gap-3 py-1.5">
              <div
                className={cn(
                  'w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-colors',
                  done
                    ? 'bg-emerald-500'
                    : active
                      ? 'border-2 border-emerald-500 bg-transparent'
                      : 'border border-neutral-300 dark:border-neutral-700 bg-transparent'
                )}
                aria-hidden
              >
                {done ? (
                  <Check className="h-3 w-3 text-white" strokeWidth={2.5} />
                ) : active ? (
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                ) : null}
              </div>
              <span
                className={cn(
                  'text-sm transition-colors',
                  done
                    ? 'text-neutral-500 dark:text-neutral-400'
                    : active
                      ? 'font-medium text-neutral-900 dark:text-neutral-100'
                      : 'text-neutral-400 dark:text-neutral-600'
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

// ─── SetupSummary ─────────────────────────────────────────────────────────────

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
      <p className="text-xs font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-3">
        Current setup
      </p>
      <dl className="space-y-2">
        {rows.map(({ label, value }) => (
          <div key={label}>
            <dt className="text-xs text-neutral-400 dark:text-neutral-500">{label}</dt>
            <dd className="text-sm text-neutral-700 dark:text-neutral-300 font-medium truncate">
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// ─── OnboardingShell ──────────────────────────────────────────────────────────

export function OnboardingShell({
  currentStep,
  summaryData,
  children,
}: {
  currentStep: StepId;
  summaryData: SetupSummaryData;
  children: React.ReactNode;
}) {
  const { signOut } = useUser();

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 flex">
      {/* ── Sidebar ── */}
      <aside className="hidden lg:flex flex-col w-80 shrink-0 sticky top-0 h-screen border-r border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 px-8 py-10">
        {/* Branding */}
        <div className="mb-10">
          <div className="flex items-center gap-2.5 mb-1">
            <ShieldCheck className="h-5 w-5 text-emerald-500" aria-hidden />
            <span className="font-semibold text-neutral-900 dark:text-neutral-100 tracking-tight">
              TestForge
            </span>
          </div>
          <p className="text-xs text-neutral-400 dark:text-neutral-500 pl-7">
            Examination Management Platform
          </p>
        </div>

        {/* Progress */}
        <div className="mb-10">
          <p className="text-xs font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-4">
            Setup progress
          </p>
          <SidebarProgress currentStep={currentStep} />
        </div>

        {/* Setup summary */}
        <div className="mb-auto">
          <SetupSummary data={summaryData} />
        </div>

        {/* Support + logout */}
        <div className="space-y-4 pt-8 border-t border-neutral-100 dark:border-neutral-800">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-1">
              Need help?
            </p>
            <a
              href="mailto:support@testforge.app"
              className="text-sm text-neutral-500 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
            >
              support@testforge.app
            </a>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => signOut()}
            className="w-full justify-start text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 px-0 font-normal"
          >
            <LogOut className="h-4 w-4 mr-2" aria-hidden />
            Log out
          </Button>
        </div>
      </aside>

      {/* ── Content area ── */}
      <main className="flex-1 overflow-y-auto">
        {/* Mobile brand bar */}
        <div className="lg:hidden flex items-center justify-between px-6 py-4 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-500" aria-hidden />
            <span className="font-semibold text-sm text-neutral-900 dark:text-neutral-100">
              TestForge
            </span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => signOut()}
            className="text-neutral-400 px-2"
          >
            <LogOut className="h-4 w-4" aria-hidden />
            <span className="sr-only">Log out</span>
          </Button>
        </div>

        <div className="max-w-3xl mx-auto px-6 py-12 lg:py-16">{children}</div>
      </main>
    </div>
  );
}

// ─── StepHeader ───────────────────────────────────────────────────────────────

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
        <p className="text-xs font-medium uppercase tracking-widest text-neutral-400 dark:text-neutral-500 mb-2">
          {label}
        </p>
      )}
      <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50 mb-3">
        {title}
      </h1>
      {description && (
        <p className="text-[15px] text-neutral-500 dark:text-neutral-400 leading-relaxed max-w-lg">
          {description}
        </p>
      )}
    </div>
  );
}

// ─── FormSection ─────────────────────────────────────────────────────────────

export function FormSection({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      {title && (
        <p className="text-xs font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
          {title}
        </p>
      )}
      {children}
    </div>
  );
}

// ─── FormField ────────────────────────────────────────────────────────────────

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
          <span className="text-rose-400 ml-0.5" aria-hidden>
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

// ─── ActionBar ────────────────────────────────────────────────────────────────

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
    <div className="flex items-center gap-4 pt-8 border-t border-neutral-100 dark:border-neutral-800 mt-10">
      {onBack && (
        <Button
          type="button"
          variant="ghost"
          onClick={onBack}
          className="text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 font-normal"
        >
          Back
        </Button>
      )}
      <Button
        type="submit"
        disabled={disabled || loading}
        className="h-11 px-8 bg-emerald-600 hover:bg-emerald-700 font-medium text-white"
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

// ─── SlugInput ────────────────────────────────────────────────────────────────

type SlugState = 'idle' | 'checking' | 'available' | 'taken';

export function SlugInput({
  value,
  onChange,
  state,
  prefix = 'testforge.app/',
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
      <Check className="h-3.5 w-3.5 text-emerald-500" />
    ) : state === 'taken' ? (
      <span className="text-xs text-rose-500">Taken</span>
    ) : null;

  return (
    <div className="relative flex items-center">
      <span className="absolute left-3 text-sm text-neutral-400 select-none pointer-events-none whitespace-nowrap">
        {prefix}
      </span>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
        placeholder="your-org"
        required
        className={cn(
          'h-11 pr-10',
          state === 'available' && 'border-emerald-400 focus-visible:ring-emerald-400',
          state === 'taken' && 'border-rose-400 focus-visible:ring-rose-400'
        )}
        style={{ paddingLeft: `${prefix.length * 7.5 + 12}px` }}
      />
      <div className="absolute right-3 flex items-center">{indicator}</div>
    </div>
  );
}
// ─── Step index → StepId map ──────────────────────────────────────────────────

const STATUS_TO_STEP: Record<string, StepId> = {
  needs_organization: 'organization',
  needs_exam_setup: 'exam_center',
  needs_subscription: 'subscription',
};

const STEP_ORDER: StepId[] = ['organization', 'exam_center', 'subscription', 'review', 'complete'];

// ─── EC defaults ─────────────────────────────────────────────────────────────

const EC_DEFAULTS = {
  id: '',
  code: '',
  name: '',
  address: '',
  officerIncharge: '',
  sealingSupervisor: '',
  distCenterCode: '',
  distCenterName: '',
  season: 'Summer',
  examYear: new Date().getFullYear(),
};

const YEARS = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() + i);

// ─── Plan icons ───────────────────────────────────────────────────────────────

const PLAN_ICONS: Record<string, React.ElementType> = {
  lifetime_access: InfinityIcon,
  semester_online: Zap,
};
function planIcon(id: string): React.ElementType {
  return PLAN_ICONS[id] ?? Crown;
}

// ─────────────────────────────────────────────────────────────────────────────
// Step: Organization
// ─────────────────────────────────────────────────────────────────────────────

function OrganizationStep({
  prefill,
  onComplete,
}: {
  prefill?: { name?: string; slug?: string };
  onComplete: (org: { name: string; id: string }) => void;
}) {
  const [name, setName] = useState(prefill?.name ?? '');
  const [slug, setSlug] = useState(prefill?.slug ?? '');
  const [slugState, setSlugState] = useState<'idle' | 'checking' | 'available' | 'taken'>(
    prefill?.slug ? 'available' : 'idle'
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
    // Only auto-derive slug when user hasn't manually edited it
    if (!slug || slug === toSlug(name)) setSlug(toSlug(v));
  };

  // Debounced slug check
  useEffect(() => {
    // If this is the prefilled slug from DB, it's already valid (it's theirs)
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
        onComplete({ name: result.organization.name, id: result.organization.id });
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
      <StepHeader
        label="Step 1 of 4"
        title="Set up your organization"
        description="Your organization is the top-level account. Exam centers, staff, and documents all belong to it."
      />

      <div className="space-y-6">
        <FormSection title="Identity">
          <FormField label="Organization name" required>
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
            <SlugInput value={slug} onChange={setSlug} state={slugState} />
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

// ─────────────────────────────────────────────────────────────────────────────
// Step: Exam Center
// ─────────────────────────────────────────────────────────────────────────────

function ExamCenterStep({
  prefill,
  onComplete,
  onBack,
}: {
  prefill?: Partial<typeof EC_DEFAULTS>;
  onComplete: (data: Partial<typeof EC_DEFAULTS>) => void;
  onBack: () => void;
}) {
  // DB data takes precedence over localStorage
  const saved = readStorage<typeof EC_DEFAULTS>(STORAGE_KEYS.EXAM_CENTER);
  const [form, setForm] = useState<typeof EC_DEFAULTS>(() => ({
    ...EC_DEFAULTS,
    ...saved,
    ...prefill,
  }));
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const { organization, setExamCenterFromDB } = useAppStore();

  const set = (k: keyof typeof EC_DEFAULTS, v: string | number) =>
    setForm((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    writeStorage(STORAGE_KEYS.EXAM_CENTER, form);
  }, [form]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, String(v)));
      fd.append('orgId', organization!.id);
      const result = await saveExamCenter(fd);
      if (result.error) return setError(result.error);
      if (result.examCenter) {
        setExamCenterFromDB(result.examCenter);
        onComplete(form);
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
      <StepHeader
        label="Step 2 of 4"
        title="Configure your exam center"
        description="These details appear on all MSBTE-issued documents. Required fields are marked."
      />

      <div className="space-y-10">
        {/* Section: Center identity */}
        <FormSection title="Center information">
          <div className="grid sm:grid-cols-2 gap-4">
            <FormField label="Center code" required>
              <Input
                value={form.code}
                onChange={(e) => set('code', e.target.value.toUpperCase())}
                placeholder="1234"
                required
                className="h-10"
              />
            </FormField>
            <FormField label="Center name" required>
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

        {/* Section: Examination session */}
        <FormSection title="Examination session">
          <div className="grid sm:grid-cols-2 gap-4">
            <FormField label="Season" required>
              <RadioGroup
                value={form.season}
                onValueChange={(v) => set('season', v)}
                className="flex gap-6 mt-2"
              >
                {['Summer', 'Winter'].map((s) => (
                  <label
                    key={s}
                    className="flex items-center gap-2 cursor-pointer text-sm text-neutral-700 dark:text-neutral-300"
                  >
                    <RadioGroupItem value={s} />
                    {s}
                  </label>
                ))}
              </RadioGroup>
            </FormField>
            <FormField label="Exam year" required>
              <Select
                value={String(form.examYear)}
                onValueChange={(v) => set('examYear', Number(v))}
              >
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {YEARS.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          </div>
        </FormSection>

        {/* Section: Distribution center */}
        <FormSection title="Distribution center">
          <div className="grid sm:grid-cols-2 gap-4">
            <FormField label="Distribution code" required>
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

        {/* Section: Administrative contacts */}
        <FormSection title="Administrative contacts">
          <div className="grid sm:grid-cols-2 gap-4">
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

        {/* Section: Location */}
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

        <ActionBar onBack={onBack} submitLabel="Save and continue" loading={isPending} />
      </div>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step: Subscription
// ─────────────────────────────────────────────────────────────────────────────

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
  // Find the recommended plan — first with popular flag, else first plan
  const recommended = plans.find((p) => p.popular) ?? plans[0];

  return (
    <div>
      <StepHeader
        label="Step 3 of 4"
        title="Choose a subscription"
        description="All plans include full access to every feature. Select the one that matches your institution's exam cycle."
      />

      <div className="space-y-3 mb-10">
        {plans.map((plan) => {
          const isSelected = plan.id === selectedId;
          const isRecommended = plan.id === recommended.id;
          const Icon = planIcon(plan.id);

          return (
            <button
              key={plan.id}
              type="button"
              onClick={() => onSelect(plan.id)}
              aria-pressed={isSelected}
              className={cn(
                'w-full text-left rounded-xl border-2 p-5 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2',
                isSelected
                  ? 'border-emerald-500 bg-white dark:bg-neutral-900'
                  : 'border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 hover:border-neutral-300 dark:hover:border-neutral-700',
                // De-emphasise non-recommended when nothing selected
                !isSelected && !isRecommended && 'opacity-80'
              )}
            >
              <div className="flex items-start gap-4">
                {/* Selector circle */}
                <div
                  className={cn(
                    'mt-0.5 h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors',
                    isSelected
                      ? 'border-emerald-500 bg-emerald-500'
                      : 'border-neutral-300 dark:border-neutral-600'
                  )}
                >
                  {isSelected && <Check className="h-3 w-3 text-white" strokeWidth={2.5} />}
                </div>

                {/* Plan body */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-3 flex-wrap mb-1">
                    <span
                      className={cn(
                        'font-semibold text-neutral-900 dark:text-neutral-100',
                        !isRecommended && !isSelected && 'text-neutral-600 dark:text-neutral-400'
                      )}
                    >
                      {plan.title}
                    </span>
                    {isRecommended && (
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                        Recommended
                      </span>
                    )}
                  </div>
                  <p
                    className={cn(
                      'text-sm mb-3',
                      isRecommended || isSelected
                        ? 'text-neutral-500 dark:text-neutral-400'
                        : 'text-neutral-400 dark:text-neutral-500'
                    )}
                  >
                    {plan.description}
                  </p>

                  {/* Features — only show on recommended or selected */}
                  {(isRecommended || isSelected) && (
                    <ul className="space-y-1">
                      {plan.features.map((f) => (
                        <li
                          key={f}
                          className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400"
                        >
                          <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                          {f}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Price */}
                <div className="text-right shrink-0 ml-4">
                  <div
                    className={cn(
                      'text-2xl font-semibold tracking-tight',
                      isRecommended || isSelected
                        ? 'text-neutral-900 dark:text-neutral-100'
                        : 'text-neutral-500 dark:text-neutral-500'
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

      {/* Non-form action bar */}
      <div className="flex items-center gap-4 pt-8 border-t border-neutral-100 dark:border-neutral-800">
        <Button
          type="button"
          variant="ghost"
          onClick={onBack}
          className="text-neutral-500 hover:text-neutral-700 font-normal"
        >
          Back
        </Button>
        <Button
          type="button"
          onClick={onContinue}
          disabled={!selectedId}
          className="h-11 px-8 bg-emerald-600 hover:bg-emerald-700 font-medium text-white"
        >
          Review order
          <span className="ml-2">→</span>
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step: Payment Review
// ─────────────────────────────────────────────────────────────────────────────

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

      <div className="space-y-8 mb-10">
        {/* Setup summary */}
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-4">
            Your setup
          </p>
          <dl className="space-y-3">
            {reviewRows.map(({ label, value }) => (
              <div key={label} className="flex justify-between items-baseline gap-4">
                <dt className="text-sm text-neutral-500 dark:text-neutral-400 shrink-0">{label}</dt>
                <dd className="text-sm font-medium text-neutral-900 dark:text-neutral-100 text-right">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <Separator />

        {/* Plan summary */}
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-4">
            Selected plan
          </p>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-semibold text-neutral-900 dark:text-neutral-100">{plan.title}</p>
              <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
                {plan.description}
              </p>
              <ul className="mt-3 space-y-1">
                {plan.features.map((f) => (
                  <li
                    key={f}
                    className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400"
                  >
                    <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
            <div className="text-right shrink-0">
              <div className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
                {plan.price}
              </div>
              <div className="text-xs text-neutral-400">per {plan.period}</div>
            </div>
          </div>
        </div>

        <Separator />

        {/* Total */}
        <div className="flex justify-between items-baseline">
          <span className="text-base font-medium text-neutral-900 dark:text-neutral-100">
            Total due today
          </span>
          <span className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
            {plan.price}
          </span>
        </div>

        {/* Promo code — secondary, below total */}
        <div>
          {!promoOpen ? (
            <button
              type="button"
              onClick={() => setPromoOpen(true)}
              className="text-sm text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 underline underline-offset-2 transition-colors"
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
                  className="flex-1 h-9 font-mono text-sm tracking-wider"
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
                  className="text-neutral-400 px-2"
                >
                  ✕
                </Button>
              </div>
              {promoStatus && (
                <div
                  className={cn(
                    'text-sm flex items-center gap-2',
                    promoStatus.valid
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                  )}
                >
                  {promoStatus.valid ? (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      30-day trial access for ₹1
                      <Button
                        type="button"
                        size="sm"
                        onClick={onActivatePromo}
                        disabled={loading}
                        className="ml-auto h-8 bg-emerald-600 hover:bg-emerald-700"
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

      {/* Actions */}
      <div className="flex items-center gap-4 pt-8 border-t border-neutral-100 dark:border-neutral-800">
        <Button
          type="button"
          variant="ghost"
          onClick={onBack}
          className="text-neutral-500 hover:text-neutral-700 font-normal"
        >
          Back
        </Button>
        <Button
          type="button"
          onClick={onConfirm}
          disabled={loading}
          className="h-11 px-8 bg-emerald-600 hover:bg-emerald-700 font-medium text-white"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              Pay {plan.price}
              <span className="ml-2">→</span>
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

// ─────────────────────────────────────────────────────────────────────────────
// Step: Complete
// ─────────────────────────────────────────────────────────────────────────────

function CompleteStep({ onComplete }: { onComplete: () => void }) {
  useEffect(() => {
    clearOnboardingStorage();
  }, []);

  const nextSteps = [
    { icon: Calendar, label: 'Configure timetable', desc: 'Upload or build your exam schedule' },
    { icon: Users, label: 'Add supervisors', desc: 'Invite administrative staff' },
    { icon: LayoutDashboard, label: 'Set up seating', desc: 'Configure room layouts' },
    { icon: FileText, label: 'Generate reports', desc: 'MSBTE-compliant documents' },
  ];

  return (
    <div>
      <div className="flex items-center gap-3 mb-8">
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', damping: 20, stiffness: 300 }}
        >
          <div className="h-10 w-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
        </motion.div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            Setup complete
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            Your institution is ready
          </h1>
        </div>
      </div>

      <p className="text-[15px] text-neutral-500 dark:text-neutral-400 leading-relaxed mb-10 max-w-lg">
        Everything is configured. Here are the recommended next steps to get your exam center fully
        operational.
      </p>

      <div className="space-y-3 mb-10">
        {nextSteps.map(({ icon: Icon, label, desc }) => (
          <div
            key={label}
            className="flex items-start gap-4 p-4 rounded-lg border border-neutral-100 dark:border-neutral-800 bg-white dark:bg-neutral-900"
          >
            <div className="h-8 w-8 rounded bg-neutral-50 dark:bg-neutral-800 flex items-center justify-center shrink-0">
              <Icon className="h-4 w-4 text-neutral-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200">{label}</p>
              <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-0.5">{desc}</p>
            </div>
          </div>
        ))}
      </div>

      <Button
        onClick={onComplete}
        className="h-11 px-8 bg-emerald-600 hover:bg-emerald-700 font-medium text-white"
      >
        <Rocket className="mr-2 h-4 w-4" />
        Go to dashboard
      </Button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Root page — orchestrates all steps + shell
// ─────────────────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
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

  // Live summary — updated as user progresses
  const [summary, setSummary] = useState<SetupSummaryData>({});

  const router = useRouter();
  const { user } = useUser();

  // ── Fetch DB status on mount, hydrate step + summary ──────────────────────

  useEffect(() => {
    getOnboardingStatus().then((result) => {
      setDbStatus(result);

      // Determine starting step
      const targetStep = STATUS_TO_STEP[result.status as string];
      if (targetStep) {
        setCurrentStep(targetStep);
      } else if (result.status === 'subscription_expired') {
        router.push('/billing');
        return;
      } else if (result.status === 'complete') {
        router.push('/exam-center/dashboard');
        return;
      }

      // Hydrate summary from DB data
      const data = result.data as any;
      if (data) {
        setSummary({
          orgName: data.organization?.name,
          centerCode: data.examCenter?.code,
          centerName: data.examCenter?.name,
          season: data.examCenter?.season,
          examYear: data.examCenter?.examYear,
        });
      }

      // Pre-select plan
      const plans: Plan[] = result.plans ?? pricingPlans;
      const preferred =
        readStorage<string>(STORAGE_KEYS.SELECTED_PLAN) ??
        plans.find((p) => p.popular)?.id ??
        plans[0]?.id ??
        '';
      setSelectedPlanId(preferred);

      setPageLoading(false);
    });
  }, [router]);

  // ── Razorpay helpers ──────────────────────────────────────────────────────

  const verifyPayment = async (
    response: {
      razorpay_payment_id: string;
      razorpay_order_id: string;
      razorpay_signature: string;
    },
    planId: string
  ) => {
    const res = await fetch('/api/payments/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'verify', planId, ...response }),
    });
    if (res.ok) {
      setCurrentStep('complete');
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
        () => setPaymentLoading(false)
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Payment failed. Try again.');
      setPaymentLoading(false);
    }
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
      await ensureRazorpay();
      openRazorpay(
        {
          key: result.keyId,
          amount: result.amount,
          currency: result.currency,
          name: 'TestForge',
          description: '30-Day Trial Access',
          order_id: result.orderId,
          handler: (r: Parameters<typeof verifyPayment>[0]) => verifyPayment(r, 'trial_30day'),
          prefill,
          theme,
        },
        () => setPaymentLoading(false)
      );
    } catch {
      setPromoStatus({ valid: false, error: 'Failed to process trial' });
      setPaymentLoading(false);
    }
  };

  // ── Step helpers ──────────────────────────────────────────────────────────

  const go = (step: StepId) => setCurrentStep(step);

  const plans: Plan[] = dbStatus?.plans ?? pricingPlans;
  const selectedPlan = plans.find((p) => p.id === selectedPlanId);

  // ── Loading screen ────────────────────────────────────────────────────────

  if (pageLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50 dark:bg-neutral-950">
        <Loader2 className="h-8 w-8 animate-spin text-neutral-300" />
      </div>
    );
  }

  // ── DB-sourced prefill data ───────────────────────────────────────────────
  const dbData = dbStatus?.data as any;

  return (
    <>
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />

      <OnboardingShell currentStep={currentStep} summaryData={summary}>
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
                onComplete={({ name }) => {
                  setSummary((s) => ({ ...s, orgName: name }));
                  go('exam_center');
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
                    season: data.season,
                    examYear: data.examYear,
                  }));
                  go('subscription');
                }}
                onBack={() => go('organization')}
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
                onContinue={() => go('review')}
                onBack={() => go('exam_center')}
              />
            )}

            {currentStep === 'review' && selectedPlan && (
              <ReviewStep
                summary={summary}
                plan={selectedPlan}
                onConfirm={handlePay}
                onBack={() => go('subscription')}
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
    </>
  );
}
