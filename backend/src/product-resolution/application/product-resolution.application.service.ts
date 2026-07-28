import { Inject, Injectable } from '@nestjs/common';
import { OperationalContext } from '../../shared-kernel';
import { ProductResolutionInput, ProductResolutionResult } from '../domain/product-resolution.types';
import { ProductResolutionService } from '../product-resolution.service';
import { CafeTenantIdentityPolicy } from './cafe-tenant-identity.policy';
import { CafeTenantIdentityViolationError, UnsupportedProductReferenceError } from './product-catalog.errors';
import { PRODUCT_CATALOG_REPOSITORY, ProductCatalogRepository } from './product-catalog.repository';
import { ProductCatalogScope } from './product-catalog.record';
import { ProductCatalogSnapshotMapper } from './product-catalog-snapshot.mapper';

@Injectable()
export class ProductResolutionApplicationService {
  constructor(
    @Inject(PRODUCT_CATALOG_REPOSITORY) private readonly repository: ProductCatalogRepository,
    private readonly mapper: ProductCatalogSnapshotMapper,
    private readonly resolutionService: ProductResolutionService,
    private readonly tenantIdentity: CafeTenantIdentityPolicy,
  ) {}

  async resolve(input: ProductResolutionInput, context: OperationalContext): Promise<ProductResolutionResult> {
    if (input.reference.kind !== 'PRODUCT_ID') throw new UnsupportedProductReferenceError(input.reference.kind);
    if (input.tenantId !== context.tenantId || !this.tenantIdentity.matches(String(input.cafeId), context.tenantId)) {
      throw new CafeTenantIdentityViolationError();
    }
    const scope: ProductCatalogScope = { tenantId: context.tenantId, cafeId: String(input.cafeId), ...(context.branchId ? { branchId: context.branchId } : {}) };
    const record = await this.repository.findById(scope, input.reference.value);
    const snapshot = record ? this.mapper.toSnapshot(record, scope) : null;
    return this.resolutionService.resolve(input, snapshot);
  }
}
