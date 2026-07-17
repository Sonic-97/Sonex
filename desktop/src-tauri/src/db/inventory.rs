use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use tracing::info;

use crate::db::error::{DbError, DbResult};
use crate::db::repo::{new_id, now, repo_soft_delete};
use crate::db::Database;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct InventoryItem {
    pub id: String,
    pub cafe_id: String,
    pub branch_id: Option<String>,
    pub version: i32,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
    pub created_by: Option<String>,
    pub updated_by: Option<String>,
    pub product_id: Option<String>,
    pub name: String,
    pub sku: Option<String>,
    pub category: Option<String>,
    pub unit: String,
    pub purchase_unit: Option<String>,
    pub consumption_unit: Option<String>,
    pub conversion_ratio: f64,
    pub current_qty: f64,
    pub min_qty: f64,
    pub max_qty: f64,
    pub cost_per_unit: i64,
    pub supplier_id: Option<String>,
    pub barcode: Option<String>,
    pub location: Option<String>,
    pub inventory_category_id: Option<String>,
    pub active: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewInventoryItem {
    pub branch_id: Option<String>,
    pub product_id: Option<String>,
    pub name: String,
    pub sku: Option<String>,
    pub category: Option<String>,
    pub unit: Option<String>,
    pub purchase_unit: Option<String>,
    pub consumption_unit: Option<String>,
    pub conversion_ratio: Option<f64>,
    pub current_qty: f64,
    pub min_qty: Option<f64>,
    pub max_qty: Option<f64>,
    pub cost_per_unit: i64,
    pub supplier_id: Option<String>,
    pub barcode: Option<String>,
    pub location: Option<String>,
    pub inventory_category_id: Option<String>,
    pub active: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateInventoryItem {
    pub id: String,
    pub cafe_id: String,
    pub version: i32,
    pub branch_id: Option<String>,
    pub product_id: Option<String>,
    pub name: String,
    pub sku: Option<String>,
    pub category: Option<String>,
    pub unit: String,
    pub purchase_unit: Option<String>,
    pub consumption_unit: Option<String>,
    pub conversion_ratio: f64,
    pub current_qty: f64,
    pub min_qty: f64,
    pub max_qty: f64,
    pub cost_per_unit: i64,
    pub supplier_id: Option<String>,
    pub barcode: Option<String>,
    pub location: Option<String>,
    pub inventory_category_id: Option<String>,
    pub active: i32,
    pub updated_by: Option<String>,
}

pub struct InventoryRepo;

impl InventoryRepo {
    const TABLE: &'static str = "inventory_items";
    const FIELDS: &'static str = r#"
        id, cafe_id, branch_id, version, created_at, updated_at, deleted_at,
        created_by, updated_by, product_id, name, sku, category, unit,
        purchase_unit, consumption_unit, conversion_ratio,
        current_qty, min_qty, max_qty, cost_per_unit, supplier_id, barcode,
        location, inventory_category_id, active
    "#;

    pub async fn find_by_id(db: &Database, id: &str, cafe_id: &str) -> DbResult<Option<InventoryItem>> {
        let sql = format!(
            "SELECT {} FROM {} WHERE id = ? AND cafe_id = ? AND deleted_at IS NULL",
            Self::FIELDS, Self::TABLE
        );
        sqlx::query_as::<_, InventoryItem>(&sql)
            .bind(id)
            .bind(cafe_id)
            .fetch_optional(&db.pool)
            .await
            .map_err(DbError::from)
    }

    pub async fn find_all(db: &Database, cafe_id: &str) -> DbResult<Vec<InventoryItem>> {
        let sql = format!(
            "SELECT {} FROM {} WHERE cafe_id = ? AND deleted_at IS NULL ORDER BY name ASC",
            Self::FIELDS, Self::TABLE
        );
        sqlx::query_as::<_, InventoryItem>(&sql)
            .bind(cafe_id)
            .fetch_all(&db.pool)
            .await
            .map_err(DbError::from)
    }

    pub async fn find_all_including_deleted(db: &Database, cafe_id: &str) -> DbResult<Vec<InventoryItem>> {
        let sql = format!(
            "SELECT {} FROM {} WHERE cafe_id = ? ORDER BY name ASC",
            Self::FIELDS, Self::TABLE
        );
        sqlx::query_as::<_, InventoryItem>(&sql)
            .bind(cafe_id)
            .fetch_all(&db.pool)
            .await
            .map_err(DbError::from)
    }

    pub async fn find_by_product(db: &Database, cafe_id: &str, product_id: &str) -> DbResult<Option<InventoryItem>> {
        let sql = format!(
            "SELECT {} FROM {} WHERE cafe_id = ? AND product_id = ? AND deleted_at IS NULL",
            Self::FIELDS, Self::TABLE
        );
        sqlx::query_as::<_, InventoryItem>(&sql)
            .bind(cafe_id)
            .bind(product_id)
            .fetch_optional(&db.pool)
            .await
            .map_err(DbError::from)
    }

    pub async fn find_low_stock(db: &Database, cafe_id: &str) -> DbResult<Vec<InventoryItem>> {
        let sql = format!(
            "SELECT {} FROM {} WHERE cafe_id = ? AND current_qty <= min_qty AND deleted_at IS NULL ORDER BY (current_qty - min_qty) ASC",
            Self::FIELDS, Self::TABLE
        );
        sqlx::query_as::<_, InventoryItem>(&sql)
            .bind(cafe_id)
            .fetch_all(&db.pool)
            .await
            .map_err(DbError::from)
    }

    pub async fn find_by_supplier(db: &Database, cafe_id: &str, supplier_id: &str) -> DbResult<Vec<InventoryItem>> {
        let sql = format!(
            "SELECT {} FROM {} WHERE cafe_id = ? AND supplier_id = ? AND deleted_at IS NULL ORDER BY name ASC",
            Self::FIELDS, Self::TABLE
        );
        sqlx::query_as::<_, InventoryItem>(&sql)
            .bind(cafe_id)
            .bind(supplier_id)
            .fetch_all(&db.pool)
            .await
            .map_err(DbError::from)
    }

    pub async fn search(db: &Database, cafe_id: &str, query: &str) -> DbResult<Vec<InventoryItem>> {
        let sql = format!(
            r#"SELECT {} FROM {} WHERE cafe_id = ? AND deleted_at IS NULL AND (name LIKE ? OR sku LIKE ?) ORDER BY name ASC LIMIT 20"#,
            Self::FIELDS, Self::TABLE
        );
        let pattern = format!("%{}%", query);
        sqlx::query_as::<_, InventoryItem>(&sql)
            .bind(cafe_id)
            .bind(&pattern)
            .bind(&pattern)
            .fetch_all(&db.pool)
            .await
            .map_err(DbError::from)
    }

    pub async fn find_by_branch(db: &Database, cafe_id: &str, branch_id: &str) -> DbResult<Vec<InventoryItem>> {
        let sql = format!(
            "SELECT {} FROM {} WHERE cafe_id = ? AND branch_id = ? AND deleted_at IS NULL ORDER BY name ASC",
            Self::FIELDS, Self::TABLE
        );
        sqlx::query_as::<_, InventoryItem>(&sql)
            .bind(cafe_id)
            .bind(branch_id)
            .fetch_all(&db.pool)
            .await
            .map_err(DbError::from)
    }

    pub async fn find_by_name(db: &Database, cafe_id: &str, name: &str) -> DbResult<Vec<InventoryItem>> {
        let sql = format!(
            "SELECT {} FROM {} WHERE cafe_id = ? AND name LIKE ? AND deleted_at IS NULL ORDER BY name ASC LIMIT 5",
            Self::FIELDS, Self::TABLE
        );
        sqlx::query_as::<_, InventoryItem>(&sql)
            .bind(cafe_id)
            .bind(format!("%{}%", name))
            .fetch_all(&db.pool)
            .await
            .map_err(DbError::from)
    }

    pub async fn update_qty(db: &Database, id: &str, cafe_id: &str, new_qty: f64) -> DbResult<()> {
        let now_ts = now();
        let sql = format!(
            "UPDATE {} SET current_qty = ?, version = version + 1, updated_at = ? WHERE id = ? AND cafe_id = ? AND deleted_at IS NULL",
            Self::TABLE
        );
        sqlx::query(&sql)
            .bind(new_qty)
            .bind(&now_ts)
            .bind(id)
            .bind(cafe_id)
            .execute(&db.pool)
            .await?;
        Ok(())
    }

    pub async fn insert(
        db: &Database,
        cafe_id: &str,
        created_by: Option<&str>,
        input: &NewInventoryItem,
    ) -> DbResult<String> {
        let id = new_id();
        let now_ts = now();
        let unit = input.unit.clone().unwrap_or_else(|| "piece".to_string());
        let min_qty = input.min_qty.unwrap_or(0.0);
        let max_qty = input.max_qty.unwrap_or(0.0);
        let conversion_ratio = input.conversion_ratio.unwrap_or(1.0);
        let active = input.active.unwrap_or(1);

        sqlx::query(
            r#"
            INSERT INTO inventory_items (
                id, cafe_id, branch_id, version, created_at, updated_at, deleted_at,
                created_by, updated_by, product_id, name, sku, category, unit,
                purchase_unit, consumption_unit, conversion_ratio,
                current_qty, min_qty, max_qty, cost_per_unit, supplier_id, barcode,
                location, inventory_category_id, active
            ) VALUES (?, ?, ?, 1, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&id)
        .bind(cafe_id)
        .bind(&input.branch_id)
        .bind(&now_ts)
        .bind(&now_ts)
        .bind(created_by)
        .bind(created_by)
        .bind(&input.product_id)
        .bind(&input.name)
        .bind(&input.sku)
        .bind(&input.category)
        .bind(&unit)
        .bind(&input.purchase_unit)
        .bind(&input.consumption_unit)
        .bind(conversion_ratio)
        .bind(input.current_qty)
        .bind(min_qty)
        .bind(max_qty)
        .bind(input.cost_per_unit)
        .bind(&input.supplier_id)
        .bind(&input.barcode)
        .bind(&input.location)
        .bind(&input.inventory_category_id)
        .bind(active)
        .execute(&db.pool)
        .await?;

        info!("inventory item created: {} ({})", input.name, id);
        Ok(id)
    }

    pub async fn update(db: &Database, input: &UpdateInventoryItem) -> DbResult<()> {
        let now_ts = now();
        let sql = format!(
            r#"
            UPDATE {} SET
                branch_id = ?, product_id = ?, name = ?, sku = ?, category = ?,
                unit = ?, purchase_unit = ?, consumption_unit = ?, conversion_ratio = ?,
                current_qty = ?, min_qty = ?, max_qty = ?,
                cost_per_unit = ?, supplier_id = ?, barcode = ?, location = ?,
                inventory_category_id = ?, active = ?,
                version = version + 1, updated_at = ?, updated_by = ?
            WHERE id = ? AND cafe_id = ? AND version = ? AND deleted_at IS NULL
            "#,
            Self::TABLE
        );
        let result = sqlx::query(&sql)
            .bind(&input.branch_id)
            .bind(&input.product_id)
            .bind(&input.name)
            .bind(&input.sku)
            .bind(&input.category)
            .bind(&input.unit)
            .bind(&input.purchase_unit)
            .bind(&input.consumption_unit)
            .bind(input.conversion_ratio)
            .bind(input.current_qty)
            .bind(input.min_qty)
            .bind(input.max_qty)
            .bind(input.cost_per_unit)
            .bind(&input.supplier_id)
            .bind(&input.barcode)
            .bind(&input.location)
            .bind(&input.inventory_category_id)
            .bind(input.active)
            .bind(&now_ts)
            .bind(&input.updated_by)
            .bind(&input.id)
            .bind(&input.cafe_id)
            .bind(input.version)
            .execute(&db.pool)
            .await?;

        if result.rows_affected() == 0 {
            return Err(DbError::OptimisticLock("InventoryItem".into(), input.id.clone()));
        }
        Ok(())
    }

    pub async fn adjust_qty(db: &Database, id: &str, cafe_id: &str, delta: f64, version: i32) -> DbResult<()> {
        let now_ts = now();
        let sql = format!(
            r#"
            UPDATE {} SET
                current_qty = current_qty + ?,
                version = version + 1,
                updated_at = ?
            WHERE id = ? AND cafe_id = ? AND version = ? AND deleted_at IS NULL
            "#,
            Self::TABLE
        );
        let result = sqlx::query(&sql)
            .bind(delta)
            .bind(&now_ts)
            .bind(id)
            .bind(cafe_id)
            .bind(version)
            .execute(&db.pool)
            .await?;

        if result.rows_affected() == 0 {
            return Err(DbError::OptimisticLock("InventoryItem".into(), id.into()));
        }
        Ok(())
    }

    pub async fn soft_delete(db: &Database, id: &str, cafe_id: &str, version: i32) -> DbResult<()> {
        repo_soft_delete(db, Self::TABLE, "InventoryItem", id, cafe_id, version).await
    }

    pub async fn hard_delete(db: &Database, id: &str, cafe_id: &str) -> DbResult<()> {
        sqlx::query("DELETE FROM inventory_items WHERE id = ? AND cafe_id = ?")
            .bind(id)
            .bind(cafe_id)
            .execute(&db.pool)
            .await?;
        Ok(())
    }

    pub async fn exists(db: &Database, id: &str, cafe_id: &str) -> DbResult<bool> {
        let row: Option<(i32,)> = sqlx::query_as(
            "SELECT 1 FROM inventory_items WHERE id = ? AND cafe_id = ? AND deleted_at IS NULL",
        )
        .bind(id)
        .bind(cafe_id)
        .fetch_optional(&db.pool)
        .await?;
        Ok(row.is_some())
    }

    pub async fn count(db: &Database, cafe_id: &str) -> DbResult<i64> {
        let (count,): (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM inventory_items WHERE cafe_id = ? AND deleted_at IS NULL",
        )
        .bind(cafe_id)
        .fetch_one(&db.pool)
        .await?;
        Ok(count)
    }

    pub async fn count_low_stock(db: &Database, cafe_id: &str) -> DbResult<i64> {
        let (count,): (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM inventory_items WHERE cafe_id = ? AND current_qty <= min_qty AND deleted_at IS NULL",
        )
        .bind(cafe_id)
        .fetch_one(&db.pool)
        .await?;
        Ok(count)
    }

    pub async fn total_value(db: &Database, cafe_id: &str) -> DbResult<i64> {
        let row: Option<(Option<f64>,)> = sqlx::query_as(
            "SELECT SUM(current_qty * cost_per_unit) FROM inventory_items WHERE cafe_id = ? AND deleted_at IS NULL",
        )
        .bind(cafe_id)
        .fetch_optional(&db.pool)
        .await?;
        Ok(row.and_then(|r| r.0).unwrap_or(0.0) as i64)
    }
}
