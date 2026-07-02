// lib/actions/role.ts
'use server';

import { cache } from 'react';
import { headers } from 'next/headers';

import { eq } from 'drizzle-orm';

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { orgMembers } from '@/lib/db/schema';
import { logger } from '@/lib/misc/logger';

const MODULE = 'role';

export type UserRole = 'owner' | 'admin' | 'member';

export interface UserWithRole {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string | null;
  role: UserRole;
  orgId: string | null;
}

export const getCurrentUserWithRole = cache(async (): Promise<UserWithRole | null> => {
  const MODULE_FN = `${MODULE}.getCurrentUserWithRole`;

  try {
    const session = await auth.api.getSession({ headers: await headers() });
    
    if (!session?.user) {
      logger.debug(MODULE_FN, 'No session found');
      return null;
    }

    // Get user's role from orgMembers
    const orgMember = await db.query.orgMembers.findFirst({
      where: eq(orgMembers.userId, session.user.id),
    });

    const role = (orgMember?.role as UserRole) || 'member';

    logger.debug(MODULE_FN, 'User role fetched', {
      userId: session.user.id,
      role,
      orgId: orgMember?.orgId,
    });

    return {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      emailVerified: session.user.emailVerified,
      image: session.user.image,
      role,
      orgId: orgMember?.orgId || null,
    };
  } catch (error) {
    logger.error(MODULE_FN, 'Failed to get user with role', { error });
    return null;
  }
});

export const getUserRole = cache(async (): Promise<UserRole> => {
  const user = await getCurrentUserWithRole();
  return user?.role || 'member';
});

export const isAdmin = cache(async (): Promise<boolean> => {
  const role = await getUserRole();
  return role === 'owner' || role === 'admin';
});

export const isOwner = cache(async (): Promise<boolean> => {
  const role = await getUserRole();
  return role === 'owner';
});

export const isMember = cache(async (): Promise<boolean> => {
  const role = await getUserRole();
  return role === 'member';
});