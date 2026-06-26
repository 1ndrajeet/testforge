// lib/actions/user.ts - Fix the type conversion
'use server';

import { getCurrentSubscription } from '@/lib/actions/subscription';
import { getCurrentExamCenter, getCurrentOrg, getCurrentUser } from '@/lib/session';

export async function getUserInfo() {
  try {
    const [user, orgData, examCenter, subscription] = await Promise.all([
      getCurrentUser().catch(() => null),
      getCurrentOrg().catch(() => null),
      getCurrentExamCenter().catch(() => null),
      getCurrentSubscription().catch(() => null),
    ]);

    return {
      success: true,
      data: {
        user: user
          ? {
              id: user.id,
              name: user.name,
              email: user.email,
              image: user.image,
            }
          : null,
        organization: orgData?.org
          ? {
              id: orgData.org.id,
              name: orgData.org.name,
              slug: orgData.org.slug,
              subscriptionTier: orgData.org.subscriptionTier,
              subscriptionExpiresAt: orgData.org.subscriptionExpiresAt
                ? orgData.org.subscriptionExpiresAt.toISOString()
                : null, // Convert Date to string
            }
          : null,
        examCenter: examCenter
          ? {
              id: examCenter.id,
              code: examCenter.code,
              name: examCenter.name,
              address: examCenter.address,
              officerIncharge: examCenter.officerIncharge,
              sealingSupervisor: examCenter.sealingSupervisor,
              distCenterCode: examCenter.distCenterCode,
              distCenterName: examCenter.distCenterName,
              season: examCenter.season,
              examYear: examCenter.examYear,
            }
          : null,
        subscription: subscription,
      },
    };
  } catch (error) {
    console.error('Failed to get user info:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch user info',
      data: {
        user: null,
        organization: null,
        examCenter: null,
        subscription: null,
      },
    };
  }
}

export async function getUserBasicInfo() {
  try {
    const user = await getCurrentUser().catch(() => null);
    return {
      success: true,
      data: user
        ? {
            id: user.id,
            name: user.name,
            email: user.email,
            image: user.image,
          }
        : null,
    };
  } catch {
    return { success: false, error: 'Failed to fetch user', data: null };
  }
}

export async function getUserOrganization() {
  try {
    const orgData = await getCurrentOrg().catch(() => null);
    return {
      success: true,
      data: orgData?.org
        ? {
            id: orgData.org.id,
            name: orgData.org.name,
            slug: orgData.org.slug,
            subscriptionTier: orgData.org.subscriptionTier,
            subscriptionExpiresAt: orgData.org.subscriptionExpiresAt
              ? orgData.org.subscriptionExpiresAt.toISOString()
              : null,
            role: orgData.role,
          }
        : null,
    };
  } catch {
    return { success: false, error: 'Failed to fetch organization', data: null };
  }
}

export async function getUserExamCenter() {
  try {
    const examCenter = await getCurrentExamCenter().catch(() => null);
    return {
      success: true,
      data: examCenter
        ? {
            id: examCenter.id,
            code: examCenter.code,
            name: examCenter.name,
            address: examCenter.address,
            officerIncharge: examCenter.officerIncharge,
            sealingSupervisor: examCenter.sealingSupervisor,
            distCenterCode: examCenter.distCenterCode,
            distCenterName: examCenter.distCenterName,
            season: examCenter.season,
            examYear: examCenter.examYear,
          }
        : null,
    };
  } catch {
    return { success: false, error: 'Failed to fetch exam center', data: null };
  }
}
