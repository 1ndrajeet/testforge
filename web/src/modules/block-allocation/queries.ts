'use server';

import { getExamCenterId } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { Block, PackingSlipEntry, StaffMember, SupervisionReportEntry } from '@/lib/types';

export async function getAllocations(params?: {
  date?: Date | string;
  session?: string;
  blockId?: string;
  subjectCode?: string;
  supervisorUid?: string;
}) {
  try {
    const examCenterId = await getExamCenterId();
    if (!examCenterId) return { success: true, data: [] };

    const supabase = await createClient();
    let query = supabase
      .from('block_allocations')
      .select(
        'id, exam_center_id, connected_institute_id, date, session, timeslot, block_id, block_no, location, scheme, subject_code, subject_name, seat_numbers, first_seat, last_seat, assigned_count, strength, supervisor_uid, supervisor_name, created_at, updated_at',
      )
      .eq('exam_center_id', examCenterId);

    if (params?.date) {
      const dateStr =
        typeof params.date === 'string'
          ? params.date.split('T')[0]
          : params.date.toISOString().split('T')[0];
      query = query.eq('date', dateStr);
    }
    if (params?.session) query = query.eq('session', params.session);
    if (params?.blockId) query = query.eq('block_id', params.blockId);
    if (params?.subjectCode) query = query.eq('subject_code', params.subjectCode);
    if (params?.supervisorUid) query = query.eq('supervisor_uid', params.supervisorUid);

    const { data, error } = await query.order('date').order('session').order('block_no');
    if (error) throw error;

    return { success: true, data: data || [] };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function getAllocationById(id: string) {
  try {
    const examCenterId = await getExamCenterId();
    if (!examCenterId) return { success: true, data: null };

    const supabase = await createClient();
    const { data, error } = await supabase
      .from('block_allocations')
      .select('*')
      .eq('id', id)
      .eq('exam_center_id', examCenterId)
      .maybeSingle();

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function getAllocationsByDate(date: Date | string, session?: string) {
  return getAllocations({ date, session });
}

export async function getAllocationsByDateSession(date: Date | string, session: string) {
  return getAllocations({ date, session });
}

export async function checkExistingAllocations(
  date: Date | string,
  session: string,
): Promise<{
  success: boolean;
  data: {
    hasAllocations: boolean;
    count: number;
    allocations: Array<{
      id: string;
      blockName: string | null;
      scheme: string;
      subjectCode: string;
      supervisorName: string | null;
      assignedCount: number | null;
      instituteCode: string | null;
      instituteName: string | null;
    }>;
  };
  error?: string;
}> {
  try {
    const examCenterId = await getExamCenterId();
    if (!examCenterId) {
      return {
        success: true,
        data: { hasAllocations: false, count: 0, allocations: [] },
      };
    }

    const dateStr =
      typeof date === 'string' ? date.split('T')[0] : date.toISOString().split('T')[0];
    const supabase = await createClient();

    const { data: allocations, error } = await supabase
      .from('block_allocations')
      .select(
        'id, location, scheme, subject_code, supervisor_name, assigned_count, connected_institute_id',
      )
      .eq('exam_center_id', examCenterId)
      .eq('date', dateStr)
      .eq('session', session);

    if (error) throw error;

    const mappedAllocations = (allocations || []).map((alloc: any) => ({
      id: alloc.id,
      blockName: alloc.location,
      scheme: alloc.scheme,
      subjectCode: alloc.subject_code,
      supervisorName: alloc.supervisor_name,
      assignedCount: alloc.assigned_count,
      instituteCode: null,
      instituteName: null,
    }));

    return {
      success: true,
      data: {
        hasAllocations: mappedAllocations.length > 0,
        count: mappedAllocations.length,
        allocations: mappedAllocations,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      data: { hasAllocations: false, count: 0, allocations: [] },
    };
  }
}

export async function getUniqueDates(): Promise<{
  success: boolean;
  data: Date[];
  error?: string;
}> {
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

    const uniqueDateStrs = Array.from(new Set((data || []).map((d) => d.date))).filter(Boolean);
    const uniqueDates = uniqueDateStrs.map((d) => new Date(d));
    return { success: true, data: uniqueDates };
  } catch (error) {
    return {
      success: false,
      data: [],
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function getUniqueSessions(): Promise<{
  success: boolean;
  data: string[];
  error?: string;
}> {
  return { success: true, data: ['Morning', 'Afternoon'] };
}

export async function getBlocks(): Promise<
  { success: true; data: Block[] } | { success: false; error: string }
> {
  try {
    const examCenterId = await getExamCenterId();
    if (!examCenterId) return { success: true, data: [] };

    const supabase = await createClient();
    const { data, error } = await supabase
      .from('blocks')
      .select(
        'id, exam_center_id, block_no, location, name, strength, distribution, template, is_deleted, created_at, updated_at',
      )
      .eq('exam_center_id', examCenterId)
      .eq('is_deleted', false)
      .order('block_no');

    if (error) throw error;

    const mapped: Block[] = (data || []).map((b) => ({
      id: b.id,
      examCenterId: b.exam_center_id,
      blockNo: b.block_no,
      location: b.location,
      name: b.name,
      strength: b.strength,
      distribution: (b.distribution as number[]) || [10, 10, 10, 10],
      template: b.template || 1,
      isDeleted: b.is_deleted,
      createdAt: new Date(b.created_at),
      updatedAt: new Date(b.updated_at),
    }));

    return { success: true, data: mapped };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function getOrders(params?: {
  staffId?: string;
  orderType?: string;
  date?: Date | string;
}) {
  try {
    const examCenterId = await getExamCenterId();
    if (!examCenterId) return [];

    const supabase = await createClient();
    let query = supabase
      .from('orders')
      .select(
        'id, exam_center_id, staff_id, order_type, date, session, order_key, sent_at, created_at, updated_at',
      )
      .eq('exam_center_id', examCenterId);

    if (params?.staffId) query = query.eq('staff_id', params.staffId);
    if (params?.orderType) query = query.eq('order_type', params.orderType);
    if (params?.date) {
      const dateStr =
        typeof params.date === 'string'
          ? params.date.split('T')[0]
          : params.date.toISOString().split('T')[0];
      query = query.eq('date', dateStr);
    }

    const { data: orderList, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;

    if (!orderList || orderList.length === 0) return [];

    const staffIds = Array.from(new Set(orderList.map((o) => o.staff_id)));
    const { data: staffList } = await supabase
      .from('staff')
      .select('id, uid, name, department, email, staff_type, role, designation')
      .in('id', staffIds);
    const staffMap = new Map((staffList || []).map((s) => [s.id, s]));

    return orderList.map((o) => ({
      id: o.id,
      examCenterId: o.exam_center_id,
      staffId: o.staff_id,
      orderType: o.order_type,
      date: o.date ? new Date(o.date) : null,
      session: o.session,
      orderKey: o.order_key,
      sentAt: o.sent_at ? new Date(o.sent_at) : null,
      createdAt: new Date(o.created_at),
      updatedAt: new Date(o.updated_at),
      staff: staffMap.get(o.staff_id) || null,
    }));
  } catch (error) {
    console.error('Error fetching orders:', error);
    return [];
  }
}

export async function getSupervisors() {
  return getStaff('SUPERVISOR');
}

export async function getStaff(
  staffType?: string,
): Promise<{ success: boolean; data: StaffMember[]; error?: string }> {
  try {
    const examCenterId = await getExamCenterId();
    if (!examCenterId) return { success: true, data: [] };

    const supabase = await createClient();
    let query = supabase
      .from('staff')
      .select(
        'id, uid, name, department, email, staff_type, role, designation, post_held_in_examination, is_deleted, created_at, updated_at',
      )
      .eq('exam_center_id', examCenterId)
      .eq('is_deleted', false);

    if (staffType) {
      query = query.eq('staff_type', staffType);
    }

    const { data, error } = await query.order('name');
    if (error) throw error;

    const mapped: StaffMember[] = (data || []).map((s) => ({
      id: s.id,
      uid: s.uid,
      name: s.name,
      department: s.department,
      email: s.email,
      staffType: s.staff_type,
      role: s.role,
      designation: s.designation,
      postHeldInExamination: s.post_held_in_examination,
      isDeleted: s.is_deleted,
      createdAt: new Date(s.created_at),
      updatedAt: new Date(s.updated_at),
    }));

    return { success: true, data: mapped };
  } catch (error) {
    return {
      success: false,
      data: [],
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function getTimetable(
  paramsOrDate?: { date?: Date | string; session?: string } | Date | string,
  maybeSession?: string,
): Promise<{ success: boolean; data: any[]; error?: string }> {
  try {
    const examCenterId = await getExamCenterId();
    if (!examCenterId) return { success: true, data: [] };

    let dateVal: Date | string | undefined;
    let sessionVal: string | undefined;

    if (paramsOrDate && typeof paramsOrDate === 'object' && !(paramsOrDate instanceof Date)) {
      dateVal = paramsOrDate.date;
      sessionVal = paramsOrDate.session;
    } else {
      dateVal = paramsOrDate as Date | string | undefined;
      sessionVal = maybeSession;
    }

    const supabase = await createClient();
    let query = supabase
      .from('timetable')
      .select(
        'id, exam_center_id, date, session, time_slot, subject_code, subject_name, scheme, total_students, exam_day, absent_numbers, cps_students, created_at, updated_at',
      )
      .eq('exam_center_id', examCenterId);

    if (dateVal) {
      const dateStr =
        typeof dateVal === 'string' ? dateVal.split('T')[0] : dateVal.toISOString().split('T')[0];
      query = query.eq('date', dateStr);
    }
    if (sessionVal) {
      query = query.eq('session', sessionVal);
    }

    const { data, error } = await query.order('date').order('session').order('subject_code');
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
    return {
      success: false,
      data: [],
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function getTimetableEntries(
  paramsOrDate?: { date?: Date | string; session?: string } | Date | string,
  maybeSession?: string,
) {
  return getTimetable(paramsOrDate, maybeSession);
}

export async function getPackingSlip(date: Date | string, session: string) {
  try {
    const examCenterId = await getExamCenterId();
    if (!examCenterId) return { success: true, data: [] };

    const dateStr =
      typeof date === 'string' ? date.split('T')[0] : date.toISOString().split('T')[0];
    const supabase = await createClient();

    const [{ data: center }, { data: timetableEntries }] = await Promise.all([
      supabase.from('exam_centers').select('code, name').eq('id', examCenterId).maybeSingle(),
      supabase
        .from('timetable')
        .select(
          'id, time_slot, scheme, subject_code, subject_name, total_students, absent_numbers, cps_students',
        )
        .eq('exam_center_id', examCenterId)
        .eq('date', dateStr)
        .eq('session', session)
        .order('subject_code'),
    ]);

    if (!timetableEntries || timetableEntries.length === 0) {
      return { success: true, data: [] };
    }

    const packingSlip: PackingSlipEntry[] = timetableEntries.map((entry) => {
      const sheetNo = `SHEET-${entry.subject_code}-${entry.scheme || ''}-${entry.id.substring(0, 8)}`;
      return {
        instituteCode: center?.code || '',
        instituteName: center?.name || '',
        date: dateStr,
        session,
        timeSlot: entry.time_slot || '',
        scheme: entry.scheme || '',
        subjectCode: entry.subject_code,
        totalStudents: entry.total_students || 0,
        sheetNo,
        subjectName: entry.subject_name || entry.subject_code,
        absentNumbers: (entry.absent_numbers as number[]) || [],
        cpsNumbers: (entry.cps_students as number[]) || [],
      };
    });

    return { success: true, data: packingSlip };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate packing slip',
    };
  }
}

export async function getSupervisionReport(date: Date | string, session: string) {
  try {
    const examCenterId = await getExamCenterId();
    if (!examCenterId) return { success: true, data: [] };

    const dateStr =
      typeof date === 'string' ? date.split('T')[0] : date.toISOString().split('T')[0];
    const supabase = await createClient();

    const { data: allocations } = await supabase
      .from('block_allocations')
      .select(
        'id, exam_center_id, date, session, timeslot, block_id, block_no, location, scheme, subject_code, subject_name, seat_numbers, first_seat, last_seat, assigned_count, strength, supervisor_uid, supervisor_name',
      )
      .eq('exam_center_id', examCenterId)
      .eq('date', dateStr)
      .eq('session', session)
      .order('block_no');

    return { success: true, data: allocations || [] };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get supervision report',
    };
  }
}
