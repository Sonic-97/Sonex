pub mod auth;
pub mod conflict;
pub mod download;
pub mod encryption;
pub mod error;
pub mod mock;
pub mod network;
pub mod progress;
pub mod queue;
pub mod types;
pub mod upload;

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use crate::db::Database;

pub use auth::{AuthConfig, SyncAuth};
pub use conflict::{ConflictResolver, ConflictStrategy, Resolution};
pub use encryption::{derive_encryption_key, SyncEncryption};
pub use error::{SyncError, SyncResult};
pub use mock::{MockRemoteApi, RemoteApi};
pub use network::NetworkMonitor;
pub use progress::{ProgressTracker, SyncPhase, SyncProgress};
pub use types::*;

/// The central sync engine orchestrator.
pub struct SyncEngine {
    db: Database,
    remote: Arc<dyn RemoteApi>,
    config: types::SyncConfig,
    running: Arc<AtomicBool>,
    online: Arc<AtomicBool>,
    strategy: ConflictStrategy,
    auth: tokio::sync::RwLock<SyncAuth>,
    progress: Arc<ProgressTracker>,
    encryption: tokio::sync::RwLock<Option<SyncEncryption>>,
    last_sync_result: tokio::sync::RwLock<Option<SyncReport>>,
}

impl SyncEngine {
    pub fn new(db: Database, remote: Arc<dyn RemoteApi>, config: types::SyncConfig) -> Self {
        let auth = SyncAuth::new(&config.cafe_id, "sonic-sync-secret-2026");
        Self {
            db: db.clone(),
            remote,
            config,
            running: Arc::new(AtomicBool::new(false)),
            online: Arc::new(AtomicBool::new(true)),
            strategy: ConflictStrategy::RemoteWins,
            auth: tokio::sync::RwLock::new(auth),
            progress: ProgressTracker::new(),
            encryption: tokio::sync::RwLock::new(None),
            last_sync_result: tokio::sync::RwLock::new(None),
        }
    }

    pub fn with_strategy(mut self, strategy: ConflictStrategy) -> Self {
        self.strategy = strategy;
        self
    }

    pub fn with_encryption(mut self, key: [u8; 32]) -> Self {
        let enc = SyncEncryption::new(&key);
        // Use a temporary to break the borrow
        let w = &mut self.encryption;
        let mut guard = w.blocking_write();
        *guard = Some(enc);
        drop(guard);
        self
    }

    pub fn progress(&self) -> Arc<ProgressTracker> {
        self.progress.clone()
    }

    pub async fn start(self) -> SyncResult<SyncHandle> {
        if self.running.load(Ordering::Acquire) {
            return Err(SyncError::AlreadyRunning);
        }

        self.running.store(true, Ordering::Release);
        tracing::info!("sync engine started (cafe={}, branch={:?})", self.config.cafe_id, self.config.branch_id);

        // Crash recovery
        let recovered = sqlx::query(
            "UPDATE sync_queue SET status = 'pending', retry_count = retry_count + 1, last_error = 'crash recovery' WHERE status = 'syncing'",
        )
        .execute(&self.db.pool)
        .await
        .map_err(SyncError::from)?;
        if recovered.rows_affected() > 0 {
            tracing::info!("crash recovery: reset {} stuck sync items", recovered.rows_affected());
        }

        let online = self.online.clone();
        let running = self.running.clone();
        let db = self.db.clone();
        let remote = self.remote.clone();
        let config = self.config.clone();
        let strategy = self.strategy;
        let progress = self.progress.clone();
        let auth = Arc::new(tokio::sync::RwLock::new(
            SyncAuth::new(&config.cafe_id, "sonic-sync-secret-2026")
        ));
        let encryption = Arc::new(tokio::sync::RwLock::new(None));
        let last_result = Arc::new(tokio::sync::RwLock::new(None::<SyncReport>));

        let cancel = Arc::new(AtomicBool::new(false));
        let cancel_clone = cancel.clone();

        let handle = SyncHandle {
            cancel: cancel_clone,
            online: online.clone(),
            running: running.clone(),
            db: db.clone(),
            remote: remote.clone(),
            config: config.clone(),
            progress: self.progress.clone(),
            auth: auth.clone(),
            encryption: encryption.clone(),
            last_result: last_result.clone(),
            strategy,
        };

        if config.auto_sync {
            let p = self.progress.clone();
            tokio::spawn(async move {
                Self::background_loop(
                    db, remote, online, running, config, strategy,
                    cancel, p, auth, encryption, last_result,
                ).await;
            });
        }

        Ok(handle)
    }

