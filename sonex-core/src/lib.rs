use napi_derive::napi;

// ─── Input types ───────────────────────────────────────────────────────────

#[napi(object)]
pub struct RecipeIngredientInput {
    pub quantity: f64,
    pub waste_percent: f64,
    pub cost_per_unit: f64,
}

#[napi(object)]
pub struct PackagingMaterialInput {
    pub quantity: f64,
    pub cost_per_unit: f64,
}

#[napi(object)]
pub struct IngredientBreakdownItem {
    pub item_name: String,
    pub quantity: f64,
    pub unit: String,
    pub cost_per_unit: f64,
    pub total: f64,
}

#[napi(object)]
pub struct LaborDetails {
    pub total_labor_cost_period: f64,
    pub total_orders_in_period: f64,
    pub product_order_count: f64,
}

#[napi(object)]
pub struct DateRangeInfo {
    pub from: String,
    pub to: String,
}

#[napi(object)]
pub struct CostBreakdownResult {
    pub product_id: String,
    pub product_name: String,
    pub selling_price: f64,
    pub estimated_cost: f64,
    pub estimated_profit: f64,
    pub profit_margin: f64,
    pub ingredient_cost: f64,
    pub ingredient_breakdown: Vec<IngredientBreakdownItem>,
    pub labor_cost: f64,
    pub labor_details: LaborDetails,
    pub operational_cost: f64,
    pub utility_cost: f64,
    pub miscellaneous_cost: f64,
    pub date_range: DateRangeInfo,
}

// ─── Costing input bundle for getCostBreakdown ─────────────────────────────

#[napi(object)]
pub struct CostBreakdownInput {
    pub product_id: String,
    pub product_name: String,
    pub selling_price: f64,
    pub ingredients: Vec<IngredientBreakdownItem>,
    pub total_labor_cost: f64,
    pub total_orders: f64,
    pub product_order_count: f64,
    pub total_items_sold: f64,
    pub total_operational_expenses: f64,
    pub total_utility_cost: f64,
    pub date_from: String,
    pub date_to: String,
}

// ─── computeProductCost ────────────────────────────────────────────────────

#[napi]
pub fn compute_product_cost(
    ingredients: Vec<RecipeIngredientInput>,
    packaging: Vec<PackagingMaterialInput>,
    product_cost: f64,
    cost_percent: f64,
) -> f64 {
    let ingredient_cost: f64 = if !ingredients.is_empty() {
        ingredients
            .iter()
            .map(|ing| {
                let waste_multiplier = 1.0 + ing.waste_percent / 100.0;
                ing.quantity * waste_multiplier * ing.cost_per_unit
            })
            .sum()
    } else {
        product_cost
    };

    let packaging_cost: f64 = packaging
        .iter()
        .map(|p| p.quantity * p.cost_per_unit)
        .sum();

    (ingredient_cost + packaging_cost) * (cost_percent / 100.0)
}

// ─── computeCostBreakdown ──────────────────────────────────────────────────

