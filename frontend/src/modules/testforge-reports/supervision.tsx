// modules/testforge-reports/supervision.tsx
'use client';

import { ReactNode, useEffect, useState } from 'react';

import { format } from 'date-fns';
import { AlertCircle } from 'lucide-react';

import { MultiPageReport, ReportPageData } from '@/components/layout/testforge-report-layout';
import { SessionSelector } from '@/components/shared/date-selector';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useUserInfo } from '@/hooks/useUserInfo';
import { getAllocationsByDateSession } from '@/lib/actions/allocation';
import { getTimetableEntries } from '@/lib/actions/timetable';
import { cn } from '@/lib/utils';

// ============================================================
// Types
// ============================================================

interface SupervisionRow {
  blockNo: string;
  location: string;
  supervisorName: string;
  supervisorUid: string;
  scheme: string;
  subjectCode: string;
  subjectName: string;
  students: number;
  timeslot: string;
}

interface SupervisionPageData extends ReportPageData {
  rows: SupervisionRow[];
  date: Date;
  session: string;
  totalBlocks: number;
  totalSupervisors: number;
  totalStudents: number;
}

// ============================================================
// Render Function
// ============================================================

const renderSupervisionTable = (pageData: SupervisionPageData) => {
  const { rows, totalBlocks, totalSupervisors, totalStudents } = pageData;

  // Group by supervisor
  const supervisorMap = new Map<string, SupervisionRow[]>();
  rows.forEach(row => {
    const key = row.supervisorUid || row.supervisorName;
    if (!supervisorMap.has(key)) {
      supervisorMap.set(key, []);
    }
    supervisorMap.get(key)!.push(row);
  });

  const groupedRows = Array.from(supervisorMap.entries()).sort((a, b) => {
    const nameA = a[1][0]?.supervisorName || '';
    const nameB = b[1][0]?.supervisorName || '';
    return nameA.localeCompare(nameB);
  });

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-hidden">
        <table className="w-full border-collapse border border-black text-xs">
          <thead>
            <tr className="bg-neutral-100 print:bg-neutral-100">
              <th className="w-[16%] border border-black px-3 py-2 text-left font-bold text-neutral-700">Supervisor</th>
              <th className="w-[10%] border border-black px-3 py-2 text-center font-bold text-neutral-700">
                Block No.
              </th>
              <th className="w-[14%] border border-black px-3 py-2 text-left font-bold text-neutral-700">Location</th>
              <th className="w-[10%] border border-black px-3 py-2 text-left font-bold text-neutral-700">Scheme</th>
              <th className="w-[16%] border border-black px-3 py-2 text-left font-bold text-neutral-700">Subject</th>
              <th className="w-[8%] border border-black px-3 py-2 text-center font-bold text-neutral-700">Students</th>
              <th className="w-[14%] border border-black px-3 py-2 text-left font-bold text-neutral-700">Timeslot</th>
              <th className="w-[12%] border border-black px-3 py-2 text-left font-bold text-neutral-700">Remarks</th>
            </tr>
          </thead>
          <tbody>
            {groupedRows.map(([supervisorKey, supervisorRows]) => {
              const rowCount = supervisorRows.length;
              const supervisorName = supervisorRows[0]?.supervisorName || 'Not Assigned';
              const supervisorTotal = supervisorRows.reduce((sum, r) => sum + r.students, 0);

              return supervisorRows.map((row, rowIndex) => {
                const isFirst = rowIndex === 0;
                const isLast = rowIndex === rowCount - 1;

                return (
                  <tr
                    key={`${supervisorKey}-${rowIndex}`}
                    className={cn(
                      'border-b border-black',
                      rowIndex % 2 === 0 ? 'bg-white' : 'bg-neutral-50/50',
                      isLast && 'border-b border-black'
                    )}
                  >
                    {isFirst && (
                      <td
                        rowSpan={rowCount}
                        className="border border-black bg-neutral-50/80 px-3 py-2 align-middle font-medium"
                      >
                        <div className="font-semibold text-neutral-800">{supervisorName}</div>
                        <div className="text-[9px] text-neutral-500">{row.supervisorUid}</div>
                        {rowCount > 1 && (
                          <div className="mt-0.5 text-[9px] text-neutral-500">{supervisorTotal} students</div>
                        )}
                      </td>
                    )}
                    {isFirst && (
                      <td rowSpan={rowCount} className="border border-black px-3 py-2 text-center align-middle">
                        <span className="text-lg font-bold text-neutral-900">{row.blockNo}</span>
                      </td>
                    )}
                    {isFirst && (
                      <td rowSpan={rowCount} className="border border-black px-3 py-2 align-middle text-sm">
                        {row.location}
                      </td>
                    )}
                    <td className="border border-black px-3 py-2 font-mono text-xs">{row.scheme}</td>
                    <td className="border border-black px-3 py-2">
                      <div className="flex flex-col">
                        <span className="font-mono text-xs font-medium">{row.subjectCode}</span>
                        <span className="text-[10px] text-neutral-600">{row.subjectName}</span>
                      </div>
                    </td>
                    <td className="border border-black px-3 py-2 text-center font-bold text-neutral-800">
                      {row.students}
                    </td>
                    <td className="border border-black px-3 py-2 text-xs">{row.timeslot}</td>
                    <td className="border border-black px-3 py-2"></td>
                  </tr>
                );
              });
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-black bg-neutral-200 font-bold print:bg-neutral-200">
              <td colSpan={3} className="border border-black px-3 py-2 text-right text-sm">
                GRAND TOTAL
              </td>
              <td className="border border-black px-3 py-2 text-center text-sm">{totalSupervisors}</td>
              <td className="border border-black px-3 py-2 text-center text-sm">{totalBlocks} Blocks</td>
              <td className="border border-black px-3 py-2 text-center text-sm text-neutral-900">{totalStudents}</td>
              <td className="border border-black px-3 py-2 text-center text-sm" colSpan={2}>
                &nbsp;
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Footer Info - For display at exam center */}
      <div className="mt-2 border-t border-black pt-2 text-[10px]">
        <div className="flex justify-between">
          <span className="font-medium">Display at Examination Center</span>
          <span>Page {pageData.metadata?.Page || 1}</span>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// Main Component
// ============================================================

export default function SupervisionReport() {
  const { examCenter, isLoading: userLoading } = useUserInfo();

  const [rows, setRows] = useState<SupervisionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingDates, setLoadingDates] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dates, setDates] = useState<Date[]>([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedSession, setSelectedSession] = useState('');
  const [showReport, setShowReport] = useState(false);
  const [numberOfCopies, setNumberOfCopies] = useState(1);

  // Fetch available dates
  useEffect(() => {
    const fetchDates = async () => {
      const result = await getTimetableEntries();
      if (result.success && result.data) {
        const unique = [...new Set(result.data.map((r: any) => r.date))];
        setDates(unique);
        if (unique.length) {
          setSelectedDate(format(unique[0], 'yyyy-MM-dd'));
        }
      }
      setLoadingDates(false);
    };
    fetchDates();
  }, []);

  // Fetch data
  const fetchData = async (date: string, session: string) => {
    setLoading(true);
    setError(null);

    try {
      const result = await getAllocationsByDateSession(new Date(date), session);

      if (!result.success || !result.data || result.data.length === 0) {
        setError('No allocation data found for the selected session');
        setRows([]);
        setShowReport(false);
        return;
      }

      const supervisionRows: SupervisionRow[] = [];

      result.data.forEach((alloc: any) => {
        // Only include allocations with supervisors assigned
        if (!alloc.supervisorUid && !alloc.supervisorName) return;

        supervisionRows.push({
          blockNo: alloc.blockNo || alloc.location || '—',
          location: alloc.location || '—',
          supervisorName: alloc.supervisorName || 'Not Assigned',
          supervisorUid: alloc.supervisorUid || '',
          scheme: alloc.scheme || '',
          subjectCode: alloc.subjectCode || '',
          subjectName: alloc.subjectName || alloc.subjectCode || '',
          students: alloc.assignedCount || alloc.seatNumbers?.length || 0,
          timeslot: alloc.timeslot || '',
        });
      });

      if (supervisionRows.length === 0) {
        setError('No supervisor allocations found for this session');
        setRows([]);
        setShowReport(false);
        return;
      }

      setRows(supervisionRows);
      setShowReport(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
      setRows([]);
      setShowReport(false);
    } finally {
      setLoading(false);
    }
  };

  const handleSessionSelect = async (session: { date: string; session: 'Morning' | 'Afternoon' | 'All' }) => {
    setSelectedDate(session.date);
    setSelectedSession(session.session);
    await fetchData(session.date, session.session);
  };

  const handleReset = () => {
    setShowReport(false);
    setRows([]);
    setError(null);
  };

  // Build pages
  const buildPages = (): SupervisionPageData[] => {
    if (rows.length === 0) return [];

    const totalBlocks = rows.length;
    const totalStudents = rows.reduce((sum, r) => sum + r.students, 0);
    const uniqueSupervisors = new Set(rows.map(r => r.supervisorUid || r.supervisorName));
    const totalSupervisors = uniqueSupervisors.size;

    // If rows fit on one page (max 25 for readability at exam center)
    if (rows.length <= 25) {
      return [
        {
          id: 'supervision-all',
          rows: rows,
          date: new Date(selectedDate),
          session: selectedSession,
          totalBlocks,
          totalSupervisors,
          totalStudents,
          metadata: {
            Page: '1',
          },
        },
      ];
    }

    // Split into multiple pages
    const MAX_ROWS_PER_PAGE = 25;
    const pages: SupervisionPageData[] = [];
    let startIdx = 0;

    while (startIdx < rows.length) {
      const chunk = rows.slice(startIdx, startIdx + MAX_ROWS_PER_PAGE);
      const chunkBlocks = chunk.length;
      const chunkStudents = chunk.reduce((sum, r) => sum + r.students, 0);
      const chunkSupervisors = new Set(chunk.map(r => r.supervisorUid || r.supervisorName)).size;

      pages.push({
        id: `supervision-${pages.length + 1}`,
        rows: chunk,
        date: new Date(selectedDate),
        session: selectedSession,
        totalBlocks: chunkBlocks,
        totalSupervisors: chunkSupervisors,
        totalStudents: chunkStudents,
        metadata: {
          Page: String(pages.length + 1),
          Blocks: String(chunkBlocks),
          Supervisors: String(chunkSupervisors),
          Students: String(chunkStudents),
        },
      });

      startIdx += MAX_ROWS_PER_PAGE;
    }

    return pages;
  };

  const pages = buildPages();

  // Loading
  if (loadingDates || userLoading) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  // Selection state
  if (!showReport) {
    return (
      <div className="mx-auto max-w-4xl p-4">
        <div className="space-y-4">
          <SessionSelector
            availableDates={dates}
            availableSessions={['Morning', 'Afternoon']}
            onSessionSelect={handleSessionSelect}
            defaultDate={selectedDate}
            defaultSession="Morning"
            isLoading={loading}
            error={error}
            title="Select Examination Session"
            description="Choose a date and session to generate supervision report"
            compact
            showAllSession={false}
          />

          {!dates.length && !error && (
            <Alert variant="default" className="border-amber-200 bg-amber-50">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <AlertDescription>Upload timetable first.</AlertDescription>
            </Alert>
          )}
        </div>
      </div>
    );
  }

  // Report view
  return (
    <div className="mx-auto max-w-4xl p-4">
      <MultiPageReport
        pages={pages}
        header={{
          title: 'SUPERVISION DUTY SCHEDULE',
          description: 'Supervisor-wise duty schedule for examination blocks',
          examCenter: {
            name: examCenter?.name || 'Examination Center',
            code: examCenter?.code || '',
            season: examCenter?.season || '',
            year: examCenter?.examYear || new Date().getFullYear(),
            session: (selectedSession as 'Morning' | 'Afternoon') || 'Morning',
            date: selectedDate ? new Date(selectedDate) : new Date(),
          },
          headerFields: {
            'Total Blocks': String(pages[0]?.totalBlocks || 0),
            'Total Supervisors': String(pages[0]?.totalSupervisors || 0),
            'Total Students': String(pages[0]?.totalStudents || 0),
          },
        }}
        footer={{
          showTestForgeCredit: true,
          creditText: 'Generated by TestForge',
        }}
        onBack={handleReset}
        backButtonLabel="Clear"
        documentTitle="Supervision_Report"
        numberOfCopies={numberOfCopies}
        onCopiesChange={setNumberOfCopies}
        renderPageContent={renderSupervisionTable as (pageData: ReportPageData) => ReactNode}
        showCopyInfo={numberOfCopies > 1}
        copyInfoText="Copy {copyNumber} of {totalCopies}"
      />
    </div>
  );
}
