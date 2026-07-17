// app/(dashboard)/docs/tnc/page.tsx

'use client';

import { useEffect, useState } from 'react';

import { useRouter } from 'next/navigation';

import { ArrowLeft, ChevronDown, FileText, Shield, Users } from 'lucide-react';

import { cn } from '@/lib/utils';

import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

// ─── Types ────────────────────────────────────────────────────

interface Section {
  id: string;
  number: string;
  title: string;
  content: string | React.ReactNode;
}

interface DocumentSection {
  id: 'terms' | 'privacy';
  title: string;
  shortTitle: string;
  sections: Section[];
}

// ─── T&C Sections ────────────────────────────────────────────

const TERMS_SECTIONS: DocumentSection = {
  id: 'terms',
  title: 'Terms & Conditions',
  shortTitle: 'T&C',
  sections: [
    {
      id: 'overview',
      number: '1',
      title: 'Overview',
      content:
        'TestForge is an examination management platform designed for educational institutions affiliated with the Maharashtra State Board of Technical Education (MSBTE) or equivalent academic authorities. By accessing or using TestForge, the institution agrees to these Terms.',
    },
    {
      id: 'eligibility',
      number: '2',
      title: 'Eligibility',
      content:
        'TestForge is intended exclusively for use by authorized educational institutions and their designated representatives. Individual personal use is not permitted unless explicitly authorized in writing by the institution.',
    },
    {
      id: 'services',
      number: '3',
      title: 'Services Provided',
      content: (
        <div className="space-y-3">
          <p>TestForge provides tools for examination management including:</p>
          <ul className="list-disc space-y-1.5 pl-6 text-neutral-600 dark:text-neutral-400">
            <li>Timetable and seating arrangement processing</li>
            <li>Block and supervisor allocation</li>
            <li>Examination reporting formats</li>
            <li>Staff assignment workflows</li>
            <li>Exam-related notifications and email communication</li>
            <li>Document and file processing for institutional workflows</li>
          </ul>
          <p className="text-neutral-600 dark:text-neutral-400">
            TestForge assists institutions in exam operations. The final verification and accuracy
            of all outputs remain the sole responsibility of the institution.
          </p>
        </div>
      ),
    },
    {
      id: 'account',
      number: '4',
      title: 'Account Responsibility',
      content: (
        <div className="space-y-3">
          <p>Institutions are responsible for:</p>
          <ul className="list-disc space-y-1.5 pl-6 text-neutral-600 dark:text-neutral-400">
            <li>Maintaining the confidentiality of account credentials</li>
            <li>Ensuring only authorized staff access the system</li>
            <li>The accuracy and completeness of all data uploaded to the platform</li>
          </ul>
          <p className="text-neutral-600 dark:text-neutral-400">
            Any activity conducted under the institution&apos;s account is presumed to be authorized
            by that institution.
          </p>
        </div>
      ),
    },
    {
      id: 'data-usage',
      number: '5',
      title: 'Data Usage',
      content: (
        <div className="space-y-3">
          <p>
            TestForge processes only academic and institutional data required for examination
            operations, including:
          </p>
          <ul className="list-disc space-y-1.5 pl-6 text-neutral-600 dark:text-neutral-400">
            <li>Student information (name, enrollment number, seat number)</li>
            <li>Staff and supervisor details</li>
            <li>Examination schedules and allocations</li>
            <li>Institutional configuration data</li>
          </ul>
          <p className="text-neutral-600 dark:text-neutral-400">
            <strong>We do not use this data for advertising or marketing purposes.</strong>
          </p>
        </div>
      ),
    },
    {
      id: 'email',
      number: '6',
      title: 'Email Communication',
      content: (
        <div className="space-y-3">
          <p>Emails sent via TestForge are primarily operational and include:</p>
          <ul className="list-disc space-y-1.5 pl-6 text-neutral-600 dark:text-neutral-400">
            <li>Examination supervision orders</li>
            <li>System notifications and alerts</li>
            <li>Institutional communications</li>
            <li>Service-related updates and feature announcements</li>
          </ul>
          <p className="text-neutral-600 dark:text-neutral-400">
            We may occasionally send service-related updates or feature announcements relevant to
            your subscription.
          </p>
        </div>
      ),
    },
    {
      id: 'payments',
      number: '7',
      title: 'Payments & Subscription',
      content: (
        <div className="space-y-3">
          <ul className="list-disc space-y-1.5 pl-6 text-neutral-600 dark:text-neutral-400">
            <li>TestForge operates on a subscription-based model</li>
            <li>Payments are processed securely via third-party providers (Razorpay)</li>
            <li>
              Subscriptions are non-refundable once the examination cycle has commenced. For prepaid
              subscriptions where the examination cycle has not yet begun, we may consider a partial
              refund at our discretion.
            </li>
          </ul>
        </div>
      ),
    },
    {
      id: 'storage-security',
      number: '8',
      title: 'Data Storage & Security',
      content: (
        <div className="space-y-3">
          <p>
            Data is securely stored using cloud-hosted databases and secure file storage systems
            with industry-standard encryption.
          </p>
          <p>We implement reasonable technical and organizational safeguards including:</p>
          <ul className="list-disc space-y-1.5 pl-6 text-neutral-600 dark:text-neutral-400">
            <li>Role-based access control</li>
            <li>Secure authentication mechanisms</li>
            <li>Encrypted data transmission (TLS/SSL)</li>
            <li>Regular backup and recovery systems</li>
          </ul>
          <p className="text-neutral-600 dark:text-neutral-400">
            While we employ robust security measures, no system can guarantee absolute protection
            against all threats.
          </p>
        </div>
      ),
    },
    {
      id: 'retention',
      number: '9',
      title: 'Data Retention',
      content: (
        <div className="space-y-3">
          <p>Data is retained according to the following schedule:</p>
          <ul className="list-disc space-y-1.5 pl-6 text-neutral-600 dark:text-neutral-400">
            <li>
              <span className="font-medium text-neutral-800 dark:text-neutral-200">
                Student data, seating, timetables:
              </span>{' '}
              Retained for a limited operational period after examination completion, typically up
              to 90 days unless extended due to ongoing institutional requirements or legal
              obligations.
            </li>
            <li>
              <span className="font-medium text-neutral-800 dark:text-neutral-200">
                Staff and institutional configuration:
              </span>{' '}
              Retained for future institutional use.
            </li>
            <li>
              <span className="font-medium text-neutral-800 dark:text-neutral-200">
                Account data:
              </span>{' '}
              Retained until deletion is requested.
            </li>
          </ul>
          <p className="text-neutral-600 dark:text-neutral-400">
            Institutions may request data export or deletion, subject to operational and legal
            requirements.
          </p>
        </div>
      ),
    },
    {
      id: 'reliability',
      number: '10',
      title: 'System Reliability',
      content: (
        <div className="space-y-3">
          <p>
            TestForge is designed for operational reliability. However, we do not guarantee
            uninterrupted or error-free service.
          </p>
          <p className="text-neutral-600 dark:text-neutral-400">
            In the event of system issues, corrective measures will be applied to restore normal
            operation and ensure continuity of examination activities.
          </p>
        </div>
      ),
    },
    {
      id: 'liability',
      number: '11',
      title: 'Limitation of Liability',
      content: (
        <div className="space-y-3">
          <p>To the maximum extent permitted by applicable law:</p>
          <ul className="list-disc space-y-1.5 pl-6 text-neutral-600 dark:text-neutral-400">
            <li>TestForge is not liable for indirect, incidental, or consequential damages</li>
            <li>Institutions are solely responsible for validating critical examination outputs</li>
            <li>
              Liability, if any, is limited to the total amount paid for the subscription period
            </li>
          </ul>
        </div>
      ),
    },
    {
      id: 'intellectual-property',
      number: '12',
      title: 'Intellectual Property',
      content: (
        <div className="space-y-3">
          <p>
            All software, design, branding, and intellectual property of TestForge belong
            exclusively to Acharya Technologies.
          </p>
          <p className="text-neutral-600 dark:text-neutral-400">
            Institutions are granted a limited, non-exclusive, non-transferable license to use
            TestForge solely for internal examination management purposes.
          </p>
        </div>
      ),
    },
    {
      id: 'termination',
      number: '13',
      title: 'Termination',
      content: (
        <div className="space-y-3">
          <p>
            We may suspend or terminate access to the platform in cases of misuse, violation of
            these Terms, or security risks.
          </p>
          <p className="text-neutral-600 dark:text-neutral-400">
            Institutions may discontinue use of the platform at any time.
          </p>
        </div>
      ),
    },
    {
      id: 'governing-law',
      number: '14',
      title: 'Governing Law',
      content:
        'These Terms are governed by the laws of the Republic of India. Any disputes arising hereunder shall be subject to the exclusive jurisdiction of the courts in Kolhapur, Maharashtra.',
    },
    {
      id: 'updates',
      number: '15',
      title: 'Updates to Terms',
      content:
        'These Terms may be updated periodically. Continued use of the platform after any changes constitutes acceptance of the updated Terms.',
    },
    {
      id: 'contact',
      number: '16',
      title: 'Contact',
      content: (
        <div className="space-y-1.5">
          <p className="font-medium text-neutral-800 dark:text-neutral-200">Acharya Technologies</p>
          <p className="text-neutral-600 dark:text-neutral-400">Kolhapur, Maharashtra, India</p>
          <p>
            <a
              href="mailto:support@testforge.tech"
              className="text-emerald-600 transition-colors hover:text-emerald-700 hover:underline dark:text-emerald-400 dark:hover:text-emerald-300"
            >
              support@testforge.tech
            </a>
          </p>
        </div>
      ),
    },
  ],
};

