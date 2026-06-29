// lib/actions/user.ts
'use server';

import { revalidatePath } from 'next/cache';

import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { getCurrentSubscription } from '@/lib/actions/subscription';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { logger } from '@/lib/misc/logger';
import { getCurrentExamCenter, getCurrentOrg, getCurrentUser } from '@/lib/session';

const MODULE = 'user';

// ============================================
// Validation Schemas
// ============================================

const UpdateProfileSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email address'),
});

const UpdateAvatarSchema = z.object({
  imageUrl: z.string().url('Invalid image URL').nullable(),
});

// ============================================
// User Info Functions
// ============================================

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
                : null,
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
    logger.error(MODULE, 'Failed to get user info', { error });
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

// ============================================
// Profile Update Functions
// ============================================

export async function updateUserProfile(data: z.infer<typeof UpdateProfileSchema>) {
  const MODULE_FN = `${MODULE}.updateUserProfile`;

  try {
    const validated = UpdateProfileSchema.parse(data);
    const user = await getCurrentUser();

    // Check if email is already taken by another user
    const existingUser = await db.query.users.findFirst({
      where: eq(users.email, validated.email),
    });

    if (existingUser && existingUser.id !== user.id) {
      logger.warn(MODULE_FN, 'Email already taken', { email: validated.email });
      return {
        success: false,
        error: 'Email address is already taken by another user',
      };
    }

    const [updated] = await db
      .update(users)
      .set({
        name: validated.name,
        email: validated.email,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id))
      .returning();

    if (!updated) {
      logger.warn(MODULE_FN, 'User not found', { userId: user.id });
      return { success: false, error: 'User not found' };
    }

    logger.info(MODULE_FN, 'User profile updated', { userId: user.id });
    revalidatePath('/settings/profile');

    return {
      success: true,
      data: {
        id: updated.id,
        name: updated.name,
        email: updated.email,
        image: updated.image,
      },
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn(MODULE_FN, 'Validation failed', { issues: error.issues });
      return { success: false, error: error.issues };
    }

    logger.error(MODULE_FN, 'Failed to update profile', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update profile',
    };
  }
}

// ============================================
// Avatar Functions
// ============================================

export async function updateUserAvatar(imageUrl: string | null) {
  const MODULE_FN = `${MODULE}.updateUserAvatar`;

  try {
    const validated = UpdateAvatarSchema.parse({ imageUrl });
    const user = await getCurrentUser();

    const [updated] = await db
      .update(users)
      .set({
        image: validated.imageUrl,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id))
      .returning();

    if (!updated) {
      logger.warn(MODULE_FN, 'User not found', { userId: user.id });
      return { success: false, error: 'User not found' };
    }

    logger.info(MODULE_FN, 'User avatar updated', {
      userId: user.id,
      hasImage: !!validated.imageUrl,
    });
    revalidatePath('/settings/profile');

    return {
      success: true,
      data: {
        id: updated.id,
        image: updated.image,
      },
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn(MODULE_FN, 'Validation failed', { issues: error.issues });
      return { success: false, error: error.issues };
    }

    logger.error(MODULE_FN, 'Failed to update avatar', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update avatar',
    };
  }
}

export async function removeUserAvatar() {
  const MODULE_FN = `${MODULE}.removeUserAvatar`;

  try {
    const user = await getCurrentUser();

    const [updated] = await db
      .update(users)
      .set({
        image: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id))
      .returning();

    if (!updated) {
      logger.warn(MODULE_FN, 'User not found', { userId: user.id });
      return { success: false, error: 'User not found' };
    }

    logger.info(MODULE_FN, 'User avatar removed', { userId: user.id });
    revalidatePath('/settings/profile');

    return {
      success: true,
      data: {
        id: updated.id,
        image: null,
      },
    };
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to remove avatar', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to remove avatar',
    };
  }
}

// ============================================
// Avatar Upload with File Handling
// ============================================

export async function uploadUserAvatar(formData: FormData) {
  const MODULE_FN = `${MODULE}.uploadUserAvatar`;

  try {
    const file = formData.get('avatar') as File | null;
    if (!file) {
      return { success: false, error: 'No file provided' };
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return { success: false, error: 'File must be an image' };
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      return { success: false, error: 'File size must be less than 5MB' };
    }

    const user = await getCurrentUser();

    // Convert file to base64 for storage
    const buffer = await file.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const mimeType = file.type;
    const imageUrl = `data:${mimeType};base64,${base64}`;

    // Update user with base64 image
    const [updated] = await db
      .update(users)
      .set({
        image: imageUrl,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id))
      .returning();

    if (!updated) {
      logger.warn(MODULE_FN, 'User not found', { userId: user.id });
      return { success: false, error: 'User not found' };
    }

    logger.info(MODULE_FN, 'User avatar uploaded', {
      userId: user.id,
      fileSize: file.size,
      mimeType,
    });
    revalidatePath('/settings/profile');

    return {
      success: true,
      data: {
        id: updated.id,
        image: updated.image,
      },
    };
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to upload avatar', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to upload avatar',
    };
  }
}
