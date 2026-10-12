'use server';

import { revalidatePath } from 'next/cache';

import { getExamCenterId } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';

// ─────────────────────────────────────────────────────────────
// Normalisation helpers
//
// Scheme codes are stored inconsistently across tables:
//   students.scheme     = "ME-6-I"   (raw MSBTE form)
//   timetable.scheme    = "ME6I"     (sanitised)
//   block_allocations.scheme = depends on caller
//
// Every comparison normalises both sides. Every write normalises.
// ─────────────────────────────────────────────────────────────

const normScheme = (v: unknown): string =>
  String(v ?? '')
    .trim()
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase();

const normCode = (v: unknown): string =>
  String(v ?? '')
    .trim()
    .toUpperCase();

// ─────────────────────────────────────────────────────────────
// Paged fetch — Supabase's default select caps at 1000 rows.
// An exam center easily exceeds that for students and subjects.
// ─────────────────────────────────────────────────────────────

async function fetchAllStudents(supabase: any, examCenterId: string) {
  const PAGE = 1000;
  const all: Array<{
    seat_number: number;
    scheme: string | null;
    sub_codes: unknown;
    connected_institute_id: string | null;
  }> = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('students')
      .select('seat_number, scheme, sub_codes, connected_institute_id')
      .eq('exam_center_id', examCenterId)
      .eq('is_deleted', false)
      .order('seat_number')
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const batch = (data ?? []) as typeof all;
    all.push(...batch);
    if (batch.length < PAGE) break;
  }
  return all;
}

async function fetchAllSubjects(supabase: any) {
  const PAGE = 1000;
  const all: Array<{ code: string; name: string | null; scheme: string | null }> = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('subjects')
      .select('code, name, scheme')
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const batch = (data ?? []) as typeof all;
    all.push(...batch);
    if (batch.length < PAGE) break;
  }
  return all;
}

// ─────────────────────────────────────────────────────────────
// Main server action
// ─────────────────────────────────────────────────────────────

