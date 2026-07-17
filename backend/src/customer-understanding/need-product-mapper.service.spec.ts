import { NeedProductMapperService } from './need-product-mapper.service';
import { NeedCatalogProduct, emptyCustomerNeed } from './customer-need.types';

describe('NeedProductMapperService', () => {
  const prisma: any = { product: { findMany: jest.fn(), findFirst: jest.fn() } };
  const tags: any = { parse: (value: unknown) => Array.isArray(value) ? value : [] };
  const service = new NeedProductMapperService(prisma, tags);
  const product = (overrides: Partial<NeedCatalogProduct> = {}): NeedCatalogProduct => ({
    id: 'p1', cafeId: 'cafe-a', branchId: 'branch-a', name: 'آيس أمريكانو', category: 'coffee', categoryId: 'cat-1',
    active: true, price: 60, tags: ['COLD', 'LOW_SUGAR', 'CAFFEINATED', 'QUICK_PREP', 'BUDGET'], ...overrides,
  });

  it('returns at most three options', () => {
    const products = [1, 2, 3, 4].map((id) => product({ id: `p${id}`, name: `منتج ${id}` }));
    expect(service.rank({ ...emptyCustomerNeed(), primaryIntent: 'HELP_ME_CHOOSE' }, products)).toHaveLength(3);
  });

  it('excludes unavailable products', () => {
    expect(service.rank({ ...emptyCustomerNeed(), primaryIntent: 'HELP_ME_CHOOSE' }, [product({ branchAvailable: false })])).toEqual([]);
  });

  it('never exceeds an explicit budget including delivery fee', () => {
    const need = { ...emptyCustomerNeed(), primaryIntent: 'BUDGET_REQUEST' as const, budgetMax: 70, budgetSensitivity: 'EXPLICIT_LIMIT' as const };
    expect(service.rank(need, [product({ price: 65 })], { deliveryFee: 10 })).toEqual([]);
    expect(service.rank(need, [product({ price: 60 })], { deliveryFee: 10 })[0].finalPrice).toBe(70);
  });

  it('requires verified energy tags', () => {
    const need = { ...emptyCustomerNeed(), primaryIntent: 'ENERGY_REQUEST' as const, desiredEffect: 'ENERGY' as const, caffeine: 'HIGH' as const };
    const result = service.rank(need, [product({ id: 'verified', tags: ['HIGH_CAFFEINE'] }), product({ id: 'invented', tags: [] })]);
    expect(result.map((item) => item.productId)).toEqual(['verified']);
  });

  it('requires both cold and low-sugar tags for a multi-constraint request', () => {
    const need = { ...emptyCustomerNeed(), primaryIntent: 'COLD_DRINK_REQUEST' as const, temperature: 'COLD' as const, sweetness: 'LOW' as const };
    const result = service.rank(need, [
      product({ id: 'both', tags: ['COLD', 'LOW_SUGAR'] }),
      product({ id: 'cold', tags: ['COLD'] }),
    ]);
    expect(result.map((item) => item.productId)).toEqual(['both']);
  });

  it('uses only NEW-tagged products for an explicit new request', () => {
    const need = { ...emptyCustomerNeed(), primaryIntent: 'NEW_PRODUCT_REQUEST' as const, novelty: 'WANTS_NEW' as const };
    expect(service.rank(need, [product({ id: 'new', tags: ['NEW'] }), product({ id: 'old', tags: ['FAMILIAR'] })]).map((item) => item.productId)).toEqual(['new']);
  });

  it('uses only FAMILIAR-tagged products for a safe familiar choice', () => {
    const need = { ...emptyCustomerNeed(), primaryIntent: 'SAFE_FAMILIAR_CHOICE' as const, novelty: 'FAMILIAR' as const };
    expect(service.rank(need, [product({ id: 'known', tags: ['FAMILIAR'] }), product({ id: 'new', tags: ['NEW'] })]).map((item) => item.productId)).toEqual(['known']);
  });

  it('urgent requests require QUICK_PREP', () => {
    const need = { ...emptyCustomerNeed(), primaryIntent: 'QUICK_ORDER' as const, urgency: 'HIGH' as const };
    expect(service.rank(need, [product({ id: 'fast', tags: ['QUICK_PREP'] }), product({ id: 'slow', tags: ['FAMILIAR'] })]).map((item) => item.productId)).toEqual(['fast']);
  });

  it('morning context influences ranking only', () => {
    const need = { ...emptyCustomerNeed(), primaryIntent: 'HELP_ME_CHOOSE' as const, morningFastMode: true };
    const result = service.rank(need, [product({ id: 'regular', tags: ['FAMILIAR'], price: 50 }), product({ id: 'fast', tags: ['QUICK_PREP'], price: 60 })]);
    expect(result[0].productId).toBe('fast');
    expect(result).toHaveLength(2);
  });

  it('does not diagnose or claim mood effects', () => {
    const need = { ...emptyCustomerNeed(), primaryIntent: 'MOOD_IMPROVEMENT_REQUEST' as const, desiredEffect: 'RELAXATION' as const };
    const result = service.rank(need, [product({ tags: ['SWEET'] })]);
    expect(result[0].reason).not.toMatch(/يعالج|اكتئاب|قلق|مزاجك هيتحسن/);
  });

  it('uses branch price as the real current price', () => {
    const result = service.rank({ ...emptyCustomerNeed(), primaryIntent: 'HELP_ME_CHOOSE' }, [product({ price: 50, branchPrice: 72 })]);
    expect(result[0]).toMatchObject({ unitPrice: 72, finalPrice: 72 });
  });

  it('formats reasons from matched verified tags only', () => {
    const need = { ...emptyCustomerNeed(), primaryIntent: 'COLD_DRINK_REQUEST' as const, temperature: 'COLD' as const };
    const result = service.rank(need, [product({ tags: ['COLD'] })]);
    expect(result[0].reason).toContain('ساقع');
    expect(result[0].matchedTags).toEqual(['COLD']);
  });

  it('scopes catalog queries by cafe and branch', async () => {
    prisma.product.findMany.mockResolvedValueOnce([]);
    await service.find('cafe-a', 'branch-a', emptyCustomerNeed());
    expect(prisma.product.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ cafeId: 'cafe-a', active: true }),
    }));
  });

  it('revalidation rejects a cross-tenant or missing product', async () => {
    prisma.product.findFirst.mockResolvedValueOnce(null);
    const candidate = service.rank({ ...emptyCustomerNeed(), primaryIntent: 'HELP_ME_CHOOSE' }, [product()])[0];
    expect(await service.revalidate('cafe-b', 'branch-a', candidate, null)).toBeNull();
    expect(prisma.product.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ cafeId: 'cafe-b' }) }));
  });

  it('revalidation blocks a changed price above budget', async () => {
    const candidate = service.rank({ ...emptyCustomerNeed(), primaryIntent: 'HELP_ME_CHOOSE' }, [product({ price: 60 })])[0];
    prisma.product.findFirst.mockResolvedValueOnce({
      id: 'p1', name: 'آيس أمريكانو', category: 'coffee', categoryId: 'cat-1', price: 90,
      understandingTags: ['COLD'], branchProducts: [],
    });
    expect(await service.revalidate('cafe-a', 'branch-a', candidate, 70)).toBeNull();
  });
});
