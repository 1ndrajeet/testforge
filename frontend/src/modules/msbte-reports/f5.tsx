// modules/formats/format5.tsx - FIXED

'use client';

import { useEffect, useState } from 'react';

import { format } from 'date-fns';
import { AlertCircle } from 'lucide-react';

import { getAllocationsByDateSession } from '@/lib/actions/allocation';
import { getTimetableEntries } from '@/lib/actions/timetable';

import { useUserInfo } from '@/hooks/useUserInfo';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';

import { MultiPageReport, ReportPageData } from '@/components/layout/msbte-report-layout';

import { SessionSelector } from '@/components/shared/date-selector';

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
}

const renderFormat5Table = (pageData: ReportPageData & { copyIndex?: number }) => {
  const isEvenCopy = (pageData.copyIndex ?? 0) % 2 === 0;

  return (
    <>
      <table className="w-full border-collapse border border-black text-xs">
        <thead>
          <tr>
            <th className="w-[8%] border border-black text-center">S.N.</th>
            <th className="w-[18%] border border-black text-center">Seat No.</th>
            <th className={`${isEvenCopy ? 'w-[29%]' : 'w-[24%]'} border border-black text-center`}>
              Main Answer Book
            </th>
            <th className={`${isEvenCopy ? 'w-[29%]' : 'w-[24%]'} border border-black text-center`}>
              Supplements
            </th>
            <th className={`${isEvenCopy ? 'w-[16%]' : 'w-[26%]'} border border-black text-center`}>
              {isEvenCopy ? 'Present / Absent' : 'Signature of Candidate'}
            </th>
          </tr>
        </thead>
        <tbody>
          {pageData.seatNumbers?.map((seat, i) => (
            <tr key={i}>
              <td className="border border-black text-center">{String(i + 1).padStart(2, '0')}</td>
              <td className="border border-black text-center font-medium">{seat}</td>
              <td className="border border-black text-center"></td>
              <td className="border border-black text-center"></td>
              <td className="border border-black text-center"></td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-2 flex justify-between text-[10pt]">
        <span>
          <strong>Total Students:</strong> {pageData.seatNumbers?.length}
        </span>
        <span>
          <strong>Present:</strong> _________
        </span>
        <span>
          <strong>Absent:</strong> _________
        </span>
      </div>
    </>
  );
};

export default function Format5Report() {
  const { examCenter } = useUserInfo();
  const [allAllocations, setAllAllocations] = useState<AttendanceData[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingDates, setLoadingDates] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dates, setDates] = useState<Date[]>([]);
  const [selected, setSelected] = useState('');
  const [numberOfCopies, setNumberOfCopies] = useState(2);

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
    const result = await getAllocationsByDateSession(new Date(date), session);

    if (result.success && result.data?.length) {
      const allData: AttendanceData[] = result.data.map((a: any) => ({
        seatNumbers: a.seatNumbers || [],
        blockNo: a.blockNo || a.location || 'N/A',
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
        // USE THE DATA FROM THE ALLOCATION - NOT THE EXAM CENTER FALLBACK
        instituteCode: a.instituteCode || '',
        instituteName: a.instituteName || '',
        officerIncharge: examCenter?.officerIncharge || '',
        sealingSupervisor: examCenter?.sealingSupervisor || '',
      }));

      setAllAllocations(allData);
    } else {
      setError('No data found');
      setAllAllocations([]);
    }
    setLoading(false);
  };

  const handleSelect = async (s: { date: string; session: 'Morning' | 'Afternoon' | 'All' }) => {
    setSelected(s.date);
    await fetchData(s.date, s.session);
  };

  const handleReset = () => {
    setAllAllocations([]);
    setError(null);
  };

  const pages: ReportPageData[] = allAllocations.map((data, index) => {
    return {
      id: `${data.blockNo}-${data.subjectCode}-${index}`,
      blockNo: data.blockNo || 'N/A',
      blockLocation: data.blockLocation,
      supervisorName: data.supervisorName,
      subjectCode: data.subjectCode,
      subjectName: data.subjectName,
      scheme: data.scheme,
      seatNumbers: data.seatNumbers.sort((a, b) => a - b),
      officerIncharge: data.officerIncharge,
      instituteCode: data.instituteCode,
      instituteName: data.instituteName,
    };
  });

  if (loadingDates) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  const firstAllocation = allAllocations[0];

  return (
    <div className="mx-auto max-w-4xl p-4">
      {allAllocations.length === 0 ? (
        <div className="space-y-4">
          <SessionSelector
            availableDates={dates}
            availableSessions={['Morning', 'Afternoon', 'All']}
            onSessionSelect={handleSelect}
            defaultDate={selected}
            defaultSession="Morning"
            isLoading={loading}
            error={error}
            title="Format 5 - Attendance Register"
            description="Select date & session"
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
      ) : (
        <MultiPageReport
          pages={pages}
          compact
          header={{
            title: 'FORMAT NO. 5',
            subtitle: 'Examinees Attendance Report',
            examSeason: firstAllocation?.season || '',
            examYear: firstAllocation?.year || new Date().getFullYear(),
            examCenterName: firstAllocation?.examCenterName || examCenter?.name,
            examCenterCode: firstAllocation?.examCenterCode || examCenter?.code,
            date: firstAllocation?.date || new Date(),
            session: firstAllocation?.session || 'Morning',
            instituteCode: firstAllocation?.instituteCode || '',
            instituteName: firstAllocation?.instituteName || '',
          }}
          footer={{
            showSupervisorSignature: true,
            showOfficerSignature: true,
            showTimestamp: false,
          }}
          onBack={handleReset}
          backButtonLabel="Clear"
          documentTitle="Format_5_Report"
          numberOfCopies={numberOfCopies}
          onCopiesChange={setNumberOfCopies}
          renderPageContent={renderFormat5Table}
        />
      )}
    </div>
  );
}
