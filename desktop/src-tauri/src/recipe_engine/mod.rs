pub mod tests;
pub mod types;

use crate::db::error::{DbError, DbResult};
use crate::db::inventory::InventoryRepo;
use crate::db::product::ProductRepo;
use crate::db::recipe::{Recipe, RecipeRepo};
use crate::db::repo::now;
use crate::db::Database;
use tracing::info;

use self::types::*;

pub struct RecipeEngineService;

impl RecipeEngineService {
    /// Calculate the subtotal cost for a single recipe ingredient line.
    /// subtotal = ingredient.cost_per_unit * quantity * (1 + waste_percent / 100)
    pub async fn calculate_ingredient_cost(
        db: &Database,
        cafe_id: &str,
        recipe_id: &str,
    ) -> DbResult<i64> {
        let ingredient = RecipeRepo::find_by_id(db, recipe_id, cafe_id)
            .await?
            .ok_or_else(|| DbError::NotFound(format!("Recipe ingredient {}", recipe_id)))?;

        let inv_item = InventoryRepo::find_by_id(db, &ingredient.ingredient_id, cafe_id)
            .await?
            .ok_or_else(|| DbError::NotFound(format!("Inventory item {}", ingredient.ingredient_id)))?;

        let cost = Self::compute_ingredient_subtotal(
            inv_item.cost_per_unit,
            ingredient.quantity,
            0.0,
        );

        Ok(cost)
    }

    /// Compute ingredient subtotal from cost_per_unit, quantity, and waste_percent.
    fn compute_ingredient_subtotal(
        cost_per_unit: i64,
        quantity: f64,
        waste_percent: f64,
    ) -> i64 {
        let effective_qty = quantity * (1.0 + waste_percent / 100.0);
        (cost_per_unit as f64 * effective_qty).round() as i64
    }

    /// Update the stored cost on a recipe row to match current inventory pricing + waste.
    pub async fn update_stored_ingredient_cost(
        db: &Database,
        cafe_id: &str,
        recipe: &Recipe,
    ) -> DbResult<()> {
        let inv_item = InventoryRepo::find_by_id(db, &recipe.ingredient_id, cafe_id)
            .await?;

        let subtotal = match inv_item {
            Some(ref item) => Self::compute_ingredient_subtotal(
                item.cost_per_unit,
                recipe.quantity,
                0.0,
            ),
            None => {
                info!(
                    "inventory item {} not found for recipe {}, setting cost to 0",
                    recipe.ingredient_id, recipe.id
                );
                0
            }
        };

        let now_ts = now();
        sqlx::query(
            "UPDATE recipes SET cost = ?, version = version + 1, updated_at = ? WHERE id = ? AND cafe_id = ? AND deleted_at IS NULL",
        )
        .bind(subtotal)
        .bind(&now_ts)
        .bind(&recipe.id)
        .bind(cafe_id)
        .execute(&db.pool)
        .await?;

        Ok(())
    }

    /// Calculate total recipe cost for a product (sum of all ingredient subtotals).
    pub async fn calculate_recipe_cost(
        db: &Database,
        cafe_id: &str,
        product_id: &str,
    ) -> DbResult<i64> {
        let ingredients = RecipeRepo::find_by_product(db, cafe_id, product_id).await?;
        let mut total: i64 = 0;

        for ing in &ingredients {
            let inv = InventoryRepo::find_by_id(db, &ing.ingredient_id, cafe_id).await?;
            if let Some(item) = inv {
                total += Self::compute_ingredient_subtotal(
                    item.cost_per_unit,
                    ing.quantity,
                    0.0,
                );
            }
        }

        Ok(total)
    }

    /// Update product.cost to match the calculated recipe cost.
    pub async fn update_product_cost(
        db: &Database,
        cafe_id: &str,
        product_id: &str,
    ) -> DbResult<()> {
        let product = ProductRepo::find_by_id(db, product_id, cafe_id)
            .await?
            .ok_or_else(|| DbError::NotFound(format!("Product {}", product_id)))?;

        let total_cost = Self::calculate_recipe_cost(db, cafe_id, product_id).await?;

        let now_ts = now();
        sqlx::query(
            "UPDATE products SET cost = ?, version = version + 1, updated_at = ? WHERE id = ? AND cafe_id = ? AND deleted_at IS NULL",
        )
        .bind(total_cost)
        .bind(&now_ts)
        .bind(product_id)
        .bind(cafe_id)
        .execute(&db.pool)
        .await?;

        if product.cost.map_or(true, |old| old != total_cost) {
            info!(
                "product {} cost updated: {:?} -> {}",
                product.name,
                product.cost,
                total_cost
            );
        }

        Ok(())
    }

