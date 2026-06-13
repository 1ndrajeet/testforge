// app/api/payments/checkout/route.ts
import { NextRequest, NextResponse } from 'next/server';

import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import Razorpay from 'razorpay';

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { orgMembers, organizations, payments, promoCodes } from '@/lib/db/schema';

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

// Valid plans
const VALID_PLANS = [
  { id: 'semester_online', amount: 289900, tier: 'premium', durationDays: 180 },
  { id: '1year_online', amount: 550000, tier: 'premium', durationDays: 365 },
  { id: '5year_online', amount: 2600000, tier: 'premium', durationDays: 1825 },
  { id: 'lifetime_access', amount: 3000000, tier: 'enterprise', durationDays: null },
];

function getExpiry(durationDays: number | null): Date | null {
  if (durationDays === null) return null;
  const date = new Date();
  date.setDate(date.getDate() + durationDays);
  return date;
}

// Helper to generate short unique receipt ID (max 40 chars)
function generateReceiptId(prefix: string): string {
  const timestamp = Date.now().toString(36); // Convert to base36 (shorter)
  const random = Math.random().toString(36).substring(2, 6);
  return `${prefix}_${timestamp}_${random}`.slice(0, 40);
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { action, planId, amount, razorpay_payment_id, razorpay_order_id, razorpay_signature, promoCode } = body;

    // Get user's organization
    const orgMember = await db.query.orgMembers.findFirst({
      where: eq(orgMembers.userId, session.user.id),
    });
    if (!orgMember) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    if (action === 'create') {
      // Handle trial promo separately
      if (promoCode) {
        const promo = await db.query.promoCodes.findFirst({
          where: eq(promoCodes.code, promoCode.toUpperCase()),
        });

        if (!promo || promo.isUsed) {
          return NextResponse.json({ error: 'Invalid promo code' }, { status: 400 });
        }

        if (promo.type === 'trial_30day') {
          const order = await razorpay.orders.create({
            amount: promo.amount,
            currency: 'INR',
            receipt: generateReceiptId('trial'), // Fixed: uses helper
            notes: {
              orgId: orgMember.orgId,
              promoCodeId: promo.id,
              type: 'trial',
            },
          });

          await db.insert(payments).values({
            orgId: orgMember.orgId,
            planId: 'trial_30day',
            planName: '30-Day Trial',
            amount: promo.amount,
            status: 'pending',
            promoCodeId: promo.id,
            razorpayOrderId: order.id,
          });

          return NextResponse.json({ order, isTrial: true });
        }
      }

      // Regular plan validation
      const plan = VALID_PLANS.find(p => p.id === planId && p.amount === amount);
      if (!plan) {
        return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
      }

      // Check if organization already has active subscription
      const org = await db.query.organizations.findFirst({
        where: eq(organizations.id, orgMember.orgId),
      });

      const hasActiveSubscription =
        org?.subscriptionExpiresAt &&
        new Date(org.subscriptionExpiresAt) > new Date() &&
        org.subscriptionTier !== 'trial';

      if (hasActiveSubscription) {
        return NextResponse.json({ error: 'Active subscription exists' }, { status: 403 });
      }

      const order = await razorpay.orders.create({
        amount: plan.amount,
        currency: 'INR',
        receipt: generateReceiptId('plan'), // Fixed: uses helper
        notes: {
          orgId: orgMember.orgId,
          planId: plan.id,
          type: 'subscription',
        },
      });

      await db.insert(payments).values({
        orgId: orgMember.orgId,
        planId: plan.id,
        planName: plan.id.replace('_', ' ').replace('online', '').trim(),
        amount: plan.amount,
        status: 'pending',
        razorpayOrderId: order.id,
      });

      return NextResponse.json({ order, isTrial: false });
    }

    if (action === 'verify') {
      // Verify signature
      const generatedSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest('hex');

      if (generatedSignature !== razorpay_signature) {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
      }

      // Get pending payment
      const payment = await db.query.payments.findFirst({
        where: eq(payments.razorpayOrderId, razorpay_order_id),
      });

      if (!payment) {
        return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
      }

      // Update payment status
      await db
        .update(payments)
        .set({
          status: 'paid',
          razorpayPaymentId: razorpay_payment_id,
          startDate: new Date(),
        })
        .where(eq(payments.id, payment.id));

      // Handle trial activation
      if (payment.planId === 'trial_30day') {
        const promo = await db.query.promoCodes.findFirst({
          where: eq(promoCodes.id, payment.promoCodeId!),
        });

        if (promo) {
          // Mark promo as used
          await db
            .update(promoCodes)
            .set({
              isUsed: true,
              usedByOrgId: payment.orgId,
              usedAt: new Date(),
            })
            .where(eq(promoCodes.id, promo.id));
        }

        // Set trial subscription
        const trialEnd = new Date();
        trialEnd.setDate(trialEnd.getDate() + 30);

        await db
          .update(organizations)
          .set({
            subscriptionTier: 'trial',
            subscriptionExpiresAt: trialEnd,
            trialStartedAt: new Date(),
            trialEndsAt: trialEnd,
            updatedAt: new Date(),
          })
          .where(eq(organizations.id, payment.orgId));

        return NextResponse.json({ success: true, isTrial: true, expiresAt: trialEnd });
      }

      // Handle regular plan
      const plan = VALID_PLANS.find(p => p.id === payment.planId);
      if (!plan) {
        return NextResponse.json({ error: 'Plan not found' }, { status: 400 });
      }

      const expiresAt = getExpiry(plan.durationDays);

      await db
        .update(organizations)
        .set({
          subscriptionTier: plan.tier,
          subscriptionExpiresAt: expiresAt,
          trialStartedAt: null,
          trialEndsAt: null,
          updatedAt: new Date(),
        })
        .where(eq(organizations.id, payment.orgId));

      await db
        .update(payments)
        .set({
          endDate: expiresAt,
        })
        .where(eq(payments.id, payment.id));

      return NextResponse.json({ success: true, isTrial: false, expiresAt });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Payment error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
