// modules/formats/format11.tsx
'use client';

import ReportLayout from '@/components/layout/msbte-report-layout';
import { useUserInfo } from '@/hooks/useUserInfo';

// ============================================================
// Format 11 Content Component - STATIC TEMPLATE (Horizontal/Landscape)
// ============================================================

function Format11Content({ examCenter }: { examCenter: any }) {
  const examSeason = examCenter?.season || 'Winter';
  const examYear = examCenter?.examYear || '____';

  return (
    <>
      <div className="mb-3 text-center text-sm">
        <p className="font-medium">Account of Blank Answer Books Issued</p>
      </div>

      {/* Header Info */}
      <div className="mb-3 flex justify-between text-xs">
        <p>
          <strong>EXAM:</strong> {examSeason} / {examYear}
        </p>
        <p>
          <strong>NAME OF THE INSTITUTE:</strong> ____________________________________________
        </p>
        <p>
          <strong>CODE NO.:</strong> ____________
        </p>
      </div>

      {/* Table - Horizontal/Landscape layout */}
      <table className="w-full border-collapse border border-black text-[9px]">
        <thead>
          <tr>
            <th className="w-[4%] border border-black p-0.5 text-center">Sr. No.</th>
            <th className="w-[7%] border border-black p-0.5 text-center">Date</th>
            <th className="w-[7%] border border-black p-0.5 text-center">Time</th>
            <th className="w-[10%] border border-black p-0.5 text-center">Course +Sem +year + Master</th>
            <th className="w-[4%] border border-black p-0.5 text-center">From</th>
            <th className="w-[4%] border border-black p-0.5 text-center">To</th>
            <th className="w-[6%] border border-black p-0.5 text-center">Total No.</th>
            <th className="w-[13%] border border-black p-0.5 text-center">
              Sr. No. Of Ans. Books issued to examinees in this session
            </th>
            <th className="w-[13%] border border-black p-0.5 text-center">
              Sr. Nos. Of Answer Books, if issued from previous unused Ans. Books
            </th>
            <th className="w-[11%] border border-black p-0.5 text-center">
              Sr. No. of Ans. Books remaining unused in this session
            </th>
            <th className="w-[7%] border border-black p-0.5 text-center">Total Answer books used</th>
            <th className="w-[10%] border border-black p-0.5 text-center">Dated sign of Officer-in-charge</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 15 }).map((_, index) => (
            <tr key={index}>
              <td className="h-5 border border-black p-0.5 text-center">{index + 1}</td>
              <td className="h-5 border border-black p-0.5"></td>
              <td className="h-5 border border-black p-0.5"></td>
              <td className="h-5 border border-black p-0.5"></td>
              <td className="h-5 border border-black p-0.5"></td>
              <td className="h-5 border border-black p-0.5"></td>
              <td className="h-5 border border-black p-0.5"></td>
              <td className="h-5 border border-black p-0.5"></td>
              <td className="h-5 border border-black p-0.5"></td>
              <td className="h-5 border border-black p-0.5"></td>
              <td className="h-5 border border-black p-0.5"></td>
              <td className="h-5 border border-black p-0.5"></td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Note */}
      <div className="mt-3 text-[9px]">
        <p>
          <strong>NOTE:</strong> The account should be maintained in a bound-book / register and not on loose sheets of
          paper.
        </p>
      </div>
    </>
  );
}

// ============================================================
// Main Component
// ============================================================

export default function Format11Report() {
  const { examCenter } = useUserInfo();

  return (
    <ReportLayout
      header={{
        title: 'FORMAT NO. 11',
        subtitle: 'Account of Blank Answer Books Issued',
        examSeason: examCenter?.season as 'Summer' | 'Winter',
        examYear: examCenter?.examYear || new Date().getFullYear(),
        examCenterName: examCenter?.name,
        examCenterCode: examCenter?.code,
      }}
      footer={{
        showTimestamp: false,
      }}
      showBackButton
      documentTitle="Format_11_Report"
      bordered
      pageStyle={{
        width: '297mm',
        height: '210mm',
        padding: '8mm 10mm',
      }}
      // Add this to force landscape in print
      printLandscape={true}
    >
      <Format11Content examCenter={examCenter} />
    </ReportLayout>
  );
}
