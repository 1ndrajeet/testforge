// modules/formats/format13.tsx
'use client';

import { useEffect, useState } from 'react';

import { format } from 'date-fns';
import { AlertCircle, CheckCircle } from 'lucide-react';
import { CircleAlert, CircleCheckBig } from 'lucide-react';
import { toast } from 'sonner';

import ReportLayout from '@/components/layout/msbte-report-layout';
import { SessionSelector } from '@/components/shared/date-selector';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useUserInfo } from '@/hooks/useUserInfo';
import { getAllocationsByDateSession } from '@/lib/actions/allocation';
import { getTimetableEntries, resolveCopyCase } from '@/lib/actions/timetable';
import { cn } from '@/lib/utils';

// ============================================================
// Types
// ============================================================

interface MalpracticeRecord {
  id: string;
  seatNumber: number;
  subjectCode: string;
  subjectName: string;
  scheme: string;
  session: 'Morning' | 'Afternoon' | 'All';
  timeSlot: string;
  blockNo: string;
  blockLocation: string;
  supervisorName: string | null;
  date: Date;
  isResolved: boolean;
}

interface MalpracticeData {
  examCenterName: string;
  examCenterCode: string;
  date: Date;
  session: 'Morning' | 'Afternoon' | 'All';
  records: MalpracticeRecord[];
  officerIncharge: string | null;
  controller: string | null;
}

// ============================================================
// Format 13 Content Component - CLEAN MSBTE FORMAT
// ============================================================