    async fn background_loop(
        db: Database,
        remote: Arc<dyn RemoteApi>,
        online: Arc<AtomicBool>,
        running: Arc<AtomicBool>,
        config: types::SyncConfig,
        strategy: ConflictStrategy,
        cancel: Arc<AtomicBool>,
        progress: Arc<ProgressTracker>,
        auth: Arc<tokio::sync::RwLock<SyncAuth>>,
        encryption: Arc<tokio::sync::RwLock<Option<SyncEncryption>>>,
        last_result: Arc<tokio::sync::RwLock<Option<SyncReport>>>,
    ) {
        while running.load(Ordering::Acquire) && !cancel.load(Ordering::Acquire) {
            if !online.load(Ordering::Acquire) {
                tokio::time::sleep(Duration::from_secs(5)).await;
                continue;
            }

            if let Err(e) = Self::sync_cycle(
                &db, remote.as_ref(), &config, strategy,
                &progress, &auth, &encryption, &last_result,
            ).await {
                tracing::warn!("sync cycle error: {}", e);
            }

            for _ in 0..(config.sync_interval_ms / 100).max(1) {
                if cancel.load(Ordering::Acquire) || !running.load(Ordering::Acquire) {
                    return;
                }
                tokio::time::sleep(Duration::from_millis(100)).await;
            }
        }
    }

    /// Execute a full sync cycle: authenticate, upload, download, cleanup.
    async fn sync_cycle(
        db: &Database,
        remote: &dyn RemoteApi,
        config: &types::SyncConfig,
        strategy: ConflictStrategy,
        progress: &Arc<ProgressTracker>,
        auth: &Arc<tokio::sync::RwLock<SyncAuth>>,
        encryption: &Arc<tokio::sync::RwLock<Option<SyncEncryption>>>,
        last_result: &Arc<tokio::sync::RwLock<Option<SyncReport>>>,
    ) -> SyncResult<UploadSummary> {
        let start = std::time::Instant::now();

        // 1. Authenticate if needed
        let auth_guard = auth.read().await;
        if !auth_guard.is_authenticated() {
            drop(auth_guard);
            progress.begin_phase_async(SyncPhase::Authenticating, 0, "Authenticating...").await;
            let mut auth_w = auth.write().await;
            // Try mock auth (development mode)
            let creds = auth::SyncCredentials {
                cafe_id: config.cafe_id.clone(),
                owner_code: "mock".into(),
                password: "mock".into(),
            };
            if let Some(resp) = auth::SyncAuth::authenticate_mock(&creds) {
                auth_w.set_token(resp.token, resp.expires_at);
                tracing::info!("sync: authenticated mock for cafe {}", config.cafe_id);
            }
        } else {
            drop(auth_guard);
        }

        // 2. Upload pending changes
        let pending_count = queue::QueueManager::count_pending(db).await.unwrap_or(0);
        progress.begin_phase_async(SyncPhase::Uploading, pending_count, "Uploading...").await;
        let upload_summary = upload::UploadManager::process_batch(
            db, remote, config.batch_size, &config.cafe_id,
            config.branch_id.as_deref(), strategy, &progress, &encryption,
        ).await?;

        // 3. Download remote changes
        progress.begin_phase_async(SyncPhase::Downloading, 0, "Downloading...").await;
        download::DownloadManager::pull_changes(
            db, remote, &config.cafe_id, config.branch_id.as_deref(), strategy,
        ).await?;

        // 4. Cleanup old completed items
        let cutoff = chrono::Utc::now()
            .checked_sub_signed(chrono::Duration::days(7))
            .unwrap()
            .to_rfc3339();
        let _ = queue::QueueManager::cleanup_completed(db, &cutoff).await;

        // 5. Generate report
        let elapsed = start.elapsed().as_secs_f64();
        let report = build_sync_report(db, config, progress, &upload_summary, elapsed, true, None).await;
        let mut last = last_result.write().await;
        *last = Some(report);

        progress.complete("Sync cycle completed");
        Ok(upload_summary)
    }

