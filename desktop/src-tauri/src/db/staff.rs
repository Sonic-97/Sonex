use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use tracing::info;

use crate::db::error::{DbError, DbResult};
use crate::db::repo::{new_id, now, repo_soft_delete};
use crate::db::Database;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct Staff {
    pub id: String,
    pub cafe_id: String,
    pub branch_id: Option<String>,
    pub version: i32,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
    pub created_by: Option<String>,
    pub updated_by: Option<String>,
    pub name: String,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub role: String,
    pub login_code: Option<String>,
    pub password_hash: Option<String>,
    pub pin_code: Option<String>,
    pub active: i32,
    pub hourly_wage: Option<i64>,
    pub salary_type: Option<String>,
    pub avatar_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewStaff {
    pub branch_id: Option<String>,
    pub name: String,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub role: Option<String>,
    pub login_code: Option<String>,
    pub password_hash: Option<String>,
    pub pin_code: Option<String>,
    pub active: Option<i32>,
    pub hourly_wage: Option<i64>,
    pub salary_type: Option<String>,
    pub avatar_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateStaff {
    pub id: String,
    pub cafe_id: String,
    pub version: i32,
    pub branch_id: Option<String>,
    pub name: String,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub role: String,
    pub login_code: Option<String>,
    pub password_hash: Option<String>,
    pub pin_code: Option<String>,
    pub active: i32,
    pub hourly_wage: Option<i64>,
    pub salary_type: Option<String>,
    pub avatar_url: Option<String>,
    pub updated_by: Option<String>,
}

pub struct StaffRepo;

impl StaffRepo {
    const TABLE: &'static str = "staff";
    const FIELDS: &'static str = r#"
        id, cafe_id, branch_id, version, created_at, updated_at, deleted_at,
        created_by, updated_by, name, phone, email, role, login_code,
        password_hash, pin_code, active, hourly_wage, salary_type, avatar_url
    "#;

    pub async fn find_by_id(db: &Database, id: &str, cafe_id: &str) -> DbResult<Option<Staff>> {
        let sql = format!(
            "SELECT {} FROM {} WHERE id = ? AND cafe_id = ? AND deleted_at IS NULL",
            Self::FIELDS, Self::TABLE
        );
        sqlx::query_as::<_, Staff>(&sql)
            .bind(id)
            .bind(cafe_id)
            .fetch_optional(&db.pool)
            .await
            .map_err(DbError::from)
    }

    pub async fn find_all(db: &Database, cafe_id: &str) -> DbResult<Vec<Staff>> {
        let sql = format!(
            "SELECT {} FROM {} WHERE cafe_id = ? AND deleted_at IS NULL ORDER BY name ASC",
            Self::FIELDS, Self::TABLE
        );
        sqlx::query_as::<_, Staff>(&sql)
            .bind(cafe_id)
            .fetch_all(&db.pool)
            .await
            .map_err(DbError::from)
    }

    pub async fn find_all_including_deleted(db: &Database, cafe_id: &str) -> DbResult<Vec<Staff>> {
        let sql = format!(
            "SELECT {} FROM {} WHERE cafe_id = ? ORDER BY name ASC",
            Self::FIELDS, Self::TABLE
        );
        sqlx::query_as::<_, Staff>(&sql)
            .bind(cafe_id)
            .fetch_all(&db.pool)
            .await
            .map_err(DbError::from)
    }

    pub async fn find_active(db: &Database, cafe_id: &str) -> DbResult<Vec<Staff>> {
        let sql = format!(
            "SELECT {} FROM {} WHERE cafe_id = ? AND active = 1 AND deleted_at IS NULL ORDER BY name ASC",
            Self::FIELDS, Self::TABLE
        );
        sqlx::query_as::<_, Staff>(&sql)
            .bind(cafe_id)
            .fetch_all(&db.pool)
            .await
            .map_err(DbError::from)
    }

    pub async fn find_by_role(db: &Database, cafe_id: &str, role: &str) -> DbResult<Vec<Staff>> {
        let sql = format!(
            "SELECT {} FROM {} WHERE cafe_id = ? AND role = ? AND deleted_at IS NULL ORDER BY name ASC",
            Self::FIELDS, Self::TABLE
        );
        sqlx::query_as::<_, Staff>(&sql)
            .bind(cafe_id)
            .bind(role)
            .fetch_all(&db.pool)
            .await
            .map_err(DbError::from)
    }

    pub async fn find_by_login_code(db: &Database, cafe_id: &str, login_code: &str) -> DbResult<Option<Staff>> {
        let sql = format!(
            "SELECT {} FROM {} WHERE cafe_id = ? AND login_code = ? AND deleted_at IS NULL",
            Self::FIELDS, Self::TABLE
        );
        sqlx::query_as::<_, Staff>(&sql)
            .bind(cafe_id)
            .bind(login_code)
            .fetch_optional(&db.pool)
            .await
            .map_err(DbError::from)
    }

    pub async fn find_by_phone(db: &Database, cafe_id: &str, phone: &str) -> DbResult<Option<Staff>> {
        let sql = format!(
            "SELECT {} FROM {} WHERE cafe_id = ? AND phone = ? AND deleted_at IS NULL",
            Self::FIELDS, Self::TABLE
        );
        sqlx::query_as::<_, Staff>(&sql)
            .bind(cafe_id)
            .bind(phone)
            .fetch_optional(&db.pool)
            .await
            .map_err(DbError::from)
    }

    pub async fn find_by_branch(db: &Database, cafe_id: &str, branch_id: &str) -> DbResult<Vec<Staff>> {
        let sql = format!(
            "SELECT {} FROM {} WHERE cafe_id = ? AND branch_id = ? AND deleted_at IS NULL ORDER BY name ASC",
            Self::FIELDS, Self::TABLE
        );
        sqlx::query_as::<_, Staff>(&sql)
            .bind(cafe_id)
            .bind(branch_id)
            .fetch_all(&db.pool)
            .await
            .map_err(DbError::from)
    }

    pub async fn insert(
        db: &Database,
        cafe_id: &str,
        created_by: Option<&str>,
        input: &NewStaff,
    ) -> DbResult<String> {
        let id = new_id();
        let now_ts = now();
        let role = input.role.clone().unwrap_or_else(|| "BARISTA".to_string());
        let active = input.active.unwrap_or(1);
        let salary_type = input.salary_type.clone().unwrap_or_else(|| "MONTHLY".to_string());

        sqlx::query(
            r#"
            INSERT INTO staff (
                id, cafe_id, branch_id, version, created_at, updated_at, deleted_at,
                created_by, updated_by, name, phone, email, role, login_code,
                password_hash, pin_code, active, hourly_wage, salary_type, avatar_url
            ) VALUES (?, ?, ?, 1, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&id)
        .bind(cafe_id)
        .bind(&input.branch_id)
        .bind(&now_ts)
        .bind(&now_ts)
        .bind(created_by)
        .bind(created_by)
        .bind(&input.name)
        .bind(&input.phone)
        .bind(&input.email)
        .bind(&role)
        .bind(&input.login_code)
        .bind(&input.password_hash)
        .bind(&input.pin_code)
        .bind(active)
        .bind(input.hourly_wage)
        .bind(&salary_type)
        .bind(&input.avatar_url)
        .execute(&db.pool)
        .await?;

        info!("staff created: {} ({})", input.name, id);
        Ok(id)
    }

    pub async fn update(db: &Database, input: &UpdateStaff) -> DbResult<()> {
        let now_ts = now();
        let sql = format!(
            r#"
            UPDATE {} SET
                branch_id = ?, name = ?, phone = ?, email = ?, role = ?,
                login_code = ?, password_hash = ?, pin_code = ?, active = ?,
                hourly_wage = ?, salary_type = ?, avatar_url = ?,
                version = version + 1, updated_at = ?, updated_by = ?
            WHERE id = ? AND cafe_id = ? AND version = ? AND deleted_at IS NULL
            "#,
            Self::TABLE
        );
        let result = sqlx::query(&sql)
            .bind(&input.branch_id)
            .bind(&input.name)
            .bind(&input.phone)
            .bind(&input.email)
            .bind(&input.role)
            .bind(&input.login_code)
            .bind(&input.password_hash)
            .bind(&input.pin_code)
            .bind(input.active)
            .bind(input.hourly_wage)
            .bind(&input.salary_type)
            .bind(&input.avatar_url)
            .bind(&now_ts)
            .bind(&input.updated_by)
            .bind(&input.id)
            .bind(&input.cafe_id)
            .bind(input.version)
            .execute(&db.pool)
            .await?;

        if result.rows_affected() == 0 {
            return Err(DbError::OptimisticLock("Staff".into(), input.id.clone()));
        }
        Ok(())
    }

    pub async fn set_password(
        db: &Database,
        id: &str,
        cafe_id: &str,
        version: i32,
        password_hash: &str,
    ) -> DbResult<()> {
        let now_ts = now();
        let result = sqlx::query(
            "UPDATE staff SET password_hash = ?, version = version + 1, updated_at = ? WHERE id = ? AND cafe_id = ? AND version = ? AND deleted_at IS NULL",
        )
        .bind(password_hash)
        .bind(&now_ts)
        .bind(id)
        .bind(cafe_id)
        .bind(version)
        .execute(&db.pool)
        .await?;

        if result.rows_affected() == 0 {
            return Err(DbError::OptimisticLock("Staff".into(), id.into()));
        }
        Ok(())
    }

    pub async fn soft_delete(db: &Database, id: &str, cafe_id: &str, version: i32) -> DbResult<()> {
        repo_soft_delete(db, Self::TABLE, "Staff", id, cafe_id, version).await
    }

    pub async fn hard_delete(db: &Database, id: &str, cafe_id: &str) -> DbResult<()> {
        sqlx::query("DELETE FROM staff WHERE id = ? AND cafe_id = ?")
            .bind(id)
            .bind(cafe_id)
            .execute(&db.pool)
            .await?;
        Ok(())
    }

    pub async fn exists(db: &Database, id: &str, cafe_id: &str) -> DbResult<bool> {
        let row: Option<(i32,)> = sqlx::query_as(
            "SELECT 1 FROM staff WHERE id = ? AND cafe_id = ? AND deleted_at IS NULL",
        )
        .bind(id)
        .bind(cafe_id)
        .fetch_optional(&db.pool)
        .await?;
        Ok(row.is_some())
    }

    pub async fn count(db: &Database, cafe_id: &str) -> DbResult<i64> {
        let (count,): (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM staff WHERE cafe_id = ? AND deleted_at IS NULL",
        )
        .bind(cafe_id)
        .fetch_one(&db.pool)
        .await?;
        Ok(count)
    }

    pub async fn count_by_role(db: &Database, cafe_id: &str, role: &str) -> DbResult<i64> {
        let (count,): (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM staff WHERE cafe_id = ? AND role = ? AND deleted_at IS NULL",
        )
        .bind(cafe_id)
        .bind(role)
        .fetch_one(&db.pool)
        .await?;
        Ok(count)
    }

    pub async fn count_active(db: &Database, cafe_id: &str) -> DbResult<i64> {
        let (count,): (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM staff WHERE cafe_id = ? AND active = 1 AND deleted_at IS NULL",
        )
        .bind(cafe_id)
        .fetch_one(&db.pool)
        .await?;
        Ok(count)
    }
}
