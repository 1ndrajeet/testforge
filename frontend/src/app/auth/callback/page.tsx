// app/auth/callback/page.tsx
'use client';

import { useEffect } from 'react';

import { useRouter } from 'next/navigation';

import { HashLoader } from 'react-spinners';

import { useAuth } from '@/components/auth/AuthProvider';
import { getOnboardingStatus } from '@/lib/actions/onboarding';
import { useAppStore } from '@/stores/appStore';

export default function AuthCallbackPage() {
  const router = useRouter();
  const { session, isLoading } = useAuth();
  const { setOrganizationFromDB, setExamCenterFromDB } = useAppStore();

  useEffect(() => {
    const handleRedirect = async () => {
      // Wait for session to load
      if (isLoading) return;

      // No session - redirect to login
      if (!session) {
        router.replace('/login');
        return;
      }

      try {
        // Check if email is verified
        if (!session.user.emailVerified) {
          router.replace('/login?verification=required');
          return;
        }

        // Get onboarding status
        const status = await getOnboardingStatus();

        // Set organization and exam center in store
        if (status.data?.organization) {
          const org = status.data.organization;
          setOrganizationFromDB(org);

          if (status.data.existingCenter) {
            setExamCenterFromDB(status.data.existingCenter);
          }
        }

        // Redirect based on status
        if (status.status === 'complete') {
          router.replace('/exam-center/dashboard');
        } else if (status.status === 'needs_subscription' || status.status === 'subscription_expired') {
          router.replace('/billing');
        } else {
          // For new users: needs_organization or needs_exam_setup
          router.replace('/onboarding');
        }
      } catch (error) {
        console.error('Failed to check onboarding status:', error);
        // On error, redirect to onboarding as safe fallback
        router.replace('/onboarding');
      }
    };

    handleRedirect();
  }, [session, isLoading, router, setOrganizationFromDB, setExamCenterFromDB]);

  return (
    <div className="bg-background/80 fixed inset-0 z-50 flex flex-col items-center justify-center backdrop-blur-sm">
      <HashLoader size={60} color="#059669" />
      <p className="text-muted-foreground mt-6 text-sm font-medium">Completing sign in...</p>
    </div>
  );
}
