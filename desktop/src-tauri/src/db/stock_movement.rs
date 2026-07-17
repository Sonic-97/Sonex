use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use tracing::info;

use crate::db::error::{DbError, DbResult};
use crate::db::repo::{new_id, now, repo_soft_delete};
use crate::db::Database;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct StockMovement {
    pub id: String,
    pub cafe_id: String,
    pub inventory_item_id: String,
    pub version: i32,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
    pub created_by: Option<String>,
    pub updated_by: Option<String>,
    pub quantity: f64,
    pub previous_qty: f64,
    pub new_qty: f64,
    pub movement_type: String,
    pub reference_type: Option<String>,
    pub reference_id: Option<String>,
    pub notes: Option<String>,
    pub cost_per_unit: Option<i64>,
    pub total_cost: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewStockMovement {
    pub inventory_item_id: String,
    pub quantity: f64,
    pub previous_qty: f64,
    pub new_qty: f64,
    pub movement_type: String,
    pub reference_type: Option<String>,
    pub reference_id: Option<String>,
    pub notes: Option<String>,
    pub cost_per_unit: Option<i64>,
    pub total_cost: Option<i64>,
}

pub struct StockMovementRepo;

impl StockMovementRepo {
    const TABLE: &'static str = "stock_movements";
    const FIELDS: &'static str = r#"
        id, cafe_id, inventory_item_id, version, created_at, updated_at, deleted_at,
        created_by, updated_by, quantity, previous_qty, new_qty, movement_type,
        reference_type, reference_id, notes, cost_per_unit, total_cost
    "#;

    pub async fn find_by_id(db: &Database, id: &str, cafe_id: &str) -> DbResult<Option<StockMovement>> {
        let sql = format!(
            "SELECT {} FROM {} WHERE id = ? AND cafe_id = ? AND deleted_at IS NULL",
            Self::FIELDS, Self::TABLE
        );
        sqlx::query_as::<_, StockMovement>(&sql)
            .bind(id)
            .bind(cafe_id)
            .fetch_optional(&db.pool)
            .await
            .map_err(DbError::from)
    }

    pub async fn find_by_item(
        db: &Database,
        cafe_id: &str,
        item_id: &str,
        limit: i64,
        offset: i64,
    ) -> DbResult<Vec<StockMovement>> {
        let sql = format!(
            "SELECT {} FROM {} WHERE cafe_id = ? AND inventory_item_id = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT ? OFFSET ?",
            Self::FIELDS, Self::TABLE
        );
        sqlx::query_as::<_, StockMovement>(&sql)
            .bind(cafe_id)
            .bind(item_id)
            .bind(limit)
            .bind(offset)
            .fetch_all(&db.pool)
            .await
            .map_err(DbError::from)
    }

    pub async fn find_all(
        db: &Database,
        cafe_id: &str,
        limit: i64,
        offset: i64,
    ) -> DbResult<Vec<StockMovement>> {
        let sql = format!(
            "SELECT {} FROM {} WHERE cafe_id = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT ? OFFSET ?",
            Self::FIELDS, Self::TABLE
        );
        sqlx::query_as::<_, StockMovement>(&sql)
            .bind(cafe_id)
            .bind(limit)
            .bind(offset)
            .fetch_all(&db.pool)
            .await
            .map_err(DbError::from)
    }

    pub async fn find_by_type(
        db: &Database,
        cafe_id: &str,
        movement_type: &str,
        limit: i64,
        offset: i64,
    ) -> DbResult<Vec<StockMovement>> {
        let sql = format!(
            "SELECT {} FROM {} WHERE cafe_id = ? AND movement_type = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT ? OFFSET ?",
            Self::FIELDS, Self::TABLE
        );
        sqlx::query_as::<_, StockMovement>(&sql)
            .bind(cafe_id)
            .bind(movement_type)
            .bind(limit)
            .bind(offset)
            .fetch_all(&db.pool)
            .await
            .map_err(DbError::from)
    }

    pub async fn find_by_date_range(
        db: &Database,
        cafe_id: &str,
        item_id: &str,
        from: &str,
        to: &str,
    ) -> DbResult<Vec<StockMovement>> {
        let sql = format!(
            "SELECT {} FROM {} WHERE cafe_id = ? AND inventory_item_id = ? AND created_at >= ? AND created_at <= ? AND deleted_at IS NULL ORDER BY created_at DESC",
            Self::FIELDS, Self::TABLE
        );
        sqlx::query_as::<_, StockMovement>(&sql)
            .bind(cafe_id)
            .bind(item_id)
            .bind(from)
            .bind(to)
            .fetch_all(&db.pool)
            .await
            .map_err(DbError::from)
    }

    pub async fn insert(
        db: &Database,
        cafe_id: &str,
        created_by: Option<&str>,
        input: &NewStockMovement,
    ) -> DbResult<String> {
        let id = new_id();
        let now_ts = now();

        sqlx::query(
            r#"
            INSERT INTO stock_movements (
                id, cafe_id, inventory_item_id, version, created_at, updated_at, deleted_at,
                created_by, updated_by, quantity, previous_qty, new_qty, movement_type,
                reference_type, reference_id, notes, cost_per_unit, total_cost
            ) VALUES (?, ?, ?, 1, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&id)
        .bind(cafe_id)
        .bind(&input.inventory_item_id)
        .bind(&now_ts)
        .bind(&now_ts)
        .bind(created_by)
        .bind(created_by)
        .bind(input.quantity)
        .bind(input.previous_qty)
        .bind(input.new_qty)
        .bind(&input.movement_type)
        .bind(&input.reference_type)
        .bind(&input.reference_id)
        .bind(&input.notes)
        .bind(input.cost_per_unit)
        .bind(input.total_cost)
        .execute(&db.pool)
        .await?;

        info!(
            "stock movement created: {} qty={} type={} ({})",
            input.inventory_item_id, input.quantity, input.movement_type, id
        );
        Ok(id)
    }

    /// Record a stock movement AND update the item quantity in a single transaction.
    pub async fn record_movement(
        db: &Database,
        cafe_id: &str,
        created_by: Option<&str>,
        item_id: &str,
        item_version: i32,
        quantity: f64,
        movement_type: &str,
        reference_type: Option<&str>,
        reference_id: Option<&str>,
        notes: Option<&str>,
        cost_per_unit: Option<i64>,
    ) -> DbResult<StockMovement> {
        let mut tx = db.pool.begin().await.map_err(DbError::from)?;

        // Read current qty with lock
        let (current_qty,): (f64,) = sqlx::query_as(
            "SELECT current_qty FROM inventory_items WHERE id = ? AND cafe_id = ? AND version = ? AND deleted_at IS NULL",
        )
        .bind(item_id)
        .bind(cafe_id)
        .bind(item_version)
        .fetch_one(&mut *tx)
        .await?;

        let new_qty = current_qty + quantity;

        // Update item quantity
        let updated = sqlx::query(
            "UPDATE inventory_items SET current_qty = ?, version = version + 1, updated_at = ? WHERE id = ? AND cafe_id = ? AND version = ? AND deleted_at IS NULL",
        )
        .bind(new_qty)
        .bind(&now())
        .bind(item_id)
        .bind(cafe_id)
        .bind(item_version)
        .execute(&mut *tx)
        .await?;

        if updated.rows_affected() == 0 {
            tx.rollback().await.map_err(DbError::from)?;
            return Err(DbError::OptimisticLock("InventoryItem".into(), item_id.into()));
        }

        // Create movement record
        let movement_id = new_id();
        let now_ts = now();
        let total_cost = cost_per_unit.map(|c| (c as f64 * quantity.abs()) as i64);

        sqlx::query(
            r#"
            INSERT INTO stock_movements (
                id, cafe_id, inventory_item_id, version, created_at, updated_at, deleted_at,
                created_by, updated_by, quantity, previous_qty, new_qty, movement_type,
                reference_type, reference_id, notes, cost_per_unit, total_cost
            ) VALUES (?, ?, ?, 1, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&movement_id)
        .bind(cafe_id)
        .bind(item_id)
        .bind(&now_ts)
        .bind(&now_ts)
        .bind(created_by)
        .bind(created_by)
        .bind(quantity)
        .bind(current_qty)
        .bind(new_qty)
        .bind(movement_type)
        .bind(reference_type)
        .bind(reference_id)
        .bind(notes)
        .bind(cost_per_unit)
        .bind(total_cost)
        .execute(&mut *tx)
        .await?;

        tx.commit().await.map_err(DbError::from)?;

        Ok(StockMovement {
            id: movement_id,
            cafe_id: cafe_id.to_string(),
            inventory_item_id: item_id.to_string(),
            version: 1,
            created_at: now_ts.clone(),
            updated_at: now_ts,
            deleted_at: None,
            created_by: created_by.map(String::from),
            updated_by: created_by.map(String::from),
            quantity,
            previous_qty: current_qty,
            new_qty,
            movement_type: movement_type.to_string(),
            reference_type: reference_type.map(String::from),
            reference_id: reference_id.map(String::from),
            notes: notes.map(String::from),
            cost_per_unit,
            total_cost,
        })
    }

    pub async fn count_by_item(db: &Database, cafe_id: &str, item_id: &str) -> DbResult<i64> {
        let (count,): (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM stock_movements WHERE cafe_id = ? AND inventory_item_id = ? AND deleted_at IS NULL",
        )
        .bind(cafe_id)
        .bind(item_id)
        .fetch_one(&db.pool)
        .await?;
        Ok(count)
    }

    pub async fn soft_delete(db: &Database, id: &str, cafe_id: &str, version: i32) -> DbResult<()> {
        repo_soft_delete(db, Self::TABLE, "StockMovement", id, cafe_id, version).await
    }
}
