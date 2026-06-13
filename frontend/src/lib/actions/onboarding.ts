// app/actions/onboarding.ts
'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';

import { and, desc, eq } from 'drizzle-orm';

import pricingPlans from '@/config/pricing.json';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { examCenters, orgMembers, organizations, payments, promoCodes } from '@/lib/db/schema';

async function getCurrentUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error('Unauthorized');
  return session.user;
}

async function getCurrentOrg() {
  const user = await getCurrentUser();
  const orgMember = await db.query.orgMembers.findFirst({
    where: eq(orgMembers.userId, user.id),
  });
  if (!orgMember) throw new Error('Organization not found');

  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, orgMember.orgId),
  });
  if (!org) throw new Error('Organization not found');

  return { org, userId: user.id, orgId: orgMember.orgId };
}

// Check onboarding status
export async function getOnboardingStatus() {
  try {
    const user = await getCurrentUser();

    const orgMember = await db.query.orgMembers.findFirst({
      where: eq(orgMembers.userId, user.id),
    });

    if (!orgMember) {
      return { status: 'needs_organization', data: null };
    }

    const organization = await db.query.organizations.findFirst({
      where: eq(organizations.id, orgMember.orgId),
    });

    if (!organization) {
      return { status: 'error', error: 'Organization not found' };
    }

    const examCenter = await db.query.examCenters.findFirst({
      where: eq(examCenters.orgId, organization.id),
    });

    const needsExamSetup =
      !examCenter || !examCenter.code || !examCenter.season || !examCenter.examYear || !examCenter.distCenterCode;

    if (needsExamSetup) {
      return {
        status: 'needs_exam_setup',
        data: { organization, existingCenter: examCenter || null },
      };
    }

    // Check subscription status - NO FREE PLAN
    const now = new Date();
    const hasActiveSubscription =
      organization.subscriptionExpiresAt && new Date(organization.subscriptionExpiresAt) > now;

    if (!hasActiveSubscription) {
      const lastPayment = await db.query.payments.findFirst({
        where: eq(payments.orgId, organization.id),
        orderBy: [desc(payments.createdAt)],
      });

      return {
        status: 'needs_subscription',
        data: { organization, examCenter, lastPayment },
        plans: pricingPlans,
      };
    }

    return {
      status: 'complete',
      data: { organization, examCenter },
    };
  } catch (error) {
    console.error('Error checking status:', error);
    return { status: 'error', error: 'Failed to check status' };
  }
}

// Check slug availability
export async function checkSlugAvailability(slug: string) {
  const existing = await db.query.organizations.findFirst({
    where: eq(organizations.slug, slug),
  });
  return { available: !existing };
}

// Create organization (starts with trial subscription)
export async function createOrganization(formData: FormData) {
  const user = await getCurrentUser();
  const name = formData.get('name') as string;
  const slug = formData.get('slug') as string;

  if (!name || !slug) return { error: 'Name and slug required' };

  const existing = await db.query.organizations.findFirst({
    where: eq(organizations.slug, slug),
  });
  if (existing) return { error: 'Slug already taken' };

  // Create organization with NO subscription - requires payment
  const [org] = await db
    .insert(organizations)
    .values({
      name,
      slug,
      ownerId: user.id,
      subscriptionTier: 'inactive', // No free tier
      subscriptionExpiresAt: null,
    })
    .returning();

  await db.insert(orgMembers).values({
    orgId: org.id,
    userId: user.id,
    role: 'owner',
    permissions: ['*'],
  });

  revalidatePath('/onboarding');
  return { success: true, organization: org };
}

// Create/Update exam center
export async function saveExamCenter(formData: FormData) {
  const user = await getCurrentUser();
  const orgId = formData.get('orgId') as string;
  const centerId = formData.get('centerId') as string;

  const data = {
    code: formData.get('code') as string,
    name: formData.get('name') as string,
    address: formData.get('address') as string,
    officerIncharge: formData.get('officerIncharge') as string,
    sealingSupervisor: formData.get('sealingSupervisor') as string,
    distCenterCode: formData.get('distCenterCode') as string,
    distCenterName: formData.get('distCenterName') as string,
    season: formData.get('season') as string,
    examYear: parseInt(formData.get('examYear') as string),
    orgId,
  };

  if (!data.code || !data.name || !data.season || !data.examYear || !data.distCenterCode) {
    return { error: 'All required fields must be filled' };
  }

  // Verify user belongs to org
  const member = await db.query.orgMembers.findFirst({
    where: and(eq(orgMembers.userId, user.id), eq(orgMembers.orgId, orgId)),
  });
  if (!member) return { error: 'Unauthorized' };

  let center;
  if (centerId) {
    const [updated] = await db
      .update(examCenters)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(examCenters.id, centerId))
      .returning();
    center = updated;
  } else {
    const [created] = await db.insert(examCenters).values(data).returning();
    center = created;
  }

  revalidatePath('/onboarding');
  return { success: true, examCenter: center };
}

