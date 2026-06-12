// app/login/page.tsx - Update the redirect logic
'use client';

import { useEffect, useState } from 'react';

import { useRouter } from 'next/navigation';

import { getOnboardingStatus } from '@/app/actions/onboarding';

import { useAuth } from '@/components/auth/AuthProvider';

import { useAppStore } from '@/stores/appStore';

export default function LoginPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { signIn, signUp, session } = useAuth();
  const router = useRouter();
  const { setOrganizationFromDB, setExamCenterFromDB, reset } = useAppStore();

  // Clear stale state on mount
  useEffect(() => {
    reset();
  }, [reset]);

  // Handle redirect after successful auth
  useEffect(() => {
    const checkAndRedirect = async () => {
      if (session) {
        try {
          const status = await getOnboardingStatus();

          if (status.data?.organization) {
            const org = status.data.organization;
            setOrganizationFromDB(org);

            if (status.data.existingCenter) {
              setExamCenterFromDB(status.data.existingCenter);
            }
          }

          // Redirect based on status from database (not cookies)
          if (status.status === 'complete') {
            router.push('/exam-center/dashboard');
          } else if (
            status.status === 'needs_subscription' ||
            status.status === 'subscription_expired'
          ) {
            router.push('/billing');
          } else if (
            status.status === 'needs_organization' ||
            status.status === 'needs_exam_setup'
          ) {
            router.push('/onboarding');
          } else {
            router.push('/onboarding');
          }
        } catch (error) {
          console.error('Failed to check onboarding status:', error);
          router.push('/onboarding');
        }
      }
    };

    checkAndRedirect();
  }, [session, router, setOrganizationFromDB, setExamCenterFromDB, reset]);

  if (session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500" />
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
      } else {
        const result = await signUp(email, password, name);
        if (result.error) {
          setError(result.error.message || 'Signup failed');
        }
      }
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-neutral-50 via-white to-emerald-50/30">
      <div className="w-full max-w-md p-8 space-y-6 bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-neutral-100">
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/25">
              <span className="text-white font-bold text-xl">TF</span>
            </div>
          </div>
          <h1 className="text-3xl font-bold text-neutral-900">TestForge</h1>
          <p className="text-neutral-500 mt-2">{isLogin ? 'Welcome back' : 'Start your journey'}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Full Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-2.5 border border-neutral-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all bg-white"
                required
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2.5 border border-neutral-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all bg-white"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2.5 border border-neutral-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all bg-white"
              required
            />
          </div>

          {error && (
            <div className="text-red-600 text-sm text-center p-3 bg-red-50 rounded-xl">{error}</div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-semibold rounded-xl hover:from-emerald-600 hover:to-emerald-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/25"
          >
            {loading ? (
              <div className="flex items-center justify-center gap-2">
                <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
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
            className="text-sm text-emerald-600 hover:text-emerald-700 transition-colors font-medium"
          >
            {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
          </button>
        </div>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-neutral-100"></div>
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="px-2 bg-white text-neutral-400">MSBTE Exam Management</span>
          </div>
        </div>
      </div>
    </div>
  );
}
