'use client';

import { useEffect, useMemo, useState } from 'react';

import { format } from 'date-fns';
import {
  AlertCircle,
  AlertTriangle,
  Building,
  Calculator,
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  Grid2X2CheckIcon,
  LayoutDashboard,
  Loader2,
  RefreshCw,
  Save,
  Search,
  Settings2,
  Snowflake,
  SnowflakeIcon,
  Star,
  UserX,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import { cn } from '@/lib/utils';

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
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';

// ============================================================================
// Types
// ============================================================================

interface SchemeData {
  id: string;
  code: string;
  name: string;
  scheme: string;
  total: number;
  seats: number[];
  savedAbsent: number[];
  blockNo: string;
  blockLocation: string;
}

interface BlockData {
  blockNo: string;
  location: string;
  schemes: SchemeData[];
}

// ============================================================================
// Mock Data
// ============================================================================

const MOCK_BLOCKS: BlockData[] = [
  {
    blockNo: '1',
    location: 'Room 101',
    schemes: [
      {
        id: 's1',
        code: 'CSE101',
        name: 'Data Structures',
        scheme: 'CO-1-1',
        total: 42,
        seats: Array.from({ length: 42 }, (_, i) => i + 1),
        savedAbsent: [5, 12, 23, 34, 41],
        blockNo: '1',
        blockLocation: 'Room 101',
      },
      {
        id: 's2',
        code: 'CSE102',
        name: 'Algorithms',
        scheme: 'CO-1-2',
        total: 38,
        seats: Array.from({ length: 38 }, (_, i) => i + 1),
        savedAbsent: [8, 19, 27],
        blockNo: '1',
        blockLocation: 'Room 101',
      },
    ],
  },
  {
    blockNo: '2',
    location: 'Room 201',
    schemes: [
      {
        id: 's3',
        code: 'CSE201',
        name: 'Database Systems',
        scheme: 'CO-2-1',
        total: 45,
        seats: Array.from({ length: 45 }, (_, i) => i + 1),
        savedAbsent: [3, 14, 22, 36, 42],
        blockNo: '2',
        blockLocation: 'Room 201',
      },
      {
        id: 's4',
        code: 'CSE202',
        name: 'Operating Systems',
        scheme: 'CO-2-2',
        total: 40,
        seats: Array.from({ length: 40 }, (_, i) => i + 1),
        savedAbsent: [7, 18, 29],
        blockNo: '2',
        blockLocation: 'Room 201',
      },
    ],
  },
  {
    blockNo: '3',
    location: 'Room 301',
    schemes: [
      {
        id: 's5',
        code: 'MEC101',
        name: 'Thermodynamics',
        scheme: 'ME-1-1',
        total: 35,
        seats: Array.from({ length: 35 }, (_, i) => i + 1),
        savedAbsent: [4, 15, 26, 33],
        blockNo: '3',
        blockLocation: 'Room 301',
      },
    ],
  },
];

// ============================================================================
// Skeleton Components
// ============================================================================

const StatsSkeleton = () => (
  <div className="grid grid-cols-4 gap-3">
    {Array.from({ length: 4 }).map((_, i) => (
      <Skeleton
        key={i}
        className="h-[72px] w-full rounded-lg"
      />
    ))}
  </div>
);

const BlockNavSkeleton = () => (
  <div className="space-y-2">
    {Array.from({ length: 3 }).map((_, i) => (
      <Skeleton
        key={i}
        className="h-8 w-full rounded-md"
      />
    ))}
  </div>
);

const SeatGridSkeleton = () => (
  <div className="grid grid-cols-10 gap-1.5">
    {Array.from({ length: 30 }).map((_, i) => (
      <Skeleton
        key={i}
        className="aspect-square w-full rounded-md"
      />
    ))}
  </div>
);

// ============================================================================
// Stats Cards
// ============================================================================

interface StatsData {
  total: number;
  absent: number;
  present: number;
  rate: number;
}

const CompactStats = ({ stats, loading }: { stats: StatsData | null; loading?: boolean }) => {
  if (loading) return <StatsSkeleton />;
  if (!stats) return null;

  const items = [
    { value: stats.total, label: 'Total', color: 'bg-emerald-500' },
    { value: stats.absent, label: 'Absent', color: 'bg-rose-500' },
    { value: stats.present, label: 'Present', color: 'bg-emerald-500' },
    { value: stats.rate, label: 'Rate', suffix: '%', color: 'bg-emerald-500' },
  ];

  return (
    <div className="grid grid-cols-4 gap-3">
      {items.map((item) => (
        <div
          key={item.label}
          className="relative overflow-hidden rounded-lg border border-neutral-200/60 bg-white p-3 shadow-sm transition-shadow hover:shadow-md dark:border-neutral-800/60 dark:bg-neutral-950"
        >
          <div className={cn('absolute top-0 right-0 left-0 h-0.5 rounded-t-lg', item.color)} />
          <p
            className={cn(
              'mt-1 text-2xl font-semibold tracking-tight',
              item.label === 'Absent' && 'text-rose-600',
            )}
          >
            {item.value}
            {item.suffix || ''}
          </p>
          <p className="mt-0.5 text-[10px] font-medium tracking-wider text-neutral-400 uppercase">
            {item.label}
          </p>
        </div>
      ))}
    </div>
  );
};

// ============================================================================
// Block Navigation
// ============================================================================

interface BlockNavProps {
  blocks: BlockData[];
  expandedBlock: string | null;
  selectedSchemeId: string | null;
  onToggleBlock: (blockNo: string) => void;
  onSelectScheme: (schemeId: string) => void;
  loading?: boolean;
}

function BlockNav({
  blocks,
  expandedBlock,
  selectedSchemeId,
  onToggleBlock,
  onSelectScheme,
  loading,
}: BlockNavProps) {
  if (loading) return <BlockNavSkeleton />;

  return (
    <div className="space-y-0.5">
      {blocks.map((block) => {
        const isExpanded = expandedBlock === block.blockNo;
        const totalAbsent = block.schemes.reduce((sum, s) => sum + s.savedAbsent.length, 0);
        const totalStudents = block.schemes.reduce((sum, s) => sum + s.total, 0);

        return (
          <div key={block.blockNo}>
            <button
              onClick={() => onToggleBlock(block.blockNo)}
              className={cn(
                'flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-sm transition-all duration-200',
                isExpanded
                  ? 'bg-emerald-50/80 text-emerald-700 shadow-sm dark:bg-emerald-950/30'
                  : 'hover:bg-neutral-100/70 dark:hover:bg-neutral-800/70',
              )}
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-medium">Block {block.blockNo}</span>
                <span className="text-xs text-neutral-400">{block.location}</span>
              </div>
              {totalAbsent > 0 && (
                <Badge
                  variant="destructive"
                  className="h-5 px-1.5 text-[10px] font-medium"
                >
                  {totalAbsent}/{totalStudents}
                </Badge>
              )}
              <ChevronRight
                className={cn(
                  'h-3.5 w-3.5 text-neutral-400 transition-transform duration-300',
                  isExpanded && 'rotate-90',
                )}
              />
            </button>

            {isExpanded && (
              <div className="ml-4 space-y-0.5 border-l-2 border-emerald-200/60 pl-1 dark:border-emerald-800/30">
                {block.schemes.map((scheme) => {
                  const isSelected = selectedSchemeId === scheme.id;
                  const absentCount = scheme.savedAbsent.length;
                  const percent = scheme.total > 0 ? (absentCount / scheme.total) * 100 : 0;

                  return (
                    <button
                      key={scheme.id}
                      onClick={() => onSelectScheme(scheme.id)}
                      className={cn(
                        'relative my-1 w-full rounded-md px-2.5 py-2 text-left text-sm transition-all duration-200',
                        isSelected
                          ? 'bg-emerald-100/60 text-emerald-800 shadow-sm dark:bg-emerald-900/30'
                          : 'hover:bg-neutral-100/60 dark:hover:bg-neutral-800/60',
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <code className="rounded bg-white/70 px-1.5 py-0.5 font-mono text-xs dark:bg-neutral-800/70">
                              {scheme.code}
                            </code>
                            <span className="truncate text-xs font-medium">{scheme.name}</span>
                          </div>
                          <div className="mt-0.5 text-[10px] text-neutral-400">{scheme.scheme}</div>
                        </div>
                        {absentCount > 0 && (
                          <div className="shrink-0 text-right">
                            <span className="text-xs font-semibold text-rose-600">
                              {absentCount}
                            </span>
                            <span className="text-[10px] text-neutral-400">/{scheme.total}</span>
                          </div>
                        )}
                      </div>
                      {percent > 0 && (
                        <div className="mt-1.5 h-0.5 w-full overflow-hidden rounded-full bg-neutral-200/70 dark:bg-neutral-700/70">
                          <div
                            className="h-full rounded-full bg-rose-500 transition-all duration-700"
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
  markedCount: number;
}

function SubjectHeader({ scheme, markedCount }: SubjectHeaderProps) {
  if (!scheme) return null;

  const pct = scheme.total > 0 ? Math.round((markedCount / scheme.total) * 100) : 0;

  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-neutral-200/60 bg-neutral-50/50 p-3 dark:border-neutral-800/60 dark:bg-neutral-900/30">
      <div>
        <div className="flex flex-wrap items-center gap-1.5">
          <code className="rounded-lg bg-white px-2 py-0.5 font-mono text-sm font-semibold shadow-sm dark:bg-neutral-800">
            {scheme.code}
          </code>
          <span className="text-sm font-semibold">{scheme.name}</span>
          <Badge
            variant="outline"
            className="border-neutral-300 font-mono text-[10px] dark:border-neutral-700"
          >
            {scheme.scheme}
          </Badge>
        </div>
        <div className="mt-1 text-xs text-neutral-400">
          Block {scheme.blockNo} · {scheme.blockLocation} · {scheme.total} students
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-sm font-semibold text-rose-600">{markedCount} absent</div>
        <div className="text-[10px] text-neutral-400">{pct}%</div>
      </div>
    </div>
  );
}

// ============================================================================
// Seat Grid
// ============================================================================

interface SeatGridProps {
  scheme: SchemeData | null;
  markedSeats: number[];
  onToggleSeat: (seatNo: number) => void;
  loading?: boolean;
}

function SeatGrid({ scheme, markedSeats, onToggleSeat, loading }: SeatGridProps) {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredSeats = useMemo(() => {
    if (!scheme) return [];
    if (!searchTerm) return scheme.seats;
    return scheme.seats.filter((seat) => seat.toString().includes(searchTerm));
  }, [scheme, searchTerm]);

  const handleMarkAll = () => {
    if (!scheme) return;
    const eligible = scheme.seats.filter((n) => !markedSeats.includes(n));
    if (eligible.length === 0) {
      toast.warning('No seats to mark');
      return;
    }
    eligible.forEach((n) => onToggleSeat(n));
    toast.success(`Marked ${eligible.length} students absent`);
  };

  const handleClearAll = () => {
    if (!scheme) return;

    // Get seats that were newly marked (not saved)
    const newlyMarked = markedSeats.filter((seat) => !scheme.savedAbsent.includes(seat));

    if (newlyMarked.length === 0) {
      toast.warning('No newly marked seats to clear');
      return;
    }

    // Remove only newly marked seats
    newlyMarked.forEach((seat) => onToggleSeat(seat));
    toast.success(`Cleared ${newlyMarked.length} newly marked seats`);
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <Skeleton className="h-8 w-36" />
          <div className="flex gap-1">
            <Skeleton className="h-7 w-16" />
            <Skeleton className="h-7 w-16" />
            <Skeleton className="h-7 w-24" />
          </div>
        </div>
        <SeatGridSkeleton />
      </div>
    );
  }

  if (!scheme) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-neutral-200 dark:border-neutral-800">
        <p className="text-sm text-neutral-400">Select a subject from the left panel</p>
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
            placeholder="Search seat…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-8 w-36 border-neutral-200/80 pl-8 text-sm transition-all focus:border-emerald-300 focus:ring-emerald-300/30"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute top-1/2 right-2.5 -translate-y-1/2 text-neutral-400 transition-colors hover:text-neutral-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={handleMarkAll}
            className="h-7 border-neutral-200 px-3 text-xs transition-all hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
          >
            <Check className="mr-1 h-3 w-3" />
            Mark All
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleClearAll}
            className="h-7 border-neutral-200 px-3 text-xs transition-all hover:border-neutral-400 hover:bg-neutral-50"
          >
            <X className="mr-1 h-3 w-3" />
            Clear All
          </Button>
        </div>
      </div>

      <div className="max-h-[300px] overflow-y-auto rounded-lg border border-neutral-200/60 bg-white/70 p-3 backdrop-blur-sm dark:border-neutral-800/60 dark:bg-neutral-950/70">
        <div className="grid grid-cols-10 gap-1.5">
          {filteredSeats.map((seatNo, idx) => {
            const isMarked = markedSeats.includes(seatNo);

            return (
              <button
                key={seatNo}
                onClick={() => onToggleSeat(seatNo)}
                style={{ animationDelay: `${Math.min(idx * 8, 200)}ms` }}
                className={cn(
                  'relative aspect-square w-full cursor-pointer rounded-md border font-mono text-xs font-medium transition-all duration-150',
                  isMarked
                    ? 'border-rose-400 bg-rose-50 text-rose-700 shadow-[0_0_0_1px_rgba(244,63,94,0.2)] hover:bg-rose-100/80'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:scale-[1.04] hover:bg-emerald-100/80 hover:shadow-md',
                  !isMarked && 'hover:scale-[1.04] hover:shadow-md',
                )}
              >
                {seatNo}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-sm" />
            <span className="text-neutral-500">Present</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full bg-rose-500 shadow-sm" />
            <span className="text-neutral-500">Absent</span>
          </div>
        </div>
        <p className="font-medium text-neutral-400">
          <span className="font-semibold text-rose-600">{markedSeats.length}</span> of{' '}
          {scheme.total} marked absent
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
}

function ConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  scheme,
  count,
  isSubmitting,
}: ConfirmDialogProps) {
  if (!scheme) return null;

  const pct = scheme.total > 0 ? Math.round((count / scheme.total) * 100) : 0;
  const isHigh = pct > 30;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent className="max-w-sm border-0 bg-white/90 shadow-2xl backdrop-blur-xl dark:bg-neutral-950/90">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            {isHigh ? (
              <AlertCircle className="h-4 w-4 text-amber-500" />
            ) : (
              <Check className="h-4 w-4 text-emerald-500" />
            )}
            Confirm Absent Marking
          </DialogTitle>
          <DialogDescription className="text-xs">
            {scheme.code} — {scheme.name}
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
          <div className="rounded-xl bg-neutral-50/80 p-4 backdrop-blur-sm dark:bg-neutral-900/80">
            <div className="flex justify-between border-b border-neutral-200/60 py-1.5 text-sm dark:border-neutral-800/60">
              <span className="text-neutral-500">Total Students</span>
              <span className="font-semibold">{scheme.total}</span>
            </div>
            <div className="flex justify-between border-b border-neutral-200/60 py-1.5 text-sm dark:border-neutral-800/60">
              <span className="text-neutral-500">Marking Absent</span>
              <span className="font-semibold text-rose-600">{count}</span>
            </div>
            <div className="flex justify-between py-1.5 text-sm">
              <span className="text-neutral-500">Remaining</span>
              <span className="font-semibold text-emerald-600">{scheme.total - count}</span>
            </div>
          </div>

          {isHigh && (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-amber-600">
              <AlertCircle className="h-3 w-3" />
              High absentee rate ({pct}%) — please verify
            </p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={onConfirm}
            disabled={isSubmitting}
            variant="destructive"
            className="shadow-lg shadow-rose-500/20 transition-shadow hover:shadow-rose-500/30"
          >
            {isSubmitting && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
            Confirm {count} absent
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Sidebar Navigation
// ============================================================================

const SIDEBAR_ITEMS = [
  { icon: LayoutDashboard, label: 'Dashboard' },
  { icon: Settings2, label: 'Exam setup' },
  { icon: Grid2X2CheckIcon, label: 'Block allocation' },
  { separator: true },
  { icon: Calculator, label: 'QP accounting' },
  { icon: UserX, label: 'Absent students', active: true, badge: true },
  { icon: AlertTriangle, label: 'Copy case' },
  { separator: true },
  { icon: FileText, label: 'MSBTE formats' },
  { icon: Star, label: 'TestForge reports' },
];

function Sidebar() {
  return (
    <div className="flex flex-col gap-0.5 border-r border-neutral-200/60 bg-neutral-50/50 p-3 dark:border-neutral-800/60 dark:bg-neutral-900/30">
      <div className="mb-3 flex items-center gap-2 px-2">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-600">
          <span className="text-[10px] font-semibold text-white">TF</span>
        </div>
        <span className="text-sm font-semibold">TestForge</span>
      </div>

      {SIDEBAR_ITEMS.map((item, idx) => {
        if (item.separator) {
          return (
            <div
              key={`sep-${idx}`}
              className="my-2 px-2"
            >
              <span className="text-[9px] font-semibold tracking-wider text-neutral-400 uppercase">
                {idx === 3 ? 'Exam Day' : 'Reports'}
              </span>
            </div>
          );
        }

        const Icon = item.icon;

        return (
          <button
            key={item.label}
            className={cn(
              'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-xs font-medium transition-all duration-200',
              item.active
                ? 'bg-emerald-50 text-emerald-700 shadow-sm dark:bg-emerald-950/30'
                : 'text-neutral-500 hover:bg-neutral-100/70 hover:text-neutral-800 dark:hover:bg-neutral-800/50',
            )}
          >
            {Icon ? <Icon className="h-4 w-4" /> : <span className="inline-block h-4 w-4" />}
            <span>{item.label}</span>
            {item.badge && (
              <span className="ml-auto rounded-full bg-rose-500 px-1.5 py-0.5 text-[9px] font-semibold text-white">
                20
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export default function ExamDayAbsentMockup() {
  // State
  const [blocks, setBlocks] = useState<BlockData[]>(MOCK_BLOCKS);
  const [expandedBlock, setExpandedBlock] = useState<string>('1');
  const [selectedSchemeId, setSelectedSchemeId] = useState<string>('s1');
  const [markedSeats, setMarkedSeats] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Derived
  const selectedScheme = useMemo(() => {
    for (const block of blocks) {
      for (const scheme of block.schemes) {
        if (scheme.id === selectedSchemeId) return scheme;
      }
    }
    return null;
  }, [blocks, selectedSchemeId]);

  const stats = useMemo(() => {
    let total = 0,
      absent = 0;
    for (const block of blocks) {
      for (const scheme of block.schemes) {
        total += scheme.total;
        absent += scheme.savedAbsent.length;
      }
    }
    return {
      total,
      absent,
      present: total - absent,
      rate: total > 0 ? Math.round((absent / total) * 100) : 0,
    };
  }, [blocks]);

  // Initialize marked seats from selected scheme
  useEffect(() => {
    if (selectedScheme) {
      setMarkedSeats([...selectedScheme.savedAbsent]);
    }
  }, [selectedScheme]);

  // Simulate loading
  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 700);
    return () => clearTimeout(timer);
  }, []);

  // Handlers
  const handleToggleBlock = (blockNo: string) => {
    setExpandedBlock(expandedBlock === blockNo ? '' : blockNo);
  };

  const handleSelectScheme = (schemeId: string) => {
    setSelectedSchemeId(schemeId);
  };

  const handleToggleSeat = (seatNo: number) => {
    setMarkedSeats((prev) =>
      prev.includes(seatNo) ? prev.filter((s) => s !== seatNo) : [...prev, seatNo],
    );
  };

  const handleSave = () => {
    if (!selectedScheme) return;
    setSaving(true);

    setTimeout(() => {
      // Update the saved absent in the scheme
      const updatedBlocks = blocks.map((block) => ({
        ...block,
        schemes: block.schemes.map((scheme) =>
          scheme.id === selectedScheme.id ? { ...scheme, savedAbsent: [...markedSeats] } : scheme,
        ),
      }));
      setBlocks(updatedBlocks);

      toast.success(
        `${markedSeats.length} student${markedSeats.length !== 1 ? 's' : ''} marked absent`,
      );
      setDialogOpen(false);
      setSaving(false);
    }, 900);
  };

  const handleRefresh = () => {
    setLoading(true);
    toast.info('Refreshing data…');
    setTimeout(() => {
      setLoading(false);
      toast.success('Data refreshed');
    }, 700);
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border border-neutral-200/60 bg-white/80 shadow-md backdrop-blur-sm dark:border-neutral-800/60 dark:bg-neutral-950/80">
      {/* Browser Chrome */}
      <div className="flex items-center gap-1.5 border-b border-neutral-200/60 px-4 py-2.5 dark:border-neutral-800/60">
        <span className="h-2.5 w-2.5 rounded-full bg-rose-400 shadow-sm" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-400 shadow-sm" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-sm" />
        <span className="ml-3 font-mono text-xs text-neutral-400">
          {process.env.NEXT_PUBLIC_APP_URL}/exam-center/exam-day/absent
        </span>
      </div>

      {/* App Layout */}
      <div className="grid min-h-[660px] grid-cols-[200px_1fr]">
        <Sidebar />

        {/* Main Content */}
        <div className="flex flex-col gap-4 p-5">
          {/* Page Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-md border border-emerald-100 bg-emerald-50 dark:border-emerald-800/50 dark:bg-emerald-950/30">
                <UserX className="h-4 w-4 text-emerald-600" />
              </div>
              <div>
                <h1 className="text-lg font-semibold tracking-tight">Absent Students</h1>
                <div className="flex items-center gap-2 text-xs text-neutral-400">
                  <span>{format(new Date(), 'dd MMM yyyy')}</span>
                  <span>·</span>
                  <span>Morning session</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={loading}
                className="h-7 gap-1.5 border-neutral-200 text-xs hover:border-neutral-300"
              >
                <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
                Refresh
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1 border-neutral-200 text-xs hover:border-neutral-300"
              >
                <ChevronLeft className="h-3 w-3" />
                Change session
              </Button>
            </div>
          </div>

          {/* Context Bar */}
          <div className="flex items-center gap-2 rounded-md border border-neutral-200/60 bg-neutral-50/50 px-3 py-1.5 text-xs dark:border-neutral-800/60 dark:bg-neutral-900/30">
            <span className="flex items-center gap-1.5 rounded-full bg-cyan-50 px-2 py-0.5 text-cyan-700 dark:bg-cyan-950/30 dark:text-cyan-400">
              <SnowflakeIcon className="h-3 w-3" />
              Winter 2026
            </span>
            <span className="text-neutral-300">·</span>
            <span className="flex items-center gap-1.5 rounded-full bg-neutral-100 px-2 py-0.5 dark:bg-neutral-800">
              <Building className="h-3 w-3" />
              MMCOE Exam Center
            </span>
            <span className="text-neutral-300">·</span>
            <span className="text-neutral-500">3 blocks allocated</span>
          </div>

          {/* Stats - Real-time */}
          <CompactStats
            stats={stats}
            loading={loading}
          />

          {/* Content Grid */}
          <div className="grid flex-1 grid-cols-[260px_1fr] gap-4">
            {/* Block Navigation */}
            <div className="space-y-1.5">
              <Label className="text-[10px] font-semibold tracking-wider text-neutral-400 uppercase">
                Blocks & Subjects
              </Label>
              <ScrollArea className="h-[340px] rounded-md border border-neutral-200/60 bg-white/50 p-1.5 dark:border-neutral-800/60 dark:bg-neutral-900/20">
                <BlockNav
                  blocks={blocks}
                  expandedBlock={expandedBlock}
                  selectedSchemeId={selectedSchemeId}
                  onToggleBlock={handleToggleBlock}
                  onSelectScheme={handleSelectScheme}
                  loading={loading}
                />
              </ScrollArea>
            </div>

            {/* Seat Panel */}
            <div className="flex flex-col gap-3">
              <SubjectHeader
                scheme={selectedScheme}
                markedCount={markedSeats.length}
              />

              <SeatGrid
                scheme={selectedScheme}
                markedSeats={markedSeats}
                onToggleSeat={handleToggleSeat}
                loading={loading}
              />

              <div className="flex justify-end">
                <Button
                  onClick={() => setDialogOpen(true)}
                  disabled={markedSeats.length === 0 || saving}
                  className="h-8 gap-1.5 bg-gradient-to-r from-emerald-500 to-emerald-600 text-xs text-white shadow-md shadow-emerald-500/25 transition-all hover:scale-[1.02] hover:shadow-emerald-500/40 active:scale-[0.98]"
                >
                  {saving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                  Save Absent List
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Dialog */}
      <ConfirmDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onConfirm={handleSave}
        scheme={selectedScheme}
        count={markedSeats.length}
        isSubmitting={saving}
      />
    </div>
  );
}
