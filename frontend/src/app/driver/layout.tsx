'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Home, ClipboardList, Wifi, Settings, LogOut, Menu, X, Navigation } from 'lucide-react';

const NAV_ITEMS = [
  { href: '/driver/home', label: 'الرئيسية', icon: Home },
  { href: '/driver/status', label: 'الحالة', icon: Wifi },
  { href: '/driver/settings', label: 'الإعدادات', icon: Settings },
];

export default function DriverLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const token = mounted ? sessionStorage.getItem('driver_token') : null;
  const driverId = mounted ? sessionStorage.getItem('driver_id') : '';
  const driverName = mounted ? sessionStorage.getItem('driver_name') : '';

  const isLoginPage = pathname === '/driver/login';

  const handleLogout = () => {
    sessionStorage.removeItem('driver_token');
    sessionStorage.removeItem('driver_id');
    sessionStorage.removeItem('driver_name');
    router.push('/driver/login');
  };

  if (!mounted) return <div className="min-h-screen bg-[#f7f7f5]" />;

  if (isLoginPage) return <>{children}</>;

  if (!token) {
    router.push('/driver/login');
    return null;
  }

  const topBar = (
    <header className="sticky top-0 z-40 bg-white border-b border-[#E8E1D9] px-4 py-3 flex items-center justify-between">
      <button onClick={() => setSidebarOpen(!sidebarOpen)} className="lg:hidden p-2 rounded-xl hover:bg-gray-100">
        {sidebarOpen ? <X size={22} /> : <Menu size={22} />}
      </button>
      <div className="flex items-center gap-2">
        <Navigation size={16} className="text-[#8c6239]" />
        <span className="font-bold text-sm text-gray-500">{driverName || driverId}</span>
        <button onClick={handleLogout} className="p-2 rounded-xl hover:bg-red-50 text-red-400 hover:text-red-600 transition-colors">
          <LogOut size={18} />
        </button>
      </div>
    </header>
  );

  const sidebar = (
    <aside className={`fixed top-0 right-0 z-50 h-full w-64 bg-white border-l border-[#E8E1D9] transform transition-transform duration-200 lg:translate-x-0 lg:static lg:z-auto ${sidebarOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}`}>
      <div className="p-5 border-b border-[#E8E1D9]">
        <div className="flex items-center gap-2">
          <Navigation size={20} className="text-[#8c6239]" />
          <h1 className="text-xl font-bold text-[#8c6239]">سائق</h1>
        </div>
        <p className="text-xs text-gray-400 mt-1">لوحة التحكم</p>
      </div>
      <nav className="p-3 space-y-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <button
              key={href}
              onClick={() => { router.push(href); setSidebarOpen(false); }}
              className={`w-full text-right flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${active ? 'bg-[#8c6239] text-white' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              <Icon size={18} />
              {label}
            </button>
          );
        })}
      </nav>
    </aside>
  );

  return (
    <div className="min-h-screen bg-[#f7f7f5] flex">
      {sidebar}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/20 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}
      <div className="flex-1 flex flex-col min-h-screen">
        {topBar}
        <main className="flex-1 p-4 lg:p-6 max-w-4xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
