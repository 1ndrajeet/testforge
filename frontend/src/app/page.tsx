'use client';
import { useEffect, useState } from 'react';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Building2,
  Check,
  ClipboardList,
  Clock,
  DollarSign,
  FileSpreadsheet,
  FileText,
  LayoutGrid,
  LogOut,
  Menu,
  Moon,
  Package,
  Phone,
  Settings,
  ShieldCheck,
  Sun,
  User,
  Users,
  X,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { toast } from 'sonner';

import { cn } from '@/lib/utils';

// Import user info hook
import { useUserInfo } from '@/hooks/useUserInfo';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

import { Logo } from '@/components/layout/header';

import DashboardMockup from '@/components/misc/DesktopMockup';

const navLinks = [
  { href: '#problem', label: 'Problem' },
  { href: '#features', label: 'Features' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#faq', label: 'FAQ' },
];

export const LAUNCH_OFFER_PRICE = 2999;

export default function LandingPage() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('verified') === 'true' || window.location.pathname.includes('verify-email')) {
      toast.success('Email verified successfully', {
        description: 'You can now sign in to your account.',
      });

      // Clean URL
      const url = new URL(window.location.href);
      url.searchParams.delete('verified');
      url.searchParams.delete('token');
      window.history.replaceState({}, '', url.toString());
    }
  }, []);
  return (
    <div className="min-h-screen bg-white text-neutral-900 dark:bg-[#0a0a0a] dark:text-white">
      <Nav />
      <main>
        <Hero />
        <Problem />
        <Comparison />
        <Benefits />
        <Features />
        <Pricing />
        <Proof />
        <FinalCta />
        <Faq />
      </main>
      <Footer />
    </div>
  );
}

