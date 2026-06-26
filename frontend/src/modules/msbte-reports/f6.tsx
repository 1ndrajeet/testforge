// modules/formats/format6.tsx - Clean Version with Department Map

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
import { getAllocationsByDateSession } from '@/lib/actions/allocation';
import { getTimetableEntries } from '@/lib/actions/timetable';

// ============================================================
// Types
// ============================================================

interface AttendanceData {
  seatNumbers: number[];
  blockNo: string;
  blockLocation: string;
  supervisorName: string;
  subjectCode: string;
  subjectName: string;
  scheme: string;
  date: Date;
  session: 'Morning' | 'Afternoon' | 'All';
  season: string;
  year: number;
  examCenterCode: string;
  examCenterName: string;
  instituteCode: string;
  instituteName: string;
  officerIncharge: string;
  sealingSupervisor: string;
  totalStudents: number;
  absentNumbers: number[];
}

interface Format6PageData extends ReportPageData {
  date?: Date;
  courseName?: string;
  courseCode?: string;
  sem?: string;
  master?: string;
  absentNumbers?: number[];
  totalStudents?: number;
  sealingSupervisor?: string;
}

// ============================================================
// Constants & Helpers
// ============================================================

const getCourseName = (code: string): string => {
  const map = departmentMap as Record<string, string>;
  return map[code] || code;
};

// ============================================================
// Render Functions
// ============================================================

const renderFormat6Table = (pageData: Format6PageData) => {
  const seats = pageData.seatNumbers || [];
  const total = seats.length;
  const first = total > 0 ? seats[0] : 0;
  const last = total > 0 ? seats[total - 1] : 0;
  const absent = pageData.absentNumbers || [];

  return (
    <>
      <table className="w-full border-collapse border border-black text-xs">
        <thead>
          <tr>
            <th className="row-span-2 w-[15%] border border-black p-1 text-center font-bold">
              Total seat numbers on computerized mark sheet/s
              <br />1
            </th>
            <th className="w-[20%] border border-black p-1 text-center font-bold" colSpan={2}>
              Additional examinees by the institute
            </th>
            <th className="w-[35%] border border-black p-1 text-center font-bold" colSpan={2}>
              Examinees absent
            </th>
            <th className="row-span-2 w-[15%] border border-black p-1 text-center font-bold">
              Total present
              <br />6
            </th>
          </tr>
          <tr>
            <th className="border border-black p-1 text-center font-bold"></th>
            <th className="border border-black p-1 text-center font-bold">
              Seat numbers
              <br />2
            </th>
            <th className="border border-black p-1 text-center font-bold">
              Total
              <br />3
            </th>
            <th className="border border-black p-1 text-center font-bold">
              Seat numbers
              <br />4
            </th>
            <th className="border border-black p-1 text-center font-bold">
              Total
              <br />5
            </th>
            <th className="border border-black p-1 text-center font-bold"></th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="border border-black p-2 text-center align-top font-medium">
              {total > 0 ? `${first} - ${last}` : '—'}
              <br />
              <span className="text-[10px]">({total} seats)</span>
            </td>
            <td className="border border-black p-2 text-center align-top">Nil</td>
            <td className="border border-black p-2 text-center align-top">0</td>
            <td className="border border-black p-2 text-center align-top">
              {absent.length > 0 ? absent.join(', ') : 'Nil'}
            </td>
            <td className="border border-black p-2 text-center align-top">{absent.length}</td>
            <td className="border border-black p-2 text-center align-top font-bold">{total - absent.length}</td>
          </tr>
        </tbody>
      </table>

      <div className="mt-4 flex justify-between text-xs">
        <div>
          <p>
            <strong>Sealing Supervisor</strong>
          </p>
          <p className="mt-1">({pageData.sealingSupervisor || '________________________'})</p>
        </div>
        <div className="text-right">
          <p>
            <strong>Officer-in-charge (Examination)</strong>
          </p>
          <p className="mt-1">({pageData.officerIncharge || '________________________'})</p>
        </div>
      </div>

      <div className="mt-3 border-t border-dashed border-neutral-300 pt-1 text-[10px] text-neutral-500">
        <p>1. Report to be prepared in duplicate.</p>
        <p>2. One copy should be attached with answer books bundle.</p>
        <p>3. One copy should be retained at the Institute.</p>
        <p>4. Total of columns 1 &amp; 3 should be equal to the total of columns 5 &amp; 6.</p>
        <p>5. Figure in column 6 must tally with the total number of answer books in the bundle.</p>
        <p>6. Strike off whichever is not applicable</p>
      </div>
    </>
  );
};

// ============================================================
// Main Component
// ============================================================

