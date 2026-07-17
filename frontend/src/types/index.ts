export type OrderStatus = 'NEW' | 'CONFIRMED' | 'PREPARING' | 'READY' | 'PICKED_UP' | 'DELIVERED' | 'PAID' | 'CLOSED' | 'CANCELLED';

export interface Order {
  id: string;
  code: string;
  customerId: string;
  staffId?: string | null;
  employeeId?: string | null;
  createdById?: string | null;
  driverId?: string | null;
  status: OrderStatus;
  type: string;
  sourceType?: string;
  total: number;
  profit?: number | null;
  paid: boolean;
  paymentStatus: string;
  amountPaid: number;
  remainingAmount: number;
  paidAt?: string | null;
  collectedById?: string | null;
  collectedRole?: string | null;
  paymentMethod?: string | null;
  address?: string | null;
  printSent: boolean;
  isRevenueConfirmed?: boolean;
  source?: string;
  confirmedAt?: string | null;
  preparedAt?: string | null;
  readyAt?: string | null;
  pickedUpAt?: string | null;
  deliveredAt?: string | null;
  createdAt: string;
  customer: Customer;
  staff?: Staff | null;
  driver?: Driver | null;
  items: OrderItem[];
}

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  notes?: string | null;
  product: Product;
}

export interface OptionChoice {
  label: string;
  priceAdjust?: number;
  ingredientImpacts?: Array<{ inventoryId: string; quantity: number }>;
  sortOrder: number;
}

export interface Product {
  id: string;
  name: string;
  category: string;
  description?: string | null;
  price: number;
  cost: number;
  cafePrice?: number | null;
  active: boolean;
  options?: ProductOption[];
}

export interface ProductOption {
  id: string;
  productId: string;
  name: string;
  required: boolean;
  multiSelect: boolean;
  choices: OptionChoice[];
  sortOrder: number;
  createdAt: string;
}

export interface Customer {
  id: string;
  phone: string;
  name?: string | null;
  favoriteDrink?: string | null;
  totalOrders: number;
  totalSpent: number;
  unpaidBalance: number;
  lastOrderDate?: string | null;
  createdAt: string;
}

export interface Staff {
  id: string;
  name: string;
  role: string;
  phone: string;
  active: boolean;
}

export interface Driver {
  id: string;
  name: string;
  phone: string;
  active: boolean;
  totalDeliveries: number;
  totalRevenue: number;
  newCustomersAcquired: number;
  bonusEligible: boolean;
}

