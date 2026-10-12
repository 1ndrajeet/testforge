// modules/formats/format2.tsx
'use client';

import { useEffect, useState } from 'react';

import { format } from 'date-fns';
import { AlertCircle, Loader2 } from 'lucide-react';

import { createClient } from '@/lib/supabase/client';

import { useUserInfo } from '@/hooks/useUserInfo';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

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

function Format2Content({
  data,
  ecCode,
  distCode,
}: {
  data: ExamRecord[];
  ecCode: string;
  distCode: string;
}) {
  if (!data.length) return null;

  const morningRecords = data.filter((r) => r.session === 'Morning');
  const afternoonRecords = data.filter((r) => r.session === 'Afternoon');

  const morningPackets = morningRecords.reduce((sum, r) => sum + r.receivedPackets, 0);
  const afternoonPackets = afternoonRecords.reduce((sum, r) => sum + r.receivedPackets, 0);
  const hasMorning = morningPackets > 0;
  const hasAfternoon = afternoonPackets > 0;

  const first = data[0];
  const dateStr = format(new Date(first.date), 'dd/MM/yyyy');

  return (
    <div>
      <div className="mb-4 text-center text-sm">
        <p>Receipt to be given by the Officer in Charge of examination centre</p>
        <p>on receipt of question paper bundle from Controller of Examination</p>
      </div>

      <div className="mb-4 space-y-0.5 text-sm">
        <p>
          <strong>EC:</strong> {ecCode}
        </p>
        <p>
          <strong>Day of Examination:</strong> {first.day || 1}
        </p>
        <p>
          <strong>Date:</strong> {dateStr}
        </p>
      </div>

      <div className="mb-4 text-sm">
        <p>Received from Name: ________________________</p>
        <p>the Controller of examination from the distribution Centre {distCode}</p>
        <p>The question paper bundle as per details below:</p>
      </div>

      <table className="mb-4 w-full table-fixed border-collapse border border-black text-sm">
        <thead>
          <tr>
            <th className="w-[16%] border border-black p-1.5 text-center font-bold">
              Exam Centre Code
            </th>
            <th className="w-[12%] border border-black p-1.5 text-center font-bold">Day</th>
            <th className="w-[16%] border border-black p-1.5 text-center font-bold">Date</th>
            <th className="w-[12%] border border-black p-1.5 text-center font-bold">Session</th>
            <th className="w-[29%] border border-black p-1.5 text-center font-bold">
              Bundle details
            </th>
            <th className="w-[15%] border border-black p-1.5 text-center font-bold">
              Total bundles
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="border border-black p-1.5 text-center font-medium">{ecCode}</td>
            <td className="border border-black p-1.5 text-center">{first.day || 1}</td>
            <td className="border border-black p-1.5 text-center">{dateStr}</td>
            <td className="border border-black p-1.5 text-center">Morning</td>
            <td className="border border-black p-1.5 text-center">
              {hasMorning ? `One bundle for morning session` : '—'}
            </td>
            <td className="border border-black p-1.5 text-center font-medium">
              {hasMorning ? '1' : '0'}
            </td>
          </tr>
          <tr>
            <td className="border border-black p-1.5 text-center font-medium">{ecCode}</td>
            <td className="border border-black p-1.5 text-center">{first.day || 1}</td>
            <td className="border border-black p-1.5 text-center">{dateStr}</td>
            <td className="border border-black p-1.5 text-center">Afternoon</td>
            <td className="border border-black p-1.5 text-center">
              {hasAfternoon ? `One bundle for afternoon session` : '—'}
            </td>
            <td className="border border-black p-1.5 text-center font-medium">
              {hasAfternoon ? '1' : '0'}
            </td>
          </tr>
          {hasMorning && hasAfternoon && (
            <tr className="font-semibold">
              <td
                colSpan={5}
                className="border border-black p-1.5 pr-4 text-right"
              >
                Total:
              </td>
              <td className="border border-black p-1.5 text-center">2</td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="mt-10 space-y-1 text-right text-sm">
        <div>
          <p>(Name & Designation)</p>
          <p className="mt-2">
            <strong>Officer in charge EC:</strong> ________________________
          </p>
        </div>
        <div>
          <p>
            <strong>Contact Cell No:</strong> ________________________
          </p>
        </div>
      </div>
    </div>
  );
}

export default function Format2Report() {
  const { examCenter, isLoading: userLoading } = useUserInfo();
  const [data, setData] = useState<ExamRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingDates, setLoadingDates] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [availableDates, setAvailableDates] = useState<Date[]>([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [showReport, setShowReport] = useState(false);

  useEffect(() => {
    if (userLoading) return;
    if (!examCenter?.id) {
      setLoadingDates(false);
      return;
    }
    const fetchDates = async () => {
      setLoadingDates(true);
      const supabase = createClient();
      const { data: rows } = await supabase
        .from('qp_inventory')
        .select('date')
        .eq('exam_center_id', examCenter.id)
        .order('date', { ascending: false });

      if (rows && rows.length > 0) {
        const seen = new Set<string>();
        const unique: Date[] = [];
        rows.forEach((r: any) => {
          const dStr =
            typeof r.date === 'string'
              ? r.date.split('T')[0]
              : new Date(r.date).toISOString().split('T')[0];
          if (!seen.has(dStr)) {
            seen.add(dStr);
            unique.push(new Date(r.date));
          }
        });
        setAvailableDates(unique);
        if (unique.length) {
          setSelectedDate(format(unique[0], 'yyyy-MM-dd'));
        }
      }
      setLoadingDates(false);
    };
    fetchDates();
  }, [examCenter?.id, userLoading]);

  const fetchData = async (date: string) => {
    if (!examCenter?.id) return;
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data: rows, error: qErr } = await supabase
        .from('qp_inventory')
        .select(
          'id, date, session, subject_code, expected_students, expected_packets, received_packets, received_qps, day',
        )
        .eq('exam_center_id', examCenter.id)
        .eq('date', date)
        .order('session')
        .order('subject_code');

      if (qErr) throw qErr;

      if (rows && rows.length > 0) {
        setData(
          rows.map((r: any) => ({
            id: r.id,
            date: new Date(r.date),
            session: r.session,
            subjectCode: r.subject_code,
            expectedStudents: r.expected_students || 0,
            expectedPackets: r.expected_packets || 0,
            receivedPackets: r.received_packets || 0,
            receivedQps: r.received_qps || 0,
            day: r.day,
          })),
        );
        setShowReport(true);
      } else {
        setError('No data available');
        setShowReport(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No data available');
      setShowReport(false);
    } finally {
      setLoading(false);
    }
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
      <div className="mx-auto flex h-64 max-w-2xl items-center justify-center p-6">
        <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
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
          compact
          defaultSession="Morning"
          isLoading={loading}
          error={error}
          title="Format 2 - QP Receipt (Controller to DC)"
          description={availableDates.length ? 'Select a date' : 'No inventory data'}
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
        title: 'FORMAT NO. 2',
        subtitle: 'Receipt for Question Paper Bundle',
        examSeason: examCenter?.season as 'Summer' | 'Winter',
        examYear: examCenter?.examYear!,
        examCenterName: examCenter?.name,
        examCenterCode: examCenter?.code,
        date: selectedDate,
      }}
      showBackButton
      onBack={handleBack}
      documentTitle="Format_2_Report"
      bordered
    >
      <Format2Content
        data={data}
        ecCode={examCenter?.code || ''}
        distCode={examCenter?.distCenterCode || ''}
      />
    </ReportLayout>
  );
}
