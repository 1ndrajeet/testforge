'use server';

import { desc, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { payments } from '@/lib/db/schema';
import { getCurrentOrg } from '@/lib/session';

export async function getCurrentSubscription() {
  const { org } = await getCurrentOrg();

  const isActive = !!(
    org.subscriptionExpiresAt && new Date(org.subscriptionExpiresAt) > new Date()
  );

  const lastPayment = await db.query.payments.findFirst({
    where: eq(payments.orgId, org.id),
    orderBy: [desc(payments.createdAt)],
  });

  let planName = '';
  if (lastPayment?.planName) {
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
    planName,
    expiresAt: org.subscriptionExpiresAt?.toISOString() || null,
    isActive: isActive, // Now guaranteed to be boolean, not null
  };
}

export async function getPaymentHistory() {
  const { orgId } = await getCurrentOrg();

  const paymentsList = await db.query.payments.findMany({
    where: eq(payments.orgId, orgId),
    orderBy: [desc(payments.createdAt)],
  });

  return { payments: paymentsList };
}
