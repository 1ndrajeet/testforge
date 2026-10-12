// modules/exam-setup/staff-page.tsx
'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';

import courseCodes from '@/config/course_codes.json';
import {
  Download,
  FileSpreadsheet,
  Loader2,
  Plus,
  Radio,
  RefreshCw,
  Trash2,
  Upload,
  UserCog,
  Users2,
} from 'lucide-react';
import { toast } from 'sonner';

import { createClient } from '@/lib/supabase/client';
import { StaffMember, StaffStats, StaffType } from '@/lib/types/';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

import { PageEmpty, PageHeader, PageToolbar } from '@/components/layout/page-layout';

// ============================================================================
// Configuration
// ============================================================================

interface StaffPageConfig {
  type: StaffType;
  title: string;
  description: string;
  icon: typeof UserCog;
  roleOptions?: string[];
  showInStats?: boolean;
}

export const STAFF_CONFIGS: Record<StaffType, StaffPageConfig> = {
  SUPERVISOR: {
    type: 'SUPERVISOR',
    title: 'Supervisors Management',
    description: 'Manage supervisors who will invigilate examination blocks.',
    icon: UserCog,
    roleOptions: ['LECTURER', 'LAB_ASSISTANT', 'HEAD_OF_DEPT'],
    showInStats: true,
  },
  RELIEVER: {
    type: 'RELIEVER',
    title: 'Relievers Management',
    description: 'Manage reliever staff who can substitute for absent supervisors.',
    icon: Users2,
    roleOptions: ['LECTURER', 'LAB_ASSISTANT', 'HEAD_OF_DEPT'],
    showInStats: true,
  },
  CONTROL_ROOM: {
    type: 'CONTROL_ROOM',
    title: 'Control Room Staff',
    description: 'Manage staff responsible for examination control room operations.',
    icon: Radio,
    roleOptions: ['CONTROLLER', 'DEPUTY_CONTROLLER', 'ASSISTANT'],
    showInStats: true,
  },
};

type CourseCode = keyof typeof courseCodes;

const departments = Object.entries(courseCodes).map(([code, name]) => ({
  code: code as CourseCode,
  name,
}));

// ============================================================================
// Stats Cards Component
// ============================================================================

const StatsCards = ({ stats }: { stats: StaffStats }) => {
  return (
    <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
      <div className="rounded-lg border border-neutral-100 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
        <p className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
          {stats.total}
        </p>
        <p className="text-xs text-neutral-500">Total Staff</p>
      </div>
      <div className="rounded-lg border border-neutral-100 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
        <p className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
          {stats.supervisors}
        </p>
        <p className="text-xs text-neutral-500">Supervisors</p>
      </div>
      <div className="rounded-lg border border-neutral-100 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
        <p className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
          {stats.relievers}
        </p>
        <p className="text-xs text-neutral-500">Relievers</p>
      </div>
      <div className="rounded-lg border border-neutral-100 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
        <p className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
          {stats.controlRoom}
        </p>
        <p className="text-xs text-neutral-500">Control Room</p>
      </div>
    </div>
  );
};

// ============================================================================
// CSV Helpers
// ============================================================================

const STAFF_CSV_HEADERS = ['UID', 'Name', 'Department', 'Role', 'Email', 'StaffType'];

function staffToCSVRow(staff: StaffMember): string[] {
  return [
    staff.uid,
    staff.name,
    staff.department,
    staff.role || '',
    staff.email || '',
    staff.staffType,
  ];
}

function csvRowToStaff(row: string[], staffType: StaffType): Partial<StaffMember> {
  const [uid, name, department, role, email] = row;
  return {
    uid: uid?.trim() || '',
    name: name?.trim() || '',
    department: department?.trim() || '',
    role: role?.trim() || null,
    email: email?.trim() || null,
    staffType: staffType,
  };
}

function downloadCSV(data: string[][], filename: string) {
  const csvContent = data.map((row) => row.join(',')).join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ============================================================================
// Create/Edit Staff Dialog
// ============================================================================

interface StaffFormData {
  uid: string;
  name: string;
  department: string;
  role: string;
  email: string;
}

const defaultFormData: StaffFormData = {
  uid: '',
  name: '',
  department: '',
  role: '',
  email: '',
};

interface StaffDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  editingStaff?: StaffMember | null;
  staffType: StaffType;
  roleOptions: string[];
  examCenterId?: string | null;
}

