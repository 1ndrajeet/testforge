// modules/formats/format13.tsx - Using MultiPageReport with scheme parser

'use client';

import { useEffect, useState } from 'react';

import { format } from 'date-fns';
import { AlertCircle, CheckCircle } from 'lucide-react';
import { CircleAlert, CircleCheckBig } from 'lucide-react';
import { toast } from 'sonner';

import { getAllocationsByDateSession } from '@/lib/actions2/allocation';
import { getTimetableEntries, resolveCopyCase } from '@/lib/actions2/timetable';
import { cn, parseScheme } from '@/lib/utils';

import { useUserInfo } from '@/hooks/useUserInfo';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

import { MultiPageReport, ReportPageData } from '@/components/layout/msbte-report-layout';
import { PageToolbar } from '@/components/layout/page-layout';

import { SessionSelector } from '@/components/shared/date-selector';

// ============================================================
// Constants
// ============================================================

const FORMAT_13_MAX_ROWS = 5;

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
// Format 13 Content Component
// ============================================================

function Format13Content({
  data,
  resolvedCount,
  totalCount,
}: {
  data: MalpracticeData;
  resolvedCount: number;
  totalCount: number;
}) {
  const [statementsRecorded, setStatementsRecorded] = useState(false);
  const [noticeIssued, setNoticeIssued] = useState(false);
  const [noticeDate, setNoticeDate] = useState('');

  const hasRecords = data.records && data.records.length > 0;

  return (
    <div className="space-y-4 text-sm">
      <div className="text-center">
        <p className="text-base font-bold">REPORT OF MALPRACTICE CASES</p>
      </div>

      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="font-medium whitespace-nowrap">Name of examination center</span>
          <span className="flex-1 border-b border-black px-2 font-medium">
            {data.examCenterName || '__________________________________'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-medium whitespace-nowrap">Code No of examination center</span>
          <span className="w-40 border-b border-black px-2 font-medium">
            {data.examCenterCode || '________'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-medium whitespace-nowrap">Date of incidence</span>
          <span className="w-48 border-b border-black px-2 font-medium">
            {data.date ? format(data.date, 'dd/MM/yyyy') : '____________'}
          </span>
        </div>
      </div>

      <div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse border-2 border-black text-[10px]">
            <thead>
              <tr>
                <th className="w-[6%] border-2 border-black p-1 text-center">Sr. No.</th>
                <th className="w-[12%] border-2 border-black p-1 text-center">Seat No.</th>
                <th className="w-[18%] border-2 border-black p-1 text-center">Subject</th>
                <th className="w-[14%] border-2 border-black p-1 text-center">Timing</th>
                <th className="w-[18%] border-2 border-black p-1 text-center">
                  Course-Year-Master
                </th>
                <th className="w-[32%] border-2 border-black p-1 text-center">
                  Nature of malpractice
                </th>
              </tr>
            </thead>
            <tbody>
              {hasRecords ? (
                data.records.map((record, index) => {
                  const parsed = parseScheme(record.scheme || '');
                  const isResolved = record.isResolved;

                  return (
                    <Tooltip key={record.id}>
                      <TooltipTrigger asChild>
                        <tr
                          className={cn(
                            'transition-colors',
                            isResolved
                              ? 'bg-green-50 hover:bg-green-100 print:bg-white'
                              : 'hover:bg-amber-50 print:bg-white',
                          )}
                        >
                          <td className="border-2 border-black p-1 text-center font-medium">
                            {index + 1}
                          </td>
                          <td className="border-2 border-black p-1 text-center font-mono">
                            {record.seatNumber}
                          </td>
                          <td className="border-2 border-black p-1 text-center">
                            <span className="font-mono">{record.subjectCode}</span>
                            <span className="ml-1">- {record.subjectName}</span>
                          </td>
                          <td className="border-2 border-black p-1 text-center">
                            {record.timeSlot || record.session || '—'}
                          </td>
                          <td className="border-2 border-black p-1 text-center">
                            {parsed.courseCode}/{parsed.semester || '—'}/{parsed.master || '—'}
                          </td>
                          <td className="h-12 border-2 border-black p-1" />
                        </tr>
                      </TooltipTrigger>

                      <TooltipContent
                        side="top"
                        className="max-w-xs"
                      >
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
                  <td
                    colSpan={6}
                    className="border-2 border-black p-3 text-center text-neutral-500"
                  >
                    No malpractice cases reported
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-1.5 border-t-2 border-black pt-2">
        <div className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={statementsRecorded}
            onChange={(e) => setStatementsRecorded(e.target.checked)}
            className="mt-0.5 h-3.5 w-3.5"
          />
          <span className="text-[10px]">
            Whether the necessary statements are recorded and other documents supporting the alleged
            incidence of malpractice are collected and sent to the Enquiry Officer?
          </span>
        </div>

        <div className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={noticeIssued}
            onChange={(e) => setNoticeIssued(e.target.checked)}
            className="mt-0.5 h-3.5 w-3.5"
          />
          <span className="text-[10px]">
            Whether the notice informing the date and time of enquiry is issued to the examinee?
          </span>
          {noticeIssued && (
            <span className="ml-2 flex items-center gap-2">
              <span className="text-[10px] text-neutral-500">Date:</span>
              <input
                type="date"
                value={noticeDate}
                onChange={(e) => setNoticeDate(e.target.value)}
                className="border-b border-black px-1 text-[10px]"
              />
            </span>
          )}
        </div>
      </div>

      <div className="space-y-1 border-t-2 border-black pt-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium whitespace-nowrap">Chief officer-in-charge</span>
          <span className="flex-1 border-b border-black px-2 text-[10px]">
            {data.officerIncharge || '_________________________'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium whitespace-nowrap">
            Officer-in-charge, examination
          </span>
          <span className="flex-1 border-b border-black px-2 text-[10px]">
            {data.officerIncharge || '_________________________'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium whitespace-nowrap">
            Controller of examination center
          </span>
          <span className="flex-1 border-b border-black px-2 text-[10px]">
            {data.controller || '_________________________'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium whitespace-nowrap">
            Block supervisor concerned
          </span>
          <span className="flex-1 border-b border-black px-2 text-[10px]">
            _________________________
          </span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 border-t-2 border-black pt-3">
        <div className="text-center">
          <p className="text-[10px] font-medium">Signature of chief</p>
          <p className="text-[10px] font-medium">officer-in-charge</p>
          <div className="mt-4 h-8 border-t-2 border-black" />
        </div>
        <div className="text-center">
          <p className="text-[10px] font-medium">Signature of</p>
          <p className="text-[10px] font-medium">officer-in-charge</p>
          <div className="mt-4 h-8 border-t-2 border-black" />
        </div>
        <div className="text-center">
          <p className="text-[10px] font-medium">Signature of controller</p>
          <p className="text-[10px] font-medium">of exam Center</p>
          <div className="mt-4 h-8 border-t-2 border-black" />
        </div>
      </div>

      <div className="flex items-center justify-between border-black pt-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium">Place:</span>
          <span className="w-48 border-b border-black px-2"></span>
        </div>

        <div className="text-center">
          <p className="text-[10px] font-medium">Seal of examination center</p>
          <div className="mt-1 flex justify-center">
            <div className="h-12 w-12 rounded-full border-2 border-dashed border-neutral-400 bg-neutral-50" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium">Date:</span>
          <span className="w-32 border-b border-black px-2">
            {format(new Date(), 'dd/MM/yyyy')}
          </span>
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
  const [copies, setCopies] = useState(2);

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

      // ✅ DEDUPLICATE: Remove duplicate seat numbers
      const seenSeats = new Set<number>();
      const uniqueRecords: MalpracticeRecord[] = [];

      for (const record of records) {
        if (!seenSeats.has(record.seatNumber)) {
          seenSeats.add(record.seatNumber);
          uniqueRecords.push(record);
        }
      }

      // Sort by seat number
      uniqueRecords.sort((a, b) => a.seatNumber - b.seatNumber);

      setData({
        examCenterName: examCenter?.name || '',
        examCenterCode: examCenter?.code || '',
        date: new Date(date),
        session: session as 'Morning' | 'Afternoon',
        records: uniqueRecords,
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

  const handleReset = () => {
    setShowReport(false);
    setData(null);
    setError(null);
  };

  const handleResolveAll = async () => {
    if (!data) return;

    const pendingRecords = data.records.filter((r) => !r.isResolved);
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
          `Resolved ${successCount} copy case${successCount !== 1 ? 's' : ''}${failCount > 0 ? ` (${failCount} failed)` : ''}`,
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

  // Build pages
  const buildPages = (): ReportPageData[] => {
    if (!data || data.records.length === 0) return [];

    const pages: ReportPageData[] = [];
    const records = data.records;

    for (let i = 0; i < records.length; i += FORMAT_13_MAX_ROWS) {
      const chunk = records.slice(i, i + FORMAT_13_MAX_ROWS);
      const pageIndex = Math.floor(i / FORMAT_13_MAX_ROWS) + 1;
      const chunkData = {
        ...data,
        records: chunk,
      };
      const resolvedCount = chunk.filter((r) => r.isResolved).length;

      pages.push({
        id: `format13-page-${pageIndex}`,
        blockNo: 'N/A',
        blockLocation: '',
        supervisorName: '',
        subjectCode: 'N/A',
        subjectName: 'N/A',
        scheme: 'N/A',
        seatNumbers: [],
        content: (
          <Format13Content
            data={chunkData}
            resolvedCount={resolvedCount}
            totalCount={chunk.length}
          />
        ),
        date: data.date,
        session: data.session,
        examCenterCode: data.examCenterCode,
        examCenterName: data.examCenterName,
        officerIncharge: data.officerIncharge || undefined,
      });
    }

    return pages;
  };

  const allPages = buildPages();

  if (loadingDates) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (!showReport || !data || allPages.length === 0) {
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
            <Alert
              variant="default"
              className="border-amber-200 bg-amber-50"
            >
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

  const pendingCount = data.records.filter((r) => !r.isResolved).length;

  return (
    <div className="mx-auto max-w-4xl p-4">
      <div className="mb-4">
        <PageToolbar
          actions={[
            {
              id: 'resolve-all',
              label: 'Resolve All (' + pendingCount + ')',
              onClick: handleResolveAll,
              icon: <CheckCircle className="h-3 w-3" />,
              variant: 'outline',
            },
          ]}
        />
        <MultiPageReport
          pages={allPages}
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
          onBack={handleReset}
          backButtonLabel="Back"
          documentTitle="Format_13_Malpractice_Report"
          numberOfCopies={copies}
          onCopiesChange={setCopies}
          renderPageContent={(pageData) => pageData.content}
        />
      </div>
    </div>
  );
}
