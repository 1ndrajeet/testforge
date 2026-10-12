// web/src/lib/session.ts
'use server';

import { cache } from 'react';

import { createClient } from '@/lib/supabase/server';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  image?: string | null;
}

export interface OrganizationData {
  id: string;
  name: string;
  slug: string;
  subscriptionTier: string;
  subscriptionExpiresAt: Date | null;
}

export interface ExamCenterData {
  id: string;
  orgId: string;
  code: string;
  name: string;
  address: string | null;
  officerIncharge: string | null;
  sealingSupervisor: string | null;
  distCenterCode: string | null;
  distCenterName: string | null;
  season: 'Summer' | 'Winter' | null;
  examYear: number | null;
  startDate: Date | null;
  endDate: Date | null;
  departments: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CurrentOrgResponse {
  user: SessionUser;
  org: OrganizationData;
  orgId: string;
  role: string;
}

export const getSession = cache(async () => {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session;
});

export const getCurrentUser = cache(async (): Promise<SessionUser> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Unauthorized');
  }

  return {
    id: user.id,
    name: (user.user_metadata?.name as string) || user.email?.split('@')[0] || 'User',
    email: user.email || '',
    image: (user.user_metadata?.avatar_url as string) || null,
  };
});

export const getCurrentExamCenter = cache(async (): Promise<ExamCenterData | null> => {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return null;

    const { data: ec, error } = await supabase
      .from('exam_centers')
      .select('*')
      .eq('owner_id', user.id)
      .eq('is_active', true)
      .eq('is_deleted', false)
      .maybeSingle();

    if (error || !ec) return null;

    return {
      id: ec.id,
      orgId: ec.id,
      code: ec.code,
      name: ec.name,
      address: ec.address,
      officerIncharge: ec.officer_incharge,
      sealingSupervisor: ec.sealing_supervisor,
      distCenterCode: ec.dist_center_code,
      distCenterName: ec.dist_center_name,
      season: ec.season as 'Summer' | 'Winter' | null,
      examYear: ec.exam_year,
      startDate: ec.start_date ? new Date(ec.start_date) : null,
      endDate: ec.end_date ? new Date(ec.end_date) : null,
      departments: ec.departments || [],
      isActive: ec.is_active ?? true,
      createdAt: new Date(ec.created_at),
      updatedAt: new Date(ec.updated_at),
    };
  } catch {
    return null;
  }
});

export const requireExamCenter = cache(async (): Promise<ExamCenterData> => {
  const examCenter = await getCurrentExamCenter();
  if (!examCenter) {
    throw new Error('Exam center not configured');
  }
  return examCenter;
});

export const getExamCenterOrThrow = requireExamCenter;

export async function getExamCenterId(): Promise<string | null> {
  const examCenter = await getCurrentExamCenter();
  return examCenter?.id || null;
}

export async function requireExamCenterId(): Promise<string> {
  const id = await getExamCenterId();
  if (!id) throw new Error('Exam center not configured');
  return id;
}

export async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) throw new Error('Unauthorized');
  return { user, member: { role: 'owner' } };
}

export const getCurrentOrg = cache(async (): Promise<CurrentOrgResponse> => {
  const user = await getCurrentUser();
  const examCenter = await getCurrentExamCenter();

  return {
    user,
    org: {
      id: examCenter?.id || user.id,
      name: examCenter?.name || user.name,
      slug: examCenter?.code || 'center',
      subscriptionTier: 'premium',
      subscriptionExpiresAt: null,
    },
    orgId: examCenter?.id || user.id,
    role: 'owner',
  };
});

export const getCurrentOrgId = cache(async (): Promise<string> => {
  const { orgId } = await getCurrentOrg();
  return orgId;
});

export const getCurrentSubscription = cache(async () => {
  try {
    const examCenter = await getCurrentExamCenter();
    if (!examCenter) {
      return {
        tier: 'trial',
        planName: 'Trial Period',
        expiresAt: null,
        isActive: true,
      };
    }

    const supabase = await createClient();
    const { data: lastPayment } = await supabase
      .from('payments')
      .select('*')
      .eq('exam_center_id', examCenter.id)
      .eq('status', 'paid')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let planName = 'Trial Period';
    let tier = 'trial';
    let expiresAt: string | null = null;
    let isActive = true;

    if (lastPayment) {
      planName = lastPayment.plan_name || 'Premium Plan';
      tier = lastPayment.plan_id || 'premium';
      expiresAt = lastPayment.end_date ? new Date(lastPayment.end_date).toISOString() : null;
      isActive = !lastPayment.end_date || new Date(lastPayment.end_date) > new Date();
    }

    return {
      tier,
      planName,
      expiresAt,
      isActive,
    };
  } catch {
    return {
      tier: 'trial',
      planName: 'Trial Period',
      expiresAt: null,
      isActive: true,
    };
  }
});
