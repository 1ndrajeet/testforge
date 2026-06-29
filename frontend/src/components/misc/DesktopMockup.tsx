'use client';

import { useMemo, useState } from 'react';

import { format } from 'date-fns';
import { ChevronLeft, Loader2, RefreshCw, Save, Search, UserX } from 'lucide-react';
import { toast } from 'sonner';

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
import { cn } from '@/lib/utils';

// ============================================================================
// Mock Data
// ============================================================================

const MOCK_SCHEMES = [
  {
    id: 'scheme-1',
    scheme: 'CO-1-1',
    subjectCode: 'CSE101',
    subjectName: 'Data Structures',
    totalStudents: 42,
    seatNumbers: Array.from({ length: 42 }, (_, i) => i + 1),
    absentNumbers: [5, 12, 23, 34, 41],
    blockNo: '1',
    blockLocation: 'Room 101',
  },
  {
    id: 'scheme-2',
    scheme: 'CO-1-2',
    subjectCode: 'CSE102',
    subjectName: 'Algorithms',
    totalStudents: 38,
    seatNumbers: Array.from({ length: 38 }, (_, i) => i + 1),
    absentNumbers: [8, 19, 27],
    blockNo: '1',
    blockLocation: 'Room 101',
  },
  {
    id: 'scheme-3',
    scheme: 'CO-2-1',
    subjectCode: 'CSE201',
    subjectName: 'Database Systems',
    totalStudents: 45,
    seatNumbers: Array.from({ length: 45 }, (_, i) => i + 1),
    absentNumbers: [3, 14, 22, 36, 42],
    blockNo: '2',
    blockLocation: 'Room 201',
  },
  {
    id: 'scheme-4',
    scheme: 'CO-2-2',
    subjectCode: 'CSE202',
    subjectName: 'Operating Systems',
    totalStudents: 40,
    seatNumbers: Array.from({ length: 40 }, (_, i) => i + 1),
    absentNumbers: [7, 18, 29],
    blockNo: '2',
    blockLocation: 'Room 201',
  },
  {
    id: 'scheme-5',
    scheme: 'ME-1-1',
    subjectCode: 'MEC101',
    subjectName: 'Thermodynamics',
    totalStudents: 35,
    seatNumbers: Array.from({ length: 35 }, (_, i) => i + 1),
    absentNumbers: [4, 15, 26, 33],
    blockNo: '3',
    blockLocation: 'Room 301',
  },
];

const MOCK_BLOCKS = [
  { blockNo: '1', location: 'Room 101', schemes: MOCK_SCHEMES.filter(s => s.blockNo === '1') },
  { blockNo: '2', location: 'Room 201', schemes: MOCK_SCHEMES.filter(s => s.blockNo === '2') },
  { blockNo: '3', location: 'Room 301', schemes: MOCK_SCHEMES.filter(s => s.blockNo === '3') },
];

// ============================================================================
// Stats Cards
// ============================================================================

