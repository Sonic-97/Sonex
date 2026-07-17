import type { OwnerActionProposal } from '../owner-actions/owner-action.types';

export type OwnerCopilotIntent =
  | 'OWNER_GREETING'
  | 'OWNER_HELP'
  | 'OWNER_SALES_SUMMARY'
  | 'OWNER_REVENUE_ANALYSIS'
  | 'OWNER_GROSS_PROFIT_ANALYSIS'
  | 'OWNER_NET_PROFIT_ANALYSIS'
  | 'OWNER_EXPENSE_ANALYSIS'
  | 'OWNER_PRODUCT_PERFORMANCE'
  | 'OWNER_PRODUCT_PROFITABILITY'
  | 'OWNER_CATEGORY_ANALYSIS'
  | 'OWNER_ORDER_ANALYSIS'
  | 'OWNER_CANCELLATION_ANALYSIS'
  | 'OWNER_CUSTOMER_ANALYSIS'
  | 'OWNER_CUSTOMER_RETENTION'
  | 'OWNER_INVENTORY_HEALTH'
  | 'OWNER_STOCKOUT_RISK'
  | 'OWNER_WASTE_ANALYSIS'
  | 'OWNER_BRANCH_COMPARISON'
  | 'OWNER_STAFF_PERFORMANCE'
  | 'OWNER_ATTENDANCE_ANALYSIS'
  | 'OWNER_DRIVER_ANALYSIS'
  | 'OWNER_DEBT_ANALYSIS'
  | 'OWNER_PAYMENT_ANALYSIS'
  | 'OWNER_SETTLEMENT_ANALYSIS'
  | 'OWNER_PEAK_HOURS'
  | 'OWNER_ALERT_SUMMARY'
  | 'OWNER_EXPLAIN_CHANGE'
  | 'OWNER_RECOMMEND_ACTION'
  | 'OWNER_OFFER_PROPOSAL'
  | 'OWNER_FORECAST_REQUEST'
  | 'OWNER_SALES_FORECAST'
  | 'OWNER_ORDER_FORECAST'
  | 'OWNER_PRODUCT_DEMAND_FORECAST'
  | 'OWNER_INVENTORY_FORECAST'
  | 'OWNER_STAFFING_ESTIMATE'
  | 'OWNER_WASTE_RISK'
  | 'OWNER_OFFER_SIMULATION'
  | 'OWNER_COMBO_SIMULATION'
  | 'OWNER_PRICE_SIMULATION'
  | 'OWNER_SCENARIO_COMPARISON'
  | 'OWNER_EXPORT_REQUEST'
  | 'OWNER_WRITE_ACTION_REQUEST'
  | 'OWNER_UNKNOWN';

export type OwnerCopilotPermission =
  | 'SALES_READ'
  | 'FINANCE_READ'
  | 'PRODUCT_READ'
  | 'CUSTOMER_AGGREGATE_READ'
  | 'INVENTORY_READ'
  | 'STAFF_READ'
  | 'OPERATIONS_READ';

export type OwnerCopilotToolName =
  | 'getSalesSummary'
  | 'getRevenueBreakdown'
  | 'getProfitSummary'
  | 'getExpenseSummary'
  | 'getProductPerformance'
  | 'getProductProfitability'
  | 'getCategoryPerformance'
  | 'getOrderMetrics'
  | 'getCancellationMetrics'
  | 'getCustomerMetrics'
  | 'getCustomerRetention'
  | 'getInventoryHealth'
  | 'getLowStockItems'
  | 'getConsumptionMetrics'
  | 'getWasteMetrics'
  | 'getBranchComparison'
  | 'getStaffPerformance'
  | 'getAttendanceMetrics'
  | 'getDriverMetrics'
  | 'getDebtSummary'
  | 'getPaymentSummary'
  | 'getSettlementSummary'
  | 'getPeakHours'
  | 'getBusinessAlerts'
  | 'getAvailableDateRange'
  | 'getSalesForecast'
  | 'getOrderVolumeForecast'
  | 'getHourlyDemandForecast'
  | 'getProductDemandForecast'
  | 'getIngredientConsumptionForecast'
  | 'getStockoutRisk'
  | 'getStaffingDemandEstimate'
  | 'getWasteRiskEstimate'
  | 'simulateDiscount'
  | 'simulateCombo'
  | 'simulatePriceChange'
  | 'compareOfferScenarios'
  | 'getForecastAccuracy';

