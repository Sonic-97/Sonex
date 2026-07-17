use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::db::pos_favorite::FavoriteWithProduct;
use crate::db::pos_modifier::ModifierGroupWithOptions;
use crate::db::pos_printer::PrinterInput;
use crate::db::pos_audit::AuditLogEntry;
use crate::pos_engine::types::*;
use crate::pos_engine::POSEngine;
use crate::server::AppState;

// ─── Query / Request DTOs ─────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct SearchQuery {
    pub q: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct StaffQuery {
    pub staff_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ToggleFavoriteBody {
    pub staff_id: String,
    pub product_id: String,
}

#[derive(Debug, Deserialize)]
pub struct DateRangeQuery {
    pub since: Option<String>,
    pub action: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct AddPaymentBody {
    pub method: String,
    pub amount: i64,
    pub reference: Option<String>,
    pub staff_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ApplyDiscountBody {
    pub name: String,
    pub discount_type: String,
    pub value: i64,
    pub item_id: Option<String>,
    pub staff_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct RemoveDiscountQuery {
    pub discount_id: String,
}

#[derive(Debug, Deserialize)]
pub struct CancelOrderBody {
    pub reason: String,
    pub staff_id: Option<String>,
}

// ─── Product Search & Barcode ─────────────────────────────────

pub async fn search_products(
    State(state): State<Arc<AppState>>,
    Query(q): Query<SearchQuery>,
) -> Result<Json<Vec<ProductSearchResult>>, (StatusCode, String)> {
    let cafe_id = "default";
    let query = q.q.unwrap_or_default();
    if query.is_empty() {
        return Ok(Json(vec![]));
    }
    let engine = POSEngine::new(state.db.clone());
    engine.search_products(cafe_id, &query)
        .await
        .map(Json)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

pub async fn find_by_barcode(
    State(state): State<Arc<AppState>>,
    Path(barcode): Path<String>,
) -> Result<Json<ProductSearchResult>, (StatusCode, String)> {
    let cafe_id = "default";
    let engine = POSEngine::new(state.db.clone());
    engine.find_by_barcode(cafe_id, &barcode)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or_else(|| (StatusCode::NOT_FOUND, format!("Product not found: {}", barcode)))
        .map(Json)
}

// ─── Categories ───────────────────────────────────────────────

pub async fn get_categories(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<CategoryWithProducts>>, (StatusCode, String)> {
    let cafe_id = "default";
    let engine = POSEngine::new(state.db.clone());
    engine.get_categories_with_products(cafe_id)
        .await
        .map(Json)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

// ─── Favorites ────────────────────────────────────────────────

pub async fn list_favorites(
    State(state): State<Arc<AppState>>,
    Query(q): Query<StaffQuery>,
) -> Result<Json<Vec<crate::db::pos_favorite::FavoriteWithProduct>>, (StatusCode, String)> {
    let cafe_id = "default";
    let staff_id = q.staff_id.as_deref().unwrap_or("default");
    let engine = POSEngine::new(state.db.clone());
    engine.get_favorites(cafe_id, staff_id)
        .await
        .map(Json)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

pub async fn toggle_favorite(
    State(state): State<Arc<AppState>>,
    Json(body): Json<ToggleFavoriteBody>,
) -> Result<Json<bool>, (StatusCode, String)> {
    let cafe_id = "default";
    let engine = POSEngine::new(state.db.clone());
    engine.toggle_favorite(cafe_id, &body.staff_id, &body.product_id)
        .await
        .map(Json)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

// ─── ProductOption Sync ────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncProductOptionChoice {
    pub label: String,
    pub price_adjust: Option<f64>,
    pub sort_order: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncProductOption {
    pub id: String,
    pub name: String,
    pub required: Option<bool>,
    pub multi_select: Option<bool>,
    pub sort_order: Option<i64>,
    pub choices: Vec<SyncProductOptionChoice>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncProductOptionsPayload {
    pub product_id: String,
    pub options: Vec<SyncProductOption>,
}

pub async fn sync_product_options(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<SyncProductOptionsPayload>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    use crate::db::pos_modifier::PosModifierRepo;
    let cafe_id = "default";
    let db = &state.db;

    // For each incoming ProductOption, upsert as a ModifierGroup + ModifierOptions
    for opt in &payload.options {
        let group_id = format!("sync_{}", opt.id);

        // Upsert group
        let existing = PosModifierRepo::find_group(db, &group_id, cafe_id).await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

        let min_select: i64 = if opt.required.unwrap_or(false) { 1 } else { 0 };
        let max_select: i64 = if opt.multi_select.unwrap_or(false) { 999 } else { 1 };
        let sort_order = opt.sort_order.unwrap_or(0);

        if existing.is_some() {
            // Update
            let update = crate::db::pos_modifier::UpdateModifierGroup {
                id: group_id.clone(),
                name: Some(opt.name.clone()),
                min_select: Some(min_select),
                max_select: Some(max_select),
                required: Some(if opt.required.unwrap_or(false) { 1 } else { 0 }),
                sort_order: Some(sort_order),
                active: Some(1),
            };
            PosModifierRepo::update_group(db, cafe_id, &update).await
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        } else {
            // Create
            let new_group = crate::db::pos_modifier::NewModifierGroup {
                name: opt.name.clone(),
                min_select: Some(min_select),
                max_select: Some(max_select),
                required: Some(if opt.required.unwrap_or(false) { 1 } else { 0 }),
                sort_order: Some(sort_order),
            };
            PosModifierRepo::create_group(db, cafe_id, &new_group).await
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        }

        // Link product to group
        PosModifierRepo::link_product(db, &payload.product_id, &group_id).await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

        // Process choices as ModifierOptions
        let existing_options = sqlx::query_as::<_, crate::db::pos_modifier::ModifierOption>(
            "SELECT * FROM pos_modifier_options WHERE group_id = ? AND deleted_at IS NULL",
        )
        .bind(&group_id)
        .fetch_all(&db.pool)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

        for (idx, choice) in opt.choices.iter().enumerate() {
            let option_id = format!("sync_{}_{}", opt.id, idx);
            let price_adjustment = ((choice.price_adjust.unwrap_or(0.0) * 100.0).round() as i64).max(0);
            let sort_order = choice.sort_order.unwrap_or(idx as i64);

            let exists = existing_options.iter().any(|o| o.id == option_id);
            if exists {
                sqlx::query(
                    "UPDATE pos_modifier_options SET name = ?, price_adjustment = ?, sort_order = ? WHERE id = ? AND deleted_at IS NULL",
                )
                .bind(&choice.label)
                .bind(price_adjustment)
                .bind(sort_order)
                .bind(&option_id)
                .execute(&db.pool)
                .await
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
            } else {
                // Insert with specific id
                sqlx::query(
                    r#"
                    INSERT INTO pos_modifier_options (id, cafe_id, group_id, name, price_adjustment, sort_order, active)
                    VALUES (?, ?, ?, ?, ?, ?, 1)
                    "#,
                )
                .bind(&option_id)
                .bind(cafe_id)
                .bind(&group_id)
                .bind(&choice.label)
                .bind(price_adjustment)
                .bind(sort_order)
                .execute(&db.pool)
                .await
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
            }
        }
    }

    Ok(Json(serde_json::json!({
        "status": "synced",
        "productId": payload.product_id,
        "optionCount": payload.options.len(),
    })))
}

// ─── Modifiers ────────────────────────────────────────────────

pub async fn get_product_modifiers(
    State(state): State<Arc<AppState>>,
    Path(product_id): Path<String>,
) -> Result<Json<Vec<crate::db::pos_modifier::ModifierGroupWithOptions>>, (StatusCode, String)> {
    let cafe_id = "default";
    let engine = POSEngine::new(state.db.clone());
    engine.get_product_modifiers(cafe_id, &product_id)
        .await
        .map(Json)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

// ─── Orders ───────────────────────────────────────────────────

pub async fn create_order(
    State(state): State<Arc<AppState>>,
    Json(input): Json<CreatePOSOrder>,
) -> Result<Json<POSOrder>, (StatusCode, String)> {
    let cafe_id = "default";
    let engine = POSEngine::new(state.db.clone());
    engine.create_order(cafe_id, &input)
        .await
        .map(Json)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

pub async fn get_order(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<POSOrder>, (StatusCode, String)> {
    let cafe_id = "default";
    let engine = POSEngine::new(state.db.clone());
    engine.get_order(cafe_id, &id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or_else(|| (StatusCode::NOT_FOUND, format!("Order not found: {}", id)))
        .map(Json)
}

pub async fn list_orders(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<POSOrder>>, (StatusCode, String)> {
    let cafe_id = "default";
    let engine = POSEngine::new(state.db.clone());
    engine.get_today_orders(cafe_id)
        .await
        .map(Json)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

pub async fn list_active_orders(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<POSOrder>>, (StatusCode, String)> {
    let cafe_id = "default";
    let engine = POSEngine::new(state.db.clone());
    engine.get_active_orders(cafe_id)
        .await
        .map(Json)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

pub async fn get_next_number(
    State(state): State<Arc<AppState>>,
) -> Result<Json<i64>, (StatusCode, String)> {
    let cafe_id = "default";
    let engine = POSEngine::new(state.db.clone());
    engine.next_order_number(cafe_id)
        .await
        .map(Json)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

// ─── Payments ─────────────────────────────────────────────────

pub async fn add_payment(
    State(state): State<Arc<AppState>>,
    Path(order_id): Path<String>,
    Json(body): Json<AddPaymentBody>,
) -> Result<Json<POSOrder>, (StatusCode, String)> {
    let cafe_id = "default";
    let engine = POSEngine::new(state.db.clone());
    let payment = PaymentInput {
        method: body.method,
        amount: body.amount,
        reference: body.reference,
    };
    engine.add_payment(cafe_id, &order_id, &payment, body.staff_id.as_deref())
        .await
        .map(Json)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

// ─── Discounts ────────────────────────────────────────────────

pub async fn apply_discount(
    State(state): State<Arc<AppState>>,
    Path(order_id): Path<String>,
    Json(body): Json<ApplyDiscountBody>,
) -> Result<Json<POSOrder>, (StatusCode, String)> {
    let cafe_id = "default";
    let engine = POSEngine::new(state.db.clone());
    let discount = DiscountInput {
        name: body.name,
        discount_type: body.discount_type,
        value: body.value,
        item_id: body.item_id,
    };
    engine.apply_discount(cafe_id, &order_id, &discount, body.staff_id.as_deref())
        .await
        .map(Json)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

pub async fn remove_discount(
    State(state): State<Arc<AppState>>,
    Path((order_id, discount_id)): Path<(String, String)>,
) -> Result<Json<POSOrder>, (StatusCode, String)> {
    let cafe_id = "default";
    let engine = POSEngine::new(state.db.clone());
    engine.remove_discount(cafe_id, &order_id, &discount_id)
        .await
        .map(Json)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

// ─── Cancel ───────────────────────────────────────────────────

pub async fn cancel_order(
    State(state): State<Arc<AppState>>,
    Path(order_id): Path<String>,
    Json(body): Json<CancelOrderBody>,
) -> Result<Json<POSOrder>, (StatusCode, String)> {
    let cafe_id = "default";
    let engine = POSEngine::new(state.db.clone());
    engine.cancel_order(cafe_id, &order_id, &body.reason, body.staff_id.as_deref())
        .await
        .map(Json)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

// ─── Refund ───────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct RefundBody {
    pub amount: i64,
    pub reason: String,
    pub item_ids: Option<Vec<String>>,
    pub staff_id: Option<String>,
}

pub async fn process_refund(
    State(state): State<Arc<AppState>>,
    Path(order_id): Path<String>,
    Json(body): Json<RefundBody>,
) -> Result<Json<POSOrder>, (StatusCode, String)> {
    let cafe_id = "default";
    let engine = POSEngine::new(state.db.clone());
    let refund = RefundInput {
        amount: body.amount,
        reason: body.reason,
        item_ids: body.item_ids,
        staff_id: body.staff_id,
    };
    engine.process_refund(cafe_id, &order_id, &refund)
        .await
        .map(Json)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

// ─── Sales Summary ────────────────────────────────────────────

pub async fn sales_summary(
    State(state): State<Arc<AppState>>,
) -> Result<Json<SalesSummary>, (StatusCode, String)> {
    let cafe_id = "default";
    let engine = POSEngine::new(state.db.clone());
    engine.get_sales_summary(cafe_id)
        .await
        .map(Json)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

// ─── Audit ────────────────────────────────────────────────────

pub async fn get_audit_log(
    State(state): State<Arc<AppState>>,
    Query(q): Query<DateRangeQuery>,
) -> Result<Json<Vec<crate::db::pos_audit::AuditLogEntry>>, (StatusCode, String)> {
    let cafe_id = "default";
    let engine = POSEngine::new(state.db.clone());
    engine.get_audit_log(cafe_id, q.since.as_deref(), q.action.as_deref())
        .await
        .map(Json)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

// ─── Printing ─────────────────────────────────────────────────

pub async fn print_receipt(
    State(state): State<Arc<AppState>>,
    Path(order_id): Path<String>,
) -> Result<Json<String>, (StatusCode, String)> {
    let cafe_id = "default";
    let engine = POSEngine::new(state.db.clone());
    engine.print_receipt(cafe_id, &order_id)
        .await
        .map(Json)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

pub async fn open_cash_drawer(
    State(state): State<Arc<AppState>>,
) -> Result<Json<String>, (StatusCode, String)> {
    let cafe_id = "default";
    let engine = POSEngine::new(state.db.clone());
    engine.open_cash_drawer(cafe_id)
        .await
        .map(Json)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

// ─── Printer Config ───────────────────────────────────────────

pub async fn list_printers(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<crate::db::pos_printer::Printer>>, (StatusCode, String)> {
    let cafe_id = "default";
    let engine = POSEngine::new(state.db.clone());
    engine.get_printers(cafe_id)
        .await
        .map(Json)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

pub async fn create_printer(
    State(state): State<Arc<AppState>>,
    Json(input): Json<PrinterInput>,
) -> Result<Json<String>, (StatusCode, String)> {
    let cafe_id = "default";
    let engine = POSEngine::new(state.db.clone());
    engine.save_printer(cafe_id, &input)
        .await
        .map(Json)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

pub async fn delete_printer(
    State(state): State<Arc<AppState>>,
    Path(printer_id): Path<String>,
) -> Result<Json<()>, (StatusCode, String)> {
    let cafe_id = "default";
    let engine = POSEngine::new(state.db.clone());
    engine.delete_printer(cafe_id, &printer_id)
        .await
        .map(|_| Json(()))
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}
