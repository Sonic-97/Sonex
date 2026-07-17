'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from './AuthContext';

interface RoleGuardProps {
  allowedRoles: string[];
  children: ReactNode;
  fallback?: string;
}

export function RoleGuard({ allowedRoles, children, fallback = '/auth' }: RoleGuardProps) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.push('/auth');
      return;
    }
    const role = user.role?.toUpperCase();
    if (!allowedRoles.includes(role)) {
      router.push(fallback);
    }
  }, [user, loading, allowedRoles, router, fallback]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-900">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-amber-600" />
      </div>
    );
  }

  if (!user) return null;
  if (!allowedRoles.includes(user.role?.toUpperCase())) return null;

  return <>{children}</>;
}
