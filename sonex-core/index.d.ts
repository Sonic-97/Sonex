export interface RecipeIngredientInput {
  quantity: number;
  wastePercent: number;
  costPerUnit: number;
}

export interface PackagingMaterialInput {
  quantity: number;
  costPerUnit: number;
}

export interface IngredientBreakdownItem {
  itemName: string;
  quantity: number;
  unit: string;
  costPerUnit: number;
  total: number;
}

export interface LaborDetails {
  totalLaborCostPeriod: number;
  totalOrdersInPeriod: number;
  productOrderCount: number;
}

export interface DateRangeInfo {
  from: string;
  to: string;
}

export interface CostBreakdownInput {
  productId: string;
  productName: string;
  sellingPrice: number;
  ingredients: IngredientBreakdownItem[];
  totalLaborCost: number;
  totalOrders: number;
  productOrderCount: number;
  totalItemsSold: number;
  totalOperationalExpenses: number;
  totalUtilityCost: number;
  dateFrom: string;
  dateTo: string;
}

export interface CostBreakdownResult {
  productId: string;
  productName: string;
  sellingPrice: number;
  estimatedCost: number;
  estimatedProfit: number;
  profitMargin: number;
  ingredientCost: number;
  ingredientBreakdown: IngredientBreakdownItem[];
  laborCost: number;
  laborDetails: LaborDetails;
  operationalCost: number;
  utilityCost: number;
  miscellaneousCost: number;
  dateRange: DateRangeInfo;
}

export function computeProductCost(
  ingredients: RecipeIngredientInput[],
  packaging: PackagingMaterialInput[],
  productCost: number,
  costPercent: number,
): number;

export function computeCostBreakdown(input: CostBreakdownInput): CostBreakdownResult;
