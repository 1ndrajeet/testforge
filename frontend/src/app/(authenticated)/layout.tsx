// src/app/(auth)/layout.tsx
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import auth from '@/lib/auth';

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  // Redirect to login if not authenticated
  if (!session) {
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      {children}
    </div>
  );
}