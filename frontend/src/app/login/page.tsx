// app/login/page.tsx
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { useTheme } from 'next-themes';
import { useRouter } from 'next/navigation';

import { AlertCircle, ArrowRight, CheckCircle2, Eye, EyeOff, GoalIcon, Lock, Mail, User2 } from 'lucide-react';
import { HashLoader } from 'react-spinners';

import { useAuth } from '@/components/auth/AuthProvider';
import { Logo } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { getOnboardingStatus } from '@/lib/actions/onboarding';
import { authClient } from '@/lib/auth-client';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/stores/appStore';

export default function LoginPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  // Email verification states
  const [verificationSent, setVerificationSent] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [isResending, setIsResending] = useState(false);
  const [verificationSuccess, setVerificationSuccess] = useState(false);
  const router = useRouter();
  const { signIn, signUp, session, isLoading: authLoading, signInWithGoogle } = useAuth();
  const { setOrganizationFromDB, setExamCenterFromDB, reset } = useAppStore();
  const { theme } = useTheme();
  const redirectAttempted = useRef(false);
  const resendTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Mouse tracking for glow effect
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      resendTimerRef.current = setTimeout(() => {
        setResendCooldown(prev => prev - 1);
      }, 1000);
    }
    return () => {
      if (resendTimerRef.current) {
        clearTimeout(resendTimerRef.current);
      }
    };
  }, [resendCooldown]);

  // Clear stale state on mount
  useEffect(() => {
    reset();
  }, [reset]);

  // Check session validity and redirect
  const checkAndRedirect = useCallback(async () => {
    if (isRedirecting || redirectAttempted.current) return;
    if (!session) return;

    redirectAttempted.current = true;
    setIsRedirecting(true);

    try {
      // Check if email is verified
      if (!session.user.emailVerified) {
        setVerificationEmail(session.user.email);
        setVerificationSent(true);
        setIsRedirecting(false);
        redirectAttempted.current = false;
        return;
      }

      const { data: currentSession } = await authClient.getSession();

      if (!currentSession) {
        await authClient.signOut();
        reset();
        setIsRedirecting(false);
        redirectAttempted.current = false;
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
      router.replace('/onboarding');
    } finally {
      setIsRedirecting(false);
    }
  }, [session, router, setOrganizationFromDB, setExamCenterFromDB, reset, isRedirecting]);

  useEffect(() => {
    if (!authLoading && session) {
      checkAndRedirect();
    }
    if (!session) {
      redirectAttempted.current = false;
    }
  }, [session, authLoading, checkAndRedirect]);

  // Resend verification email
  const handleResendVerification = async () => {
    if (isResending || resendCooldown > 0) return;

    setIsResending(true);
    try {
      const result = await authClient.sendVerificationEmail({
        email: verificationEmail,
      });
      if (result.error) {
        setError(result.error.message || 'Failed to resend verification email');
      } else {
        setResendCooldown(60);
        setError('');
        setVerificationSuccess(true);
        setTimeout(() => setVerificationSuccess(false), 5000);
      }
    } catch (err) {
      setError('Failed to resend verification email. Please try again.');
    } finally {
      setIsResending(false);
    }
  };

  // Handle sign out from verification screen
  const handleSignOut = async () => {
    await authClient.signOut();
    setVerificationSent(false);
    setVerificationEmail('');
    setError('');
    reset();
    router.refresh();
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    setError('');
    try {
      await authClient.signIn.social({
        provider: 'google',
        callbackURL: '/auth/callback', // ← Redirect to callback handler
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign in failed');
      setGoogleLoading(false);
    }
  };

  // Show loading while checking session
  if (authLoading || (session && isRedirecting)) {
    return (
      <div className="bg-background/80 fixed inset-0 z-50 flex flex-col items-center justify-center backdrop-blur-sm">
        <HashLoader size={60} color="#059669" />
        <p className="text-muted-foreground mt-6 text-sm font-medium">Loading...</p>
      </div>
    );
  }

  // Show verification screen if email not verified
  if (verificationSent) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-white dark:bg-[#0a0a0a]">
        {theme === 'dark' && (
          <div
            className="pointer-events-none absolute -z-10 h-[600px] w-[600px] rounded-full bg-emerald-500/5 blur-[120px] transition-all duration-300"
            style={{
              left: mousePosition.x - 300,
              top: mousePosition.y - 300,
            }}
          />
        )}

        <div className="w-full max-w-md px-4">
          <Card className="border-neutral-200/60 bg-white/80 backdrop-blur-sm dark:border-white/5 dark:bg-[#121212]/80 dark:backdrop-blur-sm">
            <CardHeader className="space-y-4 text-center">
              <div className="flex justify-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-500/20">
                  <Mail className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
                </div>
              </div>
              <div>
                <CardTitle className="text-2xl font-extrabold tracking-tight dark:text-white">
                  Verify your email
                </CardTitle>
                <CardDescription className="mt-2 text-neutral-500 dark:text-neutral-400">
                  We've sent a verification link to{' '}
                  <span className="font-medium text-neutral-700 dark:text-neutral-300">{verificationEmail}</span>
                </CardDescription>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              {verificationSuccess && (
                <div className="rounded-xl border border-emerald-200/60 bg-emerald-50/50 p-3 text-center text-sm text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400">
                  Verification email resent successfully!
                </div>
              )}

              <div className="rounded-xl border border-emerald-200/60 bg-emerald-50/50 p-4 dark:border-emerald-500/20 dark:bg-emerald-500/10">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <div className="space-y-1 text-sm">
                    <p className="font-medium text-emerald-800 dark:text-emerald-300">Check your inbox</p>
                    <p className="text-emerald-700 dark:text-emerald-400">
                      Click the link in the email to verify your account. If you don't see it, check your spam folder.
                    </p>
                  </div>
                </div>
              </div>

              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-center text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
                  {error}
                </div>
              )}

              <div className="flex flex-col gap-3">
                <Button
                  onClick={handleResendVerification}
                  disabled={isResending || resendCooldown > 0}
                  variant="outline"
                  className="w-full border-neutral-200 bg-white/50 dark:border-white/10 dark:bg-white/5"
                >
                  {isResending ? (
                    <div className="flex items-center gap-2">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
                      <span>Sending...</span>
                    </div>
                  ) : resendCooldown > 0 ? (
                    <span>Resend available in {resendCooldown}s</span>
                  ) : (
                    <span>Resend verification email</span>
                  )}
                </Button>

                <Button
                  onClick={handleSignOut}
                  variant="ghost"
                  className="w-full text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-300"
                >
                  Sign out
                </Button>
              </div>
            </CardContent>

            <CardFooter className="flex justify-center border-t border-neutral-200/60 pt-4 dark:border-white/5">
              <p className="text-xs text-neutral-400 dark:text-neutral-500">Need help? Contact support</p>
            </CardFooter>
          </Card>
        </div>
      </div>
    );
  }

  if (session) {
    return (
      <div className="bg-background/80 fixed inset-0 z-50 flex flex-col items-center justify-center backdrop-blur-sm">
        <HashLoader size={60} color="#059669" />
        <p className="text-muted-foreground mt-6 text-sm font-medium">Redirecting...</p>
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
          if (result.error.status === 403 && result.error.message?.toLowerCase().includes('verify')) {
            setError('Please verify your email address before signing in. Check your inbox for the verification link.');
          } else {
            setError(result.error.message || 'Login failed');
          }
        }
      } else {
        const result = await signUp(email, password, name);
        if (result.error) {
          setError(result.error.message || 'Signup failed');
        } else if (result.data) {
          const sessionData = await authClient.getSession();
          if (sessionData.data?.user && !sessionData.data.user.emailVerified) {
            setVerificationEmail(email);
            setVerificationSent(true);
            setLoading(false);
            return;
          }
        }
      }
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-white dark:bg-[#0a0a0a]">
      {theme === 'dark' && (
        <div
          className="pointer-events-none absolute -z-10 h-[600px] w-[600px] rounded-full bg-emerald-500/5 blur-[120px] transition-all duration-300"
          style={{
            left: mousePosition.x - 300,
            top: mousePosition.y - 300,
          }}
        />
      )}

      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            theme === 'dark'
              ? 'radial-gradient(60% 60% at 50% 0%, rgba(5, 150, 105, 0.08), transparent 70%)'
              : 'radial-gradient(60% 60% at 50% 0%, rgba(5, 150, 105, 0.06), transparent 70%)',
        }}
      />

      <div className="w-full max-w-md px-4">
        <Card className="border-neutral-200/60 bg-white/80 backdrop-blur-sm dark:border-white/5 dark:bg-[#121212]/80 dark:backdrop-blur-sm">
          <CardHeader className="space-y-4 text-center">
            <div className="flex justify-center">
              <Logo />
            </div>

            <div>
              <CardTitle className="text-2xl font-extrabold tracking-tight dark:text-white">
                {isLogin ? 'Welcome back' : 'Start your journey'}
              </CardTitle>
              <CardDescription className="mt-1 text-neutral-500 dark:text-neutral-400">
                {isLogin ? 'Sign in to manage your exam center' : 'Create your account to get started'}
              </CardDescription>
            </div>

            {isLogin && (
              <div className="rounded-lg border border-amber-200/60 bg-amber-50/50 p-2 text-xs text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400">
                <span className="flex items-center justify-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5" />
                  Verify your email before signing in
                </span>
              </div>
            )}
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Google Sign In Button */}
            <Button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={googleLoading}
              variant="outline"
              className="relative w-full border-neutral-200 bg-white/50 text-neutral-700 transition-all hover:bg-neutral-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            >
              {googleLoading ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
                  <span>Connecting...</span>
                </div>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <GoalIcon className="h-4 w-4" />
                  Continue with Google
                </span>
              )}
            </Button>

            <div className="flex items-center gap-4">
              <Separator className="flex-1" />
              <span className="text-xs text-neutral-400">or</span>
              <Separator className="flex-1" />
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {!isLogin && (
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    Full Name
                  </Label>
                  <div className="relative">
                    <div className="absolute top-1/2 left-3 -translate-y-1/2 text-neutral-400 dark:text-neutral-500">
                      <User2 className="h-4 w-4" />
                    </div>
                    <Input
                      id="name"
                      type="text"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="Enter your full name"
                      className="border-neutral-200 bg-white/50 pl-10 focus:ring-2 focus:ring-emerald-500/50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-neutral-500"
                      required
                    />
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  Email
                </Label>
                <div className="relative">
                  <div className="absolute top-1/2 left-3 -translate-y-1/2 text-neutral-400 dark:text-neutral-500">
                    <Mail className="h-4 w-4" />
                  </div>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="Enter your email"
                    className="border-neutral-200 bg-white/50 pl-10 focus:ring-2 focus:ring-emerald-500/50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-neutral-500"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  Password
                </Label>
                <div className="relative">
                  <div className="absolute top-1/2 left-3 -translate-y-1/2 text-neutral-400 dark:text-neutral-500">
                    <Lock className="h-4 w-4" />
                  </div>
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="border-neutral-200 bg-white/50 pr-10 pl-10 focus:ring-2 focus:ring-emerald-500/50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-neutral-500"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute top-1/2 right-3 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-center text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                disabled={loading}
                className="group relative w-full overflow-hidden rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-4 py-2.5 font-semibold text-white shadow-lg shadow-emerald-500/30 transition-all duration-300 hover:scale-[1.02] hover:from-emerald-400 hover:to-emerald-500 hover:shadow-emerald-500/50"
              >
                <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-1000 group-hover:translate-x-full" />
                {loading ? (
                  <div className="flex items-center justify-center gap-2">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    <span>{isLogin ? 'Signing in...' : 'Creating account...'}</span>
                  </div>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    {isLogin ? 'Sign In' : 'Sign Up'}
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </span>
                )}
              </Button>
            </form>
          </CardContent>

          <CardFooter className="flex flex-col gap-4">
            <div className="text-center">
              <button
                onClick={() => {
                  setIsLogin(!isLogin);
                  setError('');
                }}
                className="text-sm font-medium text-emerald-600 transition-colors hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300"
              >
                {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
              </button>
            </div>
          </CardFooter>
        </Card>

        <p className="mt-4 text-center text-xs text-neutral-400 dark:text-neutral-500">
          By continuing, you agree to our Terms of Service and Privacy Policy
        </p>
      </div>
    </div>
  );
}
