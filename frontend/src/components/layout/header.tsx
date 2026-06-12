// src/components/layout/Header.tsx
'use client';

import { memo, useCallback, useEffect, useState } from 'react';

import { useTheme } from 'next-themes';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { AnimatePresence, motion } from 'framer-motion';
import {
  Infinity as InfinityIcon,
  AlertCircle,
  Bell,
  Building2,
  Check,
  Crown,
  DollarSign,
  LogOut,
  Menu,
  Moon,
  Settings,
  Sparkles,
  Sun,
  User,
  X,
  Zap,
} from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

import { useSidebar } from '@/hooks/useSidebar';
import { useUser } from '@/hooks/useUser';

import { cn } from '@/lib/utils';

import modulesConfig from '@/config/modules.json';

// Memoized logo component to prevent unnecessary re-renders
const Logo = memo(() => (
  <Link href="/exam-center/dashboard" className="flex items-center gap-2 group">
    <div className="relative">
      <div className="absolute inset-0 rounded-lg bg-emerald-500/20 blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      <div className="relative h-8 w-8 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-md shadow-emerald-500/25 group-hover:scale-105 transition-transform duration-200">
        <span className="text-white font-bold text-sm">TF</span>
      </div>
    </div>
    <div className="flex flex-col">
      <span className="text-xl font-bold bg-gradient-to-r from-neutral-900 to-neutral-600 dark:from-white dark:to-neutral-400 bg-clip-text text-transparent">
        TestForge
      </span>
    </div>
  </Link>
));

Logo.displayName = 'Logo';