#[napi]
pub fn compute_cost_breakdown(input: CostBreakdownInput) -> CostBreakdownResult {
    let ingredient_cost: f64 = input
        .ingredients
        .iter()
        .map(|i| i.quantity * i.cost_per_unit)
        .sum();

    let labor_cost_per_product = if input.total_orders > 0.0 && input.total_items_sold > 0.0 {
        (input.total_labor_cost / input.total_orders)
            * (input.product_order_count / input.total_items_sold.max(1.0))
    } else {
        0.0
    };

    let operational_cost_per_product = if input.total_items_sold > 0.0 {
        (input.total_operational_expenses * 0.5) / input.total_items_sold
    } else {
        0.0
    };

    let utility_cost_per_product = if input.total_items_sold > 0.0 {
        input.total_utility_cost / input.total_items_sold
    } else {
        0.0
    };

    let misc_cost_per_product = if input.total_items_sold > 0.0 {
        (input.total_operational_expenses * 0.5) / input.total_items_sold
    } else {
        0.0
    };

    let estimated_cost = ingredient_cost
        + labor_cost_per_product
        + operational_cost_per_product
        + utility_cost_per_product
        + misc_cost_per_product;

    let estimated_profit = input.selling_price - estimated_cost;
    let profit_margin = if input.selling_price > 0.0 {
        (estimated_profit / input.selling_price) * 100.0
    } else {
        0.0
    };

    let round_2 = |v: f64| -> f64 { (v * 100.0).round() / 100.0 };

    CostBreakdownResult {
        product_id: input.product_id,
        product_name: input.product_name,
        selling_price: input.selling_price,
        estimated_cost: round_2(estimated_cost),
        estimated_profit: round_2(estimated_profit),
        profit_margin: round_2(profit_margin),
        ingredient_cost: round_2(ingredient_cost),
        ingredient_breakdown: input.ingredients,
        labor_cost: round_2(labor_cost_per_product),
        labor_details: LaborDetails {
            total_labor_cost_period: round_2(input.total_labor_cost),
            total_orders_in_period: input.total_orders,
            product_order_count: input.product_order_count,
        },
        operational_cost: round_2(operational_cost_per_product),
        utility_cost: round_2(utility_cost_per_product),
        miscellaneous_cost: round_2(misc_cost_per_product),
        date_range: DateRangeInfo {
            from: input.date_from,
            to: input.date_to,
        },
    }
}

