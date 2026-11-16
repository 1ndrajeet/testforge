'use client';

/* TestForge landing page — single file, no split components.
   NOTE: 'use client' means this file cannot export `metadata`. Put title/description in the
   route's layout.tsx. Copy repositioned: "From timetable files to exam-ready paperwork, in one workflow." */
import { useEffect, useRef, useState } from 'react';

import pricing from '@/config/pricing.json';
import type { Session } from '@supabase/supabase-js';
import {
  ArrowDown,
  ArrowRight,
  Building2,
  CalendarDays,
  Check,
  CreditCard,
  FileText,
  FileUp,
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  type LucideIcon,
  Mail,
  Menu,
  Package,
  Phone,
  Rows3,
  ShieldAlert,
  User,
  UserCheck,
  UserX,
} from 'lucide-react';

import { createClient } from '@/lib/supabase/client';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';

import { Logo } from '@/components/layout/header';

/* Routes: /exam-center/dashboard is guarded by src/proxy.ts. Visitors without a session are sent to
   /login, then through onboarding (organization, exam center, subscription). */
const ROUTES = { getStarted: '/exam-center/dashboard', signIn: '/exam-center/dashboard' } as const;
const PHONE_HREF = 'tel:+918208607477';
const PHONE_LABEL = '+91 82086 07477';

/* ---------------------------- Pricing (pricing.json) ---------------------------- */
interface Plan {
  id: string;
  title: string;
  price: string;
  launchPrice?: string;
  launchOffer?: string;
  period: string;
  description: string;
  features: string[];
  popular?: boolean;
  highlight?: string;
  highlightDetail?: string;
  cta: string;
  amount: number;
  disabled?: boolean;
}
const plans = pricing as Plan[];
const recommended = plans.find((p) => p.popular) ?? plans[0];
const others = plans.filter((p) => p.id !== recommended.id);
const allFeatures = Array.from(new Set(plans.flatMap((p) => p.features)));
const billing = (period: string) => (period === 'one-time' ? 'one-time payment' : `per ${period}`);
const leadPrice = (p: Plan) => p.launchPrice ?? p.price;

/* Comparison rows are grouped for readability. Features not listed here fall into "More". */
const featureGroups: [string, string[]][] = [
  [
    'The product',
    [
      'Complete TestForge suite',
      'Full MSBTE compliance',
      'Automation & AI assistance',
      'Lifetime software access',
      'Unlimited examination sessions',
    ],
  ],
  [
    'Updates and early access',
    [
      'Regular updates',
      'Priority updates',
      'Lifetime feature updates',
      'All future AI modules',
      'Priority feature requests',
      'Early access to Beta features',
      'AI feature previews',
    ],
  ],
  [
    'Support and data',
    ['Cloud backup', 'Full technical support', 'VIP technical support', 'Dedicated onboarding'],
  ],
];
const groupedFeatures = (() => {
  const used = new Set(featureGroups.flatMap(([, l]) => l));
  const groups = featureGroups.map(
    ([label, list]) => [label, allFeatures.filter((f) => list.includes(f))] as [string, string[]],
  );
  const rest = allFeatures.filter((f) => !used.has(f));
  if (rest.length) groups.push(['More', rest]);
  return groups.filter(([, l]) => l.length);
})();

const joinList = (items: string[]) =>
  items.length < 2
    ? items.join('')
    : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
const titlesWith = (re: RegExp) =>
  plans.filter((p) => p.features.some((f) => re.test(f))).map((p) => p.title);
const termTitles = plans.filter((p) => p.period !== 'one-time').map((p) => p.title);
const oneTimeTitles = plans.filter((p) => p.period === 'one-time').map((p) => p.title);
const onboardingTitles = titlesWith(/dedicated onboarding/i);
const backupTitles = titlesWith(/cloud backup/i);
const vipPlan = plans.find((p) => p.features.some((f) => /^VIP/i.test(f)));

