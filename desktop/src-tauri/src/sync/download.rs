use serde_json::Value;
use tracing::info;

use crate::db::Database;

use super::conflict::{ConflictResolver, ConflictStrategy, Resolution};
use super::error::SyncResult;
use super::queue::QueueManager;
use super::RemoteApi;
use super::types::*;

/// Pulls changes from the remote server and applies them to the local database.
pub struct DownloadManager;

impl DownloadManager {
    /// Download changes from the remote server since the last sync version.
    ///
    /// Applies remote changes to local state using the given conflict resolution strategy.
    /// Returns a summary of what was applied.
    pub async fn pull_changes(
        db: &Database,
        remote: &dyn RemoteApi,
        cafe_id: &str,
        branch_id: Option<&str>,
        strategy: ConflictStrategy,
    ) -> SyncResult<DownloadSummary> {
        let (last_version, _) = QueueManager::get_sync_state(db, cafe_id).await?;

        let response = remote.download(cafe_id, branch_id, last_version).await?;

        if response.changes.is_empty() {
            return Ok(DownloadSummary {
                changes_applied: 0,
                conflicts: 0,
                new_version: response.last_version,
            });
        }

        let mut applied = 0usize;
        let mut conflicts = 0usize;

        for change in &response.changes {
            match Self::apply_change(db, change, cafe_id, strategy).await {
                Ok(true) => applied += 1,
                Ok(false) => conflicts += 1,
                Err(e) => {
                    QueueManager::log_sync(
                        db,
                        "download_apply",
                        Some(&change.entity_type),
                        Some(&change.entity_id),
                        "error",
                        Some(&e.to_string()),
                    )
                    .await?;
                }
            }
        }

        QueueManager::log_sync(
            db,
            "download",
            None,
            None,
            "completed",
            Some(&format!(
                "applied={} conflicts={} new_version={}",
                applied, conflicts, response.last_version
            )),
        )
        .await?;

        // Update sync state
        QueueManager::update_sync_state(db, cafe_id, response.last_version).await?;

        info!(
            "download complete: {} applied, {} conflicts, new version {}",
            applied, conflicts, response.last_version
        );

        Ok(DownloadSummary {
            changes_applied: applied,
            conflicts,
            new_version: response.last_version,
        })
    }

    /// Apply a single remote change to the local database.
    ///
    /// Returns `true` if the change was applied, `false` if conflicted/skipped.
    async fn apply_change(
        db: &Database,
        change: &RemoteChange,
        cafe_id: &str,
        strategy: ConflictStrategy,
    ) -> SyncResult<bool> {
        // Skip excluded entity types
        if let Some(entity_type) = super::types::EntityType::from_str(&change.entity_type) {
            if entity_type.is_excluded_from_sync() {
                return Ok(true); // silently skip
            }
        }

        match change.operation.as_str() {
            "CREATE" | "UPDATE" => {
                // Check if entity exists locally
                let local_version = Self::get_local_version(db, &change.entity_type, &change.entity_id, cafe_id).await?;
                let local_deleted = Self::is_local_deleted(db, &change.entity_type, &change.entity_id, cafe_id).await?;

                let resolution = ConflictResolver::should_apply_remote(
                    local_version.is_some(),
                    local_version,
                    change.remote_version,
                    local_deleted,
                    false,
                    strategy,
                );

                match resolution {
                    Resolution::AcceptRemote => {
                        Self::upsert_local(db, &change.entity_type, &change.entity_id, &change.payload, cafe_id, change.remote_version as i32)
                            .await?;
                        Ok(true)
                    }
                    Resolution::AcceptLocal => {
                        // Enqueue our local version as an upload
                        Ok(false)
                    }
                    Resolution::Manual => {
                        info!("manual resolution needed for {} {}", change.entity_type, change.entity_id);
                        Ok(false)
                    }
                }
            }
            "DELETE" => {
                // Only apply remote deletes if strategy allows
                let local_version = Self::get_local_version(db, &change.entity_type, &change.entity_id, cafe_id).await?;

                if let Some(lv) = local_version {
                    let resolution = ConflictResolver::should_apply_remote(
                        true,
                        Some(lv),
                        change.remote_version,
                        false,
                        true,
                        strategy,
                    );

                    match resolution {
                        Resolution::AcceptRemote => {
                            Self::soft_delete_local(db, &change.entity_type, &change.entity_id, cafe_id).await?;
                            Ok(true)
                        }
                        _ => Ok(false),
                    }
                } else {
                    // Entity doesn't exist locally — nothing to delete
                    Ok(true)
                }
            }
            _ => {
                tracing::warn!("unknown operation in remote change: {}", change.operation);
                Ok(false)
            }
        }
    }