export async function bulkCreateBlockConfigurations(data: {
  date: Date | string;
  session: string;
  configurations?: Array<{
    blockId?: string;
    blockNo?: string;
    location?: string;
    scheme?: string;
    subjectCode?: string;
    subjectName?: string;
    seatNumbers?: number[];
    firstSeat?: number | null;
    lastSeat?: number | null;
    assignedCount?: number | null;
    strength?: number | null;
    supervisorUid?: string | null;
    supervisorName?: string | null;
    timeslot?: string | null;
  }>;
  allocations?: Array<{
    blockName: string;
    scheme: string;
    subCode: string;
    supervisor: string;
    numberOfCandidates: number;
    startFrom: number;
    timeslot: string;
  }>;
  relieveRatio?: number;
  departmentRelieveRatio?: any;
}): Promise<{
  success: boolean;
  data?: any;
  error?: string;
  existingCount?: number;
  existingAllocations?: Array<{
    blockName: string | null;
    scheme: string;
    subjectCode: string;
    supervisorName: string | null;
    assignedCount: number | null;
  }>;
}> {
  try {
    const examCenterId = await getExamCenterId();
    if (!examCenterId) return { success: false, error: 'Unauthorized' };

    const supabase = await createClient();
    const dateStr =
      typeof data.date === 'string'
        ? data.date.split('T')[0]
        : data.date.toISOString().split('T')[0];

    // ── Guard: no allocations already exist for this date/session ──
    const { data: existingAllocations } = await supabase
      .from('block_allocations')
      .select('location, scheme, subject_code, supervisor_name, assigned_count')
      .eq('exam_center_id', examCenterId)
      .eq('date', dateStr)
      .eq('session', data.session);

    if (existingAllocations && existingAllocations.length > 0) {
      return {
        success: false,
        error: `Existing allocations found for ${dateStr} - ${data.session}. Please clear existing allocations before creating new ones.`,
        existingCount: existingAllocations.length,
        existingAllocations: existingAllocations.map((a: any) => ({
          blockName: a.location,
          scheme: a.scheme,
          subjectCode: a.subject_code,
          supervisorName: a.supervisor_name,
          assignedCount: a.assigned_count,
        })),
      };
    }

    let rows: any[] = [];

    // ── Allocation path (the one the page actually uses) ──
    if (data.allocations && data.allocations.length > 0) {
      // Pre-fetch everything we need, paginated.
      const [allBlocks, allStaff, allSubjects, allStudents] = await Promise.all([
        supabase
          .from('blocks')
          .select('id, location, strength, block_no')
          .eq('exam_center_id', examCenterId)
          .eq('is_deleted', false)
          .then((r: any) => {
            if (r.error) throw r.error;
            return r.data ?? [];
          }),
        supabase
          .from('staff')
          .select('uid, name')
          .eq('exam_center_id', examCenterId)
          .eq('is_deleted', false)
          .then((r: any) => {
            if (r.error) throw r.error;
            return r.data ?? [];
          }),
        fetchAllSubjects(supabase),
        fetchAllStudents(supabase, examCenterId),
      ]);

      // ── Index everything with normalised keys ──
      const blockByLocation = new Map<
        string,
        { id: string; location: string; strength: number; block_no: string | null }
      >();
      for (const b of allBlocks as any[]) {
        blockByLocation.set(String(b.location), b);
      }

      const staffByUid = new Map<string, { uid: string; name: string }>();
      for (const s of allStaff as any[]) {
        staffByUid.set(String(s.uid), s);
      }

      // Subject lookup keyed by (normalised scheme, normalised code).
      const subjectByNameKey = new Map<string, { name: string | null }>();
      for (const sub of allSubjects) {
        const key = `${normScheme(sub.scheme)}::${normCode(sub.code)}`;
        if (!subjectByNameKey.has(key)) {
          subjectByNameKey.set(key, { name: sub.name });
        }
      }

      // Pre-group students by (normalised scheme, normalised sub-code).
      // This turns the per-allocation scan into an O(1) lookup.
      const studentsBySchemeAndCode = new Map<string, typeof allStudents>();
      for (const st of allStudents) {
        const schemeKey = normScheme(st.scheme);
        if (!schemeKey) continue;
        if (!Array.isArray(st.sub_codes)) continue;
        for (const raw of st.sub_codes as unknown[]) {
          const codeKey = normCode(raw);
          if (!codeKey) continue;
          const key = `${schemeKey}::${codeKey}`;
          const bucket = studentsBySchemeAndCode.get(key) ?? [];
          bucket.push(st);
          studentsBySchemeAndCode.set(key, bucket);
        }
      }

      // ── Build rows, tracking unresolved allocations ──
      const unresolved: string[] = [];
      const seenBlockNos = new Map<string, string>();

      for (const alloc of data.allocations) {
        const allocSchemeKey = normScheme(alloc.scheme);
        const allocCodeKey = normCode(alloc.subCode);
        const lookupKey = `${allocSchemeKey}::${allocCodeKey}`;

        const pool = studentsBySchemeAndCode.get(lookupKey) ?? [];
        const offset = Math.max(0, alloc.startFrom - 1);
        const allocatedStudents = pool.slice(offset, offset + alloc.numberOfCandidates);

        if (allocatedStudents.length === 0 && alloc.numberOfCandidates > 0) {
          unresolved.push(`${alloc.blockName}/${alloc.scheme}/${alloc.subCode}`);
          continue;
        }

        const seatNumbers = allocatedStudents.map((s: any) => s.seat_number);
        const firstSeat = seatNumbers.length > 0 ? seatNumbers[0] : null;
        const lastSeat = seatNumbers.length > 0 ? seatNumbers[seatNumbers.length - 1] : null;
        const connectedInstituteId =
          allocatedStudents.length > 0 ? allocatedStudents[0].connected_institute_id : null;

        const blockData = blockByLocation.get(String(alloc.blockName));
        const supervisor = staffByUid.get(String(alloc.supervisor));
        const subject = subjectByNameKey.get(lookupKey);

        // Real block_no from the blocks table. Fall back with a clearly
        // invalid-looking marker so a mismatch is visible in the DB.
        let blockNo: string;
        if (blockData?.block_no) {
          blockNo = String(blockData.block_no);
        } else {
          if (!seenBlockNos.has(alloc.blockName)) {
            seenBlockNos.set(alloc.blockName, `?${seenBlockNos.size + 1}`);
          }
          blockNo = seenBlockNos.get(alloc.blockName)!;
        }

        rows.push({
          exam_center_id: examCenterId,
          connected_institute_id: connectedInstituteId,
          date: dateStr,
          session: data.session,
          timeslot: alloc.timeslot || null,
          block_id: blockData?.id || null,
          block_no: blockNo,
          location: alloc.blockName,
          // Persist normalised scheme/code so they match the timetable table.
          scheme: allocSchemeKey,
          subject_code: allocCodeKey,
          subject_name: subject?.name || '',
          seat_numbers: seatNumbers,
          first_seat: firstSeat,
          last_seat: lastSeat,
          assigned_count: seatNumbers.length,
          strength: blockData?.strength ?? 0,
          supervisor_uid: alloc.supervisor || null,
          supervisor_name: supervisor?.name || '',
        });
      }

      // Fail loudly rather than writing empty rows.
      if (unresolved.length > 0) {
        return {
          success: false,
          error: `No students matched for: ${unresolved.join(', ')}. No rows were written. Check that the subject codes and schemes on the timetable match the students.`,
        };
      }
    } else if (data.configurations && data.configurations.length > 0) {
      // Legacy path — direct configurations. Normalise scheme/code on write.
      rows = data.configurations.map((c) => ({
        exam_center_id: examCenterId,
        date: dateStr,
        session: data.session,
        timeslot: c.timeslot || null,
        block_id: c.blockId || null,
        block_no: c.blockNo || '',
        location: c.location || '',
        scheme: normScheme(c.scheme),
        subject_code: normCode(c.subjectCode),
        subject_name: c.subjectName || '',
        seat_numbers: c.seatNumbers || [],
        first_seat:
          c.firstSeat ?? (c.seatNumbers && c.seatNumbers.length > 0 ? c.seatNumbers[0] : null),
        last_seat:
          c.lastSeat ??
          (c.seatNumbers && c.seatNumbers.length > 0
            ? c.seatNumbers[c.seatNumbers.length - 1]
            : null),
        assigned_count: c.assignedCount ?? (c.seatNumbers ? c.seatNumbers.length : 0),
        strength: c.strength || 40,
        supervisor_uid: c.supervisorUid || null,
        supervisor_name: c.supervisorName || null,
      }));
    }

    if (rows.length === 0) {
      return { success: false, error: 'No allocations to write.' };
    }

    const { error } = await supabase.from('block_allocations').insert(rows);
    if (error) throw error;

    revalidatePath('/exam-center/block-allocation');
    return {
      success: true,
      data: { created: rows.length, message: `Created ${rows.length} allocations` },
    };
  } catch (error) {
    console.error('Failed to bulk create block allocations:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function changeSupervisor(
  allocationId: string,
  supervisorUid: string,
  supervisorName?: string,
) {
  try {
    const examCenterId = await getExamCenterId();
    if (!examCenterId) return { success: false, error: 'Unauthorized' };

    const supabase = await createClient();

    let name = supervisorName;
    if (!name) {
      const { data: staff } = await supabase
        .from('staff')
        .select('name')
        .eq('exam_center_id', examCenterId)
        .eq('uid', supervisorUid)
        .maybeSingle();
      name = staff?.name || '';
    }

    const { data, error } = await supabase
      .from('block_allocations')
      .update({
        supervisor_uid: supervisorUid,
        supervisor_name: name,
        updated_at: new Date().toISOString(),
      })
      .eq('id', allocationId)
      .eq('exam_center_id', examCenterId)
      .select()
      .single();

    if (error) throw error;

    revalidatePath('/exam-center/block-allocation');
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to change supervisor',
    };
  }
}

export async function clearSupervisor(allocationId: string) {
  try {
    const examCenterId = await getExamCenterId();
    if (!examCenterId) return { success: false, error: 'Unauthorized' };

    const supabase = await createClient();
    const { data, error } = await supabase
      .from('block_allocations')
      .update({
        supervisor_uid: null,
        supervisor_name: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', allocationId)
      .eq('exam_center_id', examCenterId)
      .select()
      .single();

    if (error) throw error;

    revalidatePath('/exam-center/block-allocation');
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to clear supervisor',
    };
  }
}

export async function clearAllocationsForSession(date: Date | string, session: string) {
  try {
    const examCenterId = await getExamCenterId();
    if (!examCenterId) return { success: false, error: 'Unauthorized', data: [] };

    const dateStr =
      typeof date === 'string' ? date.split('T')[0] : date.toISOString().split('T')[0];
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('block_allocations')
      .delete()
      .eq('exam_center_id', examCenterId)
      .eq('date', dateStr)
      .eq('session', session)
      .select();

    if (error) throw error;

    revalidatePath('/exam-center/block-allocation');
    return { success: true, data: data || [] };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to clear allocations',
      data: [],
    };
  }
}

export async function clearAllAllocations(data?: { date?: Date | string; session?: string }) {
  try {
    const examCenterId = await getExamCenterId();
    if (!examCenterId) return { success: false, error: 'Unauthorized' };

    const supabase = await createClient();
    let query = supabase.from('block_allocations').delete().eq('exam_center_id', examCenterId);

    if (data?.date) {
      const dateStr =
        typeof data.date === 'string'
          ? data.date.split('T')[0]
          : data.date.toISOString().split('T')[0];
      query = query.eq('date', dateStr);
    }
    if (data?.session) {
      query = query.eq('session', data.session);
    }

    const { error } = await query;
    if (error) throw error;

    revalidatePath('/exam-center/block-allocation');
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to clear allocations',
    };
  }
}

