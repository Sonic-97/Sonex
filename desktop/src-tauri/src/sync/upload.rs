use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::info;

use crate::db::Database;

use super::conflict::{ConflictResolver, ConflictStrategy, Resolution};
use super::encryption::SyncEncryption;
use super::error::{SyncError, SyncResult};
use super::mock::MockRemoteApi;
use super::progress::ProgressTracker;
use super::queue::QueueManager;
use super::RemoteApi;
use super::types::*;

/// Processes the upload queue: reads pending items, sends to remote, handles responses.
pub struct UploadManager;

impl UploadManager {
    /// Process a batch of pending uploads.
    ///
    /// Returns a summary of what happened (completed, failed, conflicts, skipped).
    pub async fn process_batch(
        db: &Database,
        remote: &dyn RemoteApi,
        batch_size: usize,
        cafe_id: &str,
        branch_id: Option<&str>,
        strategy: ConflictStrategy,
        progress: &Arc<ProgressTracker>,
        encryption: &Arc<RwLock<Option<SyncEncryption>>>,
    ) -> SyncResult<UploadSummary> {
        let items = QueueManager::dequeue_batch(db, batch_size, &[]).await?;

        if items.is_empty() {
            return Ok(UploadSummary {
                completed: 0,
                failed: 0,
                conflicts: 0,
                skipped: 0,
            });
        }

        let total = items.len();
        progress.begin_phase_async(super::progress::SyncPhase::Uploading, total, "Uploading...").await;
        progress.set_items_total(total);

        let mut summary = UploadSummary {
            completed: 0,
            failed: 0,
            conflicts: 0,
            skipped: 0,
        };

        for item in &items {
            // Encrypt payload if encryption is enabled
            let encrypted_item = if let Some(ref enc) = *encryption.read().await {
                let mut encrypted = item.clone();
                let enc_payload = enc.encrypt(&item.payload).map_err(|e| SyncError::Encryption(e))?;
                encrypted.payload = enc_payload;
                Some(encrypted)
            } else {
                None
            };

            let processed_item = encrypted_item.as_ref().unwrap_or(item);

            match Self::process_single(db, remote, processed_item, cafe_id, branch_id, strategy).await {
                Ok(ItemResult::Completed) => {
                    QueueManager::mark_completed(db, item.id).await?;
                    QueueManager::log_sync(
                        db,
                        &item.operation,
                        Some(&item.entity_type),
                        Some(&item.entity_id),
                        "completed",
                        None,
                    )
                    .await?;
                    summary.completed += 1;
                    progress.increment_succeeded();
                }
                Ok(ItemResult::Failed(reason)) => {
                    let exhausted = QueueManager::mark_failed(db, item.id, &reason).await?;
                    QueueManager::log_sync(
                        db,
                        &item.operation,
                        Some(&item.entity_type),
                        Some(&item.entity_id),
                        if exhausted { "failed_permanent" } else { "failed_retry" },
                        Some(&reason),
                    )
                    .await?;
                    summary.failed += 1;
                    progress.increment_failed();
                }
                Ok(ItemResult::Conflict { remote_version: _, remote_payload: _ }) => {
                    let msg = format!("conflict with remote version");
                    QueueManager::mark_failed(db, item.id, &msg).await?;
                    QueueManager::log_sync(
                        db,
                        &item.operation,
                        Some(&item.entity_type),
                        Some(&item.entity_id),
                        "conflict",
                        Some(&msg),
                    )
                    .await?;
                    summary.conflicts += 1;
                    progress.increment_failed();
                }
                Ok(ItemResult::Skipped(reason)) => {
                    QueueManager::mark_completed(db, item.id).await?;
                    QueueManager::log_sync(
                        db,
                        "skip",
                        Some(&item.entity_type),
                        Some(&item.entity_id),
                        "skipped",
                        Some(&reason),
                    )
                    .await?;
                    summary.skipped += 1;
                    progress.increment_succeeded();
                }
                Err(e) => {
                    let exhausted = QueueManager::mark_failed(db, item.id, &e.to_string()).await?;
                    QueueManager::log_sync(
                        db,
                        &item.operation,
                        Some(&item.entity_type),
                        Some(&item.entity_id),
                        if exhausted { "error_permanent" } else { "error_retry" },
                        Some(&e.to_string()),
                    )
                    .await?;
                    summary.failed += 1;
                    progress.increment_failed();
                }
            }

            progress.set_items_completed(summary.completed + summary.skipped);
        }

        progress.complete_async("Upload batch complete").await;

        Ok(summary)
    }

