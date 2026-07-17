use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::Deserialize;
use std::sync::Arc;

use crate::db::recipe::{NewRecipe, RecipeRepo, UpdateRecipe};
use crate::recipe_engine::types::{BulkRecalculateResult, CostBreakdown, RecipeValidation};
use crate::recipe_engine::RecipeEngineService;
use crate::server::AppState;

pub async fn list_recipes(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<crate::db::recipe::Recipe>>, (StatusCode, String)> {
    let cafe_id = "default";
    let recipes = RecipeRepo::find_all(&state.db, cafe_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(Json(recipes))
}

pub async fn get_recipe_by_product(
    State(state): State<Arc<AppState>>,
    Path(product_id): Path<String>,
) -> Result<Json<Vec<crate::db::recipe::Recipe>>, (StatusCode, String)> {
    let cafe_id = "default";
    let recipes = RecipeRepo::find_by_product(&state.db, cafe_id, &product_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(Json(recipes))
}

#[derive(Deserialize)]
pub struct CreateRecipePayload {
    pub product_id: String,
    pub ingredient_id: String,
    pub quantity: f64,
    pub unit: Option<String>,
    pub sort_order: Option<i32>,
    pub notes: Option<String>,
}

pub async fn create_recipe(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<CreateRecipePayload>,
) -> Result<Json<crate::db::recipe::Recipe>, (StatusCode, String)> {
    let cafe_id = "default";

    let new_recipe = NewRecipe {
        product_id: payload.product_id,
        ingredient_id: payload.ingredient_id,
        quantity: payload.quantity,
        unit: payload.unit,
        cost: None,
        sort_order: payload.sort_order,
        notes: payload.notes,
    };

    let id = RecipeRepo::insert(&state.db, cafe_id, None, &new_recipe)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let created = RecipeRepo::find_by_id(&state.db, &id, cafe_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or_else(|| (StatusCode::NOT_FOUND, "recipe not found after insert".to_string()))?;

    Ok(Json(created))
}

pub async fn update_recipe(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(payload): Json<UpdateRecipe>,
) -> Result<Json<crate::db::recipe::Recipe>, (StatusCode, String)> {
    let cafe_id = "default";
    let mut input = payload;
    input.id = id;

    RecipeRepo::update(&state.db, &input)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let updated = RecipeRepo::find_by_id(&state.db, &input.id, cafe_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or_else(|| (StatusCode::NOT_FOUND, "recipe not found after update".to_string()))?;

    Ok(Json(updated))
}

pub async fn delete_recipe(
    State(state): State<Arc<AppState>>,
    Path((id, version)): Path<(String, i32)>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let cafe_id = "default";
    RecipeRepo::soft_delete(&state.db, &id, cafe_id, version)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(Json(serde_json::json!({"ok": true})))
}

/// GET /api/recipes/cost-breakdown/:product_id
pub async fn get_cost_breakdown(
    State(state): State<Arc<AppState>>,
    Path(product_id): Path<String>,
) -> Result<Json<CostBreakdown>, (StatusCode, String)> {
    let cafe_id = "default";
    let breakdown = RecipeEngineService::get_cost_breakdown(&state.db, cafe_id, &product_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(Json(breakdown))
}

/// POST /api/recipes/validate/:product_id
pub async fn validate_recipe(
    State(state): State<Arc<AppState>>,
    Path(product_id): Path<String>,
) -> Result<Json<RecipeValidation>, (StatusCode, String)> {
    let cafe_id = "default";
    let validation = RecipeEngineService::validate_recipe(&state.db, cafe_id, &product_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(Json(validation))
}

/// POST /api/recipes/recalculate/:product_id
pub async fn recalculate_product(
    State(state): State<Arc<AppState>>,
    Path(product_id): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let cafe_id = "default";
    RecipeEngineService::update_product_cost(&state.db, cafe_id, &product_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let cost = RecipeEngineService::calculate_recipe_cost(&state.db, cafe_id, &product_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(Json(serde_json::json!({"product_id": product_id, "total_cost": cost})))
}

/// POST /api/recipes/bulk-recalculate
pub async fn bulk_recalculate(
    State(state): State<Arc<AppState>>,
) -> Result<Json<BulkRecalculateResult>, (StatusCode, String)> {
    let cafe_id = "default";
    let result = RecipeEngineService::bulk_recalculate(&state.db, cafe_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(Json(result))
}
