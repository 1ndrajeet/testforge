// src/app/page.tsx
import Link from 'next/link';

export default function Home() {
  return (
    <div className="to-primary 50 flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-gray-50">
      <div className="text-center">
        <h1 className="mb-4 text-5xl font-bold text-gray-900">TestForge</h1>
        <p className="mb-8 text-xl text-gray-600">MSBTE Exam Management System</p>
        <div className="space-x-4">
          <Link href="/login" className="bg-primary hover:bg-primary rounded-lg px-6 py-3 text-white transition">
            Sign In
          </Link>
          <Link
            href="/exam-center/dashboard"
            className="rounded-lg bg-gray-600 px-6 py-3 text-white transition hover:bg-gray-700"
          >
            Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
