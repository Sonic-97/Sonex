'use client';

import { useState } from 'react';
import { useLocale } from 'next-intl';
import { OwnerSidebar } from '@/components/owner/OwnerSidebar';
import { OwnerTopBar } from '@/components/owner/OwnerTopBar';
import { NotificationToast } from '@/components/ui/NotificationToast';
import { AuthProvider, RoleGuard } from '@/lib/auth';

export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const locale = useLocale();
  const dir = locale === 'ar' ? 'rtl' : 'ltr';

  return (
    <AuthProvider>
      <RoleGuard allowedRoles={['OWNER']}>
        <div className="flex min-h-screen bg-[#FDFBF7] selection:bg-[#8C6239] selection:text-white" dir={dir}>
          {/* Backdrop for mobile */}
          {sidebarOpen && (
            <div
              className="fixed inset-0 z-35 bg-black/40 md:hidden transition-opacity"
              onClick={() => setSidebarOpen(false)}
            />
          )}

          <OwnerSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
          
          <div className="flex flex-1 flex-col min-w-0 ms-0 md:ms-[260px] transition-all duration-300">
            <OwnerTopBar onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
            <main className="flex-1 p-4 md:p-8 lg:p-10">{children}</main>
            <NotificationToast />
          </div>
        </div>
      </RoleGuard>
    </AuthProvider>
  );
}
