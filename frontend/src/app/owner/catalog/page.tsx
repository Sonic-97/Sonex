'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  listCatalog, getProductCatalog,
  setProductImages, setProductAttributes, setProductTags,
  setProductVariants, setProductAvailability, fetchCategories,
} from '@/lib/api';
import {
  BookOpen, Search, Image, Tags, Tag, Package,
  Settings2, DollarSign, Clock, Save, Loader2,
  Check, Plus, X, GripVertical, ArrowUp, ArrowDown,
} from 'lucide-react';

interface CatalogProduct {
  id: string;
  name: string;
  price: number;
  description?: string;
  emoji?: string;
  category?: string;
  images: any[];
  attributes: any[];
  tags: string[];
  variants: any[];
  availability: any;
  active: boolean;
}

export default function CatalogPage() {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CatalogProduct | null>(null);
  const [categories, setCategories] = useState<any[]>([]);

  // Detail form state
  const [images, setImages] = useState<any[]>([]);
  const [attributes, setAttributes] = useState<any[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [variants, setVariants] = useState<any[]>([]);
  const [availability, setAvailability] = useState<any>({});

  useEffect(() => {
    Promise.all([
      listCatalog().then(setProducts).catch(() => {}),
      fetchCategories(true).then(setCategories).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  const filtered = products.filter(p => {
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (tagFilter && !(p.tags || []).some(t => t.toLowerCase() === tagFilter.toLowerCase())) return false;
    return true;
  });

  const allTags = [...new Set(products.flatMap(p => p.tags || []))].sort();

  const openDetail = async (id: string) => {
    setSelectedId(id);
    try {
      const data = await getProductCatalog(id);
      setDetail(data);
      setImages(data.images || []);
      setAttributes(data.attributes || []);
      setTags(data.tags || []);
      setVariants(data.variants || []);
      setAvailability(data.availability || {});
    } catch {
      setDetail(null);
    }
  };

  const saveAll = async () => {
    if (!selectedId) return;
    setSaving(true);
    try {
      await Promise.all([
        setProductImages(selectedId, images),
        setProductAttributes(selectedId, attributes),
        setProductTags(selectedId, tags),
        setProductVariants(selectedId, variants),
        setProductAvailability(selectedId, availability),
      ]);
      const updated = await listCatalog();
      setProducts(updated);
      await openDetail(selectedId);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex h-96 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-violet-600" /></div>;
  }

  return (
    <div className="flex h-full gap-4 p-4" dir="rtl">
      {/* Left: Product List */}
      <div className="w-72 xl:w-80 shrink-0 flex flex-col bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-3 border-b border-gray-100">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              className="w-full rounded-lg border border-gray-200 pr-9 pl-3 py-2 text-sm" placeholder="بحث..." />
          </div>
          {allTags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              <button onClick={() => setTagFilter('')}
                className={`rounded px-2 py-0.5 text-[10px] font-bold ${!tagFilter ? 'bg-violet-100 text-violet-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                الكل
              </button>
              {allTags.map(t => (
                <button key={t} onClick={() => setTagFilter(t)}
                  className={`rounded px-2 py-0.5 text-[10px] font-bold ${tagFilter === t ? 'bg-violet-100 text-violet-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                  {t}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.map(p => (
            <button key={p.id} onClick={() => openDetail(p.id)}
              className={`w-full flex items-center gap-3 border-b border-gray-50 px-4 py-3 text-right hover:bg-gray-50 transition-all ${selectedId === p.id ? 'bg-violet-50 border-r-2 border-r-violet-500' : ''}`}>
              <span className="text-lg">{p.emoji || '📦'}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-800 truncate">{p.name}</p>
                <p className="text-[10px] text-gray-400">{p.category} · {(p.price).toFixed(2)} EGP</p>
              </div>
              {(p.tags || []).length > 0 && (
                <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[9px] text-amber-600 font-bold">{p.tags.length}</span>
              )}
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="py-12 text-center text-sm text-gray-400">لا توجد منتجات</div>
          )}
        </div>
      </div>

      {/* Right: Catalog Detail */}
      <div className="flex-1 bg-white rounded-xl border border-gray-200 overflow-y-auto">
        {!detail ? (
          <div className="flex h-full items-center justify-center text-gray-400">
            <div className="text-center">
              <BookOpen className="mx-auto h-10 w-10 mb-2 text-gray-300" />
              <p className="text-sm">اختر منتجاً لعرض الكatalogue</p>
            </div>
          </div>
        ) : (
          <div className="p-6">
            {/* Header */}
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{detail.emoji || '📦'}</span>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">{detail.name}</h2>
                  <p className="text-xs text-gray-400">{detail.category} · {(detail.price).toFixed(2)} EGP</p>
                </div>
              </div>
              <button onClick={saveAll} disabled={saving}
                className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2 text-sm font-bold text-white hover:bg-violet-700 disabled:opacity-50">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                حفظ
              </button>
            </div>

            {/* Images */}
            <section className="mb-6">
              <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-gray-700">
                <Image className="h-4 w-4 text-violet-500" /> الصور
              </h3>
              <div className="flex flex-wrap gap-2">
                {images.map((img, i) => (
                  <div key={i} className="relative group">
                    <div className="h-20 w-20 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden">
                      {img.url ? (
                        <img src={img.url} alt={img.alt || ''} className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-[10px] text-gray-400">رابط ناقص</span>
                      )}
                    </div>
                    <button onClick={() => setImages(prev => prev.filter((_, j) => j !== i))}
                      className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                <button onClick={() => setImages(prev => [...prev, { url: '', alt: '', sortOrder: prev.length }])}
                  className="h-20 w-20 rounded-lg border-2 border-dashed border-gray-200 flex items-center justify-center text-gray-400 hover:border-violet-300 hover:text-violet-500 transition-all">
                  <Plus className="h-5 w-5" />
                </button>
              </div>
              {images.filter(i => !i.url).length > 0 && (
                <div className="mt-2 space-y-1">
                  {images.map((img, i) => !img.url ? (
                    <input key={i} type="text" value={img.url} onChange={e => {
                      const next = [...images]; next[i] = { ...next[i], url: e.target.value }; setImages(next);
                    }} className="w-full rounded border border-gray-200 px-3 py-1.5 text-xs" placeholder="رابط الصورة" />
                  ) : null)}
                </div>
              )}
            </section>

            {/* Attributes */}
            <section className="mb-6">
              <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-gray-700">
                <Tag className="h-4 w-4 text-violet-500" /> الخصائص
              </h3>
              {attributes.map((attr, i) => (
                <div key={i} className="mb-1.5 flex gap-2">
                  <input type="text" value={attr.name} onChange={e => {
                    const next = [...attributes]; next[i] = { ...next[i], name: e.target.value }; setAttributes(next);
                  }} className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="الاسم" />
                  <input type="text" value={attr.value} onChange={e => {
                    const next = [...attributes]; next[i] = { ...next[i], value: e.target.value }; setAttributes(next);
                  }} className="flex-[2] rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="القيمة" />
                  <button onClick={() => setAttributes(prev => prev.filter((_, j) => j !== i))}
                    className="rounded-lg border border-red-200 px-2 py-2 text-red-500 hover:bg-red-50">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <button onClick={() => setAttributes(prev => [...prev, { name: '', value: '' }])}
                className="text-xs font-bold text-violet-600 hover:text-violet-800">+ إضافة خاصية</button>
            </section>

            {/* Tags */}
            <section className="mb-6">
              <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-gray-700">
                <Tags className="h-4 w-4 text-violet-500" /> الوسوم
              </h3>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {tags.map((t, i) => (
                  <span key={i} className="flex items-center gap-1 rounded-full bg-violet-50 border border-violet-200 px-3 py-1 text-xs font-bold text-violet-700">
                    {t}
                    <button onClick={() => setTags(prev => prev.filter((_, j) => j !== i))} className="hover:text-red-500">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input type="text" placeholder="وسم جديد" onKeyDown={e => {
                  if (e.key === 'Enter') {
                    const val = (e.target as HTMLInputElement).value.trim();
                    if (val && !tags.includes(val)) setTags(prev => [...prev, val]);
                    (e.target as HTMLInputElement).value = '';
                  }
                }} className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm" />
                <button onClick={() => {
                  const input = document.querySelector<HTMLInputElement>('[placeholder="وسم جديد"]');
                  if (input) {
                    const val = input.value.trim();
                    if (val && !tags.includes(val)) setTags(prev => [...prev, val]);
                    input.value = '';
                  }
                }} className="rounded-lg bg-violet-100 px-3 py-2 text-violet-700 hover:bg-violet-200">
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </section>

            {/* Variants */}
            <section className="mb-6">
              <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-gray-700">
                <Package className="h-4 w-4 text-violet-500" /> المتغيرات
              </h3>
              {variants.map((v, i) => (
                <div key={i} className="mb-1.5 grid grid-cols-5 gap-2">
                  <input type="text" value={v.name} onChange={e => {
                    const next = [...variants]; next[i] = { ...next[i], name: e.target.value }; setVariants(next);
                  }} className="col-span-2 rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="الاسم" />
                  <input type="text" value={v.type || 'size'} onChange={e => {
                    const next = [...variants]; next[i] = { ...next[i], type: e.target.value }; setVariants(next);
                  }} className="rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="النوع" />
                  <input type="number" value={v.priceAdjust || 0} onChange={e => {
                    const next = [...variants]; next[i] = { ...next[i], priceAdjust: Number(e.target.value) }; setVariants(next);
                  }} className="rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="تعديل السعر" />
                  <button onClick={() => setVariants(prev => prev.filter((_, j) => j !== i))}
                    className="rounded-lg border border-red-200 px-2 py-2 text-red-500 hover:bg-red-50">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <button onClick={() => setVariants(prev => [...prev, { name: '', type: 'size', priceAdjust: 0, sortOrder: prev.length, active: true }])}
                className="text-xs font-bold text-violet-600 hover:text-violet-800">+ إضافة متغير</button>
            </section>

            {/* Availability */}
            <section className="mb-6">
              <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-gray-700">
                <Clock className="h-4 w-4 text-violet-500" /> التوفر
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block mb-1 text-[10px] text-gray-500">أيام الأسبوع</label>
                  {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => {
                    const days = (availability.days || ['Sun','Mon','Tue','Wed','Thu','Sat']) as string[];
                    const active = days.includes(d);
                    return (
                      <button key={d} onClick={() => {
                        const next = { ...availability, days: active ? days.filter(x => x !== d) : [...days, d] };
                        setAvailability(next);
                      }} className={`ml-1 mb-1 inline-block rounded px-2 py-0.5 text-[10px] font-bold ${active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-400'}`}>
                        {d}
                      </button>
                    );
                  })}
                </div>
                <div>
                  <label className="block mb-1 text-[10px] text-gray-500">النطاق الزمني</label>
                  <div className="flex gap-2">
                    <input type="time" value={availability.startTime || '08:00'} onChange={e => setAvailability({ ...availability, startTime: e.target.value })}
                      className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm" />
                    <input type="time" value={availability.endTime || '22:00'} onChange={e => setAvailability({ ...availability, endTime: e.target.value })}
                      className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm" />
                  </div>
                </div>
              </div>
            </section>

          </div>
        )}
      </div>
    </div>
  );
}