export async function updateAllocation(data: {
  id: string;
  supervisorUid?: string | null;
  supervisorName?: string | null;
  seatNumbers?: number[];
  firstSeat?: number | null;
  lastSeat?: number | null;
  assignedCount?: number;
}) {
  try {
    const examCenterId = await getExamCenterId();
    if (!examCenterId) return { success: false, error: 'Unauthorized' };

    const supabase = await createClient();
    const updateObj: Record<string, any> = { updated_at: new Date().toISOString() };

    if (data.supervisorUid !== undefined) updateObj.supervisor_uid = data.supervisorUid;
    if (data.supervisorName !== undefined) updateObj.supervisor_name = data.supervisorName;
    if (data.seatNumbers !== undefined) updateObj.seat_numbers = data.seatNumbers;
    if (data.firstSeat !== undefined) updateObj.first_seat = data.firstSeat;
    if (data.lastSeat !== undefined) updateObj.last_seat = data.lastSeat;
    if (data.assignedCount !== undefined) updateObj.assigned_count = data.assignedCount;

    const { data: updated, error } = await supabase
      .from('block_allocations')
      .update(updateObj)
      .eq('id', data.id)
      .eq('exam_center_id', examCenterId)
      .select()
      .single();

    if (error) throw error;

    revalidatePath('/exam-center/block-allocation');
    return { success: true, data: updated };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update allocation',
    };
  }
}

