'use client';

import { create } from 'zustand';
import {
  Order,
  OrderStatus,
  Staff,
  Driver,
  TopProduct,
  OwnerDashboardData,
  StaffPerformance,
  DriverPerformance,
  Debt,
  AppEvent,
  DailyFinancial,
  TopFinancialStaff,
  TopFinancialDriver,
  FinancialSnapshot,
  BusinessHealthScore,
  DailyBusinessSummary,
  BusinessAlert,
  AnalyticsOverview,
  StaffPerformanceScore,
  StaffPerformanceOverview,
  PerformanceRanking,
  StaffInsight,
  Decision,
  InCafeOrder,
  StaffPurchase,
  Suggestion,
  WeeklySuggestionStats,
  BaristaDailyClosing,
  DriverDailyClosing,
  ReconciliationSummary,
  DebtRecord,
  PaymentLog,
  LowStockAlert,
  SystemNotification,
  ConnectionStatus,
  CustomerDebtSummary,
  UnifiedDebtOverview,
} from '@/types';

interface AudioAlert {
  target: string;
  sound: string;
  orderId: string;
}

interface AppState {
  orders: Record<string, Order>;
  orderIds: string[];
  staff: Staff[];
  drivers: Driver[];
  todayRevenue: number;
  todayProfit: number;
  todayOrders: number;
  pendingOrdersCount: number;
  topProducts: TopProduct[];
  staffPerformance: StaffPerformance[];
  driverPerformance: DriverPerformance[];
  customerDebts: Debt[];
  totalCustomerDebt: number;
  topFinancialStaff: TopFinancialStaff | null;
  topFinancialDriver: TopFinancialDriver | null;
  lastAudioAlert: AudioAlert | null;

  healthScore: BusinessHealthScore | null;
  dailySummary: DailyBusinessSummary | null;
  alerts: BusinessAlert[];
  staffPerformances: StaffPerformanceScore[];
  topPerformers: StaffPerformanceScore[];
  underperformers: StaffPerformanceOverview['underperformers'];
  dailyRanking: PerformanceRanking[];
  staffInsights: StaffInsight[];

  setOrders: (orders: Order[]) => void;
  addFullOrder: (order: Order) => void;
  setOwnerDashboard: (data: OwnerDashboardData) => void;
  setFinancialSnapshot: (data: FinancialSnapshot) => void;
  setAnalyticsOverview: (data: AnalyticsOverview) => void;
  setStaffList: (staff: Staff[]) => void;
  setDriverList: (drivers: Driver[]) => void;
  setStaffPerformanceData: (data: StaffPerformanceOverview) => void;
  setDailyRanking: (ranking: PerformanceRanking[]) => void;

  handleStaffPerformanceUpdated: (event: AppEvent) => void;
  handleStaffAlertGenerated: (event: AppEvent) => void;

  handleOrderCreated: (event: AppEvent) => void;
  handleOrderUpdated: (event: AppEvent) => void;
  handleOrderStatusChanged: (event: AppEvent) => void;
  handleOrderReady: (event: AppEvent) => void;
  handleOrderDelivered: (event: AppEvent) => void;
  handleOrderCancelled: (event: AppEvent) => void;
  handleStaffCreated: (event: AppEvent) => void;
  handleStaffUpdated: (event: AppEvent) => void;
  handleStaffDeleted: (event: AppEvent) => void;
  handleFinanceRevenueUpdated: (event: AppEvent) => void;
  handleFinanceDailySnapshot: (event: AppEvent) => void;
  handleFinanceUpdated: (event: AppEvent) => void;
  handleAudioAlert: (event: AppEvent) => void;
  productUpdateVersion: number;
  handleProductUpdated: (event: AppEvent) => void;

  categoryUpdateVersion: number;
  handleCategoryUpdated: (event: AppEvent) => void;

