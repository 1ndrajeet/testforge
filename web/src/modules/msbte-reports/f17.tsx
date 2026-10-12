// modules/formats/format15.tsx
'use client';

import { PDFViewer } from './f15';

export default function Format15Report() {
  return (
    <PDFViewer
      pdfPath="/format-17.pdf"
      title="FORMAT NO. 17"
      subtitle="भरारी पथक अहवालाचा नमुना (Bharari Squad Report Template)"
      showBackButton
      onBack={() => window.history.back()}
      documentTitle="Format_17_Bharari_Squad_Report_Template"
      printButtonLabel="Print PDF"
    />
  );
}
