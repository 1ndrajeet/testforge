// modules/automation/office-order-mail.tsx
'use client';

import { useCallback, useEffect, useState } from 'react';

import departments from '@/config/course_codes.json';
import { AlertCircle, Eye, Loader2, Mail, Plus, UserCheck, Users, Users2, X } from 'lucide-react';
import { HashLoader } from 'react-spinners';
import { toast } from 'sonner';

import { getOrders } from '@/lib/actions/order';
import { getStaff } from '@/lib/actions/staff';
import { cn } from '@/lib/utils';

import { useUserInfo } from '@/hooks/useUserInfo';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

import { MSBTEContextBar } from '@/components/layout/msbte-context-bar';
import { PageHeader } from '@/components/layout/page-layout';

import { EmailUsageStats } from '@/components/admin/email-usage-stats';

//  Constants

const EMAIL_EXCLUDES_KEY = 'order_email_excludes';
const QUOTA_LIMIT = 80;

//  Types

interface OrderDuty {
  DATE: string;
  SESSION: string;
}
interface OrderData {
  uid: string;
  NAME: string;
  ROLE: string;
  DEPARTMENT: string;
  EMAIL: string;
  ALLOTED: OrderDuty[];
  selected?: boolean;
  type?: 'supervision' | 'reliever' | 'chief';
}

interface OfficerInput {
  name: string;
  department: string;
  role: string;
  post: string;
  email: string;
}

type OrderType = 'supervision' | 'reliever' | 'chief';

//  Config

const ORDER_CONFIG = {
  supervision: {
    title: 'Supervisors',
    icon: UserCheck,
    staffType: 'SUPERVISOR' as const,
    orderType: 'supervision' as const,
    role: 'Block Supervisor',
  },
  reliever: {
    title: 'Relievers',
    icon: Users2,
    staffType: 'RELIEVER' as const,
    orderType: 'reliever' as const,
    role: 'Block Reliever',
  },
  chief: {
    title: 'Officers',
    icon: Users,
    staffType: null,
    orderType: null,
    role: 'Officer',
  },
} as const;

//  Helpers

const getDeptName = (code: string) => (departments as Record<string, string>)[code] || code;
const formatDateDisplay = (dateStr: string) => {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
};

const getDefaultExcludes = (userEmail: string) =>
  [userEmail, 'exampl.co', 'test@example.com'].filter(Boolean);

//  Email Template

