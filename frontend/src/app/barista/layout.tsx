'use client';

import { AuthProvider, RoleGuard } from '@/lib/auth';

export default function BaristaLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <RoleGuard allowedRoles={['BARISTA', 'OWNER']}>
        {children}
      </RoleGuard>
    </AuthProvider>
  );
}