const CompactStats = ({
  stats,
}: {
  stats: { totalStudents: number; totalMarked: number; totalRemaining: number; markedPercentage: number } | null;
}) => {
  if (!stats) return null;

  return (
    <div className="mb-4 grid grid-cols-4 gap-3">
      <div className="rounded-lg border border-neutral-200 bg-white p-2 dark:border-neutral-800 dark:bg-neutral-950">
        <p className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">
          {stats.totalStudents.toLocaleString()}
        </p>
        <p className="text-[10px] text-neutral-500">Total</p>
      </div>
      <div className="rounded-lg border border-neutral-200 bg-white p-2 dark:border-neutral-800 dark:bg-neutral-950">
        <p className="text-xl font-semibold text-rose-600 dark:text-rose-400">{stats.totalMarked.toLocaleString()}</p>
        <p className="text-[10px] text-neutral-500">Absent</p>
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

function BlockNav({
  blocks,
  selectedBlockNo,
  selectedSchemeId,
  onSelectBlock,
  onSelectScheme,
}: {
  blocks: typeof MOCK_BLOCKS;
  selectedBlockNo: string | null;
  selectedSchemeId: string | null;
  onSelectBlock: (blockNo: string | null) => void;
  onSelectScheme: (schemeId: string) => void;
}) {
  const getAbsentCount = (scheme: (typeof MOCK_SCHEMES)[0]) => scheme.absentNumbers.length;

  return (
    <div className="space-y-0.5">
      {blocks.map(block => {
        const isBlockExpanded = selectedBlockNo === block.blockNo;
        const totalAbsent = block.schemes.reduce((sum, s) => sum + getAbsentCount(s), 0);
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
              {totalAbsent > 0 && (
                <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">
                  {totalAbsent}/{totalStudents}
                </Badge>
              )}
            </button>

            {isBlockExpanded && (
              <div className="ml-6 space-y-0.5 border-l border-neutral-200 pl-2 dark:border-neutral-800">
                {block.schemes.map(scheme => {
                  const isSelected = selectedSchemeId === scheme.id;
                  const absentCount = getAbsentCount(scheme);
                  const percent = scheme.totalStudents > 0 ? (absentCount / scheme.totalStudents) * 100 : 0;

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
                        {absentCount > 0 && (
                          <div className="shrink-0 text-right">
                            <span className="text-xs font-medium text-rose-600">{absentCount}</span>
                            <span className="text-[10px] text-neutral-400">/{scheme.totalStudents}</span>
                          </div>
                        )}
                      </div>
                      {percent > 0 && (
                        <div className="mt-1 h-0.5 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                          <div className="h-full rounded-full bg-rose-500" style={{ width: `${percent}%` }} />
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
// Seat Grid - Visual Only (No Checks, Just Colors)
// ============================================================================

function SeatGrid({
  seatNumbers,
  absentSeats,
  markedSeats,
  onSeatToggle,
}: {
  seatNumbers: number[];
  absentSeats: number[];
  markedSeats: number[];
  onSeatToggle: (seatNo: number) => void;
}) {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredSeats = useMemo(() => {
    if (!searchTerm) return seatNumbers;
    return seatNumbers.filter(seat => seat.toString().includes(searchTerm));
  }, [seatNumbers, searchTerm]);

  const handleBulkMark = () => {
    const eligibleSeats = seatNumbers.filter(seat => !absentSeats.includes(seat) && !markedSeats.includes(seat));
    if (eligibleSeats.length === 0) {
      toast.warning('No eligible students to mark absent');
      return;
    }
    eligibleSeats.forEach(seat => {
      if (!markedSeats.includes(seat)) onSeatToggle(seat);
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
            const isAbsent = absentSeats.includes(seatNo);
            const isMarked = markedSeats.includes(seatNo);

            let className =
              'relative aspect-square w-full rounded-md border text-sm font-mono transition-all cursor-pointer';

            if (isAbsent) {
              className = cn(
                className,
                'border-rose-500 bg-rose-100 text-rose-700 dark:border-rose-700 dark:bg-rose-950/30 dark:text-rose-400'
              );
            } else if (isMarked) {
              className = cn(
                className,
                'border-rose-400 bg-rose-50 text-rose-600 hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/20 dark:text-rose-400'
              );
            } else {
              className = cn(
                className,
                'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-400'
              );
            }

            return (
              <button key={seatNo} onClick={() => !isAbsent && onSeatToggle(seatNo)} className={className}>
                {seatNo}
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
            <div className="h-2.5 w-2.5 rounded-full bg-rose-500" />
            <span className="text-neutral-500">Absent</span>
          </div>
        </div>
        <p className="text-neutral-400">
          {markedSeats.length} of {seatNumbers.length} marked absent
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// Confirmation Dialog
// ============================================================================

function ConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  scheme,
  count,
  isSubmitting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  scheme: (typeof MOCK_SCHEMES)[0] | null;
  count: number;
  isSubmitting: boolean;
}) {
  if (!scheme) return null;

  const percentage = scheme.totalStudents > 0 ? (count / scheme.totalStudents) * 100 : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">Confirm Absent Marking</DialogTitle>
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
              <span className="text-neutral-500">Marking absent:</span>
              <span className="font-medium text-rose-600">{count}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500">Remaining:</span>
              <span className="font-medium text-emerald-600">{scheme.totalStudents - count}</span>
            </div>
          </div>

          {percentage > 30 && (
            <p className="mt-2 text-xs text-amber-600">High absentee rate ({percentage.toFixed(0)}%)</p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={onConfirm} disabled={isSubmitting} variant="destructive">
            {isSubmitting && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
            Confirm {count} absent
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Main DashboardMockup Component
// ============================================================================

export default function DashboardMockup() {
  // State
  const [schemes] = useState(MOCK_SCHEMES);
  const [blocks] = useState(MOCK_BLOCKS);
  const [selectedBlockNo, setSelectedBlockNo] = useState<string | null>('1');
  const [selectedSchemeId, setSelectedSchemeId] = useState<string | null>('scheme-1');
  const [markedSeats, setMarkedSeats] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const selectedScheme = schemes.find(s => s.id === selectedSchemeId) || null;

  // Calculate stats
  const stats = useMemo(() => {
    let totalStudents = 0;
    let totalMarked = 0;
    for (const scheme of schemes) {
      totalStudents += scheme.totalStudents;
      totalMarked += scheme.absentNumbers.length;
    }
    return {
      totalStudents,
      totalMarked,
      totalRemaining: totalStudents - totalMarked,
      markedPercentage: totalStudents > 0 ? (totalMarked / totalStudents) * 100 : 0,
    };
  }, [schemes]);

  // Handlers
  const handleSelectScheme = (schemeId: string) => {
    const scheme = schemes.find(s => s.id === schemeId);
    if (scheme) {
      setSelectedSchemeId(schemeId);
      setMarkedSeats([...scheme.absentNumbers]);
    }
  };

  const handleSeatToggle = (seatNo: number) => {
    setMarkedSeats(prev => (prev.includes(seatNo) ? prev.filter(s => s !== seatNo) : [...prev, seatNo]));
  };

  const handleSave = () => {
    if (!selectedScheme) return;
    setSaving(true);
    setTimeout(() => {
      const schemeIndex = schemes.findIndex(s => s.id === selectedScheme.id);
      if (schemeIndex !== -1) {
        schemes[schemeIndex].absentNumbers = [...markedSeats];
      }
      toast.success(`${markedSeats.length} student${markedSeats.length !== 1 ? 's' : ''} marked absent`);
      setDialogOpen(false);
      setSaving(false);
    }, 1000);
  };

  const handleRefresh = () => {
    toast.success('Data refreshed');
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-3 shadow-lg sm:p-4">
      {/* Browser chrome */}
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
        <span className="h-2.5 w-2.5 rounded-full bg-yellow-300" />
        <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
        <span className="ml-3 text-xs text-gray-500">
          {process.env.NEXT_PUBLIC_HOSTED_URL}/exam-center/exam-day/absent
        </span>
      </div>

      {/* Dashboard grid */}
      <div className="grid gap-3 rounded-xl bg-gray-50 p-3 sm:p-4 md:grid-cols-12">
        {/* Sidebar */}
        <div className="space-y-2 md:col-span-2">
          {['Overview', 'Absent', 'Blocks', 'Staff', 'Reports', 'Inventory'].map((s, i) => (
            <div
              key={s}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${
                i === 1 ? 'bg-emerald-600 text-white' : 'text-gray-500'
              }`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
              {s}
            </div>
          ))}
        </div>

        {/* Main content */}
        <div className="space-y-3 md:col-span-10">
          {/* Stats cards */}
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { l: 'Students allocated', v: '1,284' },
              { l: 'Formats ready', v: '22 / 22' },
              { l: 'Staff assigned', v: '84' },
            ].map(s => (
              <div key={s.l} className="rounded-xl border border-gray-200 bg-white p-3">
                <div className="text-[10px] tracking-wider text-gray-500 uppercase">{s.l}</div>
                <div className="mt-1 text-xl font-bold">{s.v}</div>
              </div>
            ))}
          </div>

          {/* Absent Students Section */}
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <UserX className="h-4 w-4 text-rose-600" />
                <div className="text-sm font-semibold">Absent Students</div>
                <Badge variant="outline" className="text-[10px]">
                  {format(new Date(), 'dd MMM yyyy')} · Morning
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleRefresh} className="h-7 gap-1 text-xs">
                  <RefreshCw className="h-3 w-3" />
                  Refresh
                </Button>
                <Button
                  size="sm"
                  onClick={() => setDialogOpen(true)}
                  disabled={markedSeats.length === 0 || saving}
                  className="h-7 gap-1 bg-rose-600 text-xs hover:bg-rose-700"
                >
                  {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                  Save {markedSeats.length > 0 && `(${markedSeats.length})`}
                </Button>
              </div>
            </div>

            <CompactStats stats={stats} />

            <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
              {/* Left: Blocks navigation */}
              <div className="space-y-2">
                <Label className="text-xs font-medium text-neutral-500">BLOCKS & SUBJECTS</Label>
                <ScrollArea className="h-[320px] rounded-md border border-neutral-200 p-2 dark:border-neutral-800">
                  <BlockNav
                    blocks={blocks}
                    selectedBlockNo={selectedBlockNo}
                    selectedSchemeId={selectedSchemeId}
                    onSelectBlock={setSelectedBlockNo}
                    onSelectScheme={handleSelectScheme}
                  />
                </ScrollArea>
              </div>

              {/* Right: Seat grid */}
              <div className="space-y-3">
                {selectedScheme && (
                  <>
                    <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-900">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <code className="rounded bg-white px-1.5 py-0.5 font-mono text-sm dark:bg-neutral-800">
                              {selectedScheme.subjectCode}
                            </code>
                            <span className="font-medium">{selectedScheme.subjectName}</span>
                            <Badge variant="outline" className="font-mono text-[10px]">
                              {selectedScheme.scheme}
                            </Badge>
                          </div>
                          <div className="mt-1 text-xs text-neutral-500">
                            Block {selectedScheme.blockNo} • {selectedScheme.blockLocation} •{' '}
                            {selectedScheme.totalStudents} students
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <div className="text-sm font-medium text-rose-600">{markedSeats.length} absent</div>
                            <div className="text-[10px] text-neutral-500">
                              {selectedScheme.totalStudents > 0
                                ? `${((markedSeats.length / selectedScheme.totalStudents) * 100).toFixed(0)}%`
                                : '0%'}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <SeatGrid
                      seatNumbers={selectedScheme.seatNumbers}
                      absentSeats={selectedScheme.absentNumbers}
                      markedSeats={markedSeats}
                      onSeatToggle={handleSeatToggle}
                    />
                  </>
                )}
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
