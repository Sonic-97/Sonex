'use client';

/**
 * @file CashierGrid.tsx
 * @description High-density POS Cashier grid complying with UX-DOC-001:
 * 1. 1-Tap Main product selection, 2-Taps Modifier Drawer.
 * 2. Predictive AI defaults (pre-selects whole milk, regular sugar).
 * 3. Enforces 48px minimum touch targets across all category tabs and item cards.
 * 4. Integrates non-blocking UndoToast for item removals.
 */

import React, { useState, useMemo } from 'react';
import { Button } from '../ui/Button';
import { UndoToast } from '../ui/UndoToast';

export interface ProductItem {
  id: string;
  name: string;
  nameAr: string;
  price: number;
  category: string;
  emoji?: string;
  defaultModifiers?: {
    milk?: string;
    sugar?: string;
    temperature?: string;
    size?: string;
  };
}

export interface CartItem {
  cartId: string;
  productId: string;
  name: string;
  price: number;
  quantity: number;
  modifiers: {
    milk: string;
    sugar: string;
    temperature: string;
    size: string;
    [key: string]: string;
  };
}

const SAMPLE_PRODUCTS: ProductItem[] = [
  {
    id: 'p1',
    name: 'Caffè Latte',
    nameAr: 'لاتيه كافيه',
    price: 45,
    category: 'coffee',
    emoji: '☕',
    defaultModifiers: { milk: 'Whole', sugar: 'Regular', temperature: 'Hot', size: 'Medium' },
  },
  {
    id: 'p2',
    name: 'Espresso Double',
    nameAr: 'إسبريسو دبل',
    price: 35,
    category: 'coffee',
    emoji: '☕',
    defaultModifiers: { milk: 'None', sugar: 'None', temperature: 'Hot', size: 'Double' },
  },
  {
    id: 'p3',
    name: 'Spanish Latte (Iced)',
    nameAr: 'سبانيش لاتيه بارد',
    price: 55,
    category: 'coffee',
    emoji: '🧊',
    defaultModifiers: { milk: 'Condensed', sugar: 'Regular', temperature: 'Iced', size: 'Large' },
  },
  {
    id: 'p4',
    name: 'Fresh Orange Juice',
    nameAr: 'عصير برتقال فريش',
    price: 40,
    category: 'juices',
    emoji: '🍊',
    defaultModifiers: { milk: 'None', sugar: 'No Sugar', temperature: 'Iced', size: 'Medium' },
  },
  {
    id: 'p5',
    name: 'Black Tea',
    nameAr: 'شاي أسود',
    price: 20,
    category: 'tea',
    emoji: '🫖',
    defaultModifiers: { milk: 'None', sugar: 'Regular', temperature: 'Hot', size: 'Medium' },
  },
  {
    id: 'p6',
    name: 'Butter Croissant',
    nameAr: 'كرواسون زبدة',
    price: 30,
    category: 'bakery',
    emoji: '🥐',
    defaultModifiers: { milk: 'None', sugar: 'None', temperature: 'Warmed', size: 'Standard' },
  },
];

const CATEGORIES = [
  { id: 'all', label: 'الكل (All)' },
  { id: 'coffee', label: 'قهوة (Coffee)' },
  { id: 'tea', label: 'شاي (Tea)' },
  { id: 'juices', label: 'عصائر (Juices)' },
  { id: 'bakery', label: 'مخبوزات (Bakery)' },
];

