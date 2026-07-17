'use client';

import Link from 'next/link';

export default function ForbiddenPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-8">
      <h1 className="text-6xl font-bold text-red-400 mb-4">403</h1>
      <h2 className="text-xl font-semibold text-white mb-2">Access Denied</h2>
      <p className="text-gray-400 mb-8 text-center max-w-md">
        You do not have permission to access this page.
        If you believe this is a mistake, please contact your manager.
      </p>
      <Link
        href="/auth"
        className="rounded-xl bg-amber-600 px-6 py-3 font-semibold text-white transition-all hover:bg-amber-500"
      >
        Return to Login
      </Link>
    </div>
  );
}
