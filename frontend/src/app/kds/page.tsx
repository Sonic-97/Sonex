'use client';

/**
 * KDS Page — Client-only rendering.
 *
 * This page MUST NOT be prerendered:
 * - RoleGuard depends on AuthProvider (runtime-only context)
 * - KDSBoard depends on WebSocket + Web Audio API (browser-only APIs)
 *
 * Both issues are solved by loading the entire KDS shell
 * with next/dynamic + ssr: false — guaranteeing client-only execution.
 */

import dynamic from 'next/dynamic';

// Disable SSR for the entire KDS shell — AuthProvider + WebSocket are
// only available in the browser. No skeleton needed; the board has its
// own loading state (empty state with "awaiting orders" message).
const KDSShell = dynamic(
  () => import('@/components/kds/KDSShell'),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-slate-700 border-t-amber-500 rounded-full animate-spin" />
          <span className="text-slate-400 text-sm font-mono">جاري تحميل شاشة المطبخ...</span>
        </div>
      </div>
    ),
  }
);

export default function KDSPage() {
  return <KDSShell />;
}
