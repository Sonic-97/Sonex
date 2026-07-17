use serde::{Deserialize, Serialize};
use std::fmt;

/// Supported entity types that can be synchronised.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum EntityType {
    Product,
    Category,
    InventoryItem,
    Recipe,
    Customer,
    Staff,
    Supplier,
    Expense,
    Payment,
    Branch,
    Cafe,
    Order,
    OrderStatusHistory,
    PosOrder,
    PosFavorite,
    PosModifierGroup,
    PosModifierOption,
    PosAuditLog,
    PosPrinter,
}

impl EntityType {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Product => "product",
            Self::Category => "category",
            Self::InventoryItem => "inventory_item",
            Self::Recipe => "recipe",
            Self::Customer => "customer",
            Self::Staff => "staff",
            Self::Supplier => "supplier",
            Self::Expense => "expense",
            Self::Payment => "payment",
            Self::Branch => "branch",
            Self::Cafe => "cafe",
            Self::Order => "order",
            Self::OrderStatusHistory => "order_status_history",
            Self::PosOrder => "pos_order",
            Self::PosFavorite => "pos_favorite",
            Self::PosModifierGroup => "pos_modifier_group",
            Self::PosModifierOption => "pos_modifier_option",
            Self::PosAuditLog => "pos_audit_log",
            Self::PosPrinter => "pos_printer",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "product" => Some(Self::Product),
            "category" => Some(Self::Category),
            "inventory_item" => Some(Self::InventoryItem),
            "recipe" => Some(Self::Recipe),
            "customer" => Some(Self::Customer),
            "staff" => Some(Self::Staff),
            "supplier" => Some(Self::Supplier),
            "expense" => Some(Self::Expense),
            "payment" => Some(Self::Payment),
            "branch" => Some(Self::Branch),
            "cafe" => Some(Self::Cafe),
            "order" => Some(Self::Order),
            "order_status_history" => Some(Self::OrderStatusHistory),
            "pos_order" => Some(Self::PosOrder),
            "pos_favorite" => Some(Self::PosFavorite),
            "pos_modifier_group" => Some(Self::PosModifierGroup),
            "pos_modifier_option" => Some(Self::PosModifierOption),
            "pos_audit_log" => Some(Self::PosAuditLog),
            "pos_printer" => Some(Self::PosPrinter),
            _ => None,
        }
    }

    pub fn is_excluded_from_sync(&self) -> bool {
        matches!(self, Self::PosAuditLog)
    }
}

impl fmt::Display for EntityType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

/// Sync operation type.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum SyncOperation {
    Create,
    Update,
    Delete,
}

impl SyncOperation {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Create => "CREATE",
            Self::Update => "UPDATE",
            Self::Delete => "DELETE",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "CREATE" => Some(Self::Create),
            "UPDATE" => Some(Self::Update),
            "DELETE" => Some(Self::Delete),
            _ => None,
        }
    }
}

impl fmt::Display for SyncOperation {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

/// Status of a sync queue item.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum QueueItemStatus {
    Pending,
    Syncing,
    Completed,
    Failed,
    Conflict,
}

impl QueueItemStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Pending => "pending",
            Self::Syncing => "syncing",
            Self::Completed => "completed",
            Self::Failed => "failed",
            Self::Conflict => "conflict",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "pending" => Some(Self::Pending),
            "syncing" => Some(Self::Syncing),
            "completed" => Some(Self::Completed),
            "failed" => Some(Self::Failed),
            "conflict" => Some(Self::Conflict),
            _ => None,
        }
    }
}

/// A single item in the sync queue (mirrors the DB row).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncQueueItem {
    pub id: i64,
    pub entity_type: String,
    pub entity_id: String,
    pub operation: String,
    pub payload: String,
    pub local_version: i32,
    pub created_at: String,
    pub retry_count: i32,
    pub max_retries: i32,
    pub last_error: Option<String>,
    pub status: String,
    pub idempotency_key: Option<String>,
}

/// Configuration for the sync engine.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncConfig {
    pub auto_sync: bool,
    pub sync_interval_ms: u64,
    pub batch_size: usize,
    pub max_retries: u32,
    pub base_retry_delay_ms: u64,
    pub max_retry_delay_ms: u64,
    pub cafe_id: String,
    pub branch_id: Option<String>,
    pub encryption_enabled: bool,
    pub cloud_url: String,
    pub authenticated: bool,
}

