use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use tracing::info;

use crate::db::error::{DbError, DbResult};
use crate::db::repo::{new_id, now, repo_soft_delete};
use crate::db::Database;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct PosOrder {
    pub id: String,
    pub cafe_id: String,
    pub order_number: i64,
    pub status: String,
    pub items_json: String,
    pub payments_json: String,
    pub discounts_json: String,
    pub refunds_json: String,
    pub subtotal: i64,
    pub discount_total: i64,
    pub grand_total: i64,
    pub paid_total: i64,
    pub change_total: i64,
    pub payment_status: String,
    pub customer_id: Option<String>,
    pub customer_name: Option<String>,
    pub customer_phone: Option<String>,
    pub notes: Option<String>,
    pub source: String,
    pub created_by: Option<String>,
    pub version: i32,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewPosOrder {
    pub order_number: i64,
    pub items_json: String,
    pub payments_json: String,
    pub discounts_json: String,
    pub refunds_json: String,
    pub subtotal: i64,
    pub discount_total: i64,
    pub grand_total: i64,
    pub paid_total: i64,
    pub change_total: i64,
    pub payment_status: String,
    pub customer_id: Option<String>,
    pub customer_name: Option<String>,
    pub customer_phone: Option<String>,
    pub notes: Option<String>,
    pub source: String,
    pub created_by: Option<String>,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdatePosOrder {
    pub id: String,
    pub cafe_id: String,
    pub version: i32,
    pub status: Option<String>,
    pub items_json: Option<String>,
    pub payments_json: Option<String>,
    pub discounts_json: Option<String>,
    pub refunds_json: Option<String>,
    pub subtotal: Option<i64>,
    pub discount_total: Option<i64>,
    pub grand_total: Option<i64>,
    pub paid_total: Option<i64>,
    pub change_total: Option<i64>,
    pub payment_status: Option<String>,
    pub customer_id: Option<String>,
    pub customer_name: Option<String>,
    pub notes: Option<String>,
    pub source: Option<String>,
}

pub struct PosOrderRepo;

impl PosOrderRepo {
    const TABLE: &'static str = "pos_orders";

    pub async fn find_by_id(db: &Database, id: &str, cafe_id: &str) -> DbResult<Option<PosOrder>> {
        let sql = format!(
            "SELECT * FROM {} WHERE id = ? AND cafe_id = ? AND deleted_at IS NULL",
            Self::TABLE
        );
        sqlx::query_as::<_, PosOrder>(&sql)
            .bind(id)
            .bind(cafe_id)
            .fetch_optional(&db.pool)
            .await
            .map_err(DbError::from)
    }

    pub async fn find_all(db: &Database, cafe_id: &str, since: Option<&str>) -> DbResult<Vec<PosOrder>> {
        if let Some(date) = since {
            let sql = format!(
                "SELECT * FROM {} WHERE cafe_id = ? AND deleted_at IS NULL AND created_at >= ? ORDER BY order_number DESC",
                Self::TABLE
            );
            sqlx::query_as::<_, PosOrder>(&sql)
                .bind(cafe_id)
                .bind(date)
                .fetch_all(&db.pool)
                .await
                .map_err(DbError::from)
        } else {
            let today = now()["0".len()..10].to_string();
            let sql = format!(
                "SELECT * FROM {} WHERE cafe_id = ? AND deleted_at IS NULL AND created_at >= ? ORDER BY order_number DESC",
                Self::TABLE
            );
            sqlx::query_as::<_, PosOrder>(&sql)
                .bind(cafe_id)
                .bind(today)
                .fetch_all(&db.pool)
                .await
                .map_err(DbError::from)
        }
    }

    pub async fn find_active(db: &Database, cafe_id: &str) -> DbResult<Vec<PosOrder>> {
        let sql = format!(
            "SELECT * FROM {} WHERE cafe_id = ? AND deleted_at IS NULL AND status IN ('pending','confirmed','preparing') ORDER BY created_at DESC",
            Self::TABLE
        );
        sqlx::query_as::<_, PosOrder>(&sql)
            .bind(cafe_id)
            .fetch_all(&db.pool)
            .await
            .map_err(DbError::from)
    }

    pub async fn find_by_status(db: &Database, cafe_id: &str, status: &str) -> DbResult<Vec<PosOrder>> {
        let sql = format!(
            "SELECT * FROM {} WHERE cafe_id = ? AND deleted_at IS NULL AND status = ? ORDER BY created_at DESC",
            Self::TABLE
        );
        sqlx::query_as::<_, PosOrder>(&sql)
            .bind(cafe_id)
            .bind(status)
            .fetch_all(&db.pool)
            .await
            .map_err(DbError::from)
    }

    pub async fn next_number(db: &Database, cafe_id: &str) -> DbResult<i64> {
        let result: Option<(i64,)> = sqlx::query_as(
            "SELECT MAX(order_number) FROM pos_orders WHERE cafe_id = ?",
        )
        .bind(cafe_id)
        .fetch_optional(&db.pool)
        .await?;
        Ok(result.map(|r| r.0 + 1).unwrap_or(1))
    }

    pub async fn insert(db: &Database, cafe_id: &str, input: &NewPosOrder) -> DbResult<String> {
        let id = new_id();
        let now_ts = now();

        sqlx::query(
            r#"
            INSERT INTO pos_orders (
                id, cafe_id, order_number, status,
                items_json, payments_json, discounts_json, refunds_json,
                subtotal, discount_total, grand_total,
                paid_total, change_total, payment_status,
                customer_id, customer_name, customer_phone,
                notes, source, created_by, version, created_at, updated_at
            ) VALUES (
                ?, ?, ?, ?,
                ?, ?, ?, ?,
                ?, ?, ?,
                ?, ?, ?,
                ?, ?, ?,
                ?, ?, ?, 1, ?, ?
            )
            "#,
        )
        .bind(&id)
        .bind(cafe_id)
        .bind(input.order_number)
        .bind(&input.status)
        .bind(&input.items_json)
        .bind(&input.payments_json)
        .bind(&input.discounts_json)
        .bind(&input.refunds_json)
        .bind(input.subtotal)
        .bind(input.discount_total)
        .bind(input.grand_total)
        .bind(input.paid_total)
        .bind(input.change_total)
        .bind(&input.payment_status)
        .bind(&input.customer_id)
        .bind(&input.customer_name)
        .bind(&input.customer_phone)
        .bind(&input.notes)
        .bind(&input.source)
        .bind(&input.created_by)
        .bind(&now_ts)
        .bind(&now_ts)
        .execute(&db.pool)
        .await?;

        info!("pos_order created: #{} ({})", input.order_number, id);
        Ok(id)
    }

    pub async fn update_fields(db: &Database, input: &UpdatePosOrder) -> DbResult<()> {
        let now_ts = now();
        let mut set_clauses: Vec<String> = vec!["version = version + 1".to_string(), format!("updated_at = '{}'", now_ts)];
        let mut binds: Vec<String> = vec![];

        if let Some(ref v) = input.status { set_clauses.push(format!("status = ?{}", binds.len() + 1)); binds.push(v.clone()); }
        if let Some(ref v) = input.items_json { set_clauses.push(format!("items_json = ?{}", binds.len() + 1)); binds.push(v.clone()); }
        if let Some(ref v) = input.payments_json { set_clauses.push(format!("payments_json = ?{}", binds.len() + 1)); binds.push(v.clone()); }
        if let Some(ref v) = input.discounts_json { set_clauses.push(format!("discounts_json = ?{}", binds.len() + 1)); binds.push(v.clone()); }
        if let Some(ref v) = input.refunds_json { set_clauses.push(format!("refunds_json = ?{}", binds.len() + 1)); binds.push(v.clone()); }
        if let Some(ref v) = input.subtotal { set_clauses.push(format!("subtotal = ?{}", binds.len() + 1)); binds.push(v.to_string()); }
        if let Some(ref v) = input.discount_total { set_clauses.push(format!("discount_total = ?{}", binds.len() + 1)); binds.push(v.to_string()); }
        if let Some(ref v) = input.grand_total { set_clauses.push(format!("grand_total = ?{}", binds.len() + 1)); binds.push(v.to_string()); }
        if let Some(ref v) = input.paid_total { set_clauses.push(format!("paid_total = ?{}", binds.len() + 1)); binds.push(v.to_string()); }
        if let Some(ref v) = input.change_total { set_clauses.push(format!("change_total = ?{}", binds.len() + 1)); binds.push(v.to_string()); }
        if let Some(ref v) = input.payment_status { set_clauses.push(format!("payment_status = ?{}", binds.len() + 1)); binds.push(v.clone()); }
        if let Some(ref v) = input.customer_id { set_clauses.push(format!("customer_id = ?{}", binds.len() + 1)); binds.push(v.clone()); }
        if let Some(ref v) = input.customer_name { set_clauses.push(format!("customer_name = ?{}", binds.len() + 1)); binds.push(v.clone()); }
        if let Some(ref v) = input.notes { set_clauses.push(format!("notes = ?{}", binds.len() + 1)); binds.push(v.clone()); }
        if let Some(ref v) = input.source { set_clauses.push(format!("source = ?{}", binds.len() + 1)); binds.push(v.clone()); }

        let set_sql = set_clauses.join(", ");
        let sql = format!(
            "UPDATE {} SET {} WHERE id = ? AND cafe_id = ? AND version = ? AND deleted_at IS NULL",
            Self::TABLE, set_sql
        );

        let mut query = sqlx::query(&sql);
        for b in &binds {
            query = query.bind(b);
        }
        query = query.bind(&input.id).bind(&input.cafe_id).bind(input.version);

        let result = query.execute(&db.pool).await?;
        if result.rows_affected() == 0 {
            return Err(DbError::OptimisticLock("PosOrder".into(), input.id.clone()));
        }
        Ok(())
    }

    pub async fn soft_delete(db: &Database, id: &str, cafe_id: &str, version: i32) -> DbResult<()> {
        repo_soft_delete(db, Self::TABLE, "PosOrder", id, cafe_id, version).await
    }

    pub async fn get_sales_summary(db: &Database, cafe_id: &str, from_date: &str, to_date: &str) -> DbResult<(i64, i64, i64)> {
        let sql = format!(
            "SELECT COUNT(*), COALESCE(SUM(grand_total),0), COALESCE(SUM(paid_total),0) FROM {} WHERE cafe_id = ? AND deleted_at IS NULL AND status = 'completed' AND created_at >= ? AND created_at <= ?",
            Self::TABLE
        );
        let row: (i64, i64, i64) = sqlx::query_as(&sql)
            .bind(cafe_id)
            .bind(from_date)
            .bind(to_date)
            .fetch_one(&db.pool)
            .await?;
        Ok(row)
    }
}
