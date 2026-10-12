// app/(dashboard)/settings/profile/page.tsx
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertCircle,
  Calendar,
  Check,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  LogOut,
  Mail,
  Shield,
  User,
  UserCircle,
} from 'lucide-react';
import { toast } from 'sonner';

import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';

import { PageHeader } from '@/components/layout/page-layout';

// ────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────

const MIN_PASSWORD_LENGTH = 8;

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

interface UserProfile {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  createdAt: Date;
}

interface SubscriptionInfo {
  tier: string;
  planName: string;
  expiresAt: string | null;
  isActive: boolean;
}

type ProfileLoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; user: UserProfile };

type SubscriptionLoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'absent' }
  | { status: 'ready'; info: SubscriptionInfo };

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'U';
  return parts
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase();
}

function formatDate(value: Date | string | null | undefined): string {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
}

function getTierLabel(tier: string): string {
  switch (tier) {
    case 'enterprise':
      return 'Enterprise';
    case 'premium':
      return 'Premium';
    case 'trial':
      return 'Trial';
    case 'inactive':
      return 'Inactive';
    default:
      return tier ? tier.charAt(0).toUpperCase() + tier.slice(1) : 'Inactive';
  }
}

// ────────────────────────────────────────────────────────────
// Subscription card
// ────────────────────────────────────────────────────────────

