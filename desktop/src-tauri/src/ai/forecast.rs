use super::types::*;

/// Forecasting engine.
/// Online: proxies to cloud forecasting API.
/// Offline: simple moving average + linear regression.
pub struct ForecastEngine;

impl ForecastEngine {
    pub fn new() -> Self {
        Self
    }

    /// Local forecast using simple moving average.
    pub fn forecast_local(
        &self,
        forecast_type: &str,
        entity_name: &str,
        historical: &[f64],
        horizon: usize,
    ) -> ForecastResult {
        let period = "daily".to_string();
        let labels: Vec<String> = (1..=horizon).map(|d| format!("Day {}", d)).collect();

        let values = if historical.is_empty() {
            vec![0.0; horizon]
        } else {
            let ma = self.simple_moving_average(historical, 7);
            let trend = self.linear_trend(historical);
            (0..horizon).map(|i| {
                let base = ma.last().copied().unwrap_or(0.0);
                (base + trend * (i as f64 + 1.0)).max(0.0)
            }).collect()
        };

        let confidence = if historical.len() >= 14 {
            0.8
        } else if historical.len() >= 7 {
            0.6
        } else {
            0.4
        };

        let trend_str = if values.last() >= values.first() { "up" } else { "down" };

        ForecastResult {
            forecast_type: forecast_type.to_string(),
            entity_id: String::new(),
            entity_name: entity_name.to_string(),
            period,
            values,
            labels,
            confidence,
            trend: trend_str.to_string(),
        }
    }

    fn simple_moving_average(&self, data: &[f64], window: usize) -> Vec<f64> {
        if data.len() < window {
            return data.to_vec();
        }
        data.windows(window).map(|w| w.iter().sum::<f64>() / window as f64).collect()
    }

    fn linear_trend(&self, data: &[f64]) -> f64 {
        let n = data.len();
        if n < 2 {
            return 0.0;
        }
        let sum_x: f64 = (0..n).map(|i| i as f64).sum();
        let sum_y: f64 = data.iter().sum();
        let sum_xy: f64 = data.iter().enumerate().map(|(i, y)| i as f64 * y).sum();
        let sum_x2: f64 = (0..n).map(|i| (i as f64).powi(2)).sum();

        let slope = (n as f64 * sum_xy - sum_x * sum_y) / (n as f64 * sum_x2 - sum_x.powi(2));
        if slope.is_finite() { slope } else { 0.0 }
    }
}
