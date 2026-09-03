'use client';

/**
 * KDSShell — Client-only container.
 * Loaded exclusively via next/dynamic with ssr:false.
 * Wraps RoleGuard (needs AuthProvider) + KDSBoard (needs WebSocket/Audio).
 */

import { RoleGuard } from '@/lib/auth/RoleGuard';
import { KDSBoard } from '@/components/kds/KDSBoard';

export default function KDSShell() {
  return (
    <RoleGuard allowedRoles={['BARISTA', 'OWNER', 'ADMIN', 'MANAGER']}>
      <KDSBoard />
    </RoleGuard>
  );
}
