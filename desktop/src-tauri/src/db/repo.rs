use crate::db::Database;
use chrono::Utc;
use uuid::Uuid;

use super::error::{DbError, DbResult};

/// Generate a new UUID v4 string.
pub fn new_id() -> String {
    Uuid::new_v4().to_string()
}

/// Current timestamp as RFC 3339 string.
pub fn now() -> String {
    Utc::now().to_rfc3339()
}

/// Soft-delete an entity by setting `deleted_at`, incrementing `version`,
/// and checking the previous version for optimistic concurrency.
/// Returns `Err(OptimisticLock)` if the row was not found or version mismatch.
pub async fn repo_soft_delete(
    db: &Database,
    table: &str,
    name: &str,
    id: &str,
    cafe_id: &str,
    old_version: i32,
) -> DbResult<()> {
    let now_ts = now();
    let sql = format!(
        "UPDATE {} SET deleted_at = ?, version = version + 1 WHERE id = ? AND cafe_id = ? AND version = ? AND deleted_at IS NULL",
        table
    );
    let result = sqlx::query(&sql)
        .bind(&now_ts)
        .bind(id)
        .bind(cafe_id)
        .bind(old_version)
        .execute(&db.pool)
        .await?;
    if result.rows_affected() == 0 {
        return Err(DbError::OptimisticLock(name.into(), id.into()));
    }
    Ok(())
}

/// Optimistic-lock UPDATE. Expects SQL ending with
/// `WHERE id = ? AND cafe_id = ? AND version = ? AND deleted_at IS NULL`.
/// Binds id, cafe_id, old_version in that order as the last three params.
/// Returns `Err(OptimisticLock)` if no rows matched.
pub async fn optimistic_update(
    db: &Database,
    sql: &str,
    name: &str,
    id: &str,
    cafe_id: &str,
    old_version: i32,
) -> DbResult<()> {
    let result = sqlx::query(sql)
        .bind(id)
        .bind(cafe_id)
        .bind(old_version)
        .execute(&db.pool)
        .await?;
    if result.rows_affected() == 0 {
        return Err(DbError::OptimisticLock(name.into(), id.into()));
    }
    Ok(())
}
