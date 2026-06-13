// modules/exam-day-edits/absent-marking.tsx
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { format } from 'date-fns';
import { AlertCircle, CheckCircle2, ChevronLeft, Copy, Loader2, RefreshCw, Save, Search, UserX } from 'lucide-react';
import { toast } from 'sonner';

import { MSBTEContextBar } from '@/components/layout/msbte-context-bar';
import { PageHeader } from '@/components/layout/page-layout';
import { SessionSelector } from '@/components/shared/date-selector';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useUserInfo } from '@/hooks/useUserInfo';
import { getAllocationsByDateSession } from '@/lib/actions/allocation';
import {
  getTimetableEntries,
  getUniqueDates,
  getUniqueSessions,
  markAbsent,
  markCopyCase,
} from '@/lib/actions/timetable';
import { cn } from '@/lib/utils';

// ============================================================================
// Configuration
// ============================================================================

interface ExamDayEditConfig {
  mode: 'absent' | 'copycase';
  title: string;
  description: string;
  icon: typeof UserX | typeof Copy;
  buttonColor: string;
  badgeColor: string;
  textColor: string;
  action: typeof markAbsent | typeof markCopyCase;
}

const MODE_CONFIGS = {
  absent: {
    mode: 'absent' as const,
    title: 'Mark Absent Students',
    description: 'Record student absences by selecting date, block, and subject',
    icon: UserX,
    buttonColor: 'bg-rose-600 hover:bg-rose-700',
    badgeColor: 'bg-rose-500',
    textColor: 'text-rose-600',
    action: markAbsent,
  },
  copycase: {
    mode: 'copycase' as const,
    title: 'Mark Copy Case Students',
    description: 'Record students involved in copying cases',
    icon: Copy,
    buttonColor: 'bg-amber-600 hover:bg-amber-700',
    badgeColor: 'bg-amber-500',
    textColor: 'text-amber-600',
    action: markCopyCase,
  },
};

type Mode = 'absent' | 'copycase';

// ============================================================================
// Types
// ============================================================================

interface SchemeData {
  id: string;
  scheme: string;
  subjectCode: string;
  subjectName: string;
  totalStudents: number;
  seatNumbers: number[];
  absentNumbers: number[];
  cpsNumbers: number[];
  blockNo: string;
  blockLocation: string;
}

interface BlockData {
  blockNo: string;
  location: string;
  schemes: SchemeData[];
}

// ============================================================================
// Helper Functions
// ============================================================================

function validateMutualExclusion(
  mode: 'absent' | 'copycase',
  seatNo: number,
  absentSeats: number[],
  copyCaseSeats: number[]
): { isValid: boolean; message?: string } {
  if (mode === 'absent' && copyCaseSeats.includes(seatNo)) {
    return {
      isValid: false,
      message: `Student ${seatNo} is already marked as copy case. Clear copy case first.`,
    };
  }
  if (mode === 'copycase' && absentSeats.includes(seatNo)) {
    return {
      isValid: false,
      message: `Student ${seatNo} is already marked as absent. Clear absent first.`,
    };
  }
  return { isValid: true };
}

// ============================================================================
// Stats Cards
// ============================================================================

interface StatsData {
  totalStudents: number;
  totalMarked: number;
  totalRemaining: number;
  markedPercentage: number;
}

