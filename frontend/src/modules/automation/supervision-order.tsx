// modules/automation/order-report.tsx
'use client';

import { memo, useCallback, useEffect, useRef, useState } from 'react';

import { motion } from 'framer-motion';
import {
  AlertCircle,
  ChevronDown,
  ChevronLeft,
  Globe,
  Headphones,
  Image as ImageIcon,
  Loader2,
  Mail,
  Pencil,
  Phone,
  Plus,
  Printer,
  Save,
  Settings,
  Settings2,
  UserCheck,
  Users,
  Users2,
  X,
} from 'lucide-react';
import { HashLoader } from 'react-spinners';
import { useReactToPrint } from 'react-to-print';
import { toast } from 'sonner';

import { PageEmpty, PageHeader } from '@/components/layout/page-layout';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import departments from '@/config/course_codes.json';
import { useUserInfo } from '@/hooks/useUserInfo';
import { getOrders } from '@/lib/actions/order';
import { getStaff } from '@/lib/actions/staff';
import { cn } from '@/lib/utils';

//  Constants

const STORAGE_KEY = 'order_letterhead';
const PAGE_STYLE = {
  width: '210mm',
  height: '297mm',
  margin: '0 auto',
  marginBlockEnd: '8px',
  padding: '15mm 18mm',
  boxSizing: 'border-box' as const,
  backgroundColor: '#ffffff',
  fontFamily: "'Times New Roman', Times, serif",
} as const;

//  Types

interface OrderDuty {
  DATE: string;
  SESSION: string;
}
interface OrderData {
  NAME: string;
  ROLE: string;
  DEPARTMENT: string;
  EMAIL: string;
  ALLOTED: OrderDuty[];
}
interface CollegeInfo {
  name: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  tel: string;
  cell: string;
  email: string;
  website: string;
  logo: string;
  ref: string;
  date: string;
}

type OrderType = 'supervision' | 'reliever' | 'chief';

//  Config

const ORDER_CONFIG = {
  supervision: {
    title: 'Supervisor Office Order',
    description: 'Generate office orders for block supervisors',
    icon: UserCheck,
    role: 'Block Supervisor',
    staffType: 'SUPERVISOR' as const,
    orderType: 'supervision' as const,
    subjectPrefix: 'Supervisor',
    hasAllotments: true,
    fetchFromDb: true,
  },
  reliever: {
    title: 'Reliever Office Order',
    description: 'Generate office orders for block relievers',
    icon: Users2,
    role: 'Block Reliever',
    staffType: 'RELIEVER' as const,
    orderType: 'reliever' as const,
    subjectPrefix: 'Reliever',
    hasAllotments: true,
    fetchFromDb: true,
  },
  chief: {
    title: 'Chief & Control Room Office Order',
    description: 'Generate office orders for chief officers and control room staff',
    icon: Users,
    role: 'Officer',
    staffType: null,
    orderType: null,
    subjectPrefix: 'Officer',
    hasAllotments: false,
    fetchFromDb: false,
  },
} as const;

//  Helpers

const getDeptName = (code: string) => (departments as Record<string, string>)[code] || code;
const formatDateDisplay = (dateStr: string) => {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return dateStr;
  }
};
const formatDate = (date: Date) =>
  date.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });

//  Legal Letterhead

