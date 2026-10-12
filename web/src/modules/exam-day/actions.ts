'use server';

import { revalidatePath } from 'next/cache';

import { z } from 'zod';

import { logger } from '@/lib/misc/logger';
import { requireExamCenter } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';

const MODULE = 'exam-day:actions';

const MarkAbsentSchema = z.object({
  subjectCode: z.string().min(1),
  scheme: z.string().min(1),
  date: z.union([z.date(), z.string()]),
  session: z.enum(['Morning', 'Afternoon', 'All']),
  absentNumbers: z.array(z.number().int()),
});

const MarkCopyCaseSchema = z.object({
  subjectCode: z.string().min(1),
  scheme: z.string().min(1),
  date: z.union([z.date(), z.string()]),
  session: z.enum(['Morning', 'Afternoon', 'All']),
  cpsStudents: z.array(z.number().int()),
});

const UpdateInventorySchema = z.object({
  id: z.string(),
  receivedPackets: z.number().int().min(0),
  qpPerPacket: z.number().int().min(0),
});

const BulkUpdateInventorySchema = z.object({
  date: z.union([z.date(), z.string()]),
  records: z.array(
    z.object({
      id: z.string(),
      receivedPackets: z.number().int().min(0),
      qpPerPacket: z.number().int().min(0),
    }),
  ),
});

export async function markAbsent(data: z.infer<typeof MarkAbsentSchema>) {
  const MODULE_FN = `${MODULE}.markAbsent`;

  try {
    const validated = MarkAbsentSchema.parse(data);
    const examCenter = await requireExamCenter();
    const supabase = await createClient();

    const dateStr =
      typeof validated.date === 'string'
        ? validated.date.split('T')[0]
        : validated.date.toISOString().split('T')[0];

    // Find the timetable entry
    let query = supabase
      .from('timetable')
      .select('id, absent_numbers')
      .eq('exam_center_id', examCenter.id)
      .eq('subject_code', validated.subjectCode)
      .eq('scheme', validated.scheme)
      .eq('date', dateStr);

    if (validated.session !== 'All') {
      query = query.eq('session', validated.session);
    }

    const { data: entries, error: findError } = await query.limit(1);

    if (findError) throw findError;
    if (!entries || entries.length === 0) {
      logger.warn(MODULE_FN, 'Timetable entry not found', {
        subjectCode: validated.subjectCode,
        scheme: validated.scheme,
        date: dateStr,
        session: validated.session,
      });
      return { success: false, error: 'Timetable entry not found' };
    }

    const entry = entries[0];
    const sortedAbsent = [...new Set(validated.absentNumbers)].sort((a, b) => a - b);

    const { data: updated, error: updateError } = await supabase
      .from('timetable')
      .update({
        absent_numbers: sortedAbsent,
        updated_at: new Date().toISOString(),
      })
      .eq('id', entry.id)
      .select()
      .single();

    if (updateError) throw updateError;

    logger.info(MODULE_FN, 'Absent students marked', {
      id: entry.id,
      count: sortedAbsent.length,
    });
    revalidatePath('/exam-center/exam-day/absent');
    revalidatePath('/exam-center/exam-setup/timetable');

    return { success: true, data: updated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn(MODULE_FN, 'Validation failed', { issues: error.issues });
      return { success: false, error: error.issues[0]?.message || 'Validation error' };
    }

    logger.error(MODULE_FN, 'Failed to mark absent students', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to mark absent students',
    };
  }
}

export async function markCopyCase(data: z.infer<typeof MarkCopyCaseSchema>) {
  const MODULE_FN = `${MODULE}.markCopyCase`;

  try {
    const validated = MarkCopyCaseSchema.parse(data);
    const examCenter = await requireExamCenter();
    const supabase = await createClient();

    const dateStr =
      typeof validated.date === 'string'
        ? validated.date.split('T')[0]
        : validated.date.toISOString().split('T')[0];

    // Find the timetable entry
    let query = supabase
      .from('timetable')
      .select('id, cps_students')
      .eq('exam_center_id', examCenter.id)
      .eq('subject_code', validated.subjectCode)
      .eq('scheme', validated.scheme)
      .eq('date', dateStr);

    if (validated.session !== 'All') {
      query = query.eq('session', validated.session);
    }

    const { data: entries, error: findError } = await query.limit(1);

    if (findError) throw findError;
    if (!entries || entries.length === 0) {
      logger.warn(MODULE_FN, 'Timetable entry not found', {
        subjectCode: validated.subjectCode,
        scheme: validated.scheme,
        date: dateStr,
        session: validated.session,
      });
      return { success: false, error: 'Timetable entry not found' };
    }

    const entry = entries[0];
    const sortedCps = [...new Set(validated.cpsStudents)].sort((a, b) => a - b);

    const { data: updated, error: updateError } = await supabase
      .from('timetable')
      .update({
        cps_students: sortedCps,
        updated_at: new Date().toISOString(),
      })
      .eq('id', entry.id)
      .select()
      .single();

    if (updateError) throw updateError;

    logger.info(MODULE_FN, 'Copy case students marked', {
      id: entry.id,
      count: sortedCps.length,
    });
    revalidatePath('/exam-center/exam-day/copy-case');
    revalidatePath('/exam-center/exam-day/absent');
    revalidatePath('/exam-center/exam-setup/timetable');

    return { success: true, data: updated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn(MODULE_FN, 'Validation failed', { issues: error.issues });
      return { success: false, error: error.issues[0]?.message || 'Validation error' };
    }

    logger.error(MODULE_FN, 'Failed to mark copy case students', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to mark copy case students',
    };
  }
}

