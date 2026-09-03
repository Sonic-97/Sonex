import { instant, Quantity, tenantId } from '../shared-kernel';
import { productId } from '../catalog-domain';
import { Ingredient, InventoryCategory, InventoryItem, Recipe, StorageLocation, UnitConversion, WasteCategory } from './inventory-core.aggregates';
import { InventoryCoreDomainError } from './inventory-core.errors';
import { IngredientConsistencyValidator, RecipeValidator, UnitConversionService } from './inventory-core.services';
import { ingredientId, inventoryCategoryId, inventoryItemId, recipeId, storageLocationId, unitConversionId, wasteCategoryId } from './inventory-core.types';
import { InventoryCategoryName, InventoryItemName, ReorderPoint, ReorderQuantity, ShelfLife, StorageTemperature, Unit, UnitConversionRatio, WasteReason } from './inventory-core.value-objects';

const tenant = tenantId('tenant-1');
const now = instant('2026-07-30T00:00:00.000Z');
const grams = Unit.from('g');
const kilograms = Unit.from('kg');
const item = () => InventoryItem.create(tenant, inventoryItemId('beans'), InventoryItemName.from('Coffee Beans'), grams, now, ShelfLife.days(30));

describe('Inventory Core Domain', () => {
  test('creates and archives immutable inventory structure without stock quantities', () => {
    const inventoryItem = item();
    expect(inventoryItem.baseUnit.code).toBe('G');
    expect(inventoryItem.shelfLife?.days).toBe(30);
    expect(inventoryItem.pullDomainEvents().map((event) => event.name)).toEqual(['InventoryItemCreated']);
    inventoryItem.archive(now);
    expect(inventoryItem.archived).toBe(true);
    expect(() => inventoryItem.rename(InventoryItemName.from('Other Beans'), now)).toThrow(InventoryCoreDomainError);
  });

  test('requires reorder configuration in the base unit', () => {
    const inventoryItem = item();
    inventoryItem.configureReorder(ReorderPoint.from('10', grams), ReorderQuantity.from('100', grams));
    expect(inventoryItem.reorderQuantity?.value).toBe('100');
    expect(() => inventoryItem.configureReorder(ReorderPoint.from('1', kilograms), ReorderQuantity.from('2', kilograms))).toThrow(InventoryCoreDomainError);
  });

  test('enforces a recipe ingredient uniqueness invariant', () => {
    const recipe = Recipe.create(tenant, recipeId('latte'), productId('latte-product'), now);
    const beans = new Ingredient(ingredientId('beans-line'), inventoryItemId('beans'), Quantity.from('18', 'G'));
    recipe.addIngredient(beans, now);
    expect(recipe.ingredients).toEqual([beans]);
    expect(() => recipe.addIngredient(new Ingredient(ingredientId('beans-line-2'), inventoryItemId('beans'), Quantity.from('20', 'G')), now)).toThrow(InventoryCoreDomainError);
    recipe.removeIngredient(beans.id, now);
    expect(recipe.ingredients).toEqual([]);
  });

  test('rejects zero or negative recipe quantities through Quantity', () => {
    expect(() => new Ingredient(ingredientId('zero'), inventoryItemId('beans'), Quantity.from('0', 'G'))).toThrow();
    expect(() => Quantity.from('-1', 'G')).toThrow();
  });

  test('validates recipes and detects an explicit circular recipe reference', () => {
    const recipe = Recipe.create(tenant, recipeId('latte'), productId('latte-product'), now);
    const validator = new RecipeValidator();
    validator.validate(recipe);
    expect(() => validator.assertAcyclic(recipe.id, [recipe.id])).toThrow(InventoryCoreDomainError);
  });

  test('validates conversion dimensions and converts deterministically', () => {
    const conversion = UnitConversion.create(tenant, unitConversionId('g-to-kg'), grams, kilograms, UnitConversionRatio.from('0.001'), now);
    const result = new UnitConversionService().convert(Quantity.from('250', 'G'), kilograms, conversion);
    expect(result.serialize()).toEqual({ value: '0.25', unit: 'KG' });
    expect(() => UnitConversion.create(tenant, unitConversionId('same-unit'), grams, grams, UnitConversionRatio.from('1'), now)).toThrow(InventoryCoreDomainError);
  });

  test('validates inventory-specific value objects and aggregate references', () => {
    expect(() => Unit.from('')).toThrow();
    expect(() => UnitConversionRatio.from('0')).toThrow();
    expect(() => StorageTemperature.celsius('101')).toThrow();
    expect(() => InventoryCategory.create(inventoryCategoryId('dry'), tenant, InventoryCategoryName.from('Dry'), inventoryCategoryId('dry'))).toThrow(InventoryCoreDomainError);
    expect(StorageLocation.create(tenant, storageLocationId('freezer'), InventoryItemName.from('Freezer'), now, StorageTemperature.celsius('-18'))).toBeInstanceOf(StorageLocation);
    expect(WasteCategory.create(wasteCategoryId('spoilage'), tenant, WasteReason.from('Spoilage'))).toBeInstanceOf(WasteCategory);
  });

  test('validates ingredient unit consistency without loading inventory or ledger state', () => {
    const ingredient = new Ingredient(ingredientId('milk'), inventoryItemId('milk'), Quantity.from('200', 'ML'));
    expect(() => new IngredientConsistencyValidator().validate(ingredient, Unit.from('ML'))).not.toThrow();
    expect(() => new IngredientConsistencyValidator().validate(ingredient, grams)).toThrow(InventoryCoreDomainError);
  });
});
