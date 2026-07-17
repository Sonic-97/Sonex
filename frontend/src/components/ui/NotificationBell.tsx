'use client';

import { useState, useRef, useEffect } from 'react';
import { useAppStore } from '@/store';
import { markNotificationRead, markAllNotificationsRead, fetchUnreadCount, fetchNotifications } from '@/lib/api';
import { Bell, CheckCheck } from 'lucide-react';
import Link from 'next/link';

export function NotificationBell() {
  const storeUnreadCount = useAppStore((s) => s.unreadCount);
  const storeNotifications = useAppStore((s) => s.notifications);
  const setUnreadCount = useAppStore((s) => s.setUnreadCount);
  const setNotifications = useAppStore((s) => s.setNotifications);
  const patchNotificationRead = useAppStore((s) => s.patchNotificationRead);
  const patchAllNotificationsRead = useAppStore((s) => s.patchAllNotificationsRead);

  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const recent = storeNotifications.slice(0, 5);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    fetchUnreadCount().then((res) => {
      if (res?.unreadCount !== undefined) setUnreadCount(res.unreadCount);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (open) {
      fetchNotifications({ page: 1, limit: 5 }).then((res) => {
        if (res?.data) setNotifications(res.data);
      }).catch(() => {});
    }
  }, [open]);

  const handleMarkRead = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    patchNotificationRead(id);
    markNotificationRead(id).catch(() => {});
  };

  const handleMarkAllRead = () => {
    patchAllNotificationsRead();
    markAllNotificationsRead().catch(() => {});
  };

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} className="relative rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
        <Bell className="h-5 w-5" />
        {storeUnreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {storeUnreadCount > 9 ? '9+' : storeUnreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 rounded-xl border bg-white shadow-xl z-50">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <p className="text-sm font-semibold text-gray-700">Notifications</p>
            {storeUnreadCount > 0 && (
              <button onClick={handleMarkAllRead} className="text-xs text-violet-600 hover:text-violet-800 transition-colors">
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {recent.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-gray-400">No notifications</div>
            ) : (
              recent.map((n) => (
                <div key={n.id} className={`border-b px-4 py-3 text-sm transition-colors hover:bg-gray-50 ${n.isRead ? 'opacity-60' : 'bg-violet-50/30'}`}>
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p className={`text-gray-800 truncate ${!n.isRead ? 'font-medium' : ''}`}>{n.title}</p>
                      <p className="text-xs text-gray-500 truncate">{n.message}</p>
                      <p className="mt-0.5 text-[10px] text-gray-400">{new Date(n.createdAt).toLocaleString()}</p>
                    </div>
                    {!n.isRead && (
                      <button onClick={(e) => handleMarkRead(e, n.id)} className="flex-shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors" title="Mark as read">
                        <CheckCheck className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
          <Link href="/owner/notifications" onClick={() => setOpen(false)} className="block border-t px-4 py-2.5 text-center text-xs font-medium text-violet-600 hover:bg-violet-50 transition-colors rounded-b-xl">
            View all notifications
          </Link>
        </div>
      )}
    </div>
  );
}
