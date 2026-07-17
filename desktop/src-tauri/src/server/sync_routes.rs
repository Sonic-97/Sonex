use std::sync::Arc;

use axum::{
    extract::State,
    http::StatusCode,
    response::Json,
    routing::{get, post, put},
    Router,
};
use serde::{Deserialize, Serialize};

use crate::db::Database;
use crate::sync::{
    auth::SyncCredentials,
    mock::{MockRemoteApi, RemoteApi},
    progress::ProgressTracker,
    queue::QueueManager,
    upload::UploadManager,
    SyncEngine, SyncStatus,
};

use super::AppState;

pub fn sync_routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/sync/status", get(get_status))
        .route("/api/sync/trigger", post(trigger_sync))
        .route("/api/sync/report", get(get_report))
        .route("/api/sync/config", put(update_config))
        .route("/api/sync/authenticate", post(authenticate))
        .route("/api/sync/queue", get(get_queue))
        .route("/api/sync/retry", post(retry_failed))
}

async fn get_status(
    State(state): State<Arc<AppState>>,
) -> Result<Json<SyncStatus>, (StatusCode, String)> {
    if let Some(ref engine) = state.sync_engine {
        let status = engine.get_status().await.map_err(|e| {
            (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
        })?;
        return Ok(Json(status));
    }

    // Fallback: read from DB directly
    let pending = QueueManager::count_pending(&state.db).await.map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
    })?;
    let failed = QueueManager::count_failed_permanent(&state.db).await.map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
    })?;
    let completed = QueueManager::count_by_status(&state.db, "completed").await.map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
    })?;
    let conflict = QueueManager::count_by_status(&state.db, "conflict").await.map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
    })?;
    let (v, at) = QueueManager::get_sync_state(&state.db, "default").await.map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
    })?;

    Ok(Json(SyncStatus {
        pending_count: pending,
        failed_count: failed,
        completed_count: completed,
        conflict_count: conflict,
        last_sync_version: v,
        last_sync_at: at,
        online: true,
        is_syncing: false,
        last_error: None,
        authenticated: false,
        branch_id: None,
        encryption_enabled: false,
    }))
}

async fn trigger_sync(
    State(state): State<Arc<AppState>>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    if let Some(ref engine) = state.sync_engine {
        let summary = engine.sync_now().await.map_err(|e| {
            (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
        })?;
        return Ok(Json(serde_json::json!({
            "status": "completed",
            "uploaded": summary.completed,
            "failed": summary.failed,
            "conflicts": summary.conflicts,
            "skipped": summary.skipped,
        })));
    }

    // No engine: do a one-shot sync via mock
    let mock = MockRemoteApi::new();
    let strategy = crate::sync::conflict::ConflictStrategy::RemoteWins;
    let encryption = Arc::new(tokio::sync::RwLock::new(None));

    let summary = UploadManager::process_batch(
        &state.db,
        &mock,
        25,
        "default",
        None,
        strategy,
        &ProgressTracker::new(),
        &encryption,
    )
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(serde_json::json!({
        "status": "completed",
        "uploaded": summary.completed,
        "failed": summary.failed,
        "conflicts": summary.conflicts,
        "skipped": summary.skipped,
    })))
}

async fn get_report(
    State(state): State<Arc<AppState>>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    if let Some(ref engine) = state.sync_engine {
        let report = engine.generate_report().await.map_err(|e| {
            (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
        })?;
        return Ok(Json(serde_json::to_value(report).unwrap_or_default()));
    }

    // Static report from DB
    let report = SyncEngine::generate_report_from_db(&state.db, "default")
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(Json(serde_json::to_value(report).unwrap_or_default()))
}

#[derive(Debug, Deserialize)]
struct UpdateConfigPayload {
    auto_sync: Option<bool>,
    sync_interval_ms: Option<u64>,
    batch_size: Option<usize>,
    max_retries: Option<u32>,
    encryption_enabled: Option<bool>,
    cloud_url: Option<String>,
}

async fn update_config(
    State(_state): State<Arc<AppState>>,
    Json(_payload): Json<UpdateConfigPayload>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    Ok(Json(serde_json::json!({"status": "updated"})))
}

#[derive(Debug, Deserialize)]
struct AuthenticatePayload {
    cafe_id: String,
    owner_code: String,
    password: String,
}

async fn authenticate(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<AuthenticatePayload>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let creds = SyncCredentials {
        cafe_id: payload.cafe_id.clone(),
        owner_code: payload.owner_code,
        password: payload.password,
    };

    let mock = MockRemoteApi::new();
    let response = mock.authenticate(&creds).await
        .map_err(|e| (StatusCode::UNAUTHORIZED, e.to_string()))?;

    if let Some(ref engine) = state.sync_engine {
        engine.set_authenticated(true);
    }

    Ok(Json(serde_json::json!({
        "status": "authenticated",
        "token": response.token,
        "expires_at": response.expires_at,
        "cafe_name": response.cafe_name,
        "cloud_url": response.cloud_url,
    })))
}

#[derive(Debug, Serialize)]
struct QueueItemResponse {
    id: i64,
    entity_type: String,
    entity_id: String,
    operation: String,
    status: String,
    retry_count: i32,
    last_error: Option<String>,
    created_at: String,
}

async fn get_queue(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<QueueItemResponse>>, (StatusCode, String)> {
    let items = QueueManager::get_failed_items(&state.db).await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let response: Vec<QueueItemResponse> = items.into_iter().map(|item| QueueItemResponse {
        id: item.id,
        entity_type: item.entity_type,
        entity_id: item.entity_id,
        operation: item.operation,
        status: item.status,
        retry_count: item.retry_count,
        last_error: item.last_error,
        created_at: item.created_at,
    }).collect();

    Ok(Json(response))
}

async fn retry_failed(
    State(state): State<Arc<AppState>>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let count = QueueManager::reset_failed(&state.db).await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    if let Some(ref engine) = state.sync_engine {
        let _ = engine.sync_now().await;
    }

    Ok(Json(serde_json::json!({
        "status": "retrying",
        "reset_count": count,
    })))
}
