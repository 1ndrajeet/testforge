// app/api/payments/checkout/route.ts
import { NextRequest, NextResponse } from 'next/server';

import pricingPlans from '@/config/pricing.json';
import crypto from 'crypto';
import Razorpay from 'razorpay';

import { getUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

// ─────────────────────────────────────────────────────────────
// Razorpay — construct ONCE, validate env loudly
// ─────────────────────────────────────────────────────────────

const KEY_ID = process.env.RAZORPAY_KEY_ID?.trim() || '';
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET?.trim() || '';

if (!KEY_ID || !KEY_SECRET) {
  throw new Error(
    'Missing Razorpay env. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env.local (server-side, no NEXT_PUBLIC_ prefix).',
  );
}

const razorpay = new Razorpay({ key_id: KEY_ID, key_secret: KEY_SECRET });

// ─────────────────────────────────────────────────────────────
// Plan config
// ─────────────────────────────────────────────────────────────

interface PlanConfig {
  id: string;
  amount: number;
  title: string;
  tier: string;
  durationDays: number | null;
}

function buildValidPlans(): PlanConfig[] {
  return (pricingPlans as any[])
    .filter((plan) => !plan.disabled)
    .map((plan) => {
      let tier = 'semester';
      let durationDays: number | null = 180;

      if (plan.id === 'lifetime_access') {
        tier = 'lifetime';
        durationDays = 10950; // ~30 years
      } else if (plan.id === '5years_online' || plan.id === '5year_online') {
        tier = '5year';
        durationDays = 1825;
      } else if (plan.id === '1year_online') {
        tier = 'year';
        durationDays = 365;
      } else if (plan.id === 'semester_online') {
        tier = 'semester';
        durationDays = 180;
      }

      return {
        id: plan.id,
        amount: plan.amount,
        title: plan.title,
        tier,
        durationDays,
      };
    });
}

const VALID_PLANS = buildValidPlans();

function getExpiry(durationDays: number | null): Date | null {
  if (durationDays === null) return null;
  const d = new Date();
  d.setDate(d.getDate() + durationDays);
  return d;
}

function generateReceiptId(prefix: string): string {
  const ts = Date.now().toString(36);
  const rnd = Math.random().toString(36).substring(2, 6);
  return `${prefix}_${ts}_${rnd}`.slice(0, 40);
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

async function getExamCenterForUser(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
) {
  const { data, error } = await supabase
    .from('exam_centers')
    .select('*')
    .eq('owner_id', userId)
    .eq('is_active', true)
    .eq('is_deleted', false)
    .maybeSingle();
  if (error) throw new Error(`Failed to load exam center: ${error.message}`);
  return data;
}

// ─────────────────────────────────────────────────────────────
// Route
// ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createClient();
    const examCenter = await getExamCenterForUser(supabase, user.id);

    if (!examCenter) {
      return NextResponse.json({ error: 'Exam center not found' }, { status: 404 });
    }

    const body = await req.json();
    const {
      action,
      planId,
      amount,
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
      promoCode,
    } = body as Record<string, any>;

    // ═══════════════════════════════════════════════════════
    // CREATE ORDER
    // ═══════════════════════════════════════════════════════
    if (action === 'create') {
      // ─── Promo code path ────────────────────────────────
      if (promoCode) {
        const { data: promo, error: promoErr } = await supabase
          .from('promo_codes')
          .select('*')
          .eq('code', String(promoCode).toUpperCase())
          .maybeSingle();

        if (promoErr) throw promoErr;
        if (!promo) return NextResponse.json({ error: 'Invalid promo code' }, { status: 400 });
        if (promo.is_used)
          return NextResponse.json({ error: 'Promo code already used' }, { status: 400 });
        if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
          return NextResponse.json({ error: 'Promo code expired' }, { status: 400 });
        }

        // Only handle trial promos here; other promo types can be added later.
        if (promo.type !== 'trial') {
          return NextResponse.json({ error: 'Unsupported promo type' }, { status: 400 });
        }

        const order = await razorpay.orders.create({
          amount: promo.amount,
          currency: 'INR',
          receipt: generateReceiptId('trial'),
          notes: {
            examCenterId: examCenter.id,
            promoCodeId: promo.id,
            type: 'trial',
          },
        });

        const { error: insertErr } = await supabase.from('payments').insert({
          exam_center_id: examCenter.id,
          plan_id: 'trial',
          plan_name: `Trial — ${promo.code}`,
          amount: promo.amount,
          status: 'pending',
          promo_code_id: promo.id,
          razorpay_order_id: order.id,
        });

        if (insertErr) throw insertErr;

        return NextResponse.json({ order, isTrial: true });
      }

      // ─── Regular plan path ──────────────────────────────
      const planFromConfig = (pricingPlans as any[]).find(
        (p) => p.id === planId && p.amount === amount && !p.disabled,
      );

      if (!planFromConfig) {
        return NextResponse.json(
          { error: 'Invalid plan', details: `Plan ${planId} with amount ${amount} not found` },
          { status: 400 },
        );
      }

      const planConfig = VALID_PLANS.find((p) => p.id === planId);
      if (!planConfig) {
        return NextResponse.json({ error: 'Plan configuration not found' }, { status: 400 });
      }

      // Block if already active and not a trial
      const hasActiveSubscription =
        examCenter.subscription_expires_at &&
        new Date(examCenter.subscription_expires_at) > new Date() &&
        examCenter.subscription_tier !== 'trial';

      if (hasActiveSubscription) {
        return NextResponse.json({ error: 'Active subscription exists' }, { status: 403 });
      }

      const order = await razorpay.orders.create({
        amount: planConfig.amount,
        currency: 'INR',
        receipt: generateReceiptId('plan'),
        notes: {
          examCenterId: examCenter.id,
          planId: planConfig.id,
          type: 'subscription',
        },
      });

      const { error: insertErr } = await supabase.from('payments').insert({
        exam_center_id: examCenter.id,
        plan_id: planConfig.id,
        plan_name: planFromConfig.title || planConfig.id.replace(/_/g, ' '),
        amount: planConfig.amount,
        status: 'pending',
        razorpay_order_id: order.id,
      });

      if (insertErr) throw insertErr;

      return NextResponse.json({
        order,
        isTrial: false,
        plan: {
          id: planConfig.id,
          tier: planConfig.tier,
          durationDays: planConfig.durationDays,
        },
      });
    }

    // ═══════════════════════════════════════════════════════
    // VERIFY PAYMENT
    // ═══════════════════════════════════════════════════════
    if (action === 'verify') {
      if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        return NextResponse.json({ error: 'Missing payment fields' }, { status: 400 });
      }

      const expected = crypto
        .createHmac('sha256', KEY_SECRET)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest('hex');

      if (expected !== razorpay_signature) {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
      }

      const { data: payment, error: payErr } = await supabase
        .from('payments')
        .select('*')
        .eq('razorpay_order_id', razorpay_order_id)
        .maybeSingle();

      if (payErr) throw payErr;
      if (!payment) return NextResponse.json({ error: 'Payment not found' }, { status: 404 });

      // Idempotency: if already marked paid, return the same result
      if (payment.status === 'paid') {
        return NextResponse.json({ success: true, alreadyPaid: true });
      }

      const paidAt = new Date();

      // ─── TRIAL ──────────────────────────────────────────
      if (payment.plan_id === 'trial') {
        let durationDays = 30;
        if (payment.promo_code_id) {
          const { data: p } = await supabase
            .from('promo_codes')
            .select('duration_days')
            .eq('id', payment.promo_code_id)
            .maybeSingle();
          if (p) durationDays = p.duration_days ?? 30;
        }

        const trialEnd = new Date(paidAt.getTime() + durationDays * 86400_000);

        await supabase
          .from('payments')
          .update({
            status: 'paid',
            razorpay_payment_id,
            razorpay_signature,
            start_date: paidAt.toISOString(),
            end_date: trialEnd.toISOString(),
          })
          .eq('id', payment.id);

        if (payment.promo_code_id) {
          await supabase
            .from('promo_codes')
            .update({
              is_used: true,
              used_by_center_id: payment.exam_center_id,
              used_at: paidAt.toISOString(),
            })
            .eq('id', payment.promo_code_id);
        }

        await supabase
          .from('exam_centers')
          .update({
            subscription_tier: 'trial',
            subscription_expires_at: trialEnd.toISOString(),
            trial_started_at: paidAt.toISOString(),
            trial_ends_at: trialEnd.toISOString(),
          })
          .eq('id', payment.exam_center_id);

        return NextResponse.json({ success: true, isTrial: true, expiresAt: trialEnd });
      }

      // ─── REGULAR ────────────────────────────────────────
      const planConfig = VALID_PLANS.find((p) => p.id === payment.plan_id);
      if (!planConfig) {
        return NextResponse.json({ error: 'Plan configuration not found' }, { status: 400 });
      }

      const expiresAt = getExpiry(planConfig.durationDays);

      const { error: updPay } = await supabase
        .from('payments')
        .update({
          status: 'paid',
          razorpay_payment_id,
          razorpay_signature,
          start_date: paidAt.toISOString(),
          end_date: expiresAt ? expiresAt.toISOString() : null,
        })
        .eq('id', payment.id);
      if (updPay) throw updPay;

      const { error: updCenter } = await supabase
        .from('exam_centers')
        .update({
          subscription_tier: planConfig.tier,
          subscription_expires_at: expiresAt ? expiresAt.toISOString() : null,
          trial_started_at: null,
          trial_ends_at: null,
        })
        .eq('id', payment.exam_center_id);
      if (updCenter) throw updCenter;

      return NextResponse.json({
        success: true,
        isTrial: false,
        expiresAt,
        plan: { id: planConfig.id, tier: planConfig.tier },
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('[checkout] unhandled error', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
