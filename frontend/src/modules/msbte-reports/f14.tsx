// modules/formats/format14.tsx
'use client';

import { useUserInfo } from '@/hooks/useUserInfo';

import ReportLayout from '@/components/layout/msbte-report-layout';

// ============================================================
// Format 14 Content Component - COMPACT A4
// ============================================================

function Format14Content({ examCenter }: { examCenter: any }) {
  const examSeason = examCenter?.season || 'Winter';
  const examCenterName =
    examCenter?.name || '_____________________________________________________';
  const examCenterCode = examCenter?.code || '_________________________';
  const officerIncharge = examCenter?.officerIncharge || '______________________________';

  return (
    <div className="space-y-2 text-[10pt] leading-tight">
      {/* Complainant */}
      <div className="space-y-0.5">
        <p className="font-medium">Complainant:</p>
        <div className="flex items-center gap-1">
          <span className="whitespace-nowrap">Shri / Smt.</span>
          <span className="h-5 flex-1 border-b-0 border-black px-1">.</span>
        </div>
        <p className="text-sm text-neutral-500">
          Officer-in-charge / Controller of Examination center
        </p>
      </div>

      {/* To */}
      <div className="space-y-0.5">
        <p className="font-medium">To</p>
        <p>Police Inspector / Sub-inspector / S.H.O.</p>
        <div className="flex items-center gap-1">
          <span className="h-5 px-1">____________________ Police Station</span>
        </div>
      </div>

      {/* Institute Details */}
      <div className="space-y-0.5 pt-1.5">
        <div className="flex items-center gap-1">
          <span className="text-sm font-medium whitespace-nowrap">
            Name of the Examination Center / Institute
          </span>
          <span className="h-5 flex-1 border-b-0 border-black px-1">{examCenterName}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-sm font-medium whitespace-nowrap">
            Code number of the Center / Institute
          </span>
          <span className="h-5 w-40 border-b-0 border-black px-1">{examCenterCode}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-sm font-medium whitespace-nowrap">District</span>
          <span className="h-5 w-40 border-b-0 border-black px-1">.</span>
        </div>
      </div>

      {/* Subject */}
      <div className="space-y-0.5">
        <p className="font-medium">Subject:</p>
        <p className="text-justify text-sm">
          Report of the criminal act during the{' '}
          <span className="h-5 w-16 border-b-0 border-black px-1">{examSeason}</span>
          examination of{' '}
          <span className="h-5 w-48 border-b-0 border-black px-1">
            Diploma / Post-Diploma / Post-Graduate Diploma
          </span>
          in <span className="h-5 w-32 border-b-0 border-black px-1">_______________________</span>
        </p>
        <p className="text-[8pt] text-neutral-500">
          (Course) of Maharashtra State Board of Technical Education, Mumbai.
        </p>
      </div>

      {/* Body */}
      <div className="space-y-1 text-justify text-sm">
        <p>
          <span className="font-medium">Sir,</span>
        </p>
        <p className="leading-tight">
          Maharashtra State Board of Technical Education (Board), Mumbai routinely holds Diploma /
          Post-Diploma / Post-Graduate Diploma examinations in the state. These examinations this
          time have commenced from
          <span className="mx-0.5 h-5 w-12 border-b-0 border-black px-1">_____</span>
          (Date) <span className="mx-0.5 h-5 w-24 border-b-0 border-black px-1">___________</span>
          (Month) <span className="mx-0.5 h-5 w-16 border-b-0 border-black px-1">__________</span>
          (Year). The Board has duly appointed this Institute as examination center and me as the
          Officer-in-charge of the examination center.
        </p>
        <p className="leading-tight">
          Following examinee in this examination has committed a crime. The related information is
          as under:
        </p>
      </div>

      {/* Crime Details - Compact Grid */}
      <div className="space-y-0.5 border-t-2 border-black pt-1.5">
        <div className="flex items-center gap-1">
          <span className="text-sm font-medium whitespace-nowrap">
            1. Alleged examinee&apos;s name
          </span>
          <span className="h-5 flex-1 border-b-0 border-black px-1">
            _________________________________________________________________
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-sm font-medium whitespace-nowrap">
            2. Alleged examinee&apos;s examination seat number
          </span>
          <span className="h-5 w-40 border-b-0 border-black px-1">
            _________________________________________________
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-sm font-medium whitespace-nowrap">
            3. Alleged examinee&apos;s Institute name
          </span>
          <span className="h-5 flex-1 border-b-0 border-black px-1">
            __________________________________________________________
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-sm font-medium whitespace-nowrap">
            4. Alleged examinee&apos;s examination Block number
          </span>
          <span className="h-5 w-40 border-b-0 border-black px-1">________________________</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-sm font-medium whitespace-nowrap">
            5. Nature of the crime committed
          </span>
          <span className="h-5 flex-1 border-b-0 border-black px-1">
            __________________________________
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-sm font-medium whitespace-nowrap">6. Name of the subject</span>
          <span className="h-5 flex-1 border-b-0 border-black px-1">
            ___________________________________
          </span>
          <span className="text-sm font-medium whitespace-nowrap">Date</span>
          <span className="h-5 w-24 border-b-0 border-black px-1 text-center">_____________</span>
          <span className="text-sm font-medium whitespace-nowrap">Time</span>
          <span className="h-5 w-24 border-b-0 border-black px-1 text-center">___________</span>
        </div>
        <div className="flex items-start gap-1">
          <span className="text-sm font-medium whitespace-nowrap">
            7. Name and Designation of the person detecting the crime
          </span>
          <div className="h-5 flex-1 border-b-0 border-black px-1">
            __________________________________________________________
          </div>
        </div>
        <div className="flex items-start gap-1">
          <span className="text-sm font-medium whitespace-nowrap">
            8. Material found at the time of crime detection
          </span>
          <div className="h-5 flex-1 border-b-0 border-black px-1">
            ______________________________________________________________________________________
          </div>
        </div>
        <div className="flex items-start gap-1">
          <span className="text-sm font-medium whitespace-nowrap">
            9. Additional information regarding the crime
          </span>
          <div className="h-5 flex-1 border-b-0 border-black px-1">
            ______________________________________________________________________________________
          </div>
        </div>
      </div>

      {/* Legal Complaint */}
      <div className="space-y-0.5 text-justify text-sm">
        <p className="leading-tight">
          Shri/Smt.{' '}
          <span className="h-5 w-40 border-b-0 border-black px-1">
            __________________________________
          </span>
          (examinee&apos;s name) has committed a crime as per section (7) of The Maharashtra
          Prevention of Malpractices at University, Board and other specified Examinations Act, 1982
          and this is the legal complaint for the same.
        </p>
      </div>

      {/* Signature - Compact */}
      <div className="mt-1 space-y-0.5 border-t-2 border-black pt-1.5">
        <p className="text-right text-sm">Yours truly,</p>
        <div className="flex justify-end">
          <div className="w-56">
            <p className="h-5 border-b-0 border-black px-1 text-center">____________________</p>
            <p className="mt-0.5 text-center text-[8pt]">
              (Officer-in-charge / controller of examination)
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-sm font-medium whitespace-nowrap">
            Name of Officer-in-charge / controller of examination
          </span>
          <span className="h-5 flex-1 border-b-0 border-black px-1">
            {officerIncharge || '________________________'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-sm font-medium whitespace-nowrap">
            Name of the examination center
          </span>
          <span className="h-5 flex-1 border-b-0 border-black px-1">{examCenterName}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-sm font-medium whitespace-nowrap">Date:</span>
          <span className="h-5 w-32 border-b-0 border-black px-1">______________</span>
        </div>
      </div>

      {/* Footer Note */}
      <div className="mt-1 border-t-2 border-dashed border-neutral-300 pt-1 text-[8pt] leading-tight text-neutral-500">
        <p>
          Note: This complaint should be registered with the local police station immediately after
          detection of malpractice and a copy should be submitted to the Board.
        </p>
      </div>
    </div>
  );
}

// ============================================================
// Main Component
// ============================================================

export default function Format14Report() {
  const { examCenter } = useUserInfo();

  return (
    <ReportLayout
      header={{
        title: 'FORMAT NO. 14',
        subtitle: 'Police Complaint',
        examSeason: examCenter?.season as 'Summer' | 'Winter',
        examYear: examCenter?.examYear || new Date().getFullYear(),
        examCenterName: examCenter?.name,
        examCenterCode: examCenter?.code,
      }}
      footer={{
        showTimestamp: false,
      }}
      showBackButton
      documentTitle="Format_14_Police_Complaint"
      bordered
      pageStyle={{
        padding: '6mm 8mm',
      }}
    >
      <Format14Content examCenter={examCenter} />
    </ReportLayout>
  );
}
