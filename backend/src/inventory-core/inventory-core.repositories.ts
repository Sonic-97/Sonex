import type { AggregateRepository, RepositoryContext } from '../shared-kernel';
import type { InventoryCategory, InventoryItem, Recipe, StorageLocation, UnitConversion, WasteCategory } from './inventory-core.aggregates';
import type { InventoryCategoryId, InventoryItemId, RecipeId, StorageLocationId, UnitConversionId, WasteCategoryId } from './inventory-core.types';

export interface InventoryItemRepository extends AggregateRepository<InventoryItem, InventoryItemId> { existsByName(name: string, context: RepositoryContext): Promise<boolean>; }
export interface RecipeRepository extends AggregateRepository<Recipe, RecipeId> {}
export interface StorageLocationRepository extends AggregateRepository<StorageLocation, StorageLocationId> {}
export interface InventoryCategoryRepository extends AggregateRepository<InventoryCategory, InventoryCategoryId> {}
export interface UnitConversionRepository extends AggregateRepository<UnitConversion, UnitConversionId> {}
export interface WasteCategoryRepository extends AggregateRepository<WasteCategory, WasteCategoryId> {}
