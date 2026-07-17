'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSocket } from '@/hooks/useSocket';
import useOperationalNotifications from '@/hooks/useOperationalNotifications';
import { useAppStore } from '@/store';
import { InCafeOrder, Staff } from '@/types';
import api from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ExpenseModal } from '@/components/barista/ExpenseModal';
import { OrderManagementModal } from '@/components/barista/OrderManagementModal';
import PlayStationPanel from '@/components/barista/PlayStationPanel';
import {
  Coffee, ArrowRight, User, Phone, DollarSign, CreditCard,
  Wallet, Plus, Minus, Trash2, CheckCircle2, ShoppingBag, X, Loader2, Sparkles,
  UtensilsCrossed, Package, Truck, Table2, BadgeCheck, MessageSquare,
} from 'lucide-react';

interface Category {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  sortOrder: number;
}

interface RefrigeratorCategory {
  id: string;
  name: string;
  emoji: string;
  active: boolean;
}

interface Product {
  id: string;
  name: string;
  price: number;
  categoryId: string | null;
  active: boolean;
  isRefrigerated?: boolean;
  emoji?: string;
  refrigeratorStock?: number;
  lowStockThreshold?: number;
  refrigeratorCategoryId?: string | null;
}

interface CartItem {
  product: Product;
  quantity: number;
  notes: string;
}

const DELAY_THRESHOLD_SEC = 600; // 10 minutes

