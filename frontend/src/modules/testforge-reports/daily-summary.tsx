// modules/testforge-reports/daily-summary.tsx
'use client';

import { ReactNode, useCallback, useEffect, useState } from 'react';

import { format } from 'date-fns';
import { AlertCircle } from 'lucide-react';

import { MultiPageReport, ReportPageData } from '@/components/layout/testforge-report-layout';
import { SessionSelector } from '@/components/shared/date-selector';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useUserInfo } from '@/hooks/useUserInfo';
import { getAllocationsByDateSession } from '@/lib/actions/allocation';
import { getQPInventory } from '@/lib/actions/inventory';
import { getTimetableEntries, getUniqueDates } from '@/lib/actions/timetable';
import { cn } from '@/lib/utils';

// ============================================================
// Types
// ============================================================

interface DailySummaryRow {
  subjectCode: string;
  subjectName: string;
  scheme: string;
  blockNo: string;
  location: string;
  supervisorName: string;
  totalStudents: number;
  presentCount: number;
  absentCount: number;
  copyCaseCount: number;
  packetsReceived: number;
  packetsExpected: number;
  status: 'complete' | 'pending' | 'discrepancy';
}

interface DailySummaryPageData extends ReportPageData {
  rows: DailySummaryRow[];
  date: Date;
  session: string;
  totalBlocks: number;
  totalStudents: number;
  totalPresent: number;
  totalAbsent: number;
  totalCopyCases: number;
  totalSubjects: number;
  attendanceRate: number;
  packetDiscrepancy: number;
}

// ============================================================
// Render Function
// ============================================================

