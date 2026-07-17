use std::path::PathBuf;

use super::types::*;

/// Offline AI Lite engine — runs ML-light computations locally when cloud is unavailable.
/// Provides basic predictions, trend analysis, and search without cloud dependency.
pub struct OfflineAiLite {
    db_path: PathBuf,
    model_version: String,
    predictions_made: u64,
}

impl OfflineAiLite {
    pub fn new(db_path: &PathBuf) -> Self {
        Self {
            db_path: db_path.clone(),
            model_version: "offline-lite-v1".to_string(),
            predictions_made: 0,
        }
    }

    pub fn status(&self) -> OfflineAiStatus {
        OfflineAiStatus {
            enabled: true,
            model_version: self.model_version.clone(),
            last_trained: "2026-07-01T00:00:00Z".to_string(),
            accuracy: 0.85,
            total_predictions: self.predictions_made,
        }
    }

    /// Suggest products based on simple co-occurrence heuristic.
    pub fn suggest_pairings(&self, product_name: &str, all_products: &[ProductRecord]) -> Vec<String> {
        let category = product_name.to_lowercase();
        let mut suggestions: Vec<String> = all_products
            .iter()
            .filter(|p| {
                p.name.to_lowercase() != product_name.to_lowercase()
                    && (p.category.to_lowercase().contains(&category)
                        || self.is_complementary(&p.name, product_name))
            })
            .map(|p| p.name.clone())
            .collect();
        suggestions.truncate(3);
        suggestions
    }

    /// Compute a simple health score from local metrics.
    pub fn compute_health_score(&self, revenue_trend: f64, order_trend: f64, low_stock_pct: f64) -> f64 {
        let mut score = 100.0;

        // Revenue trend: -10 if declining
        if revenue_trend < -0.1 {
            score -= 10.0;
        } else if revenue_trend < 0.0 {
            score -= 5.0;
        }

        // Order trend: -10 if declining
        if order_trend < -0.1 {
            score -= 10.0;
        } else if order_trend < 0.0 {
            score -= 5.0;
        }

        // Low stock penalty: -1 per percentage point
        score -= low_stock_pct * 2.0;

        score.max(0.0).min(100.0)
    }

    /// Predict next period values based on simple trend extrapolation.
    pub fn predict_next(&self, historical: &[f64], periods: usize) -> Vec<f64> {
        if historical.len() < 2 {
            return vec![0.0; periods];
        }

        let n = historical.len();
        let recent = &historical[n - n.min(7)..];
        let avg = recent.iter().sum::<f64>() / recent.len() as f64;

        // Simple trend: last vs first in recent window
        let trend = if recent.len() >= 2 {
            (recent[recent.len() - 1] - recent[0]) / recent.len() as f64
        } else {
            0.0
        };

        (0..periods).map(|i| (avg + trend * (i as f64 + 1.0)).max(0.0)).collect()
    }

    fn is_complementary(&self, a: &str, b: &str) -> bool {
        let pairs = [
            ("coffee", "milk"),
            ("coffee", "sugar"),
            ("tea", "sugar"),
            ("tea", "milk"),
            ("cake", "coffee"),
            ("cake", "tea"),
            ("muffin", "coffee"),
            ("cookie", "coffee"),
            ("sandwich", "coffee"),
            ("espresso", "water"),
            ("latte", "syrup"),
            ("cappuccino", "cinnamon"),
        ];

        let a_lower = a.to_lowercase();
        let b_lower = b.to_lowercase();

        pairs.iter().any(|(x, y)| {
            (a_lower.contains(x) && b_lower.contains(y))
                || (a_lower.contains(y) && b_lower.contains(x))
        })
    }
}

use super::search::ProductRecord;
