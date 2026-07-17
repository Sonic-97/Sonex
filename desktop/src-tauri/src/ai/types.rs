use serde::{Deserialize, Serialize};

/// Result of a natural language query (order or search).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NlpResult {
    pub intent: String,
    pub confidence: f64,
    pub entities: Vec<NlpEntity>,
    pub raw_text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NlpEntity {
    pub entity_type: String,
    pub value: String,
    pub confidence: f64,
}

/// AI-enhanced product search result.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiSearchResult {
    pub product_id: String,
    pub name: String,
    pub price: f64,
    pub score: f64,
    pub reason: String,
}

/// Business insight.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BusinessInsight {
    pub category: String,
    pub title: String,
    pub description: String,
    pub severity: String,
    pub metric: f64,
    pub trend: String,
    pub recommendation: String,
}

/// Forecast result.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ForecastResult {
    pub forecast_type: String,
    pub entity_id: String,
    pub entity_name: String,
    pub period: String,
    pub values: Vec<f64>,
    pub labels: Vec<String>,
    pub confidence: f64,
    pub trend: String,
}

/// Anomaly detection result.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnomalyResult {
    pub anomaly_type: String,
    pub entity_id: String,
    pub entity_name: String,
    pub severity: String,
    pub current_value: f64,
    pub expected_value: f64,
    pub deviation: f64,
    pub description: String,
    pub recommendation: String,
}

/// Copilot query/response.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CopilotQuery {
    pub message: String,
    pub context: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CopilotResponse {
    pub answer: String,
    pub confidence: f64,
    pub sources: Vec<String>,
    pub suggestions: Vec<String>,
}

/// Unified AI dashboard snapshot.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiDashboard {
    pub insights: Vec<BusinessInsight>,
    pub anomalies: Vec<AnomalyResult>,
    pub forecasts: Vec<ForecastResult>,
    pub top_suggestions: Vec<String>,
    pub health_score: f64,
    pub online: bool,
}

/// Offline AI lite status.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OfflineAiStatus {
    pub enabled: bool,
    pub model_version: String,
    pub last_trained: String,
    pub accuracy: f64,
    pub total_predictions: u64,
}

/// Product search query with natural language.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProductSearchQuery {
    pub query: String,
    pub limit: Option<usize>,
    pub category_id: Option<String>,
}

/// Intent from NLP parsing.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum Intent {
    SearchProduct,
    CreateOrder,
    GetSales,
    GetInsights,
    ForecastDemand,
    CheckInventory,
    Unknown,
}

impl Intent {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::SearchProduct => "search_product",
            Self::CreateOrder => "create_order",
            Self::GetSales => "get_sales",
            Self::GetInsights => "get_insights",
            Self::ForecastDemand => "forecast_demand",
            Self::CheckInventory => "check_inventory",
            Self::Unknown => "unknown",
        }
    }
}
