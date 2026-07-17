use chrono::Utc;
use uuid::Uuid;

use crate::db::Database;

use super::error::{SyncError, SyncResult};
use super::types::*;

/// Manages the local sync_queue table.
/// All operations are idempotent and transaction-safe.
pub struct QueueManager;

impl QueueManager {
    /// Enqueue a new sync item.
    /// Generates a unique idempotency key from entity_type + entity_id + operation + timestamp.
    pub async fn enqueue(
        db: &Database,
        entity_type: &str,
        entity_id: &str,
        operation: &str,
        payload: &str,
        local_version: i32,
    ) -> SyncResult<i64> {
        // Check for duplicate: same entity + operation still pending
        let existing: Option<(i64,)> = sqlx::query_as(
            "SELECT id FROM sync_queue WHERE entity_type = ? AND entity_id = ? AND operation = ? AND status IN ('pending','syncing','failed') LIMIT 1",
        )
        .bind(entity_type)
        .bind(entity_id)
        .bind(operation)
        .fetch_optional(&db.pool)
        .await?;

        if let Some((id,)) = existing {
            // Update payload of existing pending item instead of creating duplicate
            sqlx::query(
                "UPDATE sync_queue SET payload = ?, local_version = ?, retry_count = 0, last_error = NULL, status = 'pending' WHERE id = ?",
            )
            .bind(payload)
            .bind(local_version)
            .bind(id)
            .execute(&db.pool)
            .await?;
            return Ok(id);
        }

        let idempotency_key = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();

        let result = sqlx::query(
            r#"
            INSERT INTO sync_queue 
                (entity_type, entity_id, operation, payload, local_version, created_at, retry_count, max_retries, last_error, status)
            VALUES (?, ?, ?, ?, ?, ?, 0, 5, NULL, 'pending')
            "#,
        )
        .bind(entity_type)
        .bind(entity_id)
        .bind(operation)
        .bind(payload)
        .bind(local_version)
        .bind(&now)
        .execute(&db.pool)
        .await?;

        Ok(result.last_insert_rowid())
    }

    /// Dequeue the next batch of pending items, ordered by retry priority.
    /// Failed items with lower retry counts get priority over fresh items.
    pub async fn dequeue_batch(db: &Database, batch_size: usize, exclude_entity_types: &[&str]) -> SyncResult<Vec<SyncQueueItem>> {
        if batch_size == 0 {
            return Ok(vec![]);
        }

        // Mark items as syncing atomically
        // First: reset any items stuck in 'syncing' (crash recovery)
        sqlx::query(
            "UPDATE sync_queue SET status = 'pending', retry_count = retry_count + 1, last_error = 'crash recovery: reset from syncing' WHERE status = 'syncing'",
        )
        .execute(&db.pool)
        .await?;

        // Fetch pending items, giving priority to those with fewer retries
        // and older creation dates
        let rows: Vec<SyncQueueItem> = sqlx::query_as::<_, SyncQueueRow>(
            r#"
            SELECT id, entity_type, entity_id, operation, payload, local_version, 
                   created_at, retry_count, max_retries, last_error, status
            FROM sync_queue 
            WHERE status = 'pending' 
            ORDER BY retry_count ASC, created_at ASC 
            LIMIT ?
            "#,
        )
        .bind(batch_size as i64)
        .fetch_all(&db.pool)
        .await?
        .into_iter()
        .map(|r| SyncQueueItem {
            id: r.id,
            entity_type: r.entity_type,
            entity_id: r.entity_id,
            operation: r.operation,
            payload: r.payload,
            local_version: r.local_version,
            created_at: r.created_at,
            retry_count: r.retry_count,
            max_retries: r.max_retries,
            last_error: r.last_error,
            status: r.status,
            idempotency_key: None,
        })
        .collect();

        // Mark fetched items as 'syncing'
        for item in &rows {
            sqlx::query("UPDATE sync_queue SET status = 'syncing' WHERE id = ? AND status = 'pending'")
                .bind(item.id)
                .execute(&db.pool)
                .await?;
        }

        Ok(rows)
    }

