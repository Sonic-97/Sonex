use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use serde::Deserialize;
use std::sync::Arc;

use crate::db::customer::*;
use crate::server::AppState;

#[derive(Debug, Deserialize)]
pub struct CustomerQuery {
    pub search: Option<String>,
    pub page: Option<i64>,
    pub limit: Option<i64>,
}

pub async fn list_customers(
    State(state): State<Arc<AppState>>,
    Query(q): Query<CustomerQuery>,
) -> Result<Json<Vec<Customer>>, (StatusCode, String)> {
    let cafe_id = "default";
    if let Some(query) = &q.search {
        if !query.is_empty() {
            return CustomerRepo::search(&state.db, cafe_id, query)
                .await
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
                .map(Json);
        }
    }
    CustomerRepo::find_all(&state.db, cafe_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
        .map(Json)
}

pub async fn get_customer(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<Customer>, (StatusCode, String)> {
    let cafe_id = "default";
    CustomerRepo::find_by_id(&state.db, &id, cafe_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or_else(|| (StatusCode::NOT_FOUND, format!("customer not found: {}", id)))
        .map(Json)
}

pub async fn create_customer(
    State(state): State<Arc<AppState>>,
    Json(input): Json<NewCustomer>,
) -> Result<Json<Customer>, (StatusCode, String)> {
    let cafe_id = "default";
    let id = CustomerRepo::insert(&state.db, cafe_id, None, &input)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let customer = CustomerRepo::find_by_id(&state.db, &id, cafe_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or_else(|| (StatusCode::INTERNAL_SERVER_ERROR, "created but not found".into()))?;

    Ok(Json(customer))
}

pub async fn update_customer(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(input): Json<UpdateCustomer>,
) -> Result<Json<Customer>, (StatusCode, String)> {
    let cafe_id = "default";
    let mut update = input;
    update.id = id.clone();
    update.cafe_id = cafe_id.to_string();

    CustomerRepo::update(&state.db, &update)
        .await
        .map_err(|e| (StatusCode::CONFLICT, e.to_string()))?;

    let customer = CustomerRepo::find_by_id(&state.db, &id, cafe_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or_else(|| (StatusCode::NOT_FOUND, format!("customer not found: {}", id)))?;

    Ok(Json(customer))
}

pub async fn delete_customer(
    State(state): State<Arc<AppState>>,
    Path((id, version)): Path<(String, i32)>,
) -> Result<Json<()>, (StatusCode, String)> {
    let cafe_id = "default";
    CustomerRepo::soft_delete(&state.db, &id, cafe_id, version)
        .await
        .map_err(|e| (StatusCode::CONFLICT, e.to_string()))?;
    Ok(Json(()))
}