function Format13Content({ data }: { data: MalpracticeData; resolvedCount: number; totalCount: number }) {
  const [statementsRecorded, setStatementsRecorded] = useState(false);
  const [noticeIssued, setNoticeIssued] = useState(false);
  const [noticeDate, setNoticeDate] = useState('');

  const hasRecords = data.records && data.records.length > 0;

  return (
    <div className="space-y-5 text-sm">
      {/* Heading */}
      <div className="text-center">
        <p className="text-lg font-bold">REPORT OF MALPRACTICE CASES</p>
      </div>

      {/* Header Info */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="font-medium whitespace-nowrap">Name of examination center</span>
          <span className="flex-1 border-b-0 border-black px-2 font-medium">
            {data.examCenterName || '__________________________________'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-medium whitespace-nowrap">Code No of examination center</span>
          <span className="w-40 border-b-0 border-black px-2 font-medium">{data.examCenterCode || '________'}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-medium whitespace-nowrap">Date of incidence</span>
          <span className="w-48 border-b-0 border-black px-2 font-medium">
            {data.date ? format(data.date, 'dd/MM/yyyy') : '____________'}
          </span>
        </div>
      </div>

      {/* Malpractice Table - EXACT MSBTE FORMAT */}
      <div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse border-2 border-black text-xs">
            <thead>
              <tr>
                <th className="w-[6%] border-2 border-black p-1.5 text-center">Sr. No.</th>
                <th className="w-[12%] border-2 border-black p-1.5 text-center">Examination Seat Number of examinee</th>
                <th className="w-[18%] border-2 border-black p-1.5 text-center">Subject of Examination</th>
                <th className="w-[14%] border-2 border-black p-1.5 text-center">Timing of examination</th>
                <th className="w-[18%] border-2 border-black p-1.5 text-center">Course-Year-Master of examination</th>
                <th className="w-[32%] border-2 border-black p-1.5 text-center">Nature of malpractice</th>
              </tr>
            </thead>
            <tbody>
              {hasRecords ? (
                data.records.map((record, index) => {
                  const schemeParts = record.scheme?.split('-') || [];
                  const course = schemeParts[0] || '';
                  const year = schemeParts[1] || '';
                  const master = schemeParts[2] || '';
                  const isResolved = record.isResolved;

                  return (
                    <Tooltip key={record.id}>
                      <TooltipTrigger asChild>
                        <tr
                          className={cn(
                            'transition-colors',
                            isResolved
                              ? 'bg-green-50 hover:bg-green-100 print:bg-white'
                              : 'hover:bg-amber-50 print:bg-white'
                          )}
                        >
                          <td className="border-2 border-black p-1.5 text-center font-medium">{index + 1}</td>
                          <td className="border-2 border-black p-1.5 text-center font-mono">{record.seatNumber}</td>
                          <td className="border-2 border-black p-1.5 text-center">
                            <span className="font-mono">{record.subjectCode}</span>
                            <span className="ml-1">- {record.subjectName}</span>
                          </td>
                          <td className="border-2 border-black p-1.5 text-center">
                            {record.timeSlot || record.session || '—'}
                          </td>
                          <td className="border-2 border-black p-1.5 text-center">
                            {course}/{year || '—'}/{master || '—'}
                          </td>
                          <td className="h-16 border-2 border-black p-2" />
                        </tr>
                      </TooltipTrigger>

                      <TooltipContent side="top" className="max-w-xs">
                        <div className="flex items-center gap-2">
                          {isResolved ? (
                            <>
                              <CircleCheckBig className="h-4 w-4 text-green-600" />
                              <div>
                                <p className="font-medium">Resolved</p>
                                <p className="text-muted-foreground text-xs">
                                  This copy case has already been resolved.
                                </p>
                              </div>
                            </>
                          ) : (
                            <>
                              <CircleAlert className="h-4 w-4 text-amber-600" />
                              <div>
                                <p className="font-medium">Pending Resolution</p>
                                <p className="text-muted-foreground text-xs">
                                  This copy case requires manual verification.
                                </p>
                              </div>
                            </>
                          )}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="border-2 border-black p-4 text-center text-neutral-500">
                    No malpractice cases reported for this session
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Administrative Checks */}
      <div className="space-y-2 border-t-2 border-black pt-3">
        <div className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={statementsRecorded}
            onChange={e => setStatementsRecorded(e.target.checked)}
            className="mt-0.5 h-4 w-4"
          />
          <span className="text-xs">
            Whether the necessary statements are recorded and other documents supporting the alleged incidence of
            malpractice are collected, as required under Board&apos;s Regulations and sent to the Enquiry Officer?
          </span>
        </div>

        <div className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={noticeIssued}
            onChange={e => setNoticeIssued(e.target.checked)}
            className="mt-0.5 h-4 w-4"
          />
          <span className="text-xs">
            Whether the notice informing the date and time of enquiry is issued to the examinee? If yes, when?
          </span>
          {noticeIssued && (
            <span className="ml-2 flex items-center gap-2">
              <span className="text-xs text-neutral-500">Date:</span>
              <input
                type="date"
                value={noticeDate}
                onChange={e => setNoticeDate(e.target.value)}
                className="border-b border-black px-2 text-sm"
              />
            </span>
          )}
        </div>
      </div>

      {/* Staff Details */}
      <div className="space-y-1.5 border-t-2 border-black pt-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium whitespace-nowrap">Name of Chief officer-in-charge</span>
          <span className="flex-1 border-b-0 border-black px-2 text-xs">
            {data.officerIncharge || '_________________________'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium whitespace-nowrap">Name of Officer-in-charge, examination</span>
          <span className="flex-1 border-b-0 border-black px-2 text-xs">
            {data.officerIncharge || '_________________________'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium whitespace-nowrap">Name of controller of examination center</span>
          <span className="flex-1 border-b-0 border-black px-2 text-xs">
            {data.controller || '_________________________'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium whitespace-nowrap">Name of block supervisor / staff concerned</span>
          <span className="flex-1 border-b-0 border-black px-2 text-xs">_________________________</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium whitespace-nowrap">
            Name of the leader of the external vigilance committee
          </span>
          <span className="flex-1 border-b-0 border-black px-2 text-xs">_________________________</span>
        </div>
      </div>

      {/* Signatures */}
      <div className="grid grid-cols-3 gap-4 border-t-2 border-black pt-4">
        <div className="text-center">
          <p className="text-xs font-medium">Signature of chief</p>
          <p className="text-xs font-medium">officer-in-charge</p>
          <p className="mt-6 border-t-2 border-black px-2"></p>
        </div>
        <div className="text-center">
          <p className="text-xs font-medium">Signature of</p>
          <p className="text-xs font-medium">officer-in-charge</p>
          <p className="mt-6 border-t-2 border-black px-2"></p>
        </div>
        <div className="text-center">
          <p className="text-xs font-medium">Signature of controller</p>
          <p className="text-xs font-medium">of exam Center</p>
          <p className="mt-6 border-t-2 border-black px-2"></p>
        </div>
      </div>

      {/* Place and Date */}
      <div className="flex items-center justify-between border-black pt-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium">Place:</span>
          <span className="w-48 border-b-0 border-black px-2"></span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium">Date:</span>
          <span className="w-40 border-b-0 border-black px-2">{format(new Date(), 'dd/MM/yyyy')}</span>
        </div>
      </div>

      {/* Seal */}
      <div className="text-center">
        <p className="text-xs font-medium">Seal of examination center</p>
        <div className="mt-2 flex justify-center">
          <div className="h-16 w-16 rounded-full border-2 border-dashed border-neutral-400 bg-neutral-50" />
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Main Component
// ============================================================

export default function Format13Report() {
  const { examCenter } = useUserInfo();
  const [loading, setLoading] = useState(false);
  const [loadingDates, setLoadingDates] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dates, setDates] = useState<Date[]>([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedSession, setSelectedSession] = useState('');
  const [showReport, setShowReport] = useState(false);
  const [data, setData] = useState<MalpracticeData | null>(null);
  const [resolvingAll, setResolvingAll] = useState(false);

  // Fetch available dates
  useEffect(() => {
    const fetchDates = async () => {
      const result = await getTimetableEntries();
      if (result.success && result.data) {
        const unique = [...new Set(result.data.map((r: any) => r.date))];
        setDates(unique);
        if (unique.length) {
          const first = format(unique[0], 'yyyy-MM-dd');
          setSelectedDate(first);
        }
      }
      setLoadingDates(false);
    };
    fetchDates();
  }, []);

  // Fetch malpractice data for the selected date and session
  const fetchMalpracticeData = async (date: string, session: string) => {
    setLoading(true);
    setError(null);

    try {
      const allocationsResult = await getAllocationsByDateSession(new Date(date), session);

      if (!allocationsResult.success) {
        setError(allocationsResult.error || 'Failed to fetch data');
        setShowReport(false);
        return;
      }

      const timetableResult = await getTimetableEntries({
        date: new Date(date),
        session: session as 'Morning' | 'Afternoon',
      });

      if (!timetableResult.success) {
        setError(timetableResult.error || 'Failed to fetch timetable');
        setShowReport(false);
        return;
      }

      const cpsMap = new Map<
        string,
        { cpsStudents: number[]; cpsResolved: number[]; timeSlot: string; subjectName: string }
      >();

      timetableResult.data?.forEach((entry: any) => {
        const key = `${entry.subjectCode}_${entry.scheme}`;
        const cpsStudents = entry.cpsStudents || [];
        if (cpsStudents.length > 0) {
          cpsMap.set(key, {
            cpsStudents: cpsStudents,
            cpsResolved: entry.cpsResolved || [],
            timeSlot: entry.timeSlot,
            subjectName: entry.subjectName,
          });
        }
      });

      const records: MalpracticeRecord[] = [];

      allocationsResult.data?.forEach((alloc: any) => {
        const key = `${alloc.subjectCode}_${alloc.scheme}`;
        const cpsData = cpsMap.get(key);

        if (cpsData && cpsData.cpsStudents.length > 0) {
          cpsData.cpsStudents.forEach((seatNumber: number) => {
            const isResolved = cpsData.cpsResolved?.includes(seatNumber) || false;
            records.push({
              id: `${alloc.id}-${seatNumber}`,
              seatNumber: seatNumber,
              subjectCode: alloc.subjectCode,
              subjectName: cpsData.subjectName || alloc.subjectName,
              scheme: alloc.scheme,
              session: alloc.session as 'Morning' | 'Afternoon',
              timeSlot: cpsData.timeSlot || alloc.timeslot || '',
              blockNo: alloc.blockNo || 'N/A',
              blockLocation: alloc.location || '',
              supervisorName: alloc.supervisorName || null,
              date: new Date(date),
              isResolved,
            });
          });
        }
      });

      records.sort((a, b) => a.seatNumber - b.seatNumber);

      setData({
        examCenterName: examCenter?.name || '',
        examCenterCode: examCenter?.code || '',
        date: new Date(date),
        session: session as 'Morning' | 'Afternoon',
        records,
        officerIncharge: examCenter?.officerIncharge || null,
        controller: examCenter?.examController || null,
      });

      setShowReport(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
      setShowReport(false);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = async (s: { date: string; session: 'Morning' | 'Afternoon' | 'All' }) => {
    setSelectedDate(s.date);
    setSelectedSession(s.session);
    await fetchMalpracticeData(s.date, s.session);
  };

  const handleBack = () => {
    setShowReport(false);
    setData(null);
    setError(null);
  };

  const handleResolveAll = async () => {
    if (!data) return;

    const pendingRecords = data.records.filter(r => !r.isResolved);
    if (pendingRecords.length === 0) {
      toast.info('All copy cases are already resolved');
      return;
    }

    setResolvingAll(true);
    let successCount = 0;
    let failCount = 0;

    try {
      for (const record of pendingRecords) {
        const result = await resolveCopyCase({
          subjectCode: record.subjectCode,
          scheme: record.scheme,
          date: data.date,
          session: data.session,
          seatNumber: record.seatNumber,
        });

        if (result.success) {
          successCount++;
        } else {
          failCount++;
        }
      }

      if (successCount > 0) {
        toast.success(
          `Resolved ${successCount} copy case${successCount !== 1 ? 's' : ''}${failCount > 0 ? ` (${failCount} failed)` : ''}`
        );
        await fetchMalpracticeData(selectedDate, selectedSession);
      } else {
        toast.error('Failed to resolve any copy cases');
      }
    } catch {
      toast.error('Failed to resolve copy cases');
    } finally {
      setResolvingAll(false);
    }
  };

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
            defaultDate={selectedDate}
            defaultSession="Morning"
            isLoading={loading}
            error={error}
            title="Format 13 - Malpractice Report"
            description="Select date and session to view malpractice cases"
            compact
          />
          {!dates.length && !error && (
            <Alert variant="default" className="border-amber-200 bg-amber-50">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <AlertTitle>No Data</AlertTitle>
              <AlertDescription>Upload timetable and mark copy cases first.</AlertDescription>
            </Alert>
          )}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>
      </div>
    );
  }

  if (!data || data.records.length === 0) {
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
            title="Format 13 - Malpractice Report"
            description="No copy cases found for this session"
            compact
          />
          <Alert variant="default" className="border-blue-200 bg-blue-50">
            <AlertCircle className="h-4 w-4 text-blue-600" />
            <AlertTitle>No Malpractice Cases</AlertTitle>
            <AlertDescription>
              No copy cases have been marked for this session. Mark copy cases in the Exam Day module first.
            </AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  const resolvedCount = data.records.filter(r => r.isResolved).length;
  const totalCount = data.records.length;
  const pendingCount = totalCount - resolvedCount;

  return (
    <ReportLayout
      header={{
        title: 'FORMAT NO. 13',
        subtitle: 'Malpractice Report',
        examSeason: examCenter?.season as 'Summer' | 'Winter',
        examYear: examCenter?.examYear || new Date().getFullYear(),
        examCenterName: examCenter?.name,
        examCenterCode: examCenter?.code,
        date: data.date,
        session: data.session,
      }}
      footer={{
        showTimestamp: false,
      }}
      actions={[
        {
          label: 'Resolve All (' + pendingCount + ')',
          onClick: handleResolveAll,
          icon: <CheckCircle className="h-3 w-3" />,
          variant: 'outline',
          size: 'sm',
          disabled: resolvingAll,
          loading: resolvingAll,
        },
      ]}
      actionsPosition="right"
      showBackButton
      onBack={handleBack}
      documentTitle="Format_13_Malpractice_Report"
      bordered
    >
      <Format13Content data={data} resolvedCount={resolvedCount} totalCount={totalCount} />
    </ReportLayout>
  );
}
