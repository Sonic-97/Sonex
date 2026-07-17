use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;

/// Phase of a sync cycle.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum SyncPhase {
    Idle,
    Authenticating,
    Uploading,
    Downloading,
    Processing,
    Completed,
    Failed(String),
}

impl SyncPhase {
    pub fn as_str(&self) -> &str {
        match self {
            Self::Idle => "idle",
            Self::Authenticating => "authenticating",
            Self::Uploading => "uploading",
            Self::Downloading => "downloading",
            Self::Processing => "processing",
            Self::Completed => "completed",
            Self::Failed(_) => "failed",
        }
    }
}

/// Progress information for a sync cycle, exposed to the API and UI.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncProgress {
    pub phase: String,
    pub current_item: usize,
    pub total_items: usize,
    pub percentage: f64,
    pub items_succeeded: usize,
    pub items_failed: usize,
    pub items_conflicted: usize,
    pub elapsed_seconds: f64,
    pub message: String,
}

impl Default for SyncProgress {
    fn default() -> Self {
        Self {
            phase: "idle".into(),
            current_item: 0,
            total_items: 0,
            percentage: 0.0,
            items_succeeded: 0,
            items_failed: 0,
            items_conflicted: 0,
            elapsed_seconds: 0.0,
            message: String::new(),
        }
    }
}

/// Thread-safe progress tracker for the sync engine.
pub struct ProgressTracker {
    phase: RwLock<SyncPhase>,
    current_item: AtomicUsize,
    total_items: AtomicUsize,
    items_succeeded: AtomicUsize,
    items_failed: AtomicUsize,
    items_conflicted: AtomicUsize,
    message: RwLock<String>,
    start_time: RwLock<Option<std::time::Instant>>,
}

impl ProgressTracker {
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            phase: RwLock::new(SyncPhase::Idle),
            current_item: AtomicUsize::new(0),
            total_items: AtomicUsize::new(0),
            items_succeeded: AtomicUsize::new(0),
            items_failed: AtomicUsize::new(0),
            items_conflicted: AtomicUsize::new(0),
            message: RwLock::new(String::new()),
            start_time: RwLock::new(None),
        })
    }

    pub fn begin_phase(&self, phase: SyncPhase, total_items: usize, message: &str) {
        let mut p = self.phase.blocking_write();
        *p = phase;
        self.total_items.store(total_items, Ordering::Release);
        self.current_item.store(0, Ordering::Release);
        let mut m = self.message.blocking_write();
        m.clear();
        m.push_str(message);
        let mut st = self.start_time.blocking_write();
        if st.is_none() {
            *st = Some(std::time::Instant::now());
        }
    }

    pub async fn begin_phase_async(&self, phase: SyncPhase, total_items: usize, message: &str) {
        let mut p = self.phase.write().await;
        *p = phase;
        self.total_items.store(total_items, Ordering::Release);
        self.current_item.store(0, Ordering::Release);
        let mut m = self.message.write().await;
        m.clear();
        m.push_str(message);
        let mut st = self.start_time.write().await;
        if st.is_none() {
            *st = Some(std::time::Instant::now());
        }
    }

    pub fn set_items_total(&self, total: usize) {
        self.total_items.store(total, Ordering::Release);
    }

    pub fn increment_succeeded(&self) {
        self.current_item.fetch_add(1, Ordering::AcqRel);
        self.items_succeeded.fetch_add(1, Ordering::AcqRel);
    }

    pub fn increment_failed(&self) {
        self.current_item.fetch_add(1, Ordering::AcqRel);
        self.items_failed.fetch_add(1, Ordering::AcqRel);
    }

    pub fn set_items_completed(&self, completed: usize) {
        self.current_item.store(completed, Ordering::Release);
    }

    pub fn advance(&self, succeeded: bool, conflicted: bool) {
        self.current_item.fetch_add(1, Ordering::AcqRel);
        if succeeded {
            self.items_succeeded.fetch_add(1, Ordering::AcqRel);
        } else {
            self.items_failed.fetch_add(1, Ordering::AcqRel);
        }
        if conflicted {
            self.items_conflicted.fetch_add(1, Ordering::AcqRel);
        }
    }

    pub async fn complete_async(&self, message: &str) {
        let mut p = self.phase.write().await;
        *p = SyncPhase::Completed;
        let mut m = self.message.write().await;
        m.clear();
        m.push_str(message);
    }

    pub fn complete(&self, message: &str) {
        let mut p = self.phase.blocking_write();
        *p = SyncPhase::Completed;
        let mut m = self.message.blocking_write();
        m.clear();
        m.push_str(message);
    }

    pub fn fail(&self, error: &str) {
        let mut p = self.phase.blocking_write();
        *p = SyncPhase::Failed(error.to_string());
        let mut m = self.message.blocking_write();
        m.clear();
        m.push_str(error);
    }

    pub async fn snapshot(&self) -> SyncProgress {
        let phase = self.phase.read().await;
        let total = self.total_items.load(Ordering::Acquire);
        let current = self.current_item.load(Ordering::Acquire);
        let succ = self.items_succeeded.load(Ordering::Acquire);
        let fail = self.items_failed.load(Ordering::Acquire);
        let conf = self.items_conflicted.load(Ordering::Acquire);
        let msg = self.message.read().await.clone();
        let elapsed = self.start_time.read().await.map(|st| {
            st.elapsed().as_secs_f64()
        }).unwrap_or(0.0);

        let pct = if total > 0 {
            (current as f64 / total as f64) * 100.0
        } else {
            match *phase {
                SyncPhase::Completed => 100.0,
                SyncPhase::Idle => 0.0,
                _ => 50.0,
            }
        };

        SyncProgress {
            phase: phase.as_str().to_string(),
            current_item: current,
            total_items: total,
            percentage: pct,
            items_succeeded: succ,
            items_failed: fail,
            items_conflicted: conf,
            elapsed_seconds: elapsed,
            message: msg,
        }
    }
}
