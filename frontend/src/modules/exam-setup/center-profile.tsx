// modules/exam-setup/center-profile.tsx
'use client';

import { useCallback, useEffect, useState } from 'react';

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

import { getExamStatistics } from '@/lib/actions2/configuration';
import { getExamCenter, updateExamCenter } from '@/lib/actions2/exam-center';
import {
  addConnectedInstitute,
  getConnectedInstitutes,
  getInstituteInfo,
  removeConnectedInstitute,
  updateInstituteName,
} from '@/lib/actions2/institute';

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

const formatDateForInput = (date: Date | null | undefined) => {
  if (!date) return '';
  return format(new Date(date), 'yyyy-MM-dd');
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
          {examCenter?.season?.toLowerCase() || '—'}
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
      const [centerResult, institutesResult, statsResult] = await Promise.all([
        getExamCenter(),
        getConnectedInstitutes(),
        getExamStatistics(),
      ]);

      if (centerResult.success && centerResult.data) {
        setExamCenter(centerResult.data as ExamCenterData);
      } else if (!centerResult.success) {
        toast.error(centerResult.error || 'Failed to load center data');
      }

      if (institutesResult.success && institutesResult.data) {
        setConnectedInstitutes(institutesResult.data);
      }

      if (statsResult.success && statsResult.data) {
        setStats(statsResult.data);
      }
    } catch {
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

  const fetchInstituteInfo = async () => {
    if (!instituteCode.trim()) {
      toast.error('Please enter an institute code');
      return;
    }

    setInstituteLoading(true);
    try {
      const result = await getInstituteInfo(instituteCode.toUpperCase());
      if (result.success && result.data) {
        setInstituteName(result.data.NAME);
        toast.success('Institute found');
      } else {
        toast.error(result.error || 'Institute not found');
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
    if (!instituteCode.trim() || !instituteName) {
      toast.error('Please fetch institute first');
      return;
    }

    if (connectedInstitutes.some((inst) => inst.CODE === instituteCode.toUpperCase())) {
      toast.error('Institute already connected');
      return;
    }

    try {
      const result = await addConnectedInstitute({
        instituteCode: instituteCode.toUpperCase(),
        instituteName,
      });

      if (result.success && result.data) {
        setConnectedInstitutes((prev) => [...prev, result.data]);
        setInstituteCode('');
        setInstituteName('');
        toast.success('Institute connected successfully');
      } else {
        toast.error(result.error || 'Failed to connect institute');
      }
    } catch {
      toast.error('Failed to connect institute');
    }
  };

  const handleDisconnectInstitute = (inst: Institute) => {
    setConfirmationDialog({
      type: 'error',
      message: `Are you sure you want to disconnect institute ${inst.CODE}? This will remove all associated data.`,
      onConfirm: async () => {
        try {
          const result = await removeConnectedInstitute(inst.id);
          if (result.success) {
            setConnectedInstitutes((prev) => prev.filter((i) => i.id !== inst.id));
            toast.success('Institute disconnected');
          } else {
            toast.error(result.error || 'Failed to disconnect');
          }
        } catch {
          toast.error('Failed to disconnect institute');
        }
        setConfirmationDialog(null);
      },
    });
  };

  const handleUpdateInstituteName = async (id: string, newName: string) => {
    try {
      const result = await updateInstituteName(id, newName);
      if (result.success) {
        setConnectedInstitutes((prev) =>
          prev.map((inst) => (inst.id === id ? { ...inst, NAME: newName } : inst)),
        );
        toast.success('Institute name updated');
      } else {
        toast.error(result.error || 'Failed to update name');
      }
    } catch {
      toast.error('Failed to update institute name');
    }
  };

  const handleUpdateExamCenter = async () => {
    if (!examCenter) return;

    setSubmitting(true);
    try {
      const result = await updateExamCenter({
        name: examCenter.name,
        address: examCenter.address,
        officerIncharge: examCenter.officerIncharge,
        sealingSupervisor: examCenter.sealingSupervisor,
        distCenterCode: examCenter.distCenterCode,
        distCenterName: examCenter.distCenterName,
        season: examCenter.season,
        examYear: examCenter.examYear,
        startDate: examCenter.startDate,
        endDate: examCenter.endDate,
        departments: examCenter.departments,
      });

      if (result.success) {
        toast.success('Exam center updated successfully');
        setError(null);
        await fetchData();
      } else {
        toast.error(result.error || 'Failed to update');
      }
    } catch {
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
                Season
              </Label>
              <RadioGroup
                value={examCenter.season || undefined}
                onValueChange={(value: 'Summer' | 'Winter') =>
                  setExamCenter((prev) => (prev ? { ...prev, season: value } : null))
                }
                className="flex gap-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem
                    value="Summer"
                    id="summer"
                  />
                  <Label
                    htmlFor="summer"
                    className="cursor-pointer font-normal"
                  >
                    Summer (April-May)
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem
                    value="Winter"
                    id="winter"
                  />
                  <Label
                    htmlFor="winter"
                    className="cursor-pointer font-normal"
                  >
                    Winter (November-December)
                  </Label>
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
