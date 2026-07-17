// app/(dashboard)/settings/profile/page.tsx
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertCircle,
  Calendar,
  Camera,
  Check,
  ChevronRight,
  CreditCard,
  Loader2,
  LogOut,
  Shield,
  User,
  UserCircle,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import { getCurrentSubscription } from '@/lib/actions2/subscription';
import {
  getUserBasicInfo,
  removeUserAvatar,
  updateUserProfile,
  uploadUserAvatar,
} from '@/lib/actions2/user';
import { authClient } from '@/lib/auth-client';
import { cn } from '@/lib/utils';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

import { PageHeader } from '@/components/layout/page-layout';

// ============================================================================
// Types
// ============================================================================

interface UserProfile {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface SubscriptionInfo {
  tier: string;
  planName: string;
  expiresAt: string | null;
  isActive: boolean;
}

// ============================================================================
// Helper Functions
// ============================================================================

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

function formatDateShort(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function getTierColor(tier: string): string {
  switch (tier) {
    case 'enterprise':
      return 'from-amber-500 to-amber-600';
    case 'premium':
      return 'from-emerald-500 to-emerald-600';
    case 'trial':
      return 'from-blue-500 to-blue-600';
    default:
      return 'from-neutral-500 to-neutral-600';
  }
}

function getTierLabel(tier: string): string {
  switch (tier) {
    case 'enterprise':
      return 'Enterprise';
    case 'premium':
      return 'Premium';
    case 'trial':
      return 'Trial';
    default:
      return 'Inactive';
  }
}

// ============================================================================
// Subscription Card Component
// ============================================================================

interface SubscriptionCardProps {
  subscription: SubscriptionInfo | null;
  isLoading: boolean;
}

function SubscriptionCard({ subscription, isLoading }: SubscriptionCardProps) {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <Skeleton className="h-12 w-12 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-48" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!subscription) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <div className="rounded-full bg-neutral-100 p-3 dark:bg-neutral-800">
              <CreditCard className="h-6 w-6 text-neutral-400" />
            </div>
            <div>
              <p className="font-medium text-neutral-900 dark:text-neutral-50">
                No Active Subscription
              </p>
              <p className="text-sm text-neutral-500">Contact support to activate your plan</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const isActive = subscription.isActive;
  const tierColor = getTierColor(subscription.tier);
  const tierLabel = getTierLabel(subscription.tier);

  return (
    <Card className="overflow-hidden border-0 shadow-sm">
      <div className={cn('bg-gradient-to-r p-6 text-white', tierColor)}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-white/80">Current Plan</p>
            <h3 className="text-2xl font-bold">{subscription.planName}</h3>
          </div>
          <Badge
            variant="outline"
            className={cn(
              'border-white/30 text-white',
              isActive ? 'bg-white/20' : 'bg-rose-500/30',
            )}
          >
            {isActive ? 'Active' : 'Expired'}
          </Badge>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-white/80">
          <div className="flex items-center gap-1.5">
            <Calendar className="h-4 w-4" />
            <span>
              Expires: {subscription.expiresAt ? formatDate(subscription.expiresAt) : 'Never'}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Shield className="h-4 w-4" />
            <span>{tierLabel}</span>
          </div>
        </div>
      </div>
      <div className="bg-neutral-50 px-6 py-3 dark:bg-neutral-900/50">
        <div className="flex items-center justify-between text-sm">
          <span className="text-neutral-500">
            Subscription ID: {subscription.tier.toUpperCase()}
          </span>
          <Link href="/billing">
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 text-xs"
            >
              Manage <ChevronRight className="h-3 w-3" />
            </Button>
          </Link>
        </div>
      </div>
    </Card>
  );
}

// ============================================================================
// Profile Form Component
// ============================================================================

interface ProfileFormProps {
  user: UserProfile;
  onUpdate: (data: { name: string; email: string }) => Promise<void>;
  isLoading: boolean;
}

function ProfileForm({ user, onUpdate, isLoading }: ProfileFormProps) {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [isEditing, setIsEditing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const newErrors: { name?: string; email?: string } = {};
    if (!name.trim()) newErrors.name = 'Name is required';
    if (!email.trim()) newErrors.email = 'Email is required';
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = 'Invalid email address';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setIsSubmitting(true);
    try {
      await onUpdate({ name: name.trim(), email: email.trim() });
      setIsEditing(false);
      toast.success('Profile updated');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update profile');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    setName(user.name);
    setEmail(user.email);
    setIsEditing(false);
    setErrors({});
  };

  if (!isEditing) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-neutral-500">Full Name</p>
            <p className="text-base font-medium text-neutral-900 dark:text-neutral-50">
              {user.name}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsEditing(true)}
            className="gap-1.5"
          >
            Edit
          </Button>
        </div>
        <Separator />
        <div>
          <p className="text-sm font-medium text-neutral-500">Email Address</p>
          <div className="flex items-center gap-2">
            <p className="text-base font-medium text-neutral-900 dark:text-neutral-50">
              {user.email}
            </p>
            {user.emailVerified ? (
              <Badge
                variant="outline"
                className="border-emerald-200 text-emerald-600 dark:border-emerald-800 dark:text-emerald-400"
              >
                <Check className="mr-1 h-3 w-3" />
                Verified
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="border-amber-200 text-amber-600 dark:border-amber-800 dark:text-amber-400"
              >
                <AlertCircle className="mr-1 h-3 w-3" />
                Unverified
              </Badge>
            )}
          </div>
        </div>
        <Separator />
        <div>
          <p className="text-sm font-medium text-neutral-500">Member Since</p>
          <p className="text-base font-medium text-neutral-900 dark:text-neutral-50">
            {formatDate(user.createdAt)}
          </p>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4"
    >
      <div className="space-y-2">
        <Label htmlFor="profile-name">Full Name</Label>
        <Input
          id="profile-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={errors.name ? 'border-rose-500' : ''}
          placeholder="Enter your full name"
        />
        {errors.name && <p className="text-xs text-rose-500">{errors.name}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="profile-email">Email Address</Label>
        <Input
          id="profile-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={errors.email ? 'border-rose-500' : ''}
          placeholder="Enter your email"
        />
        {errors.email && <p className="text-xs text-rose-500">{errors.email}</p>}
      </div>

      <div className="flex gap-3 pt-2">
        <Button
          type="submit"
          disabled={isSubmitting || isLoading}
          className="gap-1.5"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Check className="h-4 w-4" />
              Save Changes
            </>
          )}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={handleCancel}
          className="gap-1.5"
        >
          <X className="h-4 w-4" />
          Cancel
        </Button>
      </div>
    </form>
  );
}

