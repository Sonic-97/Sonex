'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, User, Shield, Copy } from 'lucide-react';

export default function MerchantSettingsPage() {
  const router = useRouter();
  const [merchantId, setMerchantId] = useState('');
  const [cafeId, setCafeId] = useState('');

  useEffect(() => {
    setMerchantId(sessionStorage.getItem('merchant_id') || '');
    setCafeId(sessionStorage.getItem('merchant_cafe_id') || '');
  }, []);

  const handleLogout = () => {
    sessionStorage.removeItem('merchant_token');
    sessionStorage.removeItem('merchant_id');
    sessionStorage.removeItem('merchant_cafe_id');
    router.push('/merchant/login');
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
  };

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">الإعدادات</h1>

      <div className="bg-white rounded-2xl border border-[#E8E1D9] shadow-sm divide-y divide-[#E8E1D9]">
        <div className="p-4 flex items-center gap-3">
          <User size={18} className="text-gray-400" />
          <div className="flex-1">
            <div className="text-xs text-gray-400">معرف التاجر</div>
            <div className="text-sm font-bold flex items-center gap-2">
              {merchantId || '—'}
              {merchantId && (
                <button onClick={() => copyToClipboard(merchantId)} className="text-gray-300 hover:text-gray-500">
                  <Copy size={14} />
                </button>
              )}
            </div>
          </div>
        </div>

        {cafeId && (
          <div className="p-4 flex items-center gap-3">
            <Shield size={18} className="text-gray-400" />
            <div className="flex-1">
              <div className="text-xs text-gray-400">معرف الكافيه</div>
              <div className="text-sm font-bold flex items-center gap-2">
                {cafeId}
                <button onClick={() => copyToClipboard(cafeId)} className="text-gray-300 hover:text-gray-500">
                  <Copy size={14} />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <button
        onClick={handleLogout}
        className="w-full bg-red-50 text-red-600 rounded-2xl p-4 font-bold text-sm hover:bg-red-100 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
      >
        <LogOut size={18} />
        تسجيل الخروج
      </button>
    </div>
  );
}
