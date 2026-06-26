// app/login/page.tsx
'use client';

import { useCallback, useEffect, useState } from 'react';

import { useRouter } from 'next/navigation';

import { useAuth } from '@/components/auth/AuthProvider';
import { getOnboardingStatus } from '@/lib/actions/onboarding';
import { authClient } from '@/lib/auth-client';
import { useAppStore } from '@/stores/appStore';

export default function LoginPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);

  const { signIn, signUp, session, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const { setOrganizationFromDB, setExamCenterFromDB, reset } = useAppStore();

  // Clear stale state on mount
  useEffect(() => {
    reset();
  }, [reset]);

  // Check session validity and redirect
  const checkAndRedirect = useCallback(async () => {
    if (!session || isRedirecting) return;

    setIsRedirecting(true);

    try {
      // Verify session is still valid by making a quick API call
      const { data: currentSession } = await authClient.getSession();

      if (!currentSession) {
        // Session is invalid, force logout
        await authClient.signOut();
        reset();
        setIsRedirecting(false);
        return;
      }

      const status = await getOnboardingStatus();

      if (status.data?.organization) {
        const org = status.data.organization;
        setOrganizationFromDB(org);

        if (status.data.existingCenter) {
          setExamCenterFromDB(status.data.existingCenter);
        }
      }

      // Redirect based on status from database
      if (status.status === 'complete') {
        router.replace('/exam-center/dashboard');
      } else if (status.status === 'needs_subscription' || status.status === 'subscription_expired') {
        router.replace('/billing');
      } else if (status.status === 'needs_organization' || status.status === 'needs_exam_setup') {
        router.replace('/onboarding');
      } else {
        router.replace('/onboarding');
      }
    } catch (error) {
      console.error('Failed to check onboarding status:', error);
      // On error, try to redirect to onboarding
      router.replace('/onboarding');
    } finally {
      setIsRedirecting(false);
    }
  }, [session, router, setOrganizationFromDB, setExamCenterFromDB, reset, isRedirecting]);

  useEffect(() => {
    if (!authLoading && session) {
      checkAndRedirect();
    }
  }, [session, authLoading, checkAndRedirect]);

  // Show loading while checking session
  if (authLoading || (session && isRedirecting)) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="border-primary h-8 w-8 animate-spin rounded-full border-b-2" />
      </div>
    );
  }

  // If session exists but we're not redirecting yet (shouldn't happen), show loading
  if (session) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="border-primary h-8 w-8 animate-spin rounded-full border-b-2" />
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isLogin) {
        const result = await signIn(email, password);
        if (result.error) {
          setError(result.error.message || 'Login failed');
        }
        // No manual redirect - the useEffect will handle it
      } else {
        const result = await signUp(email, password, name);
        if (result.error) {
          setError(result.error.message || 'Signup failed');
        }
      }
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="to-primary 50/30 flex min-h-screen items-center justify-center bg-gradient-to-br from-neutral-50 via-white">
      <div className="w-full max-w-md space-y-6 rounded-2xl border border-neutral-100 bg-white/80 p-8 shadow-xl backdrop-blur-sm">
        <div className="text-center">
          <div className="mb-4 flex justify-center">
            <div className="from-primary to-primary shadow-primary/25 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br shadow-lg">
              <span className="text-xl font-bold text-white">TF</span>
            </div>
          </div>
          <h1 className="text-3xl font-bold text-neutral-900">TestForge</h1>
          <p className="mt-2 text-neutral-500">{isLogin ? 'Welcome back' : 'Start your journey'}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">Full Name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                className="focus:ring-primary w-full rounded-xl border border-neutral-200 bg-white px-4 py-2.5 transition-all focus:border-transparent focus:ring-2"
                required
              />
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="focus:ring-primary w-full rounded-xl border border-neutral-200 bg-white px-4 py-2.5 transition-all focus:border-transparent focus:ring-2"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="focus:ring-primary w-full rounded-xl border border-neutral-200 bg-white px-4 py-2.5 transition-all focus:border-transparent focus:ring-2"
              required
            />
          </div>

          {error && <div className="rounded-xl bg-red-50 p-3 text-center text-sm text-red-600">{error}</div>}

          <button
            type="submit"
            disabled={loading}
            className="from-primary to-primary shadow-primary/25 hover:from-primary hover:to-primary w-full rounded-xl bg-gradient-to-r px-4 py-2.5 font-semibold text-white shadow-lg transition-all disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? (
              <div className="flex items-center justify-center gap-2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                <span>{isLogin ? 'Signing in...' : 'Creating account...'}</span>
              </div>
            ) : (
              <span>{isLogin ? 'Sign In' : 'Sign Up'}</span>
            )}
          </button>
        </form>

        <div className="text-center">
          <button
            onClick={() => setIsLogin(!isLogin)}
            className="text-primary hover:text-primary text-sm font-medium transition-colors"
          >
            {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
          </button>
        </div>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-neutral-100"></div>
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-white px-2 text-neutral-400">MSBTE Exam Management</span>
          </div>
        </div>
      </div>
    </div>
  );
}
