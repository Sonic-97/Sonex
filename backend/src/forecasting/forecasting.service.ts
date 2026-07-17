import { BadRequestException, ForbiddenException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OwnerCopilotUser } from '../owner-copilot/owner-copilot.types';
import { ForecastFeedbackDto, ForecastRequestDto, SimulationRequestDto } from './forecasting.dto';
import { ForecastingModelService, NumericObservation } from './forecasting-model.service';
import {
  FORECAST_MODEL_VERSION, ForecastConfidence, ForecastResult, ForecastScope, ForecastingMetrics,
  SIMULATION_NOTICE, SIMULATION_NOTICE_AR, SimulationResult, SimulationScenario,
} from './forecasting.types';

type OrderRow = {
  id: string; externalId?: string | null; code: string; branchId: string; createdAt: Date;
  total: unknown; status: string; paid?: boolean; isPaid?: boolean; isRevenueConfirmed: boolean;
  paymentStatus: string; source?: string; sourceType: string;
  items: Array<{ productId: string; quantity: number; unitPrice: unknown; product?: { name: string; category: string; active: boolean } }>;
};

const CACHE_TTL_MS = 15 * 60 * 1000;
const MAX_HISTORY_PER_TENANT = 100;
const DAY_MS = 86_400_000;

@Injectable()
export class ForecastingService {
  private readonly logger = new Logger(ForecastingService.name);
  private readonly cache = new Map<string, { expiresAt: number; value: ForecastResult }>();
  private readonly history = new Map<string, Array<ForecastResult | SimulationResult>>();
  private readonly feedback = new Map<string, string>();
  private totalLatency = 0;
  private readonly metrics: ForecastingMetrics = {
    forecastsGenerated: 0, eligibilityFailures: 0, simulationsRun: 0,
    negativeMarginWarnings: 0, permissionDenials: 0, crossTenantRejections: 0,
    toolFailures: 0, averageLatencyMs: 0,
    confidenceDistribution: { HIGH: 0, MEDIUM: 0, LOW: 0, INSUFFICIENT_DATA: 0 },
    typeDistribution: {},
  };

  constructor(private readonly prisma: PrismaService, private readonly models: ForecastingModelService) {}

  async resolveScope(user: OwnerCopilotUser | null | undefined, requestedBranchId?: string): Promise<ForecastScope> {
    if (!user?.id || !user.cafeId) throw new UnauthorizedException('Authenticated cafe context is required');
    if (user.role !== 'OWNER' && user.role !== 'MANAGER') throw new ForbiddenException('Owner or manager role is required');
    const branches = await this.prisma.branch.findMany({
      where: { cafeId: user.cafeId, active: true }, select: { id: true }, take: 100,
    });
    const tenantBranchIds = branches.map((branch) => branch.id);
    const allowedBranchIds = user.role === 'MANAGER'
      ? tenantBranchIds.filter((id) => id === user.branchId)
      : tenantBranchIds;
    if (!allowedBranchIds.length) throw new ForbiddenException('No authorized active branch');
    if (requestedBranchId && !allowedBranchIds.includes(requestedBranchId)) {
      this.metrics.permissionDenials += 1;
      this.metrics.crossTenantRejections += 1;
      throw new ForbiddenException('Branch is outside the authenticated cafe scope');
    }
    return {
      userId: user.id, role: user.role, cafeId: user.cafeId,
      allowedBranchIds, selectedBranchIds: requestedBranchId ? [requestedBranchId] : allowedBranchIds,
      timezone: 'Africa/Cairo', currency: 'EGP',
    };
  }

  async listEntities(scope: ForecastScope) {
    this.assertScope(scope);
    const [branches, products, inventory] = await Promise.all([
      this.prisma.branch.findMany({ where: { cafeId: scope.cafeId, id: { in: scope.allowedBranchIds }, active: true }, select: { id: true, name: true }, take: 100 }),
      this.prisma.product.findMany({ where: { cafeId: scope.cafeId, active: true, OR: [{ branchId: null }, { branchId: { in: scope.allowedBranchIds } }] }, select: { id: true, name: true, category: true, price: true, cost: true }, orderBy: { name: 'asc' }, take: 500 }),
      this.prisma.inventory.findMany({ where: { cafeId: scope.cafeId, branchId: { in: scope.allowedBranchIds } }, select: { id: true, itemName: true, unit: true, currentQty: true, reservedQty: true, branchId: true }, orderBy: { itemName: 'asc' }, take: 500 }),
    ]);
    return { branches, products: products.map((row) => ({ ...row, price: Number(row.price), cost: Number(row.cost) })), inventory, readOnly: true };
  }