function SubscriptionCard({ state }: { state: SubscriptionLoadState }) {
  if (state.status === 'loading' || state.status === 'idle') {
    return (
      <div className="rounded-lg border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-950">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
          <Skeleton className="h-7 w-24" />
        </div>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 px-5 py-4 dark:border-amber-800 dark:bg-amber-950/20">
        <div className="flex items-center gap-3">
          <AlertCircle
            aria-hidden
            className="h-5 w-5 shrink-0 text-amber-700 dark:text-amber-400"
          />
          <div className="min-w-0">
            <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
              Subscription status unavailable
            </p>
            <p className="mt-0.5 text-xs text-amber-800 dark:text-amber-300">{state.message}</p>
          </div>
        </div>
      </div>
    );
  }

  if (state.status === 'absent') {
    return (
      <div className="rounded-lg border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-950">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-neutral-100 p-2.5 dark:bg-neutral-800">
              <CreditCard
                aria-hidden
                className="h-5 w-5 text-neutral-500"
              />
            </div>
            <div>
              <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                No active subscription
              </p>
              <p className="text-xs text-neutral-500">
                Contact support to activate a plan for this exam center.
              </p>
            </div>
          </div>
          <Link href="/billing">
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1 text-xs"
            >
              Billing{' '}
              <ChevronRight
                aria-hidden
                className="h-3 w-3"
              />
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const { info } = state;
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-950">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
              {info.planName}
            </p>
            <Badge
              variant="outline"
              className={cn(
                'text-[10px] font-medium',
                info.isActive
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400'
                  : 'border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-400',
              )}
            >
              {info.isActive ? 'Active' : 'Expired'}
            </Badge>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-500">
            <span className="flex items-center gap-1">
              <Shield
                aria-hidden
                className="h-3 w-3"
              />
              {getTierLabel(info.tier)}
            </span>
            <span className="flex items-center gap-1 tabular-nums">
              <Calendar
                aria-hidden
                className="h-3 w-3"
              />
              {info.expiresAt ? `Expires ${formatDate(info.expiresAt)}` : 'No expiry date'}
            </span>
          </div>
        </div>
        <Link href="/billing">
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1 text-xs"
          >
            Manage{' '}
            <ChevronRight
              aria-hidden
              className="h-3 w-3"
            />
          </Button>
        </Link>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Profile form
// ────────────────────────────────────────────────────────────

function ProfileForm({
  user,
  onUpdate,
}: {
  user: UserProfile;
  onUpdate: (data: { name: string }) => Promise<void>;
}) {
  const [name, setName] = useState(user.name);
  const [isEditing, setIsEditing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isEditing) setName(user.name);
  }, [user.name, isEditing]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmed = name.trim();
    if (!trimmed) {
      setError('Name is required.');
      return;
    }
    if (trimmed.length > 120) {
      setError('Name is too long.');
      return;
    }
    if (trimmed === user.name) {
      setIsEditing(false);
      return;
    }

    setIsSubmitting(true);
    try {
      await onUpdate({ name: trimmed });
      setIsEditing(false);
      toast.success('Profile updated.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update profile.';
      setError(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    setName(user.name);
    setError(null);
    setIsEditing(false);
  };

  if (!isEditing) {
    return (
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-medium text-neutral-500">Full name</p>
            <p className="mt-0.5 text-sm text-neutral-900 dark:text-neutral-50">{user.name}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setIsEditing(true)}
            className="h-7 shrink-0 text-xs"
          >
            Edit
          </Button>
        </div>

        <Separator />

        <div className="min-w-0">
          <p className="text-xs font-medium text-neutral-500">Email</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-2">
            <p className="text-sm text-neutral-900 dark:text-neutral-50">{user.email}</p>
            {user.emailVerified ? (
              <Badge
                variant="outline"
                className="gap-1 border-emerald-300 bg-emerald-50 text-[10px] text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400"
              >
                <Check
                  aria-hidden
                  className="h-3 w-3"
                />
                Verified
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="gap-1 border-amber-300 bg-amber-50 text-[10px] text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400"
              >
                <AlertCircle
                  aria-hidden
                  className="h-3 w-3"
                />
                Unverified
              </Badge>
            )}
          </div>
          <p className="mt-1 text-xs text-neutral-500">
            Email changes require a confirmation link and are handled by support.
          </p>
        </div>

        <Separator />

        <div>
          <p className="text-xs font-medium text-neutral-500">Member since</p>
          <p className="mt-0.5 text-sm text-neutral-900 dark:text-neutral-50">
            {formatDate(user.createdAt)}
          </p>
        </div>
      </div>
    );
  }

  const nameErrorId = 'profile-name-error';

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4"
      noValidate
    >
      <div className="space-y-1.5">
        <Label htmlFor="profile-name">Full name</Label>
        <Input
          id="profile-name"
          name="name"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-invalid={!!error}
          aria-describedby={error ? nameErrorId : undefined}
          disabled={isSubmitting}
          className={error ? 'border-rose-500' : undefined}
          placeholder="Your full name"
        />
        {error && (
          <p
            id={nameErrorId}
            className="text-xs text-rose-600 dark:text-rose-400"
          >
            {error}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="profile-email-readonly">Email</Label>
        <Input
          id="profile-email-readonly"
          type="email"
          value={user.email}
          readOnly
          disabled
          className="bg-neutral-50 text-neutral-500 dark:bg-neutral-900"
        />
      </div>

      <div className="flex gap-2 pt-1">
        <Button
          type="submit"
          size="sm"
          disabled={isSubmitting}
          className="h-8 gap-1.5"
        >
          {isSubmitting ? (
            <>
              <Loader2
                aria-hidden
                className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
              />
              Saving…
            </>
          ) : (
            <>
              <Check
                aria-hidden
                className="h-3.5 w-3.5"
              />
              Save changes
            </>
          )}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleCancel}
          disabled={isSubmitting}
          className="h-8"
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

// ────────────────────────────────────────────────────────────
// Change password
// ────────────────────────────────────────────────────────────

interface ChangePasswordProps {
  userEmail: string;
  isRecoveryMode: boolean;
  onExitRecoveryMode: () => void;
  onChangePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  onSetNewPasswordDirectly: (newPassword: string) => Promise<void>;
  onSendResetLink: () => Promise<void>;
}

function ChangePassword({
  userEmail,
  isRecoveryMode,
  onExitRecoveryMode,
  onChangePassword,
  onSetNewPasswordDirectly,
  onSendResetLink,
}: ChangePasswordProps) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<{
    current?: string;
    next?: string;
    confirm?: string;
  }>({});

  // View password toggle states
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Forgot password & reset link states
  const [showForgotPanel, setShowForgotPanel] = useState(false);
  const [isSendingLink, setIsSendingLink] = useState(false);
  const [linkSent, setLinkSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // Cooldown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const interval = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldown]);

  const handleSendLink = async () => {
    if (isSendingLink || cooldown > 0) return;
    setIsSendingLink(true);
    try {
      await onSendResetLink();
      setLinkSent(true);
      setCooldown(60);
      toast.success(`Password configuration link sent to ${userEmail}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send configuration link.');
    } finally {
      setIsSendingLink(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const e2: typeof errors = {};
    if (!isRecoveryMode && !current) {
      e2.current = 'Current password is required.';
    }
    if (!next) {
      e2.next = 'New password is required.';
    } else if (next.length < MIN_PASSWORD_LENGTH) {
      e2.next = `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
    }
    if (next !== confirm) {
      e2.confirm = 'Passwords do not match.';
    }
    if (Object.keys(e2).length > 0) {
      setErrors(e2);
      return;
    }

    setIsSubmitting(true);
    try {
      if (isRecoveryMode) {
        await onSetNewPasswordDirectly(next);
        setNext('');
        setConfirm('');
        toast.success('Your new password has been configured successfully.');
        onExitRecoveryMode();
      } else {
        await onChangePassword(current, next);
        setCurrent('');
        setNext('');
        setConfirm('');
        toast.success('Password changed successfully.');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save password.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Recovery mode active notice */}
      {isRecoveryMode && (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50/80 p-4 dark:border-emerald-800 dark:bg-emerald-950/30">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-emerald-100 p-2 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-400">
              <KeyRound className="h-4 w-4" />
            </div>
            <div className="flex-1 space-y-1">
              <h4 className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
                Configuring Password via Email Link
              </h4>
              <p className="text-xs text-emerald-800 dark:text-emerald-300">
                You opened a secure configuration link sent to{' '}
                <span className="font-semibold">{userEmail}</span>. Enter your new password below —
                your old password is not required.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Forgot password expandable alert panel */}
      {showForgotPanel && !isRecoveryMode && (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50/80 p-4 dark:border-emerald-800 dark:bg-emerald-950/30">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-emerald-100 p-2 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-400">
              <KeyRound className="h-4 w-4" />
            </div>
            <div className="flex-1 space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-emerald-950 dark:text-emerald-100">
                  Forgot your password?
                </h4>
                <button
                  type="button"
                  onClick={() => setShowForgotPanel(false)}
                  className="text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
                >
                  Close
                </button>
              </div>
              <p className="text-xs text-emerald-800 dark:text-emerald-300">
                We can send a secure configuration link to{' '}
                <span className="font-semibold">{userEmail}</span>. You can follow that link to set
                a new password without entering your current one.
              </p>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button
                  id="send-reset-link-btn"
                  type="button"
                  size="sm"
                  disabled={isSendingLink || cooldown > 0}
                  onClick={() => void handleSendLink()}
                  className="h-8 gap-1.5 bg-emerald-600 text-xs text-white shadow-sm hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-700"
                >
                  {isSendingLink ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
                      Sending link…
                    </>
                  ) : cooldown > 0 ? (
                    <>
                      <Mail className="h-3.5 w-3.5" />
                      Resend link in {cooldown}s
                    </>
                  ) : (
                    <>
                      <Mail className="h-3.5 w-3.5" />
                      Send link to configure password
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowForgotPanel(false)}
                  className="h-8 text-xs text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
                >
                  Dismiss
                </Button>
              </div>

              {linkSent && (
                <div className="flex items-center gap-1.5 pt-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <span>
                    Configuration link sent! Check your inbox (and spam folder) to set your
                    password.
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main password form */}
      <form
        onSubmit={handleSubmit}
        className="space-y-4"
        noValidate
      >
        {/* Current Password Field (only in standard mode) */}
        {!isRecoveryMode && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="current-password">Current password</Label>
              <button
                id="forgot-password-trigger-btn"
                type="button"
                onClick={() => setShowForgotPanel((prev) => !prev)}
                className="text-xs font-medium text-emerald-600 hover:text-emerald-700 hover:underline dark:text-emerald-400 dark:hover:text-emerald-300"
              >
                {showForgotPanel ? 'Hide forgot password' : 'Forgot password?'}
              </button>
            </div>
            <div className="relative">
              <Input
                id="current-password"
                name="current-password"
                type={showCurrent ? 'text' : 'password'}
                autoComplete="current-password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                aria-invalid={!!errors.current}
                disabled={isSubmitting}
                className={cn(
                  'pr-10',
                  errors.current && 'border-rose-500 focus-visible:ring-rose-500',
                )}
                placeholder="Enter current password"
              />
              <button
                id="toggle-current-password-btn"
                type="button"
                onClick={() => setShowCurrent((prev) => !prev)}
                tabIndex={-1}
                className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded p-1 text-neutral-400 hover:text-neutral-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-neutral-500 dark:hover:text-neutral-300"
                aria-label={showCurrent ? 'Hide current password' : 'Show current password'}
              >
                {showCurrent ? (
                  <EyeOff
                    aria-hidden
                    className="h-4 w-4"
                  />
                ) : (
                  <Eye
                    aria-hidden
                    className="h-4 w-4"
                  />
                )}
              </button>
            </div>
            {errors.current && (
              <p className="text-xs text-rose-600 dark:text-rose-400">{errors.current}</p>
            )}
          </div>
        )}

        {/* New Password Field */}
        <div className="space-y-1.5">
          <Label htmlFor="new-password">New password</Label>
          <div className="relative">
            <Input
              id="new-password"
              name="new-password"
              type={showNext ? 'text' : 'password'}
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              aria-invalid={!!errors.next}
              disabled={isSubmitting}
              className={cn('pr-10', errors.next && 'border-rose-500 focus-visible:ring-rose-500')}
              placeholder="Enter new password (min. 8 characters)"
            />
            <button
              id="toggle-new-password-btn"
              type="button"
              onClick={() => setShowNext((prev) => !prev)}
              tabIndex={-1}
              className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded p-1 text-neutral-400 hover:text-neutral-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-neutral-500 dark:hover:text-neutral-300"
              aria-label={showNext ? 'Hide new password' : 'Show new password'}
            >
              {showNext ? (
                <EyeOff
                  aria-hidden
                  className="h-4 w-4"
                />
              ) : (
                <Eye
                  aria-hidden
                  className="h-4 w-4"
                />
              )}
            </button>
          </div>
          {errors.next && <p className="text-xs text-rose-600 dark:text-rose-400">{errors.next}</p>}
        </div>

        {/* Confirm New Password Field */}
        <div className="space-y-1.5">
          <Label htmlFor="confirm-password">Confirm new password</Label>
          <div className="relative">
            <Input
              id="confirm-password"
              name="confirm-password"
              type={showConfirm ? 'text' : 'password'}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              aria-invalid={!!errors.confirm}
              disabled={isSubmitting}
              className={cn(
                'pr-10',
                errors.confirm && 'border-rose-500 focus-visible:ring-rose-500',
              )}
              placeholder="Re-enter new password"
            />
            <button
              id="toggle-confirm-password-btn"
              type="button"
              onClick={() => setShowConfirm((prev) => !prev)}
              tabIndex={-1}
              className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded p-1 text-neutral-400 hover:text-neutral-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-neutral-500 dark:hover:text-neutral-300"
              aria-label={showConfirm ? 'Hide confirmation password' : 'Show confirmation password'}
            >
              {showConfirm ? (
                <EyeOff
                  aria-hidden
                  className="h-4 w-4"
                />
              ) : (
                <Eye
                  aria-hidden
                  className="h-4 w-4"
                />
              )}
            </button>
          </div>
          {errors.confirm && (
            <p className="text-xs text-rose-600 dark:text-rose-400">{errors.confirm}</p>
          )}
        </div>

        {/* Submit and Cancel Buttons */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button
            id="change-password-submit-btn"
            type="submit"
            size="sm"
            disabled={isSubmitting}
            className="h-8 gap-1.5"
          >
            {isSubmitting ? (
              <>
                <Loader2
                  aria-hidden
                  className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
                />
                {isRecoveryMode ? 'Configuring…' : 'Changing…'}
              </>
            ) : (
              <>
                <Shield
                  aria-hidden
                  className="h-3.5 w-3.5"
                />
                {isRecoveryMode ? 'Save new password' : 'Change password'}
              </>
            )}
          </Button>

          {isRecoveryMode && (
            <Button
              id="cancel-recovery-btn"
              type="button"
              variant="outline"
              size="sm"
              onClick={onExitRecoveryMode}
              disabled={isSubmitting}
              className="h-8 text-xs"
            >
              Cancel recovery
            </Button>
          )}
        </div>
      </form>

      {/* Helper card for sending link to configure password (in standard mode) */}
      {!isRecoveryMode && (
        <>
          <Separator />
          <div className="rounded-lg border border-neutral-200 bg-neutral-50/70 p-4 dark:border-neutral-800 dark:bg-neutral-900/40">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div className="min-w-0 space-y-0.5">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                  <Mail className="h-3.5 w-3.5 shrink-0 text-neutral-500" />
                  Configure password via email link
                </p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Forgot your password or need email setup? Send a link to{' '}
                  <span className="font-medium text-neutral-700 dark:text-neutral-300">
                    {userEmail}
                  </span>{' '}
                  to configure it directly.
                </p>
              </div>
              <Button
                id="send-config-link-secondary-btn"
                type="button"
                variant="outline"
                size="sm"
                disabled={isSendingLink || cooldown > 0}
                onClick={() => void handleSendLink()}
                className="h-8 shrink-0 gap-1.5 text-xs"
              >
                {isSendingLink ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
                    Sending…
                  </>
                ) : cooldown > 0 ? (
                  `Resend in ${cooldown}s`
                ) : (
                  <>
                    <Mail className="h-3.5 w-3.5" />
                    Send configuration link
                  </>
                )}
              </Button>
            </div>
            {linkSent && !showForgotPanel && (
              <p className="mt-2.5 flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                Link sent to {userEmail}. Check your inbox to configure your password.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Avatar (read-only; storage not configured)
// ────────────────────────────────────────────────────────────

function AvatarDisplay({ user }: { user: UserProfile }) {
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
      <Avatar className="h-20 w-20">
        {user.image ? (
          <AvatarImage
            src={user.image}
            alt=""
          />
        ) : null}
        <AvatarFallback className="text-lg">{getInitials(user.name)}</AvatarFallback>
      </Avatar>
      <div className="text-center sm:text-left">
        <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">{user.name}</p>
        <p className="text-xs text-neutral-500">{user.email}</p>
        <p className="mt-1 text-[11px] text-neutral-400">
          Avatar storage is not configured. Contact support to enable profile pictures.
        </p>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Section navigation
// ────────────────────────────────────────────────────────────

function SectionNav({
  active,
  onChange,
}: {
  active: 'profile' | 'security';
  onChange: (s: 'profile' | 'security') => void;
}) {
  const items = [
    { id: 'profile' as const, label: 'Profile', icon: User },
    { id: 'security' as const, label: 'Security', icon: Shield },
  ];
  return (
    <div
      role="tablist"
      aria-label="Settings sections"
      className="flex gap-1 lg:flex-col"
    >
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = active === item.id;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-controls={`panel-${item.id}`}
            id={`tab-${item.id}`}
            onClick={() => onChange(item.id)}
            className={cn(
              'flex flex-1 items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors motion-reduce:transition-none lg:flex-none',
              'focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1 focus-visible:ring-offset-white focus-visible:outline-none dark:focus-visible:ring-offset-neutral-950',
              isActive
                ? 'bg-neutral-100 font-medium text-neutral-900 dark:bg-neutral-800 dark:text-neutral-50'
                : 'text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-900 dark:hover:text-neutral-100',
            )}
          >
            <Icon
              aria-hidden
              className="h-4 w-4 shrink-0"
            />
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Page
// ────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileLoadState>({ status: 'loading' });
  const [subscription, setSubscription] = useState<SubscriptionLoadState>({ status: 'idle' });
  const [active, setActive] = useState<'profile' | 'security'>('profile');
  const [signingOut, setSigningOut] = useState(false);
  const [isRecoveryMode, setIsRecoveryMode] = useState(false);

  const requestIdRef = useRef(0);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const searchParams = new URLSearchParams(window.location.search);
      const isReset = searchParams.get('reset') === 'true';
      const isSecurityTab = searchParams.get('tab') === 'security';
      if (isReset || isSecurityTab) {
        setActive('security');
      }
      if (isReset) {
        setIsRecoveryMode(true);
      }
    }

    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setActive('security');
        setIsRecoveryMode(true);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const loadProfile = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setProfile({ status: 'loading' });

    const supabase = createClient();
    const { data, error } = await supabase.auth.getUser();
    if (requestId !== requestIdRef.current) return;

    if (error || !data.user) {
      setProfile({ status: 'error', message: 'Your session has ended. Please sign in again.' });
      setSubscription({ status: 'idle' });
      router.replace('/login');
      return;
    }

    const authUser = data.user;
    const nextUser: UserProfile = {
      id: authUser.id,
      name:
        (authUser.user_metadata?.name as string | undefined)?.trim() ||
        authUser.email?.split('@')[0] ||
        'User',
      email: authUser.email ?? '',
      emailVerified: Boolean(authUser.email_confirmed_at),
      image: (authUser.user_metadata?.avatar_url as string | undefined) || null,
      createdAt: authUser.created_at ? new Date(authUser.created_at) : new Date(),
    };

    setProfile({ status: 'ready', user: nextUser });

    setSubscription({ status: 'loading' });

    const ecRes = await supabase
      .from('exam_centers')
      .select('id')
      .eq('owner_id', authUser.id)
      .eq('is_active', true)
      .eq('is_deleted', false)
      .maybeSingle();
    if (requestId !== requestIdRef.current) return;

    if (ecRes.error) {
      setSubscription({
        status: 'error',
        message: 'Could not reach the subscription service. Try again later.',
      });
      return;
    }
    if (!ecRes.data) {
      setSubscription({ status: 'absent' });
      return;
    }

    const payRes = await supabase
      .from('payments')
      .select('plan_name, plan_id, end_date')
      .eq('exam_center_id', ecRes.data.id)
      .eq('status', 'paid')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (requestId !== requestIdRef.current) return;

    if (payRes.error) {
      setSubscription({
        status: 'error',
        message: 'Could not read the current plan. Try again later.',
      });
      return;
    }
    if (!payRes.data) {
      setSubscription({ status: 'absent' });
      return;
    }

    const endDate = payRes.data.end_date ? new Date(payRes.data.end_date) : null;
    setSubscription({
      status: 'ready',
      info: {
        tier: payRes.data.plan_id || 'inactive',
        planName: payRes.data.plan_name || getTierLabel(payRes.data.plan_id || 'inactive'),
        expiresAt: endDate ? endDate.toISOString() : null,
        isActive: !endDate || endDate.getTime() > Date.now(),
      },
    });
  }, [router]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const handleUpdateName = useCallback(async (data: { name: string }) => {
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ data: { name: data.name } });
    if (error) throw new Error(error.message || 'Failed to update profile.');
    setProfile((prev) =>
      prev.status === 'ready' ? { status: 'ready', user: { ...prev.user, name: data.name } } : prev,
    );
  }, []);

  const handleChangePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      const supabase = createClient();

      const email = profile.status === 'ready' ? profile.user.email : null;
      if (!email) {
        throw new Error('Your email is unavailable, so reauthentication cannot proceed.');
      }

      // Step 1 — verify the current password by reauthenticating.
      const { data: reauthData, error: reauthError } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      });
      if (reauthError) {
        const msg = reauthError.message.toLowerCase();
        if (msg.includes('invalid') || msg.includes('credentials')) {
          throw new Error('Your current password is incorrect.');
        }
        if (msg.includes('rate')) {
          throw new Error('Too many attempts. Wait a moment and try again.');
        }
        throw new Error('Could not verify your current password. Check your connection and retry.');
      }
      if (!reauthData.session) {
        throw new Error('Reauthentication did not return a session. Please retry.');
      }

      // Step 2 — update the password. This is a separate request and can fail
      // even after reauthentication if the session changes in between.
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) {
        const msg = updateError.message.toLowerCase();
        if (msg.includes('session') || msg.includes('jwt') || msg.includes('expired')) {
          throw new Error('Your session changed before the password could be updated. Try again.');
        }
        if (msg.includes('weak') || msg.includes('pwned') || msg.includes('compromis')) {
          throw new Error('That password is too weak or has appeared in a data breach.');
        }
        throw new Error(updateError.message || 'Failed to change password.');
      }
    },
    [profile],
  );

  const handleExitRecoveryMode = useCallback(() => {
    setIsRecoveryMode(false);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete('reset');
      window.history.replaceState({}, '', url.pathname + (url.search ? url.search : ''));
    }
  }, []);

  const handleSetNewPasswordDirectly = useCallback(async (newPassword: string) => {
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      const msg = error.message.toLowerCase();
      if (msg.includes('weak') || msg.includes('pwned') || msg.includes('compromis')) {
        throw new Error('That password is too weak or has appeared in a data breach.');
      }
      throw new Error(error.message || 'Failed to configure password.');
    }
  }, []);

  const handleSendResetLink = useCallback(async () => {
    const email = profile.status === 'ready' ? profile.user.email : null;
    if (!email) {
      throw new Error('Your email is unavailable, so the configuration link cannot be sent.');
    }
    const supabase = createClient();
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const pathname =
      typeof window !== 'undefined' ? window.location.pathname : '/exam-center/settings/profile';
    const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(
      `${pathname}?tab=security&reset=true`,
    )}`;

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });

    if (error) {
      const msg = error.message.toLowerCase();
      if (msg.includes('rate')) {
        throw new Error('Too many requests. Please wait a moment and try again.');
      }
      throw new Error(error.message || 'Failed to send password configuration link.');
    }
  }, [profile]);

  const handleSignOut = useCallback(async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signOut();
      if (error) {
        toast.error(error.message || 'Sign out failed.');
        return;
      }
      router.replace('/login');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Sign out failed.');
    } finally {
      setSigningOut(false);
    }
  }, [router, signingOut]);

  if (profile.status === 'loading') {
    return (
      <div className="mx-auto max-w-5xl space-y-6 p-6">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-20 w-full rounded-lg" />
        <div className="grid gap-6 lg:grid-cols-[200px_1fr]">
          <Skeleton className="h-24 rounded-lg" />
          <Skeleton className="h-80 rounded-lg" />
        </div>
      </div>
    );
  }

  if (profile.status === 'error') {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center justify-center gap-4 py-24 text-center">
        <AlertCircle
          aria-hidden
          className="h-8 w-8 text-neutral-400"
        />
        <div>
          <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
            {profile.message}
          </p>
          <p className="mt-1 text-xs text-neutral-500">
            You can retry loading this page or sign in again.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void loadProfile()}
            className="h-8"
          >
            Retry
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => router.replace('/login')}
            className="h-8"
          >
            Sign in
          </Button>
        </div>
      </div>
    );
  }

  const user = profile.user;

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-6 py-6">
      <PageHeader
        title="Settings"
        description="Manage your account and security preferences."
        icon={UserCircle}
        actions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void handleSignOut()}
            disabled={signingOut}
            className="h-8 gap-1.5 text-rose-600 hover:text-rose-700 dark:text-rose-400"
          >
            {signingOut ? (
              <Loader2
                aria-hidden
                className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
              />
            ) : (
              <LogOut
                aria-hidden
                className="h-3.5 w-3.5"
              />
            )}
            Sign out
          </Button>
        }
      />

      <SubscriptionCard state={subscription} />

      <div className="grid gap-5 lg:grid-cols-[200px_1fr]">
        <div className="flex items-center gap-3 lg:flex-col lg:items-stretch">
          <SectionNav
            active={active}
            onChange={setActive}
          />
        </div>

        <AnimatePresence mode="wait">
          {active === 'profile' && (
            <motion.div
              key="profile"
              role="tabpanel"
              id="panel-profile"
              aria-labelledby="tab-profile"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              className="motion-reduce:transition-none"
            >
              <Card>
                <CardHeader className="pb-4">
                  <CardTitle className="flex items-center gap-2 text-base font-semibold">
                    <User
                      aria-hidden
                      className="h-4 w-4 text-neutral-500"
                    />
                    Profile
                  </CardTitle>
                  <CardDescription>
                    Your display name and profile picture appear across TestForge.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <AvatarDisplay user={user} />
                  <Separator />
                  <ProfileForm
                    user={user}
                    onUpdate={handleUpdateName}
                  />
                </CardContent>
              </Card>
            </motion.div>
          )}

          {active === 'security' && (
            <motion.div
              key="security"
              role="tabpanel"
              id="panel-security"
              aria-labelledby="tab-security"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              className="motion-reduce:transition-none"
            >
              <Card>
                <CardHeader className="pb-4">
                  <CardTitle className="flex items-center gap-2 text-base font-semibold">
                    <Shield
                      aria-hidden
                      className="h-4 w-4 text-neutral-500"
                    />
                    {isRecoveryMode ? 'Configure Password' : 'Password'}
                  </CardTitle>
                  <CardDescription>
                    {isRecoveryMode
                      ? 'Set a new password for your account using your verified email link.'
                      : 'Enter your current password to set a new one, or send a link to configure it via email.'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <ChangePassword
                    userEmail={user.email}
                    isRecoveryMode={isRecoveryMode}
                    onExitRecoveryMode={handleExitRecoveryMode}
                    onChangePassword={handleChangePassword}
                    onSetNewPasswordDirectly={handleSetNewPasswordDirectly}
                    onSendResetLink={handleSendResetLink}
                  />
                  <Alert className="border-neutral-200 dark:border-neutral-800">
                    <AlertCircle
                      aria-hidden
                      className="h-4 w-4 text-neutral-500"
                    />
                    <AlertDescription className="text-xs text-neutral-600 dark:text-neutral-400">
                      For stronger account security, use a unique password of at least 8 characters
                      that you do not reuse elsewhere.
                    </AlertDescription>
                  </Alert>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
