// web/src/lib/auth.ts
import { cache } from 'react';

import { createClient } from '@/lib/supabase/server';

export const getSession = cache(async () => {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session;
});

export const getUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

export async function requireUser() {
  const user = await getUser();
  if (!user) throw new Error('Unauthorized');
  return user;
}