impl Default for SyncConfig {
    fn default() -> Self {
        Self {
            auto_sync: true,
            sync_interval_ms: 30_000,
            batch_size: 25,
            max_retries: 5,
            base_retry_delay_ms: 1_000,
            max_retry_delay_ms: 300_000,
            cafe_id: String::new(),
            branch_id: None,
            encryption_enabled: false,
            cloud_url: "http://localhost:5112/api/cloud".to_string(),
            authenticated: false,
        }
    }
}

/// Sync engine status (lightweight, for polling).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncStatus {
    pub pending_count: usize,
    pub failed_count: usize,
    pub completed_count: usize,
    pub conflict_count: usize,
    pub last_sync_version: i64,
    pub last_sync_at: Option<String>,
    pub online: bool,
    pub is_syncing: bool,
    pub last_error: Option<String>,
    pub authenticated: bool,
    pub branch_id: Option<String>,
    pub encryption_enabled: bool,
}

impl Default for SyncStatus {
    fn default() -> Self {
        Self {
            pending_count: 0,
            failed_count: 0,
            completed_count: 0,
            conflict_count: 0,
            last_sync_version: 0,
            last_sync_at: None,
            online: true,
            is_syncing: false,
            last_error: None,
            authenticated: false,
            branch_id: None,
            encryption_enabled: false,
        }
    }
}

/// Comprehensive sync report returned on demand.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncReport {
    pub timestamp: String,
    pub cafe_id: String,
    pub branch_id: Option<String>,
    pub authenticated: bool,
    pub online: bool,
    pub encryption_enabled: bool,
    pub queue_stats: QueueStats,
    pub last_sync: LastSyncInfo,
    pub progress: crate::sync::progress::SyncProgress,
    pub entity_counts: Vec<EntityCount>,
    pub recent_errors: Vec<SyncErrorEntry>,
    pub config: SyncConfigSummary,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueueStats {
    pub total: usize,
    pub pending: usize,
    pub syncing: usize,
    pub completed: usize,
    pub failed: usize,
    pub conflict: usize,
    pub total_retries: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LastSyncInfo {
    pub version: i64,
    pub at: Option<String>,
    pub duration_seconds: f64,
    pub items_synced: usize,
    pub success: bool,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EntityCount {
    pub entity_type: String,
    pub count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncErrorEntry {
    pub entity_type: String,
    pub entity_id: String,
    pub error: String,
    pub retry_count: i32,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncConfigSummary {
    pub auto_sync: bool,
    pub sync_interval_ms: u64,
    pub batch_size: usize,
    pub max_retries: u32,
    pub encryption_enabled: bool,
    pub cloud_url: String,
}

/// Result of processing a single queue item.
#[derive(Debug, Clone)]
pub enum ItemResult {
    Completed,
    Failed(String),
    Conflict { remote_version: i32, remote_payload: String },
    Skipped(String),
}

/// Summary of a download operation.
#[derive(Debug, Clone)]
pub struct DownloadSummary {
    pub changes_applied: usize,
    pub conflicts: usize,
    pub new_version: i64,
}

/// Summary of an upload batch.
#[derive(Debug, Clone)]
pub struct UploadSummary {
    pub completed: usize,
    pub failed: usize,
    pub conflicts: usize,
    pub skipped: usize,
}

/// A change received from the remote server.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteChange {
    pub entity_type: String,
    pub entity_id: String,
    pub operation: String,
    pub payload: serde_json::Value,
    pub remote_version: i64,
    pub updated_at: String,
    pub branch_id: Option<String>,
}

/// Response from the remote upload endpoint.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UploadResponse {
    pub accepted: bool,
    pub remote_version: i64,
    pub conflict: bool,
    pub remote_payload: Option<serde_json::Value>,
    pub message: String,
}

/// Response from the remote download endpoint.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadResponse {
    pub changes: Vec<RemoteChange>,
    pub last_version: i64,
    pub has_more: bool,
}

/// Branch isolation filter for sync operations.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BranchFilter {
    pub branch_id: String,
    pub isolated: bool,
}