function formatWaitTime(createdAt: string): string {
  const elapsed = Date.now() - new Date(createdAt).getTime();
  const totalSec = Math.floor(elapsed / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function isDelayed(createdAt: string): boolean {
  return Date.now() - new Date(createdAt).getTime() > DELAY_THRESHOLD_SEC * 1000;
}

const STATUS_CONFIG: Record<string, { badge: string; label: string; next: string | null; nextLabel: string | null }> = {
  NEW:        { badge: '🔴', label: 'جديد', next: 'PREPARING', nextLabel: '▶ بدء التحضير' },
  PREPARING:  { badge: '🟡', label: 'قيد التحضير', next: 'READY', nextLabel: '✔ جاهز' },
  ON_HOLD:    { badge: '⏸', label: 'معلق', next: 'PREPARING', nextLabel: '▶ استئناف' },
  READY:      { badge: '🟢', label: 'جاهز', next: 'DELIVERED', nextLabel: '✅ تم التسليم' },
  DELIVERED:  { badge: '✅', label: 'تم التسليم', next: null, nextLabel: null },
  COMPLETED:  { badge: '✓', label: 'مكتمل', next: null, nextLabel: null },
};

const TAB_CONFIG = [
  { key: 'hot-drinks',     emoji: '☕',  label: 'مشروبات ساخنة' },
  { key: 'cold-drinks',    emoji: '🥤',  label: 'مشروبات باردة'  },
  { key: 'fresh-juices',   emoji: '🍹',  label: 'عصائر طازجة'   },
  { key: 'desserts',       emoji: '🍰',  label: 'حلويات'        },
  { key: 'food',           emoji: '🍔',  label: 'طعام'          },
  { key: 'refrigerator',   emoji: '🧊',  label: 'الثلاجة'       },
  { key: 'playstation',    emoji: '🎮',  label: 'بلاي ستيشن'    },
];

function matchTabToCategory(tabKey: string, categories: Category[]): string | null {
  const keywordMap: Record<string, string[]> = {
    'hot-drinks':   ['ساخن', 'قهوة', 'hot', 'coffee', 'مشروبات ساخنة', 'اسبريسو', 'كابتشينو', 'لاتيه'],
    'cold-drinks':  ['بارد', 'ميلك', 'cold', 'مشروبات باردة', 'شيك', 'فرابيه', 'آيس'],
    'fresh-juices': ['عصير', 'juice', 'عصائر', 'فريش', 'fresh'],
    'desserts':     ['حلو', 'dessert', 'حلويات', 'كيك', 'cake', 'كنافة', 'بسبوسة'],
    'food':         ['طعام', 'food', 'ساندويتش', 'شاورما', 'اكل', 'بيتزا', 'مكرونة', 'برجر'],
  };
  const keywords = keywordMap[tabKey];
  if (!keywords) return null;
  for (const cat of categories) {
    for (const kw of keywords) {
      if (cat.name.includes(kw)) return cat.id;
    }
  }
  return categories.length > 0 ? categories[0].id : null;
}

export default function BaristaPOSWorkspace() {
  useSocket('/barista');
  useOperationalNotifications();
  const { user } = useAuth();
  const categoryUpdateVersion = useAppStore((s) => s.categoryUpdateVersion);
  const productUpdateVersion = useAppStore((s) => s.productUpdateVersion);

  const [categories, setCategories] = useState<Category[]>([]);
  const [refrigeratorCategories, setRefrigeratorCategories] = useState<RefrigeratorCategory[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [allOrders, setAllOrders] = useState<InCafeOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedTab, setSelectedTab] = useState('hot-drinks');
  const [matchedCategoryId, setMatchedCategoryId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [orderType, setOrderType] = useState('DINE_IN');
  const [tableNumber, setTableNumber] = useState('');
  const [isPaid, setIsPaid] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'CARD' | 'WALLET'>('CASH');
  const [checkoutNotes, setCheckoutNotes] = useState('');

  const [sourceType, setSourceType] = useState('INSIDE_CAFE');
  const [employeeId, setEmployeeId] = useState('');
  const [employees, setEmployees] = useState<Staff[]>([]);

  const [customerSuggestions, setCustomerSuggestions] = useState<{ id: string; name: string | null; phone: string }[]>([]);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const customerTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const [submitLoading, setSubmitLoading] = useState(false);
  const [successOrder, setSuccessOrder] = useState<any | null>(null);

  const [showHistory, setShowHistory] = useState(false);

  const [isClockedIn, setIsClockedIn] = useState(false);
  const [clockInLoading, setClockInLoading] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);

  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [showClosingModal, setShowClosingModal] = useState(false);
  const [closingStage, setClosingStage] = useState<1 | 2>(1);
  const [manageOrder, setManageOrder] = useState<InCafeOrder | null>(null);
  const [closingSummary, setClosingSummary] = useState<any>(null);
  const [activePSSessions, setActivePSSessions] = useState(0);
  const [newOrdersCount, setNewOrdersCount] = useState(0);
  const [preparingOrdersCount, setPreparingOrdersCount] = useState(0);
  const [clockTick, setClockTick] = useState(0);

  // 1-second clock tick to keep wait timers live
  useEffect(() => {
    const interval = setInterval(() => setClockTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  // Live operations bar — subscribe to store orders for real-time new/preparing counts
  useEffect(() => {
    const unsub = useAppStore.subscribe((state) => {
      const vals = Object.values(state.orders);
      setNewOrdersCount(vals.filter(o => o.status === 'NEW').length);
      setPreparingOrdersCount(vals.filter(o => o.status === 'PREPARING').length);
    });
    const vals = Object.values(useAppStore.getState().orders);
    setNewOrdersCount(vals.filter(o => o.status === 'NEW').length);
    setPreparingOrdersCount(vals.filter(o => o.status === 'PREPARING').length);
    return () => unsub();
  }, []);

  // Poll active PlayStation sessions
  useEffect(() => {
    const fetchPS = async () => {
      try {
        const { data } = await api.get('/playstation/sessions/active');
        setActivePSSessions(Array.isArray(data) ? data.length : 0);
      } catch { setActivePSSessions(0); }
    };
    fetchPS();
    const interval = setInterval(fetchPS, 15000);
    return () => clearInterval(interval);
  }, []);

  const fetchWalletBalance = useCallback(async () => {
    try {
      const { data } = await api.get('/staff/wallet/balance');
      setWalletBalance(data.currentCashWallet);
    } catch {}
  }, []);

  useEffect(() => {
    fetchWalletBalance();
    const interval = setInterval(fetchWalletBalance, 10000);
    return () => clearInterval(interval);
  }, [fetchWalletBalance]);

  useEffect(() => {
    api.get('/staff').then(r => setEmployees(r.data.filter((s: Staff) => s.active))).catch(() => {});
    if (user?.employeeId) {
      api.get(`/attendance/active/${user.employeeId}`)
        .then(r => setIsClockedIn(r.data.active))
        .catch(() => {});
    }
  }, [user?.employeeId]);

  const handleClockToggle = async () => {
    if (!user?.employeeId) return;
    setClockInLoading(true);
    try {
      if (isClockedIn) {
        const { data } = await api.post('/staff/wallet/settle/stage1');
        setClosingSummary(data);
        setClosingStage(1);
        setShowClosingModal(true);
      } else {
        await api.post('/attendance/clock-in', { staffId: user.employeeId });
        setIsClockedIn(true);
      }
    } catch (err: any) {
      alert(err.response?.data?.message || 'حدث خطأ في النظام');
    } finally {
      setClockInLoading(false);
    }
  };

  const handleConfirmHandover = async () => {
    if (!user?.employeeId) return;
    setClockInLoading(true);
    try {
      await api.post('/staff/wallet/settle/stage2');
      await api.post('/attendance/clock-out', { staffId: user.employeeId });
      setIsClockedIn(false);
      setShowClosingModal(false);
      setWalletBalance(0);
    } catch (err: any) {
      alert(err.response?.data?.message || 'حدث خطأ في النظام');
    } finally {
      setClockInLoading(false);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      try {
        const [catsRes, prodsRes, ordersRes, refCatsRes] = await Promise.all([
          api.get('/product-management/categories'),
          api.get('/products'),
          api.get('/in-cafe/orders'),
          api.get('/product-management/refrigerator-categories'),
        ]);
        const cats = Array.isArray(catsRes.data) ? catsRes.data : [];
        setCategories(cats.sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)));
        setProducts(Array.isArray(prodsRes.data) ? prodsRes.data : []);
        setAllOrders(Array.isArray(ordersRes.data) ? ordersRes.data : []);
        setRefrigeratorCategories(Array.isArray(refCatsRes.data) ? refCatsRes.data : []);
      } catch {
        setError('خطأ في تحميل البيانات');
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [categoryUpdateVersion, productUpdateVersion]);

  useEffect(() => {
    setMatchedCategoryId(matchTabToCategory(selectedTab, categories));
  }, [selectedTab, categories]);

  useEffect(() => {
    const unsubInCafe = useAppStore.subscribe((state) => {
      setAllOrders((prev) => {
        const updated = state.inCafeOrders;
        if (updated.length > 0) {
          const map = new Map(prev.map((o) => [o.id, o]));
          for (const o of updated) {
            map.set(o.id, o);
          }
          return [...map.values()].sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
        }
        return prev;
      });
    });
    return () => unsubInCafe();
  }, []);

  const completedOrders = allOrders.filter(
    (o) => o.paymentStatus === 'PAID' && o.status !== 'VOID'
  );
  const unpaidOrders = allOrders.filter(
    (o) => o.paymentStatus !== 'PAID' && o.status !== 'VOID'
  );

  const filteredProducts = products.filter((p) => {
    if (!p.active) return false;
    if (selectedTab === 'refrigerator') return p.isRefrigerated === true;
    if (selectedTab === 'playstation') return false;
    if (matchedCategoryId) return p.categoryId === matchedCategoryId;
    return true;
  }).filter((p) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.trim().toLowerCase();
    return p.name.toLowerCase().includes(q);
  });

  const handleAddToOrder = (product: Product) => {
    if (product.isRefrigerated) {
      const existing = cart.find((item) => item.product.id === product.id);
      const currentQty = existing ? existing.quantity : 0;
      if (currentQty >= (product.refrigeratorStock ?? 0)) {
        alert(`خطأ: الكمية المطلوبة غير متوفرة في الثلاجة. الكمية المتاحة: ${product.refrigeratorStock}`);
        return;
      }
    }
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { product, quantity: 1, notes: '' }];
    });
  };

  const handleUpdateQty = (productId: string, increment: boolean) => {
    if (increment) {
      const cartItem = cart.find(item => item.product.id === productId);
      const product = products.find(p => p.id === productId);
      if (cartItem && product && product.isRefrigerated) {
        if (cartItem.quantity >= (product.refrigeratorStock ?? 0)) {
          alert(`خطأ: لا يمكن إضافة المزيد. الكمية المتاحة في الثلاجة: ${product.refrigeratorStock}`);
          return;
        }
      }
    }
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.product.id === productId) {
            const nextQty = increment ? item.quantity + 1 : item.quantity - 1;
            return { ...item, quantity: nextQty };
          }
          return item;
        })
        .filter((item) => item.quantity > 0)
    );
  };

  const handleRemoveFromCart = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.product.id !== productId));
  };

  const handleUpdateItemNotes = (productId: string, notes: string) => {
    setCart((prev) =>
      prev.map((item) =>
        item.product.id === productId ? { ...item, notes } : item
      )
    );
  };

  const handleCustomerSearch = (value: string) => {
    setCustomerName(value);
    if (customerTimeoutRef.current) clearTimeout(customerTimeoutRef.current);
    if (value.trim().length < 2) {
      setShowCustomerDropdown(false);
      return;
    }
    customerTimeoutRef.current = setTimeout(async () => {
      try {
        const { data } = await api.get(`/customers/search?q=${encodeURIComponent(value.trim())}`);
        setCustomerSuggestions(data);
        setShowCustomerDropdown(data.length > 0);
      } catch { setShowCustomerDropdown(false); }
    }, 300);
  };

  const selectCustomer = (c: { id: string; name: string | null; phone: string }) => {
    setCustomerName(c.name || c.phone);
    setCustomerPhone(c.phone);
    setShowCustomerDropdown(false);
  };

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) return;
    if (!user?.employeeId) {
      setError('يجب تسجيل الدخول أولاً');
      return;
    }
    setSubmitLoading(true);
    setError(null);
    try {
      const payload: any = {
        customerName: customerName.trim() || undefined,
        customerPhone: customerPhone.trim() || undefined,
        orderType,
        sourceType,
        employeeId: employeeId || undefined,
        tableNumber: orderType === 'DINE_IN' ? tableNumber.trim() || undefined : undefined,
        paymentStatus: isPaid ? 'PAID' : 'NOT_PAID',
        paymentMethod: isPaid ? paymentMethod : undefined,
        notes: checkoutNotes.trim() || undefined,
        createdById: user.employeeId,
        items: cart.map((item) => ({
          productId: item.product.id,
          quantity: item.quantity,
          unitPrice: Number(item.product.price),
          notes: item.notes.trim() || undefined,
        })),
      };
      const { data } = await api.post('/in-cafe/orders', payload);
      setSuccessOrder(data);
      setAllOrders((prev) => [data, ...prev]);
      setCart([]);
      setCustomerName('');
      setCustomerPhone('');
      setOrderType('DINE_IN');
      setTableNumber('');
      setIsPaid(true);
      setPaymentMethod('CASH');
      setCheckoutNotes('');
    } catch (err: any) {
      setError(err.response?.data?.message || 'حدث خطأ أثناء إرسال الطلب');
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleUpdateOrderStatus = async (orderId: string, status: string) => {
    try {
      const { data } = await api.patch(`/in-cafe/orders/${orderId}/status`, { status });
      setAllOrders((prev) => prev.map((o) => (o.id === orderId ? data : o)));
    } catch (err: any) {
      setError(err.response?.data?.message || 'فشل تحديث حالة الطلب');
    }
  };

  const handleMarkAsPaid = async (orderId: string) => {
    try {
      const { data } = await api.patch(`/in-cafe/orders/${orderId}/payment`, {
        paymentStatus: 'PAID',
        paymentMethod: 'CASH',
        paidAmount: 0,
      });
      setAllOrders((prev) => prev.map((o) => (o.id === orderId ? data : o)));
    } catch {
      setError('حدث خطأ أثناء تحديث الدفع');
    }
  };

  const startNewOrder = () => {
    setCart([]);
    setSuccessOrder(null);
  };

  const formatDate = (d: string) => {
    const date = new Date(d);
    return date.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
  };

  const cartTotal = cart.reduce(
    (sum, item) => sum + Number(item.product.price) * item.quantity,
    0
  );

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 text-gray-900">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-10 w-10 animate-spin text-violet-600" />
          <span className="text-sm font-medium text-gray-500">جاري تحميل شاشة البيع...</span>
        </div>
      </div>
    );
  }

  const renderProductCard = (prod: Product) => {
    const cartQty = cart.find((item) => item.product.id === prod.id)?.quantity || 0;
    const remainingStock = prod.isRefrigerated ? (prod.refrigeratorStock ?? 0) - cartQty : null;
    return (
      <button
        key={prod.id}
        onClick={() => handleAddToOrder(prod)}
        className="rounded-xl bg-white border border-gray-200 hover:border-violet-300 hover:shadow-md p-5 text-right flex flex-col justify-between h-36 active:scale-[0.97] transition-all duration-200 cursor-pointer group shadow-sm"
      >
        <div className="flex flex-col">
          <h4 className="text-[15px] font-bold text-gray-800 leading-snug flex items-center gap-2">
            <span className="text-2xl">{prod.emoji || '☕'}</span>
            <span className="line-clamp-2">{prod.name}</span>
          </h4>
          {prod.isRefrigerated && (
            <span className={`text-[10px] font-bold inline-block mt-2 px-2.5 py-1 rounded-md ${
              remainingStock !== null && remainingStock <= (prod.lowStockThreshold ?? 0)
                ? 'bg-rose-50 text-rose-700 border border-rose-200'
                : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
            }`}>
              المخزون: {prod.refrigeratorStock}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between mt-auto">
          <span className="text-lg font-bold text-violet-600">{Number(prod.price).toFixed(2)} <span className="text-[10px] text-violet-400 font-bold">EGP</span></span>
          <div className="h-9 w-9 rounded-lg bg-violet-50 border border-violet-200 flex items-center justify-center text-violet-600 group-hover:bg-violet-600 group-hover:text-white group-hover:border-violet-600 transition-all duration-200">
            <Plus className="h-5 w-5" />
          </div>
        </div>
      </button>
    );
  };

  const renderRefrigeratorContent = () => (
    <div className="space-y-5">
      {refrigeratorCategories.map(rcat => {
        const catProducts = filteredProducts.filter(p => p.refrigeratorCategoryId === rcat.id);
        if (catProducts.length === 0) return null;
        return (
          <div key={rcat.id}>
            <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2 border-b border-gray-200 pb-2">
              <span>{rcat.emoji}</span>
              <span>{rcat.name}</span>
            </h3>
            <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
              {catProducts.map(prod => renderProductCard(prod))}
            </div>
          </div>
        );
      })}
      {(() => {
        const uncategorized = filteredProducts.filter(p => !p.refrigeratorCategoryId);
        if (uncategorized.length === 0) return null;
        return (
          <div>
            <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2 border-b border-gray-200 pb-2">
              <span>🧊</span>
              <span>أخرى</span>
            </h3>
            <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
              {uncategorized.map(prod => renderProductCard(prod))}
            </div>
          </div>
        );
      })()}
      {filteredProducts.length === 0 && (
        <div className="col-span-full py-16 text-center text-gray-400">
          <ShoppingBag className="mx-auto h-12 w-12 text-gray-200 mb-3" />
          <p className="text-sm">لا توجد منتجات مبردة</p>
        </div>
      )}
    </div>
  );

  const renderPlaystationContent = () => <PlayStationPanel />;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 flex flex-col font-sans overflow-hidden" dir="rtl">

      {/* Header */}
      <header className="border-b border-gray-200 bg-white px-5 py-3 flex items-center justify-between z-20 shrink-0 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="h-11 w-11 rounded-xl bg-violet-600 flex items-center justify-center text-white font-bold">
            <Coffee className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">شاشة البيع (Touch POS)</h1>
            <p className="text-[11px] font-medium text-gray-500">{user?.name ? `${user.name}` : 'سونيك كوفي'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setShowExpenseModal(true)}
            className="flex items-center gap-2 rounded-xl bg-gray-100 border border-gray-200 hover:bg-gray-200 px-4 py-2.5 text-xs font-bold text-gray-700 transition-all active:scale-95"
          >
            <DollarSign className="h-4 w-4 text-violet-600" />
            <span>مصروف</span>
          </button>
          {isClockedIn && (
            <div className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-xs font-bold text-emerald-700">
              <Wallet className="h-4 w-4" />
              <span>{walletBalance.toFixed(2)} ج.م</span>
            </div>
          )}
          <button
            onClick={handleClockToggle}
            disabled={clockInLoading || !user?.employeeId}
            className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-bold transition-all duration-300 active:scale-95 disabled:opacity-50 shadow-sm ${
              isClockedIn
                ? 'bg-rose-600 hover:bg-rose-700 text-white'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white'
            }`}
          >
            {clockInLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (isClockedIn ? '⏹' : '▶')}
            <span>{isClockedIn ? 'إنهاء اليوم' : 'بدء الدوام'}</span>
          </button>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-bold transition-all duration-300 ${
              showHistory
                ? 'bg-violet-50 text-violet-700 border-violet-300'
                : 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200'
            }`}
          >
            <BadgeCheck className="h-4 w-4" />
            <span>الطلبات ({completedOrders.length})</span>
          </button>
        </div>
      </header>

      {/* Live Operations Bar */}
      <div className="bg-white border-b border-gray-200 px-5 py-2.5 flex items-center gap-3 shrink-0 overflow-x-auto" dir="rtl">
        <button
          onClick={() => { setShowHistory(true); }}
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition-colors shrink-0"
        >
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span>جديد: {newOrdersCount}</span>
        </button>
        <button
          onClick={() => { setShowHistory(true); }}
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors shrink-0"
        >
          <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
          <span>قيد التحضير: {preparingOrdersCount}</span>
        </button>
        <button
          onClick={() => setSelectedTab('playstation')}
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition-colors shrink-0"
        >
          <span>🎮</span>
          <span>جلسات: {activePSSessions}</span>
        </button>
        <button
          onClick={() => setShowHistory(true)}
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 transition-colors shrink-0"
        >
          <span>⚠</span>
          <span>غير مدفوع: {unpaidOrders.length}</span>
        </button>
        <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
          <span>💰</span>
          <span>الدرج: {walletBalance.toFixed(2)} ج.م</span>
        </div>
      </div>

      <main className="flex-1 flex overflow-hidden">
        {/* History Sidebar */}
        {showHistory && (
          <aside className="w-72 xl:w-80 bg-gray-50 border-l border-gray-200 overflow-y-auto shrink-0 flex flex-col">
            <div className="p-3 border-b border-gray-200 shrink-0">
              <h3 className="text-sm font-bold text-gray-700 flex items-center gap-2">
                <BadgeCheck className="h-4 w-4 text-emerald-600" />
                <span>سجل الطلبات</span>
              </h3>
              <p className="text-[10px] text-gray-500 mt-1">
                {completedOrders.length} مكتمل · {unpaidOrders.length} غير مدفوع
              </p>
            </div>
            {(completedOrders.length > 0 || unpaidOrders.length > 0) ? (
              <div className="flex-1 overflow-y-auto">
                {unpaidOrders.length > 0 && (
                  <div className="p-3">
                    <h4 className="text-[10px] font-bold text-amber-600 mb-2 px-1">! غير المدفوعة</h4>
                    <div className="space-y-2">
                      {unpaidOrders.map((o) => {
                        const st = STATUS_CONFIG[o.status] || STATUS_CONFIG.NEW;
                        return (
                          <div key={o.id} className="rounded-lg bg-white border border-amber-200 p-2.5 shadow-sm">
                            <div className="flex justify-between items-start">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-mono text-violet-600 font-bold">{o.code}</span>
                                <span className="text-xs" title={st.label}>{st.badge}</span>
                              </div>
                              <span className="text-xs font-black text-red-600 font-mono">
                                {Number(o.remainingBalance).toFixed(2)}
                              </span>
                            </div>
                            <p className="text-xs font-bold text-gray-800 mt-0.5">{o.customerName}</p>
                            <div className="flex items-center gap-1.5 mt-1 text-[10px] text-gray-500">
                              <span>{o.orderType === 'DINE_IN' ? 'داخلي' : o.orderType === 'TAKEAWAY' ? 'سفري' : 'توصيل'}</span>
                              {o.tableNumber && <span>· طاولة {o.tableNumber}</span>}
                              <span>· {formatDate(o.createdAt)}</span>
                              <span className="font-mono text-violet-500">🕒 {formatWaitTime(o.createdAt)}</span>
                              {isDelayed(o.createdAt) && (
                                <span className="text-red-600 font-bold">⚠ متأخر</span>
                              )}
                            </div>
                            <div className="flex gap-1.5 mt-2">
                              {st.next && (
                                <button
                                  onClick={() => handleUpdateOrderStatus(o.id, st.next!)}
                                  className="flex-1 rounded-lg bg-violet-100 border border-violet-200 text-violet-700 text-[10px] font-bold py-1.5 hover:bg-violet-200 transition-all active:scale-95"
                                >
                                  {st.nextLabel}
                                </button>
                              )}
                              <button
                                onClick={() => setManageOrder(o)}
                                className="rounded-lg bg-gray-100 border border-gray-200 text-gray-600 text-[10px] font-bold py-1.5 px-2 hover:bg-gray-200 transition-all active:scale-95"
                              >
                                ⚙ إدارة
                              </button>
                              <button
                                onClick={() => handleMarkAsPaid(o.id)}
                                className="flex-1 rounded-lg bg-emerald-100 border border-emerald-200 text-emerald-700 text-[10px] font-bold py-1.5 hover:bg-emerald-200 transition-all active:scale-95"
                              >
                                ✔ تحصيل الدفعة
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {completedOrders.length > 0 && (
                  <div className="p-3 border-t border-gray-200">
                    <h4 className="text-[10px] font-bold text-emerald-600 mb-2 px-1">✓ المدفوعة</h4>
                    <div className="space-y-1.5">
                      {completedOrders.slice(0, 20).map((o) => {
                        const st = STATUS_CONFIG[o.status] || STATUS_CONFIG.NEW;
                        return (
                          <div key={o.id} className="rounded-lg bg-white border border-gray-200 p-2.5 shadow-sm">
                            <div className="flex justify-between items-start">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-mono text-violet-600 font-bold">{o.code}</span>
                                <span className="text-xs" title={st.label}>{st.badge}</span>
                              </div>
                              <span className="text-xs font-black text-emerald-600 font-mono">
                                {Number(o.total).toFixed(2)}
                              </span>
                            </div>
                            <p className="text-xs font-bold text-gray-800 mt-0.5">{o.customerName}</p>
                            <div className="flex items-center gap-1.5 mt-1 text-[10px] text-gray-500">
                              <span>{o.orderType === 'DINE_IN' ? 'داخلي' : o.orderType === 'TAKEAWAY' ? 'سفري' : 'توصيل'}</span>
                              {o.tableNumber && <span>· طاولة {o.tableNumber}</span>}
                              <span>· {formatDate(o.createdAt)}</span>
                              <span className="font-mono text-gray-400">🕒 {formatWaitTime(o.createdAt)}</span>
                            </div>
                            <button
                              onClick={() => setManageOrder(o)}
                              className="mt-2 w-full rounded-lg bg-gray-100 border border-gray-200 text-gray-600 text-[10px] font-bold py-1.5 hover:bg-gray-200 transition-all active:scale-95"
                            >
                              ⚙ إدارة الطلب
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-6 text-center text-gray-400 text-xs">لا توجد طلبات بعد</div>
            )}
          </aside>
        )}

        {/* Main Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {successOrder ? (
            /* Success Screen */
            <div className="flex-1 flex items-center justify-center p-6">
              <div className="max-w-md mx-auto text-center px-6 py-10 bg-white border border-gray-200 rounded-3xl shadow-lg">
                <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full border mb-6 ${
                  successOrder.isPaid
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-600'
                    : 'bg-amber-50 border-amber-200 text-amber-600'
                }`}>
                  <CheckCircle2 className="h-10 w-10" />
                </div>
                <h2 className="text-xl font-bold text-gray-900">تم تسجيل الطلب بنجاح!</h2>
                <p className="text-xs text-gray-500 mt-2">
                  رقم الفاتورة: <span className="font-mono font-bold text-violet-600">{successOrder.code}</span>
                </p>
                <div className="my-6 rounded-2xl bg-gray-50 p-4 text-right space-y-2 text-xs text-gray-600 border border-gray-200">
                  <div className="flex justify-between">
                    <span>العميل:</span>
                    <span className="text-gray-900 font-bold">{successOrder.customerName || 'زبون محلي'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>النوع:</span>
                    <span className="text-gray-900 font-bold">
                      {successOrder.orderType === 'DINE_IN' ? 'داخلي' : successOrder.orderType === 'TAKEAWAY' ? 'سفري' : 'توصيل'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>الحالة:</span>
                    <span className="text-gray-900 font-bold">{(STATUS_CONFIG[successOrder.status]?.badge || '') + ' ' + (STATUS_CONFIG[successOrder.status]?.label || successOrder.status)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>المبلغ:</span>
                    <span className="text-gray-900 font-bold font-mono">{Number(successOrder.total).toFixed(2)} EGP</span>
                  </div>
                  <div className="flex justify-between">
                    <span>حالة الدفع:</span>
                    <span className={`font-bold ${successOrder.isPaid ? 'text-emerald-600' : 'text-red-600'}`}>
                      {successOrder.isPaid ? 'مدفوع' : 'غير مدفوع'}
                    </span>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={startNewOrder}
                    className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-violet-600 hover:bg-violet-700 px-5 py-4 text-sm font-bold text-white transition-all active:scale-[0.97] cursor-pointer shadow-sm"
                  >
                    <span>بدء طلب جديد</span>
                  </button>
                  <button
                    onClick={() => setSuccessOrder(null)}
                    className="flex-1 rounded-xl bg-gray-100 hover:bg-gray-200 px-5 py-4 text-sm font-bold text-gray-700 transition-all active:scale-[0.97] cursor-pointer"
                  >
                    <span>العودة</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Main POS Interface */
            <div className="flex-1 flex overflow-hidden">
              {/* Left: Categories + Products */}
              <div className="flex-1 flex flex-col overflow-hidden relative">
                {/* Search Bar */}
                <div className="px-5 pt-4 pb-2 shrink-0 z-10">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="ابحث عن أي منتج هنا..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3.5 text-sm font-medium text-gray-900 placeholder-gray-400 focus:border-violet-400 focus:outline-none transition-all shadow-sm"
                    />
                  </div>
                </div>

                {/* Category Tabs */}
                <div className="px-5 py-2 overflow-x-auto flex gap-2.5 scrollbar-none shrink-0 z-10 pb-4" dir="rtl">
                  {TAB_CONFIG.map((tab) => (
                    <button
                      key={tab.key}
                      onClick={() => setSelectedTab(tab.key)}
                      className={`rounded-xl px-6 py-4 flex items-center gap-2.5 text-sm font-bold transition-all duration-200 shrink-0 cursor-pointer active:scale-95 border touch-manipulation ${
                        selectedTab === tab.key
                          ? tab.key === 'refrigerator'
                            ? 'bg-rose-600 text-white border-rose-500 shadow-sm'
                            : tab.key === 'playstation'
                            ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm'
                            : 'bg-violet-600 text-white border-violet-500 shadow-sm'
                          : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                      }`}
                    >
                      <span className="text-xl">{tab.emoji}</span>
                      <span>{tab.label}</span>
                    </button>
                  ))}
                </div>

                {/* Product Grid / Tab Content */}
                <div className="flex-1 overflow-y-auto px-5 py-2 scroll-smooth">
                  {selectedTab === 'playstation' ? (
                    renderPlaystationContent()
                  ) : selectedTab === 'refrigerator' ? (
                    renderRefrigeratorContent()
                  ) : (
                    <div className="grid gap-4 grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 pb-8">
                      {filteredProducts.map(prod => renderProductCard(prod))}
                      {filteredProducts.length === 0 && (
                        <div className="col-span-full py-20 text-center text-gray-400 flex flex-col items-center">
                          <div className="h-20 w-20 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                            <ShoppingBag className="h-10 w-10 text-gray-300" />
                          </div>
                          <h3 className="text-lg font-bold text-gray-500">{searchQuery ? 'لا توجد نتائج للبحث' : 'لا توجد منتجات نشطة'}</h3>
                          <p className="text-xs mt-2 text-gray-400">جرب البحث بكلمة مختلفة أو اختر تصنيفاً آخر</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Right: Cart Panel */}
              <div className="w-[380px] xl:w-[440px] bg-white border-r border-gray-200 flex flex-col overflow-hidden shrink-0 shadow-sm relative z-20">
                {/* Order Header */}
                <div className="p-5 border-b border-gray-200 bg-gray-50 shrink-0">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-base font-bold text-gray-800 flex items-center gap-2.5">
                      <div className="h-8 w-8 rounded-lg bg-violet-100 flex items-center justify-center">
                        <ShoppingBag className="h-4 w-4 text-violet-600" />
                      </div>
                      <span>الطلب الحالي</span>
                      {cart.length > 0 && (
                        <span className="rounded-full bg-violet-100 text-violet-700 border border-violet-200 text-xs px-2 py-0.5 font-bold">
                          {cart.reduce((sum, item) => sum + item.quantity, 0)}
                        </span>
                      )}
                    </h3>
                    {cart.length > 0 && (
                      <button
                        onClick={() => setCart([])}
                        className="text-[10px] text-red-600 hover:text-red-700 font-bold"
                      >
                        تفريغ السلة
                      </button>
                    )}
                  </div>

                  {/* Order Type & Source Type quick select */}
                  <div className="grid grid-cols-3 gap-1.5 mb-2">
                    {[
                      { value: 'DINE_IN', label: 'داخلي', icon: UtensilsCrossed },
                      { value: 'TAKEAWAY', label: 'سفري', icon: Package },
                      { value: 'DELIVERY', label: 'توصيل', icon: Truck },
                    ].map((t) => {
                      const Icon = t.icon;
                      return (
                        <button
                          key={t.value}
                          type="button"
                          onClick={() => setOrderType(t.value)}
                          className={`py-3 px-1 rounded-xl border text-xs font-bold flex flex-col items-center gap-0.5 transition-all active:scale-95 touch-manipulation ${
                            orderType === t.value
                              ? 'bg-violet-50 text-violet-700 border-violet-300'
                              : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200'
                          }`}
                        >
                          <Icon className="h-4 w-4" />
                          <span>{t.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Customer Name + Table */}
                  <div className="flex gap-2.5">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        placeholder="اسم العميل (اختياري)"
                        value={customerName}
                        onChange={(e) => handleCustomerSearch(e.target.value)}
                        onFocus={() => customerSuggestions.length > 0 && setShowCustomerDropdown(true)}
                        onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 200)}
                        className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm font-medium text-gray-800 placeholder-gray-400 focus:border-violet-400 focus:outline-none transition-all"
                      />
                      {showCustomerDropdown && (
                        <div className="absolute z-20 mt-2 w-full rounded-xl bg-white border border-gray-200 shadow-lg overflow-hidden">
                          {customerSuggestions.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              onMouseDown={() => selectCustomer(c)}
                              className="w-full px-4 py-3 text-right text-sm font-medium text-gray-700 hover:bg-violet-50 flex justify-between items-center transition-colors"
                            >
                              <span>{c.name || '—'}</span>
                              <span className="text-[10px] font-mono text-gray-400">{c.phone}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {orderType === 'DINE_IN' && (
                      <div className="w-24">
                        <input
                          type="text"
                          placeholder="رقم الطاولة"
                          value={tableNumber}
                          onChange={(e) => setTableNumber(e.target.value)}
                          className="w-full bg-white border border-gray-200 rounded-xl px-3 py-3 text-xs font-bold text-gray-800 placeholder-gray-400 focus:border-violet-400 focus:outline-none transition-all text-center"
                        />
                      </div>
                    )}
                  </div>

                  {/* Employee Select */}
                  <select
                    value={employeeId}
                    onChange={(e) => setEmployeeId(e.target.value)}
                    className="w-full mt-2.5 bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm font-medium text-gray-800 focus:border-violet-400 focus:outline-none transition-all appearance-none"
                    style={{ backgroundImage: 'url("data:image/svg+xml,%3csvg xmlns=%27http://www.w3.org/2000/svg%27 fill=%27none%27 viewBox=%270 0 20 20%27%3e%3cpath stroke=%27%239ca3af%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27 stroke-width=%271.5%27 d=%27M6 8l4 4 4-4%27/%3e%3c/svg%3e")', backgroundPosition: 'left 0.5rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.5em 1.5em' }}
                  >
                    <option value="">الموظف المسؤول (اختياري)</option>
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>{emp.name}</option>
                    ))}
                  </select>
                </div>

                {/* Cart Items */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {cart.map((item) => (
                    <div key={item.product.id} className="rounded-xl bg-gray-50 border border-gray-100 p-4 space-y-3">
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-3">
                          <div className="h-11 w-11 rounded-xl bg-white border border-gray-200 flex items-center justify-center text-xl shadow-sm">
                            {item.product.emoji || '☕'}
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-gray-800">{item.product.name}</h4>
                            <span className="text-xs font-bold text-violet-600">{Number(item.product.price).toFixed(2)} <span className="text-[9px] text-violet-400">EGP</span></span>
                          </div>
                        </div>
                        <button
                          onClick={() => handleRemoveFromCart(item.product.id)}
                          className="text-gray-400 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="flex justify-between items-center border-t border-gray-200 pt-3">
                        <div className="flex items-center bg-white border border-gray-200 rounded-lg p-1">
                          <button
                            type="button"
                            onClick={() => handleUpdateQty(item.product.id, false)}
                            className="h-9 w-9 rounded-md flex items-center justify-center text-gray-500 hover:text-gray-800 hover:bg-gray-100 active:scale-90 touch-manipulation transition-all"
                          >
                            <Minus className="h-4 w-4" />
                          </button>
                          <span className="w-10 text-center text-sm font-bold text-gray-800 font-mono">{item.quantity}</span>
                          <button
                            type="button"
                            onClick={() => handleUpdateQty(item.product.id, true)}
                            className="h-9 w-9 rounded-md flex items-center justify-center text-gray-500 hover:text-gray-800 hover:bg-gray-100 active:scale-90 touch-manipulation transition-all"
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                        </div>
                        <span className="text-base font-bold text-gray-800 font-mono">
                          {(Number(item.product.price) * item.quantity).toFixed(2)}
                        </span>
                      </div>
                      <input
                        type="text"
                        placeholder="ملاحظات إضافية (مثال: سكر زيادة...)"
                        value={item.notes}
                        onChange={(e) => handleUpdateItemNotes(item.product.id, e.target.value)}
                        className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs font-medium text-gray-700 placeholder-gray-400 focus:border-violet-400 focus:outline-none transition-all"
                      />
                    </div>
                  ))}
                  {cart.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-center text-gray-400 py-20">
                      <div className="h-24 w-24 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                        <ShoppingBag className="h-10 w-10 text-gray-300" />
                      </div>
                      <p className="text-sm font-bold text-gray-500">سلة الطلبات فارغة</p>
                      <p className="text-xs text-gray-400 mt-1">ابدأ باختيار المنتجات من القائمة</p>
                    </div>
                  )}
                </div>

                {/* Checkout Summary */}
                {cart.length > 0 && (
                  <div className="border-t border-gray-200 bg-white shrink-0 shadow-[0_-4px_12px_rgba(0,0,0,0.04)] z-30 relative">
                    {/* Payment Toggle */}
                    <div className="px-5 pt-4 grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setIsPaid(true)}
                        className={`py-3.5 px-4 rounded-xl border text-sm font-bold flex items-center justify-center gap-2.5 transition-all duration-200 active:scale-95 touch-manipulation ${
                          isPaid
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                            : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200'
                        }`}
                      >
                        <BadgeCheck className="h-5 w-5" />
                        <span>مدفوع</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => { setIsPaid(false); setPaymentMethod('CASH'); }}
                        className={`py-3.5 px-4 rounded-xl border text-sm font-bold flex items-center justify-center gap-2.5 transition-all duration-200 active:scale-95 touch-manipulation ${
                          !isPaid
                            ? 'bg-rose-50 text-rose-700 border-rose-300'
                            : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200'
                        }`}
                      >
                        <X className="h-5 w-5" />
                        <span>غير مدفوع</span>
                      </button>
                    </div>

                    {/* Payment Methods */}
                    <div className={`overflow-hidden transition-all duration-300 ${isPaid ? 'max-h-24 opacity-100 mt-3' : 'max-h-0 opacity-0 mt-0'}`}>
                      <div className="px-5 grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          onClick={() => setPaymentMethod('CASH')}
                          className={`py-3 px-1 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition-all active:scale-95 touch-manipulation ${
                            paymentMethod === 'CASH'
                              ? 'bg-violet-50 text-violet-700 border-violet-300'
                              : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200'
                          }`}
                        >
                          <DollarSign className="h-4 w-4" />
                          <span>نقدي</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setPaymentMethod('CARD')}
                          className={`py-3 px-1 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition-all active:scale-95 touch-manipulation ${
                            paymentMethod === 'CARD'
                              ? 'bg-violet-50 text-violet-700 border-violet-300'
                              : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200'
                          }`}
                        >
                          <CreditCard className="h-4 w-4" />
                          <span>فيزا</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setPaymentMethod('WALLET')}
                          className={`py-3 px-1 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition-all active:scale-95 touch-manipulation ${
                            paymentMethod === 'WALLET'
                              ? 'bg-violet-50 text-violet-700 border-violet-300'
                              : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200'
                          }`}
                        >
                          <Wallet className="h-4 w-4" />
                          <span>محفظة</span>
                        </button>
                      </div>
                    </div>

                    {/* Totals */}
                    <div className="px-5 pt-4 pb-3">
                      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-2">
                        <div className="flex justify-between text-xs font-medium text-gray-500">
                          <span>عدد الأصناف:</span>
                          <span className="font-bold text-gray-700">{cart.reduce((sum, item) => sum + item.quantity, 0)}</span>
                        </div>
                        <div className="flex justify-between items-center border-t border-gray-200 pt-3 mt-1">
                          <span className="text-base font-bold text-gray-800">الإجمالي:</span>
                          <span className="text-2xl font-bold text-violet-600 font-mono">
                            {cartTotal.toFixed(2)} <span className="text-sm text-violet-400">EGP</span>
                          </span>
                        </div>
                        {!isPaid && (
                          <div className="flex justify-between text-xs mt-1">
                            <span className="text-rose-600 font-bold">المبلغ المتبقي للتحصيل لاحقاً:</span>
                            <span className="text-rose-600 font-bold font-mono">{cartTotal.toFixed(2)} ج.م</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Submit */}
                    <div className="px-5 pb-5">
                      <form onSubmit={handleCheckout}>
                        <button
                          type="submit"
                          disabled={submitLoading}
                          className={`w-full flex items-center justify-center gap-2 rounded-xl px-5 py-4 text-base font-bold transition-all duration-200 active:scale-[0.97] cursor-pointer touch-manipulation shadow-sm ${
                            isPaid
                              ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                              : 'bg-violet-600 hover:bg-violet-700 text-white'
                          }`}
                        >
                          {submitLoading ? (
                            <><Loader2 className="h-5 w-5 animate-spin" /><span>جاري التنفيذ...</span></>
                          ) : (
                            <><CheckCircle2 className="h-5 w-5" /><span>{isPaid ? 'تأكيد الدفع وإصدار الفاتورة' : 'إصدار فاتورة آجلة'}</span></>
                          )}
                        </button>
                      </form>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Shift Closing Modal */}
      {showClosingModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-2xl bg-white border border-gray-200 p-6 shadow-lg">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-50 text-amber-600">
              <DollarSign className="h-8 w-8" />
            </div>
            <h2 className="text-center text-xl font-bold text-gray-800 mb-2">إغلاق الشيفت وتسليم النقدية</h2>
            {closingSummary && (
              <div className="my-6 rounded-xl bg-gray-50 p-4 border border-gray-200 space-y-3">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-500">اسم الموظف:</span>
                  <span className="text-gray-800 font-bold">{closingSummary.staffName}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-500">إجمالي النقدية في الدرج:</span>
                  <span className="text-2xl font-bold text-emerald-600 font-mono">{Number(closingSummary.expectedAmount).toFixed(2)} ج.م</span>
                </div>
              </div>
            )}
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 mb-6">
              <p className="text-xs text-amber-700 text-center leading-relaxed">
                يرجى مطابقة النقدية الموجودة في الدرج مع المبلغ المذكور أعلاه، وتسليمها للمدير.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowClosingModal(false)}
                disabled={clockInLoading}
                className="flex-1 rounded-xl bg-gray-100 hover:bg-gray-200 px-5 py-3 text-sm font-bold text-gray-700 transition-all active:scale-95"
              >
                إلغاء
              </button>
              <button
                onClick={handleConfirmHandover}
                disabled={clockInLoading}
                className="flex-[2] rounded-xl bg-emerald-600 hover:bg-emerald-700 px-5 py-3 text-sm font-bold text-white transition-all flex items-center justify-center gap-2 active:scale-95 shadow-sm"
              >
                {clockInLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle2 className="h-4 w-4" /> تم تسليم الفلوس</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Order Management Modal */}
      {manageOrder && (
        <OrderManagementModal
          order={manageOrder}
          onClose={() => setManageOrder(null)}
          onOrderUpdated={(updated) => {
            setAllOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
            setManageOrder(null);
          }}
        />
      )}

      {/* Expense Modal */}
      <ExpenseModal
        isOpen={showExpenseModal}
        onClose={() => setShowExpenseModal(false)}
      />

      {/* Error Banner */}
      {error && (
        <div className="fixed bottom-4 right-4 max-w-sm p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold flex justify-between items-center gap-4 z-50 shadow-sm">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
