import { OwnerCopilotUnderstandingService } from '../owner-copilot/owner-copilot-understanding.service';

describe('Stage 5 Owner Copilot forecast intent routing', () => {
  const service = new OwnerCopilotUnderstandingService();
  const classify = (question: string) => service.classify(question, 'Africa/Cairo', new Date('2026-07-13T12:00:00Z'));

  it.each([
    ['توقع المبيعات بكرة', 'OWNER_SALES_FORECAST', 'getSalesForecast'],
    ['توقع عدد الطلبات الأسبوع الجاي', 'OWNER_ORDER_FORECAST', 'getOrderVolumeForecast'],
    ['توقع طلب المنتج ده', 'OWNER_PRODUCT_DEMAND_FORECAST', 'getProductDemandForecast'],
    ['توقع استهلاك المخزون', 'OWNER_INVENTORY_FORECAST', 'getIngredientConsumptionForecast'],
    ['المخزون هيخلص امتى؟', 'OWNER_STOCKOUT_RISK', 'getStockoutRisk'],
    ['توقع احتياج الموظفين بكرة', 'OWNER_STAFFING_ESTIMATE', 'getStaffingDemandEstimate'],
    ['توقع خطر الهدر', 'OWNER_WASTE_RISK', 'getWasteRiskEstimate'],
    ['لو عملت محاكاة خصم 10%', 'OWNER_OFFER_SIMULATION', 'simulateDiscount'],
    ['لو عملت محاكاة كومبو قهوة وكرواسون', 'OWNER_COMBO_SIMULATION', 'simulateCombo'],
    ['لو زودت سعر المنتج 5 جنيه', 'OWNER_PRICE_SIMULATION', 'simulatePriceChange'],
    ['قارن خصم 10% مع كومبو', 'OWNER_SCENARIO_COMPARISON', 'compareOfferScenarios'],
  ])('routes %s through an approved read-only tool', (question, intent, tool) => {
    const result = classify(question);
    expect(result.intent).toBe(intent);
    expect(result.writeActionRequested).toBe(false);
    expect(service.toolsForIntent(result.intent)).toContain(tool);
  });
});
