'use client';
import { useEffect, useState } from 'react';

import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Check,
  ClipboardList,
  Clock,
  FileSpreadsheet,
  FileText,
  LayoutGrid,
  Menu,
  Package,
  Phone,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';

import DashboardMockup from '@/components/misc/DesktopMockup';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';

const navLinks = [
  { href: '#problem', label: 'Problem' },
  { href: '#features', label: 'Features' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#faq', label: 'FAQ' },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900">
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

function Logo() {
  return (
    <a href="#top" className="flex items-center gap-2.5" aria-label="TestForge home">
      <span className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-600 font-extrabold tracking-tight text-white shadow-md">
        TF
      </span>
      <span className="flex flex-col leading-none">
        <span className="text-base font-bold">TestForge</span>
        <span className="text-[10px] text-gray-500">by Acharya Technologies</span>
      </span>
    </a>
  );
}

function Nav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      id="top"
      className={`sticky top-0 z-50 w-full transition-all duration-300 ${
        scrolled ? 'border-b border-gray-200/70 bg-white/80 shadow-sm backdrop-blur-md' : 'bg-white/60 backdrop-blur'
      }`}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Logo />
        <nav className="hidden items-center gap-8 md:flex" aria-label="Primary">
          {navLinks.map(l => (
            <a key={l.href} href={l.href} className="text-sm text-gray-500 transition-colors hover:text-gray-900">
              {l.label}
            </a>
          ))}
        </nav>
        <div className="hidden md:block">
          <Button
            asChild
            size="sm"
            className="rounded-full bg-emerald-600 transition-transform hover:scale-[1.02] hover:bg-emerald-700"
          >
            <a href="#pricing">
              Get ₹1 Trial <ArrowRight className="ml-1 h-4 w-4" />
            </a>
          </Button>
        </div>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-72">
            <div className="mt-8 flex flex-col gap-6">
              {navLinks.map(l => (
                <a key={l.href} href={l.href} className="text-base font-medium text-gray-900">
                  {l.label}
                </a>
              ))}
              <Button asChild className="mt-4 rounded-full bg-emerald-600 hover:bg-emerald-700">
                <a href="#pricing">Get ₹1 Trial</a>
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
          background: 'radial-gradient(60% 60% at 50% 0%, rgba(5, 150, 105, 0.12), transparent 70%)',
        }}
      />
      <div className="mx-auto max-w-6xl px-4 pt-16 pb-20 sm:px-6">
        <div className="flex flex-col items-center text-center">
          <div className="inline-flex animate-[fade-up_0.6s_ease-out_both] items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
            ₹1 first month · Launching Winter 2026
          </div>
          <h1
            className="mt-6 max-w-4xl text-4xl font-extrabold tracking-tight text-balance sm:text-5xl lg:text-6xl"
            style={{ animation: 'fade-up 0.7s 0.05s ease-out both' }}
          >
            Run your MSBTE exam center in{' '}
            <span className="bg-gradient-to-r from-emerald-600 to-emerald-400 bg-clip-text text-transparent">
              minutes, not weeks
            </span>
            .
          </h1>
          <p
            className="mt-5 max-w-2xl text-base text-balance text-gray-500 sm:text-lg"
            style={{ animation: 'fade-up 0.7s 0.15s ease-out both' }}
          >
            TestForge automates MSBTE Formats 1–22, block allocation, staff orders, and exam-day reporting — so your
            team stops drowning in spreadsheets and runs flawless exams.
          </p>
          <div
            className="mt-8 flex flex-col items-center gap-3 sm:flex-row"
            style={{ animation: 'fade-up 0.7s 0.25s ease-out both' }}
          >
            <Button
              asChild
              size="lg"
              className="rounded-full bg-emerald-600 px-6 transition-transform hover:scale-[1.02] hover:bg-emerald-700"
            >
              <a href="#pricing">
                Claim ₹1 Trial <ArrowRight className="ml-1 h-4 w-4" />
              </a>
            </Button>
            <Button asChild size="lg" variant="outline" className="rounded-full border-gray-300 px-6 hover:bg-gray-50">
              <a href="#features">See how it works</a>
            </Button>
          </div>
          <p className="mt-4 text-xs text-gray-500">No commitment · Cancel anytime · First 10 institutes only</p>
        </div>

        <div className="relative mx-auto mt-14 max-w-5xl" style={{ animation: 'fade-up 0.8s 0.35s ease-out both' }}>
          <DashboardMockup />
          <div className="absolute -top-3 -right-3 hidden rotate-12 rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-left shadow-lg sm:block">
            <div className="text-[10px] tracking-wider text-gray-500 uppercase">Launch offer</div>
            <div className="text-2xl font-extrabold text-emerald-600">₹1</div>
            <div className="text-[10px] text-gray-500">first month</div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  return (
    <div className="opacity-0" style={{ animation: `fade-up 0.7s ${delay}ms ease-out both` }}>
      {children}
    </div>
  );
}

