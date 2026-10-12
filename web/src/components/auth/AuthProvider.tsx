// web/src/components/auth/AuthProvider.tsx
'use client';

import { createContext, useContext, useEffect, useState } from 'react';

import type { Session, User } from '@supabase/supabase-js';

import {
  signIn as authSignIn,
  signInWithGoogle as authSignInWithGoogle,
  signOut as authSignOut,
  signUp as authSignUp,
  supabase,
} from '@/lib/auth-client';

export type UserRole = 'owner' | 'admin' | 'member';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  role: UserRole | null;
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<any>;
  signUp: (email: string, password: string, name: string) => Promise<any>;
  signOut: () => Promise<any>;
  signInWithGoogle: () => Promise<any>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        isLoading,
        role: 'owner',
        isAdmin: true,
        signIn: authSignIn,
        signUp: authSignUp,
        signOut: authSignOut,
        signInWithGoogle: authSignInWithGoogle,
      }}
    >
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
