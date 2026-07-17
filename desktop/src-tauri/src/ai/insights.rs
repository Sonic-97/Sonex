use super::types::*;

/// Business insights engine.
/// Online: proxies to cloud analytics/decisions API.
/// Offline: computes basic insights from local DB.
pub struct InsightsEngine;

impl InsightsEngine {
    pub fn new() -> Self {
        Self
    }

    /// Generate insights from local data when offline.
    pub fn generate_local(
        &self,
        total_revenue: f64,
        prev_revenue: f64,
        total_orders: u32,
        prev_orders: u32,
        top_product: &str,
        top_product_revenue: f64,
        low_stock_count: u32,
    ) -> Vec<BusinessInsight> {
        let mut insights = Vec::new();

        // Revenue trend
        if prev_revenue > 0.0 {
            let change = ((total_revenue - prev_revenue) / prev_revenue) * 100.0;
            insights.push(BusinessInsight {
                category: "revenue".to_string(),
                title: format!("Revenue {}", if change >= 0.0 { "Growth" } else { "Decline" }),
                description: format!(
                    "Revenue {} by {:.1}% compared to previous period",
                    if change >= 0.0 { "increased" } else { "decreased" },
                    change.abs()
                ),
                severity: if change.abs() > 20.0 { "high".to_string() } else if change.abs() > 10.0 { "medium".to_string() } else { "low".to_string() },
                metric: total_revenue,
                trend: if change >= 0.0 { "up" } else { "down" }.to_string(),
                recommendation: if change < 0.0 {
                    "Consider reviewing pricing or running promotions".to_string()
                } else {
                    "Maintain current strategy".to_string()
                },
            });
        }

        // Top product
        if !top_product.is_empty() {
            let share = if total_revenue > 0.0 {
                (top_product_revenue / total_revenue) * 100.0
            } else {
                0.0
            };
            insights.push(BusinessInsight {
                category: "product".to_string(),
                title: format!("Top Product: {}", top_product),
                description: format!("{} generates {:.1}% of total revenue", top_product, share),
                severity: if share > 50.0 { "high".to_string() } else { "medium".to_string() },
                metric: top_product_revenue,
                trend: "stable".to_string(),
                recommendation: if share > 50.0 {
                    format!("Consider promoting {} more to diversify revenue", top_product)
                } else {
                    format!("{} is performing well, maintain stock levels", top_product)
                },
            });
        }

        // Low stock alert
        if low_stock_count > 0 {
            insights.push(BusinessInsight {
                category: "inventory".to_string(),
                title: format!("{} Low Stock Items", low_stock_count),
                description: format!("{} inventory items are below minimum threshold", low_stock_count),
                severity: if low_stock_count > 5 { "high".to_string() } else { "medium".to_string() },
                metric: low_stock_count as f64,
                trend: "warning".to_string(),
                recommendation: "Review inventory and place orders for low stock items".to_string(),
            });
        }

        // Order volume
        if total_orders > 0 {
            insights.push(BusinessInsight {
                category: "operations".to_string(),
                title: format!("{} Orders Processed", total_orders),
                description: format!("{} orders have been processed in this period", total_orders),
                severity: "low".to_string(),
                metric: total_orders as f64,
                trend: if prev_orders == 0 || total_orders >= prev_orders { "up" } else { "down" }.to_string(),
                recommendation: "Continue monitoring order volume trends".to_string(),
            });
        }

        insights
    }
}
