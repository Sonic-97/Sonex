pub mod anomaly;
pub mod client;
pub mod forecast;
pub mod insights;
pub mod nlp;
pub mod offline;
pub mod routes;
pub mod search;
pub mod types;

use std::sync::Arc;

use tokio::sync::RwLock;

pub use client::{CloudAi, HttpCloudAi};
pub use nlp::NlpEngine;
pub use search::SearchEngine;
pub use insights::InsightsEngine;
pub use forecast::ForecastEngine;
pub use anomaly::AnomalyEngine;
pub use offline::OfflineAiLite;
pub use types::*;

/// Central AI orchestrator for the desktop.
/// Routes all AI requests through the cloud proxy with offline fallback.
pub struct AiEngine {
    client: Arc<dyn client::CloudAi>,
    nlp: nlp::NlpEngine,
    search: search::SearchEngine,
    insights: insights::InsightsEngine,
    forecast: forecast::ForecastEngine,
    anomaly: anomaly::AnomalyEngine,
    offline: offline::OfflineAiLite,
    online: Arc<RwLock<bool>>,
    cloud_url: String,
}

impl AiEngine {
    pub fn new(cloud_url: &str) -> Self {
        let db_path = std::path::PathBuf::from(".");
        Self {
            client: Arc::new(client::HttpCloudAi::new(cloud_url)),
            nlp: nlp::NlpEngine::new(),
            search: search::SearchEngine::new(),
            insights: insights::InsightsEngine::new(),
            forecast: forecast::ForecastEngine::new(),
            anomaly: anomaly::AnomalyEngine::new(),
            offline: offline::OfflineAiLite::new(&db_path),
            online: Arc::new(RwLock::new(true)),
            cloud_url: cloud_url.to_string(),
        }
    }

    pub fn with_online(mut self, online: bool) -> Self {
        self.online = Arc::new(RwLock::new(online));
        self
    }

    pub async fn is_online(&self) -> bool {
        *self.online.read().await
    }

    pub async fn set_online(&self, online: bool) {
        let mut w = self.online.write().await;
        *w = online;
    }

    /// Check cloud health — updates online status.
    pub async fn check_health(&self) -> Result<bool, String> {
        match self.client.health().await {
            Ok(true) => {
                *self.online.write().await = true;
                Ok(true)
            }
            _ => {
                *self.online.write().await = false;
                Ok(false)
            }
        }
    }
}
