// modules/testforge-reports/qp-summary.tsx
'use client';

import { ReactNode, useCallback, useEffect, useState } from 'react';

import { format } from 'date-fns';
import { AlertCircle } from 'lucide-react';

import { MultiPageReport, ReportPageData } from '@/components/layout/testforge-report-layout';
import { SessionSelector } from '@/components/shared/date-selector';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useUserInfo } from '@/hooks/useUserInfo';
import { getQPInventory } from '@/lib/actions/inventory';
import { getTimetableEntries } from '@/lib/actions/timetable';
import { cn } from '@/lib/utils';

// ============================================================
// Types
// ============================================================

interface QPRow {
  subjectCode: string;
  subjectAbbr: string;
  schemes: string;
  totalReceived: number;
  totalStudents: number;
  usedForRAC: number;
  codeWiseTotalUsed: number;
  codeWiseBalance: number;
}

interface QPSummaryPageData extends ReportPageData {
  rows: QPRow[];
  date: Date;
  totalSubjects: number;
  totalStudents: number;
  totalReceived: number;
  totalBalance: number;
}

// ============================================================
// Render Function
// ============================================================

const renderQPSummaryTable = (pageData: QPSummaryPageData) => {
  const { rows, totalSubjects, totalStudents, totalReceived, totalBalance } = pageData;

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-hidden">
        <table className="w-full border-collapse border border-black text-xs">
          <thead>
            <tr className="bg-neutral-100 print:bg-neutral-100">
              <th className="w-[6%] border border-black p-1.5 text-center font-bold">Sr. No.</th>
              <th className="w-[20%] border border-black p-1.5 text-left font-bold">Scheme</th>
              <th className="w-[10%] border border-black p-1.5 text-left font-bold">Subject Abbr.</th>
              <th className="w-[10%] border border-black p-1.5 text-left font-bold">Subject Code</th>
              <th className="w-[10%] border border-black p-1.5 text-center font-bold">Total Received</th>
              <th className="w-[10%] border border-black p-1.5 text-center font-bold">Total Students</th>
              <th className="w-[10%] border border-black p-1.5 text-center font-bold">Used for RAC</th>
              <th className="w-[12%] border border-black p-1.5 text-center font-bold">Code Wise Total Used</th>
              <th className="w-[12%] border border-black p-1.5 text-center font-bold">Code Wise Balance</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.subjectCode} className={cn('border-b border-black')}>
                <td className="border border-black p-1.5 text-center font-mono">{index + 1}</td>
                <td className="border border-black p-1.5 pl-2 text-left">
                  <span className="text-[10px]">{row.schemes}</span>
                </td>
                <td className="border border-black p-1.5 pl-2 text-left font-mono">{row.subjectAbbr}</td>
                <td className="border border-black p-1.5 pl-2 text-left font-mono font-medium">{row.subjectCode}</td>
                <td className="border border-black p-1.5 text-center font-semibold">{row.totalReceived}</td>
                <td className="border border-black p-1.5 text-center font-semibold">{row.totalStudents}</td>
                <td className="border border-black p-1.5 text-center font-semibold">{row.usedForRAC}</td>
                <td className="border border-black p-1.5 text-center font-semibold">{row.codeWiseTotalUsed}</td>
                <td
                  className={cn(
                    'border border-black p-1.5 text-center font-bold',
                    row.codeWiseBalance < 0
                      ? 'text-red-600'
                      : row.codeWiseBalance === 0
                        ? 'text-neutral-500'
                        : 'text-emerald-600'
                  )}
                >
                  {row.codeWiseBalance}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-black bg-neutral-200 font-bold print:bg-neutral-200">
              <td colSpan={4} className="border border-black p-1.5 pr-4 text-right">
                GRAND TOTAL
              </td>
              <td className="border border-black p-1.5 text-center">{totalReceived}</td>
              <td className="border border-black p-1.5 text-center">{totalStudents}</td>
              <td className="border border-black p-1.5 text-center">{totalSubjects * 2}</td>
              <td className="border border-black p-1.5 text-center">{totalStudents + totalSubjects * 2}</td>
              <td
                className={cn(
                  'border border-black p-1.5 text-center',
                  totalBalance < 0 ? 'text-red-600' : totalBalance === 0 ? 'text-neutral-500' : 'text-emerald-600'
                )}
              >
                {totalBalance}
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

