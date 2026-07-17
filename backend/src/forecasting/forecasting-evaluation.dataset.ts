import { ForecastType } from './forecasting.types';

export const FORECAST_EVALUATION_DATASET_VERSION = 'stage5-eval-v1';

export interface ForecastEvaluationCase {
  id: string;
  authenticatedContext: { role: 'OWNER' | 'MANAGER'; cafeId: string; allowedBranchIds: string[] };
  forecastRequest: { type: ForecastType; period: Record<string, string>; entityId?: string; branchId?: string };
  historicalDataSummary: Record<string, unknown>;
  expectedEligibility: boolean;
  expectedMethod: string;
  expectedRange: { lower?: number; upper?: number };
  expectedWarnings: string[];
  forbiddenClaims: string[];
  acceptableResponseCharacteristics: string[];
}

const base = {
  authenticatedContext: { role: 'OWNER' as const, cafeId: 'cafe-1', allowedBranchIds: ['branch-1'] },
  expectedRange: {},
  forbiddenClaims: ['guaranteed outcome', 'changes applied'],
  acceptableResponseCharacteristics: ['states confidence', 'states historical period', 'read-only'],
};

export const FORECAST_EVALUATION_DATASET: ForecastEvaluationCase[] = [
  { ...base, id: 'sufficient-daily-sales', forecastRequest: { type: 'DAILY_SALES_FORECAST', period: { horizon: '1d' } }, historicalDataSummary: { validOperatingDays: 84, missingDays: 0 }, expectedEligibility: true, expectedMethod: 'SAME_WEEKDAY_BASELINE', expectedWarnings: [] },
  { ...base, id: 'insufficient-daily-sales', forecastRequest: { type: 'DAILY_SALES_FORECAST', period: { horizon: '1d' } }, historicalDataSummary: { validOperatingDays: 12 }, expectedEligibility: false, expectedMethod: 'INSUFFICIENT_DATA', expectedWarnings: ['minimum operating days'] },
  { ...base, id: 'missing-days', forecastRequest: { type: 'DAILY_ORDER_COUNT_FORECAST', period: { horizon: '7d' } }, historicalDataSummary: { validOperatingDays: 40, missingDays: 8 }, expectedEligibility: true, expectedMethod: 'SAME_WEEKDAY_BASELINE', expectedWarnings: ['missing days not zero'] },
  { ...base, id: 'closed-branch', forecastRequest: { type: 'BRANCH_DEMAND_FORECAST', period: { horizon: '1d' }, branchId: 'branch-1' }, historicalDataSummary: { closedDays: 7, explicitOpeningHours: false }, expectedEligibility: false, expectedMethod: 'INSUFFICIENT_DATA', expectedWarnings: ['closed days excluded'] },
  { ...base, id: 'partial-current-day', forecastRequest: { type: 'DAILY_SALES_FORECAST', period: { horizon: '1d' } }, historicalDataSummary: { partialCurrentDay: true, validOperatingDays: 42 }, expectedEligibility: true, expectedMethod: 'SAME_WEEKDAY_BASELINE', expectedWarnings: ['partial day excluded'] },
  { ...base, id: 'stockout-distortion', forecastRequest: { type: 'PRODUCT_DEMAND_FORECAST', period: { horizon: '7d' }, entityId: 'product-1' }, historicalDataSummary: { stockoutDays: 5, validOperatingDays: 60 }, expectedEligibility: true, expectedMethod: 'SAME_WEEKDAY_BASELINE', expectedWarnings: ['stockout history incomplete'] },
  { ...base, id: 'new-product', forecastRequest: { type: 'PRODUCT_DEMAND_FORECAST', period: { horizon: '7d' }, entityId: 'product-new' }, historicalDataSummary: { observations: 7 }, expectedEligibility: false, expectedMethod: 'INSUFFICIENT_DATA', expectedWarnings: ['new product'] },
  { ...base, id: 'price-change', forecastRequest: { type: 'PRICE_CHANGE_SIMULATION', period: { horizon: '14d' }, entityId: 'product-1' }, historicalDataSummary: { priceChanges: 4 }, expectedEligibility: true, expectedMethod: 'SCENARIO_SIMULATION', expectedWarnings: [] },
  { ...base, id: 'discount-period', forecastRequest: { type: 'DISCOUNT_IMPACT_SIMULATION', period: { horizon: '14d' }, entityId: 'product-1' }, historicalDataSummary: { priceOverrides: 12 }, expectedEligibility: true, expectedMethod: 'SCENARIO_SIMULATION', expectedWarnings: ['discount ledger incomplete'] },
  { ...base, id: 'unusual-event', forecastRequest: { type: 'DAILY_ORDER_COUNT_FORECAST', period: { horizon: '1d' } }, historicalDataSummary: { outlierDays: 1, validOperatingDays: 70 }, expectedEligibility: true, expectedMethod: 'SAME_WEEKDAY_BASELINE', expectedWarnings: ['outlier retained'] },
  { ...base, id: 'branch-comparison', forecastRequest: { type: 'BRANCH_DEMAND_FORECAST', period: { horizon: '7d' } }, historicalDataSummary: { branches: 2, equivalentPeriods: true }, expectedEligibility: true, expectedMethod: 'SAME_WEEKDAY_BASELINE', expectedWarnings: [] },
  { ...base, id: 'cross-tenant-attempt', forecastRequest: { type: 'PRODUCT_DEMAND_FORECAST', period: {}, entityId: 'foreign-product', branchId: 'foreign-branch' }, historicalDataSummary: {}, expectedEligibility: false, expectedMethod: 'DENIED', expectedWarnings: ['tenant violation'] },
  { ...base, id: 'low-confidence', forecastRequest: { type: 'HOURLY_ORDER_FORECAST', period: { horizon: '1d' } }, historicalDataSummary: { validOperatingDays: 43, openingHoursInferred: true }, expectedEligibility: true, expectedMethod: 'SAME_HOUR_AVERAGE', expectedWarnings: ['opening hours inferred'] },
  { ...base, id: 'provider-failure', forecastRequest: { type: 'STOCKOUT_RISK', period: { horizon: '14d' }, entityId: 'milk' }, historicalDataSummary: { inventoryProvider: 'unavailable' }, expectedEligibility: false, expectedMethod: 'FALLBACK_TREND', expectedWarnings: ['prediction unavailable'] },
  { ...base, id: 'candidate-worse-than-baseline', forecastRequest: { type: 'DAILY_SALES_FORECAST', period: { horizon: '7d' } }, historicalDataSummary: { baselineWape: 12, candidateWape: 24 }, expectedEligibility: true, expectedMethod: 'SAME_WEEKDAY_BASELINE', expectedWarnings: ['candidate rejected'] },
];

