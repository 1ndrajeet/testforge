// modules/exam-setup/staff-page.tsx
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { Download, FileSpreadsheet, Plus, Radio, RefreshCw, Trash2, Upload, UserCog, Users2 } from 'lucide-react';
import { toast } from 'sonner';

import { PageEmpty, PageHeader, PageToolbar } from '@/components/layout/page-layout';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import courseCodes from '@/config/course_codes.json';
import { useUserInfo } from '@/hooks/useUserInfo';
import { bulkCreateStaff, createStaff, deleteStaff, getStaff, getStaffStats, searchStaff } from '@/lib/actions/staff';
import { StaffMember, StaffStats, StaffType } from '@/lib/types/';

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
        <p className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">{stats.total}</p>
        <p className="text-xs text-neutral-500">Total Staff</p>
      </div>
      <div className="rounded-lg border border-neutral-100 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
        <p className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">{stats.supervisors}</p>
        <p className="text-xs text-neutral-500">Supervisors</p>
      </div>
      <div className="rounded-lg border border-neutral-100 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
        <p className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">{stats.relievers}</p>
        <p className="text-xs text-neutral-500">Relievers</p>
      </div>
      <div className="rounded-lg border border-neutral-100 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
        <p className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">{stats.controlRoom}</p>
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
  return [staff.uid, staff.name, staff.department, staff.role || '', staff.email || '', staff.staffType];
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
  const csvContent = data.map(row => row.join(',')).join('\n');
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
}

