use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use tracing::info;

use crate::db::error::{DbError, DbResult};
use crate::db::repo::{new_id, now, repo_soft_delete};
use crate::db::Database;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct Branch {
    pub id: String,
    pub cafe_id: String,
    pub name: String,
    pub slug: String,
    pub location: Option<String>,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub active: i32,
    pub version: i32,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
    pub created_by: Option<String>,
    pub updated_by: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewBranch {
    pub name: String,
    pub slug: String,
    pub location: Option<String>,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub active: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateBranch {
    pub id: String,
    pub cafe_id: String,
    pub version: i32,
    pub name: String,
    pub slug: String,
    pub location: Option<String>,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub active: i32,
    pub updated_by: Option<String>,
}

pub struct BranchRepo;

impl BranchRepo {
    const TABLE: &'static str = "branches";
    const FIELDS: &'static str = r#"
        id, cafe_id, name, slug, location, phone, email, active,
        version, created_at, updated_at, deleted_at, created_by, updated_by
    "#;

    pub async fn find_by_id(db: &Database, id: &str, cafe_id: &str) -> DbResult<Option<Branch>> {
        let sql = format!(
            "SELECT {} FROM {} WHERE id = ? AND cafe_id = ? AND deleted_at IS NULL",
            Self::FIELDS, Self::TABLE
        );
        sqlx::query_as::<_, Branch>(&sql)
            .bind(id)
            .bind(cafe_id)
            .fetch_optional(&db.pool)
            .await
            .map_err(DbError::from)
    }

    pub async fn find_all(db: &Database, cafe_id: &str) -> DbResult<Vec<Branch>> {
        let sql = format!(
            "SELECT {} FROM {} WHERE cafe_id = ? AND deleted_at IS NULL ORDER BY name ASC",
            Self::FIELDS, Self::TABLE
        );
        sqlx::query_as::<_, Branch>(&sql)
            .bind(cafe_id)
            .fetch_all(&db.pool)
            .await
            .map_err(DbError::from)
    }

    pub async fn find_all_including_deleted(db: &Database, cafe_id: &str) -> DbResult<Vec<Branch>> {
        let sql = format!(
            "SELECT {} FROM {} WHERE cafe_id = ? ORDER BY name ASC",
            Self::FIELDS, Self::TABLE
        );
        sqlx::query_as::<_, Branch>(&sql)
            .bind(cafe_id)
            .fetch_all(&db.pool)
            .await
            .map_err(DbError::from)
    }

    pub async fn find_active(db: &Database, cafe_id: &str) -> DbResult<Vec<Branch>> {
        let sql = format!(
            "SELECT {} FROM {} WHERE cafe_id = ? AND active = 1 AND deleted_at IS NULL ORDER BY name ASC",
            Self::FIELDS, Self::TABLE
        );
        sqlx::query_as::<_, Branch>(&sql)
            .bind(cafe_id)
            .fetch_all(&db.pool)
            .await
            .map_err(DbError::from)
    }

    pub async fn find_first_active(db: &Database, cafe_id: &str) -> DbResult<Option<Branch>> {
        let sql = format!(
            "SELECT {} FROM {} WHERE cafe_id = ? AND active = 1 AND deleted_at IS NULL ORDER BY name ASC LIMIT 1",
            Self::FIELDS, Self::TABLE
        );
        sqlx::query_as::<_, Branch>(&sql)
            .bind(cafe_id)
            .fetch_optional(&db.pool)
            .await
            .map_err(DbError::from)
    }

    pub async fn find_by_slug(db: &Database, cafe_id: &str, slug: &str) -> DbResult<Option<Branch>> {
        let sql = format!(
            "SELECT {} FROM {} WHERE cafe_id = ? AND slug = ? AND deleted_at IS NULL",
            Self::FIELDS, Self::TABLE
        );
        sqlx::query_as::<_, Branch>(&sql)
            .bind(cafe_id)
            .bind(slug)
            .fetch_optional(&db.pool)
            .await
            .map_err(DbError::from)
    }

    pub async fn insert(
        db: &Database,
        cafe_id: &str,
        created_by: Option<&str>,
        input: &NewBranch,
    ) -> DbResult<String> {
        let id = new_id();
        let now_ts = now();
        let active = input.active.unwrap_or(1);

        sqlx::query(
            r#"
            INSERT INTO branches (
                id, cafe_id, name, slug, location, phone, email, active,
                version, created_at, updated_at, deleted_at, created_by, updated_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NULL, ?, ?)
            "#,
        )
        .bind(&id)
        .bind(cafe_id)
        .bind(&input.name)
        .bind(&input.slug)
        .bind(&input.location)
        .bind(&input.phone)
        .bind(&input.email)
        .bind(active)
        .bind(&now_ts)
        .bind(&now_ts)
        .bind(created_by)
        .bind(created_by)
        .execute(&db.pool)
        .await?;

        info!("branch created: {} ({})", input.name, id);
        Ok(id)
    }

    pub async fn update(db: &Database, input: &UpdateBranch) -> DbResult<()> {
        let now_ts = now();
        let sql = format!(
            r#"
            UPDATE {} SET
                name = ?, slug = ?, location = ?, phone = ?, email = ?, active = ?,
                version = version + 1, updated_at = ?, updated_by = ?
            WHERE id = ? AND cafe_id = ? AND version = ? AND deleted_at IS NULL
            "#,
            Self::TABLE
        );
        let result = sqlx::query(&sql)
            .bind(&input.name)
            .bind(&input.slug)
            .bind(&input.location)
            .bind(&input.phone)
            .bind(&input.email)
            .bind(input.active)
            .bind(&now_ts)
            .bind(&input.updated_by)
            .bind(&input.id)
            .bind(&input.cafe_id)
            .bind(input.version)
            .execute(&db.pool)
            .await?;

        if result.rows_affected() == 0 {
            return Err(DbError::OptimisticLock("Branch".into(), input.id.clone()));
        }
        Ok(())
    }

    pub async fn soft_delete(db: &Database, id: &str, cafe_id: &str, version: i32) -> DbResult<()> {
        repo_soft_delete(db, Self::TABLE, "Branch", id, cafe_id, version).await
    }

    pub async fn hard_delete(db: &Database, id: &str, cafe_id: &str) -> DbResult<()> {
        sqlx::query("DELETE FROM branches WHERE id = ? AND cafe_id = ?")
            .bind(id)
            .bind(cafe_id)
            .execute(&db.pool)
            .await?;
        Ok(())
    }

    pub async fn exists(db: &Database, id: &str, cafe_id: &str) -> DbResult<bool> {
        let row: Option<(i32,)> = sqlx::query_as(
            "SELECT 1 FROM branches WHERE id = ? AND cafe_id = ? AND deleted_at IS NULL",
        )
        .bind(id)
        .bind(cafe_id)
        .fetch_optional(&db.pool)
        .await?;
        Ok(row.is_some())
    }

    pub async fn count(db: &Database, cafe_id: &str) -> DbResult<i64> {
        let (count,): (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM branches WHERE cafe_id = ? AND deleted_at IS NULL",
        )
        .bind(cafe_id)
        .fetch_one(&db.pool)
        .await?;
        Ok(count)
    }

    pub async fn count_active(db: &Database, cafe_id: &str) -> DbResult<i64> {
        let (count,): (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM branches WHERE cafe_id = ? AND active = 1 AND deleted_at IS NULL",
        )
        .bind(cafe_id)
        .fetch_one(&db.pool)
        .await?;
        Ok(count)
    }
}
