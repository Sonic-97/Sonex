'use client';

import { useState, useEffect } from 'react';
import { InCafeOrder, Product } from '@/types';
import {
  editInCafeOrder, cancelInCafeOrder, holdInCafeOrder, resumeHeldInCafeOrder,
  updateInCafeOrderNotes, assignCustomerToOrder, reprintInCafeReceipt, getInCafeOrderHistory,
  fetchProducts,
} from '@/lib/api';
import { X, Pen, Ban, Pause, Play, Printer, History, User, FileText, ExternalLink } from 'lucide-react';

interface Props {
  order: InCafeOrder;
  onClose: () => void;
  onOrderUpdated: (order: InCafeOrder) => void;
}

type Tab = 'actions' | 'edit' | 'history' | 'receipt';

export function OrderManagementModal({ order, onClose, onOrderUpdated }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('actions');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Edit state
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [editItems, setEditItems] = useState<Array<{ productId: string; productName: string; quantity: number; unitPrice: number }>>([]);
  const [editNote, setEditNote] = useState(order.notes || '');
  const [editReason, setEditReason] = useState('');

  // Notes state
  const [newNotes, setNewNotes] = useState(order.notes || '');

  // Customer state
  const [customerName, setCustomerName] = useState(order.customerName);
  const [customerPhone, setCustomerPhone] = useState(order.customerPhone || '');
  const [customerId, setCustomerId] = useState(order.customerId || '');

  // History state
  const [historyEntries, setHistoryEntries] = useState<any[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  // Receipt state
  const [receiptData, setReceiptData] = useState<any>(null);
  const [receiptLoaded, setReceiptLoaded] = useState(false);

  // Load products for edit
  useEffect(() => {
    if (activeTab === 'edit') {
      fetchProducts().then(prods => {
        setAllProducts(prods);
        setEditItems(order.items.map(i => ({
          productId: i.productId,
          productName: i.product.name,
          quantity: i.quantity,
          unitPrice: Number(i.unitPrice),
        })));
      }).catch(() => {});
    }
  }, [activeTab, order]);

  const canEdit = order.status !== 'VOID' && order.status !== 'COMPLETED' && order.status !== 'DELIVERED';
  const canCancel = order.status === 'NEW';
  const canHold = order.status === 'NEW' || order.status === 'PREPARING';
  const canResume = order.status === 'ON_HOLD';

  const handleAction = async (action: string, ...args: any[]) => {
    setProcessing(true);
    setError(null);
    try {
      let result: any;
      switch (action) {
        case 'cancel':
          result = await cancelInCafeOrder(order.id, args[0]);
          break;
        case 'hold':
          result = await holdInCafeOrder(order.id, args[0]);
          break;
        case 'resume':
          result = await resumeHeldInCafeOrder(order.id);
          break;
        case 'edit':
          result = await editInCafeOrder(order.id, {
            items: args[0],
            notes: args[1],
            reason: args[2],
          });
          break;
        case 'notes':
          result = await updateInCafeOrderNotes(order.id, args[0]);
          break;
        case 'assign':
          result = await assignCustomerToOrder(order.id, args[0]);
          break;
        case 'receipt':
          result = await reprintInCafeReceipt(order.id);
          setReceiptData(result);
          setReceiptLoaded(true);
          return;
        case 'history':
          const h = await getInCafeOrderHistory(order.id);
          setHistoryEntries(h.entries || []);
          setHistoryLoaded(true);
          return;
      }
      if (result) onOrderUpdated(result);
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Action failed');
    } finally {
      setProcessing(false);
    }
  };

  const handleEditItemQty = (idx: number, delta: number) => {
    setEditItems(prev => prev.map((item, i) =>
      i === idx ? { ...item, quantity: Math.max(1, item.quantity + delta) } : item
    ));
  };

  const handleEditItemPrice = (idx: number, price: number) => {
    setEditItems(prev => prev.map((item, i) =>
      i === idx ? { ...item, unitPrice: price } : item
    ));
  };

  const submitEdit = () => {
    const reason = prompt('Reason for edit:') || 'POS edit';
    handleAction('edit',
      editItems.map(i => ({ productId: i.productId, quantity: i.quantity, unitPrice: i.unitPrice })),
      editNote,
      reason,
    );
  };

  const submitCancel = () => {
    const reason = prompt('Reason for cancellation:');
    if (!reason) return;
    handleAction('cancel', reason);
  };

  const submitNotes = () => {
    handleAction('notes', newNotes);
  };

  const submitAssign = () => {
    handleAction('assign', { customerName, customerPhone: customerPhone || undefined, customerId: customerId || undefined });
  };

  const TABS: Array<{ key: Tab; label: string; icon: any }> = [
    { key: 'actions', label: 'إجراءات', icon: ExternalLink },
    { key: 'edit', label: 'تعديل', icon: Pen, disabled: !canEdit },
    { key: 'history', label: 'سجل', icon: History },
    { key: 'receipt', label: 'الفاتورة', icon: Printer },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40">
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl" dir="rtl">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-800">إدارة الطلب {order.code}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>

        {/* Order Info */}
        <div className="mb-4 rounded-xl bg-gray-50 p-3 text-xs text-gray-600 space-y-1">
          <div className="flex justify-between"><span>العميل:</span><span className="font-bold text-gray-800">{order.customerName}</span></div>
          <div className="flex justify-between"><span>الحالة:</span><span className="font-bold text-gray-800">{order.status}</span></div>
          <div className="flex justify-between"><span>الإجمالي:</span><span className="font-bold text-gray-800">{Number(order.total).toFixed(2)} EGP</span></div>
          <div className="flex justify-between"><span>الدفع:</span><span className="font-bold text-gray-800">{order.isPaid ? 'مدفوع' : 'غير مدفوع'}</span></div>
        </div>

        {/* Tabs */}
        <div className="mb-4 flex gap-2 overflow-x-auto">
          {TABS.filter(t => !t.disabled).map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition-colors ${
                activeTab === tab.key ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <tab.icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="mb-3 rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-700">{error}</div>
        )}

        {/* Tab Content */}
        {activeTab === 'actions' && (
          <div className="space-y-3">
            {canCancel && (
              <button
                onClick={submitCancel}
                disabled={processing}
                className="w-full flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700 hover:bg-red-100 transition-all disabled:opacity-50"
              >
                <Ban className="h-4 w-4" />
                إلغاء الطلب (فقط من حالة NEW)
              </button>
            )}
            {canHold && (
              <button
                onClick={() => handleAction('hold', '')}
                disabled={processing}
                className="w-full flex items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-700 hover:bg-amber-100 transition-all disabled:opacity-50"
              >
                <Pause className="h-4 w-4" />
                تعليق الطلب (Hold)
              </button>
            )}
            {canResume && (
              <button
                onClick={() => handleAction('resume')}
                disabled={processing}
                className="w-full flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700 hover:bg-emerald-100 transition-all disabled:opacity-50"
              >
                <Play className="h-4 w-4" />
                استئناف الطلب (Resume)
              </button>
            )}
            <button
              onClick={() => setActiveTab('history')}
              className="w-full flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-700 hover:bg-gray-100 transition-all"
            >
              <History className="h-4 w-4" />
              عرض سجل الطلب
            </button>
            <button
              onClick={() => handleAction('receipt')}
              disabled={processing}
              className="w-full flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-700 hover:bg-gray-100 transition-all disabled:opacity-50"
            >
              <Printer className="h-4 w-4" />
              إعادة طباعة الفاتورة
            </button>
          </div>
        )}

        {activeTab === 'edit' && (
          <div className="space-y-3">
            {editItems.map((item, idx) => (
              <div key={item.productId} className="rounded-lg bg-gray-50 p-3">
                <p className="text-sm font-bold text-gray-800 mb-2">{item.productName}</p>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleEditItemQty(idx, -1)}
                      className="h-8 w-8 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-100"
                    >-</button>
                    <span className="w-8 text-center font-bold">{item.quantity}</span>
                    <button
                      onClick={() => handleEditItemQty(idx, 1)}
                      className="h-8 w-8 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-100"
                    >+</button>
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    value={item.unitPrice}
                    onChange={e => handleEditItemPrice(idx, parseFloat(e.target.value) || 0)}
                    className="w-24 rounded-lg border border-gray-200 px-2 py-1.5 text-xs text-center"
                  />
                  <span className="text-sm font-bold text-violet-600 w-20 text-left">
                    {(item.unitPrice * item.quantity).toFixed(2)}
                  </span>
                </div>
              </div>
            ))}
            <div className="flex gap-2">
              <input
                type="text"
                value={editNote}
                onChange={e => setEditNote(e.target.value)}
                placeholder="ملاحظات الطلب"
                className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-xs"
              />
            </div>
            <div className="flex gap-2">
              <button onClick={submitEdit} disabled={processing}
                className="flex-1 rounded-xl bg-violet-600 px-4 py-3 text-sm font-bold text-white hover:bg-violet-700 transition-all disabled:opacity-50"
              >
                {processing ? 'جاري...' : 'حفظ التعديلات'}
              </button>
              <button onClick={() => setActiveTab('actions')}
                className="rounded-xl bg-gray-100 px-4 py-3 text-sm font-bold text-gray-700 hover:bg-gray-200"
              >
                رجوع
              </button>
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div>
            {!historyLoaded ? (
              <button
                onClick={() => handleAction('history')}
                disabled={processing}
                className="w-full rounded-xl bg-violet-600 px-4 py-3 text-sm font-bold text-white hover:bg-violet-700 disabled:opacity-50"
              >
                {processing ? 'جاري التحميل...' : 'تحميل سجل الطلب'}
              </button>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {historyEntries.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-4">لا توجد أحداث مسجلة</p>
                ) : (
                  historyEntries.map((entry: any) => (
                    <div key={entry.id} className="rounded-lg bg-gray-50 p-3 text-xs">
                      <div className="flex justify-between items-start">
                        <span className="font-bold text-violet-700">{entry.action}</span>
                        <span className="text-gray-400 font-mono">{new Date(entry.createdAt).toLocaleString('ar-EG')}</span>
                      </div>
                      {entry.actorId && <p className="text-gray-500 mt-1">بواسطة: {entry.actorId}</p>}
                      {entry.metadata && Object.keys(entry.metadata).length > 0 && (
                        <p className="text-gray-400 mt-1">{JSON.stringify(entry.metadata)}</p>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'receipt' && (
          <div>
            {!receiptLoaded ? (
              <button
                onClick={() => handleAction('receipt')}
                disabled={processing}
                className="w-full rounded-xl bg-violet-600 px-4 py-3 text-sm font-bold text-white hover:bg-violet-700 disabled:opacity-50"
              >
                {processing ? 'جاري...' : 'عرض الفاتورة'}
              </button>
            ) : receiptData && (
              <div className="space-y-3 text-xs">
                <div className="rounded-xl bg-gray-50 p-4 border border-gray-200">
                  <div className="text-center mb-3">
                    <h4 className="text-base font-bold text-gray-800">فاتورة</h4>
                    <p className="text-gray-500 font-mono">{receiptData.receiptNumber}</p>
                  </div>
                  <div className="space-y-1.5 border-b border-gray-200 pb-3 mb-3">
                    <div className="flex justify-between"><span>العميل:</span><span className="font-bold">{receiptData.customerName}</span></div>
                    <div className="flex justify-between"><span>النوع:</span><span className="font-bold">{receiptData.orderType}</span></div>
                    {receiptData.tableNumber && <div className="flex justify-between"><span>الطاولة:</span><span className="font-bold">{receiptData.tableNumber}</span></div>}
                  </div>
                  {receiptData.items.map((item: any, idx: number) => (
                    <div key={idx} className="flex justify-between items-center py-1.5 border-b border-gray-100 last:border-0">
                      <div>
                        <span className="font-bold text-gray-800">{item.productName}</span>
                        <span className="text-gray-400 mr-1">×{item.quantity}</span>
                      </div>
                      <span className="font-mono font-bold">{item.totalPrice.toFixed(2)}</span>
                    </div>
                  ))}
                  <div className="border-t border-gray-300 mt-3 pt-3 space-y-1">
                    <div className="flex justify-between text-sm"><span className="font-bold">الإجمالي</span><span className="font-bold font-mono">{receiptData.subtotal.toFixed(2)}</span></div>
                    <div className="flex justify-between"><span>المدفوع</span><span className="font-mono">{receiptData.paidAmount.toFixed(2)}</span></div>
                    {receiptData.remainingBalance > 0 && <div className="flex justify-between text-red-600"><span>المتبقي</span><span className="font-mono">{receiptData.remainingBalance.toFixed(2)}</span></div>}
                    <div className="flex justify-between"><span>طريقة الدفع</span><span className="font-bold">{receiptData.paymentMethod || '—'}</span></div>
                  </div>
                  <div className="text-center text-gray-400 mt-4 text-[10px]">
                    <p>تمت الطباعة: {new Date(receiptData.printedAt).toLocaleString('ar-EG')}</p>
                  </div>
                </div>
                <button
                  onClick={() => window.print()}
                  className="w-full rounded-xl bg-gray-100 px-4 py-3 text-sm font-bold text-gray-700 hover:bg-gray-200 transition-all"
                >
                  🖨 طباعة
                </button>
              </div>
            )}
          </div>
        )}

        {/* Notes Section (always visible) */}
        <div className="mt-4 border-t border-gray-200 pt-4">
          <h4 className="text-xs font-bold text-gray-500 mb-2 flex items-center gap-1">
            <FileText className="h-3.5 w-3.5" />
            ملاحظات الطلب
          </h4>
          <div className="flex gap-2">
            <input
              type="text"
              value={newNotes}
              onChange={e => setNewNotes(e.target.value)}
              placeholder="أضف ملاحظة..."
              className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-xs"
            />
            <button
              onClick={submitNotes}
              disabled={processing}
              className="rounded-lg bg-violet-100 px-3 py-2 text-xs font-bold text-violet-700 hover:bg-violet-200 transition-all disabled:opacity-50"
            >
              حفظ
            </button>
          </div>
        </div>

        {/* Customer Section (always visible) */}
        <div className="mt-3 border-t border-gray-200 pt-3">
          <h4 className="text-xs font-bold text-gray-500 mb-2 flex items-center gap-1">
            <User className="h-3.5 w-3.5" />
            تعديل بيانات العميل
          </h4>
          <div className="flex gap-2">
            <input
              type="text"
              value={customerName}
              onChange={e => setCustomerName(e.target.value)}
              placeholder="اسم العميل"
              className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-xs"
            />
            <input
              type="tel"
              value={customerPhone}
              onChange={e => setCustomerPhone(e.target.value)}
              placeholder="رقم الهاتف"
              className="w-32 rounded-lg border border-gray-200 px-3 py-2 text-xs"
            />
            <button
              onClick={submitAssign}
              disabled={processing}
              className="rounded-lg bg-violet-100 px-3 py-2 text-xs font-bold text-violet-700 hover:bg-violet-200 transition-all disabled:opacity-50"
            >
              حفظ
            </button>
          </div>
        </div>

        {processing && (
          <div className="mt-3 text-center text-xs text-gray-400">جاري المعالجة...</div>
        )}
      </div>
    </div>
  );
}