// ============================================================================
// Change Password Component
// ============================================================================

interface ChangePasswordProps {
  onChangePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}

function ChangePassword({ onChangePassword }: ChangePasswordProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<{
    currentPassword?: string;
    newPassword?: string;
    confirmPassword?: string;
  }>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const newErrors: typeof errors = {};
    if (!currentPassword) newErrors.currentPassword = 'Current password is required';
    if (!newPassword) newErrors.newPassword = 'New password is required';
    if (newPassword.length < 8) newErrors.newPassword = 'Password must be at least 8 characters';
    if (newPassword !== confirmPassword) newErrors.confirmPassword = 'Passwords do not match';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setIsSubmitting(true);
    try {
      await onChangePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast.success('Password changed');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to change password');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4"
    >
      <div className="space-y-2">
        <Label htmlFor="current-password">Current Password</Label>
        <Input
          id="current-password"
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          className={errors.currentPassword ? 'border-rose-500' : ''}
          placeholder="Enter current password"
        />
        {errors.currentPassword && (
          <p className="text-xs text-rose-500">{errors.currentPassword}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="new-password">New Password</Label>
        <Input
          id="new-password"
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className={errors.newPassword ? 'border-rose-500' : ''}
          placeholder="Enter new password (min 8 characters)"
        />
        {errors.newPassword && <p className="text-xs text-rose-500">{errors.newPassword}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirm-password">Confirm New Password</Label>
        <Input
          id="confirm-password"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className={errors.confirmPassword ? 'border-rose-500' : ''}
          placeholder="Confirm new password"
        />
        {errors.confirmPassword && (
          <p className="text-xs text-rose-500">{errors.confirmPassword}</p>
        )}
      </div>

      <Button
        type="submit"
        disabled={isSubmitting}
        className="gap-1.5"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Changing...
          </>
        ) : (
          <>
            <Shield className="h-4 w-4" />
            Change Password
          </>
        )}
      </Button>
    </form>
  );
}

// ============================================================================
// Avatar Upload Component
// ============================================================================

interface AvatarUploadProps {
  user: UserProfile;
  onAvatarUpdate: (file: File) => Promise<void>;
  onAvatarRemove: () => Promise<void>;
  isLoading: boolean;
}

function AvatarUpload({ user, onAvatarUpdate, onAvatarRemove, isLoading }: AvatarUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be less than 5MB');
      return;
    }

    setIsUploading(true);
    try {
      await onAvatarUpdate(file);
      toast.success('Profile picture updated');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update profile picture');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemove = async () => {
    setIsUploading(true);
    try {
      await onAvatarRemove();
      toast.success('Profile picture removed');
      setShowRemoveDialog(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to remove profile picture');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
      <div className="relative">
        <Avatar className="h-24 w-24">
          {user.image && (
            <AvatarImage
              src={user.image}
              alt={user.name}
            />
          )}
          <AvatarFallback className="text-2xl">{getInitials(user.name)}</AvatarFallback>
        </Avatar>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="outline"
                className="absolute -right-1 -bottom-1 h-8 w-8 rounded-full bg-white dark:bg-neutral-950"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading || isLoading}
              >
                {isUploading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Camera className="h-3.5 w-3.5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Change profile picture</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
          disabled={isUploading || isLoading}
        />
      </div>

      <div className="text-center sm:text-left">
        <p className="font-semibold text-neutral-900 dark:text-neutral-50">{user.name}</p>
        <p className="text-sm text-neutral-500">{user.email}</p>
        {user.image && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowRemoveDialog(true)}
            disabled={isUploading || isLoading}
            className="mt-1 h-7 text-xs text-rose-500 hover:text-rose-600"
          >
            Remove photo
          </Button>
        )}
      </div>

      <Dialog
        open={showRemoveDialog}
        onOpenChange={setShowRemoveDialog}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove Profile Picture</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove your profile picture? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowRemoveDialog(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRemove}
              disabled={isUploading}
            >
              {isUploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Removing...
                </>
              ) : (
                'Remove'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================================
// Sidebar Navigation
// ============================================================================

interface SidebarNavProps {
  activeSection: 'profile' | 'security';
  onSectionChange: (section: 'profile' | 'security') => void;
}

function SidebarNav({ activeSection, onSectionChange }: SidebarNavProps) {
  const navItems = [
    { id: 'profile' as const, label: 'Profile', icon: User },
    { id: 'security' as const, label: 'Security', icon: Shield },
  ];

  return (
    <nav className="space-y-1">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = activeSection === item.id;
        return (
          <button
            key={item.id}
            onClick={() => onSectionChange(item.id)}
            className={cn(
              'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
              isActive
                ? 'bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-50'
                : 'text-neutral-500 hover:bg-neutral-50 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800/50 dark:hover:text-neutral-50',
            )}
          >
            <Icon className="h-4 w-4" />
            {item.label}
            {isActive && (
              <div className="ml-auto h-1.5 w-1.5 rounded-full bg-neutral-900 dark:bg-neutral-50" />
            )}
          </button>
        );
      })}
    </nav>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<'profile' | 'security'>('profile');

  const fetchUserData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getUserBasicInfo();
      if (!result.success || !result.data) {
        router.push('/login');
        return;
      }

      const session = await authClient.getSession();
      const userData = session.data?.user as UserProfile;

      setUser({
        ...result.data,
        emailVerified: userData?.emailVerified || false,
        createdAt: userData?.createdAt || new Date(),
        updatedAt: userData?.updatedAt || new Date(),
      });

      try {
        const subResult = await getCurrentSubscription();
        if (subResult) {
          setSubscription({
            tier: subResult.tier || 'inactive',
            planName: subResult.planName || 'Inactive',
            expiresAt: subResult.expiresAt || null,
            isActive: subResult.isActive || false,
          });
        }
      } catch (subError) {
        console.warn('Failed to fetch subscription:', subError);
        setSubscription(null);
      }
    } catch (error) {
      console.error('Failed to fetch user data:', error);
      toast.error('Failed to load profile data');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchUserData();
  }, [fetchUserData]);

  const handleUpdateProfile = async (data: { name: string; email: string }) => {
    const result = await updateUserProfile(data);
    if (!result.success) {
      throw new Error((result.error as string) || 'Failed to update profile');
    }
    setUser((prev) => (prev ? { ...prev, name: data.name, email: data.email } : null));
  };

  const handleChangePassword = async (currentPassword: string, newPassword: string) => {
    const result = await authClient.changePassword({
      currentPassword,
      newPassword,
    });

    if (result.error) {
      throw new Error(result.error.message || 'Failed to change password');
    }
  };

  const handleAvatarUpdate = async (file: File) => {
    const formData = new FormData();
    formData.append('avatar', file);

    const result = await uploadUserAvatar(formData);
    if (!result.success) {
      throw new Error(result.error || 'Failed to update avatar');
    }

    setUser((prev) => (prev ? { ...prev, image: result.data?.image || null } : null));
  };

  const handleAvatarRemove = async () => {
    const result = await removeUserAvatar();
    if (!result.success) {
      throw new Error(result.error || 'Failed to remove avatar');
    }

    setUser((prev) => (prev ? { ...prev, image: null } : null));
  };

  const handleSignOut = async () => {
    await authClient.signOut();
    router.push('/login');
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl space-y-6 p-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
          <Skeleton className="h-[200px] rounded-lg" />
          <div className="space-y-6">
            <Skeleton className="h-[180px] rounded-lg" />
            <Skeleton className="h-[300px] rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center gap-4">
        <AlertCircle className="h-12 w-12 text-neutral-400" />
        <p className="text-sm text-neutral-500">Failed to load profile data</p>
        <Button
          onClick={fetchUserData}
          variant="outline"
          size="sm"
        >
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <PageHeader
        title="Profile Settings"
        description="Manage your account settings and preferences"
        icon={UserCircle}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={handleSignOut}
            className="gap-1.5 text-rose-500"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </Button>
        }
      />

      <SubscriptionCard
        subscription={subscription}
        isLoading={loading}
      />

      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <div className="space-y-4">
          <div className="rounded-lg border bg-white p-4 dark:bg-neutral-950">
            <SidebarNav
              activeSection={activeSection}
              onSectionChange={setActiveSection}
            />
          </div>

          <div className="rounded-lg border bg-white p-4 dark:bg-neutral-950">
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10">
                {user.image && (
                  <AvatarImage
                    src={user.image}
                    alt={user.name}
                  />
                )}
                <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-50">
                  {user.name}
                </p>
                <p className="truncate text-xs text-neutral-500">{user.email}</p>
              </div>
            </div>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {activeSection === 'profile' && (
            <motion.div
              key="profile"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base font-semibold">
                    <User className="h-4 w-4 text-neutral-500" />
                    Personal Information
                  </CardTitle>
                  <CardDescription>
                    Update your personal details and profile picture
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <AvatarUpload
                    user={user}
                    onAvatarUpdate={handleAvatarUpdate}
                    onAvatarRemove={handleAvatarRemove}
                    isLoading={loading}
                  />

                  <Separator />

                  <ProfileForm
                    user={user}
                    onUpdate={handleUpdateProfile}
                    isLoading={loading}
                  />
                </CardContent>
              </Card>
            </motion.div>
          )}

          {activeSection === 'security' && (
            <motion.div
              key="security"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base font-semibold">
                    <Shield className="h-4 w-4 text-neutral-500" />
                    Password & Security
                  </CardTitle>
                  <CardDescription>
                    Change your password and manage security settings
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <ChangePassword onChangePassword={handleChangePassword} />

                  <Alert className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20">
                    <AlertCircle className="h-4 w-4 text-amber-600" />
                    <AlertDescription className="text-sm text-amber-700 dark:text-amber-400">
                      For enhanced security, we recommend using a strong, unique password.
                      Two-factor authentication will be available soon.
                    </AlertDescription>
                  </Alert>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="border-t border-neutral-200 pt-4 dark:border-neutral-800">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-400">
          <span>User ID: {user.id}</span>
          <span>Last updated: {formatDateShort(new Date())}</span>
        </div>
      </div>
    </div>
  );
}