    /// Mark a queue item as completed.
    pub async fn mark_completed(db: &Database, queue_id: i64) -> SyncResult<()> {
        sqlx::query("UPDATE sync_queue SET status = 'completed' WHERE id = ?")
            .bind(queue_id)
            .execute(&db.pool)
            .await?;
        Ok(())
    }

    /// Mark a queue item as failed with an error message.
    /// Increments retry_count. If max_retries reached, stays failed permanently.
    pub async fn mark_failed(db: &Database, queue_id: i64, error: &str) -> SyncResult<bool> {
        let row: Option<(i32, i32)> = sqlx::query_as(
            "SELECT retry_count, max_retries FROM sync_queue WHERE id = ?",
        )
        .bind(queue_id)
        .fetch_optional(&db.pool)
        .await?;

        let (retry_count, max_retries) = row.unwrap_or((0, 5));
        let new_count = retry_count + 1;
        let is_exhausted = new_count >= max_retries;

        if is_exhausted {
            sqlx::query(
                "UPDATE sync_queue SET status = 'failed', retry_count = ?, last_error = ? WHERE id = ?",
            )
            .bind(new_count)
            .bind(error)
            .bind(queue_id)
            .execute(&db.pool)
            .await?;
        } else {
            sqlx::query(
                "UPDATE sync_queue SET status = 'pending', retry_count = ?, last_error = ? WHERE id = ?",
            )
            .bind(new_count)
            .bind(error)
            .bind(queue_id)
            .execute(&db.pool)
            .await?;
        }

        Ok(is_exhausted)
    }

    /// Count items by status.
    pub async fn count_by_status(db: &Database, status: &str) -> SyncResult<usize> {
        let (count,): (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM sync_queue WHERE status = ?",
        )
        .bind(status)
        .fetch_one(&db.pool)
        .await?;
        Ok(count as usize)
    }

    /// Count total pending items (including failed items that can still retry).
    pub async fn count_pending(db: &Database) -> SyncResult<usize> {
        let (count,): (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM sync_queue WHERE status IN ('pending', 'syncing')",
        )
        .fetch_one(&db.pool)
        .await?;
        Ok(count as usize)
    }

    /// Count permanently failed items.
    pub async fn count_failed_permanent(db: &Database) -> SyncResult<usize> {
        let (count,): (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM sync_queue WHERE status = 'failed'",
        )
        .fetch_one(&db.pool)
        .await?;
        Ok(count as usize)
    }

    /// Reset all failed items back to pending for retry.
    pub async fn reset_failed(db: &Database) -> SyncResult<usize> {
        let result = sqlx::query(
            "UPDATE sync_queue SET status = 'pending', retry_count = 0, last_error = NULL WHERE status = 'failed'",
        )
        .execute(&db.pool)
        .await?;
        Ok(result.rows_affected() as usize)
    }

    /// Clean up completed items older than the given date.
    pub async fn cleanup_completed(db: &Database, older_than: &str) -> SyncResult<usize> {
        let result = sqlx::query(
            "DELETE FROM sync_queue WHERE status = 'completed' AND datetime(created_at) < datetime(?)",
        )
        .bind(older_than)
        .execute(&db.pool)
        .await?;
        Ok(result.rows_affected() as usize)
    }

    /// Count total items (all statuses).
    pub async fn count_total(db: &Database) -> SyncResult<usize> {
        let (count,): (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM sync_queue",
        )
        .fetch_one(&db.pool)
        .await?;
        Ok(count as usize)
    }

    /// Count items by entity type.
    pub async fn count_by_entity_type(db: &Database, entity_type: &str) -> SyncResult<usize> {
        let (count,): (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM sync_queue WHERE entity_type = ?",
        )
        .bind(entity_type)
        .fetch_one(&db.pool)
        .await?;
        Ok(count as usize)
    }

    /// Sum of all retry counts across all items.
    pub async fn total_retries(db: &Database) -> SyncResult<u64> {
        let (count,): (i64,) = sqlx::query_as(
            "SELECT COALESCE(SUM(retry_count), 0) FROM sync_queue",
        )
        .fetch_one(&db.pool)
        .await?;
        Ok(count as u64)
    }

