'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSocket } from '@/hooks/useSocket';
import { useAppStore } from '@/store';
import { fetchCustomerDebtSummary, fetchDebtOverview } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import api from '@/lib/api';
import {
  Wallet, Users, Calendar, Clock, ChevronDown, ChevronUp,
  Phone, BadgeCheck, X, ArrowUpDown, Search, AlertTriangle,
  Building2, FileText,
} from 'lucide-react';

export default function OwnerDebtsPage() {
  useSocket('/owner');
  const {
    customerDebtSummary, setCustomerDebtSummary,
    unifiedDebtOverview, setUnifiedDebtOverview,
  } = useAppStore();

  const [loading, setLoading] = useState(true);
  const [expandedCustomer, setExpandedCustomer] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'totalOwed' | 'orderCount' | 'oldestUnpaidDate'>('totalOwed');
  const [payingOrderId, setPayingOrderId] = useState<string | null>(null);
  const [payingAllCustomer, setPayingAllCustomer] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [summary, overview] = await Promise.all([
        fetchCustomerDebtSummary(),
        fetchDebtOverview(),
      ]);
      setCustomerDebtSummary(summary);
      setUnifiedDebtOverview(overview);
    } catch (err) {
      console.error('Failed to load debt data', err);
    } finally {
      setLoading(false);
    }
  }, [setCustomerDebtSummary, setUnifiedDebtOverview]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleMarkAsPaid = async (orderId: string) => {
    setPayingOrderId(orderId);
    try {
      await api.patch(`/in-cafe/orders/${orderId}/payment`, {
        paymentStatus: 'PAID',
        paidAmount: 0,
      });
      await loadData();
    } catch (err) {
      console.error('Failed to mark as paid', err);
    } finally {
      setPayingOrderId(null);
    }
  };

  const handleSettleCustomer = async (customerName: string, orders: any[]) => {
    setPayingAllCustomer(customerName);
    try {
      const unpaid = orders.filter((o: any) => o.paymentStatus !== 'PAID' && o.status !== 'VOID');
      for (const order of unpaid) {
        await api.patch(`/in-cafe/orders/${order.id}/payment`, {
          paymentStatus: 'PAID',
          paidAmount: 0,
        });
      }
      await loadData();
    } catch (err) {
      console.error('Failed to settle customer debts', err);
    } finally {
      setPayingAllCustomer(null);
    }
  };

  const customers = customerDebtSummary?.customers ?? [];
  const filtered = customers.filter((c) =>
    c.customerName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'totalOwed') return b.totalOwed - a.totalOwed;
    if (sortBy === 'orderCount') return b.orderCount - a.orderCount;
    return new Date(a.oldestUnpaidDate).getTime() - new Date(b.oldestUnpaidDate).getTime();
  });

  const formatDate = (d: string) => {
    return new Date(d).toLocaleDateString('ar-EG', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
  };

  const formatTime = (d: string) => {
    return new Date(d).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-violet-200 border-t-violet-600" />
          <span className="text-sm text-gray-400">جاري تحميل بيانات الديون...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">إدارة الديون</h1>
          <p className="text-sm text-gray-500 mt-1">
            متابعة الديون غير المسددة حسب العميل
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="rounded-2xl bg-white border border-gray-100 p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-red-50 flex items-center justify-center">
              <Wallet className="h-5 w-5 text-red-500" />
            </div>
            <div>
              <p className="text-xs text-gray-500">إجمالي الديون</p>
              <p className="text-lg font-bold text-gray-800">{formatCurrency(unifiedDebtOverview?.totalUnpaidDebt ?? customerDebtSummary?.totalUnpaid ?? 0)}</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-white border border-gray-100 p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-amber-50 flex items-center justify-center">
              <Building2 className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <p className="text-xs text-gray-500">ديون التوصيل</p>
              <p className="text-lg font-bold text-gray-800">{formatCurrency(unifiedDebtOverview?.deliveryDebtTotal ?? 0)}</p>
              <p className="text-[10px] text-gray-400">{unifiedDebtOverview?.deliveryDebtCount ?? 0} أمر</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-white border border-gray-100 p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-orange-50 flex items-center justify-center">
              <Coffee className="h-5 w-5 text-orange-500" />
            </div>
            <div>
              <p className="text-xs text-gray-500">ديون الكافيه</p>
              <p className="text-lg font-bold text-gray-800">{formatCurrency(unifiedDebtOverview?.inCafeDebtTotal ?? customerDebtSummary?.totalUnpaid ?? 0)}</p>
              <p className="text-[10px] text-gray-400">{unifiedDebtOverview?.inCafeDebtCount ?? customerDebtSummary?.customerCount ?? 0} عميل</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-white border border-gray-100 p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center">
              <Users className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <p className="text-xs text-gray-500">عدد العملاء</p>
              <p className="text-lg font-bold text-gray-800">{unifiedDebtOverview?.uniqueCustomerCount ?? customerDebtSummary?.customerCount ?? 0}</p>
              <p className="text-[10px] text-gray-400">مع ديون مستحقة</p>
            </div>
          </div>
        </div>
      </div>

      {/* Search & Sort Bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="بحث باسم العميل..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-white pr-10 pl-4 py-2.5 text-sm text-gray-700 placeholder-gray-400 focus:border-violet-400 focus:outline-none transition-all"
          />
        </div>

        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl p-1">
          {[
            { key: 'totalOwed', label: 'المبلغ' },
            { key: 'orderCount', label: 'العدد' },
            { key: 'oldestUnpaidDate', label: 'الأقدم' },
          ].map((opt) => (
            <button
              key={opt.key}
              onClick={() => setSortBy(opt.key as any)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                sortBy === opt.key
                  ? 'bg-violet-100 text-violet-700'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <ArrowUpDown className="h-3 w-3 inline ml-1" />
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Customer List */}
      {sorted.length === 0 ? (
        <div className="rounded-2xl bg-white border border-gray-100 p-12 text-center">
          <BadgeCheck className="mx-auto h-12 w-12 text-emerald-300 mb-3" />
          <h3 className="text-lg font-bold text-gray-700">لا توجد ديون مستحقة</h3>
          <p className="text-sm text-gray-400 mt-1">جميع العملاء سددوا مستحقاتهم</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map((customer) => {
            const isExpanded = expandedCustomer === customer.customerName;
            const isPayingAll = payingAllCustomer === customer.customerName;

            return (
              <div
                key={customer.customerName}
                className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden transition-all"
              >
                {/* Customer Header */}
                <div
                  onClick={() => setExpandedCustomer(isExpanded ? null : customer.customerName)}
                  className="flex items-center justify-between p-5 cursor-pointer hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-xl bg-red-50 flex items-center justify-center">
                      <Users className="h-5 w-5 text-red-500" />
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-800">{customer.customerName}</h3>
                      <div className="flex items-center gap-3 text-[11px] text-gray-500 mt-0.5">
                        <span className="flex items-center gap-1">
                          <ShoppingCart className="h-3 w-3" />
                          {customer.orderCount} طلب
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          منذ {formatDate(customer.oldestUnpaidDate)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-left">
                      <p className="text-lg font-bold text-red-500 font-mono">{formatCurrency(customer.totalOwed)}</p>
                      <p className="text-[10px] text-gray-400">إجمالي المديونية</p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSettleCustomer(customer.customerName, customer.orders);
                        }}
                        disabled={isPayingAll}
                        className="flex items-center gap-1.5 rounded-lg bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 px-3 py-2 text-[11px] font-bold text-emerald-700 transition-all disabled:opacity-50"
                      >
                        {isPayingAll ? (
                          <div className="h-3 w-3 animate-spin rounded-full border-2 border-emerald-300 border-t-emerald-700" />
                        ) : (
                          <BadgeCheck className="h-3.5 w-3.5" />
                        )}
                        <span>تسوية الكل</span>
                      </button>

                      {isExpanded ? <ChevronUp className="h-5 w-5 text-gray-400" /> : <ChevronDown className="h-5 w-5 text-gray-400" />}
                    </div>
                  </div>
                </div>

                {/* Expanded Orders */}
                {isExpanded && (
                  <div className="border-t border-gray-100 px-5 py-4 space-y-2 bg-gray-50/50">
                    {customer.orders
                      .filter((o) => o.paymentStatus !== 'PAID' && o.status !== 'VOID')
                      .map((order) => {
                        const isPaying = payingOrderId === order.id;

                        return (
                          <div
                            key={order.id}
                            className="flex items-center justify-between rounded-xl bg-white border border-gray-200 px-4 py-3"
                          >
                            <div className="flex items-center gap-4 min-w-0">
                              <div className="text-center">
                                <p className="text-xs font-mono font-bold text-gray-700">{order.code}</p>
                                <p className="text-[10px] text-gray-400">{formatTime(order.createdAt)}</p>
                              </div>
                              <div className="flex items-center gap-2 text-[11px] text-gray-500">
                                <span>{order.orderType === 'DINE_IN' ? 'داخلي' : order.orderType === 'TAKEAWAY' ? 'سفري' : 'توصيل'}</span>
                                {order.tableNumber && <span>· طاولة {order.tableNumber}</span>}
                              </div>
                            </div>

                            <div className="flex items-center gap-3">
                              <div className="text-left">
                                <p className="text-sm font-bold text-red-500 font-mono">{formatCurrency(Number(order.remainingBalance))}</p>
                                <p className="text-[10px] text-gray-400">من {formatCurrency(Number(order.total))}</p>
                              </div>

                              <button
                                onClick={() => handleMarkAsPaid(order.id)}
                                disabled={isPaying}
                                className="flex items-center gap-1.5 rounded-lg bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 px-3 py-2 text-[11px] font-bold text-emerald-700 transition-all disabled:opacity-50"
                              >
                                {isPaying ? (
                                  <div className="h-3 w-3 animate-spin rounded-full border-2 border-emerald-300 border-t-emerald-700" />
                                ) : (
                                  <BadgeCheck className="h-3.5 w-3.5" />
                                )}
                                <span>تحصيل</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}

                    {customer.orders.filter((o) => o.paymentStatus !== 'PAID' && o.status !== 'VOID').length === 0 && (
                      <div className="text-center py-4 text-sm text-emerald-600">
                        <BadgeCheck className="h-5 w-5 inline ml-1" />
                        تم تسوية جميع ديون هذا العميل
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Summary Footer */}
      {customerDebtSummary && customerDebtSummary.totalUnpaid > 0 && (
        <div className="rounded-2xl bg-gradient-to-br from-red-50 to-orange-50 border border-red-100 p-5">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-6 w-6 text-red-500" />
            <div>
              <p className="text-sm font-bold text-red-700">
                إجمالي الديون المستحقة: {formatCurrency(customerDebtSummary.totalUnpaid)}
              </p>
              <p className="text-xs text-red-600/70 mt-0.5">
                موزعة على {customerDebtSummary.customerCount} عميل — يُوصى بمتابعة التحصيل
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Coffee(props: any) { return (
  <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 8h1a4 4 0 1 1 0 8h-1" /><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z" /><line x1="6" y1="2" x2="6" y2="4" /><line x1="10" y1="2" x2="10" y2="4" /><line x1="14" y1="2" x2="14" y2="4" />
  </svg>
)}

function ShoppingCart(props: any) { return (
  <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="8" cy="21" r="1" /><circle cx="19" cy="21" r="1" /><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
  </svg>
)}