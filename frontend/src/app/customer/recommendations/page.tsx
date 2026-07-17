'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Star } from 'lucide-react';
import customerApi from '@/lib/customer-api';
import RecommendationCard from '@/components/customer/RecommendationCard';

interface Recommendation {
  productId: string;
  name: string;
  reason: string;
  priority: number;
}

export default function CustomerRecommendationsPage() {
  const router = useRouter();
  const [items, setItems] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetch = async () => {
      try {
        const { data } = await customerApi.get('/customer/recommendations');
        setItems(Array.isArray(data) ? data : data.recommendations || []);
      } catch {
        setError('فشل تحميل المقترحات');
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, []);

  if (loading) {
    return (
      <div className="p-4 space-y-3 animate-pulse">
        <div className="h-8 bg-gray-200 rounded-2xl" />
        <div className="h-20 bg-gray-200 rounded-2xl" />
        <div className="h-20 bg-gray-200 rounded-2xl" />
      </div>
    );
  }

  const handleClick = (name: string) => {
    router.push(`/customer/chat?q=${encodeURIComponent(name)}`);
  };

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold">المقترحات</h1>

      {error && (
        <div className="bg-red-50 text-red-700 text-sm p-3 rounded-xl border border-red-200">{error}</div>
      )}

      {items.length === 0 && !error && (
        <div className="text-center py-12">
          <Star size={40} className="mx-auto mb-3 text-gray-300" />
          <p className="text-sm text-gray-400">لا توجد مقترحات حالياً</p>
          <p className="text-xs text-gray-300 mt-1">اطلب المزيد لاكتشاف توصيات مخصصة</p>
        </div>
      )}

      <div className="space-y-2">
        {items.map((r) => (
          <RecommendationCard
            key={r.productId}
            name={r.name}
            reason={r.reason}
            priority={r.priority}
            onClick={() => handleClick(r.name)}
          />
        ))}
      </div>
    </div>
  );
}
