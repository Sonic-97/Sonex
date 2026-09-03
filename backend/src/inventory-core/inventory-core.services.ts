import { Decimal, DomainService, Quantity } from '../shared-kernel';
import { inventoryInvariant } from './inventory-core.errors';
import type { Ingredient, Recipe, UnitConversion } from './inventory-core.aggregates';
import type { InventoryItemId, RecipeId } from './inventory-core.types';
import type { Unit } from './inventory-core.value-objects';

export class RecipeValidator extends DomainService {
  validate(recipe: Recipe): void {
    const seen = new Set<InventoryItemId>();
    for (const ingredient of recipe.ingredients) {
      if (seen.has(ingredient.inventoryItemId)) inventoryInvariant('INVENTORY_INGREDIENT_DUPLICATE', 'Recipe cannot contain duplicate inventory items');
      seen.add(ingredient.inventoryItemId);
    }
  }
  assertAcyclic(recipeId: RecipeId, referencedRecipeIds: readonly RecipeId[]): void { if (referencedRecipeIds.includes(recipeId)) inventoryInvariant('INVENTORY_RECIPE_CIRCULAR', 'Recipe cannot reference itself'); }
}

export class UnitConversionService extends DomainService {
  convert(quantity: Quantity, targetUnit: Unit, conversion: UnitConversion): Quantity {
    if (quantity.unit !== conversion.fromUnit.code || targetUnit.code !== conversion.toUnit.code) inventoryInvariant('INVENTORY_CONVERSION_INAPPLICABLE', 'Conversion does not match requested units');
    const source = Decimal.from(quantity.serialize().value);
    const factor = Decimal.from(conversion.ratio.value);
    // Decimal stores six fractional places; divide the multiplied raw values once.
    const sourceRaw = BigInt(source.toFixed(6).replace('.', ''));
    const factorRaw = BigInt(factor.toFixed(6).replace('.', ''));
    const result = Decimal.fromRaw((sourceRaw * factorRaw) / 1_000_000n);
    return Quantity.from(result.toString(), targetUnit.code);
  }
}

export class IngredientConsistencyValidator extends DomainService {
  validate(ingredient: Ingredient, inventoryItemUnit: Unit): void {
    if (ingredient.requiredQuantity.unit !== inventoryItemUnit.code) inventoryInvariant('INVENTORY_INGREDIENT_UNIT_MISMATCH', 'Ingredient quantity must use the inventory item base unit');
  }
}
