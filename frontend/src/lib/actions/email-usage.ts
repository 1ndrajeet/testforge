// lib/services/email-usage.ts
'use server';

import { startOfDay, subDays } from 'date-fns';
import { and, count, desc, eq, gte, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { emailLogs, examCenters } from '@/lib/db/schema';
import { logger } from '@/lib/misc/logger';
import { getCurrentExamCenter } from '@/lib/session';
import { DailyUsageStats, EmailLogEntry, GlobalUsageStats, MonthlyUsageStats } from '@/lib/types';

const MODULE = 'email-usage';

// ─── Constants ───────────────────────────────────────────────

const DAILY_LIMIT_PER_CENTER = 80;
const DAILY_LIMIT_GLOBAL = 100;
const MONTHLY_LIMIT_GLOBAL = 2900;

// ─── Core Functions ──────────────────────────────────────────

export async function logEmailSent(data: {
  orgId: string;
  examCenterId: string;
  userId: string;
  recipientEmail: string;
  recipientName?: string;
  subject: string;
  orderType: string;
  orderKey?: string | null;
  status: 'sent' | 'failed';
  errorMessage?: string | null;
}) {
  const MODULE_FN = `${MODULE}.logEmailSent`;

  try {
    const [log] = await db
      .insert(emailLogs)
      .values({
        orgId: data.orgId,
        examCenterId: data.examCenterId,
        userId: data.userId,
        recipientEmail: data.recipientEmail,
        recipientName: data.recipientName || null,
        subject: data.subject,
        orderType: data.orderType,
        orderKey: data.orderKey || null,
        status: data.status,
        errorMessage: data.errorMessage || null,
        sentAt: new Date(),
      })
      .returning();

    logger.info(MODULE_FN, 'Email logged', {
      orgId: data.orgId,
      examCenterId: data.examCenterId,
      status: data.status,
    });

    return log;
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to log email', { error });
    return null;
  }
}

// lib/services/email-usage.ts

export async function getTodayUsage(examCenterId: string): Promise<DailyUsageStats> {
  const MODULE_FN = `${MODULE}.getTodayUsage`;

  try {
    const today = startOfDay(new Date());

    // Count ALL emails (including failed) for total
    const result = await db
      .select({
        sent: sql<number>`COUNT(*) FILTER (WHERE status = 'sent')`,
        failed: sql<number>`COUNT(*) FILTER (WHERE status = 'failed')`,
        total: sql<number>`COUNT(*)`, // ← This counts ALL emails
      })
      .from(emailLogs)
      .where(and(eq(emailLogs.examCenterId, examCenterId), gte(emailLogs.sentAt, today)));

    const stats = result[0] || { sent: 0, failed: 0, total: 0 };
    const sent = Number(stats.sent) || 0;
    const failed = Number(stats.failed) || 0;
    const total = Number(stats.total) || 0; // ← This is the total including failed

    // Get exam center info
    const center = await db.query.examCenters.findFirst({
      where: eq(examCenters.id, examCenterId),
    });

    return {
      examCenterId,
      examCenterCode: center?.code || 'Unknown',
      examCenterName: center?.name || 'Unknown',
      sent: sent, // ← Count of successful sends
      failed: failed, // ← Count of failed sends
      total: total, // ← TOTAL including failed
      limit: DAILY_LIMIT_PER_CENTER,
      remaining: Math.max(0, DAILY_LIMIT_PER_CENTER - total), // ← Use total, not sent
      percentage: DAILY_LIMIT_PER_CENTER > 0 ? (total / DAILY_LIMIT_PER_CENTER) * 100 : 0,
      isOverLimit: total >= DAILY_LIMIT_PER_CENTER,
    };
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to get today usage', { error });
    return {
      examCenterId,
      examCenterCode: 'Unknown',
      examCenterName: 'Unknown',
      sent: 0,
      failed: 0,
      total: 0,
      limit: DAILY_LIMIT_PER_CENTER,
      remaining: DAILY_LIMIT_PER_CENTER,
      percentage: 0,
      isOverLimit: false,
    };
  }
}

// Also update getGlobalUsage similarly
export async function getGlobalUsage(): Promise<GlobalUsageStats> {
  const MODULE_FN = `${MODULE}.getGlobalUsage`;

  try {
    const today = startOfDay(new Date());

    const globalResult = await db
      .select({
        sent: sql<number>`COUNT(*) FILTER (WHERE status = 'sent')`,
        failed: sql<number>`COUNT(*) FILTER (WHERE status = 'failed')`,
        total: sql<number>`COUNT(*)`, // ← Count ALL emails
      })
      .from(emailLogs)
      .where(gte(emailLogs.sentAt, today));

    const global = globalResult[0] || { sent: 0, failed: 0, total: 0 };
    const sent = Number(global.sent) || 0;
    const failed = Number(global.failed) || 0;
    const total = Number(global.total) || 0;

    // Get per-center stats
    const centerStats = await db
      .select({
        examCenterId: emailLogs.examCenterId,
        code: examCenters.code,
        name: examCenters.name,
        sent: sql<number>`COUNT(*) FILTER (WHERE email_logs.status = 'sent')`,
        failed: sql<number>`COUNT(*) FILTER (WHERE email_logs.status = 'failed')`,
        total: sql<number>`COUNT(*)`, // ← Count ALL emails
      })
      .from(emailLogs)
      .leftJoin(examCenters, eq(emailLogs.examCenterId, examCenters.id))
      .where(gte(emailLogs.sentAt, today))
      .groupBy(emailLogs.examCenterId, examCenters.code, examCenters.name)
      .orderBy(desc(sql`COUNT(*)`));

    const centers: DailyUsageStats[] = centerStats.map(c => ({
      examCenterId: c.examCenterId,
      examCenterCode: c.code || 'Unknown',
      examCenterName: c.name || 'Unknown',
      sent: Number(c.sent) || 0,
      failed: Number(c.failed) || 0,
      total: Number(c.total) || 0,
      limit: DAILY_LIMIT_PER_CENTER,
      remaining: Math.max(0, DAILY_LIMIT_PER_CENTER - (Number(c.total) || 0)),
      percentage: DAILY_LIMIT_PER_CENTER > 0 ? ((Number(c.total) || 0) / DAILY_LIMIT_PER_CENTER) * 100 : 0,
      isOverLimit: (Number(c.total) || 0) >= DAILY_LIMIT_PER_CENTER,
    }));

    return {
      totalSent: sent,
      totalFailed: failed,
      total: total,
      limit: DAILY_LIMIT_GLOBAL,
      remaining: Math.max(0, DAILY_LIMIT_GLOBAL - total),
      percentage: DAILY_LIMIT_GLOBAL > 0 ? (total / DAILY_LIMIT_GLOBAL) * 100 : 0,
      isOverLimit: total >= DAILY_LIMIT_GLOBAL,
      centers,
    };
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to get global usage', { error });
    return {
      totalSent: 0,
      totalFailed: 0,
      total: 0,
      limit: DAILY_LIMIT_GLOBAL,
      remaining: DAILY_LIMIT_GLOBAL,
      percentage: 0,
      isOverLimit: false,
      centers: [],
    };
  }
}

export async function getMonthlyUsage(): Promise<MonthlyUsageStats> {
  const MODULE_FN = `${MODULE}.getMonthlyUsage`;

  try {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const result = await db
      .select({
        total: sql<number>`COUNT(*)`,
      })
      .from(emailLogs)
      .where(and(gte(emailLogs.sentAt, monthStart), eq(emailLogs.status, 'sent')));

    const total = Number(result[0]?.total) || 0;

    return {
      total,
      limit: MONTHLY_LIMIT_GLOBAL,
      remaining: Math.max(0, MONTHLY_LIMIT_GLOBAL - total),
      percentage: MONTHLY_LIMIT_GLOBAL > 0 ? (total / MONTHLY_LIMIT_GLOBAL) * 100 : 0,
    };
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to get monthly usage', { error });
    return { total: 0, limit: MONTHLY_LIMIT_GLOBAL, remaining: MONTHLY_LIMIT_GLOBAL, percentage: 0 };
  }
}

export async function canSendEmail(
  examCenterId: string,
  count: number = 1
): Promise<{ allowed: boolean; reason?: string; usage?: DailyUsageStats; monthly?: MonthlyUsageStats }> {
  const MODULE_FN = `${MODULE}.canSendEmail`;

  try {
    // Check monthly usage first
    const monthly = await getMonthlyUsage();
    if (monthly.remaining < count) {
      return {
        allowed: false,
        reason: `Monthly limit of ${MONTHLY_LIMIT_GLOBAL} emails reached. Please try again next month.`,
        monthly,
      };
    }

    // Check global daily usage
    const global = await getGlobalUsage();
    if (global.isOverLimit) {
      return {
        allowed: false,
        reason: `Global daily limit of ${DAILY_LIMIT_GLOBAL} emails reached. Please try again tomorrow.`,
        monthly,
      };
    }

    if (global.remaining < count) {
      return {
        allowed: false,
        reason: `Only ${global.remaining} emails remaining globally today. You requested ${count}.`,
        monthly,
      };
    }

    // Check per-center usage
    const usage = await getTodayUsage(examCenterId);
    if (usage.isOverLimit) {
      return {
        allowed: false,
        reason: `Your exam center has reached the daily limit of ${DAILY_LIMIT_PER_CENTER} emails.`,
        usage,
        monthly,
      };
    }

    if (usage.remaining < count) {
      return {
        allowed: false,
        reason: `Only ${usage.remaining} emails remaining for your center today. You requested ${count}.`,
        usage,
        monthly,
      };
    }

    return { allowed: true, usage, monthly };
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to check email quota', { error });
    return { allowed: true };
  }
}

export async function getEmailHistory(
  examCenterId: string,
  limit: number = 50,
  offset: number = 0
): Promise<{ logs: EmailLogEntry[]; total: number }> {
  const MODULE_FN = `${MODULE}.getEmailHistory`;

  try {
    const [logs, totalResult] = await Promise.all([
      db
        .select()
        .from(emailLogs)
        .where(eq(emailLogs.examCenterId, examCenterId))
        .orderBy(desc(emailLogs.sentAt))
        .limit(limit)
        .offset(offset),
      db.select({ count: count() }).from(emailLogs).where(eq(emailLogs.examCenterId, examCenterId)),
    ]);

    return {
      logs: logs as EmailLogEntry[],
      total: Number(totalResult[0]?.count) || 0,
    };
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to get email history', { error });
    return { logs: [], total: 0 };
  }
}

export async function getUsageStatsForCurrentCenter(): Promise<{
  daily: DailyUsageStats;
  monthly: MonthlyUsageStats;
  global: GlobalUsageStats;
}> {
  const MODULE_FN = `${MODULE}.getUsageStatsForCurrentCenter`;

  try {
    const examCenter = await getCurrentExamCenter();
    if (!examCenter) {
      throw new Error('Exam center not found');
    }

    const [daily, monthly, global] = await Promise.all([
      getTodayUsage(examCenter.id),
      getMonthlyUsage(),
      getGlobalUsage(),
    ]);

    return { daily, monthly, global };
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to get usage stats', { error });
    throw error;
  }
}
