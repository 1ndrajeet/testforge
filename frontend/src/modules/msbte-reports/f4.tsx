// modules/formats/format4.tsx
'use client';

import { useUserInfo } from '@/hooks/useUserInfo';

import ReportLayout from '@/components/layout/msbte-report-layout';

function Format4Content({ examCenter }: { examCenter: any }) {
  return (
    <div className="space-y-6 text-sm">
      {/* Institute Info */}
      <div className="flex justify-between">
        <p>
          <strong>Name of the Institute:</strong>{' '}
          {examCenter?.name || '____________________________'}
        </p>
        <p>
          <strong>Code of the Institute:</strong> {examCenter?.code || '___________'}
        </p>
      </div>

      <div className="text-center">
        <p className="text-lg font-bold">THE PACKET IS INTACT AND FOUND IN SEALED CONDITIONS.</p>
      </div>

      <div className="flex justify-between">
        <p>
          <strong>ON DATE:</strong> ____________
        </p>
        <p>
          <strong>AT TIME:</strong> ____________
        </p>
      </div>

      {/* Officer-in-Charge Details */}
      <div>
        <h4 className="mb-3 text-center font-bold underline">Officer-in-Charge Details</h4>
        <div className="space-y-2">
          <div className="flex justify-between">
            <p>
              <strong>Officer-In-Charge (Name):</strong>{' '}
              {examCenter?.officerIncharge || '____________________'}
            </p>
            <p>
              <strong>Signature:</strong> ____________________
            </p>
          </div>
          <div className="flex justify-between">
            <p>
              <strong>Controller of Exam (Name):</strong>
              {examCenter?.exam_controller || '____________________'}
            </p>
            <p>
              <strong>Signature:</strong> ____________________
            </p>
          </div>
          <div className="flex justify-between">
            <p>
              <strong>Supervisor - 1 (Name):</strong> ________________________
            </p>
            <p>
              <strong>Signature:</strong> ____________________
            </p>
          </div>
          <div className="flex justify-between">
            <p>
              <strong>Supervisor - 2 (Name):</strong> ________________________
            </p>
            <p>
              <strong>Signature:</strong> ____________________
            </p>
          </div>
          <div className="flex justify-between">
            <p>
              <strong>Police - 1 (Name):</strong> ___________________________
            </p>
            <p>
              <strong>Signature:</strong> ____________________
            </p>
          </div>
          <div className="flex justify-between">
            <p>
              <strong>Police - 2 (Name):</strong> ___________________________
            </p>
            <p>
              <strong>Signature:</strong> ____________________
            </p>
          </div>
          <div className="flex justify-between">
            <p>
              <strong>Student - 1 (Seat No):</strong> ________________________
            </p>
            <p>
              <strong>Signature:</strong> ____________________
            </p>
          </div>
          <div className="flex justify-between">
            <p>
              <strong>Student - 2 (Seat No):</strong> ________________________
            </p>
            <p>
              <strong>Signature:</strong> ____________________
            </p>
          </div>
        </div>
      </div>

      {/* Question Paper Account */}
      <div>
        <h4 className="mb-3 text-center font-bold underline">QUESTION PAPER ACCOUNT</h4>
        <div className="space-y-2">
          <div className="flex justify-between">
            <p>
              <strong>Question Papers received in packet:</strong> ____________________
            </p>
            <p>
              <strong>Date:</strong> ____________
            </p>
          </div>
          <div className="flex justify-between">
            <p>
              <strong>Question Papers used:</strong> ____________________
            </p>
            <p>
              <strong>Total Question Papers Used:</strong> ____________
            </p>
          </div>
          <div className="flex justify-between">
            <p>
              <strong>Question Papers kept in packet for RAC:</strong> ____________________
            </p>
            <p>
              <strong>Balance Question Papers:</strong> ____________
            </p>
          </div>
        </div>
      </div>

      {/* Signatures */}
      <div className="mt-8 space-y-2">
        <p>
          <strong>Name & Signature of Officer-In-Charge:</strong> ____________________________
        </p>
        <p>
          <strong>Name & Signature of Officer-In-Charge:</strong> ____________________________
        </p>
      </div>
    </div>
  );
}

export default function Format4Report() {
  const { examCenter } = useUserInfo();

  return (
    <ReportLayout
      header={{
        title: 'FORMAT NO. 4',
        subtitle: 'Question Paper Packet Verification',
        examSeason: examCenter?.season as 'Summer' | 'Winter',
        examYear: examCenter?.examYear!,
        examCenterName: examCenter?.name,
        examCenterCode: examCenter?.code,
      }}
      showBackButton
      documentTitle="Format_4_Report"
      bordered
    >
      <Format4Content examCenter={examCenter} />
    </ReportLayout>
  );
}
