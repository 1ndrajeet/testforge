// modules/formats/format18.tsx
'use client';

import { useUserInfo } from '@/hooks/useUserInfo';

import ReportLayout from '@/components/layout/msbte-report-layout';

// ============================================================
// Format 18 Content Component - QP INVENTORY DEMAND (STATIC)
// ============================================================

function Format18Content() {
  return (
    <div className="space-y-6 text-sm">
      {/* Title */}
      <div className="text-center">
        <p className="mt-1 text-sm font-medium">
          (To be submitted by the DC after meeting of EC regarding question paper inventory)
        </p>
      </div>

      {/* DC and Date Header */}
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <span className="font-medium whitespace-nowrap">DC:</span>
          <span className="min-w-[200px] flex-1 border-b-2 border-black px-8 py-0.5">&nbsp;</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-medium whitespace-nowrap">Date:</span>
          <span className="min-w-[150px] border-b-2 border-black px-8 py-0.5">&nbsp;</span>
        </div>
      </div>

      {/* Main Table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse border border-black text-xs">
          <thead>
            <tr>
              <th className="w-[8%] border border-black p-1.5 text-center">Sr.No.</th>
              <th className="w-[12%] border border-black p-1.5 text-center">EC</th>
              <th className="w-[14%] border border-black p-1.5 text-center">
                Day and Date of Examination
              </th>
              <th className="w-[12%] border border-black p-1.5 text-center">Q.P.Code</th>
              <th className="w-[16%] border border-black p-1.5 text-center">
                Number of packets as per Inventory
              </th>
              <th className="w-[14%] border border-black p-1.5 text-center">
                Additional number of Packets needed
              </th>
              <th className="w-[24%] border border-black p-1.5 text-center">
                Reason for additional demand
              </th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 10 }).map((_, index) => (
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
              <span className="w-20 text-xs font-medium whitespace-nowrap">Name</span>
              <span className="flex-1 border-b-2 border-black px-4 py-0.5">&nbsp;</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-20 text-xs font-medium whitespace-nowrap">Contact</span>
              <span className="flex-1 border-b-2 border-black px-4 py-0.5">&nbsp;</span>
            </div>
          </div>
        </div>

        {/* Chief Officer in Charge DC */}
        <div className="space-y-4">
          <p className="text-center font-semibold underline">Chief Officer in Charge DC</p>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-20 text-xs font-medium whitespace-nowrap">Name</span>
              <span className="flex-1 border-b-2 border-black px-4 py-0.5">&nbsp;</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-20 text-xs font-medium whitespace-nowrap">Contact</span>
              <span className="flex-1 border-b-2 border-black px-4 py-0.5">&nbsp;</span>
            </div>
          </div>
        </div>
      </div>

      {/* Important Note */}
      <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/20">
        <p className="text-xs text-amber-800 dark:text-amber-300">
          <strong>Note:</strong> If the number of question papers provided in the inventory is more
          than the number of appearing students, additional inventory demand shall not be filed.
        </p>
      </div>
    </div>
  );
}

// ============================================================
// Main Component
// ============================================================

export default function Format18Report() {
  const { examCenter } = useUserInfo();

  return (
    <ReportLayout
      header={{
        title: 'FORMAT NO. 18',
        subtitle: 'QP Inventory Demand',
        examSeason: examCenter?.season as 'Summer' | 'Winter',
        examYear: examCenter?.examYear || new Date().getFullYear(),
      }}
      footer={{
        showTimestamp: false,

        alignment: 'center',
      }}
      showBackButton
      documentTitle="Format_18_QP_Inventory_Demand"
      bordered
    >
      <Format18Content />
    </ReportLayout>
  );
}
