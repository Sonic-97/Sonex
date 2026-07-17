'use client';

import { useState, useRef, useEffect } from 'react';

type EmojiEntry = {
  emoji: string;
  keywords: string[];
  category: string;
};

const EMOJIS: EmojiEntry[] = [
  { emoji: '☕', keywords: ['coffee', 'hot drink', 'قهوة', 'ساخن', 'مشروب'], category: 'مشروبات ساخنة' },
  { emoji: '🍵', keywords: ['tea', 'hot drink', 'شاي', 'ساخن'], category: 'مشروبات ساخنة' },
  { emoji: '🫖', keywords: ['tea', 'teapot', 'hot drink', 'شاي', 'ساخن'], category: 'مشروبات ساخنة' },
  { emoji: '🫘', keywords: ['coffee', 'beans', 'قهوة', 'بُن'], category: 'قهوة' },
  { emoji: '🥤', keywords: ['cold drink', 'soda', 'juice', 'مشروب', 'بارد', 'عصير'], category: 'مشروبات باردة' },
  { emoji: '🧃', keywords: ['cold drink', 'juice box', 'مشروب', 'بارد', 'عصير'], category: 'مشروبات باردة' },
  { emoji: '🧊', keywords: ['ice', 'cold', 'cube', 'ثلج', 'بارد'], category: 'مشروبات باردة' },
  { emoji: '🥛', keywords: ['milk', 'حليب', 'لبن'], category: 'حليب' },
  { emoji: '💧', keywords: ['water', 'drop', 'ماء', 'قطرة'], category: 'ماء' },
  { emoji: '🚰', keywords: ['water', 'tap', 'ماء', 'حنفية'], category: 'ماء' },
  { emoji: '🍰', keywords: ['dessert', 'cake', 'حلوى', 'كيك'], category: 'حلويات' },
  { emoji: '🧁', keywords: ['dessert', 'cupcake', 'حلوى', 'كاب كيك'], category: 'حلويات' },
  { emoji: '🍪', keywords: ['dessert', 'cookie', 'حلوى', 'بسكويت'], category: 'حلويات' },
  { emoji: '🍫', keywords: ['dessert', 'chocolate', 'حلوى', 'شوكولاتة'], category: 'حلويات' },
  { emoji: '🍔', keywords: ['food', 'burger', 'طعام', 'برجر'], category: 'طعام' },
  { emoji: '🍕', keywords: ['food', 'pizza', 'طعام', 'بيتزا'], category: 'طعام' },
  { emoji: '🌭', keywords: ['food', 'hot dog', 'طعام', 'هوت دوج'], category: 'طعام' },
  { emoji: '🥪', keywords: ['food', 'sandwich', 'طعام', 'ساندويتش'], category: 'طعام' },
  { emoji: '🍟', keywords: ['food', 'fries', 'طعام', 'بطاطس', 'فرنش فرايز'], category: 'طعام' },
  { emoji: '🍎', keywords: ['fruit', 'apple', 'فاكهة', 'تفاح'], category: 'فواكه' },
  { emoji: '🍊', keywords: ['fruit', 'orange', 'فاكهة', 'برتقال'], category: 'فواكه' },
  { emoji: '🍌', keywords: ['fruit', 'banana', 'فاكهة', 'موز'], category: 'فواكه' },
  { emoji: '🍓', keywords: ['fruit', 'strawberry', 'فاكهة', 'فراولة'], category: 'فواكه' },
  { emoji: '🥭', keywords: ['fruit', 'mango', 'فاكهة', 'مانجو'], category: 'فواكه' },
  { emoji: '🍍', keywords: ['fruit', 'pineapple', 'فاكهة', 'أناناس'], category: 'فواكه' },
  { emoji: '🍇', keywords: ['fruit', 'grapes', 'فاكهة', 'عنب'], category: 'فواكه' },
  { emoji: '🍉', keywords: ['fruit', 'watermelon', 'فاكهة', 'بطيخ'], category: 'فواكه' },
  { emoji: '🍬', keywords: ['ingredient', 'candy', 'sugar', 'مكون', 'حلوى', 'سكر'], category: 'مكونات' },
  { emoji: '🧂', keywords: ['ingredient', 'salt', 'مكون', 'ملح'], category: 'مكونات' },
  { emoji: '🧈', keywords: ['ingredient', 'butter', 'مكون', 'زبدة'], category: 'مكونات' },
  { emoji: '🧀', keywords: ['ingredient', 'cheese', 'مكون', 'جبنة'], category: 'مكونات' },
  { emoji: '🥚', keywords: ['ingredient', 'egg', 'مكون', 'بيض'], category: 'مكونات' },
  { emoji: '🍯', keywords: ['ingredient', 'honey', 'مكون', 'عسل'], category: 'مكونات' },
  { emoji: '📦', keywords: ['inventory', 'box', 'package', 'مخزون', 'صندوق', 'كرتونة'], category: 'مخزون' },
  { emoji: '🗃️', keywords: ['inventory', 'file box', 'مخزون', 'ملف'], category: 'مخزون' },
  { emoji: '🏷️', keywords: ['inventory', 'label', 'tag', 'مخزون', 'بطاقة', 'ملصق'], category: 'مخزون' },
  { emoji: '📋', keywords: ['inventory', 'clipboard', 'list', 'مخزون', 'قائمة', 'لائحة'], category: 'مخزون' },
  { emoji: '❄️', keywords: ['refrigerator', 'freezer', 'cold', 'ثلاجة', 'مجمّد', 'مبرد'], category: 'تبريد' },
  { emoji: '🥶', keywords: ['refrigerator', 'cold', 'freeze', 'ثلاجة', 'مجمّد', 'بارد'], category: 'تبريد' },
  { emoji: '🧽', keywords: ['cleaning', 'sponge', 'تنظيف', 'إسفنجة'], category: 'تنظيف' },
  { emoji: '🧴', keywords: ['cleaning', 'lotion', 'soap', 'تنظيف', 'صابون'], category: 'تنظيف' },
  { emoji: '🪣', keywords: ['cleaning', 'bucket', 'تنظيف', 'دلو', 'سطل'], category: 'تنظيف' },
  { emoji: '💰', keywords: ['financial', 'money', 'cash', 'مال', 'نقد', 'مصاريف'], category: 'مالية' },
  { emoji: '💸', keywords: ['financial', 'money', 'spend', 'مال', 'دفع', 'مصاريف'], category: 'مالية' },
  { emoji: '🧾', keywords: ['financial', 'receipt', 'invoice', 'فاتورة', 'إيصال', 'مال'], category: 'مالية' },
  { emoji: '⭐', keywords: ['star', 'favorite', 'مميز', 'نجمة', 'مفضل'], category: 'أخرى' },
  { emoji: '🔥', keywords: ['fire', 'hot', 'popular', 'نار', 'حار', 'شائع'], category: 'أخرى' },
  { emoji: '❤️', keywords: ['heart', 'love', 'favorite', 'قلب', 'حب', 'مفضل'], category: 'أخرى' },
  { emoji: '✅', keywords: ['check', 'done', 'complete', 'تم', 'موافق', 'اكتمل'], category: 'أخرى' },
];

