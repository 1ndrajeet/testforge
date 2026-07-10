'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';

import pricingPlans from '@/config/pricing.json';
import { and, desc, eq } from 'drizzle-orm';

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { examCenters, organizations, orgMembers, payments, promoCodes } from '@/lib/db/schema';

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

// Check onboarding status - COMPLETE CHECK BEFORE ANY INSERT
export async function getOnboardingStatus() {
  try {
    const user = await getCurrentUser();

    // Check if user is a member of any org
    const orgMember = await db.query.orgMembers.findFirst({
      where: eq(orgMembers.userId, user.id),
    });

    if (!orgMember) {
      return { 
        status: 'needs_organization', 
        data: null,
        plans: pricingPlans 
      };
    }

    // Get organization
    const organization = await db.query.organizations.findFirst({
      where: eq(organizations.id, orgMember.orgId),
    });

    if (!organization) {
      return { 
        status: 'needs_organization', 
        data: null,
        plans: pricingPlans 
      };
    }

    // Check if exam center exists
    const examCenter = await db.query.examCenters.findFirst({
      where: eq(examCenters.orgId, organization.id),
    });

    // If no exam center at all
    if (!examCenter) {
      return {
        status: 'needs_exam_setup',
        data: { 
          organization, 
          existingCenter: null 
        },
        plans: pricingPlans
      };
    }

    // Check if exam center has all required fields
    const needsExamSetup = 
      !examCenter.code ||
      !examCenter.season ||
      !examCenter.examYear ||
      !examCenter.distCenterCode ||
      !examCenter.name;

    if (needsExamSetup) {
      return {
        status: 'needs_exam_setup',
        data: { 
          organization, 
          existingCenter: examCenter 
        },
        plans: pricingPlans
      };
    }

    // Check subscription status
    const now = new Date();
    const hasActiveSubscription = 
      organization.subscriptionExpiresAt && 
      new Date(organization.subscriptionExpiresAt) > now &&
      organization.subscriptionTier !== 'inactive';

    if (!hasActiveSubscription) {
      const lastPayment = await db.query.payments.findFirst({
        where: eq(payments.orgId, organization.id),
        orderBy: [desc(payments.createdAt)],
      });

      return {
        status: 'needs_subscription',
        data: { 
          organization, 
          examCenter, 
          lastPayment 
        },
        plans: pricingPlans,
      };
    }

    // Everything is complete
    return {
      status: 'complete',
      data: { 
        organization, 
        examCenter 
      },
      plans: pricingPlans
    };
  } catch (error) {
    console.error('Error checking status:', error);
    return { 
      status: 'error', 
      error: 'Failed to check status',
      plans: pricingPlans 
    };
  }
}

// Check slug availability
export async function checkSlugAvailability(slug: string) {
  const existing = await db.query.organizations.findFirst({
    where: eq(organizations.slug, slug),
  });
  return { available: !existing };
}