const LegalLetterhead = ({ info, className }: { info: CollegeInfo; className?: string }) => {
  const [logoError, setLogoError] = useState(false);
  useEffect(() => setLogoError(false), [info.logo]);

  return (
    <div className={cn('mb-6 border-b-2 border-black pb-4', className)}>
      <div className="flex items-center justify-center gap-5">
        <div className="flex-shrink-0">
          {info.logo && !logoError ? (
            <img
              src={info.logo}
              alt={info.name}
              className="m-auto h-24 w-24 rounded-md border border-neutral-200 bg-white object-contain"
              onError={() => setLogoError(true)}
              onLoad={() => setLogoError(false)}
            />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-md border border-neutral-300 bg-neutral-100">
              <ImageIcon className="h-8 w-8 text-neutral-400" />
            </div>
          )}
        </div>
        <div className="flex-1">
          <div className="text-2xl leading-tight font-extrabold tracking-wide text-neutral-900 uppercase">
            {info.name}
          </div>
          <div className="mt-0.5 text-sm text-neutral-600">
            {[info.address, info.city, info.state, info.pincode && `- ${info.pincode}`].filter(Boolean).join(', ')}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-5 gap-y-0.5 text-xs text-neutral-600">
            {info.tel && info.tel !== '+91-' && (
              <span className="flex items-center gap-1">
                <Headphones className="h-3 w-3" />
                <strong>Tel:</strong> {info.tel}
              </span>
            )}
            {info.cell && info.cell !== '+91-' && (
              <span className="flex items-center gap-1">
                <Phone className="h-3 w-3" />
                <strong>Cell:</strong> {info.cell}
              </span>
            )}
            {info.email && (
              <span className="flex items-center gap-1">
                <Mail className="h-3 w-3" />
                <strong>Email:</strong> <a href={'mailto:' + info.email}>{info.email}</a>
              </span>
            )}
            {info.website && (
              <span className="flex items-center gap-1">
                <Globe className="h-3 w-3" />
                <strong>Web:</strong> <a href={info.website}>{info.website}</a>
              </span>
            )}
          </div>
          <div className="mt-1.5 flex justify-between border-t border-neutral-200 pt-1.5 text-xs font-medium">
            <span>
              <strong>Ref:</strong> {info.ref}
            </span>
            <span>
              <strong>Date:</strong> {info.date}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

//  College Header Editor

const Field = memo(
  ({
    label,
    fieldKey,
    value,
    onChange,
    placeholder,
    type,
    className,
  }: {
    label: string;
    fieldKey: string;
    value: string;
    onChange: (key: string, value: string) => void;
    placeholder?: string;
    type?: string;
    className?: string;
  }) => {
    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        onChange(fieldKey, e.target.value);
      },
      [fieldKey, onChange]
    );

    return (
      <div className={cn('space-y-1.5', className)}>
        <Label className="text-xs font-medium">{label}</Label>
        <Input value={value} onChange={handleChange} placeholder={placeholder} type={type} className="h-9 text-sm" />
      </div>
    );
  }
);
Field.displayName = 'Field';

