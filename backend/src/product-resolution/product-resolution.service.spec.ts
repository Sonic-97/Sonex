import { deepFreeze, domainId, FixedClock, instant, Quantity, tenantId } from '../shared-kernel';
import { CatalogProduct, ProductResolutionInput } from './domain/product-resolution.types';
import { DuplicateModifierChoiceError, ProductDisabledError, ProductNotFoundError, ProductOutsideSellingWindowError, ProductQuantityError, RequiredModifierMissingError, TenantScopeViolationError, VariantUnavailableError } from './domain/product-resolution.errors';
import { ProductResolutionService } from './product-resolution.service';

const cafeId = domainId('CafeId', 'cafe-1'); const productId = domainId('ProductId', 'product-1'); const variantId = domainId('VariantId', 'large'); const groupId = domainId('ModifierGroupId', 'milk'); const choiceId = domainId('ModifierChoiceId', 'oat'); const now = instant('2026-07-27T10:30:00.000Z');
const product = (overrides: Partial<CatalogProduct> = {}): CatalogProduct => deepFreeze({
  id: productId, tenantId: tenantId('tenant-1'), cafeId, name: 'Latte', sku: 'LATTE', slug: 'latte', barcode: '12345', basePrice: '50.00', active: true, deleted: false, hidden: false,
  variants: [{ id: variantId, name: 'Large', priceAdjustment: '10.00', active: true }], modifierGroups: [{ id: groupId, name: 'Milk', required: true, multiSelect: false, choices: [{ id: choiceId, name: 'Oat', priceAdjustment: '5.00', active: true }] }],
  recipeReference: 'recipe-latte', taxCategory: 'standard', metadata: deepFreeze({ source: 'test' }), ...overrides,
});
const input = (overrides: Partial<ProductResolutionInput> = {}): ProductResolutionInput => ({ tenantId: tenantId('tenant-1'), cafeId, reference: { kind: 'PRODUCT_ID', value: productId }, modifiers: [{ groupId, choiceIds: [choiceId] }], quantity: Quantity.from('1', 'each'), requestedAt: now, timezone: 'UTC', ...overrides });

describe('ProductResolutionService', () => {
  const service = new ProductResolutionService(new FixedClock(now));
  it('returns a deeply frozen resolution using Shared Kernel primitives', () => {
    const result = service.resolve(input({ variant: { variantId } }), product());
    expect(result.contractVersion).toBe(1); expect(result.variant?.name).toBe('Large'); expect(result.availability.inventoryStatus).toBe('NOT_EVALUATED');
    expect(Object.isFrozen(result)).toBe(true); expect(Object.isFrozen(result.modifiers)).toBe(true); expect(Object.isFrozen(result.metadata)).toBe(true);
  });
  it.each([[{ kind: 'SLUG', value: 'latte' }, product()], [{ kind: 'BARCODE', value: '12345' }, product()]] as const)('resolves supported references', (reference, catalogProduct) => { expect(service.resolve(input({ reference }), catalogProduct).productId).toBe(productId); });
  it('rejects missing, mismatched, and cross-scope products', () => {
    expect(() => service.resolve(input(), null)).toThrow(ProductNotFoundError);
    expect(() => service.resolve(input({ reference: { kind: 'SLUG', value: 'wrong' } }), product())).toThrow(ProductNotFoundError);
    expect(() => service.resolve(input(), product({ cafeId: domainId('CafeId', 'other-cafe') }))).toThrow(TenantScopeViolationError);
  });
  it('rejects disabled products, unavailable variants, and invalid quantities', () => {
    expect(() => service.resolve(input(), product({ active: false }))).toThrow(ProductDisabledError);
    expect(() => service.resolve(input({ variant: { name: 'Unknown' } }), product())).toThrow(VariantUnavailableError);
    expect(() => service.resolve(input({ quantity: Quantity.from('0', 'each') }), product())).toThrow(ProductQuantityError);
    expect(() => service.resolve(input({ quantity: Quantity.from('1.5', 'each') }), product())).toThrow(ProductQuantityError);
    expect(() => service.resolve(input({ quantity: Quantity.from('1', 'kg') }), product())).toThrow(ProductQuantityError);
  });
  it('rejects missing and duplicate modifiers', () => {
    expect(() => service.resolve(input({ modifiers: [] }), product())).toThrow(RequiredModifierMissingError);
    expect(() => service.resolve(input({ modifiers: [{ groupId, choiceIds: [choiceId, choiceId] }] }), product())).toThrow(DuplicateModifierChoiceError);
  });
  it('uses the supplied timezone for selling windows', () => {
    const sellingWindow = { days: [1], startTime: '10:00', endTime: '11:00' };
    expect(service.resolve(input(), product({ sellingWindow })).availability.sellable).toBe(true);
    expect(() => service.resolve(input({ requestedAt: instant('2026-07-27T11:00:00.000Z') }), product({ sellingWindow }))).toThrow(ProductOutsideSellingWindowError);
  });
  it('returns a non-sellable availability result for an unavailable branch', () => {
    const result = service.resolve(input(), product({ branchAvailable: false }));
    expect(result.availability.sellable).toBe(false);
    expect(result.availability.reasons).toContain('BRANCH_UNAVAILABLE');
  });
});
