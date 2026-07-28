import { ProductId } from '../domain/product-resolution.types';
import { ProductCatalogRecord, ProductCatalogScope } from './product-catalog.record';

export const PRODUCT_CATALOG_REPOSITORY = Symbol('PRODUCT_CATALOG_REPOSITORY');

export interface ProductCatalogRepository {
  findById(scope: ProductCatalogScope, productId: ProductId): Promise<ProductCatalogRecord | null>;
}
