use super::types::*;

/// Natural Language Processing engine.
/// Online: proxies to cloud AI NLP service.
/// Offline: regex-based intent/entity extraction.
pub struct NlpEngine;

impl NlpEngine {
    pub fn new() -> Self {
        Self
    }

    /// Parse a natural language query. Falls back to local regex when cloud unavailable.
    pub fn parse_local(&self, text: &str) -> NlpResult {
        let lower = text.to_lowercase();
        let intent = self.detect_intent(&lower);
        let entities = self.extract_entities(&lower);

        NlpResult {
            intent: intent.as_str().to_string(),
            confidence: if intent != Intent::Unknown { 0.7 } else { 0.3 },
            entities,
            raw_text: text.to_string(),
        }
    }

    fn detect_intent(&self, text: &str) -> Intent {
        let search_keywords = ["ابحث", "دور", "بحث", "find", "search", "look for", "أبحث"];
        let order_keywords = ["اطلب", "طلب", "order", "أريد", "عايز", "need", "want"];
        let sales_keywords = ["مبيعات", "إيرادات", "sales", "revenue", "ربح", "profit", "كم"];
        let insight_keywords = ["تقارير", "تحليل", "insight", "report", "analysis", "إحصائيات"];
        let forecast_keywords = ["توقع", "توقعات", "forecast", "predict", "متوقع"];
        let inventory_keywords = ["مخزون", "inventory", "stock", "مادة", "خام"];

        if search_keywords.iter().any(|k| text.contains(*k)) {
            Intent::SearchProduct
        } else if order_keywords.iter().any(|k| text.contains(*k)) {
            Intent::CreateOrder
        } else if sales_keywords.iter().any(|k| text.contains(*k)) {
            Intent::GetSales
        } else if insight_keywords.iter().any(|k| text.contains(*k)) {
            Intent::GetInsights
        } else if forecast_keywords.iter().any(|k| text.contains(*k)) {
            Intent::ForecastDemand
        } else if inventory_keywords.iter().any(|k| text.contains(*k)) {
            Intent::CheckInventory
        } else {
            Intent::Unknown
        }
    }

    fn extract_entities(&self, text: &str) -> Vec<NlpEntity> {
        let mut entities = Vec::new();

        // Extract product names (words after search/order keywords)
        let trigger_words = ["ابحث عن", "دور على", "بحث", "اطلب", "أريد", "عايز", "search", "find", "order", "need"];
        for trigger in &trigger_words {
            if let Some(pos) = text.find(trigger) {
                let after = &text[pos + trigger.len()..].trim();
                if !after.is_empty() {
                    let product = after.split_whitespace().take(5).collect::<Vec<_>>().join(" ");
                    entities.push(NlpEntity {
                        entity_type: "product".to_string(),
                        value: product,
                        confidence: 0.6,
                    });
                    break;
                }
            }
        }

        // Extract quantity (numbers)
        for word in text.split_whitespace() {
            if let Ok(n) = word.parse::<i32>() {
                if n > 0 && n < 1000 {
                    entities.push(NlpEntity {
                        entity_type: "quantity".to_string(),
                        value: n.to_string(),
                        confidence: 0.9,
                    });
                }
            }
        }

        entities
    }

    /// Extract search terms from a natural language query.
    pub fn extract_search_terms(&self, text: &str) -> String {
        let lower = text.to_lowercase();
        let stop_words = ["ابحث عن", "دور على", "بحث", "find", "search", "look for", "أبحث", "عايز", "أريد", "please", "من فضلك", "لو سمحت"];

        let mut result = lower.clone();
        for sw in &stop_words {
            result = result.replace(sw, "");
        }

        result.trim().to_string()
    }
}