const CompactStats = ({ stats, CURRENT_CONFIG }: { stats: StatsData | null; CURRENT_CONFIG: ExamDayEditConfig }) => {
  if (!stats) return null;

  const label = CURRENT_CONFIG.mode === 'absent' ? 'Absent' : 'Copy Case';
  const color = CURRENT_CONFIG.textColor;

  return (
    <div className="mb-4 grid grid-cols-4 gap-3">
      <div className="rounded-lg border border-neutral-200 bg-white p-2 dark:border-neutral-800 dark:bg-neutral-950">
        <p className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">
          {stats.totalStudents.toLocaleString()}
        </p>
        <p className="text-[10px] text-neutral-500">Total</p>
      </div>
      <div className="rounded-lg border border-neutral-200 bg-white p-2 dark:border-neutral-800 dark:bg-neutral-950">
        <p className={cn('text-xl font-semibold', color)}>{stats.totalMarked.toLocaleString()}</p>
        <p className="text-[10px] text-neutral-500">{label}</p>
      </div>
      <div className="rounded-lg border border-neutral-200 bg-white p-2 dark:border-neutral-800 dark:bg-neutral-950">
        <p className="text-xl font-semibold text-emerald-600 dark:text-emerald-400">
          {stats.totalRemaining.toLocaleString()}
        </p>
        <p className="text-[10px] text-neutral-500">Remaining</p>
      </div>
      <div className="rounded-lg border border-neutral-200 bg-white p-2 dark:border-neutral-800 dark:bg-neutral-950">
        <p className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">
          {stats.markedPercentage.toFixed(0)}%
        </p>
        <p className="text-[10px] text-neutral-500">Rate</p>
      </div>
    </div>
  );
};

// ============================================================================
// Block Navigation
// ============================================================================

interface BlockNavProps {
  blocks: BlockData[];
  selectedBlockNo: string | null;
  selectedSchemeId: string | null;
  onSelectBlock: (blockNo: string | null) => void;
  onSelectScheme: (schemeId: string) => void;
  isLoading?: boolean;
  CURRENT_CONFIG: ExamDayEditConfig;
}

