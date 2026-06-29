// components/layout/msbte-report-layout.tsx
'use client';

import React, { CSSProperties, ReactNode, forwardRef, useEffect, useRef, useState } from 'react';

import Image from 'next/image';

import { ArrowLeft, LucidePrinter } from 'lucide-react';
import { useReactToPrint } from 'react-to-print';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

export interface ReportHeaderProps {
  title?: string;
  subtitle?: string;
  showLogo?: boolean;
  logoUrl?: string;
  logoAlt?: string;
  examSeason?: string;
  examYear?: number;
  examCenterName?: string;
  examCenterCode?: string;
  date?: Date | string;
  session?: 'Morning' | 'Afternoon' | 'All';
  instituteCode?: string;
  instituteName?: string;
  blockNo?: string;
  blockLocation?: string;
  supervisorName?: string;
  subjectCode?: string;
  subjectName?: string;
  scheme?: string;
  timeSlot?: string;
  additionalInfo?: ReactNode;
  className?: string;
}

export interface ReportFooterProps {
  showTimestamp?: boolean;
  showTestForgeCredit?: boolean;
  alignment?: 'left' | 'right' | 'center';
  additionalInfo?: ReactNode;
  className?: string;
  showSupervisorSignature?: boolean;
  supervisorName?: string;
  showOfficerSignature?: boolean;
  officerName?: string;
  showSealingSupervisor?: boolean;
  sealingSupervisor?: string;
}

export interface ReportPageData {
  id: string;
  blockNo: string;
  blockLocation?: string;
  supervisorName: string;
  subjectCode: string;
  subjectName: string;
  scheme: string;
  seatNumbers: number[];
  officerIncharge?: string;
  instituteCode?: string;
  instituteName?: string;
  content?: ReactNode;
  sheetNo?: string;
  totalStudents?: number;
  absentNumbers?: number[];
  cpsNumbers?: number[];
  date?: Date;
  session?: 'Morning' | 'Afternoon';
  timeSlot?: string;
  season?: string;
  year?: number;
  examCenterCode?: string;
  examCenterName?: string;
  isCopyCase?: boolean;
  sealingSupervisor?: string;
}

