// modules/testforge-reports/block-allocation.tsx
'use client';

import { useEffect, useRef, useState } from 'react';

import { format } from 'date-fns';
import { AlertCircle } from 'lucide-react';

import { MultiPageReport, ReportPageData } from '@/components/layout/testforge-report-layout';
import { SessionSelector } from '@/components/shared/date-selector';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useUserInfo } from '@/hooks/useUserInfo';
import { getAllocationsByDateSession } from '@/lib/actions/allocation';
import { getBlocks } from '@/lib/actions/block';
import { getTimetableEntries } from '@/lib/actions/timetable';
import { Block } from '@/lib/types';
import { cn } from '@/lib/utils';

// ============================================================
// Types
// ============================================================

interface AllocationRow {
  subjectCode: string;
  subjectName: string;
  blockNo: string;
  location: string;
  scheme: string;
  students: number;
  seatNumbers: number[];
  firstSeat: number;
  lastSeat: number;
  supervisorName: string;
  timeslot: string;
}

interface AllotmentSummaryPageData extends ReportPageData {
  rows: AllocationRow[];
  date: Date;
  session: string;
  totalBlocks: number;
  totalStudents: number;
  totalSubjects: number;
}

interface BlockAllocationPageData extends ReportPageData {
  blockNo: string;
  location: string;
  supervisorName: string;
  date: Date;
  session: string;
  rows: AllocationRow[];
  seatNumbers: number[];
  distribution: number[];
  instituteName: string;
  template: number;
}

// ============================================================
// Seating Templates (1-4)
// ============================================================

const generateSeating = (seats: number[], dist: number[], maxRows: number, template: number): (number | null)[][] => {
  const cols = dist.length;
  const grid: (number | null)[][] = Array(cols)
    .fill(null)
    .map(() => Array(maxRows).fill(null));
  let seatIndex = 0;

  switch (template) {
    case 1:
      for (let col = cols - 1; col >= 0; col--) {
        const colSize = dist[col];
        const distanceFromRight = cols - 1 - col;
        if (distanceFromRight % 2 === 0) {
          for (let row = 0; row < colSize && seatIndex < seats.length; row++) {
            grid[col][row] = seats[seatIndex++];
          }
        } else {
          for (let row = colSize - 1; row >= 0 && seatIndex < seats.length; row--) {
            grid[col][row] = seats[seatIndex++];
          }
        }
      }
      break;
    case 2:
      for (let col = cols - 1; col >= 0; col--) {
        const colSize = dist[col];
        for (let row = 0; row < colSize && seatIndex < seats.length; row++) {
          grid[col][row] = seats[seatIndex++];
        }
      }
      break;
    case 3:
      for (let col = 0; col < cols; col++) {
        const colSize = dist[col];
        for (let row = 0; row < colSize && seatIndex < seats.length; row++) {
          grid[col][row] = seats[seatIndex++];
        }
      }
      break;
    case 4:
      for (let col = 0; col < cols; col++) {
        const colSize = dist[col];
        if (col % 2 === 0) {
          for (let row = 0; row < colSize && seatIndex < seats.length; row++) {
            grid[col][row] = seats[seatIndex++];
          }
        } else {
          for (let row = colSize - 1; row >= 0 && seatIndex < seats.length; row--) {
            grid[col][row] = seats[seatIndex++];
          }
        }
      }
      break;
    default:
      for (let col = cols - 1; col >= 0; col--) {
        const colSize = dist[col];
        const distanceFromRight = cols - 1 - col;
        if (distanceFromRight % 2 === 0) {
          for (let row = 0; row < colSize && seatIndex < seats.length; row++) {
            grid[col][row] = seats[seatIndex++];
          }
        } else {
          for (let row = colSize - 1; row >= 0 && seatIndex < seats.length; row--) {
            grid[col][row] = seats[seatIndex++];
          }
        }
      }
      break;
  }

  return grid;
};

// ============================================================
// Render Functions
// ============================================================

