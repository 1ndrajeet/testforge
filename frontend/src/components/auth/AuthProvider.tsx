// src/components/auth/AuthProvider.tsx
'use client';

import { createContext, useContext, useEffect, useState } from 'react';

import { authClient } from '@/lib/auth-client';

interface User {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string;
  createdAt: Date;
  updatedAt: Date;
}

interface Session {
  user: User;
  session: {
    id: string;
    expiresAt: Date;
    token: string;
    createdAt: Date;
    updatedAt: Date;
  };
}

interface AuthContextType {
  session: Session | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<any>;
  signUp: (email: string, password: string, name: string) => Promise<any>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadSession = async () => {
      try {
        const { data } = await authClient.getSession();
        setSession(data as Session | null);
      } catch (error) {
        console.error('Failed to load session:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadSession();
  }, []);

  const signIn = async (email: string, password: string) => {
    const result = await authClient.signIn.email({
      email,
      password,
    });
    if (result.data) {
      const sessionData = await authClient.getSession();

      if (sessionData.data) {
        setSession(sessionData.data as Session);
      }
    }
    return result;
  };

  const signUp = async (email: string, password: string, name: string) => {
    const result = await authClient.signUp.email({
      email,
      password,
      name,
    });
    if (result.data) {
      const sessionData = await authClient.getSession();

      if (sessionData.data) {
        setSession(sessionData.data as Session);
      }
    }
    return result;
  };

  const signOut = async () => {
    await authClient.signOut();
    setSession(null);
  };

  return (
    <AuthContext.Provider value={{ session, isLoading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
