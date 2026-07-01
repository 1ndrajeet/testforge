// modules/automation/order-report.tsx

'use client';

import { memo, useCallback, useEffect, useRef, useState } from 'react';

import departments from '@/config/course_codes.json';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertCircle,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  Clock,
  Edit3,
  Eye,
  FileText,
  Globe,
  Image as ImageIcon,
  Loader2,
  Mail,
  Pencil,
  Phone,
  Plus,
  Printer,
  Save,
  Settings2,
  UserCheck,
  Users,
  Users2,
  X,
} from 'lucide-react';
import { HashLoader } from 'react-spinners';
import { useReactToPrint } from 'react-to-print';
import { toast } from 'sonner';

import { getOrders } from '@/lib/actions/order';
import { getStaff } from '@/lib/actions/staff';
import { cn } from '@/lib/utils';

import { useUserInfo } from '@/hooks/useUserInfo';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

import { PageEmpty, PageHeader } from '@/components/layout/page-layout';

// ============================================================
// Constants
// ============================================================

const STORAGE_KEY = 'order_letterhead';
const MAX_SESSIONS_PER_PAGE = 5;

// ============================================================
// Types
// ============================================================

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

// ============================================================
// Config
// ============================================================

const ORDER_CONFIG = {
  supervision: {
    title: 'Supervisor Office Order',
    description: 'Generate office orders for block supervisors',
    icon: UserCheck,
    accent: 'emerald',
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
    accent: 'blue',
    role: 'Block Reliever',
    staffType: 'RELIEVER' as const,
    orderType: 'reliever' as const,
    subjectPrefix: 'Reliever',
    hasAllotments: true,
    fetchFromDb: true,
  },
  chief: {
    title: 'Chief & Control Room Order',
    description: 'Generate office orders for chief officers and control room staff',
    icon: Users,
    accent: 'amber',
    role: 'Officer',
    staffType: null,
    orderType: null,
    subjectPrefix: 'Officer',
    hasAllotments: false,
    fetchFromDb: false,
  },
} as const;

const ACCENT_COLORS = {
  emerald: {
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    text: 'text-emerald-700',
    hover: 'hover:bg-emerald-100',
    gradient: 'from-emerald-600 to-emerald-700',
    light: 'bg-emerald-50/50',
  },
  blue: {
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    text: 'text-blue-700',
    hover: 'hover:bg-blue-100',
    gradient: 'from-blue-600 to-blue-700',
    light: 'bg-blue-50/50',
  },
  amber: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    text: 'text-amber-700',
    hover: 'hover:bg-amber-100',
    gradient: 'from-amber-600 to-amber-700',
    light: 'bg-amber-50/50',
  },
};

// ============================================================
// Helpers
// ============================================================

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
const formatDate = (date: Date) =>
  date.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });

// ============================================================
// Letterhead Component
// ============================================================

