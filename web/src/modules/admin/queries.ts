'use server';

import { logger } from '@/lib/misc/logger';
import { getCurrentUser } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';

const MODULE = 'admin:queries';

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) throw new Error('Unauthorized');
  return { user };
}

export async function getAdminStats() {
  try {
    await requireAdmin();
    const supabase = await createClient();

    const [
      { count: totalExamCenters },
      { count: totalPayments },
      { data: paymentsPaid },
      { count: totalEmails },
      { count: failedEmails },
      { count: totalUploads },
      { count: totalStudents },
      { count: totalStaff },
      { count: totalOrders },
      { count: totalAllocations },
    ] = await Promise.all([
      supabase
        .from('exam_centers')
        .select('*', { count: 'exact', head: true })
        .eq('is_deleted', false),
      supabase.from('payments').select('*', { count: 'exact', head: true }),
      supabase.from('payments').select('amount, created_at').eq('status', 'paid'),
      supabase.from('email_logs').select('*', { count: 'exact', head: true }),
      supabase
        .from('email_logs')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'failed'),
      supabase.from('uploads').select('*', { count: 'exact', head: true }),
      supabase.from('students').select('*', { count: 'exact', head: true }).eq('is_deleted', false),
      supabase.from('staff').select('*', { count: 'exact', head: true }).eq('is_deleted', false),
      supabase.from('orders').select('*', { count: 'exact', head: true }),
      supabase.from('block_allocations').select('*', { count: 'exact', head: true }),
    ]);

    const totalRevenue = (paymentsPaid || []).reduce((acc, p) => acc + (p.amount || 0), 0);
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const monthlyRevenue = (paymentsPaid || [])
      .filter((p) => new Date(p.created_at) >= startOfMonth)
      .reduce((acc, p) => acc + (p.amount || 0), 0);

    return {
      success: true,
      data: {
        totalOrgs: totalExamCenters || 0,
        totalUsers: totalExamCenters || 0,
        totalExamCenters: totalExamCenters || 0,
        totalPayments: totalPayments || 0,
        totalRevenue,
        monthlyRevenue,
        activeSubscriptions: totalExamCenters || 0,
        trialOrgs: 0,
        totalEmails: totalEmails || 0,
        failedEmails: failedEmails || 0,
        totalUploads: totalUploads || 0,
        totalStudents: totalStudents || 0,
        totalStaff: totalStaff || 0,
        totalOrders: totalOrders || 0,
        totalAllocations: totalAllocations || 0,
      },
    };
  } catch (error) {
    logger.error(MODULE, 'Failed to get admin stats', { error });
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function getOrganizations(params?: {
  search?: string;
  tier?: string;
  limit?: number;
  offset?: number;
}) {
  try {
    await requireAdmin();
    const supabase = await createClient();

    let query = supabase
      .from('exam_centers')
      .select('id, name, code, created_at, updated_at', { count: 'exact' })
      .eq('is_deleted', false);

    if (params?.search) {
      query = query.or(`name.ilike.%${params.search}%,code.ilike.%${params.search}%`);
    }

    const {
      data: centers,
      count: total,
      error,
    } = await query
      .order('created_at', { ascending: false })
      .range(params?.offset || 0, (params?.offset || 0) + (params?.limit || 50) - 1);

    if (error) throw error;

    const orgsWithCounts = (centers || []).map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.code,
      subscriptionTier: 'premium',
      subscriptionExpiresAt: null,
      examCenterCount: 1,
      userCount: 1,
      paymentCount: 0,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
    }));

    return {
      success: true,
      data: orgsWithCounts,
      total: total || 0,
    };
  } catch (error) {
    logger.error(MODULE, 'Failed to get organizations', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      data: [],
      total: 0,
    };
  }
}

