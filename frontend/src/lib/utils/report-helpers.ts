// lib/utils/report-helpers.ts
import { ReportPageData } from '@/components/layout/msbte-report-layout';

export function paginateData<T>(
  data: T[],
  rowsPerPage: number,
  pageDataBuilder: (chunk: T[], pageIndex: number) => ReportPageData,
): ReportPageData[] {
  const pages: ReportPageData[] = [];
  for (let i = 0; i < data.length; i += rowsPerPage) {
    const chunk = data.slice(i, i + rowsPerPage);
    pages.push(pageDataBuilder(chunk, Math.floor(i / rowsPerPage) + 1));
  }
  return pages;
}

export const MAX_ROWS = {
  FORMAT_5: 32, // Attendance register - 32 seats per page
  FORMAT_6: 1, // One per page
  FORMAT_7: 1, // One per page (packing slip)
  FORMAT_8: 25, // Receipt table - 25 rows per page
  FORMAT_9: 25, // Receipt table - 25 rows per page
  FORMAT_13: 20, // Malpractice report - 20 records per page
};
