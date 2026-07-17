'use client';

import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAppStore } from '@/store';
import { AppEvent, ConnectionStatus } from '@/types';
import axios from 'axios';

const SOCKET_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:5000';
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

const globalSockets = new Map<string, Socket>();
const globalInitCount = new Map<string, number>();

function getToken(): string | null {
  if (typeof window !== 'undefined') {
    return sessionStorage.getItem('sonic_token');
  }
  return null;
}

function logWsEvent(eventName: string, payload: unknown) {
  console.log(`[WS EVENT] ${eventName}`, { payload, timestamp: new Date().toISOString() });
}

async function fetchOrder(orderId: string) {
  try {
    const { data } = await axios.get(`${API_URL}/orders/${orderId}`);
    return data;
  } catch {
    return null;
  }
}

function bindEvents(socket: Socket) {
  const store = useAppStore.getState();

  socket.on('connect', () => {
    console.log(`[WS] Connected to ${(socket as unknown as { nsp: string }).nsp}`);
    useAppStore.getState().setConnectionStatus('CONNECTED');
  });

  socket.on('disconnect', (reason) => {
    console.log(`[WS] Disconnected from ${(socket as unknown as { nsp: string }).nsp} (${reason})`);
    useAppStore.getState().setConnectionStatus('DISCONNECTED');
  });

  socket.on('reconnect_attempt', () => {
    useAppStore.getState().setConnectionStatus('RECONNECTING');
  });

  socket.on('connect_error', () => {
    useAppStore.getState().setConnectionStatus('CONNECTING');
  });

  socket.io.on('reconnect', () => {
    useAppStore.getState().setConnectionStatus('CONNECTED');
  });

  socket.on('order.created', (event: AppEvent) => {
    const { orderId } = event.payload as { orderId: string };
    useAppStore.getState().handleOrderCreated(event);
    fetchOrder(orderId).then((order) => {
      if (order) useAppStore.getState().addFullOrder(order);
    });
  });

  socket.on('order.updated', (event: AppEvent) => {
    useAppStore.getState().handleOrderUpdated(event);
  });

  socket.on('order.status.changed', (event: AppEvent) => {
    useAppStore.getState().handleOrderStatusChanged(event);
  });

  socket.on('order.ready', (event: AppEvent) => {
    useAppStore.getState().handleOrderReady(event);
  });

  socket.on('order.delivered', (event: AppEvent) => {
    useAppStore.getState().handleOrderDelivered(event);
  });

  socket.on('order.cancelled', (event: AppEvent) => {
    useAppStore.getState().handleOrderCancelled(event);
  });

  socket.on('staff.created', (event: AppEvent) => {
    useAppStore.getState().handleStaffCreated(event);
  });

  socket.on('staff.updated', (event: AppEvent) => {
    useAppStore.getState().handleStaffUpdated(event);
  });

  socket.on('staff.deleted', (event: AppEvent) => {
    useAppStore.getState().handleStaffDeleted(event);
  });

  socket.on('finance.revenue.updated', (event: AppEvent) => {
    useAppStore.getState().handleFinanceRevenueUpdated(event);
  });

  socket.on('finance.daily.snapshot', (event: AppEvent) => {
    useAppStore.getState().handleFinanceDailySnapshot(event);
  });

  socket.on('finance.updated', (event: AppEvent) => {
    useAppStore.getState().handleFinanceUpdated(event);
  });

  socket.on('staff.performance.updated', (event: AppEvent) => {
    useAppStore.getState().handleStaffPerformanceUpdated(event);
  });

  socket.on('staff.alert.generated', (event: AppEvent) => {
    useAppStore.getState().handleStaffAlertGenerated(event);
  });

  socket.on('AUDIO_ALERT', (event: AppEvent) => {
    useAppStore.getState().handleAudioAlert(event);
  });

  socket.on('inCafe.order.created', (event: AppEvent) => {
    useAppStore.getState().handleInCafeOrderCreated(event);
  });

  socket.on('inCafe.payment.updated', (event: AppEvent) => {
    useAppStore.getState().handleInCafePaymentUpdated(event);
  });

  socket.on('inCafe.order.updated', (event: AppEvent) => {
    useAppStore.getState().handleInCafeOrderUpdated(event);
  });

  socket.on('staff.purchase.created', (event: AppEvent) => {
    useAppStore.getState().handleStaffPurchaseCreated(event);
  });

  socket.on('smart-followup.suggestions.ready', (event: AppEvent) => {
    useAppStore.getState().handleSuggestionReady(event);
  });

  socket.on('payment.collected', (event: AppEvent) => {
    useAppStore.getState().handlePaymentCollected(event);
  });

  socket.on('payment.pending', (event: AppEvent) => {
    useAppStore.getState().handlePaymentPending(event);
  });

  socket.on('payment.updated', (event: AppEvent) => {
    useAppStore.getState().handlePaymentUpdated(event);
  });

  socket.onAny((eventName, event: AppEvent) => {
    console.log("[WS EVENT]", eventName, event.payload);
  });

  socket.on('product.updated', (event: AppEvent) => {
    useAppStore.getState().handleProductUpdated(event);
  });

  socket.on('category.updated', (event: AppEvent) => {
    useAppStore.getState().handleCategoryUpdated(event);
  });

  socket.on('inventory.updated', (event: AppEvent) => {
    useAppStore.getState().handleInventoryUpdated(event);
  });

  socket.on('low_stock.alert', (event: AppEvent) => {
    useAppStore.getState().handleLowStockAlert(event);
  });

  socket.on('system.notification', (event: AppEvent) => {
    useAppStore.getState().handleSystemNotification(event);
  });

  socket.on('notification.created', (event: AppEvent) => {
    useAppStore.getState().handleNotificationCreated(event);
  });

  socket.on('notification.read', (event: AppEvent) => {
    useAppStore.getState().handleNotificationRead(event);
  });

  socket.on('notification.read-all', (event: AppEvent) => {
    useAppStore.getState().handleNotificationReadAll(event);
  });

  socket.on('notification.deleted', (event: AppEvent) => {
    useAppStore.getState().handleNotificationDeleted(event);
  });

  socket.on('report.generated', (event: AppEvent) => {
    console.log('[WS] Report generated:', event.payload);
  });

  socket.on('report.status', (event: AppEvent) => {
    console.log('[WS] Report status:', event.payload);
  });

  socket.on('analytics.updated', (event: AppEvent) => {
    console.log('[WS] Analytics updated:', event.payload);
  });

  socket.on('CASH_HANDOVER', (payload: any) => {
    console.log('[WS] CASH_HANDOVER:', payload);
    const amount = Number(payload.amount).toFixed(2);
    if (typeof window !== 'undefined') {
      import('react-hot-toast').then(({ toast }) => {
        toast.success(`قام الموظف ${payload.staffName} بتسليم ${amount} جنيه`, {
          duration: 6000,
          position: 'top-left',
        });
      });
    }
  });
}

export function useSocket(namespace: '/barista' | '/driver' | '/owner') {
  const isActive = useRef(false);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      console.warn(`[WS] No token available, skipping connection for ${namespace}`);
      return;
    }

    const key = namespace;
    globalInitCount.set(key, (globalInitCount.get(key) || 0) + 1);

    if (!globalSockets.has(key)) {
      const actualNamespace = key === '/owner' ? '/Cafe' : key;
      const socket = io(`${SOCKET_URL}${actualNamespace}`, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        auth: { token },
      });
      bindEvents(socket);
      globalSockets.set(key, socket);
    }

    isActive.current = true;

    return () => {
      const count = globalInitCount.get(key) || 0;
      if (count <= 1) {
        const socket = globalSockets.get(key);
        if (socket) {
          socket.disconnect();
          globalSockets.delete(key);
        }
        globalInitCount.delete(key);
      } else {
        globalInitCount.set(key, count - 1);
      }
      isActive.current = false;
    };
  }, [namespace]);
}
