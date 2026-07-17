use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use tracing::info;

use crate::db::error::{DbError, DbResult};
use crate::db::repo::{new_id, now, repo_soft_delete};
use crate::db::Database;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct Supplier {
    pub id: String,
    pub cafe_id: String,
    pub version: i32,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
    pub created_by: Option<String>,
    pub updated_by: Option<String>,
    pub name: String,
    pub contact_person: Option<String>,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub address: Option<String>,
    pub tax_id: Option<String>,
    pub notes: Option<String>,
    pub payment_terms: Option<String>,
    pub active: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewSupplier {
    pub name: String,
    pub contact_person: Option<String>,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub address: Option<String>,
    pub tax_id: Option<String>,
    pub notes: Option<String>,
    pub payment_terms: Option<String>,
    pub active: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateSupplier {
    pub id: String,
    pub cafe_id: String,
    pub version: i32,
    pub name: String,
    pub contact_person: Option<String>,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub address: Option<String>,
    pub tax_id: Option<String>,
    pub notes: Option<String>,
    pub payment_terms: Option<String>,
    pub active: i32,
    pub updated_by: Option<String>,
}

pub struct SupplierRepo;

impl SupplierRepo {
    const TABLE: &'static str = "suppliers";
    const FIELDS: &'static str = r#"
        id, cafe_id, version, created_at, updated_at, deleted_at,
        created_by, updated_by, name, contact_person, phone, email,
        address, tax_id, notes, payment_terms, active
    "#;

    pub async fn find_by_id(db: &Database, id: &str, cafe_id: &str) -> DbResult<Option<Supplier>> {
        let sql = format!(
            "SELECT {} FROM {} WHERE id = ? AND cafe_id = ? AND deleted_at IS NULL",
            Self::FIELDS, Self::TABLE
        );
        sqlx::query_as::<_, Supplier>(&sql)
            .bind(id)
            .bind(cafe_id)
            .fetch_optional(&db.pool)
            .await
            .map_err(DbError::from)
    }

    pub async fn find_all(db: &Database, cafe_id: &str) -> DbResult<Vec<Supplier>> {
        let sql = format!(
            "SELECT {} FROM {} WHERE cafe_id = ? AND deleted_at IS NULL ORDER BY name ASC",
            Self::FIELDS, Self::TABLE
        );
        sqlx::query_as::<_, Supplier>(&sql)
            .bind(cafe_id)
            .fetch_all(&db.pool)
            .await
            .map_err(DbError::from)
    }

    pub async fn find_all_including_deleted(db: &Database, cafe_id: &str) -> DbResult<Vec<Supplier>> {
        let sql = format!(
            "SELECT {} FROM {} WHERE cafe_id = ? ORDER BY name ASC",
            Self::FIELDS, Self::TABLE
        );
        sqlx::query_as::<_, Supplier>(&sql)
            .bind(cafe_id)
            .fetch_all(&db.pool)
            .await
            .map_err(DbError::from)
    }

    pub async fn find_active(db: &Database, cafe_id: &str) -> DbResult<Vec<Supplier>> {
        let sql = format!(
            "SELECT {} FROM {} WHERE cafe_id = ? AND active = 1 AND deleted_at IS NULL ORDER BY name ASC",
            Self::FIELDS, Self::TABLE
        );
        sqlx::query_as::<_, Supplier>(&sql)
            .bind(cafe_id)
            .fetch_all(&db.pool)
            .await
            .map_err(DbError::from)
    }

    pub async fn search(db: &Database, cafe_id: &str, query: &str) -> DbResult<Vec<Supplier>> {
        let sql = format!(
            r#"SELECT {} FROM {} WHERE cafe_id = ? AND deleted_at IS NULL AND (name LIKE ? OR contact_person LIKE ?) ORDER BY name ASC LIMIT 20"#,
            Self::FIELDS, Self::TABLE
        );
        let pattern = format!("%{}%", query);
        sqlx::query_as::<_, Supplier>(&sql)
            .bind(cafe_id)
            .bind(&pattern)
            .bind(&pattern)
            .fetch_all(&db.pool)
            .await
            .map_err(DbError::from)
    }

    pub async fn insert(
        db: &Database,
        cafe_id: &str,
        created_by: Option<&str>,
        input: &NewSupplier,
    ) -> DbResult<String> {
        let id = new_id();
        let now_ts = now();
        let active = input.active.unwrap_or(1);

        sqlx::query(
            r#"
            INSERT INTO suppliers (
                id, cafe_id, version, created_at, updated_at, deleted_at,
                created_by, updated_by, name, contact_person, phone, email,
                address, tax_id, notes, payment_terms, active
            ) VALUES (?, ?, 1, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&id)
        .bind(cafe_id)
        .bind(&now_ts)
        .bind(&now_ts)
        .bind(created_by)
        .bind(created_by)
        .bind(&input.name)
        .bind(&input.contact_person)
        .bind(&input.phone)
        .bind(&input.email)
        .bind(&input.address)
        .bind(&input.tax_id)
        .bind(&input.notes)
        .bind(&input.payment_terms)
        .bind(active)
        .execute(&db.pool)
        .await?;

        info!("supplier created: {} ({})", input.name, id);
        Ok(id)
    }

    pub async fn update(db: &Database, input: &UpdateSupplier) -> DbResult<()> {
        let now_ts = now();
        let sql = format!(
            r#"
            UPDATE {} SET
                name = ?, contact_person = ?, phone = ?, email = ?, address = ?,
                tax_id = ?, notes = ?, payment_terms = ?, active = ?,
                version = version + 1, updated_at = ?, updated_by = ?
            WHERE id = ? AND cafe_id = ? AND version = ? AND deleted_at IS NULL
            "#,
            Self::TABLE
        );
        let result = sqlx::query(&sql)
            .bind(&input.name)
            .bind(&input.contact_person)
            .bind(&input.phone)
            .bind(&input.email)
            .bind(&input.address)
            .bind(&input.tax_id)
            .bind(&input.notes)
            .bind(&input.payment_terms)
            .bind(input.active)
            .bind(&now_ts)
            .bind(&input.updated_by)
            .bind(&input.id)
            .bind(&input.cafe_id)
            .bind(input.version)
            .execute(&db.pool)
            .await?;

        if result.rows_affected() == 0 {
            return Err(DbError::OptimisticLock("Supplier".into(), input.id.clone()));
        }
        Ok(())
    }

    pub async fn soft_delete(db: &Database, id: &str, cafe_id: &str, version: i32) -> DbResult<()> {
        repo_soft_delete(db, Self::TABLE, "Supplier", id, cafe_id, version).await
    }

    pub async fn hard_delete(db: &Database, id: &str, cafe_id: &str) -> DbResult<()> {
        sqlx::query("DELETE FROM suppliers WHERE id = ? AND cafe_id = ?")
            .bind(id)
            .bind(cafe_id)
            .execute(&db.pool)
            .await?;
        Ok(())
    }

    pub async fn exists(db: &Database, id: &str, cafe_id: &str) -> DbResult<bool> {
        let row: Option<(i32,)> = sqlx::query_as(
            "SELECT 1 FROM suppliers WHERE id = ? AND cafe_id = ? AND deleted_at IS NULL",
        )
        .bind(id)
        .bind(cafe_id)
        .fetch_optional(&db.pool)
        .await?;
        Ok(row.is_some())
    }

    pub async fn count(db: &Database, cafe_id: &str) -> DbResult<i64> {
        let (count,): (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM suppliers WHERE cafe_id = ? AND deleted_at IS NULL",
        )
        .bind(cafe_id)
        .fetch_one(&db.pool)
        .await?;
        Ok(count)
    }

    pub async fn count_active(db: &Database, cafe_id: &str) -> DbResult<i64> {
        let (count,): (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM suppliers WHERE cafe_id = ? AND active = 1 AND deleted_at IS NULL",
        )
        .bind(cafe_id)
        .fetch_one(&db.pool)
        .await?;
        Ok(count)
    }
}
