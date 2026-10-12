// web/src/hooks/useUser.ts
'use client';

import { useEffect, useState } from 'react';

import type { Session, User } from '@supabase/supabase-js';

import { signOut as authSignOut, supabase } from '@/lib/auth-client';

import { useAppStore } from '@/stores/appStore';

export function useUser() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const { isInitialized, setInitialized, reset } = useAppStore();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);
      setInitialized(true);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [setInitialized]);

  const signOut = async () => {
    if (!confirm('Are you sure you want to sign out?')) return;
    await authSignOut();
    setUser(null);
    setSession(null);
    reset();
    window.location.href = '/login';
  };

  return { user, session, isLoading, signOut, isInitialized };
}