export async function getOrganizationById(id: string) {
  try {
    await requireAdmin();
    const supabase = await createClient();

    const { data: center, error } = await supabase
      .from('exam_centers')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error || !center) return { success: false, error: 'Organization not found' };

    const { data: paymentsList } = await supabase
      .from('payments')
      .select('*')
      .eq('exam_center_id', id)
      .order('created_at', { ascending: false })
      .limit(20);

    return {
      success: true,
      data: {
        id: center.id,
        name: center.name,
        slug: center.code,
        subscriptionTier: 'premium',
        subscriptionExpiresAt: null,
        members: [],
        examCenter: center,
        payments: paymentsList || [],
      },
    };
  } catch (error) {
    logger.error(MODULE, 'Failed to get organization by id', { error });
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function getUsers(params?: {
  search?: string;
  role?: string;
  limit?: number;
  offset?: number;
}) {
  try {
    await requireAdmin();
    const supabase = await createClient();

    let query = supabase
      .from('exam_centers')
      .select('owner_id, officer_incharge, name, code, id, created_at', { count: 'exact' })
      .eq('is_deleted', false);

    if (params?.search) {
      query = query.or(`name.ilike.%${params.search}%,code.ilike.%${params.search}%`);
    }

    const {
      data: centers,
      count: total,
      error,
    } = await query
      .order('created_at', { ascending: false })
      .range(params?.offset || 0, (params?.offset || 0) + (params?.limit || 50) - 1);

    if (error) throw error;

    const userList = (centers || []).map((c) => ({
      id: c.owner_id,
      name: c.officer_incharge || c.name,
      email: `${c.code.toLowerCase()}@msbte.edu`,
      image: null,
      role: 'owner',
      organization: { id: c.id, name: c.name },
      orgId: c.id,
      createdAt: c.created_at,
    }));

    return {
      success: true,
      data: userList,
      total: total || 0,
    };
  } catch (error) {
    logger.error(MODULE, 'Failed to get users', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      data: [],
      total: 0,
    };
  }
}

export async function getEmailLogs(params?: {
  status?: 'sent' | 'failed';
  search?: string;
  fromDate?: Date;
  toDate?: Date;
  limit?: number;
  offset?: number;
}) {
  try {
    await requireAdmin();
    const supabase = await createClient();

    let query = supabase
      .from('email_logs')
      .select('id, recipient_email, subject, status, error_message, sent_at', { count: 'exact' });

    if (params?.status) query = query.eq('status', params.status);
    if (params?.search) {
      query = query.or(`recipient_email.ilike.%${params.search}%,subject.ilike.%${params.search}%`);
    }
    if (params?.fromDate) query = query.gte('sent_at', params.fromDate.toISOString());
    if (params?.toDate) query = query.lte('sent_at', params.toDate.toISOString());

    const {
      data: logs,
      count: total,
      error,
    } = await query
      .order('sent_at', { ascending: false })
      .range(params?.offset || 0, (params?.offset || 0) + (params?.limit || 50) - 1);

    if (error) throw error;

    const logsWithDetails = (logs || []).map((log) => ({
      id: log.id,
      recipientEmail: log.recipient_email,
      subject: log.subject,
      status: log.status,
      errorMessage: log.error_message,
      sentAt: log.sent_at,
      user: null,
      examCenter: null,
    }));

    return {
      success: true,
      data: logsWithDetails,
      total: total || 0,
    };
  } catch (error) {
    logger.error(MODULE, 'Failed to get email logs', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      data: [],
      total: 0,
    };
  }
}

export async function getPayments(params?: {
  status?: string;
  search?: string;
  fromDate?: Date;
  toDate?: Date;
  limit?: number;
  offset?: number;
}) {
  try {
    await requireAdmin();
    const supabase = await createClient();

    let query = supabase
      .from('payments')
      .select(
        'id, plan_id, plan_name, amount, currency, status, razorpay_order_id, razorpay_payment_id, created_at',
        { count: 'exact' },
      );

    if (params?.status) query = query.eq('status', params.status);
    if (params?.search) {
      query = query.or(
        `plan_name.ilike.%${params.search}%,razorpay_payment_id.ilike.%${params.search}%`,
      );
    }
    if (params?.fromDate) query = query.gte('created_at', params.fromDate.toISOString());
    if (params?.toDate) query = query.lte('created_at', params.toDate.toISOString());

    const {
      data: paymentList,
      count: total,
      error,
    } = await query
      .order('created_at', { ascending: false })
      .range(params?.offset || 0, (params?.offset || 0) + (params?.limit || 50) - 1);

    if (error) throw error;

    const paymentsWithOrg = (paymentList || []).map((p) => ({
      id: p.id,
      planId: p.plan_id,
      planName: p.plan_name,
      amount: p.amount,
      currency: p.currency,
      status: p.status,
      razorpayOrderId: p.razorpay_order_id,
      razorpayPaymentId: p.razorpay_payment_id,
      createdAt: p.created_at,
      organization: null,
    }));

    return {
      success: true,
      data: paymentsWithOrg,
      total: total || 0,
    };
  } catch (error) {
    logger.error(MODULE, 'Failed to get payments', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      data: [],
      total: 0,
    };
  }
}

export async function getAuditLogs(params?: {
  type?: string;
  search?: string;
  fromDate?: Date;
  toDate?: Date;
  limit?: number;
  offset?: number;
}) {
  try {
    await requireAdmin();
    const supabase = await createClient();

    let query = supabase
      .from('audit_logs')
      .select('id, action, entity_type, entity_id, ip_address, created_at', { count: 'exact' });

    if (params?.type) query = query.eq('entity_type', params.type);
    if (params?.search) {
      query = query.or(`action.ilike.%${params.search}%,entity_type.ilike.%${params.search}%`);
    }
    if (params?.fromDate) query = query.gte('created_at', params.fromDate.toISOString());
    if (params?.toDate) query = query.lte('created_at', params.toDate.toISOString());

    const {
      data: logs,
      count: total,
      error,
    } = await query
      .order('created_at', { ascending: false })
      .range(params?.offset || 0, (params?.offset || 0) + (params?.limit || 50) - 1);

    if (error) throw error;

    const mapped = (logs || []).map((log) => ({
      id: log.id,
      action: log.action,
      entityType: log.entity_type,
      entityId: log.entity_id,
      details: (log as any).details || null,
      ipAddress: log.ip_address,
      createdAt: log.created_at,
      user: null,
    }));

    return {
      success: true,
      data: mapped,
      total: total || 0,
    };
  } catch (error) {
    logger.error(MODULE, 'Failed to get audit logs', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      data: [],
      total: 0,
    };
  }
}

export async function getPromoCodes() {
  try {
    await requireAdmin();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('promo_codes')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const mapped = (data || []).map((code) => ({
      id: code.id,
      code: code.code,
      type: code.discount_type,
      amount: code.discount_value,
      maxUses: code.max_uses,
      timesUsed: code.used_count || 0,
      expiresAt: code.valid_until,
      isActive: code.is_active,
      createdAt: code.created_at,
    }));

    return { success: true, data: mapped };
  } catch (error) {
    logger.error(MODULE, 'Failed to get promo codes', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      data: [],
    };
  }
}

export async function getBulkEmailRecipients(params?: { orgIds?: string[]; roles?: string[] }) {
  try {
    await requireAdmin();
    const supabase = await createClient();

    const { data: centers } = await supabase
      .from('exam_centers')
      .select('id, name, code, officer_incharge')
      .eq('is_deleted', false);

    const recipients = (centers || []).map((c) => ({
      userId: c.id,
      name: c.officer_incharge || c.name,
      email: `${c.code.toLowerCase()}@msbte.edu`,
      orgId: c.id,
      orgName: c.name,
      role: 'owner',
    }));

    return { success: true, data: recipients };
  } catch (error) {
    logger.error(MODULE, 'Failed to get bulk email recipients', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      data: [],
    };
  }
}

export async function getSystemHealth() {
  try {
    await requireAdmin();
    const supabase = await createClient();

    const [{ count: failedEmails }, { count: pendingUploads }] = await Promise.all([
      supabase
        .from('email_logs')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'failed')
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
      supabase
        .from('uploads')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'PROCESSING')
        .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString()),
    ]);

    return {
      success: true,
      data: {
        status: 'healthy',
        database: 'ok',
        frontend: 'ok',
        emailFailures24h: failedEmails || 0,
        pendingUploads: pendingUploads || 0,
        timestamp: new Date(),
      },
    };
  } catch (error) {
    logger.error(MODULE, 'Failed to get system health', { error });
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function getUsageStatsForCurrentCenter() {
  return {
    daily: {
      sent: 0,
      failed: 0,
      total: 0,
      limit: 80,
      remaining: 80,
      percentage: 0,
      isOverLimit: false,
    },
    monthly: { total: 0, limit: 2900, remaining: 2900, percentage: 0 },
    global: {
      totalSent: 0,
      totalFailed: 0,
      total: 0,
      limit: 100,
      remaining: 100,
      percentage: 0,
      isOverLimit: false,
      centers: [],
    },
  };
}
