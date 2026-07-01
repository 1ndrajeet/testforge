// components/layout/testforge-report-layout.tsx
'use client';

import React, { CSSProperties, forwardRef, ReactNode, useEffect, useRef, useState } from 'react';

import { ArrowLeft, LucidePrinter } from 'lucide-react';
import { useReactToPrint } from 'react-to-print';

import { cn } from '@/lib/utils';

import { Button } from '@/components/ui/button';

// ============================================================================
// Types - White Label Focused
// ============================================================================

export interface ExamCenterConfig {
  name: string;
  code: string;
  distributionCenter?: string;
  officerIncharge?: string;
  sealingSupervisor?: string;
  controller?: string;
  season?: string;
  year?: string | number;
  session?: 'Morning' | 'Afternoon' | 'All';
  timeSlot?: string;
  date?: Date | string;
}

export interface ReportHeaderProps {
  title: string;
  description?: string;
  examCenter: ExamCenterConfig;
  headerFields?: Record<string, string>;
  className?: string;
}

export interface ReportFooterProps {
  signatureFields?: Array<{
    label: string;
    name?: string;
    placeholder?: string;
    required?: boolean;
  }>;
  showTestForgeCredit?: boolean;
  creditText?: string;
  className?: string;
}

export interface ReportPageData {
  id: string;
  metadata?: Record<string, string | number | ReactNode>;
  content?: ReactNode;
  [key: string]: any;
}

export interface MultiPageReportProps {
  pages: ReportPageData[];
  header: ReportHeaderProps;
  footer?: ReportFooterProps;
  onBack?: () => void;
  backButtonLabel?: string;
  documentTitle?: string;
  numberOfCopies?: number;
  onCopiesChange?: (copies: number) => void;
  printLandscape?: boolean;
  showCopyInfo?: boolean;
  copyInfoText?: string;
  renderPageContent: (pageData: ReportPageData) => ReactNode;
}

// ============================================================================
// Constants
// ============================================================================

const PAGE_STYLES = {
  portrait: {
    width: '210mm',
    minHeight: '297mm',
    maxHeight: '297mm',
    padding: '10mm 12mm',
  },
  landscape: {
    width: '297mm',
    minHeight: '210mm',
    maxHeight: '210mm',
    padding: '8mm 10mm',
  },
};

const createPageStyle = (landscape: boolean): CSSProperties => {
  const base = landscape ? PAGE_STYLES.landscape : PAGE_STYLES.portrait;
  return {
    ...base,
    margin: '0 auto',
    position: 'relative',
    boxSizing: 'border-box',
    pageBreakAfter: 'always',
    pageBreakInside: 'avoid',
    backgroundColor: '#ffffff',
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    fontSize: '10pt',
    lineHeight: '1.5',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    color: '#1a1a1a',
    border: '1px solid #000',
  };
};

// ============================================================================
// Print Credit
// ============================================================================

const PrintCredit = ({
  text = 'Generated using TestForge®',
  enabled = true,
}: {
  text?: string;
  enabled?: boolean;
}) => {
  if (!enabled) return null;

  return (
    <div
      className="print-only"
      style={{
        position: 'absolute',
        bottom: '6mm',
        right: '8mm',
        fontSize: '6.5px',
        opacity: 0.35,
        color: '#6b7280',
        pointerEvents: 'none',
        userSelect: 'none',
        zIndex: 1,
        fontFamily: "'Inter', -apple-system, sans-serif",
        letterSpacing: '0.3px',
      }}
    >
      {text}
    </div>
  );
};

// ============================================================================
// Dynamic Header Fields
// ============================================================================

