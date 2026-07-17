'use client';

import { useState, useEffect } from 'react';
import { useAppStore } from '@/store';
import { Product, InCafeOrder, PriceOverrideLog, Staff } from '@/types';
import { fetchProducts, createInCafeOrder, updatePayment, voidOrder } from '@/lib/api';
import { ShoppingCart, Plus, Minus, Trash2, CreditCard, DollarSign, X } from 'lucide-react';
import { ProductOptionsModal } from './ProductOptionsModal';

interface CartItem {
  productId: string;
  product: Product;
  quantity: number;
  unitPrice: number;
  notes?: string;
  selectedOptions?: Array<{ optionId: string; choiceLabel: string }>;
}

interface OverrideInfo {
  productId: string;
  originalPrice: number;
  overriddenPrice: number;
  reason: string;
}

export function InCafeOrderPanel() {
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [orderNote, setOrderNote] = useState('');
  const [overrides, setOverrides] = useState<OverrideInfo[]>([]);
  const [showPayment, setShowPayment] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<InCafeOrder | null>(null);
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'CARD' | 'MIXED'>('CASH');
  const [category, setCategory] = useState('all');
  const [processing, setProcessing] = useState(false);
  const [optionModal, setOptionModal] = useState<{ product: Product } | null>(null);

  const inCafeOrders = useAppStore((s) => s.inCafeOrders);
  const staff = useAppStore((s) => s.staff);
  const handleInCafeOrderCreated = useAppStore((s) => s.handleInCafeOrderCreated);

  const barista: Staff | undefined = staff[0];

  useEffect(() => {
    fetchProducts().then(setProducts).catch(() => {});
  }, []);

  const categories = ['all', ...new Set(products.map((p) => p.category))];
  const filtered = category === 'all' ? products : products.filter((p) => p.category === category);
  const cafePrice = (p: Product) => Number(p.cafePrice ?? p.price);

  const addToCart = (product: Product) => {
    const hasOptions = product.options && product.options.length > 0 && product.options.some(o => o.choices.length > 0);
    if (hasOptions) {
      setOptionModal({ product });
      return;
    }
    addToCartSimple(product);
  };

  const addToCartSimple = (product: Product, selectedOptions?: CartItem['selectedOptions'], overridePrice?: number) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.productId === product.id);
      const price = overridePrice ?? cafePrice(product);
      if (existing) {
        return prev.map((c) =>
          c.productId === product.id ? { ...c, quantity: c.quantity + 1 } : c,
        );
      }
      return [...prev, { productId: product.id, product, quantity: 1, unitPrice: price, selectedOptions }];
    });
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((c) => (c.productId === productId ? { ...c, quantity: Math.max(0, c.quantity + delta) } : c))
        .filter((c) => c.quantity > 0),
    );
  };

  const setUnitPrice = (productId: string, price: number) => {
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    const original = cafePrice(product);
    setCart((prev) =>
      prev.map((c) => (c.productId === productId ? { ...c, unitPrice: price } : c)),
    );
    if (price !== original) {
      setOverrides((prev) => [
        ...prev.filter((o) => o.productId !== productId),
        { productId, originalPrice: original, overriddenPrice: price, reason: '' },
      ]);
    } else {
      setOverrides((prev) => prev.filter((o) => o.productId !== productId));
    }
  };

  const setOverrideReason = (productId: string, reason: string) => {
    setOverrides((prev) =>
      prev.map((o) => (o.productId === productId ? { ...o, reason } : o)),
    );
  };

  const cartTotal = cart.reduce((sum, c) => sum + c.unitPrice * c.quantity, 0);

  const submitOrder = async () => {
    if (cart.length === 0) return;
    setProcessing(true);
    try {
      const items = cart.map((c) => ({
        productId: c.productId,
        quantity: c.quantity,
        unitPrice: c.unitPrice !== cafePrice(c.product) ? c.unitPrice : undefined,
        notes: c.notes,
        selectedOptions: c.selectedOptions?.length ? c.selectedOptions : undefined,
      }));

      const order = await createInCafeOrder({
        customerName: customerName || undefined,
        customerPhone: customerPhone || undefined,
        notes: orderNote || undefined,
        createdById: barista?.id || '',
        items,
      });

      setCart([]);
      setCustomerName('');
      setCustomerPhone('');
      setOrderNote('');
      setOverrides([]);
      setSelectedOrder(order);
      setShowPayment(true);
      setPaymentAmount(Number(order.total));
    } catch (err) {
      console.error('Failed to create order:', err);
    } finally {
      setProcessing(false);
    }
  };

  const submitPayment = async () => {
    if (!selectedOrder) return;
    setProcessing(true);
    try {
      const paidAmount = Math.min(paymentAmount, Number(selectedOrder.total));
      const paymentStatus = paidAmount >= Number(selectedOrder.total) ? 'PAID' : paidAmount > 0 ? 'PARTIALLY_PAID' : 'NOT_PAID';
      await updatePayment(selectedOrder.id, {
        paymentStatus,
        paymentMethod: paidAmount > 0 ? paymentMethod : undefined,
        paidAmount,
      });
      setShowPayment(false);
      setSelectedOrder(null);
      setPaymentAmount(0);
    } catch (err) {
      console.error('Failed to update payment:', err);
    } finally {
      setProcessing(false);
    }
  };

  const handleVoid = async () => {
    if (!selectedOrder) return;
    const reason = prompt('Reason for voiding:');
    if (!reason) return;
    setProcessing(true);
    try {
      await voidOrder(selectedOrder.id, reason);
      setShowPayment(false);
      setSelectedOrder(null);
    } catch (err) {
      console.error('Failed to void order:', err);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <ShoppingCart className="h-5 w-5 text-amber-600" />
        <h2 className="text-lg font-bold text-gray-800">In-Café POS</h2>
        <span className="ml-auto text-xs text-gray-400">{inCafeOrders.length} orders today</span>
      </div>

      {/* Category filter */}
      <div className="mb-3 flex gap-1 overflow-x-auto">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              category === cat ? 'bg-amber-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {cat === 'all' ? 'All' : cat}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Product grid */}
        <div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {filtered.map((product) => (
              <button
                key={product.id}
                onClick={() => addToCart(product)}
                className="rounded-lg border p-2 text-left transition-colors hover:border-amber-400 hover:bg-amber-50"
              >
                <p className="truncate text-sm font-medium text-gray-800">{product.name}</p>
                <p className="text-xs font-bold text-amber-600">${cafePrice(product).toFixed(2)}</p>
                {product.cafePrice && Number(product.cafePrice) !== Number(product.price) && (
                  <p className="text-[10px] text-gray-400 line-through">${Number(product.price).toFixed(2)}</p>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Cart */}
        <div className="flex flex-col">
          <div className="mb-2 max-h-64 space-y-1.5 overflow-y-auto">
            {cart.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-400">Cart is empty</p>
            ) : (
              cart.map((c) => {
                const original = cafePrice(c.product);
                const isOverridden = c.unitPrice !== original;
                return (
                  <div key={c.productId} className="flex items-center gap-2 rounded-lg bg-gray-50 p-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-700">{c.product.name}</p>
                      {c.selectedOptions?.map((s) => (
                        <span key={s.optionId} className="mr-1 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700">{s.choiceLabel}</span>
                      ))}
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          step="0.01"
                          value={c.unitPrice}
                          onChange={(e) => setUnitPrice(c.productId, parseFloat(e.target.value) || 0)}
                          className={`w-20 rounded border px-1 py-0.5 text-xs tabular-nums ${
                            isOverridden ? 'border-amber-400 bg-amber-50' : 'border-gray-200'
                          }`}
                        />
                        {isOverridden && (
                          <input
                            type="text"
                            placeholder="Override reason"
                            value={overrides.find((o) => o.productId === c.productId)?.reason || ''}
                            onChange={(e) => setOverrideReason(c.productId, e.target.value)}
                            className="w-24 rounded border border-amber-200 px-1 py-0.5 text-[10px]"
                          />
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => updateQuantity(c.productId, -1)} className="rounded p-0.5 text-gray-400 hover:text-gray-600">
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="w-5 text-center text-sm font-bold">{c.quantity}</span>
                      <button onClick={() => updateQuantity(c.productId, 1)} className="rounded p-0.5 text-gray-400 hover:text-gray-600">
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <span className="w-16 text-right text-sm font-bold tabular-nums">
                      ${(c.unitPrice * c.quantity).toFixed(2)}
                    </span>
                  </div>
                );
              })
            )}
          </div>

          {/* Customer info */}
          <div className="mb-2 grid grid-cols-2 gap-2">
            <input
              type="text"
              placeholder="Customer name"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="rounded-lg border px-3 py-1.5 text-sm"
            />
            <input
              type="tel"
              placeholder="Phone (optional)"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              className="rounded-lg border px-3 py-1.5 text-sm"
            />
          </div>

          <input
            type="text"
            placeholder="Order notes"
            value={orderNote}
            onChange={(e) => setOrderNote(e.target.value)}
            className="mb-2 rounded-lg border px-3 py-1.5 text-sm"
          />

          {/* Total & submit */}
          <div className="flex items-center justify-between border-t pt-2">
            <span className="text-lg font-bold text-gray-800">${cartTotal.toFixed(2)}</span>
            <button
              onClick={submitOrder}
              disabled={cart.length === 0 || processing}
              className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-700 disabled:opacity-50"
            >
              {processing ? 'Processing...' : `Charge $${cartTotal.toFixed(2)}`}
            </button>
          </div>
        </div>
      </div>

      {/* Product Options modal */}
      {optionModal && (
        <ProductOptionsModal
          productId={optionModal.product.id}
          productName={optionModal.product.name}
          basePrice={cafePrice(optionModal.product)}
          onConfirm={(selections, totalPrice) => {
            addToCartSimple(optionModal.product, selections.map(s => ({ optionId: s.optionId, choiceLabel: s.choiceLabel })), totalPrice);
            setOptionModal(null);
          }}
          onCancel={() => setOptionModal(null)}
        />
      )}

      {/* Payment modal */}
      {showPayment && selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-800">Payment — {selectedOrder.code}</h3>
              <button onClick={() => { setShowPayment(false); setSelectedOrder(null); }} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="mb-2 text-sm text-gray-500">
              Customer: <span className="font-medium text-gray-700">{selectedOrder.customerName}</span>
            </p>
            <p className="mb-4 text-sm text-gray-500">
              Total: <span className="font-bold text-gray-800">${Number(selectedOrder.total).toFixed(2)}</span>
            </p>

            <div className="mb-3">
              <label className="mb-1 block text-xs font-medium text-gray-500">Payment Amount</label>
              <input
                type="number"
                step="0.01"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(parseFloat(e.target.value) || 0)}
                max={Number(selectedOrder.total)}
                className="w-full rounded-lg border px-3 py-2 text-lg font-bold"
              />
            </div>

            <div className="mb-4">
              <label className="mb-1 block text-xs font-medium text-gray-500">Method</label>
              <div className="flex gap-2">
                {(['CASH', 'CARD', 'MIXED'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setPaymentMethod(m)}
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                      paymentMethod === m ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {m === 'CASH' ? <DollarSign className="h-4 w-4" /> : <CreditCard className="h-4 w-4" />}
                    {m}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleVoid}
                disabled={processing}
                className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                Void Order
              </button>
              <button
                onClick={submitPayment}
                disabled={processing}
                className="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {processing ? 'Processing...' : paymentAmount >= Number(selectedOrder.total) ? 'Mark as Paid' : 'Record Payment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
