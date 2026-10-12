'use server';

import { logger } from '@/lib/misc/logger';
import { getExamCenterId } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';

import { generateQPInventoryFromTimetable } from './actions';

const MODULE = 'exam-day:queries';

export interface QPInventoryRecord {
  id: string;
  date: Date | string;
  session: 'Morning' | 'Afternoon' | 'All';
  subjectCode: string;
  subjectName: string;
  scheme: string;
  expectedStudents: number;
  day: number | null;
  expectedPackets: number;
  receivedPackets: number;
  receivedQps: number;
  qpPerPacket: number;
  isComplete: boolean;
  hasDiscrepancy: boolean;
}

export interface QPInventoryStats {
  totalSubjects: number;
  totalExpectedStudents: number;
  totalExpectedPackets: number;
  totalReceivedPackets: number;
  totalReceivedQps: number;
  totalPacketsDiscrepancy: number;
  totalQpsDiscrepancy: number;
  completionRate: number;
}

export async function getQPInventory(
  date: Date | string,
  session?: string,
): Promise<{
  success: boolean;
  data?: QPInventoryRecord[];
  stats?: QPInventoryStats;
  error?: string;
}> {
  const MODULE_FN = `${MODULE}.getQPInventory`;

  try {
    const examCenterId = await getExamCenterId();

    if (!examCenterId) {
      return {
        success: true,
        data: [],
        stats: {
          totalSubjects: 0,
          totalExpectedStudents: 0,
          totalExpectedPackets: 0,
          totalReceivedPackets: 0,
          totalReceivedQps: 0,
          totalPacketsDiscrepancy: 0,
          totalQpsDiscrepancy: 0,
          completionRate: 0,
        },
      };
    }

    const supabase = await createClient();
    const dateStr =
      typeof date === 'string' ? date.split('T')[0] : date.toISOString().split('T')[0];

    let query = supabase
      .from('qp_inventory')
      .select(
        'id, day, date, session, subject_code, expected_students, expected_packets, received_packets, received_qps',
      )
      .eq('exam_center_id', examCenterId)
      .eq('date', dateStr);

    if (session && session !== 'All') {
      query = query.eq('session', session);
    }

    const { data: records, error } = await query.order('session').order('subject_code');

    if (error) throw error;

    if (!records || records.length === 0) {
      // Auto-generate from timetable if empty
      const genResult = await generateQPInventoryFromTimetable(date, session);
      if (genResult.success && genResult.data && genResult.data.length > 0) {
        let refetchQuery = supabase
          .from('qp_inventory')
          .select(
            'id, day, date, session, subject_code, expected_students, expected_packets, received_packets, received_qps',
          )
          .eq('exam_center_id', examCenterId)
          .eq('date', dateStr);

        if (session && session !== 'All') {
          refetchQuery = refetchQuery.eq('session', session);
        }

        const { data: refetched } = await refetchQuery.order('session').order('subject_code');
        if (refetched && refetched.length > 0) {
          return await processInventoryRecords(supabase, refetched);
        }
      }

      return {
        success: true,
        data: [],
        stats: {
          totalSubjects: 0,
          totalExpectedStudents: 0,
          totalExpectedPackets: 0,
          totalReceivedPackets: 0,
          totalReceivedQps: 0,
          totalPacketsDiscrepancy: 0,
          totalQpsDiscrepancy: 0,
          completionRate: 0,
        },
      };
    }

    return await processInventoryRecords(supabase, records);
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to fetch inventory', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch inventory',
    };
  }
}

