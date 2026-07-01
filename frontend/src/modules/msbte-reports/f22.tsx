// modules/formats/format22.tsx
'use client';

import { useUserInfo } from '@/hooks/useUserInfo';

import ReportLayout from '@/components/layout/msbte-report-layout';

// ============================================================
// Format 22 Content Component - PANCHNAMA REPORT
// ============================================================

function Format22Content() {
  return (
    <div className="space-y-4 text-sm">
      {/* Title */}
      <div className="text-center">
        <p className="mt-1 text-base font-semibold">Panchnama Report</p>
      </div>

      {/* Header - EC, Day, Session, Date */}
      <div className="grid grid-cols-4 gap-4 text-sm">
        <div className="flex items-center gap-2">
          <span className="font-medium whitespace-nowrap">EC :</span>
          <span className="flex-1 border-b-2 border-black px-4 py-0.5">&nbsp;</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-medium whitespace-nowrap">Day of Examination :</span>
          <span className="flex-1 border-b-2 border-black px-4 py-0.5">&nbsp;</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-medium whitespace-nowrap">Session :</span>
          <span className="flex-1 border-b-2 border-black px-4 py-0.5">&nbsp;</span>
          <span className="text-xs text-neutral-500">M / A</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-medium whitespace-nowrap">Date :</span>
          <span className="flex-1 border-b-2 border-black px-4 py-0.5">&nbsp;</span>
        </div>
      </div>

      {/* Report Body */}
      <div className="space-y-4 text-justify">
        <p>
          The question paper bundle for the examination session was opened at the examination
          control room in the presence of the undersigned officers. Following discrepancies were
          noticed after the opening of bundle;
        </p>
      </div>

      {/* Main Table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse border border-black text-xs">
          <thead>
            <tr>
              <th className="w-[6%] border border-black p-1.5 text-center">Sr.No.</th>
              <th className="w-[34%] border border-black p-1.5 text-center">
                Question paper details as per the label on the bundle.
              </th>
              <th className="w-[42%] border border-black p-1.5 text-center">
                Question paper details actually present in the bundle opened.
              </th>
              <th className="w-[18%] border border-black p-1.5 text-center">Remark</th>
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Signature Section - Three Columns */}
      <div className="mt-8 grid grid-cols-3 gap-4 border-t border-black pt-6">
        {/* Officer in Charge EC */}
        <div className="space-y-4">
          <p className="text-center font-semibold underline">Officer in Charge EC</p>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-16 text-xs font-medium whitespace-nowrap">Name</span>
              <span className="flex-1 border-b-2 border-black px-2 py-0.5">&nbsp;</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-16 text-xs font-medium whitespace-nowrap">Contact</span>
              <span className="flex-1 border-b-2 border-black px-2 py-0.5">&nbsp;</span>
            </div>
          </div>
        </div>

        {/* Chief Officer in Charge EC */}
        <div className="space-y-4">
          <p className="text-center font-semibold underline">Chief Officer in Charge EC</p>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-16 text-xs font-medium whitespace-nowrap">Name</span>
              <span className="flex-1 border-b-2 border-black px-2 py-0.5">&nbsp;</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-16 text-xs font-medium whitespace-nowrap">Contact</span>
              <span className="flex-1 border-b-2 border-black px-2 py-0.5">&nbsp;</span>
            </div>
          </div>
        </div>

        {/* Controller of Examination */}
        <div className="space-y-4">
          <p className="text-center font-semibold underline">Controller of Examination</p>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-16 text-xs font-medium whitespace-nowrap">Name</span>
              <span className="flex-1 border-b-2 border-black px-2 py-0.5">&nbsp;</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-16 text-xs font-medium whitespace-nowrap">Contact</span>
              <span className="flex-1 border-b-2 border-black px-2 py-0.5">&nbsp;</span>
            </div>
          </div>
        </div>
      </div>

      {/* Notes Section */}
      <div className="mt-4 space-y-2 rounded-lg border p-3">
        <p>
          <strong>Note:</strong>
        </p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            In case of D Pharmacy institute working as EC, Principal of the institute works as the
            officer in charge of examination. In such cases the report will bear the signatures of
            Officer in charge and Controller of examination.
          </li>
          <li>
            In case of double shift Polytechnics having two ECs in the same premises, Principal of
            Polytechnic will act as the Chief Officer in charge of EC in regular shift polytechnic
            as well as the EC in second shift polytechnic.
          </li>
        </ol>
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

export default function Format22Report() {
  const { examCenter } = useUserInfo();

  return (
    <ReportLayout
      header={{
        title: 'FORMAT NO. 22',
        subtitle: 'Panchnama Report',
        examSeason: examCenter?.season as 'Summer' | 'Winter',
        examYear: examCenter?.examYear || new Date().getFullYear(),
      }}
      footer={{
        showTimestamp: false,

        alignment: 'center',
      }}
      showBackButton
      documentTitle="Format_22_Panchnama_Report"
      bordered
    >
      <Format22Content />
    </ReportLayout>
  );
}
