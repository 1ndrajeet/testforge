// modules/testforge-reports/qp-accounting.tsx
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
import { getQPInventory } from '@/lib/actions/inventory';
import { getTimetableEntries } from '@/lib/actions/timetable';
import { cn } from '@/lib/utils';

// ============================================================
// Types
// ============================================================

interface QPRow {
  scheme: string;
  subjectAbbr: string;
  subjectCode: string;
  subjectName: string;
  totalReceived: number;
  totalStudents: number;
  usedForRAC: number;
  codeWiseUsed: number;
  codeWiseBalance: number;
}

interface QPAccountingPageData extends ReportPageData {
  rows: QPRow[];
  date: Date;
  totalSubjects: number;
  totalReceived: number;
  totalStudents: number;
  totalUsed: number;
  totalBalance: number;
}

// ============================================================
// Render Function
// ============================================================

const renderQPAccountingTable = (pageData: QPAccountingPageData) => {
  const { rows, totalReceived, totalStudents, totalUsed, totalBalance } = pageData;

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-hidden">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-neutral-100">
              <th className="w-[6%] border border-neutral-300 px-3 py-2 text-center font-semibold text-neutral-700">
                Sr. No.
              </th>
              <th className="w-[18%] border border-neutral-300 px-3 py-2 text-left font-semibold text-neutral-700">
                Scheme
              </th>
              <th className="w-[10%] border border-neutral-300 px-3 py-2 text-left font-semibold text-neutral-700">
                Subject Abbr.
              </th>
              <th className="w-[14%] border border-neutral-300 px-3 py-2 text-left font-semibold text-neutral-700">
                Subject Code
              </th>
              <th className="w-[12%] border border-neutral-300 px-3 py-2 text-center font-semibold text-neutral-700">
                Total Received
              </th>
              <th className="w-[12%] border border-neutral-300 px-3 py-2 text-center font-semibold text-neutral-700">
                Total Students
              </th>
              <th className="w-[10%] border border-neutral-300 px-3 py-2 text-center font-semibold text-neutral-700">
                Used for RAC
              </th>
              <th className="w-[12%] border border-neutral-300 px-3 py-2 text-center font-semibold text-neutral-700">
                Code Wise Used
              </th>
              <th className="w-[12%] border border-neutral-300 px-3 py-2 text-center font-semibold text-neutral-700">
                Code Wise Balance
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={`${row.subjectCode}-${index}`}
                className={cn('border-b border-neutral-200', index % 2 === 0 ? 'bg-white' : 'bg-neutral-50')}
              >
                <td className="border border-neutral-300 px-3 py-2 text-center font-mono text-xs">{index + 1}</td>
                <td className="border border-neutral-300 px-3 py-2 font-mono text-xs">{row.scheme}</td>
                <td className="border border-neutral-300 px-3 py-2 font-mono text-xs font-medium">{row.subjectAbbr}</td>
                <td className="border border-neutral-300 px-3 py-2 font-mono text-xs font-medium">{row.subjectCode}</td>
                <td className="border border-neutral-300 px-3 py-2 text-center font-mono text-xs font-bold text-neutral-800">
                  {row.totalReceived}
                </td>
                <td className="border border-neutral-300 px-3 py-2 text-center font-mono text-xs">
                  {row.totalStudents}
                </td>
                <td className="border border-neutral-300 px-3 py-2 text-center font-mono text-xs">{row.usedForRAC}</td>
                <td className="border border-neutral-300 px-3 py-2 text-center font-mono text-xs font-medium">
                  {row.codeWiseUsed}
                </td>
                <td className="border border-neutral-300 px-3 py-2 text-center font-mono text-xs font-bold text-neutral-800">
                  {row.codeWiseBalance}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-neutral-400 bg-neutral-100">
              <td colSpan={4} className="border border-neutral-300 px-3 py-2 text-right font-bold text-neutral-800">
                GRAND TOTAL
              </td>
              <td className="border border-neutral-300 px-3 py-2 text-center font-bold text-neutral-900">
                {totalReceived}
              </td>
              <td className="border border-neutral-300 px-3 py-2 text-center font-bold text-neutral-900">
                {totalStudents}
              </td>
              <td className="border border-neutral-300 px-3 py-2 text-center font-mono text-xs text-neutral-600">
                {totalUsed}
              </td>
              <td className="border border-neutral-300 px-3 py-2 text-center font-mono text-xs text-neutral-600">
                {totalUsed}
              </td>
              <td className="border border-neutral-300 px-3 py-2 text-center font-bold text-neutral-900">
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

export default function QPAccountingReport() {
  const { examCenter, isLoading: userLoading } = useUserInfo();

  const [rows, setRows] = useState<QPRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingDates, setLoadingDates] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dates, setDates] = useState<Date[]>([]);
  const [selectedDate, setSelectedDate] = useState('');
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

  // Fetch data - fetch ALL sessions for the date
  const fetchData = async (date: string) => {
    setLoading(true);
    setError(null);

    try {
      // Get allocations for the date (all sessions)
      // First try Morning
      let allocResult = await getAllocationsByDateSession(new Date(date), 'Morning');
      let allAllocations: any[] = [];

      if (allocResult.success && allocResult.data) {
        allAllocations = [...allAllocations, ...allocResult.data];
      }

      // Then try Afternoon
      allocResult = await getAllocationsByDateSession(new Date(date), 'Afternoon');
      if (allocResult.success && allocResult.data) {
        allAllocations = [...allAllocations, ...allocResult.data];
      }

      if (allAllocations.length === 0) {
        setError('No allocation data found for the selected date');
        setRows([]);
        setShowReport(false);
        return;
      }

      // Get inventory data for the date (all sessions)
      const inventoryResult = await getQPInventory(new Date(date), undefined); // undefined = all sessions

      // Build inventory map: subjectCode -> totalReceived (QPs)
      const inventoryMap = new Map<string, number>();
      if (inventoryResult.success && inventoryResult.data) {
        inventoryResult.data.forEach((item: any) => {
          const qps = item.receivedQps || 0;
          const current = inventoryMap.get(item.subjectCode) || 0;
          inventoryMap.set(item.subjectCode, current + qps);
        });
      }

      // Group allocations by subject code
      const subjectMap = new Map<
        string,
        {
          schemes: Set<string>;
          subjectAbbr: string;
          subjectName: string;
          totalStudents: number;
        }
      >();

      allAllocations.forEach((alloc: any) => {
        const students = alloc.assignedCount || alloc.seatNumbers?.length || 0;
        const scheme = alloc.scheme || '';
        const subjectCode = alloc.subjectCode || '';
        const subjectName = alloc.subjectName || alloc.subjectCode || '';

        // Generate subject abbreviation (first letters of each word)
        const subjectAbbr =
          subjectName
            .split(' ')
            .filter((w: string) => w.length > 0)
            .map((w: string) => w[0])
            .join('')
            .toUpperCase()
            .slice(0, 4) || subjectCode.slice(0, 4);

        if (!subjectMap.has(subjectCode)) {
          subjectMap.set(subjectCode, {
            schemes: new Set(),
            subjectAbbr: subjectAbbr,
            subjectName: subjectName,
            totalStudents: 0,
          });
        }

        const entry = subjectMap.get(subjectCode)!;
        entry.schemes.add(scheme);
        entry.totalStudents += students;
      });

      const qpRows: QPRow[] = [];

      subjectMap.forEach((value, subjectCode) => {
        const totalStudents = value.totalStudents;
        const totalReceived = inventoryMap.get(subjectCode) || 0;
        const schemesCount = value.schemes.size;
        const usedForRAC = 2 * schemesCount;
        const codeWiseUsed = totalStudents + usedForRAC;
        const codeWiseBalance = totalReceived - codeWiseUsed;

        qpRows.push({
          scheme: Array.from(value.schemes).join(', '),
          subjectAbbr: value.subjectAbbr,
          subjectCode: subjectCode,
          subjectName: value.subjectName,
          totalReceived: totalReceived,
          totalStudents: totalStudents,
          usedForRAC: usedForRAC,
          codeWiseUsed: codeWiseUsed,
          codeWiseBalance: codeWiseBalance,
        });
      });

      // Sort by subject code
      qpRows.sort((a, b) => a.subjectCode.localeCompare(b.subjectCode));

      if (qpRows.length === 0) {
        setError('No data found for this date');
        setRows([]);
        setShowReport(false);
        return;
      }

      setRows(qpRows);
      setShowReport(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
      setRows([]);
      setShowReport(false);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = async (session: { date: string; session: 'Morning' | 'Afternoon' | 'All' }) => {
    setSelectedDate(session.date);
    await fetchData(session.date);
  };

  const handleReset = () => {
    setShowReport(false);
    setRows([]);
    setError(null);
  };

  // Build pages
  const buildPages = (): QPAccountingPageData[] => {
    if (rows.length === 0) return [];

    const totalSubjects = rows.length;
    const totalReceived = rows.reduce((sum, r) => sum + r.totalReceived, 0);
    const totalStudents = rows.reduce((sum, r) => sum + r.totalStudents, 0);
    const totalUsed = rows.reduce((sum, r) => sum + r.codeWiseUsed, 0);
    const totalBalance = rows.reduce((sum, r) => sum + r.codeWiseBalance, 0);

    if (rows.length <= 25) {
      return [
        {
          id: 'qp-accounting-all',
          rows: rows,
          date: new Date(selectedDate),
          totalSubjects,
          totalReceived,
          totalStudents,
          totalUsed,
          totalBalance,
          metadata: {
            Subjects: String(totalSubjects),
            Students: String(totalStudents),
            'Total Received': String(totalReceived),
            Balance: String(totalBalance),
          },
        },
      ];
    }

    const MAX_ROWS_PER_PAGE = 25;
    const pages: QPAccountingPageData[] = [];
    let startIdx = 0;

    while (startIdx < rows.length) {
      const chunk = rows.slice(startIdx, startIdx + MAX_ROWS_PER_PAGE);
      const chunkSubjects = chunk.length;
      const chunkReceived = chunk.reduce((sum, r) => sum + r.totalReceived, 0);
      const chunkStudents = chunk.reduce((sum, r) => sum + r.totalStudents, 0);
      const chunkUsed = chunk.reduce((sum, r) => sum + r.codeWiseUsed, 0);
      const chunkBalance = chunk.reduce((sum, r) => sum + r.codeWiseBalance, 0);

      pages.push({
        id: `qp-accounting-${pages.length + 1}`,
        rows: chunk,
        date: new Date(selectedDate),
        totalSubjects: chunkSubjects,
        totalReceived: chunkReceived,
        totalStudents: chunkStudents,
        totalUsed: chunkUsed,
        totalBalance: chunkBalance,
        metadata: {
          Page: String(pages.length + 1),
          Subjects: String(chunkSubjects),
          Students: String(chunkStudents),
          'Total Received': String(chunkReceived),
          Balance: String(chunkBalance),
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
            onSessionSelect={handleSelect}
            defaultDate={selectedDate}
            defaultSession="Morning"
            isLoading={loading}
            error={error}
            title="QP Accounting Report"
            description="Select date to view question paper accounting"
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
          title: 'ACCOUNT OF QUESTION PAPERS',
          description: 'Question paper accounting summary for examination',
          examCenter: {
            name: examCenter?.name || 'Examination Center',
            code: examCenter?.code || '',
            season: examCenter?.season || '',
            year: examCenter?.examYear || new Date().getFullYear(),
            session: 'Morning',
            date: selectedDate ? new Date(selectedDate) : new Date(),
          },
          headerFields: {
            Subjects: String(pages[0]?.totalSubjects || 0),
            Students: String(pages[0]?.totalStudents || 0),
            'Total Received': String(pages[0]?.totalReceived || 0),
            Balance: String(pages[0]?.totalBalance || 0),
          },
        }}
        footer={{
          showTestForgeCredit: true,
          creditText: 'Generated by TestForge',
        }}
        onBack={handleReset}
        backButtonLabel="Clear"
        documentTitle="QP_Accounting_Report"
        numberOfCopies={numberOfCopies}
        onCopiesChange={setNumberOfCopies}
        renderPageContent={renderQPAccountingTable as (pageData: ReportPageData) => ReactNode}
        showCopyInfo={numberOfCopies > 1}
        copyInfoText="Copy {copyNumber} of {totalCopies}"
      />
    </div>
  );
}
