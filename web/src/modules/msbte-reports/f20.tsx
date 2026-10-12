// modules/formats/format20.tsx
'use client';

import { useUserInfo } from '@/hooks/useUserInfo';

import ReportLayout from '@/components/layout/msbte-report-layout';

// ============================================================
// Format 20 Content Component - INVENTORY RECEIPT
// ============================================================

function Format20Content() {
  return (
    <div className="space-y-6 text-sm">
      {/* Title */}
      <div className="text-center">
        <p className="mt-1 text-base font-semibold">Inventory Receipt</p>
      </div>

      {/* Header - DC No and Date */}
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <span className="font-medium whitespace-nowrap">DC No :</span>
          <span className="min-w-[150px] flex-1 border-b-2 border-black px-8 py-0.5">&nbsp;</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-medium whitespace-nowrap">Date :</span>
          <span className="min-w-[150px] border-b-2 border-black px-8 py-0.5">&nbsp;</span>
        </div>
      </div>

      {/* Receipt Body */}
      <div className="space-y-4 text-justify">
        <p>
          Received the EC-wise boxes for the DC on{' '}
          <span className="min-w-[120px] border-b-2 border-black px-8 py-0.5">&nbsp;</span>. The
          boxes containing question paper bundles were opened and the bundles were arranged EC-wise
          / Day-wise manner and compared with the EC-wise time table for the EC.
        </p>
        <p>The bundles for all examination sessions for each EC are received.</p>
      </div>

      {/* Signature Section */}
      <div className="mt-12 grid grid-cols-2 gap-8 border-t border-black pt-6">
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

      {/* Print CSS for clean borders */}
      <style
        jsx
        global
      >{`
        @media print {
          .no-print {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}

// ============================================================
// Main Component
// ============================================================

export default function Format20Report() {
  const { examCenter } = useUserInfo();

  return (
    <ReportLayout
      header={{
        title: 'FORMAT NO. 20',
        subtitle: 'Inventory Receipt',
        examSeason: examCenter?.season as 'Summer' | 'Winter',
        examYear: examCenter?.examYear || new Date().getFullYear(),
      }}
      footer={{
        showTimestamp: false,

        alignment: 'center',
      }}
      showBackButton
      documentTitle="Format_20_Inventory_Receipt"
      bordered
    >
      <Format20Content />
    </ReportLayout>
  );
}