function StaffDialog({
  open,
  onOpenChange,
  onSuccess,
  editingStaff,
  staffType,
  roleOptions,
  examCenterId,
}: StaffDialogProps) {
  const [formData, setFormData] = useState<StaffFormData>(defaultFormData);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof StaffFormData, string>>>({});

  const isEditing = !!editingStaff;

  useEffect(() => {
    if (editingStaff) {
      setFormData({
        uid: editingStaff.uid,
        name: editingStaff.name,
        department: editingStaff.department,
        role: editingStaff.role || '',
        email: editingStaff.email || '',
      });
    } else {
      setFormData(defaultFormData);
    }
    setErrors({});
  }, [editingStaff, open]);

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof StaffFormData, string>> = {};

    if (!formData.uid.trim()) {
      newErrors.uid = 'UID is required';
    }
    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    }
    if (!formData.department) {
      newErrors.department = 'Department is required';
    }
    if (!formData.role) {
      newErrors.role = 'Role is required';
    }
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Invalid email address';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    setIsSubmitting(true);

    try {
      const supabase = createClient();
      let targetCenterId = examCenterId;
      if (!targetCenterId) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          const { data: center } = await supabase
            .from('exam_centers')
            .select('id')
            .eq('owner_id', user.id)
            .eq('is_deleted', false)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          targetCenterId = center?.id || null;
        }
      }

      if (!targetCenterId) {
        toast.error('Exam center not found. Please complete onboarding first.');
        setIsSubmitting(false);
        return;
      }

      if (isEditing && editingStaff) {
        const { error: updErr } = await supabase
          .from('staff')
          .update({
            uid: formData.uid.toUpperCase(),
            name: formData.name,
            department: formData.department,
            email: formData.email || null,
            role: formData.role || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingStaff.id)
          .eq('exam_center_id', targetCenterId);

        if (updErr) throw updErr;
      } else {
        const { error: insErr } = await supabase.from('staff').insert({
          exam_center_id: targetCenterId,
          uid: formData.uid.toUpperCase(),
          name: formData.name,
          department: formData.department,
          email: formData.email || null,
          staff_type: staffType,
          role: formData.role || null,
        });

        if (insErr) throw insErr;
      }

      toast.success(
        isEditing ? `${staffType} updated successfully` : `${staffType} created successfully`,
      );
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Failed to save ${staffType}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? `Edit ${staffType}` : `Add New ${staffType}`}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? `Update ${staffType} information.`
              : `Add a new ${staffType} to the examination team.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="uid">
              UID <span className="text-rose-500">*</span>
            </Label>
            <Input
              id="uid"
              value={formData.uid}
              onChange={(e) => setFormData({ ...formData, uid: e.target.value.toUpperCase() })}
              placeholder="e.g., STAFF001"
              className={errors.uid ? 'border-rose-500' : ''}
              disabled={isEditing}
            />
            {errors.uid && <p className="text-xs text-rose-500">{errors.uid}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">
              Name <span className="text-rose-500">*</span>
            </Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Full name"
              className={errors.name ? 'border-rose-500' : ''}
            />
            {errors.name && <p className="text-xs text-rose-500">{errors.name}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="department">
              Department <span className="text-rose-500">*</span>
            </Label>
            <Select
              value={formData.department}
              onValueChange={(value) => setFormData({ ...formData, department: value })}
            >
              <SelectTrigger className={errors.department ? 'border-rose-500' : ''}>
                <SelectValue placeholder="Select department" />
              </SelectTrigger>
              <SelectContent>
                {departments.map((dept) => (
                  <SelectItem
                    key={dept.code}
                    value={dept.code}
                  >
                    <span className="font-mono">{dept.code}</span> - {dept.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.department && <p className="text-xs text-rose-500">{errors.department}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="role">
              Role <span className="text-rose-500">*</span>
            </Label>
            <Select
              value={formData.role}
              onValueChange={(value) => setFormData({ ...formData, role: value })}
            >
              <SelectTrigger className={errors.role ? 'border-rose-500' : ''}>
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                {roleOptions.map((role) => (
                  <SelectItem
                    key={role}
                    value={role}
                  >
                    {role.replace(/_/g, ' ')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.role && <p className="text-xs text-rose-500">{errors.role}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="staff@example.com"
              className={errors.email ? 'border-rose-500' : ''}
            />
            {errors.email && <p className="text-xs text-rose-500">{errors.email}</p>}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="gap-2"
          >
            {isSubmitting && (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            )}
            {isEditing ? 'Save Changes' : `Add ${staffType}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Delete Confirmation Dialog
