use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use tracing::info;

use crate::db::error::{DbError, DbResult};
use crate::db::repo::{new_id, now, repo_soft_delete};
use crate::db::Database;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct Category {
    pub id: String,
    pub cafe_id: String,
    pub version: i32,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
    pub created_by: Option<String>,
    pub updated_by: Option<String>,
    pub name: String,
    pub description: Option<String>,
    pub emoji: Option<String>,
    pub color: Option<String>,
    pub sort_order: i32,
    pub parent_id: Option<String>,
    pub active: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewCategory {
    pub name: String,
    pub description: Option<String>,
    pub emoji: Option<String>,
    pub color: Option<String>,
    pub sort_order: Option<i32>,
    pub parent_id: Option<String>,
    pub active: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateCategory {
    pub id: String,
    pub cafe_id: String,
    pub version: i32,
    pub name: String,
    pub description: Option<String>,
    pub emoji: Option<String>,
    pub color: Option<String>,
    pub sort_order: i32,
    pub parent_id: Option<String>,
    pub active: i32,
    pub updated_by: Option<String>,
}

pub struct CategoryRepo;

impl CategoryRepo {
    const TABLE: &'static str = "categories";
    const FIELDS: &'static str = r#"
        id, cafe_id, version, created_at, updated_at, deleted_at,
        created_by, updated_by, name, description, emoji, color,
        sort_order, parent_id, active
    "#;

    pub async fn find_by_id(db: &Database, id: &str, cafe_id: &str) -> DbResult<Option<Category>> {
        let sql = format!(
            "SELECT {} FROM {} WHERE id = ? AND cafe_id = ? AND deleted_at IS NULL",
            Self::FIELDS, Self::TABLE
        );
        sqlx::query_as::<_, Category>(&sql)
            .bind(id)
            .bind(cafe_id)
            .fetch_optional(&db.pool)
            .await
            .map_err(DbError::from)
    }

    pub async fn find_all(db: &Database, cafe_id: &str) -> DbResult<Vec<Category>> {
        let sql = format!(
            "SELECT {} FROM {} WHERE cafe_id = ? AND deleted_at IS NULL ORDER BY sort_order ASC, name ASC",
            Self::FIELDS, Self::TABLE
        );
        sqlx::query_as::<_, Category>(&sql)
            .bind(cafe_id)
            .fetch_all(&db.pool)
            .await
            .map_err(DbError::from)
    }

    pub async fn find_all_including_deleted(db: &Database, cafe_id: &str) -> DbResult<Vec<Category>> {
        let sql = format!(
            "SELECT {} FROM {} WHERE cafe_id = ? ORDER BY sort_order ASC, name ASC",
            Self::FIELDS, Self::TABLE
        );
        sqlx::query_as::<_, Category>(&sql)
            .bind(cafe_id)
            .fetch_all(&db.pool)
            .await
            .map_err(DbError::from)
    }

    pub async fn find_active(db: &Database, cafe_id: &str) -> DbResult<Vec<Category>> {
        let sql = format!(
            "SELECT {} FROM {} WHERE cafe_id = ? AND active = 1 AND deleted_at IS NULL ORDER BY sort_order ASC, name ASC",
            Self::FIELDS, Self::TABLE
        );
        sqlx::query_as::<_, Category>(&sql)
            .bind(cafe_id)
            .fetch_all(&db.pool)
            .await
            .map_err(DbError::from)
    }

    pub async fn find_children(db: &Database, cafe_id: &str, parent_id: &str) -> DbResult<Vec<Category>> {
        let sql = format!(
            "SELECT {} FROM {} WHERE cafe_id = ? AND parent_id = ? AND deleted_at IS NULL ORDER BY sort_order ASC",
            Self::FIELDS, Self::TABLE
        );
        sqlx::query_as::<_, Category>(&sql)
            .bind(cafe_id)
            .bind(parent_id)
            .fetch_all(&db.pool)
            .await
            .map_err(DbError::from)
    }

    pub async fn find_root(db: &Database, cafe_id: &str) -> DbResult<Vec<Category>> {
        let sql = format!(
            "SELECT {} FROM {} WHERE cafe_id = ? AND parent_id IS NULL AND deleted_at IS NULL ORDER BY sort_order ASC",
            Self::FIELDS, Self::TABLE
        );
        sqlx::query_as::<_, Category>(&sql)
            .bind(cafe_id)
            .fetch_all(&db.pool)
            .await
            .map_err(DbError::from)
    }

    pub async fn insert(
        db: &Database,
        cafe_id: &str,
        created_by: Option<&str>,
        input: &NewCategory,
    ) -> DbResult<String> {
        let id = new_id();
        let now_ts = now();
        let sort_order = input.sort_order.unwrap_or(0);
        let active = input.active.unwrap_or(1);

        sqlx::query(
            r#"
            INSERT INTO categories (
                id, cafe_id, version, created_at, updated_at, deleted_at,
                created_by, updated_by, name, description, emoji, color,
                sort_order, parent_id, active
            ) VALUES (?, ?, 1, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&id)
        .bind(cafe_id)
        .bind(&now_ts)
        .bind(&now_ts)
        .bind(created_by)
        .bind(created_by)
        .bind(&input.name)
        .bind(&input.description)
        .bind(&input.emoji)
        .bind(&input.color)
        .bind(sort_order)
        .bind(&input.parent_id)
        .bind(active)
        .execute(&db.pool)
        .await?;

        info!("category created: {} ({})", input.name, id);
        Ok(id)
    }

    pub async fn update(db: &Database, input: &UpdateCategory) -> DbResult<()> {
        let now_ts = now();
        let sql = format!(
            r#"
            UPDATE {} SET
                name = ?, description = ?, emoji = ?, color = ?,
                sort_order = ?, parent_id = ?, active = ?,
                version = version + 1, updated_at = ?, updated_by = ?
            WHERE id = ? AND cafe_id = ? AND version = ? AND deleted_at IS NULL
            "#,
            Self::TABLE
        );
        let result = sqlx::query(&sql)
            .bind(&input.name)
            .bind(&input.description)
            .bind(&input.emoji)
            .bind(&input.color)
            .bind(input.sort_order)
            .bind(&input.parent_id)
            .bind(input.active)
            .bind(&now_ts)
            .bind(&input.updated_by)
            .bind(&input.id)
            .bind(&input.cafe_id)
            .bind(input.version)
            .execute(&db.pool)
            .await?;

        if result.rows_affected() == 0 {
            return Err(DbError::OptimisticLock("Category".into(), input.id.clone()));
        }
        Ok(())
    }

    pub async fn soft_delete(db: &Database, id: &str, cafe_id: &str, version: i32) -> DbResult<()> {
        repo_soft_delete(db, Self::TABLE, "Category", id, cafe_id, version).await
    }

    pub async fn hard_delete(db: &Database, id: &str, cafe_id: &str) -> DbResult<()> {
        sqlx::query("DELETE FROM categories WHERE id = ? AND cafe_id = ?")
            .bind(id)
            .bind(cafe_id)
            .execute(&db.pool)
            .await?;
        Ok(())
    }

    pub async fn exists(db: &Database, id: &str, cafe_id: &str) -> DbResult<bool> {
        let row: Option<(i32,)> = sqlx::query_as(
            "SELECT 1 FROM categories WHERE id = ? AND cafe_id = ? AND deleted_at IS NULL",
        )
        .bind(id)
        .bind(cafe_id)
        .fetch_optional(&db.pool)
        .await?;
        Ok(row.is_some())
    }

    pub async fn count(db: &Database, cafe_id: &str) -> DbResult<i64> {
        let (count,): (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM categories WHERE cafe_id = ? AND deleted_at IS NULL",
        )
        .bind(cafe_id)
        .fetch_one(&db.pool)
        .await?;
        Ok(count)
    }

    pub async fn reorder(db: &Database, cafe_id: &str, ids: &[String]) -> DbResult<()> {
        for (i, id) in ids.iter().enumerate() {
            sqlx::query("UPDATE categories SET sort_order = ? WHERE id = ? AND cafe_id = ?")
                .bind(i as i32)
                .bind(id)
                .bind(cafe_id)
                .execute(&db.pool)
                .await?;
        }
        Ok(())
    }
}
