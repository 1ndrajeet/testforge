'use server';

import { revalidatePath } from 'next/cache';

import { getExamCenterId } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';

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

    revalidatePath('/exam-center/automation');
    return order;
  } catch (error) {
    console.error('Failed to create order:', error);
    throw error;
  }
}

export async function updateOrder(
  id: string,
  data: {
    sentAt?: Date | string;
    orderKey?: string;
  },
) {
  try {
    const examCenterId = await getExamCenterId();
    if (!examCenterId) throw new Error('Unauthorized');

    const supabase = await createClient();
    const updateObj: Record<string, any> = { updated_at: new Date().toISOString() };

    if (data.sentAt !== undefined) {
      updateObj.sent_at = data.sentAt
        ? typeof data.sentAt === 'string'
          ? data.sentAt
          : data.sentAt.toISOString()
        : null;
    }
    if (data.orderKey !== undefined) updateObj.order_key = data.orderKey;

    const { data: order, error } = await supabase
      .from('orders')
      .update(updateObj)
      .eq('id', id)
      .eq('exam_center_id', examCenterId)
      .select()
      .single();

    if (error) throw error;

    revalidatePath('/exam-center/automation');
    return order;
  } catch (error) {
    console.error('Failed to update order:', error);
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

    revalidatePath('/exam-center/automation');
    return true;
  } catch (error) {
    console.error('Failed to delete order:', error);
    throw error;
  }
}

export async function logEmailSent(data: {
  examCenterId: string;
  userId: string;
  recipientEmail: string;
  recipientName?: string;
  subject: string;
  orderType: string;
  orderKey?: string | null;
  status: string;
  errorMessage?: string | null;
}) {
  try {
    const supabase = await createClient();
    const { data: log, error } = await supabase
      .from('email_logs')
      .insert({
        exam_center_id: data.examCenterId,
        user_id: data.userId,
        recipient_email: data.recipientEmail,
        recipient_name: data.recipientName || '',
        subject: data.subject,
        order_type: data.orderType,
        order_key: data.orderKey || null,
        status: data.status,
        error_message: data.errorMessage || null,
        sent_at: data.status === 'sent' ? new Date().toISOString() : null,
      })
      .select()
      .single();

    if (error) throw error;
    return log;
  } catch (error) {
    console.error('Failed to log email:', error);
    return null;
  }
}