  async forecast(scope: ForecastScope, request: ForecastRequestDto): Promise<ForecastResult> {
    const startedAt = Date.now();
    this.assertScope(scope);
    this.validateDates(request.from, request.to);
    if (request.branchId && !scope.allowedBranchIds.includes(request.branchId)) throw new ForbiddenException('Unauthorized branch');
    const selectedScope = { ...scope, selectedBranchIds: request.branchId ? [request.branchId] : scope.selectedBranchIds };
    const cacheKey = this.cacheKey(selectedScope, request);
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return this.clone(cached.value);

    let result: ForecastResult;
    try {
      if (request.type === 'HOURLY_ORDER_FORECAST') result = await this.hourlyForecast(selectedScope, request);
      else if (['STOCK_DEPLETION_ESTIMATE', 'STOCKOUT_RISK', 'WASTE_RISK_ESTIMATE'].includes(request.type)) result = await this.inventoryForecast(selectedScope, request);
      else if (request.type === 'INGREDIENT_CONSUMPTION_FORECAST') result = await this.ingredientForecast(selectedScope, request);
      else if (request.type === 'STAFFING_DEMAND_ESTIMATE') result = await this.staffingForecast(selectedScope, request);
      else if (request.type === 'CUSTOMER_RETURN_FORECAST') result = await this.customerReturnForecast(selectedScope, request);
      else result = await this.demandForecast(selectedScope, request);
    } catch (error) {
      this.metrics.toolFailures += 1;
      this.logger.error(JSON.stringify({ event: 'forecast_failed', cafeId: scope.cafeId, type: request.type, error: error instanceof Error ? error.message : 'unknown' }));
      throw error;
    }
    this.metrics.forecastsGenerated += 1;
    this.metrics.typeDistribution[request.type] = (this.metrics.typeDistribution[request.type] || 0) + 1;
    this.metrics.confidenceDistribution[result.confidence] += 1;
    if (!result.eligibility.eligible) this.metrics.eligibilityFailures += 1;
    this.observeLatency(startedAt);
    this.cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, value: this.clone(result) });
    this.store(scope.cafeId, result);
    return result;
  }

  async simulate(scope: ForecastScope, request: SimulationRequestDto): Promise<SimulationResult> {
    const startedAt = Date.now();
    this.assertScope(scope);
    this.validateDates(request.from, request.to);
    if (request.branchId && !scope.allowedBranchIds.includes(request.branchId)) throw new ForbiddenException('Unauthorized branch');
    const branchIds = request.branchId ? [request.branchId] : scope.selectedBranchIds;
    if (request.type === 'COMBO_IMPACT_SIMULATION' && request.productIds.length < 2) throw new BadRequestException('Combo requires at least two products');
    if (request.type === 'DISCOUNT_IMPACT_SIMULATION' && (!request.discountValue || request.discountValue <= 0 || request.discountValue >= 100)) throw new BadRequestException('Discount must be between 0 and 100');

    const products = await this.prisma.product.findMany({
      where: { cafeId: scope.cafeId, id: { in: [...new Set(request.productIds)] }, active: true },
      include: { recipe: { include: { inventory: true } }, packaging: { include: { inventory: true } }, priceChanges: { orderBy: { createdAt: 'desc' }, take: 20 } },
      take: 5,
    });
    if (products.length !== new Set(request.productIds).size) {
      this.metrics.crossTenantRejections += 1;
      throw new ForbiddenException('One or more products are inactive or outside this cafe');
    }
    const unavailable = await this.prisma.branchProduct.findMany({
      where: { cafeId: scope.cafeId, branchId: { in: branchIds }, productId: { in: request.productIds }, isAvailable: false }, select: { productId: true }, take: 20,
    });
    if (unavailable.length) throw new BadRequestException('One or more products are unavailable in the selected branch');

    const since = new Date(Date.now() - 28 * DAY_MS);
    const orders = await this.loadOrders(scope, branchIds, since);
    const baselineUnits = Math.max(1, this.productUnits(orders, request.productIds) / 28);
    const currentPrice = this.round(products.reduce((sum, product) => sum + Number(product.price), 0));
    const productCost = this.round(products.reduce((sum, product) => sum + Number(product.cost), 0));
    let proposedPrice = currentPrice;
    if (request.type === 'DISCOUNT_IMPACT_SIMULATION') proposedPrice = this.round(currentPrice * (1 - Number(request.discountValue) / 100));
    if (request.type === 'COMBO_IMPACT_SIMULATION' || request.type === 'PRICE_CHANGE_SIMULATION') {
      if (!request.proposedPrice || request.proposedPrice <= 0) throw new BadRequestException('A valid proposed price is required');
      proposedPrice = this.round(request.proposedPrice);
    }
    const currentUnitMargin = this.round(currentPrice - productCost);
    const proposedUnitMargin = this.round(proposedPrice - productCost);
    const breakEvenUnits = proposedUnitMargin > 0 ? Math.ceil((currentUnitMargin * baselineUnits) / proposedUnitMargin) : null;
    const breakEvenUpliftPercent = breakEvenUnits === null ? null : this.round((breakEvenUnits / baselineUnits - 1) * 100);
    const maxRedemptions = request.maxRedemptions || Math.ceil(baselineUnits * 14);
    const totalExposure = this.round(Math.max(0, currentPrice - proposedPrice) * maxRedemptions);
    const priceVariation = products.reduce((sum, product) => sum + (product.priceChanges?.length || 0), 0);
    const upliftFactors = priceVariation >= 3 ? [0.02, 0.08, 0.15] : [0, 0.05, 0.12];
    const scenarioNames: SimulationScenario['name'][] = ['CONSERVATIVE', 'EXPECTED', 'OPTIMISTIC'];
    const scenarios = scenarioNames.map((name, index) => this.simulationScenario(name, baselineUnits, upliftFactors[index], proposedPrice, productCost));
    const inventoryRequirement = this.inventoryRequirements(products, scenarios[2].expectedUnits);
    const warnings = [
      ...(priceVariation < 3 ? ['لا توجد تغييرات سعرية تاريخية كافية لقياس مرونة الطلب بدقة؛ تم استخدام ثلاثة سيناريوهات محافظة.'] : []),
      'تأثير إحلال العرض محل مبيعات كاملة السعر غير مؤكد، ولا تُحسب كل مبيعة مخفضة كنمو إضافي.',
      ...(proposedUnitMargin < 0 ? ['السعر المقترح أقل من التكلفة ويولد هامشًا سلبيًا.'] : []),
      ...(breakEvenUpliftPercent !== null && breakEvenUpliftPercent > 50 ? ['الزيادة المطلوبة للحفاظ على الربح الحالي مرتفعة وقد لا تكون واقعية.'] : []),
      ...inventoryRequirement.filter((row) => row.quantity > row.available).map((row) => `المخزون الحالي من ${row.name} لا يغطي السيناريو المتفائل.`),
      ...products.flatMap((product) => product.packaging?.length ? [] : [`بيانات مواد التعبئة غير مكتملة للمنتج ${product.name}.`]),
    ];
    if (proposedUnitMargin < 0) this.metrics.negativeMarginWarnings += 1;
    const result: SimulationResult = {
      id: this.id('sim'), type: request.type, generatedAt: new Date().toISOString(), modelVersion: FORECAST_MODEL_VERSION,
      productIds: products.map((row) => row.id), productNames: products.map((row) => row.name),
      currentPrice, proposedPrice, productCost, currentUnitMargin, proposedUnitMargin,
      marginReduction: this.round(currentUnitMargin - proposedUnitMargin), breakEvenUnits, breakEvenUpliftPercent,
      totalExposure, customerSaving: this.round(Math.max(0, currentPrice - proposedPrice)), inventoryRequirement,
      scenarios, confidence: priceVariation >= 3 && orders.length >= 84 ? 'MEDIUM' : 'LOW',
      assumptions: ['الطلب الأساسي هو متوسط الوحدات المباعة في آخر 28 يومًا.', 'لم يتم افتراض أن كل الطلب الإضافي جديد بالكامل.', 'الأسعار والتكاليف الحالية هي القيم المسجلة وقت تشغيل المحاكاة.'],
      warnings, cannibalizationRisk: 'UNCERTAIN',
      preparationImpact: scenarios[2].expectedUnits > baselineUnits * 1.2 ? 'يجب مراجعة قدرة التحضير وساعات الذروة قبل التنفيذ.' : 'لا يظهر ضغط كبير، مع بقاء التحقق التشغيلي مطلوبًا.',
      customerValueAssessment: proposedPrice < currentPrice ? 'قيمة أوضح للعميل مقابل انخفاض الهامش.' : 'هامش أعلى مع خطر حساسية السعر.',
      notice: SIMULATION_NOTICE, noticeArabic: SIMULATION_NOTICE_AR, readOnly: true, noChangesApplied: true,
    };
    this.metrics.simulationsRun += 1;
    this.metrics.typeDistribution[request.type] = (this.metrics.typeDistribution[request.type] || 0) + 1;
    this.observeLatency(startedAt); this.store(scope.cafeId, result);
    this.logger.log(JSON.stringify({ event: 'simulation_completed', cafeId: scope.cafeId, type: request.type, readOnly: true }));
    return result;
  }

  async compareScenarios(scope: ForecastScope, requests: SimulationRequestDto[]) {
    if (!Array.isArray(requests) || requests.length < 2 || requests.length > 4) throw new BadRequestException('Compare between two and four scenarios');
    const results = [];
    for (const request of requests) results.push(await this.simulate(scope, request));
    return { scenarios: results, notice: SIMULATION_NOTICE, noticeArabic: SIMULATION_NOTICE_AR, readOnly: true, noChangesApplied: true };
  }

  recordFeedback(scope: ForecastScope, dto: ForecastFeedbackDto) {
    this.assertScope(scope);
    const exists = (this.history.get(scope.cafeId) || []).some((row) => row.id === dto.resultId);
    if (!exists) throw new BadRequestException('Forecast result not found in this cafe session');
    this.feedback.set(`${scope.cafeId}:${dto.resultId}`, dto.feedback);
    return { accepted: true, persisted: false, modelChanged: false, readOnly: true };
  }

  getAccuracy(scope: ForecastScope) {
    this.assertScope(scope);
    const runs = (this.history.get(scope.cafeId) || []).filter((row): row is ForecastResult => 'backtest' in row);
    return { modelVersion: FORECAST_MODEL_VERSION, forecasts: runs.map((row) => ({ id: row.id, type: row.type, generatedAt: row.generatedAt, confidence: row.confidence, backtest: row.backtest })).slice(-50), readOnly: true };
  }
  getMetrics() { return this.clone(this.metrics); }
  getTenantHistory(cafeId: string) { return this.clone(this.history.get(cafeId) || []); }

  private async demandForecast(scope: ForecastScope, request: ForecastRequestDto): Promise<ForecastResult> {
    const historyFrom = new Date(Date.now() - 140 * DAY_MS);
    const orders = await this.loadOrders(scope, scope.selectedBranchIds, historyFrom);
    let entity = { id: undefined as string | undefined, name: 'كل الفروع' };
    let unit = request.type === 'DAILY_SALES_FORECAST' ? scope.currency : 'طلب';
    let requiredDays = 28;
    let observations = this.dailySeries(orders, request.type === 'DAILY_SALES_FORECAST' ? 'sales' : 'orders');
    if (request.type === 'PRODUCT_DEMAND_FORECAST' || request.type === 'CATEGORY_DEMAND_FORECAST') {
      if (!request.entityId) throw new BadRequestException('Product or category is required');
      requiredDays = 30; unit = 'وحدة';
      if (request.type === 'PRODUCT_DEMAND_FORECAST') {
        const product = await this.prisma.product.findFirst({ where: { id: request.entityId, cafeId: scope.cafeId, active: true }, select: { id: true, name: true } });
        if (!product) throw new ForbiddenException('Product is inactive or outside this cafe');
        entity = product;
        observations = this.dailyProductSeries(orders, (item) => item.productId === product.id);
      } else {
        entity = { id: request.entityId, name: request.entityId };
        observations = this.dailyProductSeries(orders, (item) => item.product?.category === request.entityId);
      }
    }
    if (request.type === 'BRANCH_DEMAND_FORECAST' && request.entityId) {
      if (!scope.allowedBranchIds.includes(request.entityId)) throw new ForbiddenException('Unauthorized branch');
      observations = this.dailySeries(orders.filter((row) => row.branchId === request.entityId), 'orders');
      entity = { id: request.entityId, name: 'الفرع المحدد' };
    }
    return this.buildForecast(request, scope, entity, observations, requiredDays, unit);
  }

  private async hourlyForecast(scope: ForecastScope, request: ForecastRequestDto): Promise<ForecastResult> {
    const orders = await this.loadOrders(scope, scope.selectedBranchIds, new Date(Date.now() - 70 * DAY_MS));
    const activeDays = new Set(orders.map((row) => this.localDate(row.createdAt, scope.timezone))).size;
    const hourly = new Map<number, number[]>();
    const byDayHour = new Map<string, number>();
    orders.forEach((row) => { const hour = this.localHour(row.createdAt, scope.timezone); const key = `${this.localDate(row.createdAt, scope.timezone)}:${hour}`; byDayHour.set(key, (byDayHour.get(key) || 0) + 1); });
    byDayHour.forEach((value, key) => { const hour = Number(key.split(':')[1]); hourly.set(hour, [...(hourly.get(hour) || []), value]); });
    const eligible = activeDays >= 42 && orders.length >= 100;
    const now = new Date(); const target = new Date(now.getTime() + DAY_MS);
    const points = [...hourly.entries()].sort((a, b) => a[0] - b[0]).map(([hour, values]) => ({
      timestamp: `${this.localDate(target, scope.timezone)}T${String(hour).padStart(2, '0')}:00:00`,
      value: this.round(values.reduce((a, b) => a + b, 0) / values.length),
    }));
    const expected = eligible ? this.round(points.reduce((sum, row) => sum + row.value, 0)) : null;
    const warnings = ['ساعات عمل الفرع غير مسجلة؛ ساعات التشغيل مستنتجة من وجود الطلبات وليست جدولًا رسميًا.'];
    if (!eligible) warnings.unshift('التوقع بالساعة يحتاج 6 أسابيع تشغيل و100 طلب صالح على الأقل.');
    return this.manualForecast(request.type, scope, { name: 'الطلب بالساعة' }, activeDays, orders.length, 42, expected, expected === null ? null : this.round(expected * 0.75), expected === null ? null : this.round(expected * 1.25), 'طلب', points, eligible ? 'SAME_HOUR_AVERAGE' : 'INSUFFICIENT_DATA', eligible ? 'LOW' : 'INSUFFICIENT_DATA', warnings);
  }

  private async inventoryForecast(scope: ForecastScope, request: ForecastRequestDto): Promise<ForecastResult> {
    if (!request.entityId) throw new BadRequestException('Inventory item is required');
    const inventory = await this.prisma.inventory.findFirst({ where: { id: request.entityId, cafeId: scope.cafeId, branchId: { in: scope.selectedBranchIds } }, select: { id: true, itemName: true, unit: true, currentQty: true, reservedQty: true } });
    if (!inventory) throw new ForbiddenException('Inventory item is outside this cafe or branch');
    const rows = await this.prisma.inventoryConsumption.findMany({ where: { cafeId: scope.cafeId, inventoryId: inventory.id, createdAt: { gte: new Date(Date.now() - 90 * DAY_MS) } }, select: { quantity: true, createdAt: true }, orderBy: { createdAt: 'asc' }, take: 10000 });
    const daily = this.groupNumeric(rows.map((row) => ({ timestamp: this.localDate(row.createdAt, scope.timezone), value: Number(row.quantity) })));
    const days = daily.length; const eligible = days >= 28 && rows.length >= 20;
    const avg = days ? daily.slice(-28).reduce((sum, row) => sum + row.value, 0) / Math.min(28, days) : 0;
    const available = Math.max(0, Number(inventory.currentQty) - Number(inventory.reservedQty));
    const depletionDays = avg > 0 ? available / avg : null;
    const expected = eligible ? (request.type === 'WASTE_RISK_ESTIMATE' ? Math.max(0, available - avg * 30) : depletionDays) : null;
    const warnings = [
      ...(eligible ? [] : ['سجل الاستهلاك غير كافٍ لتقدير موثوق.']),
      ...(request.type === 'WASTE_RISK_ESTIMATE' ? ['لا توجد تواريخ صلاحية في المخزون؛ خطر الهدر مبني على بطء الاستهلاك فقط.'] : []),
      ...(available <= Number(inventory.currentQty) * 0.25 ? ['الكمية المتاحة بعد الحجز منخفضة.'] : []),
    ];
    return this.manualForecast(request.type, scope, { id: inventory.id, name: inventory.itemName }, days, rows.length, 28, expected === null ? null : this.round(expected), expected === null ? null : this.round(Math.max(0, expected * 0.75)), expected === null ? null : this.round(expected * 1.35), request.type === 'WASTE_RISK_ESTIMATE' ? inventory.unit : 'يوم', daily, eligible ? 'RECENT_CONSUMPTION_AVERAGE' : 'INSUFFICIENT_DATA', eligible ? (days >= 56 ? 'MEDIUM' : 'LOW') : 'INSUFFICIENT_DATA', warnings);
  }

  private async ingredientForecast(scope: ForecastScope, request: ForecastRequestDto): Promise<ForecastResult> {
    if (!request.entityId) throw new BadRequestException('Product is required');
    const product = await this.prisma.product.findFirst({ where: { id: request.entityId, cafeId: scope.cafeId, active: true }, include: { recipe: { include: { inventory: true } } } });
    if (!product) throw new ForbiddenException('Product is outside this cafe');
    const demand = await this.demandForecast(scope, { ...request, type: 'PRODUCT_DEMAND_FORECAST' });
    const components = (product.recipe || []).map((row) => {
      const factor = Number(row.quantity) * (1 + Number(row.wastePercent) / 100);
      const convert = (units: number | null) => {
        if (units === null) return 0;
        const raw = factor * units;
        return this.models.convertUnit(raw, row.unit, row.inventory.unit) ?? this.round(raw);
      };
      return { inventoryId: row.inventory.id, name: row.inventory.itemName, expected: convert(demand.expected), lower: convert(demand.lower), upper: convert(demand.upper), unit: row.inventory.unit };
    });
    const warnings = components.length ? [...demand.warnings] : ['المنتج لا يحتوي على وصفة مسجلة، لذلك لا يمكن حساب استهلاك المكونات.'];
    return { ...demand, id: this.id('fc'), type: request.type, entity: { id: product.id, name: product.name }, expected: demand.expected, lower: demand.lower, upper: demand.upper, unit: 'وحدة منتج', components, warnings };
  }

  private async staffingForecast(scope: ForecastScope, request: ForecastRequestDto): Promise<ForecastResult> {
    const hourly = await this.hourlyForecast(scope, { ...request, type: 'HOURLY_ORDER_FORECAST' });
    const performance = await this.prisma.staffPerformance.findMany({ where: { cafeId: scope.cafeId, branchId: { in: scope.selectedBranchIds }, date: { gte: new Date(Date.now() - 60 * DAY_MS) } }, select: { ordersHandled: true }, take: 5000 });
    const productivity = performance.length ? performance.reduce((sum, row) => sum + row.ordersHandled, 0) / performance.length : 20;
    const peak = hourly.prediction.reduce((max, row) => Math.max(max, row.value), 0);
    const expected = hourly.eligibility.eligible ? Math.max(1, Math.ceil(peak / Math.max(1, productivity / 8))) : null;
    return { ...hourly, id: this.id('fc'), type: request.type, entity: { name: 'احتياج الموظفين وقت الذروة' }, expected, lower: expected === null ? null : Math.max(1, expected - 1), upper: expected === null ? null : expected + 1, unit: 'موظف', confidence: performance.length >= 30 && hourly.eligibility.eligible ? 'LOW' : 'INSUFFICIENT_DATA', warnings: [...hourly.warnings, 'التقدير لا يعدّل جداول الموظفين ويجب مراجعته تشغيليًا.'] };
  }

  private async customerReturnForecast(scope: ForecastScope, request: ForecastRequestDto): Promise<ForecastResult> {
    const customers = await this.prisma.customer.findMany({ where: { cafeId: scope.cafeId, branchId: { in: scope.selectedBranchIds }, totalOrders: { gt: 0 } }, select: { totalOrders: true, lastOrderDate: true }, take: 10000 });
    const recent = customers.filter((row) => row.lastOrderDate && row.lastOrderDate >= new Date(Date.now() - 30 * DAY_MS));
    const eligible = customers.length >= 50;
    const rate = customers.length ? recent.length / customers.length * 100 : 0;
    return this.manualForecast(request.type, scope, { name: 'عودة العملاء' }, recent.length, customers.length, 50, eligible ? this.round(rate) : null, eligible ? this.round(Math.max(0, rate - 10)) : null, eligible ? this.round(Math.min(100, rate + 10)) : null, '%', [], eligible ? 'RECENT_RETURN_RATE' : 'INSUFFICIENT_DATA', eligible ? 'LOW' : 'INSUFFICIENT_DATA', ['مؤشر تقريبي مجمع؛ لا يستهدف أو يكشف بيانات عميل فردي.']);
  }

  private buildForecast(request: ForecastRequestDto, scope: ForecastScope, entity: { id?: string; name: string }, observations: NumericObservation[], requiredDays: number, unit: string): ForecastResult {
    const horizon = request.horizonDays || 1;
    const eligible = observations.length >= requiredDays && observations.filter((row) => row.value > 0).length >= Math.min(20, requiredDays);
    const eligibility = { eligible, validOperatingDays: observations.length, observations: observations.length, requiredOperatingDays: requiredDays, reason: eligible ? null : `يلزم ${requiredDays} يوم تشغيل صالح وبيانات طلب فعلية كافية.` };
    if (!eligible) return this.manualForecast(request.type, scope, entity, observations.length, observations.length, requiredDays, null, null, null, unit, [], 'INSUFFICIENT_DATA', 'INSUFFICIENT_DATA', [eligibility.reason!, 'الأيام بلا طلبات لا تعامل تلقائيًا كأيام تشغيل بصفر مبيعات.'], observations);
    const selection = this.models.select(observations, horizon);
    const targetStart = request.from ? new Date(`${request.from}T00:00:00Z`) : new Date(Date.now() + DAY_MS);
    const prediction = selection.predictions.map((value, index) => ({ timestamp: new Date(targetStart.getTime() + index * DAY_MS).toISOString(), value }));
    const completeness = Math.min(1, observations.length / Math.max(requiredDays, 84));
    const confidence = this.models.confidence(observations.length, completeness, selection.backtest, true);
    return {
      id: this.id('fc'), type: request.type, entity,
      period: { from: prediction[0].timestamp, to: prediction[prediction.length - 1].timestamp },
      historicalPeriod: { from: observations[0]?.timestamp || null, to: observations[observations.length - 1]?.timestamp || null },
      generatedAt: new Date().toISOString(), modelVersion: FORECAST_MODEL_VERSION,
      method: selection.method, baselineMethod: selection.baselineMethod, selectedAgainstBaseline: selection.selectedAgainstBaseline,
      expected: this.round(selection.predictions.reduce((a, b) => a + b, 0)), lower: this.round(selection.lower.reduce((a, b) => a + b, 0)), upper: this.round(selection.upper.reduce((a, b) => a + b, 0)),
      unit, currency: scope.currency, confidence, eligibility,
      assumptions: ['استمرار نمط التشغيل المعتاد وعدم وجود حدث استثنائي غير مسجل.', 'تمت مقارنة النموذج المرشح مع baseline على نافذة rolling backtest.'],
      warnings: ['التوقع نطاق احتمالي وليس ضمانًا.', 'أيام الإغلاق ونفاد المخزون غير موثقة بالكامل؛ القيم الشاذة أبقيت ولم تُحذف بصمت.'],
      historical: observations.slice(-42), prediction, backtest: selection.backtest, readOnly: true, noChangesApplied: true,
    };
  }

  private manualForecast(type: ForecastRequestDto['type'], scope: ForecastScope, entity: { id?: string; name: string }, days: number, observations: number, required: number, expected: number | null, lower: number | null, upper: number | null, unit: string, prediction: NumericObservation[], method: string, confidence: ForecastConfidence, warnings: string[], historical: NumericObservation[] = []): ForecastResult {
    const now = new Date();
    return {
      id: this.id('fc'), type, entity, period: { from: now.toISOString(), to: new Date(now.getTime() + DAY_MS).toISOString() },
      historicalPeriod: { from: historical[0]?.timestamp || null, to: historical[historical.length - 1]?.timestamp || null }, generatedAt: now.toISOString(), modelVersion: FORECAST_MODEL_VERSION,
      method, baselineMethod: method === 'INSUFFICIENT_DATA' ? 'NONE' : method, selectedAgainstBaseline: false,
      expected, lower, upper, unit, currency: scope.currency, confidence,
      eligibility: { eligible: confidence !== 'INSUFFICIENT_DATA', validOperatingDays: days, observations, requiredOperatingDays: required, reason: confidence === 'INSUFFICIENT_DATA' ? warnings[0] : null },
      assumptions: ['استمرار نمط التشغيل الحالي وعدم وجود حدث خارجي غير مسجل.'], warnings: ['التوقع نطاق احتمالي وليس ضمانًا.', ...warnings], historical: historical.slice(-42), prediction, backtest: null, readOnly: true, noChangesApplied: true,
    };
  }

  private async loadOrders(scope: ForecastScope, branchIds: string[], from: Date): Promise<OrderRow[]> {
    const [delivery, inCafe] = await Promise.all([
      this.prisma.order.findMany({ where: { cafeId: scope.cafeId, branchId: { in: branchIds }, createdAt: { gte: from } }, select: { id: true, externalId: true, code: true, branchId: true, createdAt: true, total: true, status: true, paid: true, isRevenueConfirmed: true, paymentStatus: true, source: true, sourceType: true, items: { select: { productId: true, quantity: true, unitPrice: true, product: { select: { name: true, category: true, active: true } } } } }, orderBy: { createdAt: 'asc' }, take: 50000 }),
      this.prisma.inCafeOrder.findMany({ where: { cafeId: scope.cafeId, branchId: { in: branchIds }, createdAt: { gte: from } }, select: { id: true, code: true, branchId: true, createdAt: true, total: true, status: true, isPaid: true, isRevenueConfirmed: true, paymentStatus: true, sourceType: true, items: { select: { productId: true, quantity: true, unitPrice: true, product: { select: { name: true, category: true, active: true } } } } }, orderBy: { createdAt: 'asc' }, take: 50000 }),
    ]);
    const seen = new Set<string>();
    const today = this.localDate(new Date(), scope.timezone);
    return [...delivery, ...inCafe].filter((row: any) => {
      const test = /test/i.test(`${row.code} ${row.source || ''} ${row.sourceType || ''}`);
      const cancelled = ['CANCELLED', 'CANCELED', 'VOID', 'REJECTED'].includes(String(row.status).toUpperCase());
      const paid = row.paid === true || row.isPaid === true || row.isRevenueConfirmed === true || ['PAID', 'PARTIALLY_PAID', 'PARTIAL'].includes(String(row.paymentStatus).toUpperCase());
      const duplicateKey = row.externalId ? `ext:${row.externalId}` : `id:${row.id}`;
      const duplicate = seen.has(duplicateKey); seen.add(duplicateKey);
      const partialToday = this.localDate(row.createdAt, scope.timezone) === today;
      return !test && !cancelled && paid && !duplicate && !partialToday;
    }) as OrderRow[];
  }

  private dailySeries(orders: OrderRow[], metric: 'sales' | 'orders') {
    return this.groupNumeric(orders.map((row) => ({ timestamp: this.localDate(row.createdAt, 'Africa/Cairo'), value: metric === 'sales' ? Number(row.total) : 1 })));
  }
  private dailyProductSeries(orders: OrderRow[], predicate: (item: OrderRow['items'][number]) => boolean) {
    return this.groupNumeric(orders.flatMap((row) => row.items.filter((item) => item.product?.active !== false && predicate(item)).map((item) => ({ timestamp: this.localDate(row.createdAt, 'Africa/Cairo'), value: item.quantity }))));
  }
  private groupNumeric(rows: NumericObservation[]) {
    const map = new Map<string, number>(); rows.forEach((row) => map.set(row.timestamp, (map.get(row.timestamp) || 0) + row.value));
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([timestamp, value]) => ({ timestamp, value: this.round(value) }));
  }
  private productUnits(orders: OrderRow[], ids: string[]) { const set = new Set(ids); return orders.reduce((sum, row) => sum + row.items.filter((item) => set.has(item.productId)).reduce((a, item) => a + item.quantity, 0), 0); }
  private inventoryRequirements(products: any[], units: number) {
    const map = new Map<string, { inventoryId: string; name: string; quantity: number; unit: string; available: number }>();
    products.forEach((product) => [...(product.recipe || []), ...(product.packaging || [])].forEach((row: any) => {
      const inventory = row.inventory; const converted = this.models.convertUnit(Number(row.quantity) * units, row.unit, inventory.unit);
      const quantity = converted === null ? Number(row.quantity) * units : converted;
      const current = map.get(inventory.id) || { inventoryId: inventory.id, name: inventory.itemName, quantity: 0, unit: inventory.unit, available: Math.max(0, Number(inventory.currentQty) - Number(inventory.reservedQty)) };
      current.quantity = this.round(current.quantity + quantity); map.set(inventory.id, current);
    }));
    return [...map.values()];
  }
  private simulationScenario(name: SimulationScenario['name'], baselineUnits: number, uplift: number, price: number, cost: number): SimulationScenario {
    const expectedUnits = this.round(baselineUnits * (1 + uplift)); const revenue = this.round(expectedUnits * price); const profit = this.round(expectedUnits * (price - cost));
    return { name, expectedUnits, expectedRevenue: revenue, expectedGrossProfit: profit, marginPercent: price ? this.round((price - cost) / price * 100) : 0, operationalRisk: uplift >= 0.12 ? 'MEDIUM' : 'LOW' };
  }
  private assertScope(scope: ForecastScope) { if (!scope?.cafeId || !scope.allowedBranchIds?.length || scope.selectedBranchIds.some((id) => !scope.allowedBranchIds.includes(id))) throw new ForbiddenException('Invalid tenant or branch scope'); }
  private validateDates(from?: string, to?: string) { const pattern = /^\d{4}-\d{2}-\d{2}$/; if ((from && !pattern.test(from)) || (to && !pattern.test(to))) throw new BadRequestException('Dates must use YYYY-MM-DD'); if (from && to && from > to) throw new BadRequestException('From date must be before to date'); }
  private cacheKey(scope: ForecastScope, request: ForecastRequestDto) { return [scope.cafeId, [...scope.selectedBranchIds].sort().join(','), request.type, request.entityId || '-', request.from || '-', request.to || '-', request.horizonDays || 1].join(':'); }
  private store(cafeId: string, result: ForecastResult | SimulationResult) { const rows = [...(this.history.get(cafeId) || []), this.clone(result)]; this.history.set(cafeId, rows.slice(-MAX_HISTORY_PER_TENANT)); }
  private observeLatency(startedAt: number) { this.totalLatency += Date.now() - startedAt; const count = this.metrics.forecastsGenerated + this.metrics.simulationsRun; this.metrics.averageLatencyMs = count ? this.round(this.totalLatency / count) : 0; }
  private localDate(date: Date, timezone: string) { const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date); const get = (type: string) => parts.find((part) => part.type === type)?.value || ''; return `${get('year')}-${get('month')}-${get('day')}`; }
  private localHour(date: Date, timezone: string) { return Number(new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: '2-digit', hour12: false }).format(date).replace('24', '0')); }
  private id(prefix: string) { return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }
  private round(value: number) { return Math.round((Number(value) + Number.EPSILON) * 100) / 100; }
  private clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)); }
}
