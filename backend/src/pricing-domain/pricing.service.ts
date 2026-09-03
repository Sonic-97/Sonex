import { Currency, Money } from '../shared-kernel';
import { CurrencyMismatchError, InvalidQuantityError, PriceNotFoundError, PricingConflictError } from './pricing.errors';
import { PreciseMoney } from './pricing.math';
import { type AppliedPolicy, type PriceBook, type PricingContext, type PricingRequest, type Promotion, type ResolvedPrice, type ServiceChargePolicy, type TaxPolicy } from './pricing.types';
import { PricingRate } from './pricing.value-objects';

const ordered = <T extends { readonly id: string; readonly priority?: { readonly value: number } }>(items: readonly T[]): readonly T[] => Object.freeze([...items].sort((left, right) => (left.priority?.value ?? 0) - (right.priority?.value ?? 0) || left.id.localeCompare(right.id)));
const quantity = (value: PricingRequest['quantity']): bigint => { const serialized = value.serialize(); if (serialized.unit !== 'each' || !/^[1-9]\d*$/.test(serialized.value)) throw new InvalidQuantityError(); return BigInt(serialized.value); };
const money = (value: PreciseMoney, currency: Currency, strategy: PricingRequest['rounding']['strategy']): Money => value.toMoney(strategy);

export class PricingResolver {
  resolve(book: PriceBook, context: PricingContext): import('./pricing.types').PriceRule {
    if (book.status !== 'PUBLISHED' || book.tenantId !== context.scope.tenantId || book.currency !== context.currency) throw new PriceNotFoundError();
    const candidates = ordered(book.priceRules.filter((rule) => rule.applies(context)));
    if (candidates.length === 0) throw new PriceNotFoundError();
    if (candidates.length > 1 && candidates[0].priority.value === candidates[1].priority.value) throw new PricingConflictError('Multiple effective price rules share the same priority');
    return candidates[0];
  }
}
export class PromotionResolver { resolve(promotions: readonly Promotion[], context: PricingContext): readonly Promotion[] { return ordered(promotions.filter((promotion) => promotion.applies(context))); } }
export class DiscountResolver { apply(base: PreciseMoney, promotions: readonly Promotion[]): { readonly total: PreciseMoney; readonly applied: readonly { readonly promotion: Promotion; readonly amount: PreciseMoney }[] } { let remaining = base; const applied: { promotion: Promotion; amount: PreciseMoney }[] = []; for (const promotion of promotions) { const amount = remaining.apply(PricingRate.fromBasisPoints(promotion.discount.rate.basisPoints)); remaining = remaining.subtract(amount); applied.push({ promotion, amount }); if (promotion.discount.exclusive) break; } return { total: remaining, applied: Object.freeze(applied) }; } }
export class TaxResolver { apply(base: PreciseMoney, taxes: readonly TaxPolicy[]): readonly { readonly policy: TaxPolicy; readonly amount: PreciseMoney }[] { return Object.freeze(taxes.map((policy) => ({ policy, amount: base.apply(PricingRate.fromBasisPoints(policy.rate.basisPoints)) }))); } }
export class PricingEngine {
  constructor(private readonly pricingResolver = new PricingResolver(), private readonly promotionResolver = new PromotionResolver(), private readonly discountResolver = new DiscountResolver(), private readonly taxResolver = new TaxResolver()) {}
  calculate(request: PricingRequest): ResolvedPrice {
    const frozen = { ...request, promotions: Object.freeze([...request.promotions]), taxes: Object.freeze([...request.taxes]), serviceCharges: Object.freeze([...request.serviceCharges]) };
    const unitCount = quantity(frozen.quantity); const currency = Currency.from(frozen.context.currency); const rule = this.pricingResolver.resolve(frozen.priceBook, frozen.context);
    if (rule.price.money.currency.code !== currency.code) throw new CurrencyMismatchError();
    const subtotal = PreciseMoney.fromMoney(rule.price.money).multiply(unitCount); const promotions = this.promotionResolver.resolve(frozen.promotions, frozen.context); const discounted = this.discountResolver.apply(subtotal, promotions);
    const chargeLines = ordered(frozen.serviceCharges.filter((policy) => policy.tenantId === frozen.context.scope.tenantId)).map((policy) => ({ policy, amount: discounted.total.apply(policy.rate) }));
    const afterCharges = chargeLines.reduce((total, line) => total.add(line.amount), discounted.total);
    const taxLines = this.taxResolver.apply(afterCharges, frozen.taxes.filter((policy) => policy.tenantId === frozen.context.scope.tenantId));
    const exclusiveTax = taxLines.filter((line) => !line.policy.inclusive).reduce((total, line) => total.add(line.amount), PreciseMoney.zero(currency));
    const total = afterCharges.add(exclusiveTax);
    const applied = (type: AppliedPolicy['type'], id: string, reason: string, amount: PreciseMoney): AppliedPolicy => Object.freeze({ id, type, reason, amount: money(amount, currency, frozen.rounding.strategy) });
    const result: ResolvedPrice = { productId: frozen.productId, currency: frozen.context.currency, unitPrice: rule.price.money, subtotal: money(subtotal, currency, frozen.rounding.strategy), discounts: Object.freeze(promotions.slice(0, discounted.applied.length).map((promotion, index) => applied('PROMOTION', promotion.id, 'PROMOTION', discounted.applied[index].amount))), taxes: Object.freeze(taxLines.map((line) => applied('TAX', line.policy.id, line.policy.inclusive ? 'INCLUSIVE' : 'EXCLUSIVE', line.amount))), serviceCharges: Object.freeze(chargeLines.map((line) => applied('SERVICE_CHARGE', line.policy.id, 'SERVICE_CHARGE', line.amount))), total: money(total, currency, frozen.rounding.strategy), trace: Object.freeze([`PRICE_RULE:${rule.id}`, ...promotions.slice(0, discounted.applied.length).map((item) => `PROMOTION:${item.id}`), ...chargeLines.map((item) => `SERVICE_CHARGE:${item.policy.id}`), ...taxLines.map((item) => `TAX:${item.policy.id}`)]) };
    return Object.freeze(result);
  }
}
export class PricingService extends PricingEngine { price(request: PricingRequest): ResolvedPrice { return this.calculate(request); } }