// Check if promo code is available
export async function checkPromoAvailability() {
  try {
    const { orgId } = await getCurrentOrg();

    // Check if org already used a promo
    const existingPromoUse = await db.query.promoCodes.findFirst({
      where: eq(promoCodes.usedByOrgId, orgId),
    });

    if (existingPromoUse) {
      return { available: false, reason: 'Already used a promo code' };
    }

    return { available: true };
  } catch {
    return { available: false, reason: 'Unable to check promo availability' };
  }
}

// Validate promo code (doesn't apply it)
export async function validatePromoCode(code: string) {
  try {
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

// Get payment history
export async function getPaymentHistory() {
  try {
    const { orgId } = await getCurrentOrg();

    const history = await db.query.payments.findMany({
      where: eq(payments.orgId, orgId),
      orderBy: [desc(payments.createdAt)],
    });

    return { payments: history };
  } catch (error) {
    console.error('Failed to fetch payment history:', error);
    return { payments: [] };
  }
}

// Get current subscription details
// app/actions/onboarding.ts - Update getCurrentSubscription
export async function getCurrentSubscription() {
  try {
    const { org } = await getCurrentOrg();

    const isActive = org.subscriptionExpiresAt && new Date(org.subscriptionExpiresAt) > new Date();

    const lastPayment = await db.query.payments.findFirst({
      where: eq(payments.orgId, org.id),
      orderBy: [desc(payments.createdAt)],
    });

    // Determine plan name from last payment or tier
    let planName = '';
    if (lastPayment && lastPayment.planName) {
      planName = lastPayment.planName;
    } else {
      // Fallback mapping
      switch (org.subscriptionTier) {
        case 'enterprise':
          planName = 'Lifetime Access';
          break;
        case 'premium':
          planName = 'Premium Plan';
          break;
        case 'trial':
          planName = 'Trial Period';
          break;
        default:
          planName = 'Inactive';
      }
    }

    return {
      tier: org.subscriptionTier,
      planName: planName,
      expiresAt: org.subscriptionExpiresAt,
      isActive: isActive,
      lastPayment,
    };
  } catch (error) {
    console.error('Failed to fetch subscription:', error);
    return { tier: 'inactive', planName: 'Inactive', isActive: false };
  }
}

// Switch to a lower tier (e.g., after trial ends)
export async function downgradeSubscription(planId: string) {
  try {
    const { orgId } = await getCurrentOrg();

    const plan = pricingPlans.find(p => p.id === planId);
    if (!plan) {
      return { success: false, error: 'Invalid plan' };
    }

    const now = new Date();
    let expiresAt: Date | null = null;
    let tier = 'premium';

    switch (planId) {
      case 'semester_online':
        expiresAt = new Date(now.setMonth(now.getMonth() + 6));
        break;
      case '1year_online':
        expiresAt = new Date(now.setFullYear(now.getFullYear() + 1));
        break;
      case '5year_online':
        expiresAt = new Date(now.setFullYear(now.getFullYear() + 5));
        break;
      case 'lifetime_access':
        expiresAt = null;
        tier = 'enterprise';
        break;
      default:
        return { success: false, error: 'Invalid plan' };
    }

    await db
      .update(organizations)
      .set({
        subscriptionTier: tier,
        subscriptionExpiresAt: expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, orgId));

    revalidatePath('/settings/subscription');
    return { success: true };
  } catch (error) {
    console.error('Failed to downgrade subscription:', error);
    return { success: false, error: 'Failed to update subscription' };
  }
}

// Check if organization has active subscription
export async function hasActiveSubscription() {
  try {
    const { org } = await getCurrentOrg();

    const isActive =
      org.subscriptionExpiresAt &&
      new Date(org.subscriptionExpiresAt) > new Date() &&
      org.subscriptionTier !== 'inactive';

    return { hasActiveSubscription: isActive, tier: org.subscriptionTier };
  } catch {
    return { hasActiveSubscription: false, tier: 'inactive' };
  }
}
