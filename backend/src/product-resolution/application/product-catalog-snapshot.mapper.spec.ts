import { branchId, tenantId } from '../../shared-kernel';
import { ProductCatalogValidationError } from './product-catalog.errors';
import { ProductCatalogRecord, ProductCatalogScope } from './product-catalog.record';
import { ProductCatalogSnapshotMapper } from './product-catalog-snapshot.mapper';

const scope: ProductCatalogScope = { tenantId: tenantId('cafe-1'), cafeId: 'cafe-1', branchId: branchId('branch-1') };
const record = (overrides: Partial<ProductCatalogRecord> = {}): ProductCatalogRecord => ({
  id: 'product-1', cafeId: 'cafe-1', branchId: null, name: 'Latte', code: 'LATTE-1', price: '50.00', active: true,
  attributes: [], tags: ['coffee'], images: [], availability: {},
  sizes: [{ id: 'large', name: 'Large', priceAdjustment: '10.00', active: true }],
  options: [{ id: 'milk', name: 'Milk', required: true, multiSelect: false, choices: [{ id: 'oat', label: 'Oat', priceAdjust: 5 }] }],
  ...overrides,
});

describe('ProductCatalogSnapshotMapper', () => {
  const mapper = new ProductCatalogSnapshotMapper();

  it('maps structured sizes and immutable modifier choice identities into a frozen snapshot', () => {
    const snapshot = mapper.toSnapshot(record({ branchOverride: { price: '55.50', isAvailable: true } }), scope);
    expect(snapshot.basePrice).toBe('55.50');
    expect(snapshot.variants[0]).toMatchObject({ id: 'large', priceAdjustment: '10.00' });
    expect(snapshot.modifierGroups[0].choices[0]).toMatchObject({ id: 'oat', priceAdjustment: '5' });
    expect(Object.isFrozen(snapshot)).toBe(true);
  });

  it('maps a branch override as non-sellable without changing the product lifecycle state', () => {
    const snapshot = mapper.toSnapshot(record({ branchOverride: { price: '50.00', isAvailable: false } }), scope);
    expect(snapshot.active).toBe(true);
    expect(snapshot.branchAvailable).toBe(false);
  });

  it('rejects legacy choices without immutable identifiers', () => {
    expect(() => mapper.toSnapshot(record({ options: [{ id: 'milk', name: 'Milk', required: false, multiSelect: false, choices: [{ label: 'Oat' }] }] }), scope)).toThrow(ProductCatalogValidationError);
  });

  it('rejects a catalog record outside its cafe scope', () => {
    expect(() => mapper.toSnapshot(record({ cafeId: 'other-cafe' }), scope)).toThrow(ProductCatalogValidationError);
  });
});
