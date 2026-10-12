'use server';

import { getExamCenterId } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { StaffMember } from '@/lib/types';

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

export async function getOrderById(id: string) {
  try {
    const examCenterId = await getExamCenterId();
    if (!examCenterId) throw new Error('Unauthorized');

    const supabase = await createClient();
    const { data: order, error } = await supabase
      .from('orders')
      .select('*, staff(*)')
      .eq('id', id)
      .eq('exam_center_id', examCenterId)
      .maybeSingle();

    if (error) throw error;
    return order;
  } catch (error) {
    console.error('Error fetching order by id:', error);
    return null;
  }
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

export async function getEmailHistory(limit = 50, offset = 0) {
  try {
    const examCenterId = await getExamCenterId();
    if (!examCenterId) return [];

    const supabase = await createClient();
    const { data, error } = await supabase
      .from('email_logs')
      .select(
        'id, exam_center_id, recipient_email, recipient_name, subject, order_type, order_key, status, error_message, sent_at, created_at',
      )
      .eq('exam_center_id', examCenterId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching email history:', error);
    return [];
  }
}