export interface AppEvent {
  eventType: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

export interface TopProduct {
  productId: string;
  name: string;
  category: string;
  quantity: number;
  revenue: number;
}

export interface CategoryBreakdown {
  category: string;
  quantity: number;
  revenue: number;
}

export interface StaffPerformance {
  id: string;
  name: string;
  role: string;
  orderCount: number;
}

export interface DriverPerformance {
  id: string;
  name: string;
  totalDeliveries: number;
  totalRevenue: number;
  newCustomersAcquired: number;
  bonusEligible: boolean;
}

export interface Debt {
  id: string;
  customerId: string;
  customerName?: string | null;
  amount: number;
  reason?: string | null;
  settled: boolean;
  createdAt: string;
}

export interface OwnerDashboardData {
  snapshot: {
    todayRevenue: number;
    todayOrders: number;
    pendingOrders: number;
    lowStockItems: number;
    activeDrivers: number;
    totalCustomers: number;
    totalProducts: number;
  };
  dailyReport: {
    summary: string;
    totalRevenue: number;
    orderCount: number;
    avgOrder: number;
    cancellations: number;
    topProducts: TopProduct[];
  };
  lowStockItems: unknown[];
  recentOrders: Order[];
}

// ── FINANCIAL INTERFACES ──

export interface DailyFinancial {
  totalRevenue: number;
  totalProfit: number;
  totalOrders: number;
}

export interface TopFinancialStaff {
  id: string;
  name: string;
  totalOrdersHandled: number;
  totalEarnings: number;
}

export interface TopFinancialDriver {
  id: string;
  name: string;
  deliveries: number;
  earnings: number;
}

export interface FinancialSnapshot {
  daily: DailyFinancial;
  totalCustomerDebt: number;
  topStaff: TopFinancialStaff | null;
  topDriver: TopFinancialDriver | null;
  topProducts: TopProduct[];
}

// ── ANALYTICS INTERFACES ──

export interface ProductProfitability {
  productId: string;
  name: string;
  category: string;
  quantity: number;
  revenue: number;
  cost: number;
  profit: number;
  marginPercent: number;
}

export interface HourlyRevenue {
  hour: number;
  count: number;
  revenue: number;
}

export interface PeakHoursResult {
  peakOrderCount: { hour: number; count: number; revenue: number }[];
  peakRevenue: { hour: number; count: number; revenue: number }[];
  busiestHour: number;
  mostRevenueHour: number;
}

export interface RevenueSummary {
  daily: { date: string; revenue: number; profit: number; orders: number }[];
  weekly: { weekStart: string; revenue: number; profit: number; orders: number }[];
  monthly: { month: string; revenue: number; profit: number; orders: number }[];
  hourly: HourlyRevenue[];
  peaks: PeakHoursResult;
}

export interface StaffAnalytics {
  topOrders: { staffId: string; name: string; orderCount: number; totalRevenue: number }[];
  topEarnings: { staffId: string; name: string; totalOrdersHandled: number; totalEarnings: number; bonus: number }[];
  efficiency: { staffId: string; name: string; orderCount: number; estimatedDaysActive: number; efficiencyScore: number }[];
  underperforming: { staffId: string; name: string; role: string; orderCount: number; reason: string }[];
}

export interface DriverAnalytics {
  topDeliveries: { driverId: string; name: string; deliveries: number; totalRevenue: number }[];
  earnings: { driverId: string; name: string; deliveries: number; earnings: number }[];
  speed: { driverId: string; name: string; avgDeliveryMinutes: number; totalDeliveries: number; speedScore: number }[];
  bonusEligible: { driverId: string; name: string; totalDeliveries: number; totalRevenue: number; newCustomersAcquired: number; isBonusEligible: boolean }[];
}

export interface CustomerInsights {
  topSpenders: { id: string; name: string | null; phone: string; totalOrders: number; totalSpent: number; unpaidBalance: number; lastOrderDate: string | null }[];
  clv: { id: string; name: string; phone: string; totalOrders: number; totalSpent: number; avgOrderValue: number; clv: number }[];
  debtRisk: { id: string; name: string | null; phone: string; totalOrders: number; totalSpent: number; unpaidBalance: number; debts: { id: string; amount: number; reason: string | null; createdAt: string }[] }[];
  retention: { totalCustomers: number; repeatCustomers: number; retentionRate: number };
}

export interface BusinessHealthScore {
  score: number;
  level: 'excellent' | 'good' | 'fair' | 'poor' | 'critical';
  components: {
    revenueStability: number;
    profitMargin: number;
    customerRetention: number;
    staffPerformance: number;
    debtRatio: number;
  };
}

export interface BusinessAlert {
  type: string;
  severity: 'low' | 'medium' | 'high';
  message: string;
}

export interface DailyBusinessSummary {
  date: string;
  summary: string;
  revenue: number;
  orders: number;
  peakHour: number;
  peakHourOrders: number;
  topProduct: string;
  topProductRevenue: number;
  topStaffMember: string;
  topStaffOrders: number;
  underperformingStaff: { name: string; orders: number }[];
  topDriver: string;
  topDriverDeliveries: number;
  customerRetentionRate: number;
  highDebtCustomers: number;
}

export interface AnalyticsOverview {
  daily: DailyBusinessSummary;
  health: BusinessHealthScore;
  alerts: BusinessAlert[];
  weekly: {
    totalRevenue: number;
    totalProfit: number;
    totalOrders: number;
    weekOverWeek: {
      current: { weekStart: string; revenue: number; profit: number; orders: number };
      previous: { weekStart: string; revenue: number; profit: number; orders: number };
      change: number;
    } | null;
    trend: string;
  };
}

// ── STAFF PERFORMANCE INTERFACES ──

export interface StaffPerformanceScore {
  id?: string;
  staffId: string;
  staffName: string;
  role: string;
  date?: string;
  ordersHandled: number;
  totalRevenue: number;
  totalProfitContribution?: number;
  avgOrderProcessingTime: number;
  cancellationCount: number;
  completionRate: number;
  efficiencyScore: number;
  revenueScore: number;
  speedScore: number;
  reliabilityScore: number;
  overallScore: number;
}

export interface PerformanceRanking {
  rank: number;
  staffId: string;
  staffName: string;
  role: string;
  overallScore: number;
  ordersHandled: number;
  totalRevenue: number;
  revenueScore: number;
  efficiencyScore: number;
  speedScore: number;
  reliabilityScore: number;
}

export interface StaffPerformanceOverview {
  avgScore: number;
  topPerformers: StaffPerformanceScore[];
  underperformers: {
    staffId: string;
    staffName: string;
    role: string;
    overallScore: number;
    ordersHandled: number;
    cancellationCount: number;
    completionRate: number;
    avgOrderProcessingTime: number;
    reason: string;
  }[];
  totalTracked: number;
}

export interface StaffInsight {
  type: string;
  message: string;
  trend: 'up' | 'down' | 'stable';
}

export interface StaffPerformanceHistory {
  date: string;
  overallScore: number;
  revenueScore: number;
  efficiencyScore: number;
  speedScore: number;
  reliabilityScore: number;
  ordersHandled: number;
  avgOrderProcessingTime: number;
}

export interface StaffComparison {
  staffA: { staffId: string; staffName: string; performance: StaffPerformanceScore | null };
  staffB: { staffId: string; staffName: string; performance: StaffPerformanceScore | null };
  comparison: {
    winner: string;
    winnerName: string;
    margin: number;
    detail: {
      overall: string;
      revenue: string;
      efficiency: string;
      speed: string;
      reliability: string;
    };
  } | null;
}

export interface Decision {
  type: 'REVENUE' | 'STAFF' | 'PRODUCT' | 'CUSTOMER' | 'OPERATION';
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  title: string;
  explanation: string;
  dataSource: string[];
  suggestedAction: string;
  expectedImpact: string;
  confidence: number;
}

// ── IN-CAFÉ ORDERS ──

export interface InCafeOrderItem {
  id: string;
  orderId: string;
  productId: string;
  product: Product;
  quantity: number;
  unitPrice: number;
  notes?: string | null;
  selectedOptions?: Array<{
    optionId: string;
    optionName: string;
    choiceLabel: string;
    priceAdjust: number;
    ingredientImpacts?: Array<{ inventoryId: string; quantity: number; unit: string }>;
  }>;
}

export interface PriceOverrideLog {
  id: string;
  inCafeOrderId?: string | null;
  productId: string;
  product: Product;
  originalPrice: number;
  overriddenPrice: number;
  reason: string;
  overriddenById: string;
  overriddenBy: { id: string; name: string };
  createdAt: string;
}

export interface InCafeOrder {
  id: string;
  code: string;
  customerName: string;
  customerPhone?: string | null;
  customerId?: string | null;
  items: InCafeOrderItem[];
  notes?: string | null;
  orderType: string;
  sourceType?: string;
  tableNumber?: string | null;
  employeeId?: string | null;
  employee?: { id: string; name: string } | null;
  createdById: string;
  createdBy: { id: string; name: string; role: string };
  status: 'NEW' | 'PREPARING' | 'READY' | 'DELIVERED' | 'COMPLETED' | 'VOID' | 'ON_HOLD';
  isPaid: boolean;
  paymentStatus: 'PAID' | 'NOT_PAID' | 'PARTIALLY_PAID';
  paymentMethod?: string | null;
  total: number;
  paidAmount: number;
  remainingBalance: number;
  paymentTimestamp?: string | null;
  voidReason?: string | null;
  priceOverrides?: PriceOverrideLog[];
  createdAt: string;
  updatedAt: string;
}

export interface InCafePayment {
  paymentStatus: 'PAID' | 'NOT_PAID' | 'PARTIALLY_PAID';
  paymentMethod?: 'CASH' | 'CARD' | 'MIXED';
  paidAmount: number;
  voidReason?: string;
}

// ── STAFF PURCHASES ──

export interface StaffPurchase {
  id: string;
  productId: string;
  product: Product;
  quantity: number;
  customPrice?: number | null;
  finalCost: number;
  staffId: string;
  staff: { id: string; name: string; role: string };
  notes?: string | null;
  createdAt: string;
}

// ── SMART FOLLOW-UP ──

export interface CustomerHabit {
  id: string;
  customerId: string;
  customer?: { id: string; name: string | null; phone: string; totalOrders: number; lastOrderDate: string | null };
  avgOrderHour: number;
  peakOrderHour: number;
  orderHourStdDev: number;
  avgIntervalDays: number;
  intervalStdDev: number;
  totalOrders: number;
  frequencyPattern: string;
  topProducts: { productId: string; name: string; category: string; count: number }[];
  channelPreference: string;
  lifecycleStage: string;
  daysSinceLastOrder: number;
  lastChannelType: string;
  patternConsistency: number;
  overallConfidence: number;
  suggestionCount: number;
  quietHourStart?: number | null;
  quietHourEnd?: number | null;
  isPaused: boolean;
}

export interface Suggestion {
  id: string;
  customerId: string;
  customer?: { id: string; name: string | null; phone: string; lastOrderDate: string | null; totalOrders: number };
  predictedHour: number;
  confidence: number;
  predictedItems: { productId: string; name: string; probability: number }[];
  suggestedMessage: string;
  reasoning: string;
  channelPrediction: string;
  status: string;
  ownerEditedMessage?: string | null;
  ownerNote?: string | null;
  feedback?: SuggestionFeedback | null;
  createdAt: string;
}

export interface SuggestionFeedback {
  id: string;
  suggestionId: string;
  wasCorrect: boolean;
  actualItems?: any;
  actualHour?: number | null;
  ownerRating?: number | null;
  notes?: string | null;
  createdAt: string;
}

// ── PAYMENT TRACKING ──

export interface PaymentLog {
  id: string;
  orderId: string;
  previousStatus: string;
  newStatus: string;
  amount: number;
  method?: string | null;
  collectedById?: string | null;
  collectedBy?: { id: string; name: string; role: string } | null;
  collectedRole?: string | null;
  notes?: string | null;
  createdAt: string;
}

export interface PaymentStatusInfo {
  paymentStatus: string;
  amountPaid: number;
  remainingAmount: number;
  paidAt?: string | null;
  collectedById?: string | null;
  collectedRole?: string | null;
}

export interface BaristaDailyClosing {
  baristaId: string;
  date: string;
  deliveryOrders: {
    total: number;
    totalValue: number;
    paidOrders: number;
    unpaidOrders: number;
    cashCollected: number;
    remainingDebt: number;
  };
  cafeOrders: {
    total: number;
    totalValue: number;
    cashCollected: number;
    unpaidBalance: number;
  };
  combined: {
    totalHandled: number;
    totalCashCollected: number;
    totalOutstanding: number;
  };
}

export interface DriverDailyClosing {
  driverId: string;
  date: string;
  totalDeliveries: number;
  totalDeliveryValue: number;
  cashCollected: number;
  uncollectedAmount: number;
  breakdown: {
    fullyPaid: number;
    partiallyPaid: number;
    unpaid: number;
  };
}

export interface ReconciliationSummary {
  date: string;
  totalSystemSales: number;
  baristaCashCollected: number;
  driverCashCollected: number;
  totalCashCollected: number;
  pendingDebts: number;
  discrepancy: number;
  inBalance: boolean;
  alerts: Array<{ type: string; severity: string; message: string }>;
}

export interface DebtRecord {
  id: string;
  customerId: string;
  orderId?: string | null;
  amount: number;
  reason?: string | null;
  collectedByRole?: string | null;
  settled: boolean;
  settledAt?: string | null;
  createdAt: string;
  customer?: { id: string; name: string | null; phone: string } | null;
  order?: { id: string; code: string; total: number } | null;
}

export interface WeeklySuggestionStats {
  totalSuggestions: number;
  sentCount: number;
  dismissedCount: number;
  feedbackCount: number;
  feedbackAccuracy: number;
  topPredictedCount: number;
  period: { from: string; to: string };
}

// ── PRODUCT MANAGEMENT ──

export interface ProductCategory {
  id: string;
  name: string;
  icon?: string | null;
  color?: string | null;
  sortOrder: number;
  active: boolean;
  products?: { id: string; name: string }[];
  createdAt: string;
}

export interface RecipeIngredient {
  id: string;
  productId: string;
  inventoryId: string;
  quantity: number;
  unit: string;
  notes?: string | null;
  inventory: {
    id: string;
    itemName: string;
    unit: string;
    costPerUnit: number;
  };
}

export interface PriceChangeLog {
  id: string;
  productId: string;
  oldPrice: number;
  newPrice: number;
  oldCost?: number | null;
  newCost?: number | null;
  changedById?: string | null;
  changedBy?: { id: string; name: string } | null;
  reason?: string | null;
  createdAt: string;
}

export interface ProductDetail extends Product {
  categoryRel?: ProductCategory | null;
  recipe: RecipeIngredient[];
  options: ProductOption[];
  priceChanges?: PriceChangeLog[];
}

export interface InventoryItem {
  id: string;
  itemName: string;
  unit: string;
  currentQty: number;
  minThreshold: number;
  costPerUnit: number;
}

export interface LowStockAlert {
  ingredientId: string;
  ingredientName: string;
  currentStock: number;
  threshold: number;
  severity: 'warning' | 'critical';
  timestamp: string;
}

export interface SystemNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  data?: Record<string, unknown> | null;
  isRead: boolean;
  readAt?: string | null;
  roleTarget: string;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationPagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface NotificationsResponse {
  data: SystemNotification[];
  pagination: NotificationPagination;
}

export interface CustomerDebtItem {
  customerName: string;
  totalOwed: number;
  orderCount: number;
  oldestUnpaidDate: string;
  orders: InCafeOrder[];
}

export interface CustomerDebtSummary {
  totalUnpaid: number;
  customerCount: number;
  customers: CustomerDebtItem[];
}

export interface UnifiedDebtOverview {
  totalUnpaidDebt: number;
  deliveryDebtTotal: number;
  inCafeDebtTotal: number;
  deliveryDebtCount: number;
  inCafeDebtCount: number;
  uniqueCustomerCount: number;
}

export type ConnectionStatus = 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'RECONNECTING';
