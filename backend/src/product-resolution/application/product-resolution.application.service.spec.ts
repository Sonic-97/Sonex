import { actorId, branchId, domainId, FixedClock, instant, Quantity, tenantId } from '../../shared-kernel';
import { ProductResolutionService } from '../product-resolution.service';
import { ProductCatalogSnapshotMapper } from './product-catalog-snapshot.mapper';
import { CafeTenantIdentityPolicy } from './cafe-tenant-identity.policy';
import { ProductCatalogRepository } from './product-catalog.repository';
import { ProductCatalogRecord } from './product-catalog.record';
import { ProductResolutionApplicationService } from './product-resolution.application.service';
import { CafeTenantIdentityViolationError, UnsupportedProductReferenceError } from './product-catalog.errors';

const now = instant('2026-07-28T10:00:00.000Z');
const record: ProductCatalogRecord = { id: 'product-1', cafeId: 'cafe-1', branchId: null, name: 'Latte', code: 'LATTE-1', price: '50.00', active: true, attributes: [], tags: [], images: [], availability: {}, sizes: [], options: [] };

describe('ProductResolutionApplicationService', () => {
  const repository: ProductCatalogRepository = { findById: async () => record };
  const clock = new FixedClock(now);
  const service = new ProductResolutionApplicationService(repository, new ProductCatalogSnapshotMapper(), new ProductResolutionService(clock), new CafeTenantIdentityPolicy());
  const input = { tenantId: tenantId('cafe-1'), cafeId: domainId('CafeId', 'cafe-1'), reference: { kind: 'PRODUCT_ID' as const, value: domainId('ProductId', 'product-1') }, modifiers: [], quantity: Quantity.from('1', 'each'), requestedAt: now, timezone: 'Africa/Cairo' };
  const context = { tenantId: tenantId('cafe-1'), branchId: branchId('branch-1'), actor: { actorId: actorId('staff-1'), actorType: 'STAFF' as const }, channel: 'POS' as const };

  it('propagates the operational scope into persistence and resolves the immutable snapshot', async () => {
    await expect(service.resolve(input, context)).resolves.toMatchObject({ productId: 'product-1', cafeId: 'cafe-1' });
  });

  it('rejects unsupported persistence reference kinds before querying', async () => {
    await expect(service.resolve({ ...input, reference: { kind: 'SLUG', value: 'latte' } }, context)).rejects.toBeInstanceOf(UnsupportedProductReferenceError);
  });

  it('rejects a context whose tenant does not match the cafe compatibility policy', async () => {
    await expect(service.resolve(input, { ...context, tenantId: tenantId('other-tenant') })).rejects.toBeInstanceOf(CafeTenantIdentityViolationError);
  });
});
