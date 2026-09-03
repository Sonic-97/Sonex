import { Money, Quantity, instant, tenantId } from '../shared-kernel';
import { productId } from '../catalog-domain';
import { Price, PriceBook, PriceRule, PricingContext, Priority, RoundingPolicy } from '../pricing-domain';
import { priceBookId, priceRuleId } from '../pricing-domain';
import { PricingRequestMapper } from './pricing-request.mapper';
describe('PricingRequestMapper', () => { it('maps the Catalog ProductId pricing contract without Product Resolution', () => { const at = instant('2026-07-30T10:00:00.000Z'); const tenant = tenantId('tenant-1'); const product = productId('product-1'); const book = PriceBook.create(tenant, priceBookId('book-1'), 'EGP', at); book.addRule(PriceRule.create(tenant, priceRuleId('rule-1'), product, Price.from(Money.from('1', 'EGP')), Priority.from(1)), at); book.publish(at); const input = { pricing: { productId: product, quantity: Quantity.from('1', 'each'), context: PricingContext.create({ tenantId: tenant, productId: product }, 'EGP', at), priceBook: book, promotions: [], taxes: [], serviceCharges: [], rounding: RoundingPolicy.create() } }; expect(new PricingRequestMapper().toDomain(input)).toBe(input.pricing); }); });