    /// Execute a single sync cycle (for manual trigger).
    pub async fn sync_once(
        db: &Database,
        remote: &dyn RemoteApi,
        cafe_id: &str,
        branch_id: Option<&str>,
        strategy: ConflictStrategy,
    ) -> SyncResult<UploadSummary> {
        upload::UploadManager::process_batch(db, remote, 25, cafe_id, branch_id, strategy, &ProgressTracker::new(), &Arc::new(tokio::sync::RwLock::new(None))).await
    }

    pub async fn get_status(&self) -> SyncResult<types::SyncStatus> {
        let pending = queue::QueueManager::count_pending(&self.db).await?;
        let failed = queue::QueueManager::count_failed_permanent(&self.db).await?;
        let completed = queue::QueueManager::count_by_status(&self.db, "completed").await?;
        let conflict = queue::QueueManager::count_by_status(&self.db, "conflict").await?;
        let (last_sync_version, last_sync_at) =
            queue::QueueManager::get_sync_state(&self.db, &self.config.cafe_id).await?;
        let auth = self.auth.read().await;

        Ok(types::SyncStatus {
            pending_count: pending,
            failed_count: failed,
            completed_count: completed,
            conflict_count: conflict,
            last_sync_version,
            last_sync_at,
            online: self.online.load(Ordering::Acquire),
            is_syncing: false,
            last_error: None,
            authenticated: auth.is_authenticated(),
            branch_id: self.config.branch_id.clone(),
            encryption_enabled: self.config.encryption_enabled,
        })
    }

    /// Generate a sync report from just a database (static context, no running engine).
    pub async fn generate_report_from_db(db: &Database, cafe_id: &str) -> SyncResult<SyncReport> {
        let progress = ProgressTracker::new();
        let config = types::SyncConfig {
            cafe_id: cafe_id.to_string(),
            auto_sync: false,
            ..Default::default()
        };
        let upload_summary = UploadSummary { completed: 0, failed: 0, conflicts: 0, skipped: 0 };
        Ok(build_sync_report(db, &config, &progress, &upload_summary, 0.0, true, None).await)
    }

    pub async fn generate_report(&self) -> SyncResult<SyncReport> {
        let pending = queue::QueueManager::count_pending(&self.db).await?;
        let failed = queue::QueueManager::count_failed_permanent(&self.db).await?;
        let completed = queue::QueueManager::count_by_status(&self.db, "completed").await?;
        let conflict = queue::QueueManager::count_by_status(&self.db, "conflict").await?;
        let total = queue::QueueManager::count_total(&self.db).await?;
        let (last_version, last_at) = queue::QueueManager::get_sync_state(&self.db, &self.config.cafe_id).await?;
        let auth = self.auth.read().await;
        let progress_snap = self.progress.snapshot().await;
        let last_sync = self.last_sync_result.read().await.clone();

        // Entity counts
        let mut entity_counts = Vec::new();
        for entity_type in &["product", "customer", "inventory_item", "recipe", "pos_order", "staff", "supplier", "expense", "payment"] {
            let count = queue::QueueManager::count_by_entity_type(&self.db, entity_type).await.unwrap_or(0);
            entity_counts.push(EntityCount { entity_type: entity_type.to_string(), count });
        }

        // Recent errors from failed items
        let recent_errors = get_recent_sync_errors(&self.db).await;

        let report = SyncReport {
            timestamp: chrono::Utc::now().to_rfc3339(),
            cafe_id: self.config.cafe_id.clone(),
            branch_id: self.config.branch_id.clone(),
            authenticated: auth.is_authenticated(),
            online: self.online.load(Ordering::Acquire),
            encryption_enabled: self.config.encryption_enabled,
            queue_stats: QueueStats {
                total,
                pending,
                syncing: 0,
                completed,
                failed,
                conflict,
                total_retries: queue::QueueManager::total_retries(&self.db).await.unwrap_or(0),
            },
            last_sync: LastSyncInfo {
                version: last_version,
                at: last_at,
                duration_seconds: progress_snap.elapsed_seconds,
                items_synced: progress_snap.items_succeeded,
                success: !matches!(progress_snap.phase.as_str(), "failed"),
                error: last_sync.as_ref().and_then(|r| {
                    if !r.last_sync.success { r.last_sync.error.clone() } else { None }
                }),
            },
            progress: progress_snap,
            entity_counts,
            recent_errors,
            config: SyncConfigSummary {
                auto_sync: self.config.auto_sync,
                sync_interval_ms: self.config.sync_interval_ms,
                batch_size: self.config.batch_size,
                max_retries: self.config.max_retries,
                encryption_enabled: self.config.encryption_enabled,
                cloud_url: self.config.cloud_url.clone(),
            },
        };

        let mut last = self.last_sync_result.write().await;
        *last = Some(report.clone());
        Ok(report)
    }
}

