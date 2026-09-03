import { AggregateRoot, Entity, type Instant, type Quantity, type TenantId } from '../shared-kernel';
import type { ProductId } from '../catalog-domain';
import type { InventoryCoreDomainEvent, InventoryCoreEventName } from './inventory-core.contracts';
import { inventoryInvariant } from './inventory-core.errors';
import type { IngredientId, InventoryCategoryId, InventoryItemId, RecipeId, StorageLocationId, SupplierReferenceId, UnitConversionId, WasteCategoryId } from './inventory-core.types';
import { InventoryCategoryName, InventoryItemName, ReorderPoint, ReorderQuantity, ShelfLife, StorageTemperature, Unit, UnitConversionRatio, WasteReason } from './inventory-core.value-objects';

const event = (name: InventoryCoreEventName, tenantId: TenantId, aggregateId: string, occurredAt: Instant): InventoryCoreDomainEvent => ({ name, payload: { tenantId: String(tenantId), aggregateId, occurredAt: String(occurredAt) } });

export class SupplierReference extends Entity<SupplierReferenceId> {
  constructor(id: SupplierReferenceId, public readonly externalReference: string) {
    super(id);
    if (externalReference.trim().length === 0) inventoryInvariant('INVENTORY_SUPPLIER_REFERENCE_INVALID', 'Supplier reference cannot be empty');
    Object.freeze(this);
  }
}

export class InventoryItem extends AggregateRoot<InventoryItemId, InventoryCoreDomainEvent> {
  private archivedValue = false;
  private storageLocationValue?: StorageLocationId;
  private reorderPointValue?: ReorderPoint;
  private reorderQuantityValue?: ReorderQuantity;
  private categoryValue?: InventoryCategoryId;
  private supplierValues: SupplierReference[] = [];

  private constructor(
    private readonly tenant: TenantId,
    id: InventoryItemId,
    private nameValue: InventoryItemName,
    public readonly baseUnit: Unit,
    public readonly shelfLife?: ShelfLife,
  ) { super(id); }

  static create(tenantId: TenantId, id: InventoryItemId, name: InventoryItemName, baseUnit: Unit, occurredAt: Instant, shelfLife?: ShelfLife): InventoryItem {
    const item = new InventoryItem(tenantId, id, name, baseUnit, shelfLife);
    item.record(event('InventoryItemCreated', tenantId, id, occurredAt));
    return item;
  }

  get tenantId(): TenantId { return this.tenant; }
  get name(): InventoryItemName { return this.nameValue; }
  get archived(): boolean { return this.archivedValue; }
  get storageLocationId(): StorageLocationId | undefined { return this.storageLocationValue; }
  get reorderPoint(): ReorderPoint | undefined { return this.reorderPointValue; }
  get reorderQuantity(): ReorderQuantity | undefined { return this.reorderQuantityValue; }
  get supplierReferences(): readonly SupplierReference[] { return Object.freeze([...this.supplierValues]); }

  rename(name: InventoryItemName, occurredAt: Instant): void { this.assertMutable(); this.nameValue = name; this.changed('InventoryItemUpdated', occurredAt); }
  archive(occurredAt: Instant): void { this.assertMutable(); this.archivedValue = true; this.incrementVersion(); this.record(event('InventoryItemArchived', this.tenant, this.id, occurredAt)); }
  changeStorageLocation(storageLocationId: StorageLocationId | undefined, occurredAt: Instant): void { this.assertMutable(); this.storageLocationValue = storageLocationId; this.incrementVersion(); this.record(event('StorageLocationChanged', this.tenant, this.id, occurredAt)); }
  configureReorder(point: ReorderPoint, quantity: ReorderQuantity): void { this.assertMutable(); if (point.unit.code !== this.baseUnit.code || quantity.unit.code !== this.baseUnit.code) inventoryInvariant('INVENTORY_REORDER_UNIT_MISMATCH', 'Reorder configuration must use the inventory item base unit'); this.reorderPointValue = point; this.reorderQuantityValue = quantity; this.incrementVersion(); }
  addSupplierReference(reference: SupplierReference): void { this.assertMutable(); if (this.supplierValues.some((item) => item.id === reference.id)) inventoryInvariant('INVENTORY_SUPPLIER_REFERENCE_DUPLICATE', 'Supplier reference is already attached'); this.supplierValues.push(reference); this.incrementVersion(); }
  private assertMutable(): void { if (this.archivedValue) inventoryInvariant('INVENTORY_ITEM_ARCHIVED', 'Archived inventory item cannot be modified'); }
  private changed(name: InventoryCoreEventName, occurredAt: Instant): void { this.incrementVersion(); this.record(event(name, this.tenant, this.id, occurredAt)); }
}

