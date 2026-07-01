// app/api/send-email/route.ts
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

import { eq } from 'drizzle-orm';
import { Resend } from 'resend';

import {
  canSendEmail,
  getEmailHistory,
  getGlobalUsage,
  getMonthlyUsage,
  getTodayUsage,
  getUsageStatsForCurrentCenter,
  logEmailSent,
} from '@/lib/actions/email-usage';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { examCenters, organizations, orgMembers } from '@/lib/db/schema';
import { logger } from '@/lib/misc/logger';

const resend = new Resend(process.env.RESEND_API_KEY);
const MODULE = 'send-email-api';

// ─── Types ────────────────────────────────────────────────────

interface EmailRecipient {
  email: string;
  name: string;
}

interface EmailRequest {
  recipients: EmailRecipient[];
  subject: string;
  html: string;
  from?: string;
  orderType?: string;
  orderKey?: string;
}

// ─── Session Helpers ─────────────────────────────────────────

async function getCurrentOrgAndExamCenter() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error('Unauthorized');

  const orgMember = await db.query.orgMembers.findFirst({
    where: eq(orgMembers.userId, session.user.id),
  });
  if (!orgMember) throw new Error('Organization not found');

  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, orgMember.orgId),
  });
  if (!org) throw new Error('Organization not found');

  const examCenter = await db.query.examCenters.findFirst({
    where: eq(examCenters.orgId, org.id),
  });

  return {
    org,
    examCenter,
    userId: session.user.id,
    orgId: orgMember.orgId,
  };
}

// ─── GET: Usage Stats ────────────────────────────────────────

export async function GET(request: Request) {
  try {
    const { examCenter, org } = await getCurrentOrgAndExamCenter();

    if (!examCenter) {
      return NextResponse.json({ error: 'Exam center not configured' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'current';

    let data;

    if (type === 'global') {
      data = await getGlobalUsage();
    } else if (type === 'history') {
      const limit = parseInt(searchParams.get('limit') || '50');
      const offset = parseInt(searchParams.get('offset') || '0');
      data = await getEmailHistory(examCenter.id, limit, offset);
    } else if (type === 'monthly') {
      data = await getMonthlyUsage();
    } else {
      data = await getUsageStatsForCurrentCenter();
    }

    return NextResponse.json({
      success: true,
      data,
      examCenter: {
        id: examCenter.id,
        code: examCenter.code,
        name: examCenter.name,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unauthorized';
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

// ─── POST: Send Emails with Tracking ────────────────────────

// app/api/send-email/route.ts - Complete POST handler

export async function POST(request: Request) {
  const MODULE_FN = `${MODULE}.POST`;

  try {
    const { org, examCenter, userId, orgId } = await getCurrentOrgAndExamCenter();

    if (!examCenter) {
      return NextResponse.json({ error: 'Exam center not configured' }, { status: 400 });
    }

    // Get the user's email for reply-to
    const session = await auth.api.getSession({ headers: await headers() });
    const userEmail = session?.user?.email;

    // Validate subscription
    if (org.subscriptionTier === 'inactive') {
      return NextResponse.json(
        { error: 'Email sending requires an active subscription' },
        { status: 403 },
      );
    }

    const body = await request.json();
    const {
      recipients,
      subject,
      html,
      from,
      orderType = 'supervision',
      orderKey,
    }: EmailRequest = body;

    // Validate request
    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return NextResponse.json({ error: 'At least one recipient is required' }, { status: 400 });
    }

    if (recipients.length > 200) {
      return NextResponse.json(
        { error: 'Maximum 200 recipients allowed per request' },
        { status: 400 },
      );
    }

    if (!subject) {
      return NextResponse.json({ error: 'Email subject is required' }, { status: 400 });
    }

    if (!html) {
      return NextResponse.json({ error: 'Email HTML content is required' }, { status: 400 });
    }

    // Check quota
    const quotaCheck = await canSendEmail(examCenter.id, recipients.length);
    if (!quotaCheck.allowed) {
      return NextResponse.json(
        {
          error: quotaCheck.reason,
          quota: {
            daily: quotaCheck.usage,
            monthly: quotaCheck.monthly,
          },
        },
        { status: 429 },
      );
    }

    // Validate emails
    const invalidEmails = recipients.filter(
      (r) => !r.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email),
    );

    if (invalidEmails.length > 0) {
      return NextResponse.json(
        {
          error: 'Invalid email addresses',
          invalid: invalidEmails.map((r) => r.email),
        },
        { status: 400 },
      );
    }

    // Send emails
    const fromEmail = from || process.env.EMAIL_FROM || 'noreply@testforge.tech';
    const replyToEmail = userEmail || process.env.REPLY_TO || 'support@testforge.tech'; // ← FIXED
    const results = [];
    const logs = [];

    for (const recipient of recipients) {
      try {
        const result = await resend.emails.send({
          from: fromEmail,
          replyTo: replyToEmail, // ← Now using valid email
          to: [recipient.email],
          subject: subject,
          html: html,
          headers: {
            'X-Entity-Ref-ID': `order-${Date.now()}-${recipient.email}`,
          },
        });

        const status = result.error ? 'failed' : 'sent';
        const errorMessage = result.error?.message || null;

        results.push({ recipient, success: !result.error, error: errorMessage });

        // Log the email
        const log = await logEmailSent({
          orgId,
          examCenterId: examCenter.id,
          userId,
          recipientEmail: recipient.email,
          recipientName: recipient.name,
          subject,
          orderType: orderType || 'supervision',
          orderKey: orderKey || null,
          status,
          errorMessage,
        });

        if (log) logs.push(log);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        results.push({ recipient, success: false, error: errorMessage });

        await logEmailSent({
          orgId,
          examCenterId: examCenter.id,
          userId,
          recipientEmail: recipient.email,
          recipientName: recipient.name,
          subject,
          orderType: orderType || 'supervision',
          orderKey: orderKey || null,
          status: 'failed',
          errorMessage,
        });
      }
    }

    const successful = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    logger.info(MODULE_FN, 'Email send completed', {
      orgId,
      examCenterId: examCenter.id,
      total: recipients.length,
      successful,
      failed,
      replyTo: replyToEmail,
    });

    return NextResponse.json({
      success: true,
      sent: successful,
      failed: failed,
      total: recipients.length,
      message: `Sent ${successful} of ${recipients.length} emails${failed > 0 ? ` (${failed} failed)` : ''}`,
      quota: {
        remaining: quotaCheck.usage?.remaining || 0,
        monthlyRemaining: quotaCheck.monthly?.remaining || 0,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to send emails';
    logger.error(MODULE_FN, 'Email send error', { error: message });
    return NextResponse.json({ error: message, success: false }, { status: 500 });
  }
}
