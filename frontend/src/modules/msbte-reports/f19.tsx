// modules/formats/format19.tsx
'use client';

import ReportLayout from '@/components/layout/msbte-report-layout';
import { useUserInfo } from '@/hooks/useUserInfo';

// ============================================================
// Format 19 Content Component - ON THE SPOT INVENTORY DEMAND
// ============================================================

function Format19Content() {
  return (
    <div className="space-y-6 text-sm">
      {/* Title */}
      <div className="text-center">
        <p className="mt-1 text-base font-semibold">On the spot inventory Demand</p>
        <p className="mt-1 text-sm font-medium">
          (To be submitted by the DC after on the spot demand is noticed at the time of issue)
        </p>
      </div>

      {/* Instructions */}
      <div className="space-y-1 rounded-lg border p-3">
        <p>
          <strong>Note:</strong> Scanned copy to be mailed to{' '}
          <span className="font-mono font-semibold">desk42@msbte.com</span>
        </p>
        <p>
          Contact / Send "sms" to the effect that "on the spot inventory demand is mailed from DC: ________" to mobile
          number of any one of Deputy Secretary D-42/Asst Secretary D-42
        </p>
      </div>

      {/* Header Info - DC, EC, Day, Date */}
      <div className="grid grid-cols-4 gap-4 text-sm">
        <div className="flex items-center gap-2">
          <span className="font-medium whitespace-nowrap">DC :</span>
          <span className="flex-1 border-b-2 border-black px-4 py-0.5">&nbsp;</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-medium whitespace-nowrap">EC :</span>
          <span className="flex-1 border-b-2 border-black px-4 py-0.5">&nbsp;</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-medium whitespace-nowrap">Day of Examination :</span>
          <span className="flex-1 border-b-2 border-black px-4 py-0.5">&nbsp;</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-medium whitespace-nowrap">Date :</span>
          <span className="flex-1 border-b-2 border-black px-4 py-0.5">&nbsp;</span>
        </div>
      </div>

      {/* Main Table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse border border-black text-xs">
          <thead>
            <tr>
              <th className="w-[6%] border border-black p-1.5 text-center">Sr.No.</th>
              <th className="w-[12%] border border-black p-1.5 text-center">EC</th>
              <th className="w-[15%] border border-black p-1.5 text-center">Q.P. Code needed urgently</th>
              <th className="w-[18%] border border-black p-1.5 text-center">Additional number of Packets needed</th>
              <th className="w-[49%] border border-black p-1.5 text-center">Reason for additional demand</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 8 }).map((_, index) => (
              <tr key={index} className="h-10">
                <td className="border border-black p-1 text-center align-middle font-medium">{index + 1}</td>
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
              <span className="w-16 text-xs font-medium whitespace-nowrap">Name</span>
              <span className="flex-1 border-b-2 border-black px-4 py-0.5">&nbsp;</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-16 text-xs font-medium whitespace-nowrap">Contact</span>
              <span className="flex-1 border-b-2 border-black px-4 py-0.5">&nbsp;</span>
            </div>
          </div>
        </div>

        {/* Controller of Examination */}
        <div className="space-y-4">
          <p className="text-center font-semibold underline">Controller of Examination</p>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-16 text-xs font-medium whitespace-nowrap">Name</span>
              <span className="flex-1 border-b-2 border-black px-4 py-0.5">&nbsp;</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-16 text-xs font-medium whitespace-nowrap">Contact</span>
              <span className="flex-1 border-b-2 border-black px-4 py-0.5">&nbsp;</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-16 text-xs font-medium whitespace-nowrap">E_Mail ID</span>
              <span className="flex-1 border-b-2 border-black px-4 py-0.5">&nbsp;</span>
            </div>
          </div>
        </div>
      </div>

      {/* Print CSS for clean borders */}
      <style jsx global>{`
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

export default function Format19Report() {
  const { examCenter } = useUserInfo();

  return (
    <ReportLayout
      header={{
        title: 'FORMAT NO. 19',
        subtitle: 'On the spot inventory Demand',
        examSeason: examCenter?.season as 'Summer' | 'Winter',
        examYear: examCenter?.examYear || new Date().getFullYear(),
        examCenterName: examCenter?.name,
        examCenterCode: examCenter?.code,
      }}
      footer={{
        showTimestamp: false,

        alignment: 'center',
      }}
      showBackButton
      documentTitle="Format_19_On_Spot_Inventory_Demand"
      bordered
    >
      <Format19Content />
    </ReportLayout>
  );
}
