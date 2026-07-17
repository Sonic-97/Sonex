'use client';

import { useState, useRef, useEffect } from 'react';
import { INVENTORY_UNITS, getUnitLabel, UnitDef } from '@/lib/inventory-units';
import api from '@/lib/api';

type Props = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
};

type CustomUnit = { id: string; name: string };

export default function UnitSelect({ value, onChange, className = '' }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [customUnits, setCustomUnits] = useState<CustomUnit[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newUnitName, setNewUnitName] = useState('');
  const [saving, setSaving] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const addInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.get('/inventory/units').then(r => {
      if (Array.isArray(r.data)) setCustomUnits(r.data);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (showAddForm && addInputRef.current) {
      addInputRef.current.focus();
    }
  }, [showAddForm]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
        setShowAddForm(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const allUnits: UnitDef[] = [
    ...INVENTORY_UNITS,
    ...customUnits.map(cu => ({
      value: cu.name,
      labelAr: cu.name,
      category: 'count' as const,
    })),
  ];

  const filtered = query
    ? allUnits.filter(u => u.labelAr.includes(query) || u.value.includes(query.toLowerCase()))
    : allUnits;

  const displayLabel = getUnitLabel(value);

  const handleAddUnit = async () => {
    const name = newUnitName.trim();
    if (!name) return;
    setSaving(true);
    try {
      const res = await api.post('/inventory/units', { name });
      const created: CustomUnit = res.data;
      setCustomUnits(prev => [...prev, created]);
      onChange(name);
      setNewUnitName('');
      setShowAddForm(false);
      setOpen(false);
    } catch (err: any) {
      alert(err?.response?.data?.message || 'فشل في إضافة الوحدة');
    }
    setSaving(false);
  };

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <input
        type="text"
        placeholder="ابحث أو اختر وحدة القياس..."
        value={open ? query : displayLabel}
        onFocus={() => { setOpen(true); setQuery(''); }}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); setShowAddForm(false); }}
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none"
      />
      {open && (
        <div className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg" dir="rtl">
          {!showAddForm ? (
            <>
              {filtered.length === 0 ? (
                <div className="px-3 py-2 text-sm text-gray-400">لا توجد نتائج</div>
              ) : (
                filtered.map((unit) => (
                  <button
                    key={unit.value}
                    type="button"
                    onClick={() => { onChange(unit.value); setOpen(false); setQuery(''); }}
                    className={`w-full px-3 py-2 text-right text-sm hover:bg-violet-50 transition-colors flex items-center justify-between ${
                      unit.value === value ? 'bg-violet-50 text-violet-700 font-medium' : 'text-gray-700'
                    }`}
                  >
                    <span>{unit.labelAr}</span>
                    <span className="text-[10px] text-gray-400 font-mono">{unit.value}</span>
                  </button>
                ))
              )}
              <div className="border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => { setShowAddForm(true); setQuery(''); }}
                  className="w-full px-3 py-2.5 text-right text-sm font-medium text-violet-600 hover:bg-violet-50 transition-colors flex items-center gap-2"
                >
                  <span className="text-lg leading-none">+</span> إضافة وحدة جديدة
                </button>
              </div>
            </>
          ) : (
            <div className="p-3 space-y-2">
              <p className="text-xs font-medium text-gray-600">➕ إضافة وحدة جديدة</p>
              <input
                ref={addInputRef}
                type="text"
                placeholder="مثال: سطل, جالون, شكارة..."
                value={newUnitName}
                onChange={(e) => setNewUnitName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddUnit(); if (e.key === 'Escape') setShowAddForm(false); }}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-50 transition-colors"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={handleAddUnit}
                  disabled={saving || !newUnitName.trim()}
                  className="flex-1 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-50 transition-colors"
                >
                  {saving ? 'جاري...' : 'إضافة'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
