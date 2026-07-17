'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import type { ModifierGroupWithOptions, ModifierOption } from '@/types';

interface Selection {
  groupId: string;
  groupName: string;
  optionId: string;
  optionName: string;
  priceAdjustment: number;
}

interface Props {
  productId: string;
  productName: string;
  basePrice: number;
  onConfirm: (selections: Selection[], totalPrice: number) => void;
  onCancel: () => void;
}

export function ProductOptionsModal({ productId, productName, basePrice, onConfirm, onCancel }: Props) {
  const [groups, setGroups] = useState<ModifierGroupWithOptions[]>([]);
  const [loading, setLoading] = useState(true);
  const [selections, setSelections] = useState<Map<string, string[]>>(new Map());
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    api.pos.modifiers(productId).then(data => {
      setGroups(Array.isArray(data) ? data : []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [productId]);

  const totalAdjustment = Array.from(selections.entries())
    .flatMap(([groupId, optionIds]) =>
      optionIds.map(optId => {
        const group = groups.find(g => g.group.id === groupId);
        const option = group?.options.find(o => o.id === optId);
        return option?.priceAdjustment ?? 0;
      })
    )
    .reduce((sum, adj) => sum + adj, 0);

  const totalPrice = Math.max(0, basePrice * 100 + totalAdjustment);

  const isOptionSelected = useCallback((groupId: string, optionId: string) => {
    return selections.get(groupId)?.includes(optionId) ?? false;
  }, [selections]);

  const handleToggleOption = (group: ModifierGroupWithOptions, option: ModifierOption) => {
    setSelections(prev => {
      const next = new Map(prev);
      const gid = group.group.id;
      const current = next.get(gid) ?? [];

      if (current.includes(option.id)) {
        next.set(gid, current.filter(id => id !== option.id));
      } else {
        if (group.group.maxSelect <= 1) {
          next.set(gid, [option.id]);
        } else if (current.length < group.group.maxSelect) {
          next.set(gid, [...current, option.id]);
        }
      }
      return next;
    });
  };

  const handleConfirm = () => {
    const newErrors: string[] = [];

    for (const group of groups) {
      if (group.group.required === 1) {
        const selected = selections.get(group.group.id) ?? [];
        if (selected.length < group.group.minSelect) {
          newErrors.push(`"${group.group.name}" مطلوب`);
        }
      }
    }

    if (newErrors.length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors([]);

    const result: Selection[] = Array.from(selections.entries())
      .flatMap(([groupId, optionIds]) =>
        optionIds.map(optId => {
          const group = groups.find(g => g.group.id === groupId)!;
          const option = group.options.find(o => o.id === optId)!;
          return {
            groupId,
            groupName: group.group.name,
            optionId: option.id,
            optionName: option.name,
            priceAdjustment: option.priceAdjustment,
          };
        })
      );

    onConfirm(result, totalPrice);
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="rounded-2xl bg-white p-8 shadow-xl">
          <p className="text-sm text-gray-500">جاري تحميل الخيارات...</p>
        </div>
      </div>
    );
  }

  if (groups.length === 0) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="mx-4 w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl" dir="rtl">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-gray-900">{productName}</h3>
            <p className="text-sm text-gray-500">
              السعر الأساسي: {(basePrice).toFixed(2)} EGP
            </p>
          </div>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
        </div>

        {/* Errors */}
        {errors.length > 0 && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3">
            {errors.map((err, i) => (
              <p key={i} className="text-xs text-red-700">{err}</p>
            ))}
          </div>
        )}

        {/* Option Groups */}
        <div className="space-y-5">
          {groups.map(group => {
            const gid = group.group.id;
            const selectedIds = selections.get(gid) ?? [];
            return (
              <div key={gid}>
                <div className="mb-2 flex items-center justify-between">
                  <h4 className="text-sm font-bold text-gray-800">{group.group.name}</h4>
                  <span className="text-[10px] text-gray-400">
                    {group.group.required === 1 ? 'مطلوب' : 'اختياري'}
                    {group.group.maxSelect > 1 && ` (حد أقصى ${group.group.maxSelect})`}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {group.options.filter(o => o.active !== 0).map(option => {
                    const selected = selectedIds.includes(option.id);
                    const adjustEg = (option.priceAdjustment / 100).toFixed(2);
                    return (
                      <button
                        key={option.id}
                        onClick={() => handleToggleOption(group, option)}
                        disabled={group.group.maxSelect > 1 && !selected && selectedIds.length >= group.group.maxSelect}
                        className={`w-full flex items-center justify-between rounded-lg border px-4 py-3 text-right text-sm transition-all disabled:opacity-40 ${
                          selected
                            ? 'border-violet-500 bg-violet-50 text-violet-800'
                            : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center ${
                            selected ? 'border-violet-600 bg-violet-600' : 'border-gray-300'
                          }`}>
                            {selected && <div className="h-2 w-2 rounded-full bg-white" />}
                          </div>
                          <span>{option.name}</span>
                        </div>
                        {option.priceAdjustment !== 0 && (
                          <span className={`text-xs font-bold ${option.priceAdjustment > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                            {option.priceAdjustment > 0 ? '+' : ''}{adjustEg} EGP
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="mt-6 border-t border-gray-200 pt-4">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-sm text-gray-500">الإجمالي بعد الخيارات:</span>
            <span className="text-xl font-bold text-violet-700">
              {(totalPrice / 100).toFixed(2)} EGP
            </span>
          </div>
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-bold text-gray-700 hover:bg-gray-50 transition-all"
            >
              إلغاء
            </button>
            <button
              onClick={handleConfirm}
              className="flex-[2] rounded-xl bg-violet-600 px-4 py-3 text-sm font-bold text-white hover:bg-violet-700 transition-all"
            >
              تأكيد
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
