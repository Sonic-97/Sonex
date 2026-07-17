use super::types::*;

/// AI-enhanced product search engine.
/// Online: uses cloud AI semantic search.
/// Offline: uses local SQLite FTS5 + NLP-derived keywords.
pub struct SearchEngine;

impl SearchEngine {
    pub fn new() -> Self {
        Self
    }

    /// Local offline search using keyword matching + scoring.
    pub fn search_local(
        &self,
        query: &str,
        products: &[ProductRecord],
        limit: usize,
    ) -> Vec<AiSearchResult> {
        let lower = query.to_lowercase();
        let terms: Vec<&str> = lower.split_whitespace().collect();
        if terms.is_empty() {
            return vec![];
        }

        let mut scored: Vec<(f64, &ProductRecord)> = products
            .iter()
            .filter_map(|p| {
                let name = p.name.to_lowercase();
                let score = self.compute_relevance(&name, &terms, &p.category);
                if score > 0.0 {
                    Some((score, p))
                } else {
                    None
                }
            })
            .collect();

        scored.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));

        scored
            .into_iter()
            .take(limit)
            .map(|(score, p)| AiSearchResult {
                product_id: p.id.clone(),
                name: p.name.clone(),
                price: p.price,
                score,
                reason: self.reason_text(score),
            })
            .collect()
    }

    fn compute_relevance(&self, name: &str, terms: &[&str], category: &str) -> f64 {
        let mut score = 0.0;
        for term in terms {
            if term.len() < 2 {
                continue;
            }
            if name.contains(*term) {
                // Exact substring match in name
                if name == *term {
                    score += 10.0;
                } else if name.starts_with(*term) || name.ends_with(*term) {
                    score += 5.0;
                } else {
                    score += 3.0;
                }
            }
            if category.to_lowercase().contains(*term) {
                score += 2.0;
            }
        }
        // Normalize by term count
        if !terms.is_empty() {
            score /= terms.len() as f64;
        }
        score
    }

    fn reason_text(&self, score: f64) -> String {
        if score >= 8.0 {
            "Exact match".to_string()
        } else if score >= 4.0 {
            "High relevance".to_string()
        } else if score >= 2.0 {
            "Partial match".to_string()
        } else {
            "Low relevance".to_string()
        }
    }
}

/// Minimal product record for local search.
#[derive(Debug, Clone)]
pub struct ProductRecord {
    pub id: String,
    pub name: String,
    pub price: f64,
    pub category: String,
}
