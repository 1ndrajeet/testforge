// app/login/page.tsx
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import Image from 'next/image';
import { useRouter } from 'next/navigation';

import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Lock,
  Mail,
  User2,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { HashLoader } from 'react-spinners';
import { toast } from 'sonner';

import { getOnboardingStatus } from '@/lib/actions2/onboarding';
import { authClient } from '@/lib/auth-client';
import { logger } from '@/lib/misc/logger';
import { cn } from '@/lib/utils';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

import { Logo } from '@/components/layout/header';

import { useAuth } from '@/components/auth/AuthProvider';

import { useAppStore } from '@/stores/appStore';

const MODULE = 'login-page';

function isVerificationCallback(): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return params.get('verified') === 'true' || window.location.pathname.includes('verify-email');
}

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

  const [verificationSent, setVerificationSent] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [isResending, setIsResending] = useState(false);
  const [verificationSuccess, setVerificationSuccess] = useState(false);

  const router = useRouter();
  const { signIn, signUp, session, isLoading: authLoading } = useAuth();
  const { setOrganizationFromDB, setExamCenterFromDB, reset } = useAppStore();
  const { theme } = useTheme();
  const redirectAttempted = useRef(false);
  const resendTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  useEffect(() => {
    if (resendCooldown > 0) {
      resendTimerRef.current = setTimeout(() => {
        setResendCooldown((prev) => prev - 1);
      }, 1000);
    }
    return () => {
      if (resendTimerRef.current) {
        clearTimeout(resendTimerRef.current);
      }
    };
  }, [resendCooldown]);

  useEffect(() => {
    reset();
    logger.debug(MODULE, 'Login page mounted');

    if (isVerificationCallback()) {
      toast.success('Email verified successfully', {
        description: 'You can now sign in to your account.',
      });

      setTimeout(() => {
        const url = new URL(window.location.href);
        url.searchParams.delete('verified');
        url.searchParams.delete('token');
        window.history.replaceState({}, '', url.toString());
      }, 2000);
    }
  }, [reset]);
  const checkAndRedirect = useCallback(async () => {
    if (isRedirecting || redirectAttempted.current || !session) return;

    redirectAttempted.current = true;
    setIsRedirecting(true);

    try {
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
        setOrganizationFromDB(status.data.organization);
        if (status.data.existingCenter) {
          setExamCenterFromDB(status.data.existingCenter);
        }
      }

      logger.debug(MODULE, 'Onboarding status', { status: status.status });

      const routes: Record<string, string> = {
        complete: '/exam-center/dashboard',
        needs_subscription: '/billing',
        subscription_expired: '/billing',
        needs_organization: '/onboarding',
        needs_exam_setup: '/onboarding',
      };

      router.replace(routes[status.status] || '/onboarding');
    } catch (error) {
      logger.error(MODULE, 'Failed to check onboarding status', { error });
      router.replace('/onboarding');
    } finally {
      setIsRedirecting(false);
    }
  }, [session, router, setOrganizationFromDB, setExamCenterFromDB, reset, isRedirecting]);

  useEffect(() => {
    const checkVerification = async () => {
      if (!session?.user) return;

      logger.debug(MODULE, 'Session detected', {
        userId: session.user.id,
        email: session.user.email,
        verified: session.user.emailVerified,
      });

      if (!session.user.emailVerified) {
        setVerificationEmail(session.user.email);
        setVerificationSent(true);
      } else {
        await checkAndRedirect();
      }
    };

    if (!verificationSent) {
      checkVerification();
    }
  }, [session, verificationSent]);

  const handleResendVerification = async () => {
    if (isResending || resendCooldown > 0) return;

    setIsResending(true);
    setError('');

    try {
      const result = await authClient.sendVerificationEmail({
        email: verificationEmail,
      });

      if (result.error) {
        const msg = result.error.message || 'Failed to resend verification email';
        setError(msg);
        logger.error(MODULE, 'Failed to resend verification', { error: msg });
        toast.error('Failed to resend verification email');
      } else {
        setResendCooldown(60);
        setVerificationSuccess(true);
        setTimeout(() => setVerificationSuccess(false), 5000);
        toast.success('Verification email resent', {
          description: 'Check your inbox for the verification link.',
        });
        logger.info(MODULE, 'Verification email resent', { email: verificationEmail });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to resend verification email';
      setError(msg);
      logger.error(MODULE, 'Resend verification exception', { error: msg });
      toast.error('Failed to resend verification email');
    } finally {
      setIsResending(false);
    }
  };

  const handleSignOut = async () => {
    logger.debug(MODULE, 'Signing out from verification screen');
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
      logger.debug(MODULE, 'Initiating Google sign in');
      await authClient.signIn.social({
        provider: 'google',
        callbackURL: '/auth/callback',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Google sign in failed';
      setError(msg);
      logger.error(MODULE, 'Google sign in failed', { error: msg });
      toast.error('Google sign in failed');
      setGoogleLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isLogin) {
        const result = await signIn(email, password);

        if (result.error) {
          const msg = result.error.message || 'Login failed';

          if (result.error.status === 403 && msg.toLowerCase().includes('verify')) {
            setVerificationEmail(email);
            setVerificationSent(true);
            setError('');
            toast.info('Please verify your email first', {
              description: 'Check your inbox for the verification link.',
            });
            logger.debug(MODULE, 'User needs verification during login', { email });
          } else {
            setError(msg);
            toast.error('Login failed', { description: msg });
            logger.warn(MODULE, 'Login failed', { email, error: msg });
          }
        } else {
          logger.info(MODULE, 'Login successful', { email });
        }
      } else {
        const result = await signUp(email, password, name);

        if (result.error) {
          const msg = result.error.message || 'Signup failed';
          setError(msg);
          toast.error('Signup failed', { description: msg });
          logger.warn(MODULE, 'Signup failed', { email, error: msg });
          setLoading(false);
          return;
        }

        logger.info(MODULE, 'Signup successful', { email });

        toast.success('Account created successfully', {
          description: 'Please check your email to verify your account.',
          duration: 5000,
        });

        setVerificationEmail(email);
        setVerificationSent(true);
        setError('');
        setLoading(false);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'An unexpected error occurred';
      setError(msg);
      toast.error('Authentication error', { description: msg });
      logger.error(MODULE, 'Authentication error', { error: msg });
    } finally {
      setLoading(false);
    }
  };

  if (authLoading || (session && isRedirecting)) {
    return (
      <div className="bg-background/80 fixed inset-0 z-50 flex flex-col items-center justify-center backdrop-blur-sm">
        <HashLoader
          size={60}
          color="#059669"
        />
        <p className="text-muted-foreground mt-6 text-sm font-medium">Loading...</p>
      </div>
    );
  }

  if (verificationSent) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-white dark:bg-neutral-950">
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
          <Card className="border-neutral-200/60 bg-white/80 backdrop-blur-sm dark:border-white/5 dark:bg-neutral-900/80 dark:backdrop-blur-sm">
            <CardHeader className="space-y-4 text-center">
              <div className="flex justify-center">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-500/20">
                  <Mail className="h-10 w-10 text-emerald-600 dark:text-emerald-400" />
                </div>
              </div>
              <div>
                <CardTitle className="text-2xl font-extrabold tracking-tight dark:text-white">
                  Verify your email address
                </CardTitle>
                <CardDescription className="mt-2 text-neutral-500 dark:text-neutral-400">
                  We've sent a verification link to{' '}
                  <span className="font-medium text-neutral-700 dark:text-neutral-300">
                    {verificationEmail}
                  </span>
                </CardDescription>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              {verificationSuccess && (
                <div className="rounded-xl border border-emerald-200/60 bg-emerald-50/50 p-3 text-center text-sm text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400">
                  Verification email resent successfully
                </div>
              )}

              <div className="rounded-xl border border-amber-200/60 bg-amber-50/50 p-4 dark:border-amber-500/20 dark:bg-amber-500/10">
                <div className="flex items-start gap-3">
                  <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
                  <div className="space-y-1 text-sm">
                    <p className="font-medium text-amber-800 dark:text-amber-300">
                      Check your inbox
                    </p>
                    <p className="text-amber-700 dark:text-amber-400">
                      Click the link in the email to verify your account. If you don't see it, check
                      your spam folder.
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
              <p className="text-xs text-neutral-400 dark:text-neutral-500">
                Need help? Contact{' '}
                <a
                  href={`mailto:support@${process.env.NEXT_PUBLIC_HOSTED_URL}`}
                  className="text-emerald-600 hover:underline"
                >
                  support@{process.env.NEXT_PUBLIC_HOSTED_URL}
                </a>
              </p>
            </CardFooter>
          </Card>
        </div>
      </div>
    );
  }

  if (session) {
    return (
      <div className="bg-background/80 fixed inset-0 z-50 flex flex-col items-center justify-center backdrop-blur-sm">
        <HashLoader
          size={60}
          color="#059669"
        />
        <p className="text-muted-foreground mt-6 text-sm font-medium">Redirecting...</p>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-white dark:bg-neutral-950">
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
        <Card className="border-neutral-200/60 bg-white/80 backdrop-blur-sm dark:border-white/5 dark:bg-neutral-900/80 dark:backdrop-blur-sm">
          <CardHeader className="space-y-4 text-center">
            <div className="flex justify-center">
              <Logo />
            </div>

            <div>
              <CardTitle className="text-2xl font-extrabold tracking-tight dark:text-white">
                {isLogin ? 'Welcome back' : 'Create your account'}
              </CardTitle>
              <CardDescription className="mt-1 text-neutral-500 dark:text-neutral-400">
                {isLogin ? 'Sign in to manage your exam center' : 'Get started with TestForge'}
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
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
                  <Image
                    src="/google.svg"
                    width={20}
                    height={20}
                    alt="Google"
                    className="h-5 w-5"
                  />
                  Continue with Google
                </span>
              )}
            </Button>

            <div className="flex items-center gap-4">
              <Separator className="flex-1" />
              <span className="text-xs text-neutral-400">or</span>
              <Separator className="flex-1" />
            </div>

            <form
              onSubmit={handleSubmit}
              className="space-y-4"
            >
              {!isLogin && (
                <div className="space-y-2">
                  <Label
                    htmlFor="name"
                    className="text-sm font-medium text-neutral-700 dark:text-neutral-300"
                  >
                    Full name
                  </Label>
                  <div className="relative">
                    <User2 className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-neutral-400 dark:text-neutral-500" />
                    <Input
                      id="name"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Enter your full name"
                      className="border-neutral-200 bg-white/50 pl-10 focus:ring-2 focus:ring-emerald-500/50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-neutral-500"
                      required
                    />
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label
                  htmlFor="email"
                  className="text-sm font-medium text-neutral-700 dark:text-neutral-300"
                >
                  Email address
                </Label>
                <div className="relative">
                  <Mail className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-neutral-400 dark:text-neutral-500" />
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email address"
                    className="border-neutral-200 bg-white/50 pl-10 focus:ring-2 focus:ring-emerald-500/50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-neutral-500"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="password"
                  className="text-sm font-medium text-neutral-700 dark:text-neutral-300"
                >
                  Password
                </Label>
                <div className="relative">
                  <Lock className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-neutral-400 dark:text-neutral-500" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="border-neutral-200 bg-white/50 pr-10 pl-10 focus:ring-2 focus:ring-emerald-500/50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-neutral-500"
                    required
                    minLength={8}
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
                className="relative w-full overflow-hidden rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-4 py-2.5 font-semibold text-white shadow-lg shadow-emerald-500/30 transition-all duration-300 hover:scale-[1.02] hover:from-emerald-400 hover:to-emerald-500 hover:shadow-emerald-500/50"
              >
                <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-1000 group-hover:translate-x-full" />
                {loading ? (
                  <div className="flex items-center justify-center gap-2">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    <span>{isLogin ? 'Signing in...' : 'Creating account...'}</span>
                  </div>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    {isLogin ? 'Sign In' : 'Create Account'}
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