export default function Format6Report() {
  const { examCenter } = useUserInfo();
  const [allocations, setAllocations] = useState<AttendanceData[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingDates, setLoadingDates] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dates, setDates] = useState<Date[]>([]);
  const [selected, setSelected] = useState('');
  const [copies, setCopies] = useState(2);

  // Fetch dates
  useEffect(() => {
    getTimetableEntries().then(result => {
      if (result.success && result.data) {
        const unique = [...new Set(result.data.map((r: any) => r.date))];
        setDates(unique);
        if (unique.length) setSelected(format(unique[0], 'yyyy-MM-dd'));
      }
      setLoadingDates(false);
    });
  }, []);

  // Fetch data
  const fetchData = async (date: string, session: string) => {
    setLoading(true);
    setError(null);
    const result = await getAllocationsByDateSession(new Date(date), session);

    if (result.success && result.data?.length) {
      const data = result.data.map((a: any) => ({
        seatNumbers: a.seatNumbers || [],
        blockNo: a.blockNo || '',
        blockLocation: a.location || '',
        supervisorName: a.supervisorName || '',
        subjectCode: a.subjectCode || '',
        subjectName: a.subjectName || '',
        scheme: a.scheme || '',
        date: new Date(date),
        session: session as 'Morning' | 'Afternoon',
        season: examCenter?.season || '',
        year: examCenter?.examYear || new Date().getFullYear(),
        examCenterCode: examCenter?.code || '',
        examCenterName: examCenter?.name || '',
        instituteCode: a.instituteCode || '',
        instituteName: a.instituteName || '',
        officerIncharge: examCenter?.officerIncharge || '',
        sealingSupervisor: examCenter?.sealingSupervisor || '',
        totalStudents: a.seatNumbers?.length || 0,
        absentNumbers: a.absentNumbers || [],
      }));
      setAllocations(data);
    } else {
      setError('No data found');
      setAllocations([]);
    }
    setLoading(false);
  };

  const handleSelect = (s: { date: string; session: 'Morning' | 'Afternoon' | 'All' }) => {
    setSelected(s.date);
    fetchData(s.date, s.session);
  };

  const handleReset = () => {
    setAllocations([]);
    setError(null);
  };

  // Build pages
  const pages: Format6PageData[] = allocations.map((d, i) => {
    const parts = d.scheme?.split('-') || [];
    return {
      id: `${d.blockNo}-${d.subjectCode}-${i}`,
      blockNo: d.blockNo || 'N/A',
      blockLocation: d.blockLocation,
      supervisorName: d.supervisorName,
      subjectCode: d.subjectCode,
      subjectName: d.subjectName,
      scheme: d.scheme,
      seatNumbers: [...d.seatNumbers].sort((a, b) => a - b),
      officerIncharge: d.officerIncharge,
      sealingSupervisor: d.sealingSupervisor,
      date: d.date,
      courseName: getCourseName(parts[0] || ''),
      courseCode: parts[0] || '',
      sem: parts[1] || '',
      master: parts[2] || '',
      totalStudents: d.seatNumbers.length,
      absentNumbers: d.absentNumbers || [],
      instituteCode: d.instituteCode,
      instituteName: d.instituteName,
      examCenterName: d.examCenterName,
      examCenterCode: d.examCenterCode,
      season: d.season,
      year: d.year,
    };
  });

  const first = allocations[0];

  if (loadingDates) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl p-4">
      {allocations.length === 0 ? (
        <div className="space-y-4">
          <SessionSelector
            availableDates={dates}
            availableSessions={['Morning', 'Afternoon', 'All']}
            onSessionSelect={handleSelect}
            defaultDate={selected}
            defaultSession="Morning"
            isLoading={loading}
            error={error}
            title="Format 6 - Attendance Report A"
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
          pages={pages}
          header={{
            title: 'FORMAT NO. 6',
            subtitle: 'Attendance Report "A"',
            examSeason: first?.season || '',
            examYear: first?.year || new Date().getFullYear(),
            examCenterName: first?.examCenterName || examCenter?.name,
            examCenterCode: first?.examCenterCode || examCenter?.code,
            date: first?.date || new Date(),
            session: first?.session || 'Morning',
            instituteCode: first?.instituteCode || '',
            instituteName: first?.instituteName || '',
          }}
          footer={{
            showSupervisorSignature: true,
            showOfficerSignature: true,
            showTimestamp: false,
          }}
          onBack={handleReset}
          backButtonLabel="Clear"
          documentTitle="Format_6_Report"
          numberOfCopies={copies}
          onCopiesChange={setCopies}
          renderPageContent={renderFormat6Table}
        />
      )}
    </div>
  );
}
