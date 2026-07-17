'use client';

import { useState, useEffect } from 'react';
import { ProductCategory } from '@/types';
import { useAppStore } from '@/store';
import { fetchCategories, createCategory, updateCategory } from '@/lib/api';
import { Layers, Plus, Check } from 'lucide-react';

const THEME_COLORS = [
  { label: 'بنفسجي', value: '#7c3aed' },
  { label: 'نيلي', value: '#4f46e5' },
  { label: 'أزرق', value: '#2563eb' },
  { label: 'أخضر', value: '#059669' },
  { label: 'برتقالي', value: '#ea580c' },
  { label: 'أحمر', value: '#dc2626' },
  { label: 'وردي', value: '#db2777' },
  { label: 'تركواز', value: '#0d9488' },
];

const EMOJIS = ['☕', '🥤', '🍹', '🍰', '🍔', '🥐', '🥪', '🍧', '🍪', '🍕'];

export function CategoryManager() {
  const categoryUpdateVersion = useAppStore((s) => s.categoryUpdateVersion);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [newIcon, setNewIcon] = useState('☕');
  const [newColor, setNewColor] = useState('#7c3aed');

  const load = async () => {
    setLoading(true);
    const data = await fetchCategories(true);
    setCategories(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, [categoryUpdateVersion]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    const cafeId = sessionStorage.getItem('sonic_cafe_id') || undefined;
    await createCategory({
      name: newName.trim(),
      icon: newIcon.trim() || undefined,
      color: newColor || undefined,
      cafeId,
    } as any);
    setNewName('');
    setNewIcon('☕');
    setNewColor('#7c3aed');
    await load();
  };

  const handleToggle = async (c: ProductCategory) => {
    await updateCategory(c.id, { active: !c.active });
    await load();
  };

  const handleSort = async (c: ProductCategory, delta: number) => {
    await updateCategory(c.id, { sortOrder: c.sortOrder + delta });
    await load();
  };

  return (
    <div className="rounded-xl border bg-white shadow-sm" dir="rtl">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Layers className="h-5 w-5 text-violet-600" />
          <h3 className="text-sm font-bold text-gray-800">التصنيفات</h3>
        </div>
      </div>

      <div className="space-y-1 p-3 max-h-52 overflow-y-auto">
        {loading ? (
          <div className="py-4 text-center text-sm text-gray-400">جاري التحميل...</div>
        ) : categories.length === 0 ? (
          <div className="py-4 text-center text-sm text-gray-400">لا توجد تصنيفات بعد</div>
        ) : categories.sort((a, b) => a.sortOrder - b.sortOrder).map((c) => (
          <div key={c.id} className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${c.active ? 'bg-gray-50' : 'bg-red-50 opacity-60'}`}>
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span
                className="h-7 w-7 rounded-lg flex items-center justify-center text-sm"
                style={{ backgroundColor: c.color ? `${c.color}20` : '#f1f5f9' }}
              >
                {c.icon && <span className="text-sm">{c.icon}</span>}
              </span>
              <span className="font-medium text-gray-700 truncate">{c.name}</span>
              <span className="text-[10px] text-gray-400">({c.products?.length ?? 0})</span>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => handleSort(c, -1)} className="text-gray-400 hover:text-gray-600 text-xs px-1">▲</button>
              <button onClick={() => handleSort(c, 1)} className="text-gray-400 hover:text-gray-600 text-xs px-1">▼</button>
              <button onClick={() => handleToggle(c)} className={`mr-2 text-xs font-medium ${c.active ? 'text-red-500' : 'text-emerald-600'}`}>
                {c.active ? 'تعطيل' : 'تفعيل'}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="border-t px-3 py-2 space-y-2">
        <div className="flex items-center gap-1.5">
          <div className="flex gap-1">
            {EMOJIS.slice(0, 5).map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => setNewIcon(emoji)}
                className={`h-7 w-7 text-sm rounded flex items-center justify-center ${newIcon === emoji ? 'bg-violet-100 ring-1 ring-violet-500' : 'hover:bg-gray-100'}`}
              >
                {emoji}
              </button>
            ))}
          </div>
          <div className="flex gap-1">
            {THEME_COLORS.slice(0, 4).map((clr) => (
              <button
                key={clr.value}
                type="button"
                onClick={() => setNewColor(clr.value)}
                className="h-5 w-5 rounded-full border border-gray-300"
                style={{ backgroundColor: clr.value }}
              >
                {newColor === clr.value && <Check className="h-3 w-3 text-white mx-auto" />}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="اسم تصنيف جديد"
            className="flex-1 rounded-lg border px-2.5 py-1.5 text-xs"
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
          />
          <button
            onClick={handleCreate}
            disabled={!newName.trim()}
            className="rounded-lg bg-violet-600 p-1.5 text-white hover:bg-violet-700 disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}