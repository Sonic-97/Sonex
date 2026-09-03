import type { Command, DeepReadonly, DomainEvent, Instant, JsonValue, Quantity, Query, SchemaVersion, TenantId } from '../shared-kernel';
import type { ProductId } from '../catalog-domain';
import type { IngredientId, InventoryItemId, RecipeId, StorageLocationId, UnitConversionId } from './inventory-core.types';
import type { InventoryItemName, ReorderPoint, ReorderQuantity, Unit, UnitConversionRatio } from './inventory-core.value-objects';

export type InventoryCoreEventName = 'InventoryItemCreated' | 'InventoryItemUpdated' | 'InventoryItemArchived' | 'RecipeCreated' | 'IngredientAdded' | 'IngredientRemoved' | 'StorageLocationChanged' | 'ConversionRuleCreated';
export type InventoryCoreEventPayload = Readonly<Record<string, string>> & { readonly tenantId: string; readonly aggregateId: string; readonly occurredAt: string };
export type InventoryCoreDomainEvent = DomainEvent<InventoryCoreEventName, InventoryCoreEventPayload>;
export type CreateInventoryItem = Command<'INVENTORY_CREATE_ITEM', { readonly itemId: InventoryItemId; readonly name: InventoryItemName; readonly baseUnit: Unit }>;
export type UpdateInventoryItem = Command<'INVENTORY_UPDATE_ITEM', { readonly itemId: InventoryItemId; readonly name: InventoryItemName }>;
export type ArchiveInventoryItem = Command<'INVENTORY_ARCHIVE_ITEM', { readonly itemId: InventoryItemId }>;
export type CreateRecipe = Command<'INVENTORY_CREATE_RECIPE', { readonly recipeId: RecipeId; readonly productId: ProductId }>;
export type AddIngredient = Command<'INVENTORY_ADD_INGREDIENT', { readonly recipeId: RecipeId; readonly ingredientId: IngredientId; readonly itemId: InventoryItemId; readonly quantity: Quantity }>;
export type RemoveIngredient = Command<'INVENTORY_REMOVE_INGREDIENT', { readonly recipeId: RecipeId; readonly ingredientId: IngredientId }>;
export type ChangeStorageLocation = Command<'INVENTORY_CHANGE_STORAGE_LOCATION', { readonly itemId: InventoryItemId; readonly storageLocationId?: StorageLocationId }>;
export type ConfigureReorder = Command<'INVENTORY_CONFIGURE_REORDER', { readonly itemId: InventoryItemId; readonly point: ReorderPoint; readonly quantity: ReorderQuantity }>;
export type CreateConversionRule = Command<'INVENTORY_CREATE_CONVERSION', { readonly conversionId: UnitConversionId; readonly fromUnit: Unit; readonly toUnit: Unit; readonly ratio: UnitConversionRatio }>;
export type InventoryItemsQuery = Query<'INVENTORY_ITEMS', { readonly archived?: boolean }>;
export type RecipesQuery = Query<'INVENTORY_RECIPES', { readonly productId?: ProductId }>;
export type IngredientTreeQuery = Query<'INVENTORY_INGREDIENT_TREE', { readonly recipeId: RecipeId }>;
export type StorageLocationsQuery = Query<'INVENTORY_STORAGE_LOCATIONS', Record<string, never>>;
export type ConversionRulesQuery = Query<'INVENTORY_CONVERSION_RULES', { readonly fromUnit?: Unit; readonly toUnit?: Unit }>;
export type SupplierReferencesQuery = Query<'INVENTORY_SUPPLIER_REFERENCES', { readonly itemId: InventoryItemId }>;

export interface InventoryItemReadModel { readonly itemId: InventoryItemId; readonly name: string; readonly archived: boolean; }
export interface RecipeReadModel { readonly recipeId: RecipeId; readonly productId: ProductId; readonly ingredientIds: readonly IngredientId[]; }
export interface IngredientTreeReadModel { readonly recipeId: RecipeId; readonly ingredientIds: readonly IngredientId[]; }
export interface StorageLocationReadModel { readonly storageLocationId: StorageLocationId; readonly name: string; }
export interface ConversionRuleReadModel { readonly conversionId: UnitConversionId; readonly fromUnit: string; readonly toUnit: string; readonly ratio: string; }
export interface InventoryScope { readonly tenantId: TenantId; readonly occurredAt: Instant; }

export type ProductionStationAssignment = DeepReadonly<{
  readonly stationId: string;
  readonly stationRole: string;
  readonly sequence: number;
}>;

export type AuthorizedPreparationStep = DeepReadonly<{
  readonly stepId: string;
  readonly sequence: number;
  readonly stationId: string;
  readonly instruction: string;
  readonly estimatedDurationMs: number;
  readonly metadata: Readonly<Record<string, JsonValue>>;
}>;

/**
 * Immutable Kitchen-safe production definition. The producing Inventory Core contract
 * intentionally exposes no recipe, ingredient, stock, ledger, pricing, or payment data.
 */
export type AuthorizedProductionSpecification = DeepReadonly<{
  readonly contractVersion: SchemaVersion;
  readonly specificationId: string;
  readonly productId: ProductId;
  readonly specificationVersion: number;
  readonly effectiveVersion: number;
  readonly effectiveAt: Instant;
  readonly stationAssignments: readonly ProductionStationAssignment[];
  readonly preparationSteps: readonly AuthorizedPreparationStep[];
  readonly metadata: Readonly<Record<string, JsonValue>>;
}>;