async function processInventoryRecords(
  supabase: any,
  records: any[],
): Promise<{
  success: boolean;
  data: QPInventoryRecord[];
  stats: QPInventoryStats;
}> {
  const subjectCodes = [...new Set(records.map((r) => r.subject_code))];

  const subjectInfoMap = new Map<string, { subjectName: string; scheme: string }>();
  if (subjectCodes.length > 0) {
    const { data: subjectRecords } = await supabase
      .from('subjects')
      .select('code, name, scheme')
      .in('code', subjectCodes);

    if (subjectRecords) {
      for (const sub of subjectRecords) {
        subjectInfoMap.set(sub.code, {
          subjectName: sub.name || sub.code,
          scheme: sub.scheme || '',
        });
      }
    }
  }

  const mappedRecords: QPInventoryRecord[] = records.map((record) => {
    const subjectInfo = subjectInfoMap.get(record.subject_code) || {
      subjectName: record.subject_code,
      scheme: '',
    };

    const receivedPackets = record.received_packets || 0;
    const expectedPackets = record.expected_packets || 0;
    const receivedQps = record.received_qps || 0;
    const expectedStudents = record.expected_students || 0;

    return {
      id: record.id,
      date: record.date,
      session: record.session as 'Morning' | 'Afternoon',
      subjectCode: record.subject_code,
      subjectName: subjectInfo.subjectName,
      scheme: subjectInfo.scheme,
      expectedStudents,
      day: record.day ?? null,
      expectedPackets,
      receivedPackets,
      receivedQps,
      qpPerPacket: receivedQps || 0,
      isComplete: receivedPackets >= expectedPackets && expectedPackets > 0,
      hasDiscrepancy: expectedPackets !== receivedPackets && expectedPackets > 0,
    };
  });

  const totalSubjects = mappedRecords.length;
  const totalExpectedStudents = mappedRecords.reduce((sum, r) => sum + r.expectedStudents, 0);
  const totalExpectedPackets = mappedRecords.reduce((sum, r) => sum + r.expectedPackets, 0);
  const totalReceivedPackets = mappedRecords.reduce((sum, r) => sum + r.receivedPackets, 0);
  const totalReceivedQps = mappedRecords.reduce((sum, r) => sum + r.receivedQps, 0);
  const totalPacketsDiscrepancy = Math.abs(totalExpectedPackets - totalReceivedPackets);
  const totalQpsDiscrepancy = Math.abs(totalReceivedPackets * 50 - totalReceivedQps);
  const completed = mappedRecords.filter((r) => r.isComplete).length;
  const completionRate = totalSubjects > 0 ? Math.round((completed / totalSubjects) * 100) : 0;

  const stats: QPInventoryStats = {
    totalSubjects,
    totalExpectedStudents,
    totalExpectedPackets,
    totalReceivedPackets,
    totalReceivedQps,
    totalPacketsDiscrepancy,
    totalQpsDiscrepancy,
    completionRate,
  };

  return { success: true, data: mappedRecords, stats };
}

export async function getAvailableInventoryDates() {
  const MODULE_FN = `${MODULE}.getAvailableInventoryDates`;

  try {
    const examCenterId = await getExamCenterId();
    if (!examCenterId) return { success: true, data: [] };

    const supabase = await createClient();
    const { data, error } = await supabase
      .from('qp_inventory')
      .select('date')
      .eq('exam_center_id', examCenterId)
      .order('date', { ascending: false });

    if (error) throw error;

    const uniqueDates = [...new Set((data || []).map((r) => r.date))];
    return { success: true, data: uniqueDates };
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to fetch available dates', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch dates',
    };
  }
}