const STORAGE_KEY = 'sonic_last_emoji';

function getLastEmoji(): string {
  if (typeof window === 'undefined') return '📦';
  return sessionStorage.getItem(STORAGE_KEY) || '📦';
}

function setLastEmoji(emoji: string) {
  try { sessionStorage.setItem(STORAGE_KEY, emoji); } catch {}
}

type Props = {
  value: string;
  onChange: (emoji: string) => void;
};

export default function EmojiPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  const filtered = query
    ? EMOJIS.filter(
        e => e.emoji.includes(query) || e.keywords.some(k => k.includes(query.toLowerCase())),
      )
    : EMOJIS;

  const grouped: { category: string; emojis: EmojiEntry[] }[] = [];
  const seenCategories = new Set<string>();
  for (const entry of filtered) {
    if (!seenCategories.has(entry.category)) {
      seenCategories.add(entry.category);
      grouped.push({ category: entry.category, emojis: [] });
    }
    grouped[grouped.length - 1].emojis.push(entry);
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => { setOpen(!open); setQuery(''); }}
        className="h-10 w-full rounded-lg border border-gray-200 px-3 py-2 text-xl focus:border-violet-400 focus:outline-none flex items-center gap-2 hover:border-gray-300 transition-colors"
      >
        <span>{value || '📦'}</span>
        <span className="text-xs text-gray-400 font-normal">اختر إيموجي</span>
      </button>

      {open && (
        <div className="absolute z-10 mt-1 w-72 rounded-lg border border-gray-200 bg-white shadow-lg" dir="rtl">
          <div className="p-2 border-b border-gray-100">
            <input
              ref={inputRef}
              type="text"
              placeholder="🔍 بحث..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-sm focus:border-violet-400 focus:outline-none"
            />
          </div>

          <div className="max-h-60 overflow-y-auto p-2">
            {grouped.length === 0 ? (
              <div className="py-4 text-center text-sm text-gray-400">لا توجد نتائج</div>
            ) : (
              grouped.map((g) => (
                <div key={g.category}>
                  {!query && (
                    <div className="px-1 py-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                      {g.category}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-1 mb-2">
                    {g.emojis.map((e) => (
                      <button
                        key={e.emoji}
                        type="button"
                        onClick={() => {
                          onChange(e.emoji);
                          setLastEmoji(e.emoji);
                          setOpen(false);
                          setQuery('');
                        }}
                        className={`h-8 w-8 text-lg rounded-md flex items-center justify-center hover:bg-violet-50 transition-colors ${
                          e.emoji === value
                            ? 'bg-violet-100 ring-1 ring-violet-500'
                            : ''
                        }`}
                        title={e.keywords.slice(0, 3).join(', ')}
                      >
                        {e.emoji}
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="border-t border-gray-100 px-3 py-1.5 flex items-center justify-between">
            <span className="text-[10px] text-gray-400">{EMOJIS.length} إيموجي</span>
            {getLastEmoji() !== value && (
              <button
                type="button"
                onClick={() => onChange(getLastEmoji())}
                className="text-[10px] text-violet-600 hover:text-violet-700"
              >
                ↩ آخر استخدام: {getLastEmoji()}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
