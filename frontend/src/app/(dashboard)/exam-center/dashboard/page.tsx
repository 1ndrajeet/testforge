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
      <div className="min-h-screen flex items-center justify-center">
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
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">TestForge Dashboard</h1>
          <button
            onClick={() => signOut()}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            Sign Out
          </button>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Welcome, {session.user?.name}!</h2>
          <p className="text-gray-600">Email: {session.user?.email}</p>
          <p className="text-gray-600 mt-2">TestForge V1.2 with BetterAuth is ready.</p>
        </div>
      </main>
    </div>
  );
}
