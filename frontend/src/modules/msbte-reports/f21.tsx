// modules/formats/format21.tsx
'use client';

import { useUserInfo } from '@/hooks/useUserInfo';

import ReportLayout from '@/components/layout/msbte-report-layout';

// ============================================================
// Format 21 Content Component - INVENTORY DISCREPANCY REPORT
// ============================================================

function Format21Content() {
  return (
    <div className="space-y-6 text-sm">
      {/* Title */}
      <div className="text-center">
        <p className="mt-1 text-base font-semibold">Inventory Discrepancy Report</p>
      </div>

      {/* Header - DC and Date */}
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <span className="font-medium whitespace-nowrap">DC</span>
          <span className="min-w-[150px] flex-1 border-b-2 border-black px-8 py-0.5">&nbsp;</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-medium whitespace-nowrap">Date :</span>
          <span className="min-w-[150px] border-b-2 border-black px-8 py-0.5">&nbsp;</span>
        </div>
      </div>

      {/* Report Body */}
      <div className="space-y-4 text-justify">
        <p>
          Received the EC-wise question paper boxes for the DC{' '}
          <span className="min-w-[80px] border-b-2 border-black px-6 py-0.5">&nbsp;</span>
          on <span className="min-w-[100px] border-b-2 border-black px-6 py-0.5">&nbsp;</span>. The
          boxes were opened and the question paper bundles were arranged EC-wise / Day-wise manner
          and compared with the EC-wise time table for the EC.
        </p>
        <p className="font-medium">Following discrepancies were noticed after the verification;</p>
      </div>

      {/* Main Table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse border border-black text-xs">
          <thead>
            <tr>
              <th className="w-[6%] border border-black p-1.5 text-center">Sr.No.</th>
              <th className="w-[10%] border border-black p-1.5 text-center">EC</th>
              <th className="w-[8%] border border-black p-1.5 text-center">Day</th>
              <th className="w-[10%] border border-black p-1.5 text-center">Session</th>
              <th className="w-[18%] border border-black p-1.5 text-center">
                EC Time table indication
              </th>
              <th className="w-[18%] border border-black p-1.5 text-center">EC Q.P. demand</th>
              <th className="w-[30%] border border-black p-1.5 text-center">Q.P. bundle</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 8 }).map((_, index) => (
              <tr
                key={index}
                className="h-10"
              >
                <td className="border border-black p-1 text-center align-middle font-medium">
                  {index + 1}
                </td>
                <td className="border border-black p-1 text-center">&nbsp;</td>
                <td className="border border-black p-1 text-center">&nbsp;</td>
                <td className="border border-black p-1 text-center">&nbsp;</td>
                <td className="border border-black p-1 text-center">&nbsp;</td>
                <td className="border border-black p-1 text-center">&nbsp;</td>
                <td className="border border-black p-1 text-center">&nbsp;</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Signature Section */}
      <div className="mt-8 grid grid-cols-2 gap-8 border-t border-black pt-6">
        {/* Officer in Charge DC */}
        <div className="space-y-4">
          <p className="text-center font-semibold underline">Officer in Charge DC</p>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-24 text-xs font-medium whitespace-nowrap">Name</span>
              <span className="flex-1 border-b-2 border-black px-4 py-0.5">&nbsp;</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-24 text-xs font-medium whitespace-nowrap">Contact Cell No:</span>
              <span className="flex-1 border-b-2 border-black px-4 py-0.5">&nbsp;</span>
            </div>
          </div>
        </div>

        {/* Chief Officer in Charge DC */}
        <div className="space-y-4">
          <p className="text-center font-semibold underline">Chief Officer in Charge DC</p>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-24 text-xs font-medium whitespace-nowrap">Name</span>
              <span className="flex-1 border-b-2 border-black px-4 py-0.5">&nbsp;</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-24 text-xs font-medium whitespace-nowrap">Contact Cell No:</span>
              <span className="flex-1 border-b-2 border-black px-4 py-0.5">&nbsp;</span>
            </div>
          </div>
        </div>
      </div>

      {/* Important Note */}
      <div className="mt-4 rounded-lg border p-3">
        <p>
          <strong>Note:</strong> Time table may show exam for the session but EC may not have Q.P.
          demand. In such cases inventory discrepancy need not be filed.
        </p>
      </div>

      {/* Print CSS for clean borders */}
      <style
        jsx
        global
      >{`
        @media print {
          table {
            page-break-inside: avoid;
          }
          tr {
            page-break-inside: avoid;
          }
        }
      `}</style>
    </div>
  );
}

// ============================================================
// Main Component
// ============================================================

export default function Format21Report() {
  const { examCenter } = useUserInfo();

  return (
    <ReportLayout
      header={{
        title: 'FORMAT NO. 21',
        subtitle: 'Inventory Discrepancy Report',
        examSeason: examCenter?.season as 'Summer' | 'Winter',
        examYear: examCenter?.examYear || new Date().getFullYear(),
      }}
      footer={{
        showTimestamp: false,

        alignment: 'center',
      }}
      showBackButton
      documentTitle="Format_21_Inventory_Discrepancy_Report"
      bordered
    >
      <Format21Content />
    </ReportLayout>
  );
}