export type OwnerDateRangeType =
  | 'TODAY'
  | 'YESTERDAY'
  | 'DAY_BEFORE_YESTERDAY'
  | 'THIS_WEEK'
  | 'LAST_WEEK'
  | 'THIS_MONTH'
  | 'LAST_MONTH'
  | 'LAST_7_DAYS'
  | 'LAST_30_DAYS'
  | 'MONTH_DAYS'
  | 'CURRENT_SHIFT'
  | 'MORNING'
  | 'CUSTOM';

export interface OwnerResolvedDateRange {
  type: OwnerDateRangeType;
  from: Date;
  to: Date;
  label: string;
  isIncomplete: boolean;
  comparison?: {
    from: Date;
    to: Date;
    label: string;
  };
}

export interface OwnerIntentResult {
  intent: OwnerCopilotIntent;
  confidence: number;
  dateRange: OwnerResolvedDateRange;
  branchReference: string | null;
  comparison: 'NONE' | 'PREVIOUS_PERIOD';
  requestedMetrics: string[];
  writeActionRequested: boolean;
  requestedAction?: string;
  securityViolation?: string;
  isFollowUp: boolean;
  rawQuestion: string;
}

export interface OwnerCopilotUser {
  id: string;
  role: string;
  cafeId?: string | null;
  branchId?: string | null;
  name?: string;
}

export interface OwnerCopilotScope {
  userId: string;
  role: 'OWNER' | 'MANAGER';
  cafeId: string;
  allowedBranchIds: string[];
  selectedBranchIds: string[];
  selectedBranchNames: string[];
  permissions: OwnerCopilotPermission[];
  timezone: string;
  currency: string;
}

export interface OwnerCopilotKeyNumber {
  label: string;
  value: string;
  source: OwnerCopilotToolName;
}

export interface OwnerCopilotResponse {
  intent: OwnerCopilotIntent;
  confidence: number;
  directAnswer: string;
  answer: string;
  keyNumbers: OwnerCopilotKeyNumber[];
  why: string[];
  recommendedActions: string[];
  warnings: string[];
  sources: OwnerCopilotToolName[];
  scope: {
    from: string;
    to: string;
    label: string;
    branches: string[];
    timezone: string;
    currency: string;
  };
  readOnly: true;
  proposalOnly: boolean;
  contextId: string;
  latencyMs: number;
  actionProposal?: OwnerActionProposal;
}

export interface OwnerCopilotContextState {
  cafeId: string;
  userId: string;
  intent: OwnerCopilotIntent;
  dateRange: OwnerResolvedDateRange;
  selectedBranchIds: string[];
  selectedBranchNames: string[];
  comparison: 'NONE' | 'PREVIOUS_PERIOD';
  updatedAt: number;
}

export interface OwnerCopilotMetrics {
  questions: number;
  toolCalls: number;
  toolFailures: number;
  permissionDenials: number;
  unsupportedRequests: number;
  writeActionRequestsBlocked: number;
  followUps: number;
  providerFailures: number;
  fallbackResponses: number;
  hallucinationFlags: number;
  dataMismatchIncidents: number;
  feedbackUseful: number;
  feedbackNotUseful: number;
  averageResponseTimeMs: number;
}

export interface OwnerToolResult<T = unknown> {
  tool: OwnerCopilotToolName;
  data: T;
  warnings: string[];
  truncated: boolean;
}

export interface CanonicalSalesMetrics {
  grossSales: number;
  netSales: number;
  revenue: number;
  costOfGoodsSold: number;
  grossProfit: number;
  expenses: number;
  netProfit: number;
  validOrders: number;
  cancelledOrders: number;
  totalRelevantOrders: number;
  averageOrderValue: number;
  cancellationRate: number;
}
