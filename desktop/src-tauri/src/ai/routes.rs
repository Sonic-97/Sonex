use std::sync::Arc;

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::Json,
    routing::{get, post},
    Router,
};
use serde::{Deserialize, Serialize};

use super::{
    client::HttpCloudAi,
    types::*,
};
use crate::server::AppState;

pub fn ai_routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/ai/health", get(ai_health))
        .route("/api/ai/nlp/parse", post(nlp_parse))
        .route("/api/ai/search", post(ai_search))
        .route("/api/ai/insights", get(ai_insights))
        .route("/api/ai/forecast/{entity_type}/{entity_id}", get(ai_forecast))
        .route("/api/ai/anomalies", get(ai_anomalies))
        .route("/api/ai/copilot/ask", post(ai_copilot_ask))
        .route("/api/ai/dashboard", get(ai_dashboard))
        .route("/api/ai/offline/status", get(offline_status))
        .route("/api/ai/suggestions", post(ai_suggestions))
}

async fn ai_health(
    State(state): State<Arc<AppState>>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let online = if let Some(ref ai) = state.ai_engine {
        ai.is_online().await
    } else {
        false
    };

    Ok(Json(serde_json::json!({
        "status": if online { "ok" } else { "offline" },
        "online": online,
        "engine": "ai-engine-v1",
    })))
}

#[derive(Debug, Deserialize)]
struct NlpParseBody {
    text: String,
}

async fn nlp_parse(
    State(state): State<Arc<AppState>>,
    Json(body): Json<NlpParseBody>,
) -> Result<Json<NlpResult>, (StatusCode, String)> {
    let engine = state.ai_engine.as_ref().ok_or_else(|| {
        (StatusCode::SERVICE_UNAVAILABLE, "AI engine not initialized".to_string())
    })?;
    let online = engine.is_online().await;
    let cafe_id = "default";

    if online {
        match engine.client.nlp_parse(&body.text, cafe_id).await {
            Ok(result) => return Ok(Json(result)),
            Err(_) => { /* fall through to local */ }
        }
    }

    let result = engine.nlp.parse_local(&body.text);
    Ok(Json(result))
}

#[derive(Debug, Deserialize)]
struct AiSearchBody {
    query: String,
    limit: Option<usize>,
}

async fn ai_search(
    State(state): State<Arc<AppState>>,
    Json(body): Json<AiSearchBody>,
) -> Result<Json<Vec<AiSearchResult>>, (StatusCode, String)> {
    let engine = state.ai_engine.as_ref().ok_or_else(|| {
        (StatusCode::SERVICE_UNAVAILABLE, "AI engine not initialized".to_string())
    })?;
    let online = engine.is_online().await;
    let cafe_id = "default";
    let limit = body.limit.unwrap_or(10);

    if online {
        match engine.client.search_products(&body.query, cafe_id, limit).await {
            Ok(results) => return Ok(Json(results)),
            Err(_) => { /* fall through */ }
        }
    }

    // Fallback: use NLP + local search
    let terms = engine.nlp.extract_search_terms(&body.query);
    let products = load_products_for_search(&state.db).await;
    let results = engine.search.search_local(&terms, &products, limit);
    Ok(Json(results))
}

