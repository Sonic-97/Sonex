use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppSettings {
    pub theme: ThemeConfig,
    pub cafe: CafeConfig,
    pub sync: SyncConfig,
    pub printer: PrinterConfig,
    pub language: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ThemeConfig {
    pub mode: String,
    pub accent_color: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CafeConfig {
    pub cafe_id: String,
    pub cafe_name: String,
    pub branch_id: String,
    pub branch_name: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SyncConfig {
    pub auto_sync: bool,
    pub sync_interval_seconds: u32,
    pub last_sync_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PrinterConfig {
    pub receipt_printer: String,
    pub paper_width_mm: u32,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            theme: ThemeConfig {
                mode: "system".to_string(),
                accent_color: "#8C6239".to_string(),
            },
            cafe: CafeConfig {
                cafe_id: String::new(),
                cafe_name: String::new(),
                branch_id: String::new(),
                branch_name: String::new(),
            },
            sync: SyncConfig {
                auto_sync: true,
                sync_interval_seconds: 30,
                last_sync_at: None,
            },
            printer: PrinterConfig {
                receipt_printer: "default".to_string(),
                paper_width_mm: 80,
            },
            language: "ar".to_string(),
        }
    }
}
