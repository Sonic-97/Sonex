pub mod customer_routes;
pub mod inventory_routes;
pub mod pos_routes;
pub mod recipe_routes;
pub mod routes;
pub mod sync_routes;

use axum::{
    routing::{delete, get, post, put},
    Router,
};
use std::sync::Arc;
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;

use crate::ai::AiEngine;
use crate::db::Database;
use crate::sync::SyncHandle;

pub struct AppState {
    pub db: Database,
    pub sync_engine: Option<SyncHandle>,
    pub ai_engine: Option<AiEngine>,
}

pub fn build_router(db: Database, sync_engine: Option<SyncHandle>, ai_engine: Option<AiEngine>) -> Router {
    let state = Arc::new(AppState { db, sync_engine, ai_engine });

    let inventory_routes = Router::new()
        // Categories
        .route("/api/inventory/categories", get(inventory_routes::list_categories).post(inventory_routes::create_category))
        .route("/api/inventory/categories/{id}", put(inventory_routes::update_category))
        .route("/api/inventory/categories/{id}/{version}", delete(inventory_routes::delete_category))
        // Items
        .route("/api/inventory/items", get(inventory_routes::list_items).post(inventory_routes::create_item))
        .route("/api/inventory/items/{id}", get(inventory_routes::get_item).put(inventory_routes::update_item))
        .route("/api/inventory/items/{id}/{version}", delete(inventory_routes::delete_item))
        // Stock adjustments
        .route("/api/inventory/items/{id}/movements", get(inventory_routes::list_movements))
        .route("/api/inventory/adjust", post(inventory_routes::adjust_stock))
        // Summary
        .route("/api/inventory/summary", get(inventory_routes::inventory_summary));

    let recipe_routes = Router::new()
        // CRUD
        .route("/api/recipes", get(recipe_routes::list_recipes))
        .route("/api/recipes/by-product/{product_id}", get(recipe_routes::get_recipe_by_product))
        .route("/api/recipes", post(recipe_routes::create_recipe))
        .route("/api/recipes/{id}", put(recipe_routes::update_recipe))
        .route("/api/recipes/{id}/{version}", delete(recipe_routes::delete_recipe))
        // Recipe engine
        .route("/api/recipes/cost-breakdown/{product_id}", get(recipe_routes::get_cost_breakdown))
        .route("/api/recipes/validate/{product_id}", post(recipe_routes::validate_recipe))
        .route("/api/recipes/recalculate/{product_id}", post(recipe_routes::recalculate_product))
        .route("/api/recipes/bulk-recalculate", post(recipe_routes::bulk_recalculate));

    let customer_routes = Router::new()
        .route("/api/customers", get(customer_routes::list_customers).post(customer_routes::create_customer))
        .route("/api/customers/{id}", get(customer_routes::get_customer).put(customer_routes::update_customer))
        .route("/api/customers/{id}/{version}", delete(customer_routes::delete_customer));

    let pos_routes = Router::new()
        // Search
        .route("/api/pos/search", get(pos_routes::search_products))
        .route("/api/pos/search/barcode/{barcode}", get(pos_routes::find_by_barcode))
        // Categories
        .route("/api/pos/categories", get(pos_routes::get_categories))
        // Favorites
        .route("/api/pos/favorites", get(pos_routes::list_favorites))
        .route("/api/pos/favorites/toggle", post(pos_routes::toggle_favorite))
        // Modifiers
        .route("/api/pos/products/{product_id}/modifiers", get(pos_routes::get_product_modifiers))
        // Product Option Sync
        .route("/api/pos/sync/product-options", post(pos_routes::sync_product_options))
        // Orders
        .route("/api/pos/orders", get(pos_routes::list_orders).post(pos_routes::create_order))
        .route("/api/pos/orders/active", get(pos_routes::list_active_orders))
        .route("/api/pos/orders/next-number", get(pos_routes::get_next_number))
        .route("/api/pos/orders/{id}", get(pos_routes::get_order))
        // Payments
        .route("/api/pos/orders/{order_id}/payment", post(pos_routes::add_payment))
        // Discounts
        .route("/api/pos/orders/{order_id}/discount", post(pos_routes::apply_discount))
        .route("/api/pos/orders/{order_id}/discount/{discount_id}", delete(pos_routes::remove_discount))
        // Cancel
        .route("/api/pos/orders/{order_id}/cancel", post(pos_routes::cancel_order))
        // Refund
        .route("/api/pos/orders/{order_id}/refund", post(pos_routes::process_refund))
        // Summary
        .route("/api/pos/sales-summary", get(pos_routes::sales_summary))
        // Audit
        .route("/api/pos/audit-log", get(pos_routes::get_audit_log))
        // Printing
        .route("/api/pos/print/receipt/{order_id}", post(pos_routes::print_receipt))
        .route("/api/pos/print/cash-drawer", post(pos_routes::open_cash_drawer))
        // Printer config
        .route("/api/pos/printers", get(pos_routes::list_printers).post(pos_routes::create_printer))
        .route("/api/pos/printers/{printer_id}", delete(pos_routes::delete_printer));

    let sync_routes = sync_routes::sync_routes();
    let ai_routes = crate::ai::routes::ai_routes();

    Router::new()
        .merge(inventory_routes)
        .merge(recipe_routes)
        .merge(customer_routes)
        .merge(pos_routes)
        .merge(sync_routes)
        .merge(ai_routes)
        .route("/api/health", get(routes::health))
        .route("/api/settings", get(routes::get_settings).put(routes::update_settings))
        .route("/api/version", get(routes::version))
        .layer(TraceLayer::new_for_http())
        .layer(CorsLayer::permissive())
        .with_state(state)
}