export default function QPSummaryReport() {
  const { examCenter, isLoading: userLoading } = useUserInfo();

  const [rows, setRows] = useState<QPRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingDates, setLoadingDates] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dates, setDates] = useState<Date[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedDateStr, setSelectedDateStr] = useState('');
  const [showReport, setShowReport] = useState(false);
  const [numberOfCopies, setNumberOfCopies] = useState(1);
  const [showSelection, setShowSelection] = useState(true);

  // Fetch available dates
  useEffect(() => {
    const fetchDates = async () => {
      try {
        const result = await getTimetableEntries();
        if (result.success && result.data) {
          const unique = [...new Set(result.data.map((r: any) => r.date))];
          const dateObjects = unique.map((d: string) => new Date(d));
          setDates(dateObjects);
          if (dateObjects.length) {
            setSelectedDate(dateObjects[0]);
            setSelectedDateStr(format(dateObjects[0], 'yyyy-MM-dd'));
          }
        }
      } catch (error) {
        console.error('Failed to fetch dates:', error);
      } finally {
        setLoadingDates(false);
      }
    };
    fetchDates();
  }, []);

  // Fetch data - get inventory for the date
  const fetchData = useCallback(async (date: Date) => {
    setLoading(true);
    setError(null);

    try {
      // Get inventory for the date (all sessions)
      const inventoryResult = await getQPInventory(date);

      if (!inventoryResult.success || !inventoryResult.data || inventoryResult.data.length === 0) {
        setError('No inventory data found for the selected date');
        setRows([]);
        setShowReport(false);
        return;
      }

      // Group by subject code to combine multiple sessions/schemes
      const groupedData = new Map<
        string,
        {
          subjectCode: string;
          subjectAbbr: string;
          schemes: Set<string>;
          totalStudents: number;
          totalReceived: number;
        }
      >();

      inventoryResult.data.forEach((item: any) => {
        // Map fields from qpInventory table
        const code = item.subjectCode || '';
        if (!code) return;

        if (!groupedData.has(code)) {
          // Get subject abbreviation from subjectName or code
          const subjectAbbr = item.subjectName ? item.subjectName.split('-')[0] : code;

          groupedData.set(code, {
            subjectCode: code,
            subjectAbbr: subjectAbbr,
            schemes: new Set<string>(),
            totalStudents: 0,
            totalReceived: 0,
          });
        }

        const group = groupedData.get(code)!;

        // Get scheme - try multiple sources
        const scheme = item.scheme || item.schemeName || '';
        if (scheme) {
          group.schemes.add(scheme);
        }

        // Add students and received QPs
        group.totalStudents += item.expectedStudents || item.studentCount || 0;
        group.totalReceived += item.receivedQps || item.receivedCount || 0;
      });

      // Build rows from grouped data with RAC calculations
      const qpRows: QPRow[] = Array.from(groupedData.values()).map(group => {
        const schemesArray = Array.from(group.schemes).filter(s => s);
        const schemes = schemesArray.join(', ') || 'N/A';
        const schemesCount = schemesArray.length || 1;
        const usedForRAC = 2 * schemesCount;
        const codeWiseTotalUsed = usedForRAC + group.totalStudents;
        const codeWiseBalance = group.totalReceived - codeWiseTotalUsed;

        return {
          subjectCode: group.subjectCode,
          subjectAbbr: group.subjectAbbr,
          schemes: schemes,
          totalStudents: group.totalStudents,
          totalReceived: group.totalReceived,
          usedForRAC: usedForRAC,
          codeWiseTotalUsed: codeWiseTotalUsed,
          codeWiseBalance: codeWiseBalance,
        };
      });

      // Sort by subject code
      qpRows.sort((a, b) => a.subjectCode.localeCompare(b.subjectCode));

      // Filter out rows with zero received
      const filteredRows = qpRows.filter(row => row.totalReceived > 0);

      if (filteredRows.length === 0) {
        setError('No valid data found for this date');
        setRows([]);
        setShowReport(false);
        return;
      }

      setRows(filteredRows);
      setShowReport(true);
      setShowSelection(false);
    } catch (err) {
      console.error('Error fetching data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
      setRows([]);
      setShowReport(false);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSelect = useCallback(
    async (session: { date: string; session: 'Morning' | 'Afternoon' | 'All' }) => {
      const dateObj = new Date(session.date);
      setSelectedDate(dateObj);
      setSelectedDateStr(session.date);
      await fetchData(dateObj);
    },
    [fetchData]
  );

  const handleReset = useCallback(() => {
    setShowReport(false);
    setShowSelection(true);
    setRows([]);
    setError(null);
  }, []);

  // Build pages with pagination (max 20 rows per page)
  const buildPages = useCallback((): QPSummaryPageData[] => {
    if (rows.length === 0) return [];

    const totalSubjects = rows.length;
    const totalStudents = rows.reduce((sum, r) => sum + r.totalStudents, 0);
    const totalReceived = rows.reduce((sum, r) => sum + r.totalReceived, 0);
    const totalBalance = rows.reduce((sum, r) => sum + r.codeWiseBalance, 0);

    const MAX_ROWS_PER_PAGE = 20;

    if (rows.length <= MAX_ROWS_PER_PAGE) {
      return [
        {
          id: 'qp-summary',
          rows: rows,
          date: selectedDate || new Date(),
          totalSubjects,
          totalStudents,
          totalReceived,
          totalBalance,
          metadata: {
            'Total Subjects': totalSubjects,
            'Total Students': totalStudents,
            'Total Received': totalReceived,
            'Total Balance': totalBalance,
          },
        },
      ];
    }

    const pages: QPSummaryPageData[] = [];
    let startIdx = 0;

    while (startIdx < rows.length) {
      const chunk = rows.slice(startIdx, startIdx + MAX_ROWS_PER_PAGE);
      const chunkSubjects = chunk.length;
      const chunkStudents = chunk.reduce((sum, r) => sum + r.totalStudents, 0);
      const chunkReceived = chunk.reduce((sum, r) => sum + r.totalReceived, 0);
      const chunkBalance = chunk.reduce((sum, r) => sum + r.codeWiseBalance, 0);

      pages.push({
        id: `qp-summary-${pages.length + 1}`,
        rows: chunk,
        date: selectedDate || new Date(),
        totalSubjects: chunkSubjects,
        totalStudents: chunkStudents,
        totalReceived: chunkReceived,
        totalBalance: chunkBalance,
        metadata: {
          Page: String(pages.length + 1),
          'Total Subjects': chunkSubjects,
          'Total Students': chunkStudents,
          'Total Received': chunkReceived,
          'Total Balance': chunkBalance,
        },
      });

      startIdx += MAX_ROWS_PER_PAGE;
    }

    return pages;
  }, [rows, selectedDate]);

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
  if (showSelection) {
    return (
      <div className="mx-auto max-w-4xl p-4">
        <div className="space-y-4">
          <SessionSelector
            availableDates={dates}
            availableSessions={['Morning', 'Afternoon', 'All']}
            onSessionSelect={handleSelect}
            defaultDate={selectedDateStr || (dates.length > 0 ? format(dates[0], 'yyyy-MM-dd') : '')}
            defaultSession="Morning"
            isLoading={loading}
            hideSession
            error={error}
            title="QP Accounting Summary"
            description="Choose a date to generate QP summary"
            compact
          />

          {!dates.length && !error && (
            <Alert variant="default" className="border-amber-200 bg-amber-50">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <AlertDescription>Please upload timetable and inventory data first.</AlertDescription>
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
          title: 'ACCOUNT OF QUESTION PAPERS',
          description: 'QP Inventory Summary Report',
          examCenter: {
            name: examCenter?.name || 'Examination Center',
            code: examCenter?.code || '',
            season: examCenter?.season || '',
            year: examCenter?.examYear || new Date().getFullYear(),
            date: selectedDate || new Date(),
          },
          headerFields: {
            'Total Subjects': String(pages[0]?.totalSubjects || 0),
            'Total Students': String(pages[0]?.totalStudents || 0),
            'Total QP Received': String(pages[0]?.totalReceived || 0),
            Balance: String(pages[0]?.totalBalance || 0),
          },
        }}
        footer={{
          showTestForgeCredit: true,
        }}
        onBack={handleReset}
        backButtonLabel="Clear"
        documentTitle="QP_Summary_Report"
        numberOfCopies={numberOfCopies}
        onCopiesChange={setNumberOfCopies}
        renderPageContent={renderQPSummaryTable as (pageData: ReportPageData) => ReactNode}
        showCopyInfo={numberOfCopies > 1}
        copyInfoText="Copy {copyNumber} of {totalCopies}"
      />
    </div>
  );
}
