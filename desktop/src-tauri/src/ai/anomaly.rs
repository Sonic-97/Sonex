use super::types::*;

/// Anomaly detection engine.
/// Online: proxies to cloud ai-decisions/risks API.
/// Offline: threshold-based detection on local data.
pub struct AnomalyEngine;

impl AnomalyEngine {
    pub fn new() -> Self {
        Self
    }

    /// Detect anomalies from local data using statistical thresholds.
    pub fn detect_local(
        &self,
        daily_revenue: &[f64],
        daily_orders: &[u32],
        low_stock_items: &[(String, String, f64, f64)], // (id, name, current, threshold)
    ) -> Vec<AnomalyResult> {
        let mut anomalies = Vec::new();

        // Revenue anomaly: detect sudden drops
        if daily_revenue.len() >= 3 {
            let recent = daily_revenue.iter().rev().take(3).copied().collect::<Vec<_>>();
            let prev: Vec<f64> = daily_revenue.iter().rev().skip(3).take(7).copied().collect();

            if !prev.is_empty() {
                let mean = prev.iter().sum::<f64>() / prev.len() as f64;
                let std_dev = (prev.iter().map(|v| (v - mean).powi(2)).sum::<f64>() / prev.len() as f64).sqrt();

                let avg_recent = recent.iter().sum::<f64>() / recent.len() as f64;

                if std_dev > 0.0 && mean > 0.0 {
                    let deviation = (avg_recent - mean) / std_dev;
                    if deviation < -1.5 {
                        anomalies.push(AnomalyResult {
                            anomaly_type: "revenue_drop".to_string(),
                            entity_id: "all".to_string(),
                            entity_name: "Overall Revenue".to_string(),
                            severity: if deviation < -2.5 { "high".to_string() } else { "medium".to_string() },
                            current_value: avg_recent,
                            expected_value: mean,
                            deviation: deviation.abs(),
                            description: format!(
                                "Revenue dropped from expected {:.0} to {:.0} ({:.1}σ below mean)",
                                mean, avg_recent, deviation.abs()
                            ),
                            recommendation: "Review sales data and check for operational issues".to_string(),
                        });
                    }
                }
            }
        }

        // Order volume anomaly
        if daily_orders.len() >= 3 {
            let recent_orders = daily_orders.iter().rev().take(3).copied().collect::<Vec<_>>();
            let prev_orders: Vec<f64> = daily_orders.iter().rev().skip(3).take(7).map(|&v| v as f64).collect();

            if !prev_orders.is_empty() {
                let mean = prev_orders.iter().sum::<f64>() / prev_orders.len() as f64;
                let avg_recent = recent_orders.iter().sum::<u32>() as f64 / recent_orders.len() as f64;

                if mean > 0.0 && avg_recent < mean * 0.5 {
                    anomalies.push(AnomalyResult {
                        anomaly_type: "order_volume_drop".to_string(),
                        entity_id: "all".to_string(),
                        entity_name: "Order Volume".to_string(),
                        severity: "medium".to_string(),
                        current_value: avg_recent,
                        expected_value: mean,
                        deviation: (mean - avg_recent) / mean,
                        description: format!(
                            "Order volume dropped {:.0}% from expected {:.0} to {:.0}",
                            (1.0 - avg_recent / mean) * 100.0, mean, avg_recent
                        ),
                        recommendation: "Check if there are any operational or marketing issues".to_string(),
                    });
                }
            }
        }

        // Low stock anomalies
        for (id, name, current, threshold) in low_stock_items {
            if *current <= 0.0 {
                anomalies.push(AnomalyResult {
                    anomaly_type: "stockout".to_string(),
                    entity_id: id.clone(),
                    entity_name: name.clone(),
                    severity: "high".to_string(),
                    current_value: *current,
                    expected_value: *threshold,
                    deviation: 1.0,
                    description: format!("{} is completely out of stock", name),
                    recommendation: format!("Order {} immediately to avoid production delays", name),
                });
            } else if *current <= *threshold * 0.5 {
                anomalies.push(AnomalyResult {
                    anomaly_type: "low_stock".to_string(),
                    entity_id: id.clone(),
                    entity_name: name.clone(),
                    severity: "medium".to_string(),
                    current_value: *current,
                    expected_value: *threshold,
                    deviation: (*threshold - *current) / *threshold,
                    description: format!("{} is critically low ({:.0} / {:.0})", name, current, threshold),
                    recommendation: format!("Restock {} soon to avoid stockout", name),
                });
            }
        }

        anomalies
    }
}