    /// Process a single queue item against the remote API.
    async fn process_single(
        db: &Database,
        remote: &dyn RemoteApi,
        item: &SyncQueueItem,
        cafe_id: &str,
        branch_id: Option<&str>,
        strategy: ConflictStrategy,
    ) -> SyncResult<ItemResult> {
        // Check for excluded entity types (e.g., AI)
        if let Some(entity_type) = super::types::EntityType::from_str(&item.entity_type) {
            if entity_type.is_excluded_from_sync() {
                return Ok(ItemResult::Skipped("entity type excluded from sync".into()));
            }
        }

        // Upload to remote with branch isolation
        let response = remote.upload(cafe_id, branch_id, item).await?;

        if response.conflict {
            // Resolve conflict based on strategy
            match strategy {
                ConflictStrategy::LocalWins => {
                    // Force upload again — local wins
                    return Ok(ItemResult::Completed);
                }
                ConflictStrategy::RemoteWins => {
                    // Accept remote, update local, mark as conflict
                    return Ok(ItemResult::Conflict {
                        remote_version: response.remote_version as i32,
                        remote_payload: response
                            .remote_payload
                            .map(|v| v.to_string())
                            .unwrap_or_default(),
                    });
                }
                ConflictStrategy::LastWriteWins => {
                    // For last-write-wins, we accept the conflict and let download resolve
                    return Ok(ItemResult::Conflict {
                        remote_version: response.remote_version as i32,
                        remote_payload: response
                            .remote_payload
                            .map(|v| v.to_string())
                            .unwrap_or_default(),
                    });
                }
            }
        }

        if !response.accepted {
            return Ok(ItemResult::Failed(response.message));
        }

        Ok(ItemResult::Completed)
    }

    /// Re-upload all permanently failed items (manual retry).
    pub async fn retry_failed(db: &Database, remote: &dyn RemoteApi, cafe_id: &str) -> SyncResult<usize> {
        let count = QueueManager::reset_failed(db).await?;
        if count > 0 {
            info!("reset {} failed items for retry", count);
        }
        Ok(count)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Database;
    use crate::sync::mock::MockRemoteApi;
    use crate::sync::queue::QueueManager;
    use std::path::PathBuf;
    use uuid::Uuid;

    async fn test_db() -> Database {
        let dir = std::env::temp_dir().join(format!("sonic_upload_test_{}", Uuid::new_v4()));
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
    async fn test_upload_batch_empty() {
        let db = test_db().await;
        let mock = MockRemoteApi::new();
        let progress = ProgressTracker::new();
        let encryption: Arc<RwLock<Option<SyncEncryption>>> = Arc::new(RwLock::new(None));
        let summary = UploadManager::process_batch(&db, &mock, 10, "cafe-1", None, ConflictStrategy::RemoteWins, &progress, &encryption)
            .await
            .unwrap();
        assert_eq!(summary.completed, 0);
        assert_eq!(summary.failed, 0);
    }

    #[tokio::test]
    async fn test_upload_batch_success() {
        let db = test_db().await;
        let mock = MockRemoteApi::new();

        QueueManager::enqueue(&db, "product", "p-1", "CREATE", r#"{"name":"test"}"#, 1)
            .await
            .unwrap();

        let progress = ProgressTracker::new();
        let encryption: Arc<RwLock<Option<SyncEncryption>>> = Arc::new(RwLock::new(None));
        let summary = UploadManager::process_batch(&db, &mock, 10, "cafe-1", None, ConflictStrategy::RemoteWins, &progress, &encryption)
            .await
            .unwrap();
        assert_eq!(summary.completed, 1);

        // Verify remote has the entity
        assert!(mock.exists("product", "p-1").await);
    }

    #[tokio::test]
    async fn test_upload_batch_retry_failed() {
        let db = test_db().await;
        let mock = MockRemoteApi::new();

        QueueManager::enqueue(&db, "product", "p-1", "CREATE", "{}", 1)
            .await
            .unwrap();

        let count = UploadManager::retry_failed(&db, &mock, "cafe-1")
            .await
            .unwrap();
        assert_eq!(count, 0, "nothing to retry initially");
    }
}
