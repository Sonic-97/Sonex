'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSocket } from '@/hooks/useSocket';
import { useAppStore } from '@/store';
import { fetchNotifications, fetchUnreadCount, markNotificationRead, markAllNotificationsRead, deleteNotification } from '@/lib/api';
import { SystemNotification } from '@/types';
import { Bell, CheckCheck, Trash2, ChevronLeft, ChevronRight, Filter } from 'lucide-react';

const TYPE_FILTERS = ['ALL', 'NEW_ORDER', 'ORDER_READY', 'ORDER_DELIVERED', 'ORDER_CANCELLED', 'PAYMENT_COLLECTED', 'LOW_STOCK', 'INVENTORY_RESTOCKED', 'DRIVER_ASSIGNED', 'SETTLEMENT_APPROVED', 'SYSTEM_ALERT'];

export default function OwnerNotificationsPage() {
  useSocket('/owner');

  const patchNotificationRead = useAppStore((s) => s.patchNotificationRead);
  const patchAllNotificationsRead = useAppStore((s) => s.patchAllNotificationsRead);
  const removeNotification = useAppStore((s) => s.removeNotification);
  const storeUnreadCount = useAppStore((s) => s.unreadCount);
  const setUnreadCount = useAppStore((s) => s.setUnreadCount);

  const [data, setData] = useState<SystemNotification[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, pages: 0 });
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [readFilter, setReadFilter] = useState<'ALL' | 'READ' | 'UNREAD'>('ALL');
  const [loading, setLoading] = useState(true);

  const loadNotifications = useCallback(async (page: number) => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { page, limit: pagination.limit };
      if (typeFilter !== 'ALL') params.type = typeFilter;
      if (readFilter === 'READ') params.isRead = true;
      if (readFilter === 'UNREAD') params.isRead = false;
      const res = await fetchNotifications(params as { page?: number; limit?: number; type?: string; isRead?: boolean });
      setData(res.data || []);
      setPagination(res.pagination || { page, limit: 20, total: 0, pages: 0 });
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [typeFilter, readFilter, pagination.limit]);

  useEffect(() => {
    loadNotifications(1);
    fetchUnreadCountFromApi();
  }, [typeFilter, readFilter]);

  const fetchUnreadCountFromApi = async () => {
    try {
      const res = await fetchUnreadCount();
      if (res?.unreadCount !== undefined) setUnreadCount(res.unreadCount);
    } catch {}
  };

  const handleMarkRead = async (id: string) => {
    patchNotificationRead(id);
    try { await markNotificationRead(id); } catch {}
  };

  const handleMarkAllRead = async () => {
    patchAllNotificationsRead();
    try {
      await markAllNotificationsRead();
      setUnreadCount(0);
    } catch {}
  };

  const handleDelete = async (id: string) => {
    removeNotification(id);
    try { await deleteNotification(id); } catch {}
  };

  const goToPage = (page: number) => {
    if (page < 1 || page > pagination.pages) return;
    loadNotifications(page);
    setPagination((prev) => ({ ...prev, page }));
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-4">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-violet-600" />
          <h2 className="text-lg font-bold text-gray-800">Notification Center</h2>
          {storeUnreadCount > 0 && (
            <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
              {storeUnreadCount} unread
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {storeUnreadCount > 0 && (
            <button onClick={handleMarkAllRead} className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors">
              <CheckCheck className="h-3.5 w-3.5" />
              Mark all read
            </button>
          )}

          <div className="relative">
            <Filter className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }}
              className="appearance-none rounded-lg border border-gray-200 pl-9 pr-8 py-2 text-sm focus:border-violet-400 focus:outline-none">
              {TYPE_FILTERS.map((t) => (
                <option key={t} value={t}>{t === 'ALL' ? 'All Types' : t.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </div>

          <select value={readFilter} onChange={(e) => { setReadFilter(e.target.value as typeof readFilter); setPagination((p) => ({ ...p, page: 1 })); }}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none">
            <option value="ALL">All</option>
            <option value="UNREAD">Unread</option>
            <option value="READ">Read</option>
          </select>
        </div>
      </div>

      {/* Notification List */}
      <div className="space-y-2">
        {loading ? (
          <div className="rounded-xl border bg-white py-16 text-center">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-violet-600 border-t-transparent" />
            <p className="mt-2 text-sm text-gray-400">Loading...</p>
          </div>
        ) : data.length === 0 ? (
          <div className="rounded-xl border bg-white py-16 text-center">
            <Bell className="mx-auto h-8 w-8 text-gray-300" />
            <p className="mt-2 text-sm text-gray-400">No notifications</p>
          </div>
        ) : (
          data.map((n) => (
            <div
              key={n.id}
              className={`rounded-xl border bg-white p-4 transition-colors ${n.isRead ? 'opacity-70' : 'border-l-4 border-l-violet-500'}`}
            >
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium uppercase text-gray-400">{n.type}</span>
                    <span className="text-xs text-gray-300">•</span>
                    <span className="text-xs text-gray-400">{new Date(n.createdAt).toLocaleString()}</span>
                    {!n.isRead && (
                      <span className="inline-flex items-center rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-700">NEW</span>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm font-medium text-gray-800">{n.title}</p>
                  <p className="text-sm text-gray-600">{n.message}</p>
                </div>
                <div className="flex items-center gap-1">
                  {!n.isRead && (
                    <button onClick={() => handleMarkRead(n.id)} className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-violet-600 transition-colors" title="Mark as read">
                      <CheckCheck className="h-4 w-4" />
                    </button>
                  )}
                  <button onClick={() => handleDelete(n.id)} className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-red-500 transition-colors" title="Delete">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {pagination.pages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button onClick={() => goToPage(pagination.page - 1)} disabled={pagination.page <= 1}
            className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors">
            <ChevronLeft className="h-4 w-4" /> Previous
          </button>
          <span className="text-sm text-gray-500">Page {pagination.page} of {pagination.pages}</span>
          <button onClick={() => goToPage(pagination.page + 1)} disabled={pagination.page >= pagination.pages}
            className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors">
            Next <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
