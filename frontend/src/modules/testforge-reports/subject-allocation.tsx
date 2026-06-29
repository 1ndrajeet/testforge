// modules/testforge-reports/subject-allocation.tsx
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

interface AllocationRow {
  subjectCode: string;
  subjectName: string;
  blockNo: string;
  location: string;
  scheme: string;
  students: number;
}

interface SubjectGroup {
  subjectCode: string;
  subjectName: string;
  rows: AllocationRow[];
  totalStudents: number;
}

interface SubjectAllocationPageData extends ReportPageData {
  groups: SubjectGroup[];
}

// ============================================================
// Render Function - Table
// ============================================================

// Render Function - Table
// ============================================================

const renderSubjectAllocationTable = (pageData: SubjectAllocationPageData) => {
  const { groups } = pageData;
  const totalBlocks = groups.reduce((sum, g) => sum + g.rows.length, 0);
  const totalStudents = groups.reduce((sum, g) => sum + g.totalStudents, 0);

  return (
    <div className="flex h-full flex-col">
      {/* Table */}
      <div className="flex-1 overflow-hidden">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-neutral-100">
              <th className="w-[15%] border border-neutral-300 px-3 py-2 text-left font-semibold text-neutral-700">
                Subject Code
              </th>
              <th className="w-[25%] border border-neutral-300 px-3 py-2 text-left font-semibold text-neutral-700">
                Subject Name
              </th>
              <th className="w-[12%] border border-neutral-300 px-3 py-2 text-left font-semibold text-neutral-700">
                Block
              </th>
              <th className="w-[28%] border border-neutral-300 px-3 py-2 text-left font-semibold text-neutral-700">
                Location
              </th>
              <th className="w-[20%] border border-neutral-300 px-3 py-2 text-center font-semibold text-neutral-700">
                Scheme (Students)
              </th>
            </tr>
          </thead>
          <tbody>
            {groups.map(group => {
              const rowCount = group.rows.length;

              return group.rows.map((row, rowIndex) => {
                const isFirst = rowIndex === 0;
                const isLast = rowIndex === rowCount - 1;

                return (
                  <tr
                    key={`${group.subjectCode}-${rowIndex}`}
                    className={cn('border-b border-neutral-200', isLast && 'border-b-2 border-neutral-300')}
                  >
                    {isFirst && (
                      <td
                        rowSpan={rowCount}
                        className="border border-neutral-300 bg-neutral-50 px-3 py-2 align-middle font-mono text-xs font-semibold"
                      >
                        {group.subjectCode}
                      </td>
                    )}

                    {isFirst && (
                      <td rowSpan={rowCount} className="border border-neutral-300 px-3 py-2 align-middle">
                        {group.subjectName}
                      </td>
                    )}

                    <td className="border border-neutral-300 px-3 py-2 text-center font-mono text-xs">{row.blockNo}</td>

                    <td className="border border-neutral-300 px-3 py-2">{row.location}</td>

                    <td className="border border-neutral-300 px-3 py-2 text-center font-mono text-xs">
                      <span className="font-medium">{row.scheme}</span>
                      <span className="mx-1 text-neutral-400">·</span>
                      <span className="font-bold">{row.students}</span>
                    </td>
                  </tr>
                );
              });
            })}
          </tbody>
          {/* GRAND TOTAL ROW */}
          <tfoot>
            <tr className="border-t-2 border-neutral-400 bg-neutral-100">
              <td colSpan={3} className="border border-neutral-300 px-3 py-2 text-right font-bold text-neutral-800">
                GRAND TOTAL
              </td>
              <td className="border border-neutral-300 px-3 py-2 text-center font-mono text-xs text-neutral-600">
                {totalBlocks} Blocks
              </td>
              <td className="border border-neutral-300 px-3 py-2 text-center font-bold text-neutral-900">
                {totalStudents}
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

export default function SubjectAllocationReport() {
  const { examCenter, isLoading: userLoading } = useUserInfo();

  const [groups, setGroups] = useState<SubjectGroup[]>([]);
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
        setGroups([]);
        setShowReport(false);
        return;
      }

      const subjectMap = new Map<string, SubjectGroup>();

      result.data.forEach((alloc: any) => {
        const key = alloc.subjectCode;
        if (!subjectMap.has(key)) {
          subjectMap.set(key, {
            subjectCode: alloc.subjectCode,
            subjectName: alloc.subjectName || alloc.subjectCode,
            rows: [],
            totalStudents: 0,
          });
        }

        const group = subjectMap.get(key)!;
        const students = alloc.assignedCount || alloc.seatNumbers?.length || 0;
        const scheme = alloc.scheme || alloc.schemeName || '';

        group.rows.push({
          subjectCode: alloc.subjectCode,
          subjectName: alloc.subjectName || alloc.subjectCode,
          blockNo: alloc.blockNo || alloc.location || '—',
          location: alloc.location || '—',
          scheme: scheme,
          students,
        });
        group.totalStudents += students;
      });

      const sortedGroups = Array.from(subjectMap.values()).sort((a, b) => a.subjectCode.localeCompare(b.subjectCode));

      sortedGroups.forEach(group => {
        group.rows.sort((a, b) => {
          const aNum = parseInt(a.blockNo) || 0;
          const bNum = parseInt(b.blockNo) || 0;
          return aNum - bNum;
        });
      });

      setGroups(sortedGroups);
      setShowReport(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
      setGroups([]);
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
    setGroups([]);
    setError(null);
  };

  // Build pages
  const buildPages = (): SubjectAllocationPageData[] => {
    const MAX_ROWS_PER_PAGE = 40;

    if (groups.length === 0) return [];

    const totalRows = groups.reduce((sum, g) => sum + g.rows.length, 0);

    if (totalRows <= MAX_ROWS_PER_PAGE) {
      return [
        {
          id: 'subject-allocation',
          groups: groups,
          metadata: {
            Subjects: groups.length,
            Blocks: totalRows,
            Students: groups.reduce((sum, g) => sum + g.totalStudents, 0),
          },
        },
      ];
    }

    const pages: SubjectAllocationPageData[] = [];
    let currentGroups: SubjectGroup[] = [];
    let currentRowCount = 0;

    for (const group of groups) {
      const groupRowCount = group.rows.length;

      if (currentRowCount + groupRowCount > MAX_ROWS_PER_PAGE && currentGroups.length > 0) {
        pages.push({
          id: `subject-allocation-${pages.length + 1}`,
          groups: [...currentGroups],
          metadata: {
            Page: pages.length + 1,
            Subjects: currentGroups.length,
            Blocks: currentRowCount,
            Students: currentGroups.reduce((sum, g) => sum + g.totalStudents, 0),
          },
        });
        currentGroups = [];
        currentRowCount = 0;
      }

      currentGroups.push(group);
      currentRowCount += groupRowCount;
    }

    if (currentGroups.length > 0) {
      pages.push({
        id: `subject-allocation-${pages.length + 1}`,
        groups: [...currentGroups],
        metadata: {
          Page: pages.length + 1,
          Subjects: currentGroups.length,
          Blocks: currentRowCount,
          Students: currentGroups.reduce((sum, g) => sum + g.totalStudents, 0),
        },
      });
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
            title="Subject Allocation Report"
            description="Select date & session to view subject-wise block distribution"
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
          title: 'Subject Allocation Report',
          description: 'Subject-wise block distribution for question paper dispatch',
          examCenter: {
            name: examCenter?.name || 'Examination Center',
            code: examCenter?.code || '',
            season: examCenter?.season || '',
            year: examCenter?.examYear || new Date().getFullYear(),
            session: (selectedSession as 'Morning' | 'Afternoon') || 'Morning',
            date: selectedDate ? new Date(selectedDate) : new Date(),
          },
          headerFields: {
            Subjects: String(groups.length),
            Blocks: String(groups.reduce((sum, g) => sum + g.rows.length, 0)),
            Students: String(groups.reduce((sum, g) => sum + g.totalStudents, 0)),
          },
        }}
        footer={{
          showTestForgeCredit: true,
        }}
        onBack={handleReset}
        backButtonLabel="Clear"
        documentTitle="Subject_Allocation_Report"
        numberOfCopies={numberOfCopies}
        onCopiesChange={setNumberOfCopies}
        renderPageContent={renderSubjectAllocationTable as (pageData: ReportPageData) => ReactNode}
        showCopyInfo={numberOfCopies > 1}
        copyInfoText="Copy {copyNumber} of {totalCopies}"
      />
    </div>
  );
}
