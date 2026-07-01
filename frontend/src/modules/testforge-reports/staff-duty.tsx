// modules/testforge-reports/staff-duty.tsx

'use client';

import { ReactNode, useCallback, useEffect, useState } from 'react';

import departments from '@/config/course_codes.json';
import { format } from 'date-fns';

import { getAllocations } from '@/lib/actions/allocation';
import { getStaff } from '@/lib/actions/staff';
import { cn } from '@/lib/utils';

import { useUserInfo } from '@/hooks/useUserInfo';

import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

import { MultiPageReport, ReportPageData } from '@/components/layout/testforge-report-layout';

const getDept = (code: string) => departments[code as keyof typeof departments] || code;

// ============================================================
// Constants
// ============================================================

const MAX_ROWS_PER_PAGE = 12;

// ============================================================
// Types
// ============================================================

interface DutyEntry {
  date: Date;
  session: string;
  studentCount: number;
}

interface StaffDutyRow {
  staffUid: string;
  staffName: string;
  department: string;
  role: string;
  duties: DutyEntry[];
  totalDuties: number;
  totalStudents: number;
}

interface StaffDutyPageData extends ReportPageData {
  rows: StaffDutyRow[];
  totalStaff: number;
  totalDuties: number;
  totalStudents: number;
  dateRange: { start: Date; end: Date };
  pageNumber: number;
  totalPages: number;
}

// ============================================================
// Render Function
// ============================================================