// Create organization - ONLY IF NOT EXISTS
export async function createOrganization(formData: FormData) {
  try {
    const user = await getCurrentUser();
    const name = formData.get('name') as string;
    const slug = formData.get('slug') as string;

    if (!name || !slug) return { error: 'Name and slug required' };

    // Check if user already has an org
    const existingMember = await db.query.orgMembers.findFirst({
      where: eq(orgMembers.userId, user.id),
    });

    if (existingMember) {
      // User already has an org, get it
      const existingOrg = await db.query.organizations.findFirst({
        where: eq(organizations.id, existingMember.orgId),
      });
      if (existingOrg) {
        return { 
          success: true, 
          organization: existingOrg,
          message: 'Organization already exists' 
        };
      }
    }

    // Check slug availability
    const slugExists = await db.query.organizations.findFirst({
      where: eq(organizations.slug, slug),
    });
    if (slugExists) return { error: 'Slug already taken' };

    // Create organization
    const [org] = await db
      .insert(organizations)
      .values({
        name,
        slug,
        ownerId: user.id,
        subscriptionTier: 'inactive',
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
  } catch (error) {
    console.error('Error creating organization:', error);
    return { error: 'Failed to create organization' };
  }
}

// Save exam center - CHECK FIRST, UPDATE OR INSERT
export async function saveExamCenter(formData: FormData) {
  try {
    const user = await getCurrentUser();
    const orgId = formData.get('orgId') as string;

    // Build data object
    const data = {
      code: (formData.get('code') as string)?.trim() || '',
      name: (formData.get('name') as string)?.trim() || '',
      address: (formData.get('address') as string)?.trim() || '',
      officerIncharge: (formData.get('officerIncharge') as string)?.trim() || '',
      sealingSupervisor: (formData.get('sealingSupervisor') as string)?.trim() || '',
      distCenterCode: (formData.get('distCenterCode') as string)?.trim() || '',
      distCenterName: (formData.get('distCenterName') as string)?.trim() || '',
      season: (formData.get('season') as string)?.trim() || '',
      examYear: parseInt(formData.get('examYear') as string) || new Date().getFullYear(),
      orgId,
    };

    // Validate required fields
    if (!data.code || !data.name || !data.season || !data.examYear || !data.distCenterCode) {
      return { error: 'All required fields must be filled' };
    }

    // Verify user belongs to org
    const member = await db.query.orgMembers.findFirst({
      where: and(eq(orgMembers.userId, user.id), eq(orgMembers.orgId, orgId)),
    });
    if (!member) return { error: 'Unauthorized' };

    // CHECK IF EXAM CENTER ALREADY EXISTS
    const existingCenter = await db.query.examCenters.findFirst({
      where: eq(examCenters.orgId, orgId),
    });

    let center;

    if (existingCenter) {
      // UPDATE existing center
      const [updated] = await db
        .update(examCenters)
        .set({ 
          ...data, 
          updatedAt: new Date(),
        })
        .where(eq(examCenters.id, existingCenter.id))
        .returning();
      center = updated;
    } else {
      // INSERT new center
      const [created] = await db
        .insert(examCenters)
        .values(data)
        .returning();
      center = created;
    }

    revalidatePath('/onboarding');
    return { success: true, examCenter: center };
  } catch (error) {
    console.error('Error saving exam center:', error);
    return { error: 'Failed to save exam center' };
  }
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

// Apply trial promo
export async function applyTrialPromo(code: string) {
  try {
    const { orgId } = await getCurrentOrg();

    // Check if promo exists and is valid
    const promo = await db.query.promoCodes.findFirst({
      where: eq(promoCodes.code, code.toUpperCase()),
    });

    if (!promo) {
      return { success: false, error: 'Invalid promo code' };
    }

    if (promo.isUsed) {
      return { success: false, error: 'Promo code already used' };
    }

    if (promo.expiresAt && new Date(promo.expiresAt) < new Date()) {
      return { success: false, error: 'Promo code expired' };
    }

    // Mark promo as used
    await db
      .update(promoCodes)
      .set({
        isUsed: true,
        usedByOrgId: orgId,
        usedAt: new Date(),
      })
      .where(eq(promoCodes.id, promo.id));

    // Update organization subscription
    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setDate(expiresAt.getDate() + promo.durationDays);

    await db
      .update(organizations)
      .set({
        subscriptionTier: 'trial',
        subscriptionExpiresAt: expiresAt,
        trialStartedAt: now,
        trialEndsAt: expiresAt,
        updatedAt: now,
      })
      .where(eq(organizations.id, orgId));

    revalidatePath('/onboarding');
    return { 
      success: true, 
      message: 'Trial activated successfully',
      durationDays: promo.durationDays,
      amount: promo.amount,
    };
  } catch (error) {
    console.error('Error applying trial promo:', error);
    return { success: false, error: 'Failed to apply promo' };
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
export async function getCurrentSubscription() {
  try {
    const { org } = await getCurrentOrg();

    const isActive = org.subscriptionExpiresAt && new Date(org.subscriptionExpiresAt) > new Date();

    const lastPayment = await db.query.payments.findFirst({
      where: eq(payments.orgId, org.id),
      orderBy: [desc(payments.createdAt)],
    });

    let planName = '';
    if (lastPayment && lastPayment.planName) {
      planName = lastPayment.planName;
    } else {
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