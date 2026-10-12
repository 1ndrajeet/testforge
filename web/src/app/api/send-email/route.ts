import { NextResponse } from 'next/server';

import { Resend } from 'resend';

import { getUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

const resend = new Resend(process.env.RESEND_API_KEY || '');

interface EmailRecipient {
  email: string;
  name: string;
  subject?: string;
  html?: string;
}

interface EmailRequest {
  recipients: EmailRecipient[];
  subject: string;
  html: string;
  from?: string;
  orderType?: string;
  orderKey?: string;
}

const DAILY_LIMIT = 500;
const MONTHLY_LIMIT = 5000;
const CONCURRENCY = 5;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  errorCode?: string;
  errorKind: 'none' | 'permanent' | 'transient' | 'quota';
  attempts: number;
}

async function sendWithRetry(
  payload: Parameters<typeof resend.emails.send>[0],
): Promise<SendResult> {
  let last: any = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await resend.emails.send(payload);
      if (!r.error) {
        return { success: true, messageId: r.data?.id, errorKind: 'none', attempts: attempt };
      }
      last = r.error;
      const status = (r.error as any)?.statusCode ?? 0;
      const transient = status === 0 || status === 429 || status >= 500;
      if (!transient) {
        return {
          success: false,
          error: r.error.message,
          errorCode: (r.error as any).name,
          errorKind: status === 429 ? 'quota' : 'permanent',
          attempts: attempt,
        };
      }
    } catch (e) {
      last = e;
    }
    if (attempt < 3) {
      const delay = 400 * 2 ** (attempt - 1) + Math.random() * 200;
      await sleep(delay);
    }
  }
  return {
    success: false,
    error: last?.message ?? 'Failed after retries',
    errorCode: last?.name,
    errorKind: 'transient',
    attempts: 3,
  };
}

async function checkEmailQuota(supabase: any, examCenterId: string, count: number) {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const { count: dailyCount } = await supabase
    .from('email_logs')
    .select('*', { count: 'exact', head: true })
    .eq('exam_center_id', examCenterId)
    .gte('created_at', startOfDay);

  const { count: monthlyCount } = await supabase
    .from('email_logs')
    .select('*', { count: 'exact', head: true })
    .eq('exam_center_id', examCenterId)
    .gte('created_at', startOfMonth);

  const currentDaily = dailyCount || 0;
  const currentMonthly = monthlyCount || 0;

  if (currentDaily + count > DAILY_LIMIT) {
    return {
      allowed: false,
      reason: `Daily email limit (${DAILY_LIMIT}) exceeded. Used: ${currentDaily}`,
      usage: {
        used: currentDaily,
        limit: DAILY_LIMIT,
        remaining: Math.max(0, DAILY_LIMIT - currentDaily),
      },
      monthly: {
        used: currentMonthly,
        limit: MONTHLY_LIMIT,
        remaining: Math.max(0, MONTHLY_LIMIT - currentMonthly),
      },
    };
  }

  if (currentMonthly + count > MONTHLY_LIMIT) {
    return {
      allowed: false,
      reason: `Monthly email limit (${MONTHLY_LIMIT}) exceeded. Used: ${currentMonthly}`,
      usage: {
        used: currentDaily,
        limit: DAILY_LIMIT,
        remaining: Math.max(0, DAILY_LIMIT - currentDaily),
      },
      monthly: {
        used: currentMonthly,
        limit: MONTHLY_LIMIT,
        remaining: Math.max(0, MONTHLY_LIMIT - currentMonthly),
      },
    };
  }

  return {
    allowed: true,
    usage: { used: currentDaily, limit: DAILY_LIMIT, remaining: DAILY_LIMIT - currentDaily },
    monthly: {
      used: currentMonthly,
      limit: MONTHLY_LIMIT,
      remaining: MONTHLY_LIMIT - currentMonthly,
    },
  };
}

