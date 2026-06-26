// modules/formats/format9.tsx - 100% COMPLIANT

'use client';

import { useEffect, useState } from 'react';

import { format } from 'date-fns';
import { AlertCircle } from 'lucide-react';

import ReportLayout from '@/components/layout/msbte-report-layout';
import { SessionSelector } from '@/components/shared/date-selector';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useUserInfo } from '@/hooks/useUserInfo';
import { getPackingSlip } from '@/lib/actions/allocation';
import { getTimetableEntries } from '@/lib/actions/timetable';
import { cn } from '@/lib/utils';

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
// Format 9 Content Component
// ============================================================

function Format9Content({ data }: { data: PackingSlipData[] }) {
  // Each item is a separate row
  const rows = data.map(item => ({
    ...item,
    answerBooks: item.totalStudents - (item.absentNumbers?.length || 0) - (item.cpsNumbers?.length || 0),
  }));

  const totalBundles = rows.length;
  const firstItem = rows[0] || null;

  return (
    <>
      {/* RECEIPT Heading */}
      <div className="mb-2 text-center text-sm font-bold">RECEIPT</div>

      <div className="mb-3 text-center text-xs">
        Received below mentioned sealed packets of written answer books in good and intact condition, from the
        Officer-in-charge, examination center, Institute Code {firstItem?.instituteCode || ''}.
      </div>

      <table className="w-full border-collapse border border-black text-xs">
        <thead>
          <tr>
            <th className="w-[6%] border border-black px-1.5 py-1 text-center">Sr. No.</th>
            <th className="w-[22%] border border-black px-1.5 py-1 text-center">Course/Sem/Year/Master</th>
            <th className="w-[24%] border border-black px-1.5 py-1 text-center">Subject Title</th>
            <th className="w-[12%] border border-black px-1.5 py-1 text-center">Subject Code</th>
            <th className="w-[12%] border border-black px-1.5 py-1 text-center">Number of packets (if sections)</th>
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
              <tr key={index} className={cn('print:bg-transparent', isMorning && 'bg-blue-50/50 dark:bg-blue-950/20')}>
                <td className="border border-black px-1.5 py-1 text-center">{index + 1}</td>
                <td className="border border-black px-1.5 py-1 text-center">
                  {courseName}/{sem}/{master}
                </td>
                <td className="border border-black px-1.5 py-1 pl-2 text-left">{item.subjectName}</td>
                <td className="border border-black px-1.5 py-1 text-center font-mono">{item.subjectCode}</td>
                <td className="border border-black px-1.5 py-1 text-center">1</td>
                <td className="border border-black px-1.5 py-1 text-center font-medium">{item.answerBooks}</td>
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
          <strong>Name of Officer In-charge (DC):</strong> _______________________________
        </p>
        <p className="mt-1">
          <strong>Signature of Officer In-charge (DC):</strong> ___________________________
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

export default function Format9Report() {
  const { examCenter } = useUserInfo();
  const [data, setData] = useState<PackingSlipData[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingDates, setLoadingDates] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dates, setDates] = useState<Date[]>([]);
  const [selected, setSelected] = useState('');
  const [showReport, setShowReport] = useState(false);

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

  // Fetch data for BOTH Morning and Afternoon sessions
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

      if (allData.length > 0) {
        setData(allData);
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

  const handleBack = () => {
    setShowReport(false);
    setData([]);
    setError(null);
  };

  const firstItem = data.length > 0 ? data[0] : null;

  if (loadingDates) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (!showReport) {
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
            title="Format 9 - Receipt"
            description="Select date to generate receipt"
            compact
            hideSession={true}
          />
          {!dates.length && !error && (
            <Alert variant="default" className="border-amber-200 bg-amber-50">
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
    <ReportLayout
      header={{
        title: 'FORMAT NO. 9',
        subtitle:
          'Format of Receipt for sealed answer book bundles to be given by the Officer in charge Distribution center to the Controller of examination',
        examSeason: examCenter?.season as 'Summer' | 'Winter',
        examYear: examCenter?.examYear || new Date().getFullYear(),
        examCenterName: examCenter?.name,
        examCenterCode: examCenter?.code,
        date: firstItem ? new Date(firstItem.date) : new Date(),
      }}
      footer={{
        showTimestamp: false,
      }}
      showBackButton
      onBack={handleBack}
      documentTitle="Format_9_Report"
      bordered
    >
      <Format9Content data={data} />
    </ReportLayout>
  );
}
