use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use tracing::info;

use crate::db::error::{DbError, DbResult};
use crate::db::repo::{new_id, now, repo_soft_delete};
use crate::db::Database;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct Product {
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
    pub price: i64,
    pub cost: Option<i64>,
    pub sku: Option<String>,
    pub barcode: Option<String>,
    pub active: i32,
    pub category_id: Option<String>,
    pub unit: Option<String>,
    pub tax_rate: i64,
    pub tax_inclusive: i32,
    pub image_url: Option<String>,
    pub sort_order: i32,
    pub tags: Option<String>,
    pub is_refrigerated: i32,
    pub refrigerator_category_id: Option<String>,
    pub prep_time_seconds: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewProduct {
    pub name: String,
    pub description: Option<String>,
    pub price: i64,
    pub cost: Option<i64>,
    pub sku: Option<String>,
    pub barcode: Option<String>,
    pub active: Option<i32>,
    pub category_id: Option<String>,
    pub unit: Option<String>,
    pub tax_rate: Option<i64>,
    pub tax_inclusive: Option<i32>,
    pub image_url: Option<String>,
    pub sort_order: Option<i32>,
    pub tags: Option<String>,
    pub is_refrigerated: Option<i32>,
    pub refrigerator_category_id: Option<String>,
    pub prep_time_seconds: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateProduct {
    pub id: String,
    pub cafe_id: String,
    pub version: i32,
    pub name: String,
    pub description: Option<String>,
    pub price: i64,
    pub cost: Option<i64>,
    pub sku: Option<String>,
    pub barcode: Option<String>,
    pub active: i32,
    pub category_id: Option<String>,
    pub unit: Option<String>,
    pub tax_rate: i64,
    pub tax_inclusive: i32,
    pub image_url: Option<String>,
    pub sort_order: i32,
    pub tags: Option<String>,
    pub is_refrigerated: i32,
    pub refrigerator_category_id: Option<String>,
    pub prep_time_seconds: Option<i64>,
    pub updated_by: Option<String>,
}

pub struct ProductRepo;

impl ProductRepo {
    const TABLE: &'static str = "products";
    const FIELDS: &'static str = r#"
        id, cafe_id, version, created_at, updated_at, deleted_at,
        created_by, updated_by, name, description, price, cost,
        sku, barcode, active, category_id, unit, tax_rate, tax_inclusive,
        image_url, sort_order, tags, is_refrigerated, refrigerator_category_id,
        prep_time_seconds
    "#;

    pub async fn find_by_id(db: &Database, id: &str, cafe_id: &str) -> DbResult<Option<Product>> {
        let sql = format!(
            "SELECT {} FROM {} WHERE id = ? AND cafe_id = ? AND deleted_at IS NULL",
            Self::FIELDS,
            Self::TABLE
        );
        sqlx::query_as::<_, Product>(&sql)
            .bind(id)
            .bind(cafe_id)
            .fetch_optional(&db.pool)
            .await
            .map_err(DbError::from)
    }

    pub async fn find_all(db: &Database, cafe_id: &str) -> DbResult<Vec<Product>> {
        let sql = format!(
            "SELECT {} FROM {} WHERE cafe_id = ? AND deleted_at IS NULL ORDER BY sort_order ASC, name ASC",
            Self::FIELDS,
            Self::TABLE
        );
        sqlx::query_as::<_, Product>(&sql)
            .bind(cafe_id)
            .fetch_all(&db.pool)
            .await
            .map_err(DbError::from)
    }

    pub async fn find_all_including_deleted(db: &Database, cafe_id: &str) -> DbResult<Vec<Product>> {
        let sql = format!(
            "SELECT {} FROM {} WHERE cafe_id = ? ORDER BY sort_order ASC, name ASC",
            Self::FIELDS,
            Self::TABLE
        );
        sqlx::query_as::<_, Product>(&sql)
            .bind(cafe_id)
            .fetch_all(&db.pool)
            .await
            .map_err(DbError::from)
    }

    pub async fn find_by_category(db: &Database, cafe_id: &str, category_id: &str) -> DbResult<Vec<Product>> {
        let sql = format!(
            "SELECT {} FROM {} WHERE cafe_id = ? AND category_id = ? AND deleted_at IS NULL ORDER BY sort_order ASC",
            Self::FIELDS,
            Self::TABLE
        );
        sqlx::query_as::<_, Product>(&sql)
            .bind(cafe_id)
            .bind(category_id)
            .fetch_all(&db.pool)
            .await
            .map_err(DbError::from)
    }

    pub async fn find_by_sku(db: &Database, cafe_id: &str, sku: &str) -> DbResult<Option<Product>> {
        let sql = format!(
            "SELECT {} FROM {} WHERE cafe_id = ? AND sku = ? AND deleted_at IS NULL",
            Self::FIELDS,
            Self::TABLE
        );
        sqlx::query_as::<_, Product>(&sql)
            .bind(cafe_id)
            .bind(sku)
            .fetch_optional(&db.pool)
            .await
            .map_err(DbError::from)
    }

    pub async fn search(db: &Database, cafe_id: &str, query: &str) -> DbResult<Vec<Product>> {
        let sql = format!(
            r#"SELECT {} FROM {} WHERE cafe_id = ? AND deleted_at IS NULL AND (name LIKE ? OR sku LIKE ? OR barcode LIKE ?) ORDER BY sort_order ASC, name ASC LIMIT 20"#,
            Self::FIELDS,
            Self::TABLE
        );
        let pattern = format!("%{}%", query);
        sqlx::query_as::<_, Product>(&sql)
            .bind(cafe_id)
            .bind(&pattern)
            .bind(&pattern)
            .bind(&pattern)
            .fetch_all(&db.pool)
            .await
            .map_err(DbError::from)
    }

    pub async fn find_refrigerated(db: &Database, cafe_id: &str) -> DbResult<Vec<Product>> {
        let sql = format!(
            "SELECT {} FROM {} WHERE cafe_id = ? AND is_refrigerated = 1 AND deleted_at IS NULL ORDER BY sort_order ASC, name ASC",
            Self::FIELDS,
            Self::TABLE
        );
        sqlx::query_as::<_, Product>(&sql)
            .bind(cafe_id)
            .fetch_all(&db.pool)
            .await
            .map_err(DbError::from)
    }

    pub async fn insert(
        db: &Database,
        cafe_id: &str,
        created_by: Option<&str>,
        input: &NewProduct,
    ) -> DbResult<String> {
        let id = new_id();
        let now_ts = now();
        let active = input.active.unwrap_or(1);
        let tax_rate = input.tax_rate.unwrap_or(0);
        let tax_inclusive = input.tax_inclusive.unwrap_or(1);
        let sort_order = input.sort_order.unwrap_or(0);
        let is_refrigerated = input.is_refrigerated.unwrap_or(0);

        sqlx::query(
            r#"
            INSERT INTO products (
                id, cafe_id, version, created_at, updated_at, deleted_at,
                created_by, updated_by, name, description, price, cost,
                sku, barcode, active, category_id, unit, tax_rate, tax_inclusive,
                image_url, sort_order, tags, is_refrigerated, refrigerator_category_id,
                prep_time_seconds
            ) VALUES (?, ?, 1, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        .bind(input.price)
        .bind(input.cost)
        .bind(&input.sku)
        .bind(&input.barcode)
        .bind(active)
        .bind(&input.category_id)
        .bind(&input.unit)
        .bind(tax_rate)
        .bind(tax_inclusive)
        .bind(&input.image_url)
        .bind(sort_order)
        .bind(&input.tags)
        .bind(is_refrigerated)
        .bind(&input.refrigerator_category_id)
        .bind(input.prep_time_seconds)
        .execute(&db.pool)
        .await?;

        info!("product created: {} ({})", input.name, id);
        Ok(id)
    }

    pub async fn update(db: &Database, input: &UpdateProduct) -> DbResult<()> {
        let now_ts = now();
        let sql = format!(
            r#"
            UPDATE {} SET
                name = ?, description = ?, price = ?, cost = ?,
                sku = ?, barcode = ?, active = ?, category_id = ?,
                unit = ?, tax_rate = ?, tax_inclusive = ?, image_url = ?,
                sort_order = ?, tags = ?, is_refrigerated = ?,
                refrigerator_category_id = ?, prep_time_seconds = ?,
                version = version + 1, updated_at = ?, updated_by = ?
            WHERE id = ? AND cafe_id = ? AND version = ? AND deleted_at IS NULL
            "#,
            Self::TABLE
        );
        let result = sqlx::query(&sql)
            .bind(&input.name)
            .bind(&input.description)
            .bind(input.price)
            .bind(input.cost)
            .bind(&input.sku)
            .bind(&input.barcode)
            .bind(input.active)
            .bind(&input.category_id)
            .bind(&input.unit)
            .bind(input.tax_rate)
            .bind(input.tax_inclusive)
            .bind(&input.image_url)
            .bind(input.sort_order)
            .bind(&input.tags)
            .bind(input.is_refrigerated)
            .bind(&input.refrigerator_category_id)
            .bind(input.prep_time_seconds)
            .bind(&now_ts)
            .bind(&input.updated_by)
            .bind(&input.id)
            .bind(&input.cafe_id)
            .bind(input.version)
            .execute(&db.pool)
            .await?;

        if result.rows_affected() == 0 {
            return Err(DbError::OptimisticLock("Product".into(), input.id.clone()));
        }
        Ok(())
    }

    pub async fn soft_delete(db: &Database, id: &str, cafe_id: &str, version: i32) -> DbResult<()> {
        repo_soft_delete(db, Self::TABLE, "Product", id, cafe_id, version).await
    }

    pub async fn hard_delete(db: &Database, id: &str, cafe_id: &str) -> DbResult<()> {
        sqlx::query("DELETE FROM products WHERE id = ? AND cafe_id = ?")
            .bind(id)
            .bind(cafe_id)
            .execute(&db.pool)
            .await?;
        Ok(())
    }

    pub async fn exists(db: &Database, id: &str, cafe_id: &str) -> DbResult<bool> {
        let row: Option<(i32,)> = sqlx::query_as(
            "SELECT 1 FROM products WHERE id = ? AND cafe_id = ? AND deleted_at IS NULL",
        )
        .bind(id)
        .bind(cafe_id)
        .fetch_optional(&db.pool)
        .await?;
        Ok(row.is_some())
    }

    pub async fn count(db: &Database, cafe_id: &str) -> DbResult<i64> {
        let (count,): (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM products WHERE cafe_id = ? AND deleted_at IS NULL",
        )
        .bind(cafe_id)
        .fetch_one(&db.pool)
        .await?;
        Ok(count)
    }

    pub async fn count_by_category(db: &Database, cafe_id: &str, category_id: &str) -> DbResult<i64> {
        let (count,): (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM products WHERE cafe_id = ? AND category_id = ? AND deleted_at IS NULL",
        )
        .bind(cafe_id)
        .bind(category_id)
        .fetch_one(&db.pool)
        .await?;
        Ok(count)
    }

    pub async fn find_by_barcode(db: &Database, cafe_id: &str, barcode: &str) -> DbResult<Option<Product>> {
        let sql = format!(
            "SELECT {} FROM {} WHERE cafe_id = ? AND barcode = ? AND deleted_at IS NULL AND active = 1",
            Self::FIELDS,
            Self::TABLE
        );
        sqlx::query_as::<_, Product>(&sql)
            .bind(cafe_id)
            .bind(barcode)
            .fetch_optional(&db.pool)
            .await
            .map_err(DbError::from)
    }

    pub async fn find_active(db: &Database, cafe_id: &str) -> DbResult<Vec<Product>> {
        let sql = format!(
            "SELECT {} FROM {} WHERE cafe_id = ? AND active = 1 AND deleted_at IS NULL ORDER BY sort_order ASC, name ASC",
            Self::FIELDS,
            Self::TABLE
        );
        sqlx::query_as::<_, Product>(&sql)
            .bind(cafe_id)
            .fetch_all(&db.pool)
            .await
            .map_err(DbError::from)
    }
}
