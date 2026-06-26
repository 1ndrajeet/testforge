// app/actions/promo.actions.ts
'use server';

import { headers } from 'next/headers';

import { eq } from 'drizzle-orm';
import Razorpay from 'razorpay';

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { orgMembers, organizations, payments, promoCodes } from '@/lib/db/schema';

async function getCurrentOrg() {
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

  return { org, userId: session.user.id, orgId: orgMember.orgId };
}

// Validate and apply promo code
export async function validatePromoCode(code: string) {
  try {
    const { orgId } = await getCurrentOrg();

    // Find promo code
    const promo = await db.query.promoCodes.findFirst({
      where: eq(promoCodes.code, code.toUpperCase()),
    });

    if (!promo) {
      return { valid: false, error: 'Invalid promo code' };
    }

    if (promo.isUsed) {
      return { valid: false, error: 'Promo code already used' };
    }

    if (promo.expiresAt && new Date(promo.expiresAt) < new Date()) {
      return { valid: false, error: 'Promo code expired' };
    }

    // Check if org already used a promo
    const existingPromoUse = await db.query.promoCodes.findFirst({
      where: eq(promoCodes.usedByOrgId, orgId),
    });

    if (existingPromoUse) {
      return { valid: false, error: 'Your organization has already used a promo code' };
    }

    return {
      valid: true,
      type: promo.type,
      durationDays: promo.durationDays,
      amount: promo.amount,
      promoId: promo.id,
    };
  } catch (error) {
    console.error('Promo validation error:', error);
    return { valid: false, error: 'Failed to validate promo code' };
  }
}

// Apply trial promo (creates ₹1 payment)
export async function applyTrialPromo(code: string) {
  try {
    const { orgId } = await getCurrentOrg();

    // Validate promo
    const validation = await validatePromoCode(code);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    if (validation.type !== 'trial_30day') {
      return { success: false, error: 'Invalid promo type for trial' };
    }

    // Create Razorpay order for ₹1
    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID!,
      key_secret: process.env.RAZORPAY_KEY_SECRET!,
    });

    const order = await razorpay.orders.create({
      amount: validation.amount, // ₹1 = 100 paise
      currency: 'INR',
      receipt: `trial_${Date.now()}`.slice(0, 40),
      notes: {
        orgId,
        promoCodeId: validation.promoId,
        type: 'trial',
      },
    });

    // Store payment record
    await db.insert(payments).values({
      orgId,
      planId: 'trial_30day',
      planName: '30-Day Trial',
      amount: validation.amount,
      status: 'pending',
      promoCodeId: validation.promoId,
      razorpayOrderId: order.id,
    });

    return {
      success: true,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
    };
  } catch (error) {
    console.error('Trial promo error:', error);
    return { success: false, error: 'Failed to process trial' };
  }
}
