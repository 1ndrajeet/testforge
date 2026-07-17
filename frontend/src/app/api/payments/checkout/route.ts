// app/api/payments/checkout/route.ts
import { NextRequest, NextResponse } from 'next/server';

// Import pricing plans dynamically
import pricingPlans from '@/config/pricing.json';
import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import Razorpay from 'razorpay';

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { organizations, orgMembers, payments, promoCodes } from '@/lib/db/schema';

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

// ============================================
// DYNAMIC PLAN CONFIGURATION
// ============================================

interface PlanConfig {
  id: string;
  amount: number;
  tier: string;
  durationDays: number | null;
}

/**
 * Build VALID_PLANS dynamically from pricing.json
 * Filters out disabled plans and maps to the format expected by the API
 */
function buildValidPlans(): PlanConfig[] {
  return pricingPlans
    .filter((plan: any) => !plan.disabled) // Exclude disabled plans
    .map((plan: any) => {
      // Determine tier based on plan id
      let tier = 'semester';
      let durationDays = 180;

      if (plan.id === 'lifetime_access') {
        tier = 'lifetime';
        durationDays = 10950; // 30 years (365 * 30)
      } else if (plan.id === '5years_online' || plan.id === '5year_online') {
        tier = '5year';
        durationDays = 1825; // 5 years
      } else if (plan.id === '1year_online') {
        tier = 'year';
        durationDays = 365; // 1 year
      } else if (plan.id === 'semester_online') {
        tier = 'semester';
        durationDays = 180; // ~6 months
      }

      return {
        id: plan.id,
        amount: plan.amount,
        tier,
        durationDays,
      };
    });
}

// Build the valid plans array
const VALID_PLANS = buildValidPlans();

// ============================================
// HELPERS
// ============================================

function getExpiry(durationDays: number | null): Date | null {
  if (durationDays === null) return null;
  const date = new Date();
  date.setDate(date.getDate() + durationDays);
  return date;
}

function generateReceiptId(prefix: string): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 6);
  return `${prefix}_${timestamp}_${random}`.slice(0, 40);
}

// ============================================
// MAIN API HANDLER
// ============================================

export async function POST(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
    } = body;

    // Get user's organization
    const orgMember = await db.query.orgMembers.findFirst({
      where: eq(orgMembers.userId, session.user.id),
    });
    if (!orgMember) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    // ============================================
    // CREATE ORDER
    // ============================================

    if (action === 'create') {
      // Handle trial promo separately
      if (promoCode) {
        const promo = await db.query.promoCodes.findFirst({
          where: eq(promoCodes.code, promoCode.toUpperCase()),
        });

        if (!promo || promo.isUsed) {
          return NextResponse.json({ error: 'Invalid promo code' }, { status: 400 });
        }

        if (promo.type === 'trial') {
          const order = await razorpay.orders.create({
            amount: promo.amount,
            currency: 'INR',
            receipt: generateReceiptId('trial'),
            notes: {
              orgId: orgMember.orgId,
              promoCodeId: promo.id,
              type: 'trial',
            },
          });

          await db.insert(payments).values({
            orgId: orgMember.orgId,
            planId: 'trial',
            planName: '30-Day Trial',
            amount: promo.amount,
            status: 'pending',
            promoCodeId: promo.id,
            razorpayOrderId: order.id,
          });

          return NextResponse.json({ order, isTrial: true });
        }
      }

      // ============================================
      // REGULAR PLAN VALIDATION (DYNAMIC)
      // ============================================

      // Find the plan in pricing.json by ID and amount
      const planFromConfig = pricingPlans.find(
        (p: any) => p.id === planId && p.amount === amount && !p.disabled,
      );

      if (!planFromConfig) {
        // Log the mismatch for debugging
        console.error('Plan validation failed:', {
          requestedPlanId: planId,
          requestedAmount: amount,
          availablePlans: pricingPlans
            .filter((p: any) => !p.disabled)
            .map((p: any) => ({ id: p.id, amount: p.amount })),
        });

        return NextResponse.json(
          {
            error: 'Invalid plan',
            details: `Plan ${planId} with amount ${amount} not found or disabled`,
          },
          { status: 400 },
        );
      }

      // Get the plan config for duration/tier mapping
      const planConfig = VALID_PLANS.find((p) => p.id === planId);
      if (!planConfig) {
        return NextResponse.json({ error: 'Plan configuration not found' }, { status: 400 });
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

      // Create Razorpay order
      const order = await razorpay.orders.create({
        amount: planConfig.amount,
        currency: 'INR',
        receipt: generateReceiptId('plan'),
        notes: {
          orgId: orgMember.orgId,
          planId: planConfig.id,
          type: 'subscription',
        },
      });

      // Store payment record
      await db.insert(payments).values({
        orgId: orgMember.orgId,
        planId: planConfig.id,
        planName:
          planFromConfig.title || planConfig.id.replace('_', ' ').replace('online', '').trim(),
        amount: planConfig.amount,
        status: 'pending',
        razorpayOrderId: order.id,
      });

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

    // ============================================
    // VERIFY PAYMENT
    // ============================================

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

      // ============================================
      // HANDLE TRIAL ACTIVATION
      // ============================================

      if (payment.planId === 'trial') {
        const promo = await db.query.promoCodes.findFirst({
          where: eq(promoCodes.id, payment.promoCodeId!),
        });

        if (promo) {
          await db
            .update(promoCodes)
            .set({
              isUsed: true,
              usedByOrgId: payment.orgId,
              usedAt: new Date(),
            })
            .where(eq(promoCodes.id, promo.id));
        }

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

        return NextResponse.json({
          success: true,
          isTrial: true,
          expiresAt: trialEnd,
        });
      }

      // ============================================
      // HANDLE REGULAR PLAN ACTIVATION
      // ============================================

      // Find plan config
      const planConfig = VALID_PLANS.find((p) => p.id === payment.planId);
      if (!planConfig) {
        return NextResponse.json({ error: 'Plan configuration not found' }, { status: 400 });
      }

      const expiresAt = getExpiry(planConfig.durationDays);

      // Update organization subscription
      await db
        .update(organizations)
        .set({
          subscriptionTier: planConfig.tier,
          subscriptionExpiresAt: expiresAt,
          trialStartedAt: null,
          trialEndsAt: null,
          updatedAt: new Date(),
        })
        .where(eq(organizations.id, payment.orgId));

      // Update payment with expiry
      await db
        .update(payments)
        .set({
          endDate: expiresAt,
        })
        .where(eq(payments.id, payment.id));

      return NextResponse.json({
        success: true,
        isTrial: false,
        expiresAt,
        plan: {
          id: planConfig.id,
          tier: planConfig.tier,
        },
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Payment error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
