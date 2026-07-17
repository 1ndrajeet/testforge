// components/layout/header.tsx
'use client';

import { memo, useEffect, useState } from 'react';

import Link from 'next/link';

import modulesConfig from '@/config/modules.json';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Bell,
  Building2,
  DollarSign,
  LogOut,
  Menu,
  Moon,
  Settings,
  Sun,
  User,
  X,
} from 'lucide-react';
import { useTheme } from 'next-themes';

import { cn } from '@/lib/utils';

import { useSidebar } from '@/hooks/useSidebar';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
// ADD AvatarImage
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface HeaderProps {
  user: { id: string; name: string; email: string; image?: string } | null;
  examCenter: { id: string; name: string; code: string } | null;
  subscription: {
    tier: string;
    planName: string;
    expiresAt: string | null;
    isActive: boolean;
  } | null;
}

const NotificationBell = memo(() => {
  const [hasNotifications] = useState(true);
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="relative rounded-full"
          >
            <Bell className="h-4 w-4" />
            {hasNotifications && (
              <span className="absolute top-1.5 right-1.5 h-2 w-2 animate-pulse rounded-full bg-red-500 ring-2 ring-white dark:ring-neutral-950" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>Notifications</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});
NotificationBell.displayName = 'NotificationBell';

const ThemeToggle = memo(() => {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) return <div className="h-8 w-8" />;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="rounded-full"
          >
            <Sun className="h-4 w-4 scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
            <Moon className="absolute h-4 w-4 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Toggle theme</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});
ThemeToggle.displayName = 'ThemeToggle';

const HamburgerButton = memo(() => {
  const { toggle, isOpen } = useSidebar();
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggle}
            className="rounded-full"
          >
            <AnimatePresence
              mode="wait"
              initial={false}
            >
              {isOpen ? (
                <motion.div
                  key="close"
                  initial={{ rotate: -180 }}
                  animate={{ rotate: 0 }}
                  exit={{ rotate: 180 }}
                  transition={{ duration: 0.2 }}
                >
                  <X className="h-5 w-5" />
                </motion.div>
              ) : (
                <motion.div
                  key="menu"
                  initial={{ rotate: 180 }}
                  animate={{ rotate: 0 }}
                  exit={{ rotate: -180 }}
                  transition={{ duration: 0.2 }}
                >
                  <Menu className="h-5 w-5" />
                </motion.div>
              )}
            </AnimatePresence>
          </Button>
        </TooltipTrigger>
        <TooltipContent>{isOpen ? 'Close sidebar' : 'Open sidebar'}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});
HamburgerButton.displayName = 'HamburgerButton';

function UserMenu({
  user,
  subscription,
}: {
  user: HeaderProps['user'];
  subscription: HeaderProps['subscription'];
}) {
  const [isOpen, setIsOpen] = useState(false);

  const handleSignOut = async () => {
    const { authClient } = await import('@/lib/auth-client');
    await authClient.signOut();
    window.location.href = '/login';
  };

  const getInitials = () => {
    if (!user?.name) return 'U';
    return user.name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const daysLeft = subscription?.expiresAt
    ? Math.ceil((new Date(subscription.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : 0;

  const getStatus = () => {
    if (!subscription || subscription.tier === 'inactive')
      return { text: 'No Plan', color: 'bg-neutral-100 text-neutral-600' };
    if (subscription.tier === 'enterprise')
      return { text: 'Lifetime', color: 'bg-amber-100 text-amber-700' };
    if (daysLeft <= 0) return { text: 'Expired', color: 'bg-red-100 text-red-700' };
    if (subscription.tier === 'trial')
      return { text: `${daysLeft} days left`, color: 'bg-blue-100 text-blue-700' };
    return { text: `${daysLeft} days left`, color: 'bg-emerald-100 text-emerald-700' };
  };

  const status = getStatus();

  return (
    <DropdownMenu
      open={isOpen}
      onOpenChange={setIsOpen}
    >
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="relative h-8 w-8 rounded-full p-0"
        >
          <Avatar className="h-8 w-8">
            <AvatarImage src={user?.image || ''} /> {/* ADD THIS */}
            <AvatarFallback className="bg-gradient-to-br from-emerald-500 to-emerald-600 text-white">
              {getInitials()}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-72"
        sideOffset={8}
      >
        <DropdownMenuLabel className="p-0">
          <div className="border-b p-3">
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10">
                <AvatarImage src={user?.image || ''} /> {/* ADD THIS */}
                <AvatarFallback className="bg-gradient-to-br from-emerald-500 to-emerald-600 text-white">
                  {getInitials()}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-semibold">{user?.name || 'User'}</p>
                <p className="text-xs text-neutral-500">{user?.email || ''}</p>
              </div>
            </div>
            {subscription && subscription.tier !== 'inactive' && (
              <div className="mt-3 flex items-center justify-between pt-2">
                <span className="text-xs font-medium">{subscription.planName}</span>
                <span
                  className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', status.color)}
                >
                  {status.text}
                </span>
              </div>
            )}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/exam-center/settings/profile">
            <User className="mr-2 h-4 w-4" />
            Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/exam-center/settings/organization">
            <Building2 className="mr-2 h-4 w-4" />
            Organization
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/billing">
            <DollarSign className="mr-2 h-4 w-4" />
            Billing
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/exam-center/settings/preferences">
            <Settings className="mr-2 h-4 w-4" />
            Preferences
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleSignOut}
          className="cursor-pointer text-red-600 focus:bg-red-50"
        >
          <LogOut className="mr-2 h-4 w-4" /> Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
export function Logo({
  theme = 'light',
  compact = true,
  className,
}: {
  theme?: string;
  compact?: boolean;
  className?: string;
}) {
  const isDark = theme === 'dark';

  return (
    <a
      href="/exam-center/dashboard"
      className={cn(`group flex items-center gap-2`, className)}
      aria-label="TestForge home"
    >
      <span
        className={`grid h-8 w-8 place-items-center rounded font-bold text-white transition-transform duration-300 group-hover:scale-105 ${isDark ? 'bg-emerald-500 shadow-lg shadow-emerald-500/25' : 'bg-emerald-600'}`}
      >
        TF
      </span>
      <span className={`flex flex-col leading-tight`}>
        <span
          className={`font-semibold text-neutral-900 dark:text-white ${!compact ? 'text-sm' : 'text-lg'} `}
        >
          TestForge
        </span>
        {!compact && (
          <span className={`text-xs text-neutral-500 dark:text-neutral-400`}>
            by Acharya Technologies
          </span>
        )}
      </span>
    </a>
  );
}

export function Header({ user, subscription }: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-white/95 px-4 backdrop-blur-sm lg:px-6 dark:bg-neutral-950/95">
      <div className="flex items-center gap-3">
        <HamburgerButton />
        <Logo />
      </div>
      <div className="flex items-center gap-1">
        <ThemeToggle />
        <NotificationBell />
        <UserMenu
          user={user}
          subscription={subscription}
        />
      </div>
    </header>
  );
}