    /// Validate a recipe — ensures all ingredients exist, are active, and have stock.
    pub async fn validate_recipe(
        db: &Database,
        cafe_id: &str,
        product_id: &str,
    ) -> DbResult<RecipeValidation> {
        let product = ProductRepo::find_by_id(db, product_id, cafe_id)
            .await?
            .ok_or_else(|| DbError::NotFound(format!("Product {}", product_id)))?;

        let ingredients = RecipeRepo::find_by_product(db, cafe_id, product_id).await?;
        let mut missing: Vec<MissingIngredient> = Vec::new();

        for ing in &ingredients {
            let inv = InventoryRepo::find_by_id(db, &ing.ingredient_id, cafe_id).await?;
            match inv {
                None => missing.push(MissingIngredient {
                    ingredient_id: ing.ingredient_id.clone(),
                    ingredient_name: ing.ingredient_id.clone(),
                    reason: "not_found".to_string(),
                }),
                Some(ref item) => {
                    if item.active == 0 {
                        missing.push(MissingIngredient {
                            ingredient_id: ing.ingredient_id.clone(),
                            ingredient_name: item.name.clone(),
                            reason: "inactive".to_string(),
                        });
                    } else if item.current_qty <= 0.0 {
                        missing.push(MissingIngredient {
                            ingredient_id: ing.ingredient_id.clone(),
                            ingredient_name: item.name.clone(),
                            reason: "out_of_stock".to_string(),
                        });
                    }
                }
            }
        }

        let total_cost = Self::calculate_recipe_cost(db, cafe_id, product_id).await?;

        Ok(RecipeValidation {
            valid: missing.is_empty(),
            product_id: product_id.to_string(),
            product_name: product.name,
            ingredient_count: ingredients.len(),
            missing_ingredients: missing,
            total_cost,
        })
    }

    /// Get detailed cost breakdown for a product's recipe.
    pub async fn get_cost_breakdown(
        db: &Database,
        cafe_id: &str,
        product_id: &str,
    ) -> DbResult<CostBreakdown> {
        let product = ProductRepo::find_by_id(db, product_id, cafe_id)
            .await?
            .ok_or_else(|| DbError::NotFound(format!("Product {}", product_id)))?;

        let ingredients = RecipeRepo::find_by_product(db, cafe_id, product_id).await?;
        let mut ingredient_costs: Vec<IngredientCost> = Vec::new();
        let mut total_cost: i64 = 0;

        for ing in &ingredients {
            let inv = InventoryRepo::find_by_id(db, &ing.ingredient_id, cafe_id).await?;
            let inv_name: String;
            let cost_per_unit: i64;

            if let Some(ref item) = inv {
                inv_name = item.name.clone();
                cost_per_unit = item.cost_per_unit;
            } else {
                inv_name = ing.ingredient_id.clone();
                cost_per_unit = 0;
            }

            let subtotal = Self::compute_ingredient_subtotal(cost_per_unit, ing.quantity, 0.0);
            total_cost += subtotal;

            ingredient_costs.push(IngredientCost {
                recipe_id: ing.id.clone(),
                ingredient_id: ing.ingredient_id.clone(),
                ingredient_name: inv_name,
                quantity: ing.quantity,
                unit: ing.unit.clone(),
                waste_percent: 0.0,
                cost_per_unit,
                subtotal,
            });
        }

        let profit = product.price - total_cost;
        let profit_margin = if product.price > 0 {
            (profit as f64 / product.price as f64) * 100.0
        } else {
            0.0
        };

        Ok(CostBreakdown {
            product_id: product_id.to_string(),
            product_name: product.name,
            selling_price: product.price,
            total_cost,
            profit,
            profit_margin,
            ingredients: ingredient_costs,
        })
    }

    /// Triggered when inventory cost changes. Recalculates all recipes using that ingredient.
    /// Returns the number of products whose cost was updated.
    pub async fn on_inventory_cost_changed(
        db: &Database,
        cafe_id: &str,
        inventory_item_id: &str,
    ) -> DbResult<usize> {
        let affected_recipes = RecipeRepo::find_by_ingredient(db, cafe_id, inventory_item_id).await?;
        let mut updated_count = 0usize;

        let mut processed_products: std::collections::HashSet<String> = std::collections::HashSet::new();

        for recipe in &affected_recipes {
            Self::update_stored_ingredient_cost(db, cafe_id, recipe).await?;

            if processed_products.insert(recipe.product_id.clone()) {
                Self::update_product_cost(db, cafe_id, &recipe.product_id).await?;
                updated_count += 1;
            }
        }

        Ok(updated_count)
    }

    /// Bulk recalculate all products that have recipes.
    pub async fn bulk_recalculate(
        db: &Database,
        cafe_id: &str,
    ) -> DbResult<BulkRecalculateResult> {
        let products = ProductRepo::find_all(db, cafe_id).await?;
        let mut total = 0usize;
        let mut updated = 0usize;
        let mut errors: Vec<String> = Vec::new();

        for product in &products {
            let ingredients = RecipeRepo::find_by_product(db, cafe_id, &product.id).await?;
            if ingredients.is_empty() {
                continue;
            }
            total += 1;

            for ing in &ingredients {
                if let Err(e) = Self::update_stored_ingredient_cost(db, cafe_id, ing).await {
                    errors.push(format!("failed to update ingredient {}: {}", ing.id, e));
                }
            }

            match Self::update_product_cost(db, cafe_id, &product.id).await {
                Ok(_) => {
                    updated += 1;
                }
                Err(e) => {
                    errors.push(format!("failed to update product {}: {}", product.name, e));
                }
            }
        }

        Ok(BulkRecalculateResult {
            total_products: total,
            updated,
            errors,
        })
    }
}
