use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use tracing::info;

use crate::db::error::{DbError, DbResult};
use crate::db::repo::{new_id, now, repo_soft_delete};
use crate::db::Database;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModifierGroup {
    pub id: String,
    pub cafe_id: String,
    pub name: String,
    pub min_select: i64,
    pub max_select: i64,
    pub required: i64,
    pub sort_order: i64,
    pub active: i64,
    pub created_at: String,
    pub deleted_at: Option<String>,
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModifierOption {
    pub id: String,
    pub cafe_id: String,
    pub group_id: String,
    pub name: String,
    pub price_adjustment: i64,
    pub sort_order: i64,
    pub active: i64,
    pub created_at: String,
    pub deleted_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModifierGroupWithOptions {
    pub group: ModifierGroup,
    pub options: Vec<ModifierOption>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewModifierGroup {
    pub name: String,
    pub min_select: Option<i64>,
    pub max_select: Option<i64>,
    pub required: Option<i64>,
    pub sort_order: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateModifierGroup {
    pub id: String,
    pub name: Option<String>,
    pub min_select: Option<i64>,
    pub max_select: Option<i64>,
    pub required: Option<i64>,
    pub sort_order: Option<i64>,
    pub active: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewModifierOption {
    pub group_id: String,
    pub name: String,
    pub price_adjustment: Option<i64>,
    pub sort_order: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateModifierOption {
    pub id: String,
    pub name: Option<String>,
    pub price_adjustment: Option<i64>,
    pub sort_order: Option<i64>,
    pub active: Option<i64>,
}

pub struct PosModifierRepo;

impl PosModifierRepo {
    // ─── Groups ────────────────────────────────────────────────

    pub async fn find_groups(db: &Database, cafe_id: &str) -> DbResult<Vec<ModifierGroup>> {
        let sql = "SELECT * FROM pos_modifier_groups WHERE cafe_id = ? AND deleted_at IS NULL ORDER BY sort_order ASC, name ASC";
        sqlx::query_as::<_, ModifierGroup>(sql)
            .bind(cafe_id)
            .fetch_all(&db.pool)
            .await
            .map_err(DbError::from)
    }

    pub async fn find_group(db: &Database, id: &str, cafe_id: &str) -> DbResult<Option<ModifierGroup>> {
        let sql = "SELECT * FROM pos_modifier_groups WHERE id = ? AND cafe_id = ? AND deleted_at IS NULL";
        sqlx::query_as::<_, ModifierGroup>(sql)
            .bind(id)
            .bind(cafe_id)
            .fetch_optional(&db.pool)
            .await
            .map_err(DbError::from)
    }

    pub async fn create_group(db: &Database, cafe_id: &str, input: &NewModifierGroup) -> DbResult<String> {
        let id = new_id();
        sqlx::query(
            r#"
            INSERT INTO pos_modifier_groups (id, cafe_id, name, min_select, max_select, required, sort_order, active)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1)
            "#,
        )
        .bind(&id)
        .bind(cafe_id)
        .bind(&input.name)
        .bind(input.min_select.unwrap_or(0))
        .bind(input.max_select.unwrap_or(1))
        .bind(input.required.unwrap_or(0))
        .bind(input.sort_order.unwrap_or(0))
        .execute(&db.pool)
        .await?;
        info!("modifier group created: {} ({})", input.name, id);
        Ok(id)
    }

    pub async fn update_group(db: &Database, cafe_id: &str, input: &UpdateModifierGroup) -> DbResult<()> {
        let mut parts: Vec<String> = vec!["updated_at = datetime('now')".into()];
        let mut binds: Vec<String> = vec![];
        if let Some(ref v) = input.name { parts.push(format!("name = ?{}", binds.len()+1)); binds.push(v.clone()); }
        if let Some(ref v) = input.min_select { parts.push(format!("min_select = ?{}", binds.len()+1)); binds.push(v.to_string()); }
        if let Some(ref v) = input.max_select { parts.push(format!("max_select = ?{}", binds.len()+1)); binds.push(v.to_string()); }
        if let Some(ref v) = input.required { parts.push(format!("required = ?{}", binds.len()+1)); binds.push(v.to_string()); }
        if let Some(ref v) = input.sort_order { parts.push(format!("sort_order = ?{}", binds.len()+1)); binds.push(v.to_string()); }
        if let Some(ref v) = input.active { parts.push(format!("active = ?{}", binds.len()+1)); binds.push(v.to_string()); }

        let sql = format!(
            "UPDATE pos_modifier_groups SET {} WHERE id = ? AND cafe_id = ? AND deleted_at IS NULL",
            parts.join(", ")
        );
        let mut q = sqlx::query(&sql);
        for b in &binds { q = q.bind(b); }
        q = q.bind(&input.id).bind(cafe_id);

        let r = q.execute(&db.pool).await?;
        if r.rows_affected() == 0 {
            return Err(DbError::NotFound(format!("ModifierGroup not found: {}", &input.id)));
        }
        Ok(())
    }

    pub async fn delete_group(db: &Database, id: &str, cafe_id: &str) -> DbResult<()> {
        sqlx::query("UPDATE pos_modifier_groups SET deleted_at = datetime('now') WHERE id = ? AND cafe_id = ?")
            .bind(id)
            .bind(cafe_id)
            .execute(&db.pool)
            .await?;
        Ok(())
    }

    pub async fn get_groups_with_options(db: &Database, cafe_id: &str, product_id: Option<&str>) -> DbResult<Vec<ModifierGroupWithOptions>> {
        let groups = if let Some(pid) = product_id {
            sqlx::query_as::<_, ModifierGroup>(
                r#"
                SELECT g.* FROM pos_modifier_groups g
                JOIN pos_product_modifiers pm ON pm.group_id = g.id
                WHERE g.cafe_id = ? AND pm.product_id = ? AND g.deleted_at IS NULL AND g.active = 1
                ORDER BY g.sort_order ASC, g.name ASC
                "#,
            )
            .bind(cafe_id)
            .bind(pid)
            .fetch_all(&db.pool)
            .await?
        } else {
            Self::find_groups(db, cafe_id).await?
        };

        let mut result = Vec::with_capacity(groups.len());
        for group in groups {
            let options = sqlx::query_as::<_, ModifierOption>(
                "SELECT * FROM pos_modifier_options WHERE group_id = ? AND deleted_at IS NULL AND active = 1 ORDER BY sort_order ASC, name ASC",
            )
            .bind(&group.id)
            .fetch_all(&db.pool)
            .await?;
            result.push(ModifierGroupWithOptions { group, options });
        }
        Ok(result)
    }

    // ─── Options ───────────────────────────────────────────────

    pub async fn create_option(db: &Database, cafe_id: &str, input: &NewModifierOption) -> DbResult<String> {
        let id = new_id();
        // Verify group exists
        let g = Self::find_group(db, &input.group_id, cafe_id).await?;
        if g.is_none() {
            return Err(DbError::NotFound(format!("ModifierGroup not found: {}", &input.group_id)));
        }
        sqlx::query(
            r#"
            INSERT INTO pos_modifier_options (id, cafe_id, group_id, name, price_adjustment, sort_order, active)
            VALUES (?, ?, ?, ?, ?, ?, 1)
            "#,
        )
        .bind(&id)
        .bind(cafe_id)
        .bind(&input.group_id)
        .bind(&input.name)
        .bind(input.price_adjustment.unwrap_or(0))
        .bind(input.sort_order.unwrap_or(0))
        .execute(&db.pool)
        .await?;
        info!("modifier option created: {} ({})", input.name, id);
        Ok(id)
    }

    pub async fn update_option(db: &Database, cafe_id: &str, input: &UpdateModifierOption) -> DbResult<()> {
        let mut parts: Vec<String> = vec!["updated_at = datetime('now')".into()];
        let mut binds: Vec<String> = vec![];
        if let Some(ref v) = input.name { parts.push(format!("name = ?{}", binds.len()+1)); binds.push(v.clone()); }
        if let Some(ref v) = input.price_adjustment { parts.push(format!("price_adjustment = ?{}", binds.len()+1)); binds.push(v.to_string()); }
        if let Some(ref v) = input.sort_order { parts.push(format!("sort_order = ?{}", binds.len()+1)); binds.push(v.to_string()); }
        if let Some(ref v) = input.active { parts.push(format!("active = ?{}", binds.len()+1)); binds.push(v.to_string()); }

        let sql = format!(
            "UPDATE pos_modifier_options SET {} WHERE id = ? AND cafe_id = ? AND deleted_at IS NULL",
            parts.join(", ")
        );
        let mut q = sqlx::query(&sql);
        for b in &binds { q = q.bind(b); }
        q = q.bind(&input.id).bind(cafe_id);

        let r = q.execute(&db.pool).await?;
        if r.rows_affected() == 0 {
            return Err(DbError::NotFound(format!("ModifierOption not found: {}", &input.id)));
        }
        Ok(())
    }

    pub async fn delete_option(db: &Database, id: &str, cafe_id: &str) -> DbResult<()> {
        sqlx::query("UPDATE pos_modifier_options SET deleted_at = datetime('now') WHERE id = ? AND cafe_id = ?")
            .bind(id)
            .bind(cafe_id)
            .execute(&db.pool)
            .await?;
        Ok(())
    }

    // ─── Product-Modifier Links ────────────────────────────────

    pub async fn link_product(db: &Database, product_id: &str, group_id: &str) -> DbResult<()> {
        sqlx::query("INSERT OR IGNORE INTO pos_product_modifiers (product_id, group_id) VALUES (?, ?)")
            .bind(product_id)
            .bind(group_id)
            .execute(&db.pool)
            .await?;
        Ok(())
    }

    pub async fn unlink_product(db: &Database, product_id: &str, group_id: &str) -> DbResult<()> {
        sqlx::query("DELETE FROM pos_product_modifiers WHERE product_id = ? AND group_id = ?")
            .bind(product_id)
            .bind(group_id)
            .execute(&db.pool)
            .await?;
        Ok(())
    }

    pub async fn get_product_group_ids(db: &Database, product_id: &str) -> DbResult<Vec<String>> {
        let rows: Vec<(String,)> = sqlx::query_as(
            "SELECT group_id FROM pos_product_modifiers WHERE product_id = ?",
        )
        .bind(product_id)
        .fetch_all(&db.pool)
        .await?;
        Ok(rows.into_iter().map(|r| r.0).collect())
    }
}
