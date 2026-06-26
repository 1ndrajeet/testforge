// modules/formats/format7.tsx - FIXED

'use client';

import { useEffect, useState } from 'react';

import { format } from 'date-fns';
import { AlertCircle } from 'lucide-react';

import { MultiPageReport, ReportPageData } from '@/components/layout/msbte-report-layout';
import { SessionSelector } from '@/components/shared/date-selector';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import departmentMap from '@/config/departmentsMap.json';
import { useUserInfo } from '@/hooks/useUserInfo';
import { getPackingSlip } from '@/lib/actions/allocation';
import { getTimetableEntries } from '@/lib/actions/timetable';

// ============================================================
// Types - ADD instituteName
// ============================================================

interface PackingSlipData {
  instituteCode: string;
  instituteName: string; // ADDED - from allocation data
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
// Constants & Helpers
// ============================================================

const getCourseName = (code: string): string => {
  const map = departmentMap as Record<string, string>;
  return map[code] || code;
};

const formatDateShort = (date: Date | string): string => {
  return format(new Date(date), 'dd/MM/yyyy');
};

// ============================================================
// Render Function - BODY ONLY
// ============================================================

const renderPackingSlipContent = (pageData: ReportPageData & { isCopyCase?: boolean; cpsNumbers?: number[] }) => {
  const schemeParts = pageData.scheme?.split('-') || [];
  const courseCode = schemeParts[0] || '';
  const sem = schemeParts[1] || '';
  const master = schemeParts[2] || '';
  const courseName = getCourseName(courseCode);
  const isCopyCase = pageData.isCopyCase || false;

  const totalFinalStudents = isCopyCase
    ? (pageData.cpsNumbers || []).length
    : (pageData.totalStudents || 0) - ((pageData.absentNumbers || []).length + (pageData.cpsNumbers || []).length);

  const absentOrCopyStudents = isCopyCase ? pageData.cpsNumbers : pageData.absentNumbers;
  const slipType = isCopyCase ? 'COPY CASE PACKING SLIP' : 'PACKING SLIP';

  return (
    <>
      <div className="mb-2 text-center text-sm font-bold">{slipType}</div>

      <div className="border border-black px-4 py-2">
        <div className="details grid grid-cols-2 gap-2 text-xs">
          <p>
            <strong>Course:</strong> {courseName}
          </p>
          <div className="flex justify-between">
            <span>
              <strong>Sem:</strong> {sem}
            </span>
            <span>
              <strong>Master:</strong> {master}
            </span>
          </div>
          <p>
            <strong>Subject Code:</strong> {pageData.subjectCode}
          </p>
          <p>
            <strong>Subject Name:</strong> {pageData.subjectName}
          </p>
          <p className="col-span-">
            <strong>Total Number of Answer Books in Bundle:</strong>{' '}
            <span className="rounded border border-black px-3 py-2">{totalFinalStudents}</span>
          </p>
          <p className="col-span-full">
            <strong>Marksheet No:</strong> {pageData.sheetNo}
          </p>
          <p>
            <strong>Sealed on:</strong> {formatDateShort(pageData.date!)}
          </p>
          <p>
            <strong>Sealing Time:</strong> ______________ AM/PM
          </p>
          {absentOrCopyStudents && absentOrCopyStudents.length > 0 && (
            <p className="col-span-full">
              <strong>{isCopyCase ? 'Copy Case Students' : 'Absent Students'}:</strong>{' '}
              {absentOrCopyStudents.join(', ')}
            </p>
          )}
        </div>

        <div className="signatures mt-12 flex justify-between text-xs">
          <div>
            <strong>Sealing Supervisor</strong>
            <br />
            <span>{pageData.sealingSupervisor || '________________________'}</span>
          </div>
          <div>
            <strong>Officer In-Charge</strong>
            <br />
            <span>{pageData.officerIncharge || '________________________'}</span>
          </div>
          <div>
            <strong>Exam Controller</strong>
            <br />
            <span>________________________</span>
          </div>
        </div>
      </div>

      <div className="mt-2 border-t border-dashed border-neutral-300 pt-1 text-[10px] text-neutral-500">
        <p>1. Copy for Officer-in-charge, R.A.C</p>
        <p>2. Copy for Distribution center.</p>
        {isCopyCase && <p className="font-semibold text-red-600">** COPY CASE PACKING SLIP **</p>}
      </div>
    </>
  );
};

// ============================================================
// Main Component
// ============================================================

export default function Format7Report() {
  const { examCenter } = useUserInfo();
  const [data, setData] = useState<PackingSlipData[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingDates, setLoadingDates] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dates, setDates] = useState<Date[]>([]);
  const [selected, setSelected] = useState('');
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

