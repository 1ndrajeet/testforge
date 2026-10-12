// modules/formats/format16.tsx
'use client';

import { useState } from 'react';

import { useUserInfo } from '@/hooks/useUserInfo';

import ReportLayout from '@/components/layout/msbte-report-layout';

// ============================================================
// Format 16 Content Component - VIGILANCE REGISTER
// ============================================================

function Format16Content({ examCenter }: { examCenter: any }) {
  const [rows] = useState(10); // Number of rows per table

  const examSeason = examCenter?.season || 'Winter';
  const examYear = examCenter?.examYear || new Date().getFullYear();

  // Generate empty row data for the table
  const generateRows = (count: number) => {
    return Array.from({ length: count }, (_, i) => ({
      srNo: i + 1,
      date: '',
      time: '',
      name: '',
      observations: '',
      malpracticeDetails: '',
      signature: '',
      chiefSignature: '',
    }));
  };

  const internalRows = generateRows(rows);
  const externalRows = generateRows(rows);

  return (
    <div className="space-y-4 text-sm">
      <p>
        {' '}
        Format for Vigilance Register to be maintained at Distribution Center, Examination Center
      </p>

      {/* ============================================================
          INTERNAL VIGILANCE TABLE
          ============================================================ */}
      <div className="space-y-2">
        <div className="text-center">
          <p className="text-base font-bold">
            FORMAT NO. 16A {examSeason.toUpperCase()}/{examYear}
          </p>
          <p className="text-sm font-semibold underline">INTERNAL VIGILANCE</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse border border-black text-[10px]">
            <thead>
              <tr>
                <th className="w-[6%] border border-black p-1 text-center">Sr. No.</th>
                <th className="w-[12%] border border-black p-1 text-center">Date</th>
                <th className="w-[10%] border border-black p-1 text-center">Time of Visit</th>
                <th className="w-[15%] border border-black p-1 text-center">
                  Name of vigilance officer
                </th>
                <th className="w-[20%] border border-black p-1 text-center">Observations</th>
                <th className="w-[22%] border border-black p-1 text-center">
                  In case of malpractice case/cases booked. Give clear details of the case.
                </th>
                <th className="w-[10%] border border-black p-1 text-center">
                  Sign of vigilance officer
                </th>
                <th className="w-[10%] border border-black p-1 text-center">
                  Sign of Chief officer in charge
                </th>
              </tr>
            </thead>
            <tbody>
              {internalRows.map((row, index) => (
                <tr key={`internal-${index}`}>
                  <td className="h-6 border border-black p-0.5 text-center">{row.srNo}</td>
                  <td className="h-6 border border-black p-0.5"></td>
                  <td className="h-6 border border-black p-0.5"></td>
                  <td className="h-6 border border-black p-0.5"></td>
                  <td className="h-6 border border-black p-0.5"></td>
                  <td className="h-6 border border-black p-0.5"></td>
                  <td className="h-6 border border-black p-0.5"></td>
                  <td className="h-6 border border-black p-0.5"></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Signature lines for Internal Vigilance */}
      </div>

      {/* ============================================================
          EXTERNAL VIGILANCE TABLE
          ============================================================ */}
      <div className="space-y-2 pt-4">
        <div className="text-center">
          <p className="text-base font-bold">
            FORMAT NO. 16B {examSeason.toUpperCase()}/{examYear}
          </p>
          <p className="text-sm font-semibold underline">EXTERNAL VIGILANCE</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse border border-black text-[10px]">
            <thead>
              <tr>
                <th className="w-[5%] border border-black p-1 text-center">Sr. No.</th>
                <th className="w-[10%] border border-black p-1 text-center">Date</th>
                <th className="w-[9%] border border-black p-1 text-center">Time of Visit</th>
                <th className="w-[13%] border border-black p-1 text-center">
                  Name of vigilance officer
                </th>
                <th className="w-[10%] border border-black p-1 text-center">Inst. code</th>
                <th className="w-[18%] border border-black p-1 text-center">Observations</th>
                <th className="w-[20%] border border-black p-1 text-center">
                  In case of malpractice case/cases booked. Give clear details of the case.
                </th>
                <th className="w-[9%] border border-black p-1 text-center">
                  Sign of vigilance officer
                </th>
                <th className="w-[9%] border border-black p-1 text-center">
                  Sign of Chief officer in charge
                </th>
              </tr>
            </thead>
            <tbody>
              {externalRows.map((row, index) => (
                <tr key={`external-${index}`}>
                  <td className="h-6 border border-black p-0.5 text-center">{row.srNo}</td>
                  <td className="h-6 border border-black p-0.5"></td>
                  <td className="h-6 border border-black p-0.5"></td>
                  <td className="h-6 border border-black p-0.5"></td>
                  <td className="h-6 border border-black p-0.5"></td>
                  <td className="h-6 border border-black p-0.5"></td>
                  <td className="h-6 border border-black p-0.5"></td>
                  <td className="h-6 border border-black p-0.5"></td>
                  <td className="h-6 border border-black p-0.5"></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Signature lines for External Vigilance */}
      </div>

      {/* Footer Note */}
      <div className="mt-4 border-t border-dashed border-neutral-300 pt-2 text-[9px] text-neutral-500">
        <p>
          <strong>Note:</strong> This register should be maintained at both Distribution Center and
          Examination Center. All vigilance visits (internal and external) must be recorded with
          observations and malpractice details if any.
        </p>
      </div>
    </div>
  );
}

// ============================================================
// Main Component
// ============================================================

export default function Format16Report() {
  const { examCenter } = useUserInfo();

  return (
    <ReportLayout
      header={{
        title: 'FORMAT NO. 16',
        subtitle: 'Vigilance Register',
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
      documentTitle="Format_16_Vigilance_Register"
      bordered
    >
      <Format16Content examCenter={examCenter} />
    </ReportLayout>
  );
}
