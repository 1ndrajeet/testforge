// modules/formats/format12.tsx
'use client';

import ReportLayout from '@/components/layout/msbte-report-layout';
import { useUserInfo } from '@/hooks/useUserInfo';

// ============================================================
// Format 12 Content Component - STATIC TEMPLATE
// ============================================================

function Format12Content({ examCenter }: { examCenter: any }) {
  return (
    <div className="space-y-6 text-sm">
      {/* Title */}
      <div className="text-center">
        <h2 className="text-lg font-bold underline">FORMAT NO. 12</h2>
        <p className="mt-1 text-base font-medium">Format of certificate to be given by External examiner</p>
      </div>

      {/* Main Content */}
      <div className="space-y-4">
        {/* Heading */}
        <div className="text-center">
          <p className="text-base font-bold">EXTERNAL EXAMINER&apos;S CERTIFICATE</p>
        </div>

        {/* Institute Name */}
        <div className="flex items-center gap-2">
          <span className="font-medium whitespace-nowrap">Name of Institute</span>
          <span className="flex-1 border-b border-black px-2">
            {examCenter?.name || '_________________________________________________________'}
          </span>
        </div>

        {/* Subject Name */}
        <div className="flex items-center gap-2">
          <span className="font-medium whitespace-nowrap">Name of the subject:</span>
          <span className="flex-1 border-b border-black px-2">________________________________________________</span>
          <span className="text-sm text-neutral-500">(practical / oral / term-work)</span>
        </div>

        {/* Course and Semester */}
        <div className="flex items-center gap-2">
          <span className="font-medium whitespace-nowrap">Course:</span>
          <span className="flex-1 border-b border-black px-2">________________________________________________</span>
          <span className="font-medium whitespace-nowrap">Year/Semester</span>
          <span className="w-24 border-b border-black px-2">_____________</span>
        </div>

        {/* Examinees Count and Date */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium whitespace-nowrap">I have examined</span>
          <span className="w-24 border-b border-black px-2 text-center">_____________</span>
          <span className="whitespace-nowrap">Nos. of examinees on (date)</span>
          <span className="w-32 border-b border-black px-2 text-center">______________</span>
        </div>

        {/* Declaration */}
        <div className="mt-4 space-y-2">
          <p>
            I have prepared and checked the marks as per CIAAN format and verified that marks correctly entered in the
            e-marks sheet by examiner. Internal examiner and I have put full signature/s on printout of e-mark sheet.
          </p>
        </div>

        {/* Comments Section */}
        <div className="mt-4">
          <p className="font-medium">
            I offer my specific comments about laboratory facility, equipment etc. available in this Institute as under:
          </p>
          <p className="mt-1 text-xs text-neutral-500">(Specific and objective remarks are expected.)</p>
          <div className="mt-3 min-h-[120px] rounded-lg border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-900/50">
            <p className="text-neutral-400">_________________________________________________</p>
            <p className="mt-2 text-neutral-400">_________________________________________________</p>
            <p className="mt-2 text-neutral-400">_________________________________________________</p>
            <p className="mt-2 text-neutral-400">_________________________________________________</p>
            <p className="mt-2 text-neutral-400">_________________________________________________</p>
          </div>
        </div>

        {/* Signature Section */}
        <div className="mt-8 flex flex-wrap justify-between gap-4 border-t border-black pt-6">
          <div>
            <p className="font-medium">Date:</p>
            <p className="mt-6 border-b border-black px-4">________________</p>
          </div>
          <div className="text-center">
            <p className="font-medium">Signature and full name</p>
            <p className="font-medium">of the External Examiner</p>
            <p className="mt-6 border-b border-black px-4">________________</p>
          </div>
          <div>
            <p className="font-medium">Designation</p>
            <p className="mt-6 border-b border-black px-4">________________</p>
          </div>
          <div>
            <p className="font-medium">Institute:</p>
            <p className="mt-6 border-b border-black px-4">________________</p>
          </div>
        </div>

        {/* Footer Note */}
        <div className="mt-4 text-xs text-neutral-500">
          <p>
            Note: This certificate should be submitted to the examination department after completion of
            practical/oral/term-work examination.
          </p>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Main Component
// ============================================================

export default function Format12Report() {
  const { examCenter } = useUserInfo();

  return (
    <ReportLayout
      header={{
        title: 'FORMAT NO. 12',
        subtitle: "External Examiner's Certificate",
        examSeason: examCenter?.season as 'Summer' | 'Winter',
        examYear: examCenter?.examYear || new Date().getFullYear(),
        examCenterName: examCenter?.name,
        examCenterCode: examCenter?.code,
      }}
      footer={{
        showTimestamp: true,
        showTestForgeCredit: true,
        alignment: 'center',
      }}
      showBackButton
      documentTitle="Format_12_Report"
      bordered
    >
      <Format12Content examCenter={examCenter} />
    </ReportLayout>
  );
}