/* ---------------------------------- Content ---------------------------------- */
const navLinks = [
  { href: '#workflow', label: 'How it works' },
  { href: '#modules', label: 'Features' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#faq', label: 'FAQ' },
];

const heroIn = [
  { t: 'MSBTE timetable', d: 'An HTML file with dates, sessions, subjects and schemes.' },
  {
    t: 'Seating charts and arrangement',
    d: 'Excel files, cleaned on upload.',
  },
  { t: 'QP inventory', d: 'An Excel file, mapped to the timetable and paper codes.' },
  { t: 'E-marksheets', d: 'Excel files, mapped to paper codes.' },
];
const heroOut = [
  { t: 'Block allocations', d: 'Students placed in blocks.' },
  {
    t: 'Supervisor assignments and duty orders',
    d: 'Supervisor, reliever and chief orders, emailed with a delivery log.',
  },
  { t: 'Exam-day records', d: 'Absentees, copy cases and question paper accounting.' },
  {
    t: 'Official forms and reports',
    d: 'MSBTE forms F1 to F22, packing slips and notices, ready to print.',
  },
];

const challenges: [string, string][] = [
  [
    'Many files, many formats',
    'The timetable, seating charts, QP inventory and marksheet records each arrive in a different format.',
  ],
  [
    "Records that don't quite match",
    'Student, subject, scheme and timetable details have to agree before anyone can be seated.',
  ],
  [
    'Plans that keep changing',
    'Seating and supervision get revised whenever staff availability changes.',
  ],
  [
    'Exam-day records and paperwork',
    'Absentees, copy cases and QP packets are tracked per session, and forms, notices and orders all need the same details again.',
  ],
];

const flow: { t: string; d: string; uses?: string }[] = [
  { t: 'Upload', d: 'Add your timetable HTML and Excel files. They are cleaned and validated.' },
  {
    t: 'Configure',
    d: 'Set up rooms, blocks, capacities, supervisors, relievers and control-room staff.',
  },
  {
    t: 'Allocate',
    d: 'Spread students across blocks and assign a supervisor to each.',
    uses: 'Builds on steps 1 and 2',
  },
  {
    t: 'Notify',
    d: 'Generate supervisor, reliever and chief orders and email them, with a delivery log.',
    uses: 'Builds on step 3',
  },
  {
    t: 'Run the exam',
    d: 'Record absentees and copy cases, and account for QP packets, by date and session.',
    uses: 'Builds on step 1',
  },
  {
    t: 'Report',
    d: 'Print MSBTE forms F1 to F22, packing slips, notices and reports.',
    uses: 'Builds on steps 1 to 5',
  },
];

interface Module {
  t: string;
  d: string;
  Icon: LucideIcon;
}
const phases: { label: string; note: string; items: Module[] }[] = [
  {
    label: 'Before the paper',
    note: 'Planning and allocation',
    items: [
      {
        t: 'Timetable Management',
        d: 'Import the MSBTE timetable and browse it by date and session, with subject codes, schemes and student counts.',
        Icon: CalendarDays,
      },
      {
        t: 'Seating Arrangement',
        d: "Upload each connected institute's seating chart and the MSBTE seating arrangement, then resolve student–paper mismatches.",
        Icon: LayoutGrid,
      },
      {
        t: 'Block Allocation',
        d: 'Define rooms with capacity and layout, auto-allocate students for any date and session, and clear and re-run when plans change.',
        Icon: Rows3,
      },
      {
        t: 'Supervisor Allocation',
        d: 'Keep internal and external supervisors and relievers on record, assign them to blocks, and swap them when someone is absent.',
        Icon: UserCheck,
      },
      {
        t: 'Duty Orders',
        d: 'Generate supervisor, reliever and chief orders from your allocation and email them in bulk, with delivery logs.',
        Icon: Mail,
      },
    ],
  },
  {
    label: 'During the paper',
    note: 'Coordination and records',
    items: [
      {
        t: 'Control Room Management',
        d: 'Keep control-room staff on record for examination coordination.',
        Icon: Building2,
      },
      {
        t: 'Absent Students',
        d: 'Record absent seat numbers for each morning and afternoon session.',
        Icon: UserX,
      },
      {
        t: 'Copy Cases',
        d: "Record unfair-means cases with seat number, paper code and the supervisor's statement.",
        Icon: ShieldAlert,
      },
      {
        t: 'QP Inventory and Accounting',
        d: 'Compare expected and received question paper packets, then reconcile opened, used and returned papers.',
        Icon: Package,
      },
    ],
  },
  {
    label: 'After the paper',
    note: 'Marksheets and review',
    items: [
      {
        t: 'E-Marksheet Upload',
        d: 'Upload e-marksheet records and map sheet numbers to paper codes.',
        Icon: FileUp,
      },
      {
        t: 'Reports',
        d: 'Print official MSBTE forms plus TestForge reports such as daily summaries, door notices and staff duty rosters.',
        Icon: FileText,
      },
    ],
  },
];
const moduleCount = phases.reduce((n, ph) => n + ph.items.length, 0);

const stories = [
  {
    t: 'From source files to clean records',
    task: 'Bring the timetable, seating charts and seating arrangement into one consistent record.',
    manual: "Files are retyped or merged, then checked against each student's subject list.",
    support:
      'The timetable HTML is read for dates, sessions, subject codes and schemes. Excel files with title rows, split cells or summary rows are cleaned and validated on upload. The seating arrangement is compared with student records, and missing subjects, extra subjects and scheme mismatches are listed for you to review. Corrections are applied only after you confirm, and you can cancel.',
    value: 'A short mismatch list to review, instead of a search across files.',
  },
  {
    t: 'From allocation to official forms',
    task: 'Seat every student, name a supervisor for every block, and produce the forms the center must file.',
    manual:
      'Seat lists and forms are retyped for each date and session, and a supervisor change means redoing them.',
    support:
      'Choose a date and session, and auto-allocation spreads students across your blocks without placing students of the same subject on adjacent seats. Assign supervisors to blocks and swap them when needed. The same records produce forms F1 to F22, including the supervisor report, candidate attendance sheet and seating statement, plus door notices, daily summaries and duty rosters, printed from the browser.',
    value: 'A late staff change means swapping one name and reprinting, not rebuilding the paperwork.',
  },
];

const benefits = [
  [
    'Enter it once',
    'Timetable, seating and staff details go in one time. Allocation, orders and reports draw on the same records.',
  ],
  [
    'Change plans without starting over',
    'Swap a supervisor, clear and re-run an allocation, or record absentees without rebuilding lists.',
  ],
  [
    'Orders without retyping',
    'Duty orders come from the allocation and are emailed to the staff named in it, with a delivery log to check.',
  ],
];

const faqs = [
  [
    'Is TestForge an online exam or learning platform?',
    "No. TestForge doesn't deliver exams to students. It helps exam centers organise timetables, seating, staff duty, exam-day records and official paperwork.",
  ],
  [
    'Who is it designed for?',
    'Exam centers and polytechnic institutes in Maharashtra that conduct MSBTE examinations. A center can host students from several connected institutes. Principals, officers in charge, examination controllers and authorised staff use it.',
  ],
  [
    'Which files can we upload?',
    'The timetable is uploaded as HTML (.html or .htm). Seating charts, the seating arrangement, QP inventory and e-marksheets are uploaded as Excel (.xlsx or .xls). Seating charts are uploaded for each connected institute.',
  ],
  [
    'What happens when a plan term ends?',
    `${joinList(termTitles)} ${termTitles.length === 1 ? 'is a fixed-term plan' : 'are fixed-term plans'}${oneTimeTitles.length ? `, and ${joinList(oneTimeTitles)} is a one-time payment` : ''}. When a term ends, the exam-center modules direct you to the billing page to renew.`,
  ],
  [
    'How do we get started?',
    `Select Get started. You sign in or register, set up your organisation and exam center, and then choose a plan. Call ${PHONE_LABEL} if you'd like help choosing.`,
  ],
  [
    'What support is available?',
    `Every plan lists technical support${vipPlan ? `, with VIP support on the ${vipPlan.title} plan` : ''}. ${onboardingTitles.length ? `Dedicated onboarding is listed on the ${joinList(onboardingTitles)} ${onboardingTitles.length === 1 ? 'plan' : 'plans'}. ` : ''}For anything else, call ${PHONE_LABEL} before you decide.`,
  ],
  [
    'How is institute data handled?',
    `Records are stored per exam center, and you must sign in to reach them. ${backupTitles.length ? `Cloud backup is listed on the ${joinList(backupTitles)} ${backupTitles.length === 1 ? 'plan' : 'plans'}. ` : ''}For details on storage, backups and who can access your data, call ${PHONE_LABEL} before you commit.`,
  ],
];

/* ------------------------------ Auth state ------------------------------ */
type AuthUser = { name?: string; email?: string; image?: string };
type AuthState =
  { status: 'loading' } | { status: 'signed-out' } | { status: 'signed-in'; user: AuthUser };

const fromSession = (s: Session | null): AuthState => {
  if (!s) return { status: 'signed-out' };
  const meta = s.user.user_metadata ?? {};
  return {
    status: 'signed-in',
    user: {
      name:
        (meta.full_name as string | undefined) ??
        (meta.name as string | undefined) ??
        (meta.user_name as string | undefined) ??
        undefined,
      email: s.user.email ?? undefined,
      image:
        (meta.avatar_url as string | undefined) ??
        (meta.picture as string | undefined) ??
        (meta.image as string | undefined) ??
        undefined,
    },
  };
};

function useAuthState(): AuthState {
  const [state, setState] = useState<AuthState>({ status: 'loading' });
  useEffect(() => {
    const supabase = createClient();
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) setState(fromSession(data.session));
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setState(fromSession(session));
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);
  return state;
}

async function signOutNow() {
  const supabase = createClient();
  try {
    await supabase.auth.signOut();
  } finally {
    window.location.assign('/login');
  }
}

/* ------------------------------ Avatar ------------------------------ */
function gradientFor(seed?: string) {
  const key = (seed ?? 'anon').toLowerCase();
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) % 360;
  return `linear-gradient(135deg, hsl(${h} 55% 42%), hsl(${(h + 40) % 360} 60% 32%))`;
}

