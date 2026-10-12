// modules/formats/format5.tsx - FIXED

'use client';

import { useEffect, useState } from 'react';

import { format } from 'date-fns';
import { AlertCircle } from 'lucide-react';

import { createClient } from '@/lib/supabase/client';

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
  const { examCenter, isLoading: userLoading } = useUserInfo();
  const [allAllocations, setAllAllocations] = useState<AttendanceData[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingDates, setLoadingDates] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dates, setDates] = useState<Date[]>([]);
  const [selected, setSelected] = useState('');
  const [numberOfCopies, setNumberOfCopies] = useState(2);

  useEffect(() => {
    if (userLoading) return;
    if (!examCenter?.id) {
      setLoadingDates(false);
      return;
    }
    const fetchDates = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from('timetable')
        .select('date')
        .eq('exam_center_id', examCenter.id)
        .order('date');

      if (data) {
        const seen = new Set<string>();
        const unique: Date[] = [];
        data.forEach((r: any) => {
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

  const fetchData = async (date: string, session: string) => {
    if (!examCenter?.id) return;
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      let allocQuery = supabase
        .from('block_allocations')
        .select(
          'seat_numbers, block_no, location, supervisor_name, subject_code, subject_name, scheme, connected_institute_id',
        )
        .eq('exam_center_id', examCenter.id)
        .eq('date', date);

      if (session !== 'All') {
        allocQuery = allocQuery.eq('session', session);
      }

      const instQuery = supabase
        .from('connected_institutes')
        .select('id, institute_code, institute_name')
        .eq('exam_center_id', examCenter.id);

      const [{ data: allocData, error: allocErr }, { data: instData }] = await Promise.all([
        allocQuery.order('block_no'),
        instQuery,
      ]);

      if (allocErr) throw allocErr;

      if (allocData && allocData.length > 0) {
        const instMap = new Map<string, { code: string; name: string }>();
        (instData || []).forEach((inst: any) => {
          instMap.set(inst.id, { code: inst.institute_code, name: inst.institute_name });
        });

        const defaultInst =
          instData && instData.length > 0
            ? { code: instData[0].institute_code, name: instData[0].institute_name }
            : { code: examCenter?.code || '', name: examCenter?.name || '' };

        const allData: AttendanceData[] = allocData.map((a: any) => {
          const instInfo =
            a.connected_institute_id && instMap.has(a.connected_institute_id)
              ? instMap.get(a.connected_institute_id)!
              : defaultInst;

          return {
            seatNumbers: a.seat_numbers || [],
            blockNo: a.block_no || a.location || 'N/A',
            blockLocation: a.location || '',
            supervisorName: a.supervisor_name || '',
            subjectCode: a.subject_code || '',
            subjectName: a.subject_name || '',
            scheme: a.scheme || '',
            date: new Date(date),
            session: session as 'Morning' | 'Afternoon',
            season: examCenter?.season || '',
            year: examCenter?.examYear || new Date().getFullYear(),
            examCenterCode: examCenter?.code || '',
            examCenterName: examCenter?.name || '',
            instituteCode: instInfo.code,
            instituteName: instInfo.name,
            officerIncharge: examCenter?.officerIncharge || '',
            sealingSupervisor: examCenter?.sealingSupervisor || '',
          };
        });

        setAllAllocations(allData);
      } else {
        setError('No data found');
        setAllAllocations([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
      setAllAllocations([]);
    } finally {
      setLoading(false);
    }
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