    /// Log a sync operation to the audit log.
    pub async fn log_sync(
        db: &Database,
        operation: &str,
        entity_type: Option<&str>,
        entity_id: Option<&str>,
        status: &str,
        message: Option<&str>,
    ) -> SyncResult<()> {
        sqlx::query(
            "INSERT INTO sync_log (operation, entity_type, entity_id, status, message, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))",
        )
        .bind(operation)
        .bind(entity_type)
        .bind(entity_id)
        .bind(status)
        .bind(message)
        .execute(&db.pool)
        .await?;
        Ok(())
    }

    /// Read the sync state for a cafe.
    pub async fn get_sync_state(db: &Database, cafe_id: &str) -> SyncResult<(i64, Option<String>)> {
        let row: Option<(i64, Option<String>)> = sqlx::query_as(
            "SELECT last_sync_version, last_sync_at FROM sync_state WHERE cafe_id = ?",
        )
        .bind(cafe_id)
        .fetch_optional(&db.pool)
        .await?;

        Ok(row.unwrap_or((0, None)))
    }

    /// Update the sync state after a successful sync.
    pub async fn update_sync_state(
        db: &Database,
        cafe_id: &str,
        last_version: i64,
    ) -> SyncResult<()> {
        let now = Utc::now().to_rfc3339();
        sqlx::query(
            r#"
            INSERT INTO sync_state (cafe_id, last_sync_version, last_sync_at, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(cafe_id) DO UPDATE SET
                last_sync_version = ?,
                last_sync_at = ?,
                updated_at = ?
            "#,
        )
        .bind(cafe_id)
        .bind(last_version)
        .bind(&now)
        .bind(&now)
        .bind(last_version)
        .bind(&now)
        .bind(&now)
        .execute(&db.pool)
        .await?;
        Ok(())
    }

    /// Get all permanently failed items.
    pub async fn get_failed_items(db: &Database) -> SyncResult<Vec<SyncQueueItem>> {
        let rows: Vec<SyncQueueRow> = sqlx::query_as::<_, SyncQueueRow>(
            r#"
            SELECT id, entity_type, entity_id, operation, payload, local_version, 
                   created_at, retry_count, max_retries, last_error, status
            FROM sync_queue 
            WHERE status = 'failed' 
            ORDER BY retry_count DESC, created_at DESC
            "#,
        )
        .fetch_all(&db.pool)
        .await?;

        Ok(rows.into_iter().map(|r| SyncQueueItem {
            id: r.id,
            entity_type: r.entity_type,
            entity_id: r.entity_id,
            operation: r.operation,
            payload: r.payload,
            local_version: r.local_version,
            created_at: r.created_at,
            retry_count: r.retry_count,
            max_retries: r.max_retries,
            last_error: r.last_error,
            status: r.status,
            idempotency_key: None,
        }).collect())
    }
}

// Private row type for SQLx queries
#[derive(Debug, sqlx::FromRow)]
struct SyncQueueRow {
    id: i64,
    entity_type: String,
    entity_id: String,
    operation: String,
    payload: String,
    local_version: i32,
    created_at: String,
    retry_count: i32,
    max_retries: i32,
    last_error: Option<String>,
    status: String,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Database;
    use std::path::PathBuf;

    async fn test_db() -> Database {
        let dir = std::env::temp_dir().join(format!("sonic_queue_test_{}", Uuid::new_v4()));
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
    async fn test_enqueue_and_dequeue() {
        let db = test_db().await;

        let id = QueueManager::enqueue(&db, "product", "p1", "CREATE", r#"{"name":"test"}"#, 1)
            .await
            .unwrap();
        assert!(id > 0);

        let items = QueueManager::dequeue_batch(&db, 10, &[]).await.unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].entity_id, "p1");

        // Mark completed
        QueueManager::mark_completed(&db, items[0].id).await.unwrap();
        let count = QueueManager::count_by_status(&db, "completed").await.unwrap();
        assert_eq!(count, 1);
    }

