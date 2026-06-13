// src/app/dashboard/page.tsx
'use client';

import { useEffect } from 'react';

import { useRouter } from 'next/navigation';

import { useAuth } from '@/components/auth/AuthProvider';

export default function DashboardPage() {
  const { session, isLoading, signOut } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !session) {
      router.push('/login');
    }
  }, [session, isLoading, router]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <h1 className="text-2xl font-bold text-gray-900">TestForge Dashboard</h1>
          <button onClick={() => signOut()} className="rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-700">
            Sign Out
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8">
        <div className="rounded-lg bg-white p-6 shadow">
          <h2 className="mb-4 text-xl font-semibold">Welcome, {session.user?.name}!</h2>
          <p className="text-gray-600">Email: {session.user?.email}</p>
          <p className="mt-2 text-gray-600">TestForge V1.2 with BetterAuth is ready.</p>
        </div>
      </main>
    </div>
  );
}
