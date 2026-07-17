// lib/actions/admin.ts

'use server';

import { revalidatePath } from 'next/cache';

import { and, count, desc, eq, gte, ilike, lte, or, sql, sum } from 'drizzle-orm';

import { db } from '@/lib/db';
import {
  auditLogs,
  blockAllocations,
  connectedInstitutes,
  emailLogs,
  eMarksheets,
  examCenters,
  orders,
  organizations,
  orgMembers,
  payments,
  promoCodes,
  qpInventory,
  staff,
  students,
  timetable,
  uploads,
  users,
} from '@/lib/db/schema';
import { logger } from '@/lib/misc/logger';
import { getCurrentUser } from '@/lib/session';

const MODULE = 'admin';

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) throw new Error('Unauthorized');
  const member = await db.query.orgMembers.findFirst({
    where: eq(orgMembers.userId, user.id),
  });
  if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
    throw new Error('Forbidden: Admin access required');
  }
  return { user, member };
}

// ============================================
// 1. SYSTEM OVERVIEW STATS
// ============================================

export async function getAdminStats() {
  try {
    await requireAdmin();
    const [
      totalOrgs,
      totalUsers,
      totalExamCenters,
      totalPayments,
      totalRevenue,
      monthlyRevenue,
      activeSubscriptions,
      trialOrgs,
      totalEmails,
      failedEmails,
      totalUploads,
      totalStudents,
      totalStaff,
      totalOrders,
      totalAllocations,
    ] = await Promise.all([
      db.select({ count: count() }).from(organizations),
      db.select({ count: count() }).from(users),
      db.select({ count: count() }).from(examCenters),
      db.select({ count: count() }).from(payments),
      db
        .select({ total: sum(payments.amount) })
        .from(payments)
        .where(eq(payments.status, 'paid')),
      db
        .select({ total: sum(payments.amount) })
        .from(payments)
        .where(
          and(
            eq(payments.status, 'paid'),
            gte(payments.createdAt, new Date(new Date().setDate(1))),
          ),
        ),
      db
        .select({ count: count() })
        .from(organizations)
        .where(
          and(
            or(
              eq(organizations.subscriptionTier, 'premium'),
              eq(organizations.subscriptionTier, 'enterprise'),
            ),
            sql`${organizations.subscriptionExpiresAt} > NOW()`,
          ),
        ),
      db
        .select({ count: count() })
        .from(organizations)
        .where(eq(organizations.subscriptionTier, 'trial')),
      db.select({ count: count() }).from(emailLogs),
      db.select({ count: count() }).from(emailLogs).where(eq(emailLogs.status, 'failed')),
      db.select({ count: count() }).from(uploads),
      db.select({ count: count() }).from(students).where(eq(students.isDeleted, false)),
      db.select({ count: count() }).from(staff).where(eq(staff.isDeleted, false)),
      db.select({ count: count() }).from(orders),
      db.select({ count: count() }).from(blockAllocations),
    ]);

    return {
      success: true,
      data: {
        totalOrgs: Number(totalOrgs[0]?.count || 0),
        totalUsers: Number(totalUsers[0]?.count || 0),
        totalExamCenters: Number(totalExamCenters[0]?.count || 0),
        totalPayments: Number(totalPayments[0]?.count || 0),
        totalRevenue: Number(totalRevenue[0]?.total || 0),
        monthlyRevenue: Number(monthlyRevenue[0]?.total || 0),
        activeSubscriptions: Number(activeSubscriptions[0]?.count || 0),
        trialOrgs: Number(trialOrgs[0]?.count || 0),
        totalEmails: Number(totalEmails[0]?.count || 0),
        failedEmails: Number(failedEmails[0]?.count || 0),
        totalUploads: Number(totalUploads[0]?.count || 0),
        totalStudents: Number(totalStudents[0]?.count || 0),
        totalStaff: Number(totalStaff[0]?.count || 0),
        totalOrders: Number(totalOrders[0]?.count || 0),
        totalAllocations: Number(totalAllocations[0]?.count || 0),
      },
    };
  } catch (error) {
    logger.error(MODULE, 'Failed to get admin stats', { error });
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// ============================================
// 2. ORGANIZATION MANAGEMENT
// ============================================

export async function getOrganizations(params?: {
  search?: string;
  tier?: string;
  limit?: number;
  offset?: number;
}) {
  try {
    await requireAdmin();

    const conditions = [];
    if (params?.search) {
      conditions.push(
        or(
          ilike(organizations.name, `%${params.search}%`),
          ilike(organizations.slug, `%${params.search}%`),
        ),
      );
    }
    if (params?.tier && params.tier !== 'all') {
      conditions.push(eq(organizations.subscriptionTier, params.tier));
    }

    const [orgs, total] = await Promise.all([
      db.query.organizations.findMany({
        where: conditions.length ? and(...conditions) : undefined,
        orderBy: [desc(organizations.createdAt)],
        limit: params?.limit || 50,
        offset: params?.offset || 0,
      }),
      db
        .select({ count: count() })
        .from(organizations)
        .where(conditions.length ? and(...conditions) : undefined),
    ]);

    const orgsWithCounts = await Promise.all(
      orgs.map(async (org) => {
        const [examCenterCount, userCount, paymentCount] = await Promise.all([
          db.select({ count: count() }).from(examCenters).where(eq(examCenters.orgId, org.id)),
          db.select({ count: count() }).from(orgMembers).where(eq(orgMembers.orgId, org.id)),
          db.select({ count: count() }).from(payments).where(eq(payments.orgId, org.id)),
        ]);
        return {
          ...org,
          examCenterCount: Number(examCenterCount[0]?.count || 0),
          userCount: Number(userCount[0]?.count || 0),
          paymentCount: Number(paymentCount[0]?.count || 0),
        };
      }),
    );

    return {
      success: true,
      data: orgsWithCounts,
      total: Number(total[0]?.count || 0),
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
    const org = await db.query.organizations.findFirst({
      where: eq(organizations.id, id),
    });
    if (!org) return { success: false, error: 'Organization not found' };

    // Fetch members separately
    const members = await db.query.orgMembers.findMany({
      where: eq(orgMembers.orgId, org.id),
    });
    // Fetch users for members
    const userIds = members.map((m) => m.userId);
    let usersList: any[] = [];
    if (userIds.length) {
      usersList = await db.query.users.findMany({
        where: (users, { inArray }) => inArray(users.id, userIds),
      });
    }
    const memberUsers = members.map((member) => ({
      ...member,
      user: usersList.find((u) => u.id === member.userId) || null,
    }));

    const examCenter = await db.query.examCenters.findFirst({
      where: eq(examCenters.orgId, org.id),
    });
    const paymentsList = await db.query.payments.findMany({
      where: eq(payments.orgId, org.id),
      orderBy: [desc(payments.createdAt)],
      limit: 20,
    });

    return {
      success: true,
      data: {
        ...org,
        members: memberUsers,
        examCenter,
        payments: paymentsList,
      },
    };
  } catch (error) {
    logger.error(MODULE, 'Failed to get organization by id', { error });
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
  try {
    await requireAdmin();
    const [updated] = await db
      .update(organizations)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(organizations.id, id))
      .returning();
    revalidatePath('/exam-center/admin');
    return { success: true, data: updated };
  } catch (error) {
    logger.error(MODULE, 'Failed to update organization', { error });
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function deleteOrganization(id: string) {
  try {
    await requireAdmin();
    const [deleted] = await db
      .update(organizations)
      .set({
        subscriptionTier: 'inactive',
        subscriptionExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, id))
      .returning();
    revalidatePath('/exam-center/admin');
    return { success: true, data: deleted };
  } catch (error) {
    logger.error(MODULE, 'Failed to delete organization', { error });
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// ============================================
// 3. USER MANAGEMENT
// ============================================

export async function getUsers(params?: {
  search?: string;
  role?: string;
  limit?: number;
  offset?: number;
}) {
  try {
    await requireAdmin();
    const conditions = [];
    if (params?.search) {
      conditions.push(
        or(ilike(users.name, `%${params.search}%`), ilike(users.email, `%${params.search}%`)),
      );
    }

    const [userList, total] = await Promise.all([
      db.query.users.findMany({
        where: conditions.length ? and(...conditions) : undefined,
        orderBy: [desc(users.createdAt)],
        limit: params?.limit || 50,
        offset: params?.offset || 0,
      }),
      db
        .select({ count: count() })
        .from(users)
        .where(conditions.length ? and(...conditions) : undefined),
    ]);

    // Fetch org membership for each user
    const usersWithOrgs = await Promise.all(
      userList.map(async (user) => {
        const member = await db.query.orgMembers.findFirst({
          where: eq(orgMembers.userId, user.id),
        });
        let org = null;
        if (member) {
          org = await db.query.organizations.findFirst({
            where: eq(organizations.id, member.orgId),
            columns: { id: true, name: true },
          });
        }
        return {
          ...user,
          role: member?.role || null,
          organization: org,
          orgId: member?.orgId || null,
        };
      }),
    );

    return {
      success: true,
      data: usersWithOrgs,
      total: Number(total[0]?.count || 0),
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

export async function updateUserRole(userId: string, role: 'owner' | 'admin' | 'member') {
  try {
    await requireAdmin();
    const [updated] = await db
      .update(orgMembers)
      .set({ role, updatedAt: new Date() })
      .where(eq(orgMembers.userId, userId))
      .returning();
    revalidatePath('/exam-center/admin');
    return { success: true, data: updated };
  } catch (error) {
    logger.error(MODULE, 'Failed to update user role', { error });
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function deleteUser(userId: string) {
  try {
    await requireAdmin();
    await db.delete(orgMembers).where(eq(orgMembers.userId, userId));
    const [deleted] = await db.delete(users).where(eq(users.id, userId)).returning();
    revalidatePath('/exam-center/admin');
    return { success: true, data: deleted };
  } catch (error) {
    logger.error(MODULE, 'Failed to delete user', { error });
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// ============================================
// 4. EMAIL LOGS
// ============================================

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
    const conditions = [];
    if (params?.status) conditions.push(eq(emailLogs.status, params.status));
    if (params?.search) {
      conditions.push(
        or(
          ilike(emailLogs.recipientEmail, `%${params.search}%`),
          ilike(emailLogs.subject, `%${params.search}%`),
        ),
      );
    }
    if (params?.fromDate) conditions.push(gte(emailLogs.sentAt, params.fromDate));
    if (params?.toDate) conditions.push(lte(emailLogs.sentAt, params.toDate));

    const [logs, total] = await Promise.all([
      db.query.emailLogs.findMany({
        where: conditions.length ? and(...conditions) : undefined,
        orderBy: [desc(emailLogs.sentAt)],
        limit: params?.limit || 50,
        offset: params?.offset || 0,
      }),
      db
        .select({ count: count() })
        .from(emailLogs)
        .where(conditions.length ? and(...conditions) : undefined),
    ]);

    // Fetch related data manually
    const logsWithDetails = await Promise.all(
      logs.map(async (log) => {
        const user = log.userId
          ? await db.query.users.findFirst({
              where: eq(users.id, log.userId),
              columns: { id: true, name: true, email: true },
            })
          : null;
        const examCenter = log.examCenterId
          ? await db.query.examCenters.findFirst({
              where: eq(examCenters.id, log.examCenterId),
              columns: { id: true, name: true, code: true },
            })
          : null;
        return { ...log, user, examCenter };
      }),
    );

    return {
      success: true,
      data: logsWithDetails,
      total: Number(total[0]?.count || 0),
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

// ============================================
// 5. PAYMENTS
// ============================================

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
    const conditions = [];
    if (params?.status) conditions.push(eq(payments.status, params.status));
    if (params?.search) {
      conditions.push(
        or(
          ilike(payments.planName, `%${params.search}%`),
          ilike(payments.razorpayPaymentId, `%${params.search}%`),
        ),
      );
    }
    if (params?.fromDate) conditions.push(gte(payments.createdAt, params.fromDate));
    if (params?.toDate) conditions.push(lte(payments.createdAt, params.toDate));

    const [paymentList, total] = await Promise.all([
      db.query.payments.findMany({
        where: conditions.length ? and(...conditions) : undefined,
        orderBy: [desc(payments.createdAt)],
        limit: params?.limit || 50,
        offset: params?.offset || 0,
      }),
      db
        .select({ count: count() })
        .from(payments)
        .where(conditions.length ? and(...conditions) : undefined),
    ]);

    // Fetch organization for each payment
    const paymentsWithOrg = await Promise.all(
      paymentList.map(async (payment) => {
        const org = payment.orgId
          ? await db.query.organizations.findFirst({
              where: eq(organizations.id, payment.orgId),
              columns: { id: true, name: true },
            })
          : null;
        return { ...payment, organization: org };
      }),
    );

    return {
      success: true,
      data: paymentsWithOrg,
      total: Number(total[0]?.count || 0),
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

// ============================================
// 6. AUDIT LOGS
// ============================================

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
    const conditions = [];
    if (params?.type) conditions.push(eq(auditLogs.entityType, params.type));
    if (params?.search) {
      conditions.push(
        or(
          ilike(auditLogs.action, `%${params.search}%`),
          ilike(auditLogs.entityType, `%${params.search}%`),
        ),
      );
    }
    if (params?.fromDate) conditions.push(gte(auditLogs.createdAt, params.fromDate));
    if (params?.toDate) conditions.push(lte(auditLogs.createdAt, params.toDate));

    const [logs, total] = await Promise.all([
      db.query.auditLogs.findMany({
        where: conditions.length ? and(...conditions) : undefined,
        orderBy: [desc(auditLogs.createdAt)],
        limit: params?.limit || 50,
        offset: params?.offset || 0,
      }),
      db
        .select({ count: count() })
        .from(auditLogs)
        .where(conditions.length ? and(...conditions) : undefined),
    ]);

    // Fetch user for each log
    const logsWithUser = await Promise.all(
      logs.map(async (log) => {
        const user = log.userId
          ? await db.query.users.findFirst({
              where: eq(users.id, log.userId),
              columns: { id: true, name: true, email: true },
            })
          : null;
        return { ...log, user };
      }),
    );

    return {
      success: true,
      data: logsWithUser,
      total: Number(total[0]?.count || 0),
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

// ============================================
// 7. PROMO CODES
// ============================================

export async function getPromoCodes() {
  try {
    await requireAdmin();
    const codes = await db.query.promoCodes.findMany({
      orderBy: [desc(promoCodes.createdAt)],
    });
    return { success: true, data: codes };
  } catch (error) {
    logger.error(MODULE, 'Failed to get promo codes', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      data: [],
    };
  }
}

export async function createPromoCode(data: {
  code: string;
  type: string;
  durationDays: number;
  amount: number;
  expiresAt?: Date;
}) {
  try {
    await requireAdmin();
    const [created] = await db
      .insert(promoCodes)
      .values({
        ...data,
        code: data.code.toUpperCase(),
        isUsed: false,
      })
      .returning();
    revalidatePath('/exam-center/admin');
    return { success: true, data: created };
  } catch (error) {
    logger.error(MODULE, 'Failed to create promo code', { error });
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function deletePromoCode(id: string) {
  try {
    await requireAdmin();
    const [deleted] = await db.delete(promoCodes).where(eq(promoCodes.id, id)).returning();
    revalidatePath('/exam-center/admin');
    return { success: true, data: deleted };
  } catch (error) {
    logger.error(MODULE, 'Failed to delete promo code', { error });
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// ============================================
// 8. BULK EMAIL RECIPIENTS
// ============================================

export async function getBulkEmailRecipients(params?: { orgIds?: string[]; roles?: string[] }) {
  try {
    await requireAdmin();
    const conditions = [];
    if (params?.orgIds?.length) {
      conditions.push(sql`${orgMembers.orgId} IN (${sql.join(params.orgIds, sql`, `)})`);
    }
    if (params?.roles?.length) {
      conditions.push(sql`${orgMembers.role} IN (${sql.join(params.roles, sql`, `)})`);
    }

    const recipients = await db
      .select({
        userId: orgMembers.userId,
        name: users.name,
        email: users.email,
        orgId: orgMembers.orgId,
        orgName: organizations.name,
        role: orgMembers.role,
      })
      .from(orgMembers)
      .leftJoin(users, eq(orgMembers.userId, users.id))
      .leftJoin(organizations, eq(orgMembers.orgId, organizations.id))
      .where(conditions.length ? and(...conditions) : undefined);

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

// ============================================
// 9. SYSTEM HEALTH CHECK
// ============================================

export async function getSystemHealth() {
  try {
    await requireAdmin();
    const checks = await Promise.allSettled([
      db.execute(sql`SELECT 1`),
      db
        .select({ count: count() })
        .from(emailLogs)
        .where(
          and(
            eq(emailLogs.status, 'failed'),
            gte(emailLogs.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000)),
          ),
        ),
      db
        .select({ count: count() })
        .from(uploads)
        .where(
          and(
            eq(uploads.status, 'PROCESSING'),
            gte(uploads.createdAt, new Date(Date.now() - 60 * 60 * 1000)),
          ),
        ),
    ]);

    const healthy = checks.every((c) => c.status === 'fulfilled');
    const emailFailures =
      checks[1].status === 'fulfilled' ? Number(checks[1].value[0]?.count || 0) : 0;
    const pendingUploads =
      checks[2].status === 'fulfilled' ? Number(checks[2].value[0]?.count || 0) : 0;

    const frontendHealth = await fetch(process.env.NEXT_PUBLIC_APP_URL + '/api/health')
      .then((res) => res.json())
      .then((data) => data.database === 'ok')
      .catch(() => false);

    return {
      success: true,
      data: {
        status: healthy && frontendHealth ? 'healthy' : 'degraded',
        database: checks[0].status === 'fulfilled' ? 'ok' : 'error',
        frontend: frontendHealth ? 'ok' : 'error',
        emailFailures24h: emailFailures,
        pendingUploads: pendingUploads,
        timestamp: new Date(),
      },
    };
  } catch (error) {
    logger.error(MODULE, 'Failed to get system health', { error });
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// ============================================
// 10. SYSTEM SETTINGS
// ============================================

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
    logger.error(MODULE, 'Failed to update system settings', { error });
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
