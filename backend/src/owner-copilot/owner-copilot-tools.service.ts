import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ForecastingService } from '../forecasting/forecasting.service';
import {
  OwnerCopilotScope,
  OwnerCopilotToolName,
  OwnerResolvedDateRange,
  OwnerToolResult,
} from './owner-copilot.types';
import {
  calculateCanonicalMetrics,
  CanonicalOrderFact,
  isValidSale,
  percentageChange,
  roundMoney,
  roundRate,
} from './owner-business-metrics';

const MAX_ORDER_FACTS = 5000;
const MAX_RESULT_ITEMS = 20;

@Injectable()
export class OwnerCopilotToolsService {
  constructor(private readonly prisma: PrismaService, @Optional() private readonly forecasting?: ForecastingService) {}

  async execute(
    tool: OwnerCopilotToolName,
    scope: OwnerCopilotScope,
    range: OwnerResolvedDateRange,
    rawQuestion = '',
  ): Promise<OwnerToolResult> {
    switch (tool) {
      case 'getSalesSummary': return this.getSalesSummary(scope, range);
      case 'getRevenueBreakdown': return this.getRevenueBreakdown(scope, range);
      case 'getProfitSummary': return this.getProfitSummary(scope, range);
      case 'getExpenseSummary': return this.getExpenseSummary(scope, range);
      case 'getProductPerformance': return this.getProductPerformance(scope, range);
      case 'getProductProfitability': return this.getProductProfitability(scope, range);
      case 'getCategoryPerformance': return this.getCategoryPerformance(scope, range);
      case 'getOrderMetrics': return this.getOrderMetrics(scope, range);
      case 'getCancellationMetrics': return this.getCancellationMetrics(scope, range);
      case 'getCustomerMetrics': return this.getCustomerMetrics(scope, range);
      case 'getCustomerRetention': return this.getCustomerRetention(scope, range);
      case 'getInventoryHealth': return this.getInventoryHealth(scope, range, rawQuestion);
      case 'getLowStockItems': return this.getLowStockItems(scope, range, rawQuestion);
      case 'getConsumptionMetrics': return this.getConsumptionMetrics(scope, range);
      case 'getWasteMetrics': return this.getWasteMetrics(scope, range);
      case 'getBranchComparison': return this.getBranchComparison(scope, range);
      case 'getStaffPerformance': return this.getStaffPerformance(scope, range);
      case 'getAttendanceMetrics': return this.getAttendanceMetrics(scope, range);
      case 'getDriverMetrics': return this.getDriverMetrics(scope, range);
      case 'getDebtSummary': return this.getDebtSummary(scope, range);
      case 'getPaymentSummary': return this.getPaymentSummary(scope, range);
      case 'getSettlementSummary': return this.getSettlementSummary(scope, range);
      case 'getPeakHours': return this.getPeakHours(scope, range);
      case 'getBusinessAlerts': return this.getBusinessAlerts(scope, range);
      case 'getAvailableDateRange': return this.getAvailableDateRange(scope, range);
      case 'getSalesForecast': return this.executeForecastingTool(tool, scope, rawQuestion, 'DAILY_SALES_FORECAST');
      case 'getOrderVolumeForecast': return this.executeForecastingTool(tool, scope, rawQuestion, 'DAILY_ORDER_COUNT_FORECAST');
      case 'getHourlyDemandForecast': return this.executeForecastingTool(tool, scope, rawQuestion, 'HOURLY_ORDER_FORECAST');
      case 'getProductDemandForecast': return this.executeForecastingTool(tool, scope, rawQuestion, 'PRODUCT_DEMAND_FORECAST');
      case 'getIngredientConsumptionForecast': return this.executeForecastingTool(tool, scope, rawQuestion, 'INGREDIENT_CONSUMPTION_FORECAST');
      case 'getStockoutRisk': return this.executeForecastingTool(tool, scope, rawQuestion, 'STOCKOUT_RISK');
      case 'getStaffingDemandEstimate': return this.executeForecastingTool(tool, scope, rawQuestion, 'STAFFING_DEMAND_ESTIMATE');
      case 'getWasteRiskEstimate': return this.executeForecastingTool(tool, scope, rawQuestion, 'WASTE_RISK_ESTIMATE');
      case 'simulateDiscount': return this.executeSimulationTool(tool, scope, rawQuestion, 'DISCOUNT_IMPACT_SIMULATION');
      case 'simulateCombo': return this.executeSimulationTool(tool, scope, rawQuestion, 'COMBO_IMPACT_SIMULATION');
      case 'simulatePriceChange': return this.executeSimulationTool(tool, scope, rawQuestion, 'PRICE_CHANGE_SIMULATION');
      case 'compareOfferScenarios': return this.executeScenarioComparison(tool, scope, rawQuestion);
      case 'getForecastAccuracy': return this.result(tool, this.requireForecasting().getAccuracy(scope));
    }
  }

  private async executeForecastingTool(tool: OwnerCopilotToolName, scope: OwnerCopilotScope, rawQuestion: string, type: any): Promise<OwnerToolResult> {
    const forecasting = this.requireForecasting();
    const entityId = await this.resolveForecastEntity(scope, type, rawQuestion);
    const horizonDays = /(?:اسبوع|أسبوع|week)/i.test(rawQuestion) ? 7 : 1;
    const result = await forecasting.forecast(scope, { type, entityId, horizonDays });
    return this.result(tool, result, result.warnings);
  }

  private async executeSimulationTool(tool: OwnerCopilotToolName, scope: OwnerCopilotScope, rawQuestion: string, type: any): Promise<OwnerToolResult> {
    const forecasting = this.requireForecasting();
    const entities = await forecasting.listEntities(scope);
    const question = String(rawQuestion || '');
    const normalized = this.normalizeText(question);
    const matches = entities.products.filter((product: any) => normalized.includes(this.normalizeText(product.name))).slice(0, type === 'COMBO_IMPACT_SIMULATION' ? 5 : 1);
    if (!matches.length) throw new BadRequestException('حدد اسم منتج فعلي في سؤال المحاكاة.');
    if (type === 'COMBO_IMPACT_SIMULATION' && matches.length < 2) throw new BadRequestException('حدد منتجين على الأقل لمحاكاة الكومبو.');
    const numbers = (question.match(/\d+(?:\.\d+)?/g) || []).map(Number);
    const discountValue = type === 'DISCOUNT_IMPACT_SIMULATION' ? (numbers[0] || 10) : undefined;
    let proposedPrice = type === 'COMBO_IMPACT_SIMULATION' ? numbers[numbers.length - 1] : undefined;
    if (type === 'PRICE_CHANGE_SIMULATION') proposedPrice = Number(matches[0].price) + (numbers[0] || 0);
    const result = await forecasting.simulate(scope, { type, productIds: matches.map((row: any) => row.id), discountValue, proposedPrice });
    return this.result(tool, result, result.warnings);
  }

