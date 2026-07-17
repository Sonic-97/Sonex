use async_trait::async_trait;

use super::types::*;

/// Cloud AI HTTP client — proxies requests to the NestJS backend AI services.
#[async_trait]
pub trait CloudAi: Send + Sync {
    async fn health(&self) -> Result<bool, String>;
    async fn nlp_parse(&self, text: &str, cafe_id: &str) -> Result<NlpResult, String>;
    async fn search_products(&self, query: &str, cafe_id: &str, limit: usize) -> Result<Vec<AiSearchResult>, String>;
    async fn get_insights(&self, cafe_id: &str) -> Result<Vec<BusinessInsight>, String>;
    async fn get_forecast(&self, cafe_id: &str, forecast_type: &str, entity_id: &str) -> Result<ForecastResult, String>;
    async fn get_anomalies(&self, cafe_id: &str) -> Result<Vec<AnomalyResult>, String>;
    async fn copilot_ask(&self, query: &CopilotQuery, cafe_id: &str) -> Result<CopilotResponse, String>;
    async fn get_dashboard(&self, cafe_id: &str) -> Result<AiDashboard, String>;
}

/// HTTP implementation — calls the NestJS cloud AI APIs.
pub struct HttpCloudAi {
    base_url: String,
    client: reqwest::Client,
}

impl HttpCloudAi {
    pub fn new(base_url: &str) -> Self {
        Self {
            base_url: base_url.trim_end_matches('/').to_string(),
            client: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(15))
                .build()
                .unwrap_or_default(),
        }
    }

    async fn get_json<T: serde::de::DeserializeOwned>(&self, path: &str) -> Result<T, String> {
        let url = format!("{}{}", self.base_url, path);
        let resp = self.client.get(&url).send().await.map_err(|e| format!("request failed: {}", e))?;
        if !resp.status().is_success() {
            return Err(format!("cloud ai error: {} {}", resp.status(), resp.text().await.unwrap_or_default()));
        }
        resp.json::<T>().await.map_err(|e| format!("parse failed: {}", e))
    }

    async fn post_json<T: serde::de::DeserializeOwned, B: serde::Serialize>(&self, path: &str, body: &B) -> Result<T, String> {
        let url = format!("{}{}", self.base_url, path);
        let resp = self.client.post(&url).json(body).send().await.map_err(|e| format!("request failed: {}", e))?;
        if !resp.status().is_success() {
            return Err(format!("cloud ai error: {} {}", resp.status(), resp.text().await.unwrap_or_default()));
        }
        resp.json::<T>().await.map_err(|e| format!("parse failed: {}", e))
    }
}

#[async_trait]
impl CloudAi for HttpCloudAi {
    async fn health(&self) -> Result<bool, String> {
        match self.get_json::<serde_json::Value>("/api/health").await {
            Ok(v) => Ok(v.get("status").and_then(|s| s.as_str()) == Some("ok")),
            Err(_) => Ok(false),
        }
    }

    async fn nlp_parse(&self, text: &str, _cafe_id: &str) -> Result<NlpResult, String> {
        // POST to /api/ai/parse — the NestJS AI NLP service
        self.post_json::<NlpResult, serde_json::Value>("/api/ai/parse", &serde_json::json!({
            "text": text,
        })).await
    }

    async fn search_products(&self, query: &str, _cafe_id: &str, limit: usize) -> Result<Vec<AiSearchResult>, String> {
        self.get_json::<Vec<AiSearchResult>>(&format!("/api/products/search?q={}&limit={}", urlencoding(query), limit)).await
    }

    async fn get_insights(&self, _cafe_id: &str) -> Result<Vec<BusinessInsight>, String> {
        self.get_json::<Vec<BusinessInsight>>("/api/ai-decisions/daily?limit=10").await
    }

    async fn get_forecast(&self, _cafe_id: &str, forecast_type: &str, entity_id: &str) -> Result<ForecastResult, String> {
        self.post_json::<ForecastResult, serde_json::Value>("/api/forecasting/forecast", &serde_json::json!({
            "type": forecast_type,
            "entityId": entity_id,
            "period": "daily",
            "horizon": 14,
        })).await
    }

    async fn get_anomalies(&self, _cafe_id: &str) -> Result<Vec<AnomalyResult>, String> {
        self.get_json::<Vec<AnomalyResult>>("/api/ai-decisions/risks").await
    }

    async fn copilot_ask(&self, query: &CopilotQuery, _cafe_id: &str) -> Result<CopilotResponse, String> {
        self.post_json::<CopilotResponse, CopilotQuery>("/api/owner-copilot/ask", query).await
    }

    async fn get_dashboard(&self, _cafe_id: &str) -> Result<AiDashboard, String> {
        self.get_json::<AiDashboard>("/api/analytics/overview").await
    }
}

fn urlencoding(s: &str) -> String {
    s.chars().map(|c| match c {
        'A'..='Z' | 'a'..='z' | '0'..='9' | '-' | '_' | '.' | '~' => c.to_string(),
        _ => format!("%{:02X}", c as u8),
    }).collect()
}