function initialsFrom(name?: string, email?: string) {
  const src = (name ?? email ?? '').trim();
  if (!src) return 'U';
  const parts = src.split(/[\s@._-]+/).filter(Boolean);
  const a = parts[0]?.[0] ?? 'U';
  const b = parts.length > 1 ? parts[1][0] : '';
  return (a + b).toUpperCase().slice(0, 2);
}

function Avatar({
  user,
  size = 32,
  className = '',
}: {
  user?: AuthUser;
  size?: number;
  className?: string;
}) {
  const initials = initialsFrom(user?.name, user?.email);
  const [broken, setBroken] = useState(false);
  const showImage = !!user?.image && !broken;

  return (
    <span
      aria-hidden="true"
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full text-white ring-1 ring-black/5 ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(10, Math.round(size * 0.36)),
        fontWeight: 600,
        background: showImage ? undefined : gradientFor(user?.email),
        letterSpacing: '0.02em',
      }}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={user!.image!}
          alt=""
          referrerPolicy="no-referrer"
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
          onError={() => setBroken(true)}
        />
      ) : (
        initials
      )}
    </span>
  );
}

/* ------------------------------ Account menu (shadcn DropdownMenu) ------------------------------ */
const menuIcon = 'h-4 w-4 text-slate-500';
const menuRow = 'flex cursor-pointer items-center gap-2.5';