function BlockNav({
  blocks,
  selectedBlockNo,
  selectedSchemeId,
  onSelectBlock,
  onSelectScheme,
  isLoading,
  CURRENT_CONFIG,
}: BlockNavProps) {
  const getMarkedCount = (scheme: SchemeData) => {
    return CURRENT_CONFIG.mode === 'absent' ? scheme.absentNumbers.length : scheme.cpsNumbers.length;
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  if (blocks.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-200 p-4 text-center dark:border-neutral-800">
        <p className="text-xs text-neutral-500">No blocks allocated</p>
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {blocks.map(block => {
        const isBlockExpanded = selectedBlockNo === block.blockNo;
        const totalMarked = block.schemes.reduce((sum, s) => sum + getMarkedCount(s), 0);
        const totalStudents = block.schemes.reduce((sum, s) => sum + s.totalStudents, 0);

        return (
          <div key={block.blockNo}>
            <button
              onClick={() => onSelectBlock(isBlockExpanded ? null : block.blockNo)}
              className={cn(
                'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                isBlockExpanded ? 'bg-neutral-100 dark:bg-neutral-800' : 'hover:bg-neutral-50 dark:hover:bg-neutral-900'
              )}
            >
              <div className="flex items-center gap-2">
                <ChevronLeft className={cn('h-3 w-3 transition-transform', isBlockExpanded && '-rotate-90')} />
                <span className="font-mono text-sm">Block {block.blockNo}</span>
                <span className="text-xs text-neutral-400">{block.location}</span>
              </div>
              {totalMarked > 0 && (
                <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">
                  {totalMarked}/{totalStudents}
                </Badge>
              )}
            </button>

            {isBlockExpanded && (
              <div className="ml-6 space-y-0.5 border-l border-neutral-200 pl-2 dark:border-neutral-800">
                {block.schemes.map(scheme => {
                  const isSelected = selectedSchemeId === scheme.id;
                  const markedCount = getMarkedCount(scheme);
                  const percent = scheme.totalStudents > 0 ? (markedCount / scheme.totalStudents) * 100 : 0;

                  return (
                    <button
                      key={scheme.id}
                      onClick={() => onSelectScheme(scheme.id)}
                      className={cn(
                        'w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                        isSelected
                          ? 'bg-neutral-100 dark:bg-neutral-800'
                          : 'hover:bg-neutral-50 dark:hover:bg-neutral-900'
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <code className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-xs dark:bg-neutral-800">
                              {scheme.subjectCode}
                            </code>
                            <span className="truncate text-xs">{scheme.subjectName}</span>
                          </div>
                          <div className="mt-0.5 text-[10px] text-neutral-400">{scheme.scheme}</div>
                        </div>
                        {markedCount > 0 && (
                          <div className="shrink-0 text-right">
                            <span className={cn('text-xs font-medium', CURRENT_CONFIG.textColor)}>{markedCount}</span>
                            <span className="text-[10px] text-neutral-400">/{scheme.totalStudents}</span>
                          </div>
                        )}
                      </div>
                      {percent > 0 && (
                        <div className="mt-1 h-0.5 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                          <div
                            className={cn('h-full rounded-full', CURRENT_CONFIG.badgeColor)}
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
// Subject Header
// ============================================================================

interface SubjectHeaderProps {
  scheme: SchemeData | null;
  CURRENT_CONFIG: ExamDayEditConfig;
}

function SubjectHeader({ scheme, CURRENT_CONFIG }: SubjectHeaderProps) {
  if (!scheme) return null;

  const markedCount = CURRENT_CONFIG.mode === 'absent' ? scheme.absentNumbers.length : scheme.cpsNumbers.length;
  const label = CURRENT_CONFIG.mode === 'absent' ? 'absent' : 'copy case';
  const color = CURRENT_CONFIG.textColor;

  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <code className="rounded bg-white px-1.5 py-0.5 font-mono text-sm dark:bg-neutral-800">
              {scheme.subjectCode}
            </code>
            <span className="font-medium">{scheme.subjectName}</span>
            <Badge variant="outline" className="font-mono text-[10px]">
              {scheme.scheme}
            </Badge>
          </div>
          <div className="mt-1 text-xs text-neutral-500">
            Block {scheme.blockNo} • {scheme.blockLocation} • {scheme.totalStudents} students
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className={cn('text-sm font-medium', color)}>
              {markedCount} {label}
            </div>
            <div className="text-[10px] text-neutral-500">
              {scheme.totalStudents > 0 ? `${((markedCount / scheme.totalStudents) * 100).toFixed(0)}%` : '0%'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Seat Grid with Mutual Exclusion
// ============================================================================

interface SeatGridProps {
  seatNumbers: number[];
  absentSeats: number[];
  copyCaseSeats: number[];
  markedSeats: number[];
  onSeatToggle: (seatNo: number) => void;
  isLoading?: boolean;
  CURRENT_CONFIG: ExamDayEditConfig;
}

function SeatGrid({
  seatNumbers,
  absentSeats,
  copyCaseSeats,
  markedSeats,
  onSeatToggle,
  isLoading,
  CURRENT_CONFIG,
}: SeatGridProps) {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredSeats = useMemo(() => {
    if (!searchTerm) return seatNumbers;
    return seatNumbers.filter(seat => seat.toString().includes(searchTerm));
  }, [seatNumbers, searchTerm]);

  const getSeatStatus = (seatNo: number) => {
    const isAbsent = absentSeats.includes(seatNo);
    const isCopyCase = copyCaseSeats.includes(seatNo);

    if (isAbsent) return 'absent';
    if (isCopyCase) return 'copycase';
    return 'present';
  };

  const isSeatSelectable = (seatNo: number) => {
    const status = getSeatStatus(seatNo);
    if (CURRENT_CONFIG.mode === 'absent') {
      return status !== 'copycase';
    } else {
      return status !== 'absent';
    }
  };

  const handleSeatClick = (seatNo: number) => {
    // Validate mutual exclusion
    const validation = validateMutualExclusion(CURRENT_CONFIG.mode, seatNo, absentSeats, copyCaseSeats);

    if (!validation.isValid) {
      toast.warning(validation.message);
      return;
    }

    if (!isSeatSelectable(seatNo)) {
      const status = getSeatStatus(seatNo);
      if (status === 'copycase' && CURRENT_CONFIG.mode === 'absent') {
        toast.warning('Student already marked as copy case. Clear copy case first.');
      } else if (status === 'absent' && CURRENT_CONFIG.mode === 'copycase') {
        toast.warning('Cannot mark copy case for absent student.');
      }
      return;
    }
    onSeatToggle(seatNo);
  };

  const handleBulkMark = () => {
    const eligibleSeats = seatNumbers.filter(seat => {
      if (CURRENT_CONFIG.mode === 'absent') {
        return !absentSeats.includes(seat) && !copyCaseSeats.includes(seat) && !markedSeats.includes(seat);
      } else {
        return !copyCaseSeats.includes(seat) && !absentSeats.includes(seat) && !markedSeats.includes(seat);
      }
    });

    if (eligibleSeats.length === 0) {
      toast.warning(
        CURRENT_CONFIG.mode === 'absent'
          ? 'No eligible students to mark absent'
          : 'No eligible students to mark copy case'
      );
      return;
    }

    eligibleSeats.forEach(seat => {
      if (!markedSeats.includes(seat)) {
        onSeatToggle(seat);
      }
    });

    toast.success(`Marked ${eligibleSeats.length} student${eligibleSeats.length !== 1 ? 's' : ''}`);
  };

  const handleClearAll = () => {
    const toClear = [...markedSeats];
    toClear.forEach(seat => {
      if (markedSeats.includes(seat)) onSeatToggle(seat);
    });
    toast.success(`Cleared ${toClear.length} student${toClear.length !== 1 ? 's' : ''}`);
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-6 gap-1 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12">
        {Array.from({ length: 24 }).map((_, i) => (
          <Skeleton key={i} className="aspect-square w-full rounded-md" />
        ))}
      </div>
    );
  }

  if (seatNumbers.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-neutral-200 dark:border-neutral-800">
        <p className="text-sm text-neutral-500">No seat numbers available</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="relative">
          <Search className="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
          <Input
            type="text"
            placeholder="Search seat..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="h-8 w-48 pl-8 text-sm"
          />
        </div>
        <div className="flex gap-1">
          <Button variant="outline" size="sm" onClick={handleBulkMark} className="h-7 px-2 text-xs">
            Mark All
          </Button>
          <Button variant="outline" size="sm" onClick={handleClearAll} className="h-7 px-2 text-xs">
            Clear All
          </Button>
        </div>
      </div>

      <div className="max-h-[450px] overflow-y-auto rounded-lg border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-950">
        <div className="grid grid-cols-6 gap-1 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12">
          {filteredSeats.map(seatNo => {
            const status = getSeatStatus(seatNo);
            const isCurrentlyMarked = markedSeats.includes(seatNo);
            const isSelectable = isSeatSelectable(seatNo);

            let className =
              'relative aspect-square w-full rounded-md border text-sm font-mono transition-all cursor-pointer';

            if (!isSelectable) {
              className = cn(
                className,
                'cursor-not-allowed opacity-60',
                status === 'absent' ? 'border-rose-300 bg-rose-50' : 'border-amber-300 bg-amber-50'
              );
            } else if (isCurrentlyMarked) {
              className = cn(
                className,
                CURRENT_CONFIG.mode === 'absent'
                  ? 'border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-400'
                  : 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400'
              );
            } else {
              className = cn(
                className,
                'border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300 hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-300'
              );
            }

            let checkmarkColor = CURRENT_CONFIG.badgeColor;
            if (status === 'absent') checkmarkColor = 'bg-rose-500';
            if (status === 'copycase') checkmarkColor = 'bg-amber-500';

            return (
              <button
                key={seatNo}
                onClick={() => handleSeatClick(seatNo)}
                disabled={!isSelectable}
                className={className}
              >
                {seatNo}
                {(status === 'absent' || status === 'copycase') && (
                  <div
                    className={cn(
                      'absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full text-[9px] text-white',
                      checkmarkColor
                    )}
                  >
                    ✓
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            <span className="text-neutral-500">Present</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full bg-amber-500" />
            <span className="text-neutral-500">Copy Case</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full bg-rose-500" />
            <span className="text-neutral-500">Absent</span>
          </div>
        </div>
        <p className="text-neutral-400">
          {markedSeats.length} of {seatNumbers.length} marked{' '}
          {CURRENT_CONFIG.mode === 'absent' ? 'absent' : 'copy case'}
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// Confirmation Dialog
// ============================================================================

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  scheme: SchemeData | null;
  count: number;
  isSubmitting: boolean;
  CURRENT_CONFIG: ExamDayEditConfig;
}

function ConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  scheme,
  count,
  isSubmitting,
  CURRENT_CONFIG,
}: ConfirmDialogProps) {
  if (!scheme) return null;

  const percentage = scheme.totalStudents > 0 ? (count / scheme.totalStudents) * 100 : 0;
  const isHigh = percentage > 30;
  const label = CURRENT_CONFIG.mode === 'absent' ? 'absent' : 'copy case';
  const color = CURRENT_CONFIG.textColor;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            {isHigh && CURRENT_CONFIG.mode === 'absent' ? (
              <AlertCircle className="h-4 w-4 text-amber-500" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            )}
            Confirm {label === 'absent' ? 'Absent' : 'Copy Case'} Marking
          </DialogTitle>
          <DialogDescription className="text-xs">
            {scheme.subjectCode} - {scheme.subjectName}
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
          <div className="rounded-md bg-neutral-50 p-3 dark:bg-neutral-900">
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500">Total:</span>
              <span className="font-medium">{scheme.totalStudents}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500">Marking {label}:</span>
              <span className={cn('font-medium', color)}>{count}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500">Remaining:</span>
              <span className="font-medium text-emerald-600">{scheme.totalStudents - count}</span>
            </div>
          </div>

          {isHigh && CURRENT_CONFIG.mode === 'absent' && (
            <p className="mt-2 text-xs text-amber-600">High absentee rate ({percentage.toFixed(0)}%)</p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={onConfirm}
            disabled={isSubmitting}
            variant={CURRENT_CONFIG.mode === 'absent' ? 'destructive' : 'default'}
            className={CURRENT_CONFIG.mode === 'copycase' ? 'bg-amber-600 hover:bg-amber-700' : ''}
          >
            {isSubmitting && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
            Confirm {count} {label}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Helper Functions
// ============================================================================

async function fetchMarkedData(
  schemes: SchemeData[],
  date: Date,
  session: string,
  CURRENT_CONFIG: ExamDayEditConfig
): Promise<Map<string, { absent: number[]; cps: number[] }>> {
  const markedMap = new Map<string, { absent: number[]; cps: number[] }>();

  for (const scheme of schemes) {
    try {
      const result = await getTimetableEntries({
        date,
        session: session as 'Morning' | 'Afternoon',
        subjectCode: scheme.subjectCode,
        scheme: scheme.scheme,
      });

      if (result.success && result.data && result.data.length > 0) {
        const entry = result.data[0];
        markedMap.set(scheme.id, {
          absent: entry.absentNumbers || [],
          cps: entry.cpsStudents || [],
        });
      } else {
        markedMap.set(scheme.id, { absent: [], cps: [] });
      }
    } catch {
      markedMap.set(scheme.id, { absent: [], cps: [] });
    }
  }

  return markedMap;
}

function groupByBlock(schemes: SchemeData[]): BlockData[] {
  const blockMap = new Map<string, BlockData>();

  for (const scheme of schemes) {
    if (!blockMap.has(scheme.blockNo)) {
      blockMap.set(scheme.blockNo, {
        blockNo: scheme.blockNo,
        location: scheme.blockLocation,
        schemes: [],
      });
    }
    blockMap.get(scheme.blockNo)!.schemes.push(scheme);
  }

  return Array.from(blockMap.values());
}

function calculateStats(schemes: SchemeData[], CURRENT_CONFIG: ExamDayEditConfig): StatsData {
  let totalStudents = 0;
  let totalMarked = 0;

  for (const scheme of schemes) {
    totalStudents += scheme.totalStudents;
    totalMarked += CURRENT_CONFIG.mode === 'absent' ? scheme.absentNumbers.length : scheme.cpsNumbers.length;
  }

  return {
    totalStudents,
    totalMarked,
    totalRemaining: totalStudents - totalMarked,
    markedPercentage: totalStudents > 0 ? (totalMarked / totalStudents) * 100 : 0,
  };
}

// ============================================================================
// Main Component
// ============================================================================

export default function ExamDayEditsPage({ mode = 'absent' }: { mode?: Mode }) {
  const { examCenter, isLoading: userLoading } = useUserInfo();

  const CURRENT_CONFIG = MODE_CONFIGS[mode];
  const [step, setStep] = useState<'select' | 'mark'>('select');
  const [dates, setDates] = useState<Date[]>([]);
  const [sessions, setSessions] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedSession, setSelectedSession] = useState('');

  const [schemes, setSchemes] = useState<SchemeData[]>([]);
  const [selectedBlockNo, setSelectedBlockNo] = useState<string | null>(null);
  const [selectedScheme, setSelectedScheme] = useState<SchemeData | null>(null);
  const [markedSeats, setMarkedSeats] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Fetch available dates and sessions
  useEffect(() => {
    const fetchMeta = async () => {
      const [datesRes, sessionsRes] = await Promise.all([getUniqueDates(), getUniqueSessions()]);
      if (datesRes.success && datesRes.data) setDates(datesRes.data);
      if (sessionsRes.success && sessionsRes.data) setSessions(sessionsRes.data);
    };
    fetchMeta();
  }, []);

  const loadData = useCallback(
    async (date: string, session: string) => {
      setLoading(true);
      try {
        const result = await getAllocationsByDateSession(new Date(date), session);

        if (!result.success || !result.data || result.data.length === 0) {
          toast.warning('No block allocations found for this session');
          setSchemes([]);
          setStats(null);
          return;
        }

        const rawSchemes: SchemeData[] = result.data.map(alloc => ({
          id: `${alloc.subjectCode}_${alloc.scheme}`,
          scheme: alloc.scheme,
          subjectCode: alloc.subjectCode,
          subjectName: alloc.subjectName,
          totalStudents: alloc.assignedCount || 0,
          seatNumbers: alloc.seatNumbers || [],
          absentNumbers: [],
          cpsNumbers: [],
          blockNo: alloc.blockNo || '?',
          blockLocation: alloc.location || '?',
        }));

        const markedMap = await fetchMarkedData(rawSchemes, new Date(date), session, CURRENT_CONFIG);

        const schemesWithData = rawSchemes.map(scheme => ({
          ...scheme,
          absentNumbers: markedMap.get(scheme.id)?.absent || [],
          cpsNumbers: markedMap.get(scheme.id)?.cps || [],
        }));

        setSchemes(schemesWithData);
        setStats(calculateStats(schemesWithData, CURRENT_CONFIG));
        setSelectedBlockNo(null);
        setSelectedScheme(null);
        setMarkedSeats([]);
      } catch (error) {
        console.error('Error loading data:', error);
        toast.error('Failed to load data');
      } finally {
        setLoading(false);
      }
    },
    [CURRENT_CONFIG]
  );

  const handleSessionSelect = async (session: { date: string; session: 'Morning' | 'Afternoon' }) => {
    setSelectedDate(session.date);
    setSelectedSession(session.session);
    await loadData(session.date, session.session);
    setStep('mark');
  };

  const handleSelectScheme = (schemeId: string) => {
    const scheme = schemes.find(s => s.id === schemeId);
    if (scheme) {
      setSelectedScheme(scheme);
      const currentMarkedSeats = CURRENT_CONFIG.mode === 'absent' ? scheme.absentNumbers : scheme.cpsNumbers;
      setMarkedSeats([...currentMarkedSeats]);
    }
  };

  const handleSeatToggle = (seatNo: number) => {
    if (!selectedScheme) return;

    // Validate mutual exclusion before toggling
    const validation = validateMutualExclusion(
      CURRENT_CONFIG.mode,
      seatNo,
      selectedScheme.absentNumbers,
      selectedScheme.cpsNumbers
    );

    if (!validation.isValid) {
      toast.warning(validation.message);
      return;
    }

    setMarkedSeats(prev => (prev.includes(seatNo) ? prev.filter(s => s !== seatNo) : [...prev, seatNo]));
  };

  const handleSave = async () => {
    if (!selectedScheme) return;

    // Final validation before save
    const conflicts = [];
    if (CURRENT_CONFIG.mode === 'absent') {
      for (const seat of markedSeats) {
        if (selectedScheme.cpsNumbers.includes(seat)) {
          conflicts.push(seat);
        }
      }
    } else {
      for (const seat of markedSeats) {
        if (selectedScheme.absentNumbers.includes(seat)) {
          conflicts.push(seat);
        }
      }
    }

    if (conflicts.length > 0) {
      toast.error(
        `Cannot save: ${conflicts.length} student${conflicts.length !== 1 ? 's' : ''} (${conflicts.join(', ')}) ${
          CURRENT_CONFIG.mode === 'absent' ? 'already marked as copy case' : 'already marked as absent'
        }`
      );
      return;
    }

    setSaving(true);
    try {
      let result;

      if (CURRENT_CONFIG.mode === 'absent') {
        result = await markAbsent({
          subjectCode: selectedScheme.subjectCode,
          scheme: selectedScheme.scheme,
          date: new Date(selectedDate),
          session: selectedSession as 'Morning' | 'Afternoon',
          absentNumbers: markedSeats,
        });
      } else {
        result = await markCopyCase({
          subjectCode: selectedScheme.subjectCode,
          scheme: selectedScheme.scheme,
          date: new Date(selectedDate),
          session: selectedSession as 'Morning' | 'Afternoon',
          cpsStudents: markedSeats,
        });
      }

      if (result.success) {
        // Update local state
        const updatedSchemes = schemes.map(s => {
          if (s.id === selectedScheme.id) {
            if (CURRENT_CONFIG.mode === 'absent') {
              return { ...s, absentNumbers: markedSeats };
            } else {
              return { ...s, cpsNumbers: markedSeats };
            }
          }
          return s;
        });
        setSchemes(updatedSchemes);
        setStats(calculateStats(updatedSchemes, CURRENT_CONFIG));

        // Update the selected scheme with the new data
        const updatedSelectedScheme =
          CURRENT_CONFIG.mode === 'absent'
            ? { ...selectedScheme, absentNumbers: markedSeats }
            : { ...selectedScheme, cpsNumbers: markedSeats };
        setSelectedScheme(updatedSelectedScheme);

        toast.success(
          markedSeats.length
            ? `${markedSeats.length} student${markedSeats.length !== 1 ? 's' : ''} marked ${CURRENT_CONFIG.mode === 'absent' ? 'absent' : 'copy case'}`
            : `${CURRENT_CONFIG.mode === 'absent' ? 'Absent' : 'Copy case'} list cleared`
        );
        setDialogOpen(false);
      } else {
        const errorMsg = typeof result.error === 'string' ? result.error : 'Failed to save';
        toast.error(errorMsg);
      }
    } catch (error) {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleRefresh = () => {
    if (selectedDate && selectedSession) {
      loadData(selectedDate, selectedSession);
    }
  };

  const blocks = useMemo(() => groupByBlock(schemes), [schemes]);

  if (userLoading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
        <div className="grid grid-cols-[280px_1fr] gap-6">
          <Skeleton className="h-96 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    );
  }

  if (step === 'select') {
    return (
      <div className="mx-auto max-w-[1400px] space-y-5 px-6 py-5">
        <PageHeader title={CURRENT_CONFIG.title} description={CURRENT_CONFIG.description} icon={CURRENT_CONFIG.icon} />
        <SessionSelector
          availableDates={dates}
          availableSessions={sessions}
          onSessionSelect={handleSessionSelect}
          compact
          isLoading={loading}
          title="Select Session"
          description="Choose a date and session"
        />
      </div>
    );
  }

  return (
    <div className="space-y-4 px-6 py-5">
      <PageHeader
        title={CURRENT_CONFIG.title}
        description={`${format(new Date(selectedDate), 'dd MMM yyyy')} · ${selectedSession}`}
        icon={CURRENT_CONFIG.icon}
        actions={
          <div className="flex items-center gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm" onClick={handleRefresh} className="h-7 gap-1 text-xs">
                    <RefreshCw className="h-3 w-3" />
                    Refresh
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Reload data</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Button variant="ghost" size="sm" onClick={() => setStep('select')} className="h-7 gap-1 text-xs">
              <ChevronLeft className="h-3 w-3" />
              Change Session
            </Button>
          </div>
        }
      />

      <MSBTEContextBar
        season={examCenter?.season as 'Summer' | 'Winter'}
        year={examCenter?.examYear || new Date().getFullYear()}
        compact
      />

      <CompactStats stats={stats} CURRENT_CONFIG={CURRENT_CONFIG} />

      <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
        <div className="space-y-2">
          <Label className="text-xs font-medium text-neutral-500">BLOCKS & SUBJECTS</Label>
          <ScrollArea className="h-[calc(100vh-420px)] rounded-md border border-neutral-200 p-2 dark:border-neutral-800">
            <BlockNav
              blocks={blocks}
              selectedBlockNo={selectedBlockNo}
              selectedSchemeId={selectedScheme?.id || null}
              onSelectBlock={setSelectedBlockNo}
              onSelectScheme={handleSelectScheme}
              isLoading={loading}
              CURRENT_CONFIG={CURRENT_CONFIG}
            />
          </ScrollArea>
        </div>

        <div className="space-y-3">
          {selectedScheme ? (
            <>
              <SubjectHeader scheme={selectedScheme} CURRENT_CONFIG={CURRENT_CONFIG} />
              <SeatGrid
                seatNumbers={selectedScheme.seatNumbers}
                absentSeats={selectedScheme.absentNumbers}
                copyCaseSeats={selectedScheme.cpsNumbers}
                markedSeats={markedSeats}
                onSeatToggle={handleSeatToggle}
                CURRENT_CONFIG={CURRENT_CONFIG}
                isLoading={loading}
              />
              <div className="flex justify-end pt-2">
                <Button
                  onClick={() => setDialogOpen(true)}
                  disabled={saving}
                  className={cn('h-8 gap-1.5', CURRENT_CONFIG.buttonColor)}
                  size="sm"
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Save {CURRENT_CONFIG.mode === 'absent' ? 'Absent' : 'Copy Case'} List
                </Button>
              </div>
            </>
          ) : (
            <Card className="flex h-[calc(100vh-420px)] items-center justify-center border-dashed">
              <CardContent className="text-center">
                <CURRENT_CONFIG.icon className="mx-auto h-8 w-8 text-neutral-400" />
                <p className="mt-2 text-sm text-neutral-500">Select a subject from the left panel</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onConfirm={handleSave}
        scheme={selectedScheme}
        CURRENT_CONFIG={CURRENT_CONFIG}
        count={markedSeats.length}
        isSubmitting={saving}
      />
    </div>
  );
}
