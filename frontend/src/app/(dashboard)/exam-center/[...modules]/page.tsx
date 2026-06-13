// app/exam-center/[...modules]/page.tsx
'use client';

import { useEffect, useState, useTransition } from 'react';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';

import { AlertCircle, Home } from 'lucide-react';
import { HashLoader } from 'react-spinners';

import { Button } from '@/components/ui/button';

interface ModuleComponent {
  default: React.ComponentType;
}

function ModuleLoading() {
  return (
    <div className="bg-background/80 fixed inset-0 z-50 flex flex-col items-center justify-center backdrop-blur-sm">
      <HashLoader size={60} color="#059669" />

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
          <Button onClick={onRetry} variant="outline">
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

  const [Component, setComponent] = useState<React.ComponentType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!modules) {
      setError('No module specified');
      return;
    }

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
