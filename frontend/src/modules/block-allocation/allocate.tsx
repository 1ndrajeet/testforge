// app/(dashboard)/exam-setup/block-allocation/page.tsx - Complete fixed version

'use client';

import { useEffect, useMemo, useState } from 'react';

import { useRouter } from 'next/navigation';

import { format } from 'date-fns';
import { AlertCircle, Calendar, Check, ChevronLeft, X } from 'lucide-react';
import { toast } from 'sonner';

import { bulkCreateBlockConfigurations, checkExistingAllocations } from '@/lib/actions/allocation';
import { getBlocks } from '@/lib/actions/block';
import { getOrders } from '@/lib/actions/order';
import { getSupervisors } from '@/lib/actions/staff';
import { getTimetable, getUniqueDates, getUniqueSessions } from '@/lib/actions/timetable';
import {
  addLocalAllocation,
  clearLocalAllocations,
  clearLocalTimetable,
  clearSessionContext,
  getLocalAllocations,
  getSessionContext,
  hasLocalData,
  type LocalAllocation,
  removeLocalAllocation,
  setLocalTimetable,
  setSessionContext,
  updateLocalTimetable,
} from '@/lib/misc/local-storage';
import { Block, ExistingAllocation, SessionInfo, StaffMember, TimetableEntry } from '@/lib/types';
import { cn } from '@/lib/utils';

import { useUserInfo } from '@/hooks/useUserInfo';

import { Alert } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { MSBTEContextBar } from '@/components/layout/msbte-context-bar';
import { PageHeader } from '@/components/layout/page-layout';

import { SessionSelector } from '@/components/shared/date-selector';

// ============================================================================
// Types
// ============================================================================

// ============================================================================
// Block Summary Strip Component
// ============================================================================

interface BlockSummaryStripProps {
  totalBlocks: number;
  totalCapacity: number;
  totalSubjects: number;
  totalAllocated: number;
  remainingStudents: number;
}

function BlockSummaryStrip({
  totalBlocks,
  totalCapacity,
  totalSubjects,
  totalAllocated,
  remainingStudents,
}: BlockSummaryStripProps) {
  const progress =
    totalAllocated + remainingStudents > 0
      ? (totalAllocated / (totalAllocated + remainingStudents)) * 100
      : 0;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-6 border-y border-neutral-200 py-2 text-xs dark:border-neutral-800">
        <StatItem
          value={totalBlocks}
          label="blocks"
        />
        <Divider />
        <StatItem
          value={totalCapacity}
          label="capacity"
        />
        <Divider />
        <StatItem
          value={totalSubjects}
          label="subjects"
        />
        <Divider />
        <StatItem
          value={totalAllocated}
          label="assigned"
          highlighted
        />
        <Divider />
        <StatItem
          value={remainingStudents}
          label="remaining"
          isRemaining
        />
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
        <div
          className="bg-primary h-full transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

const StatItem = ({
  value,
  label,
  highlighted = false,
  isRemaining = false,
}: {
  value: number;
  label: string;
  highlighted?: boolean;
  isRemaining?: boolean;
}) => (
  <div className="flex items-center gap-2">
    <span
      className={cn(
        'font-mono text-sm font-semibold',
        highlighted && 'text-primary dark:text-primary',
        isRemaining && value > 0 && 'text-amber-600 dark:text-amber-400',
        isRemaining && value === 0 && 'text-primary dark:text-primary',
      )}
    >
      {value}
    </span>
    <span className="text-neutral-500">{label}</span>
  </div>
);

const Divider = () => <div className="h-3 w-px bg-neutral-200 dark:bg-neutral-800" />;

// ============================================================================
// Available Blocks Component
// ============================================================================

interface AvailableBlocksProps {
  blocks: Block[];
  isLoading?: boolean;
  selectedBlockId?: string;
  onSelectBlock?: (blockId: string) => void;
  allocatedBlocks?: Map<string, number>;
  supervisorsAllocated?: Set<string>;
}

function AvailableBlocks({
  blocks,
  isLoading,
  selectedBlockId,
  onSelectBlock,
  allocatedBlocks,
}: AvailableBlocksProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        <SectionHeader title="Available Blocks" />
        <div className="flex gap-2 overflow-x-auto pb-1">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton
              key={i}
              className="h-16 w-28 shrink-0 rounded-md"
            />
          ))}
        </div>
      </div>
    );
  }

  if (blocks.length === 0) {
    return (
      <div className="space-y-2">
        <SectionHeader title="Available Blocks" />
        <EmptyState message="No blocks configured" />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <SectionHeader
        title="Available Blocks"
        badge={`${blocks.length} blocks`}
      />
      <div className="flex gap-2 overflow-x-auto pb-1">
        {blocks.map((block) => {
          const allocated = allocatedBlocks?.get(block.location) || 0;
          const remaining = block.strength - allocated;
          const isFull = remaining === 0;

          return (
            <BlockCard
              key={block.id}
              block={block}
              remaining={remaining}
              isFull={isFull}
              isSelected={selectedBlockId === block.location}
              onSelect={() => !isFull && onSelectBlock?.(block.location)}
            />
          );
        })}
      </div>
    </div>
  );
}

const SectionHeader = ({ title, badge }: { title: string; badge?: string }) => (
  <div className="flex items-center gap-2">
    <div className="h-1.5 w-1.5 rounded-full bg-neutral-400" />
    <h3 className="text-xs font-medium tracking-wide text-neutral-500 uppercase">{title}</h3>
    {badge && <span className="ml-auto text-[10px] text-neutral-400">{badge}</span>}
  </div>
);

const EmptyState = ({ message }: { message: string }) => (
  <div className="rounded-md border border-dashed border-neutral-200 bg-neutral-50 py-6 text-center dark:border-neutral-800 dark:bg-neutral-900/50">
    <p className="text-xs text-neutral-500">{message}</p>
  </div>
);