function AccountMenu({ user }: { user: AuthUser }) {
  const [busy, setBusy] = useState(false);
  const displayName = user.name ?? user.email ?? 'Signed in';
  const showEmail = !!user.name && !!user.email && user.name !== user.email;

  const handleSignOut = async (e: Event) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await signOutNow();
    } catch {
      setBusy(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Account menu for ${displayName}`}
        className="rounded-full transition-shadow hover:ring-2 hover:ring-emerald-700/30 focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2 focus-visible:ring-offset-[#f2f4f1] focus-visible:outline-none"
      >
        <Avatar
          user={user}
          size={32}
        />
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-64 p-1.5"
      >
        <DropdownMenuLabel className="flex items-center gap-3 px-2.5 py-2">
          <Avatar
            user={user}
            size={36}
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">{displayName}</p>
            {showEmail && <p className="truncate text-xs text-slate-500">{user.email}</p>}
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <DropdownMenuItem asChild>
          <a
            href="/exam-center/settings/profile"
            className={menuRow}
          >
            <User
              className={menuIcon}
              aria-hidden="true"
            />
            Profile
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a
            href="/exam-center/dashboard"
            className={menuRow}
          >
            <LayoutDashboard
              className={menuIcon}
              aria-hidden="true"
            />
            Dashboard
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a
            href="/billing"
            className={menuRow}
          >
            <CreditCard
              className={menuIcon}
              aria-hidden="true"
            />
            Billing
          </a>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onSelect={handleSignOut}
          disabled={busy}
          className={`${menuRow} text-red-600 focus:bg-red-50 focus:text-red-700 data-[disabled]:opacity-60`}
        >
          <LogOut
            className="h-4 w-4"
            aria-hidden="true"
          />
          {busy ? 'Signing out…' : 'Sign out'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ------------------------------ Mobile menu (shadcn Sheet) ------------------------------ */
const mobileRow =
  'flex min-h-11 items-center gap-2.5 rounded-md px-2 text-sm text-slate-700 hover:bg-slate-200/60';

function MobileMenu({
  auth,
  open,
  onOpenChange,
}: {
  auth: AuthState;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);

  const handleSignOut = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await signOutNow();
    } catch {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
    >
      <SheetTrigger
        aria-label={open ? 'Close menu' : 'Open menu'}
        className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-slate-900 text-slate-900 md:hidden"
      >
        <Menu
          className="h-5 w-5"
          aria-hidden="true"
        />
      </SheetTrigger>

      <SheetContent
        side="right"
        id="mobile-menu"
        className="w-[88vw] max-w-sm border-l border-slate-300 bg-[#f2f4f1] p-0"
      >
        <SheetHeader className="border-b border-dashed border-slate-300 px-5 py-4 text-left">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <div className="[&_.font-semibold]:!text-slate-900 [&_.text-xs]:!text-slate-500">
            <Logo compact={false} />
          </div>
        </SheetHeader>

        <nav
          aria-label="Primary mobile"
          className="flex flex-col px-5 py-2"
        >
          {navLinks.map((l) => (
            <a
              key={l.href}
              href={l.href}
              onClick={() => onOpenChange(false)}
              className="flex min-h-12 items-center border-b border-dashed border-slate-300 text-sm font-medium text-slate-700 hover:text-slate-950"
            >
              {l.label}
            </a>
          ))}

          {auth.status === 'signed-out' && (
            <a
              href={ROUTES.signIn}
              onClick={() => onOpenChange(false)}
              className="flex min-h-12 items-center text-sm font-medium text-slate-700"
            >
              Sign in
            </a>
          )}

          {auth.status === 'signed-in' && (
            <div className="mt-4 border-t border-dashed border-slate-300 pt-4">
              <div className="flex items-center gap-3">
                <Avatar
                  user={auth.user}
                  size={40}
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {auth.user.name ?? auth.user.email ?? 'Signed in'}
                  </p>
                  {auth.user.name && auth.user.email && (
                    <p className="truncate text-xs text-slate-500">{auth.user.email}</p>
                  )}
                </div>
              </div>

              <div className="mt-3 flex flex-col">
                <a
                  href="/exam-center/settings/profile"
                  onClick={() => onOpenChange(false)}
                  className={mobileRow}
                >
                  <User
                    className={menuIcon}
                    aria-hidden="true"
                  />{' '}
                  Profile
                </a>
                <a
                  href="/exam-center/dashboard"
                  onClick={() => onOpenChange(false)}
                  className={mobileRow}
                >
                  <LayoutDashboard
                    className={menuIcon}
                    aria-hidden="true"
                  />{' '}
                  Dashboard
                </a>
                <a
                  href="/billing"
                  onClick={() => onOpenChange(false)}
                  className={mobileRow}
                >
                  <CreditCard
                    className={menuIcon}
                    aria-hidden="true"
                  />{' '}
                  Billing
                </a>
                <button
                  type="button"
                  onClick={handleSignOut}
                  disabled={busy}
                  className="flex min-h-11 items-center gap-2.5 rounded-md px-2 text-left text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
                >
                  <LogOut
                    className="h-4 w-4"
                    aria-hidden="true"
                  />
                  {busy ? 'Signing out…' : 'Sign out'}
                </button>
              </div>
            </div>
          )}
        </nav>
      </SheetContent>
    </Sheet>
  );
}

/* ------------------------------ Header ------------------------------ */
function SiteHeader() {
  const auth = useAuthState();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState('');

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);

  useEffect(() => {
    const els = navLinks.map((l) => document.querySelector(l.href)).filter(Boolean) as Element[];
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) setActive(`#${e.target.id}`);
        }),
      { rootMargin: '-30% 0px -60% 0px' },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  const signedIn = auth.status === 'signed-in';

  const navItem = (l: { href: string; label: string }) => (
    <a
      key={l.href}
      href={l.href}
      aria-current={active === l.href ? 'true' : undefined}
      className={`text-sm font-medium transition-colors ${active === l.href ? 'text-emerald-800' : 'text-slate-700 hover:text-slate-950'
        }`}
    >
      {l.label}
    </a>
  );

  return (
    <header
      className={`sticky top-0 z-40 border-b transition-[background-color,box-shadow,border-color] duration-200 ${scrolled
          ? 'border-slate-400 bg-[#f2f4f1]/95 shadow-[0_2px_8px_-4px_rgba(15,23,42,.25)]'
          : 'border-slate-300 bg-[#f2f4f1]'
        }`}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
        <div className="[&_.font-semibold]:!text-slate-900 [&_.text-xs]:!text-slate-500">
          <Logo compact={false} />
        </div>

        <nav
          aria-label="Primary"
          className="hidden items-center gap-7 md:flex"
        >
          {navLinks.map(navItem)}
        </nav>

        <div className="flex items-center gap-3">
          <div className="hidden min-w-[3rem] justify-end sm:flex md:min-w-[6.5rem]">
            {auth.status === 'loading' ? (
              <span
                aria-hidden="true"
                className="inline-block h-8 w-8 animate-pulse rounded-full bg-slate-200"
              />
            ) : signedIn ? (
              <AccountMenu user={auth.user} />
            ) : (
              <a
                href={ROUTES.signIn}
                className="text-sm font-medium text-slate-700 hover:text-slate-950"
              >
                Sign in
              </a>
            )}
          </div>

          <a
            href={ROUTES.getStarted}
            className="tf-btn group inline-flex min-h-11 min-w-[8.5rem] items-center justify-center gap-1.5 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-emerald-800"
          >
            {signedIn ? 'Open dashboard' : 'Get started'}
            <ArrowRight
              className="tf-arrow h-4 w-4"
              aria-hidden="true"
            />
          </a>

          <MobileMenu
            auth={auth}
            open={open}
            onOpenChange={setOpen}
          />
        </div>
      </div>
    </header>
  );
}

/* ------------------------------ Reveal on scroll ------------------------------ */
function Reveal({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (el.getBoundingClientRect().top < window.innerHeight) return;
    el.classList.add('tf-pre');
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          el.classList.add('tf-shown');
          io.disconnect();
        }
      },
      { threshold: 0.08 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className={className}
    >
      {children}
    </div>
  );
}

/* ------------------------------ Small components ------------------------------ */
function Cta({
  dark = false,
  children = 'Get started',
}: {
  dark?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <a
      href={ROUTES.getStarted}
      className={`tf-btn group inline-flex min-h-12 items-center justify-center gap-2 rounded-md px-6 text-[15px] font-semibold transition-colors ${dark
          ? 'bg-emerald-400 text-slate-950 hover:bg-emerald-300'
          : 'bg-emerald-700 text-white hover:bg-emerald-800'
        }`}
    >
      {children}
      <ArrowRight
        className="tf-arrow h-4 w-4"
        aria-hidden="true"
      />
    </a>
  );
}

