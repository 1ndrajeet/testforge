// web/src/app/auth/callback/page.tsx
'use client';

import { Suspense, useEffect } from 'react';

import { useRouter, useSearchParams } from 'next/navigation';

import { HashLoader } from 'react-spinners';

import { supabase } from '@/lib/auth-client';

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const code = searchParams.get('code');
    const next = searchParams.get('next') || '/exam-center/dashboard';

    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
        if (!error) {
          router.replace(next);
        } else {
          router.replace('/login?error=' + encodeURIComponent(error.message));
        }
      });
    } else {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          router.replace(next);
        } else {
          router.replace('/login');
        }
      });
    }
  }, [router, searchParams]);

  return (
    <div className="bg-background flex min-h-screen flex-col items-center justify-center">
      <HashLoader
        size={50}
        color="#059669"
      />
      <p className="text-muted-foreground mt-4 text-sm font-medium">Completing sign-in...</p>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="bg-background flex min-h-screen flex-col items-center justify-center">
          <HashLoader
            size={50}
            color="#059669"
          />
        </div>
      }
    >
      <AuthCallbackContent />
    </Suspense>
  );
}