// ─── Privacy Sections ─────────────────────────────────────────

const PRIVACY_SECTIONS: DocumentSection = {
  id: 'privacy',
  title: 'Privacy Policy',
  shortTitle: 'Privacy',
  sections: [
    {
      id: 'privacy-intro',
      number: '1',
      title: 'Introduction',
      content:
        'This Privacy Policy explains how TestForge collects, uses, and protects institutional and academic data. We are committed to handling all data responsibly, transparently, and in accordance with applicable laws.',
    },
    {
      id: 'data-collected',
      number: '2',
      title: 'Data We Collect',
      content: (
        <div className="space-y-3">
          <p>We collect only data necessary for examination operations:</p>
          <ul className="list-disc space-y-1.5 pl-6 text-neutral-600 dark:text-neutral-400">
            <li>Student details (name, enrollment number, seat number)</li>
            <li>Staff and supervisor information</li>
            <li>Examination schedules and seating arrangements</li>
            <li>Institutional configuration data</li>
            <li>User account details (email, authentication data)</li>
            <li>System logs for security and debugging purposes</li>
          </ul>
          <p className="text-neutral-600 dark:text-neutral-400">
            <strong>We do not collect unrelated personal data.</strong>
          </p>
        </div>
      ),
    },
    {
      id: 'data-use',
      number: '3',
      title: 'How We Use Data',
      content: (
        <div className="space-y-3">
          <p>Data is used strictly for:</p>
          <ul className="list-disc space-y-1.5 pl-6 text-neutral-600 dark:text-neutral-400">
            <li>Examination planning and coordination</li>
            <li>Seating and supervision allocation</li>
            <li>Generating institutional reports</li>
            <li>Sending operational communications</li>
            <li>System improvement and reliability</li>
          </ul>
        </div>
      ),
    },
    {
      id: 'data-sharing',
      number: '4',
      title: 'Data Sharing',
      content: (
        <div className="space-y-3">
          <p>
            <strong className="text-neutral-800 dark:text-neutral-200">
              We do not sell or rent data.
            </strong>
          </p>
          <p>Data may be shared only with essential service providers:</p>
          <ul className="list-disc space-y-1.5 pl-6 text-neutral-600 dark:text-neutral-400">
            <li>
              <span className="font-medium text-neutral-700 dark:text-neutral-300">Razorpay</span> –
              Payment processing
            </li>
            <li>
              <span className="font-medium text-neutral-700 dark:text-neutral-300">Resend</span> –
              Email delivery
            </li>
            <li>
              <span className="font-medium text-neutral-700 dark:text-neutral-300">Google</span> –
              Authentication (if enabled)
            </li>
            <li>
              <span className="font-medium text-neutral-700 dark:text-neutral-300">
                AWS / DigitalOcean
              </span>{' '}
              – Database and storage hosting
            </li>
          </ul>
          <p className="text-neutral-600 dark:text-neutral-400">
            These providers process data exclusively for operational purposes and are bound by
            appropriate data protection obligations.
          </p>
        </div>
      ),
    },
    {
      id: 'data-storage',
      number: '5',
      title: 'Data Storage',
      content:
        'Data is stored in secure cloud-hosted databases and file storage systems with comprehensive access controls, monitoring, and encryption at rest.',
    },
    {
      id: 'privacy-retention',
      number: '6',
      title: 'Data Retention',
      content: (
        <div className="space-y-3">
          <ul className="list-disc space-y-1.5 pl-6 text-neutral-600 dark:text-neutral-400">
            <li>
              Operational examination data is retained only as long as necessary for exam cycles
            </li>
            <li>Institutional configuration may be retained for continuity of service</li>
            <li>Account data is retained until deletion is requested</li>
          </ul>
          <p className="text-neutral-600 dark:text-neutral-400">
            Institutions may request data export or deletion at any time.
          </p>
        </div>
      ),
    },
    {
      id: 'data-security',
      number: '7',
      title: 'Data Security',
      content: (
        <div className="space-y-3">
          <p>We implement reasonable industry-standard security practices including:</p>
          <ul className="list-disc space-y-1.5 pl-6 text-neutral-600 dark:text-neutral-400">
            <li>Secure authentication systems with multi-factor support</li>
            <li>Encrypted communication channels (TLS 1.2+)</li>
            <li>Access-restricted databases with role-based permissions</li>
            <li>Regular system backups and disaster recovery procedures</li>
          </ul>
          <p className="text-neutral-600 dark:text-neutral-400">
            While we maintain strong security safeguards, no system is completely immune to risks.
          </p>
        </div>
      ),
    },
    {
      id: 'user-rights',
      number: '8',
      title: 'Your Rights',
      content: (
        <div className="space-y-3">
          <p>Institutions have the right to:</p>
          <ul className="list-disc space-y-1.5 pl-6 text-neutral-600 dark:text-neutral-400">
            <li>Access their data</li>
            <li>Update incorrect information</li>
            <li>Request data export in a portable format</li>
            <li>Request deletion of data (subject to operational constraints)</li>
          </ul>
        </div>
      ),
    },
    {
      id: 'cookies',
      number: '9',
      title: 'Cookies',
      content:
        'We use only essential cookies required for authentication and session management. No advertising, tracking, or analytics cookies are used.',
    },
    {
      id: 'third-party',
      number: '10',
      title: 'Third-Party Services',
      content: (
        <div className="space-y-3">
          <p>We use the following trusted third-party providers:</p>
          <ul className="list-disc space-y-1.5 pl-6 text-neutral-600 dark:text-neutral-400">
            <li>
              <span className="font-medium text-neutral-700 dark:text-neutral-300">Razorpay</span> –
              Payment processing
            </li>
            <li>
              <span className="font-medium text-neutral-700 dark:text-neutral-300">Resend</span> –
              Email delivery
            </li>
            <li>
              <span className="font-medium text-neutral-700 dark:text-neutral-300">Google</span> –
              Authentication (if enabled)
            </li>
            <li>
              <span className="font-medium text-neutral-700 dark:text-neutral-300">
                Amazon Web Services (AWS)
              </span>{' '}
              – Cloud infrastructure
            </li>
            <li>
              <span className="font-medium text-neutral-700 dark:text-neutral-300">
                DigitalOcean
              </span>{' '}
              – Database hosting
            </li>
          </ul>
          <p className="text-neutral-600 dark:text-neutral-400">
            Each provider maintains its own privacy policy. We encourage you to review them.
          </p>
        </div>
      ),
    },
    {
      id: 'children',
      number: '11',
      title: "Children's Data",
      content:
        'TestForge processes student data exclusively as part of institutional examination workflows. All such data is provided by the institution, which is solely responsible for obtaining any necessary parental or guardian consent where required by applicable law.',
    },
    {
      id: 'policy-changes',
      number: '12',
      title: 'Changes to This Policy',
      content:
        'This Privacy Policy may be updated from time to time. Continued use of TestForge after any changes constitutes acceptance of the updated policy.',
    },
    {
      id: 'privacy-contact',
      number: '13',
      title: 'Contact',
      content: (
        <div className="space-y-1.5">
          <p className="font-medium text-neutral-800 dark:text-neutral-200">Acharya Technologies</p>
          <p className="text-neutral-600 dark:text-neutral-400">Kolhapur, Maharashtra, India</p>
          <p>
            <a
              href="mailto:support@testforge.tech"
              className="text-emerald-600 transition-colors hover:text-emerald-700 hover:underline dark:text-emerald-400 dark:hover:text-emerald-300"
            >
              support@testforge.tech
            </a>
          </p>
        </div>
      ),
    },
  ],
};

