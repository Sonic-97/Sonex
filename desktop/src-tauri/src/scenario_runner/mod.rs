use serde::Deserialize;
use std::path::Path;

#[derive(Debug, Deserialize)]
pub struct ScenarioFile {
    pub version: u32,
    pub description: String,
    pub targets: Vec<String>,
    pub scenarios: Vec<Scenario>,
}

#[derive(Debug, Deserialize)]
pub struct Scenario {
    pub id: String,
    pub description: String,
    pub function: String,
    #[serde(default)]
    pub targets: Option<Vec<String>>,
    pub input: serde_json::Value,
    #[serde(rename = "expectedOutput")]
    pub expected_output: serde_json::Value,
    #[serde(rename = "type")]
    pub output_type: String,
    #[serde(default)]
    pub tolerance: Option<f64>,
    #[serde(default)]
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
pub struct ComputeCostInput {
    pub ingredients: Vec<IngredientInput>,
    pub packaging: Vec<PackagingInput>,
    #[serde(rename = "productCost")]
    pub product_cost: f64,
    #[serde(rename = "costPercent")]
    pub cost_percent: f64,
}

#[derive(Debug, Deserialize)]
pub struct IngredientInput {
    pub quantity: f64,
    #[serde(rename = "wastePercent", default)]
    pub waste_percent: f64,
    #[serde(rename = "costPerUnit")]
    pub cost_per_unit: f64,
}

#[derive(Debug, Deserialize)]
pub struct PackagingInput {
    pub quantity: f64,
    #[serde(rename = "costPerUnit")]
    pub cost_per_unit: f64,
}

pub fn compute_product_cost(input: &ComputeCostInput) -> f64 {
    let ingredient_cost = if input.ingredients.is_empty() {
        input.product_cost
    } else {
        input
            .ingredients
            .iter()
            .map(|i| i.quantity * (1.0 + i.waste_percent / 100.0) * i.cost_per_unit)
            .sum::<f64>()
    };
    let packaging_cost: f64 = input
        .packaging
        .iter()
        .map(|p| p.quantity * p.cost_per_unit)
        .sum();
    (ingredient_cost + packaging_cost) * (input.cost_percent / 100.0)
}

pub fn load_scenarios(path: &str) -> Result<ScenarioFile, Box<dyn std::error::Error>> {
    let content = std::fs::read_to_string(path)?;
    let scenarios: ScenarioFile = serde_json::from_str(&content)?;
    Ok(scenarios)
}

pub fn scenario_file_path(filename: &str) -> String {
    let manifest = Path::new(env!("CARGO_MANIFEST_DIR"));
    let project_root = manifest.parent().unwrap().parent().unwrap();
    project_root
        .join("sonex-specs")
        .join("scenarios")
        .join(filename)
        .to_str()
        .unwrap()
        .to_string()
}

pub fn get_active_scenarios<'a>(
    data: &'a ScenarioFile,
    target: &str,
) -> Vec<&'a Scenario> {
    data.scenarios
        .iter()
        .filter(|s| {
            let s_targets: &[String] = s.targets.as_deref().unwrap_or(&data.targets);
            s_targets.iter().any(|t| t == target)
        })
        .collect()
}

#[cfg(test)]
pub mod tests;