const renderDailySummaryTable = (pageData: DailySummaryPageData) => {
  const { rows, totalBlocks, totalStudents, totalPresent, totalAbsent, totalCopyCases, totalSubjects, attendanceRate } =
    pageData;

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-hidden">
        <table className="w-full border-collapse border border-black text-xs">
          <thead>
            <tr className="bg-neutral-100 print:bg-neutral-100">
              <th className="w-[6%] border border-black p-1.5 text-center font-bold">Sr. No.</th>
              <th className="w-[10%] border border-black p-1.5 text-center font-bold">Block</th>
              <th className="w-[12%] border border-black p-1.5 text-left font-bold">Subject</th>
              <th className="w-[10%] border border-black p-1.5 text-left font-bold">Scheme</th>
              <th className="w-[14%] border border-black p-1.5 text-left font-bold">Supervisor</th>
              <th className="w-[10%] border border-black p-1.5 text-center font-bold">Total</th>
              <th className="w-[10%] border border-black p-1.5 text-center font-bold">Present</th>
              <th className="w-[10%] border border-black p-1.5 text-center font-bold">Absent</th>
              <th className="w-[10%] border border-black p-1.5 text-center font-bold">Copy Cases</th>
              <th className="w-[8%] border border-black p-1.5 text-center font-bold">Remarks</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const present = row.totalStudents - row.absentCount - row.copyCaseCount;

              // Check if this is the first row of a new block
              const isFirstBlockRow = index === 0 || rows[index - 1].blockNo !== row.blockNo;

              // Count how many rows belong to this block
              let blockRowCount = 0;
              if (isFirstBlockRow) {
                for (let i = index; i < rows.length && rows[i].blockNo === row.blockNo; i++) {
                  blockRowCount++;
                }
              }

              return (
                <tr key={`${row.subjectCode}-${row.scheme}-${index}`} className={cn('border-b border-black')}>
                  <td className="border border-black p-1.5 text-center font-mono">{index + 1}</td>
                  {isFirstBlockRow && (
                    <td
                      rowSpan={blockRowCount}
                      className="border border-black p-1.5 text-center align-middle font-mono text-xs"
                    >
                      {row.blockNo}
                      <br />
                      <span className="text-xs font-medium text-neutral-700">Block {row.location}</span>
                    </td>
                  )}

                  <td className="border border-black p-1.5 pl-2 text-left">
                    <div className="flex flex-col">
                      <span className="font-mono text-[10px] font-medium">{row.subjectCode}</span>
                      <span className="text-[9px] text-neutral-600">{row.subjectName}</span>
                    </div>
                  </td>
                  <td className="border border-black p-1.5 pl-2 text-left font-mono text-[10px]">{row.scheme}</td>
                  <td className="border border-black p-1.5 pl-2 text-left text-[10px]">
                    {row.supervisorName || 'Not Assigned'}
                  </td>
                  <td className="border border-black p-1.5 text-center font-semibold">{row.totalStudents}</td>
                  <td className="border border-black p-1.5 text-center font-semibold text-emerald-600">{present}</td>
                  <td className="border border-black p-1.5 text-center font-semibold text-rose-600">
                    {row.absentCount}
                  </td>
                  <td className="border border-black p-1.5 text-center font-semibold text-amber-600">
                    {row.copyCaseCount}
                  </td>
                  <td className="border border-black p-1.5 text-center">
                    <span className={cn('text-[9px] font-medium')}></span>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-black bg-neutral-200 font-bold print:bg-neutral-200">
              <td colSpan={5} className="border border-black p-1.5 pr-4 text-right">
                GRAND TOTAL
              </td>
              <td className="border border-black p-1.5 text-center">{totalStudents}</td>
              <td className="border border-black p-1.5 text-center text-emerald-600">{totalPresent}</td>
              <td className="border border-black p-1.5 text-center text-rose-600">{totalAbsent}</td>
              <td className="border border-black p-1.5 text-center text-amber-600">{totalCopyCases}</td>
              <td className="border border-black p-1.5 text-center">
                <span className="text-[10px] text-neutral-600">{attendanceRate.toFixed(1)}% attendance</span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Footer Info */}
      <div className="mt-2 border-t border-black pt-1.5 text-[9px]">
        <div className="flex justify-between">
          <span>
            <span className="font-medium">Total Blocks:</span> {totalBlocks} &nbsp;|&nbsp;
            <span className="font-medium">Total Subjects:</span> {totalSubjects}
          </span>
          <span>
            <span className="font-medium">Attendance:</span> {attendanceRate.toFixed(1)}%
          </span>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// Main Component
// ============================================================

export default function DailySummaryReport() {
  const { examCenter, isLoading: userLoading } = useUserInfo();

  const [rows, setRows] = useState<DailySummaryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingDates, setLoadingDates] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dates, setDates] = useState<Date[]>([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedSession, setSelectedSession] = useState('');
  const [showReport, setShowReport] = useState(false);
  const [numberOfCopies, setNumberOfCopies] = useState(1);

  // Stats summary
  const [stats, setStats] = useState<{
    totalStudents: number;
    totalPresent: number;
    totalAbsent: number;
    totalCopyCases: number;
    totalSubjects: number;
    totalBlocks: number;
    attendanceRate: number;
    packetDiscrepancy: number;
  } | null>(null);

  // Fetch available dates
  useEffect(() => {
    const fetchDates = async () => {
      const result = await getUniqueDates();
      if (result.success && result.data) {
        setDates(result.data);
        if (result.data.length) {
          setSelectedDate(format(result.data[0], 'yyyy-MM-dd'));
        }
      }
      setLoadingDates(false);
    };
    fetchDates();
  }, []);

  // Fetch data for the selected date and session
  const fetchData = useCallback(async (date: string, session: string) => {
    setLoading(true);
    setError(null);

    try {
      // Get allocations for the session
      const allocationsResult = await getAllocationsByDateSession(new Date(date), session);

      if (!allocationsResult.success || !allocationsResult.data || allocationsResult.data.length === 0) {
        setError('No allocation data found for the selected session');
        setRows([]);
        setShowReport(false);
        return;
      }

      // Get timetable entries to fetch absent and copy case data
      const timetableResult = await getTimetableEntries({
        date: new Date(date),
        session: session as 'Morning' | 'Afternoon',
      });

      // Build a map of (subjectCode + scheme) -> { absentNumbers, cpsStudents }
      const absentMap = new Map<string, { absent: number[]; cps: number[] }>();
      if (timetableResult.success && timetableResult.data) {
        timetableResult.data.forEach((entry: any) => {
          const key = `${entry.subjectCode}_${entry.scheme}`;
          absentMap.set(key, {
            absent: entry.absentNumbers || [],
            cps: entry.cpsStudents || [],
          });
        });
      }

      // Get QP inventory for packet data
      const inventoryResult = await getQPInventory(new Date(date));
      const packetMap = new Map<string, { expected: number; received: number }>();
      if (inventoryResult.success && inventoryResult.data) {
        inventoryResult.data.forEach((item: any) => {
          const key = `${item.subjectCode}_${item.session}`;
          packetMap.set(key, {
            expected: item.expectedPackets || 0,
            received: item.receivedPackets || 0,
          });
        });
      }

      // Build rows from allocations
      const summaryRows: DailySummaryRow[] = [];
      let totalStudents = 0;
      let totalAbsent = 0;
      let totalCopyCases = 0;
      let totalPacketDiscrepancy = 0;

      allocationsResult.data.forEach((alloc: any) => {
        const key = `${alloc.subjectCode}_${alloc.scheme}`;
        const absentData = absentMap.get(key);
        const absentCount = absentData?.absent?.length || 0;
        const copyCaseCount = absentData?.cps?.length || 0;
        const totalStudentsCount = alloc.assignedCount || alloc.seatNumbers?.length || 0;

        // Determine status
        let status: 'complete' | 'pending' | 'discrepancy' = 'pending';
        const packetKey = `${alloc.subjectCode}_${alloc.session}`;
        const packetData = packetMap.get(packetKey);

        if (packetData && packetData.received > 0) {
          if (packetData.received >= packetData.expected) {
            status = 'complete';
          } else {
            status = 'discrepancy';
            totalPacketDiscrepancy += packetData.expected - packetData.received;
          }
        }

        summaryRows.push({
          subjectCode: alloc.subjectCode,
          subjectName: alloc.subjectName || alloc.subjectCode,
          scheme: alloc.scheme || '',
          blockNo: alloc.blockNo || alloc.location || '—',
          location: alloc.location || '—',
          supervisorName: alloc.supervisorName || 'Not Assigned',
          totalStudents: totalStudentsCount,
          presentCount: totalStudentsCount - absentCount - copyCaseCount,
          absentCount: absentCount,
          copyCaseCount: copyCaseCount,
          packetsReceived: packetData?.received || 0,
          packetsExpected: packetData?.expected || 0,
          status: status,
        });

        totalStudents += totalStudentsCount;
        totalAbsent += absentCount;
        totalCopyCases += copyCaseCount;
      });

      // Sort rows by block number then subject code
      summaryRows.sort((a, b) => {
        const blockA = parseInt(a.blockNo) || 0;
        const blockB = parseInt(b.blockNo) || 0;
        if (blockA !== blockB) return blockA - blockB;
        return a.subjectCode.localeCompare(b.subjectCode);
      });

      // Calculate stats
      const totalPresent = totalStudents - totalAbsent - totalCopyCases;
      const attendanceRate = totalStudents > 0 ? (totalPresent / totalStudents) * 100 : 0;
      const uniqueBlocks = new Set(summaryRows.map(r => r.blockNo));
      const uniqueSubjects = new Set(summaryRows.map(r => r.subjectCode));

      setStats({
        totalStudents,
        totalPresent,
        totalAbsent,
        totalCopyCases,
        totalSubjects: uniqueSubjects.size,
        totalBlocks: uniqueBlocks.size,
        attendanceRate,
        packetDiscrepancy: totalPacketDiscrepancy,
      });

      if (summaryRows.length === 0) {
        setError('No data found for this session');
        setRows([]);
        setShowReport(false);
        return;
      }

      setRows(summaryRows);
      setShowReport(true);
    } catch (err) {
      console.error('Error fetching data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
      setRows([]);
      setShowReport(false);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSessionSelect = useCallback(
    async (session: { date: string; session: 'Morning' | 'Afternoon' | 'All' }) => {
      setSelectedDate(session.date);
      setSelectedSession(session.session);
      await fetchData(session.date, session.session);
    },
    [fetchData]
  );

  const handleReset = useCallback(() => {
    setShowReport(false);
    setRows([]);
    setError(null);
    setStats(null);
  }, []);

  // Build pages
  const buildPages = useCallback((): DailySummaryPageData[] => {
    if (rows.length === 0) return [];

    const totalStudents = rows.reduce((sum, r) => sum + r.totalStudents, 0);
    const totalPresent = rows.reduce((sum, r) => sum + r.presentCount, 0);
    const totalAbsent = rows.reduce((sum, r) => sum + r.absentCount, 0);
    const totalCopyCases = rows.reduce((sum, r) => sum + r.copyCaseCount, 0);
    const uniqueBlocks = new Set(rows.map(r => r.blockNo));
    const uniqueSubjects = new Set(rows.map(r => r.subjectCode));
    const attendanceRate = totalStudents > 0 ? (totalPresent / totalStudents) * 100 : 0;
    const packetDiscrepancy = rows.reduce((sum, r) => sum + (r.packetsExpected - r.packetsReceived), 0);

    const MAX_ROWS_PER_PAGE = 20;

    if (rows.length <= MAX_ROWS_PER_PAGE) {
      return [
        {
          id: 'daily-summary',
          rows: rows,
          date: new Date(selectedDate),
          session: selectedSession,
          totalBlocks: uniqueBlocks.size,
          totalStudents: totalStudents,
          totalPresent: totalPresent,
          totalAbsent: totalAbsent,
          totalCopyCases: totalCopyCases,
          totalSubjects: uniqueSubjects.size,
          attendanceRate: attendanceRate,
          packetDiscrepancy: Math.max(0, packetDiscrepancy),
          metadata: {
            'Total Students': totalStudents,
            Present: totalPresent,
            Absent: totalAbsent,
            'Copy Cases': totalCopyCases,
            Attendance: `${attendanceRate.toFixed(1)}%`,
          },
        },
      ];
    }

    // Split into multiple pages
    const pages: DailySummaryPageData[] = [];
    let startIdx = 0;

    while (startIdx < rows.length) {
      const chunk = rows.slice(startIdx, startIdx + MAX_ROWS_PER_PAGE);
      const chunkStudents = chunk.reduce((sum, r) => sum + r.totalStudents, 0);
      const chunkPresent = chunk.reduce((sum, r) => sum + r.presentCount, 0);
      const chunkAbsent = chunk.reduce((sum, r) => sum + r.absentCount, 0);
      const chunkCopyCases = chunk.reduce((sum, r) => sum + r.copyCaseCount, 0);
      const chunkBlocks = new Set(chunk.map(r => r.blockNo));
      const chunkSubjects = new Set(chunk.map(r => r.subjectCode));
      const chunkAttend = chunkStudents > 0 ? (chunkPresent / chunkStudents) * 100 : 0;
      const chunkPacketDisc = chunk.reduce((sum, r) => sum + (r.packetsExpected - r.packetsReceived), 0);

      pages.push({
        id: `daily-summary-${pages.length + 1}`,
        rows: chunk,
        date: new Date(selectedDate),
        session: selectedSession,
        totalBlocks: chunkBlocks.size,
        totalStudents: chunkStudents,
        totalPresent: chunkPresent,
        totalAbsent: chunkAbsent,
        totalCopyCases: chunkCopyCases,
        totalSubjects: chunkSubjects.size,
        attendanceRate: chunkAttend,
        packetDiscrepancy: Math.max(0, chunkPacketDisc),
        metadata: {
          Page: String(pages.length + 1),
          Students: chunkStudents,
          Attendance: `${chunkAttend.toFixed(1)}%`,
        },
      });

      startIdx += MAX_ROWS_PER_PAGE;
    }

    return pages;
  }, [rows, selectedDate, selectedSession]);

  const pages = buildPages();
  const firstPage = pages[0];

  // Loading
  if (loadingDates || userLoading) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full" />
        <div className="grid grid-cols-3 gap-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
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
            title="Daily Exam Summary"
            description="Select date & session to view daily summary statistics"
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
          title: 'DAILY EXAM SUMMARY',
          description: 'Day-wise examination statistics and attendance overview',
          examCenter: {
            name: examCenter?.name || 'Examination Center',
            code: examCenter?.code || '',
            season: examCenter?.season || '',
            year: examCenter?.examYear || new Date().getFullYear(),
            session: (selectedSession as 'Morning' | 'Afternoon') || 'Morning',
            date: new Date(selectedDate),
          },
          headerFields: {
            'Total Students': String(firstPage?.totalStudents || 0),
            Attendance: `${firstPage?.attendanceRate?.toFixed(1) || 0}%`,
            Blocks: String(firstPage?.totalBlocks || 0),
            Subjects: String(firstPage?.totalSubjects || 0),
          },
        }}
        footer={{
          showTestForgeCredit: true,
          creditText: 'Generated by TestForge',
        }}
        onBack={handleReset}
        backButtonLabel="Clear"
        documentTitle="Daily_Exam_Summary"
        numberOfCopies={numberOfCopies}
        onCopiesChange={setNumberOfCopies}
        renderPageContent={renderDailySummaryTable as (pageData: ReportPageData) => ReactNode}
        showCopyInfo={numberOfCopies > 1}
        copyInfoText="Copy {copyNumber} of {totalCopies}"
      />
    </div>
  );
}