function SectionHeader({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle?: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <div className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-medium text-gray-500">
        {eyebrow}
      </div>
      <h2 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h2>
      {subtitle && <p className="mt-3 text-base text-gray-500">{subtitle}</p>}
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
    <section id="problem" className="border-t border-gray-200 bg-gray-50 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeader
          eyebrow="The problem"
          title="Managing an MSBTE exam center is a nightmare."
          subtitle="Every semester, exam officers face the same 100+ hours of manual, error-prone work."
        />
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {pains.map((p, i) => (
            <Reveal key={p.title} delay={i * 90}>
              <div className="group h-full rounded-2xl border border-gray-200 bg-white p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-100 text-emerald-700">
                  <p.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-lg font-semibold">{p.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-500">{p.desc}</p>
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
    'Allocate 300+ students in one click',
    'Office orders emailed automatically',
    'Under 10 hours, end to end',
    'Compliance built into every export',
  ];
  return (
    <section className="py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeader eyebrow="Old way vs new way" title="Stop fighting spreadsheets. Start running exams." />
        <div className="mt-12 grid gap-5 md:grid-cols-2">
          <Reveal>
            <div className="h-full rounded-2xl border border-gray-200 bg-white p-6">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-500">
                <X className="h-4 w-4" /> The old way
              </div>
              <ul className="mt-4 space-y-3">
                {oldWay.map(item => (
                  <li key={item} className="flex items-start gap-3 text-sm text-gray-500">
                    <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-gray-100">
                      <X className="h-3 w-3" />
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
          <Reveal delay={120}>
            <div className="relative h-full rounded-2xl border border-emerald-200 bg-white p-6 shadow-lg">
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
                <Check className="h-4 w-4" /> With TestForge
              </div>
              <ul className="mt-4 space-y-3">
                {newWay.map(item => (
                  <li key={item} className="flex items-start gap-3 text-sm">
                    <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-600 text-white">
                      <Check className="h-3 w-3" />
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
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
    { v: '1 min', l: 'to generate 22 formats' },
    { v: '1 click', l: 'to allocate 300+ students' },
  ];
  return (
    <section className="border-y border-gray-200 bg-gray-50 py-16">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-4">
          {stats.map((s, i) => (
            <Reveal key={s.l} delay={i * 80}>
              <div className="text-center">
                <div className="bg-gradient-to-r from-emerald-600 to-emerald-400 bg-clip-text text-4xl font-extrabold tracking-tight text-transparent sm:text-5xl">
                  {s.v}
                </div>
                <div className="mt-1 text-sm text-gray-500">{s.l}</div>
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
    <section id="features" className="py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeader
          eyebrow="What you actually get"
          title="Everything your exam center needs. Nothing it doesn't."
          subtitle="Built with MSBTE exam officers, for MSBTE-affiliated institutes."
        />
        <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {items.map((f, i) => (
            <Reveal key={f.title} delay={(i % 3) * 80}>
              <div className="group h-full rounded-2xl border border-gray-200 bg-white p-6 transition-all duration-300 hover:-translate-y-1 hover:border-emerald-200 hover:shadow-lg">
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-100 text-emerald-700 transition-transform duration-300 group-hover:scale-110">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-lg font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-500">{f.desc}</p>
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
      price: '₹1',
      cadence: 'first month',
      desc: 'First 10 institutes only. Full access, zero risk.',
      cta: 'Claim ₹1 Trial',
      badge: 'Launch offer',
      features: ['All 22 MSBTE formats', 'Up to 500 students', 'Email support', 'Onboarding included'],
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
      features: ['Everything in Institute', 'Multi-campus', 'SLA & dedicated CSM', 'Custom integrations'],
      highlight: false,
    },
  ];
  return (
    <section id="pricing" className="border-t border-gray-200 bg-gray-50 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeader
          eyebrow="Pricing"
          title="Pay for the exam cycle. Save the rest of the year."
          subtitle="Launching Winter 2026. Get in early for ₹1."
        />
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {plans.map((p, i) => (
            <Reveal key={p.name} delay={i * 80}>
              <div
                className={`relative flex h-full flex-col rounded-2xl border bg-white p-6 transition-all duration-300 ${
                  p.highlight
                    ? 'border-emerald-300 shadow-md hover:-translate-y-1 hover:shadow-lg'
                    : 'border-gray-200 hover:-translate-y-1 hover:shadow-lg'
                }`}
              >
                {p.badge && (
                  <div
                    className={`absolute -top-3 left-6 rounded-full px-2.5 py-0.5 text-[10px] font-semibold tracking-wider uppercase ${
                      p.highlight ? 'bg-emerald-600 text-white' : 'bg-gray-900 text-white'
                    }`}
                  >
                    {p.badge}
                  </div>
                )}
                <div className="text-sm font-semibold">{p.name}</div>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-3xl font-extrabold tracking-tight">{p.price}</span>
                  <span className="text-xs text-gray-500">/ {p.cadence}</span>
                </div>
                <p className="mt-2 text-xs text-gray-500">{p.desc}</p>
                <ul className="mt-5 space-y-2">
                  {p.features.map(f => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-6 pt-2">
                  <Button
                    asChild
                    className={`w-full rounded-full ${
                      p.highlight ? 'bg-emerald-600 hover:bg-emerald-700' : 'border-gray-300 hover:bg-gray-50'
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
        <SectionHeader eyebrow="Built with exam officers" title="From pilot exam centers running real MSBTE cycles." />
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
            <Reveal key={t.who} delay={i * 100}>
              <figure className="h-full rounded-2xl border border-gray-200 bg-white p-6">
                <blockquote className="text-base leading-relaxed">"{t.q}"</blockquote>
                <figcaption className="mt-4 text-xs font-medium text-gray-500">{t.who}</figcaption>
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
    <section id="cta" className="px-4 pb-20 sm:px-6">
      <div className="mx-auto max-w-6xl overflow-hidden rounded-3xl border border-emerald-300 bg-gradient-to-r from-emerald-600 to-emerald-400 p-10 text-center shadow-lg sm:p-14">
        <h2 className="mx-auto max-w-2xl text-3xl font-extrabold tracking-tight text-balance text-white sm:text-4xl">
          Get your exam center ready for Winter 2026.
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-sm text-white/85 sm:text-base">
          Join the first 10 institutes for ₹1. Full access. No commitment. Real onboarding support.
        </p>
        <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button
            asChild
            size="lg"
            variant="secondary"
            className="rounded-full bg-white px-6 text-emerald-700 hover:bg-gray-50"
          >
            <a href="#pricing">
              Claim ₹1 Trial <ArrowRight className="ml-1 h-4 w-4" />
            </a>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="rounded-full border-white/30 bg-transparent px-6 text-white hover:bg-white/10"
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
      q: 'How does the ₹1 first month offer work?',
      a: 'The first 10 MSBTE-affiliated institutes that sign up pay ₹1 for their first month of full access. No hidden fees, no contract, cancel anytime.',
    },
    {
      q: 'When does TestForge launch?',
      a: 'Winter 2026 — in time for the next MSBTE exam cycle. ₹1 partners get onboarded first and help shape the final release.',
    },
    {
      q: 'Is our student and staff data secure?',
      a: 'Yes. Data is encrypted in transit and at rest, scoped per institute, and never shared. Role-based access controls keep sensitive reports limited to authorized officers.',
    },
    {
      q: 'Do we get help setting it up?',
      a: 'Every ₹1 partner gets dedicated onboarding support from the Acharya Technologies team — including data import, timetable setup and your first exam-day walkthrough.',
    },
    {
      q: 'Can we cancel anytime?',
      a: 'Yes. There is no lock-in. Export your data at any point and stop your subscription with one click.',
    },
  ];
  return (
    <section id="faq" className="border-t border-gray-200 bg-gray-50 py-20 sm:py-28">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <SectionHeader eyebrow="FAQ" title="Questions, answered." />
        <div className="mt-10">
          <Accordion type="single" collapsible className="w-full">
            {items.map((it, i) => (
              <AccordionItem key={it.q} value={`item-${i}`} className="border-b border-gray-200">
                <AccordionTrigger className="text-left text-base font-semibold">{it.q}</AccordionTrigger>
                <AccordionContent className="text-sm leading-relaxed text-gray-500">{it.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-gray-200 bg-white py-14">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 md:grid-cols-4">
        <div className="md:col-span-2">
          <Logo />
          <p className="mt-4 max-w-sm text-sm text-gray-500">
            Complete MSBTE exam management platform. Built by Acharya Technologies for MSBTE-affiliated institutes.
          </p>
        </div>
        <div>
          <div className="text-xs font-semibold tracking-wider text-gray-500 uppercase">Product</div>
          <ul className="mt-4 space-y-2 text-sm">
            <li>
              <a href="#features" className="hover:text-emerald-600">
                Features
              </a>
            </li>
            <li>
              <a href="#pricing" className="hover:text-emerald-600">
                Pricing
              </a>
            </li>
            <li>
              <a href="#faq" className="hover:text-emerald-600">
                FAQ
              </a>
            </li>
          </ul>
        </div>
        <div>
          <div className="text-xs font-semibold tracking-wider text-gray-500 uppercase">Contact</div>
          <ul className="mt-4 space-y-2 text-sm">
            <li className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-emerald-600" />
              <a href="tel:+918208607477" className="hover:text-emerald-600">
                8208607477
              </a>
            </li>
            <li className="flex items-center gap-2 text-gray-500">
              <Clock className="h-4 w-4" /> Mon–Sat · 10am–7pm IST
            </li>
            <li className="flex items-center gap-2 text-gray-500">
              <AlertTriangle className="h-4 w-4" /> Launching Winter 2026
            </li>
          </ul>
        </div>
      </div>
      <div className="mx-auto mt-10 flex max-w-6xl flex-col items-center justify-between gap-3 border-t border-gray-200 px-4 pt-6 text-xs text-gray-500 sm:flex-row sm:px-6">
        <div>© {new Date().getFullYear()} Acharya Technologies. All rights reserved.</div>
        <div>Made for MSBTE-affiliated institutes.</div>
      </div>
    </footer>
  );
}