/// Handle for controlling a running sync engine.
pub struct SyncHandle {
    cancel: Arc<AtomicBool>,
    online: Arc<AtomicBool>,
    running: Arc<AtomicBool>,
    db: Database,
    remote: Arc<dyn RemoteApi>,
    config: types::SyncConfig,
    progress: Arc<ProgressTracker>,
    auth: Arc<tokio::sync::RwLock<SyncAuth>>,
    encryption: Arc<tokio::sync::RwLock<Option<SyncEncryption>>>,
    last_result: Arc<tokio::sync::RwLock<Option<SyncReport>>>,
    strategy: ConflictStrategy,
}

impl SyncHandle {
    pub async fn stop(&self) {
        self.cancel.store(true, Ordering::Release);
        self.running.store(false, Ordering::Release);
        tracing::info!("sync engine stopped");
    }

    pub async fn sync_now(&self) -> SyncResult<UploadSummary> {
        let mock = MockRemoteApi::new();
        SyncEngine::sync_cycle(
            &self.db, &mock, &self.config, self.strategy,
            &self.progress, &self.auth, &self.encryption, &self.last_result,
        ).await
    }

    pub async fn get_status(&self) -> SyncResult<SyncStatus> {
        let pending = queue::QueueManager::count_pending(&self.db).await?;
        let failed = queue::QueueManager::count_failed_permanent(&self.db).await?;
        let completed = queue::QueueManager::count_by_status(&self.db, "completed").await?;
        let conflict = queue::QueueManager::count_by_status(&self.db, "conflict").await?;
        let (v, at) = queue::QueueManager::get_sync_state(&self.db, &self.config.cafe_id).await?;
        let auth = self.auth.read().await;
        Ok(SyncStatus {
            pending_count: pending,
            failed_count: failed,
            completed_count: completed,
            conflict_count: conflict,
            last_sync_version: v,
            last_sync_at: at,
            online: self.online.load(Ordering::Acquire),
            is_syncing: false,
            last_error: None,
            authenticated: auth.is_authenticated(),
            branch_id: self.config.branch_id.clone(),
            encryption_enabled: self.config.encryption_enabled,
        })
    }

    pub async fn generate_report(&self) -> SyncResult<SyncReport> {
        build_sync_report_impl(
            &self.db, &self.config, &self.progress,
            &self.auth, &self.online, &self.last_result,
        ).await
    }

    pub fn is_authenticated(&self) -> bool {
        tokio::task::block_in_place(|| {
            tokio::runtime::Handle::current().block_on(async {
                self.auth.read().await.is_authenticated()
            })
        })
    }

    pub fn set_authenticated(&self, val: bool) {
        tokio::task::block_in_place(|| {
            tokio::runtime::Handle::current().block_on(async {
                let mut auth = self.auth.write().await;
                if val {
                    let token = SyncAuth::generate_mock_token("default");
                    auth.set_token(token, u64::MAX);
                } else {
                    auth.clear();
                }
            })
        });
    }

    pub fn is_online(&self) -> bool {
        self.online.load(Ordering::Acquire)
    }

    pub fn set_online(&self, online: bool) {
        self.online.store(online, Ordering::Release);
    }

    pub fn progress_snapshot(&self) -> SyncProgress {
        tokio::task::block_in_place(|| {
            tokio::runtime::Handle::current().block_on(self.progress.snapshot())
        })
    }
}