function Price({ plan, big = false }: { plan: Plan; big?: boolean }) {
  return (
    <div>
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className={`tf-display text-slate-900 ${big ? 'text-6xl' : 'text-3xl'}`}>
          {leadPrice(plan)}
        </span>
        <span className="text-sm text-slate-600">{billing(plan.period)}</span>
      </p>
      {plan.launchPrice && (
        <p className="mt-1 text-sm text-slate-600">Regular price {plan.price}</p>
      )}
      {plan.launchOffer && (
        <p className="mt-2 border border-dashed border-emerald-700/60 bg-emerald-50 px-3 py-2 text-sm leading-5 text-emerald-900">
          {plan.launchOffer}
        </p>
      )}
    </div>
  );
}

function PlanAction({ plan, solid }: { plan: Plan; solid: boolean }) {
  if (plan.disabled) {
    return (
      <span
        aria-disabled="true"
        className="inline-flex min-h-12 items-center justify-center rounded-md bg-slate-200 px-6 text-[15px] font-semibold text-slate-500"
      >
        Not available
      </span>
    );
  }
  return (
    <a
      href={ROUTES.getStarted}
      className={`tf-btn inline-flex min-h-12 items-center justify-center rounded-md px-6 text-[15px] font-semibold transition-colors ${solid
          ? 'bg-emerald-700 text-white hover:bg-emerald-800'
          : 'border border-slate-900 text-slate-900 hover:bg-slate-900 hover:text-white'
        }`}
    >
      Get started
      <span className="sr-only"> with the {plan.title} plan</span>
    </a>
  );
}

