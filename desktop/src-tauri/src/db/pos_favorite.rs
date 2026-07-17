use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use tracing::info;

use crate::db::error::DbResult;
use crate::db::repo::{new_id, now};
use crate::db::Database;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct PosFavorite {
    pub id: String,
    pub cafe_id: String,
    pub staff_id: String,
    pub product_id: String,
    pub sort_order: i64,
    pub created_at: String,
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FavoriteWithProduct {
    pub id: String,
    pub product_id: String,
    pub product_name: String,
    pub product_price: i64,
    pub product_barcode: Option<String>,
    pub product_category_id: Option<String>,
    pub product_active: i32,
    pub sort_order: i64,
}

pub struct PosFavoriteRepo;

impl PosFavoriteRepo {
    pub async fn find_by_staff(db: &Database, cafe_id: &str, staff_id: &str) -> DbResult<Vec<FavoriteWithProduct>> {
        let rows = sqlx::query_as::<_, FavoriteWithProduct>(
            r#"
            SELECT f.id, f.product_id, p.name AS product_name, p.price AS product_price,
                   p.barcode AS product_barcode, p.category_id AS product_category_id,
                   p.active AS product_active, f.sort_order
            FROM pos_favorites f
            JOIN products p ON p.id = f.product_id
            WHERE f.cafe_id = ? AND f.staff_id = ? AND p.deleted_at IS NULL AND p.active = 1
            ORDER BY f.sort_order ASC, f.created_at DESC
            "#,
        )
        .bind(cafe_id)
        .bind(staff_id)
        .fetch_all(&db.pool)
        .await?;
        Ok(rows)
    }

    pub async fn is_favorite(db: &Database, cafe_id: &str, staff_id: &str, product_id: &str) -> DbResult<bool> {
        let row: Option<(i32,)> = sqlx::query_as(
            "SELECT 1 FROM pos_favorites WHERE cafe_id = ? AND staff_id = ? AND product_id = ?",
        )
        .bind(cafe_id)
        .bind(staff_id)
        .bind(product_id)
        .fetch_optional(&db.pool)
        .await?;
        Ok(row.is_some())
    }

    pub async fn toggle(db: &Database, cafe_id: &str, staff_id: &str, product_id: &str) -> DbResult<bool> {
        let exists = Self::is_favorite(db, cafe_id, staff_id, product_id).await?;
        if exists {
            sqlx::query("DELETE FROM pos_favorites WHERE cafe_id = ? AND staff_id = ? AND product_id = ?")
                .bind(cafe_id)
                .bind(staff_id)
                .bind(product_id)
                .execute(&db.pool)
                .await?;
            info!("favorite removed: product={} staff={}", product_id, staff_id);
            Ok(false)
        } else {
            let id = new_id();
            let now_ts = now();
            sqlx::query(
                "INSERT INTO pos_favorites (id, cafe_id, staff_id, product_id, sort_order, created_at) VALUES (?, ?, ?, ?, 0, ?)",
            )
            .bind(&id)
            .bind(cafe_id)
            .bind(staff_id)
            .bind(product_id)
            .bind(&now_ts)
            .execute(&db.pool)
            .await?;
            info!("favorite added: product={} staff={}", product_id, staff_id);
            Ok(true)
        }
    }
}