const renderStaffDutyTable = (pageData: StaffDutyPageData) => {
  const { rows, totalStaff, totalStudents, dateRange, pageNumber, totalPages } = pageData;

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-hidden">
        <table className="w-full border-collapse border border-black text-xs">
          <thead>
            <tr className="bg-neutral-100 print:bg-neutral-100">
              <th className="w-[4%] border border-black p-1.5 text-center font-bold">#</th>
              <th className="w-[20%] border border-black p-1.5 text-left font-bold">Staff Name</th>
              <th className="w-[10%] border border-black p-1.5 text-center font-bold">UID</th>
              <th className="w-[18%] border border-black p-1.5 text-left font-bold">Department</th>
              <th className="w-[20%] border border-black p-1.5 text-center font-bold">
                Date & Session
              </th>
              <th className="w-[10%] border border-black p-1.5 text-center font-bold">Students</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((staff, staffIndex) => {
              const uniqueDuties = staff.duties.filter(
                (duty, index, self) =>
                  index ===
                  self.findIndex(
                    (d) =>
                      format(d.date, 'yyyy-MM-dd') === format(duty.date, 'yyyy-MM-dd') &&
                      d.session === duty.session,
                  ),
              );

              return uniqueDuties.map((duty, dutyIndex) => {
                const isFirst = dutyIndex === 0;
                const studentCount = staff.duties
                  .filter(
                    (d) =>
                      format(d.date, 'yyyy-MM-dd') === format(duty.date, 'yyyy-MM-dd') &&
                      d.session === duty.session,
                  )
                  .reduce((sum, d) => sum + d.studentCount, 0);

                return (
                  <tr
                    key={`${staff.staffUid}-${dutyIndex}`}
                    className={cn(
                      'border-b border-black',
                      dutyIndex % 2 === 0 ? 'bg-white' : 'bg-neutral-50',
                    )}
                  >
                    {isFirst && (
                      <td
                        rowSpan={uniqueDuties.length}
                        className="border border-black p-1.5 text-center align-middle font-mono"
                      >
                        {staffIndex + 1}
                      </td>
                    )}
                    {isFirst && (
                      <td
                        rowSpan={uniqueDuties.length}
                        className="border border-black p-1.5 pl-2 align-middle font-medium"
                      >
                        {staff.staffName}
                      </td>
                    )}
                    {isFirst && (
                      <td
                        rowSpan={uniqueDuties.length}
                        className="border border-black p-1.5 text-center align-middle font-mono text-[10px]"
                      >
                        {staff.staffUid}
                      </td>
                    )}
                    {isFirst && (
                      <td
                        rowSpan={uniqueDuties.length}
                        className="border border-black p-1.5 pl-2 align-middle text-[10px]"
                      >
                        {getDept(staff.department)}
                      </td>
                    )}

                    <td className="border border-black p-1.5 text-center font-mono text-[10px]">
                      {format(new Date(duty.date), 'dd/MM/yyyy')}
                      <br />
                      <Badge
                        variant="outline"
                        className={cn(
                          'mt-0.5 text-[8px]',
                          duty.session === 'Morning'
                            ? 'border-amber-200 bg-amber-50 text-amber-700'
                            : 'border-blue-200 bg-blue-50 text-blue-700',
                        )}
                      >
                        {duty.session}
                      </Badge>
                    </td>
                    <td className="border border-black p-1.5 text-center text-[12px] font-bold">
                      {studentCount}
                    </td>
                  </tr>
                );
              });
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-black bg-neutral-200 font-bold print:bg-neutral-200">
              <td
                colSpan={4}
                className="border border-black p-1.5 pr-4 text-right"
              >
                GRAND TOTAL
              </td>
              <td
                colSpan={1}
                className="border border-black p-1.5 text-center text-[10px]"
              >
                {format(dateRange.start, 'dd/MM/yyyy')} - {format(dateRange.end, 'dd/MM/yyyy')}
              </td>
              <td className="border border-black p-1.5 text-center">
                {totalStaff} Staff · {totalStudents} Students
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="mt-2 border-t border-black pt-1 text-[10px]">
          <div className="flex justify-between">
            <span className="font-medium">Staff Duty Report</span>
            <span>
              Page {pageNumber} of {totalPages}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================
// Main Component
// ============================================================

export default function StaffDutyReport() {
  const { examCenter, isLoading: userLoading } = useUserInfo();

  const [rows, setRows] = useState<StaffDutyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [numberOfCopies, setNumberOfCopies] = useState(1);

  const fetchData = useCallback(async () => {
    setLoading(true);

    try {
      const [allocationsResult, staffResult] = await Promise.all([getAllocations({}), getStaff()]);

      if (
        !allocationsResult.success ||
        !allocationsResult.data ||
        !staffResult.success ||
        !staffResult.data
      ) {
        setRows([]);
        return;
      }

      const staffMap = new Map<string, { name: string; department: string; role: string }>();
      staffResult.data.forEach((s: any) => {
        staffMap.set(s.uid, { name: s.name, department: s.department, role: s.role || '' });
      });

      const dutyMap = new Map<string, StaffDutyRow>();

      allocationsResult.data.forEach((alloc: any) => {
        const uid = alloc.supervisorUid;
        if (!uid) return;

        const info = staffMap.get(uid);
        if (!info) return;

        const date = alloc.date ? new Date(alloc.date) : new Date();
        const studentCount = alloc.assignedCount || alloc.seatNumbers?.length || 0;

        if (!dutyMap.has(uid)) {
          dutyMap.set(uid, {
            staffUid: uid,
            staffName: info.name,
            department: info.department,
            role: info.role,
            duties: [],
            totalDuties: 0,
            totalStudents: 0,
          });
        }

        const staffRow = dutyMap.get(uid)!;
        staffRow.duties.push({
          date,
          session: alloc.session || 'Morning',
          studentCount,
        });
        staffRow.totalStudents += studentCount;
      });

      const staffDutyRows = Array.from(dutyMap.values())
        .map((s) => ({
          ...s,
          duties: s.duties.sort((a, b) => a.date.getTime() - b.date.getTime()),
          totalDuties: s.duties.length,
        }))
        .sort((a, b) => a.staffName.localeCompare(b.staffName));

      setRows(staffDutyRows);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Build pages - ✅ Count ACTUAL visible rows (unique duty entries)
  const buildPages = useCallback((): StaffDutyPageData[] => {
    if (rows.length === 0) return [];

    const pages: StaffDutyPageData[] = [];
    let currentPageRows: StaffDutyRow[] = [];
    let currentRowCount = 0;
    let pageCounter = 0;

    for (const staff of rows) {
      // Count unique duties (what actually renders as rows)
      const uniqueDutyCount = new Set(
        staff.duties.map((d) => `${format(d.date, 'yyyy-MM-dd')}_${d.session}`),
      ).size;

      // If adding this staff would exceed the limit AND we have content, start new page
      if (currentRowCount + uniqueDutyCount > MAX_ROWS_PER_PAGE && currentPageRows.length > 0) {
        pageCounter++;
        const chunkStaff = currentPageRows.length;
        const chunkStudents = currentPageRows.reduce((sum, r) => sum + r.totalStudents, 0);
        const chunkDuties = currentPageRows.reduce((sum, r) => sum + r.duties.length, 0);

        let cMin = new Date();
        let cMax = new Date(0);
        currentPageRows.forEach((s) =>
          s.duties.forEach((d) => {
            if (d.date < cMin) cMin = d.date;
            if (d.date > cMax) cMax = d.date;
          }),
        );

        pages.push({
          id: `staff-duty-${pageCounter}`,
          rows: [...currentPageRows],
          totalStaff: chunkStaff,
          totalDuties: chunkDuties,
          totalStudents: chunkStudents,
          dateRange: { start: cMin, end: cMax },
          pageNumber: pageCounter,
          totalPages: 0, // Will be updated after all pages are built
          metadata: {
            Page: String(pageCounter),
            Staff: chunkStaff,
            Duties: chunkDuties,
            Students: chunkStudents,
          },
        });

        currentPageRows = [];
        currentRowCount = 0;
      }

      currentPageRows.push(staff);
      currentRowCount += uniqueDutyCount;
    }

    // Save last page
    if (currentPageRows.length > 0) {
      pageCounter++;
      const chunkStaff = currentPageRows.length;
      const chunkStudents = currentPageRows.reduce((sum, r) => sum + r.totalStudents, 0);
      const chunkDuties = currentPageRows.reduce((sum, r) => sum + r.duties.length, 0);

      let cMin = new Date();
      let cMax = new Date(0);
      currentPageRows.forEach((s) =>
        s.duties.forEach((d) => {
          if (d.date < cMin) cMin = d.date;
          if (d.date > cMax) cMax = d.date;
        }),
      );

      pages.push({
        id: `staff-duty-${pageCounter}`,
        rows: currentPageRows,
        totalStaff: chunkStaff,
        totalDuties: chunkDuties,
        totalStudents: chunkStudents,
        dateRange: { start: cMin, end: cMax },
        pageNumber: pageCounter,
        totalPages: 0,
        metadata: {
          Page: String(pageCounter),
          Staff: chunkStaff,
          Duties: chunkDuties,
          Students: chunkStudents,
        },
      });
    }

    // Update totalPages for all pages
    const totalPages = pages.length;
    pages.forEach((page) => {
      page.totalPages = totalPages;
    });

    return pages;
  }, [rows]);

  const pages = buildPages();
  const firstPage = pages[0];

  if (loading || userLoading) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (rows.length === 0) return null;

  // Calculate global totals for header
  const globalTotalStaff = rows.length;
  const globalTotalStudents = rows.reduce((sum, r) => sum + r.totalStudents, 0);
  let globalMin = new Date();
  let globalMax = new Date(0);
  rows.forEach((s) =>
    s.duties.forEach((d) => {
      if (d.date < globalMin) globalMin = d.date;
      if (d.date > globalMax) globalMax = d.date;
    }),
  );

  return (
    <div className="mx-auto max-w-4xl p-4">
      <MultiPageReport
        pages={pages}
        header={{
          title: 'STAFF DUTY SUMMARY',
          description: 'Complete staff duty allocation report',
          examCenter: {
            name: examCenter?.name || 'Examination Center',
            code: examCenter?.code || '',
            season: examCenter?.season || '',
            year: examCenter?.examYear || new Date().getFullYear(),
            date: new Date(),
          },
          headerFields: {
            'Total Staff': String(globalTotalStaff),
            'Total Students': String(globalTotalStudents),
            Period: `${format(globalMin, 'dd/MM/yyyy')} - ${format(globalMax, 'dd/MM/yyyy')}`,
          },
        }}
        footer={{ showTestForgeCredit: true }}
        documentTitle="Staff_Duty_Summary"
        numberOfCopies={numberOfCopies}
        onCopiesChange={setNumberOfCopies}
        renderPageContent={renderStaffDutyTable as (pageData: ReportPageData) => ReactNode}
        showCopyInfo={numberOfCopies > 1}
        copyInfoText="Copy {copyNumber} of {totalCopies}"
      />
    </div>
  );
}