export async function getAllocationsByDateSession(date: Date | string, session: string) {
  const MODULE_FN = `${MODULE}.getAllocationsByDateSession`;

  try {
    const examCenterId = await getExamCenterId();
    if (!examCenterId) return { success: true, data: [] };

    const supabase = await createClient();
    const dateStr =
      typeof date === 'string' ? date.split('T')[0] : date.toISOString().split('T')[0];

    let query = supabase
      .from('block_allocations')
      .select(
        'id, exam_center_id, date, session, block_no, location, scheme, subject_code, subject_name, assigned_count, seat_numbers, supervisor_uid, supervisor_name, created_at, updated_at',
      )
      .eq('exam_center_id', examCenterId)
      .eq('date', dateStr);

    if (session !== 'All') {
      query = query.eq('session', session);
    }

    const { data, error } = await query.order('block_no');

    if (error) throw error;

    const mapped = (data || []).map((row: any) => ({
      id: row.id,
      examCenterId: row.exam_center_id,
      date: row.date,
      session: row.session,
      blockNo: row.block_no || row.block_number || '',
      blockNumber: row.block_no || row.block_number || '',
      location: row.location || row.room_number || '',
      roomNumber: row.location || row.room_number || '',
      scheme: row.scheme || '',
      subjectCode: row.subject_code || '',
      subjectName: row.subject_name || '',
      assignedCount:
        row.assigned_count ??
        row.student_count ??
        (Array.isArray(row.seat_numbers)
          ? row.seat_numbers.length
          : Array.isArray(row.students)
            ? row.students.length
            : 0),
      seatNumbers: Array.isArray(row.seat_numbers)
        ? row.seat_numbers
        : Array.isArray(row.students)
          ? row.students
          : [],
      floor: row.floor,
      supervisorId: row.supervisor_uid || row.supervisor_id,
      supervisorUid: row.supervisor_uid || row.supervisor_id,
      supervisorName: row.supervisor_name,
      relieverId: row.reliever_id,
      relieverName: row.reliever_name,
      studentCount:
        row.assigned_count ??
        row.student_count ??
        (Array.isArray(row.seat_numbers)
          ? row.seat_numbers.length
          : Array.isArray(row.students)
            ? row.students.length
            : 0),
      students: Array.isArray(row.seat_numbers)
        ? row.seat_numbers
        : Array.isArray(row.students)
          ? row.students
          : [],
      isRelieverAllocated: row.is_reliever_allocated,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    return { success: true, data: mapped };
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to fetch allocations', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch allocations',
    };
  }
}

export async function getTimetableEntries(params?: {
  date?: Date | string;
  session?: 'Morning' | 'Afternoon';
  subjectCode?: string;
  scheme?: string;
}): Promise<{
  success: boolean;
  data?: any[];
  error?: string;
}> {
  const MODULE_FN = `${MODULE}.getTimetableEntries`;

  try {
    const examCenterId = await getExamCenterId();
    if (!examCenterId) return { success: true, data: [] };

    const supabase = await createClient();
    let query = supabase
      .from('timetable')
      .select(
        'id, exam_center_id, date, session, time_slot, subject_code, subject_name, scheme, subject_abbr, total_students, exam_day, absent_numbers, cps_students, cps_resolved, created_at, updated_at',
      )
      .eq('exam_center_id', examCenterId);

    if (params?.date) {
      const dateStr =
        typeof params.date === 'string'
          ? params.date.split('T')[0]
          : params.date.toISOString().split('T')[0];
      query = query.eq('date', dateStr);
    }
    if (params?.session) {
      query = query.eq('session', params.session);
    }
    if (params?.subjectCode) {
      query = query.eq('subject_code', params.subjectCode);
    }
    if (params?.scheme) {
      query = query.eq('scheme', params.scheme);
    }

    const { data, error } = await query.order('date').order('session').order('time_slot');

    if (error) throw error;

    const mapped = (data || []).map((row: any) => ({
      id: row.id,
      examCenterId: row.exam_center_id,
      date: row.date,
      session: row.session,
      timeSlot: row.time_slot,
      subjectCode: row.subject_code,
      subjectName: row.subject_name,
      scheme: row.scheme,
      semester: row.semester,
      totalStudents: row.total_students,
      examDay: row.exam_day,
      studentRollNumbers: row.student_roll_numbers,
      absentNumbers: row.absent_numbers,
      cpsStudents: row.cps_students,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    return { success: true, data: mapped };
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to fetch timetable entries', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch timetable entries',
    };
  }
}

export async function getUniqueDates() {
  const MODULE_FN = `${MODULE}.getUniqueDates`;

  try {
    const examCenterId = await getExamCenterId();
    if (!examCenterId) return { success: true, data: [] };

    const supabase = await createClient();
    const { data, error } = await supabase
      .from('timetable')
      .select('date')
      .eq('exam_center_id', examCenterId)
      .order('date');

    if (error) throw error;

    const uniqueDates = [...new Set((data || []).map((r) => r.date))];
    return { success: true, data: uniqueDates };
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to fetch unique dates', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch unique dates',
    };
  }
}

export async function getUniqueSessions(date?: Date | string) {
  const MODULE_FN = `${MODULE}.getUniqueSessions`;

  try {
    const examCenterId = await getExamCenterId();
    if (!examCenterId) return { success: true, data: [] };

    const supabase = await createClient();
    let query = supabase.from('timetable').select('session').eq('exam_center_id', examCenterId);

    if (date) {
      const dateStr =
        typeof date === 'string' ? date.split('T')[0] : date.toISOString().split('T')[0];
      query = query.eq('date', dateStr);
    }

    const { data, error } = await query;
    if (error) throw error;

    const uniqueSessions = [...new Set((data || []).map((r) => r.session))];
    return { success: true, data: uniqueSessions };
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to fetch unique sessions', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch unique sessions',
    };
  }
}