const Letterhead = ({ info, className }: { info: CollegeInfo; className?: string }) => {
  const [logoError, setLogoError] = useState(false);
  useEffect(() => setLogoError(false), [info.logo]);

  return (
    <div className={cn('mb-5 border-b border-gray-200 pb-4', className)}>
      <div className="flex items-center gap-4">
        <div className="flex-shrink-0">
          {info.logo && !logoError ? (
            <img
              src={info.logo}
              alt={info.name}
              className="h-16 w-16 rounded-lg border border-gray-200 bg-white object-contain p-1"
              onError={() => setLogoError(true)}
              onLoad={() => setLogoError(false)}
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-gray-200 bg-gray-50">
              <Building2 className="h-8 w-8 text-gray-400" />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="text-lg font-bold tracking-tight text-gray-900 uppercase">
            {info.name}
          </div>
          <div className="text-sm text-gray-600">
            {[info.address, info.city, info.state, info.pincode && `- ${info.pincode}`]
              .filter(Boolean)
              .join(', ')}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs text-gray-500">
            {info.tel && info.tel !== '+91-' && (
              <span className="flex items-center gap-1">
                <Phone className="h-3 w-3" />
                {info.tel}
              </span>
            )}
            {info.cell && info.cell !== '+91-' && (
              <span className="flex items-center gap-1">
                <Phone className="h-3 w-3" />
                {info.cell}
              </span>
            )}
            {info.email && (
              <span className="flex items-center gap-1">
                <Mail className="h-3 w-3" />
                <a
                  href={`mailto:${info.email}`}
                  className="hover:underline"
                >
                  {info.email}
                </a>
              </span>
            )}
            {info.website && (
              <span className="flex items-center gap-1">
                <Globe className="h-3 w-3" />
                <a
                  href={info.website}
                  className="hover:underline"
                >
                  {info.website}
                </a>
              </span>
            )}
          </div>
          <div className="mt-1.5 flex items-center justify-between border-t border-gray-100 pt-1.5 text-xs">
            <span className="font-medium text-gray-600">Ref: {info.ref}</span>
            <span className="font-medium text-gray-600">Date: {info.date}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// Report Content - A4 Portrait
// ============================================================

const PAGE_STYLE = {
  width: '210mm',
  minHeight: '297mm',
  margin: '0 auto',
  padding: '12mm 15mm',
  boxSizing: 'border-box' as const,
  backgroundColor: '#ffffff',
  fontFamily: "'Times New Roman', Times, serif",
  position: 'relative' as const,
  display: 'flex',
  flexDirection: 'column' as const,
  pageBreakAfter: 'always' as const,
  pageBreakInside: 'avoid' as const,
  border: '1px solid #e5e7eb',
  borderRadius: '4px',
};

const ReportContent = ({
  data,
  examCenter,
  orderKey,
  collegeRefKey,
  letterheadInfo,
  type,
  page = 1,
  totalPages = 1,
  sessionOffset = 0,
}: {
  data:
    | OrderData
    | { name: string; role: string; department: string; email: string; post?: string };
  examCenter: { name: string; code: string; season: string; examYear: number; address: string };
  orderKey: string;
  collegeRefKey: string;
  letterheadInfo: CollegeInfo;
  type: OrderType;
  page?: number;
  totalPages?: number;
  sessionOffset?: number;
}) => {
  const letterheadData = {
    ...letterheadInfo,
    ref: collegeRefKey || letterheadInfo.ref,
    date: formatDate(new Date()),
  };
  const config = ORDER_CONFIG[type];
  const isChief = type === 'chief';
  const accent = ACCENT_COLORS[config.accent as keyof typeof ACCENT_COLORS];

  const name = 'NAME' in data ? data.NAME : data.name;
  const role = 'ROLE' in data ? data.ROLE : data.role;
  const department = 'DEPARTMENT' in data ? data.DEPARTMENT : data.department;
  const email = 'EMAIL' in data ? data.EMAIL : data.email;
  const post = 'post' in data ? data.post : role || config.role;
  const allAllotments = 'ALLOTED' in data ? data.ALLOTED : [];

  const paginatedAllotments = allAllotments.slice(
    sessionOffset,
    sessionOffset + MAX_SESSIONS_PER_PAGE,
  );
  const showPagination = allAllotments.length > MAX_SESSIONS_PER_PAGE;

  return (
    <div
      style={PAGE_STYLE}
      className="relative flex flex-col bg-white"
    >
      <Letterhead info={letterheadData} />

      <div className="flex-1 space-y-4 text-sm">
        <h2 className="text-center text-xl font-bold tracking-wider text-gray-900 uppercase">
          Office Order
        </h2>

        <div className="space-y-3">
          <div className="space-y-1 rounded-lg border border-gray-100 bg-gray-50/50 p-4">
            <p className="font-semibold text-gray-700">To,</p>
            <p className="text-base font-bold text-gray-900">{name || 'To be appointed'}</p>
            <p className="text-gray-700">
              {role || config.role}, {getDeptName(department || '—')}
            </p>
            <p className="text-gray-600">{email || '—'}</p>
            <p className="font-medium text-gray-700">{examCenter.name}</p>
          </div>

          <div className={cn('rounded-lg border p-4', accent.border, accent.light)}>
            <p className="flex items-start gap-2">
              <span className="font-semibold">Subject:</span>
              <span>
                Appointment of {post || config.subjectPrefix} ({examCenter.code}) for{' '}
                {examCenter.season} Exam – {examCenter.examYear}
              </span>
            </p>
            <p className="flex items-start gap-2">
              <span className="font-semibold">Reference:</span>
              <span className="font-mono">{orderKey}</span>
            </p>
          </div>

          <div className="rounded-lg border border-gray-100 p-4 leading-relaxed">
            <p>
              Sir/Madam,
              <br />
              <br />
              {isChief ? (
                <>
                  As per norms and directions from MSBTE, you are hereby appointed as{' '}
                  <strong>{post}</strong> for the {examCenter.season} {examCenter.examYear} exam at
                  exam center {examCenter.code}.
                  <br />
                  <br />
                  You will look after all examination related duties from{' '}
                  <strong>{formatDate(new Date())}</strong> and ensure the {examCenter.season}{' '}
                  {examCenter.examYear} examination is conducted smoothly within the law and order
                  of MSBTE, Mumbai.
                </>
              ) : (
                <>
                  You have been appointed as <strong>{config.subjectPrefix}</strong> for the MSBTE
                  Theory Examination of {examCenter.season} {examCenter.examYear} as per the
                  following schedule. Please ensure all necessary arrangements are made for the
                  smooth conduct of the examination.
                </>
              )}
            </p>
          </div>

          {!isChief && paginatedAllotments.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-gray-200">
              <div className={cn('border-b border-gray-200 px-4 py-2', accent.light)}>
                <p className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <Clock className="h-4 w-4" />
                  Duty Schedule
                </p>
              </div>
              <Table className="border-collapse text-xs">
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead className="border border-gray-200 px-4 py-2 text-center font-semibold">
                      Sr. No
                    </TableHead>
                    <TableHead className="border border-gray-200 px-4 py-2 text-center font-semibold">
                      Date
                    </TableHead>
                    <TableHead className="border border-gray-200 px-4 py-2 text-center font-semibold">
                      Slot
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedAllotments.map((block: OrderDuty, index: number) => (
                    <TableRow
                      key={index}
                      className="hover:bg-gray-50"
                    >
                      <TableCell className="border border-gray-200 px-4 py-2 text-center">
                        {sessionOffset + index + 1}
                      </TableCell>
                      <TableCell className="border border-gray-200 px-4 py-2 text-center font-medium">
                        {formatDateDisplay(block.DATE)}
                      </TableCell>
                      <TableCell className="border border-gray-200 px-4 py-2 text-center uppercase">
                        <Badge
                          variant="outline"
                          className="text-xs"
                        >
                          {block.SESSION}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {isChief && (
            <div className="mt-4 text-center text-gray-700">
              <p>Thanking You,</p>
            </div>
          )}
        </div>
      </div>

      <div className="mt-auto border-t border-gray-200 pt-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold text-gray-900">
              {isChief ? 'Director' : 'Chief Officer In-charge'}
            </p>
            <p className="text-sm text-gray-600">
              {examCenter.code} - {examCenter.name}
            </p>
          </div>
          {showPagination && (
            <Badge
              variant="outline"
              className="text-xs"
            >
              Page {page} of {totalPages}
            </Badge>
          )}
        </div>
        <div className="mt-2 text-right text-[10px] text-gray-400">Generated by TestForge</div>
      </div>
    </div>
  );
};

// ============================================================
// College Header Editor
// ============================================================

const Field = memo(
  ({
    label,
    fieldKey,
    value,
    onChange,
    placeholder,
    type,
    className,
    icon: Icon,
    required,
  }: {
    label: string;
    fieldKey: string;
    value: string;
    onChange: (key: string, value: string) => void;
    placeholder?: string;
    type?: string;
    className?: string;
    icon?: React.ElementType;
    required?: boolean;
  }) => {
    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        onChange(fieldKey, e.target.value);
      },
      [fieldKey, onChange],
    );

    return (
      <div className={cn('space-y-1', className)}>
        <Label className="text-xs font-medium text-gray-700">
          {label}
          {required && <span className="ml-0.5 text-red-500">*</span>}
        </Label>
        <div className="relative">
          {Icon && (
            <div className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400">
              <Icon className="h-4 w-4" />
            </div>
          )}
          <Input
            value={value}
            onChange={handleChange}
            placeholder={placeholder}
            type={type}
            className={cn('h-9 text-sm', Icon && 'pl-9')}
          />
        </div>
      </div>
    );
  },
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
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSubmit = useCallback(() => {
    if (!form.name.trim()) {
      toast.error('College name is required');
      return;
    }
    onSave(form);
    toast.success('Letterhead updated');
  }, [form, onSave]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field
          label="College Name"
          fieldKey="name"
          value={form.name}
          onChange={handleFieldChange}
          icon={Building2}
          required
        />
        <div className="space-y-1">
          <Label className="text-xs font-medium text-gray-700">Logo URL</Label>
          <div className="relative">
            <Input
              value={form.logo}
              onChange={(e) => handleFieldChange('logo', e.target.value)}
              placeholder="/institutes/logo.webp"
              className={cn(
                'h-9 text-sm',
                logoValid === true && 'border-emerald-500 focus-visible:ring-emerald-500',
                logoValid === false && 'border-red-500 focus-visible:ring-red-500',
              )}
            />
            <div className="absolute top-1/2 right-3 -translate-y-1/2">
              {checkingLogo && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
              {!checkingLogo && logoValid === true && (
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              )}
              {!checkingLogo && logoValid === false && <X className="h-4 w-4 text-red-500" />}
            </div>
          </div>
          {form.logo && logoValid === true && (
            <p className="mt-1 text-xs text-emerald-600">✓ Logo verified</p>
          )}
          {form.logo && logoValid === false && (
            <p className="mt-1 text-xs text-red-500">✗ Invalid logo URL</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Field
          label="Address"
          fieldKey="address"
          value={form.address}
          onChange={handleFieldChange}
          icon={Building2}
        />
        <Field
          label="City"
          fieldKey="city"
          value={form.city}
          onChange={handleFieldChange}
        />
        <Field
          label="State"
          fieldKey="state"
          value={form.state}
          onChange={handleFieldChange}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Field
          label="Pincode"
          fieldKey="pincode"
          value={form.pincode}
          onChange={handleFieldChange}
        />
        <Field
          label="Telephone"
          fieldKey="tel"
          value={form.tel}
          onChange={handleFieldChange}
          icon={Phone}
        />
        <Field
          label="Mobile"
          fieldKey="cell"
          value={form.cell}
          onChange={handleFieldChange}
          icon={Phone}
        />
        <Field
          label="Email"
          fieldKey="email"
          value={form.email}
          onChange={handleFieldChange}
          type="email"
          icon={Mail}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field
          label="Website"
          fieldKey="website"
          value={form.website}
          onChange={handleFieldChange}
          icon={Globe}
        />
        <Field
          label="Reference"
          fieldKey="ref"
          value={form.ref}
          onChange={handleFieldChange}
          icon={FileText}
        />
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-gray-200 pt-4">
        <Button
          variant="outline"
          size="sm"
          onClick={onCancel}
          className="h-8 gap-1 text-sm"
        >
          <X className="h-3.5 w-3.5" />
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={handleSubmit}
          className="h-8 gap-1 bg-emerald-600 text-sm hover:bg-emerald-700"
        >
          <Save className="h-3.5 w-3.5" />
          Save
        </Button>
      </div>
    </div>
  );
};

// ============================================================
// College Header
// ============================================================

const CollegeHeader = ({
  collegeRefKey,
  userEmail,
  examCenterName,
  examCenterAddress,
  onLetterheadChange,
  isExpanded,
  setIsExpanded,
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
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      </div>
    );

  return (
    <div className="space-y-3">
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
          >
            <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
              <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50/50 px-4 py-2">
                <div className="flex items-center gap-2">
                  <Settings2 className="h-4 w-4 text-gray-500" />
                  <span className="text-sm font-medium text-gray-700">Letterhead Settings</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsEditing(!isEditing)}
                  className="h-7 gap-1 text-xs"
                >
                  {isEditing ? (
                    <>
                      <Eye className="h-3 w-3" />
                      Preview
                    </>
                  ) : (
                    <>
                      <Edit3 className="h-3 w-3" />
                      Edit
                    </>
                  )}
                </Button>
              </div>
              <div className="p-4">
                {isEditing ? (
                  <CollegeHeaderEditor
                    info={info}
                    onSave={(updated) => {
                      setInfo(updated);
                      setIsEditing(false);
                      onLetterheadChange?.(updated);
                    }}
                    onCancel={() => setIsEditing(false)}
                  />
                ) : (
                  <Letterhead info={info} />
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Button
        onClick={() => {
          setIsExpanded(!isExpanded);
          if (isEditing) setIsEditing(false);
        }}
        variant="outline"
        size="sm"
        className="w-full gap-2 text-sm"
      >
        <motion.div
          animate={{ rotate: isExpanded ? 180 : 0 }}
          transition={{ duration: 0.25 }}
        >
          <ChevronDown className="h-4 w-4" />
        </motion.div>
        {isExpanded ? 'Hide Letterhead' : 'Customize Letterhead'}
      </Button>
    </div>
  );
};

// ============================================================
// Chief Officer Input Form
// ============================================================

const ChiefInputForm = ({
  officers,
  setOfficers,
}: {
  officers: any[];
  setOfficers: (o: any[]) => void;
  onGenerate: () => void;
}) => {
  const [newOfficer, setNewOfficer] = useState({
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

  const addOfficer = () => {
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
    setOfficers([...officers, { ...newOfficer, id: Date.now() }]);
    setNewOfficer({ name: '', department: '', role: '', post: '', email: '' });
    toast.success('Officer added');
  };

  const removeOfficer = (id: number) => {
    setOfficers(officers.filter((o) => o.id !== id));
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
        <div className="space-y-1">
          <Label className="text-xs font-medium text-gray-700">Name</Label>
          <Input
            placeholder="Enter name"
            value={newOfficer.name}
            onChange={(e) => setNewOfficer({ ...newOfficer, name: e.target.value })}
            className="h-9 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-medium text-gray-700">Department</Label>
          <Input
            placeholder="Enter department"
            value={newOfficer.department}
            onChange={(e) => setNewOfficer({ ...newOfficer, department: e.target.value })}
            className="h-9 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-medium text-gray-700">Email</Label>
          <Input
            type="email"
            placeholder="Enter email"
            value={newOfficer.email}
            onChange={(e) => setNewOfficer({ ...newOfficer, email: e.target.value })}
            className="h-9 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-medium text-gray-700">Role</Label>
          <Select
            onValueChange={(v) => setNewOfficer({ ...newOfficer, role: v })}
            value={newOfficer.role}
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Select" />
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
        <div className="space-y-1">
          <Label className="text-xs font-medium text-gray-700">Post</Label>
          <Select
            onValueChange={(v) => setNewOfficer({ ...newOfficer, post: v })}
            value={newOfficer.post}
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Select" />
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
      </div>

      <div className="flex justify-end">
        <Button
          onClick={addOfficer}
          className="h-9 gap-1.5 text-sm"
        >
          <Plus className="h-4 w-4" />
          Add Officer
        </Button>
      </div>

      {officers.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-700">
            Officers{' '}
            <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs">
              {officers.length}
            </span>
          </p>
          <div className="flex flex-wrap gap-2">
            {officers.map((o, i) => (
              <Badge
                key={o.id || i}
                variant="secondary"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs"
              >
                {o.name}
                <button
                  onClick={() => removeOfficer(o.id)}
                  className="ml-1 rounded-full p-0.5 hover:bg-gray-200"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================
// Main Component
// ============================================================

interface OrderReportProps {
  type?: OrderType;
}

export default function OrderReport({ type = 'supervision' }: OrderReportProps) {
  const { examCenter, user, isLoading: userLoading } = useUserInfo();
  const config = ORDER_CONFIG[type];
  const contentRef = useRef<HTMLDivElement>(null);
  const isChief = type === 'chief';
  const accent = ACCENT_COLORS[config.accent as keyof typeof ACCENT_COLORS];

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
    [examCenter, user],
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
      toast.error('Please enter both reference keys');
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
        ]),
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
      Object.values(grouped).forEach((g) =>
        g.ALLOTED.sort((a, b) => new Date(a.DATE).getTime() - new Date(b.DATE).getTime()),
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
      toast.error('Please enter both reference keys');
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

  const buildPaginatedData = useCallback(() => {
    if (isChief) {
      return chiefOfficers.map((o) => ({
        data: {
          name: o.name,
          role: o.role,
          department: o.department,
          email: o.email,
          post: o.post,
          ALLOTED: [],
        },
      }));
    }

    const reportData: any[] = [];
    const entries = Object.values(orderData);

    for (const entry of entries) {
      const allotments = entry.ALLOTED || [];
      const totalPages = Math.ceil(allotments.length / MAX_SESSIONS_PER_PAGE) || 1;

      for (let page = 0; page < totalPages; page++) {
        const offset = page * MAX_SESSIONS_PER_PAGE;
        reportData.push({
          data: entry,
          page: page + 1,
          totalPages,
          offset,
        });
      }
    }

    return reportData;
  }, [orderData, chiefOfficers, isChief]);

  const paginatedItems = buildPaginatedData();

  if (userLoading || !isInitialized) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm">
        <HashLoader
          size={50}
          color="#059669"
        />
        <p className="mt-4 text-sm text-gray-500">Loading...</p>
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

  if (!showReport) {
    return (
      <div className="container mx-auto px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <Card className="mx-auto max-w-2xl border-0 shadow-lg">
            <div className={cn('rounded-t-lg bg-gradient-to-r p-5 text-white', accent.gradient)}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-white/20 p-2">
                    {config.icon && <config.icon className="h-5 w-5" />}
                  </div>
                  <div>
                    <h1 className="text-lg font-semibold tracking-tight">{config.title}</h1>
                    <p className="text-sm text-white/80">{config.description}</p>
                  </div>
                </div>
              </div>
            </div>

            <CardContent className="space-y-6 p-6">
              <CollegeHeader
                collegeRefKey={collegeRefKey}
                userEmail={user?.email}
                examCenterName={examCenter?.name}
                examCenterAddress={examCenter?.address!}
                onLetterheadChange={setLetterheadInfo}
                isExpanded={isExpanded}
                setIsExpanded={setIsExpanded}
              />

              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium text-gray-700">Order Ref Key</Label>
                    <Input
                      placeholder="Enter ORDER REF key"
                      value={orderKey}
                      onChange={(e) => setOrderKey(e.target.value)}
                      className="h-10 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium text-gray-700">College Ref Key</Label>
                    <Input
                      placeholder="Enter COLLEGE REF key"
                      value={collegeRefKey}
                      onChange={(e) => setCollegeRefKey(e.target.value)}
                      className="h-10 text-sm"
                    />
                  </div>
                </div>

                {isChief ? (
                  <div className="space-y-4">
                    <ChiefInputForm
                      officers={chiefOfficers}
                      setOfficers={setChiefOfficers}
                      onGenerate={handleGenerateChief}
                    />
                    <Button
                      onClick={handleGenerateChief}
                      disabled={chiefOfficers.length === 0}
                      className={cn('h-10 w-full gap-2 text-sm', accent.gradient)}
                    >
                      Generate Report ({chiefOfficers.length} officers)
                    </Button>
                  </div>
                ) : (
                  <Button
                    onClick={fetchData}
                    disabled={isLoading}
                    className={cn('h-10 w-full gap-2 text-sm', accent.gradient)}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading...
                      </>
                    ) : (
                      'Generate Report'
                    )}
                  </Button>
                )}

                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                  >
                    <Alert
                      variant="destructive"
                      className="flex items-center gap-2"
                    >
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  </motion.div>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  const totalOrders = isChief ? chiefOfficers.length : Object.keys(orderData).length;

  return (
    <div className="container mx-auto px-4 py-8">
      <PageHeader
        title={config.title}
        description={`${totalOrders} order${totalOrders !== 1 ? 's' : ''} generated`}
        icon={config.icon}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              className="h-8 gap-1.5 text-xs"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Back
            </Button>
            <Button
              onClick={() => reactToPrintFn()}
              size="sm"
              className={cn('h-8 gap-1.5 text-xs', accent.gradient)}
            >
              <Printer className="h-3.5 w-3.5" />
              Print ({paginatedItems.length} pages)
            </Button>
          </div>
        }
      />

      <div
        ref={contentRef}
        className="space-y-6"
      >
        {paginatedItems.map((item: any, index: number) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: index * 0.03 }}
            className="report-content"
          >
            <ReportContent
              data={item.data}
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
              page={item.page || 1}
              totalPages={item.totalPages || 1}
              sessionOffset={item.offset || 0}
            />
          </motion.div>
        ))}
      </div>

      {totalOrders === 0 && (
        <PageEmpty
          title="No Orders Found"
          description="No orders available for the selected criteria."
        />
      )}

      <style
        jsx
        global
      >{`
        @page {
          size: A4 portrait;
          margin: 0;
        }

        @media print {
          html,
          body {
            margin: 0 !important;
            padding: 0 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          .report-content {
            page-break-after: always !important;
            page-break-inside: avoid !important;
          }

          .print\\:hidden {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}
