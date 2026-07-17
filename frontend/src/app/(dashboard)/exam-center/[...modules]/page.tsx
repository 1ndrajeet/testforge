// app/exam-center/[...modules]/page.tsx
'use client';

import { useEffect, useRef, useState, useTransition } from 'react';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';

import { AlertCircle, Home } from 'lucide-react';
import { HashLoader } from 'react-spinners';

import { Button } from '@/components/ui/button';

interface ModuleComponent {
  default: React.ComponentType;
}

// Cache for subscription status - persists across renders
let subscriptionCache: {
  isActive: boolean;
  tier: string;
  expiresAt: string | null;
  checkedAt: number;
} | null = null;

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

async function checkSubscriptionStatus(): Promise<{
  isActive: boolean;
  tier: string;
  expiresAt: string | null;
}> {
  // Check cache first
  if (subscriptionCache && Date.now() - subscriptionCache.checkedAt < CACHE_DURATION) {
    return {
      isActive: subscriptionCache.isActive,
      tier: subscriptionCache.tier,
      expiresAt: subscriptionCache.expiresAt,
    };
  }

  try {
    // Dynamically import the server action
    const { getCurrentSubscription } = await import('@/lib/actions2/subscription');
    const result = await getCurrentSubscription();

    // Update cache
    subscriptionCache = {
      isActive: result.isActive,
      tier: result.tier,
      expiresAt: result.expiresAt,
      checkedAt: Date.now(),
    };

    return {
      isActive: result.isActive,
      tier: result.tier,
      expiresAt: result.expiresAt,
    };
  } catch (error) {
    console.error('Failed to check subscription:', error);
    // Return inactive on error to be safe
    return { isActive: false, tier: 'inactive', expiresAt: null };
  }
}

function ModuleLoading() {
  return (
    <div className="bg-background/80 fixed inset-0 z-50 flex flex-col items-center justify-center backdrop-blur-sm">
      <HashLoader
        size={60}
        color="#059669"
      />

      <p className="text-muted-foreground mt-6 text-sm font-medium">Loading module...</p>
    </div>
  );
}

function ModuleError({ modulePath, onRetry }: { modulePath: string; onRetry: () => void }) {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-6">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
          <AlertCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
        </div>

        <h2 className="text-foreground mb-2 text-xl font-semibold">Module Not Found</h2>

        <p className="text-muted-foreground mb-6">The module "{modulePath}" could not be loaded.</p>

        <div className="flex justify-center gap-3">
          <Button
            onClick={onRetry}
            variant="outline"
          >
            Try Again
          </Button>

          <Button asChild>
            <Link href="/exam-center/dashboard">
              <Home className="mr-2 h-4 w-4" />
              Dashboard
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function ModulePage() {
  const { modules } = useParams();
  const router = useRouter();
  const hasCheckedSubscription = useRef(false);
  const isRedirecting = useRef(false);

  const [Component, setComponent] = useState<React.ComponentType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Check subscription status once on mount
  useEffect(() => {
    if (hasCheckedSubscription.current || isRedirecting.current) return;
    hasCheckedSubscription.current = true;

    checkSubscriptionStatus()
      .then(({ isActive, tier }) => {
        // Redirect to billing if subscription is not active
        // Inactive, expired, or trial that has ended
        const isInactive = tier === 'inactive';
        const isExpired = tier !== 'inactive' && !isActive;

        if (isInactive || isExpired) {
          isRedirecting.current = true;
          router.replace('/billing');
        }
      })
      .catch(() => {
        // On error, redirect to billing as safety net
        isRedirecting.current = true;
        router.replace('/billing');
      });
  }, [router]);

  // Load module
  useEffect(() => {
    if (!modules) {
      setError('No module specified');
      return;
    }

    // Skip loading if we're redirecting
    if (isRedirecting.current) return;

    startTransition(async () => {
      try {
        const modulePath = Array.isArray(modules) ? modules.join('/') : modules;

        const componentModule: ModuleComponent = await import(`@/modules/${modulePath}`);

        if (!componentModule.default) {
          throw new Error('Default export not found');
        }

        setComponent(() => componentModule.default);
        setError(null);
      } catch (err) {
        console.error('Failed to load module:', err);

        setError(err instanceof Error ? err.message : 'Unknown error occurred');
      }
    });
  }, [modules]);

  // If redirecting, show loading
  if (isRedirecting.current) {
    return <ModuleLoading />;
  }

  if (error) {
    const modulePath = Array.isArray(modules) ? modules.join('/') : modules || 'unknown';

    return (
      <ModuleError
        modulePath={modulePath}
        onRetry={() => {
          setError(null);
          setComponent(null);
          router.refresh();
        }}
      />
    );
  }

  if (isPending || !Component) {
    return <ModuleLoading />;
  }

  return <Component />;
}