const generateOrderEmail = (data: {
  recipient: OrderData;
  examCenter: { name: string; code: string; season: string; year: number };
  orderKey: string;
  collegeRefKey: string;
  type: OrderType;
}) => {
  const { recipient, examCenter, orderKey, type } = data;
  const config = ORDER_CONFIG[type];
  const role = recipient.ROLE || config.role;
  const workrole = config.role;

  const allotmentRows = recipient.ALLOTED.map(
    (block, index) => `
    <tr>
      <td style="border:1px solid #000;padding:6px 12px;text-align:center;">${index + 1}</td>
      <td style="border:1px solid #000;padding:6px 12px;text-align:center;">${formatDateDisplay(block.DATE)}</td>
      <td style="border:1px solid #000;padding:6px 12px;text-align:center;text-transform:uppercase;">${block.SESSION}</td>
    </tr>
  `,
  ).join('');

  const isChief = type === 'chief';
  const post = isChief ? (recipient as any).post || role : role;

  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Office Order - ${role}</title>
<style>
  body { font-family: 'Times New Roman', Times, serif; margin:0; padding:40px; background:#f5f5f5; }
  .container {  margin:0 auto; background:#fff; padding:40px; border:1px solid #ddd; }
  .header { text-align:center; border-bottom:2px solid #000; padding-bottom:20px; margin-bottom:30px; }
  .header h1 { font-size:24px; font-weight:bold; margin:0; text-transform:uppercase; letter-spacing:1px; }
  .header h2 { font-size:18px; font-weight:bold; margin:10px 0 0; text-transform:uppercase; }
  .ref { font-size:12px; color:#666; margin-top:4px; }
  .content { font-size:14px; line-height:1.6; }
  .content p { margin:8px 0; }
  .to-section { margin:16px 0; }
  .to-section p { margin:2px 0; }
  .subject-line { margin:16px 0; }
  .subject-line p { margin:2px 0; }
  table { width:100%; border-collapse:collapse; margin:16px 0; }
  table th { background:#f0f0f0; font-weight:bold; border:1px solid #000; padding:6px 12px; text-align:center; }
  table td { border:1px solid #000; padding:6px 12px; text-align:center; }
  .signature { margin-top:40px; text-align:right; border-top:1px solid #000; padding-top:20px; }
  .signature p { margin:2px 0; }
  .footer { margin-top:30px; text-align:center; font-size:10px; color:#999; border-top:1px solid #ddd; padding-top:15px; }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>${examCenter.name}</h1>
    <h2>Office Order</h2>
    <div class="ref">Ref: ${orderKey}</div>
  </div>
  <div class="content">
    <div class="to-section">
      <p><strong>To,</strong></p>
      <p><strong>${recipient.NAME}</strong></p>
      <p>${role}, ${getDeptName(recipient.DEPARTMENT)}</p>
      <p>${recipient.EMAIL}</p>
      <p>Diploma</p>
      <p><strong>${examCenter.name}</strong></p>
    </div>
    <div class="subject-line">
      <p><strong>Subject:</strong> ${isChief ? `Appointment of ${post}` : `Order of ${workrole}`} for ${examCenter.season} Exam – ${examCenter.year}</p>
      <p><strong>Reference:</strong> ${orderKey}</p>
    </div>
    <p>Sir/Madam,</p>
    <p>
      ${
        isChief
          ? `As per norms and directions from MSBTE, you are hereby appointed as <strong>${post}</strong> for the ${examCenter.season} ${examCenter.year} exam at exam center ${examCenter.code}. You will look after all examination related duties and ensure the examination is conducted smoothly.`
          : `You have been appointed as ${workrole} for the MSBTE Theory Examination of ${examCenter.season} ${examCenter.year} as per the following schedule. Please ensure all necessary arrangements are made for the smooth conduct of the examination.`
      }
    </p>
    ${
      !isChief && recipient.ALLOTED.length > 0
        ? `
    <table>
      <thead><tr><th>Sr. No</th><th>Date</th><th>Slot</th></tr></thead>
      <tbody>${allotmentRows}</tbody>
    </table>`
        : ''
    }
    ${isChief ? `<p>Thanking You,</p>` : ''}
    <div class="signature">
      <p><strong>${isChief ? 'Director' : 'Chief Officer In-charge'}</strong></p>
      <p>${examCenter.code} - ${examCenter.name}</p>
      ${isChief ? `<p>${(examCenter as any).address || ''}</p>` : ''}
    </div>
  </div>
  <div class="footer">
    <p>Generated by TestForge © ${new Date().getFullYear()}</p>
  </div>
</div>
</body>
</html>`;
};

//  Email Recipient List

const EmailRecipientList = ({
  recipients,
  onToggle,
  excludes,
  onAddExclude,
  onRemoveExclude,
  type,
  examCenter,
  orderKey,
  collegeRefKey,
}: {
  recipients: OrderData[];
  onToggle: (uid: string) => void;
  excludes: string[];
  onAddExclude: (email: string) => void;
  onRemoveExclude: (email: string) => void;
  type: OrderType;
  examCenter: any;
  orderKey: string;
  collegeRefKey: string;
}) => {
  const [newExclude, setNewExclude] = useState('');

  const handleAddExclude = () => {
    const email = newExclude.trim();
    if (!email) return toast.error('Enter an email or domain to exclude');
    if (excludes.includes(email)) return toast.warning(`${email} already excluded`);
    onAddExclude(email);
    setNewExclude('');
    toast.success(`Added ${email} to excludes`);
  };

  const totalSelected = recipients.filter((r) => r.selected).length;
  const total = recipients.length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Badge
            variant="secondary"
            className="text-xs"
          >
            {totalSelected} of {total} selected
          </Badge>
          <Badge
            variant="outline"
            className="text-xs"
          >
            Quota: {QUOTA_LIMIT - totalSelected} remaining
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => recipients.forEach((r) => onToggle(r.uid))}
            className="h-7 text-xs"
          >
            Select All
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              recipients.forEach((r) => {
                if (r.selected) onToggle(r.uid);
              })
            }
            className="h-7 text-xs"
          >
            Deselect All
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-neutral-200 dark:border-neutral-800">
        <div className="border-b border-neutral-200 p-2 dark:border-neutral-800">
          <div className="flex items-center gap-2">
            <Input
              placeholder="Add email to exclude (e.g., @example.com)"
              value={newExclude}
              onChange={(e) => setNewExclude(e.target.value)}
              className="h-8 flex-1 text-sm"
              onKeyDown={(e) => e.key === 'Enter' && handleAddExclude()}
            />
            <Button
              size="sm"
              onClick={handleAddExclude}
              className="h-8 text-xs"
            >
              Add Exclude
            </Button>
          </div>
          {excludes.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {excludes.map((email) => (
                <Badge
                  key={email}
                  variant="outline"
                  className="gap-1 text-xs"
                >
                  {email}
                  <X
                    className="h-3 w-3 cursor-pointer hover:text-red-500"
                    onClick={() => {
                      onRemoveExclude(email);
                      toast.success(`Removed ${email}`);
                    }}
                  />
                </Badge>
              ))}
            </div>
          )}
        </div>

        <ScrollArea className="h-[280px]">
          {recipients.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-neutral-400">
              No recipients found
            </div>
          ) : (
            recipients.map((recipient) => {
              const isExcluded = excludes.some(
                (e) => recipient.EMAIL?.includes(e) || (e.includes('@') && recipient.EMAIL === e),
              );
              const allotmentCount = recipient.ALLOTED?.length || 0;

              return (
                <div
                  key={recipient.uid}
                  className={cn(
                    'flex items-center justify-between border-b border-neutral-100 p-2 last:border-0 hover:bg-neutral-50',
                    isExcluded && 'line-through opacity-40',
                  )}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <Checkbox
                      checked={recipient.selected && !isExcluded}
                      onCheckedChange={() => !isExcluded && onToggle(recipient.uid)}
                      disabled={isExcluded}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{recipient.NAME}</span>
                        <Badge
                          variant="secondary"
                          className="text-[10px]"
                        >
                          {recipient.ROLE}
                        </Badge>
                        {allotmentCount > 0 && (
                          <Badge
                            variant="outline"
                            className="text-[10px]"
                          >
                            {allotmentCount} duties
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-neutral-500">
                        <span>{recipient.EMAIL || 'No email'}</span>
                        <span>•</span>
                        <span>{getDeptName(recipient.DEPARTMENT)}</span>
                      </div>
                    </div>
                  </div>
                  {isExcluded && (
                    <Badge
                      variant="outline"
                      className="text-[10px] text-neutral-400"
                    >
                      Excluded
                    </Badge>
                  )}
                </div>
              );
            })
          )}
        </ScrollArea>
      </div>
    </div>
  );
};

//  Main Component

export default function OfficeOrderMail() {
  const { examCenter, user, isLoading: userLoading } = useUserInfo();

  const [activeTab, setActiveTab] = useState<OrderType>('supervision');
  const [orderKey, setOrderKey] = useState('');
  const [collegeRefKey, setCollegeRefKey] = useState('');
  const [supervisors, setSupervisors] = useState<OrderData[]>([]);
  const [relievers, setRelievers] = useState<OrderData[]>([]);
  const [officers, setOfficers] = useState<OrderData[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [excludes, setExcludes] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(EMAIL_EXCLUDES_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          return Array.isArray(parsed) ? parsed : getDefaultExcludes(user?.email || '');
        }
      } catch {}
    }
    return getDefaultExcludes(user?.email || '');
  });

  const [newOfficer, setNewOfficer] = useState<OfficerInput>({
    name: '',
    department: '',
    role: '',
    post: '',
    email: '',
  });
  const roleOptions = ['Lecturer', 'HOD', 'Lab Assistant'];
  const postOptions = [
    'Chief Officer In-Charge',
    'Officer In-Charge',
    'Sealing Supervisor',
    'Exam Controller',
  ];

  // Save excludes to localStorage whenever they change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(EMAIL_EXCLUDES_KEY, JSON.stringify(excludes));
    }
  }, [excludes]);

  // Add user email to excludes on mount if not already present
  useEffect(() => {
    if (user?.email && !excludes.includes(user.email)) {
      setExcludes((prev) => [...prev, user.email]);
    }
  }, [user?.email]);

  const fetchData = useCallback(
    async (type: 'supervision' | 'reliever') => {
      if (!orderKey || !collegeRefKey) {
        toast.error('Please enter ORDER REF and COLLEGE REF keys');
        return;
      }
      setLoading(true);
      setError('');
      try {
        const config = ORDER_CONFIG[type];
        const [ordersResult, staffResult] = await Promise.all([
          getOrders({ orderType: config.orderType }),
          getStaff(config.staffType),
        ]);
        if (!ordersResult?.length) {
          toast.info(`No ${type} orders found`);
          return;
        }
        if (!staffResult.success || !staffResult.data) {
          toast.error('Failed to fetch staff data');
          return;
        }

        const staffMap = new Map(
          staffResult.data.map((s: any) => [
            s.uid,
            { name: s.name, role: s.role || '', department: s.department, email: s.email || '' },
          ]),
        );
        const grouped: OrderData[] = [];

        for (const order of ordersResult) {
          const staffMember = staffResult.data.find((s: any) => s.id === order.staffId);
          if (!staffMember) continue;
          const info = staffMap.get(staffMember.uid);
          if (!info) continue;
          let existing = grouped.find((g) => g.uid === staffMember.uid);
          if (!existing) {
            existing = {
              uid: staffMember.uid,
              NAME: info.name,
              ROLE: info.role || config.role,
              DEPARTMENT: info.department,
              EMAIL: info.email || '',
              ALLOTED: [],
              selected: true,
              type: type,
            };
            grouped.push(existing);
          }
          existing.ALLOTED.push({
            DATE: order.date ? new Date(order.date).toISOString().split('T')[0] : '',
            SESSION: order.session || 'Morning',
          });
        }
        grouped.forEach((g) =>
          g.ALLOTED.sort((a, b) => new Date(a.DATE).getTime() - new Date(b.DATE).getTime()),
        );

        if (type === 'supervision') setSupervisors(grouped);
        else setRelievers(grouped);
        toast.success(`Found ${grouped.length} ${type} orders`);
      } catch (err) {
        console.error(err);
        setError('Failed to fetch data');
        toast.error('Failed to fetch data');
      } finally {
        setLoading(false);
      }
    },
    [orderKey, collegeRefKey],
  );

  const handleAddOfficer = () => {
    if (
      !newOfficer.name ||
      !newOfficer.department ||
      !newOfficer.role ||
      !newOfficer.post ||
      !newOfficer.email
    ) {
      toast.error('Please fill in all officer fields');
      return;
    }
    setOfficers((prev) => [
      ...prev,
      {
        uid: `officer-${Date.now()}`,
        NAME: newOfficer.name,
        ROLE: newOfficer.role,
        DEPARTMENT: newOfficer.department,
        EMAIL: newOfficer.email,
        ALLOTED: [],
        selected: true,
        type: 'chief' as OrderType,
        post: newOfficer.post,
      },
    ]);
    setNewOfficer({ name: '', department: '', role: '', post: '', email: '' });
    toast.success('Officer added');
  };

  const handleRemoveOfficer = (uid: string) =>
    setOfficers((prev) => prev.filter((o) => o.uid !== uid));

  // FIXED: Properly update excludes state and localStorage
  const handleRemoveExclude = useCallback((email: string) => {
    setExcludes((prev) => {
      const newExcludes = prev.filter((e) => e !== email);
      // Save to localStorage immediately
      if (typeof window !== 'undefined') {
        localStorage.setItem(EMAIL_EXCLUDES_KEY, JSON.stringify(newExcludes));
      }
      return newExcludes;
    });
  }, []);

  // FIXED: Properly add exclude
  const handleAddExclude = useCallback((email: string) => {
    setExcludes((prev) => {
      if (prev.includes(email)) return prev;
      const newExcludes = [...prev, email];
      if (typeof window !== 'undefined') {
        localStorage.setItem(EMAIL_EXCLUDES_KEY, JSON.stringify(newExcludes));
      }
      return newExcludes;
    });
  }, []);

  const handleToggleRecipient = (type: OrderType, uid: string) => {
    if (type === 'supervision')
      setSupervisors((prev) =>
        prev.map((s) => (s.uid === uid ? { ...s, selected: !s.selected } : s)),
      );
    else if (type === 'reliever')
      setRelievers((prev) =>
        prev.map((s) => (s.uid === uid ? { ...s, selected: !s.selected } : s)),
      );
    else
      setOfficers((prev) => prev.map((s) => (s.uid === uid ? { ...s, selected: !s.selected } : s)));
  };

  const getAllRecipients = () => [
    ...supervisors.filter((s) => s.selected && !excludes.some((e) => s.EMAIL?.includes(e))),
    ...relievers.filter((s) => s.selected && !excludes.some((e) => s.EMAIL?.includes(e))),
    ...officers.filter((s) => s.selected && !excludes.some((e) => s.EMAIL?.includes(e))),
  ];

  const getTotalSelected = () => getAllRecipients().length;

  const handleSendEmails = async () => {
    const recipients = getAllRecipients();
    if (!recipients.length) {
      toast.error('No recipients selected');
      return;
    }
    if (recipients.length > QUOTA_LIMIT) {
      toast.error(`Quota exceeded. Max ${QUOTA_LIMIT} emails.`);
      return;
    }

    setSending(true);
    try {
      const emailData = {
        recipients: recipients.map((r) => ({
          email: r.EMAIL,
          name: r.NAME,
          type: r.type,
          allotments: r.ALLOTED,
          department: r.DEPARTMENT,
          role: r.ROLE,
          post: (r as any).post || r.ROLE,
        })),
        examCenter: {
          name: examCenter?.name || 'Examination Center',
          code: examCenter?.code || '',
          season: examCenter?.season || '',
          year: examCenter?.examYear || new Date().getFullYear(),
          address: examCenter?.address || '',
        },
        orderKey,
        collegeRefKey,
      };

      // Send each email individually with proper template
      const results = [];
      for (const recipient of recipients) {
        const html = generateOrderEmail({
          recipient,
          examCenter: {
            name: examCenter?.name || 'Examination Center',
            code: examCenter?.code || '',
            season: examCenter?.season || '',
            year: examCenter?.examYear || new Date().getFullYear(),
          },
          orderKey,
          collegeRefKey,
          type: recipient.type || 'supervision',
        });

        const res = await fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipients: [{ email: recipient.EMAIL, name: recipient.NAME }],
            subject: `Office Order - ${recipient.ROLE} (${examCenter?.season || ''} ${examCenter?.examYear || ''})`,
            html,
          }),
        });
        results.push(await res.json());
      }

      const sent = results.filter((r) => r.success).length;
      toast.success(`Sent ${sent} of ${recipients.length} emails`);
      if (sent < recipients.length) toast.warning(`${recipients.length - sent} emails failed`);
    } catch (error) {
      console.error(error);
      toast.error('Failed to send emails');
    } finally {
      setSending(false);
    }
  };

  const handleFetchAll = async () => {
    await Promise.all([fetchData('supervision'), fetchData('reliever')]);
  };

  const handleReset = () => {
    setOrderKey('');
    setCollegeRefKey('');
    setSupervisors([]);
    setRelievers([]);
    setOfficers([]);
    setShowPreview(false);
  };

  const handlePreview = () => {
    if (getTotalSelected() === 0) {
      toast.error('No recipients selected');
      return;
    }
    setShowPreview(true);
  };

  if (userLoading) {
    return (
      <div className="bg-background/80 fixed inset-0 z-50 flex flex-col items-center justify-center backdrop-blur-sm">
        <HashLoader
          size={60}
          color="#059669"
        />
        <p className="text-muted-foreground mt-6 text-sm font-medium">Loading...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Please log in to access this page.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-7xl space-y-6 px-4 py-8">
      <PageHeader
        title="Office Order Mail"
        description="Generate and send office orders to supervisors, relievers, and officers"
        icon={Mail}
        actions={
          <div className="flex items-center gap-2">
            <Badge
              variant="secondary"
              className="text-xs"
            >
              Quota: {QUOTA_LIMIT - getTotalSelected()} remaining
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              className="h-8 gap-1.5 text-xs"
            >
              <X className="h-3.5 w-3.5" /> Reset
            </Button>
          </div>
        }
      />
      <div>
        <EmailUsageStats />
      </div>
      <MSBTEContextBar
        season={examCenter?.season as 'Summer' | 'Winter'}
        year={examCenter?.examYear!}
        compact
      />

      {/* Input Section */}
      <Card className="border-neutral-200 shadow-sm">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-neutral-600">
                Order Ref Key <span className="text-red-500">*</span>
              </Label>
              <Input
                placeholder="Enter ORDER REF key"
                value={orderKey}
                onChange={(e) => setOrderKey(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-neutral-600">
                College Ref Key <span className="text-red-500">*</span>
              </Label>
              <Input
                placeholder="Enter COLLEGE REF key"
                value={collegeRefKey}
                onChange={(e) => setCollegeRefKey(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <div className="flex items-end gap-2">
              <Button
                onClick={handleFetchAll}
                disabled={loading || !orderKey || !collegeRefKey}
                className="h-9 flex-1 gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                size="sm"
              >
                {loading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Users className="h-3.5 w-3.5" />
                )}
                Fetch All
              </Button>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (orderKey && collegeRefKey) fetchData('supervision');
                      }}
                      className="h-9 px-3"
                      disabled={loading || !orderKey || !collegeRefKey}
                    >
                      <UserCheck className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Fetch Supervisors</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (orderKey && collegeRefKey) fetchData('reliever');
                      }}
                      className="h-9 px-3"
                      disabled={loading || !orderKey || !collegeRefKey}
                    >
                      <Users2 className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Fetch Relievers</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as OrderType)}
        className="space-y-4"
      >
        <TabsList className="grid w-full grid-cols-3 rounded-xl bg-neutral-100 p-1 dark:bg-neutral-800">
          <TabsTrigger
            value="supervision"
            className="gap-2 rounded-lg data-[state=active]:bg-white"
          >
            <UserCheck className="h-4 w-4" /> Supervisors ({supervisors.length})
          </TabsTrigger>
          <TabsTrigger
            value="reliever"
            className="gap-2 rounded-lg data-[state=active]:bg-white"
          >
            <Users2 className="h-4 w-4" /> Relievers ({relievers.length})
          </TabsTrigger>
          <TabsTrigger
            value="chief"
            className="gap-2 rounded-lg data-[state=active]:bg-white"
          >
            <Users className="h-4 w-4" /> Officers ({officers.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="supervision">
          {supervisors.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-neutral-400">
              <UserCheck className="mb-4 h-12 w-12 opacity-30" />
              <p className="text-sm">No supervisors fetched</p>
              <p className="text-xs">Click "Fetch All" above</p>
            </div>
          ) : (
            <EmailRecipientList
              recipients={supervisors}
              onToggle={(uid) => handleToggleRecipient('supervision', uid)}
              excludes={excludes}
              onAddExclude={handleAddExclude}
              onRemoveExclude={handleRemoveExclude}
              type="supervision"
              examCenter={examCenter}
              orderKey={orderKey}
              collegeRefKey={collegeRefKey}
            />
          )}
        </TabsContent>

        <TabsContent value="reliever">
          {relievers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-neutral-400">
              <Users2 className="mb-4 h-12 w-12 opacity-30" />
              <p className="text-sm">No relievers fetched</p>
              <p className="text-xs">Click "Fetch All" above</p>
            </div>
          ) : (
            <EmailRecipientList
              recipients={relievers}
              onToggle={(uid) => handleToggleRecipient('reliever', uid)}
              excludes={excludes}
              onAddExclude={handleAddExclude}
              onRemoveExclude={handleRemoveExclude}
              type="reliever"
              examCenter={examCenter}
              orderKey={orderKey}
              collegeRefKey={collegeRefKey}
            />
          )}
        </TabsContent>

        <TabsContent value="chief">
          <div className="space-y-4">
            <div className="flex flex-row flex-wrap items-end gap-3 rounded-lg bg-neutral-50 p-3 dark:bg-neutral-900/50">
              <div className="min-w-[140px] flex-1 space-y-1">
                <Label className="text-xs font-medium">Name</Label>
                <Input
                  placeholder="Name"
                  value={newOfficer.name}
                  onChange={(e) => setNewOfficer({ ...newOfficer, name: e.target.value })}
                  className="h-8 text-sm"
                />
              </div>
              <div className="min-w-[140px] flex-1 space-y-1">
                <Label className="text-xs font-medium">Department</Label>
                <Input
                  placeholder="Department"
                  value={newOfficer.department}
                  onChange={(e) => setNewOfficer({ ...newOfficer, department: e.target.value })}
                  className="h-8 text-sm"
                />
              </div>
              <div className="min-w-[140px] flex-1 space-y-1">
                <Label className="text-xs font-medium">Email</Label>
                <Input
                  placeholder="Email"
                  type="email"
                  value={newOfficer.email}
                  onChange={(e) => setNewOfficer({ ...newOfficer, email: e.target.value })}
                  className="h-8 text-sm"
                />
              </div>
              <div className="min-w-[120px] flex-1 space-y-1">
                <Label className="text-xs font-medium">Role</Label>
                <Select
                  onValueChange={(v) => setNewOfficer({ ...newOfficer, role: v })}
                  value={newOfficer.role}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Role" />
                  </SelectTrigger>
                  <SelectContent>
                    {roleOptions.map((r) => (
                      <SelectItem
                        key={r}
                        value={r}
                      >
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-[140px] flex-1 space-y-1">
                <Label className="text-xs font-medium">Post</Label>
                <Select
                  onValueChange={(v) => setNewOfficer({ ...newOfficer, post: v })}
                  value={newOfficer.post}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Post" />
                  </SelectTrigger>
                  <SelectContent>
                    {postOptions.map((p) => (
                      <SelectItem
                        key={p}
                        value={p}
                      >
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={handleAddOfficer}
                className="h-8 gap-1 text-xs"
              >
                <Plus className="h-3.5 w-3.5" /> Add
              </Button>
            </div>

            {officers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-neutral-400">
                <Users className="mb-3 h-10 w-10 opacity-30" />
                <p className="text-sm">No officers added</p>
              </div>
            ) : (
              <div className="rounded-lg border border-neutral-200 dark:border-neutral-800">
                <div className="border-b border-neutral-200 p-3 dark:border-neutral-800">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{officers.length} officers added</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setOfficers([])}
                      className="h-7 text-xs text-red-500 hover:text-red-600"
                    >
                      Clear All
                    </Button>
                  </div>
                </div>
                <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
                  {officers.map((officer) => (
                    <div
                      key={officer.uid}
                      className="flex items-center justify-between p-3 hover:bg-neutral-50"
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <Checkbox
                          checked={officer.selected}
                          onCheckedChange={() => handleToggleRecipient('chief', officer.uid)}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium">{officer.NAME}</span>
                            <Badge
                              variant="secondary"
                              className="text-[10px]"
                            >
                              {officer.ROLE}
                            </Badge>
                            <Badge
                              variant="outline"
                              className="text-[10px]"
                            >
                              {(officer as any).post || officer.ROLE}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-neutral-500">
                            <span>{officer.EMAIL}</span>
                            <span>•</span>
                            <span>{getDeptName(officer.DEPARTMENT)}</span>
                          </div>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleRemoveOfficer(officer.uid)}
                        className="h-7 w-7 text-red-500 hover:bg-red-50 hover:text-red-600"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Footer */}
      <div className="flex items-center justify-between gap-3 border-t border-neutral-200 pt-4 dark:border-neutral-800">
        <div className="flex items-center gap-3">
          <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400">
            {getTotalSelected()} selected
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handlePreview}
            disabled={getTotalSelected() === 0}
            className="h-9 gap-1.5 text-sm"
          >
            <Eye className="h-4 w-4" /> Preview
          </Button>
          <Button
            onClick={handleSendEmails}
            disabled={sending || getTotalSelected() === 0}
            className="h-9 gap-1.5 bg-emerald-600 hover:bg-emerald-700"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
            {sending ? 'Sending...' : `Send All (${getTotalSelected()})`}
          </Button>
        </div>
      </div>

      {/* Preview Dialog */}
      <Dialog
        open={showPreview}
        onOpenChange={setShowPreview}
      >
        <DialogContent className="max-h-[90vh] max-w-7xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-emerald-500" /> Order Preview
            </DialogTitle>
            <DialogDescription>
              {getTotalSelected()} recipients · {orderKey} · {collegeRefKey}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6">
            {getAllRecipients().map((recipient) => {
              const html = generateOrderEmail({
                recipient,
                examCenter: {
                  name: examCenter?.name || 'Examination Center',
                  code: examCenter?.code || '',
                  season: examCenter?.season || '',
                  year: examCenter?.examYear || new Date().getFullYear(),
                },
                orderKey,
                collegeRefKey,
                type: recipient.type || 'supervision',
              });
              return (
                <div
                  key={recipient.uid}
                  className="overflow-hidden rounded-lg border border-neutral-200"
                >
                  <div className="flex items-center justify-between border-b border-neutral-200 bg-neutral-50 px-4 py-2">
                    <span className="text-sm font-medium">
                      {recipient.NAME} - {recipient.EMAIL}
                    </span>
                    <Badge
                      variant="secondary"
                      className="text-[10px]"
                    >
                      {recipient.ROLE}
                    </Badge>
                  </div>
                  <div
                    className="p-4 text-sm"
                    dangerouslySetInnerHTML={{ __html: html }}
                  />
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowPreview(false)}
            >
              Close
            </Button>
            <Button
              onClick={handleSendEmails}
              disabled={sending}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Mail className="h-4 w-4" />
              )}
              {sending ? 'Sending...' : 'Send All'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {error && (
        <Alert
          variant="destructive"
          className="flex items-center gap-2"
        >
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
