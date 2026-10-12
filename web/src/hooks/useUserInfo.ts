// web/src/hooks/useUserInfo.ts
'use client';

import { useEffect, useState } from 'react';

import { createClient } from '@/lib/supabase/client';

export interface UserInfoState {
  user: {
    id: string;
    name: string;
    email: string;
    image?: string | null;
  } | null;
  organization: {
    id: string;
    name: string;
    slug: string;
    subscriptionTier: string;
    subscriptionExpiresAt: string | null;
  } | null;
  examCenter: {
    id: string;
    code: string;
    name: string;
    address: string | null;
    officerIncharge: string | null;
    sealingSupervisor: string | null;
    distCenterCode: string | null;
    distCenterName: string | null;
    season: string | null;
    examYear: number | null;
    examController?: string | null;
  } | null;
  subscription: {
    tier: string;
    planName: string;
    expiresAt: string | null;
    isActive: boolean;
  } | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useUserInfo(): UserInfoState {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<UserInfoState['user']>(null);
  const [organization, setOrganization] = useState<UserInfoState['organization']>(null);
  const [examCenter, setExamCenter] = useState<UserInfoState['examCenter']>(null);
  const [subscription, setSubscription] = useState<UserInfoState['subscription']>(null);

  const fetchData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const {
        data: { user: authUser },
        error: authErr,
      } = await supabase.auth.getUser();

      if (authErr || !authUser) {
        setUser(null);
        setOrganization(null);
        setExamCenter(null);
        setSubscription(null);
        return;
      }

      const userObj = {
        id: authUser.id,
        name: (authUser.user_metadata?.name as string) || authUser.email?.split('@')[0] || 'User',
        email: authUser.email || '',
        image: (authUser.user_metadata?.avatar_url as string) || null,
      };
      setUser(userObj);

      const { data: ec, error: ecErr } = await supabase
        .from('exam_centers')
        .select('*')
        .eq('owner_id', authUser.id)
        .eq('is_active', true)
        .eq('is_deleted', false)
        .maybeSingle();

      if (ecErr) throw ecErr;

      if (ec) {
        const ecObj = {
          id: ec.id,
          code: ec.code,
          name: ec.name,
          address: ec.address,
          officerIncharge: ec.officer_incharge,
          sealingSupervisor: ec.sealing_supervisor,
          distCenterCode: ec.dist_center_code,
          distCenterName: ec.dist_center_name,
          season: ec.season,
          examYear: ec.exam_year,
          examController: ec.exam_controller,
        };
        setExamCenter(ecObj);

        const { data: lastPayment } = await supabase
          .from('payments')
          .select('*')
          .eq('exam_center_id', ec.id)
          .eq('status', 'paid')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        const isActive = !lastPayment?.end_date || new Date(lastPayment.end_date) > new Date();
        const subObj = {
          tier: lastPayment?.plan_id || 'trial',
          planName: lastPayment?.plan_name || 'Trial Period',
          expiresAt: lastPayment?.end_date ? new Date(lastPayment.end_date).toISOString() : null,
          isActive,
        };
        setSubscription(subObj);
        setOrganization({
          id: ec.id,
          name: ec.name,
          slug: ec.code,
          subscriptionTier: subObj.tier,
          subscriptionExpiresAt: subObj.expiresAt,
        });
      } else {
        setExamCenter(null);
        setSubscription(null);
        setOrganization(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  return {
    user,
    organization,
    examCenter,
    subscription,
    isLoading,
    error,
    refetch: fetchData,
  };
}