// ─── Unit tests ────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_compute_product_cost_with_ingredients() {
        let ingredients = vec![
            RecipeIngredientInput { quantity: 10.0, waste_percent: 10.0, cost_per_unit: 0.5 },
            RecipeIngredientInput { quantity: 20.0, waste_percent: 0.0, cost_per_unit: 0.3 },
        ];
        let packaging = vec![
            PackagingMaterialInput { quantity: 1.0, cost_per_unit: 2.0 },
        ];
        // (10 * 1.1 * 0.5) + (20 * 1.0 * 0.3) = 5.5 + 6.0 = 11.5
        // packaging: 1 * 2.0 = 2.0
        // total = 13.5 * (100/100) = 13.5
        let result = compute_product_cost(ingredients, packaging, 0.0, 100.0);
        assert!((result - 13.5).abs() < f64::EPSILON);
    }

    #[test]
    fn test_compute_product_cost_with_size_adjustment() {
        let ingredients = vec![
            RecipeIngredientInput { quantity: 10.0, waste_percent: 0.0, cost_per_unit: 1.0 },
        ];
        // 10 * 1.0 * 1.0 = 10.0
        // packaging cost = 0
        // total = 10.0 * (80/100) = 8.0
        let result = compute_product_cost(ingredients, vec![], 0.0, 80.0);
        assert!((result - 8.0).abs() < f64::EPSILON);
    }

    #[test]
    fn test_compute_product_cost_no_recipe() {
        // No ingredients → use product_cost directly
        let result = compute_product_cost(vec![], vec![], 15.0, 100.0);
        assert!((result - 15.0).abs() < f64::EPSILON);
    }

    #[test]
    fn test_compute_product_cost_zero_cost_percent() {
        let ingredients = vec![
            RecipeIngredientInput { quantity: 10.0, waste_percent: 0.0, cost_per_unit: 1.0 },
        ];
        let result = compute_product_cost(ingredients, vec![], 0.0, 0.0);
        assert!((result - 0.0).abs() < f64::EPSILON);
    }

    #[test]
    fn test_compute_cost_breakdown_basic() {
        let input = CostBreakdownInput {
            product_id: "prod-1".into(),
            product_name: "Test Product".into(),
            selling_price: 50.0,
            ingredients: vec![
                IngredientBreakdownItem {
                    item_name: "Coffee".into(),
                    quantity: 10.0,
                    unit: "g".into(),
                    cost_per_unit: 0.5,
                    total: 5.0,
                },
            ],
            total_labor_cost: 1000.0,
            total_orders: 100.0,
            product_order_count: 10.0,
            total_items_sold: 200.0,
            total_operational_expenses: 5000.0,
            total_utility_cost: 500.0,
            date_from: "2026-07-01".into(),
            date_to: "2026-07-15".into(),
        };

        let result = compute_cost_breakdown(input);

        assert_eq!(result.product_id, "prod-1");
        assert_eq!(result.product_name, "Test Product");
        assert!((result.selling_price - 50.0).abs() < f64::EPSILON);
        // ingredient cost: 5.0
        assert!((result.ingredient_cost - 5.0).abs() < f64::EPSILON);
        // labor: (1000/100) * (10/200) = 10 * 0.05 = 0.5
        assert!((result.labor_cost - 0.5).abs() < f64::EPSILON);
        // operational: (5000*0.5)/200 = 2500/200 = 12.5
        assert!((result.operational_cost - 12.5).abs() < f64::EPSILON);
        // utility: 500/200 = 2.5
        assert!((result.utility_cost - 2.5).abs() < f64::EPSILON);
        // misc: (5000*0.5)/200 = 12.5
        assert!((result.miscellaneous_cost - 12.5).abs() < f64::EPSILON);
        // estimated cost: 5 + 0.5 + 12.5 + 2.5 + 12.5 = 33.0
        assert!((result.estimated_cost - 33.0).abs() < f64::EPSILON);
        // estimated profit: 50 - 33 = 17
        assert!((result.estimated_profit - 17.0).abs() < f64::EPSILON);
        // margin: 17/50 * 100 = 34
        assert!((result.profit_margin - 34.0).abs() < f64::EPSILON);
    }

    #[test]
    fn test_compute_cost_breakdown_zero_sales() {
        let input = CostBreakdownInput {
            product_id: "prod-2".into(),
            product_name: "Zero Sales".into(),
            selling_price: 20.0,
            ingredients: vec![],
            total_labor_cost: 1000.0,
            total_orders: 0.0,
            product_order_count: 0.0,
            total_items_sold: 0.0,
            total_operational_expenses: 0.0,
            total_utility_cost: 0.0,
            date_from: "2026-07-01".into(),
            date_to: "2026-07-15".into(),
        };

        let result = compute_cost_breakdown(input);

        assert_eq!(result.product_id, "prod-2");
        // All costs should be 0 when no items sold
        assert!((result.ingredient_cost - 0.0).abs() < f64::EPSILON);
        assert!((result.labor_cost - 0.0).abs() < f64::EPSILON);
        assert!((result.operational_cost - 0.0).abs() < f64::EPSILON);
        assert!((result.utility_cost - 0.0).abs() < f64::EPSILON);
        assert!((result.miscellaneous_cost - 0.0).abs() < f64::EPSILON);
        assert!((result.estimated_cost - 0.0).abs() < f64::EPSILON);
        assert!((result.estimated_profit - 20.0).abs() < f64::EPSILON);
        assert!((result.profit_margin - 100.0).abs() < f64::EPSILON);
    }

    #[test]
    fn test_rounding_precision() {
        let input = CostBreakdownInput {
            product_id: "p1".into(),
            product_name: "Rounding Test".into(),
            selling_price: 10.0,
            ingredients: vec![
                IngredientBreakdownItem {
                    item_name: "Milk".into(),
                    quantity: 1.0 / 3.0,
                    unit: "ml".into(),
                    cost_per_unit: 10.0,
                    total: 3.333333,
                },
            ],
            total_labor_cost: 100.0,
            total_orders: 3.0,
            product_order_count: 1.0,
            total_items_sold: 7.0,
            total_operational_expenses: 21.0,
            total_utility_cost: 7.0,
            date_from: "2026-07-01".into(),
            date_to: "2026-07-15".into(),
        };

        let result = compute_cost_breakdown(input);

        // ingredient_cost = (1/3) * 10 = 3.333... rounded to 3.33
        assert!((result.ingredient_cost - 3.33).abs() < 0.01);
        // All fields should be rounded to 2 decimal places
        assert!(
            (result.estimated_cost * 100.0 - (result.estimated_cost * 100.0).round()).abs()
                < f64::EPSILON
        );
    }
}
