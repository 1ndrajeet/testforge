// lib/actions/order.ts
'use server';

import { revalidatePath } from 'next/cache';

import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { orders } from '@/lib/db/schema';
import { getCurrentExamCenter } from '@/lib/session';

export async function getOrders(params?: { staffId?: string; orderType?: string; date?: Date }) {
  const examCenter = await getCurrentExamCenter();
  if (!examCenter?.id) throw new Error('Exam center not found');

  const conditions = [eq(orders.examCenterId, examCenter.id)];

  if (params?.staffId) {
    conditions.push(eq(orders.staffId, params.staffId));
  }
  if (params?.orderType) {
    conditions.push(eq(orders.orderType, params.orderType));
  }
  if (params?.date) {
    conditions.push(eq(orders.date, params.date));
  }

  return db.query.orders.findMany({
    where: and(...conditions),
    orderBy: (orders, { desc }) => [desc(orders.createdAt)],
    with: {
      staff: true,
    },
  });
}

export async function getOrderById(id: string) {
  const examCenter = await getCurrentExamCenter();
  if (!examCenter?.id) throw new Error('Exam center not found');

  return db.query.orders.findFirst({
    where: and(eq(orders.id, id), eq(orders.examCenterId, examCenter.id)),
    with: {
      staff: true,
    },
  });
}

export async function createOrder(data: {
  staffId: string;
  orderType: 'supervision' | 'reliever' | 'control_room' | 'oic';
  date?: Date;
  session?: string;
  orderKey?: string;
}) {
  const examCenter = await getCurrentExamCenter();
  if (!examCenter?.id) throw new Error('Exam center not found');

  const [order] = await db
    .insert(orders)
    .values({
      examCenterId: examCenter.id,
      ...data,
    })
    .returning();

  revalidatePath('/exam-center/automation/orders');
  return order;
}

export async function updateOrder(
  id: string,
  data: {
    sentAt?: Date;
    orderKey?: string;
  }
) {
  const examCenter = await getCurrentExamCenter();
  if (!examCenter?.id) throw new Error('Exam center not found');

  const [order] = await db
    .update(orders)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(orders.id, id), eq(orders.examCenterId, examCenter.id)))
    .returning();

  revalidatePath('/exam-center/automation/orders');
  return order;
}

export async function markOrderAsSent(id: string) {
  return updateOrder(id, { sentAt: new Date() });
}

export async function deleteOrder(id: string) {
  const examCenter = await getCurrentExamCenter();
  if (!examCenter?.id) throw new Error('Exam center not found');

  await db.delete(orders).where(and(eq(orders.id, id), eq(orders.examCenterId, examCenter.id)));

  revalidatePath('/exam-center/automation/orders');
}

export async function getOrdersByStaff(staffId: string) {
  return getOrders({ staffId });
}

export async function getOrdersByType(orderType: string) {
  return getOrders({ orderType });
}

export async function getOrdersForDate(date: Date) {
  return getOrders({ date });
}
