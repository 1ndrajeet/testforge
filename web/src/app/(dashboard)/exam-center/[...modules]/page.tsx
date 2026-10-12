// app/exam-center/[...modules]/page.tsx
'use client';

import { type ComponentType, useEffect, useRef, useState } from 'react';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';

import { AlertCircle, Home } from 'lucide-react';
import { HashLoader } from 'react-spinners';

import { createClient } from '@/lib/supabase/client';

import { Button } from '@/components/ui/button';

// ─────────────────────────────────────────────────────────────
// Subscription cache — localStorage + 2h TTL, user-scoped
// ─────────────────────────────────────────────────────────────

type SubscriptionTier = 'inactive' | 'trial' | 'premium' | 'enterprise';

interface SubscriptionSnapshot {
  isActive: boolean;
  tier: SubscriptionTier;
  expiresAt: string | null;
  checkedAt: number;
}

const SUB_STORAGE_PREFIX = 'tf:subscription:v1:';
const SUB_CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

let memoryCache: { userId: string; snapshot: SubscriptionSnapshot } | null = null;

function storageKey(userId: string): string {
  return `${SUB_STORAGE_PREFIX}${userId}`;
}

function isFresh(s: SubscriptionSnapshot): boolean {
  if (Date.now() - s.checkedAt >= SUB_CACHE_TTL_MS) return false;
  if (s.expiresAt) return new Date(s.expiresAt) > new Date();
  return s.isActive;
}

function readCache(userId: string): SubscriptionSnapshot | null {
  if (memoryCache?.userId === userId && isFresh(memoryCache.snapshot)) {
    return memoryCache.snapshot;
  }
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as SubscriptionSnapshot;
    if (!isFresh(parsed)) {
      window.localStorage.removeItem(storageKey(userId));
      memoryCache = null;
      return null;
    }
    memoryCache = { userId, snapshot: parsed };
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(userId: string, snapshot: SubscriptionSnapshot): void {
  memoryCache = { userId, snapshot };
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(snapshot));
  } catch {
    // storage disabled — memory cache still works for the session
  }
}

async function getSubscriptionSnapshot(): Promise<SubscriptionSnapshot> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { isActive: false, tier: 'inactive', expiresAt: null, checkedAt: Date.now() };
  }

  const cached = readCache(user.id);
  if (cached) return cached;

  // Single query against exam_centers (RLS-scoped to owner).
  const { data, error } = await supabase
    .from('exam_centers')
    .select('subscription_tier, subscription_expires_at')
    .eq('owner_id', user.id)
    .eq('is_active', true)
    .eq('is_deleted', false)
    .maybeSingle();

  if (error || !data) {
    // Do NOT cache failures.
    return { isActive: false, tier: 'inactive', expiresAt: null, checkedAt: 0 };
  }

  const tier = (data.subscription_tier ?? 'inactive') as SubscriptionTier;
  const expiresAt = data.subscription_expires_at ?? null;
  const notExpired = expiresAt ? new Date(expiresAt) > new Date() : false;
  const isActive = tier !== 'inactive' && notExpired;

  const snapshot: SubscriptionSnapshot = {
    isActive,
    tier,
    expiresAt,
    checkedAt: Date.now(),
  };

  writeCache(user.id, snapshot);
  return snapshot;
}

// ─────────────────────────────────────────────────────────────
// UI
// ─────────────────────────────────────────────────────────────

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
        <p className="text-muted-foreground mb-6">
          The module &quot;{modulePath}&quot; could not be loaded.
        </p>
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

// ─────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────

export default function ModulePage() {
  const { modules } = useParams();
  const router = useRouter();

  const gateRan = useRef(false);
  const isRedirecting = useRef(false);

  const [Component, setComponent] = useState<ComponentType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  const modulePath = Array.isArray(modules) ? modules.join('/') : (modules ?? '');

  useEffect(() => {
    gateRan.current = false;

    let cancelled = false;

    (async () => {
      try {
        const snapshot = await getSubscriptionSnapshot();
        if (cancelled) return;

        if (!snapshot.isActive) {
          isRedirecting.current = true;
          router.replace('/billing');
          return;
        }

        // Only import the module after the gate passes.
        const componentModule = (await import(`@/modules/${modulePath}`)) as {
          default: ComponentType;
        };

        if (cancelled) return;

        if (!componentModule.default) {
          throw new Error('Default export not found');
        }

        setComponent(() => componentModule.default);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        console.error('Failed to load module:', err);
        setError(err instanceof Error ? err.message : 'Unknown error occurred');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [modulePath, router, retryKey]);

  if (isRedirecting.current) return <ModuleLoading />;

  if (error) {
    return (
      <ModuleError
        modulePath={modulePath || 'unknown'}
        onRetry={() => {
          setError(null);
          setComponent(null);
          setRetryKey((k) => k + 1);
        }}
      />
    );
  }

  if (!Component) return <ModuleLoading />;

  return <Component />;
}