    /// Get the current version of a local entity, if it exists.
    async fn get_local_version(
        db: &Database,
        entity_type: &str,
        entity_id: &str,
        _cafe_id: &str,
    ) -> SyncResult<Option<i32>> {
        let table = match entity_type {
            "product" => "products",
            "category" => "categories",
            "inventory_item" => "inventory_items",
            "recipe" => "recipes",
            "customer" => "customers",
            "staff" => "staff",
            "supplier" => "suppliers",
            "expense" => "expenses",
            "payment" => "payments",
            "branch" => "branches",
            "cafe" => "cafes",
            _ => return Ok(None),
        };

        let sql = format!(
            "SELECT version FROM {} WHERE id = ? AND deleted_at IS NULL",
            table
        );

        let row: Option<(i32,)> = sqlx::query_as(&sql)
            .bind(entity_id)
            .fetch_optional(&db.pool)
            .await?;

        Ok(row.map(|r| r.0))
    }

    /// Check if a local entity is soft-deleted.
    async fn is_local_deleted(
        db: &Database,
        entity_type: &str,
        entity_id: &str,
        _cafe_id: &str,
    ) -> SyncResult<bool> {
        let table = match entity_type {
            "product" => "products",
            "category" => "categories",
            "inventory_item" => "inventory_items",
            "recipe" => "recipes",
            "customer" => "customers",
            "staff" => "staff",
            "supplier" => "suppliers",
            "expense" => "expenses",
            "payment" => "payments",
            "branch" => "branches",
            "cafe" => "cafes",
            _ => return Ok(false),
        };

        let sql = format!(
            "SELECT deleted_at FROM {} WHERE id = ?",
            table
        );

        let row: Option<(Option<String>,)> = sqlx::query_as(&sql)
            .bind(entity_id)
            .fetch_optional(&db.pool)
            .await?;

        Ok(row.and_then(|r| r.0).is_some())
    }

    /// Insert or update a local entity from remote data.
    async fn upsert_local(
        db: &Database,
        entity_type: &str,
        entity_id: &str,
        payload: &Value,
        _cafe_id: &str,
        remote_version: i32,
    ) -> SyncResult<()> {
        let table = match entity_type {
            "product" => "products",
            "category" => "categories",
            "inventory_item" => "inventory_items",
            "recipe" => "recipes",
            "customer" => "customers",
            "staff" => "staff",
            "supplier" => "suppliers",
            "expense" => "expenses",
            "payment" => "payments",
            "branch" => "branches",
            "cafe" => "cafes",
            _ => {
                return Err(super::error::SyncError::UnsupportedEntity(
                    entity_type.to_string(),
                ))
            }
        };

        // Check if entity exists
        let exists_sql = format!("SELECT 1 FROM {} WHERE id = ?", table);
        let exists: Option<(i32,)> = sqlx::query_as(&exists_sql)
            .bind(entity_id)
            .fetch_optional(&db.pool)
            .await?;

        let now = chrono::Utc::now().to_rfc3339();

        if exists.is_some() {
            // Update — set version to remote version, clear deleted_at
            let update_sql = format!(
                "UPDATE {} SET version = ?, updated_at = ?, deleted_at = NULL WHERE id = ? AND version < ?",
                table
            );
            sqlx::query(&update_sql)
                .bind(remote_version)
                .bind(&now)
                .bind(entity_id)
                .bind(remote_version)
                .execute(&db.pool)
                .await?;
        } else {
            // Insert with remote data
            let insert_sql = format!(
                "INSERT OR IGNORE INTO {} (id, version, created_at, updated_at) VALUES (?, ?, ?, ?)",
                table
            );
            sqlx::query(&insert_sql)
                .bind(entity_id)
                .bind(remote_version)
                .bind(&now)
                .bind(&now)
                .execute(&db.pool)
                .await?;
        }

        Ok(())
    }