  connectionStatus: ConnectionStatus;
  lowStockAlerts: LowStockAlert[];
  notifications: SystemNotification[];
  unreadCount: number;
  setConnectionStatus: (status: ConnectionStatus) => void;
  handleInventoryUpdated: (event: AppEvent) => void;
  handleLowStockAlert: (event: AppEvent) => void;
  handleSystemNotification: (event: AppEvent) => void;

  // Notification CRUD
  setNotifications: (notifications: SystemNotification[], total?: number) => void;
  addNotification: (notification: SystemNotification) => void;
  patchNotificationRead: (id: string) => void;
  patchAllNotificationsRead: () => void;
  removeNotification: (id: string) => void;
  setUnreadCount: (count: number) => void;
  handleNotificationCreated: (event: AppEvent) => void;
  handleNotificationRead: (event: AppEvent) => void;
  handleNotificationReadAll: (event: AppEvent) => void;
  handleNotificationDeleted: (event: AppEvent) => void;

  decisions: Decision[];
  setDecisions: (decisions: Decision[]) => void;

  inCafeOrders: InCafeOrder[];
  staffPurchases: StaffPurchase[];
  unpaidOrders: InCafeOrder[];
  setInCafeOrders: (orders: InCafeOrder[]) => void;
  setStaffPurchases: (purchases: StaffPurchase[]) => void;
  handleInCafeOrderCreated: (event: AppEvent) => void;
  handleInCafePaymentUpdated: (event: AppEvent) => void;
  handleInCafeOrderUpdated: (event: AppEvent) => void;
  handleStaffPurchaseCreated: (event: AppEvent) => void;

  suggestions: Suggestion[];
  suggestionStats: WeeklySuggestionStats | null;
  setSuggestions: (suggestions: Suggestion[]) => void;
  setSuggestionStats: (stats: WeeklySuggestionStats | null) => void;
  handleSuggestionReady: (event: AppEvent) => void;

  baristaClosings: BaristaDailyClosing[];
  driverClosings: DriverDailyClosing[];
  reconciliation: ReconciliationSummary | null;
  debtRecords: DebtRecord[];
  paymentLogs: PaymentLog[];
  setBaristaClosings: (closings: BaristaDailyClosing[]) => void;
  setDriverClosings: (closings: DriverDailyClosing[]) => void;
  setReconciliation: (r: ReconciliationSummary | null) => void;
  setDebtRecords: (records: DebtRecord[]) => void;
  setPaymentLogs: (logs: PaymentLog[]) => void;
  handlePaymentCollected: (event: AppEvent) => void;
  handlePaymentPending: (event: AppEvent) => void;
  handlePaymentUpdated: (event: AppEvent) => void;
  customerDebtSummary: CustomerDebtSummary | null;
  unifiedDebtOverview: UnifiedDebtOverview | null;
  setCustomerDebtSummary: (summary: CustomerDebtSummary | null) => void;
  setUnifiedDebtOverview: (overview: UnifiedDebtOverview | null) => void;
}

