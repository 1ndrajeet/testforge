// modules/formats/format10.tsx
'use client';

import { useUserInfo } from '@/hooks/useUserInfo';

import ReportLayout from '@/components/layout/msbte-report-layout';

// ============================================================
// Format 10 Content Component - STATIC TEMPLATE
// ============================================================

function Format10Content({ examCenter }: { examCenter: any }) {
  const examSeason = examCenter?.season || 'Winter';
  const examYear = examCenter?.examYear || '____';

  return (
    <>
      {/* Header Info */}
      <div className="mb-4 space-y-1 text-xs">
        <div className="flex justify-between">
          <p>
            Examination {examSeason}-{examYear}
          </p>
        </div>
        <div className="flex justify-between">
          <p>Name of the Inst (Distribution Centre): _______________________________</p>
          <p>Inst. Code no: _______</p>
        </div>
        <div className="flex justify-between">
          <p>Name of the Inst (RAC): _____________________________________________</p>
          <p>Inst. Code no: _______</p>
        </div>
        <div className="flex justify-between">
          <p>Date of despatch from DC: __________________</p>
          <p>Date of receipt at RAC: _______</p>
        </div>
      </div>

      {/* Table */}
      <table className="w-full border-collapse border border-black text-xs">
        <thead>
          <tr>
            <th className="w-[8%] border border-black p-1 text-center">Bundle No.</th>
            <th className="w-[12%] border border-black p-1 text-center">Inst Code No.</th>
            <th className="w-[18%] border border-black p-1 text-center">
              Course/ Sem/ Year/ Master
            </th>
            <th className="w-[12%] border border-black p-1 text-center">Subject Code No.</th>
            <th className="w-[15%] border border-black p-1 text-center">
              Nos. of answer books in the bundle
            </th>
            <th className="w-[12%] border border-black p-1 text-center">Mark Sheet No.</th>
            <th className="w-[23%] border border-black p-1 text-center">
              Dated Signature of Receiving officer of RAC
            </th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 25 }).map((_, index) => (
            <tr key={index}>
              <td className="h-5 border border-black p-1 text-center">{index + 1}</td>
              <td className="h-5 border border-black p-1"></td>
              <td className="h-5 border border-black p-1"></td>
              <td className="h-5 border border-black p-1"></td>
              <td className="h-5 border border-black p-1"></td>
              <td className="h-5 border border-black p-1"></td>
              <td className="h-5 border border-black p-1"></td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Signatures */}
      <div className="mt-6 flex justify-between text-xs">
        <div>
          <p>
            <strong>SIGNATURE OF SUPERVISOR</strong>
          </p>
          <p>DISTRIBUTION CENTRE</p>
        </div>
        <div className="text-right">
          <p>
            <strong>SIGNATURE OF OFFICER-IN-CHARGE</strong>
          </p>
          <p>DISTRIBUTION CENTRE</p>
        </div>
      </div>

      {/* Footer Notes */}
      <div className="mt-4 border-t border-dashed border-black pt-1 text-[10px]">
        <p>1. Copy for Officer-in-charge, R.A.C</p>
        <p>2. Copy for Distribution center.</p>
      </div>
    </>
  );
}

// ============================================================
// Main Component
// ============================================================

export default function Format10Report() {
  const { examCenter } = useUserInfo();

  return (
    <ReportLayout
      header={{
        title: 'FORMAT NO. 10',
        subtitle:
          'Format of Inventory and receipt for submitting written answer book bundles to R.A.C.',
        examSeason: examCenter?.season as 'Summer' | 'Winter',
        examYear: examCenter?.examYear || new Date().getFullYear(),
      }}
      footer={{
        showTimestamp: false,
      }}
      disableBackButton
      documentTitle="Format_10_Report"
      bordered
    >
      <Format10Content examCenter={examCenter} />
    </ReportLayout>
  );
}
