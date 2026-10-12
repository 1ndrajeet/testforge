// modules/exam-setup/center-profile.tsx
'use client';

import { useCallback, useEffect, useState } from 'react';

import instituteMap from '@/config/institute_map.json';
import { format } from 'date-fns';
import {
  Building2,
  CalendarDays,
  Check,
  Download,
  Edit,
  Loader2,
  MapPin,
  Network,
  PenTool,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';

import { PageHeader, PageToolbar } from '@/components/layout/page-layout';

import ConfirmationDialog from '@/components/misc/DialogBox';

interface Institute {
  id: string;
  CODE: string;
  NAME: string;
}

interface ExamCenterData {
  id: string;
  code: string;
  name: string;
  address: string | null;
  officerIncharge: string | null;
  sealingSupervisor: string | null;
  distCenterCode: string | null;
  distCenterName: string | null;
  season: 'Summer' | 'Winter' | null;
  examYear: number | null;
  startDate: Date | null;
  endDate: Date | null;
  departments: string[];
}

interface ExamStats {
  staff: number;
  students: number;
  timetableEntries: number;
  allocations: number;
  orders: number;
}

const normalizeSeason = (val?: string | null): 'Summer' | 'Winter' => {
  if (!val) return 'Winter';
  const lower = val.trim().toLowerCase();
  return lower === 'summer' ? 'Summer' : 'Winter';
};

const formatDateForInput = (date: Date | string | null | undefined) => {
  if (!date) return '';
  try {
    return format(new Date(date), 'yyyy-MM-dd');
  } catch {
    return '';
  }
};

const parseDateFromInput = (dateString: string): Date | null => {
  if (!dateString) return null;
  const date = new Date(dateString);
  return isNaN(date.getTime()) ? null : date;
};

const StatsCards = ({
  stats,
  examCenter,
}: {
  stats: ExamStats | null;
  examCenter: ExamCenterData | null;
}) => {
  const examDays =
    examCenter?.startDate && examCenter?.endDate
      ? Math.ceil(
          (new Date(examCenter.endDate).getTime() - new Date(examCenter.startDate).getTime()) /
            (1000 * 60 * 60 * 24),
        ) + 1
      : 0;

  return (
    <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-5">
      <div className="rounded-lg border border-neutral-100 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
        <p className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
          {examCenter?.code || '—'}
        </p>
        <p className="text-xs text-neutral-500">Center Code</p>
      </div>
      <div className="rounded-lg border border-neutral-100 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
        <p className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
          {examDays || '—'}
        </p>
        <p className="text-xs text-neutral-500">Exam Days</p>
      </div>
      <div className="rounded-lg border border-neutral-100 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
        <p className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
          {stats?.students?.toLocaleString() || '—'}
        </p>
        <p className="text-xs text-neutral-500">Students</p>
      </div>
      <div className="rounded-lg border border-neutral-100 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
        <p className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
          {stats?.staff || '—'}
        </p>
        <p className="text-xs text-neutral-500">Staff</p>
      </div>
      <div className="rounded-lg border border-neutral-100 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
        <p className="text-2xl font-semibold text-neutral-900 capitalize dark:text-neutral-50">
          {examCenter?.season || '—'}
        </p>
        <p className="text-xs text-neutral-500">Season</p>
      </div>
    </div>
  );
};

const ConnectedInstituteItem = ({
  inst,
  onUpdateName,
  onDisconnect,
}: {
  inst: Institute;
  onUpdateName: (newName: string) => void;
  onDisconnect: () => void;
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(inst.NAME);

  const handleSave = () => {
    if (editedName.trim() && editedName !== inst.NAME) {
      onUpdateName(editedName.trim());
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditedName(inst.NAME);
    setIsEditing(false);
  };

  return (
    <div className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-950">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Badge
            variant="secondary"
            className="font-mono text-xs"
          >
            {inst.CODE}
          </Badge>
          {isEditing ? (
            <Input
              value={editedName}
              onChange={(e) => setEditedName(e.target.value)}
              className="h-8 flex-1 text-sm"
              autoFocus
            />
          ) : (
            <span className="truncate text-sm text-neutral-700 dark:text-neutral-300">
              {inst.NAME}
            </span>
          )}
        </div>
      </div>
      <div className="ml-4 flex items-center gap-1">
        {isEditing ? (
          <>
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={handleSave}
              className="h-8 w-8 text-emerald-600"
            >
              <Check className="h-4 w-4" />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={handleCancel}
              className="h-8 w-8 text-neutral-500"
            >
              <X className="h-4 w-4" />
            </Button>
          </>
        ) : (
          <>
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => setIsEditing(true)}
              className="h-8 w-8"
            >
              <Edit className="h-4 w-4" />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={onDisconnect}
              className="h-8 w-8 text-rose-500 hover:text-rose-600"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
};

export default function ExamCenterInfo() {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [instituteLoading, setInstituteLoading] = useState(false);
  const [, setStatsLoading] = useState(true);

  const [examCenter, setExamCenter] = useState<ExamCenterData | null>(null);
  const [stats, setStats] = useState<ExamStats | null>(null);
  const [connectedInstitutes, setConnectedInstitutes] = useState<Institute[]>([]);
  const [instituteCode, setInstituteCode] = useState('');
  const [instituteName, setInstituteName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmationDialog, setConfirmationDialog] = useState<{
    type: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setStatsLoading(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        setError('Unauthorized');
        setLoading(false);
        setStatsLoading(false);
        return;
      }

      // 1. Fetch exam center
      const { data: center, error: centerErr } = await supabase
        .from('exam_centers')
        .select('*')
        .eq('owner_id', user.id)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (centerErr) {
        toast.error('Failed to load center data');
        setError(centerErr.message);
        return;
      }

      if (!center) {
        setExamCenter(null);
        return;
      }

      const examCenterId = center.id;
      setExamCenter({
        id: center.id,
        code: center.code || '',
        name: center.name || '',
        address: center.address || null,
        officerIncharge: center.officer_incharge || null,
        sealingSupervisor: center.sealing_supervisor || null,
        distCenterCode: center.dist_center_code || null,
        distCenterName: center.dist_center_name || null,
        season: normalizeSeason(center.season),
        examYear: center.exam_year || null,
        startDate: center.start_date ? new Date(center.start_date) : null,
        endDate: center.end_date ? new Date(center.end_date) : null,
        departments: (center.departments as string[]) || [],
      });

      // 2. Parallel fetch for connected institutes and stats
      const [
        { data: instData },
        { count: studentsCount },
        { count: blocksCount },
        { count: staffCount },
        { count: timetableCount },
        { count: allocationsCount },
        { count: ordersCount },
      ] = await Promise.all([
        supabase
          .from('connected_institutes')
          .select('id, institute_code, institute_name, is_active')
          .eq('exam_center_id', examCenterId)
          .order('institute_code'),
        supabase
          .from('students')
          .select('*', { count: 'exact', head: true })
          .eq('exam_center_id', examCenterId)
          .eq('is_deleted', false),
        supabase
          .from('blocks')
          .select('*', { count: 'exact', head: true })
          .eq('exam_center_id', examCenterId)
          .eq('is_deleted', false),
        supabase
          .from('staff')
          .select('*', { count: 'exact', head: true })
          .eq('exam_center_id', examCenterId)
          .eq('is_deleted', false),
        supabase
          .from('timetable')
          .select('*', { count: 'exact', head: true })
          .eq('exam_center_id', examCenterId),
        supabase
          .from('block_allocations')
          .select('*', { count: 'exact', head: true })
          .eq('exam_center_id', examCenterId),
        supabase
          .from('orders')
          .select('*', { count: 'exact', head: true })
          .eq('exam_center_id', examCenterId),
      ]);

      setConnectedInstitutes(
        (instData || []).map((inst) => ({
          id: inst.id,
          CODE: inst.institute_code,
          NAME: inst.institute_name,
        })),
      );

      setStats({
        staff: staffCount || 0,
        students: studentsCount || 0,
        timetableEntries: timetableCount || 0,
        allocations: allocationsCount || 0,
        orders: ordersCount || 0,
      });
    } catch (err) {
      console.error('Failed to load exam center data:', err);
      setError('Failed to load data');
      toast.error('Failed to load exam center data');
    } finally {
      setLoading(false);
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const fetchInstituteInfo = () => {
    const code = instituteCode.trim().toUpperCase();
    if (!code) {
      toast.error('Please enter an institute code');
      return;
    }

    setInstituteLoading(true);
    try {
      const mapObj = instituteMap as Record<string, string>;
      const padded = code.padStart(4, '0');
      const unpadded = code.replace(/^0+/, '');

      const name = mapObj[code] || mapObj[padded] || (unpadded ? mapObj[unpadded] : undefined);

      if (name) {
        setInstituteName(name);
        toast.success('Institute found');
      } else {
        toast.error(`Institute not found for code: ${code}`);
        setInstituteName('');
      }
    } catch {
      toast.error('Failed to fetch institute');
      setInstituteName('');
    } finally {
      setInstituteLoading(false);
    }
  };

  const addInstitute = async () => {
    if (!examCenter?.id) {
      toast.error('No exam center found');
      return;
    }

    const code = instituteCode.trim().toUpperCase();
    if (!code || !instituteName) {
      toast.error('Please fetch institute first');
      return;
    }

    if (connectedInstitutes.some((inst) => inst.CODE === code)) {
      toast.error('Institute already connected');
      return;
    }

    try {
      const supabase = createClient();

      const { data: existing } = await supabase
        .from('connected_institutes')
        .select('id')
        .eq('exam_center_id', examCenter.id)
        .eq('institute_code', code)
        .maybeSingle();

      if (existing) {
        toast.error(`Institute ${code} already connected`);
        return;
      }

      const { data: newInst, error: insertErr } = await supabase
        .from('connected_institutes')
        .insert({
          exam_center_id: examCenter.id,
          institute_code: code,
          institute_name: instituteName,
        })
        .select()
        .single();

      if (insertErr || !newInst) {
        throw insertErr || new Error('Failed to connect institute');
      }

      setConnectedInstitutes((prev) => [
        ...prev,
        {
          id: newInst.id,
          CODE: newInst.institute_code,
          NAME: newInst.institute_name,
        },
      ]);
      setInstituteCode('');
      setInstituteName('');
      toast.success('Institute connected successfully');
    } catch (err) {
      console.error('Failed to connect institute:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to connect institute');
    }
  };

  const handleDisconnectInstitute = (inst: Institute) => {
    setConfirmationDialog({
      type: 'error',
      message: `Are you sure you want to disconnect institute ${inst.CODE}? This will remove all associated data.`,
      onConfirm: async () => {
        if (!examCenter?.id) return;
        try {
          const supabase = createClient();
          const { error: delErr } = await supabase
            .from('connected_institutes')
            .delete()
            .eq('id', inst.id)
            .eq('exam_center_id', examCenter.id);

          if (delErr) throw delErr;

          setConnectedInstitutes((prev) => prev.filter((i) => i.id !== inst.id));
          toast.success('Institute disconnected');
        } catch (err) {
          console.error('Failed to disconnect institute:', err);
          toast.error('Failed to disconnect institute');
        }
        setConfirmationDialog(null);
      },
    });
  };

  const handleUpdateInstituteName = async (id: string, newName: string) => {
    if (!examCenter?.id) return;
    try {
      const supabase = createClient();
      const { error: updErr } = await supabase
        .from('connected_institutes')
        .update({
          institute_name: newName,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('exam_center_id', examCenter.id);

      if (updErr) throw updErr;

      setConnectedInstitutes((prev) =>
        prev.map((inst) => (inst.id === id ? { ...inst, NAME: newName } : inst)),
      );
      toast.success('Institute name updated');
    } catch (err) {
      console.error('Failed to update institute name:', err);
      toast.error('Failed to update institute name');
    }
  };

  const handleUpdateExamCenter = async () => {
    if (!examCenter?.id) return;

    setSubmitting(true);
    try {
      const supabase = createClient();

      const updateData: Record<string, any> = {
        name: examCenter.name,
        address: examCenter.address,
        officer_incharge: examCenter.officerIncharge,
        sealing_supervisor: examCenter.sealingSupervisor,
        dist_center_code: examCenter.distCenterCode,
        dist_center_name: examCenter.distCenterName,
        season: examCenter.season,
        exam_year: examCenter.examYear,
        start_date: examCenter.startDate
          ? typeof examCenter.startDate === 'string'
            ? examCenter.startDate
            : examCenter.startDate.toISOString()
          : null,
        end_date: examCenter.endDate
          ? typeof examCenter.endDate === 'string'
            ? examCenter.endDate
            : examCenter.endDate.toISOString()
          : null,
        departments: examCenter.departments || [],
        updated_at: new Date().toISOString(),
      };

      const { error: updErr } = await supabase
        .from('exam_centers')
        .update(updateData)
        .eq('id', examCenter.id);

      if (updErr) throw updErr;

      toast.success('Exam center updated successfully');
      setError(null);
      await fetchData();
    } catch (err) {
      console.error('Failed to update exam center:', err);
      toast.error('Failed to update exam center');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitConfirmation = () => {
    setConfirmationDialog({
      type: 'success',
      message: 'Are you sure you want to save these changes?',
      onConfirm: () => {
        handleUpdateExamCenter();
        setConfirmationDialog(null);
      },
    });
  };

  const toolbarActions = [
    {
      id: 'refresh',
      label: 'Refresh',
      icon: <RefreshCw className="h-3.5 w-3.5" />,
      onClick: fetchData,
      variant: 'outline' as const,
    },
    {
      id: 'export',
      label: 'Export',
      icon: <Download className="h-3.5 w-3.5" />,
      onClick: () => {
        const data = {
          examCenter,
          connectedInstitutes,
          stats,
          exportedAt: new Date().toISOString(),
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `exam-center-${examCenter?.code || 'profile'}.json`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success('Profile exported successfully');
      },
      variant: 'ghost' as const,
    },
  ];

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="grid grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
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

  if (!examCenter) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Building2 className="mb-4 h-12 w-12 text-neutral-400" />
        <h3 className="text-lg font-medium text-neutral-900 dark:text-neutral-100">
          No Exam Center Found
        </h3>
        <p className="mt-1 text-sm text-neutral-500">
          Please contact your administrator to set up your exam center.
        </p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Exam Center Profile"
        description="Manage your examination center details and connected institutes."
        icon={Building2}
      />

      <StatsCards
        stats={stats}
        examCenter={examCenter}
      />

      <PageToolbar
        actions={toolbarActions}
        searchValue=""
        onSearchChange={() => {}}
        searchPlaceholder=""
      />

      <div className="mt-6 space-y-6">
        <Card>
          <CardHeader className="border-b border-neutral-100 pb-4 dark:border-neutral-800">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <Building2 className="h-4 w-4 text-neutral-500" />
              Basic Information
            </CardTitle>
            <CardDescription>Core details about your examination center.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 pt-6">
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-xs font-medium tracking-wide text-neutral-500 uppercase">
                  Center Code
                </Label>
                <Input
                  value={examCenter.code}
                  readOnly
                  className="bg-neutral-50 font-mono dark:bg-neutral-900/50"
                />
                <p className="text-xs text-neutral-400">Unique identifier for your center</p>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium tracking-wide text-neutral-500 uppercase">
                  Center Name
                </Label>
                <Input
                  value={examCenter.name || ''}
                  onChange={(e) =>
                    setExamCenter((prev) => (prev ? { ...prev, name: e.target.value } : null))
                  }
                  placeholder="Enter center name"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-xs font-medium tracking-wide text-neutral-500 uppercase">
                <MapPin className="h-3 w-3" />
                Address
              </Label>
              <Input
                value={examCenter.address || ''}
                onChange={(e) =>
                  setExamCenter((prev) =>
                    prev ? { ...prev, address: e.target.value || null } : null,
                  )
                }
                placeholder="Full address of examination center"
              />
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-xs font-medium tracking-wide text-neutral-500 uppercase">
                  <User className="h-3 w-3" />
                  Officer Incharge
                </Label>
                <Input
                  value={examCenter.officerIncharge || ''}
                  onChange={(e) =>
                    setExamCenter((prev) =>
                      prev ? { ...prev, officerIncharge: e.target.value || null } : null,
                    )
                  }
                  placeholder="Name of officer incharge"
                />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-xs font-medium tracking-wide text-neutral-500 uppercase">
                  <PenTool className="h-3 w-3" />
                  Sealing Supervisor
                </Label>
                <Input
                  value={examCenter.sealingSupervisor || ''}
                  onChange={(e) =>
                    setExamCenter((prev) =>
                      prev ? { ...prev, sealingSupervisor: e.target.value || null } : null,
                    )
                  }
                  placeholder="Name of sealing supervisor"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b border-neutral-100 pb-4 dark:border-neutral-800">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <CalendarDays className="h-4 w-4 text-neutral-500" />
              Examination Schedule
            </CardTitle>
            <CardDescription>
              Configure the schedule details for this examination cycle.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 pt-6">
            <div className="space-y-3">
              <Label className="text-xs font-medium tracking-wide text-neutral-500 uppercase">
                Examination Season
              </Label>
              <RadioGroup
                value={examCenter.season || 'Winter'}
                onValueChange={(value: 'Summer' | 'Winter') =>
                  setExamCenter((prev) => (prev ? { ...prev, season: value } : null))
                }
                className="grid grid-cols-1 gap-3 sm:grid-cols-2"
              >
                <div
                  onClick={() =>
                    setExamCenter((prev) => (prev ? { ...prev, season: 'Summer' } : null))
                  }
                  className={cn(
                    'flex cursor-pointer items-center justify-between rounded-lg border p-3.5 transition-all select-none',
                    examCenter.season === 'Summer'
                      ? 'border-emerald-600 bg-emerald-50/60 ring-1 ring-emerald-600 dark:border-emerald-500 dark:bg-emerald-950/20 dark:ring-emerald-500'
                      : 'border-neutral-200 bg-white hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-950 dark:hover:border-neutral-700',
                  )}
                >
                  <div className="flex items-center space-x-3">
                    <RadioGroupItem
                      value="Summer"
                      id="summer"
                    />
                    <div>
                      <Label
                        htmlFor="summer"
                        className="cursor-pointer text-sm font-medium text-neutral-900 dark:text-neutral-100"
                      >
                        Summer
                      </Label>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">
                        April – May Examination
                      </p>
                    </div>
                  </div>
                  <Badge
                    variant={examCenter.season === 'Summer' ? 'default' : 'secondary'}
                    className="text-[10px]"
                  >
                    Summer
                  </Badge>
                </div>

                <div
                  onClick={() =>
                    setExamCenter((prev) => (prev ? { ...prev, season: 'Winter' } : null))
                  }
                  className={cn(
                    'flex cursor-pointer items-center justify-between rounded-lg border p-3.5 transition-all select-none',
                    examCenter.season === 'Winter'
                      ? 'border-emerald-600 bg-emerald-50/60 ring-1 ring-emerald-600 dark:border-emerald-500 dark:bg-emerald-950/20 dark:ring-emerald-500'
                      : 'border-neutral-200 bg-white hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-950 dark:hover:border-neutral-700',
                  )}
                >
                  <div className="flex items-center space-x-3">
                    <RadioGroupItem
                      value="Winter"
                      id="winter"
                    />
                    <div>
                      <Label
                        htmlFor="winter"
                        className="cursor-pointer text-sm font-medium text-neutral-900 dark:text-neutral-100"
                      >
                        Winter
                      </Label>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">
                        November – December Examination
                      </p>
                    </div>
                  </div>
                  <Badge
                    variant={examCenter.season === 'Winter' ? 'default' : 'secondary'}
                    className="text-[10px]"
                  >
                    Winter
                  </Badge>
                </div>
              </RadioGroup>
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
              <div className="space-y-2">
                <Label className="text-xs font-medium tracking-wide text-neutral-500 uppercase">
                  Start Date
                </Label>
                <Input
                  type="date"
                  value={formatDateForInput(examCenter.startDate)}
                  onChange={(e) =>
                    setExamCenter((prev) =>
                      prev ? { ...prev, startDate: parseDateFromInput(e.target.value) } : null,
                    )
                  }
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium tracking-wide text-neutral-500 uppercase">
                  End Date
                </Label>
                <Input
                  type="date"
                  value={formatDateForInput(examCenter.endDate)}
                  onChange={(e) =>
                    setExamCenter((prev) =>
                      prev ? { ...prev, endDate: parseDateFromInput(e.target.value) } : null,
                    )
                  }
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium tracking-wide text-neutral-500 uppercase">
                  Year
                </Label>
                <Input
                  type="number"
                  value={examCenter.examYear || ''}
                  onChange={(e) =>
                    setExamCenter((prev) =>
                      prev
                        ? { ...prev, examYear: e.target.value ? parseInt(e.target.value) : null }
                        : null,
                    )
                  }
                  placeholder="e.g., 2024"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b border-neutral-100 pb-4 dark:border-neutral-800">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <Network className="h-4 w-4 text-neutral-500" />
              Distribution Center
            </CardTitle>
            <CardDescription>Details of the MSBTE distribution center.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 pt-6">
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-xs font-medium tracking-wide text-neutral-500 uppercase">
                  Distribution Code
                </Label>
                <Input
                  value={examCenter.distCenterCode || ''}
                  onChange={(e) =>
                    setExamCenter((prev) =>
                      prev ? { ...prev, distCenterCode: e.target.value || null } : null,
                    )
                  }
                  placeholder="e.g., 1234"
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium tracking-wide text-neutral-500 uppercase">
                  Distribution Name
                </Label>
                <Input
                  value={examCenter.distCenterName || ''}
                  onChange={(e) =>
                    setExamCenter((prev) =>
                      prev ? { ...prev, distCenterName: e.target.value || null } : null,
                    )
                  }
                  placeholder="Name of distribution center"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b border-neutral-100 pb-4 dark:border-neutral-800">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <Network className="h-4 w-4 text-neutral-500" />
              Connected Institutes
            </CardTitle>
            <CardDescription>
              Connect and manage institutes associated with this examination center.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 pt-6">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1 space-y-2">
                  <Label className="text-xs font-medium tracking-wide text-neutral-500 uppercase">
                    Institute Code
                  </Label>
                  <Input
                    value={instituteCode}
                    onChange={(e) => setInstituteCode(e.target.value.toUpperCase())}
                    placeholder="Enter institute code (e.g., 1234)"
                    className="font-mono"
                    onKeyDown={(e) => e.key === 'Enter' && fetchInstituteInfo()}
                  />
                </div>
                <Button
                  onClick={fetchInstituteInfo}
                  disabled={instituteLoading || !instituteCode.trim()}
                  variant="outline"
                  className="gap-2"
                >
                  {instituteLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {instituteLoading ? 'Searching...' : 'Fetch Institute'}
                </Button>
              </div>

              {instituteName && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/20">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <Badge
                        variant="secondary"
                        className="mb-2 font-mono"
                      >
                        {instituteCode}
                      </Badge>
                      <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
                        {instituteName}
                      </p>
                    </div>
                    <Button
                      onClick={addInstitute}
                      size="sm"
                      className="shrink-0 gap-2"
                    >
                      <Plus className="h-4 w-4" />
                      Connect Institute
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {connectedInstitutes.length > 0 && (
              <div className="space-y-3 pt-4">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium tracking-wide text-neutral-500 uppercase">
                    Connected Institutes ({connectedInstitutes.length})
                  </Label>
                </div>
                <div className="space-y-2">
                  {connectedInstitutes.map((inst) => (
                    <ConnectedInstituteItem
                      key={inst.id}
                      inst={inst}
                      onUpdateName={(newName) => handleUpdateInstituteName(inst.id, newName)}
                      onDisconnect={() => handleDisconnectInstitute(inst)}
                    />
                  ))}
                </div>
              </div>
            )}

            {connectedInstitutes.length === 0 && !instituteName && (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Network className="mb-3 h-10 w-10 text-neutral-400" />
                <p className="text-sm text-neutral-500">No institutes connected yet</p>
                <p className="mt-1 text-xs text-neutral-400">
                  Search for an institute code to get started
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-600 dark:border-rose-900/50 dark:bg-rose-950/20 dark:text-rose-400">
            {error}
          </div>
        )}

        <div className="flex justify-end pt-4">
          <Button
            onClick={handleSubmitConfirmation}
            disabled={submitting}
            className="min-w-[120px] gap-2"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {submitting ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>

      {confirmationDialog && (
        <ConfirmationDialog
          type={confirmationDialog.type as 'error' | 'success' | 'info'}
          confirmButtonText={confirmationDialog.type === 'error' ? 'Yes, Confirm' : 'Confirm'}
          message={confirmationDialog.message}
          onConfirm={confirmationDialog.onConfirm}
          onCancel={() => setConfirmationDialog(null)}
        />
      )}
    </div>
  );
}
