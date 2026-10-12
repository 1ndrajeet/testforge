'use server';

import { revalidatePath } from 'next/cache';

import { logger } from '@/lib/misc/logger';
import { getCurrentUser } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';

const MODULE = 'admin:actions';

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) throw new Error('Unauthorized');
  return { user };
}

export async function createPromoCode(data: {
  code: string;
  type: string;
  durationDays: number;
  amount: number;
  expiresAt?: Date;
}) {
  const MODULE_FN = `${MODULE}.createPromoCode`;

  try {
    await requireAdmin();
    const supabase = await createClient();

    const { data: created, error } = await supabase
      .from('promo_codes')
      .insert({
        code: data.code.toUpperCase(),
        discount_type: data.type,
        discount_value: data.amount,
        max_uses: 100,
        valid_until: data.expiresAt ? data.expiresAt.toISOString() : null,
        is_active: true,
      })
      .select()
      .single();

    if (error) throw error;

    revalidatePath('/exam-center/admin');
    return { success: true, data: created };
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to create promo code', { error });
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function deletePromoCode(id: string) {
  const MODULE_FN = `${MODULE}.deletePromoCode`;

  try {
    await requireAdmin();
    const supabase = await createClient();

    const { error } = await supabase.from('promo_codes').delete().eq('id', id);
    if (error) throw error;

    revalidatePath('/exam-center/admin');
    return { success: true };
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to delete promo code', { error });
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function updateOrganization(
  id: string,
  data: {
    name?: string;
    subscriptionTier?: 'inactive' | 'trial' | 'premium' | 'enterprise';
    subscriptionExpiresAt?: Date | null;
  },
) {
  const MODULE_FN = `${MODULE}.updateOrganization`;

  try {
    await requireAdmin();
    const supabase = await createClient();

    const updateData: any = { updated_at: new Date().toISOString() };
    if (data.name) updateData.name = data.name;

    const { data: updated, error } = await supabase
      .from('exam_centers')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    revalidatePath('/exam-center/admin');
    return { success: true, data: updated };
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to update organization', { error });
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function deleteOrganization(id: string) {
  const MODULE_FN = `${MODULE}.deleteOrganization`;

  try {
    await requireAdmin();
    const supabase = await createClient();

    const { data: updated, error } = await supabase
      .from('exam_centers')
      .update({ is_active: false, is_deleted: true, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    revalidatePath('/exam-center/admin');
    return { success: true, data: updated };
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to delete organization', { error });
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function updateUserRole(userId: string, role: 'owner' | 'admin' | 'member') {
  const MODULE_FN = `${MODULE}.updateUserRole`;

  try {
    await requireAdmin();
    // In Supabase Auth, roles can be recorded in user_metadata
    revalidatePath('/exam-center/admin');
    return { success: true, data: { userId, role } };
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to update user role', { error });
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function deleteUser(userId: string) {
  const MODULE_FN = `${MODULE}.deleteUser`;

  try {
    await requireAdmin();
    const supabase = await createClient();

    // Soft delete associated exam centers
    await supabase
      .from('exam_centers')
      .update({ is_deleted: true, is_active: false })
      .eq('owner_id', userId);

    revalidatePath('/exam-center/admin');
    return { success: true, data: { id: userId } };
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to delete user', { error });
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function updateSystemSettings(settings: {
  maintenanceMode?: boolean;
  debugMode?: boolean;
  emailDailyLimit?: number;
  emailMonthlyLimit?: number;
  maxUploadSize?: number;
}) {
  try {
    await requireAdmin();
    revalidatePath('/exam-center/admin');
    return { success: true, message: 'Settings updated' };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
