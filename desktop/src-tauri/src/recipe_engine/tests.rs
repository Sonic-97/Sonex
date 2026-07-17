#[cfg(test)]
mod tests {
    use crate::db::inventory::{InventoryRepo, NewInventoryItem};
    use crate::db::product::{NewProduct, ProductRepo};
    use crate::db::recipe::{NewRecipe, RecipeRepo};
    use crate::db::Database;
    use uuid::Uuid;

    use crate::recipe_engine::types::*;
    use crate::recipe_engine::RecipeEngineService;

    async fn test_db() -> Database {
        let dir = std::env::temp_dir().join(format!("sonic_recipe_test_{}", Uuid::new_v4()));
        std::fs::create_dir_all(&dir).ok();
        let db = Database::connect(&dir).await.unwrap();
        db.run_migrations().await.unwrap();
        sqlx::query("INSERT OR IGNORE INTO cafes (id, name) VALUES ('cafe-test', 'Test Cafe')")
            .execute(&db.pool)
            .await
            .unwrap();
        db
    }

    async fn seed_product(db: &Database, name: &str, price: i64) -> String {
        let new_p = NewProduct {
            name: name.to_string(),
            description: None,
            price,
            cost: None,
            sku: None,
            barcode: None,
            active: Some(1),
            category_id: None,
            unit: Some("piece".to_string()),
            tax_rate: Some(0),
            tax_inclusive: Some(1),
            image_url: None,
            sort_order: Some(0),
            tags: None,
            is_refrigerated: Some(0),
            refrigerator_category_id: None,
            prep_time_seconds: None,
        };
        ProductRepo::insert(db, "cafe-test", None, &new_p)
            .await
            .unwrap()
    }

    async fn seed_inventory(db: &Database, name: &str, cost_per_unit: i64, qty: f64) -> String {
        let new_inv = NewInventoryItem {
            branch_id: None,
            product_id: None,
            name: name.to_string(),
            sku: None,
            category: None,
            unit: Some("g".to_string()),
            purchase_unit: None,
            consumption_unit: None,
            conversion_ratio: Some(1.0),
            current_qty: qty,
            min_qty: Some(0.0),
            max_qty: Some(1000.0),
            cost_per_unit,
            supplier_id: None,
            barcode: None,
            location: None,
            inventory_category_id: None,
            active: Some(1),
        };
        InventoryRepo::insert(db, "cafe-test", None, &new_inv)
            .await
            .unwrap()
    }

    #[tokio::test]
    async fn test_compute_ingredient_subtotal() {
        // cost_per_unit=100, quantity=2.5, waste=0 => 250
        let cost = RecipeEngineService::compute_ingredient_subtotal(100, 2.5, 0.0);
        assert_eq!(cost, 250);

        // with 10% waste: 100 * 2.5 * 1.1 = 275
        let cost = RecipeEngineService::compute_ingredient_subtotal(100, 2.5, 10.0);
        assert_eq!(cost, 275);
    }

    #[tokio::test]
    async fn test_calculate_recipe_cost() {
        let db = test_db().await;
        let cafe_id = "cafe-test";

        let product_id = seed_product(&db, "Espresso", 500).await;
        let coffee_id = seed_inventory(&db, "Coffee Beans", 50, 1000.0).await;
        let water_id = seed_inventory(&db, "Water", 10, 5000.0).await;

        // Add recipe ingredients
        let r1 = NewRecipe {
            product_id: product_id.clone(),
            ingredient_id: coffee_id,
            quantity: 10.0,
            unit: Some("g".to_string()),
            cost: None,
            sort_order: Some(0),
            notes: None,
        };
        let r2 = NewRecipe {
            product_id: product_id.clone(),
            ingredient_id: water_id,
            quantity: 30.0,
            unit: Some("ml".to_string()),
            cost: None,
            sort_order: Some(1),
            notes: None,
        };
        RecipeRepo::insert(&db, cafe_id, None, &r1).await.unwrap();
        RecipeRepo::insert(&db, cafe_id, None, &r2).await.unwrap();

        // coffee: 50 * 10 = 500, water: 10 * 30 = 300 => total 800
        let total = RecipeEngineService::calculate_recipe_cost(&db, cafe_id, &product_id)
            .await
            .unwrap();
        assert_eq!(total, 800);
    }