    /// Soft-delete a local entity.
    async fn soft_delete_local(
        db: &Database,
        entity_type: &str,
        entity_id: &str,
        _cafe_id: &str,
    ) -> SyncResult<()> {
        let table = match entity_type {
            "product" => "products",
            "category" => "categories",
            "inventory_item" => "inventory_items",
            "recipe" => "recipes",
            "customer" => "customers",
            "staff" => "staff",
            "supplier" => "suppliers",
            "expense" => "expenses",
            "payment" => "payments",
            "branch" => "branches",
            "cafe" => "cafes",
            _ => return Ok(()),
        };

        let now = chrono::Utc::now().to_rfc3339();
        let sql = format!(
            "UPDATE {} SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL",
            table
        );
        sqlx::query(&sql)
            .bind(&now)
            .bind(&now)
            .bind(entity_id)
            .execute(&db.pool)
            .await?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Database;
    use crate::sync::mock::MockRemoteApi;
    use crate::sync::queue::QueueManager;
    use uuid::Uuid;

    async fn test_db() -> Database {
        let dir = std::env::temp_dir().join(format!("sonic_download_test_{}", Uuid::new_v4()));
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
    async fn test_download_empty() {
        let db = test_db().await;
        let mock = MockRemoteApi::new();

        let summary = DownloadManager::pull_changes(&db, &mock, "cafe-1", None, ConflictStrategy::RemoteWins)
            .await
            .unwrap();
        assert_eq!(summary.changes_applied, 0);
    }

    #[tokio::test]
    async fn test_download_with_remote_changes() {
        let db = test_db().await;
        let mock = MockRemoteApi::new();

        // Seed some remote data
        mock.seed("product", "p-1", serde_json::json!({"name":"remote"}), false).await;
        mock.seed("product", "p-2", serde_json::json!({"name":"remote2"}), false).await;

        let summary = DownloadManager::pull_changes(&db, &mock, "cafe-1", None, ConflictStrategy::RemoteWins)
            .await
            .unwrap();
        assert_eq!(summary.changes_applied, 2);
        assert!(summary.new_version > 0);
    }

    #[tokio::test]
    async fn test_download_incremental() {
        let db = test_db().await;
        let mock = MockRemoteApi::new();

        mock.seed("product", "p-1", serde_json::json!({"name":"v1"}), false).await;
        let summary1 = DownloadManager::pull_changes(&db, &mock, "cafe-1", None, ConflictStrategy::RemoteWins)
            .await
            .unwrap();
        assert_eq!(summary1.changes_applied, 1);

        // Add another entity
        mock.seed("product", "p-2", serde_json::json!({"name":"v2"}), false).await;
        let summary2 = DownloadManager::pull_changes(&db, &mock, "cafe-1", None, ConflictStrategy::RemoteWins)
            .await
            .unwrap();
        assert_eq!(summary2.changes_applied, 1, "should only get new changes");
        assert!(summary2.new_version > summary1.new_version);
    }

    #[tokio::test]
    async fn test_sync_state_updated_after_download() {
        let db = test_db().await;
        let mock = MockRemoteApi::new();

        mock.seed("product", "p-1", serde_json::json!({"name":"test"}), false).await;
        let summary = DownloadManager::pull_changes(&db, &mock, "cafe-1", None, ConflictStrategy::RemoteWins)
            .await
            .unwrap();

        let (version, _) = QueueManager::get_sync_state(&db, "cafe-1").await.unwrap();
        assert_eq!(version, summary.new_version);
    }
}