function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Get real user info from your session
  const { user, subscription, isLoading } = useUserInfo();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  const getInitials = () => {
    if (!user?.name) return 'U';
    return user.name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const handleSignOut = async () => {
    const { authClient } = await import('@/lib/auth-client');
    await authClient.signOut();
    window.location.href = '/login';
  };

  // Get subscription status
  const daysLeft = subscription?.expiresAt
    ? Math.ceil((new Date(subscription.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : 0;

  const getStatus = () => {
    if (!subscription || subscription.tier === 'inactive')
      return {
        text: 'No Plan',
        color: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400',
      };
    if (subscription.tier === 'enterprise')
      return {
        text: 'Lifetime',
        color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
      };
    if (daysLeft <= 0)
      return {
        text: 'Expired',
        color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
      };
    if (subscription.tier === 'trial')
      return {
        text: `${daysLeft} days left`,
        color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
      };
    return {
      text: `${daysLeft} days left`,
      color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    };
  };

  const status = getStatus();

  return (
    <header
      id="top"
      className={`sticky top-0 z-50 w-full transition-all duration-500 ${scrolled
        ? `border-b ${theme === 'dark' ? 'border-white/5 bg-[#0a0a0a]/90 shadow-2xl shadow-black/50' : 'border-neutral-200/60 bg-white/90 shadow-sm'} backdrop-blur-xl`
        : theme === 'dark'
          ? 'bg-transparent backdrop-blur'
          : 'bg-white/60 backdrop-blur'
        }`}
    >
      {/* Interactive glow - only in dark mode */}
      {theme === 'dark' && (
        <div
          className="pointer-events-none absolute -z-10 h-[400px] w-[400px] rounded-full bg-emerald-500/5 blur-[100px] transition-all duration-300"
          style={{
            left: mousePosition.x - 200,
            top: mousePosition.y - 200,
          }}
        />
      )}

      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Logo
          compact={true}
          theme={theme}
        />

        <nav
          className="hidden items-center gap-8 md:flex"
          aria-label="Primary"
        >
          {navLinks.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className={`group relative text-sm transition-colors ${theme === 'dark'
                ? 'text-neutral-400 hover:text-white'
                : 'text-neutral-500 hover:text-neutral-900'
                }`}
            >
              {l.label}
              <span
                className={`absolute -bottom-0.5 left-0 h-px w-0 transition-all duration-300 group-hover:w-full ${theme === 'dark' ? 'bg-emerald-400' : 'bg-emerald-600'
                  }`}
              />
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          {/* Theme Toggle */}
          {mounted && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                    className={`rounded-full ${theme === 'dark'
                      ? 'text-neutral-400 hover:bg-white/10 hover:text-white'
                      : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900'
                      }`}
                  >
                    <Sun className="h-4 w-4 scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
                    <Moon className="absolute h-4 w-4 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Toggle theme</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {/* User Menu - with real user data */}
          {!isLoading && user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="relative h-8 w-8 rounded-full p-0"
                >
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={user.image || ''} />
                    <AvatarFallback
                      className={`bg-gradient-to-br from-emerald-500 to-emerald-600 text-white ${theme === 'dark' ? '' : 'shadow-sm'
                        }`}
                    >
                      {getInitials()}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className={`w-72 ${theme === 'dark' ? 'border-white/5 bg-[#121212] text-white' : ''}`}
                sideOffset={8}
              >
                <DropdownMenuLabel className="p-0">
                  <div
                    className={`p-3 ${theme === 'dark' ? 'border-b border-white/5' : 'border-b'}`}
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={user.image || ''} />
                        <AvatarFallback className="bg-gradient-to-br from-emerald-500 to-emerald-600 text-white">
                          {getInitials()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className={`font-semibold ${theme === 'dark' ? 'text-white' : ''}`}>
                          {user.name || 'User'}
                        </p>
                        <p
                          className={`text-xs ${theme === 'dark' ? 'text-neutral-400' : 'text-neutral-500'}`}
                        >
                          {user.email || ''}
                        </p>
                      </div>
                    </div>
                    {subscription && subscription.tier !== 'inactive' && (
                      <div className="mt-3 flex items-center justify-between border-t border-neutral-200/60 pt-2 dark:border-white/5">
                        <span
                          className={`text-xs font-medium ${theme === 'dark' ? 'text-neutral-300' : ''}`}
                        >
                          {subscription.planName || subscription.tier}
                        </span>
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 text-[10px] font-medium',
                            status.color,
                          )}
                        >
                          {status.text}
                        </span>
                      </div>
                    )}
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator className={theme === 'dark' ? 'bg-white/5' : ''} />
                <DropdownMenuItem
                  asChild
                  className={
                    theme === 'dark'
                      ? 'text-neutral-300 hover:bg-white/5 hover:text-white focus:bg-white/5'
                      : ''
                  }
                >
                  <Link href="/exam-center/settings/profile">
                    <User className="mr-2 h-4 w-4" />
                    Profile
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  asChild
                  className={
                    theme === 'dark'
                      ? 'text-neutral-300 hover:bg-white/5 hover:text-white focus:bg-white/5'
                      : ''
                  }
                >
                  <Link href="/exam-center/dashboard">
                    <LayoutGrid className="mr-2 h-4 w-4" />
                    Dashboard
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  asChild
                  className={
                    theme === 'dark'
                      ? 'text-neutral-300 hover:bg-white/5 hover:text-white focus:bg-white/5'
                      : ''
                  }
                >
                  <Link href="/billing">
                    <DollarSign className="mr-2 h-4 w-4" />
                    Billing
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator className={theme === 'dark' ? 'bg-white/5' : ''} />
                <DropdownMenuItem
                  onClick={handleSignOut}
                  className={`cursor-pointer text-red-600 ${theme === 'dark' ? 'hover:bg-white/5 focus:bg-white/5' : 'focus:bg-red-50'
                    }`}
                >
                  <LogOut className="mr-2 h-4 w-4" /> Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            !isLoading && (
              <Button
                asChild
                variant="outline"
                size="sm"
                className={`rounded-full ${theme === 'dark'
                  ? 'border-white/10 bg-white/5 text-white hover:border-white/20 hover:bg-white/10'
                  : 'border-neutral-300 hover:bg-neutral-50'
                  }`}
              >
                <Link href="/login">Sign In</Link>
              </Button>
            )
          )}
        </div>

        {/* Mobile menu */}
        <Sheet
          open={isMenuOpen}
          onOpenChange={setIsMenuOpen}
        >
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={`rounded-full md:hidden ${theme === 'dark'
                ? 'text-white hover:bg-white/10'
                : 'text-neutral-600 hover:bg-neutral-100'
                }`}
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent
            side="right"
            className={`w-72 ${theme === 'dark' ? 'border-l border-white/5 bg-[#121212] text-white' : ''}`}
          >
            <div className="mt-8 flex flex-col gap-6">
              {navLinks.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  className={`group relative text-base font-medium transition-colors ${theme === 'dark'
                    ? 'text-white/70 hover:text-white'
                    : 'text-neutral-600 hover:text-neutral-900'
                    }`}
                  onClick={() => setIsMenuOpen(false)}
                >
                  {l.label}
                  <span
                    className={`absolute -bottom-0.5 left-0 h-px w-0 transition-all duration-300 group-hover:w-full ${theme === 'dark' ? 'bg-emerald-400' : 'bg-emerald-600'
                      }`}
                  />
                </a>
              ))}

              {/* Mobile user info */}
              {!isLoading && user && (
                <div
                  className={`border-t pt-4 ${theme === 'dark' ? 'border-white/5' : 'border-neutral-200'}`}
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={user.image || ''} />
                      <AvatarFallback className="bg-gradient-to-br from-emerald-500 to-emerald-600 text-white">
                        {getInitials()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className={`font-semibold ${theme === 'dark' ? 'text-white' : ''}`}>
                        {user.name || 'User'}
                      </p>
                      <p
                        className={`text-xs ${theme === 'dark' ? 'text-neutral-400' : 'text-neutral-500'}`}
                      >
                        {user.email || ''}
                      </p>
                    </div>
                  </div>
                  {subscription && subscription.tier !== 'inactive' && (
                    <div className="mt-2 flex items-center justify-between">
                      <span
                        className={`text-xs ${theme === 'dark' ? 'text-neutral-400' : 'text-neutral-500'}`}
                      >
                        {subscription.planName || subscription.tier}
                      </span>
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-[10px] font-medium',
                          status.color,
                        )}
                      >
                        {status.text}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Mobile theme toggle */}
              {mounted && (
                <Button
                  variant="ghost"
                  onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                  className={`justify-start gap-2 px-0 ${theme === 'dark'
                    ? 'text-white/70 hover:text-white'
                    : 'text-neutral-600 hover:text-neutral-900'
                    }`}
                >
                  {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                  {theme === 'dark' ? 'Light mode' : 'Dark mode'}
                </Button>
              )}

              {!isLoading && user ? (
                <Button
                  onClick={handleSignOut}
                  variant="ghost"
                  className={`justify-start gap-2 px-0 ${theme === 'dark'
                    ? 'text-red-400 hover:bg-red-500/10 hover:text-red-300'
                    : 'text-red-600 hover:bg-red-50 hover:text-red-700'
                    }`}
                >
                  <LogOut className="h-4 w-4" /> Log out
                </Button>
              ) : (
                !isLoading && (
                  <Button
                    asChild
                    className="group overflow-hidden rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600 font-semibold text-white shadow-lg shadow-emerald-500/30 transition-all duration-300 hover:scale-[1.02] hover:from-emerald-400 hover:to-emerald-500"
                  >
                    <Link href="/login">Sign In</Link>
                  </Button>
                )
              )}

              <Button
                asChild
                className="group mt-4 overflow-hidden rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600 font-semibold text-white shadow-lg shadow-emerald-500/30 transition-all duration-300 hover:scale-[1.02] hover:from-emerald-400 hover:to-emerald-500"
              >
                <a
                  href="#pricing"
                  onClick={() => setIsMenuOpen(false)}
                >
                  <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-1000 group-hover:translate-x-full" />
                  Get ₹{LAUNCH_OFFER_PRICE} Trial
                </a>
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(60% 60% at 50% 0%, rgba(5, 150, 105, 0.12), transparent 70%)',
        }}
      />
      <div className="mx-auto max-w-6xl px-4 pt-16 pb-20 sm:px-6">
        <div className="flex flex-col items-center text-center">
          <div className="inline-flex animate-[fade-up_0.6s_ease-out_both] items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400">
            ₹{LAUNCH_OFFER_PRICE} first semester · Launching Winter 2026
          </div>
          <h1
            className="mt-6 max-w-4xl text-4xl font-extrabold tracking-tight text-balance sm:text-5xl lg:text-6xl"
            style={{ animation: 'fade-up 0.7s 0.05s ease-out both' }}
          >
            Run your MSBTE exam center in{' '}
            <span className="bg-gradient-to-r from-emerald-600 to-emerald-400 bg-clip-text text-transparent dark:from-emerald-400 dark:to-emerald-300">
              minutes, not weeks
            </span>
            .
          </h1>
          <p
            className="mt-5 max-w-2xl text-base text-balance text-neutral-500 sm:text-lg dark:text-neutral-400"
            style={{ animation: 'fade-up 0.7s 0.15s ease-out both' }}
          >
            TestForge automates MSBTE Formats 1–22, block allocation, staff orders, and exam-day
            reporting — so your team stops drowning in spreadsheets and runs flawless exams.
          </p>
          <div
            className="mt-8 flex flex-col items-center gap-3 sm:flex-row"
            style={{ animation: 'fade-up 0.7s 0.25s ease-out both' }}
          >
            <Button
              asChild
              size="lg"
              className="rounded-full bg-emerald-600 px-6 transition-transform hover:scale-[1.02] hover:bg-emerald-700 dark:bg-gradient-to-r dark:from-emerald-500 dark:to-emerald-600 dark:hover:from-emerald-400 dark:hover:to-emerald-500"
            >
              <a href="#pricing">
                Claim ₹{LAUNCH_OFFER_PRICE} Trial <ArrowRight className="ml-1 h-4 w-4" />
              </a>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="rounded-full border-neutral-300 px-6 hover:bg-neutral-50 dark:border-white/10 dark:text-white dark:hover:bg-white/10"
            >
              <a href="#features">See how it works</a>
            </Button>
          </div>
          <p className="mt-4 text-xs text-neutral-500 dark:text-neutral-400">
            No commitment · Cancel anytime · First 10 institutes only
          </p>
        </div>

        <div
          className="relative mx-auto mt-14 max-w-5xl"
          style={{ animation: 'fade-up 0.8s 0.35s ease-out both' }}
        >
          <DashboardMockup />
          <div className="absolute -top-9 -right-9 hidden rotate-12 rounded-2xl border border-emerald-500 bg-white px-4 py-3 text-left shadow-lg sm:block dark:border-emerald-500/30 dark:bg-[#121212] dark:shadow-emerald-500/20">
            <div className="text-[10px] tracking-wider text-neutral-500 uppercase dark:text-neutral-400">
              Launch offer
            </div>
            <div className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">₹{LAUNCH_OFFER_PRICE}</div>
            <div className="text-[10px] text-neutral-500 dark:text-neutral-400">first semester</div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  return (
    <div
      className="opacity-0"
      style={{ animation: `fade-up 0.7s ${delay}ms ease-out both` }}
    >
      {children}
    </div>
  );
}

function SectionHeader({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <div className="inline-flex items-center gap-2 rounded-full border border-neutral-200/60 bg-neutral-50 px-3 py-1 text-xs font-medium text-neutral-500 dark:border-white/5 dark:bg-white/5 dark:text-neutral-400">
        {eyebrow}
      </div>
      <h2 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl dark:text-white">
        {title}
      </h2>
      {subtitle && (
        <p className="mt-3 text-base text-neutral-500 dark:text-neutral-400">{subtitle}</p>
      )}
    </div>
  );
}

function Problem() {
  const pains = [
    {
      icon: FileSpreadsheet,
      title: 'Spreadsheet hell',
      desc: '22 MSBTE formats across 18 exam days. One typo and the entire report is rejected.',
    },
    {
      icon: Users,
      title: 'Staff coordination chaos',
      desc: 'Manually scheduling supervisors, relievers and control room staff across blocks and sessions.',
    },
    {
      icon: ShieldCheck,
      title: 'Compliance anxiety',
      desc: "If formats aren't exact, reports get rejected. If attendance is wrong, students suffer.",
    },
  ];
  return (
    <section
      id="problem"
      className="border-t border-neutral-200/60 bg-neutral-50 py-20 sm:py-28 dark:border-white/5 dark:bg-[#0d0d0d]"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeader
          eyebrow="The problem"
          title="Managing an MSBTE exam center is a nightmare."
          subtitle="Every semester, exam officers face the same 100+ hours of manual, error-prone work."
        />
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {pains.map((p, i) => (
            <Reveal
              key={p.title}
              delay={i * 90}
            >
              <div className="group h-full rounded-2xl border border-neutral-200/60 bg-white p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg dark:border-white/5 dark:bg-[#121212] dark:hover:border-white/10 dark:hover:shadow-emerald-500/5">
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400">
                  <p.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-lg font-semibold dark:text-white">{p.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-neutral-500 dark:text-neutral-400">
                  {p.desc}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function Comparison() {
  const oldWay = [
    'Excel files for every format',
    'Manual block allocation over days',
    'Printed orders, called staff one-by-one',
    '100+ hours per exam cycle',
    'Reports rejected for format errors',
  ];
  const newWay = [
    'All 22 MSBTE formats auto-generated',
    'Total 40+ reports generated',
    'Office orders emailed automatically',
    'Under 10 mins, end to end',
    'Compliance built into every export',
  ];
  return (
    <section className="py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeader
          eyebrow="Old way vs new way"
          title="Stop fighting spreadsheets. Start running exams."
        />
        <div className="mt-12 grid gap-5 md:grid-cols-2">
          <Reveal>
            <div className="h-full rounded-2xl border border-neutral-200/60 bg-white p-6 transition-all duration-300 hover:shadow-lg dark:border-white/5 dark:bg-[#0d0d0d] dark:hover:border-white/10 dark:hover:shadow-emerald-500/5">
              <div className="flex items-center gap-2 text-sm font-semibold text-neutral-500 dark:text-neutral-400">
                <div className="rounded-full bg-red-100 p-0.5 dark:bg-red-500/20">
                  <X className="h-4 w-4 text-red-500 dark:text-red-400" />
                </div>
                The old way
              </div>
              <ul className="mt-4 space-y-3">
                {oldWay.map((item, index) => (
                  <li
                    key={item}
                    className="flex items-start gap-3 text-sm text-neutral-500 transition-colors duration-300 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-300"
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-neutral-100 transition-colors duration-300 dark:bg-white/5 dark:group-hover:bg-white/10">
                      <X className="h-3 w-3 text-red-400" />
                    </span>
                    <span className="leading-relaxed">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
          <Reveal delay={120}>
            <div className="group relative h-full rounded-2xl border border-emerald-200 bg-white p-6 shadow-lg transition-all duration-300 hover:-translate-y-1 hover:shadow-xl dark:border-emerald-500/30 dark:bg-neutral-950 dark:shadow-emerald-500/10 dark:hover:border-emerald-500/50 dark:hover:shadow-emerald-500/20">
              {/* Glow effects - only visible in dark mode */}
              <div className="absolute -inset-0.5 hidden rounded-2xl bg-gradient-to-br from-emerald-500/20 to-transparent opacity-0 blur-xl transition-opacity duration-500 group-hover:opacity-100 dark:block" />
              <div className="absolute -right-6 -bottom-6 hidden h-32 w-32 rounded-full bg-emerald-500/10 blur-3xl dark:block" />
              <div className="absolute -top-6 -left-6 hidden h-32 w-32 rounded-full bg-emerald-500/5 blur-3xl dark:block" />

              <div className="relative">
                <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                  <div className="rounded-full bg-emerald-100 p-0.5 dark:bg-emerald-500/20">
                    <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  With TestForge
                </div>
                <ul className="mt-4 space-y-3">
                  {newWay.map((item, index) => (
                    <li
                      key={item}
                      className="flex items-start gap-3 text-sm transition-colors duration-300 dark:text-white/80 dark:hover:text-white"
                      style={{ animationDelay: `${index * 50}ms` }}
                    >
                      <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-600 text-white transition-all duration-300 group-hover:scale-110 dark:bg-emerald-500/20 dark:text-emerald-400 dark:group-hover:bg-emerald-500/30">
                        <Check className="h-3 w-3" />
                      </span>
                      <span className="leading-relaxed">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function Benefits() {
  const stats = [
    { v: '90%', l: 'less time on reports' },
    { v: '95%', l: 'fewer manual errors' },
    { v: '1 min', l: 'to generate 40+ reports' },
    { v: '1 click', l: 'to allocate 300+ students' },
  ];
  return (
    <section className="border-y border-neutral-200/60 bg-neutral-50 py-16 dark:border-white/5 dark:bg-[#0d0d0d]">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-4">
          {stats.map((s, i) => (
            <Reveal
              key={s.l}
              delay={i * 80}
            >
              <div className="text-center">
                <div className="bg-gradient-to-r from-emerald-600 to-emerald-400 bg-clip-text text-4xl font-extrabold tracking-tight text-transparent sm:text-5xl dark:from-emerald-400 dark:to-emerald-300">
                  {s.v}
                </div>
                <div className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{s.l}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function Features() {
  const items = [
    {
      icon: FileText,
      title: 'MSBTE Formats 1–22',
      desc: 'Every official MSBTE format built-in. Upload data once, export all 22 reports pre-filled.',
    },
    {
      icon: LayoutGrid,
      title: 'Intelligent block allocation',
      desc: 'Allocate thousands of students across blocks in minutes — no overlaps, no capacity conflicts.',
    },
    {
      icon: ClipboardList,
      title: 'Staff & office orders',
      desc: 'Assign supervisors, relievers and chief officers. Office orders generated and emailed automatically.',
    },
    {
      icon: Activity,
      title: 'Real-time exam day tools',
      desc: 'Mark absentees, record copy cases and update attendance live — from any device.',
    },
    {
      icon: Package,
      title: 'Question paper inventory',
      desc: 'Track packets in, used, and pending. Reconcile discrepancies before they become problems.',
    },
    {
      icon: ShieldCheck,
      title: 'Centralized exam hub',
      desc: 'Students, staff, timetable, inventory and reports — one source of truth for your center.',
    },
  ];
  return (
    <section
      id="features"
      className="py-20 sm:py-28"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeader
          eyebrow="What you actually get"
          title="Everything your exam center needs. Nothing it doesn't."
          subtitle="Built with MSBTE exam officers, for MSBTE-affiliated institutes."
        />
        <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {items.map((f, i) => (
            <Reveal
              key={f.title}
              delay={(i % 3) * 80}
            >
              <div className="group h-full rounded-2xl border border-neutral-200/60 bg-white p-6 transition-all duration-300 hover:-translate-y-1 hover:border-emerald-200 hover:shadow-lg dark:border-white/5 dark:bg-[#121212] dark:hover:border-white/10 dark:hover:shadow-emerald-500/5">
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-100 text-emerald-700 transition-transform duration-300 group-hover:scale-110 dark:bg-emerald-500/20 dark:text-emerald-400">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-lg font-semibold dark:text-white">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-neutral-500 dark:text-neutral-400">
                  {f.desc}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function Pricing() {
  const plans = [
    {
      name: 'Launch Offer',
      price: '₹'+LAUNCH_OFFER_PRICE.toLocaleString(),
      cadence: 'first semester',
      desc: 'First 10 institutes only. Full access, zero risk.',
      cta: 'Claim ₹'+LAUNCH_OFFER_PRICE.toLocaleString()+' Trial',
      badge: 'Launch offer',
      features: [
        'All 22 MSBTE formats',
        'Up to 500 students',
        'Email support',
        'Onboarding included',
      ],
      highlight: false,
    },
    {
      name: 'Starter',
      price: '₹4,999',
      cadence: 'per cycle',
      desc: 'For smaller centers running a single exam cycle.',
      cta: 'Get started',
      features: ['Up to 500 students', 'All formats & allocation', 'Email support'],
      highlight: false,
    },
    {
      name: 'Institute',
      price: '₹9,999',
      cadence: 'per cycle',
      desc: 'Most popular for MSBTE-affiliated institutes.',
      cta: 'Get started',
      badge: 'Most popular',
      features: [
        'Unlimited students',
        'All formats, allocation & inventory',
        'Office orders + email automation',
        'Priority support',
      ],
      highlight: true,
    },
    {
      name: 'Enterprise',
      price: 'Custom',
      cadence: 'annual',
      desc: 'For multi-campus groups and university affiliations.',
      cta: 'Talk to sales',
      features: [
        'Everything in Institute',
        'Multi-campus',
        'SLA & dedicated CSM',
        'Custom integrations',
      ],
      highlight: false,
    },
  ];
  return (
    <section
      id="pricing"
      className="border-t border-neutral-200/60 bg-neutral-50 py-20 sm:py-28 dark:border-white/5 dark:bg-[#0d0d0d]"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeader
          eyebrow="Pricing"
          title="Pay for the exam cycle. Save the rest of the year."
          subtitle={"Launching Winter 2026. Get in early for ₹"+LAUNCH_OFFER_PRICE.toLocaleString()+"."}
        />
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {plans.map((p, i) => (
            <Reveal
              key={p.name}
              delay={i * 80}
            >
              <div
                className={`relative flex h-full flex-col rounded-2xl border bg-white p-6 transition-all duration-300 dark:bg-[#121212] ${p.highlight
                  ? 'border-emerald-300 shadow-md hover:-translate-y-1 hover:shadow-lg dark:border-emerald-500/50 dark:shadow-emerald-500/20 dark:hover:shadow-emerald-500/30'
                  : 'border-neutral-200/60 hover:-translate-y-1 hover:shadow-lg dark:border-white/5 dark:bg-[#121212] dark:hover:border-white/10'
                  }`}
              >
                {p.badge && (
                  <div
                    className={`absolute -top-3 left-6 rounded-full px-2.5 py-0.5 text-[10px] font-semibold tracking-wider uppercase ${p.highlight
                      ? 'bg-emerald-600 text-white dark:bg-gradient-to-r dark:from-emerald-500 dark:to-emerald-600'
                      : 'bg-neutral-900 text-white dark:bg-white/10 dark:text-white/70'
                      }`}
                  >
                    {p.badge}
                  </div>
                )}
                <div className="text-sm font-semibold dark:text-white/60">{p.name}</div>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-3xl font-extrabold tracking-tight dark:text-white">
                    {p.price}
                  </span>
                  <span className="text-xs text-neutral-500 dark:text-neutral-400">
                    / {p.cadence}
                  </span>
                </div>
                <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">{p.desc}</p>
                <ul className="mt-5 space-y-2">
                  {p.features.map((f) => (
                    <li
                      key={f}
                      className="flex items-start gap-2 text-sm dark:text-white/70"
                    >
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-6 pt-2">
                  <Button
                    asChild
                    className={`w-full rounded-full ${p.highlight
                      ? 'bg-emerald-600 hover:bg-emerald-700 dark:bg-gradient-to-r dark:from-emerald-500 dark:to-emerald-600 dark:hover:from-emerald-400 dark:hover:to-emerald-500'
                      : 'border-neutral-300 hover:bg-neutral-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10'
                      }`}
                    variant={p.highlight ? 'default' : 'outline'}
                  >
                    <a href="#cta">{p.cta}</a>
                  </Button>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function Proof() {
  return (
    <section className="py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeader
          eyebrow="Built with exam officers"
          title="From pilot exam centers running real MSBTE cycles."
        />
        <div className="mt-12 grid gap-5 md:grid-cols-2">
          {[
            {
              q: 'What used to take three of us a full week, we now finish in a single afternoon. The format exports just work.',
              who: 'Exam Officer · Pilot Institute, Pune',
            },
            {
              q: "Block allocation for 1,200 students was always our worst day. With TestForge it's one click and a coffee.",
              who: 'Principal · Pilot Polytechnic, Maharashtra',
            },
          ].map((t, i) => (
            <Reveal
              key={t.who}
              delay={i * 100}
            >
              <figure className="h-full rounded-2xl border border-neutral-200/60 bg-white p-6 dark:border-white/5 dark:bg-[#121212] dark:hover:border-white/10 dark:hover:shadow-emerald-500/5">
                <blockquote className="text-base leading-relaxed dark:text-white/90">
                  "{t.q}"
                </blockquote>
                <figcaption className="mt-4 text-xs font-medium text-neutral-500 dark:text-neutral-400">
                  {t.who}
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section
      id="cta"
      className="px-4 pb-20 sm:px-6"
    >
      <div className="mx-auto max-w-6xl overflow-hidden rounded-3xl border border-emerald-300 bg-gradient-to-r from-emerald-600 to-emerald-400 p-10 text-center shadow-lg sm:p-14 dark:border-emerald-500/20 dark:from-emerald-600 dark:via-emerald-500 dark:to-emerald-600 dark:shadow-emerald-500/20">
        <h2 className="mx-auto max-w-2xl text-3xl font-extrabold tracking-tight text-balance text-white sm:text-4xl">
          Get your exam center ready for Winter 2026.
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-sm text-white/85 sm:text-base">
          Join the first 10 institutes for ₹{LAUNCH_OFFER_PRICE}. Full access. No commitment. Real onboarding support.
        </p>
        <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button
            asChild
            size="lg"
            variant="secondary"
            className="rounded-full bg-white px-6 text-emerald-700 hover:bg-neutral-50 dark:bg-white dark:text-emerald-700 dark:hover:bg-white/90"
          >
            <a href="#pricing">
              Claim ₹{LAUNCH_OFFER_PRICE} Trial <ArrowRight className="ml-1 h-4 w-4" />
            </a>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="rounded-full border-white/30 bg-transparent px-6 text-white hover:bg-white/10 dark:hover:bg-white/10"
          >
            <a href="tel:+918208607477">
              <Phone className="mr-2 h-4 w-4" /> Call 8208607477
            </a>
          </Button>
        </div>
      </div>
    </section>
  );
}

function Faq() {
  const items = [
    {
      q: 'What does MSBTE coverage include?',
      a: 'All 22 official MSBTE formats — instructions, receipts (Formats 2–9), malpractice report (Format 13), Panchnama (Format 22), and everything in between. We track MSBTE changes and ship updates within the same cycle.',
    },
    {
      q: 'How does the ₹'+ LAUNCH_OFFER_PRICE.toLocaleString() +' first semester offer work?',
      a: 'The first 10 MSBTE-affiliated institutes that sign up pay ₹'+ LAUNCH_OFFER_PRICE.toLocaleString() +' for their first semester of full access. No hidden fees, no contract, cancel anytime.',
    },
    {
      q: 'When does TestForge launch?',
      a: 'Winter 2026 — in time for the next MSBTE exam cycle. ₹'+ LAUNCH_OFFER_PRICE.toLocaleString() +' partners get onboarded first and help shape the final release.',
    },
    {
      q: 'Is our student and staff data secure?',
      a: 'Yes. Data is encrypted in transit and at rest, scoped per institute, and never shared. Role-based access controls keep sensitive reports limited to authorized officers.',
    },
    {
      q: 'Do we get help setting it up?',
      a: 'Every ₹'+ LAUNCH_OFFER_PRICE.toLocaleString() +' partner gets dedicated onboarding support from our team — including data import, timetable setup and your first exam-day walkthrough.',
    },
    {
      q: 'Can we cancel anytime?',
      a: 'Yes. There is no lock-in. Export your data at any point and stop your subscription with one click.',
    },
  ];
  return (
    <section
      id="faq"
      className="border-t border-neutral-200/60 bg-neutral-50 py-20 sm:py-28 dark:border-white/5 dark:bg-[#0d0d0d]"
    >
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <SectionHeader
          eyebrow="FAQ"
          title="Questions, answered."
        />
        <div className="mt-10">
          <Accordion
            type="single"
            collapsible
            className="w-full"
          >
            {items.map((it, i) => (
              <AccordionItem
                key={it.q}
                value={`item-${i}`}
                className="border-b border-neutral-200/60 dark:border-white/5"
              >
                <AccordionTrigger className="text-left text-base font-semibold dark:text-white hover:dark:text-emerald-400">
                  {it.q}
                </AccordionTrigger>
                <AccordionContent className="text-sm leading-relaxed text-neutral-500 dark:text-neutral-400">
                  {it.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  const { theme } = useTheme();

  return (
    <footer className="border-t border-neutral-200/60 bg-white py-14 dark:border-white/5 dark:bg-[#0a0a0a]">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 md:grid-cols-4">
        <div className="md:col-span-2">
          <Logo theme={theme} />
          <p className="mt-4 max-w-sm text-sm text-neutral-500 dark:text-neutral-400">
            Complete MSBTE exam management platform. Built by{' '}
            <a
              href="https://1ndrajeet.is-a.dev"
              className="text-emerald-600 hover:text-emerald-400 dark:text-emerald-400 dark:hover:text-emerald-300"
              target="_blank"
              rel="noopener noreferrer"
            >
              1ndrajeet
            </a>
            .
          </p>
        </div>
        <div>
          <div className="text-xs font-semibold tracking-wider text-neutral-500 uppercase dark:text-neutral-400">
            Product
          </div>
          <ul className="mt-4 space-y-2 text-sm">
            <li>
              <a
                href="#features"
                className="text-neutral-500 hover:text-emerald-600 dark:text-neutral-400 dark:hover:text-emerald-400"
              >
                Features
              </a>
            </li>
            <li>
              <a
                href="#pricing"
                className="text-neutral-500 hover:text-emerald-600 dark:text-neutral-400 dark:hover:text-emerald-400"
              >
                Pricing
              </a>
            </li>
            <li>
              <a
                href="#faq"
                className="text-neutral-500 hover:text-emerald-600 dark:text-neutral-400 dark:hover:text-emerald-400"
              >
                FAQ
              </a>
            </li>
          </ul>
        </div>
        <div>
          <div className="text-xs font-semibold tracking-wider text-neutral-500 uppercase dark:text-neutral-400">
            Legal
          </div>
          <ul className="mt-4 space-y-2 text-sm">
            <li>
              <Link
                href="/docs/"
                className="text-neutral-500 transition-colors hover:text-emerald-600 dark:text-neutral-400 dark:hover:text-emerald-400"
              >
                Terms & Privacy
              </Link>
            </li>
          </ul>
          <div className="mt-6">
            <div className="text-xs font-semibold tracking-wider text-neutral-500 uppercase dark:text-neutral-400">
              Contact
            </div>
            <ul className="mt-4 space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <a
                  href="tel:+918208607477"
                  className="text-neutral-500 hover:text-emerald-600 dark:text-neutral-400 dark:hover:text-emerald-400"
                >
                  8208607477
                </a>
              </li>
              <li className="flex items-center gap-2 text-neutral-500 dark:text-neutral-400">
                <Clock className="h-4 w-4" /> Mon–Sat · 10am–7pm IST
              </li>
              <li className="flex items-center gap-2 text-neutral-500 dark:text-neutral-400">
                <AlertTriangle className="h-4 w-4" /> Launching Winter 2026
              </li>
            </ul>
          </div>
        </div>
      </div>
      <div className="mx-auto mt-10 flex max-w-6xl flex-col items-center justify-between gap-3 border-t border-neutral-200/60 px-4 pt-6 text-xs text-neutral-500 sm:flex-row sm:px-6 dark:border-white/5 dark:text-neutral-400">
        <div>
          © {new Date().getFullYear()} Acharya Technologies. All rights reserved.
        </div>
        <div className="flex items-center gap-4">
          <Link
            href="/docs/"
            className="transition-colors hover:text-emerald-600 dark:hover:text-emerald-400"
          >
            Terms & Privacy
          </Link>
          <span className="h-3 w-px bg-neutral-300 dark:bg-neutral-700" />
          <span className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Made for MSBTE
          </span>
        </div>
      </div>
    </footer>
  );
}