  private async executeScenarioComparison(tool: OwnerCopilotToolName, scope: OwnerCopilotScope, rawQuestion: string): Promise<OwnerToolResult> {
    const forecasting = this.requireForecasting();
    const entities = await forecasting.listEntities(scope);
    const normalized = this.normalizeText(rawQuestion);
    const matches = entities.products.filter((product: any) => normalized.includes(this.normalizeText(product.name))).slice(0, 5);
    if (!matches.length) throw new BadRequestException('حدد منتجًا فعليًا واحدًا على الأقل للمقارنة.');
    const numbers = (rawQuestion.match(/\d+(?:\.\d+)?/g) || []).map(Number);
    const discount = numbers[0] && numbers[0] < 100 ? numbers[0] : 10;
    const currentTotal = matches.reduce((sum: number, row: any) => sum + Number(row.price), 0);
    const scenarios: any[] = [{ type: 'DISCOUNT_IMPACT_SIMULATION', productIds: [matches[0].id], discountValue: discount }];
    if (matches.length >= 2) scenarios.push({ type: 'COMBO_IMPACT_SIMULATION', productIds: matches.map((row: any) => row.id), proposedPrice: Math.round(currentTotal * 0.9 * 100) / 100 });
    else scenarios.push({ type: 'PRICE_CHANGE_SIMULATION', productIds: [matches[0].id], proposedPrice: Math.round(Number(matches[0].price) * 1.05 * 100) / 100 });
    const result = await forecasting.compareScenarios(scope, scenarios);
    return this.result(tool, result, [result.notice]);
  }

  private async resolveForecastEntity(scope: OwnerCopilotScope, type: string, rawQuestion: string) {
    if (!['PRODUCT_DEMAND_FORECAST', 'INGREDIENT_CONSUMPTION_FORECAST', 'STOCKOUT_RISK', 'WASTE_RISK_ESTIMATE'].includes(type)) return undefined;
    const entities = await this.requireForecasting().listEntities(scope);
    const candidates = ['STOCKOUT_RISK', 'WASTE_RISK_ESTIMATE'].includes(type) ? entities.inventory : entities.products;
    const normalized = this.normalizeText(rawQuestion);
    const matches = candidates.filter((row: any) => normalized.includes(this.normalizeText(row.name || row.itemName || '')));
    if (matches.length === 1) return matches[0].id;
    if (candidates.length === 1) return candidates[0].id;
    throw new BadRequestException('حدد المنتج أو خامة المخزون من صفحة التوقعات لتشغيل هذا التحليل بدقة.');
  }

