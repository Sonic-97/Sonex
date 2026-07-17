'use client';

import { ShoppingCart, Check, X } from 'lucide-react';

interface OrderItem {
  productName: string;
  quantity: number;
  unitPrice: string;
  totalPrice: string;
}

interface ConfirmationCardProps {
  items: OrderItem[];
  subtotal: string;
  deliveryFee: string;
  grandTotal: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

export default function ConfirmationCard({ items, subtotal, deliveryFee, grandTotal, onConfirm, onCancel, loading }: ConfirmationCardProps) {
  return (
    <div className="bg-white border border-emerald-200 rounded-2xl p-4 mb-3 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <ShoppingCart size={16} className="text-emerald-600" />
        <span className="text-xs font-bold text-emerald-700">تأكيد الطلب</span>
      </div>

      <div className="space-y-2 mb-3">
        {items.map((item, i) => (
          <div key={i} className="flex items-center justify-between text-sm">
            <span className="text-gray-800">{item.productName} × {item.quantity}</span>
            <span className="font-bold">{item.totalPrice}</span>
          </div>
        ))}
      </div>

      <div className="border-t border-gray-100 pt-2 space-y-1 text-sm">
        <div className="flex justify-between text-gray-500">
          <span>المجموع</span>
          <span>{subtotal}</span>
        </div>
        <div className="flex justify-between text-gray-500">
          <span>التوصيل</span>
          <span>{deliveryFee}</span>
        </div>
        <div className="flex justify-between font-bold text-base pt-1 border-t border-gray-100">
          <span>الإجمالي</span>
          <span className="text-[#8c6239]">{grandTotal}</span>
        </div>
      </div>

      <div className="flex gap-2 mt-4">
        <button
          onClick={onConfirm}
          disabled={loading}
          className="flex-1 bg-emerald-600 text-white rounded-xl py-3 text-sm font-bold hover:bg-emerald-700 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <Check size={16} />
          تأكيد
        </button>
        <button
          onClick={onCancel}
          disabled={loading}
          className="flex-1 bg-red-50 text-red-600 rounded-xl py-3 text-sm font-bold hover:bg-red-100 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <X size={16} />
          إلغاء
        </button>
      </div>
    </div>
  );
}
