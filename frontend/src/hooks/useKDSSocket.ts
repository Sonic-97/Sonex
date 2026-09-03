'use client';

import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

const KDS_WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:5000';

export interface KDSOrderPayload {
  orderId: string;
  code: string;
  tenantId: string;
  branchId: string;
  channel: string;
  items?: Array<{ name: string; quantity: number; notes?: string }>;
  status: string;
  createdAt: string;
}

type KDSEventHandler = (order: KDSOrderPayload) => void;

let kdsSocket: Socket | null = null;

function getToken(): string | null {
  if (typeof window !== 'undefined') {
    return sessionStorage.getItem('sonic_token');
  }
  return null;
}

export function useKDSSocket({
  tenantId,
  branchId,
  onOrderCreated,
}: {
  tenantId: string;
  branchId: string;
  onOrderCreated: KDSEventHandler;
}) {
  const handlerRef = useRef<KDSEventHandler>(onOrderCreated);
  const isConnectedRef = useRef(false);

  // Keep handler ref fresh without recreating socket
  useEffect(() => {
    handlerRef.current = onOrderCreated;
  }, [onOrderCreated]);

  const connect = useCallback(() => {
    const token = getToken();

    if (kdsSocket?.connected) return;

    kdsSocket = io(KDS_WS_URL, {
      path: '/ws/kds/orders',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 8000,
      query: { tenantId, branchId },
      auth: token ? { token } : undefined,
      extraHeaders: {
        'x-tenant-id': tenantId,
        'x-branch-id': branchId,
      },
    });

    kdsSocket.on('connect', () => {
      console.log(`[KDS WS] Connected — Tenant: ${tenantId} | Branch: ${branchId}`);
      isConnectedRef.current = true;
    });

    kdsSocket.on('disconnect', (reason) => {
      console.log(`[KDS WS] Disconnected: ${reason}`);
      isConnectedRef.current = false;
    });

    kdsSocket.on('reconnect_attempt', (attempt) => {
      console.log(`[KDS WS] Reconnect attempt #${attempt}...`);
    });

    kdsSocket.on('kds.order.created', (payload: KDSOrderPayload) => {
      // Zero Cross-Tenant Leakage: validate tenant/branch before accepting
      if (payload.tenantId !== tenantId || payload.branchId !== branchId) {
        console.warn(`[KDS WS] Rejected event: tenantId/branchId mismatch.`);
        return;
      }
      console.log(`[KDS WS] New order received: ${payload.code}`);
      handlerRef.current(payload);
    });
  }, [tenantId, branchId]);

  useEffect(() => {
    connect();

    return () => {
      if (kdsSocket) {
        kdsSocket.off('kds.order.created');
        kdsSocket.disconnect();
        kdsSocket = null;
      }
    };
  }, [connect]);

  return {
    isConnected: isConnectedRef.current,
  };
}