const BlockCard = ({
  block,
  remaining,
  isFull,
  isSelected,
  onSelect,
}: {
  block: Block;
  remaining: number;
  isFull: boolean;
  isSelected: boolean;
  onSelect: () => void;
}) => (
  <button
    onClick={onSelect}
    disabled={isFull}
    className={cn(
      'group relative flex h-16 w-28 shrink-0 flex-col items-center justify-center rounded-md border transition-all',
      isSelected
        ? 'border-neutral-800 bg-neutral-900 text-white dark:border-neutral-200 dark:bg-neutral-100 dark:text-neutral-900'
        : isFull
          ? 'cursor-not-allowed border-neutral-200 bg-neutral-100 text-neutral-400 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-600'
          : 'border-neutral-200 bg-white hover:border-neutral-300 hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950 dark:hover:border-neutral-700',
    )}
  >
    <span className="text-sm font-medium">{block.location}</span>
    <span
      className={cn(
        'text-xs',
        isSelected ? 'text-neutral-300 dark:text-neutral-500' : 'text-neutral-500',
      )}
    >
      {remaining}/{block.strength}
    </span>
    {isSelected && (
      <div className="bg-primary absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full">
        <Check className="h-2.5 w-2.5 text-white" />
      </div>
    )}
    {isFull && !isSelected && (
      <div className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-neutral-400">
        <X className="h-2.5 w-2.5 text-white" />
      </div>
    )}
  </button>
);

// ============================================================================
// Timetable Table Component
// ============================================================================

interface TimetableTableProps {
  entries: TimetableEntry[];
  date: string;
  session: string;
  isLoading?: boolean;
  onSelectScheme?: (scheme: string) => void;
  selectedScheme?: string;
  remainingStudents?: Map<string, number>;
}