const DynamicHeaderFields = ({ fields }: { fields?: Record<string, string> }) => {
  if (!fields || Object.keys(fields).length === 0) return null;

  const entries = Object.entries(fields);

  return (
    <div className="mt-2 border-t border-neutral-200 pt-1.5">
      <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-xs">
        {entries.map(([label, value]) => (
          <div
            key={label}
            className="flex items-baseline gap-1.5"
          >
            <span className="font-medium whitespace-nowrap text-neutral-700">{label}:</span>
            <span className="truncate text-neutral-900">{value || '—'}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ============================================================================
// ReportHeader
// ============================================================================

export const ReportHeader = ({
  title,
  description,
  examCenter,
  headerFields,
  className,
}: ReportHeaderProps) => {
  const metadataItems: Array<{ label: string; value: ReactNode }> = [];

  if (examCenter.code) {
    metadataItems.push({ label: 'Exam Center Code', value: examCenter.code });
  }
  if (examCenter.distributionCenter) {
    metadataItems.push({ label: 'Distribution Center', value: examCenter.distributionCenter });
  }
  if (examCenter.season) {
    metadataItems.push({ label: 'Exam Season', value: examCenter.season });
  }
  if (examCenter.year) {
    metadataItems.push({ label: 'Exam Year', value: examCenter.year });
  }
  if (examCenter.date) {
    const formattedDate = new Date(examCenter.date).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
    metadataItems.push({ label: 'Date', value: formattedDate });
  }
  if (examCenter.session) {
    metadataItems.push({ label: 'Session', value: examCenter.session });
  }
  if (examCenter.timeSlot) {
    metadataItems.push({ label: 'Time Slot', value: examCenter.timeSlot });
  }
  if (examCenter.officerIncharge) {
    metadataItems.push({ label: 'Officer In-Charge', value: examCenter.officerIncharge });
  }

  return (
    <div
      className={cn('report-header', className)}
      style={{
        flexShrink: 0,
        marginBottom: '3mm',
        paddingBottom: '2.5mm',
        borderBottom: '1.5px solid #000000',
      }}
    >
      <div className="text-center">
        <h1
          className="text-2xl font-bold tracking-tight"
          style={{
            fontFamily: "'Inter', -apple-system, sans-serif",
            letterSpacing: '-0.02em',
            fontSize: '24pt',
            fontWeight: 700,
          }}
        >
          {examCenter.name}
        </h1>
      </div>

      {metadataItems.length > 0 && (
        <div className="mt-1.5">
          <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-xs md:grid-cols-3">
            {metadataItems.map((item, index) => (
              <div
                key={index}
                className="flex items-baseline gap-1.5"
              >
                <span className="font-medium whitespace-nowrap text-neutral-600">
                  {item.label}:
                </span>
                <span className="truncate text-neutral-800">{item.value || '—'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-2 text-center">
        <h2
          className="text-lg font-semibold tracking-tight"
          style={{
            fontFamily: "'Inter', -apple-system, sans-serif",
            letterSpacing: '-0.01em',
            fontSize: '16pt',
            fontWeight: 600,
          }}
        >
          {title}
        </h2>
        {description && (
          <p
            className="mt-0.5 text-sm text-neutral-600"
            style={{ fontSize: '10pt' }}
          >
            {description}
          </p>
        )}
      </div>

      <DynamicHeaderFields fields={headerFields} />
    </div>
  );
};

ReportHeader.displayName = 'ReportHeader';

// ============================================================================
// ReportFooter
// ============================================================================

export const ReportFooter = ({
  signatureFields = [],
  showTestForgeCredit = true,
  creditText = 'Generated using TestForge®',
  className,
}: ReportFooterProps) => {
  const hasSignatures = signatureFields.length > 0;

  if (!hasSignatures && !showTestForgeCredit) {
    return null;
  }

  return (
    <div
      className={cn('report-footer', className)}
      style={{
        flexShrink: 0,
        marginTop: '2.5mm',
        paddingTop: '2mm',
        borderTop: '1px solid #000000',
        position: 'relative',
        minHeight: hasSignatures ? '20mm' : '0',
      }}
    >
      {hasSignatures && (
        <div
          className="grid gap-4"
          style={{
            gridTemplateColumns: `repeat(${Math.min(signatureFields.length, 3)}, 1fr)`,
          }}
        >
          {signatureFields.map((field, index) => (
            <div
              key={index}
              className="text-left"
            >
              <p className="text-sm font-medium">{field.label}</p>
              <p className="mt-0.5 text-sm text-neutral-500">
                ({field.name || field.placeholder || '________________________'})
              </p>
            </div>
          ))}
        </div>
      )}

      <PrintCredit
        text={creditText}
        enabled={showTestForgeCredit}
      />
    </div>
  );
};

ReportFooter.displayName = 'ReportFooter';

// ============================================================================
// ReportPage
// ============================================================================

const ReportPage = forwardRef<
  HTMLDivElement,
  {
    pageData: ReportPageData;
    header: ReportHeaderProps;
    footer?: ReportFooterProps;
    copyIndex: number;
    totalCopies: number;
    renderContent: (pageData: ReportPageData) => ReactNode;
    printLandscape?: boolean;
    showCopyInfo?: boolean;
    copyInfoText?: string;
  }
>(
  (
    {
      pageData,
      header,
      footer,
      copyIndex,
      totalCopies,
      renderContent,
      printLandscape = false,
      showCopyInfo = false,
      copyInfoText = 'Copy {copyNumber} of {totalCopies}',
    },
    ref,
  ) => {
    const pageStyle = createPageStyle(printLandscape);

    const mergedHeader: ReportHeaderProps = {
      ...header,
      headerFields: {
        ...header.headerFields,
        ...((pageData.metadata as Record<string, string>) || {}),
      },
    };

    const signatureFields: Array<{ label: string; name?: string; placeholder?: string }> = [];

    if (pageData.metadata) {
      const signatureMappings: Record<string, string> = {
        supervisorName: 'Signature of Supervisor',
        officerIncharge: 'Signature of Officer In-Charge',
        sealingSupervisor: 'Signature of Sealing Supervisor',
        controller: 'Signature of Controller',
      };

      Object.entries(signatureMappings).forEach(([key, label]) => {
        if (pageData.metadata?.[key]) {
          signatureFields.push({
            label,
            name: String(pageData.metadata[key]),
            placeholder: '________________________',
          });
        }
      });
    }

    const mergedFooter: ReportFooterProps = {
      ...footer,
      signatureFields: signatureFields.length > 0 ? signatureFields : footer?.signatureFields,
    };

    const copyText = copyInfoText
      .replace(/{copyNumber}/g, String(copyIndex + 1))
      .replace(/{totalCopies}/g, String(totalCopies));

    return (
      <div
        ref={ref}
        className="report-content bg-white shadow-sm print:shadow-none"
        style={pageStyle}
      >
        <ReportHeader {...mergedHeader} />

        <div
          className="report-body"
          style={{
            flex: 1,
            overflow: 'hidden',
            minHeight: 0,
            paddingTop: '2mm',
          }}
        >
          {renderContent(pageData)}
        </div>

        <ReportFooter {...mergedFooter} />

        {showCopyInfo && totalCopies > 1 && (
          <div
            className="mt-1 border-t border-dashed border-neutral-300 pt-1 text-[8px] text-neutral-500"
            style={{ flexShrink: 0 }}
          >
            <p>{copyText}</p>
          </div>
        )}
      </div>
    );
  },
);

ReportPage.displayName = 'ReportPage';

// ============================================================================
// MultiPageReport
// ============================================================================

export const MultiPageReport = forwardRef<HTMLDivElement, MultiPageReportProps>(
  (
    {
      pages,
      header,
      footer,
      onBack,
      backButtonLabel = 'Back',
      documentTitle = 'Report',
      numberOfCopies: externalCopies = 1,
      onCopiesChange,
      renderPageContent,
      printLandscape = false,
      showCopyInfo = false,
      copyInfoText = 'Copy {copyNumber} of {totalCopies}',
    },
    ref,
  ) => {
    const internalRef = useRef<HTMLDivElement>(null);
    const combinedRef = (ref || internalRef) as React.RefObject<HTMLDivElement>;
    const [numberOfCopies, setNumberOfCopies] = useState(externalCopies);

    useEffect(() => {
      setNumberOfCopies(externalCopies);
    }, [externalCopies]);

    const handleCopiesChange = (value: number) => {
      const newValue = Math.min(5, Math.max(1, value));
      setNumberOfCopies(newValue);
      if (onCopiesChange) {
        onCopiesChange(newValue);
      }
    };

    const totalPages = pages.length * numberOfCopies;

    const handlePrint = useReactToPrint({
      contentRef: combinedRef,
      documentTitle,
      onPrintError: (error: any) => {
        console.error('Print error:', error);
      },
    });

    return (
      <div className="report-wrapper">
        {/* Control Bar */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
          <div className="flex items-center gap-2">
            {onBack && (
              <Button
                variant="outline"
                size="sm"
                onClick={onBack}
                className="gap-1.5 text-sm"
              >
                <ArrowLeft className="h-4 w-4" />
                {backButtonLabel}
              </Button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {onCopiesChange && (
              <div className="flex items-center gap-1.5">
                <label className="text-xs font-medium text-neutral-600">Copies:</label>
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={numberOfCopies}
                  onChange={(e) => handleCopiesChange(parseInt(e.target.value) || 1)}
                  className="w-14 rounded border border-neutral-300 px-1.5 py-0.5 text-center text-sm focus:border-neutral-500 focus:outline-none"
                />
              </div>
            )}
            <Button
              onClick={handlePrint}
              size="sm"
              className="gap-1.5 text-sm"
            >
              <LucidePrinter className="h-4 w-4" />
              Print ({totalPages} pages)
            </Button>
          </div>
        </div>

        {/* Report Content */}
        <div ref={combinedRef}>
          {pages.map((pageData, pageIndex) => (
            <div key={pageData.id || pageIndex}>
              {Array.from({ length: numberOfCopies }).map((_, copyIndex) => (
                <ReportPage
                  key={`${pageData.id || pageIndex}-${copyIndex}`}
                  pageData={pageData}
                  header={header}
                  footer={footer}
                  copyIndex={copyIndex}
                  totalCopies={numberOfCopies}
                  renderContent={renderPageContent}
                  printLandscape={printLandscape}
                  showCopyInfo={showCopyInfo}
                  copyInfoText={copyInfoText}
                />
              ))}
            </div>
          ))}
        </div>

        <style
          jsx
          global
        >{`
          @page {
            size: ${printLandscape ? '297mm 210mm' : '210mm 297mm'} !important;
            margin: 0 !important;
          }

          @media print {
            html,
            body {
              margin: 0 !important;
              padding: 0 !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }

            .report-wrapper {
              width: ${printLandscape ? '297mm' : '210mm'} !important;
              margin: 0 auto !important;
              padding: 0 !important;
            }

            .report-content {
              box-shadow: none !important;
              border: 1px solid #000 !important;
              height: ${printLandscape ? '210mm' : '297mm'} !important;
              max-height: ${printLandscape ? '210mm' : '297mm'} !important;
              overflow: hidden !important;
              page-break-after: always !important;
              page-break-inside: avoid !important;
            }

            .report-header {
              border-bottom: 1.5px solid #000 !important;
            }

            .report-footer {
              border-top: 1px solid #000 !important;
            }

            .print\\:hidden {
              display: none !important;
            }

            .print-only {
              display: block !important;
            }
          }

          @media screen {
            .print-only {
              display: none !important;
            }
          }
        `}</style>
      </div>
    );
  },
);

MultiPageReport.displayName = 'MultiPageReport';

// ============================================================================
// ReportLayout - Legacy Support
// ============================================================================

interface ReportLayoutProps {
  children: ReactNode;
  header?: ReportHeaderProps;
  footer?: ReportFooterProps;
  className?: string;
  contentClassName?: string;
  onPrint?: () => void;
  showPrintButton?: boolean;
  showBackButton?: boolean;
  onBack?: () => void;
  backButtonLabel?: string;
  printButtonLabel?: string;
  documentTitle?: string;
  bordered?: boolean;
  printLandscape?: boolean;
}

const ReportLayout = forwardRef<HTMLDivElement, ReportLayoutProps>(
  (
    {
      children,
      header,
      footer,
      className,
      contentClassName,
      onPrint,
      showPrintButton = true,
      showBackButton = false,
      onBack,
      backButtonLabel = 'Back',
      printButtonLabel = 'Print Report',
      documentTitle = 'Report',
      bordered = true,
      printLandscape = false,
    },
    ref,
  ) => {
    const internalRef = useRef<HTMLDivElement>(null);
    const combinedRef = (ref || internalRef) as React.RefObject<HTMLDivElement>;

    const handlePrint = useReactToPrint({
      contentRef: combinedRef,
      documentTitle,
      onPrintError: (error: any) => {
        console.error('Print error:', error);
      },
    });

    const pageStyle = createPageStyle(printLandscape);

    return (
      <div className={cn('report-wrapper', className)}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
          <div className="flex items-center gap-2">
            {showBackButton && onBack && (
              <Button
                variant="outline"
                size="sm"
                onClick={onBack}
                className="gap-1.5 text-sm"
              >
                <ArrowLeft className="h-4 w-4" />
                {backButtonLabel}
              </Button>
            )}
          </div>
          {showPrintButton && (
            <Button
              onClick={() => {
                if (onPrint) {
                  onPrint();
                } else {
                  handlePrint();
                }
              }}
              size="sm"
              className="gap-1.5 text-sm"
            >
              <LucidePrinter className="h-4 w-4" />
              {printButtonLabel}
            </Button>
          )}
        </div>

        <div
          ref={combinedRef}
          className={cn(
            'report-content bg-white shadow-sm print:shadow-none',
            bordered && 'border border-black',
            contentClassName,
          )}
          style={pageStyle}
        >
          {header && <ReportHeader {...header} />}
          <div
            className="report-body"
            style={{ flex: 1, overflow: 'hidden' }}
          >
            {children}
          </div>
          {footer && <ReportFooter {...footer} />}
        </div>

        <style
          jsx
          global
        >{`
          @page {
            size: ${printLandscape ? '297mm 210mm' : '210mm 297mm'} !important;
            margin: 0 !important;
          }

          @media print {
            html,
            body {
              margin: 0 !important;
              padding: 0 !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }

            .report-wrapper {
              width: ${printLandscape ? '297mm' : '210mm'} !important;
              margin: 0 auto !important;
              padding: 0 !important;
            }

            .report-content {
              box-shadow: none !important;
              border: 1px solid #000 !important;
              height: ${printLandscape ? '210mm' : '297mm'} !important;
              max-height: ${printLandscape ? '210mm' : '297mm'} !important;
              overflow: hidden !important;
            }

            .report-header {
              border-bottom: 1.5px solid #000 !important;
            }

            .report-footer {
              border-top: 1px solid #000 !important;
            }

            .print\\:hidden {
              display: none !important;
            }

            .print-only {
              display: block !important;
            }
          }

          @media screen {
            .print-only {
              display: none !important;
            }
          }
        `}</style>
      </div>
    );
  },
);

ReportLayout.displayName = 'ReportLayout';

export default ReportLayout;
