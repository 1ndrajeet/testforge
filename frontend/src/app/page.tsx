// src/app/page.tsx
import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-gray-50 to-emerald-50">
      <div className="text-center">
        <h1 className="text-5xl font-bold text-gray-900 mb-4">TestForge</h1>
        <p className="text-xl text-gray-600 mb-8">MSBTE Exam Management System</p>
        <div className="space-x-4">
          <Link
            href="/login"
            className="px-6 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition"
          >
            Sign In
          </Link>
          <Link
            href="/exam-center/dashboard"
            className="px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition"
          >
            Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
