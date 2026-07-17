use super::*;

const TOLERANCE: f64 = 0.0001;

fn approx_eq(a: f64, b: f64, tol: f64) -> bool {
    if b == 0.0 {
        a.abs() < tol
    } else {
        ((a - b) / b).abs() < tol
    }
}

fn deep_eq(actual: &serde_json::Value, expected: &serde_json::Value, tol: f64) -> bool {
    match (actual, expected) {
        (serde_json::Value::Number(a), serde_json::Value::Number(e)) => {
            let a_f64 = a.as_f64().unwrap_or(0.0);
            let e_f64 = e.as_f64().unwrap_or(0.0);
            if e_f64 == 0.0 {
                a_f64.abs() < tol
            } else {
                ((a_f64 - e_f64) / e_f64).abs() < tol
            }
        }
        (serde_json::Value::Object(a), serde_json::Value::Object(e)) => {
            if a.len() != e.len() {
                return false;
            }
            a.iter().all(|(key, val_a)| {
                e.get(key)
                    .map_or(false, |val_e| deep_eq(val_a, val_e, tol))
            })
        }
        (serde_json::Value::Array(a), serde_json::Value::Array(e)) => {
            a.len() == e.len()
                && a.iter()
                    .zip(e.iter())
                    .all(|(va, ve)| deep_eq(va, ve, tol))
        }
        _ => actual == expected,
    }
}

#[test]
fn file_targets_include_desktop() {
    let path = scenario_file_path("costing.json");
    let data = load_scenarios(&path).expect("Failed to load scenario file");
    assert!(
        data.targets.contains(&"desktop".to_string()),
        "Top-level targets must include 'desktop', got: {:?}",
        data.targets
    );
}

#[test]
fn run_costing_scenarios() {
    let path = scenario_file_path("costing.json");
    let data = load_scenarios(&path).expect("Failed to load scenario file");

    let scenarios = get_active_scenarios(&data, "desktop");
    assert!(
        !scenarios.is_empty(),
        "No desktop-targeted scenarios found in {}",
        path
    );

    let mut passed = 0u32;
    let mut failed: Vec<String> = Vec::new();

    for scenario in &scenarios {
        let result = match scenario.function.as_str() {
            "computeProductCost" => {
                let input: ComputeCostInput = serde_json::from_value(scenario.input.clone())
                    .unwrap_or_else(|e| {
                        panic!(
                            "{}: Failed to parse input: {}. Input: {}",
                            scenario.id, e, scenario.input
                        )
                    });
                let actual = compute_product_cost(&input);
                let actual_val = serde_json::json!(actual);
                deep_eq(&actual_val, &scenario.expected_output, TOLERANCE)
            }
            other => {
                panic!(
                    "{}: Unknown function '{}' — Desktop runner only supports computeProductCost",
                    scenario.id, other
                );
            }
        };

        if result {
            passed += 1;
        } else {
            let actual = match scenario.function.as_str() {
                "computeProductCost" => {
                    let input: ComputeCostInput =
                        serde_json::from_value(scenario.input.clone()).unwrap();
                    serde_json::json!(compute_product_cost(&input))
                }
                _ => serde_json::Value::Null,
            };
            failed.push(format!(
                "{}: {} — expected {} but got {}",
                scenario.id, scenario.description, scenario.expected_output, actual
            ));
        }
    }

    for failure in &failed {
        println!("FAIL: {}", failure);
    }

    assert!(
        failed.is_empty(),
        "{}/{} scenarios failed:\n{}",
        failed.len(),
        scenarios.len(),
        failed.join("\n")
    );
    println!(
        "All {}/{} scenarios passed.",
        passed,
        scenarios.len()
    );
}
