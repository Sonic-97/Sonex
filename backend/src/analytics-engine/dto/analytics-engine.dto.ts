export interface ProductSale {
  productId: string;
  name: string;
  category: string;
  quantity: number;
  revenue: number;
}

export interface TopProduct extends ProductSale {}

export interface CategoryBreakdown {
  category: string;
  quantity: number;
  revenue: number;
}

export interface DailyRevenueEntry {
  date: string;
  revenue: number;
  profit: number;
  orders: number;
}

export interface WeeklyRevenueEntry {
  weekStart: string;
  revenue: number;
  profit: number;
  orders: number;
}

export interface MonthlyRevenueEntry {
  month: string;
  revenue: number;
  profit: number;
  orders: number;
}

export interface HourlyRevenueEntry {
  hour: number;
  count: number;
  revenue: number;
}

export interface PeakHoursResult {
  peakOrderCount: HourlyRevenueEntry[];
  peakRevenue: HourlyRevenueEntry[];
  busiestHour: number;
  mostRevenueHour: number;
}

export interface StaffPerformanceEntry {
  staffId: string;
  name: string;
  orderCount: number;
  totalRevenue: number;
}

export interface StaffEarningsEntry {
  staffId: string;
  name: string;
  totalOrdersHandled: number;
  totalEarnings: number;
  bonus: number;
}

export interface StaffEfficiencyEntry {
  staffId: string;
  name: string;
  orderCount: number;
  estimatedDaysActive: number;
  efficiencyScore: number;
}

export interface UnderperformingStaffEntry {
  staffId: string;
  name: string;
  role: string;
  orderCount: number;
  reason: string;
}

export interface DriverPerformanceEntry {
  driverId: string;
  name: string;
  deliveries: number;
  totalRevenue: number;
}

export interface DriverEarningsEntry {
  driverId: string;
  name: string;
  deliveries: number;
  earnings: number;
}

export interface DeliverySpeedEntry {
  driverId: string;
  name: string;
  avgDeliveryMinutes: number;
  totalDeliveries: number;
  speedScore: number;
}

export interface BonusEligibleDriverEntry {
  driverId: string;
  name: string;
  totalDeliveries: number;
  totalRevenue: number;
  newCustomersAcquired: number;
  isBonusEligible: boolean;
}

export interface CustomerSpendEntry {
  id: string;
  name: string;
  phone: string;
  totalOrders: number;
  totalSpent: number;
  unpaidBalance: number;
  lastOrderDate: Date | null;
}

export interface CustomerLifetimeValueEntry {
  id: string;
  name: string;
  phone: string;
  totalOrders: number;
  totalSpent: number;
  avgOrderValue: number;
  clv: number;
}

export interface DebtRiskCustomerEntry {
  id: string;
  name: string;
  phone: string;
  totalOrders: number;
  totalSpent: number;
  unpaidBalance: number;
  debts: { id: string; amount: number; reason: string; createdAt: Date }[];
}

export interface RetentionRateResult {
  totalCustomers: number;
  repeatCustomers: number;
  retentionRate: number;
}

export interface DailySummaryResult {
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

export interface WeeklySummaryResult {
  weekEnding: string;
  totalRevenue: number;
  totalProfit: number;
  totalOrders: number;
  weekOverWeek: any;
  trend: string;
}

export interface MonthlyTrendResult {
  months: MonthlyRevenueEntry[];
  totalRevenue6Months: number;
  totalProfit6Months: number;
  growthRate: number;
  trend: string;
}

export interface HealthScoreResult {
  score: number;
  level: string;
  components: {
    revenueStability: number;
    profitMargin: number;
    customerRetention: number;
    staffPerformance: number;
    debtRatio: number;
  };
}

export interface AlertEntry {
  type: string;
  severity: 'low' | 'medium' | 'high';
  message: string;
}

export interface OverviewResult {
  daily: DailySummaryResult;
  health: HealthScoreResult;
  alerts: AlertEntry[];
  weekly: WeeklySummaryResult;
}

export interface KPIResult {
  todayRevenue: number;
  weeklyTrend: number;
  monthlyGrowth: number;
  pendingPayments: number;
  activeOrders: number;
  lowStockItems: number;
  currentOrders: number;
  previousOrders: number;
}

export interface SalesTrendEntry {
  period: Date;
  revenue: number;
  orders: number;
}

export interface OrderDistributionEntry {
  status: string;
  count: number;
}

export interface CategoryRevenueEntry {
  category: string;
  revenue: number;
  orders: number;
}

export interface PeakHourEntry {
  day_of_week: number;
  hour: number;
  order_count: number;
}

export interface DashboardSnapshotResult {
  todayRevenue: number;
  todayOrders: number;
  pendingOrders: number;
  lowStockItems: number;
  activeDrivers: number;
  totalCustomers: number;
  totalProducts: number;
}