async fn build_sync_report(
    db: &Database,
    config: &types::SyncConfig,
    progress: &Arc<ProgressTracker>,
    upload: &UploadSummary,
    elapsed: f64,
    success: bool,
    error: Option<String>,
) -> SyncReport {
    let pending = queue::QueueManager::count_pending(db).await.unwrap_or(0);
    let failed = queue::QueueManager::count_failed_permanent(db).await.unwrap_or(0);
    let completed = queue::QueueManager::count_by_status(db, "completed").await.unwrap_or(0);
    let conflict = queue::QueueManager::count_by_status(db, "conflict").await.unwrap_or(0);
    let total = queue::QueueManager::count_total(db).await.unwrap_or(0);
    let (v, at) = queue::QueueManager::get_sync_state(db, &config.cafe_id).await.unwrap_or((0, None));
    let snap = progress.snapshot().await;

    SyncReport {
        timestamp: chrono::Utc::now().to_rfc3339(),
        cafe_id: config.cafe_id.clone(),
        branch_id: config.branch_id.clone(),
        authenticated: true,
        online: true,
        encryption_enabled: config.encryption_enabled,
        queue_stats: QueueStats {
            total,
            pending,
            syncing: 0,
            completed,
            failed,
            conflict,
            total_retries: 0,
        },
        last_sync: LastSyncInfo {
            version: v,
            at,
            duration_seconds: elapsed,
            items_synced: upload.completed,
            success,
            error,
        },
        progress: snap,
        entity_counts: vec![],
        recent_errors: vec![],
        config: SyncConfigSummary {
            auto_sync: config.auto_sync,
            sync_interval_ms: config.sync_interval_ms,
            batch_size: config.batch_size,
            max_retries: config.max_retries,
            encryption_enabled: config.encryption_enabled,
            cloud_url: config.cloud_url.clone(),
        },
    }
}

async fn build_sync_report_impl(
    db: &Database,
    config: &types::SyncConfig,
    progress: &Arc<ProgressTracker>,
    auth: &Arc<tokio::sync::RwLock<SyncAuth>>,
    online: &Arc<AtomicBool>,
    last_result: &Arc<tokio::sync::RwLock<Option<SyncReport>>>,
) -> SyncResult<SyncReport> {
    let pending = queue::QueueManager::count_pending(db).await?;
    let failed = queue::QueueManager::count_failed_permanent(db).await?;
    let completed = queue::QueueManager::count_by_status(db, "completed").await?;
    let conflict = queue::QueueManager::count_by_status(db, "conflict").await?;
    let total = queue::QueueManager::count_total(db).await?;
    let (v, at) = queue::QueueManager::get_sync_state(db, &config.cafe_id).await?;
    let snap = progress.snapshot().await;
    let a = auth.read().await;

    let recent_errors = get_recent_sync_errors(db).await;

    Ok(SyncReport {
        timestamp: chrono::Utc::now().to_rfc3339(),
        cafe_id: config.cafe_id.clone(),
        branch_id: config.branch_id.clone(),
        authenticated: a.is_authenticated(),
        online: online.load(Ordering::Acquire),
        encryption_enabled: config.encryption_enabled,
        queue_stats: QueueStats {
            total,
            pending,
            syncing: 0,
            completed,
            failed,
            conflict,
            total_retries: queue::QueueManager::total_retries(db).await.unwrap_or(0),
        },
        last_sync: LastSyncInfo {
            version: v,
            at,
            duration_seconds: snap.elapsed_seconds,
            items_synced: snap.items_succeeded,
            success: !matches!(snap.phase.as_str(), "failed"),
            error: last_result.read().await.as_ref().and_then(|r| {
                if !r.last_sync.success { r.last_sync.error.clone() } else { None }
            }),
        },
        progress: snap,
        entity_counts: vec![],
        recent_errors,
        config: SyncConfigSummary {
            auto_sync: config.auto_sync,
            sync_interval_ms: config.sync_interval_ms,
            batch_size: config.batch_size,
            max_retries: config.max_retries,
            encryption_enabled: config.encryption_enabled,
            cloud_url: config.cloud_url.clone(),
        },
    })
}

