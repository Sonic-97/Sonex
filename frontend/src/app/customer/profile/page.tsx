'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, User, Phone, Coffee, Copy } from 'lucide-react';

export default function CustomerProfilePage() {
  const router = useRouter();
  const [customerName, setCustomerName] = useState('');
  const [customerId, setCustomerId] = useState('');

  useEffect(() => {
    setCustomerName(sessionStorage.getItem('customer_name') || '');
    setCustomerId(sessionStorage.getItem('customer_id') || '');
  }, []);

  const handleLogout = () => {
    sessionStorage.removeItem('customer_token');
    sessionStorage.removeItem('customer_id');
    sessionStorage.removeItem('customer_name');
    router.push('/customer/login');
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
  };

  return (
    <div className="p-4 space-y-5">
      <h1 className="text-xl font-bold">الملف الشخصي</h1>

      <div className="bg-white rounded-2xl p-6 border border-[#E8E1D9] shadow-sm text-center">
        <div className="w-16 h-16 rounded-full bg-[#f4e9dd] mx-auto mb-3 flex items-center justify-center">
          <User size={28} className="text-[#8c6239]" />
        </div>
        <div className="text-lg font-bold text-gray-800">{customerName || 'عميل'}</div>
      </div>

      <div className="bg-white rounded-2xl border border-[#E8E1D9] shadow-sm divide-y divide-[#E8E1D9]">
        <div className="p-4 flex items-center gap-3">
          <User size={18} className="text-gray-400" />
          <div className="flex-1">
            <div className="text-xs text-gray-400">الاسم</div>
            <div className="text-sm font-bold">{customerName || '—'}</div>
          </div>
        </div>

        <div className="p-4 flex items-center gap-3">
          <Coffee size={18} className="text-gray-400" />
          <div className="flex-1">
            <div className="text-xs text-gray-400">معرف العميل</div>
            <div className="text-sm font-bold flex items-center gap-2">
              {customerId || '—'}
              {customerId && (
                <button onClick={() => copyToClipboard(customerId)} className="text-gray-300 hover:text-gray-500">
                  <Copy size={14} />
                </button>
              )}
            </div>
          </div>
        </div>
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