    #[tokio::test]
    async fn test_update_product_cost() {
        let db = test_db().await;
        let cafe_id = "cafe-test";

        let product_id = seed_product(&db, "Latte", 600).await;
        let milk_id = seed_inventory(&db, "Milk", 20, 2000.0).await;

        let r = NewRecipe {
            product_id: product_id.clone(),
            ingredient_id: milk_id,
            quantity: 15.0,
            unit: Some("ml".to_string()),
            cost: None,
            sort_order: Some(0),
            notes: None,
        };
        RecipeRepo::insert(&db, cafe_id, None, &r).await.unwrap();

        RecipeEngineService::update_product_cost(&db, cafe_id, &product_id)
            .await
            .unwrap();

        let product = ProductRepo::find_by_id(&db, &product_id, cafe_id)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(product.cost, Some(300)); // 20 * 15 = 300
    }

    #[tokio::test]
    async fn test_validate_recipe_ok() {
        let db = test_db().await;
        let cafe_id = "cafe-test";

        let product_id = seed_product(&db, "Mocha", 700).await;
        let choc_id = seed_inventory(&db, "Chocolate", 100, 500.0).await;

        let r = NewRecipe {
            product_id: product_id.clone(),
            ingredient_id: choc_id,
            quantity: 5.0,
            unit: Some("g".to_string()),
            cost: None,
            sort_order: Some(0),
            notes: None,
        };
        RecipeRepo::insert(&db, cafe_id, None, &r).await.unwrap();

        let validation = RecipeEngineService::validate_recipe(&db, cafe_id, &product_id)
            .await
            .unwrap();

        assert!(validation.valid);
        assert_eq!(validation.ingredient_count, 1);
    }

    #[tokio::test]
    async fn test_validate_recipe_inactive_ingredient() {
        let db = test_db().await;
        let cafe_id = "cafe-test";

        let product_id = seed_product(&db, "Mystery Drink", 500).await;
        let ing_id = seed_inventory(&db, "Secret Syrup", 50, 500.0).await;

        let r = NewRecipe {
            product_id: product_id.clone(),
            ingredient_id: ing_id.clone(),
            quantity: 1.0,
            unit: Some("piece".to_string()),
            cost: None,
            sort_order: Some(0),
            notes: None,
        };
        RecipeRepo::insert(&db, cafe_id, None, &r).await.unwrap();

        // Mark ingredient as inactive
        sqlx::query("UPDATE inventory_items SET active = 0 WHERE id = ? AND cafe_id = ?")
            .bind(&ing_id)
            .bind(cafe_id)
            .execute(&db.pool)
            .await
            .unwrap();

        let validation = RecipeEngineService::validate_recipe(&db, cafe_id, &product_id)
            .await
            .unwrap();

        assert!(!validation.valid);
        assert_eq!(validation.missing_ingredients.len(), 1);
        assert_eq!(validation.missing_ingredients[0].reason, "inactive");
    }

    #[tokio::test]
    async fn test_get_cost_breakdown() {
        let db = test_db().await;
        let cafe_id = "cafe-test";

        let product_id = seed_product(&db, "Americano", 400).await;
        let coffee_id = seed_inventory(&db, "Coffee", 80, 1000.0).await;
        let water_id = seed_inventory(&db, "Hot Water", 5, 10000.0).await;

        let r1 = NewRecipe {
            product_id: product_id.clone(),
            ingredient_id: coffee_id,
            quantity: 8.0,
            unit: Some("g".to_string()),
            cost: None,
            sort_order: Some(0),
            notes: None,
        };
        let r2 = NewRecipe {
            product_id: product_id.clone(),
            ingredient_id: water_id,
            quantity: 60.0,
            unit: Some("ml".to_string()),
            cost: None,
            sort_order: Some(1),
            notes: None,
        };
        RecipeRepo::insert(&db, cafe_id, None, &r1).await.unwrap();
        RecipeRepo::insert(&db, cafe_id, None, &r2).await.unwrap();

        let breakdown = RecipeEngineService::get_cost_breakdown(&db, cafe_id, &product_id)
            .await
            .unwrap();

        assert_eq!(breakdown.product_name, "Americano");
        assert_eq!(breakdown.total_cost, 940); // (80*8) + (5*60) = 640 + 300 = 940
        assert_eq!(breakdown.selling_price, 400);
        assert_eq!(breakdown.profit, 400 - 940); // negative, selling below cost
        assert_eq!(breakdown.ingredients.len(), 2);
    }

