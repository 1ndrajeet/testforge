// modules/block-allocation/change-supervisor.tsx
'use client';

import { useCallback, useEffect, useState } from 'react';

import { format } from 'date-fns';
import { ChevronLeft, Loader2, RefreshCw, UserCog } from 'lucide-react';
import { toast } from 'sonner';

import { MSBTEContextBar } from '@/components/layout/msbte-context-bar';
import { PageEmpty, PageHeader } from '@/components/layout/page-layout';
import { SessionSelector } from '@/components/shared/date-selector';
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
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useUserInfo } from '@/hooks/useUserInfo';
import { getAllocations, getUniqueDates, getUniqueSessions, updateAllocation } from '@/lib/actions/allocation';
import { getStaff } from '@/lib/actions/staff';

// Fix: Make session more flexible to match database response
interface Allocation {
  id: string;
  date: Date;
  session: string; // Changed from 'Morning' | 'Afternoon' to string
  blockNo: string;
  location: string;
  scheme: string;
  subjectCode: string;
  subjectName: string;
  assignedCount: number;
  supervisorUid: string | null;
  supervisorName: string | null;
}

interface Supervisor {
  uid: string;
  name: string;
  department: string;
}

interface GroupedBlock {
  blockNo: string;
  location: string;
  subjects: Array<{
    id: string;
    scheme: string;
    subjectCode: string;
    subjectName: string;
    assignedCount: number;
  }>;
  supervisorUid: string | null;
  supervisorName: string | null;
  allocationIds: string[];
}

