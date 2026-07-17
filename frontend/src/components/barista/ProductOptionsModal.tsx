'use client';

import { useState, useEffect } from 'react';
import { fetchProductOptionsForPos } from '@/lib/api';
import { X, Check } from 'lucide-react';

interface ProductOptionChoice {
  label: string;
  priceAdjust: number;
  ingredientImpacts?: Array<{ inventoryId: string; quantity: number; unit?: string }>;
  sortOrder: number;
}

interface OptionData {
  id: string;
  name: string;
  required: boolean;
  multiSelect: boolean;
  choices: ProductOptionChoice[];
  sortOrder: number;
}

interface Selection {
  optionId: string;
  choiceLabel: string;
  priceAdjust: number;
}

interface Props {
  productId: string;
  productName: string;
  basePrice: number;
  onConfirm: (selections: Selection[], totalPrice: number) => void;
  onCancel: () => void;
}

export function ProductOptionsModal({ productId, productName, basePrice, onConfirm, onCancel }: Props) {
  const [options, setOptions] = useState<OptionData[]>([]);
  const [selections, setSelections] = useState<Record<string, string | string[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchProductOptionsForPos(productId)
      .then((data: OptionData[]) => {
        setOptions(data.sort((a, b) => a.sortOrder - b.sortOrder));
        const initial: Record<string, string | string[]> = {};
        for (const opt of data) {
          if (opt.required && opt.choices.length > 0 && !opt.multiSelect) {
            initial[opt.id] = opt.choices[0].label;
          } else if (opt.multiSelect) {
            initial[opt.id] = [];
          }
        }
        setSelections(initial);
        setLoading(false);
      })
      .catch(() => {
        setError('Failed to load options');
        setLoading(false);
      });
  }, [productId]);

  const toggleSingle = (optionId: string, label: string) => {
    setSelections((prev) => ({ ...prev, [optionId]: prev[optionId] === label ? (options.find(o => o.id === optionId)?.required ? label : '') : label }));
  };

  const toggleMulti = (optionId: string, label: string) => {
    setSelections((prev) => {
      const current = (prev[optionId] as string[]) || [];
      if (current.includes(label)) {
        return { ...prev, [optionId]: current.filter((l) => l !== label) };
      }
      return { ...prev, [optionId]: [...current, label] };
    });
  };

  const totalAdjust = options.reduce((sum, opt) => {
    const sel = selections[opt.id];
    if (!sel || (Array.isArray(sel) && sel.length === 0)) return sum;
    if (Array.isArray(sel)) {
      return sum + sel.reduce((s, label) => {
        const choice = opt.choices.find((c) => c.label === label);
        return s + (choice?.priceAdjust ?? 0);
      }, 0);
    }
    const choice = opt.choices.find((c) => c.label === sel);
    return sum + (choice?.priceAdjust ?? 0);
  }, 0);

  const totalPrice = basePrice + totalAdjust;

  const buildSelections = (): Selection[] => {
    const result: Selection[] = [];
    for (const opt of options) {
      const sel = selections[opt.id];
      if (!sel) continue;
      if (Array.isArray(sel)) {
        for (const label of sel) {
          const choice = opt.choices.find((c) => c.label === label);
          if (choice) result.push({ optionId: opt.id, choiceLabel: label, priceAdjust: choice.priceAdjust ?? 0 });
        }
      } else if (sel) {
        const choice = opt.choices.find((c) => c.label === sel);
        if (choice) result.push({ optionId: opt.id, choiceLabel: sel, priceAdjust: choice.priceAdjust ?? 0 });
      }
    }
    return result;
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
        <div className="rounded-xl bg-white p-6 shadow-xl">
          <p className="text-gray-500">Loading options...</p>
        </div>
      </div>
    );
  }

  if (error || options.length === 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
        <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
          <h3 className="mb-2 text-lg font-bold text-gray-800">{productName}</h3>
          {error && <p className="mb-4 text-sm text-red-500">{error}</p>}
          <div className="flex gap-2">
            <button onClick={onCancel} className="flex-1 rounded-lg border px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">
              Cancel
            </button>
            <button onClick={() => onConfirm([], basePrice)} className="flex-1 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700">
              Add ${basePrice.toFixed(2)}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-800">{productName}</h3>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-4 max-h-80 space-y-4 overflow-y-auto">
          {options.map((opt) => (
            <div key={opt.id}>
              <p className="mb-1.5 text-sm font-semibold text-gray-700">
                {opt.name}
                {opt.required && <span className="ml-1 text-red-500">*</span>}
              </p>
              <div className="space-y-1">
                {opt.choices
                  .sort((a, b) => a.sortOrder - b.sortOrder)
                  .map((ch) => {
                    const isSelected = Array.isArray(selections[opt.id])
                      ? (selections[opt.id] as string[]).includes(ch.label)
                      : selections[opt.id] === ch.label;
                    return (
                      <button
                        key={ch.label}
                        onClick={() => (opt.multiSelect ? toggleMulti(opt.id, ch.label) : toggleSingle(opt.id, ch.label))}
                        className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                          isSelected
                            ? 'border-amber-500 bg-amber-50 text-amber-800'
                            : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                          isSelected ? 'border-amber-500 bg-amber-500 text-white' : 'border-gray-300'
                        }`}>
                          {isSelected && <Check className="h-3 w-3" />}
                        </span>
                        <span className="flex-1">{ch.label}</span>
                        {ch.priceAdjust > 0 && <span className="text-xs text-gray-400">+${ch.priceAdjust.toFixed(2)}</span>}
                      </button>
                    );
                  })}
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between border-t pt-3">
          <span className="text-sm text-gray-500">
            Total: <span className="text-lg font-bold text-gray-800">${totalPrice.toFixed(2)}</span>
          </span>
          <button
            onClick={() => onConfirm(buildSelections(), totalPrice)}
            className="rounded-lg bg-amber-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-700"
          >
            Add to Cart
          </button>
        </div>
      </div>
    </div>
  );
}