export async function GET(request: Request) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createClient();
    const { data: examCenter } = await supabase
      .from('exam_centers')
      .select('id, code, name')
      .eq('owner_id', user.id)
      .maybeSingle();

    if (!examCenter) {
      return NextResponse.json({ error: 'Exam center not configured' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'current';

    let data: any = null;

    if (type === 'history') {
      const limit = parseInt(searchParams.get('limit') || '50', 10);
      const offset = parseInt(searchParams.get('offset') || '0', 10);
      const { data: logs } = await supabase
        .from('email_logs')
        .select('*')
        .eq('exam_center_id', examCenter.id)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);
      data = logs || [];
    } else {
      const quota = await checkEmailQuota(supabase, examCenter.id, 0);
      data = {
        daily: quota.usage,
        monthly: quota.monthly,
      };
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

export async function POST(request: Request) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createClient();
    const { data: examCenter } = await supabase
      .from('exam_centers')
      .select('*')
      .eq('owner_id', user.id)
      .maybeSingle();

    if (!examCenter) {
      return NextResponse.json({ error: 'Exam center not configured' }, { status: 400 });
    }

    if (examCenter.subscription_tier === 'inactive') {
      return NextResponse.json(
        { error: 'Email sending requires an active subscription' },
        { status: 403 },
      );
    }

    const body: EmailRequest = await request.json();
    const { recipients, subject, html, from, orderType = 'supervision', orderKey } = body;

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

    // Per-recipient html falls back to the batch html; only require a fallback if none provided
    const hasPerRecipientHtml = recipients.every(
      (r) => typeof r.html === 'string' && r.html.length > 0,
    );
    if (!html && !hasPerRecipientHtml) {
      return NextResponse.json({ error: 'Email HTML content is required' }, { status: 400 });
    }

    const quotaCheck = await checkEmailQuota(supabase, examCenter.id, recipients.length);
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

    const fromEmail = from || process.env.EMAIL_FROM || 'noreply@testforge.tech';
    const replyToEmail = user.email || process.env.REPLY_TO || 'support@testforge.tech';

    const results: Array<{
      recipient: EmailRecipient;
      success: boolean;
      messageId?: string;
      error?: string;
      errorCode?: string;
      errorKind: SendResult['errorKind'];
      attempts: number;
    }> = [];

    // Send in parallel batches of CONCURRENCY
    for (let i = 0; i < recipients.length; i += CONCURRENCY) {
      const chunk = recipients.slice(i, i + CONCURRENCY);
      const chunkRes = await Promise.all(
        chunk.map(async (recipient) => {
          const r = await sendWithRetry({
            from: fromEmail,
            replyTo: replyToEmail,
            to: [recipient.email],
            subject: recipient.subject ?? subject,
            html: recipient.html ?? html,
            headers: {
              'X-Entity-Ref-ID': orderKey
                ? `order-${orderKey}-${recipient.email}`
                : `order-${Date.now()}-${recipient.email}`,
            },
          });
          return { recipient, ...r };
        }),
      );
      results.push(...chunkRes);
    }

    // Single batch insert of all logs
    const logRows = results.map((r) => ({
      exam_center_id: examCenter.id,
      user_id: user.id,
      recipient_email: r.recipient.email,
      recipient_name: r.recipient.name,
      subject: r.recipient.subject ?? subject,
      order_type: orderType,
      order_key: orderKey || null,
      status: r.success ? 'sent' : 'failed',
      error_message: r.error ?? null,
      sent_at: r.success ? new Date().toISOString() : null,
    }));

    const { error: logError } = await supabase.from('email_logs').insert(logRows);
    if (logError) {
      console.error('[send-email] Failed to write logs:', logError.message);
    }

    const successful = results.filter((r) => r.success).length;
    const failed = results.length - successful;

    return NextResponse.json({
      success: failed === 0,
      sent: successful,
      failed,
      total: recipients.length,
      failures: results
        .filter((r) => !r.success)
        .map((r) => ({
          email: r.recipient.email,
          name: r.recipient.name,
          error: r.error,
          errorCode: r.errorCode,
          errorKind: r.errorKind,
          attempts: r.attempts,
        })),
      message: `Sent ${successful} of ${recipients.length} emails${failed ? ` (${failed} failed)` : ''}`,
      quota: {
        remaining: quotaCheck.usage?.remaining || 0,
        monthlyRemaining: quotaCheck.monthly?.remaining || 0,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to send emails';
    return NextResponse.json({ error: message, success: false }, { status: 500 });
  }
}