export interface MultiPageReportProps {
  pages: ReportPageData[];
  header?: Omit<ReportHeaderProps, 'blockNo' | 'subjectCode' | 'subjectName' | 'scheme' | 'supervisorName'>;
  footer?: Omit<ReportFooterProps, 'supervisorName' | 'officerName'>;
  onBack?: () => void;
  backButtonLabel?: string;
  documentTitle?: string;
  numberOfCopies?: number;
  onCopiesChange?: (copies: number) => void;
  renderPageContent: (pageData: ReportPageData) => ReactNode;
  printLandscape?: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_PAGE_STYLE: CSSProperties = {
  width: '210mm',
  height: '297mm',
  margin: '0 auto',
  marginBlockEnd: '8px',
  padding: '8mm 10mm',
  position: 'relative',
  boxSizing: 'border-box',
  pageBreakAfter: 'always',
  pageBreakInside: 'avoid',
  backgroundColor: '#ffffff',
  fontFamily: "'Times New Roman', Times, serif",
  fontSize: '11pt',
  lineHeight: '1.2',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
};

const LANDSCAPE_PAGE_STYLE: CSSProperties = {
  width: '297mm',
  height: '210mm',
  margin: '0 auto',
  marginBlockEnd: '8px',
  padding: '8mm 12mm',
  position: 'relative',
  boxSizing: 'border-box',
  pageBreakAfter: 'always',
  pageBreakInside: 'avoid',
  backgroundColor: '#ffffff',
  fontFamily: "'Times New Roman', Times, serif",
  fontSize: '10pt',
  lineHeight: '1.2',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
};

const DEFAULT_LOGO = '/msbte.jpg';

// ============================================================================
// ReportHeader Component
// ============================================================================

export const ReportHeader = ({
  title,
  subtitle,
  showLogo = true,
  logoUrl = DEFAULT_LOGO,
  logoAlt = 'MSBTE Logo',
  examSeason,
  examYear,
  examCenterName,
  examCenterCode,
  date,
  session,
  instituteCode,
  instituteName,
  blockNo,
  blockLocation,
  supervisorName,
  subjectCode,
  subjectName,
  scheme,
  timeSlot,
  additionalInfo,
  className,
}: ReportHeaderProps) => {
  const formattedDate = date
    ? new Date(date).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    : null;

  const schemeParts = scheme?.split('-') || [];

  return (
    <div className={cn('report-header mb-3 border-b-2 border-black pb-2 text-center', className)}>
      {/* Logo and Title */}
      <div className="mb-2 text-center">
        <div className="flex items-center justify-center gap-3">
          {showLogo && (
            <div className="flex-shrink-0">
              <Image
                src={logoUrl}
                alt={logoAlt}
                width={50}
                height={50}
                className="h-12 w-12 object-contain mix-blend-multiply"
                priority
              />
            </div>
          )}
          <div>
            <h1 className="text-xl font-bold tracking-tight uppercase">
              Maharashtra State Board of Technical Education
            </h1>
            {examSeason && examYear && (
              <p className="text-sm">
                Examination: {examSeason} - {examYear}
              </p>
            )}
            {examCenterName && (
              <p className="text-sm">
                {examCenterCode ? `(${examCenterCode}) ` : ''}
                {examCenterName}
              </p>
            )}
          </div>
        </div>

        {/* Title Block */}
        {title && (
          <div className="mt-2">
            <h2 className="text-lg font-semibold underline decoration-1 underline-offset-4">{title}</h2>
            {subtitle && <p className="mt-0.5 text-sm">{subtitle}</p>}
          </div>
        )}
      </div>

      {/* Meta Information */}
      <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-sm">
        {formattedDate && (
          <p className="text-left">
            <span className="font-semibold">Date:</span> {formattedDate}
          </p>
        )}
        {session && (
          <p className="text-left">
            <span className="font-semibold">Session:</span> {session}
          </p>
        )}
        {examCenterCode && (
          <p className="text-left">
            <span className="font-semibold">Exam Center Code:</span> {examCenterCode}
          </p>
        )}
        {instituteCode && (
          <p className="text-left">
            <span className="font-semibold">Institute Code:</span> {instituteCode}
          </p>
        )}
        {instituteName && (
          <p className="text-left">
            <span className="font-semibold">Institute:</span> {instituteName}
          </p>
        )}
        {blockNo && (
          <p className="text-left">
            <span className="font-semibold">Block No.:</span> {blockNo} {blockLocation ? `- ${blockLocation}` : ''}
          </p>
        )}
        {supervisorName && (
          <p className="text-left">
            <span className="font-semibold">Supervisor:</span> {supervisorName}
          </p>
        )}
        {subjectCode && (
          <p className="text-left">
            <span className="font-semibold">Subject Code:</span> {subjectCode}
          </p>
        )}
        {subjectName && (
          <p className="text-left">
            <span className="font-semibold">Subject:</span> {subjectName}
          </p>
        )}
        {scheme && schemeParts.length >= 3 && (
          <p className="text-left">
            <span className="font-semibold">Course/Sem/Master:</span> {schemeParts[0]}/{schemeParts[1]}/{schemeParts[2]}
          </p>
        )}
        {timeSlot && (
          <p className="text-left">
            <span className="font-semibold">Time:</span> {timeSlot}
          </p>
        )}
        {additionalInfo}
      </div>
    </div>
  );
};

ReportHeader.displayName = 'ReportHeader';

// ============================================================================
// ReportFooter Component
// ============================================================================

export const ReportFooter = ({
  showTimestamp = true,
  showTestForgeCredit = true,
  alignment = 'right',
  additionalInfo,
  className,
  showSupervisorSignature = false,
  supervisorName,
  showOfficerSignature = false,
  officerName,
  showSealingSupervisor = false,
  sealingSupervisor,
}: ReportFooterProps) => {
  const timestamp = new Date().toLocaleString('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div
      className={cn(
        'report-footer mt-2 border-t border-black pt-2 text-xs',
        alignment === 'left' && 'text-left',
        alignment === 'right' && 'text-right',
        alignment === 'center' && 'text-center',
        className
      )}
    >
      {/* Signature Section */}
      {(showSupervisorSignature || showOfficerSignature || showSealingSupervisor) && (
        <div className="my-2 flex justify-between">
          {showSupervisorSignature && (
            <div className="">
              <p className="font-semibold">Signature of Supervisor</p>
              <p className="mt-0.5">({supervisorName || '________________________'})</p>
            </div>
          )}
          {showSealingSupervisor && (
            <div>
              <p className="font-semibold">Signature of Sealing Supervisor</p>
              <p className="mt-0.5">({sealingSupervisor || '________________________'})</p>
            </div>
          )}
          {showOfficerSignature && (
            <div className="text-right">
              <p className="font-semibold">Signature of Officer-In-charge</p>
              <p className="mt-0.5">({officerName || '________________________'})</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

ReportFooter.displayName = 'ReportFooter';

// ============================================================================
// ReportPage Component
// ============================================================================

const ReportPage = forwardRef<
  HTMLDivElement,
  {
    pageData: ReportPageData;
    header?: Omit<ReportHeaderProps, 'blockNo' | 'subjectCode' | 'subjectName' | 'scheme' | 'supervisorName'>;
    footer?: Omit<ReportFooterProps, 'supervisorName' | 'officerName'>;
    copyIndex: number;
    totalCopies: number;
    renderContent: (pageData: ReportPageData) => ReactNode;
    printLandscape?: boolean;
  }
>(({ pageData, header, footer, copyIndex, totalCopies, renderContent, printLandscape = false }, ref) => {
  const pageStyle = printLandscape ? LANDSCAPE_PAGE_STYLE : DEFAULT_PAGE_STYLE;

  return (
    <div
      ref={ref}
      className="report-content border border-black bg-white shadow-md print:shadow-none"
      style={pageStyle}
    >
      <div style={{ flexShrink: 0 }}>
        <ReportHeader
          {...header}
          blockNo={pageData.blockNo}
          blockLocation={pageData.blockLocation}
          supervisorName={pageData.supervisorName}
          subjectCode={pageData.subjectCode}
          subjectName={pageData.subjectName}
          scheme={pageData.scheme}
          instituteCode={pageData.instituteCode}
          instituteName={pageData.instituteName}
        />
      </div>

      <div className="report-body" style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
        {renderContent(pageData)}
      </div>

      <div style={{ flexShrink: 0 }}>
        <ReportFooter {...footer} supervisorName={pageData.supervisorName} officerName={pageData.officerIncharge} />

        <div className="mt-2 border-t border-dashed border-neutral-300 pt-1 text-[8px] text-neutral-500">
          <p>
            Copy {copyIndex + 1} of {totalCopies}:{' '}
            {copyIndex === 0 ? 'Forwarded with answer book bundle' : 'For office record'}
          </p>
        </div>
      </div>
    </div>
  );
});

ReportPage.displayName = 'ReportPage';

// ============================================================================
// MultiPageReport Component
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
      numberOfCopies: externalCopies = 2,
      onCopiesChange,
      renderPageContent,
      printLandscape = false,
    },
    ref
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
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 print:hidden">
          <div className="flex items-center gap-3">
            {onBack && (
              <Button variant="secondary" size="sm" onClick={onBack} className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                {backButtonLabel}
              </Button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Copies per block:</label>
              <input
                type="number"
                min={1}
                max={5}
                value={numberOfCopies}
                onChange={e => handleCopiesChange(parseInt(e.target.value) || 1)}
                className="w-16 rounded border px-2 py-1 text-center text-sm"
              />
            </div>
            <Button onClick={handlePrint} size="sm" className="gap-2">
              <LucidePrinter className="h-4 w-4" />
              Print All ({totalPages} pages)
            </Button>
          </div>
        </div>

        {/* Report Content */}
        <div ref={combinedRef}>
          {pages.map((pageData, pageIndex) => (
            <div key={pageData.id}>
              {Array.from({ length: numberOfCopies }).map((_, copyIndex) => (
                <ReportPage
                  key={`${pageData.id}-${copyIndex}`}
                  pageData={pageData}
                  header={header}
                  footer={footer}
                  copyIndex={copyIndex}
                  totalCopies={numberOfCopies}
                  renderContent={renderPageContent}
                  printLandscape={printLandscape}
                />
              ))}
            </div>
          ))}
        </div>

        <style jsx global>{`
          @page {
            size: ${printLandscape ? 'A4 landscape' : 'A4'};
            margin: 0;
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
              border-bottom: 2px solid #000 !important;
              padding-bottom: 4px !important;
              margin-bottom: 4px !important;
            }

            .report-footer {
              border-top: 1px solid #000 !important;
              padding-top: 2px !important;
              margin-top: 2px !important;
            }

            .print\\:hidden {
              display: none !important;
            }
          }
        `}</style>
      </div>
    );
  }
);

MultiPageReport.displayName = 'MultiPageReport';

// ============================================================================
// Report Action Types
// ============================================================================

export interface ReportAction {
  label: string;
  onClick: () => void;
  icon?: ReactNode;
  variant?: 'default' | 'outline' | 'ghost' | 'destructive' | 'secondary';
  size?: 'default' | 'sm' | 'xs' | 'icon';
  disabled?: boolean;
  loading?: boolean;
  className?: string;
}

// ============================================================================
// Single Page ReportLayout Component (Legacy support)
// ============================================================================

interface ReportLayoutProps {
  children: ReactNode;
  header?: ReportHeaderProps;
  footer?: ReportFooterProps;
  pageStyle?: CSSProperties;
  className?: string;
  contentClassName?: string;
  onPrint?: () => void;
  showPrintButton?: boolean;
  showBackButton?: boolean;
  disableBackButton?: boolean;
  onBack?: () => void;
  backButtonLabel?: string;
  printButtonLabel?: string;
  documentTitle?: string;
  bordered?: boolean;
  showCopyInfo?: boolean;
  copyInfoText?: string;
  printLandscape?: boolean;
  // New: Custom actions/buttons to display alongside print button
  actions?: ReportAction[];
  // New: Position of actions relative to print button
  actionsPosition?: 'left' | 'right';
  // New: Hide the default print button
  hidePrintButton?: boolean;
  // New: Custom render for the right side of the toolbar
  toolbarRight?: ReactNode;
  // New: Custom render for the left side of the toolbar
  toolbarLeft?: ReactNode;
}

const ReportLayout = forwardRef<HTMLDivElement, ReportLayoutProps>(
  (
    {
      children,
      header,
      footer,
      pageStyle,
      className,
      contentClassName,
      onPrint,
      showPrintButton = true,
      showBackButton = false,
      disableBackButton = false,
      onBack,
      backButtonLabel = 'Back',
      printButtonLabel = 'Print Report',
      documentTitle = 'Report',
      bordered = true,
      showCopyInfo = false,
      printLandscape = false,
      copyInfoText = '1. Copy forwarded with answer book bundle. 2. Copy for office record.',
      actions = [],
      actionsPosition = 'left',
      hidePrintButton = false,
      toolbarRight,
      toolbarLeft,
    },
    ref
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

    const basePageStyle = printLandscape ? LANDSCAPE_PAGE_STYLE : DEFAULT_PAGE_STYLE;
    const combinedPageStyle: CSSProperties = {
      ...basePageStyle,
      ...pageStyle,
    };

    const shouldShowToolbar = showPrintButton || showBackButton || actions.length > 0 || toolbarLeft || toolbarRight;

    return (
      <div className={cn('report-wrapper', className)}>
        {shouldShowToolbar && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4 print:hidden">
            {/* Left side: Back button + custom left content */}
            <div className="flex flex-wrap items-center gap-3">
              {(showBackButton || disableBackButton) && (
                <Button variant="secondary" size="sm" disabled={disableBackButton} onClick={onBack} className="gap-2">
                  <ArrowLeft className="h-4 w-4" />
                  {backButtonLabel}
                </Button>
              )}
              {toolbarLeft}
              {actionsPosition === 'left' &&
                actions.map((action, index) => (
                  <Button
                    key={index}
                    variant={action.variant || 'outline'}
                    size={action.size || 'sm'}
                    onClick={action.onClick}
                    disabled={action.disabled || action.loading}
                    className={cn('gap-1.5', action.className)}
                  >
                    {action.loading ? (
                      <div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    ) : (
                      action.icon
                    )}
                    {action.label}
                  </Button>
                ))}
            </div>

            {/* Right side: Actions + Print button */}
            <div className="flex flex-wrap items-center gap-2">
              {actionsPosition === 'right' &&
                actions.map((action, index) => (
                  <Button
                    key={index}
                    variant={action.variant || 'outline'}
                    size={action.size || 'sm'}
                    onClick={action.onClick}
                    disabled={action.disabled || action.loading}
                    className={cn('gap-1.5', action.className)}
                  >
                    {action.loading ? (
                      <div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    ) : (
                      action.icon
                    )}
                    {action.label}
                  </Button>
                ))}
              {toolbarRight}
              {!hidePrintButton && showPrintButton && (
                <Button
                  onClick={() => {
                    if (onPrint) {
                      onPrint();
                    } else {
                      handlePrint();
                    }
                  }}
                  size="sm"
                  className="gap-2"
                >
                  <LucidePrinter className="h-4 w-4" />
                  {printButtonLabel}
                </Button>
              )}
            </div>
          </div>
        )}

        <div
          ref={combinedRef}
          className={cn(
            'report-content bg-white shadow-md print:shadow-none',
            bordered && 'border border-black',
            contentClassName
          )}
          style={combinedPageStyle}
        >
          {header && <ReportHeader {...header} />}
          <div className="report-body" style={{ flex: 1, overflow: 'hidden' }}>
            {children}
          </div>
          {footer && <ReportFooter {...footer} />}

          {showCopyInfo && (
            <div className="mt-2 border-t border-dashed border-neutral-300 pt-1 text-[8px] text-neutral-500">
              <p>{copyInfoText}</p>
            </div>
          )}
        </div>

        <style jsx global>{`
          @page {
            size: ${printLandscape ? 'A4 landscape' : 'A4'};
            margin: 0;
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
              border-bottom: 2px solid #000 !important;
            }

            .report-footer {
              border-top: 1px solid #000 !important;
            }

            .print\\:hidden {
              display: none !important;
            }
          }
        `}</style>
      </div>
    );
  }
);

ReportLayout.displayName = 'ReportLayout';

export default ReportLayout;
