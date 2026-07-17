// modules/formats/format3a.tsx
'use client';

import { useEffect, useState } from 'react';

import { format } from 'date-fns';
import { AlertCircle } from 'lucide-react';

import { getAvailableInventoryDates, getQPInventory } from '@/lib/actions2/inventory';

import { useUserInfo } from '@/hooks/useUserInfo';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';

import ReportLayout from '@/components/layout/msbte-report-layout';

import { SessionSelector } from '@/components/shared/date-selector';

interface ExamRecord {
  id: string;
  date: Date;
  session: 'Morning' | 'Afternoon' | 'All';
  subjectCode: string;
  expectedStudents: number;
  expectedPackets: number;
  receivedPackets: number;
  receivedQps: number;
  day: number | null;
}

function Format3AContent({ data, distCode }: { data: ExamRecord[]; distCode: string }) {
  if (!data.length) return null;

  const first = data[0];
  const dateStr = format(new Date(first.date), 'dd/MM/yyyy');
  const sessions = ['Morning', 'Afternoon', 'All'];

  return (
    <div>
      <div className="mb-4 text-center">
        <p className="text-sm font-medium">
          Receipt to be given by the Officer in Charge of examination centre to the officer in
          charge, DC
        </p>
        <p className="text-sm font-medium">Receipt of question paper packets</p>
      </div>

      <div className="mb-4 text-sm">
        <p>
          The question paper bundles received from Name: ________________________ the Controller of
          examination from the
        </p>
        <p>
          Distribution Centre {distCode} were opened in the examination control room and the
          contents were as below;
        </p>
      </div>

      <table className="mb-4 w-full table-fixed border-collapse border border-black text-sm">
        <thead>
          <tr>
            <th className="w-[8%] border border-black p-1.5 text-center font-bold">Sr.No</th>
            <th className="w-[12%] border border-black p-1.5 text-center font-bold">Date</th>
            <th className="w-[10%] border border-black p-1.5 text-center font-bold">Session</th>
            <th className="w-[10%] border border-black p-1.5 text-center font-bold">
              Time of Opening
            </th>
            <th
              className="w-[20%] border border-black p-1.5 text-center font-bold"
              colSpan={2}
            >
              Content as per label on bundle
            </th>
            <th
              className="w-[20%] border border-black p-1.5 text-center font-bold"
              colSpan={2}
            >
              Actual content in the bundle
            </th>
            <th className="w-[15%] border border-black p-1.5 text-center font-bold">Remark</th>
          </tr>
          <tr>
            <th className="border border-black p-1.5 text-center font-bold"></th>
            <th className="border border-black p-1.5 text-center font-bold"></th>
            <th className="border border-black p-1.5 text-center font-bold"></th>
            <th className="border border-black p-1.5 text-center font-bold"></th>
            <th className="border border-black p-1.5 text-center font-bold">Q.P. Code</th>
            <th className="border border-black p-1.5 text-center font-bold">Number</th>
            <th className="border border-black p-1.5 text-center font-bold">Q.P. Code</th>
            <th className="border border-black p-1.5 text-center font-bold">Number</th>
            <th className="border border-black p-1.5 text-center font-bold"></th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((session, idx) => {
            const sessionRecords = data.filter((r) => r.session === session);
            if (!sessionRecords.length) return null;

            return (
              <tr key={session}>
                <td className="border border-black p-1.5 text-center align-top font-medium">
                  {idx + 1}
                </td>
                <td className="border border-black p-1.5 text-center align-top">{dateStr}</td>
                <td className="border border-black p-1.5 text-center align-top">{session}</td>
                <td className="border border-black p-1.5 text-center align-top">
                  {session === 'Morning' ? '9.10 am' : '1.40 pm'}
                </td>
                <td className="border border-black p-1.5 align-top">
                  {sessionRecords.map((record, i) => (
                    <div
                      key={i}
                      className="py-0.5 text-center"
                    >
                      {record.subjectCode}
                    </div>
                  ))}
                </td>
                <td className="border border-black p-1.5 align-top">
                  {sessionRecords.map((record, i) => (
                    <div
                      key={i}
                      className="py-0.5 text-center"
                    >
                      {record.expectedPackets || 0}
                    </div>
                  ))}
                </td>
                <td className="border border-black p-1.5 align-top">
                  {sessionRecords.map((record, i) => (
                    <div
                      key={i}
                      className="py-0.5 text-center"
                    >
                      {record.subjectCode}
                    </div>
                  ))}
                </td>
                <td className="border border-black p-1.5 align-top">
                  {sessionRecords.map((record, i) => (
                    <div
                      key={i}
                      className="py-0.5 text-center"
                    >
                      {record.receivedPackets || 0}
                    </div>
                  ))}
                </td>
                <td className="border border-black p-1.5 text-center align-top">
                  {sessionRecords.some((r) => r.receivedPackets !== r.expectedPackets)
                    ? 'Discrepancy'
                    : 'Matched'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="mt-12 flex justify-between text-sm">
        <div>
          <p>Seal of the Institute.</p>
        </div>
        <div className="text-right">
          <p>(Name & Designation)</p>
          <p>
            <strong>Officer in charge EC:</strong> ________________________
          </p>
        </div>
      </div>
    </div>
  );
}

export default function Format3AReport() {
  const { examCenter } = useUserInfo();
  const [data, setData] = useState<ExamRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingDates, setLoadingDates] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [availableDates, setAvailableDates] = useState<Date[]>([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [showReport, setShowReport] = useState(false);

  useEffect(() => {
    const fetchDates = async () => {
      setLoadingDates(true);
      const result = await getAvailableInventoryDates();
      if (result.success && result.data?.length) {
        setAvailableDates(result.data);
        const first = format(result.data[0], 'yyyy-MM-dd');
        setSelectedDate(first);
      }
      setLoadingDates(false);
    };
    fetchDates();
  }, []);

  const fetchData = async (date: string) => {
    setLoading(true);
    setError(null);
    const result = await getQPInventory(new Date(date));
    if (result.success && result.data?.length) {
      setData(result.data);
      setShowReport(true);
    } else {
      setError(result.error || 'No data available');
      setShowReport(false);
    }
    setLoading(false);
  };

  const handleSelect = async (session: { date: string }) => {
    setSelectedDate(session.date);
    await fetchData(session.date);
  };

  const handleBack = () => {
    setShowReport(false);
    setError(null);
  };

  if (loadingDates) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 p-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-24" />
        </div>
      </div>
    );
  }

  if (!showReport) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 p-6">
        <SessionSelector
          availableDates={availableDates}
          availableSessions={['Morning']}
          hideSession
          onSessionSelect={handleSelect}
          defaultDate={selectedDate}
          defaultSession="Morning"
          isLoading={loading}
          error={error}
          title="FORMAT 3A REPORT"
          description={availableDates.length ? 'Select a date' : 'No inventory data'}
          compact
        />
        {!availableDates.length && !error && (
          <Alert
            variant="default"
            className="border-amber-200 bg-amber-50"
          >
            <AlertCircle className="h-4 w-4 text-amber-600" />
            <AlertTitle>No Data</AlertTitle>
            <AlertDescription>Upload inventory data first.</AlertDescription>
          </Alert>
        )}
      </div>
    );
  }

  return (
    <ReportLayout
      header={{
        title: 'FORMAT NO. 3A',
        subtitle: 'Receipt of Question Paper Packets',
        examSeason: examCenter?.season as 'Summer' | 'Winter',
        examYear: examCenter?.examYear!,
        examCenterName: examCenter?.name,
        examCenterCode: examCenter?.code,
        date: selectedDate,
      }}
      showBackButton
      onBack={handleBack}
      documentTitle="Format_3A_Report"
      bordered
    >
      <Format3AContent
        data={data}
        distCode={examCenter?.distCenterCode || ''}
      />
    </ReportLayout>
  );
}
