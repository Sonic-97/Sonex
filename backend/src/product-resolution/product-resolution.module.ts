import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SystemClock } from '../shared-kernel';
import { CafeTenantIdentityPolicy } from './application/cafe-tenant-identity.policy';
import { PRODUCT_CATALOG_REPOSITORY } from './application/product-catalog.repository';
import { ProductResolutionApplicationService } from './application/product-resolution.application.service';
import { ProductCatalogSnapshotMapper } from './application/product-catalog-snapshot.mapper';
import { PrismaProductCatalogRepository } from './infrastructure/prisma-product-catalog.repository';
import { ProductResolutionService } from './product-resolution.service';

@Module({
  imports: [PrismaModule],
  providers: [
    CafeTenantIdentityPolicy,
    ProductCatalogSnapshotMapper,
    PrismaProductCatalogRepository,
    { provide: PRODUCT_CATALOG_REPOSITORY, useExisting: PrismaProductCatalogRepository },
    { provide: SystemClock, useFactory: () => new SystemClock() },
    {
      provide: ProductResolutionService,
      useFactory: (clock: SystemClock) => new ProductResolutionService(clock),
      inject: [SystemClock],
    },
    ProductResolutionApplicationService,
  ],
  exports: [ProductResolutionApplicationService],
})
export class ProductResolutionModule {}
