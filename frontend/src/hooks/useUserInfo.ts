// hooks/useUserInfo.ts - Simplified without functional updates
'use client';

import { useEffect, useState } from 'react';

import { getUserInfo } from '@/lib/actions2/user';

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
      const result = await getUserInfo();
      if (result.success) {
        setUser(result.data.user);
        setOrganization(result.data.organization);
        setExamCenter(result.data.examCenter);
        setSubscription(result.data.subscription);
      } else {
        setError(result.error || 'Failed to fetch user info');
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
