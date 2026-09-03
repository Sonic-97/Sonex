import type { AggregateRepository, RepositoryContext } from '../shared-kernel';
import type { Category, Catalog, ModifierGroup, Product, Tag } from './catalog.aggregates';
import type { CategoryId, CatalogId, ModifierGroupId, ProductId, TagId } from './catalog.types';
import type { SKU } from './catalog.value-objects';

export interface CatalogRepository extends AggregateRepository<Catalog, CatalogId> {}
export interface ProductRepository extends AggregateRepository<Product, ProductId> { existsBySku(catalogId: CatalogId, sku: SKU, context: RepositoryContext): Promise<boolean>; }
export interface CategoryRepository extends AggregateRepository<Category, CategoryId> {}
export interface ModifierGroupRepository extends AggregateRepository<ModifierGroup, ModifierGroupId> {}
export interface TagRepository extends AggregateRepository<Tag, TagId> {}