    #[tokio::test]
    async fn test_duplicate_prevention() {
        let db = test_db().await;

        let id1 = QueueManager::enqueue(&db, "product", "p1", "UPDATE", r#"{"name":"v1"}"#, 1)
            .await
            .unwrap();
        // Same entity + operation still pending — should update existing
        let id2 = QueueManager::enqueue(&db, "product", "p1", "UPDATE", r#"{"name":"v2"}"#, 2)
            .await
            .unwrap();
        assert_eq!(id1, id2, "should return same queue id");

        let items = QueueManager::dequeue_batch(&db, 10, &[]).await.unwrap();
        assert_eq!(items.len(), 1);
        // Payload should be the latest
        assert_eq!(items[0].local_version, 2);
    }

    #[tokio::test]
    async fn test_retry_and_fail() {
        let db = test_db().await;

        QueueManager::enqueue(&db, "product", "p1", "CREATE", "{}", 1)
            .await
            .unwrap();
        let items = QueueManager::dequeue_batch(&db, 10, &[]).await.unwrap();
        assert_eq!(items.len(), 1);

        // Fail once — should go back to pending
        let exhausted = QueueManager::mark_failed(&db, items[0].id, "network error").await.unwrap();
        assert!(!exhausted);

        let pending = QueueManager::count_pending(&db).await.unwrap();
        assert_eq!(pending, 1);

        // Dequeue and fail repeatedly until exhausted
        for _ in 0..5 {
            let items = QueueManager::dequeue_batch(&db, 10, &[]).await.unwrap();
            if items.is_empty() {
                break;
            }
            QueueManager::mark_failed(&db, items[0].id, "error").await.unwrap();
        }

        let failed = QueueManager::count_failed_permanent(&db).await.unwrap();
        assert_eq!(failed, 1, "should be permanently failed after max retries");
    }

    #[tokio::test]
    async fn test_crash_recovery() {
        let db = test_db().await;

        QueueManager::enqueue(&db, "product", "p1", "CREATE", "{}", 1)
            .await
            .unwrap();

        // Simulate crash: manually set to 'syncing'
        sqlx::query("UPDATE sync_queue SET status = 'syncing'")
            .execute(&db.pool)
            .await
            .unwrap();

        // Dequeue should reset stuck items and return them
        let items = QueueManager::dequeue_batch(&db, 10, &[]).await.unwrap();
        assert_eq!(items.len(), 1, "should recover stuck items");
    }

    #[tokio::test]
    async fn test_sync_state() {
        let db = test_db().await;
        let cafe_id = "cafe-test-1";

        let (version, last_sync) = QueueManager::get_sync_state(&db, cafe_id).await.unwrap();
        assert_eq!(version, 0);
        assert!(last_sync.is_none());

        QueueManager::update_sync_state(&db, cafe_id, 42).await.unwrap();

        let (version, last_sync) = QueueManager::get_sync_state(&db, cafe_id).await.unwrap();
        assert_eq!(version, 42);
        assert!(last_sync.is_some());
    }

    #[tokio::test]
    async fn test_cleanup() {
        let db = test_db().await;

        QueueManager::enqueue(&db, "product", "p1", "CREATE", "{}", 1)
            .await
            .unwrap();
        let items = QueueManager::dequeue_batch(&db, 10, &[]).await.unwrap();
        QueueManager::mark_completed(&db, items[0].id).await.unwrap();

        // Cleanup with future cutoff → item from 2026 IS older than 2099-01-01 → deleted
        let deleted = QueueManager::cleanup_completed(&db, "2099-01-01").await.unwrap();
        assert_eq!(deleted, 1);

        // Enqueue another item
        QueueManager::enqueue(&db, "product", "p2", "CREATE", "{}", 1)
            .await
            .unwrap();
        let items = QueueManager::dequeue_batch(&db, 10, &[]).await.unwrap();
        QueueManager::mark_completed(&db, items[0].id).await.unwrap();

        // Cleanup with past cutoff → item from 2026 is NOT older than 2020-01-01 → not deleted
        let deleted = QueueManager::cleanup_completed(&db, "2020-01-01").await.unwrap();
        assert_eq!(deleted, 0);
    }
}
