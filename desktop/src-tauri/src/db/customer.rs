use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use tracing::info;

use crate::db::error::{DbError, DbResult};
use crate::db::repo::{new_id, now, repo_soft_delete};
use crate::db::Database;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct Customer {
    pub id: String,
    pub cafe_id: String,
    pub version: i32,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
    pub created_by: Option<String>,
    pub updated_by: Option<String>,
    pub name: String,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub address: Option<String>,
    pub notes: Option<String>,
    pub tags: Option<String>,
    pub loyalty_points: i64,
    pub total_spent: i64,
    pub total_orders: i64,
    pub last_visit: Option<String>,
    pub birth_date: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewCustomer {
    pub name: String,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub address: Option<String>,
    pub notes: Option<String>,
    pub tags: Option<String>,
    pub loyalty_points: Option<i64>,
    pub birth_date: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateCustomer {
    pub id: String,
    pub cafe_id: String,
    pub version: i32,
    pub name: String,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub address: Option<String>,
    pub notes: Option<String>,
    pub tags: Option<String>,
    pub birth_date: Option<String>,
    pub updated_by: Option<String>,
}

pub struct CustomerRepo;

impl CustomerRepo {
    const TABLE: &'static str = "customers";
    const FIELDS: &'static str = r#"
        id, cafe_id, version, created_at, updated_at, deleted_at,
        created_by, updated_by, name, phone, email, address, notes,
        tags, loyalty_points, total_spent, total_orders, last_visit, birth_date
    "#;

    pub async fn find_by_id(db: &Database, id: &str, cafe_id: &str) -> DbResult<Option<Customer>> {
        let sql = format!(
            "SELECT {} FROM {} WHERE id = ? AND cafe_id = ? AND deleted_at IS NULL",
            Self::FIELDS, Self::TABLE
        );
        sqlx::query_as::<_, Customer>(&sql)
            .bind(id)
            .bind(cafe_id)
            .fetch_optional(&db.pool)
            .await
            .map_err(DbError::from)
    }

    pub async fn find_all(db: &Database, cafe_id: &str) -> DbResult<Vec<Customer>> {
        let sql = format!(
            "SELECT {} FROM {} WHERE cafe_id = ? AND deleted_at IS NULL ORDER BY name ASC",
            Self::FIELDS, Self::TABLE
        );
        sqlx::query_as::<_, Customer>(&sql)
            .bind(cafe_id)
            .fetch_all(&db.pool)
            .await
            .map_err(DbError::from)
    }

    pub async fn find_all_including_deleted(db: &Database, cafe_id: &str) -> DbResult<Vec<Customer>> {
        let sql = format!(
            "SELECT {} FROM {} WHERE cafe_id = ? ORDER BY name ASC",
            Self::FIELDS, Self::TABLE
        );
        sqlx::query_as::<_, Customer>(&sql)
            .bind(cafe_id)
            .fetch_all(&db.pool)
            .await
            .map_err(DbError::from)
    }

    pub async fn search(db: &Database, cafe_id: &str, query: &str) -> DbResult<Vec<Customer>> {
        let sql = format!(
            r#"SELECT {} FROM {} WHERE cafe_id = ? AND deleted_at IS NULL AND (name LIKE ? OR phone LIKE ?) ORDER BY name ASC LIMIT 20"#,
            Self::FIELDS, Self::TABLE
        );
        let pattern = format!("%{}%", query);
        sqlx::query_as::<_, Customer>(&sql)
            .bind(cafe_id)
            .bind(&pattern)
            .bind(&pattern)
            .fetch_all(&db.pool)
            .await
            .map_err(DbError::from)
    }

    pub async fn find_by_phone(db: &Database, cafe_id: &str, phone: &str) -> DbResult<Option<Customer>> {
        let sql = format!(
            "SELECT {} FROM {} WHERE cafe_id = ? AND phone = ? AND deleted_at IS NULL",
            Self::FIELDS, Self::TABLE
        );
        sqlx::query_as::<_, Customer>(&sql)
            .bind(cafe_id)
            .bind(phone)
            .fetch_optional(&db.pool)
            .await
            .map_err(DbError::from)
    }

    pub async fn find_top_spenders(db: &Database, cafe_id: &str, limit: i64) -> DbResult<Vec<Customer>> {
        let sql = format!(
            "SELECT {} FROM {} WHERE cafe_id = ? AND deleted_at IS NULL ORDER BY total_spent DESC LIMIT ?",
            Self::FIELDS, Self::TABLE
        );
        sqlx::query_as::<_, Customer>(&sql)
            .bind(cafe_id)
            .bind(limit)
            .fetch_all(&db.pool)
            .await
            .map_err(DbError::from)
    }

    pub async fn find_recent(db: &Database, cafe_id: &str, limit: i64) -> DbResult<Vec<Customer>> {
        let sql = format!(
            "SELECT {} FROM {} WHERE cafe_id = ? AND deleted_at IS NULL ORDER BY last_visit DESC NULLS LAST LIMIT ?",
            Self::FIELDS, Self::TABLE
        );
        sqlx::query_as::<_, Customer>(&sql)
            .bind(cafe_id)
            .bind(limit)
            .fetch_all(&db.pool)
            .await
            .map_err(DbError::from)
    }

    pub async fn insert(
        db: &Database,
        cafe_id: &str,
        created_by: Option<&str>,
        input: &NewCustomer,
    ) -> DbResult<String> {
        let id = new_id();
        let now_ts = now();
        let loyalty_points = input.loyalty_points.unwrap_or(0);

        sqlx::query(
            r#"
            INSERT INTO customers (
                id, cafe_id, version, created_at, updated_at, deleted_at,
                created_by, updated_by, name, phone, email, address, notes,
                tags, loyalty_points, total_spent, total_orders, last_visit, birth_date
            ) VALUES (?, ?, 1, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, NULL, ?)
            "#,
        )
        .bind(&id)
        .bind(cafe_id)
        .bind(&now_ts)
        .bind(&now_ts)
        .bind(created_by)
        .bind(created_by)
        .bind(&input.name)
        .bind(&input.phone)
        .bind(&input.email)
        .bind(&input.address)
        .bind(&input.notes)
        .bind(&input.tags)
        .bind(loyalty_points)
        .bind(&input.birth_date)
        .execute(&db.pool)
        .await?;

        info!("customer created: {} ({})", input.name, id);
        Ok(id)
    }

    pub async fn update(db: &Database, input: &UpdateCustomer) -> DbResult<()> {
        let now_ts = now();
        let sql = format!(
            r#"
            UPDATE {} SET
                name = ?, phone = ?, email = ?, address = ?,
                notes = ?, tags = ?, birth_date = ?,
                version = version + 1, updated_at = ?, updated_by = ?
            WHERE id = ? AND cafe_id = ? AND version = ? AND deleted_at IS NULL
            "#,
            Self::TABLE
        );
        let result = sqlx::query(&sql)
            .bind(&input.name)
            .bind(&input.phone)
            .bind(&input.email)
            .bind(&input.address)
            .bind(&input.notes)
            .bind(&input.tags)
            .bind(&input.birth_date)
            .bind(&now_ts)
            .bind(&input.updated_by)
            .bind(&input.id)
            .bind(&input.cafe_id)
            .bind(input.version)
            .execute(&db.pool)
            .await?;

        if result.rows_affected() == 0 {
            return Err(DbError::OptimisticLock("Customer".into(), input.id.clone()));
        }
        Ok(())
    }

    pub async fn record_visit(db: &Database, id: &str, cafe_id: &str, amount: i64) -> DbResult<()> {
        let now_ts = now();
        sqlx::query(
            "UPDATE customers SET total_spent = total_spent + ?, total_orders = total_orders + 1, last_visit = ?, updated_at = ? WHERE id = ? AND cafe_id = ? AND deleted_at IS NULL",
        )
        .bind(amount)
        .bind(&now_ts)
        .bind(&now_ts)
        .bind(id)
        .bind(cafe_id)
        .execute(&db.pool)
        .await?;
        Ok(())
    }

    pub async fn soft_delete(db: &Database, id: &str, cafe_id: &str, version: i32) -> DbResult<()> {
        repo_soft_delete(db, Self::TABLE, "Customer", id, cafe_id, version).await
    }

    pub async fn hard_delete(db: &Database, id: &str, cafe_id: &str) -> DbResult<()> {
        sqlx::query("DELETE FROM customers WHERE id = ? AND cafe_id = ?")
            .bind(id)
            .bind(cafe_id)
            .execute(&db.pool)
            .await?;
        Ok(())
    }

    pub async fn exists(db: &Database, id: &str, cafe_id: &str) -> DbResult<bool> {
        let row: Option<(i32,)> = sqlx::query_as(
            "SELECT 1 FROM customers WHERE id = ? AND cafe_id = ? AND deleted_at IS NULL",
        )
        .bind(id)
        .bind(cafe_id)
        .fetch_optional(&db.pool)
        .await?;
        Ok(row.is_some())
    }

    pub async fn count(db: &Database, cafe_id: &str) -> DbResult<i64> {
        let (count,): (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM customers WHERE cafe_id = ? AND deleted_at IS NULL",
        )
        .bind(cafe_id)
        .fetch_one(&db.pool)
        .await?;
        Ok(count)
    }

    pub async fn count_new_since(db: &Database, cafe_id: &str, since: &str) -> DbResult<i64> {
        let (count,): (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM customers WHERE cafe_id = ? AND created_at >= ? AND deleted_at IS NULL",
        )
        .bind(cafe_id)
        .bind(since)
        .fetch_one(&db.pool)
        .await?;
        Ok(count)
    }
}
