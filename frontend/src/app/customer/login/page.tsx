'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Coffee } from 'lucide-react';
import customerApi from '@/lib/customer-api';

export default function CustomerLoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [cafeId, setCafeId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { data } = await customerApi.post('/customer/auth/login', { phone, cafeId });
      sessionStorage.setItem('customer_token', data.token);
      sessionStorage.setItem('customer_id', data.customerId);
      sessionStorage.setItem('customer_name', data.name);
      router.push('/customer/chat');
    } catch (err: any) {
      setError(err.response?.data?.message || 'فشل تسجيل الدخول');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f7f7f5] flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-3xl p-8 border border-[#E8E1D9] shadow-sm">
        <div className="text-center mb-8">
          <Coffee size={36} className="mx-auto mb-3 text-[#8c6239]" />
          <h1 className="text-2xl font-bold text-[#8c6239]">سونيك</h1>
          <p className="text-sm text-gray-500 mt-1">تسجيل دخول العميل</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1.5">رقم الهاتف</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="05XXXXXXXX"
              required
              className="w-full px-4 py-3 rounded-xl border border-[#E8E1D9] bg-[#f7f7f5] text-sm focus:outline-none focus:ring-2 focus:ring-[#8c6239]/20 focus:border-[#8c6239] transition-all"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1.5">معرف الكافيه</label>
            <input
              type="text"
              value={cafeId}
              onChange={(e) => setCafeId(e.target.value)}
              placeholder="cafe-1"
              required
              className="w-full px-4 py-3 rounded-xl border border-[#E8E1D9] bg-[#f7f7f5] text-sm focus:outline-none focus:ring-2 focus:ring-[#8c6239]/20 focus:border-[#8c6239] transition-all"
            />
          </div>

          {error && (
            <div className="bg-red-50 text-red-700 text-sm p-3 rounded-xl border border-red-200">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#8c6239] text-white rounded-xl py-3 font-bold text-sm hover:bg-[#6f4d2d] transition-all active:scale-[0.98] disabled:opacity-50"
          >
            {loading ? '...' : 'تسجيل الدخول'}
          </button>
        </form>
      </div>
    </div>
  );
}
