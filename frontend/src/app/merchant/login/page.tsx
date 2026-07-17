'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import merchantApi from '@/lib/merchant-api';

export default function MerchantLoginPage() {
  const router = useRouter();
  const [merchantId, setMerchantId] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { data } = await merchantApi.post('/merchant/auth/login', { merchantId, apiKey });
      sessionStorage.setItem('merchant_token', data.token);
      sessionStorage.setItem('merchant_id', data.merchantId);
      router.push('/merchant/dashboard');
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
          <h1 className="text-2xl font-bold text-[#8c6239]">متجر</h1>
          <p className="text-sm text-gray-500 mt-1">تسجيل دخول التاجر</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1.5">معرف التاجر</label>
            <input
              type="text"
              value={merchantId}
              onChange={(e) => setMerchantId(e.target.value)}
              placeholder="merchant-1"
              required
              className="w-full px-4 py-3 rounded-xl border border-[#E8E1D9] bg-[#f7f7f5] text-sm focus:outline-none focus:ring-2 focus:ring-[#8c6239]/20 focus:border-[#8c6239] transition-all"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1.5">مفتاح API</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="••••••••"
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
