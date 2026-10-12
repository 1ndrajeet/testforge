// web/src/lib/auth-client.ts
'use client';

import { createClient } from '@/lib/supabase/client';

export const supabase = createClient();

export const signIn = (email: string, password: string) =>
  supabase.auth.signInWithPassword({ email, password });

export const signUp = (email: string, password: string, name: string) =>
  supabase.auth.signUp({
    email,
    password,
    options: { data: { name } },
  });

export const signInWithGoogle = () =>
  supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${typeof window !== 'undefined' ? window.location.origin : ''}/auth/callback`,
    },
  });

export const signOut = () => supabase.auth.signOut();

export const getSession = async () => {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) return { data: null, error };
  const user = data.session.user;
  return {
    data: {
      user: {
        id: user.id,
        email: user.email,
        name: user.user_metadata?.name || user.email?.split('@')[0] || '',
        emailVerified: !!user.email_confirmed_at,
        createdAt: user.created_at ? new Date(user.created_at) : new Date(),
        updatedAt: user.updated_at ? new Date(user.updated_at) : new Date(),
      },
      session: data.session,
    },
    error: null,
  };
};

export const changePassword = async ({
  currentPassword,
  newPassword,
}: {
  currentPassword?: string;
  newPassword: string;
}) => {
  const { data, error } = await supabase.auth.updateUser({ password: newPassword });
  return { data, error };
};

export const resetPasswordForEmail = (email: string, redirectTo?: string) =>
  supabase.auth.resetPasswordForEmail(email, {
    redirectTo:
      redirectTo ||
      `${typeof window !== 'undefined' ? window.location.origin : ''}/auth/callback?next=/exam-center/settings/profile?tab=security&reset=true`,
  });

export const authClient = {
  signIn,
  signUp,
  signInWithGoogle,
  signOut,
  getSession,
  changePassword,
  resetPasswordForEmail,
  useSession: () => ({ data: null, isPending: false, error: null }),
};