export class Ingredient extends Entity<IngredientId> {
  constructor(id: IngredientId, public readonly inventoryItemId: InventoryItemId, public readonly requiredQuantity: Quantity, public readonly optional = false) { super(id); requiredQuantity.assertPositive(); Object.freeze(this); }
}

export class Recipe extends AggregateRoot<RecipeId, InventoryCoreDomainEvent> {
  private ingredientsValue: Ingredient[] = [];
  private archivedValue = false;
  private constructor(private readonly tenant: TenantId, id: RecipeId, public readonly productId: ProductId) { super(id); }
  static create(tenantId: TenantId, id: RecipeId, productId: ProductId, occurredAt: Instant): Recipe { const recipe = new Recipe(tenantId, id, productId); recipe.record(event('RecipeCreated', tenantId, id, occurredAt)); return recipe; }
  get ingredients(): readonly Ingredient[] { return Object.freeze([...this.ingredientsValue]); }
  get archived(): boolean { return this.archivedValue; }
  addIngredient(ingredient: Ingredient, occurredAt: Instant): void { this.assertMutable(); if (this.ingredientsValue.some((line) => line.id === ingredient.id || line.inventoryItemId === ingredient.inventoryItemId)) inventoryInvariant('INVENTORY_INGREDIENT_DUPLICATE', 'Recipe cannot contain the same ingredient more than once'); this.ingredientsValue.push(ingredient); this.incrementVersion(); this.record(event('IngredientAdded', this.tenant, this.id, occurredAt)); }
  removeIngredient(ingredientId: IngredientId, occurredAt: Instant): void { this.assertMutable(); if (!this.ingredientsValue.some((line) => line.id === ingredientId)) inventoryInvariant('INVENTORY_INGREDIENT_MISSING', 'Ingredient is not part of recipe'); this.ingredientsValue = this.ingredientsValue.filter((line) => line.id !== ingredientId); this.incrementVersion(); this.record(event('IngredientRemoved', this.tenant, this.id, occurredAt)); }
  archive(): void { this.archivedValue = true; this.incrementVersion(); }
  private assertMutable(): void { if (this.archivedValue) inventoryInvariant('INVENTORY_RECIPE_ARCHIVED', 'Archived recipe cannot be modified'); }
}

export class StorageLocation extends AggregateRoot<StorageLocationId, InventoryCoreDomainEvent> {
  private constructor(private readonly tenant: TenantId, id: StorageLocationId, public readonly name: InventoryItemName, public readonly temperature?: StorageTemperature) { super(id); }
  static create(tenantId: TenantId, id: StorageLocationId, name: InventoryItemName, occurredAt: Instant, temperature?: StorageTemperature): StorageLocation { const location = new StorageLocation(tenantId, id, name, temperature); location.record(event('StorageLocationChanged', tenantId, id, occurredAt)); return location; }
}

export class InventoryCategory extends AggregateRoot<InventoryCategoryId, InventoryCoreDomainEvent> {
  private constructor(id: InventoryCategoryId, public readonly tenantId: TenantId, public readonly name: InventoryCategoryName, public readonly parentId?: InventoryCategoryId) { super(id); if (parentId === id) inventoryInvariant('INVENTORY_CATEGORY_CYCLE', 'Inventory category cannot parent itself'); }
  static create(id: InventoryCategoryId, tenantId: TenantId, name: InventoryCategoryName, parentId?: InventoryCategoryId): InventoryCategory { return new InventoryCategory(id, tenantId, name, parentId); }
}

export class UnitConversion extends AggregateRoot<UnitConversionId, InventoryCoreDomainEvent> {
  private constructor(private readonly tenant: TenantId, id: UnitConversionId, public readonly fromUnit: Unit, public readonly toUnit: Unit, public readonly ratio: UnitConversionRatio) { super(id); if (fromUnit.code === toUnit.code) inventoryInvariant('INVENTORY_CONVERSION_IDENTITY_INVALID', 'Unit conversion must use two distinct units'); }
  static create(tenantId: TenantId, id: UnitConversionId, fromUnit: Unit, toUnit: Unit, ratio: UnitConversionRatio, occurredAt: Instant): UnitConversion { const conversion = new UnitConversion(tenantId, id, fromUnit, toUnit, ratio); conversion.record(event('ConversionRuleCreated', tenantId, id, occurredAt)); return conversion; }
}

export class WasteCategory extends AggregateRoot<WasteCategoryId, InventoryCoreDomainEvent> {
  private constructor(id: WasteCategoryId, public readonly tenantId: TenantId, public readonly reason: WasteReason) { super(id); }
  static create(id: WasteCategoryId, tenantId: TenantId, reason: WasteReason): WasteCategory { return new WasteCategory(id, tenantId, reason); }
}
