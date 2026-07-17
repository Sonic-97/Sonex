export const FORECAST_MODEL_VERSION = 'sonex-forecast-baseline-v1';
export const SIMULATION_NOTICE = 'This is a simulation only. No changes were applied.';
export const SIMULATION_NOTICE_AR = 'دي محاكاة فقط، ولم يتم تطبيق أي تغييرات.';

export type ForecastConfidence = 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT_DATA';

export type ForecastType =
  | 'DAILY_SALES_FORECAST'
  | 'DAILY_ORDER_COUNT_FORECAST'
  | 'HOURLY_ORDER_FORECAST'
  | 'PRODUCT_DEMAND_FORECAST'
  | 'CATEGORY_DEMAND_FORECAST'
  | 'BRANCH_DEMAND_FORECAST'
  | 'INGREDIENT_CONSUMPTION_FORECAST'
  | 'STOCK_DEPLETION_ESTIMATE'
  | 'STOCKOUT_RISK'
  | 'STAFFING_DEMAND_ESTIMATE'
  | 'WASTE_RISK_ESTIMATE'
  | 'CUSTOMER_RETURN_FORECAST'
  | 'OFFER_IMPACT_SIMULATION'
  | 'COMBO_IMPACT_SIMULATION'
  | 'DISCOUNT_IMPACT_SIMULATION'
  | 'PRICE_CHANGE_SIMULATION'
  | 'CAPACITY_IMPACT_SIMULATION';

export interface ForecastScope {
  userId: string;
  role: 'OWNER' | 'MANAGER';
  cafeId: string;
  allowedBranchIds: string[];
  selectedBranchIds: string[];
  timezone: string;
  currency: string;
}

export interface TimePoint { timestamp: string; value: number; }

export interface BacktestMetrics {
  mae: number;
  rmse: number;
  mape: number | null;
  wape: number | null;
  bias: number;
  intervalCoverage: number;
  sampleSize: number;
}

export interface ForecastEligibility {
  eligible: boolean;
  validOperatingDays: number;
  observations: number;
  requiredOperatingDays: number;
  reason: string | null;
}

export interface ForecastResult {
  id: string;
  type: ForecastType;
  entity: { id?: string; name: string };
  period: { from: string; to: string };
  historicalPeriod: { from: string | null; to: string | null };
  generatedAt: string;
  modelVersion: string;
  method: string;
  baselineMethod: string;
  selectedAgainstBaseline: boolean;
  expected: number | null;
  lower: number | null;
  upper: number | null;
  unit: string;
  currency: string;
  confidence: ForecastConfidence;
  eligibility: ForecastEligibility;
  assumptions: string[];
  warnings: string[];
  historical: TimePoint[];
  prediction: TimePoint[];
  components?: Array<{ inventoryId: string; name: string; expected: number; lower: number; upper: number; unit: string }>;
  backtest: BacktestMetrics | null;
  readOnly: true;
  noChangesApplied: true;
}

export interface SimulationScenario {
  name: 'CONSERVATIVE' | 'EXPECTED' | 'OPTIMISTIC' | 'NO_OFFER';
  expectedUnits: number;
  expectedRevenue: number;
  expectedGrossProfit: number;
  marginPercent: number;
  operationalRisk: 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';
}

export interface SimulationResult {
  id: string;
  type: ForecastType;
  generatedAt: string;
  modelVersion: string;
  productIds: string[];
  productNames: string[];
  currentPrice: number;
  proposedPrice: number;
  productCost: number;
  currentUnitMargin: number;
  proposedUnitMargin: number;
  marginReduction: number;
  breakEvenUnits: number | null;
  breakEvenUpliftPercent: number | null;
  totalExposure: number;
  customerSaving: number;
  inventoryRequirement: Array<{ inventoryId: string; name: string; quantity: number; unit: string; available: number }>;
  scenarios: SimulationScenario[];
  confidence: ForecastConfidence;
  assumptions: string[];
  warnings: string[];
  cannibalizationRisk: string;
  preparationImpact: string;
  customerValueAssessment: string;
  notice: typeof SIMULATION_NOTICE;
  noticeArabic: typeof SIMULATION_NOTICE_AR;
  readOnly: true;
  noChangesApplied: true;
}

export interface ForecastingMetrics {
  forecastsGenerated: number;
  eligibilityFailures: number;
  simulationsRun: number;
  negativeMarginWarnings: number;
  permissionDenials: number;
  crossTenantRejections: number;
  toolFailures: number;
  averageLatencyMs: number;
  confidenceDistribution: Record<ForecastConfidence, number>;
  typeDistribution: Record<string, number>;
}