export default function ChangeSupervisorPage() {
  const { examCenter } = useUserInfo();

  const [step, setStep] = useState<'select' | 'allocate'>('select');
  const [dates, setDates] = useState<Date[]>([]);
  const [sessions, setSessions] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedSession, setSelectedSession] = useState('');
  const [groupedBlocks, setGroupedBlocks] = useState<GroupedBlock[]>([]);
  const [selectedBlock, setSelectedBlock] = useState<GroupedBlock | null>(null);
  const [supervisors, setSupervisors] = useState<Supervisor[]>([]);
  const [selectedSupervisor, setSelectedSupervisor] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    const fetchMeta = async () => {
      const [d, s] = await Promise.all([getUniqueDates(), getUniqueSessions()]);
      if (d.success && d.data) setDates(d.data);
      if (s.success && s.data) setSessions(s.data);
    };
    fetchMeta();

    const fetchSupervisors = async () => {
      const res = await getStaff('SUPERVISOR');
      if (res.success && res.data) {
        setSupervisors(res.data);
      }
    };
    fetchSupervisors();
  }, []);

  const groupAllocationsByBlock = useCallback((allocations: Allocation[]): GroupedBlock[] => {
    const blockMap = new Map<string, GroupedBlock>();

    for (const alloc of allocations) {
      const key = alloc.blockNo;

      if (!blockMap.has(key)) {
        blockMap.set(key, {
          blockNo: alloc.blockNo,
          location: alloc.location,
          subjects: [],
          supervisorUid: alloc.supervisorUid,
          supervisorName: alloc.supervisorName,
          allocationIds: [],
        });
      }

      const block = blockMap.get(key)!;
      block.subjects.push({
        id: alloc.id,
        scheme: alloc.scheme,
        subjectCode: alloc.subjectCode,
        subjectName: alloc.subjectName,
        assignedCount: alloc.assignedCount,
      });
      block.allocationIds.push(alloc.id);
    }

    return Array.from(blockMap.values());
  }, []);

  const loadAllocations = useCallback(
    async (date: string, session: string) => {
      setLoading(true);
      try {
        const res = await getAllocations({ date: new Date(date), session });
        if (res.success && res.data) {
          // Cast the data to Allocation[] since session comes as string from DB
          const allocations = res.data as unknown as Allocation[];
          const grouped = groupAllocationsByBlock(allocations);
          setGroupedBlocks(grouped);
        } else {
          toast.error('Failed to load allocations');
        }
      } catch {
        toast.error('Failed to load allocations');
      } finally {
        setLoading(false);
      }
    },
    [groupAllocationsByBlock]
  );

  const handleSessionSelect = async (session: { date: string; session: 'Morning' | 'Afternoon' | 'All' }) => {
    setSelectedDate(session.date);
    setSelectedSession(session.session);
    await loadAllocations(session.date, session.session);
    setStep('allocate');
  };

  const handleChangeSupervisor = async () => {
    if (!selectedBlock || !selectedSupervisor) {
      toast.error('Please select a supervisor');
      return;
    }

    setSubmitting(true);
    const sup = supervisors.find(s => s.uid === selectedSupervisor);

    try {
      let successCount = 0;
      let failCount = 0;
      const failedIds: string[] = [];

      for (const subject of selectedBlock.subjects) {
        const result = await updateAllocation({
          id: subject.id,
          supervisorUid: selectedSupervisor,
          supervisorName: sup?.name || '',
        });

        if (result.success) {
          successCount++;
        } else {
          failCount++;
          failedIds.push(subject.id);
          console.error(`Failed to update ${subject.subjectCode}:`, result.error);
        }
      }

      if (successCount > 0) {
        toast.success(
          `Updated ${successCount} subject(s) in Block ${selectedBlock.blockNo}${failCount > 0 ? ` (${failCount} failed)` : ''}`
        );

        await loadAllocations(selectedDate, selectedSession);
        setDialogOpen(false);
        setSelectedBlock(null);
        setSelectedSupervisor('');

        if (failCount > 0) {
          console.warn('Failed allocation IDs:', failedIds);
        }
      } else {
        toast.error('Failed to change supervisor for any subject');
      }
    } catch {
      toast.error('Failed to change supervisor');
    } finally {
      setSubmitting(false);
    }
  };

  if (step === 'select') {
    return (
      <div className="mx-auto max-w-[1400px] space-y-5 px-6 py-5">
        <PageHeader title="Change Supervisor" description="Select examination date and session" icon={UserCog} />
        <SessionSelector
          availableDates={dates}
          availableSessions={sessions}
          onSessionSelect={handleSessionSelect}
          compact
          isLoading={loading}
          title="Select Examination Session"
          description="Choose a date and session to modify supervisor assignments"
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Change Supervisor"
        description={`${format(new Date(selectedDate), 'dd MMM yyyy')} · ${selectedSession}`}
        icon={UserCog}
        actions={
          <Button variant="ghost" size="sm" onClick={() => setStep('select')} className="gap-1.5">
            <ChevronLeft className="h-4 w-4" />
            Change Session
          </Button>
        }
      />

      <MSBTEContextBar season={examCenter?.season as 'Summer' | 'Winter'} year={examCenter?.examYear!} />

      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs text-neutral-500">
          {groupedBlocks.length} block{groupedBlocks.length !== 1 ? 's' : ''}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => loadAllocations(selectedDate, selectedSession)}
          className="h-7 gap-1 text-xs"
        >
          <RefreshCw className="h-3 w-3" />
          Refresh
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : groupedBlocks.length === 0 ? (
        <PageEmpty title="No allocations found" description="No blocks allocated for this date and session." />
      ) : (
        <div className="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-neutral-50 dark:bg-neutral-900">
                <TableRow>
                  <TableHead className="w-20 text-xs font-medium tracking-wide uppercase">Block No</TableHead>
                  <TableHead className="w-28 text-xs font-medium tracking-wide uppercase">Location</TableHead>
                  <TableHead className="text-xs font-medium tracking-wide uppercase">Subjects</TableHead>
                  <TableHead className="w-48 text-xs font-medium tracking-wide uppercase">Current Supervisor</TableHead>
                  <TableHead className="w-24 text-xs font-medium tracking-wide uppercase"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groupedBlocks.map((block, idx) => (
                  <TableRow key={block.blockNo} className="hover:bg-neutral-50 dark:hover:bg-neutral-900">
                    <TableCell className="px-4 py-3 text-center font-mono text-sm">
                      <Badge variant="secondary" className="text-xs">
                        {idx + 1}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-4 py-3 font-mono text-sm">{block.location}</TableCell>
                    <TableCell className="px-4 py-3">
                      <div className="space-y-1">
                        {block.subjects.map((sub, subIdx) => (
                          <div key={subIdx} className="text-sm">
                            <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs dark:bg-neutral-800">
                              {sub.subjectCode}
                            </code>
                            <span className="mx-1">-</span>
                            <span>{sub.subjectName}</span>
                            <span className="text-muted-foreground ml-2 text-xs">({sub.assignedCount} students)</span>
                          </div>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      {block.supervisorName ? (
                        <span className="text-sm font-medium">{block.supervisorName}</span>
                      ) : (
                        <Badge
                          variant="outline"
                          className="border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400"
                        >
                          Not Assigned
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedBlock(block);
                          setSelectedSupervisor(block.supervisorUid || '');
                          setDialogOpen(true);
                        }}
                        className="gap-1.5"
                      >
                        <UserCog className="h-3.5 w-3.5" />
                        Change
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Change Supervisor</DialogTitle>
            <DialogDescription>
              Block {selectedBlock?.blockNo} - {selectedBlock?.location}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="bg-muted rounded-lg p-3">
              <p className="text-muted-foreground text-xs">Current Supervisor</p>
              <p className="mt-1 font-medium">{selectedBlock?.supervisorName || 'Not Assigned'}</p>
              <p className="text-muted-foreground mt-2 text-xs">
                This will change supervisor for ALL {selectedBlock?.subjects.length} subject(s) in this block
              </p>
            </div>

            <div className="space-y-2">
              <Label>New Supervisor</Label>
              <Select value={selectedSupervisor} onValueChange={setSelectedSupervisor}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a supervisor" />
                </SelectTrigger>
                <SelectContent>
                  {supervisors.map(s => (
                    <SelectItem key={s.uid} value={s.uid}>
                      {s.name} ({s.uid}) - {s.department}
                    </SelectItem>
                  ))}
                  {supervisors.length === 0 && (
                    <div className="text-muted-foreground px-2 py-4 text-center text-sm">No supervisors available</div>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleChangeSupervisor} disabled={submitting || !selectedSupervisor}>
              {submitting && (
                <span className="mr-2 h-4 w-4 animate-spin">
                  <Loader2 />
                </span>
              )}
              Change Supervisor
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