async fn ai_insights(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<BusinessInsight>>, (StatusCode, String)> {
    let engine = state.ai_engine.as_ref().ok_or_else(|| {
        (StatusCode::SERVICE_UNAVAILABLE, "AI engine not initialized".to_string())
    })?;
    let online = engine.is_online().await;

    if online {
        match engine.client.get_insights("default").await {
            Ok(insights) => return Ok(Json(insights)),
            Err(_) => { /* fall through */ }
        }
    }

    // Local fallback: compute from DB
    let insights = compute_local_insights(&state.db).await;
    Ok(Json(insights))
}

async fn ai_forecast(
    State(state): State<Arc<AppState>>,
    Path((entity_type, entity_id)): Path<(String, String)>,
) -> Result<Json<ForecastResult>, (StatusCode, String)> {
    let engine = state.ai_engine.as_ref().ok_or_else(|| {
        (StatusCode::SERVICE_UNAVAILABLE, "AI engine not initialized".to_string())
    })?;
    let online = engine.is_online().await;

    if online {
        match engine.client.get_forecast("default", &entity_type, &entity_id).await {
            Ok(forecast) => return Ok(Json(forecast)),
            Err(_) => { /* fall through */ }
        }
    }

    let name = entity_id.clone();
    let historical = load_historical_for_forecast(&state.db, &entity_type, &entity_id).await;
    let result = engine.forecast.forecast_local(&entity_type, &name, &historical, 14);
    Ok(Json(result))
}

async fn ai_anomalies(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<AnomalyResult>>, (StatusCode, String)> {
    let engine = state.ai_engine.as_ref().ok_or_else(|| {
        (StatusCode::SERVICE_UNAVAILABLE, "AI engine not initialized".to_string())
    })?;
    let online = engine.is_online().await;

    if online {
        match engine.client.get_anomalies("default").await {
            Ok(anomalies) => return Ok(Json(anomalies)),
            Err(_) => { /* fall through */ }
        }
    }

    let anomalies = detect_local_anomalies(&state.db).await;
    Ok(Json(anomalies))
}

#[derive(Debug, Deserialize)]
struct CopilotAskBody {
    message: String,
    context: Option<serde_json::Value>,
}

async fn ai_copilot_ask(
    State(state): State<Arc<AppState>>,
    Json(body): Json<CopilotAskBody>,
) -> Result<Json<CopilotResponse>, (StatusCode, String)> {
    let engine = state.ai_engine.as_ref().ok_or_else(|| {
        (StatusCode::SERVICE_UNAVAILABLE, "AI engine not initialized".to_string())
    })?;
    let query = CopilotQuery {
        message: body.message,
        context: body.context,
    };

    let online = engine.is_online().await;
    if online {
        match engine.client.copilot_ask(&query, "default").await {
            Ok(resp) => return Ok(Json(resp)),
            Err(_) => { /* fall through */ }
        }
    }

    Ok(Json(CopilotResponse {
        answer: format!(
            "I'm running in offline mode. I can help with basic queries once connected to the cloud. You asked: {}",
            query.message
        ),
        confidence: 0.3,
        sources: vec!["offline-lite".to_string()],
        suggestions: vec!["Go to Settings > Sync to check connection".to_string()],
    }))
}

async fn ai_dashboard(
    State(state): State<Arc<AppState>>,
) -> Result<Json<AiDashboard>, (StatusCode, String)> {
    let engine = state.ai_engine.as_ref().ok_or_else(|| {
        (StatusCode::SERVICE_UNAVAILABLE, "AI engine not initialized".to_string())
    })?;
    let online = engine.is_online().await;

    let insights = if online {
        engine.client.get_insights("default").await.unwrap_or_default()
    } else {
        compute_local_insights(&state.db).await
    };

    let anomalies = if online {
        engine.client.get_anomalies("default").await.unwrap_or_default()
    } else {
        detect_local_anomalies(&state.db).await
    };

    Ok(Json(AiDashboard {
        insights,
        anomalies,
        forecasts: vec![],
        top_suggestions: vec![],
        health_score: 85.0,
        online,
    }))
}

async fn offline_status(
    State(state): State<Arc<AppState>>,
) -> Result<Json<OfflineAiStatus>, (StatusCode, String)> {
    let engine = state.ai_engine.as_ref().ok_or_else(|| {
        (StatusCode::SERVICE_UNAVAILABLE, "AI engine not initialized".to_string())
    })?;
    Ok(Json(engine.offline.status()))
}

#[derive(Debug, Deserialize)]
struct SuggestionsBody {
    product_name: String,
}

async fn ai_suggestions(
    State(state): State<Arc<AppState>>,
    Json(body): Json<SuggestionsBody>,
) -> Result<Json<Vec<String>>, (StatusCode, String)> {
    let engine = state.ai_engine.as_ref().ok_or_else(|| {
        (StatusCode::SERVICE_UNAVAILABLE, "AI engine not initialized".to_string())
    })?;
    let products = load_products_for_search(&state.db).await;
    let suggestions = engine.offline.suggest_pairings(&body.product_name, &products);
    Ok(Json(suggestions))
}

// ─── Local fallback helpers ─────────────────────────────────

use crate::db::Database;

async fn load_products_for_search(db: &Database) -> Vec<super::search::ProductRecord> {
    sqlx::query_as::<_, (String, String, f64, String)>(
        "SELECT id, name, price, COALESCE((SELECT name FROM categories WHERE id = products.category_id), '') as category FROM products WHERE active = 1 AND deleted_at IS NULL LIMIT 500"
    )
    .fetch_all(&db.pool)
    .await
    .unwrap_or_default()
    .into_iter()
    .map(|(id, name, price, category)| super::search::ProductRecord { id, name, price, category })
    .collect()
}

async fn load_historical_for_forecast(db: &Database, entity_type: &str, _entity_id: &str) -> Vec<f64> {
    match entity_type {
        "revenue" | "sales" => {
            sqlx::query_as::<_, (f64,)>(
                "SELECT COALESCE(SUM(oi.quantity * oi.unit_price), 0) as daily_revenue
                 FROM pos_orders o
                 JOIN json_each(o.items_json) AS item
                 JOIN pos_order_items oi ON oi.id = json_extract(item.value, '$.id')
                 WHERE o.created_at >= datetime('now', '-30 days')
                 GROUP BY date(o.created_at)
                 ORDER BY date(o.created_at)"
            )
            .fetch_all(&db.pool)
            .await
            .unwrap_or_default()
            .into_iter()
            .map(|r| r.0)
            .collect()
        }
        "orders" => {
            sqlx::query_as::<_, (i64,)>(
                "SELECT COUNT(*) FROM pos_orders WHERE created_at >= datetime('now', '-30 days') GROUP BY date(created_at) ORDER BY date(created_at)"
            )
            .fetch_all(&db.pool)
            .await
            .unwrap_or_default()
            .into_iter()
            .map(|r| r.0 as f64)
            .collect()
        }
        _ => vec![100.0, 110.0, 105.0, 120.0, 115.0, 130.0],
    }
}

async fn compute_local_insights(db: &Database) -> Vec<BusinessInsight> {
    // Revenue today vs yesterday
    let (today_rev,): (Option<f64>,) = sqlx::query_as(
        "SELECT SUM(oi.quantity * oi.unit_price) FROM pos_orders o JOIN json_each(o.items_json) AS item JOIN pos_order_items oi ON oi.id = json_extract(item.value, '$.id') WHERE date(o.created_at) = date('now')"
    )
    .fetch_one(&db.pool)
    .await
    .unwrap_or((None,));

    let (yesterday_rev,): (Option<f64>,) = sqlx::query_as(
        "SELECT SUM(oi.quantity * oi.unit_price) FROM pos_orders o JOIN json_each(o.items_json) AS item JOIN pos_order_items oi ON oi.id = json_extract(item.value, '$.id') WHERE date(o.created_at) = date('now', '-1 day')"
    )
    .fetch_one(&db.pool)
    .await
    .unwrap_or((None,));

    let today = today_rev.unwrap_or(0.0);
    let yesterday = yesterday_rev.unwrap_or(0.0);

    let insights_engine = super::InsightsEngine::new();
    insights_engine.generate_local(today, yesterday, 0, 0, "", 0.0, 0)
}

async fn detect_local_anomalies(db: &Database) -> Vec<AnomalyResult> {
    let anomaly_engine = super::AnomalyEngine::new();

    // Load daily revenue for last 14 days
    let revenue: Vec<f64> = sqlx::query_as::<_, (f64,)>(
        "SELECT COALESCE(SUM(oi.quantity * oi.unit_price), 0) FROM pos_orders o JOIN json_each(o.items_json) AS item JOIN pos_order_items oi ON oi.id = json_extract(item.value, '$.id') WHERE o.created_at >= datetime('now', '-14 days') GROUP BY date(o.created_at) ORDER BY date(o.created_at)"
    )
    .fetch_all(&db.pool)
    .await
    .unwrap_or_default()
    .into_iter()
    .map(|r| r.0)
    .collect();

    // Low stock items
    let low_stock: Vec<(String, String, f64, f64)> = sqlx::query_as::<_, (String, String, f64, f64)>(
        "SELECT id, name, current_qty, min_qty FROM inventory_items WHERE current_qty <= min_qty AND deleted_at IS NULL LIMIT 20"
    )
    .fetch_all(&db.pool)
    .await
    .unwrap_or_default()
    .into_iter()
    .map(|(id, name, current, min)| (id, name, current, min))
    .collect();

    anomaly_engine.detect_local(&revenue, &[], &low_stock)
}