// ─── Accordion Section Component ─────────────────────────────

function AccordionSection({
  section,
  isOpen,
  onToggle,
  index,
}: {
  section: Section;
  isOpen: boolean;
  onToggle: () => void;
  index: number;
}) {
  return (
    <div className="border-b border-neutral-200 last:border-0 dark:border-neutral-800">
      <button
        onClick={onToggle}
        className="group flex w-full items-start gap-4 py-4 text-left transition-colors hover:bg-neutral-50/50 dark:hover:bg-neutral-900/30"
      >
        <span className="mt-0.5 min-w-[2.5rem] font-mono text-sm font-medium text-neutral-400 tabular-nums dark:text-neutral-500">
          {section.number}
        </span>
        <div className="flex-1">
          <span className="text-sm font-medium text-neutral-700 transition-colors group-hover:text-neutral-900 dark:text-neutral-300 dark:group-hover:text-neutral-100">
            {section.title}
          </span>
        </div>
        <ChevronDown
          className={cn(
            'mt-0.5 h-4 w-4 flex-shrink-0 text-neutral-400 transition-transform duration-200 group-hover:text-neutral-600 dark:group-hover:text-neutral-300',
            isOpen && 'rotate-180',
          )}
        />
      </button>
      {isOpen && (
        <div className="pb-6 pl-[4.5rem] text-sm text-neutral-600 dark:text-neutral-400">
          {typeof section.content === 'string' ? <p>{section.content}</p> : section.content}
        </div>
      )}
    </div>
  );
}

