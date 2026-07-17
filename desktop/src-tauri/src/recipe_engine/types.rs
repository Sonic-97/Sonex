use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IngredientCost {
    pub recipe_id: String,
    pub ingredient_id: String,
    pub ingredient_name: String,
    pub quantity: f64,
    pub unit: Option<String>,
    pub waste_percent: f64,
    pub cost_per_unit: i64,
    pub subtotal: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CostBreakdown {
    pub product_id: String,
    pub product_name: String,
    pub selling_price: i64,
    pub total_cost: i64,
    pub profit: i64,
    pub profit_margin: f64,
    pub ingredients: Vec<IngredientCost>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MissingIngredient {
    pub ingredient_id: String,
    pub ingredient_name: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecipeValidation {
    pub valid: bool,
    pub product_id: String,
    pub product_name: String,
    pub ingredient_count: usize,
    pub missing_ingredients: Vec<MissingIngredient>,
    pub total_cost: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BulkRecalculateResult {
    pub total_products: usize,
    pub updated: usize,
    pub errors: Vec<String>,
}