export async function createOrder(data: {
  staffId: string;
  orderType: 'supervision' | 'reliever' | 'control_room' | 'oic';
  date?: Date | string;
  session?: string;
  orderKey?: string;
}) {
  try {
    const examCenterId = await getExamCenterId();
    if (!examCenterId) throw new Error('Unauthorized');

    const supabase = await createClient();
    const dateStr = data.date
      ? typeof data.date === 'string'
        ? data.date.split('T')[0]
        : data.date.toISOString().split('T')[0]
      : null;

    const { data: order, error } = await supabase
      .from('orders')
      .insert({
        exam_center_id: examCenterId,
        staff_id: data.staffId,
        order_type: data.orderType,
        date: dateStr,
        session: data.session || null,
        order_key: data.orderKey || null,
      })
      .select()
      .single();

    if (error) throw error;

    revalidatePath('/exam-center/automation/orders');
    return order;
  } catch (error) {
    console.error('Failed to create order:', error);
    throw error;
  }
}

export async function deleteOrder(id: string) {
  try {
    const examCenterId = await getExamCenterId();
    if (!examCenterId) throw new Error('Unauthorized');

    const supabase = await createClient();
    const { error } = await supabase
      .from('orders')
      .delete()
      .eq('id', id)
      .eq('exam_center_id', examCenterId);

    if (error) throw error;

    revalidatePath('/exam-center/automation/orders');
    return true;
  } catch (error) {
    console.error('Failed to delete order:', error);
    throw error;
  }
}