function StaffDialog({ open, onOpenChange, onSuccess, editingStaff, staffType, roleOptions }: StaffDialogProps) {
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
      const result = await createStaff({
        uid: formData.uid.toUpperCase(),
        name: formData.name,
        department: formData.department,
        email: formData.email || null,
        staffType: staffType,
        role: formData.role,
      });

      if (result.success) {
        toast.success(isEditing ? `${staffType} updated successfully` : `${staffType} created successfully`);
        onSuccess();
        onOpenChange(false);
      } else {
        toast.error(result.error || `Failed to save ${staffType}`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Failed to save ${staffType}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? `Edit ${staffType}` : `Add New ${staffType}`}</DialogTitle>
          <DialogDescription>
            {isEditing ? `Update ${staffType} information.` : `Add a new ${staffType} to the examination team.`}
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
              onChange={e => setFormData({ ...formData, uid: e.target.value.toUpperCase() })}
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
              onChange={e => setFormData({ ...formData, name: e.target.value })}
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
              onValueChange={value => setFormData({ ...formData, department: value })}
            >
              <SelectTrigger className={errors.department ? 'border-rose-500' : ''}>
                <SelectValue placeholder="Select department" />
              </SelectTrigger>
              <SelectContent>
                {departments.map(dept => (
                  <SelectItem key={dept.code} value={dept.code}>
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
            <Select value={formData.role} onValueChange={value => setFormData({ ...formData, role: value })}>
              <SelectTrigger className={errors.role ? 'border-rose-500' : ''}>
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                {roleOptions.map(role => (
                  <SelectItem key={role} value={role}>
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
              onChange={e => setFormData({ ...formData, email: e.target.value })}
              placeholder="staff@example.com"
              className={errors.email ? 'border-rose-500' : ''}
            />
            {errors.email && <p className="text-xs text-rose-500">{errors.email}</p>}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting} className="gap-2">
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete Staff Member</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete <span className="font-medium">{staffName}</span>? This action cannot be
            undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isLoading}>
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

function ImportDialog({ open, onOpenChange, onImport, staffType, isLoading }: ImportDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Partial<StaffMember>[]>([]); // Always initialized as array
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    const reader = new FileReader();
    reader.onload = event => {
      try {
        const text = event.target?.result as string;
        const lines = text.split('\n').filter(line => line.trim());

        if (lines.length < 2) {
          toast.error('CSV file must have a header row and at least one data row');
          setPreview([]); // Reset to empty array
          return;
        }

        // Parse header
        const headers = lines[0].split(',').map(h => h.trim().toUpperCase());
        const expectedHeaders = STAFF_CSV_HEADERS.map(h => h.toUpperCase());

        // Check if headers match
        const headerMatch = expectedHeaders.every(h => headers.includes(h));
        if (!headerMatch) {
          toast.error(`CSV must have headers: ${STAFF_CSV_HEADERS.join(', ')}`);
          setPreview([]); // Reset to empty array
          return;
        }

        // Parse data rows
        const parsed: Partial<StaffMember>[] = [];
        for (let i = 1; i < lines.length; i++) {
          const row = lines[i].split(',').map(c => c.trim());
          if (row.length < 3) continue;

          const staff = csvRowToStaff(row, staffType);
          if (staff.uid && staff.name && staff.department) {
            parsed.push(staff);
          }
        }

        if (parsed.length === 0) {
          toast.error('No valid staff records found in CSV');
          setPreview([]); // Reset to empty array
          return;
        }

        setPreview(parsed);
        toast.success(`Parsed ${parsed.length} staff records`);
      } catch (error) {
        toast.error('Failed to parse CSV file');
        console.error(error);
        setPreview([]); // Reset to empty array
      }
    };
    reader.readAsText(selectedFile);
  };

  const handleImportClick = async () => {
    // Ensure preview is an array and has items
    if (!Array.isArray(preview) || preview.length === 0) {
      toast.error('No data to import');
      return;
    }

    setIsProcessing(true);
    try {
      // Pass the preview array to the parent handler
      await onImport(preview);
      // Success - dialog will be closed by parent
      setFile(null);
      setPreview([]);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to import staff');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancel = () => {
    onOpenChange(false);
    setFile(null);
    setPreview([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleCancel}>
      <DialogContent className="max-h-[90vh] max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import {staffType}s from CSV</DialogTitle>
          <DialogDescription>
            Upload a CSV file with the following columns: {STAFF_CSV_HEADERS.join(', ')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="hover:border-primary rounded-lg border-2 border-dashed p-6 text-center transition-colors">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileSelect}
              className="hidden"
              id="csv-upload"
            />
            <label htmlFor="csv-upload" className="block cursor-pointer">
              <FileSpreadsheet className="mx-auto mb-2 h-12 w-12 text-neutral-400" />
              <p className="text-sm text-neutral-600">
                {file ? file.name : 'Click to select CSV file or drag and drop'}
              </p>
              <p className="mt-1 text-xs text-neutral-400">CSV files only</p>
            </label>
          </div>

          {Array.isArray(preview) && preview.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-medium">Preview ({preview.length} records)</p>
              <div className="max-h-60 overflow-auto rounded-lg border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-neutral-50">
                    <tr>
                      {STAFF_CSV_HEADERS.map(h => (
                        <th key={h} className="px-2 py-1 text-left font-medium">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.slice(0, 10).map((staff, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-2 py-1">{staff.uid}</td>
                        <td className="px-2 py-1">{staff.name}</td>
                        <td className="px-2 py-1">{staff.department}</td>
                        <td className="px-2 py-1">{staff.role || '—'}</td>
                        <td className="px-2 py-1">{staff.email || '—'}</td>
                        <td className="px-2 py-1">{staff.staffType}</td>
                      </tr>
                    ))}
                    {preview.length > 10 && (
                      <tr>
                        <td colSpan={6} className="px-2 py-1 text-center text-neutral-400">
                          +{preview.length - 10} more records
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel} disabled={isProcessing || isLoading}>
            Cancel
          </Button>
          <Button
            onClick={handleImportClick}
            disabled={!Array.isArray(preview) || preview.length === 0 || isProcessing || isLoading}
            className="gap-2"
          >
            {isProcessing ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Importing...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                Import {Array.isArray(preview) ? preview.length : 0} Record
                {Array.isArray(preview) && preview.length !== 1 ? 's' : ''}
              </>
            )}
          </Button>
        </DialogFooter>
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
    const dept = departments.find(d => d.code === code);
    return dept ? `${dept.code} - ${dept.name}` : code;
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
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
          <Button size="sm" className="gap-2">
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
              <TableHead className="text-xs font-medium tracking-wide uppercase">Department</TableHead>
              <TableHead className="text-xs font-medium tracking-wide uppercase">Role</TableHead>
              <TableHead className="text-xs font-medium tracking-wide uppercase">Email</TableHead>
              <TableHead className="w-24 text-right text-xs font-medium tracking-wide uppercase">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {staffMembers.map(member => (
              <TableRow key={member.id} className="h-12 hover:bg-neutral-50 dark:hover:bg-neutral-900">
                <TableCell className="px-4 py-3 font-mono text-sm">{member.uid}</TableCell>
                <TableCell className="px-4 py-3 text-sm font-medium">{member.name}</TableCell>
                <TableCell className="px-4 py-3 text-sm">{getDepartmentName(member.department)}</TableCell>
                <TableCell className="px-4 py-3">
                  <Badge variant="secondary" className="text-xs">
                    {member.role?.replace(/_/g, ' ') || '—'}
                  </Badge>
                </TableCell>
                <TableCell className="px-4 py-3 text-sm">{member.email || '—'}</TableCell>
                <TableCell className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="icon-sm" onClick={() => onEdit(member)}>
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

// ============================================================================
// Main Component
// ============================================================================

export default function StaffPage({ type = 'SUPERVISOR' }: { type?: StaffType }) {
  const { isLoading: userLoading } = useUserInfo();
  const config = STAFF_CONFIGS[type];

  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
  const [stats, setStats] = useState<StaffStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

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
      const [staffResult, statsResult] = await Promise.all([getStaff(config.type), getStaffStats()]);

      if (!staffResult.success) {
        throw new Error(staffResult.error);
      }
      setStaffMembers(staffResult.data ?? []);

      if (statsResult.success && statsResult.data) {
        setStats(statsResult.data);
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
      const result = await searchStaff(searchQuery, config.type);
      if (result.success) {
        setStaffMembers(result.data ?? []);
      } else {
        toast.error(result.error || `Failed to search ${config.type}`);
        setStaffMembers([]);
      }
    } catch {
      toast.error(`Failed to search ${config.type}`);
      setStaffMembers([]);
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery, fetchData, config.type]);

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
      const result = await deleteStaff(deletingStaff.id);
      if (result.success) {
        toast.success(`${config.type} deleted successfully`);
        await fetchData();
      } else {
        toast.error(result.error || `Failed to delete ${config.type}`);
      }
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

    const csvData = [STAFF_CSV_HEADERS, ...staffMembers.map(staff => staffToCSVRow(staff))];

    const filename = `${config.type.toLowerCase()}-staff-${new Date().toISOString().split('T')[0]}.csv`;
    downloadCSV(csvData, filename);
    toast.success(`Exported ${staffMembers.length} staff members`);
  }, [staffMembers, config.type]);

  // ─── Import ──────────────────────────────────────────────────
  const handleImport = useCallback(
    async (staffData: Partial<StaffMember>[]) => {
      // Validate all staff have required fields
      const invalidStaff = staffData.filter(s => !s.uid || !s.name || !s.department);
      if (invalidStaff.length > 0) {
        toast.error(`${invalidStaff.length} staff members missing required fields (UID, Name, Department)`);
        return;
      }

      // Check for duplicate UIDs within the import data
      const uids = staffData.map(s => s.uid);
      const duplicateUids = uids.filter((uid, index) => uids.indexOf(uid) !== index);
      if (duplicateUids.length > 0) {
        toast.error(`Duplicate UIDs found: ${duplicateUids.join(', ')}`);
        return;
      }

      try {
        // Prepare data for bulk import
        const bulkData = staffData.map(staff => ({
          uid: staff.uid!,
          name: staff.name!,
          department: staff.department!,
          email: staff.email || null,
          staffType: config.type,
          role: staff.role || null,
          designation: null,
          postHeldInExamination: null,
        }));

        // Use the bulkCreateStaff function with overwrite: false to skip duplicates
        const result = await bulkCreateStaff({
          staff: bulkData,
          overwrite: false,
        });

        if (result.success) {
          const count = result.data?.length || 0;
          const total = staffData.length;
          const skipped = total - count;

          if (skipped > 0) {
            toast.success(`Imported ${count} of ${total} staff members (${skipped} skipped due to duplicates)`);
          } else {
            toast.success(`Successfully imported ${count} staff members`);
          }

          await fetchData();
          setImportDialogOpen(false);
        } else {
          const errorMsg = typeof result.error === 'string' ? result.error : 'Failed to import staff';
          toast.error(errorMsg);
        }
      } catch (error) {
        console.error('Import error:', error);
        toast.error(error instanceof Error ? error.message : 'Failed to import staff');
      }
    },
    [config.type, fetchData]
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
  if ((loading && staffMembers.length === 0) || userLoading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title={config.title} description={config.description} icon={config.icon} />

      {stats && config.showInStats && <StatsCards stats={stats} />}

      <PageToolbar
        searchValue={searchQuery}
        onSearchChange={value => {
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