const CollegeHeaderEditor = ({
  info,
  onSave,
  onCancel,
}: {
  info: CollegeInfo;
  onSave: (info: CollegeInfo) => void;
  onCancel: () => void;
}) => {
  const [form, setForm] = useState(info);
  const [logoValid, setLogoValid] = useState<boolean | null>(null);
  const [checkingLogo, setCheckingLogo] = useState(false);
  const checkTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const checkLogo = useCallback((src: string) => {
    const value = src.trim();
    if (!value) {
      setLogoValid(null);
      setCheckingLogo(false);
      return;
    }

    setCheckingLogo(true);

    if (checkTimeoutRef.current) {
      clearTimeout(checkTimeoutRef.current);
    }

    const img = new Image();
    let isResolved = false;

    const timeoutId = setTimeout(() => {
      if (!isResolved) {
        isResolved = true;
        setLogoValid(false);
        setCheckingLogo(false);
      }
    }, 5000);

    checkTimeoutRef.current = timeoutId;

    img.onload = () => {
      if (!isResolved) {
        isResolved = true;
        clearTimeout(timeoutId);
        setLogoValid(true);
        setCheckingLogo(false);
      }
    };

    img.onerror = () => {
      if (!isResolved) {
        isResolved = true;
        clearTimeout(timeoutId);
        setLogoValid(false);
        setCheckingLogo(false);
      }
    };

    try {
      if (/^https?:\/\//i.test(value)) {
        new URL(value);
        img.src = value;
      } else {
        img.src = new URL(value, window.location.origin).href;
      }
    } catch {
      if (!isResolved) {
        isResolved = true;
        clearTimeout(timeoutId);
        setLogoValid(false);
        setCheckingLogo(false);
      }
    }
  }, []);

  useEffect(() => {
    return () => {
      if (checkTimeoutRef.current) {
        clearTimeout(checkTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (form.logo) {
      const timer = setTimeout(() => {
        checkLogo(form.logo);
      }, 500);
      return () => clearTimeout(timer);
    } else {
      setLogoValid(null);
      setCheckingLogo(false);
    }
  }, [form.logo, checkLogo]);

  const handleFieldChange = useCallback((key: string, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }));
  }, []);

  const handleSubmit = useCallback(() => {
    if (!form.name.trim()) {
      toast.error('College name is required');
      return;
    }
    onSave(form);
    toast.success('Letterhead updated and saved');
  }, [form, onSave]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="College Name *" fieldKey="name" value={form.name} onChange={handleFieldChange} />
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Logo URL</Label>
          <div className="relative">
            <Input
              value={form.logo}
              onChange={e => handleFieldChange('logo', e.target.value)}
              placeholder="/institutes/logo.webp"
              className={cn(
                'h-9 text-sm transition-all duration-200',
                logoValid === true && 'border-green-500 focus-visible:ring-green-500',
                logoValid === false && 'border-red-500 focus-visible:ring-red-500'
              )}
            />
          </div>
          {form.logo && logoValid === true && (
            <div className="mt-1 flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-green-500" />
              <p className="text-xs text-green-600">Logo found</p>
            </div>
          )}
          {form.logo && logoValid === false && (
            <div className="mt-1 flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-red-500" />
              <p className="text-xs text-red-500">Logo not found</p>
            </div>
          )}
          {form.logo && logoValid === null && !checkingLogo && (
            <p className="mt-1 text-xs text-neutral-400">Enter a URL to validate</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Field label="Address Line" fieldKey="address" value={form.address} onChange={handleFieldChange} />
        <Field label="City" fieldKey="city" value={form.city} onChange={handleFieldChange} />
        <Field label="State" fieldKey="state" value={form.state} onChange={handleFieldChange} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Field label="Pincode" fieldKey="pincode" value={form.pincode} onChange={handleFieldChange} />
        <Field label="Telephone" fieldKey="tel" value={form.tel} onChange={handleFieldChange} />
        <Field label="Mobile" fieldKey="cell" value={form.cell} onChange={handleFieldChange} />
        <Field label="Email" fieldKey="email" value={form.email} onChange={handleFieldChange} type="email" />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field
          label="Website"
          fieldKey="website"
          value={form.website}
          onChange={handleFieldChange}
          placeholder="www.college.edu.in"
        />
        <Field label="Reference" fieldKey="ref" value={form.ref} onChange={handleFieldChange} />
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-neutral-200 pt-2">
        <Button variant="outline" size="sm" onClick={onCancel} className="h-8 gap-1 text-xs">
          <X className="h-3.5 w-3.5" />
          Cancel
        </Button>
        <Button size="sm" onClick={handleSubmit} className="h-8 gap-1 bg-emerald-600 text-xs hover:bg-emerald-700">
          <Save className="h-3.5 w-3.5" />
          Save
        </Button>
      </div>
    </div>
  );
};

//  College Header

const CollegeHeader = ({
  collegeRefKey,
  userEmail,
  examCenterName,
  examCenterAddress,
  onLetterheadChange,
  isExpanded,
  onToggle,
}: any) => {
  const [isEditing, setIsEditing] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  const [info, setInfo] = useState<CollegeInfo>(() => {
    const defaults = {
      name: examCenterName || 'Examination Center',
      address: examCenterAddress || '',
      city: '',
      state: 'Maharashtra',
      pincode: '',
      tel: '+91-',
      cell: '+91-',
      email: userEmail || '',
      website: '',
      logo: '',
      ref: collegeRefKey || '',
      date: formatDate(new Date()),
    };

    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          return { ...defaults, ...parsed };
        }
      } catch {}
    }
    return defaults;
  });

  useEffect(() => {
    setIsInitialized(true);
    onLetterheadChange?.(info);
  }, []);

  useEffect(() => {
    if (isInitialized && typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(info));
      onLetterheadChange?.(info);
    }
  }, [info, isInitialized]);

  if (!isInitialized)
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
      </div>
    );

  return (
    <div className="space-y-2">
      {isExpanded && (
        <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
          {isEditing ? (
            <CollegeHeaderEditor
              info={info}
              onSave={updated => {
                setInfo(updated);
                setIsEditing(false);
                onLetterheadChange?.(updated);
                toast.success('Letterhead updated');
              }}
              onCancel={() => setIsEditing(false)}
            />
          ) : (
            <div className="relative">
              <LegalLetterhead info={info} />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsEditing(true)}
                className="absolute top-0 right-0 gap-1 text-xs text-neutral-400 hover:text-neutral-600"
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

//  Report Content

const ReportContent = ({
  data,
  examCenter,
  orderKey,
  collegeRefKey,
  letterheadInfo,
  type,
}: {
  data: OrderData | { name: string; role: string; department: string; email: string; post?: string };
  examCenter: { name: string; code: string; season: string; examYear: number; address: string };
  orderKey: string;
  collegeRefKey: string;
  letterheadInfo: CollegeInfo;
  type: OrderType;
}) => {
  const letterheadData = { ...letterheadInfo, ref: collegeRefKey || letterheadInfo.ref, date: formatDate(new Date()) };
  const config = ORDER_CONFIG[type];
  const isChief = type === 'chief';

  // Handle both data formats
  const name = 'NAME' in data ? data.NAME : data.name;
  const role = 'ROLE' in data ? data.ROLE : data.role;
  const department = 'DEPARTMENT' in data ? data.DEPARTMENT : data.department;
  const email = 'EMAIL' in data ? data.EMAIL : data.email;
  const post = 'post' in data ? data.post : role || config.role;
  const allotments = 'ALLOTED' in data ? data.ALLOTED : [];

  return (
    <div style={PAGE_STYLE} className="relative flex flex-col border border-neutral-300 bg-white shadow-lg">
      <LegalLetterhead info={letterheadData} />
      <div className="flex-1 pt-2">
        <h2 className="mb-6 text-center text-2xl font-bold tracking-wide text-neutral-900 uppercase">Office Order</h2>
        <div className="space-t-5 text-sm">
          <div className="space-y-1">
            <p className="font-medium">To,</p>
            <p className="text-base font-semibold">{name || 'To be appointed'}</p>
            <p>
              {role || config.role}, {getDeptName(department || '—')}
            </p>
            <p>{email || '—'}</p>
            <p>Diploma</p>
            <p className="font-medium">{examCenter.name || 'Examination Center'}</p>
          </div>
          <div className="my-4">
            <p>
              <span className="font-semibold">Subject:</span> Appointment of {post || config.subjectPrefix} (
              {examCenter.code}) for {examCenter.season || ''} Exam – {examCenter.examYear || ''}
            </p>
            <p>
              <span className="font-semibold">Reference:</span> {orderKey}
            </p>
          </div>
          <p className="text-justify">
            Sir/Madam,
            <br />
            {isChief ? (
              <>
                As per norms and directions from MSBTE, you are hereby appointed as <strong>{post}</strong> for the{' '}
                {examCenter.season || ''} {examCenter.examYear || ''} exam at exam center {examCenter.code}.
                <br />
                You will look after all examination related duties from <strong>{formatDate(new Date())}</strong> and
                see that the {examCenter.season || ''} {examCenter.examYear || ''} examination is conducted in smooth
                manner within the law and order of MSBTE, Mumbai.
              </>
            ) : (
              <>
                You have been appointed as {config.subjectPrefix} for the MSBTE Theory Examination of{' '}
                {examCenter.season || ''} {examCenter.examYear || ''} as per the following schedule. Please ensure all
                necessary arrangements are made for the smooth conduct of the examination.
              </>
            )}
          </p>
          {!isChief && allotments.length > 0 && (
            <div className="py-2">
              <Table className="border-collapse">
                <TableHeader>
                  <TableRow className="bg-neutral-100">
                    <TableHead className="border border-black px-4 py-2 text-center font-semibold">Sr. No</TableHead>
                    <TableHead className="border border-black px-4 py-2 text-center font-semibold">Date</TableHead>
                    <TableHead className="border border-black px-4 py-2 text-center font-semibold">Slot</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allotments.map((block: OrderDuty, index: number) => (
                    <TableRow key={index}>
                      <TableCell className="border border-black px-4 py-2 text-center">{index + 1}</TableCell>
                      <TableCell className="border border-black px-4 py-2 text-center">
                        {formatDateDisplay(block.DATE)}
                      </TableCell>
                      <TableCell className="border border-black px-4 py-2 text-center uppercase">
                        {block.SESSION}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {isChief && <p className="mt-4">Thanking You,</p>}
        </div>
      </div>
      <div className="mt-auto border-t border-black pt-4">
        <div className="text-right">
          <p className="font-semibold">{isChief ? 'Director' : 'Chief Officer In-charge'}</p>
          <p className="text-sm">
            {examCenter.code || ''} - {examCenter.name || 'Examination Center'}
          </p>
          {isChief && <p className="text-sm text-neutral-500">{examCenter.address || ''}</p>}
        </div>
        <div className="mt-2 text-center text-[10px] text-neutral-400">
          Generated by TestForge {new Date().getFullYear()}
        </div>
      </div>
    </div>
  );
};

//  Chief Officer Input Form

const ChiefInputForm = ({
  officers,
  setOfficers,
}: {
  officers: any[];
  setOfficers: (o: any[]) => void;
  onGenerate: () => void;
}) => {
  const [newOfficer, setNewOfficer] = useState({ name: '', department: '', role: '', post: '', email: '' });
  const roleOptions = ['Lecturer', 'HOD', 'Lab Assistant'];
  const postOptions = ['Chief Officer In-Charge', 'Officer In-Charge', 'Sealing Supervisor', 'Exam Controller'];

  const addOfficer = () => {
    if (!newOfficer.name || !newOfficer.department || !newOfficer.role || !newOfficer.post || !newOfficer.email) {
      toast.error('Please fill in all officer fields');
      return;
    }
    setOfficers([...officers, newOfficer]);
    setNewOfficer({ name: '', department: '', role: '', post: '', email: '' });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-row flex-wrap items-end gap-4">
        <div className="min-w-[180px] flex-1 space-y-1">
          <Label className="text-sm font-medium">Name</Label>
          <Input
            name="name"
            placeholder="Enter officer's name"
            value={newOfficer.name}
            onChange={e => setNewOfficer({ ...newOfficer, name: e.target.value })}
            className="h-9 w-full"
          />
        </div>
        <div className="min-w-[180px] flex-1 space-y-1">
          <Label className="text-sm font-medium">Department</Label>
          <Input
            name="department"
            placeholder="Enter department"
            value={newOfficer.department}
            onChange={e => setNewOfficer({ ...newOfficer, department: e.target.value })}
            className="h-9 w-full"
          />
        </div>
        <div className="min-w-[180px] flex-1 space-y-1">
          <Label className="text-sm font-medium">Email</Label>
          <Input
            name="email"
            type="email"
            placeholder="Enter email"
            value={newOfficer.email}
            onChange={e => setNewOfficer({ ...newOfficer, email: e.target.value })}
            className="h-9 w-full"
          />
        </div>
        <div className="min-w-[180px] flex-1 space-y-1">
          <Label className="text-sm font-medium">Role</Label>
          <Select onValueChange={v => setNewOfficer({ ...newOfficer, role: v })} value={newOfficer.role}>
            <SelectTrigger className="h-9 w-full">
              <SelectValue placeholder="Select role" />
            </SelectTrigger>
            <SelectContent>
              {roleOptions.map(r => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[180px] flex-1 space-y-1">
          <Label className="text-sm font-medium">Post</Label>
          <Select onValueChange={v => setNewOfficer({ ...newOfficer, post: v })} value={newOfficer.post}>
            <SelectTrigger className="h-9 w-full">
              <SelectValue placeholder="Select post" />
            </SelectTrigger>
            <SelectContent>
              {postOptions.map(p => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={addOfficer} className="h-9 gap-1.5">
          <Plus className="h-4 w-4" /> Add
        </Button>
      </div>

      {officers.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Added Officers: ({officers.length})</p>
          <div className="flex flex-wrap gap-2">
            {officers.map((o, i) => (
              <Badge key={i} variant="secondary" className="text-xs">
                {o.name} - {o.post}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

//  Main Component

interface OrderReportProps {
  type?: OrderType;
}

export default function OrderReport({ type = 'supervision' }: OrderReportProps) {
  const { examCenter, user, isLoading: userLoading } = useUserInfo();
  const config = ORDER_CONFIG[type];
  const contentRef = useRef<HTMLDivElement>(null);
  const isChief = type === 'chief';

  const [orderKey, setOrderKey] = useState('');
  const [collegeRefKey, setCollegeRefKey] = useState('');
  const [orderData, setOrderData] = useState<Record<string, OrderData>>({});
  const [chiefOfficers, setChiefOfficers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showReport, setShowReport] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [letterheadInfo, setLetterheadInfo] = useState<CollegeInfo>(() => ({
    name: 'Loading...',
    address: '',
    city: '',
    state: 'Maharashtra',
    pincode: '',
    tel: '+91-',
    cell: '+91-',
    email: '',
    website: '',
    logo: '',
    ref: '',
    date: formatDate(new Date()),
  }));

  const getDefaultLetterhead = useCallback(
    (): CollegeInfo => ({
      name: examCenter?.name || 'Examination Center',
      address: examCenter?.address || '',
      city: '',
      state: 'Maharashtra',
      pincode: '',
      tel: '+91-',
      cell: '+91-',
      email: user?.email || '',
      website: '',
      logo: '',
      ref: '',
      date: formatDate(new Date()),
    }),
    [examCenter, user]
  );

  useEffect(() => {
    if (!userLoading && user) {
      const saved = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
      const defaults = getDefaultLetterhead();
      let merged = defaults;
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          merged = {
            ...defaults,
            ...parsed,
            email: user.email || parsed.email || '',
            name: examCenter?.name || parsed.name || defaults.name,
            address: examCenter?.address || parsed.address || defaults.address,
          };
        } catch {
          merged = defaults;
        }
      }
      setLetterheadInfo(merged);
      setIsInitialized(true);
    }
  }, [user, examCenter, userLoading, getDefaultLetterhead]);

  useEffect(() => {
    if (isInitialized && typeof window !== 'undefined' && letterheadInfo.name !== 'Loading...') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(letterheadInfo));
    }
  }, [letterheadInfo, isInitialized]);

  const reactToPrintFn = useReactToPrint({ contentRef });

  const fetchData = useCallback(async () => {
    if (!orderKey || !collegeRefKey) {
      toast.error('Please enter ORDER REF and COLLEGE REF keys');
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      const [ordersResult, staffResult] = await Promise.all([
        getOrders({ orderType: config.orderType! }),
        getStaff(config.staffType!),
      ]);
      if (!ordersResult?.length) {
        toast.info(`No ${config.orderType} orders found`);
        setShowReport(false);
        return;
      }
      if (!staffResult.success || !staffResult.data) {
        toast.error('Failed to fetch staff data');
        return;
      }

      const staffMap = new Map(
        staffResult.data.map((s: any) => [
          s.uid,
          { name: s.name, role: s.role || '', department: s.department, email: s.email || null },
        ])
      );
      const grouped: Record<string, OrderData> = {};

      for (const order of ordersResult) {
        const staffMember = staffResult.data.find((s: any) => s.id === order.staffId);
        if (!staffMember) continue;
        const info = staffMap.get(staffMember.uid);
        if (!info) continue;
        if (!grouped[staffMember.uid]) {
          grouped[staffMember.uid] = {
            NAME: info.name,
            ROLE: info.role,
            DEPARTMENT: info.department,
            EMAIL: info.email || '',
            ALLOTED: [],
          };
        }
        grouped[staffMember.uid].ALLOTED.push({
          DATE: order.date ? new Date(order.date).toISOString().split('T')[0] : '',
          SESSION: order.session || 'Morning',
        });
      }
      Object.values(grouped).forEach(g =>
        g.ALLOTED.sort((a, b) => new Date(a.DATE).getTime() - new Date(b.DATE).getTime())
      );

      if (!Object.keys(grouped).length) {
        toast.info(`No ${config.orderType} order data found`);
        setShowReport(false);
      } else {
        setOrderData(grouped);
        setShowReport(true);
        toast.success(`Found ${Object.keys(grouped).length} ${config.orderType} orders`);
      }
    } catch (error) {
      console.error(error);
      setError('Failed to fetch office order data. Please try again.');
      toast.error('Failed to fetch office order data');
    } finally {
      setIsLoading(false);
    }
  }, [orderKey, collegeRefKey, config]);

  const handleGenerateChief = () => {
    if (chiefOfficers.length === 0) {
      toast.error('Please add at least one officer');
      return;
    }
    if (!collegeRefKey || !orderKey) {
      toast.error('Please enter both Ref Keys');
      return;
    }
    setShowReport(true);
  };

  const handleReset = () => {
    setOrderKey('');
    setCollegeRefKey('');
    setOrderData({});
    setChiefOfficers([]);
    setShowReport(false);
  };

  if (userLoading || !isInitialized) {
    return (
      <div className="bg-background/80 fixed inset-0 z-50 flex flex-col items-center justify-center backdrop-blur-sm">
        <HashLoader size={60} color="#059669" />
        <p className="text-muted-foreground mt-6 text-sm font-medium">Loading module...</p>
      </div>
    );
  }

  if (!user)
    return (
      <div className="container mx-auto px-4 py-8">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Please log in to access this page.</AlertDescription>
        </Alert>
      </div>
    );

  if (!showReport) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card className="mx-auto max-w-2xl border-neutral-200 shadow-lg">
          <CardHeader className="border-b border-neutral-100 text-center">
            <CardTitle className="text-2xl font-bold text-neutral-900">{config.title}</CardTitle>
            <p className="text-sm text-neutral-500">{config.description}</p>
            <div className="mt-3 flex justify-center">
              <Button onClick={() => setIsExpanded(!isExpanded)} variant="outline" size="sm" className="gap-2">
                {isExpanded ? <Settings className="h-4 w-4" /> : <Settings2 className="h-4 w-4" />}
                {isExpanded ? 'Hide Letterhead' : 'Letterhead Settings'}
                <ChevronDown className={cn('h-4 w-4 transition-transform', isExpanded && 'rotate-180')} />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <CollegeHeader
              collegeRefKey={collegeRefKey}
              userEmail={user?.email}
              examCenterName={examCenter?.name}
              examCenterAddress={examCenter?.address!}
              onLetterheadChange={setLetterheadInfo}
              isExpanded={isExpanded}
              onToggle={() => setIsExpanded(!isExpanded)}
            />
            <div className="mt-4 space-y-4">
              <div className="grid gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="orderKey" className="text-sm font-medium text-neutral-700">
                    Order Ref Key <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="orderKey"
                    placeholder="Enter ORDER REF key"
                    value={orderKey}
                    onChange={e => setOrderKey(e.target.value)}
                    className="h-10"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="collegeRefKey" className="text-sm font-medium text-neutral-700">
                    College Ref Key <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="collegeRefKey"
                    placeholder="Enter COLLEGE REF key"
                    value={collegeRefKey}
                    onChange={e => setCollegeRefKey(e.target.value)}
                    className="h-10"
                  />
                </div>
              </div>

              {isChief ? (
                <>
                  <ChiefInputForm
                    officers={chiefOfficers}
                    setOfficers={setChiefOfficers}
                    onGenerate={handleGenerateChief}
                  />
                  <Button
                    onClick={handleGenerateChief}
                    disabled={chiefOfficers.length === 0}
                    className="h-11 w-full gap-2 bg-emerald-600 text-base font-medium hover:bg-emerald-700"
                  >
                    Generate Report ({chiefOfficers.length} officers)
                  </Button>
                </>
              ) : (
                <Button
                  onClick={fetchData}
                  disabled={isLoading}
                  className="h-11 w-full gap-2 bg-emerald-600 text-base font-medium hover:bg-emerald-700"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    'Generate Report'
                  )}
                </Button>
              )}

              {error && (
                <Alert variant="destructive" className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalOrders = isChief ? chiefOfficers.length : Object.keys(orderData).length;
  const reportData = isChief
    ? chiefOfficers.map(o => ({
        name: o.name,
        role: o.role,
        department: o.department,
        email: o.email,
        post: o.post,
        ALLOTED: [],
      }))
    : Object.values(orderData);

  return (
    <div className="container mx-auto space-y-6 px-4 py-8">
      <PageHeader
        title={config.title}
        description={`${totalOrders} order${totalOrders !== 1 ? 's' : ''} generated`}
        icon={config.icon}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleReset} className="h-8 gap-1.5 text-xs">
              <ChevronLeft className="h-3.5 w-3.5" />
              Back
            </Button>
            <Button
              onClick={() => reactToPrintFn()}
              size="sm"
              className="h-8 gap-1.5 bg-emerald-600 text-xs hover:bg-emerald-700"
            >
              <Printer className="h-3.5 w-3.5" />
              Print All
            </Button>
          </div>
        }
      />
      <div ref={contentRef} className="space-y-8">
        {reportData.map((data: any, index: number) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: index * 0.05 }}
          >
            <ReportContent
              data={data}
              examCenter={{
                name: examCenter?.name || 'Examination Center',
                code: examCenter?.code || '',
                season: examCenter?.season || '',
                examYear: examCenter?.examYear || new Date().getFullYear(),
                address: examCenter?.address || '',
              }}
              orderKey={orderKey}
              collegeRefKey={collegeRefKey}
              letterheadInfo={letterheadInfo}
              type={type}
            />
          </motion.div>
        ))}
      </div>
      {totalOrders === 0 && (
        <PageEmpty title="No Orders Found" description={`No orders available for the selected criteria.`} />
      )}
    </div>
  );
}
