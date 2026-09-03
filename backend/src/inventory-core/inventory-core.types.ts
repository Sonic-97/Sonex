import { domainId, type AggregateId } from '../shared-kernel';

export type InventoryItemId = AggregateId<'InventoryItemId'>;
export type RecipeId = AggregateId<'RecipeId'>;
export type IngredientId = AggregateId<'IngredientId'>;
export type SupplierReferenceId = AggregateId<'SupplierReferenceId'>;
export type StorageLocationId = AggregateId<'StorageLocationId'>;
export type InventoryCategoryId = AggregateId<'InventoryCategoryId'>;
export type UnitConversionId = AggregateId<'UnitConversionId'>;
export type WasteCategoryId = AggregateId<'WasteCategoryId'>;

export const inventoryItemId = (value: string): InventoryItemId => domainId('InventoryItemId', value);
export const recipeId = (value: string): RecipeId => domainId('RecipeId', value);
export const ingredientId = (value: string): IngredientId => domainId('IngredientId', value);
export const supplierReferenceId = (value: string): SupplierReferenceId => domainId('SupplierReferenceId', value);
export const storageLocationId = (value: string): StorageLocationId => domainId('StorageLocationId', value);
export const inventoryCategoryId = (value: string): InventoryCategoryId => domainId('InventoryCategoryId', value);
export const unitConversionId = (value: string): UnitConversionId => domainId('UnitConversionId', value);
export const wasteCategoryId = (value: string): WasteCategoryId => domainId('WasteCategoryId', value);
