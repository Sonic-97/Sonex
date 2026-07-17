'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { X, DollarSign } from 'lucide-react';

interface ExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ExpenseModal({ isOpen, onClose }: ExpenseModalProps) {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('Operational cost');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const categories = [
    'Inventory purchase',
    'Operational cost',
    'Maintenance',
    'Miscellaneous'
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description || !amount) {
      toast.error('يرجى ملء جميع الحقول المطلوبة');
      return;
    }

    setLoading(true);
    try {
      await api.post('/expenses', {
        description,
        amount: Number(amount),
        category,
      });
      toast.success('تم تسجيل المصروف بنجاح');
      setDescription('');
      setAmount('');
      setCategory('Operational cost');
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'حدث خطأ أثناء تسجيل المصروف');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 text-violet-600">
              <DollarSign className="h-5 w-5" />
            </div>
            <h2 className="text-xl font-black text-slate-800">تسجيل مصروف جديد</h2>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-bold text-slate-600">التصنيف</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-xl border-2 border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800 outline-none transition-all focus:border-violet-500 focus:bg-white"
            >
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat === 'Inventory purchase' ? 'مشتريات مخزون' :
                   cat === 'Operational cost' ? 'تكاليف تشغيلية' :
                   cat === 'Maintenance' ? 'صيانة' : 'أخرى'}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold text-slate-600">اسم العنصر / البيان</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="مثال: مناديل، أدوات نظافة..."
              className="w-full rounded-xl border-2 border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800 outline-none transition-all focus:border-violet-500 focus:bg-white"
              required
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold text-slate-600">المبلغ (ج.م)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full rounded-xl border-2 border-slate-200 bg-slate-50 px-4 py-3 text-lg font-black text-slate-800 outline-none transition-all focus:border-violet-500 focus:bg-white font-mono"
              required
            />
          </div>

          <div className="pt-4 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl bg-slate-100 py-3.5 text-sm font-bold text-slate-600 hover:bg-slate-200 transition-all"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-[2] rounded-xl bg-violet-600 py-3.5 text-sm font-bold text-white shadow-lg shadow-violet-200 hover:bg-violet-700 hover:shadow-xl hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:pointer-events-none"
            >
              {loading ? 'جاري التسجيل...' : 'حفظ المصروف'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
