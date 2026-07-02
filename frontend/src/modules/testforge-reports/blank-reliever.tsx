// modules/testforge-reports/blank-reliever.tsx
'use client';

import { ReactNode, useEffect, useState } from 'react';

import courseCodes from '@/config/course_codes.json';
import { format } from 'date-fns';
import { AlertCircle } from 'lucide-react';

import { getAllocationsByDateSession } from '@/lib/actions/allocation';
import { getTimetableEntries } from '@/lib/actions/timetable';
import { cn } from '@/lib/utils';

import { useUserInfo } from '@/hooks/useUserInfo';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';

import { MultiPageReport, ReportPageData } from '@/components/layout/testforge-report-layout';

import { SessionSelector } from '@/components/shared/date-selector';

// ============================================================
// Types
// ============================================================

interface RelieverBlock {
  blockNo: string;
  location: string;
  supervisor: string;
  timeslot: string;
}

interface RelieverRow {
  name: string;
  department: string;
  blocks: RelieverBlock[];
}

interface RelieverPageData extends ReportPageData {
  rows: RelieverRow[];
  date: Date;
  session: string;
  totalRelievers: number;
  totalBlocks: number;
}

// ============================================================
// Render Function
// ============================================================

const renderRelieverTable = (pageData: RelieverPageData) => {
  const { rows, totalBlocks } = pageData;

  // Filter out relievers with no blocks
  const activeRelievers = rows.filter((r) => r.blocks.length > 0);
  type CourseCode = keyof typeof courseCodes;

  const departments = Object.entries(courseCodes).map(([code, name]) => ({
    code: code as CourseCode,
    name,
  }));

  const getDepartmentName = (code: string) => {
    const dept = departments.find((d) => d.code === code);
    return dept ? `${dept.code} - ${dept.name}` : code;
  };
  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-hidden">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-neutral-100">
              <th className="w-[18%] border border-neutral-300 px-3 py-2 text-left font-semibold text-neutral-700">
                Reliever
              </th>
              <th className="w-[18%] border border-neutral-300 px-3 py-2 text-left font-semibold text-neutral-700">
                Department
              </th>
              <th className="w-[12%] border border-neutral-300 px-3 py-2 text-center font-semibold text-neutral-700">
                Block
              </th>
              <th className="w-[18%] border border-neutral-300 px-3 py-2 text-center font-semibold text-neutral-700">
                Location
              </th>
              <th className="w-[18%] border border-neutral-300 px-3 py-2 text-center font-semibold text-neutral-700">
                Supervisor
              </th>
              <th className="w-[16%] border border-neutral-300 px-3 py-2 text-center font-semibold text-neutral-700">
                Timeslot
              </th>
            </tr>
          </thead>
          <tbody>
            {activeRelievers.map((reliever) => {
              const rowCount = reliever.blocks.length;

              return reliever.blocks.map((block, blockIndex) => {
                const isFirst = blockIndex === 0;
                const isLast = blockIndex === rowCount - 1;

                return (
                  <tr
                    key={`${reliever.name}-${blockIndex}`}
                    className={cn(
                      'border-b border-neutral-200',
                      isLast && 'border-b-2 border-neutral-300',
                    )}
                  >
                    {isFirst && (
                      <td
                        rowSpan={rowCount}
                        className="border border-neutral-300 bg-neutral-50/80 px-3 py-2 align-middle font-medium"
                      >
                        <div className="font-semibold text-neutral-800">{reliever.name}</div>
                        {rowCount > 1 && (
                          <div className="mt-0.5 text-[10px] text-neutral-500">
                            {rowCount} blocks
                          </div>
                        )}
                      </td>
                    )}
                    {isFirst && (
                      <td
                        rowSpan={rowCount}
                        className="border border-neutral-300 px-3 py-2 align-middle"
                      >
                        {getDepartmentName(reliever.department)}
                      </td>
                    )}
                    <td className="border border-neutral-300 px-3 py-2 text-center font-mono text-xs font-medium">
                      {block.blockNo}
                    </td>
                    <td className="border border-neutral-300 px-3 py-2 text-center">
                      {block.location}
                    </td>
                    <td className="border border-neutral-300 px-3 py-2 text-center">
                      {block.supervisor}
                    </td>
                    <td className="border border-neutral-300 px-3 py-2 text-center text-xs">
                      {block.timeslot}
                    </td>
                  </tr>
                );
              });
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-neutral-400 bg-neutral-100">
              <td
                colSpan={2}
                className="border border-neutral-300 px-3 py-2 text-right font-bold text-neutral-800"
              >
                GRAND TOTAL
              </td>
              <td className="border border-neutral-300 px-3 py-2 text-center font-mono text-xs text-neutral-600">
                {totalBlocks} Blocks
              </td>
              <td
                colSpan={2}
                className="border border-neutral-300 px-3 py-2 text-center font-mono text-xs text-neutral-600"
              >
                {activeRelievers.length} Relievers
              </td>
              <td className="border border-neutral-300 px-3 py-2 text-center font-mono text-xs text-neutral-600">
                &nbsp;
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

export default function BlankRelieverReport() {
  const { examCenter, isLoading: userLoading } = useUserInfo();

  const [rows, setRows] = useState<RelieverRow[]>([]);
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

      // Group by supervisor to get relievers
      const relieverMap = new Map<
        string,
        { name: string; department: string; blocks: RelieverBlock[] }
      >();

      result.data.forEach((alloc: any) => {
        const supervisorName = alloc.supervisorName || 'Unknown';

        if (!relieverMap.has(supervisorName)) {
          relieverMap.set(supervisorName, {
            name: supervisorName,
            department: alloc.scheme?.split('-')[0] || 'Unknown',
            blocks: [],
          });
        }

        const entry = relieverMap.get(supervisorName)!;
        entry.blocks.push({
          blockNo: alloc.blockNo || alloc.location || '—',
          location: alloc.location || '—',
          supervisor: alloc.supervisorName || 'Not Assigned',
          timeslot: alloc.timeslot || '',
        });
      });

      const relievers = Array.from(relieverMap.values())
        .filter((r) => r.blocks.length > 0)
        .sort((a, b) => a.name.localeCompare(b.name));

      if (relievers.length === 0) {
        setError('No reliever assignments found for this session');
        setRows([]);
        setShowReport(false);
        return;
      }

      setRows(relievers);
      setShowReport(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
      setRows([]);
      setShowReport(false);
    } finally {
      setLoading(false);
    }
  };

  const handleSessionSelect = async (session: {
    date: string;
    session: 'Morning' | 'Afternoon' | 'All' | 'All';
  }) => {
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
  const buildPages = (): RelieverPageData[] => {
    if (rows.length === 0) return [];

    const totalBlocks = rows.reduce((sum, r) => sum + r.blocks.length, 0);

    // Flatten for pagination - each row is a reliever with their blocks
    if (rows.length <= 10) {
      return [
        {
          id: 'reliever-all',
          rows: rows,
          date: new Date(selectedDate),
          session: selectedSession,
          totalRelievers: rows.length,
          totalBlocks: totalBlocks,
          metadata: {
            Relievers: String(rows.length),
            Blocks: String(totalBlocks),
          },
        },
      ];
    }

    const MAX_RELIEVERS_PER_PAGE = 10;
    const pages: RelieverPageData[] = [];
    let startIdx = 0;

    while (startIdx < rows.length) {
      const chunk = rows.slice(startIdx, startIdx + MAX_RELIEVERS_PER_PAGE);
      const chunkBlocks = chunk.reduce((sum, r) => sum + r.blocks.length, 0);

      pages.push({
        id: `reliever-${pages.length + 1}`,
        rows: chunk,
        date: new Date(selectedDate),
        session: selectedSession,
        totalRelievers: chunk.length,
        totalBlocks: chunkBlocks,
        metadata: {
          Page: String(pages.length + 1),
          Relievers: String(chunk.length),
          Blocks: String(chunkBlocks),
        },
      });

      startIdx += MAX_RELIEVERS_PER_PAGE;
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
            title="Blank Reliever Report"
            description="Select date & session to view reliever assignments"
            compact
          />
          {!dates.length && !error && (
            <Alert
              variant="default"
              className="border-amber-200 bg-amber-50"
            >
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <AlertDescription>Upload timetable first.</AlertDescription>
            </Alert>
          )}
        </div>
      </div>
    );
  }

  // Report view
  // Report view
  return (
    <div className="mx-auto max-w-4xl p-4">
      <MultiPageReport
        pages={pages}
        header={{
          title: 'Blank Reliever Report',
          description: 'Session-wise reliever assignments for examination',
          examCenter: {
            name: examCenter?.name || 'Examination Center',
            code: examCenter?.code || '',
            season: examCenter?.season || '',
            year: examCenter?.examYear || new Date().getFullYear(),
            session: (selectedSession as 'Morning' | 'Afternoon') || 'Morning',
            date: selectedDate ? new Date(selectedDate) : new Date(),
          },
          headerFields: {
            Relievers: String(pages[0]?.totalRelievers || 0),
            Blocks: String(pages[0]?.totalBlocks || 0),
          },
        }}
        footer={{
          showApplicationCredit: true,
          creditText: 'Generated by TestForge',
        }}
        onBack={handleReset}
        backButtonLabel="Clear"
        documentTitle="Blank_Reliever_Report"
        numberOfCopies={numberOfCopies}
        onCopiesChange={setNumberOfCopies}
        renderPageContent={renderRelieverTable as (pageData: ReportPageData) => ReactNode}
        showCopyInfo={numberOfCopies > 1}
        copyInfoText="Copy {copyNumber} of {totalCopies}"
      />
    </div>
  );
}