async fn get_recent_sync_errors(db: &Database) -> Vec<SyncErrorEntry> {
    sqlx::query_as::<_, (String, String, Option<String>, i32, String)>(
        "SELECT entity_type, entity_id, COALESCE(last_error, 'unknown'), retry_count, created_at FROM sync_queue WHERE status = 'failed' AND last_error IS NOT NULL ORDER BY created_at DESC LIMIT 20",
    )
    .fetch_all(&db.pool)
    .await
    .unwrap_or_default()
    .into_iter()
    .map(|(entity_type, entity_id, error, retry_count, created_at)| SyncErrorEntry {
        entity_type,
        entity_id,
        error: error.unwrap_or_default(),
        retry_count,
        created_at,
    })
    .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    async fn test_db() -> Database {
        let dir = std::env::temp_dir().join(format!("sonic_sync_test_{}", Uuid::new_v4()));
        std::fs::create_dir_all(&dir).ok();
        let db = Database::connect(&dir).await.unwrap();
        db.run_migrations().await.unwrap();
        sqlx::query("INSERT OR IGNORE INTO cafes (id, name) VALUES ('cafe-test', 'Test Cafe'), ('cafe-1', 'Test Cafe 1')")
            .execute(&db.pool)
            .await
            .unwrap();
        db
    }

    #[tokio::test]
    async fn test_sync_engine_start_stop() {
        let db = test_db().await;
        let mock = Arc::new(MockRemoteApi::new());
        let config = types::SyncConfig {
            cafe_id: "cafe-test".to_string(),
            auto_sync: false,
            ..Default::default()
        };
        let engine = SyncEngine::new(db, mock, config);
        let handle = engine.start().await.unwrap();
        assert!(!handle.cancel.load(Ordering::Acquire));
        handle.stop().await;
        assert!(handle.cancel.load(Ordering::Acquire));
    }

    #[tokio::test]
    async fn test_sync_report() {
        let db = test_db().await;
        let mock = Arc::new(MockRemoteApi::new());
        let config = types::SyncConfig {
            cafe_id: "cafe-test".to_string(),
            auto_sync: false,
            ..Default::default()
        };
        let engine = SyncEngine::new(db, mock, config);
        let report = engine.generate_report().await.unwrap();
        assert_eq!(report.cafe_id, "cafe-test");
        assert_eq!(report.queue_stats.total, 0);
    }

    #[tokio::test]
    async fn test_branch_isolation_in_config() {
        let db = test_db().await;
        let mock = Arc::new(MockRemoteApi::new());
        let config = types::SyncConfig {
            cafe_id: "cafe-test".to_string(),
            branch_id: Some("branch-alpha".to_string()),
            auto_sync: false,
            ..Default::default()
        };
        let engine = SyncEngine::new(db, mock, config);
        let status = engine.get_status().await.unwrap();
        assert_eq!(status.branch_id, Some("branch-alpha".to_string()));
    }

    #[tokio::test]
    async fn test_engine_status() {
        let db = test_db().await;
        let mock = Arc::new(MockRemoteApi::new());
        let config = types::SyncConfig {
            cafe_id: "cafe-test".to_string(),
            auto_sync: false,
            ..Default::default()
        };
        let engine = SyncEngine::new(db, mock, config);
        let status = engine.get_status().await.unwrap();
        assert_eq!(status.pending_count, 0);
        assert_eq!(status.failed_count, 0);
    }

    #[tokio::test]
    async fn test_crash_recovery_on_start() {
        let db = test_db().await;
        let mock = Arc::new(MockRemoteApi::new());
        let config = types::SyncConfig {
            cafe_id: "cafe-test".to_string(),
            auto_sync: false,
            ..Default::default()
        };

        queue::QueueManager::enqueue(&db, "product", "p-stuck", "CREATE", r#"{}"#, 1)
            .await.unwrap();
        sqlx::query("UPDATE sync_queue SET status = 'syncing'")
            .execute(&db.pool).await.unwrap();

        let engine = SyncEngine::new(db.clone(), mock.clone(), config);
        let handle = engine.start().await.unwrap();
        tokio::time::sleep(Duration::from_millis(100)).await;

        let pending = queue::QueueManager::count_pending(&db).await.unwrap();
        assert_eq!(pending, 1, "stuck item should be recovered to pending");
        handle.stop().await;
    }
}
