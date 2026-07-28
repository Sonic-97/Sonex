import { branchId, domainId, tenantId } from '../../shared-kernel';
import { ProductCatalogScope } from '../application/product-catalog.record';
import { PrismaProductCatalogRepository } from './prisma-product-catalog.repository';

const decimal = (value: string) => ({ toString: () => value });
const scope: ProductCatalogScope = { tenantId: tenantId('cafe-1'), cafeId: 'cafe-1', branchId: branchId('branch-1') };

describe('PrismaProductCatalogRepository', () => {
  it('uses cafe and branch scope and serializes persisted decimals without Number conversion', async () => {
    const calls: object[] = [];
    const repository = new PrismaProductCatalogRepository({
      product: {
        findFirst: async (query: object) => {
          calls.push(query);
          return {
            id: 'product-1', cafeId: 'cafe-1', branchId: null, name: 'Latte', code: 'LATTE-1', price: decimal('50.00'), active: true,
            attributes: [], tags: [], images: [], availability: {},
            sizes: [{ id: 'large', name: 'Large', priceAdjust: decimal('10.25'), active: true }],
            options: [{ id: 'milk', name: 'Milk', required: false, multiSelect: false, choices: [{ id: 'oat', label: 'Oat' }] }],
            branchProducts: [{ price: decimal('55.75'), isAvailable: false }],
          };
        },
      },
    });
    const result = await repository.findById(scope, domainId('ProductId', 'product-1'));
    expect(result).toMatchObject({ price: '50.00', sizes: [{ priceAdjustment: '10.25' }], branchOverride: { price: '55.75', isAvailable: false } });
    expect(calls[0]).toMatchObject({ where: { id: 'product-1', cafeId: 'cafe-1' } });
  });

  it('does not return branch-specific products without a branch context', async () => {
    const calls: object[] = [];
    const repository = new PrismaProductCatalogRepository({ product: { findFirst: async (query: object) => { calls.push(query); return null; } } });
    await repository.findById({ tenantId: tenantId('cafe-1'), cafeId: 'cafe-1' }, domainId('ProductId', 'product-1'));
    expect(calls[0]).toMatchObject({ where: { branchId: null } });
  });
});
