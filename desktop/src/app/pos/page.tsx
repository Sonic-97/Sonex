'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { ProductOptionsModal } from '@/components/pos/ProductOptionsModal';
import type { CategoryWithProducts, ProductSearchResult, CreatePOSOrder, POSOrder, AppliedModifier } from '@/types';
import { Coffee, Search, Plus, Minus, Trash2, ShoppingCart, X, CheckCircle2, CreditCard, DollarSign, Loader2 } from 'lucide-react';

interface CartItem {
  product: ProductSearchResult;
  quantity: number;
  modifiers: AppliedModifier[];
  modifierPriceAdjust: number;
  notes: string;
}

export default function PosPage() {
  const [categories, setCategories] = useState<CategoryWithProducts[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [optionProduct, setOptionProduct] = useState<{ product: ProductSearchResult } | null>(null);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [successOrder, setSuccessOrder] = useState<POSOrder | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');

  useEffect(() => {
    api.pos.categories().then(data => {
      setCategories(Array.isArray(data) ? data : []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const allProducts = categories.flatMap(cat => cat.products.filter(p => p.active));
  const filteredProducts = searchQuery.trim()
    ? allProducts.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : selectedCategory === 'all'
      ? allProducts
      : categories.find(c => c.id === selectedCategory)?.products.filter(p => p.active) ?? [];

  const addToCart = useCallback((product: ProductSearchResult) => {
    if (product.hasModifiers) {
      setOptionProduct({ product });
      return;
    }
    setCart(prev => {
      const existing = prev.find(c => c.product.id === product.id);
      if (existing) {
        return prev.map(c =>
          c.product.id === product.id ? { ...c, quantity: c.quantity + 1 } : c
        );
      }
      return [...prev, { product, quantity: 1, modifiers: [], modifierPriceAdjust: 0, notes: '' }];
    });
  }, []);

  const handleOptionConfirm = (selections: any[], totalPrice: number) => {
    if (!optionProduct) return;
    const modifierPriceAdjust = selections.reduce((sum: number, s: any) => sum + s.priceAdjustment, 0);
    const modifiers: AppliedModifier[] = selections.map((s: any) => ({
      groupId: s.groupId,
      optionId: s.optionId,
      optionName: s.optionName,
      priceAdjustment: s.priceAdjustment,
    }));

    setCart(prev => {
      const existing = prev.find(c => c.product.id === optionProduct.product.id);
      if (existing) {
        return prev.map(c =>
          c.product.id === optionProduct.product.id
            ? { ...c, quantity: c.quantity + 1, modifiers, modifierPriceAdjust }
            : c
        );
      }
      return [...prev, { product: optionProduct.product, quantity: 1, modifiers, modifierPriceAdjust, notes: '' }];
    });
    setOptionProduct(null);
  };

  const updateQty = (productId: string, delta: number) => {
    setCart(prev =>
      prev.map(c =>
        c.product.id === productId
          ? { ...c, quantity: Math.max(1, c.quantity + delta) }
          : c
      ).filter(c => c.quantity > 0)
    );
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(c => c.product.id !== productId));
  };

  const cartTotal = cart.reduce((sum, c) => {
    const unitPrice = c.product.price + c.modifierPriceAdjust;
    return sum + unitPrice * c.quantity;
  }, 0);

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    setSubmitLoading(true);
    try {
      const items = cart.map((c, idx) => ({
        id: `tmp-${idx}`,
        productId: c.product.id,
        productName: c.product.name,
        quantity: c.quantity,
        unitPrice: c.product.price,
        discountAmount: 0,
        subtotal: (c.product.price + c.modifierPriceAdjust) * c.quantity,
        modifiers: c.modifiers,
        notes: c.notes || null,
      }));

      const orderPayload: CreatePOSOrder = {
        items,
        payments: [],
        discounts: [],
        customerName: customerName.trim() || null,
        customerPhone: customerPhone.trim() || null,
        source: 'pos',
      };

      const order = await api.pos.orders.create(orderPayload);
      setSuccessOrder(order);
      setCart([]);
      setCustomerName('');
      setCustomerPhone('');
    } catch (err) {
      console.error('Checkout failed:', err);
    } finally {
      setSubmitLoading(false);
    }
  };

  const resetAfterSuccess = () => {
    setSuccessOrder(null);
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
      </div>
    );
  }

  if (successOrder) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="max-w-md w-full rounded-2xl bg-white border border-gray-200 p-8 text-center shadow-lg" dir="rtl">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 border border-emerald-200">
            <CheckCircle2 className="h-10 w-10 text-emerald-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">تم تسجيل الطلب!</h2>
          <p className="text-sm text-gray-500 mb-4">
            رقم الفاتورة: <span className="font-mono font-bold text-violet-600">#{successOrder.orderNumber}</span>
          </p>
          <div className="mb-6 rounded-xl bg-gray-50 p-4 text-right space-y-2 text-sm border border-gray-200">
            <div className="flex justify-between">
              <span className="text-gray-500">العميل:</span>
              <span className="font-bold text-gray-800">{successOrder.customerName || 'زبون'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">الإجمالي:</span>
              <span className="font-bold text-violet-700">{(successOrder.grandTotal / 100).toFixed(2)} EGP</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">حالة الدفع:</span>
              <span className={`font-bold ${successOrder.paymentStatus === 'paid' ? 'text-emerald-600' : 'text-amber-600'}`}>
                {successOrder.paymentStatus === 'paid' ? 'مدفوع' : 'غير مدفوع'}
              </span>
            </div>
          </div>
          <button
            onClick={resetAfterSuccess}
            className="w-full rounded-xl bg-violet-600 px-5 py-3 text-sm font-bold text-white hover:bg-violet-700 transition-all"
          >
            طلب جديد
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full gap-4 p-4" dir="rtl">
      {/* Left: Product Grid */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="ابحث عن منتج..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-white pr-10 pl-4 py-3 text-sm focus:border-violet-400 focus:outline-none"
          />
        </div>

        {/* Category Tabs */}
        <div className="mb-4 flex gap-2 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
          <button
            onClick={() => setSelectedCategory('all')}
            className={`shrink-0 rounded-lg px-4 py-2 text-xs font-bold transition-colors ${
              selectedCategory === 'all' ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            الكل
          </button>
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`shrink-0 rounded-lg px-4 py-2 text-xs font-bold transition-colors ${
                selectedCategory === cat.id ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {cat.emoji && <span className="ml-1">{cat.emoji}</span>}
              {cat.name}
            </button>
          ))}
        </div>

        {/* Product Grid */}
        <div className="flex-1 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 content-start">
          {filteredProducts.map(product => (
            <button
              key={product.id}
              onClick={() => addToCart(product)}
              className="rounded-xl border border-gray-200 bg-white p-4 text-right hover:border-violet-300 hover:shadow-sm transition-all active:scale-[0.98]"
            >
              <div className="flex items-center justify-between mb-2">
                <Coffee className="h-5 w-5 text-violet-500" />
                {product.hasModifiers && (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">خيارات</span>
                )}
              </div>
              <p className="text-sm font-bold text-gray-800 truncate">{product.name}</p>
              <p className="text-sm font-bold text-violet-600 mt-1">{(product.price / 100).toFixed(2)} EGP</p>
            </button>
          ))}
          {filteredProducts.length === 0 && (
            <div className="col-span-full py-16 text-center text-gray-400">
              <ShoppingCart className="mx-auto h-10 w-10 mb-2 text-gray-300" />
              <p className="text-sm">لا توجد منتجات</p>
            </div>
          )}
        </div>
      </div>

      {/* Right: Cart Panel */}
      <div className="w-80 xl:w-96 flex flex-col bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-100">
          <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
            <ShoppingCart className="h-4 w-4 text-violet-600" />
            الطلب الحالي
            {cart.length > 0 && (
              <span className="rounded-full bg-violet-100 text-violet-700 text-[10px] px-2 py-0.5 font-bold">
                {cart.reduce((s, c) => s + c.quantity, 0)}
              </span>
            )}
          </h3>
        </div>

        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {cart.map(item => {
            const unitPrice = item.product.price + item.modifierPriceAdjust;
            return (
              <div key={item.product.id} className="rounded-lg bg-gray-50 p-3">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm font-bold text-gray-800">{item.product.name}</p>
                    {item.modifiers.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {item.modifiers.map((m, i) => (
                          <span key={i} className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700">
                            {m.optionName}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <button onClick={() => removeFromCart(item.product.id)} className="text-gray-400 hover:text-red-500 p-1">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-0.5">
                    <button onClick={() => updateQty(item.product.id, -1)} className="h-7 w-7 rounded flex items-center justify-center text-gray-500 hover:bg-gray-100">
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="w-6 text-center text-xs font-bold">{item.quantity}</span>
                    <button onClick={() => updateQty(item.product.id, 1)} className="h-7 w-7 rounded flex items-center justify-center text-gray-500 hover:bg-gray-100">
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                  <span className="text-sm font-bold text-violet-700">{(unitPrice * item.quantity / 100).toFixed(2)}</span>
                </div>
              </div>
            );
          })}
          {cart.length === 0 && (
            <div className="py-12 text-center text-gray-400">
              <ShoppingCart className="mx-auto h-8 w-8 mb-2 text-gray-300" />
              <p className="text-xs">السلة فارغة</p>
            </div>
          )}
        </div>

        {/* Checkout */}
        {cart.length > 0 && (
          <div className="border-t border-gray-100 p-4 space-y-3">
            <input
              type="text"
              placeholder="اسم العميل (اختياري)"
              value={customerName}
              onChange={e => setCustomerName(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-500">الإجمالي:</span>
              <span className="text-lg font-bold text-violet-700">{(cartTotal / 100).toFixed(2)} EGP</span>
            </div>
            <button
              onClick={handleCheckout}
              disabled={submitLoading}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700 transition-all disabled:opacity-50"
            >
              {submitLoading ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> جاري...</>
              ) : (
                <><CheckCircle2 className="h-4 w-4" /> تأكيد الطلب</>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Product Options Modal */}
      {optionProduct && (
        <ProductOptionsModal
          productId={optionProduct.product.id}
          productName={optionProduct.product.name}
          basePrice={optionProduct.product.price / 100}
          onConfirm={handleOptionConfirm}
          onCancel={() => setOptionProduct(null)}
        />
      )}
    </div>
  );
}
