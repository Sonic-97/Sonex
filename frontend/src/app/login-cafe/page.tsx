'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { Store, Loader2 } from 'lucide-react';

export default function LoginCafePage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { data } = await api.post('/auth/cafe/verify-code', { ownerCode: code });
      sessionStorage.setItem('sonic_cafe_id', data.cafeId);
      sessionStorage.setItem('sonic_cafe_name', data.name);
      router.push('/auth');
    } catch (err: any) {
      setError('كود الكافيه غير صحيح. يرجى المحاولة مرة أخرى');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 p-4 font-sans" dir="rtl">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl border border-slate-200">
        <div className="text-center mb-8">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-amber-600">
            <Store className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">دخول الكافيه</h1>
          <p className="text-sm text-slate-500 mt-2">يرجى إدخال كود الكافيه للمتابعة</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">كود الكافيه</label>
            <input
              type="text"
              required
              placeholder="مثال: Sonic123456"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-4 py-3 text-center text-xl font-bold tracking-wider text-slate-900 focus:border-amber-500 focus:ring-2 focus:ring-amber-200 outline-none transition-all"
            />
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-50 text-red-600 text-xs text-center font-medium border border-red-100">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 py-3 text-sm font-semibold text-white hover:bg-amber-700 active:scale-[0.98] transition-all disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'دخول'}
          </button>
        </form>
      </div>
    </div>
  );
}