    #[tokio::test]
    async fn test_on_inventory_cost_changed() {
        let db = test_db().await;
        let cafe_id = "cafe-test";

        let product_id = seed_product(&db, "Cappuccino", 550).await;
        let milk_id = seed_inventory(&db, "Milk", 30, 2000.0).await;

        let r = NewRecipe {
            product_id: product_id.clone(),
            ingredient_id: milk_id.clone(),
            quantity: 10.0,
            unit: Some("ml".to_string()),
            cost: None,
            sort_order: Some(0),
            notes: None,
        };
        RecipeRepo::insert(&db, cafe_id, None, &r).await.unwrap();

        // Initial cost: 30 * 10 = 300
        RecipeEngineService::update_product_cost(&db, cafe_id, &product_id)
            .await
            .unwrap();

        // Change inventory cost from 30 to 50
        let inv = InventoryRepo::find_by_id(&db, &milk_id, cafe_id)
            .await
            .unwrap()
            .unwrap();
        let update = crate::db::inventory::UpdateInventoryItem {
            id: milk_id.clone(),
            cafe_id: cafe_id.to_string(),
            version: inv.version,
            branch_id: inv.branch_id,
            product_id: inv.product_id,
            name: inv.name,
            sku: inv.sku,
            category: inv.category,
            unit: inv.unit,
            purchase_unit: inv.purchase_unit,
            consumption_unit: inv.consumption_unit,
            conversion_ratio: inv.conversion_ratio,
            current_qty: inv.current_qty,
            min_qty: inv.min_qty,
            max_qty: inv.max_qty,
            cost_per_unit: 50,
            supplier_id: inv.supplier_id,
            barcode: inv.barcode,
            location: inv.location,
            inventory_category_id: inv.inventory_category_id,
            active: inv.active,
            updated_by: None,
        };
        InventoryRepo::update(&db, &update).await.unwrap();

        // Trigger cascade
        let updated = RecipeEngineService::on_inventory_cost_changed(&db, cafe_id, &milk_id)
            .await
            .unwrap();
        assert_eq!(updated, 1);

        let product = ProductRepo::find_by_id(&db, &product_id, cafe_id)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(product.cost, Some(500)); // 50 * 10 = 500
    }

    #[tokio::test]
    async fn test_bulk_recalculate() {
        let db = test_db().await;
        let cafe_id = "cafe-test";

        let p1 = seed_product(&db, "P1", 500).await;
        let p2 = seed_product(&db, "P2", 500).await;
        let ing1 = seed_inventory(&db, "Ing1", 100, 100.0).await;
        let ing2 = seed_inventory(&db, "Ing2", 200, 100.0).await;

        // Only p1 has a recipe
        let r = NewRecipe {
            product_id: p1.clone(),
            ingredient_id: ing1,
            quantity: 2.0,
            unit: Some("g".to_string()),
            cost: None,
            sort_order: Some(0),
            notes: None,
        };
        RecipeRepo::insert(&db, cafe_id, None, &r).await.unwrap();

        // p2 has a recipe too
        let r2 = NewRecipe {
            product_id: p2.clone(),
            ingredient_id: ing2,
            quantity: 3.0,
            unit: Some("g".to_string()),
            cost: None,
            sort_order: Some(0),
            notes: None,
        };
        RecipeRepo::insert(&db, cafe_id, None, &r2).await.unwrap();

        let result = RecipeEngineService::bulk_recalculate(&db, cafe_id)
            .await
            .unwrap();

        assert_eq!(result.total_products, 2);
        assert_eq!(result.updated, 2);
        assert!(result.errors.is_empty());

        let prod1 = ProductRepo::find_by_id(&db, &p1, cafe_id)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(prod1.cost, Some(200)); // 100 * 2

        let prod2 = ProductRepo::find_by_id(&db, &p2, cafe_id)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(prod2.cost, Some(600)); // 200 * 3
    }
}
