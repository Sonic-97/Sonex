use axum::{extract::State, http::StatusCode, Json};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::server::AppState;

#[derive(Debug, Serialize)]
pub struct HealthResponse {
    pub status: String,
    pub version: String,
    pub db_connected: bool,
    pub uptime_seconds: u64,
}

#[derive(Debug, Serialize)]
pub struct VersionResponse {
    pub version: String,
    pub build: String,
    pub platform: String,
    pub arch: String,
}

#[derive(Debug, Deserialize)]
pub struct SettingsUpdate {
    pub key: String,
    pub value: String,
}

#[derive(Debug, Serialize)]
pub struct SettingsResponse {
    pub key: String,
    pub value: String,
}

static START_TIME: std::sync::LazyLock<std::time::Instant> =
    std::sync::LazyLock::new(std::time::Instant::now);

pub async fn health(State(state): State<Arc<AppState>>) -> Json<HealthResponse> {
    let db_ok = sqlx::query_scalar::<_, i32>("SELECT 1")
        .fetch_one(&state.db.pool)
        .await
        .is_ok();

    Json(HealthResponse {
        status: if db_ok { "ok" } else { "degraded" }.to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        db_connected: db_ok,
        uptime_seconds: START_TIME.elapsed().as_secs(),
    })
}

pub async fn version() -> Json<VersionResponse> {
    Json(VersionResponse {
        version: env!("CARGO_PKG_VERSION").to_string(),
        build: env!("TAURI_ENV_TARGET_TRIPLE").to_string(),
        platform: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
    })
}

pub async fn get_settings(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<SettingsResponse>>, (StatusCode, String)> {
    let rows = sqlx::query_as::<_, (String, String)>(
        "SELECT key, value FROM settings ORDER BY key",
    )
    .fetch_all(&state.db.pool)
    .await
    .map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("failed to load settings: {}", e),
        )
    })?;

    Ok(Json(
        rows.into_iter()
            .map(|(key, value)| SettingsResponse { key, value })
            .collect(),
    ))
}

pub async fn update_settings(
    State(state): State<Arc<AppState>>,
    Json(update): Json<SettingsUpdate>,
) -> Result<Json<SettingsResponse>, (StatusCode, String)> {
    let updated = sqlx::query(
        r#"
        INSERT INTO settings (key, value, updated_at)
        VALUES (?, ?, datetime('now'))
        ON CONFLICT(key) DO UPDATE SET
            value = excluded.value,
            updated_at = datetime('now')
        "#,
    )
    .bind(&update.key)
    .bind(&update.value)
    .execute(&state.db.pool)
    .await
    .map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("failed to save setting: {}", e),
        )
    })?;

    Ok(Json(SettingsResponse {
        key: update.key,
        value: update.value,
    }))
}