// ============================================================================

interface DeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  staffName: string;
  isLoading?: boolean;
}

function DeleteDialog({ open, onOpenChange, onConfirm, staffName, isLoading }: DeleteDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete Staff Member</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete <span className="font-medium">{staffName}</span>? This
            action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// modules/exam-setup/staff-page.tsx - Fix ImportDialog

// ============================================================================
// Import Dialog - FIXED
// ============================================================================

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (staffData: Partial<StaffMember>[]) => Promise<void>;
  staffType: StaffType;
  isLoading?: boolean;
}

// ============================================================================
// Import Dialog - Polished
// ============================================================================

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (staffData: Partial<StaffMember>[]) => Promise<void>;
  staffType: StaffType;
  isLoading?: boolean;
}

const PREVIEW_LIMIT = 8;

function ImportDialog({ open, onOpenChange, onImport, staffType, isLoading }: ImportDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Partial<StaffMember>[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();

  const reset = useCallback(() => {
    setFile(null);
    setPreview([]);
    setIsDragging(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const parseFile = useCallback(
    (selected: File) => {
      setFile(selected);
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const text = String(event.target?.result ?? '');
          const lines = text
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter(Boolean);

          if (lines.length < 2) {
            toast.error('CSV must have a header row and at least one data row');
            setPreview([]);
            return;
          }

          const headers = lines[0].split(',').map((h) => h.trim().toUpperCase());
          const expected = STAFF_CSV_HEADERS.map((h) => h.toUpperCase());
          if (!expected.every((h) => headers.includes(h))) {
            toast.error(`CSV must have headers: ${STAFF_CSV_HEADERS.join(', ')}`);
            setPreview([]);
            return;
          }

          const parsed: Partial<StaffMember>[] = [];
          for (let i = 1; i < lines.length; i++) {
            const row = lines[i].split(',').map((c) => c.trim());
            if (row.length < 3) continue;
            const staff = csvRowToStaff(row, staffType);
            if (staff.uid && staff.name && staff.department) parsed.push(staff);
          }

          if (parsed.length === 0) {
            toast.error('No valid staff records found in CSV');
            setPreview([]);
            return;
          }

          setPreview(parsed);
          toast.success(`Parsed ${parsed.length} record${parsed.length === 1 ? '' : 's'}`);
        } catch (err) {
          console.error(err);
          toast.error('Failed to parse CSV file');
          setPreview([]);
        }
      };
      reader.onerror = () => toast.error('Failed to read file');
      reader.readAsText(selected);
    },
    [staffType],
  );

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) parseFile(f);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) parseFile(f);
  };

  const handleImportClick = async () => {
    if (preview.length === 0) return;
    setIsProcessing(true);
    try {
      await onImport(preview);
      reset();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to import staff');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancel = () => {
    reset();
    onOpenChange(false);
  };

  const previewRows = preview.slice(0, PREVIEW_LIMIT);
  const remaining = preview.length - previewRows.length;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => (v ? onOpenChange(true) : handleCancel())}
    >
      <DialogContent className="flex max-h-[90vh] w-[95vw] max-w-5xl flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
        {/* Header */}
        <div className="border-b border-neutral-100 px-6 py-5 dark:border-neutral-800">
          <DialogHeader className="space-y-1">
            <DialogTitle className="flex items-center gap-2 text-base">
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-neutral-100 dark:bg-neutral-800">
                <FileSpreadsheet className="h-4 w-4 text-neutral-600 dark:text-neutral-300" />
              </span>
              Import {staffType.replace(/_/g, ' ')}s from CSV
            </DialogTitle>
            <DialogDescription className="text-xs">
              Required columns:{' '}
              <span className="font-mono text-neutral-700 dark:text-neutral-300">
                {STAFF_CSV_HEADERS.join(', ')}
              </span>
            </DialogDescription>
          </DialogHeader>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          {/* Drop zone / file chip */}
          <input
            ref={fileInputRef}
            id={inputId}
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileSelect}
            className="sr-only"
          />

          {!file ? (
            <label
              htmlFor={inputId}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
              className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors ${
                isDragging
                  ? 'border-neutral-900 bg-neutral-50 dark:border-neutral-100 dark:bg-neutral-900/40'
                  : 'border-neutral-300 hover:border-neutral-400 hover:bg-neutral-50/60 dark:border-neutral-700 dark:hover:border-neutral-600 dark:hover:bg-neutral-900/40'
              }`}
            >
              <FileSpreadsheet className="mb-3 h-9 w-9 text-neutral-400" />
              <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
                Click to upload or drag and drop
              </p>
              <p className="mt-1 text-xs text-neutral-500">CSV files only, up to 5 MB</p>
            </label>
          ) : (
            <div className="flex items-center justify-between rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900/60">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-white dark:bg-neutral-800">
                  <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">
                    {file.name}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {preview.length > 0
                      ? `${preview.length} record${preview.length === 1 ? '' : 's'} ready`
                      : 'Parsing…'}
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={reset}
                className="ml-3 flex-shrink-0 text-neutral-500"
              >
                Change
              </Button>
            </div>
          )}

          {/* Preview */}
          {preview.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-baseline justify-between">
                <p className="text-xs font-medium tracking-wide text-neutral-500 uppercase">
                  Preview
                </p>
                <p className="text-xs text-neutral-500">
                  Showing {previewRows.length} of {preview.length}
                </p>
              </div>

              <div className="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
                <div className="max-h-[340px] overflow-auto">
                  <table className="w-full table-fixed border-collapse text-sm">
                    <colgroup>
                      <col className="w-[110px]" />
                      <col className="w-[22%]" />
                      <col className="w-[18%]" />
                      <col className="w-[16%]" />
                      <col />
                    </colgroup>
                    <thead className="sticky top-0 z-10 bg-neutral-50 shadow-[inset_0_-1px_0_0_rgb(229,229,229)] dark:bg-neutral-900 dark:shadow-[inset_0_-1px_0_0_rgb(38,38,38)]">
                      <tr>
                        {STAFF_CSV_HEADERS.map((h) => (
                          <th
                            key={h}
                            scope="col"
                            className="px-3 py-2.5 text-left text-xs font-medium tracking-wide text-neutral-500 uppercase"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((staff, i) => (
                        <tr
                          key={i}
                          className="border-t border-neutral-100 hover:bg-neutral-50/60 dark:border-neutral-800 dark:hover:bg-neutral-900/40"
                        >
                          <td className="truncate px-3 py-2 font-mono text-xs text-neutral-700 dark:text-neutral-300">
                            {staff.uid || '—'}
                          </td>
                          <td
                            className="truncate px-3 py-2 text-neutral-900 dark:text-neutral-100"
                            title={staff.name || ''}
                          >
                            {staff.name || '—'}
                          </td>
                          <td className="truncate px-3 py-2 text-neutral-700 dark:text-neutral-300">
                            {staff.department || '—'}
                          </td>
                          <td className="truncate px-3 py-2 text-neutral-700 dark:text-neutral-300">
                            {staff.role ? staff.role.replace(/_/g, ' ') : '—'}
                          </td>
                          <td
                            className="truncate px-3 py-2 text-neutral-700 dark:text-neutral-300"
                            title={staff.email || ''}
                          >
                            {staff.email || '—'}
                          </td>
                          <td
                            className="truncate px-3 py-2 text-neutral-900 dark:text-neutral-100"
                            title={staff.name || ''}
                          >
                            {staff.staffType || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {remaining > 0 && (
                  <div className="border-t border-neutral-100 bg-neutral-50/60 px-3 py-2 text-center text-xs text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900/40">
                    +{remaining} more record{remaining === 1 ? '' : 's'} will be imported
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-col-reverse items-stretch gap-2 border-t border-neutral-100 px-6 py-4 sm:flex-row sm:items-center sm:justify-between dark:border-neutral-800">
          <p className="text-xs text-neutral-500">
            {preview.length > 0
              ? `${preview.length} record${preview.length === 1 ? '' : 's'} will be created`
              : 'No file selected'}
          </p>
          <DialogFooter className="flex gap-2 sm:justify-end">
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={isProcessing || isLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleImportClick}
              disabled={preview.length === 0 || isProcessing || isLoading}
              className="gap-2"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Importing…
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  Import {preview.length > 0 ? preview.length : ''} record
                  {preview.length === 1 ? '' : 's'}
                </>
              )}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Data Table Component
// ============================================================================

const StaffTable = ({
  staffMembers,
  onEdit,
  onDelete,
  isLoading,
  config,
}: {
  staffMembers: StaffMember[];
  onEdit: (staff: StaffMember) => void;
  onDelete: (staff: StaffMember) => void;
  isLoading?: boolean;
  config: StaffPageConfig;
}) => {
  const getDepartmentName = (code: string) => {
    const dept = departments.find((d) => d.code === code);
    return dept ? `${dept.code} - ${dept.name}` : code;
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton
            key={i}
            className="h-12 w-full"
          />
        ))}
      </div>
    );
  }

  if (staffMembers.length === 0) {
    return (
      <PageEmpty
        title={`No ${config.title} found`}
        description={`Add ${config.type.toLowerCase()}s to the examination team.`}
        action={
          <Button
            size="sm"
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            Add {config.type}
          </Button>
        }
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader className="bg-neutral-50 dark:bg-neutral-900">
            <TableRow>
              <TableHead className="text-xs font-medium tracking-wide uppercase">UID</TableHead>
              <TableHead className="text-xs font-medium tracking-wide uppercase">Name</TableHead>
              <TableHead className="text-xs font-medium tracking-wide uppercase">
                Department
              </TableHead>
              <TableHead className="text-xs font-medium tracking-wide uppercase">Role</TableHead>
              <TableHead className="text-xs font-medium tracking-wide uppercase">Email</TableHead>
              <TableHead className="w-24 text-right text-xs font-medium tracking-wide uppercase">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {staffMembers.map((member) => (
              <TableRow
                key={member.id}
                className="h-12 hover:bg-neutral-50 dark:hover:bg-neutral-900"
              >
                <TableCell className="px-4 py-3 font-mono text-sm">{member.uid}</TableCell>
                <TableCell className="px-4 py-3 text-sm font-medium">{member.name}</TableCell>
                <TableCell className="px-4 py-3 text-sm">
                  {getDepartmentName(member.department)}
                </TableCell>
                <TableCell className="px-4 py-3">
                  <Badge
                    variant="secondary"
                    className="text-xs"
                  >
                    {member.role?.replace(/_/g, ' ') || '—'}
                  </Badge>
                </TableCell>
                <TableCell className="px-4 py-3 text-sm">{member.email || '—'}</TableCell>
                <TableCell className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => onEdit(member)}
                          >
                            <UserCog className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Edit member</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>

                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => onDelete(member)}
                            className="text-rose-500 hover:bg-rose-50 hover:text-rose-600"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Delete member</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

function mapStaffRecord(s: any): StaffMember {
  return {
    id: s.id,
    uid: s.uid,
    name: s.name,
    department: s.department,
    email: s.email,
    staffType: s.staff_type,
    role: s.role,
    designation: s.designation,
    postHeldInExamination: s.post_held_in_examination,
    isDeleted: s.is_deleted,
    createdAt: new Date(s.created_at),
    updatedAt: new Date(s.updated_at),
  };
}

// ============================================================================
// Main Component
// ============================================================================

export default function StaffPage({ type = 'SUPERVISOR' }: { type?: StaffType }) {
  const config = STAFF_CONFIGS[type];

  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
  const [stats, setStats] = useState<StaffStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [examCenterId, setExamCenterId] = useState<string | null>(null);

  // Dialog states
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingStaff, setDeletingStaff] = useState<StaffMember | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        toast.error('Unauthorized');
        setLoading(false);
        return;
      }

      // Get active exam center
      const { data: center, error: centerErr } = await supabase
        .from('exam_centers')
        .select('id')
        .eq('owner_id', user.id)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (centerErr || !center) {
        setStaffMembers([]);
        setStats({ total: 0, supervisors: 0, relievers: 0, controlRoom: 0 });
        setLoading(false);
        return;
      }

      const activeCenterId = center.id;
      setExamCenterId(activeCenterId);

      const [staffRes, statsRes] = await Promise.all([
        supabase
          .from('staff')
          .select(
            'id, uid, name, department, email, staff_type, role, designation, post_held_in_examination, is_deleted, created_at, updated_at',
          )
          .eq('exam_center_id', activeCenterId)
          .eq('staff_type', config.type)
          .eq('is_deleted', false)
          .order('name'),
        supabase
          .from('staff')
          .select('staff_type')
          .eq('exam_center_id', activeCenterId)
          .eq('is_deleted', false),
      ]);

      if (staffRes.error) {
        throw staffRes.error;
      }

      const mapped: StaffMember[] = (staffRes.data || []).map(mapStaffRecord);
      setStaffMembers(mapped);

      if (statsRes.data) {
        let supervisors = 0;
        let relievers = 0;
        let controlRoom = 0;

        for (const s of statsRes.data) {
          if (s.staff_type === 'SUPERVISOR') supervisors++;
          else if (s.staff_type === 'RELIEVER') relievers++;
          else if (s.staff_type === 'CONTROL_ROOM') controlRoom++;
        }

        setStats({
          total: statsRes.data.length,
          supervisors,
          relievers,
          controlRoom,
        });
      }
    } catch (error) {
      console.error(`Failed to load ${config.type}:`, error);
      toast.error(error instanceof Error ? error.message : `Failed to load ${config.type}`);
    } finally {
      setLoading(false);
    }
  }, [config.type]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) {
      await fetchData();
      return;
    }

    setIsSearching(true);
    try {
      const supabase = createClient();
      let targetCenterId = examCenterId;
      if (!targetCenterId) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          const { data: center } = await supabase
            .from('exam_centers')
            .select('id')
            .eq('owner_id', user.id)
            .eq('is_deleted', false)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          targetCenterId = center?.id || null;
        }
      }

      if (!targetCenterId) {
        setStaffMembers([]);
        setIsSearching(false);
        return;
      }

      const term = searchQuery.trim();
      const { data, error } = await supabase
        .from('staff')
        .select(
          'id, uid, name, department, email, staff_type, role, designation, post_held_in_examination, is_deleted, created_at, updated_at',
        )
        .eq('exam_center_id', targetCenterId)
        .eq('staff_type', config.type)
        .eq('is_deleted', false)
        .or(
          `name.ilike.%${term}%,uid.ilike.%${term}%,department.ilike.%${term}%,email.ilike.%${term}%`,
        )
        .order('name');

      if (error) {
        toast.error(error.message || `Failed to search ${config.type}`);
        setStaffMembers([]);
      } else {
        setStaffMembers((data || []).map(mapStaffRecord));
      }
    } catch {
      toast.error(`Failed to search ${config.type}`);
      setStaffMembers([]);
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery, fetchData, config.type, examCenterId]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery) {
        handleSearch();
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, handleSearch]);

  const handleEdit = (staff: StaffMember) => {
    setEditingStaff(staff);
    setDialogOpen(true);
  };

  const handleDeleteClick = (staff: StaffMember) => {
    setDeletingStaff(staff);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingStaff) return;

    setIsDeleting(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('staff')
        .update({
          is_deleted: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', deletingStaff.id);

      if (error) throw error;

      toast.success(`${config.type} deleted successfully`);
      await fetchData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Failed to delete ${config.type}`);
    } finally {
      setIsDeleting(false);
      setDeleteDialogOpen(false);
      setDeletingStaff(null);
    }
  };

  const handleDialogSuccess = () => {
    fetchData();
  };

  // ─── Export ──────────────────────────────────────────────────
  const handleExport = useCallback(() => {
    if (staffMembers.length === 0) {
      toast.error('No staff members to export');
      return;
    }

    const csvData = [STAFF_CSV_HEADERS, ...staffMembers.map((staff) => staffToCSVRow(staff))];

    const filename = `${config.type.toLowerCase()}-staff-${new Date().toISOString().split('T')[0]}.csv`;
    downloadCSV(csvData, filename);
    toast.success(`Exported ${staffMembers.length} staff members`);
  }, [staffMembers, config.type]);

  // ─── Import ──────────────────────────────────────────────────
  const handleImport = useCallback(
    async (staffData: Partial<StaffMember>[]) => {
      // Validate all staff have required fields
      const invalidStaff = staffData.filter((s) => !s.uid || !s.name || !s.department);
      if (invalidStaff.length > 0) {
        toast.error(
          `${invalidStaff.length} staff members missing required fields (UID, Name, Department)`,
        );
        return;
      }

      // Check for duplicate UIDs within the import data
      const uids = staffData.map((s) => s.uid);
      const duplicateUids = uids.filter((uid, index) => uids.indexOf(uid) !== index);
      if (duplicateUids.length > 0) {
        toast.error(`Duplicate UIDs found: ${duplicateUids.join(', ')}`);
        return;
      }

      try {
        const supabase = createClient();
        let targetCenterId = examCenterId;
        if (!targetCenterId) {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (user) {
            const { data: center } = await supabase
              .from('exam_centers')
              .select('id')
              .eq('owner_id', user.id)
              .eq('is_deleted', false)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();
            targetCenterId = center?.id || null;
          }
        }

        if (!targetCenterId) {
          toast.error('Exam center not found');
          return;
        }

        // Fetch existing staff UIDs to skip duplicates (overwrite: false behavior)
        const { data: existingStaff } = await supabase
          .from('staff')
          .select('uid')
          .eq('exam_center_id', targetCenterId)
          .eq('is_deleted', false);

        const existingUidSet = new Set((existingStaff || []).map((s) => s.uid?.toUpperCase()));

        const toInsert = staffData.filter((s) => !existingUidSet.has(s.uid?.toUpperCase() || ''));

        const skipped = staffData.length - toInsert.length;

        if (toInsert.length > 0) {
          const rows = toInsert.map((s) => ({
            exam_center_id: targetCenterId,
            uid: s.uid!.toUpperCase(),
            name: s.name!,
            department: s.department!,
            email: s.email || null,
            staff_type: config.type,
            role: s.role || null,
            designation: null,
            post_held_in_examination: null,
          }));

          const { error: insErr } = await supabase.from('staff').insert(rows);
          if (insErr) throw insErr;
        }

        if (skipped > 0) {
          toast.success(
            `Imported ${toInsert.length} of ${staffData.length} staff members (${skipped} skipped due to duplicates)`,
          );
        } else {
          toast.success(`Successfully imported ${toInsert.length} staff members`);
        }

        await fetchData();
        setImportDialogOpen(false);
      } catch (error) {
        console.error('Import error:', error);
        toast.error(error instanceof Error ? error.message : 'Failed to import staff');
      }
    },
    [config.type, examCenterId, fetchData],
  );

  const toolbarActions = [
    {
      id: 'export',
      label: 'Export',
      icon: <Download className="h-3.5 w-3.5" />,
      onClick: handleExport,
      variant: 'ghost' as const,
    },
    {
      id: 'import',
      label: 'Import',
      icon: <Upload className="h-3.5 w-3.5" />,
      onClick: () => setImportDialogOpen(true),
      variant: 'ghost' as const,
    },
    {
      id: 'refresh',
      label: 'Refresh',
      icon: <RefreshCw className="h-3.5 w-3.5" />,
      onClick: fetchData,
      variant: 'outline' as const,
    },
    {
      id: 'add',
      label: `Add ${config.type}`,
      icon: <Plus className="h-3.5 w-3.5" />,
      onClick: () => {
        setEditingStaff(null);
        setDialogOpen(true);
      },
      variant: 'default' as const,
    },
  ];

  // Loading state
  if (loading && staffMembers.length === 0) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton
              key={i}
              className="h-24 w-full"
            />
          ))}
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={config.title}
        description={config.description}
        icon={config.icon}
      />

      {stats && config.showInStats && <StatsCards stats={stats} />}

      <PageToolbar
        searchValue={searchQuery}
        onSearchChange={(value) => {
          setSearchQuery(value);
          if (!value) {
            fetchData();
          }
        }}
        searchPlaceholder={`Search by name, UID, department, or email...`}
        actions={toolbarActions}
      />

      <StaffTable
        staffMembers={staffMembers}
        onEdit={handleEdit}
        onDelete={handleDeleteClick}
        isLoading={loading || isSearching}
        config={config}
      />

      <StaffDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={handleDialogSuccess}
        editingStaff={editingStaff}
        staffType={config.type}
        roleOptions={config.roleOptions || []}
        examCenterId={examCenterId}
      />

      <DeleteDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDeleteConfirm}
        staffName={deletingStaff?.name || ''}
        isLoading={isDeleting}
      />

      <ImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        onImport={handleImport}
        staffType={config.type}
        isLoading={loading}
      />
    </div>
  );
}
