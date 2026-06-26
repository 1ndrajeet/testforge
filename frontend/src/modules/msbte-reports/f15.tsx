// components/shared/PDFViewer.tsx
'use client';

import React, { useEffect, useRef, useState } from 'react';

import { ArrowLeft, LucidePrinter } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

export interface PDFViewerProps {
  /** Path to PDF file in public directory (e.g., '/format-15.pdf') */
  pdfPath: string;
  /** Title shown above the PDF viewer */
  title?: string;
  /** Subtitle shown above the PDF viewer */
  subtitle?: string;
  /** Show back button */
  showBackButton?: boolean;
  /** Back button label */
  backButtonLabel?: string;
  /** On back callback */
  onBack?: () => void;
  /** Document title for print */
  documentTitle?: string;
  /** Print button label */
  printButtonLabel?: string;
  /** Height of the PDF viewer */
  height?: string | number;
  /** Width of the PDF viewer */
  width?: string | number;
  /** Additional className */
  className?: string;
}

// ============================================================================
// Main Component
// ============================================================================

export function PDFViewer({
  pdfPath,
  title,
  subtitle,
  showBackButton = true,
  backButtonLabel = 'Back',
  onBack,
  documentTitle = 'PDF Report',
  printButtonLabel = 'Print PDF',
  height = '100vh',
  width = '100%',
  className,
}: PDFViewerProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    // Check if PDF exists and load it
    const loadPDF = async () => {
      try {
        const response = await fetch(pdfPath, { method: 'HEAD' });
        if (!response.ok) {
          throw new Error(`PDF not found: ${pdfPath}`);
        }
        // Create a blob URL for the PDF
        const pdfResponse = await fetch(pdfPath);
        const blob = await pdfResponse.blob();
        const url = URL.createObjectURL(blob);
        setPdfUrl(url);
        setLoading(false);
      } catch (err) {
        console.error('Error loading PDF:', err);
        setError(err instanceof Error ? err.message : 'Failed to load PDF');
        setLoading(false);
      }
    };

    loadPDF();

    // Cleanup blob URL
    return () => {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
    };
  }, [pdfPath]);

  const handlePrint = () => {
    if (!pdfUrl) {
      setError('PDF not loaded');
      return;
    }

    // Open PDF in new window and print
    const printWindow = window.open(pdfUrl, '_blank');
    if (printWindow) {
      printWindow.onload = () => {
        printWindow.print();
      };
    } else {
      // Fallback: Use iframe print
      const iframe = iframeRef.current;
      if (iframe) {
        try {
          const contentWindow = iframe.contentWindow;
          if (contentWindow) {
            contentWindow.focus();
            contentWindow.print();
          }
        } catch (e) {
          console.error('Print failed:', e);
          // Final fallback: Download
          const link = document.createElement('a');
          link.href = pdfUrl;
          link.download = `${documentTitle}.pdf`;
          link.click();
        }
      }
    }
  };

  if (loading) {
    return (
      <div className={cn('flex flex-col gap-4 p-4', className)}>
        {title && <Skeleton className="h-8 w-48" />}
        {subtitle && <Skeleton className="h-4 w-64" />}
        <Skeleton className="h-[600px] w-full rounded-lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn('flex flex-col items-center justify-center gap-4 p-8', className)}>
        <div className="text-center">
          <p className="text-lg font-medium text-red-600">Failed to load PDF</p>
          <p className="text-sm text-neutral-500">{error}</p>
        </div>
        <Button variant="outline" onClick={() => window.location.reload()}>
          Retry
        </Button>
      </div>
    );
  }

  if (!pdfUrl) {
    return (
      <div className={cn('flex flex-col items-center justify-center gap-4 p-8', className)}>
        <div className="text-center">
          <p className="text-lg font-medium">No PDF available</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {/* Header */}
      {(title || subtitle || showBackButton) && (
        <div className="flex flex-wrap items-center justify-between gap-4 print:hidden">
          <div className="flex items-center gap-3">
            {showBackButton && onBack && (
              <Button variant="secondary" size="sm" onClick={onBack} className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                {backButtonLabel}
              </Button>
            )}
            <div>
              {title && <h2 className="text-lg font-semibold">{title}</h2>}
              {subtitle && <p className="text-sm text-neutral-500">{subtitle}</p>}
            </div>
          </div>
          <Button onClick={handlePrint} size="sm" className="gap-2">
            <LucidePrinter className="h-4 w-4" />
            {printButtonLabel}
          </Button>
        </div>
      )}

      {/* PDF Viewer */}
      <div className="print:hidden" style={{ height, width }}>
        <iframe
          ref={iframeRef}
          src={`${pdfUrl}#toolbar=1&navpanes=1&scrollbar=1`}
          className="h-full w-full rounded-lg border border-neutral-200"
          style={{ minHeight: '500px' }}
          title={documentTitle}
        />
      </div>

      {/* Hidden iframe for printing fallback */}
      <div className="hidden">
        <iframe src={pdfUrl} className="h-0 w-0" title={`${documentTitle}-print`} />
      </div>
    </div>
  );
}

// ============================================================================
// Helper function to create PDF viewer for a specific format
// ============================================================================

export function createPDFReport(formatNumber: string) {
  return function PDFReport() {
    return (
      <PDFViewer
        pdfPath={`/format-${formatNumber}.pdf`}
        title={`FORMAT NO. ${formatNumber}`}
        subtitle="PDF Report"
        showBackButton
        onBack={() => window.history.back()}
        documentTitle={`Format_${formatNumber}_Report`}
      />
    );
  };
}

// ============================================================================
// Format 15 PDF Report Component
// ============================================================================

export default function Format15Report() {
  return (
    <PDFViewer
      pdfPath="/format-15.pdf"
      title="FORMAT NO. 15"
      subtitle="कारणे दाखवा नोटीस (Show Cause Notice)"
      showBackButton
      onBack={() => window.history.back()}
      documentTitle="Format_15_Show_Cause_Notice"
      printButtonLabel="Print PDF"
    />
  );
}