export async function updateQPInventory(data: z.infer<typeof UpdateInventorySchema>) {
  const MODULE_FN = `${MODULE}.updateQPInventory`;

  try {
    const validated = UpdateInventorySchema.parse(data);
    const examCenter = await requireExamCenter();
    const supabase = await createClient();

    const { data: updated, error } = await supabase
      .from('qp_inventory')
      .update({
        received_packets: validated.receivedPackets,
        received_qps: validated.qpPerPacket,
        updated_at: new Date().toISOString(),
      })
      .eq('id', validated.id)
      .eq('exam_center_id', examCenter.id)
      .select()
      .single();

    if (error || !updated) {
      logger.warn(MODULE_FN, 'Inventory record not found or failed update', {
        id: validated.id,
        error,
      });
      return { success: false, error: 'Inventory record not found' };
    }

    logger.info(MODULE_FN, 'Inventory record updated', { id: validated.id });
    revalidatePath('/exam-center/exam-day/qp-accounting');

    return { success: true, data: updated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0]?.message || 'Validation error' };
    }

    logger.error(MODULE_FN, 'Failed to update inventory', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update inventory',
    };
  }
}

export async function bulkUpdateQPInventory(data: z.infer<typeof BulkUpdateInventorySchema>) {
  const MODULE_FN = `${MODULE}.bulkUpdateQPInventory`;

  try {
    const validated = BulkUpdateInventorySchema.parse(data);
    const examCenter = await requireExamCenter();
    const supabase = await createClient();

    const updatedRecords = [];

    for (const record of validated.records) {
      const { data: updated, error } = await supabase
        .from('qp_inventory')
        .update({
          received_packets: record.receivedPackets,
          received_qps: record.qpPerPacket,
          updated_at: new Date().toISOString(),
        })
        .eq('id', record.id)
        .eq('exam_center_id', examCenter.id)
        .select()
        .single();

      if (!error && updated) {
        updatedRecords.push(updated);
      }
    }

    revalidatePath('/exam-center/exam-day/qp-accounting');
    return { success: true, data: updatedRecords };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0]?.message || 'Validation error' };
    }

    logger.error(MODULE_FN, 'Failed to bulk update inventory', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to bulk update inventory',
    };
  }
}

export async function generateQPInventoryFromTimetable(date: Date | string, session?: string) {
  const MODULE_FN = `${MODULE}.generateQPInventoryFromTimetable`;

  try {
    const examCenter = await requireExamCenter();
    const supabase = await createClient();

    const dateStr =
      typeof date === 'string' ? date.split('T')[0] : date.toISOString().split('T')[0];

    let query = supabase
      .from('timetable')
      .select('exam_day, date, session, subject_code, total_students')
      .eq('exam_center_id', examCenter.id)
      .eq('date', dateStr);

    if (session && session !== 'All') {
      query = query.eq('session', session);
    }

    const { data: timetableEntries, error: ttError } = await query;
    if (ttError) throw ttError;

    if (!timetableEntries || timetableEntries.length === 0) {
      return { success: false, error: 'No timetable entries found for this date' };
    }

    // Delete existing inventory for this date
    let delQuery = supabase
      .from('qp_inventory')
      .delete()
      .eq('exam_center_id', examCenter.id)
      .eq('date', dateStr);

    if (session && session !== 'All') {
      delQuery = delQuery.eq('session', session);
    }

    const { error: delError } = await delQuery;
    if (delError) throw delError;

    // Generate inventory records from timetable
    const inventoryRecords = timetableEntries.map((entry) => ({
      exam_center_id: examCenter.id,
      date: entry.date,
      session: entry.session,
      subject_code: entry.subject_code,
      expected_students: entry.total_students || 0,
      expected_packets: Math.ceil((entry.total_students || 0) / 50),
      received_packets: 0,
      received_qps: 0,
      day: entry.exam_day || 1,
    }));

    const insertedRecords = [];
    const BATCH_SIZE = 100;
    for (let i = 0; i < inventoryRecords.length; i += BATCH_SIZE) {
      const batch = inventoryRecords.slice(i, i + BATCH_SIZE);
      const { data: inserted, error: insError } = await supabase
        .from('qp_inventory')
        .insert(batch)
        .select();

      if (insError) throw insError;
      if (inserted) insertedRecords.push(...inserted);
    }

    logger.info(MODULE_FN, `Generated ${insertedRecords.length} inventory records from timetable`, {
      examCenterId: examCenter.id,
      date: dateStr,
      session,
    });
    revalidatePath('/exam-center/exam-day/qp-accounting');

    return { success: true, data: insertedRecords };
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to generate inventory from timetable', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate inventory',
    };
  }
}
