// src/hooks/useUser.ts
'use client';

import { useEffect, useState } from 'react';

import { authClient } from '@/lib/auth-client';

import { useAppStore } from '@/stores/appStore';

interface User {
  id: string;
  name: string;
  email: string;
  image?: string | null;
  createdAt: Date;
}

interface Session {
  user: User;
  session: {
    id: string;
    expiresAt: Date;
    token: string;
  };
}

export function useUser() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const { data } = await authClient.getSession();
        if (data?.user) {
          setUser(data.user);
          setSession(data as Session);
        }
      } catch (error) {
        console.error('Failed to fetch user:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchUser();
  }, []);

  const signOut = async () => {
    if (!confirm('Are you sure you want to sign out?')) return;
    await authClient.signOut();
    setUser(null);
    setSession(null);
    useAppStore.getState().reset();
    window.location.href = '/login';
  };

  return { user, session, isLoading, signOut };
}