function TimetableTable({
  entries,
  date,
  session,
  isLoading,
  onSelectScheme,
  selectedScheme,
  remainingStudents,
}: TimetableTableProps) {
  const totalStudents = useMemo(
    () => entries.reduce((sum, e) => sum + e.totalStudents, 0),
    [entries],
  );

  if (isLoading) {
    return (
      <div className="space-y-2">
        <SectionHeader title="Timetable" />
        <div className="rounded-md border border-neutral-200 dark:border-neutral-800">
          <div className="space-y-1 p-2">
            <Skeleton className="h-7 w-full" />
            <Skeleton className="h-7 w-full" />
            <Skeleton className="h-7 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="space-y-2">
        <SectionHeader title="Timetable" />
        <EmptyState message="No timetable entries" />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="h-1.5 w-1.5 rounded-full bg-neutral-400" />
        <h3 className="text-xs font-medium tracking-wide text-neutral-500 uppercase">Timetable</h3>
        <div className="ml-auto flex items-center gap-2">
          <Badge
            variant="secondary"
            className="h-5 text-[10px] font-normal"
          >
            {date}
          </Badge>
          <Badge
            variant="secondary"
            className="h-5 text-[10px] font-normal"
          >
            {session}
          </Badge>
          <span className="text-[10px] text-neutral-400">{totalStudents} total</span>
        </div>
      </div>

      <div className="overflow-hidden rounded-md border border-neutral-200 dark:border-neutral-800">
        <Table>
          <TableHeader className="bg-neutral-50 dark:bg-neutral-900">
            <TableRow className="border-b border-neutral-200 dark:border-neutral-800">
              <TableHead className="h-7 text-xs font-medium">Scheme</TableHead>
              <TableHead className="h-7 text-xs font-medium">Subject</TableHead>
              <TableHead className="h-7 w-20 text-right text-xs font-medium">Students</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => {
              const remaining = remainingStudents?.get(entry.scheme) ?? entry.totalStudents;
              const isCompleted = remaining === 0;

              return (
                <TableRow
                  key={entry.id}
                  className={cn(
                    'cursor-pointer transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-900',
                    selectedScheme === entry.scheme && 'bg-neutral-50 dark:bg-neutral-900',
                    isCompleted && 'opacity-50',
                  )}
                  onClick={() => !isCompleted && onSelectScheme?.(entry.scheme)}
                >
                  <TableCell className="py-2 font-mono text-xs">{entry.scheme}</TableCell>
                  <TableCell className="py-2">
                    <div className="flex items-center gap-2">
                      <code className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-[10px] dark:bg-neutral-800">
                        {entry.subjectCode}
                      </code>
                      <span className="text-xs text-neutral-500">{entry.subjectName}</span>
                    </div>
                  </TableCell>
                  <TableCell className="py-2 text-right font-mono text-xs">{remaining}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ============================================================================
// Assignment Form Component - Updated with Hashmap Lookup
// ============================================================================

interface AssignmentFormProps {
  blocks: Block[];
  supervisors: StaffMember[];
  timetable: TimetableEntry[];
  selectedScheme: string;
  selectedBlock: string;
  selectedSupervisor: string;
  candidateCount: number;
  onSchemeChange: (scheme: string) => void;
  onBlockChange: (block: string) => void;
  onSupervisorChange: (supervisor: string) => void;
  onCandidateCountChange: (count: number) => void;
  onSubmit: () => Promise<void>;
  isLoading?: boolean;
  isSubmitting?: boolean;
  blockRemainingCapacity?: Map<string, number>;
  schemeRemainingStudents?: Map<string, number>;
  allocatedSupervisors?: Set<string>;
  localAllocations: LocalAllocation[];
  existingAllocationsByBlockScheme?: Set<string>;
  filterBySupervision: boolean;
  onFilterBySupervisionChange: (value: boolean) => void;
  hasSupervisionOrders: boolean;
  supervisionOrderSupervisors: Set<string>;
}

function AssignmentForm({
  blocks,
  supervisors,
  timetable,
  selectedScheme,
  selectedBlock,
  selectedSupervisor,
  candidateCount,
  onSchemeChange,
  onBlockChange,
  onSupervisorChange,
  onCandidateCountChange,
  onSubmit,
  isLoading,
  isSubmitting,
  blockRemainingCapacity,
  schemeRemainingStudents,
  localAllocations,
  existingAllocationsByBlockScheme,
  filterBySupervision,
  onFilterBySupervisionChange,
  supervisionOrderSupervisors,
  hasSupervisionOrders,
}: AssignmentFormProps) {
  const selectedTimetableEntry = timetable.find((t) => t.scheme === selectedScheme);
  const selectedBlockData = blocks.find((b) => b.location === selectedBlock);

  const blockRemaining =
    blockRemainingCapacity?.get(selectedBlock) ?? selectedBlockData?.strength ?? 0;
  const schemeRemaining =
    schemeRemainingStudents?.get(selectedScheme) ?? selectedTimetableEntry?.totalStudents ?? 0;

  const maxCandidates = Math.min(schemeRemaining, blockRemaining);
  const schemeDepartment = selectedScheme?.split('-')[0];

  // ============================================================
  // HASHMAP: Block -> Supervisor Lookup
  // ============================================================
  // Create a map of blockName -> supervisor UID for quick lookup
  const blockSupervisorMap = useMemo(() => {
    const map = new Map<string, string>();
    localAllocations.forEach((alloc) => {
      if (alloc.supervisor) {
        map.set(alloc.blockName, alloc.supervisor);
      }
    });
    return map;
  }, [localAllocations]);

  // Get the supervisor for the currently selected block (if any)
  const lockedSupervisor = useMemo(() => {
    return blockSupervisorMap.get(selectedBlock) || null;
  }, [blockSupervisorMap, selectedBlock]);

  // Check if current block has any allocation (is locked)
  const isBlockLocked = useMemo(() => {
    return localAllocations.some((alloc) => alloc.blockName === selectedBlock);
  }, [localAllocations, selectedBlock]);

  // Get set of supervisors already assigned to blocks (excluding current block)
  const assignedSupervisorsSet = useMemo(() => {
    const set = new Set<string>();
    localAllocations.forEach((alloc) => {
      if (alloc.blockName !== selectedBlock && alloc.supervisor) {
        set.add(alloc.supervisor);
      }
    });
    return set;
  }, [localAllocations, selectedBlock]);

  // Filter available schemes (only those with remaining students > 0)
  const availableSchemes = useMemo(() => {
    return timetable.filter(
      (entry) => (schemeRemainingStudents?.get(entry.scheme) ?? entry.totalStudents) > 0,
    );
  }, [timetable, schemeRemainingStudents]);

  // Filter supervisors based on current context
  const filteredSupervisors = useMemo(() => {
    return supervisors.filter((sup) => {
      // Skip if no scheme selected
      if (!schemeDepartment) return false;

      // Must be from different department

      // If block is locked, only allow the current block's supervisor
      if (isBlockLocked && lockedSupervisor) {
        return sup.uid === lockedSupervisor;
      }
      if (!filterBySupervision && sup.department === schemeDepartment) {
        return false;
      }
      // Exclude supervisors already assigned to other blocks
      if (assignedSupervisorsSet.has(sup.uid)) {
        return false;
      }

      // If filtering by supervision orders, only show supervisors with orders
      if (filterBySupervision && supervisionOrderSupervisors.size > 0) {
        return supervisionOrderSupervisors.has(sup.uid);
      }

      return true;
    });
  }, [
    supervisors,
    schemeDepartment,
    isBlockLocked,
    lockedSupervisor,
    assignedSupervisorsSet,
    filterBySupervision,
    supervisionOrderSupervisors,
  ]);

  // ============================================================
  // HASHMAP LOOKUP: When block changes, check if supervisor exists
  // ============================================================
  useEffect(() => {
    if (isBlockLocked && lockedSupervisor) {
      // Block has a supervisor - lock it
      if (selectedSupervisor !== lockedSupervisor) {
        onSupervisorChange(lockedSupervisor);
      }
    } else if (!isBlockLocked && selectedSupervisor) {
      // Block has no supervisor - clear it
      onSupervisorChange('');
    }
  }, [isBlockLocked, lockedSupervisor, onSupervisorChange]);

  // Check if scheme already assigned to this block
  const isSchemeAlreadyInBlock = useMemo(() => {
    return (
      selectedBlock &&
      selectedScheme &&
      existingAllocationsByBlockScheme?.has(`${selectedBlock}-${selectedScheme}`)
    );
  }, [selectedBlock, selectedScheme, existingAllocationsByBlockScheme]);

  // Validation checks
  const showDepartmentWarning =
    selectedScheme &&
    selectedSupervisor &&
    supervisors.find((s) => s.uid === selectedSupervisor)?.department === schemeDepartment;

  const showSupervisorAllocatedWarning =
    selectedSupervisor && assignedSupervisorsSet.has(selectedSupervisor);

  const showNoSupervisorsWarning =
    selectedScheme && !isBlockLocked && filteredSupervisors.length === 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedScheme || !selectedBlock || !selectedSupervisor || candidateCount <= 0) {
      toast.error('Please fill all fields');
      return;
    }

    if (candidateCount > maxCandidates) {
      toast.error(`Cannot assign more than ${maxCandidates} candidates`);
      return;
    }

    if (isSchemeAlreadyInBlock) {
      toast.error(`Scheme ${selectedScheme} already assigned to block ${selectedBlock}`);
      return;
    }

    await onSubmit();
  };

  const isFormValid = useMemo(() => {
    return (
      selectedScheme &&
      selectedBlock &&
      selectedSupervisor &&
      candidateCount > 0 &&
      maxCandidates > 0 &&
      !isSchemeAlreadyInBlock
    );
  }, [
    selectedScheme,
    selectedBlock,
    selectedSupervisor,
    candidateCount,
    maxCandidates,
    isSchemeAlreadyInBlock,
  ]);

  if (timetable.length === 0) {
    return (
      <div className="space-y-2">
        <SectionHeader title="Assignment" />
        <EmptyState message="Select a session first" />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <SectionHeader title="Assignment" />
        <div className="flex items-center gap-2">
          <label className="text-xs text-neutral-500">Supervision Orders</label>
          <Switch
            checked={filterBySupervision}
            onCheckedChange={() => onFilterBySupervisionChange(!filterBySupervision)}
          />
          {filterBySupervision && hasSupervisionOrders && (
            <Badge
              variant="outline"
              className="h-4 text-[10px]"
            >
              {supervisionOrderSupervisors.size} active
            </Badge>
          )}
        </div>
      </div>
      <div className="rounded-md border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-950">
        <form
          onSubmit={handleSubmit}
          className="space-y-3"
        >
          <FormSelect
            label="Scheme"
            value={selectedScheme}
            onValueChange={onSchemeChange}
            placeholder="Select scheme"
            items={availableSchemes.map((entry) => ({
              value: entry.scheme,
              label: entry.scheme,
              sublabel: `${entry.subjectCode} · ${schemeRemainingStudents?.get(entry.scheme) ?? entry.totalStudents} remaining`,
            }))}
          />

          <FormSelect
            label="Block"
            value={selectedBlock}
            onValueChange={onBlockChange}
            placeholder="Select block"
            items={blocks.map((block) => ({
              value: block.location,
              label: block.location,
              sublabel: `${block.name} · ${blockRemainingCapacity?.get(block.location) ?? block.strength} capacity`,
            }))}
          />

          <div className="space-y-1">
            <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
              Supervisor
            </label>
            <Select
              value={selectedSupervisor}
              onValueChange={onSupervisorChange}
              disabled={isBlockLocked}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue
                  placeholder={isBlockLocked ? 'Supervisor locked' : 'Select supervisor'}
                />
              </SelectTrigger>
              <SelectContent>
                {filteredSupervisors.map((sup) => (
                  <SelectItem
                    key={sup.id}
                    value={sup.uid}
                  >
                    <div className="flex w-full items-center justify-between gap-4">
                      <span className="font-medium">{sup.name}</span>
                      <span className="text-xs text-neutral-400">
                        {sup.uid} · {sup.department}
                      </span>
                    </div>
                  </SelectItem>
                ))}
                {filteredSupervisors.length === 0 && (
                  <div className="px-2 py-4 text-center text-xs text-neutral-500">
                    No available supervisors
                  </div>
                )}
              </SelectContent>
            </Select>

            {/* Show locked supervisor info */}
            {isBlockLocked && lockedSupervisor && (
              <p className="text-[10px] text-amber-600">
                Supervisor locked for this block ({lockedSupervisor}). Remove all allocations for
                this block to change.
              </p>
            )}

            {showDepartmentWarning && (
              <p className="text-[10px] text-red-500">
                Supervisor is from the same department as scheme ({schemeDepartment})
              </p>
            )}

            {showSupervisorAllocatedWarning && (
              <p className="text-[10px] text-amber-600">
                Supervisor already assigned to another block in this session
              </p>
            )}

            {showNoSupervisorsWarning && (
              <p className="text-[10px] text-amber-600">
                No available supervisors. Try selecting a different scheme or block.
              </p>
            )}

            {selectedScheme &&
              !isBlockLocked &&
              !showDepartmentWarning &&
              !showSupervisorAllocatedWarning &&
              filteredSupervisors.length > 0 && (
                <p className="text-[10px] text-neutral-500">
                  Select supervisor from different department than {schemeDepartment}
                </p>
              )}
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
              Candidates
            </label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                max={maxCandidates}
                value={candidateCount || ''}
                onChange={(e) => onCandidateCountChange(Number(e.target.value))}
                placeholder={`Max: ${maxCandidates}`}
                className="h-8 text-sm"
              />
              <Button
                type="submit"
                disabled={isSubmitting || isLoading || !isFormValid}
                size="sm"
                className="h-8 px-4"
              >
                {isSubmitting ? 'Assigning...' : 'Assign'}
              </Button>
            </div>

            {selectedScheme && selectedBlock && (
              <div className="flex justify-between text-[10px] text-neutral-500">
                <span>Students remaining: {schemeRemaining}</span>
                <span>Block capacity: {blockRemaining}</span>
              </div>
            )}

            {isSchemeAlreadyInBlock && (
              <p className="text-[10px] text-red-500">
                Scheme {selectedScheme} already assigned to block {selectedBlock}
              </p>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

const FormSelect = ({
  label,
  value,
  onValueChange,
  placeholder,
  items,
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  placeholder: string;
  items: Array<{ value: string; label: string; sublabel: string }>;
}) => (
  <div className="space-y-1">
    <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">{label}</label>
    <Select
      value={value}
      onValueChange={onValueChange}
    >
      <SelectTrigger className="h-8 text-sm">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem
            key={item.value}
            value={item.value}
          >
            <div className="flex w-full items-center justify-between gap-4">
              <span className="font-mono text-sm">{item.label}</span>
              <span className="text-xs text-neutral-400">{item.sublabel}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
);

// ============================================================================
// Distribution Table Component
// ============================================================================

interface DistributionTableProps {
  allocations: LocalAllocation[];
  onUpdate: () => Promise<void>;
  onClear: () => void;
  onRemoveAllocation: (id: string) => void;
  isLoading?: boolean;
  remainingStudents: number;
}

function DistributionTable({
  allocations,
  onUpdate,
  onClear,
  onRemoveAllocation,
  isLoading,
  remainingStudents,
}: DistributionTableProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const totalAllocated = allocations.reduce((sum, a) => sum + a.numberOfCandidates, 0);
  const canSubmit = remainingStudents === 0 && allocations.length > 0;

  const handleUpdate = async () => {
    if (!canSubmit) {
      toast.error(`Cannot submit: ${remainingStudents} students still need allocation`);
      return;
    }
    setIsUpdating(true);
    try {
      await onUpdate();
    } finally {
      setIsUpdating(false);
    }
  };

  if (allocations.length === 0) {
    return (
      <div className="space-y-2">
        <SectionHeader title="Block Distribution" />
        <EmptyState message="No allocations yet" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-1.5 rounded-full bg-neutral-400" />
          <h3 className="text-xs font-medium tracking-wide text-neutral-500 uppercase">
            Block Distribution
          </h3>
          <div className="flex items-center gap-1.5">
            <Badge
              variant="secondary"
              className="h-5 text-[10px] font-normal"
            >
              {allocations.length} allocations
            </Badge>
            <Badge
              variant="secondary"
              className="h-5 text-[10px] font-normal"
            >
              {totalAllocated} students
            </Badge>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            onClick={onClear}
            disabled={isLoading || isUpdating}
            size="sm"
            className="h-7 text-xs"
          >
            Clear all
          </Button>
          <Button
            onClick={handleUpdate}
            disabled={isLoading || isUpdating || !canSubmit}
            size="sm"
            className="h-7 px-3 text-xs"
          >
            {isUpdating ? 'Submitting...' : 'Submit all'}
          </Button>
        </div>
      </div>

      {!canSubmit && remainingStudents > 0 && (
        <Alert className="border-amber-600 bg-amber-50">
          <AlertCircle className="h-4 w-4 text-amber-600" />
          <span className="text-sm text-amber-600">
            {remainingStudents} student{remainingStudents !== 1 ? 's' : ''} still need allocation.
            Submit disabled until all students are allocated.
          </span>
        </Alert>
      )}

      <div className="overflow-hidden rounded-md border border-neutral-200 dark:border-neutral-800">
        <Table>
          <TableHeader className="bg-neutral-50 dark:bg-neutral-900">
            <TableRow className="border-b border-neutral-200 dark:border-neutral-800">
              <TableHead className="h-8 text-xs font-medium">Block</TableHead>
              <TableHead className="h-8 text-xs font-medium">Scheme</TableHead>
              <TableHead className="h-8 text-xs font-medium">Subject</TableHead>
              <TableHead className="h-8 text-xs font-medium">Supervisor</TableHead>
              <TableHead className="h-8 w-24 text-right text-xs font-medium">Students</TableHead>
              <TableHead className="h-8 w-10 text-right text-xs font-medium"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {allocations.map((alloc) => (
              <TableRow
                key={alloc.id}
                className="h-9 border-b border-neutral-100 dark:border-neutral-800"
              >
                <TableCell className="py-1.5 text-sm font-medium">
                  {alloc.blockName || 'Unknown'}
                </TableCell>
                <TableCell className="py-1.5 font-mono text-xs">{alloc.scheme}</TableCell>
                <TableCell className="py-1.5">
                  <code className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-[10px] dark:bg-neutral-800">
                    {alloc.subCode}
                  </code>
                </TableCell>
                <TableCell className="py-1.5 text-sm">{alloc.supervisor}</TableCell>
                <TableCell className="py-1.5 text-right font-mono text-sm font-medium">
                  {alloc.numberOfCandidates}
                </TableCell>
                <TableCell className="py-1.5 text-right">
                  <button
                    onClick={() => onRemoveAllocation(alloc.id)}
                    className="rounded p-1 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-red-600 dark:hover:bg-neutral-800"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ============================================================================
// Dialog Components
// ============================================================================
// Update the UnsaveChangesDialog to make it clear
function UnsaveChangesDialog({
  open,
  onClose,
  onDiscard,
  allocationCount,
}: {
  open: boolean;
  onClose: () => void;
  onDiscard: () => void;
  onContinue: () => void;
  allocationCount: number;
}) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={onClose}
    >
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-amber-500" />
            Discard Allocation Drafts?
          </AlertDialogTitle>

          <AlertDialogDescription className="space-y-2">
            <p>
              You have <strong>{allocationCount}</strong> unsaved allocation draft
              {allocationCount !== 1 ? 's' : ''}.
            </p>

            <p>
              Changing the examination session will remove all draft allocations for the current
              session.
            </p>

            <p className="text-xs text-neutral-500">This action cannot be undone.</p>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel>Continue Editing</AlertDialogCancel>

          <AlertDialogAction
            onClick={onDiscard}
            className="bg-red-600 hover:bg-red-700"
          >
            Discard Drafts
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ExistingAllocationsDialog({
  open,
  onClose,
  allocations,
  onNavigateToClear,
  onCancel,
}: {
  open: boolean;
  onClose: () => void;
  allocations: ExistingAllocation[];
  onNavigateToClear: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const totalStudents = allocations.reduce((sum, a) => sum + (a.assignedCount || 0), 0);

  const handleClearAndProceed = () => {
    onNavigateToClear();
    router.push('/exam-center/block-allocation/clear-allocation');
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={onClose}
    >
      <AlertDialogContent className="flex max-h-[90vh] max-w-4xl flex-col">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-amber-600">
            <AlertCircle className="h-5 w-5" />
            Existing Allocations Found
          </AlertDialogTitle>
        </AlertDialogHeader>

        <div className="flex flex-1 flex-col gap-4 overflow-hidden">
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            This date and session already has existing block allocations. You cannot create new
            allocations while existing ones exist.
          </p>

          <div className="flex-1 overflow-auto rounded-md border border-neutral-200">
            <Table>
              <TableHeader className="sticky top-0 bg-neutral-50">
                <TableRow>
                  <TableHead className="w-[100px] text-xs">Block</TableHead>
                  <TableHead className="w-[100px] text-xs">Scheme</TableHead>
                  <TableHead className="text-xs">Subject</TableHead>
                  <TableHead className="w-[80px] text-right text-xs">Students</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allocations.map((alloc, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="py-2 font-mono text-sm">
                      {alloc.blockName || 'Unknown'}
                    </TableCell>
                    <TableCell className="py-2 font-mono text-sm">{alloc.scheme}</TableCell>
                    <TableCell className="py-2 text-sm">
                      <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs dark:bg-neutral-800">
                        {alloc.subjectCode}
                      </code>
                    </TableCell>
                    <TableCell className="py-2 text-right text-sm font-medium">
                      {alloc.assignedCount || 0}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between border-t border-neutral-200 pt-3 dark:border-neutral-800">
            <p className="text-sm text-amber-600">
              You will be redirected to the allocation cleanup page to manage existing allocations.
            </p>
            <div className="rounded-md bg-neutral-100 px-3 py-1.5 dark:bg-neutral-800">
              <span className="text-sm font-medium">Total Students: </span>
              <span className="text-sm font-bold text-amber-600">{totalStudents}</span>
            </div>
          </div>
        </div>

        <AlertDialogFooter className="mt-4">
          <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleClearAndProceed}
            className="bg-amber-600 hover:bg-amber-700"
          >
            Go To Allocation Cleanup
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ============================================================================
// Main Page Component
// ============================================================================

export default function BlockAllocationPage() {
  const { examCenter, isLoading: userLoading } = useUserInfo();

  // Session state
  const [step, setStep] = useState<'select' | 'allocate'>('select');
  const [dates, setDates] = useState<Date[]>([]);
  const [sessions, setSessions] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedSession, setSelectedSession] = useState<string>('');
  const [isLoadingSession, setIsLoadingSession] = useState(false);

  // Data state
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [supervisors, setSupervisors] = useState<StaffMember[]>([]);
  const [timetable, setTimetable] = useState<TimetableEntry[]>([]);
  const [localAllocations, setLocalAllocations] = useState<LocalAllocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [blocksLoading, setBlocksLoading] = useState(true);
  const [supervisorsLoading, setSupervisorsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [filterBySupervision, setFilterBySupervision] = useState(false);
  const [supervisionOrderSupervisors, setSupervisionOrderSupervisors] = useState<Set<string>>(
    new Set(),
  );

  // Form state
  const [selectedScheme, setSelectedScheme] = useState('');
  const [selectedBlock, setSelectedBlock] = useState('');
  const [selectedSupervisor, setSelectedSupervisor] = useState('');
  const [candidateCount, setCandidateCount] = useState<number>(0);

  // Capacity tracking
  const [blockAllocatedCount, setBlockAllocatedCount] = useState<Map<string, number>>(new Map());
  const [blockRemainingCapacity, setBlockRemainingCapacity] = useState<Map<string, number>>(
    new Map(),
  );
  const [schemeRemainingStudents, setSchemeRemainingStudents] = useState<Map<string, number>>(
    new Map(),
  );
  const [allocatedSupervisorsSet, setAllocatedSupervisorsSet] = useState<Set<string>>(new Set());
  const [existingAllocationsByBlockScheme, setExistingAllocationsByBlockScheme] = useState<
    Set<string>
  >(new Set());

  // Dialog states
  const [showExistingAllocations, setShowExistingAllocations] = useState(false);
  const [existingAllocations, setExistingAllocations] = useState<ExistingAllocation[]>([]);
  const [showUnsaveDialog, setShowUnsaveDialog] = useState(false);
  const [, setPendingSessionChange] = useState<{ date: string; session: string } | null>(null);

  // Derived stats
  const totalBlocks = blocks.length;
  const totalCapacity = blocks.reduce((sum, b) => sum + b.strength, 0);
  const totalSubjects = timetable.length;
  const totalAllocated = localAllocations.reduce((sum, a) => sum + a.numberOfCandidates, 0);
  const remainingStudents = Array.from(schemeRemainingStudents.values()).reduce((a, b) => a + b, 0);

  // Update capacity maps when allocations change
  useEffect(() => {
    // Calculate allocated count per block (NOT remaining)
    const newBlockAllocatedCount = new Map<string, number>();
    for (const block of blocks) {
      newBlockAllocatedCount.set(block.location, 0);
    }

    for (const alloc of localAllocations) {
      newBlockAllocatedCount.set(
        alloc.blockName,
        (newBlockAllocatedCount.get(alloc.blockName) || 0) + alloc.numberOfCandidates,
      );
    }

    setBlockAllocatedCount(newBlockAllocatedCount);

    // Calculate remaining per block
    const newBlockRemaining = new Map(blocks.map((b) => [b.location, b.strength]));
    for (const alloc of localAllocations) {
      const blockRemaining = newBlockRemaining.get(alloc.blockName) || 0;
      newBlockRemaining.set(alloc.blockName, blockRemaining - alloc.numberOfCandidates);
    }
    setBlockRemainingCapacity(newBlockRemaining);

    // Calculate remaining students per scheme
    const newSchemeRemaining = new Map(timetable.map((t) => [t.scheme, t.totalStudents]));
    for (const alloc of localAllocations) {
      const schemeRemaining = newSchemeRemaining.get(alloc.scheme) || 0;
      newSchemeRemaining.set(alloc.scheme, schemeRemaining - alloc.numberOfCandidates);
    }
    setSchemeRemainingStudents(newSchemeRemaining);

    // Track allocated supervisors (one per block constraint)
    const newAllocatedSupervisors = new Set<string>();
    for (const alloc of localAllocations) {
      newAllocatedSupervisors.add(alloc.supervisor);
    }
    setAllocatedSupervisorsSet(newAllocatedSupervisors);

    // Track existing block-scheme pairs to prevent duplicates
    const newExistingPairs = new Set<string>();
    for (const alloc of localAllocations) {
      newExistingPairs.add(`${alloc.blockName}-${alloc.scheme}`);
    }
    setExistingAllocationsByBlockScheme(newExistingPairs);
  }, [localAllocations, blocks, timetable]);

  // Fetch supervision orders when toggle is ON
  useEffect(() => {
    const fetchSupervisionOrders = async () => {
      if (!filterBySupervision || !selectedDate || !selectedSession) {
        setSupervisionOrderSupervisors(new Set());
        return;
      }

      try {
        const result = await getOrders({
          orderType: 'supervision',
          date: new Date(selectedDate),
        });

        if (result && result.length > 0) {
          const supervisorSet = new Set<string>();
          result.forEach((order: any) => {
            if (order.session === selectedSession && order.staff?.uid) {
              supervisorSet.add(order.staff.uid);
            }
          });
          setSupervisionOrderSupervisors(supervisorSet);
        } else {
          setSupervisionOrderSupervisors(new Set());
        }
      } catch (error) {
        console.error('Error fetching supervision orders:', error);
        setSupervisionOrderSupervisors(new Set());
      }
    };

    fetchSupervisionOrders();
  }, [filterBySupervision, selectedDate, selectedSession]);
  const loadSessionData = async (date: string, session: string, fromLocal: boolean = false) => {
    setIsLoadingSession(true);
    try {
      const existingCheck = await checkExistingAllocations(new Date(date), session);

      if (!existingCheck.success) {
        toast.error(existingCheck.error || 'Failed to check existing allocations');
        return;
      }

      if (existingCheck.data.hasAllocations && !fromLocal) {
        setExistingAllocations(existingCheck.data.allocations);
        setShowExistingAllocations(true);
        setIsLoadingSession(false);
        return;
      }

      // Fetch timetable
      const timetableResult = await getTimetable({
        date: new Date(date),
        session: session as 'Morning' | 'Afternoon',
      });

      if (!timetableResult.success) {
        toast.error(timetableResult.error || 'Failed to load timetable');
        return;
      }

      const timetableData = timetableResult.data as TimetableEntry[];

      // ADD THIS CHECK
      if (!timetableData || timetableData.length === 0) {
        toast.error(
          'No timetable entries found for this date and session. Please upload a timetable first.',
        );
        setIsLoadingSession(false);
        return;
      }

      // ✅ FILTER OUT ENTRIES WITH ZERO STUDENTS
      const filteredTimetable = timetableData.filter((entry) => entry.totalStudents > 0);

      if (filteredTimetable.length === 0) {
        toast.error(
          'All timetable entries have zero students. Please check your seating chart data.',
        );
        setIsLoadingSession(false);
        return;
      }

      setTimetable(filteredTimetable);

      // Save to local storage for recovery
      setLocalTimetable({
        date,
        session,
        entries: filteredTimetable.map((entry) => ({
          scheme: entry.scheme,
          subjectCode: entry.subjectCode,
          subjectName: entry.subjectName,
          totalStudents: entry.totalStudents,
          timeSlot: entry.timeSlot,
          allocatedCount: 0,
        })),
      });

      // Load existing allocations or initialize empty
      if (fromLocal) {
        const savedAllocations = getLocalAllocations();
        setLocalAllocations(savedAllocations);
        const supervisorSet = new Set<string>();
        savedAllocations.forEach((a) => {
          if (a.supervisor) supervisorSet.add(a.supervisor);
        });
        setAllocatedSupervisorsSet(supervisorSet);
      } else {
        clearLocalAllocations();
        setLocalAllocations([]);
        setAllocatedSupervisorsSet(new Set());
      }

      // Save session context
      setSessionContext(date, session);
      setStep('allocate');
      setSelectedScheme('');
      setSelectedBlock('');
      setSelectedSupervisor('');
      setCandidateCount(0);
    } catch (err) {
      console.error('Error loading session:', err);
      toast.error('Failed to load data');
    } finally {
      setIsLoadingSession(false);
    }
  };

  // Load saved session on mount
  useEffect(() => {
    const savedContext = getSessionContext();
    if (savedContext && hasLocalData()) {
      setSelectedDate(savedContext.date);
      setSelectedSession(savedContext.session);
      loadSessionData(savedContext.date, savedContext.session, true);
    }
  }, []);

  // Load metadata
  useEffect(() => {
    const fetchMetadata = async () => {
      setLoading(true);
      const [datesResult, sessionsResult] = await Promise.all([
        getUniqueDates(),
        getUniqueSessions(),
      ]);
      if (datesResult.success && datesResult.data) setDates(datesResult.data);
      if (sessionsResult.success && sessionsResult.data) setSessions(sessionsResult.data);
      setLoading(false);
    };
    fetchMetadata();
  }, []);

  // Load blocks and supervisors
  useEffect(() => {
    const fetchBlocksAndSupervisors = async () => {
      setBlocksLoading(true);
      setSupervisorsLoading(true);
      const [blocksResult, supervisorsResult] = await Promise.all([getBlocks(), getSupervisors()]);
      if (blocksResult.success && blocksResult.data) setBlocks(blocksResult.data);
      if (supervisorsResult.success && supervisorsResult.data)
        setSupervisors(supervisorsResult.data);
      setBlocksLoading(false);
      setSupervisorsLoading(false);
    };
    fetchBlocksAndSupervisors();
  }, []);

  const handleNavigateToClear = () => {
    setShowExistingAllocations(false);
    clearLocalAllocations();
    clearLocalTimetable();
    clearSessionContext();
    setLocalAllocations([]);
  };

  const handleChangeSessionClick = () => {
    if (localAllocations.length > 0) {
      setShowUnsaveDialog(true);
    } else {
      // Clear everything even if no allocations (ensure clean state)
      clearLocalAllocations();
      clearLocalTimetable();
      clearSessionContext();
      setLocalAllocations([]);
      setSelectedScheme('');
      setSelectedBlock('');
      setSelectedSupervisor('');
      setCandidateCount(0);
      setStep('select');
    }
  };

  const handleDiscardAndChange = () => {
    // Clear ALL local storage data
    clearLocalAllocations();
    clearLocalTimetable();
    clearSessionContext();

    // Reset ALL local state
    setLocalAllocations([]);
    setSelectedScheme('');
    setSelectedBlock('');
    setSelectedSupervisor('');
    setCandidateCount(0);

    // Reset all maps and sets
    setBlockAllocatedCount(new Map());
    setBlockRemainingCapacity(new Map());
    setSchemeRemainingStudents(new Map());
    setAllocatedSupervisorsSet(new Set());
    setExistingAllocationsByBlockScheme(new Set());

    // Clear timetable
    setTimetable([]);

    // Close dialog
    setShowUnsaveDialog(false);
    setPendingSessionChange(null);

    // Go back to session selection
    setStep('select');

    toast.success('All local data cleared. You can now select a new session.');
  };

  const handleAssign = async () => {
    if (!selectedScheme || !selectedBlock || !selectedSupervisor || candidateCount <= 0) {
      toast.error('Please fill all fields');
      return;
    }

    // Check supervisor not already assigned to another block
    const blockSupervisor = localAllocations.find((a) => a.blockName === selectedBlock)?.supervisor;

    if (allocatedSupervisorsSet.has(selectedSupervisor) && blockSupervisor !== selectedSupervisor) {
      toast.error('Supervisor already assigned to another block in this session');
      return;
    }

    // Check scheme not already assigned to this block
    if (existingAllocationsByBlockScheme.has(`${selectedBlock}-${selectedScheme}`)) {
      toast.error(`Scheme ${selectedScheme} already assigned to block ${selectedBlock}`);
      return;
    }

    const schemeRemaining = schemeRemainingStudents.get(selectedScheme) || 0;
    const blockRemaining = blockRemainingCapacity.get(selectedBlock) || 0;
    const maxCandidates = Math.min(schemeRemaining, blockRemaining);

    if (candidateCount > maxCandidates) {
      toast.error(`Cannot assign more than ${maxCandidates} candidates`);
      return;
    }

    const selectedTimetableEntry = timetable.find((t) => t.scheme === selectedScheme);
    const schemeAllocations = localAllocations.filter((a) => a.scheme === selectedScheme);
    const totalAllocatedForScheme = schemeAllocations.reduce(
      (sum, a) => sum + a.numberOfCandidates,
      0,
    );
    const startFrom = totalAllocatedForScheme + 1;

    const newAllocation = addLocalAllocation({
      blockName: selectedBlock,
      scheme: selectedScheme,
      subCode: selectedTimetableEntry?.subjectCode || '',
      supervisor: selectedSupervisor,
      numberOfCandidates: candidateCount,
      startFrom: startFrom,
      timeslot: selectedTimetableEntry?.timeSlot || '',
    });

    setLocalAllocations((prev) => [...prev, newAllocation]);
    updateLocalTimetable(selectedScheme, candidateCount);

    setSelectedScheme('');
    setSelectedBlock('');
    setSelectedSupervisor('');
    setAllocatedSupervisorsSet((prev) => new Set(prev).add(selectedSupervisor));
    setCandidateCount(0);

    toast.success(`Assigned ${candidateCount} students to ${selectedBlock} (saved locally)`);
  };

  const handleRemoveAllocation = (id: string) => {
    const allocation = localAllocations.find((a) => a.id === id);
    if (!allocation) return;

    removeLocalAllocation(id);
    setLocalAllocations((prev) => prev.filter((a) => a.id !== id));
    updateLocalTimetable(allocation.scheme, -allocation.numberOfCandidates);

    // Check if supervisor still used
    const remainingAllocations = localAllocations.filter((a) => a.id !== id);
    const stillUsed = remainingAllocations.some((a) => a.supervisor === allocation.supervisor);
    if (!stillUsed) {
      setAllocatedSupervisorsSet((prev) => {
        const newSet = new Set(prev);
        newSet.delete(allocation.supervisor);
        return newSet;
      });
    }

    toast.info('Allocation removed from local changes');
  };

  const handleSubmitAll = async () => {
    if (localAllocations.length === 0) {
      toast.warning('No allocations to submit');
      return;
    }

    // Check if all students are allocated
    if (remainingStudents !== 0) {
      toast.error(`Cannot submit: ${remainingStudents} students still need allocation`);
      return;
    }

    // Check all allocations have supervisors
    const hasEmptySupervisor = localAllocations.some(
      (a) => !a.supervisor || a.supervisor.trim().length === 0,
    );
    if (hasEmptySupervisor) {
      toast.error('All allocations must have a supervisor assigned');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        date: new Date(selectedDate),
        session: selectedSession as 'Morning' | 'Afternoon',
        allocations: localAllocations.map((alloc) => ({
          blockName: alloc.blockName,
          scheme: alloc.scheme,
          subCode: alloc.subCode,
          supervisor: alloc.supervisor,
          numberOfCandidates: alloc.numberOfCandidates,
          startFrom: alloc.startFrom,
          timeslot: alloc.timeslot,
        })),
      };

      const result = await bulkCreateBlockConfigurations(payload);

      if (result.success) {
        toast.success(`Successfully submitted ${localAllocations.length} allocations`);
        clearLocalAllocations();
        clearLocalTimetable();
        clearSessionContext();
        setLocalAllocations([]);
        setStep('select');
      } else {
        if (result.existingCount) {
          toast.error(result.error || 'Existing allocations found');
          setExistingAllocations(result.existingAllocations || []);
          setShowExistingAllocations(true);
        } else {
          toast.error(result.error || 'Failed to submit allocations');
        }
      }
    } catch {
      toast.error('Failed to submit allocations');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClearAllLocal = () => {
    if (localAllocations.length === 0) return;
    clearLocalAllocations();
    clearLocalTimetable();
    setLocalAllocations([]);
    toast.info('All local changes cleared');
  };

  const isLoadingAny = userLoading || loading || blocksLoading || supervisorsLoading;

  if (isLoadingAny && step === 'select') {
    return (
      <div className="mx-auto max-w-[1400px] space-y-5 px-6 py-5">
        <PageHeader
          title="Block Allocation"
          description="Loading..."
          icon={Calendar}
        />
        <Skeleton className="mx-auto h-80 w-full max-w-xl rounded-lg" />
      </div>
    );
  }

  // Replace your existing step === 'select' return block with this:

  if (step === 'select') {
    return (
      <div className="mx-auto max-w-[1400px] space-y-5 px-6 py-5">
        <PageHeader
          title="Block Allocation"
          description="Select examination date and session to begin"
          icon={Calendar}
        />

        {/* Updated SessionSelector */}
        <SessionSelector
          availableDates={dates}
          availableSessions={sessions}
          onSessionSelect={async (session: SessionInfo) => {
            setSelectedDate(session.date);
            setSelectedSession(session.session);
            await loadSessionData(session.date, session.session, false);
          }}
          compact
          isLoading={isLoadingSession}
          title="Select Examination Session"
          description="Choose a date and session to begin block allocation"
        />

        <ExistingAllocationsDialog
          open={showExistingAllocations}
          onClose={() => setShowExistingAllocations(false)}
          allocations={existingAllocations}
          onNavigateToClear={handleNavigateToClear}
          onCancel={() => setStep('select')}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 px-6 py-5">
      <PageHeader
        title="Block Allocation"
        description={`${format(new Date(selectedDate), 'dd MMMM yyyy')} · ${selectedSession}`}
        icon={Calendar}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={handleChangeSessionClick}
            className="h-7 text-xs"
          >
            <ChevronLeft className="mr-1 h-3 w-3" />
            Change Session
          </Button>
        }
      />

      <MSBTEContextBar
        season={examCenter?.season as 'Summer' | 'Winter'}
        year={examCenter?.examYear!}
      />

      <BlockSummaryStrip
        totalBlocks={totalBlocks}
        totalCapacity={totalCapacity}
        totalSubjects={totalSubjects}
        totalAllocated={totalAllocated}
        remainingStudents={remainingStudents}
      />

      <AvailableBlocks
        blocks={blocks}
        isLoading={blocksLoading}
        selectedBlockId={selectedBlock}
        onSelectBlock={setSelectedBlock}
        allocatedBlocks={blockAllocatedCount}
        supervisorsAllocated={allocatedSupervisorsSet}
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.8fr_1fr]">
        <TimetableTable
          entries={timetable}
          date={format(new Date(selectedDate), 'dd MMM')}
          session={selectedSession}
          isLoading={isLoadingSession}
          selectedScheme={selectedScheme}
          onSelectScheme={(scheme) => {
            setSelectedScheme(scheme);
            setSelectedSupervisor('');
          }}
          remainingStudents={schemeRemainingStudents}
        />
        <AssignmentForm
          blocks={blocks}
          supervisors={supervisors}
          timetable={timetable}
          selectedScheme={selectedScheme}
          selectedBlock={selectedBlock}
          filterBySupervision={filterBySupervision}
          onFilterBySupervisionChange={setFilterBySupervision}
          hasSupervisionOrders={supervisionOrderSupervisors.size > 0}
          selectedSupervisor={selectedSupervisor}
          candidateCount={candidateCount}
          onSchemeChange={setSelectedScheme}
          onBlockChange={setSelectedBlock}
          localAllocations={localAllocations}
          onSupervisorChange={setSelectedSupervisor}
          onCandidateCountChange={setCandidateCount}
          supervisionOrderSupervisors={supervisionOrderSupervisors}
          onSubmit={handleAssign}
          isLoading={isLoadingSession}
          isSubmitting={isSubmitting}
          blockRemainingCapacity={blockRemainingCapacity}
          schemeRemainingStudents={schemeRemainingStudents}
          allocatedSupervisors={allocatedSupervisorsSet}
          existingAllocationsByBlockScheme={existingAllocationsByBlockScheme}
        />
      </div>

      <DistributionTable
        allocations={localAllocations}
        onUpdate={handleSubmitAll}
        onClear={handleClearAllLocal}
        onRemoveAllocation={handleRemoveAllocation}
        isLoading={isLoadingSession}
        remainingStudents={remainingStudents}
      />

      <UnsaveChangesDialog
        open={showUnsaveDialog}
        onClose={() => setShowUnsaveDialog(false)}
        onDiscard={handleDiscardAndChange}
        onContinue={() => {
          setShowUnsaveDialog(false);
          setPendingSessionChange(null);
        }}
        allocationCount={localAllocations.length}
      />
    </div>
  );
}
