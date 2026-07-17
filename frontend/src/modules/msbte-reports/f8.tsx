// modules/formats/format8.tsx - Using MultiPageReport

'use client';

import { useEffect, useState } from 'react';

import { format } from 'date-fns';
import { AlertCircle } from 'lucide-react';

import { getPackingSlip } from '@/lib/actions2/allocation';
import { getTimetableEntries } from '@/lib/actions2/timetable';
import { cn } from '@/lib/utils';

import { useUserInfo } from '@/hooks/useUserInfo';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';

import { MultiPageReport, ReportPageData } from '@/components/layout/msbte-report-layout';

import { SessionSelector } from '@/components/shared/date-selector';

// ============================================================
// Constants
// ============================================================

const FORMAT_8_MAX_ROWS = 10;

// ============================================================
// Types
// ============================================================

interface PackingSlipData {
  instituteCode: string;
  instituteName: string;
  date: string;
  session: string;
  timeSlot: string;
  scheme: string;
  subjectCode: string;
  totalStudents: number;
  sheetNo: string;
  subjectName: string;
  absentNumbers: number[];
  cpsNumbers: number[];
}

// ============================================================
// Format 8 Content Component
// ============================================================

function Format8Content({ data }: { data: PackingSlipData[] }) {
  const rows = data.map((item) => ({
    ...item,
    answerBooks:
      item.totalStudents - (item.absentNumbers?.length || 0) - (item.cpsNumbers?.length || 0),
  }));

  const totalBundles = rows.length;
  const firstItem = rows[0] || null;

  return (
    <>
      <div className="mb-2 text-center text-sm font-bold">RECEIPT</div>

      <div className="mb-3 text-center text-xs">
        Received below mentioned sealed packets of written answer books in good and intact
        condition, from the Officer-in-charge, examination center, Institute Code{' '}
        {firstItem?.instituteCode || ''}.
      </div>

      <table className="w-full border-collapse border border-black text-xs">
        <thead>
          <tr>
            <th className="w-[6%] border border-black px-1.5 py-1 text-center">Sr. No.</th>
            <th className="w-[22%] border border-black px-1.5 py-1 text-center">
              Course/Sem/Year/Master
            </th>
            <th className="w-[24%] border border-black px-1.5 py-1 text-center">Subject Title</th>
            <th className="w-[12%] border border-black px-1.5 py-1 text-center">Subject Code</th>
            <th className="w-[12%] border border-black px-1.5 py-1 text-center">
              Number of packets (if sections)
            </th>
            <th className="w-[12%] border border-black px-1.5 py-1 text-center">
              Number of Answer Books in each bundle
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((item, index) => {
            const schemeParts = item.scheme?.split('-') || [];
            const courseCode = schemeParts[0] || '';
            const courseName = courseCode;
            const sem = schemeParts[1] || '';
            const master = schemeParts[2] || '';
            const isMorning = item.session === 'Morning';

            return (
              <tr
                key={index}
                className={cn(
                  'print:bg-transparent',
                  isMorning && 'bg-blue-50/50 dark:bg-blue-950/20',
                )}
              >
                <td className="border border-black px-1.5 py-1 text-center">{index + 1}</td>
                <td className="border border-black px-1.5 py-1 text-center">
                  {courseName}/{sem}/{master}
                </td>
                <td className="border border-black px-1.5 py-1 pl-2 text-left">
                  {item.subjectName}
                </td>
                <td className="border border-black px-1.5 py-1 text-center font-mono">
                  {item.subjectCode}
                </td>
                <td className="border border-black px-1.5 py-1 text-center">1</td>
                <td className="border border-black px-1.5 py-1 text-center font-medium">
                  {item.answerBooks}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="mt-2 border-t border-black pt-1 text-xs">
        <p>
          <strong>Total number of answer book bundles:</strong> {totalBundles}
        </p>
      </div>

      <div className="mt-4 text-xs">
        <p>
          <strong>Name of Controller:</strong> __________________________________
        </p>
        <p className="mt-1">
          <strong>Signature of Controller:</strong> _______________________________
        </p>
        <p className="mt-2 flex gap-6">
          <span>
            <strong>Date:</strong> {firstItem ? format(new Date(firstItem.date), 'dd/MM/yyyy') : ''}
          </span>
          <span>
            <strong>Time:</strong> _________ AM / PM
          </span>
        </p>
      </div>
    </>
  );
}

// ============================================================
// Main Component
// ============================================================

export default function Format8Report() {
  const { examCenter } = useUserInfo();
  const [data, setData] = useState<PackingSlipData[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingDates, setLoadingDates] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dates, setDates] = useState<Date[]>([]);
  const [selected, setSelected] = useState('');
  const [showReport, setShowReport] = useState(false);
  const [copies, setCopies] = useState(2);

  useEffect(() => {
    const fetchDates = async () => {
      const result = await getTimetableEntries();
      if (result.success && result.data) {
        const unique = [...new Set(result.data.map((r: any) => r.date))];
        setDates(unique);
        if (unique.length) setSelected(format(unique[0], 'yyyy-MM-dd'));
      }
      setLoadingDates(false);
    };
    fetchDates();
  }, []);

  const fetchFullDayData = async (date: string) => {
    setLoading(true);
    setError(null);

    try {
      const [morningResult, afternoonResult] = await Promise.all([
        getPackingSlip(new Date(date), 'Morning'),
        getPackingSlip(new Date(date), 'Afternoon'),
      ]);

      let allData: PackingSlipData[] = [];

      if (morningResult.success && morningResult.data) {
        const morningData = morningResult.data.map((item: any) => ({
          instituteCode: item.instituteCode || '',
          instituteName: item.instituteName || '',
          date: item.date || date,
          session: item.session || 'Morning',
          timeSlot: item.timeSlot || '',
          scheme: item.scheme || '',
          subjectCode: item.subjectCode || '',
          totalStudents: item.totalStudents || 0,
          sheetNo: item.sheetNo || '',
          subjectName: item.subjectName || '',
          absentNumbers: item.absentNumbers || [],
          cpsNumbers: item.cpsNumbers || [],
        }));
        allData = [...allData, ...morningData];
      }

      if (afternoonResult.success && afternoonResult.data) {
        const afternoonData = afternoonResult.data.map((item: any) => ({
          instituteCode: item.instituteCode || '',
          instituteName: item.instituteName || '',
          date: item.date || date,
          session: item.session || 'Afternoon',
          timeSlot: item.timeSlot || '',
          scheme: item.scheme || '',
          subjectCode: item.subjectCode || '',
          totalStudents: item.totalStudents || 0,
          sheetNo: item.sheetNo || '',
          subjectName: item.subjectName || '',
          absentNumbers: item.absentNumbers || [],
          cpsNumbers: item.cpsNumbers || [],
        }));
        allData = [...allData, ...afternoonData];
      }

      // Filter out items with 0 total students
      const filteredData = allData.filter((item) => item.totalStudents > 0);

      if (filteredData.length > 0) {
        setData(filteredData);
        setShowReport(true);
      } else {
        setError('No packing slip data found for this date');
        setData([]);
        setShowReport(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
      setData([]);
      setShowReport(false);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = async (s: { date: string; session: 'Morning' | 'Afternoon' | 'All' }) => {
    setSelected(s.date);
    await fetchFullDayData(s.date);
  };

  const handleReset = () => {
    setShowReport(false);
    setData([]);
    setError(null);
  };

  // Build pages
  const buildPages = (): ReportPageData[] => {
    const pages: ReportPageData[] = [];
    const sortedData = [...data].sort((a, b) => {
      // Sort by session: Morning first, then Afternoon
      if (a.session === 'Morning' && b.session === 'Afternoon') return -1;
      if (a.session === 'Afternoon' && b.session === 'Morning') return 1;
      return 0;
    });

    for (let i = 0; i < sortedData.length; i += FORMAT_8_MAX_ROWS) {
      const chunk = sortedData.slice(i, i + FORMAT_8_MAX_ROWS);
      const pageIndex = Math.floor(i / FORMAT_8_MAX_ROWS) + 1;
      const firstInChunk = chunk[0];

      pages.push({
        id: `format8-page-${pageIndex}`,
        blockNo: '',
        blockLocation: '',
        supervisorName: '',
        subjectCode: '',
        subjectName: '',
        scheme: '',
        seatNumbers: [],
        content: <Format8Content data={chunk} />,
        date: new Date(firstInChunk?.date || new Date()),
        session: (firstInChunk?.session as 'Morning' | 'Afternoon') || 'Morning',
        examCenterCode: examCenter?.code || '',
        examCenterName: examCenter?.name || '',
        instituteCode: firstInChunk?.instituteCode || '',
        instituteName: firstInChunk?.instituteName || '',
        officerIncharge: examCenter?.officerIncharge || '',
      });
    }

    return pages;
  };

  const allPages = buildPages();
  const firstItem = data.length > 0 ? data[0] : null;

  if (loadingDates) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (!showReport || allPages.length === 0) {
    return (
      <div className="mx-auto max-w-4xl p-4">
        <div className="space-y-4">
          <SessionSelector
            availableDates={dates}
            availableSessions={['Morning', 'Afternoon', 'All']}
            onSessionSelect={handleSelect}
            defaultDate={selected}
            defaultSession="Morning"
            isLoading={loading}
            error={error}
            title="Format 8 - Receipt"
            description="Select date to generate receipt"
            compact
            hideSession={true}
          />
          {!dates.length && !error && (
            <Alert
              variant="default"
              className="border-amber-200 bg-amber-50"
            >
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <AlertTitle>No Data</AlertTitle>
              <AlertDescription>Upload timetable first.</AlertDescription>
            </Alert>
          )}
        </div>
      </div>
    );
  }

  return (
    <MultiPageReport
      pages={allPages}
      header={{
        title: 'FORMAT NO. 8',
        subtitle:
          'Format of Receipt for sealed answer book bundles to be given by the Controller of examination to the Officer-in-charge, examination center',
        examSeason: examCenter?.season as 'Summer' | 'Winter',
        examYear: examCenter?.examYear || new Date().getFullYear(),
        examCenterName: examCenter?.name,
        examCenterCode: examCenter?.code,
        date: firstItem ? new Date(firstItem.date) : new Date(),
        session: (firstItem?.session as 'Morning' | 'Afternoon') || 'Morning',
        instituteCode: firstItem?.instituteCode || '',
        instituteName: firstItem?.instituteName || '',
      }}
      footer={{
        showTimestamp: false,
      }}
      onBack={handleReset}
      backButtonLabel="Back"
      documentTitle="Format_8_Report"
      numberOfCopies={copies}
      onCopiesChange={setCopies}
      renderPageContent={(pageData) => pageData.content}
    />
  );
}
