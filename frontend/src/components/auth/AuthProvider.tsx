// src/components/auth/AuthProvider.tsx
'use client';

import { createContext, useContext, useEffect, useState } from 'react';

import { authClient } from '@/lib/auth-client';
import type { UserRole } from '@/lib/actions/role';

// Import the server action dynamically
const getRoleAction = async (): Promise<UserRole> => {
  try {
    const { getUserRole } = await import('@/lib/actions/role');
    return await getUserRole();
  } catch (error) {
    console.error('Failed to fetch role:', error);
    return 'member';
  }
};

interface User {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string;
  role?: UserRole;
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
  role: UserRole | null;
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<any>;
  signUp: (email: string, password: string, name: string) => Promise<any>;
  signOut: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [role, setRole] = useState<UserRole | null>(null);

  const isAdmin = role === 'owner' || role === 'admin';

  const syncSession = async (data: unknown) => {
    if (data && typeof data === 'object' && 'user' in data && 'session' in data) {
      const userRole = await getRoleAction();
      const sessionWithRole = {
        ...(data as any),
        user: {
          ...(data as any).user,
          role: userRole,
        },
      };
      setSession(sessionWithRole);
      setRole(userRole);
      return;
    }

    setSession(null);
    setRole(null);
  };

  useEffect(() => {
    const loadSession = async () => {
      try {
        const { data } = await authClient.getSession();
        await syncSession(data);
      } catch (error) {
        console.error('Failed to load session:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadSession();

    // Listen for auth changes (useful for social auth redirects)
    authClient.$store.listen('session', async (newSession) => {
      await syncSession(newSession);
    });
  }, []);

  const signIn = async (email: string, password: string) => {
    const result = await authClient.signIn.email({
      email,
      password,
    });
    if (result.data) {
      const sessionData = await authClient.getSession();
      await syncSession(sessionData.data);
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
      await syncSession(sessionData.data);
    }
    return result;
  };

  const signInWithGoogle = async () => {
    await authClient.signIn.social({
      provider: 'google',
    });
  };

  const signOut = async () => {
    await authClient.signOut();
    setSession(null);
    setRole(null);
  };

  return (
    <AuthContext.Provider 
      value={{ 
        session, 
        isLoading, 
        role,
        isAdmin,
        signIn, 
        signUp, 
        signOut, 
        signInWithGoogle 
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