  private requireForecasting() { if (!this.forecasting) throw new Error('Forecasting service unavailable'); return this.forecasting; }
  private normalizeText(value: string) { return value.toLowerCase().replace(/[أإآ]/g, 'ا').replace(/[ًٌٍَُِّْـ]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim(); }

  async getSalesSummary(scope: OwnerCopilotScope, range: OwnerResolvedDateRange): Promise<OwnerToolResult> {
    const current = await this.salesForRange(scope, range.from, range.to);
    let comparison: Record<string, unknown> | null = null;
    if (range.comparison) {
      const previous = await this.salesForRange(scope, range.comparison.from, range.comparison.to);
      comparison = {
        metrics: previous.metrics,
        netSalesChangePercent: percentageChange(current.metrics.netSales, previous.metrics.netSales),
        orderChangePercent: percentageChange(current.metrics.validOrders, previous.metrics.validOrders),
        averageOrderValueChangePercent: percentageChange(current.metrics.averageOrderValue, previous.metrics.averageOrderValue),
      };
    }
    return this.result('getSalesSummary', {
      metrics: current.metrics,
      comparison,
    }, current.warnings, current.truncated);
  }

  async getRevenueBreakdown(scope: OwnerCopilotScope, range: OwnerResolvedDateRange): Promise<OwnerToolResult> {
    const loaded = await this.loadOrderFacts(scope, range.from, range.to);
    const valid = loaded.facts.filter(isValidSale);
    const bySource = this.groupMoney(valid, (fact) => fact.source, (fact) => fact.total);
    const byPaymentMethod = this.groupMoney(valid, (fact) => fact.paymentMethod || 'غير مسجل', (fact) => fact.total);
    return this.result('getRevenueBreakdown', {
      revenue: roundMoney(valid.reduce((sum, fact) => sum + fact.total, 0)),
      bySource,
      byPaymentMethod,
      validOrders: valid.length,
    }, loaded.warnings, loaded.truncated);
  }

  async getProfitSummary(scope: OwnerCopilotScope, range: OwnerResolvedDateRange): Promise<OwnerToolResult> {
    const current = await this.canonicalForRange(scope, range.from, range.to);
    let comparison: Record<string, unknown> | null = null;
    if (range.comparison) {
      const previous = await this.canonicalForRange(scope, range.comparison.from, range.comparison.to);
      comparison = {
        metrics: previous.metrics,
        grossProfitChangePercent: percentageChange(current.metrics.grossProfit, previous.metrics.grossProfit),
        netProfitChangePercent: percentageChange(current.metrics.netProfit, previous.metrics.netProfit),
        expenseChangePercent: percentageChange(current.metrics.expenses, previous.metrics.expenses),
      };
    }
    const grossMarginPercent = current.metrics.netSales
      ? roundRate(current.metrics.grossProfit / current.metrics.netSales * 100)
      : 0;
    return this.result('getProfitSummary', {
      ...current.metrics,
      grossMarginPercent,
      comparison,
    }, [
      ...current.warnings,
      'تكلفة البضاعة تعتمد على تكلفة المنتج الحالية لأن سجل تكلفة تاريخي موحد غير متاح لكل الطلبات.',
      'صافي الربح يخصم المصروفات المسجلة في جدول المصروفات فقط.',
    ], current.truncated);
  }

  async getExpenseSummary(scope: OwnerCopilotScope, range: OwnerResolvedDateRange): Promise<OwnerToolResult> {
    const expenses = await this.loadExpenses(scope, range.from, range.to);
    const byCategory = this.groupMoney(expenses, (expense) => expense.category, (expense) => Number(expense.amount));
    const total = roundMoney(expenses.reduce((sum, expense) => sum + Number(expense.amount), 0));
    let comparisonTotal: number | null = null;
    let changePercent: number | null = null;
    if (range.comparison) {
      const previous = await this.loadExpenses(scope, range.comparison.from, range.comparison.to);
      comparisonTotal = roundMoney(previous.reduce((sum, expense) => sum + Number(expense.amount), 0));
      changePercent = percentageChange(total, comparisonTotal);
    }
    return this.result('getExpenseSummary', {
      total,
      byCategory: byCategory.slice(0, MAX_RESULT_ITEMS),
      comparisonTotal,
      changePercent,
    });
  }

  async getProductPerformance(scope: OwnerCopilotScope, range: OwnerResolvedDateRange): Promise<OwnerToolResult> {
    const loaded = await this.loadOrderFacts(scope, range.from, range.to);
    const products = this.aggregateProducts(loaded.facts.filter(isValidSale));
    return this.result('getProductPerformance', {
      rankingBasis: 'الكمية المباعة',
      topByQuantity: [...products].sort((a, b) => b.quantity - a.quantity).slice(0, 10),
      topByRevenue: [...products].sort((a, b) => b.revenue - a.revenue).slice(0, 10),
      lowPerformers: [...products].sort((a, b) => a.quantity - b.quantity).slice(0, 10),
    }, loaded.warnings, loaded.truncated);
  }

  async getProductProfitability(scope: OwnerCopilotScope, range: OwnerResolvedDateRange): Promise<OwnerToolResult> {
    const loaded = await this.loadOrderFacts(scope, range.from, range.to);
    const products = this.aggregateProducts(loaded.facts.filter(isValidSale));
    return this.result('getProductProfitability', {
      rankingBasis: 'مساهمة الربح الإجمالي',
      highestProfit: [...products].sort((a, b) => b.profit - a.profit).slice(0, 10),
      highSellingLowMargin: products
        .filter((product) => product.quantity > 0)
        .sort((a, b) => a.marginPercent - b.marginPercent || b.quantity - a.quantity)
        .slice(0, 10),
    }, [
      ...loaded.warnings,
      'ربحية المنتجات تعتمد على التكلفة الحالية المسجلة للمنتج.',
    ], loaded.truncated);
  }

  async getCategoryPerformance(scope: OwnerCopilotScope, range: OwnerResolvedDateRange): Promise<OwnerToolResult> {
    const loaded = await this.loadOrderFacts(scope, range.from, range.to);
    const categories = new Map<string, { category: string; quantity: number; revenue: number; cost: number }>();
    for (const fact of loaded.facts.filter(isValidSale)) {
      for (const item of fact.items) {
        const value = categories.get(item.category) || { category: item.category, quantity: 0, revenue: 0, cost: 0 };
        value.quantity += item.quantity;
        value.revenue += item.quantity * item.unitPrice;
        value.cost += item.quantity * item.unitCost;
        categories.set(item.category, value);
      }
    }
    const rows = [...categories.values()].map((row) => ({
      ...row,
      revenue: roundMoney(row.revenue),
      profit: roundMoney(row.revenue - row.cost),
      marginPercent: row.revenue ? roundRate((row.revenue - row.cost) / row.revenue * 100) : 0,
    })).sort((a, b) => b.revenue - a.revenue).slice(0, MAX_RESULT_ITEMS);
    return this.result('getCategoryPerformance', { rankingBasis: 'الإيراد', categories: rows }, loaded.warnings, loaded.truncated);
  }

  async getOrderMetrics(scope: OwnerCopilotScope, range: OwnerResolvedDateRange): Promise<OwnerToolResult> {
    const canonical = await this.canonicalForRange(scope, range.from, range.to);
    const loaded = await this.loadOrderFacts(scope, range.from, range.to);
    const preparationMinutes = loaded.facts
      .filter((fact) => fact.preparedAt)
      .map((fact) => (fact.preparedAt!.getTime() - fact.createdAt.getTime()) / 60000)
      .filter((minutes) => minutes >= 0 && minutes < 1440);
    const activeOrders = loaded.facts.filter((fact) => ['NEW', 'CONFIRMED', 'ACCEPTED', 'PREPARING', 'READY'].includes(fact.status)).length;
    return this.result('getOrderMetrics', {
      ...canonical.metrics,
      activeOrders,
      averagePreparationMinutes: preparationMinutes.length
        ? roundRate(preparationMinutes.reduce((sum, value) => sum + value, 0) / preparationMinutes.length)
        : null,
    }, [...canonical.warnings, ...loaded.warnings], canonical.truncated || loaded.truncated);
  }

  async getCancellationMetrics(scope: OwnerCopilotScope, range: OwnerResolvedDateRange): Promise<OwnerToolResult> {
    const canonical = await this.canonicalForRange(scope, range.from, range.to);
    return this.result('getCancellationMetrics', {
      cancelledOrders: canonical.metrics.cancelledOrders,
      totalRelevantOrders: canonical.metrics.totalRelevantOrders,
      cancellationRate: canonical.metrics.cancellationRate,
    }, canonical.warnings, canonical.truncated);
  }

  async getCustomerMetrics(scope: OwnerCopilotScope, range: OwnerResolvedDateRange): Promise<OwnerToolResult> {
    const customers = await this.prisma.customer.findMany({
      where: { cafeId: scope.cafeId, branchId: { in: scope.selectedBranchIds } },
      select: { createdAt: true, totalOrders: true, totalSpent: true, lastOrderDate: true },
      take: MAX_ORDER_FACTS + 1,
    });
    const rows = customers.slice(0, MAX_ORDER_FACTS);
    const newCustomers = rows.filter((customer) => customer.createdAt >= range.from && customer.createdAt <= range.to).length;
    const repeatCustomers = rows.filter((customer) => customer.totalOrders > 1).length;
    const totalSpent = rows.reduce((sum, customer) => sum + Number(customer.totalSpent), 0);
    return this.result('getCustomerMetrics', {
      totalCustomers: rows.length,
      newCustomers,
      repeatCustomers,
      averageLifetimeCustomerValue: rows.length ? roundMoney(totalSpent / rows.length) : 0,
    }, [], customers.length > MAX_ORDER_FACTS);
  }

  async getCustomerRetention(scope: OwnerCopilotScope, range: OwnerResolvedDateRange): Promise<OwnerToolResult> {
    const customers = await this.prisma.customer.findMany({
      where: { cafeId: scope.cafeId, branchId: { in: scope.selectedBranchIds } },
      select: { totalOrders: true, lastOrderDate: true },
      take: MAX_ORDER_FACTS + 1,
    });
    const rows = customers.slice(0, MAX_ORDER_FACTS);
    const repeatCustomers = rows.filter((customer) => customer.totalOrders > 1).length;
    const inactiveCustomers = rows.filter((customer) => customer.lastOrderDate && customer.lastOrderDate < range.from).length;
    return this.result('getCustomerRetention', {
      repeatCustomers,
      repeatCustomerRate: rows.length ? roundRate(repeatCustomers / rows.length * 100) : 0,
      inactiveCustomers,
      totalCustomers: rows.length,
    }, ['مؤشر عدم النشاط يعني عدم وجود طلب منذ بداية الفترة، وليس توقعًا مؤكدًا بالمغادرة.'], customers.length > MAX_ORDER_FACTS);
  }

  async getInventoryHealth(scope: OwnerCopilotScope, _range: OwnerResolvedDateRange, rawQuestion = ''): Promise<OwnerToolResult> {
    const inventory = await this.prisma.inventory.findMany({
      where: { cafeId: scope.cafeId, branchId: { in: scope.selectedBranchIds } },
      select: {
        id: true, itemName: true, unit: true, currentQty: true, reservedQty: true, minThreshold: true,
        branch: { select: { id: true, name: true } },
        recipeUses: { take: 5, select: { product: { select: { name: true } } } },
      },
      take: 1001,
    });
    const rows = inventory.slice(0, 1000).map((item) => {
      const available = Number(item.currentQty) - Number(item.reservedQty);
      const minimum = Number(item.minThreshold);
      return {
        id: item.id,
        itemName: item.itemName,
        unit: item.unit,
        currentQuantity: Number(item.currentQty),
        reservedQuantity: Number(item.reservedQty),
        availableQuantity: roundMoney(available),
        minimumLevel: minimum,
        branchId: item.branch.id,
        branchName: item.branch.name,
        severity: available <= 0 ? 'CRITICAL' : available <= minimum ? 'HIGH' : available <= minimum * 1.5 ? 'MEDIUM' : 'LOW',
        relatedProducts: [...new Set(item.recipeUses.map((use) => use.product.name))],
      };
    });
    const critical = rows.filter((row) => row.severity === 'CRITICAL' || row.severity === 'HIGH');

    let matchedItems: typeof rows = [];
    if (rawQuestion) {
      const normQ = this.normalizeText(rawQuestion);
      matchedItems = rows.filter((item) => {
        const normItem = this.normalizeText(item.itemName);
        return normQ.includes(normItem) || normItem.includes(normQ);
      });
    }

    return this.result('getInventoryHealth', {
      totalItems: rows.length,
      criticalItems: critical.slice(0, MAX_RESULT_ITEMS),
      healthyItems: rows.filter((row) => row.severity === 'LOW').length,
      matchedItems: matchedItems.slice(0, MAX_RESULT_ITEMS),
      allItems: rows.slice(0, MAX_RESULT_ITEMS),
    }, [], inventory.length > 1000);
  }

  async getLowStockItems(scope: OwnerCopilotScope, range: OwnerResolvedDateRange, rawQuestion = ''): Promise<OwnerToolResult> {
    const health = await this.getInventoryHealth(scope, range, rawQuestion);
    return { ...health, tool: 'getLowStockItems' };
  }

  async getConsumptionMetrics(scope: OwnerCopilotScope, range: OwnerResolvedDateRange): Promise<OwnerToolResult> {
    const rows = await this.prisma.inventoryConsumption.findMany({
      where: {
        cafeId: scope.cafeId,
        createdAt: { gte: range.from, lte: range.to },
        inventory: { branchId: { in: scope.selectedBranchIds } },
      },
      select: { inventoryId: true, quantity: true, unit: true, totalCost: true, inventory: { select: { itemName: true, branch: { select: { name: true } } } } },
      take: MAX_ORDER_FACTS + 1,
    });
    const grouped = new Map<string, { itemName: string; branchName: string; quantity: number; unit: string; totalCost: number }>();
    for (const row of rows.slice(0, MAX_ORDER_FACTS)) {
      const key = `${row.inventoryId}:${row.inventory.branch.name}`;
      const item = grouped.get(key) || { itemName: row.inventory.itemName, branchName: row.inventory.branch.name, quantity: 0, unit: row.unit, totalCost: 0 };
      item.quantity += Number(row.quantity);
      item.totalCost += Number(row.totalCost);
      grouped.set(key, item);
    }
    return this.result('getConsumptionMetrics', {
      topConsumed: [...grouped.values()]
        .map((item) => ({ ...item, quantity: roundMoney(item.quantity), totalCost: roundMoney(item.totalCost) }))
        .sort((a, b) => b.totalCost - a.totalCost)
        .slice(0, MAX_RESULT_ITEMS),
    }, [], rows.length > MAX_ORDER_FACTS);
  }

  async getWasteMetrics(scope: OwnerCopilotScope, range: OwnerResolvedDateRange): Promise<OwnerToolResult> {
    const recipes = await this.prisma.recipeIngredient.findMany({
      where: {
        cafeId: scope.cafeId,
        wastePercent: { gt: 0 },
        product: { active: true, OR: [{ branchId: null }, { branchId: { in: scope.selectedBranchIds } }] },
      },
      select: { wastePercent: true, quantity: true, unit: true, product: { select: { name: true } }, inventory: { select: { itemName: true } } },
      take: 501,
    });
    const consumption = await this.getConsumptionMetrics(scope, range);
    return this.result('getWasteMetrics', {
      configuredRecipeWaste: recipes.slice(0, 500).map((recipe) => ({
        productName: recipe.product.name,
        inventoryItem: recipe.inventory.itemName,
        wastePercent: Number(recipe.wastePercent),
        quantityPerItem: Number(recipe.quantity),
        unit: recipe.unit,
      })).sort((a, b) => b.wastePercent - a.wastePercent).slice(0, MAX_RESULT_ITEMS),
      consumption: consumption.data,
    }, ['لا يوجد سجل هالك فعلي موحد؛ المعروض هو نسب الهالك المضبوطة في الوصفات والاستهلاك المسجل.'], recipes.length > 500 || consumption.truncated);
  }

  async getBranchComparison(scope: OwnerCopilotScope, range: OwnerResolvedDateRange): Promise<OwnerToolResult> {
    const loaded = await this.loadOrderFacts(scope, range.from, range.to);
    const branches = await this.prisma.branch.findMany({
      where: { cafeId: scope.cafeId, id: { in: scope.selectedBranchIds } },
      select: { id: true, name: true },
    });
    const rows = branches.map((branch) => {
      const facts = loaded.facts.filter((fact) => fact.branchId === branch.id);
      const metrics = calculateCanonicalMetrics(facts, 0);
      return {
        branchId: branch.id,
        branchName: branch.name,
        sales: metrics.netSales,
        orders: metrics.validOrders,
        averageOrderValue: metrics.averageOrderValue,
        cancellationRate: metrics.cancellationRate,
        grossProfitBeforeExpenses: metrics.grossProfit,
        grossMarginPercent: metrics.netSales ? roundRate(metrics.grossProfit / metrics.netSales * 100) : 0,
      };
    }).sort((a, b) => b.sales - a.sales);
    return this.result('getBranchComparison', {
      rankingBasis: 'إجمالي المبيعات مع مؤشرات مطبعة للمقارنة',
      branches: rows,
    }, ['ساعات التشغيل غير مسجلة بشكل موحد، لذلك لم يتم حساب المبيعات لكل ساعة تشغيل.'], loaded.truncated);
  }

  async getStaffPerformance(scope: OwnerCopilotScope, range: OwnerResolvedDateRange): Promise<OwnerToolResult> {
    const rows = await this.prisma.staffPerformance.findMany({
      where: { cafeId: scope.cafeId, branchId: { in: scope.selectedBranchIds }, date: { gte: range.from, lte: range.to } },
      select: {
        ordersHandled: true, totalRevenue: true, totalProfitContribution: true, avgOrderProcessingTime: true,
        cancellationCount: true, completionRate: true, overallScore: true,
        staff: { select: { id: true, name: true, role: true } },
        branch: { select: { name: true } },
      },
      take: 1001,
    });
    const byStaff = new Map<string, { staffId: string; name: string; role: string; branchName: string; orders: number; revenue: number; cancellations: number; processingTotal: number; records: number; scoreTotal: number }>();
    for (const row of rows.slice(0, 1000)) {
      const value = byStaff.get(row.staff.id) || { staffId: row.staff.id, name: row.staff.name, role: row.staff.role, branchName: row.branch?.name || 'غير محدد', orders: 0, revenue: 0, cancellations: 0, processingTotal: 0, records: 0, scoreTotal: 0 };
      value.orders += row.ordersHandled;
      value.revenue += Number(row.totalRevenue);
      value.cancellations += row.cancellationCount;
      value.processingTotal += row.avgOrderProcessingTime;
      value.scoreTotal += row.overallScore;
      value.records += 1;
      byStaff.set(row.staff.id, value);
    }
    return this.result('getStaffPerformance', {
      rankingBasis: 'عدد الطلبات المكتملة ثم المؤشرات المسجلة',
      staff: [...byStaff.values()].map((row) => ({
        staffId: row.staffId, name: row.name, role: row.role, branchName: row.branchName,
        ordersHandled: row.orders, revenue: roundMoney(row.revenue), cancellations: row.cancellations,
        averageProcessingTime: row.records ? roundRate(row.processingTotal / row.records) : null,
        averageScore: row.records ? roundRate(row.scoreTotal / row.records) : null,
      })).sort((a, b) => b.ordersHandled - a.ordersHandled).slice(0, MAX_RESULT_ITEMS),
    }, ['هذه مؤشرات تشغيلية مسجلة، وليست حكمًا على الموظفين.'], rows.length > 1000);
  }

  async getAttendanceMetrics(scope: OwnerCopilotScope, range: OwnerResolvedDateRange): Promise<OwnerToolResult> {
    const rows = await this.prisma.attendance.findMany({
      where: { cafeId: scope.cafeId, staff: { branchId: { in: scope.selectedBranchIds } }, clockIn: { gte: range.from, lte: range.to } },
      select: { clockIn: true, clockOut: true, totalHours: true, status: true, staff: { select: { id: true, name: true, role: true, branch: { select: { name: true } } } } },
      take: 2001,
    });
    const active = rows.filter((row) => row.status === 'ACTIVE' || !row.clockOut).length;
    const totalHours = rows.reduce((sum, row) => sum + Number(row.totalHours || 0), 0);
    return this.result('getAttendanceMetrics', {
      attendanceRecords: rows.slice(0, 2000).length,
      activeShifts: active,
      totalRecordedHours: roundRate(totalHours),
      staffWithAttendance: new Set(rows.map((row) => row.staff.id)).size,
    }, ['لا يوجد حقل موعد وردية معياري، لذلك لا يمكن إثبات التأخير من بيانات الحضور الحالية.'], rows.length > 2000);
  }

  async getDriverMetrics(scope: OwnerCopilotScope, range: OwnerResolvedDateRange): Promise<OwnerToolResult> {
    const loaded = await this.loadOrderFacts(scope, range.from, range.to);
    const delivered = loaded.facts.filter((fact) => fact.source === 'DELIVERY' && fact.status === 'DELIVERED' && fact.driverId);
    const driverIds = [...new Set(delivered.map((fact) => fact.driverId!))];
    const drivers = driverIds.length ? await this.prisma.driver.findMany({ where: { cafeId: scope.cafeId, branchId: { in: scope.selectedBranchIds }, id: { in: driverIds } }, select: { id: true, name: true, branch: { select: { name: true } } } }) : [];
    const names = new Map(drivers.map((driver) => [driver.id, driver]));
    const grouped = new Map<string, { deliveries: number; revenue: number; minutes: number[] }>();
    for (const fact of delivered) {
      const value = grouped.get(fact.driverId!) || { deliveries: 0, revenue: 0, minutes: [] };
      value.deliveries += 1;
      value.revenue += fact.total;
      if (fact.deliveredAt) value.minutes.push((fact.deliveredAt.getTime() - fact.createdAt.getTime()) / 60000);
      grouped.set(fact.driverId!, value);
    }
    return this.result('getDriverMetrics', {
      rankingBasis: 'عدد التوصيلات المكتملة',
      drivers: [...grouped.entries()].map(([driverId, row]) => ({
        driverId,
        name: names.get(driverId)?.name || 'غير معروف',
        branchName: names.get(driverId)?.branch.name || 'غير محدد',
        deliveries: row.deliveries,
        revenue: roundMoney(row.revenue),
        averageDeliveryMinutes: row.minutes.length ? roundRate(row.minutes.reduce((sum, value) => sum + value, 0) / row.minutes.length) : null,
      })).sort((a, b) => b.deliveries - a.deliveries).slice(0, MAX_RESULT_ITEMS),
    }, loaded.warnings, loaded.truncated);
  }

  async getDebtSummary(scope: OwnerCopilotScope, range: OwnerResolvedDateRange): Promise<OwnerToolResult> {
    const [outstanding, collected] = await Promise.all([
      this.prisma.debt.findMany({
        where: { cafeId: scope.cafeId, branchId: { in: scope.selectedBranchIds }, settled: false, createdAt: { lte: range.to } },
        select: { amount: true, branch: { select: { name: true } } },
        take: MAX_ORDER_FACTS + 1,
      }),
      this.prisma.debt.findMany({
        where: { cafeId: scope.cafeId, branchId: { in: scope.selectedBranchIds }, settled: true, settledAt: { gte: range.from, lte: range.to } },
        select: { amount: true },
        take: MAX_ORDER_FACTS + 1,
      }),
    ]);
    const byBranch = this.groupMoney(outstanding.slice(0, MAX_ORDER_FACTS), (debt) => debt.branch.name, (debt) => Number(debt.amount));
    return this.result('getDebtSummary', {
      outstandingAmount: roundMoney(outstanding.slice(0, MAX_ORDER_FACTS).reduce((sum, debt) => sum + Number(debt.amount), 0)),
      outstandingRecords: Math.min(outstanding.length, MAX_ORDER_FACTS),
      recentCollections: roundMoney(collected.slice(0, MAX_ORDER_FACTS).reduce((sum, debt) => sum + Number(debt.amount), 0)),
      byBranch,
    }, ['لا يوجد تاريخ استحقاق في نموذج الدين الحالي، لذلك لا يمكن تصنيف الدين كمتأخر زمنيًا.'], outstanding.length > MAX_ORDER_FACTS || collected.length > MAX_ORDER_FACTS);
  }

  async getPaymentSummary(scope: OwnerCopilotScope, range: OwnerResolvedDateRange): Promise<OwnerToolResult> {
    const payments = await this.prisma.payment.findMany({
      where: { cafeId: scope.cafeId, branchId: { in: scope.selectedBranchIds }, createdAt: { gte: range.from, lte: range.to }, status: 'PAID' },
      select: { amount: true, method: true, branch: { select: { name: true } } },
      take: MAX_ORDER_FACTS + 1,
    });
    const rows = payments.slice(0, MAX_ORDER_FACTS);
    const cashCollected = roundMoney(rows.filter((p) => p.method === 'CASH').reduce((sum, payment) => sum + Number(payment.amount), 0));
    const expenses = await this.prisma.expense.findMany({
      where: {
        cafeId: scope.cafeId,
        branchId: { in: scope.selectedBranchIds },
        expenseDate: { gte: range.from, lte: range.to },
        OR: [
          { expenseType: { contains: 'CASH' } },
          { expenseType: { contains: 'DRAWER' } },
          { description: { contains: 'درج' } },
          { description: { contains: 'كاش' } },
        ],
      },
      select: { amount: true },
    });
    const cashExpenses = roundMoney(expenses.reduce((sum, expense) => sum + Number(expense.amount), 0));
    const estimatedDrawerCash = roundMoney(cashCollected - cashExpenses);

    return this.result('getPaymentSummary', {
      totalCollected: roundMoney(rows.reduce((sum, payment) => sum + Number(payment.amount), 0)),
      cashCollected,
      cashExpenses,
      estimatedDrawerCash,
      paymentRecords: rows.length,
      byMethod: this.groupMoney(rows, (payment) => payment.method || 'غير مسجل', (payment) => Number(payment.amount)),
      byBranch: this.groupMoney(rows, (payment) => payment.branch.name, (payment) => Number(payment.amount)),
    }, [], payments.length > MAX_ORDER_FACTS);
  }

  async getSettlementSummary(scope: OwnerCopilotScope, range: OwnerResolvedDateRange): Promise<OwnerToolResult> {
    const rows = await this.prisma.driverCashSettlement.findMany({
      where: { cafeId: scope.cafeId, branchId: { in: scope.selectedBranchIds }, createdAt: { gte: range.from, lte: range.to } },
      select: { amount: true, status: true, branch: { select: { name: true } } },
      take: 1001,
    });
    const data = rows.slice(0, 1000);
    return this.result('getSettlementSummary', {
      total: roundMoney(data.reduce((sum, row) => sum + Number(row.amount), 0)),
      pending: roundMoney(data.filter((row) => row.status === 'PENDING').reduce((sum, row) => sum + Number(row.amount), 0)),
      approved: roundMoney(data.filter((row) => row.status === 'APPROVED').reduce((sum, row) => sum + Number(row.amount), 0)),
      byStatus: this.groupMoney(data, (row) => row.status, (row) => Number(row.amount)),
    }, [], rows.length > 1000);
  }

  async getPeakHours(scope: OwnerCopilotScope, range: OwnerResolvedDateRange): Promise<OwnerToolResult> {
    const loaded = await this.loadOrderFacts(scope, range.from, range.to);
    const hourFormatter = new Intl.DateTimeFormat('en-US', { timeZone: scope.timezone, hour: '2-digit', hourCycle: 'h23' });
    const hours = new Map<number, { hour: number; orders: number; revenue: number }>();
    for (const fact of loaded.facts.filter(isValidSale)) {
      const hour = Number(hourFormatter.format(fact.createdAt));
      const value = hours.get(hour) || { hour, orders: 0, revenue: 0 };
      value.orders += 1;
      value.revenue += fact.total;
      hours.set(hour, value);
    }
    const rows = [...hours.values()].map((row) => ({ ...row, revenue: roundMoney(row.revenue) })).sort((a, b) => b.orders - a.orders);
    return this.result('getPeakHours', { peakHours: rows.slice(0, 5), rankingBasis: 'عدد الطلبات الصالحة' }, loaded.warnings, loaded.truncated);
  }

  async getBusinessAlerts(scope: OwnerCopilotScope, range: OwnerResolvedDateRange): Promise<OwnerToolResult> {
    const comparison = range.comparison || this.previousPeriod(range);
    const canReadFinance = scope.permissions.includes('FINANCE_READ');
    const [current, previous, inventory, expensesCurrent, expensesPrevious] = await Promise.all([
      this.salesForRange(scope, range.from, range.to),
      this.salesForRange(scope, comparison.from, comparison.to),
      this.getInventoryHealth(scope, range),
      canReadFinance ? this.loadExpenses(scope, range.from, range.to) : Promise.resolve([]),
      canReadFinance ? this.loadExpenses(scope, comparison.from, comparison.to) : Promise.resolve([]),
    ]);
    const alerts: Array<Record<string, unknown>> = [];
    const salesChange = percentageChange(current.metrics.netSales, previous.metrics.netSales);
    if (salesChange !== null && salesChange <= -20) {
      alerts.push({ severity: 'HIGH', title: 'انخفاض واضح في المبيعات', whatHappened: `المبيعات انخفضت ${Math.abs(salesChange)}%.`, evidence: { current: current.metrics.netSales, previous: previous.metrics.netSales }, businessImpact: 'انخفاض الإيراد خلال الفترة.', recommendedAction: 'راجع عدد الطلبات ومتوسط الطلب وأوقات الانخفاض.', dateRange: range.label, branch: scope.selectedBranchNames.join('، ') });
    }
    if (current.metrics.cancellationRate >= 15 && current.metrics.totalRelevantOrders >= 5) {
      alerts.push({ severity: 'HIGH', title: 'معدل إلغاء مرتفع', whatHappened: `معدل الإلغاء ${current.metrics.cancellationRate}%.`, evidence: { cancelled: current.metrics.cancelledOrders, total: current.metrics.totalRelevantOrders }, businessImpact: 'قد يؤثر على الإيراد وتجربة العملاء.', recommendedAction: 'راجع أسباب الإلغاء وتوقيتاتها قبل اتخاذ إجراء.', dateRange: range.label, branch: scope.selectedBranchNames.join('، ') });
    }
    const criticalItems = ((inventory.data as any).criticalItems || []) as Array<any>;
    for (const item of criticalItems.slice(0, 5)) {
      alerts.push({ severity: item.severity, title: `مخزون حرج: ${item.itemName}`, whatHappened: `المتاح ${item.availableQuantity} ${item.unit} والحد الأدنى ${item.minimumLevel}.`, evidence: { available: item.availableQuantity, minimum: item.minimumLevel }, businessImpact: `قد يؤثر على ${item.relatedProducts.join('، ') || 'المنتجات المرتبطة'}.`, recommendedAction: 'راجع المخزون والمشتريات يدويًا.', dateRange: range.label, branch: item.branchName });
    }
    const expenseNow = expensesCurrent.reduce((sum, row) => sum + Number(row.amount), 0);
    const expenseBefore = expensesPrevious.reduce((sum, row) => sum + Number(row.amount), 0);
    const expenseChange = percentageChange(expenseNow, expenseBefore);
    if (canReadFinance && expenseChange !== null && expenseChange >= 30 && expenseNow > 0) {
      alerts.push({ severity: 'MEDIUM', title: 'زيادة غير معتادة في المصروفات', whatHappened: `المصروفات زادت ${expenseChange}%.`, evidence: { current: roundMoney(expenseNow), previous: roundMoney(expenseBefore) }, businessImpact: 'قد تضغط على صافي الربح.', recommendedAction: 'راجع التصنيفات الأعلى زيادة.', dateRange: range.label, branch: scope.selectedBranchNames.join('، ') });
    }
    const unique = [...new Map(alerts.map((alert) => [`${alert.title}:${alert.branch}`, alert])).values()]
      .sort((a, b) => this.severityRank(String(a.severity)) - this.severityRank(String(b.severity)))
      .slice(0, 10);
    return this.result('getBusinessAlerts', { alerts: unique }, [...current.warnings, ...previous.warnings], current.truncated || previous.truncated || inventory.truncated);
  }

  async getAvailableDateRange(scope: OwnerCopilotScope, _range: OwnerResolvedDateRange): Promise<OwnerToolResult> {
    const where = { cafeId: scope.cafeId, branchId: { in: scope.selectedBranchIds } };
    const [firstOrder, lastOrder] = await Promise.all([
      this.prisma.unifiedOrder.findFirst({ where, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
      this.prisma.unifiedOrder.findFirst({ where, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
    ]);
    return this.result('getAvailableDateRange', {
      from: firstOrder?.createdAt ?? null,
      to: lastOrder?.createdAt ?? null,
    });
  }

  private async canonicalForRange(scope: OwnerCopilotScope, from: Date, to: Date) {
    const [loaded, expenses] = await Promise.all([
      this.loadOrderFacts(scope, from, to),
      this.loadExpenses(scope, from, to),
    ]);
    return {
      metrics: calculateCanonicalMetrics(loaded.facts, expenses.reduce((sum, expense) => sum + Number(expense.amount), 0)),
      warnings: loaded.warnings,
      truncated: loaded.truncated,
    };
  }

  private async salesForRange(scope: OwnerCopilotScope, from: Date, to: Date) {
    const loaded = await this.loadOrderFacts(scope, from, to);
    const metrics = calculateCanonicalMetrics(loaded.facts, 0);
    return {
      metrics: {
        grossSales: metrics.grossSales,
        netSales: metrics.netSales,
        revenue: metrics.revenue,
        validOrders: metrics.validOrders,
        cancelledOrders: metrics.cancelledOrders,
        totalRelevantOrders: metrics.totalRelevantOrders,
        averageOrderValue: metrics.averageOrderValue,
        cancellationRate: metrics.cancellationRate,
      },
      warnings: loaded.warnings,
      truncated: loaded.truncated,
    };
  }

  private async loadOrderFacts(scope: OwnerCopilotScope, from: Date, to: Date): Promise<{ facts: CanonicalOrderFact[]; warnings: string[]; truncated: boolean }> {
    if (!scope.selectedBranchIds.length) return { facts: [], warnings: ['لا توجد فروع مصرح بها في النطاق الحالي.'], truncated: false };
    const dateFilter = { gte: from, lte: to };
    const unifiedOrders = await this.prisma.unifiedOrder.findMany({
      where: { cafeId: scope.cafeId, branchId: { in: scope.selectedBranchIds }, createdAt: dateFilter },
      select: {
        id: true, branchId: true, status: true, paymentStatus: true, grandTotal: true,
        amountPaid: true, isRevenueConfirmed: true, createdAt: true, customerId: true,
        employeeId: true, driverId: true, deliveredAt: true, source: true,
        items: {
          select: {
            productId: true, quantity: true, unitPrice: true,
            product: { select: { name: true, category: true, cost: true, price: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: MAX_ORDER_FACTS + 1,
    });
    const facts: CanonicalOrderFact[] = unifiedOrders.slice(0, MAX_ORDER_FACTS).map((order) => ({
      id: order.id,
      source: (order.source === 'IN_CAFE' ? 'IN_CAFE' : 'DELIVERY') as 'DELIVERY' | 'IN_CAFE',
      branchId: order.branchId,
      status: order.status,
      paymentStatus: order.paymentStatus,
      total: Number(order.grandTotal),
      paid: order.paymentStatus === 'PAID',
      revenueConfirmed: order.isRevenueConfirmed,
      createdAt: order.createdAt,
      customerId: order.customerId,
      staffId: order.employeeId,
      driverId: order.driverId,
      paymentMethod: null,
      preparedAt: null,
      deliveredAt: order.deliveredAt,
      items: order.items.map((item) => ({
        productId: item.productId,
        productName: item.product.name,
        category: item.product.category,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        unitCost: Number(item.product.cost),
        catalogPrice: Number(item.product.price),
      })),
    }));
    const truncated = unifiedOrders.length > MAX_ORDER_FACTS;
    return {
      facts,
      warnings: truncated ? [`تم تحليل أول ${MAX_ORDER_FACTS} طلب كحد أمان.`] : [],
      truncated,
    };
  }

  private loadExpenses(scope: OwnerCopilotScope, from: Date, to: Date) {
    const ownerAllBranches = scope.role === 'OWNER' && scope.selectedBranchIds.length === scope.allowedBranchIds.length;
    return this.prisma.expense.findMany({
      where: {
        cafeId: scope.cafeId,
        expenseDate: { gte: from, lte: to },
        ...(ownerAllBranches ? {} : { branchId: { in: scope.selectedBranchIds } }),
      },
      select: { category: true, amount: true, branchId: true, expenseDate: true },
      take: MAX_ORDER_FACTS,
    });
  }

  private aggregateProducts(facts: CanonicalOrderFact[]) {
    const products = new Map<string, { productId: string; productName: string; category: string; currentPrice: number; quantity: number; revenue: number; cost: number }>();
    for (const fact of facts) {
      for (const item of fact.items) {
        const row = products.get(item.productId) || { productId: item.productId, productName: item.productName, category: item.category, currentPrice: item.catalogPrice, quantity: 0, revenue: 0, cost: 0 };
        row.currentPrice = item.catalogPrice;
        row.quantity += item.quantity;
        row.revenue += item.quantity * item.unitPrice;
        row.cost += item.quantity * item.unitCost;
        products.set(item.productId, row);
      }
    }
    return [...products.values()].map((row) => ({
      productId: row.productId,
      productName: row.productName,
      category: row.category,
      currentPrice: row.currentPrice,
      quantity: row.quantity,
      revenue: roundMoney(row.revenue),
      cost: roundMoney(row.cost),
      profit: roundMoney(row.revenue - row.cost),
      marginPercent: row.revenue ? roundRate((row.revenue - row.cost) / row.revenue * 100) : 0,
    }));
  }

  private groupMoney<T>(rows: T[], keyOf: (row: T) => string, amountOf: (row: T) => number) {
    const grouped = new Map<string, number>();
    for (const row of rows) grouped.set(keyOf(row), (grouped.get(keyOf(row)) || 0) + amountOf(row));
    return [...grouped.entries()].map(([name, amount]) => ({ name, amount: roundMoney(amount) })).sort((a, b) => b.amount - a.amount);
  }

  private previousPeriod(range: OwnerResolvedDateRange) {
    const duration = Math.max(1, range.to.getTime() - range.from.getTime() + 1);
    const to = new Date(range.from.getTime() - 1);
    return { from: new Date(to.getTime() - duration + 1), to, label: 'الفترة السابقة المماثلة' };
  }

  private severityRank(severity: string) {
    return ({ CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 } as Record<string, number>)[severity] ?? 4;
  }

  private result<T>(tool: OwnerCopilotToolName, data: T, warnings: string[] = [], truncated = false): OwnerToolResult<T> {
    return { tool, data, warnings: [...new Set(warnings)], truncated };
  }
}