// ─── Document Viewer ──────────────────────────────────────────

function DocumentViewer({ document }: { document: DocumentSection }) {
  const [openSections, setOpenSections] = useState<Set<string>>(() => {
    // Default: open the first section
    return document.sections.length > 0 ? new Set([document.sections[0].id]) : new Set();
  });

  const toggleSection = (id: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleToggleAll = () => {
    if (openSections.size === document.sections.length) {
      setOpenSections(new Set());
    } else {
      setOpenSections(new Set(document.sections.map((s) => s.id)));
    }
  };

  const allOpen = openSections.size === document.sections.length;

  return (
    <div className="rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4 dark:border-neutral-800">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
            {document.id === 'terms' ? (
              <FileText className="h-4 w-4" />
            ) : (
              <Shield className="h-4 w-4" />
            )}
          </div>
          <div>
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
              {document.title}
            </h2>
            <p className="text-xs text-neutral-500">Last updated: June 2026</p>
          </div>
        </div>
        <button
          onClick={handleToggleAll}
          className="text-xs font-medium text-emerald-600 transition-colors hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300"
        >
          {allOpen ? 'Collapse All' : 'Expand All'}
        </button>
      </div>

      {/* Sections */}
      <div className="px-6">
        {document.sections.map((section, index) => (
          <AccordionSection
            key={section.id}
            section={section}
            isOpen={openSections.has(section.id)}
            onToggle={() => toggleSection(section.id)}
            index={index}
          />
        ))}
      </div>

      {/* Footer */}
      <div className="border-t border-neutral-200 px-6 py-4 dark:border-neutral-800">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-950/30">
            <Users className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
              Acharya Technologies
            </p>
            <p className="text-xs text-emerald-700 dark:text-emerald-400">
              Udyam No. UDYAM-MH-15-0241976 · MSME Registered
            </p>
            <p className="text-xs text-emerald-600 dark:text-emerald-500">
              Kolhapur, Maharashtra, India
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Tab Button ──────────────────────────────────────────────

function TabButton({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'relative flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all',
        active
          ? 'bg-white text-neutral-900 shadow-sm ring-1 ring-neutral-200/60 dark:bg-neutral-950 dark:text-neutral-50 dark:ring-neutral-800'
          : 'text-neutral-500 transition-colors hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-300',
      )}
    >
      {icon}
      <span>{label}</span>
      {count !== undefined && (
        <span
          className={cn(
            'ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium',
            active
              ? 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'
              : 'bg-neutral-100 text-neutral-400 dark:bg-neutral-800 dark:text-neutral-500',
          )}
        >
          {count}
        </span>
      )}
      {active && (
        <span className="absolute bottom-0 left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full bg-emerald-500" />
      )}
    </button>
  );
}

// ─── Main Page ──────────────────────────────────────────────

export default function TermsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'terms' | 'privacy'>('terms');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="h-9 w-20 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
          <div className="h-6 w-px bg-neutral-200 dark:bg-neutral-800" />
          <div className="h-4 w-12 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
        </div>
        <div className="h-16 w-48 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
        <div className="flex gap-1">
          <div className="h-10 w-32 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
          <div className="h-10 w-32 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
        </div>
        <div className="h-96 animate-pulse rounded-xl bg-neutral-100 dark:bg-neutral-800" />
      </div>
    );
  }

  const currentDoc = activeTab === 'terms' ? TERMS_SECTIONS : PRIVACY_SECTIONS;

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:px-6">
      {/* Navigation */}
      <nav
        className="flex items-center gap-3"
        aria-label="Breadcrumb"
      >
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.back()}
          className="gap-1.5 text-sm text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-300"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <div
          className="h-5 w-px bg-neutral-300 dark:bg-neutral-700"
          aria-hidden="true"
        />
        <span className="text-sm text-neutral-500 dark:text-neutral-400">Legal</span>
        <div
          className="h-5 w-px bg-neutral-300 dark:bg-neutral-700"
          aria-hidden="true"
        />
        <span className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
          {currentDoc.shortTitle}
        </span>
      </nav>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
          Terms & Privacy
        </h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Legal terms governing your use of TestForge
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-neutral-200 bg-neutral-50/50 p-1 dark:border-neutral-800 dark:bg-neutral-900/30">
        <TabButton
          active={activeTab === 'terms'}
          onClick={() => setActiveTab('terms')}
          icon={<FileText className="h-4 w-4" />}
          label="Terms & Conditions"
          count={TERMS_SECTIONS.sections.length}
        />
        <TabButton
          active={activeTab === 'privacy'}
          onClick={() => setActiveTab('privacy')}
          icon={<Shield className="h-4 w-4" />}
          label="Privacy Policy"
          count={PRIVACY_SECTIONS.sections.length}
        />
      </div>

      <Separator className="bg-neutral-200 dark:bg-neutral-800" />

      {/* Document */}
      <DocumentViewer document={currentDoc} />

      {/* Footer */}
      <footer className="border-t border-neutral-200 pt-4 dark:border-neutral-800">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-400">
          <span>© {new Date().getFullYear()} Acharya Technologies. All rights reserved.</span>
          <div className="flex items-center gap-3">
            <a
              href="mailto:support@testforge.tech"
              className="transition-colors hover:text-neutral-600 dark:hover:text-neutral-300"
            >
              support@testforge.tech
            </a>
            <span
              className="h-3 w-px bg-neutral-300 dark:bg-neutral-700"
              aria-hidden="true"
            />
            <span>Version 1.2</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