const renderAllotmentSummary = (pageData: AllotmentSummaryPageData) => {
  const { rows, totalBlocks, totalStudents, totalSubjects } = pageData;

  const blockMap = new Map<string, AllocationRow[]>();
  rows.forEach(row => {
    const key = row.blockNo;
    if (!blockMap.has(key)) blockMap.set(key, []);
    blockMap.get(key)!.push(row);
  });

  const groupedRows = Array.from(blockMap.entries()).sort((a, b) => parseInt(a[0]) - parseInt(b[0]));

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-hidden">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-neutral-100">
              <th className="w-[10%] border border-neutral-300 px-3 py-2 text-left font-semibold text-neutral-700">
                Block
              </th>
              <th className="w-[12%] border border-neutral-300 px-3 py-2 text-left font-semibold text-neutral-700">
                Location / Supervisor
              </th>
              <th className="w-[12%] border border-neutral-300 px-3 py-2 text-left font-semibold text-neutral-700">
                Scheme
              </th>
              <th className="w-[20%] border border-neutral-300 px-3 py-2 text-left font-semibold text-neutral-700">
                Subject
              </th>
              <th className="w-[16%] border border-neutral-300 px-3 py-2 text-center font-semibold text-neutral-700">
                Seat Range
              </th>
              <th className="w-[10%] border border-neutral-300 px-3 py-2 text-center font-semibold text-neutral-700">
                Students
              </th>
              <th className="w-[20%] border border-neutral-300 px-3 py-2 text-left font-semibold text-neutral-700">
                Timeslot
              </th>
            </tr>
          </thead>
          <tbody>
            {groupedRows.map(([blockNo, blockRows]) => {
              const rowCount = blockRows.length;
              const blockTotal = blockRows.reduce((sum, r) => sum + r.students, 0);

              return blockRows.map((row, rowIndex) => {
                const isFirst = rowIndex === 0;
                const isLast = rowIndex === rowCount - 1;

                return (
                  <tr
                    key={`${blockNo}-${rowIndex}`}
                    className={cn('border-b border-neutral-200', isLast && 'border-b-2 border-neutral-300')}
                  >
                    {isFirst && (
                      <td
                        rowSpan={rowCount}
                        className="border border-neutral-300 bg-neutral-50/80 px-3 py-2 align-middle font-mono text-xs font-medium"
                      >
                        <div className="font-semibold text-neutral-800">{blockNo}</div>
                        {rowCount > 1 && (
                          <div className="mt-0.5 text-[10px] text-neutral-500">{blockTotal} students</div>
                        )}
                      </td>
                    )}
                    {isFirst && (
                      <td rowSpan={rowCount} className="border border-neutral-300 px-3 py-2 align-middle">
                        <div className="font-medium text-neutral-800">{row.location}</div>
                        <div className="text-[10px] text-neutral-500">{row.supervisorName}</div>
                      </td>
                    )}
                    <td className="border border-neutral-300 px-3 py-2 font-mono text-xs">{row.scheme}</td>
                    <td className="border border-neutral-300 px-3 py-2">
                      <div className="flex items-center gap-1">
                        <span className="font-mono text-xs font-medium">{row.subjectCode}</span>
                        <span className="text-neutral-400">-</span>
                        <span className="text-xs text-neutral-700">{row.subjectName}</span>
                      </div>
                    </td>
                    <td className="border border-neutral-300 px-3 py-2 text-center font-mono text-xs">
                      {row.firstSeat && row.lastSeat ? `${row.firstSeat} - ${row.lastSeat}` : '—'}
                    </td>
                    <td className="border border-neutral-300 px-3 py-2 text-center font-bold text-neutral-800">
                      {row.students}
                    </td>
                    <td className="border border-neutral-300 px-3 py-2 text-xs">{row.timeslot}</td>
                  </tr>
                );
              });
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-neutral-400 bg-neutral-100">
              <td colSpan={3} className="border border-neutral-300 px-3 py-2 text-right font-bold text-neutral-800">
                GRAND TOTAL
              </td>
              <td className="border border-neutral-300 px-3 py-2 text-center font-mono text-xs text-neutral-600">
                {totalSubjects} Subjects
              </td>
              <td className="border border-neutral-300 px-3 py-2 text-center font-mono text-xs text-neutral-600">
                {totalBlocks} Blocks
              </td>
              <td className="border border-neutral-300 px-3 py-2 text-center font-bold text-neutral-900">
                {totalStudents}
              </td>
              <td className="border border-neutral-300 px-3 py-2 text-center font-mono text-xs text-neutral-600">
                {groupedRows.length} Blocks
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};

const renderAllotmentTable = (pageData: BlockAllocationPageData) => {
  const { rows, seatNumbers, distribution, template } = pageData;

  const seats = seatNumbers || [];
  const dist = distribution || [10, 10, 10, 10];
  const maxRows = Math.max(...dist);

  const seatArrangement = seats.length > 0 ? generateSeating(seats, dist, maxRows, template || 1) : [];

  // Build scheme map by seat index
  const schemeMap = new Map<number, string>();
  let idx = 0;
  rows.forEach(row => {
    (row.seatNumbers || []).forEach(() => {
      schemeMap.set(idx++, row.scheme);
    });
  });

  return (
    <div className="flex h-full flex-col">
      {/* Header Info */}
      <div className="mb-3 grid grid-cols-3 gap-2 border border-neutral-300 p-2 text-xs">
        <div>
          <span className="font-medium">Date:</span> {format(pageData.date, 'dd/MM/yyyy')}
        </div>
        <div>
          <span className="font-medium">Session:</span> {pageData.session}
        </div>
        <div>
          <span className="font-medium">Block:</span> {pageData.blockNo}
        </div>
        <div>
          <span className="font-medium">Location:</span> {pageData.location}
        </div>
        <div>
          <span className="font-medium">Supervisor:</span> {pageData.supervisorName}
        </div>
        <div>
          <span className="font-medium">Total Students:</span> {seats.length}
        </div>
      </div>

      {/* Scheme Info Table */}
      <div className="mb-3 text-xs">
        <table className="w-full border-collapse border border-neutral-300">
          <thead>
            <tr className="bg-neutral-100">
              {['Scheme', 'Subject', 'Seat Range', 'Students', 'Timeslot'].map(h => (
                <th key={h} className="border border-neutral-300 px-2 py-1 text-left font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={idx}>
                <td className="border border-neutral-300 px-2 py-1 font-mono text-xs">{row.scheme}</td>
                <td className="border border-neutral-300 px-2 py-1">
                  <span className="font-mono text-xs">{row.subjectCode}</span>
                  <span className="ml-1 text-neutral-400">-</span>
                  <span className="ml-1 text-xs text-neutral-700">{row.subjectName}</span>
                </td>
                <td className="border border-neutral-300 px-2 py-1 text-center font-mono text-xs">
                  {row.firstSeat && row.lastSeat ? `${row.firstSeat} - ${row.lastSeat}` : '—'}
                </td>
                <td className="border border-neutral-300 px-2 py-1 text-center font-bold">{row.students}</td>
                <td className="border border-neutral-300 px-2 py-1 text-xs">{row.timeslot}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Seat Arrangement */}
      {seats.length > 0 && (
        <div className="flex-1 overflow-hidden">
          <div className="grid w-full gap-1" style={{ gridTemplateColumns: `repeat(${dist.length}, minmax(0, 1fr))` }}>
            {seatArrangement.map((column, colIdx) => {
              let lastScheme = '';
              return (
                <div key={colIdx} className="flex flex-col gap-1">
                  {column.map((seat, rowIdx) => {
                    if (seat === null) return <div key={rowIdx} className="h-8" />;

                    const seatIndex = seats.indexOf(seat);
                    const scheme = schemeMap.get(seatIndex) || '';
                    const showScheme = scheme && scheme !== lastScheme;
                    lastScheme = scheme;

                    return (
                      <div key={rowIdx} className="h-9 overflow-hidden rounded border border-neutral-300">
                        <div className="flex h-full">
                          <div className="flex w-1/2 items-center justify-center bg-white font-mono text-sm font-semibold">
                            {seat}
                          </div>
                          <div className="flex w-1/2 flex-col items-center justify-center border-l border-neutral-300 bg-neutral-50">
                            <span className="text-xs font-bold text-neutral-800">B{seatIndex + 1}</span>
                            {showScheme && (
                              <span className="font-mono text-[9px] leading-tight font-medium text-blue-700">
                                {scheme}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================
// Main Component
// ============================================================

export default function BlockAllocationReport() {
  const { examCenter, isLoading: userLoading } = useUserInfo();
  const printRef = useRef<HTMLDivElement>(null);

  const [state, setState] = useState({
    allocations: [] as AllocationRow[],
    blocks: [] as Block[],
    loading: false,
    loadingDates: true,
    loadingBlocks: true,
    error: null as string | null,
    dates: [] as Date[],
    selectedDate: '',
    selectedSession: '',
    showReport: false,
    copies: 1,
  });

  // Fetch dates
  useEffect(() => {
    getTimetableEntries().then(result => {
      if (result.success && result.data) {
        const unique = [...new Set(result.data.map((r: any) => r.date))];
        setState(prev => ({
          ...prev,
          dates: unique,
          selectedDate: unique.length ? format(unique[0], 'yyyy-MM-dd') : '',
          loadingDates: false,
        }));
      } else {
        setState(prev => ({ ...prev, loadingDates: false }));
      }
    });
  }, []);

  // Fetch blocks
  useEffect(() => {
    const fetchBlocks = async () => {
      setState(prev => ({ ...prev, loadingBlocks: true }));
      try {
        const result = await getBlocks();
        if (result.success && result.data) {
          setState(prev => ({ ...prev, blocks: result.data }));
        }
      } catch (error) {
        console.error('Failed to fetch blocks:', error);
      } finally {
        setState(prev => ({ ...prev, loadingBlocks: false }));
      }
    };
    fetchBlocks();
  }, []);

  // Fetch data
  const fetchData = async (date: string, session: string) => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const result = await getAllocationsByDateSession(new Date(date), session);
      if (!result.success || !result.data?.length) {
        setState(prev => ({ ...prev, loading: false, error: 'No allocation data found', showReport: false }));
        return;
      }

      const allocations: AllocationRow[] = [];

      result.data.forEach((alloc: any) => {
        const students = alloc.assignedCount || alloc.seatNumbers?.length || 0;
        const seatNumbers = alloc.seatNumbers || [];

        allocations.push({
          subjectCode: alloc.subjectCode,
          subjectName: alloc.subjectName || alloc.subjectCode,
          blockNo: alloc.blockNo || alloc.location || '—',
          location: alloc.location || '—',
          scheme: alloc.scheme || '',
          students,
          seatNumbers,
          firstSeat: seatNumbers.length > 0 ? seatNumbers[0] : 0,
          lastSeat: seatNumbers.length > 0 ? seatNumbers[seatNumbers.length - 1] : 0,
          supervisorName: alloc.supervisorName || '',
          timeslot: alloc.timeslot || '',
        });
      });

      setState(prev => ({ ...prev, allocations, showReport: true, loading: false }));
    } catch (err) {
      setState(prev => ({ ...prev, loading: false, error: err instanceof Error ? err.message : 'Failed to load' }));
    }
  };

  const handleSelect = (s: { date: string; session: 'Morning' | 'Afternoon' | 'All' }) => {
    setState(prev => ({ ...prev, selectedDate: s.date, selectedSession: s.session }));
    fetchData(s.date, s.session);
  };

  const reset = () => setState(prev => ({ ...prev, showReport: false, allocations: [], error: null }));

  // Build ALL pages
  const buildAllPages = (): ReportPageData[] => {
    if (state.allocations.length === 0) return [];

    const totalBlocks = new Set(state.allocations.map(r => r.blockNo)).size;
    const totalSubjects = new Set(state.allocations.map(r => r.subjectCode)).size;
    const totalStudents = state.allocations.reduce((sum, r) => sum + r.students, 0);

    const allPages: ReportPageData[] = [];

    // 1. Summary Page (1 copy only)
    const summaryPage: AllotmentSummaryPageData = {
      id: 'allotment-summary',
      rows: state.allocations,
      date: new Date(state.selectedDate),
      session: state.selectedSession,
      totalBlocks,
      totalStudents,
      totalSubjects,
      metadata: {
        Blocks: String(totalBlocks),
        Subjects: String(totalSubjects),
        Students: String(totalStudents),
      },
    };
    allPages.push(summaryPage);

    // 2. Block Detail Pages
    const blockMap = new Map<string, AllocationRow[]>();
    state.allocations.forEach(row => {
      const key = row.blockNo;
      if (!blockMap.has(key)) blockMap.set(key, []);
      blockMap.get(key)!.push(row);
    });

    blockMap.forEach((rows, blockNo) => {
      const firstRow = rows[0];
      const allSeatNumbers = rows.flatMap(r => r.seatNumbers || []).sort((a, b) => a - b);

      const block = state.blocks.find(b => b.location === firstRow.location);
      const distribution = block?.distribution || [10, 10, 10, 10];
      const template = block?.template ?? 1;

      const blockPage: BlockAllocationPageData = {
        id: `block-${blockNo}`,
        blockNo: blockNo,
        location: firstRow.location || '',
        supervisorName: firstRow.supervisorName || '',
        date: new Date(state.selectedDate),
        session: state.selectedSession,
        rows: rows.sort((a, b) => a.scheme.localeCompare(b.scheme)),
        seatNumbers: allSeatNumbers,
        distribution: distribution,
        template: template,
        instituteName: examCenter?.name || 'Examination Center',
        metadata: {
          Block: blockNo,
          Location: firstRow.location || '',
          Students: allSeatNumbers.length,
          Subjects: rows.length,
          Supervisor: firstRow.supervisorName || '',
        },
      };

      // Add block page for each copy
      for (let copyIdx = 0; copyIdx < state.copies; copyIdx++) {
        allPages.push({
          ...blockPage,
          id: `block-${blockNo}-copy-${copyIdx}`,
          metadata: {
            ...blockPage.metadata,
            Copy: `${copyIdx + 1} of ${state.copies}`,
          },
        });
      }
    });

    return allPages;
  };

  const allPages = buildAllPages();

  // Shared header config
  const headerConfig = {
    examCenter: {
      name: examCenter?.name || 'Examination Center',
      code: examCenter?.code || '',
      season: examCenter?.season || '',
      year: examCenter?.examYear || new Date().getFullYear(),
      session: (state.selectedSession as 'Morning' | 'Afternoon') || 'Morning',
      date: state.selectedDate ? new Date(state.selectedDate) : new Date(),
    },
  };

  // Loading
  if (state.loadingDates || userLoading || state.loadingBlocks) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  // Selection
  if (!state.showReport) {
    return (
      <div className="mx-auto max-w-4xl p-4">
        <div className="space-y-4">
          <SessionSelector
            availableDates={state.dates}
            availableSessions={['Morning', 'Afternoon', 'All']}
            onSessionSelect={handleSelect}
            defaultDate={state.selectedDate}
            defaultSession="Morning"
            isLoading={state.loading}
            error={state.error}
            title="Block Allocation Report"
            description="Select date & session to view block allocation details"
            compact
          />
          {!state.dates.length && !state.error && (
            <Alert className="border-amber-200 bg-amber-50">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <AlertDescription>Upload timetable first.</AlertDescription>
            </Alert>
          )}
        </div>
      </div>
    );
  }

  // Report - SINGLE MultiPageReport
  return (
    <div className="mx-auto max-w-4xl p-4">
      <div ref={printRef}>
        <MultiPageReport
          pages={allPages}
          header={{
            ...headerConfig,
            title: 'Block Allotment Details',
            description: 'Block-wise seating arrangement for examination',
          }}
          footer={{ showTestForgeCredit: true, creditText: 'Generated by TestForge' }}
          onBack={reset}
          backButtonLabel="Clear"
          documentTitle="Block_Allotment_Report"
          numberOfCopies={1}
          renderPageContent={(pageData: ReportPageData) => {
            if ('rows' in pageData && 'totalBlocks' in pageData) {
              return renderAllotmentSummary(pageData as AllotmentSummaryPageData);
            }
            return renderAllotmentTable(pageData as BlockAllocationPageData);
          }}
          showCopyInfo={state.copies > 1}
          copyInfoText="Copy {copyNumber} of {totalCopies}"
        />
      </div>
    </div>
  );
}