export const useAppStore = create<AppState>((set, _get) => ({
  orders: {},
  orderIds: [],
  staff: [],
  drivers: [],
  todayRevenue: 0,
  todayProfit: 0,
  todayOrders: 0,
  pendingOrdersCount: 0,
  topProducts: [],
  staffPerformance: [],
  driverPerformance: [],
  customerDebts: [],
  totalCustomerDebt: 0,
  topFinancialStaff: null,
  topFinancialDriver: null,
  lastAudioAlert: null,
  connectionStatus: 'CONNECTING' as ConnectionStatus,
  lowStockAlerts: [] as LowStockAlert[],
  notifications: [] as SystemNotification[],
  unreadCount: 0,

  healthScore: null,
  dailySummary: null,
  alerts: [],
  staffPerformances: [],
  topPerformers: [],
  underperformers: [],
  dailyRanking: [],
  staffInsights: [],
  decisions: [],
  inCafeOrders: [],
  staffPurchases: [],
  unpaidOrders: [],
  suggestions: [],
  suggestionStats: null,

  baristaClosings: [],
  driverClosings: [],
  reconciliation: null,
  debtRecords: [],
  paymentLogs: [],
  customerDebtSummary: null,
  unifiedDebtOverview: null,

  setDecisions: (decisions) => set({ decisions }),

  setSuggestions: (suggestions) => set({ suggestions }),
  setSuggestionStats: (stats) => set({ suggestionStats: stats }),

  handleSuggestionReady: (event) => {
    const payload = event.payload as { count: number; suggestions: Suggestion[] };
    set((state) => {
      const existing = new Map(state.suggestions.map((s) => [s.id, s]));
      for (const s of payload.suggestions) {
        existing.set(s.id, s);
      }
      return { suggestions: [...existing.values()].sort((a, b) => b.confidence - a.confidence) };
    });
  },

  setBaristaClosings: (closings) => set({ baristaClosings: closings }),
  setDriverClosings: (closings) => set({ driverClosings: closings }),
  setReconciliation: (r) => set({ reconciliation: r }),
  setDebtRecords: (records) => set({ debtRecords: records }),
  setPaymentLogs: (logs) => set({ paymentLogs: logs }),
  setCustomerDebtSummary: (summary) => set({ customerDebtSummary: summary }),
  setUnifiedDebtOverview: (overview) => set({ unifiedDebtOverview: overview }),

  handlePaymentCollected: (event) => {
    const payload = event.payload as { orderId: string; orderCode: string; amount: number; collectedById: string; collectedRole: string };
    set((state) => {
      const order = state.orders[payload.orderId];
      if (!order) return state;
      return {
        orders: {
          ...state.orders,
          [payload.orderId]: {
            ...order,
            paid: true,
            paymentStatus: 'PAID',
            amountPaid: payload.amount,
            remainingAmount: 0,
            collectedById: payload.collectedById,
            collectedRole: payload.collectedRole,
          },
        },
      };
    });
  },

  handlePaymentPending: (event) => {
    const payload = event.payload as { orderId: string; orderCode: string; remainingAmount: number; collectedRole: string };
    set((state) => {
      const order = state.orders[payload.orderId];
      if (!order) return state;
      return {
        orders: {
          ...state.orders,
          [payload.orderId]: {
            ...order,
            paid: false,
            paymentStatus: payload.remainingAmount > 0 ? 'PARTIAL_PAYMENT' : 'UNPAID',
            remainingAmount: payload.remainingAmount,
          },
        },
      };
    });
  },

  handlePaymentUpdated: (event) => {
    const payload = event.payload as { orderId: string; paymentStatus: string; amountPaid: number; remainingAmount: number; collectedById?: string; collectedRole?: string };
    set((state) => {
      const order = state.orders[payload.orderId];
      if (!order) return state;
      return {
        orders: {
          ...state.orders,
          [payload.orderId]: {
            ...order,
            paid: payload.paymentStatus === 'PAID',
            paymentStatus: payload.paymentStatus,
            amountPaid: payload.amountPaid,
            remainingAmount: payload.remainingAmount,
            collectedById: payload.collectedById ?? order.collectedById,
            collectedRole: payload.collectedRole ?? order.collectedRole,
          },
        },
      };
    });
  },

  setInCafeOrders: (orders) => set({
    inCafeOrders: orders,
    unpaidOrders: orders.filter((o) => o.paymentStatus !== 'PAID' && o.status !== 'VOID'),
  }),
  setStaffPurchases: (purchases) => set({ staffPurchases: purchases }),

  handleInCafeOrderCreated: (event) => {
    const payload = event.payload as { order: InCafeOrder };
    set((state) => {
      const order = payload.order;
      const updated = [order, ...state.inCafeOrders];
      return {
        inCafeOrders: updated,
        unpaidOrders: order.paymentStatus !== 'PAID'
          ? [order, ...state.unpaidOrders]
          : state.unpaidOrders,
      };
    });
  },

  handleInCafePaymentUpdated: (event) => {
    const payload = event.payload as { order: InCafeOrder };
    set((state) => {
      const updated = state.inCafeOrders.map((o) =>
        o.id === payload.order.id ? payload.order : o,
      );
      return {
        inCafeOrders: updated,
        unpaidOrders: updated.filter((o) => o.paymentStatus !== 'PAID' && o.status !== 'VOID'),
      };
    });
  },

  handleInCafeOrderUpdated: (event) => {
    const payload = event.payload as { order: InCafeOrder };
    set((state) => {
      const updated = state.inCafeOrders.map((o) =>
        o.id === payload.order.id ? payload.order : o,
      );
      return {
        inCafeOrders: updated,
        unpaidOrders: updated.filter((o) => o.paymentStatus !== 'PAID' && o.status !== 'VOID'),
      };
    });
  },

  handleStaffPurchaseCreated: (event) => {
    const payload = event.payload as { purchase: StaffPurchase };
    set((state) => ({
      staffPurchases: [payload.purchase, ...state.staffPurchases],
    }));
  },

  setOrders: (orders) => {
    const map: Record<string, Order> = {};
    const ids: string[] = [];
    for (const o of orders) {
      map[o.id] = o;
      ids.push(o.id);
    }
    set({ orders: map, orderIds: ids });
  },

  addFullOrder: (order) => {
    set((state) => ({
      orders: { ...state.orders, [order.id]: order },
      orderIds: state.orderIds.includes(order.id)
        ? state.orderIds
        : [order.id, ...state.orderIds],
    }));
  },

  setOwnerDashboard: (data) => {
    set({
      todayRevenue: data.snapshot.todayRevenue,
      todayOrders: data.snapshot.todayOrders,
      pendingOrdersCount: data.snapshot.pendingOrders,
      topProducts: data.dailyReport.topProducts || [],
    });
  },

  setFinancialSnapshot: (data) => {
    set({
      todayRevenue: data.daily.totalRevenue,
      todayProfit: data.daily.totalProfit,
      todayOrders: data.daily.totalOrders,
      topProducts: data.topProducts || [],
      totalCustomerDebt: data.totalCustomerDebt,
      topFinancialStaff: data.topStaff,
      topFinancialDriver: data.topDriver,
    });
  },

  setAnalyticsOverview: (data) => {
    set({
      healthScore: data.health,
      dailySummary: data.daily,
      alerts: data.alerts,
    });
  },

  setStaffList: (staff) => set({ staff }),
  setDriverList: (drivers) => set({ drivers }),

  setStaffPerformanceData: (data) => {
    set({
      staffPerformances: data.topPerformers.concat(
        data.underperformers.map((u) => ({
          staffId: u.staffId,
          staffName: u.staffName,
          role: u.role,
          overallScore: u.overallScore,
          ordersHandled: u.ordersHandled,
          totalRevenue: 0,
          avgOrderProcessingTime: u.avgOrderProcessingTime,
          cancellationCount: u.cancellationCount,
          completionRate: u.completionRate,
          efficiencyScore: 0,
          revenueScore: 0,
          speedScore: 0,
          reliabilityScore: 0,
        })) as StaffPerformanceScore[],
      ),
      topPerformers: data.topPerformers,
      underperformers: data.underperformers,
    });
  },

  setDailyRanking: (ranking) => set({ dailyRanking: ranking }),

  handleStaffPerformanceUpdated: (event) => {
    const payload = event.payload as {
      staffId: string;
      staffName: string;
      overallScore: number;
      revenueScore: number;
      efficiencyScore: number;
      speedScore: number;
      reliabilityScore: number;
      ordersHandled: number;
      totalRevenue: number;
    };
    set((state) => {
      const existing = state.staffPerformances.findIndex(
        (s) => s.staffId === payload.staffId,
      );
      const entry: StaffPerformanceScore = {
        staffId: payload.staffId,
        staffName: payload.staffName,
        role: '',
        overallScore: payload.overallScore,
        revenueScore: payload.revenueScore,
        efficiencyScore: payload.efficiencyScore,
        speedScore: payload.speedScore,
        reliabilityScore: payload.reliabilityScore,
        ordersHandled: payload.ordersHandled,
        totalRevenue: payload.totalRevenue,
        avgOrderProcessingTime: 0,
        cancellationCount: 0,
        completionRate: 100,
      };

      const updated = [...state.staffPerformances];
      if (existing >= 0) {
        updated[existing] = entry;
      } else {
        updated.push(entry);
      }

      const sorted = updated.sort((a, b) => b.overallScore - a.overallScore);
      return {
        staffPerformances: sorted,
        topPerformers: sorted.slice(0, 5),
      };
    });
  },

  handleStaffAlertGenerated: (event) => {
    const payload = event.payload as {
      type: string;
      severity: string;
      message: string;
    };
    set((state) => ({
      alerts: [
        ...state.alerts,
        {
          type: payload.type,
          severity: payload.severity as 'low' | 'medium' | 'high',
          message: payload.message,
        },
      ],
    }));
  },

  handleOrderCreated: (event) => {
    const payload = event.payload as { orderId: string; code: string; total: number; status: string };
    const placeholder: Order = {
      id: payload.orderId,
      code: payload.code,
      total: payload.total,
      profit: null,
      status: 'NEW' as OrderStatus,
      type: '',
      customerId: '',
      paid: false,
      paymentStatus: 'UNPAID',
      amountPaid: 0,
      remainingAmount: payload.total,
      printSent: false,
      createdAt: new Date().toISOString(),
      customer: { id: '', phone: '', totalOrders: 0, totalSpent: 0, unpaidBalance: 0, createdAt: '' },
      items: [],
    };
    set((state) => ({
      orders: { ...state.orders, [placeholder.id]: placeholder },
      orderIds: state.orderIds.includes(placeholder.id)
        ? state.orderIds
        : [placeholder.id, ...state.orderIds],
      pendingOrdersCount: state.pendingOrdersCount + 1,
    }));
    set((state) => ({
      notifications: [{
        id: `order-${payload.orderId}`,
        type: 'NEW_ORDER',
        title: `New Order #${payload.code}`,
        message: `New order #${payload.code} — $${Number(payload.total).toFixed(2)}`,
        isRead: false,
        roleTarget: 'OWNER',
        createdAt: event.timestamp || new Date().toISOString(),
        updatedAt: event.timestamp || new Date().toISOString(),
        data: { total: payload.total, code: payload.code },
      }, ...state.notifications],
      unreadCount: state.unreadCount + 1,
    }));
  },

  handleOrderUpdated: (event) => {
    const { orderId, status } = event.payload as { orderId: string; status: OrderStatus };
    set((state) => {
      const order = state.orders[orderId];
      if (!order) return state;
      return {
        orders: { ...state.orders, [orderId]: { ...order, status } },
      };
    });
  },

  handleOrderStatusChanged: (event) => {
    const { orderId, status } = event.payload as { orderId: string; status: OrderStatus };
    set((state) => {
      const order = state.orders[orderId];
      if (!order) return state;
      return {
        orders: { ...state.orders, [orderId]: { ...order, status } },
      };
    });
  },

  handleOrderReady: (event) => {
    const { orderId } = event.payload as { orderId: string };
    set((state) => {
      const order = state.orders[orderId];
      if (!order) return state;
      return {
        orders: { ...state.orders, [orderId]: { ...order, status: 'READY' as OrderStatus } },
      };
    });
  },

  handleOrderDelivered: (event) => {
    const { orderId } = event.payload as { orderId: string };
    set((state) => {
      const order = state.orders[orderId];
      if (!order) return state;
      return {
        orders: { ...state.orders, [orderId]: { ...order, status: 'DELIVERED' as OrderStatus } },
        pendingOrdersCount: Math.max(0, state.pendingOrdersCount - 1),
      };
    });
    set((state) => ({
      notifications: [{
        id: `delivered-${orderId}`,
        type: 'ORDER_DELIVERED',
        title: 'Order Delivered',
        message: `Order #${state.orders[orderId]?.code || orderId} has been delivered`,
        isRead: false,
        roleTarget: 'OWNER',
        createdAt: event.timestamp || new Date().toISOString(),
        updatedAt: event.timestamp || new Date().toISOString(),
        data: { orderId },
      }, ...state.notifications],
      unreadCount: state.unreadCount + 1,
    }));
  },

  handleOrderCancelled: (event) => {
    const { orderId } = event.payload as { orderId: string };
    set((state) => {
      const order = state.orders[orderId];
      if (!order) return state;
      return {
        orders: { ...state.orders, [orderId]: { ...order, status: 'CANCELLED' as OrderStatus } },
        pendingOrdersCount: Math.max(0, state.pendingOrdersCount - 1),
      };
    });
    set((state) => ({
      notifications: [{
        id: `cancelled-${orderId}`,
        type: 'ORDER_CANCELLED',
        title: 'Order Cancelled',
        message: `Order #${state.orders[orderId]?.code || orderId} was cancelled`,
        isRead: false,
        roleTarget: 'OWNER',
        createdAt: event.timestamp || new Date().toISOString(),
        updatedAt: event.timestamp || new Date().toISOString(),
        data: { orderId },
      }, ...state.notifications],
      unreadCount: state.unreadCount + 1,
    }));
  },

  handleStaffCreated: (event) => {
    const payload = event.payload as { id: string; name: string; role: string; phone: string };
    set((state) => ({
      staff: [...state.staff, { ...payload, active: true } as Staff],
    }));
  },

  handleStaffUpdated: (event) => {
    const payload = event.payload as { id: string; name?: string; role?: string; active?: boolean };
    set((state) => ({
      staff: state.staff.map((s) =>
        s.id === payload.id ? { ...s, ...payload } : s
      ),
    }));
  },

  handleStaffDeleted: (event) => {
    const { id } = event.payload as { id: string };
    set((state) => ({
      staff: state.staff.filter((s) => s.id !== id),
    }));
  },

  handleFinanceRevenueUpdated: (event) => {
    const payload = event.payload as {
      totalRevenue: number;
      profit: number;
    };
    set((state) => ({
      todayRevenue: state.todayRevenue + payload.totalRevenue,
      todayProfit: state.todayProfit + payload.profit,
      todayOrders: state.todayOrders + 1,
    }));
  },

  handleFinanceDailySnapshot: (event) => {
    const payload = event.payload as {
      totalRevenue: number;
      profit: number;
      ordersCount: number;
    };
    set((state) => ({
      todayRevenue: state.todayRevenue + payload.totalRevenue,
      todayProfit: state.todayProfit + payload.profit,
      todayOrders: state.todayOrders + payload.ordersCount,
    }));
  },

  handleFinanceUpdated: (_event: AppEvent) => {
  },

  handleAudioAlert: (event) => {
    const payload = event.payload as unknown as AudioAlert;
    set({ lastAudioAlert: payload });
  },

  productUpdateVersion: 0,

  handleProductUpdated: (_event) => {
    set((state) => ({ productUpdateVersion: state.productUpdateVersion + 1 }));
  },

  categoryUpdateVersion: 0,

  handleCategoryUpdated: (_event) => {
    set((state) => ({ categoryUpdateVersion: state.categoryUpdateVersion + 1 }));
  },

  setConnectionStatus: (status) => set({ connectionStatus: status }),

  handleInventoryUpdated: (event) => {
    const payload = event.payload as { orderId: string; updatedItems: Array<{ inventoryId: string; itemName: string; remaining: string; previous: string }> };
    set((state) => {
      const alerts = payload.updatedItems
        .filter((item) => Number(item.remaining) <= 0)
        .map((item) => ({
          ingredientId: item.inventoryId,
          ingredientName: item.itemName,
          currentStock: Number(item.remaining),
          threshold: 0,
          severity: 'critical' as const,
          timestamp: event.timestamp,
        }));
      return {
        lowStockAlerts: [...alerts, ...state.lowStockAlerts],
      };
    });
  },

  handleLowStockAlert: (event) => {
    const payload = event.payload as { ingredientId: string; ingredientName?: string; currentStock: string; threshold: string; severity: string };
    set((state) => ({
      lowStockAlerts: [
        {
          ingredientId: payload.ingredientId,
          ingredientName: payload.ingredientName || payload.ingredientId,
          currentStock: Number(payload.currentStock),
          threshold: Number(payload.threshold),
          severity: payload.severity as 'warning' | 'critical',
          timestamp: event.timestamp,
        },
        ...state.lowStockAlerts,
      ],
    }));
  },

  handleSystemNotification: (event) => {
    const payload = event.payload as { type: string; title?: string; message: string };
    const notification: SystemNotification = {
      id: `${event.timestamp}-${Date.now()}`,
      type: payload.type || 'SYSTEM_ALERT',
      title: payload.title || 'System Alert',
      message: payload.message,
      isRead: false,
      roleTarget: 'OWNER',
      createdAt: event.timestamp || new Date().toISOString(),
      updatedAt: event.timestamp || new Date().toISOString(),
      data: null,
    };
    set((state) => ({
      notifications: [notification, ...state.notifications],
      unreadCount: state.unreadCount + 1,
    }));
  },

  // ── NOTIFICATION CRUD ──

  setNotifications: (notifications, _total) => set({ notifications }),

  addNotification: (notification) => {
    set((state) => ({
      notifications: [notification, ...state.notifications],
      unreadCount: state.unreadCount + 1,
    }));
  },

  patchNotificationRead: (id) => {
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, isRead: true, readAt: new Date().toISOString() } : n
      ),
      unreadCount: Math.max(0, state.unreadCount - (state.notifications.find((n) => n.id === id)?.isRead ? 0 : 1)),
    }));
  },

  patchAllNotificationsRead: () => {
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, isRead: true, readAt: n.readAt || new Date().toISOString() })),
      unreadCount: 0,
    }));
  },

  removeNotification: (id) => {
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
      unreadCount: Math.max(0, state.unreadCount - (state.notifications.find((n) => n.id === id)?.isRead ? 0 : 1)),
    }));
  },

  setUnreadCount: (count) => set({ unreadCount: count }),

  handleNotificationCreated: (event) => {
    const notif = event.payload as unknown as SystemNotification;
    if (notif && notif.id) {
      set((state) => ({
        notifications: [notif, ...state.notifications],
        unreadCount: state.unreadCount + 1,
      }));
    }
  },

  handleNotificationRead: (event) => {
    const payload = event.payload as { notificationId: string };
    if (payload?.notificationId) {
      set((state) => ({
        notifications: state.notifications.map((n) =>
          n.id === payload.notificationId ? { ...n, isRead: true } : n
        ),
        unreadCount: Math.max(0, state.unreadCount - 1),
      }));
    }
  },

  handleNotificationReadAll: (_event) => {
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, isRead: true })),
      unreadCount: 0,
    }));
  },

  handleNotificationDeleted: (event) => {
    const payload = event.payload as { notificationId: string };
    if (payload?.notificationId) {
      set((state) => ({
        notifications: state.notifications.filter((n) => n.id !== payload.notificationId),
      }));
    }
  },
}));
