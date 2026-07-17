use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use tracing::info;

use crate::db::error::{DbError, DbResult};
use crate::db::repo::{new_id, now, repo_soft_delete};
use crate::db::Database;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct Recipe {
    pub id: String,
    pub cafe_id: String,
    pub version: i32,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
    pub created_by: Option<String>,
    pub updated_by: Option<String>,
    pub product_id: String,
    pub ingredient_id: String,
    pub quantity: f64,
    pub unit: Option<String>,
    pub cost: i64,
    pub sort_order: i32,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewRecipe {
    pub product_id: String,
    pub ingredient_id: String,
    pub quantity: f64,
    pub unit: Option<String>,
    pub cost: Option<i64>,
    pub sort_order: Option<i32>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateRecipe {
    pub id: String,
    pub cafe_id: String,
    pub version: i32,
    pub product_id: String,
    pub ingredient_id: String,
    pub quantity: f64,
    pub unit: Option<String>,
    pub cost: i64,
    pub sort_order: i32,
    pub notes: Option<String>,
    pub updated_by: Option<String>,
}

pub struct RecipeRepo;

impl RecipeRepo {
    const TABLE: &'static str = "recipes";
    const FIELDS: &'static str = r#"
        id, cafe_id, version, created_at, updated_at, deleted_at,
        created_by, updated_by, product_id, ingredient_id, quantity,
        unit, cost, sort_order, notes
    "#;

    pub async fn find_by_id(db: &Database, id: &str, cafe_id: &str) -> DbResult<Option<Recipe>> {
        let sql = format!(
            "SELECT {} FROM {} WHERE id = ? AND cafe_id = ? AND deleted_at IS NULL",
            Self::FIELDS, Self::TABLE
        );
        sqlx::query_as::<_, Recipe>(&sql)
            .bind(id)
            .bind(cafe_id)
            .fetch_optional(&db.pool)
            .await
            .map_err(DbError::from)
    }

    pub async fn find_all(db: &Database, cafe_id: &str) -> DbResult<Vec<Recipe>> {
        let sql = format!(
            "SELECT {} FROM {} WHERE cafe_id = ? AND deleted_at IS NULL ORDER BY product_id, sort_order ASC",
            Self::FIELDS, Self::TABLE
        );
        sqlx::query_as::<_, Recipe>(&sql)
            .bind(cafe_id)
            .fetch_all(&db.pool)
            .await
            .map_err(DbError::from)
    }

    pub async fn find_all_including_deleted(db: &Database, cafe_id: &str) -> DbResult<Vec<Recipe>> {
        let sql = format!(
            "SELECT {} FROM {} WHERE cafe_id = ? ORDER BY product_id, sort_order ASC",
            Self::FIELDS, Self::TABLE
        );
        sqlx::query_as::<_, Recipe>(&sql)
            .bind(cafe_id)
            .fetch_all(&db.pool)
            .await
            .map_err(DbError::from)
    }

    pub async fn find_by_product(db: &Database, cafe_id: &str, product_id: &str) -> DbResult<Vec<Recipe>> {
        let sql = format!(
            "SELECT {} FROM {} WHERE cafe_id = ? AND product_id = ? AND deleted_at IS NULL ORDER BY sort_order ASC",
            Self::FIELDS, Self::TABLE
        );
        sqlx::query_as::<_, Recipe>(&sql)
            .bind(cafe_id)
            .bind(product_id)
            .fetch_all(&db.pool)
            .await
            .map_err(DbError::from)
    }

    pub async fn find_by_ingredient(db: &Database, cafe_id: &str, ingredient_id: &str) -> DbResult<Vec<Recipe>> {
        let sql = format!(
            "SELECT {} FROM {} WHERE cafe_id = ? AND ingredient_id = ? AND deleted_at IS NULL ORDER BY sort_order ASC",
            Self::FIELDS, Self::TABLE
        );
        sqlx::query_as::<_, Recipe>(&sql)
            .bind(cafe_id)
            .bind(ingredient_id)
            .fetch_all(&db.pool)
            .await
            .map_err(DbError::from)
    }

    pub async fn insert(
        db: &Database,
        cafe_id: &str,
        created_by: Option<&str>,
        input: &NewRecipe,
    ) -> DbResult<String> {
        let id = new_id();
        let now_ts = now();
        let cost = input.cost.unwrap_or(0);
        let sort_order = input.sort_order.unwrap_or(0);

        sqlx::query(
            r#"
            INSERT INTO recipes (
                id, cafe_id, version, created_at, updated_at, deleted_at,
                created_by, updated_by, product_id, ingredient_id, quantity,
                unit, cost, sort_order, notes
            ) VALUES (?, ?, 1, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&id)
        .bind(cafe_id)
        .bind(&now_ts)
        .bind(&now_ts)
        .bind(created_by)
        .bind(created_by)
        .bind(&input.product_id)
        .bind(&input.ingredient_id)
        .bind(input.quantity)
        .bind(&input.unit)
        .bind(cost)
        .bind(sort_order)
        .bind(&input.notes)
        .execute(&db.pool)
        .await?;

        info!("recipe created: {} <-> {} ({})", input.product_id, input.ingredient_id, id);
        Ok(id)
    }

    pub async fn update(db: &Database, input: &UpdateRecipe) -> DbResult<()> {
        let now_ts = now();
        let sql = format!(
            r#"
            UPDATE {} SET
                product_id = ?, ingredient_id = ?, quantity = ?, unit = ?,
                cost = ?, sort_order = ?, notes = ?,
                version = version + 1, updated_at = ?, updated_by = ?
            WHERE id = ? AND cafe_id = ? AND version = ? AND deleted_at IS NULL
            "#,
            Self::TABLE
        );
        let result = sqlx::query(&sql)
            .bind(&input.product_id)
            .bind(&input.ingredient_id)
            .bind(input.quantity)
            .bind(&input.unit)
            .bind(input.cost)
            .bind(input.sort_order)
            .bind(&input.notes)
            .bind(&now_ts)
            .bind(&input.updated_by)
            .bind(&input.id)
            .bind(&input.cafe_id)
            .bind(input.version)
            .execute(&db.pool)
            .await?;

        if result.rows_affected() == 0 {
            return Err(DbError::OptimisticLock("Recipe".into(), input.id.clone()));
        }
        Ok(())
    }

    pub async fn soft_delete(db: &Database, id: &str, cafe_id: &str, version: i32) -> DbResult<()> {
        repo_soft_delete(db, Self::TABLE, "Recipe", id, cafe_id, version).await
    }

    pub async fn hard_delete(db: &Database, id: &str, cafe_id: &str) -> DbResult<()> {
        sqlx::query("DELETE FROM recipes WHERE id = ? AND cafe_id = ?")
            .bind(id)
            .bind(cafe_id)
            .execute(&db.pool)
            .await?;
        Ok(())
    }

    pub async fn exists(db: &Database, id: &str, cafe_id: &str) -> DbResult<bool> {
        let row: Option<(i32,)> = sqlx::query_as(
            "SELECT 1 FROM recipes WHERE id = ? AND cafe_id = ? AND deleted_at IS NULL",
        )
        .bind(id)
        .bind(cafe_id)
        .fetch_optional(&db.pool)
        .await?;
        Ok(row.is_some())
    }

    pub async fn count_by_product(db: &Database, cafe_id: &str, product_id: &str) -> DbResult<i64> {
        let (count,): (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM recipes WHERE cafe_id = ? AND product_id = ? AND deleted_at IS NULL",
        )
        .bind(cafe_id)
        .bind(product_id)
        .fetch_one(&db.pool)
        .await?;
        Ok(count)
    }

    pub async fn delete_by_product(
        db: &Database,
        cafe_id: &str,
        product_id: &str,
        created_by: Option<&str>,
    ) -> DbResult<u64> {
        let now_ts = now();
        let result = sqlx::query(
            "UPDATE recipes SET deleted_at = ?, updated_at = ?, updated_by = ? WHERE cafe_id = ? AND product_id = ? AND deleted_at IS NULL",
        )
        .bind(&now_ts)
        .bind(&now_ts)
        .bind(created_by)
        .bind(cafe_id)
        .bind(product_id)
        .execute(&db.pool)
        .await?;
        Ok(result.rows_affected())
    }

    pub async fn find_by_product_name(db: &Database, cafe_id: &str, product_name: &str) -> DbResult<Vec<Recipe>> {
        let sql = format!(
            r#"SELECT r.id, r.cafe_id, r.version, r.created_at, r.updated_at, r.deleted_at,
               r.created_by, r.updated_by, r.product_id, r.ingredient_id,
               r.quantity, r.unit, r.cost, r.sort_order, r.notes
               FROM recipes r
               JOIN products p ON p.id = r.product_id
               WHERE r.cafe_id = ? AND p.name LIKE ? AND r.deleted_at IS NULL
               LIMIT 20"#,
        );
        let pattern = format!("%{}%", product_name);
        sqlx::query_as::<_, Recipe>(&sql)
            .bind(cafe_id)
            .bind(&pattern)
            .fetch_all(&db.pool)
            .await
            .map_err(DbError::from)
    }

    pub async fn delete_by_ingredient(
        db: &Database,
        cafe_id: &str,
        ingredient_id: &str,
        created_by: Option<&str>,
    ) -> DbResult<u64> {
        let now_ts = now();
        let result = sqlx::query(
            "UPDATE recipes SET deleted_at = ?, updated_at = ?, updated_by = ? WHERE cafe_id = ? AND ingredient_id = ? AND deleted_at IS NULL",
        )
        .bind(&now_ts)
        .bind(&now_ts)
        .bind(created_by)
        .bind(cafe_id)
        .bind(ingredient_id)
        .execute(&db.pool)
        .await?;
        Ok(result.rows_affected())
    }
}
