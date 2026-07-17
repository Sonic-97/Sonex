'use client';

import Link from 'next/link';
import { useAppStore } from '@/store';
import { NotificationBell } from '@/components/ui/NotificationBell';
import { memo, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { getCookie, setCookie } from '@/lib/cookies';

const ROLE_NAV = {
  owner: { href: '/owner', label: 'المالك', color: 'bg-[#211816]' },
  barista: { href: '/barista', label: 'باريستا', color: 'bg-amber-600' },
  driver: { href: '/driver', label: 'سائق', color: 'bg-emerald-600' },
} as const;

type Role = keyof typeof ROLE_NAV;

const ConnectionIndicator = memo(function ConnectionIndicator() {
  const connectionStatus = useAppStore((state) => state.connectionStatus);
  return (
    <div className="flex items-center gap-2 rounded-full bg-black/25 px-2.5 py-0.5 text-xs font-semibold">
      <span className={`h-2 w-2 rounded-full ${
        connectionStatus === 'CONNECTED' ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' :
        connectionStatus === 'DISCONNECTED' ? 'bg-rose-400 shadow-[0_0_8px_#f87171]' :
        'bg-amber-400 animate-pulse shadow-[0_0_8px_#fbbf24]'
      }`} />
      <span className="text-[10px] tracking-wider uppercase text-white/95">
        {connectionStatus}
      </span>
    </div>
  );
});

export function RoleLayout({
  role,
  title,
  children,
}: {
  role: Role;
  title: string;
  children: React.ReactNode;
}) {
  const current = ROLE_NAV[role];
  const t = useTranslations('branches');
  const tCommon = useTranslations('common');
  const connectionStatus = useAppStore((state) => state.connectionStatus);

  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>('all');
  const [currentLocale, setCurrentLocale] = useState<string>('en');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('SONIC_BRANCH_ID') || 'all';
      setSelectedBranch(stored);
      setCurrentLocale(getCookie('SONIC_LOCALE') || 'en');
    }
  }, []);

  useEffect(() => {
    if (role === 'owner' || role === 'barista' || role === 'driver') {
      import('@/lib/api').then(({ default: api }) => {
        api.get('/branches')
          .then((res) => setBranches(res.data))
          .catch(() => {});
      });
    }
  }, [role]);

  const handleBranchChange = (branchId: string) => {
    localStorage.setItem('SONIC_BRANCH_ID', branchId);
    setSelectedBranch(branchId);
    window.location.reload();
  };

  const toggleLanguage = () => {
    const next = currentLocale === 'en' ? 'ar' : 'en';
    setCookie('SONIC_LOCALE', next);
    window.location.reload();
  };

  const isOffline = connectionStatus !== 'CONNECTED';

  return (
    <div className="flex min-h-screen flex-col">
      {/* Offline Alert Banner */}
      {isOffline && (
        <div className="bg-rose-600 text-white text-center py-2 px-4 text-xs font-bold tracking-wider uppercase flex items-center justify-center gap-2 animate-pulse shadow-inner z-50">
          <span className="h-1.5 w-1.5 rounded-full bg-white shadow-[0_0_8px_#fff]" />
          <span>{tCommon('status.offline')} — استخدام البيانات المخزنة محلياً</span>
        </div>
      )}

      <header className={`${current.color} px-6 py-3 text-white shadow-md transition-colors duration-300`}>
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold tracking-tight">{title}</h1>
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-medium uppercase tracking-wider">
              {current.label}
            </span>
            <ConnectionIndicator />
          </div>

          <div className="flex items-center gap-4">
            {/* Branch Context Selector */}
            {role === 'owner' ? (
              <div className="flex items-center gap-2">
                <label htmlFor="branch-select" className="text-xs text-white/80 font-medium">
                  {t('selectBranch')}:
                </label>
                <select
                  id="branch-select"
                  value={selectedBranch}
                  disabled={isOffline}
                  onChange={(e) => handleBranchChange(e.target.value)}
                  className="bg-white/10 hover:bg-white/25 disabled:opacity-50 text-white border border-white/20 rounded-md py-1 px-3 text-sm focus:outline-none transition-all cursor-pointer"
                >
                  <option value="all" className="text-gray-900">{t('allBranches')}</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id} className="text-gray-900">
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              // Frozen Branch Indicator for restricted roles
              branches.length > 0 && (
                <div className="flex items-center gap-1.5 bg-white/10 px-3 py-1 rounded-md text-xs font-semibold text-white/90">
                  <span>📍</span>
                  <span>
                    {branches.find((b) => b.id === selectedBranch)?.name || t('selectBranch')}
                  </span>
                </div>
              )
            )}

            {/* Language Switcher Button */}
            <button
              onClick={toggleLanguage}
              className="bg-white/10 hover:bg-white/20 border border-white/10 text-xs font-semibold uppercase tracking-wider rounded-md py-1 px-3 transition-colors cursor-pointer"
            >
              {currentLocale === 'en' ? 'العربية' : 'English'}
            </button>

            <NotificationBell />

            {/* Role Navigators */}
            <div className="flex gap-1 bg-black/15 p-1 rounded-lg">
              {Object.entries(ROLE_NAV).map(([key, nav]) => (
                <Link
                  key={key}
                  href={nav.href}
                  className={`rounded-md px-3 py-1 text-xs font-semibold transition-all ${
                    key === role
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-white/70 hover:text-white hover:bg-white/10'
                  }`}
                >
                  {nav.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </header>
      <main className="flex-1 bg-[#F7F7F5] p-4 sm:p-6">{children}</main>
    </div>
  );
}