  const fetchData = async (date: string, session: string) => {
    setLoading(true);
    setError(null);

    try {
      const result = await getPackingSlip(new Date(date), session);

      if (result.success && result.data) {
        const transformedData: PackingSlipData[] = result.data.map((item: any) => ({
          instituteCode: item.instituteCode || '',
          instituteName: item.instituteName || '', // FROM DATA - like Format 5
          date: item.date || date,
          session: item.session || session,
          timeSlot: item.timeSlot || '',
          scheme: item.scheme || '',
          subjectCode: item.subjectCode || '',
          totalStudents: item.totalStudents || 0,
          sheetNo: item.sheetNo || '',
          subjectName: item.subjectName || '',
          absentNumbers: item.absentNumbers || [],
          cpsNumbers: item.cpsNumbers || [],
        }));

        if (transformedData.length > 0) {
          setData(transformedData);
        } else {
          setError('No packing slip data found');
          setData([]);
        }
      } else {
        setError(result.error || 'Failed to fetch packing slip data');
        setData([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = async (s: { date: string; session: 'Morning' | 'Afternoon' | 'All' }) => {
    setSelected(s.date);
    await fetchData(s.date, s.session);
  };

  const handleReset = () => {
    setData([]);
    setError(null);
  };

  // Build pages - FOLLOW FORMAT 5 PATTERN EXACTLY
  const buildPages = (): ReportPageData[] => {
    const pages: ReportPageData[] = [];

    data.forEach((item, index) => {
      // Main packing slip
      const basePage: ReportPageData = {
        id: `${item.instituteCode}-${item.subjectCode}-${index}`,
        blockNo: '', // Not used in Format 7
        blockLocation: '',
        supervisorName: '',
        subjectCode: item.subjectCode,
        subjectName: item.subjectName,
        scheme: item.scheme,
        seatNumbers: [],
        officerIncharge: examCenter?.officerIncharge || '',
        sealingSupervisor: examCenter?.sealingSupervisor || '',
        // DATA FROM ALLOCATION - like Format 5
        instituteCode: item.instituteCode || '',
        instituteName: item.instituteName || '',
        sheetNo: item.sheetNo,
        totalStudents: item.totalStudents,
        absentNumbers: item.absentNumbers || [],
        cpsNumbers: item.cpsNumbers || [],
        date: new Date(item.date),
        session: item.session as 'Morning' | 'Afternoon',
        timeSlot: item.timeSlot,
        season: examCenter?.season || '',
        year: examCenter?.examYear || new Date().getFullYear(),
        examCenterCode: examCenter?.code || '',
        examCenterName: examCenter?.name || '',
        isCopyCase: false,
      };

      pages.push(basePage);

      // Copy case slip if CPS numbers exist
      if (item.cpsNumbers && item.cpsNumbers.length > 0) {
        pages.push({
          ...basePage,
          id: `${item.instituteCode}-${item.subjectCode}-${index}-cps`,
          isCopyCase: true,
        });
      }
    });

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

  return (
    <div className="mx-auto max-w-4xl p-4">
      {allPages.length === 0 ? (
        <div className="space-y-4">
          <SessionSelector
            availableDates={dates}
            availableSessions={['Morning', 'Afternoon', 'All']}
            onSessionSelect={handleSelect}
            defaultDate={selected}
            defaultSession="Morning"
            isLoading={loading}
            error={error}
            title="Format 7 - Packing Slip"
            description="Select date & session"
            compact
          />
          {!dates.length && !error && (
            <Alert variant="default" className="border-amber-200 bg-amber-50">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <AlertDescription>Upload timetable first.</AlertDescription>
            </Alert>
          )}
        </div>
      ) : (
        <MultiPageReport
          pages={allPages}
          header={{
            title: 'FORMAT NO. 7',
            subtitle: 'Packing Slip',
            examSeason: examCenter?.season || '',
            examYear: examCenter?.examYear || new Date().getFullYear(),
            examCenterName: examCenter?.name || '',
            examCenterCode: examCenter?.code || '',
            date: firstItem ? new Date(firstItem.date) : new Date(),
            session: (firstItem?.session as 'Morning' | 'Afternoon') || 'Morning',

            instituteCode: firstItem?.instituteCode || 'd',
            instituteName: firstItem?.instituteName || 'd',
          }}
          footer={{
            showTimestamp: false,
          }}
          onBack={handleReset}
          backButtonLabel="Clear"
          documentTitle="Format_7_Report"
          numberOfCopies={copies}
          onCopiesChange={setCopies}
          renderPageContent={renderPackingSlipContent}
        />
      )}
    </div>
  );
}
