use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::db::inventory::*;
use crate::db::inventory_category::*;
use crate::db::stock_movement::*;
use crate::server::AppState;

// ─── Query Parameters ───────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct PaginationParams {
    pub page: Option<i64>,
    pub limit: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct InventoryQuery {
    pub page: Option<i64>,
    pub limit: Option<i64>,
    pub search: Option<String>,
    pub category_id: Option<String>,
    pub supplier_id: Option<String>,
    pub low_stock: Option<bool>,
    pub active: Option<bool>,
    pub sort: Option<String>,
    pub order: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct PaginatedResponse<T: Serialize> {
    pub items: Vec<T>,
    pub total: i64,
    pub page: i64,
    pub limit: i64,
    pub total_pages: i64,
}

// ─── Inventory Items ─────────────────────────────────────────

pub async fn list_items(
    State(state): State<Arc<AppState>>,
    Query(q): Query<InventoryQuery>,
) -> Result<Json<PaginatedResponse<InventoryItem>>, (StatusCode, String)> {
    let cafe_id = "default"; // TODO: get from settings
    let page = q.page.unwrap_or(1).max(1);
    let limit = q.limit.unwrap_or(20).clamp(1, 100);
    let offset = (page - 1) * limit;

    let (items, total) = if let Some(query) = &q.search {
        if !query.is_empty() {
            let items = InventoryRepo::search(&state.db, cafe_id, query)
                .await
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
            let total = items.len() as i64;
            (items, total)
        } else {
            let items = InventoryRepo::find_all(&state.db, cafe_id)
                .await
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
            let total = items.len() as i64;
            (items, total)
        }
    } else if q.low_stock.unwrap_or(false) {
        let items = InventoryRepo::find_low_stock(&state.db, cafe_id)
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        let total = items.len() as i64;
        (items, total)
    } else if let Some(sup_id) = &q.supplier_id {
        let items = InventoryRepo::find_by_supplier(&state.db, cafe_id, sup_id)
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        let total = items.len() as i64;
        (items, total)
    } else {
        let items = InventoryRepo::find_all(&state.db, cafe_id)
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        let total = items.len() as i64;
        (items, total)
    };

    Ok(Json(PaginatedResponse {
        total,
        page,
        limit,
        total_pages: (total as f64 / limit as f64).ceil() as i64,
        items: items.into_iter().skip(offset as usize).take(limit as usize).collect(),
    }))
}

pub async fn get_item(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<InventoryItem>, (StatusCode, String)> {
    let cafe_id = "default";
    InventoryRepo::find_by_id(&state.db, &id, cafe_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or_else(|| (StatusCode::NOT_FOUND, format!("item not found: {}", id)))
        .map(Json)
}

pub async fn create_item(
    State(state): State<Arc<AppState>>,
    Json(input): Json<NewInventoryItem>,
) -> Result<Json<InventoryItem>, (StatusCode, String)> {
    let cafe_id = "default";
    let id = InventoryRepo::insert(&state.db, cafe_id, None, &input)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let item = InventoryRepo::find_by_id(&state.db, &id, cafe_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or_else(|| (StatusCode::INTERNAL_SERVER_ERROR, "created but not found".into()))?;

    Ok(Json(item))
}

pub async fn update_item(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(input): Json<UpdateInventoryItem>,
) -> Result<Json<InventoryItem>, (StatusCode, String)> {
    let cafe_id = "default";
    let mut update = input;
    update.id = id.clone();
    update.cafe_id = cafe_id.to_string();

    InventoryRepo::update(&state.db, &update)
        .await
        .map_err(|e| (StatusCode::CONFLICT, e.to_string()))?;

    let item = InventoryRepo::find_by_id(&state.db, &id, cafe_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or_else(|| (StatusCode::NOT_FOUND, format!("item not found: {}", id)))?;

    Ok(Json(item))
}

pub async fn delete_item(
    State(state): State<Arc<AppState>>,
    Path((id, version)): Path<(String, i32)>,
) -> Result<Json<()>, (StatusCode, String)> {
    let cafe_id = "default";
    InventoryRepo::soft_delete(&state.db, &id, cafe_id, version)
        .await
        .map_err(|e| (StatusCode::CONFLICT, e.to_string()))?;
    Ok(Json(()))
}

// ─── Stock Adjustment ────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct AdjustStockRequest {
    pub item_id: String,
    pub item_version: i32,
    pub quantity: f64,
    pub movement_type: String,
    pub reference_type: Option<String>,
    pub reference_id: Option<String>,
    pub notes: Option<String>,
    pub cost_per_unit: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct AdjustStockResponse {
    pub movement: StockMovement,
    pub new_qty: f64,
}

pub async fn adjust_stock(
    State(state): State<Arc<AppState>>,
    Json(input): Json<AdjustStockRequest>,
) -> Result<Json<AdjustStockResponse>, (StatusCode, String)> {
    let cafe_id = "default";

    let movement = StockMovementRepo::record_movement(
        &state.db,
        cafe_id,
        None,
        &input.item_id,
        input.item_version,
        input.quantity,
        &input.movement_type,
        input.reference_type.as_deref(),
        input.reference_id.as_deref(),
        input.notes.as_deref(),
        input.cost_per_unit,
    )
    .await
    .map_err(|e| (StatusCode::CONFLICT, e.to_string()))?;

    Ok(Json(AdjustStockResponse {
        new_qty: movement.new_qty,
        movement,
    }))
}

pub async fn list_movements(
    State(state): State<Arc<AppState>>,
    Path(item_id): Path<String>,
    Query(p): Query<PaginationParams>,
) -> Result<Json<PaginatedResponse<StockMovement>>, (StatusCode, String)> {
    let cafe_id = "default";
    let page = p.page.unwrap_or(1).max(1);
    let limit = p.limit.unwrap_or(20).clamp(1, 100);
    let offset = (page - 1) * limit;

    let total = StockMovementRepo::count_by_item(&state.db, cafe_id, &item_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let items = StockMovementRepo::find_by_item(&state.db, cafe_id, &item_id, limit, offset)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(PaginatedResponse {
        items,
        total,
        page,
        limit,
        total_pages: (total as f64 / limit as f64).ceil() as i64,
    }))
}

// ─── Inventory Categories ────────────────────────────────────

pub async fn list_categories(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<InventoryCategory>>, (StatusCode, String)> {
    let cafe_id = "default";
    InventoryCategoryRepo::find_all(&state.db, cafe_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
        .map(Json)
}

pub async fn create_category(
    State(state): State<Arc<AppState>>,
    Json(input): Json<NewInventoryCategory>,
) -> Result<Json<InventoryCategory>, (StatusCode, String)> {
    let cafe_id = "default";
    let id = InventoryCategoryRepo::insert(&state.db, cafe_id, None, &input)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let category = InventoryCategoryRepo::find_by_id(&state.db, &id, cafe_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or_else(|| (StatusCode::INTERNAL_SERVER_ERROR, "created but not found".into()))?;

    Ok(Json(category))
}

pub async fn update_category(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(input): Json<UpdateInventoryCategory>,
) -> Result<Json<InventoryCategory>, (StatusCode, String)> {
    let cafe_id = "default";
    let mut update = input;
    update.id = id.clone();
    update.cafe_id = cafe_id.to_string();

    InventoryCategoryRepo::update(&state.db, &update)
        .await
        .map_err(|e| (StatusCode::CONFLICT, e.to_string()))?;

    let category = InventoryCategoryRepo::find_by_id(&state.db, &id, cafe_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or_else(|| (StatusCode::NOT_FOUND, format!("category not found: {}", id)))?;

    Ok(Json(category))
}

pub async fn delete_category(
    State(state): State<Arc<AppState>>,
    Path((id, version)): Path<(String, i32)>,
) -> Result<Json<()>, (StatusCode, String)> {
    let cafe_id = "default";
    InventoryCategoryRepo::soft_delete(&state.db, &id, cafe_id, version)
        .await
        .map_err(|e| (StatusCode::CONFLICT, e.to_string()))?;
    Ok(Json(()))
}

// ─── Summary / Stats ─────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct InventorySummary {
    pub total_items: i64,
    pub low_stock_items: i64,
    pub total_value: i64,
    pub total_categories: i64,
}

pub async fn inventory_summary(
    State(state): State<Arc<AppState>>,
) -> Result<Json<InventorySummary>, (StatusCode, String)> {
    let cafe_id = "default";

    let total_items = InventoryRepo::count(&state.db, cafe_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let low_stock_items = InventoryRepo::count_low_stock(&state.db, cafe_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let total_value = InventoryRepo::total_value(&state.db, cafe_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let total_categories = InventoryCategoryRepo::count(&state.db, cafe_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(InventorySummary {
        total_items,
        low_stock_items,
        total_value,
        total_categories,
    }))
}
