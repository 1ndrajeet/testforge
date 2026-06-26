// modules/testforge-reports/blank-absent.tsx
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

interface BlankAbsentRow {
  blockNo: string;
  location: string;
  supervisorName: string;
  scheme: string;
  instituteCode: string;
  subjectCode: string;
  subjectName: string;
  totalStudents: number;
  presentCount?: number;
  absentCount?: number;
}

interface BlankAbsentPageData extends ReportPageData {
  rows: BlankAbsentRow[];
  date: Date;
  session: string;
  totalBlocks: number;
  totalStudents: number;
  totalSubjects: number;
}

// ============================================================
// Render Function
// ============================================================

const renderBlankAbsentTable = (pageData: BlankAbsentPageData) => {
  const { rows, totalBlocks, totalStudents, totalSubjects } = pageData;

  // Group by block
  const blockMap = new Map<string, BlankAbsentRow[]>();
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
              <th className="w-[12%] border border-neutral-300 px-3 py-2 text-center font-semibold text-neutral-700">
                Block / Location
              </th>
              <th className="w-[15%] border border-neutral-300 px-3 py-2 text-center font-semibold text-neutral-700">
                Supervisor
              </th>
              <th className="w-[20%] border border-neutral-300 px-3 py-2 text-center font-semibold text-neutral-700">
                Scheme / Subject
              </th>
              <th className="w-[18%] border border-neutral-300 px-3 py-2 text-center font-semibold text-neutral-700">
                Present / Absent / Total
              </th>
              <th className="w-[35%] border border-neutral-300 px-3 py-2 text-left font-semibold text-neutral-700">
                Absent Candidates (Seat No.)
              </th>
            </tr>
          </thead>
          <tbody>
            {groupedRows.map(([blockNo, blockRows]) => {
              const rowCount = blockRows.length;
              const blockTotal = blockRows.reduce((sum, r) => sum + r.totalStudents, 0);

              return blockRows.map((row, rowIndex) => {
                const isFirst = rowIndex === 0;
                const isLast = rowIndex === rowCount - 1;

                return (
                  <tr
                    key={`${blockNo}-${rowIndex}`}
                    className={cn(
                      'border-b border-neutral-200',
                      rowIndex % 2 === 0 ? 'bg-white' : 'bg-neutral-50',
                      isLast && 'border-b-2 border-neutral-300'
                    )}
                  >
                    {isFirst && (
                      <td
                        rowSpan={rowCount}
                        className="border border-neutral-300 bg-neutral-50/80 px-3 py-2 text-center align-middle"
                      >
                        <div className="font-semibold text-neutral-800">{blockNo}</div>
                        <div className="text-[10px] text-neutral-500">{row.location}</div>
                        {rowCount > 1 && (
                          <div className="mt-0.5 text-[10px] text-neutral-500">{blockTotal} students</div>
                        )}
                      </td>
                    )}
                    {isFirst && (
                      <td rowSpan={rowCount} className="border border-neutral-300 px-3 py-2 text-center align-middle">
                        <div className="font-medium text-neutral-800">{row.supervisorName}</div>
                      </td>
                    )}
                    <td className="border border-neutral-300 px-3 py-2">
                      <div className="text-center">
                        <div className="font-mono text-xs font-medium">
                          ({row.instituteCode})-{row.scheme}
                        </div>
                        <div className="mt-0.5 text-[10px] text-neutral-600">{row.subjectCode}</div>
                      </div>
                    </td>
                    <td className="border border-neutral-300 px-3 py-2">
                      <div className="space-y-0.5 text-center">
                        <div className="text-xs text-neutral-600">P = ________</div>
                        <div className="text-xs text-neutral-600">A = ________</div>
                        <hr className="border-neutral-300" />
                        <div className="text-xs font-bold text-neutral-800">T = {row.totalStudents}</div>
                      </div>
                    </td>
                    <td className="border border-neutral-300 px-3 py-2"></td>
                  </tr>
                );
              });
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-neutral-400 bg-neutral-100">
              <td colSpan={2} className="border border-neutral-300 px-3 py-2 text-right font-bold text-neutral-800">
                GRAND TOTAL
              </td>
              <td className="border border-neutral-300 px-3 py-2 text-center font-mono text-xs text-neutral-600">
                {totalSubjects} Subjects
              </td>
              <td className="border border-neutral-300 px-3 py-2 text-center font-bold text-neutral-900">
                {totalStudents}
              </td>
              <td className="border border-neutral-300 px-3 py-2 text-center font-mono text-xs text-neutral-600">
                {totalBlocks} Blocks
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};

// ============================================================
// Main Component
// ============================================================

export default function BlankAbsentReport() {
  const { examCenter, isLoading: userLoading } = useUserInfo();

  const [rows, setRows] = useState<BlankAbsentRow[]>([]);
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

      const blankRows: BlankAbsentRow[] = [];

      result.data.forEach((alloc: any) => {
        const students = alloc.assignedCount || alloc.seatNumbers?.length || 0;
        const scheme = alloc.scheme || '';
        const schemeParts = scheme.split('-') || [];
        const instituteCode = schemeParts[0] || '';

        blankRows.push({
          blockNo: alloc.blockNo || alloc.location || '—',
          location: alloc.location || '—',
          supervisorName: alloc.supervisorName || 'Not Assigned',
          scheme: scheme,
          instituteCode: instituteCode,
          subjectCode: alloc.subjectCode || '',
          subjectName: alloc.subjectName || alloc.subjectCode || '',
          totalStudents: students,
        });
      });

      if (blankRows.length === 0) {
        setError('No data found for this session');
        setRows([]);
        setShowReport(false);
        return;
      }

      setRows(blankRows);
      setShowReport(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
      setRows([]);
      setShowReport(false);
    } finally {
      setLoading(false);
    }
  };

  const handleSessionSelect = async (session: { date: string; session: 'Morning' | 'Afternoon' | 'All' | 'All' }) => {
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
  const buildPages = (): BlankAbsentPageData[] => {
    if (rows.length === 0) return [];

    const totalBlocks = new Set(rows.map(r => r.blockNo)).size;
    const totalSubjects = new Set(rows.map(r => r.subjectCode)).size;
    const totalStudents = rows.reduce((sum, r) => sum + r.totalStudents, 0);

    // If rows fit on one page
    if (rows.length <= 20) {
      return [
        {
          id: 'blank-absent-all',
          rows: rows,
          date: new Date(selectedDate),
          session: selectedSession,
          totalBlocks,
          totalStudents,
          totalSubjects,
          metadata: {
            Blocks: String(totalBlocks),
            Subjects: String(totalSubjects),
            Students: String(totalStudents),
          },
        },
      ];
    }

    // Split into multiple pages
    const MAX_ROWS_PER_PAGE = 20;
    const pages: BlankAbsentPageData[] = [];
    let startIdx = 0;

    while (startIdx < rows.length) {
      const chunk = rows.slice(startIdx, startIdx + MAX_ROWS_PER_PAGE);
      const chunkBlocks = new Set(chunk.map(r => r.blockNo)).size;
      const chunkSubjects = new Set(chunk.map(r => r.subjectCode)).size;
      const chunkStudents = chunk.reduce((sum, r) => sum + r.totalStudents, 0);

      pages.push({
        id: `blank-absent-${pages.length + 1}`,
        rows: chunk,
        date: new Date(selectedDate),
        session: selectedSession,
        totalBlocks: chunkBlocks,
        totalStudents: chunkStudents,
        totalSubjects: chunkSubjects,
        metadata: {
          Page: String(pages.length + 1),
          Blocks: String(chunkBlocks),
          Subjects: String(chunkSubjects),
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
            availableSessions={['Morning', 'Afternoon', 'All']}
            onSessionSelect={handleSessionSelect}
            defaultDate={selectedDate}
            defaultSession="Morning"
            isLoading={loading}
            error={error}
            title="Blank Absent Report"
            description="Select date & session to view blank absent report"
            compact
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
          title: 'Blank Absent Report',
          description: 'Session-wise blank absent report for examination',
          examCenter: {
            name: examCenter?.name || 'Examination Center',
            code: examCenter?.code || '',
            season: examCenter?.season || '',
            year: examCenter?.examYear || new Date().getFullYear(),
            session: (selectedSession as 'Morning' | 'Afternoon') || 'Morning',
            date: selectedDate ? new Date(selectedDate) : new Date(),
          },
          headerFields: {
            Blocks: String(pages[0]?.totalBlocks || 0),
            Subjects: String(pages[0]?.totalSubjects || 0),
            Students: String(pages[0]?.totalStudents || 0),
          },
        }}
        footer={{
          showTestForgeCredit: true,
          creditText: 'Generated by TestForge',
        }}
        onBack={handleReset}
        backButtonLabel="Clear"
        documentTitle="Blank_Absent_Report"
        numberOfCopies={numberOfCopies}
        onCopiesChange={setNumberOfCopies}
        renderPageContent={renderBlankAbsentTable as (pageData: ReportPageData) => ReactNode}
        showCopyInfo={numberOfCopies > 1}
        copyInfoText="Copy {copyNumber} of {totalCopies}"
      />
    </div>
  );
}
