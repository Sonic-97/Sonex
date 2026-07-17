use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use tracing::info;

use crate::db::error::{DbError, DbResult};
use crate::db::repo::{new_id, now, repo_soft_delete};
use crate::db::Database;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct Payment {
    pub id: String,
    pub cafe_id: String,
    pub branch_id: Option<String>,
    pub version: i32,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
    pub created_by: Option<String>,
    pub updated_by: Option<String>,
    pub order_id: Option<String>,
    pub customer_id: Option<String>,
    pub amount: i64,
    pub method: String,
    pub reference: Option<String>,
    pub status: String,
    pub paid_by: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewPayment {
    pub branch_id: Option<String>,
    pub order_id: Option<String>,
    pub customer_id: Option<String>,
    pub amount: i64,
    pub method: Option<String>,
    pub reference: Option<String>,
    pub status: Option<String>,
    pub paid_by: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdatePayment {
    pub id: String,
    pub cafe_id: String,
    pub version: i32,
    pub branch_id: Option<String>,
    pub order_id: Option<String>,
    pub customer_id: Option<String>,
    pub amount: i64,
    pub method: String,
    pub reference: Option<String>,
    pub status: String,
    pub paid_by: Option<String>,
    pub notes: Option<String>,
    pub updated_by: Option<String>,
}

pub struct PaymentRepo;

impl PaymentRepo {
    const TABLE: &'static str = "payments";
    const FIELDS: &'static str = r#"
        id, cafe_id, branch_id, version, created_at, updated_at, deleted_at,
        created_by, updated_by, order_id, customer_id, amount, method,
        reference, status, paid_by, notes
    "#;

    pub async fn find_by_id(db: &Database, id: &str, cafe_id: &str) -> DbResult<Option<Payment>> {
        let sql = format!(
            "SELECT {} FROM {} WHERE id = ? AND cafe_id = ? AND deleted_at IS NULL",
            Self::FIELDS, Self::TABLE
        );
        sqlx::query_as::<_, Payment>(&sql)
            .bind(id)
            .bind(cafe_id)
            .fetch_optional(&db.pool)
            .await
            .map_err(DbError::from)
    }

    pub async fn find_all(db: &Database, cafe_id: &str) -> DbResult<Vec<Payment>> {
        let sql = format!(
            "SELECT {} FROM {} WHERE cafe_id = ? AND deleted_at IS NULL ORDER BY created_at DESC",
            Self::FIELDS, Self::TABLE
        );
        sqlx::query_as::<_, Payment>(&sql)
            .bind(cafe_id)
            .fetch_all(&db.pool)
            .await
            .map_err(DbError::from)
    }

    pub async fn find_all_including_deleted(db: &Database, cafe_id: &str) -> DbResult<Vec<Payment>> {
        let sql = format!(
            "SELECT {} FROM {} WHERE cafe_id = ? ORDER BY created_at DESC",
            Self::FIELDS, Self::TABLE
        );
        sqlx::query_as::<_, Payment>(&sql)
            .bind(cafe_id)
            .fetch_all(&db.pool)
            .await
            .map_err(DbError::from)
    }

    pub async fn find_by_order(db: &Database, cafe_id: &str, order_id: &str) -> DbResult<Vec<Payment>> {
        let sql = format!(
            "SELECT {} FROM {} WHERE cafe_id = ? AND order_id = ? AND deleted_at IS NULL ORDER BY created_at ASC",
            Self::FIELDS, Self::TABLE
        );
        sqlx::query_as::<_, Payment>(&sql)
            .bind(cafe_id)
            .bind(order_id)
            .fetch_all(&db.pool)
            .await
            .map_err(DbError::from)
    }

    pub async fn find_by_customer(db: &Database, cafe_id: &str, customer_id: &str) -> DbResult<Vec<Payment>> {
        let sql = format!(
            "SELECT {} FROM {} WHERE cafe_id = ? AND customer_id = ? AND deleted_at IS NULL ORDER BY created_at DESC",
            Self::FIELDS, Self::TABLE
        );
        sqlx::query_as::<_, Payment>(&sql)
            .bind(cafe_id)
            .bind(customer_id)
            .fetch_all(&db.pool)
            .await
            .map_err(DbError::from)
    }

    pub async fn find_by_method(db: &Database, cafe_id: &str, method: &str) -> DbResult<Vec<Payment>> {
        let sql = format!(
            "SELECT {} FROM {} WHERE cafe_id = ? AND method = ? AND deleted_at IS NULL ORDER BY created_at DESC",
            Self::FIELDS, Self::TABLE
        );
        sqlx::query_as::<_, Payment>(&sql)
            .bind(cafe_id)
            .bind(method)
            .fetch_all(&db.pool)
            .await
            .map_err(DbError::from)
    }

    pub async fn find_by_date_range(
        db: &Database,
        cafe_id: &str,
        from: &str,
        to: &str,
    ) -> DbResult<Vec<Payment>> {
        let sql = format!(
            "SELECT {} FROM {} WHERE cafe_id = ? AND created_at >= ? AND created_at <= ? AND deleted_at IS NULL ORDER BY created_at DESC",
            Self::FIELDS, Self::TABLE
        );
        sqlx::query_as::<_, Payment>(&sql)
            .bind(cafe_id)
            .bind(from)
            .bind(to)
            .fetch_all(&db.pool)
            .await
            .map_err(DbError::from)
    }

    pub async fn total_collected(db: &Database, cafe_id: &str, from: &str, to: &str) -> DbResult<i64> {
        let row: Option<(Option<i64>,)> = sqlx::query_as(
            "SELECT SUM(amount) FROM payments WHERE cafe_id = ? AND status = 'COMPLETED' AND created_at >= ? AND created_at <= ? AND deleted_at IS NULL",
        )
        .bind(cafe_id)
        .bind(from)
        .bind(to)
        .fetch_optional(&db.pool)
        .await?;
        Ok(row.and_then(|r| r.0).unwrap_or(0))
    }

    pub async fn total_by_method(
        db: &Database,
        cafe_id: &str,
        from: &str,
        to: &str,
    ) -> DbResult<Vec<(String, i64)>> {
        let rows: Vec<(String, i64)> = sqlx::query_as(
            "SELECT method, SUM(amount) FROM payments WHERE cafe_id = ? AND status = 'COMPLETED' AND created_at >= ? AND created_at <= ? AND deleted_at IS NULL GROUP BY method",
        )
        .bind(cafe_id)
        .bind(from)
        .bind(to)
        .fetch_all(&db.pool)
        .await?;
        Ok(rows)
    }

    pub async fn insert(
        db: &Database,
        cafe_id: &str,
        created_by: Option<&str>,
        input: &NewPayment,
    ) -> DbResult<String> {
        let id = new_id();
        let now_ts = now();
        let method = input.method.clone().unwrap_or_else(|| "CASH".to_string());
        let status = input.status.clone().unwrap_or_else(|| "COMPLETED".to_string());

        sqlx::query(
            r#"
            INSERT INTO payments (
                id, cafe_id, branch_id, version, created_at, updated_at, deleted_at,
                created_by, updated_by, order_id, customer_id, amount, method,
                reference, status, paid_by, notes
            ) VALUES (?, ?, ?, 1, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&id)
        .bind(cafe_id)
        .bind(&input.branch_id)
        .bind(&now_ts)
        .bind(&now_ts)
        .bind(created_by)
        .bind(created_by)
        .bind(&input.order_id)
        .bind(&input.customer_id)
        .bind(input.amount)
        .bind(&method)
        .bind(&input.reference)
        .bind(&status)
        .bind(&input.paid_by)
        .bind(&input.notes)
        .execute(&db.pool)
        .await?;

        info!("payment created: {} {} ({})", method, input.amount, id);
        Ok(id)
    }

    pub async fn update(db: &Database, input: &UpdatePayment) -> DbResult<()> {
        let now_ts = now();
        let sql = format!(
            r#"
            UPDATE {} SET
                branch_id = ?, order_id = ?, customer_id = ?, amount = ?,
                method = ?, reference = ?, status = ?, paid_by = ?, notes = ?,
                version = version + 1, updated_at = ?, updated_by = ?
            WHERE id = ? AND cafe_id = ? AND version = ? AND deleted_at IS NULL
            "#,
            Self::TABLE
        );
        let result = sqlx::query(&sql)
            .bind(&input.branch_id)
            .bind(&input.order_id)
            .bind(&input.customer_id)
            .bind(input.amount)
            .bind(&input.method)
            .bind(&input.reference)
            .bind(&input.status)
            .bind(&input.paid_by)
            .bind(&input.notes)
            .bind(&now_ts)
            .bind(&input.updated_by)
            .bind(&input.id)
            .bind(&input.cafe_id)
            .bind(input.version)
            .execute(&db.pool)
            .await?;

        if result.rows_affected() == 0 {
            return Err(DbError::OptimisticLock("Payment".into(), input.id.clone()));
        }
        Ok(())
    }

    pub async fn refund(db: &Database, id: &str, cafe_id: &str, version: i32) -> DbResult<()> {
        let now_ts = now();
        let result = sqlx::query(
            "UPDATE payments SET status = 'REFUNDED', version = version + 1, updated_at = ? WHERE id = ? AND cafe_id = ? AND version = ? AND deleted_at IS NULL",
        )
        .bind(&now_ts)
        .bind(id)
        .bind(cafe_id)
        .bind(version)
        .execute(&db.pool)
        .await?;

        if result.rows_affected() == 0 {
            return Err(DbError::OptimisticLock("Payment".into(), id.into()));
        }
        Ok(())
    }

    pub async fn soft_delete(db: &Database, id: &str, cafe_id: &str, version: i32) -> DbResult<()> {
        repo_soft_delete(db, Self::TABLE, "Payment", id, cafe_id, version).await
    }

    pub async fn hard_delete(db: &Database, id: &str, cafe_id: &str) -> DbResult<()> {
        sqlx::query("DELETE FROM payments WHERE id = ? AND cafe_id = ?")
            .bind(id)
            .bind(cafe_id)
            .execute(&db.pool)
            .await?;
        Ok(())
    }

    pub async fn exists(db: &Database, id: &str, cafe_id: &str) -> DbResult<bool> {
        let row: Option<(i32,)> = sqlx::query_as(
            "SELECT 1 FROM payments WHERE id = ? AND cafe_id = ? AND deleted_at IS NULL",
        )
        .bind(id)
        .bind(cafe_id)
        .fetch_optional(&db.pool)
        .await?;
        Ok(row.is_some())
    }

    pub async fn count(db: &Database, cafe_id: &str) -> DbResult<i64> {
        let (count,): (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM payments WHERE cafe_id = ? AND deleted_at IS NULL",
        )
        .bind(cafe_id)
        .fetch_one(&db.pool)
        .await?;
        Ok(count)
    }
}