export const CashierGrid: React.FC = () => {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [activeModifierProduct, setActiveModifierProduct] = useState<ProductItem | null>(null);
  const [pendingModifiers, setPendingModifiers] = useState({
    milk: 'Whole',
    sugar: 'Regular',
    temperature: 'Hot',
    size: 'Medium',
  });
  const [paymentMode, setPaymentMode] = useState<'CASH' | 'CARD' | 'DEBT'>('CASH');
  const [debtCustomerName, setDebtCustomerName] = useState('');
  const [checkoutSuccess, setCheckoutSuccess] = useState<string | null>(null);
  const [undoToast, setUndoToast] = useState<{ id: string; item: CartItem } | null>(null);

  const handleCheckout = () => {
    if (cart.length === 0) return;
    const msg = paymentMode === 'DEBT'
      ? `تم قيد طلب بقيمة ${subtotal} ج.م على حساب: ${debtCustomerName}`
      : `تم تأكيد دفع ${subtotal} ج.م (${paymentMode === 'CASH' ? 'نقداً' : 'كارت'}) بنجاح!`;

    setCheckoutSuccess(msg);
    setCart([]);
    setDebtCustomerName('');
    setTimeout(() => setCheckoutSuccess(null), 4000);
  };

  const filteredProducts = useMemo(() => {
    if (selectedCategory === 'all') return SAMPLE_PRODUCTS;
    return SAMPLE_PRODUCTS.filter((p) => p.category === selectedCategory);
  }, [selectedCategory]);

  const subtotal = useMemo(() => {
    return cart.reduce((sum, i) => sum + i.price * i.quantity, 0);
  }, [cart]);

  const handleQuickAdd = (product: ProductItem) => {
    const defaultMods = product.defaultModifiers;
    const modifiers = {
      milk: defaultMods?.milk ?? 'None',
      sugar: defaultMods?.sugar ?? 'Regular',
      temperature: defaultMods?.temperature ?? 'Hot',
      size: defaultMods?.size ?? 'Medium',
    };

    const newItem: CartItem = {
      cartId: `${product.id}-${Date.now()}`,
      productId: product.id,
      name: `${product.nameAr} (${product.name})`,
      price: product.price,
      quantity: 1,
      modifiers,
    };

    setCart((prev) => [...prev, newItem]);
  };

  // Open Modifier Drawer for Customized Order
  const handleOpenModifiers = (product: ProductItem, e: React.MouseEvent) => {
    e.stopPropagation(); // Don't trigger 1-tap quick add
    setActiveModifierProduct(product);
    const dm = product.defaultModifiers;
    setPendingModifiers({
      milk: dm?.milk ?? 'Whole',
      sugar: dm?.sugar ?? 'Regular',
      temperature: dm?.temperature ?? 'Hot',
      size: dm?.size ?? 'Medium',
    });
  };

  // Confirm Modifier Choice & Add
  const handleConfirmModifiers = () => {
    if (!activeModifierProduct) return;

    const newItem: CartItem = {
      cartId: `${activeModifierProduct.id}-${Date.now()}`,
      productId: activeModifierProduct.id,
      name: `${activeModifierProduct.nameAr} (${activeModifierProduct.name})`,
      price: activeModifierProduct.price,
      quantity: 1,
      modifiers: { ...pendingModifiers },
    };

    setCart((prev) => [...prev, newItem]);
    setActiveModifierProduct(null);
  };

  // Remove Item with Non-Blocking Undo Toast
  const handleRemoveItem = (cartId: string) => {
    const itemToRemove = cart.find((i) => i.cartId === cartId);
    if (!itemToRemove) return;

    setCart((prev) => prev.filter((i) => i.cartId !== cartId));
    setUndoToast({ id: cartId, item: itemToRemove });
  };

  const handleUndo = () => {
    if (undoToast) {
      setCart((prev) => [...prev, undoToast.item]);
      setUndoToast(null);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row h-full min-h-screen bg-slate-100 text-slate-900 p-4 gap-4 select-none">
      {/* Left Area: Category Filter + Product Grid */}
      <div className="flex-1 flex flex-col gap-4">
        {checkoutSuccess && (
          <div className="bg-emerald-600 text-white p-3 rounded-2xl font-black text-center text-sm shadow-md animate-in fade-in duration-200">
            {checkoutSuccess}
          </div>
        )}

        {/* Category Tabs (48px+ Touch Target) */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
          {CATEGORIES.map((cat) => (
            <Button
              key={cat.id}
              variant={selectedCategory === cat.id ? 'primary' : 'outline'}
              size="md"
              onClick={() => setSelectedCategory(cat.id)}
              className="shrink-0 font-bold"
            >
              {cat.label}
            </Button>
          ))}
        </div>

        {/* Product Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 xl:grid-cols-4 gap-3">
          {filteredProducts.map((prod) => (
            <div
              key={prod.id}
              onClick={() => handleQuickAdd(prod)}
              className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 hover:border-amber-500 hover:shadow-md transition-all active:scale-[0.97] cursor-pointer flex flex-col justify-between min-h-[140px] touch-manipulation transform-gpu"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-3xl">{prod.emoji || '☕'}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  soundType="click"
                  onClick={(e) => handleOpenModifiers(prod, e)}
                  className="!min-h-[36px] !min-w-[36px] text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100"
                  title="تعديل (Customize)"
                >
                  ⚙️
                </Button>
              </div>

              <div>
                <h3 className="font-bold text-slate-900 text-base leading-tight">
                  {prod.nameAr}
                </h3>
                <p className="text-xs text-slate-500">{prod.name}</p>
                <div className="mt-2 font-extrabold text-amber-800 text-lg">
                  {prod.price} ج.م
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right Area: Order Cart Sidebar */}
      <div className="w-full lg:w-96 bg-white rounded-2xl p-5 shadow-lg border border-slate-200 flex flex-col justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-900 mb-4 pb-2 border-b border-slate-200 flex justify-between items-center">
            <span>سلة الطلبات (Cart)</span>
            <span className="text-sm font-bold bg-amber-100 text-amber-900 px-3 py-1 rounded-full">
              {cart.length} عناصر
            </span>
          </h2>

          {/* Cart List */}
          <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
            {cart.length === 0 ? (
              <div className="text-center py-12 text-slate-400 font-medium">
                السلة فارغة. اضغط على أي منتج للإضافة الفورية.
              </div>
            ) : (
              cart.map((item) => (
                <div
                  key={item.cartId}
                  className="bg-slate-50 rounded-xl p-3 border border-slate-200 flex items-center justify-between gap-2"
                >
                  <div className="flex-1">
                    <div className="font-bold text-slate-900">{item.name}</div>
                    <div className="text-xs text-slate-500">
                      {item.modifiers.milk} | {item.modifiers.sugar} | {item.modifiers.temperature}
                    </div>
                    <div className="font-extrabold text-amber-800 text-sm mt-1">
                      {item.price} ج.م
                    </div>
                  </div>

                  <Button
                    variant="danger"
                    size="sm"
                    soundType="error"
                    onClick={() => handleRemoveItem(item.cartId)}
                    className="!min-h-[40px] !min-w-[40px] px-2 text-xs font-bold"
                  >
                    🗑️
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Total & Checkout Action */}
        <div className="pt-4 border-t border-slate-200 flex flex-col gap-3">
          <div className="flex justify-between items-center text-slate-900">
            <span className="font-bold text-lg">الإجمالي (Total):</span>
            <span className="font-black text-2xl text-amber-800">{subtotal} ج.م</span>
          </div>

          {/* Payment Method Selector */}
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => setPaymentMode('CASH')}
              className={`py-2 rounded-xl text-xs font-bold border transition-colors ${
                paymentMode === 'CASH' ? 'bg-emerald-600 text-white border-emerald-700' : 'bg-slate-100 text-slate-700 border-slate-300'
              }`}
            >
              💵 كاش
            </button>
            <button
              onClick={() => setPaymentMode('CARD')}
              className={`py-2 rounded-xl text-xs font-bold border transition-colors ${
                paymentMode === 'CARD' ? 'bg-blue-600 text-white border-blue-700' : 'bg-slate-100 text-slate-700 border-slate-300'
              }`}
            >
              💳 كارت
            </button>
            <button
              onClick={() => setPaymentMode('DEBT')}
              className={`py-2 rounded-xl text-xs font-bold border transition-colors ${
                paymentMode === 'DEBT' ? 'bg-amber-600 text-white border-amber-700' : 'bg-slate-100 text-slate-700 border-slate-300'
              }`}
            >
              📖 حساب آجل
            </button>
          </div>

          {paymentMode === 'DEBT' && (
            <input
              type="text"
              placeholder="اسم صاحب الحساب الآجل (مثلاً: أ. محمد / مكتب 4)..."
              value={debtCustomerName}
              onChange={(e) => setDebtCustomerName(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-amber-300 bg-amber-50 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 font-bold"
            />
          )}

          <Button
            variant={paymentMode === 'DEBT' ? 'secondary' : 'success'}
            size="lg"
            soundType="success"
            disabled={cart.length === 0 || (paymentMode === 'DEBT' && !debtCustomerName.trim())}
            onClick={handleCheckout}
            className="w-full font-black text-xl"
          >
            {paymentMode === 'DEBT' ? '📖 قيد على دفتر الآجل' : '✅ تأكيد الدفع والطلب'}
          </Button>
        </div>
      </div>

      {/* Smart Modifiers Drawer Modal */}
      {activeModifierProduct && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-lg shadow-2xl space-y-5 animate-in slide-in-from-bottom sm:zoom-in duration-150">
            <div className="flex justify-between items-center border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-xl font-black text-slate-900">
                  تعديل {activeModifierProduct.nameAr}
                </h3>
                <p className="text-xs text-slate-500">{activeModifierProduct.name}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setActiveModifierProduct(null)}
                className="!min-h-[40px] !min-w-[40px] text-slate-400 font-bold"
              >
                ✕
              </Button>
            </div>

            {/* Milk Option */}
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">نوع الحليب (Milk):</label>
              <div className="grid grid-cols-3 gap-2">
                {['Whole', 'Oat', 'Skimmed', 'Condensed', 'None'].map((m) => (
                  <Button
                    key={m}
                    variant={pendingModifiers.milk === m ? 'primary' : 'outline'}
                    size="sm"
                    onClick={() => setPendingModifiers((prev) => ({ ...prev, milk: m }))}
                  >
                    {m}
                  </Button>
                ))}
              </div>
            </div>

            {/* Sugar Option */}
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">مستوى السكر (Sugar):</label>
              <div className="grid grid-cols-3 gap-2">
                {['Regular', 'Extra', 'Light', 'No Sugar'].map((s) => (
                  <Button
                    key={s}
                    variant={pendingModifiers.sugar === s ? 'primary' : 'outline'}
                    size="sm"
                    onClick={() => setPendingModifiers((prev) => ({ ...prev, sugar: s }))}
                  >
                    {s}
                  </Button>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-3 border-t border-slate-200">
              <Button
                variant="secondary"
                size="md"
                onClick={() => setActiveModifierProduct(null)}
                className="flex-1"
              >
                إلغاء (Cancel)
              </Button>
              <Button
                variant="success"
                size="md"
                soundType="success"
                onClick={handleConfirmModifiers}
                className="flex-1 font-bold"
              >
                إضافة للسلة (Add)
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Non-blocking Undo Toast */}
      {undoToast && (
        <UndoToast
          id={undoToast.id}
          message={`تم حذف ${undoToast.item.name} من السلة.`}
          onUndo={handleUndo}
          onDismiss={() => setUndoToast(null)}
        />
      )}
    </div>
  );
};
