'use client';

import { useAuth } from '@/lib/auth';
import { NotificationBell } from '@/components/ui/NotificationBell';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';
import { LogOut, User, Menu } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

import { usePathname } from 'next/navigation';

const PAGE_TITLES: Record<string, string> = {
  '/owner/dashboard': 'الرئيسية',
  '/owner/copilot': 'مساعد المالك',
  '/owner/orders': 'الطلبات',
  '/owner/products': 'المنتجات',
  '/owner/categories': 'التصنيفات',
  '/owner/inventory': 'المخزون',
  '/owner/employees': 'الموظفين',
  '/owner/drivers': 'السائقين',
  '/owner/customers': 'العملاء',
  '/owner/payments': 'المدفوعات',
  '/owner/reports': 'التقارير',
  '/owner/notifications': 'الإشعارات',
  '/owner/settings': 'الإعدادات',
};

PAGE_TITLES['/owner/forecasting'] = 'التوقعات والمحاكاة';

interface OwnerTopBarProps {
  onToggleSidebar: () => void;
}

export function OwnerTopBar({ onToggleSidebar }: OwnerTopBarProps) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const title = PAGE_TITLES[pathname] || 'Owner';
  const [menuOpen, setMenuOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [cafeName, setCafeName] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setCafeName(sessionStorage.getItem('sonic_cafe_name'));
    }
  }, []);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-gray-200 bg-white px-4 md:px-6">
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="p-2 -ms-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 md:hidden focus:outline-none focus:ring-2 focus:ring-violet-500"
          aria-label="Open Sidebar"
        >
          <Menu className="h-6 w-6" />
        </button>
        <div className="flex flex-col items-start">
          <h1 className="text-lg md:text-xl font-bold text-gray-800 leading-tight">{title}</h1>
          {cafeName && <span className="text-[10px] md:text-xs font-semibold text-[#8C6239]">كافيه: {cafeName}</span>}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <LanguageSwitcher />
        <NotificationBell />

        <div ref={ref} className="relative">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
          >
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#F4E9DD] text-[#8C6239]">
              <User className="h-4 w-4" />
            </div>
            <span>{user?.name || 'Owner'}</span>
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full mt-2 w-48 rounded-xl border bg-white shadow-xl z-50">
              <div className="border-b px-4 py-2.5">
                <p className="text-sm font-medium text-gray-800">{user?.name}</p>
                <p className="text-xs text-gray-400">{user?.role}</p>
              </div>
              <button
                onClick={() => { logout(); setMenuOpen(false); }}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 rounded-b-xl transition-colors"
              >
                <LogOut className="h-4 w-4" />
                تسجيل الخروج
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