function HeroColumn({
  heading,
  items,
  tone,
}: {
  heading: string;
  items: { t: string; d: string }[];
  tone: 'in' | 'out';
}) {
  return (
    <div
      className={
        tone === 'in'
          ? 'p-5 sm:border-r sm:border-dashed sm:border-slate-300'
          : 'border-t border-dashed border-slate-300 p-5 sm:border-t-0'
      }
    >
      <h3 className="text-sm font-semibold text-emerald-800">{heading}</h3>
      <ul className="mt-2 divide-y divide-dashed divide-slate-300">
        {items.map((c) => (
          <li
            key={c.t}
            className="tf-row -mx-2 px-2 py-3"
          >
            <p className="tf-display text-base text-slate-900">{c.t}</p>
            <p className="mt-0.5 text-sm leading-5 text-slate-600">{c.d}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Transformation() {
  return (
    <figure>
      <div className="tf-hero-grid grid border border-slate-900 bg-white sm:grid-cols-2">
        <HeroColumn
          heading="You upload"
          items={heroIn}
          tone="in"
        />
        <HeroColumn
          heading="TestForge produces"
          items={heroOut}
          tone="out"
        />
      </div>
      <p className="border border-t-0 border-slate-900 bg-emerald-50 px-5 py-2.5 text-center text-sm font-medium text-emerald-900">
        In between, TestForge checks and connects your records.
      </p>
      <figcaption className="mt-3 flex items-center gap-2 text-xs text-slate-500">
        <ArrowDown
          className="h-3.5 w-3.5 sm:-rotate-90"
          aria-hidden="true"
        />
        Illustrative summary of inputs and outputs. Not a live view of any institute&apos;s data.
      </figcaption>
    </figure>
  );
}

function ComparisonTable() {
  const cols = plans.length + 1;
  const tint = (p: Plan) => (p.id === recommended.id ? 'bg-emerald-50' : '');
  return (
    <div>
      <p className="mb-2 text-sm text-slate-500 md:hidden">Scroll sideways to compare all plans.</p>
      <div
        role="region"
        aria-label="Plan comparison"
        tabIndex={0}
        className="overflow-x-auto rounded-lg border border-slate-900 bg-white"
      >
        <table className="w-full min-w-[46rem] border-collapse text-left text-sm">
          <caption className="sr-only">Features listed for each TestForge plan</caption>
          <thead>
            <tr className="border-b border-slate-900">
              <th
                scope="col"
                className="p-4 font-semibold text-slate-500"
              >
                Plan
              </th>
              {plans.map((p) => (
                <th
                  key={p.id}
                  scope="col"
                  className={`p-4 font-semibold text-slate-900 ${tint(p)}`}
                >
                  {p.title}
                  {p.id === recommended.id && (
                    <span className="block text-xs font-medium text-emerald-800">Recommended</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-dashed border-slate-300">
              <th
                scope="row"
                className="p-4 font-medium text-slate-700"
              >
                Price
              </th>
              {plans.map((p) => (
                <td
                  key={p.id}
                  className={`p-4 font-semibold text-slate-900 ${tint(p)}`}
                >
                  {leadPrice(p)}
                </td>
              ))}
            </tr>
            <tr className="border-b border-slate-400">
              <th
                scope="row"
                className="p-4 font-medium text-slate-700"
              >
                Billing
              </th>
              {plans.map((p) => (
                <td
                  key={p.id}
                  className={`p-4 text-slate-700 ${tint(p)}`}
                >
                  {billing(p.period)}
                </td>
              ))}
            </tr>
            {groupedFeatures.map(([group, list]) => (
              <GroupRows
                key={group}
                group={group}
                list={list}
                cols={cols}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GroupRows({ group, list, cols }: { group: string; list: string[]; cols: number }) {
  return (
    <>
      <tr className="border-b border-slate-400 bg-slate-100">
        <th
          scope="colgroup"
          colSpan={cols}
          className="px-4 py-2.5 text-xs font-semibold text-slate-600"
        >
          {group}
        </th>
      </tr>
      {list.map((f) => (
        <tr
          key={f}
          className="tf-cell border-b border-dashed border-slate-300"
        >
          <th
            scope="row"
            className="p-4 font-medium text-slate-700"
          >
            {f}
          </th>
          {plans.map((p) => (
            <td
              key={p.id}
              className={`p-4 ${p.id === recommended.id ? 'bg-emerald-50' : ''}`}
            >
              {p.features.includes(f) ? (
                <>
                  <Check
                    className="h-4 w-4 text-emerald-700"
                    aria-hidden="true"
                  />
                  <span className="sr-only">Listed</span>
                </>
              ) : (
                <>
                  <span
                    aria-hidden="true"
                    className="text-slate-400"
                  >
                    –
                  </span>
                  <span className="sr-only">Not listed</span>
                </>
              )}
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function Faq() {
  return (
    <div className="border-t border-slate-900 lg:col-span-8">
      {faqs.map(([q, a]) => (
        <details
          key={q}
          className="border-b border-dashed border-slate-300"
        >
          <summary className="flex min-h-14 cursor-pointer items-center justify-between gap-6 py-4 text-left font-semibold text-slate-900">
            {q}
            <span
              aria-hidden="true"
              className="tf-chev shrink-0 text-2xl leading-none font-normal text-emerald-800"
            >
              +
            </span>
          </summary>
          <p className="max-w-2xl pb-6 text-[15px] leading-7 text-slate-600">{a}</p>
        </details>
      ))}
    </div>
  );
}

/* ------------------------------------- Page ------------------------------------- */
export default function LandingPage() {
  return (
    <div className="tf-root min-h-screen bg-[#f2f4f1] text-slate-800 antialiased">
      <style>{`
        .tf-root { --tf-serif: 'Iowan Old Style','Palatino Linotype',Palatino,'Book Antiqua',Georgia,serif; }
        html:has(.tf-root) { scroll-behavior: smooth; scroll-padding-top: 5rem; }
        .tf-display { font-family: var(--tf-serif); font-weight: 600; letter-spacing: -0.02em; }
        .tf-root a:focus-visible, .tf-root summary:focus-visible, .tf-root button:focus-visible, .tf-root [tabindex="0"]:focus-visible { outline: 3px solid #047857; outline-offset: 3px; border-radius: 4px; }
        .tf-dark a:focus-visible { outline-color: #6ee7b7; }
        .tf-root summary { list-style: none; }
        .tf-root summary::-webkit-details-marker { display: none; }
        .tf-root .tf-chev { transition: transform .2s ease; }
        .tf-root details[open] .tf-chev { transform: rotate(45deg); }
        .tf-root .tf-cell, .tf-root .tf-row { transition: background-color .2s ease; }
        .tf-root .tf-cell:hover, .tf-root .tf-cell:focus-within, .tf-root .tf-row:hover { background-color: #ecf3ee; }
        .tf-root .tf-icon { transition: color .2s ease; }
        .tf-root .tf-cell:hover .tf-icon { color: #065f46; }
        .tf-root .tf-stage .tf-dot { transition: background-color .2s ease, transform .2s ease; }
        .tf-root .tf-stage:hover .tf-dot, .tf-root .tf-stage:focus-within .tf-dot { background-color: #fff; transform: scale(1.25); }
        .tf-root .tf-stage:hover { background-color: rgba(255,255,255,.03); }
        .tf-root .tf-arrow { transition: transform .2s ease; }
        .tf-root .tf-btn:hover .tf-arrow { transform: translateX(2px); }
        .tf-btn:active { transform: translateY(1px); }
        .tf-pre { opacity: 0; transform: translateY(10px); }
        .tf-pre.tf-shown { opacity: 1; transform: none; transition: opacity .4s ease, transform .4s ease; }
        @keyframes tf-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
        .tf-hero-copy, .tf-hero-grid { animation: tf-in .5s ease both; }
        .tf-hero-grid { animation-delay: .08s; }
        .tf-root [data-radix-popper-content-wrapper] { z-index: 60; }
        .tf-root [role="menu"], .tf-root [role="dialog"] { font-family: inherit; }
        @media (prefers-reduced-motion: reduce) {
          html:has(.tf-root) { scroll-behavior: auto; }
          .tf-hero-copy, .tf-hero-grid { animation: none; }
          .tf-pre { opacity: 1; transform: none; }
          .tf-root .tf-arrow, .tf-root .tf-stage .tf-dot { transform: none !important; }
          .tf-root *, .tf-root *::before, .tf-root *::after { transition-duration: 0.01ms !important; }
        }
      `}</style>

      <a
        href="#main"
        className="sr-only z-50 rounded bg-slate-900 px-4 py-2 text-white focus:not-sr-only focus:fixed focus:top-4 focus:left-4"
      >
        Skip to content
      </a>

      <SiteHeader />

      <main id="main">
        {/* Hero */}
        <section className="mx-auto grid max-w-6xl gap-12 px-5 pt-14 pb-16 sm:px-8 lg:grid-cols-12 lg:items-center lg:gap-10 lg:pt-20 lg:pb-24">
          <div className="tf-hero-copy lg:col-span-5">
            <p className="text-sm font-medium text-emerald-800">
              For MSBTE exam centers and polytechnics
            </p>
            <h1 className="tf-display mt-4 text-[2.6rem] leading-[1.04] text-slate-950 sm:text-6xl">
              From timetable files to exam-ready paperwork, in one workflow.
            </h1>
            <p className="mt-6 max-w-lg text-lg leading-8 text-slate-700">
              Upload your MSBTE timetable and seating files. TestForge helps you check the records,
              allocate students and supervisors, keep exam-day records, and print forms F1 to F22
              from the same data.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Cta />
              <a
                href="#pricing"
                className="tf-btn inline-flex min-h-12 items-center justify-center px-2 text-[15px] font-semibold text-slate-900 underline decoration-slate-400 underline-offset-4 hover:decoration-slate-900"
              >
                See pricing
              </a>
            </div>
            <p className="mt-4 max-w-md text-sm leading-6 text-slate-600">
              Sign in or register, set up your exam center, then choose a plan.
            </p>
          </div>
          <div className="lg:col-span-7">
            <Transformation />
          </div>
        </section>

        {/* Problem */}
        <section
          id="problem"
          className="border-t border-slate-300 bg-white"
        >
          <Reveal className="mx-auto max-w-6xl px-5 py-20 sm:px-8 lg:py-24">
            <h2 className="tf-display max-w-2xl text-3xl leading-[1.1] text-slate-900 sm:text-4xl">
              An examination cycle is a lot of records to keep in step.
            </h2>
            <p className="mt-4 max-w-xl text-base leading-7 text-slate-600">
              None of this is unusual. It&apos;s simply what coordinating MSBTE examinations takes.
            </p>
            <dl className="mt-12 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
              {challenges.map(([k, v]) => (
                <div
                  key={k}
                  className="border-t border-slate-900 pt-4"
                >
                  <dt className="font-semibold text-slate-900">{k}</dt>
                  <dd className="mt-2 text-[15px] leading-7 text-slate-600">{v}</dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </section>

        {/* Workflow */}
        <section
          id="workflow"
          className="tf-dark bg-[#0c1626] py-20 text-slate-200 lg:py-28"
        >
          <Reveal className="mx-auto max-w-6xl px-5 sm:px-8">
            <h2 className="tf-display max-w-2xl text-3xl leading-[1.1] text-white sm:text-4xl">
              Six steps, from files to forms.
            </h2>
            <p className="mt-4 max-w-xl text-base leading-7 text-slate-300">
              Later steps reuse what you&apos;ve already entered, and you can return to any step
              when plans change.
            </p>
            <ol className="mt-14 grid gap-0 sm:grid-cols-2 lg:grid-cols-3">
              {flow.map((s, i) => (
                <li
                  key={s.t}
                  className="tf-stage relative border-l border-dashed border-slate-500 py-6 pl-6 sm:pr-6"
                >
                  <span
                    aria-hidden="true"
                    className="tf-dot absolute top-8 -left-[5px] h-[9px] w-[9px] rounded-full bg-emerald-300"
                  />
                  <p className="tf-display text-3xl text-emerald-300">{i + 1}</p>
                  <h3 className="mt-3 font-semibold text-white">{s.t}</h3>
                  <p className="mt-1.5 text-sm leading-6 text-slate-300">{s.d}</p>
                  {s.uses && <p className="mt-2 text-xs text-emerald-300">{s.uses}</p>}
                </li>
              ))}
            </ol>
          </Reveal>
        </section>

        {/* Features */}
        <section id="modules">
          <Reveal className="mx-auto max-w-6xl px-5 py-20 sm:px-8 lg:py-28">
            <h2 className="tf-display max-w-2xl text-3xl leading-[1.1] text-slate-900 sm:text-4xl">
              {moduleCount} modules, grouped by when the work happens.
            </h2>
            <p className="mt-4 max-w-xl text-base leading-7 text-slate-600">
              The steps above set the order. These are the tools your team opens within them.
            </p>
            <div className="mt-12 grid gap-10 lg:grid-cols-[1.35fr_1fr_0.8fr] lg:gap-0">
              {phases.map((ph, idx) => (
                <div
                  key={ph.label}
                  className={`lg:px-8 ${idx === 0 ? 'lg:pl-0' : 'lg:border-l lg:border-dashed lg:border-slate-400'} ${idx === phases.length - 1 ? 'lg:pr-0' : ''}`}
                >
                  <h3 className="tf-display text-xl text-slate-900">{ph.label}</h3>
                  <p className="text-sm text-slate-500">{ph.note}</p>
                  <ul className="mt-5 border-t border-slate-900">
                    {ph.items.map(({ t, d, Icon }) => (
                      <li
                        key={t}
                        className="tf-cell flex gap-4 border-b border-dashed border-slate-300 py-5"
                      >
                        <Icon
                          className="tf-icon mt-0.5 h-5 w-5 shrink-0 text-emerald-700"
                          aria-hidden="true"
                        />
                        <div>
                          <h4 className="font-semibold text-slate-900">{t}</h4>
                          <p className="mt-1 text-sm leading-6 text-slate-600">{d}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </Reveal>
        </section>

        {/* Workflow examples */}
        <section
          aria-labelledby="stories-title"
          className="border-y border-slate-300 bg-white"
        >
          <Reveal className="mx-auto max-w-6xl px-5 py-20 sm:px-8 lg:py-24">
            <h2
              id="stories-title"
              className="tf-display max-w-2xl text-3xl leading-[1.1] text-slate-900 sm:text-4xl"
            >
              Two jobs, start to finish.
            </h2>
            <div className="mt-12 grid gap-12 md:grid-cols-2">
              {stories.map((s) => (
                <article
                  key={s.t}
                  className="border-t border-slate-900 pt-6"
                >
                  <h3 className="tf-display text-2xl text-slate-900">{s.t}</h3>
                  <dl className="mt-5 divide-y divide-dashed divide-slate-300 text-[15px] leading-7">
                    {[
                      ['The task', s.task, false],
                      ['Typically by hand', s.manual, false],
                      ['In TestForge', s.support, true],
                      ['For your staff', s.value, false],
                    ].map(([k, v, hl]) => (
                      <div
                        key={k as string}
                        className={`grid gap-1 py-3 sm:grid-cols-[8rem_1fr] sm:gap-4 ${hl ? 'border-l-2 border-emerald-700 bg-emerald-50/50 pl-3' : ''}`}
                      >
                        <dt className="font-semibold text-slate-900">{k}</dt>
                        <dd className="text-slate-600">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </article>
              ))}
            </div>
          </Reveal>
        </section>

        {/* Benefits */}
        <section aria-labelledby="benefits-title">
          <Reveal className="mx-auto grid max-w-6xl gap-10 px-5 py-20 sm:px-8 lg:grid-cols-12 lg:py-24">
            <h2
              id="benefits-title"
              className="tf-display text-3xl leading-[1.1] text-slate-900 sm:text-4xl lg:col-span-5"
            >
              What changes for your examination team.
            </h2>
            <dl className="grid gap-y-8 lg:col-span-7">
              {benefits.map(([t, d]) => (
                <div
                  key={t}
                  className="border-l-2 border-emerald-700 pl-5"
                >
                  <dt className="font-semibold text-slate-900">{t}</dt>
                  <dd className="mt-1.5 text-[15px] leading-7 text-slate-600">{d}</dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </section>

        {/* Pricing */}
        <section
          id="pricing"
          className="border-t border-slate-300 bg-[#e9ede8]"
        >
          <Reveal className="mx-auto max-w-6xl px-5 py-20 sm:px-8 lg:py-28">
            <h2 className="tf-display max-w-3xl text-3xl leading-[1.1] text-slate-900 sm:text-5xl">
              Choose how long you&apos;ll run examinations on TestForge.
            </h2>
            <p className="mt-4 max-w-xl text-base leading-7 text-slate-600">
              Every plan lists technical support. The comparison below shows exactly what else
              differs.
            </p>

            <div className="mt-12 grid gap-8 lg:grid-cols-12">
              <article className="flex flex-col rounded-lg border-2 border-slate-900 bg-white p-7 lg:col-span-5">
                <p className="w-fit rounded-sm bg-emerald-700 px-2.5 py-1 text-xs font-semibold text-white">
                  Recommended
                </p>
                <h3 className="tf-display mt-4 text-3xl text-slate-900">{recommended.title}</h3>
                <div className="mt-5">
                  <Price
                    plan={recommended}
                    big
                  />
                </div>
                <p className="mt-5 border-t border-dashed border-slate-300 pt-5 text-[15px] leading-7 text-slate-700">
                  <span className="font-semibold text-slate-900">Why we recommend it: </span>
                  {recommended.description}
                </p>
                <ul className="mt-5 space-y-2.5">
                  {recommended.features.map((f) => (
                    <li
                      key={f}
                      className="flex gap-2.5 text-sm leading-6 text-slate-700"
                    >
                      <Check
                        className="mt-1 h-4 w-4 shrink-0 text-emerald-700"
                        aria-hidden="true"
                      />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-8 flex flex-col pt-2 lg:mt-auto [&>*]:w-full">
                  <PlanAction
                    plan={recommended}
                    solid
                  />
                </div>
              </article>

              <ul className="lg:col-span-7">
                {others.map((p) => (
                  <li
                    key={p.id}
                    className="grid gap-5 border-t border-slate-900 py-7 first:border-t-2 sm:grid-cols-[1fr_auto] sm:gap-8 [&:not(:first-child)]:border-dashed [&:not(:first-child)]:border-slate-400"
                  >
                    <div>
                      <h3 className="tf-display text-2xl text-slate-900">{p.title}</h3>
                      <p className="mt-2 max-w-md text-[15px] leading-7 text-slate-600">
                        {p.description}
                      </p>
                      {p.highlight && (
                        <p className="mt-3 text-sm leading-5 text-slate-800">
                          <span className="font-semibold">{p.highlight}</span>
                          {p.highlightDetail && (
                            <span className="text-slate-600"> {p.highlightDetail}</span>
                          )}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col gap-4 sm:w-56">
                      <Price plan={p} />
                      <PlanAction
                        plan={p}
                        solid={false}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <h3 className="tf-display mt-20 mb-5 text-2xl text-slate-900">Compare every plan</h3>
            <ComparisonTable />
            <p className="mt-6 text-sm text-slate-600">
              Not sure which plan fits? Call{' '}
              <a
                href={PHONE_HREF}
                className="font-semibold text-slate-900 underline underline-offset-4"
              >
                {PHONE_LABEL}
              </a>
              .
            </p>
          </Reveal>
        </section>

        {/* FAQ */}
        <section id="faq">
          <Reveal className="mx-auto grid max-w-6xl gap-12 px-5 py-20 sm:px-8 lg:grid-cols-12 lg:py-28">
            <div className="lg:col-span-4">
              <h2 className="tf-display text-3xl leading-[1.1] text-slate-900 sm:text-4xl">
                Questions institutes ask first.
              </h2>
              <p className="mt-4 text-base leading-7 text-slate-600">
                Something not covered here? Call us and we&apos;ll answer directly.
              </p>
              <a
                href={PHONE_HREF}
                className="tf-btn mt-6 inline-flex min-h-12 items-center gap-2 rounded-md border border-slate-900 px-5 text-[15px] font-semibold text-slate-900 transition-colors hover:bg-slate-900 hover:text-white"
              >
                <Phone
                  className="h-4 w-4"
                  aria-hidden="true"
                />
                {PHONE_LABEL}
              </a>
            </div>
            <Faq />
          </Reveal>
        </section>

        {/* Final CTA */}
        <section className="mx-auto max-w-6xl px-5 pb-20 sm:px-8 lg:pb-28">
          <div className="grid gap-8 border border-slate-900 bg-white p-8 md:grid-cols-[1fr_auto] md:items-center md:p-12">
            <div>
              <h2 className="tf-display max-w-xl text-3xl leading-[1.1] text-slate-900 sm:text-4xl">
                Ready to set up your next examination cycle?
              </h2>
              <p className="mt-3 max-w-xl text-base leading-7 text-slate-600">
                Sign in or register, set up your exam center, and choose a plan. Prefer to talk
                first? Call{' '}
                <a
                  href={PHONE_HREF}
                  className="font-semibold text-slate-900 underline underline-offset-4"
                >
                  {PHONE_LABEL}
                </a>
                .
              </p>
            </div>
            <Cta />
          </div>
        </section>
      </main>

      <footer className="tf-dark border-t border-slate-700 bg-[#0c1626] text-slate-300">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-12 sm:px-8 md:grid-cols-[1.3fr_1fr_1fr]">
          <div>
            <div className="[&_.font-semibold]:!text-white [&_.text-xs]:!text-slate-400">
              <Logo
                theme="dark"
                compact={false}
              />
            </div>
            <p className="mt-4 max-w-sm text-sm leading-6">
              Examination management software for MSBTE-affiliated polytechnic institutes.
            </p>
          </div>
          <nav aria-label="Footer">
            <p className="font-semibold text-white">On this page</p>
            <ul className="mt-3 space-y-1">
              {navLinks.map((l) => (
                <li key={l.href}>
                  <a
                    href={l.href}
                    className="inline-flex min-h-9 items-center text-sm hover:text-white"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div>
            <p className="font-semibold text-white">Account and contact</p>
            <ul className="mt-3 space-y-1">
              <li>
                <a
                  href={PHONE_HREF}
                  className="inline-flex min-h-9 items-center text-sm hover:text-white"
                >
                  {PHONE_LABEL}
                </a>
              </li>
              <li>
                <a
                  href={ROUTES.signIn}
                  className="inline-flex min-h-9 items-center text-sm hover:text-white"
                >
                  Sign in
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="border-t border-dashed border-slate-700">
          <p className="mx-auto max-w-6xl px-5 py-5 text-sm text-slate-400 sm:px-8">
            © {new Date().getFullYear()} Acharya Technologies.
          </p>
        </div>
      </footer>
    </div>
  );
}