// Memoized notification bell with badge
const NotificationBell = memo(() => {
  const [hasNotifications, setHasNotifications] = useState(true);

  return (
    <TooltipProvider>
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full relative"
            aria-label="Notifications"
          >
            <Bell className="h-4 w-4" />
            {hasNotifications && (
              <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white dark:ring-neutral-950 animate-pulse" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>Notifications</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});

NotificationBell.displayName = 'NotificationBell';

// Memoized theme toggle
const ThemeToggle = memo(() => {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="h-8 w-8" />;
  }

  return (
    <TooltipProvider>
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="rounded-full"
            aria-label="Toggle theme"
          >
            <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            <span className="sr-only">Toggle theme</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>Toggle theme</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});

ThemeToggle.displayName = 'ThemeToggle';

// Hamburger Menu Button - NOW VISIBLE ON ALL SCREENS
const HamburgerButton = memo(() => {
  const { toggle, isOpen } = useSidebar();

  return (
    <TooltipProvider>
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggle}
            className="rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800"
            aria-label={isOpen ? 'Close sidebar' : 'Open sidebar'}
          >
            <AnimatePresence mode="wait" initial={false}>
              {isOpen ? (
                <motion.div
                  key="close"
                  initial={{ rotate: -180, opacity: 0.5 }}
                  animate={{ rotate: 0, opacity: 1 }}
                  exit={{ rotate: 180, opacity: 0.5 }}
                  transition={{ duration: 0.2 }}
                >
                  <X className="h-5 w-5" />
                </motion.div>
              ) : (
                <motion.div
                  key="menu"
                  initial={{ rotate: 180, opacity: 0.5 }}
                  animate={{ rotate: 0, opacity: 1 }}
                  exit={{ rotate: -180, opacity: 0.5 }}
                  transition={{ duration: 0.2 }}
                >
                  <Menu className="h-5 w-5" />
                </motion.div>
              )}
            </AnimatePresence>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>{isOpen ? 'Close sidebar' : 'Open sidebar'}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});

HamburgerButton.displayName = 'HamburgerButton';
// components/layout/Header.tsx - Update UserMenu component only

// User menu component
const UserMenu = memo(() => {
  const { user, isLoading, signOut } = useUser();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [subscription, setSubscription] = useState<{
    tier: string;
    planName: string;
    expiresAt: string | null;
    daysLeft: number;
  } | null>(null);
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);

  // Fetch subscription info using existing server action when menu opens
  useEffect(() => {
    if (isOpen && !subscription && !subscriptionLoading) {
      const fetchSubscription = async () => {
        setSubscriptionLoading(true);
        try {
          const { getCurrentSubscription } = await import('@/app/actions/onboarding');
          const subData = await getCurrentSubscription();

          let daysLeft = 0;
          if (subData.expiresAt) {
            const expiry = new Date(subData.expiresAt);
            const now = new Date();
            daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            daysLeft = Math.max(0, daysLeft);
          }

          setSubscription({
            tier: subData.tier,
            planName:
              subData.planName ||
              (subData.tier === 'premium'
                ? 'Premium'
                : subData.tier === 'enterprise'
                  ? 'Enterprise'
                  : subData.tier === 'trial'
                    ? 'Trial'
                    : 'Inactive'),
            expiresAt: subData.expiresAt as string | null,
            daysLeft,
          });
        } catch (error) {
          console.error('Failed to fetch subscription:', error);
        } finally {
          setSubscriptionLoading(false);
        }
      };
      fetchSubscription();
    }
  }, [isOpen, subscription, subscriptionLoading]);

  const getInitials = useCallback(() => {
    if (!user?.name) return 'U';
    return user.name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }, [user?.name]);

  const handleSignOut = useCallback(async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Sign out failed:', error);
    }
  }, [signOut]);

  const getStatusColor = () => {
    if (!subscription) return 'bg-neutral-100 text-neutral-600';
    if (subscription.daysLeft <= 7 && subscription.daysLeft > 0)
      return 'bg-amber-100 text-amber-700';
    if (subscription.daysLeft <= 0 && subscription.tier !== 'enterprise')
      return 'bg-red-100 text-red-700';
    if (subscription.tier === 'enterprise') return 'bg-amber-100 text-amber-700';
    return 'bg-emerald-100 text-emerald-700';
  };

  const getStatusText = () => {
    if (!subscription) return 'Loading...';
    if (subscription.tier === 'enterprise') return 'Lifetime';
    if (subscription.tier === 'inactive') return 'No Plan';
    if (subscription.daysLeft <= 0) return 'Expired';
    if (subscription.tier === 'trial') return `${subscription.daysLeft} days left`;
    return `${subscription.daysLeft} days left`;
  };

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="relative h-8 w-8 rounded-full p-0 focus-visible:ring-2 focus-visible:ring-emerald-500"
          aria-label="User menu"
        >
          {isLoading ? (
            <Skeleton className="h-8 w-8 rounded-full" />
          ) : (
            <Avatar className="h-8 w-8 cursor-pointer transition-opacity hover:opacity-80">
              {user?.image && <AvatarImage src={user.image} alt={user.name || ''} />}
              <AvatarFallback className="bg-gradient-to-br from-emerald-500 to-emerald-600 text-white text-xs">
                {getInitials()}
              </AvatarFallback>
            </Avatar>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72" sideOffset={8}>
        <DropdownMenuLabel className="p-0">
          <div className="flex flex-col p-3 border-b border-neutral-100 dark:border-neutral-800">
            {isLoading ? (
              <>
                <Skeleton className="h-4 w-24 mb-1" />
                <Skeleton className="h-3 w-32" />
              </>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="bg-gradient-to-br from-emerald-500 to-emerald-600 text-white text-sm">
                      {getInitials()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                      {user?.name || 'User'}
                    </p>
                    <p className="text-xs text-neutral-500 truncate">
                      {user?.email || 'user@example.com'}
                    </p>
                  </div>
                </div>

                {/* Subscription Badge - subtle */}
                {subscription && subscription.tier !== 'inactive' && (
                  <div className="mt-3 pt-2 border-t border-neutral-100 dark:border-neutral-800">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {subscription.tier === 'premium' && (
                          <Crown className="h-3 w-3 text-emerald-500" />
                        )}
                        {subscription.tier === 'enterprise' && (
                          <InfinityIcon className="h-3 w-3 text-amber-500" />
                        )}
                        {subscription.tier === 'trial' && <Zap className="h-3 w-3 text-blue-500" />}
                        <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                          {subscription.planName}
                        </span>
                      </div>
                      <span
                        className={cn(
                          'text-[10px] px-2 py-0.5 rounded-full font-medium',
                          getStatusColor()
                        )}
                      >
                        {getStatusText()}
                      </span>
                    </div>
                  </div>
                )}

                {/* Expired/Inactive state */}
                {subscription &&
                  (subscription.tier === 'inactive' ||
                    (subscription.daysLeft <= 0 && subscription.tier !== 'enterprise')) && (
                    <div className="mt-3 pt-2 border-t border-neutral-100 dark:border-neutral-800">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <AlertCircle className="h-3 w-3 text-red-500" />
                          <span className="text-xs font-medium text-red-600 dark:text-red-400">
                            {subscription.tier === 'inactive'
                              ? 'No active plan'
                              : 'Subscription expired'}
                          </span>
                        </div>
                        <Button
                          asChild
                          size="xs"
                          className="h-6 px-2 text-[10px] bg-emerald-500 hover:bg-emerald-600"
                        >
                          <Link href="/billing">Renew</Link>
                        </Button>
                      </div>
                    </div>
                  )}
              </>
            )}
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <DropdownMenuItem asChild className="cursor-pointer">
          <Link href="/settings/profile" className="flex items-center">
            <User className="mr-2 h-4 w-4" />
            <span>Profile</span>
            {pathname === '/settings/profile' && (
              <Check className="ml-auto h-3 w-3 text-emerald-500" />
            )}
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem asChild className="cursor-pointer">
          <Link href="/settings/organization" className="flex items-center">
            <Building2 className="mr-2 h-4 w-4" />
            <span>Organization</span>
            {pathname === '/settings/organization' && (
              <Check className="ml-auto h-3 w-3 text-emerald-500" />
            )}
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem asChild className="cursor-pointer">
          <Link href="/billing" className="flex items-center">
            <DollarSign className="mr-2 h-4 w-4" />
            <span>Billing</span>
            {pathname === '/billing' && <Check className="ml-auto h-3 w-3 text-emerald-500" />}
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem asChild className="cursor-pointer">
          <Link href="/settings/preferences" className="flex items-center">
            <Settings className="mr-2 h-4 w-4" />
            <span>Preferences</span>
            {pathname === '/settings/preferences' && (
              <Check className="ml-auto h-3 w-3 text-emerald-500" />
            )}
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={handleSignOut}
          className="text-red-600 dark:text-red-400 cursor-pointer focus:bg-red-50 dark:focus:bg-red-950/50"
        >
          <LogOut className="mr-2 h-4 w-4" />
          <span>Log out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
});

UserMenu.displayName = 'UserMenu';

// Main Header Component
export function Header() {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-neutral-200 bg-white/95 dark:border-neutral-800 dark:bg-neutral-950/95 px-4 lg:px-6 backdrop-blur-sm supports-[backdrop-filter]:bg-white/80 dark:supports-[backdrop-filter]:bg-neutral-950/80">
      {/* Left section - Hamburger + Logo */}
      <div className="flex items-center gap-3">
        <HamburgerButton /> {/* Now visible on all screen sizes! */}
        <Logo />
        <Badge
          variant="outline"
          className="hidden lg:inline-flex text-[10px] px-1.5 py-0 border-neutral-300 dark:border-neutral-700 font-mono"
        >
          v{modulesConfig.version}
        </Badge>
      </div>

      {/* Right section */}
      <div className="flex items-center gap-1">
        <ThemeToggle />
        <NotificationBell />
        <UserMenu />
      </div>
    </header>
  );
}
