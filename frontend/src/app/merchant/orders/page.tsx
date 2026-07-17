'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Clock } from 'lucide-react';
import OrderCard from '@/components/merchant/OrderCard';

interface RecentOrder {
  merchantOrderId: string;
  customerOrderId: string;
  status: string;
  businessName: string;
  lastAccess: string;
}

export default function MerchantOrdersPage() {
  const router = useRouter();
  const [searchId, setSearchId] = useState('');
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);

  useEffect(() => {
    const raw = localStorage.getItem('merchant_recent_orders');
    if (raw) {
      try {
        const parsed: RecentOrder[] = JSON.parse(raw);
        setRecentOrders(parsed.sort((a, b) => new Date(b.lastAccess).getTime() - new Date(a.lastAccess).getTime()));
      } catch { /* ignore */ }
    }
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchId.trim()) {
      router.push(`/merchant/orders/${searchId.trim()}`);
    }
  };

  const handleOrderClick = (id: string) => {
    router.push(`/merchant/orders/${id}`);
  };

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">الطلبات</h1>

      <form onSubmit={handleSearch} className="relative">
        <input
          type="text"
          value={searchId}
          onChange={(e) => setSearchId(e.target.value)}
          placeholder="أدخل رقم الطلب..."
          className="w-full px-4 py-3 pr-12 rounded-xl border border-[#E8E1D9] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#8c6239]/20 focus:border-[#8c6239]"
        />
        <button type="submit" className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-lg hover:bg-gray-100">
          <Search size={18} className="text-gray-400" />
        </button>
      </form>

      {recentOrders.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Clock size={16} className="text-gray-400" />
            <span className="text-sm font-bold text-gray-500">آخر الطلبات</span>
          </div>
          <div className="space-y-2">
            {recentOrders.map((order) => (
              <OrderCard
                key={order.merchantOrderId}
                orderId={order.customerOrderId}
                merchantOrderId={order.merchantOrderId}
                status={order.status}
                businessName={order.businessName}
                onClick={handleOrderClick}
              />
            ))}
          </div>
        </div>
      )}

      {recentOrders.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <ClipboardList size={40} className="mx-auto mb-3 opacity-50" />
          <p className="text-sm">لا توجد طلبات حديثة</p>
          <p className="text-xs mt-1">ابحث عن رقم الطلب أعلاه</p>
        </div>
      )}
    </div>
  );
}

function ClipboardList({ size, className }: { size: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="M12 11h4" /> <path d="M12 16h4" /> <path d="M8 11h.01" /> <path d="M8 16h.01" />
    </svg>
  );
}
