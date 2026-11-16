// modules/formats/format8.tsx - Using MultiPageReport

'use client';

import { useEffect, useState } from 'react';

import { format } from 'date-fns';
import { AlertCircle } from 'lucide-react';

import { createClient } from '@/lib/supabase/client';
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
            const schemeParts = item.scheme?.includes('-')
              ? item.scheme.split('-')
              : item.scheme?.match(/^[A-Za-z]+|\d+|[A-Za-z]+$/g) || []; 
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
  const { examCenter, isLoading: userLoading } = useUserInfo();
  const [data, setData] = useState<PackingSlipData[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingDates, setLoadingDates] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dates, setDates] = useState<Date[]>([]);
  const [selected, setSelected] = useState('');
  const [showReport, setShowReport] = useState(false);
  const [copies, setCopies] = useState(2);

  useEffect(() => {
    if (userLoading) return;
    if (!examCenter?.id) {
      setLoadingDates(false);
      return;
    }
    const fetchDates = async () => {
      const supabase = createClient();
      const { data: ttData } = await supabase
        .from('timetable')
        .select('date')
        .eq('exam_center_id', examCenter.id)
        .order('date');

      if (ttData) {
        const seen = new Set<string>();
        const unique: Date[] = [];
        ttData.forEach((r: any) => {
          const dStr =
            typeof r.date === 'string'
              ? r.date.split('T')[0]
              : new Date(r.date).toISOString().split('T')[0];
          if (!seen.has(dStr)) {
            seen.add(dStr);
            unique.push(new Date(r.date));
          }
        });
        setDates(unique);
        if (unique.length) setSelected(format(unique[0], 'yyyy-MM-dd'));
      }
      setLoadingDates(false);
    };
    fetchDates();
  }, [examCenter?.id, userLoading]);

  const fetchFullDayData = async (date: string) => {
    if (!examCenter?.id) return;
    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const [
        { data: ttData, error: ttErr },
        { data: allocData },
        { data: instData },
        { data: sheetData },
      ] = await Promise.all([
        supabase
          .from('timetable')
          .select(
            'id, session, subject_code, subject_name, scheme, time_slot, total_students, absent_numbers, cps_students',
          )
          .eq('exam_center_id', examCenter.id)
          .eq('date', date)
          .order('session')
          .order('subject_code')
          .order('scheme'),
        supabase
          .from('block_allocations')
          .select('session, subject_code, scheme, connected_institute_id')
          .eq('exam_center_id', examCenter.id)
          .eq('date', date),
        supabase
          .from('connected_institutes')
          .select('id, institute_code, institute_name')
          .eq('exam_center_id', examCenter.id),
        supabase
          .from('e_marksheets')
          .select('paper_code, scheme, sheet_no')
          .eq('exam_center_id', examCenter.id),
      ]);

      if (ttErr) throw ttErr;

      const instById = new Map<string, { code: string; name: string }>();
      (instData || []).forEach((inst: any) => {
        instById.set(inst.id, { code: inst.institute_code, name: inst.institute_name });
      });

      const subInstMap = new Map<string, { code: string; name: string }>();
      (allocData || []).forEach((alloc: any) => {
        if (alloc.connected_institute_id && instById.has(alloc.connected_institute_id)) {
          const info = instById.get(alloc.connected_institute_id)!;
          subInstMap.set(`${alloc.session}_${alloc.subject_code}_${alloc.scheme}`, info);
          subInstMap.set(`${alloc.subject_code}_${alloc.scheme}`, info);
        }
      });

      const sheetNoMap = new Map<string, string>();
      (sheetData || []).forEach((s: any) => {
        if (s.sheet_no) sheetNoMap.set(`${s.paper_code}_${s.scheme}`, s.sheet_no);
      });

      const defaultInst =
        instData && instData.length > 0
          ? { code: instData[0].institute_code, name: instData[0].institute_name }
          : { code: examCenter.code || '', name: examCenter.name || '' };

      const filteredData: PackingSlipData[] = (ttData || [])
        .filter((entry: any) => (entry.total_students || 0) > 0)
        .map((entry: any) => {
          const keyWithSession = `${entry.session}_${entry.subject_code}_${entry.scheme}`;
          const key = `${entry.subject_code}_${entry.scheme}`;
          const instInfo = subInstMap.get(keyWithSession) || subInstMap.get(key) || defaultInst;
          const sheetNo =
            sheetNoMap.get(key) ||
            `SHEET-${entry.subject_code}-${entry.scheme}-${entry.id.substring(0, 8)}`;

          return {
            instituteCode: instInfo.code,
            instituteName: instInfo.name,
            date,
            session: entry.session || 'Morning',
            timeSlot: entry.time_slot || '',
            scheme: entry.scheme || '',
            subjectCode: entry.subject_code,
            totalStudents: entry.total_students || 0,
            sheetNo,
            subjectName: entry.subject_name || entry.subject_code,
            absentNumbers: entry.absent_numbers || [],
            cpsNumbers: entry.cps_students || [],
          };
        });

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
