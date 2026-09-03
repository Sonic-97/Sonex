import { DateRange, Money, Quantity, instant, tenantId } from '../shared-kernel';
import { productId } from '../catalog-domain';
import { DiscountPolicy, PriceBook, PriceRule, PricingContext, Promotion, ServiceChargePolicy, TaxPolicy } from './pricing.types';
import { PricingEngine, PricingResolver } from './pricing.service';
import { priceBookId, priceRuleId, promotionId, discountPolicyId, taxPolicyId, serviceChargePolicyId } from './pricing.contracts';
import { DiscountRate, Price, PricingRate, Priority, PromotionWindow, RoundingPolicy, TaxRate } from './pricing.value-objects';
import { PricingConflictError } from './pricing.errors';

describe('Pricing Domain', () => {
  const at = instant('2026-07-30T10:00:00.000Z'); const tenant = tenantId('tenant-1'); const product = productId('product-1');
  const book = (price = '10.00') => { const value = PriceBook.create(tenant, priceBookId('book-1'), 'EGP', at); value.addRule(PriceRule.create(tenant, priceRuleId('rule-1'), product, Price.from(Money.from(price, 'EGP')), Priority.from(1)), at); value.publish(at); return value; };
  const request = (overrides: Partial<Parameters<PricingEngine['calculate']>[0]> = {}) => ({ productId: product, quantity: Quantity.from('2', 'each'), context: PricingContext.create({ tenantId: tenant, productId: product }, 'EGP', at), priceBook: book(), promotions: [], taxes: [], serviceCharges: [], rounding: RoundingPolicy.create(), ...overrides });

  it('resolves a deterministic price from product identity and a published price book', () => {
    const engine = new PricingEngine(); const first = engine.calculate(request()); const second = engine.calculate(request());
    expect(first.total.serialize()).toEqual({ amount: '20.00', currency: 'EGP' }); expect(second).toEqual(first); expect(first.trace).toEqual(['PRICE_RULE:rule-1']);
  });
  it('applies active promotions by priority and stops after an exclusive policy', () => {
    const policy = DiscountPolicy.create(tenant, discountPolicyId('discount-1'), DiscountRate.fromBasisPoints(1000n), Priority.from(1), true);
    const promotion = Promotion.create(tenant, promotionId('promotion-1'), policy, PromotionWindow.from(DateRange.from(at, instant('2026-07-31T10:00:00.000Z'))), { tenantId: tenant, productId: product }); promotion.activate(at);
    const result = new PricingEngine().calculate(request({ promotions: [promotion] })); expect(result.total.serialize()).toEqual({ amount: '18.00', currency: 'EGP' }); expect(result.discounts).toHaveLength(1);
  });
  it('calculates service charges and exclusive taxes without floating point arithmetic', () => {
    const charge = ServiceChargePolicy.create(tenant, serviceChargePolicyId('service-1'), PricingRate.fromBasisPoints(1000n), Priority.from(1));
    const tax = TaxPolicy.create(tenant, taxPolicyId('vat-1'), TaxRate.fromBasisPoints(500n), false);
    const result = new PricingEngine().calculate(request({ serviceCharges: [charge], taxes: [tax] })); expect(result.total.serialize()).toEqual({ amount: '23.10', currency: 'EGP' }); expect(result.serviceCharges).toHaveLength(1); expect(result.taxes).toHaveLength(1);
  });
  it('rejects ambiguous effective price rules', () => {
    const value = book(); value.addRule(PriceRule.create(tenant, priceRuleId('rule-2'), product, Price.from(Money.from('11.00', 'EGP')), Priority.from(1)), at);
    expect(() => new PricingResolver().resolve(value, PricingContext.create({ tenantId: tenant, productId: product }, 'EGP', at))).toThrow(PricingConflictError);
  });
  it('publishes deterministic domain events for price book lifecycle', () => {
    const value = book(); value.archive(at); expect(value.pullDomainEvents().map((event) => event.name)).toEqual(['PriceBookCreated', 'PricingRuleChanged', 'PriceBookPublished', 'PriceBookArchived']);
  });
});
