use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use tracing::info;

use crate::db::error::{DbError, DbResult};
use crate::db::repo::{new_id, now, repo_soft_delete};
use crate::db::Database;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct Expense {
    pub id: String,
    pub cafe_id: String,
    pub branch_id: Option<String>,
    pub version: i32,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
    pub created_by: Option<String>,
    pub updated_by: Option<String>,
    pub category: String,
    pub amount: i64,
    pub description: Option<String>,
    pub expense_date: String,
    pub paid_by: Option<String>,
    pub receipt_url: Option<String>,
    pub approved_by: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewExpense {
    pub branch_id: Option<String>,
    pub category: String,
    pub amount: i64,
    pub description: Option<String>,
    pub expense_date: Option<String>,
    pub paid_by: Option<String>,
    pub receipt_url: Option<String>,
    pub approved_by: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateExpense {
    pub id: String,
    pub cafe_id: String,
    pub version: i32,
    pub branch_id: Option<String>,
    pub category: String,
    pub amount: i64,
    pub description: Option<String>,
    pub expense_date: String,
    pub paid_by: Option<String>,
    pub receipt_url: Option<String>,
    pub approved_by: Option<String>,
    pub notes: Option<String>,
    pub updated_by: Option<String>,
}

pub struct ExpenseRepo;

impl ExpenseRepo {
    const TABLE: &'static str = "expenses";
    const FIELDS: &'static str = r#"
        id, cafe_id, branch_id, version, created_at, updated_at, deleted_at,
        created_by, updated_by, category, amount, description,
        expense_date, paid_by, receipt_url, approved_by, notes
    "#;

    pub async fn find_by_id(db: &Database, id: &str, cafe_id: &str) -> DbResult<Option<Expense>> {
        let sql = format!(
            "SELECT {} FROM {} WHERE id = ? AND cafe_id = ? AND deleted_at IS NULL",
            Self::FIELDS, Self::TABLE
        );
        sqlx::query_as::<_, Expense>(&sql)
            .bind(id)
            .bind(cafe_id)
            .fetch_optional(&db.pool)
            .await
            .map_err(DbError::from)
    }

    pub async fn find_all(db: &Database, cafe_id: &str) -> DbResult<Vec<Expense>> {
        let sql = format!(
            "SELECT {} FROM {} WHERE cafe_id = ? AND deleted_at IS NULL ORDER BY expense_date DESC, created_at DESC",
            Self::FIELDS, Self::TABLE
        );
        sqlx::query_as::<_, Expense>(&sql)
            .bind(cafe_id)
            .fetch_all(&db.pool)
            .await
            .map_err(DbError::from)
    }

    pub async fn find_all_including_deleted(db: &Database, cafe_id: &str) -> DbResult<Vec<Expense>> {
        let sql = format!(
            "SELECT {} FROM {} WHERE cafe_id = ? ORDER BY expense_date DESC, created_at DESC",
            Self::FIELDS, Self::TABLE
        );
        sqlx::query_as::<_, Expense>(&sql)
            .bind(cafe_id)
            .fetch_all(&db.pool)
            .await
            .map_err(DbError::from)
    }

    pub async fn find_by_date_range(
        db: &Database,
        cafe_id: &str,
        from: &str,
        to: &str,
    ) -> DbResult<Vec<Expense>> {
        let sql = format!(
            "SELECT {} FROM {} WHERE cafe_id = ? AND expense_date >= ? AND expense_date <= ? AND deleted_at IS NULL ORDER BY expense_date DESC",
            Self::FIELDS, Self::TABLE
        );
        sqlx::query_as::<_, Expense>(&sql)
            .bind(cafe_id)
            .bind(from)
            .bind(to)
            .fetch_all(&db.pool)
            .await
            .map_err(DbError::from)
    }

    pub async fn find_by_category(
        db: &Database,
        cafe_id: &str,
        category: &str,
    ) -> DbResult<Vec<Expense>> {
        let sql = format!(
            "SELECT {} FROM {} WHERE cafe_id = ? AND category = ? AND deleted_at IS NULL ORDER BY expense_date DESC",
            Self::FIELDS, Self::TABLE
        );
        sqlx::query_as::<_, Expense>(&sql)
            .bind(cafe_id)
            .bind(category)
            .fetch_all(&db.pool)
            .await
            .map_err(DbError::from)
    }

    pub async fn sum_by_category(
        db: &Database,
        cafe_id: &str,
        from: &str,
        to: &str,
    ) -> DbResult<Vec<(String, i64)>> {
        let rows: Vec<(String, i64)> = sqlx::query_as(
            "SELECT category, SUM(amount) FROM expenses WHERE cafe_id = ? AND expense_date >= ? AND expense_date <= ? AND deleted_at IS NULL GROUP BY category ORDER BY SUM(amount) DESC",
        )
        .bind(cafe_id)
        .bind(from)
        .bind(to)
        .fetch_all(&db.pool)
        .await?;
        Ok(rows)
    }

    pub async fn total_by_period(
        db: &Database,
        cafe_id: &str,
        from: &str,
        to: &str,
    ) -> DbResult<i64> {
        let row: Option<(Option<i64>,)> = sqlx::query_as(
            "SELECT SUM(amount) FROM expenses WHERE cafe_id = ? AND expense_date >= ? AND expense_date <= ? AND deleted_at IS NULL",
        )
        .bind(cafe_id)
        .bind(from)
        .bind(to)
        .fetch_optional(&db.pool)
        .await?;
        Ok(row.and_then(|r| r.0).unwrap_or(0))
    }

    pub async fn distinct_categories(db: &Database, cafe_id: &str) -> DbResult<Vec<String>> {
        let rows: Vec<(String,)> = sqlx::query_as(
            "SELECT DISTINCT category FROM expenses WHERE cafe_id = ? AND deleted_at IS NULL ORDER BY category",
        )
        .bind(cafe_id)
        .fetch_all(&db.pool)
        .await?;
        Ok(rows.into_iter().map(|r| r.0).collect())
    }

    pub async fn insert(
        db: &Database,
        cafe_id: &str,
        created_by: Option<&str>,
        input: &NewExpense,
    ) -> DbResult<String> {
        let id = new_id();
        let now_ts = now();
        let expense_date = input
            .expense_date
            .clone()
            .unwrap_or_else(|| chrono::Utc::now().format("%Y-%m-%d").to_string());

        sqlx::query(
            r#"
            INSERT INTO expenses (
                id, cafe_id, branch_id, version, created_at, updated_at, deleted_at,
                created_by, updated_by, category, amount, description,
                expense_date, paid_by, receipt_url, approved_by, notes
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
        .bind(&input.category)
        .bind(input.amount)
        .bind(&input.description)
        .bind(&expense_date)
        .bind(&input.paid_by)
        .bind(&input.receipt_url)
        .bind(&input.approved_by)
        .bind(&input.notes)
        .execute(&db.pool)
        .await?;

        info!("expense created: {} {} ({})", input.category, input.amount, id);
        Ok(id)
    }

    pub async fn update(db: &Database, input: &UpdateExpense) -> DbResult<()> {
        let now_ts = now();
        let sql = format!(
            r#"
            UPDATE {} SET
                branch_id = ?, category = ?, amount = ?, description = ?,
                expense_date = ?, paid_by = ?, receipt_url = ?, approved_by = ?, notes = ?,
                version = version + 1, updated_at = ?, updated_by = ?
            WHERE id = ? AND cafe_id = ? AND version = ? AND deleted_at IS NULL
            "#,
            Self::TABLE
        );
        let result = sqlx::query(&sql)
            .bind(&input.branch_id)
            .bind(&input.category)
            .bind(input.amount)
            .bind(&input.description)
            .bind(&input.expense_date)
            .bind(&input.paid_by)
            .bind(&input.receipt_url)
            .bind(&input.approved_by)
            .bind(&input.notes)
            .bind(&now_ts)
            .bind(&input.updated_by)
            .bind(&input.id)
            .bind(&input.cafe_id)
            .bind(input.version)
            .execute(&db.pool)
            .await?;

        if result.rows_affected() == 0 {
            return Err(DbError::OptimisticLock("Expense".into(), input.id.clone()));
        }
        Ok(())
    }

    pub async fn soft_delete(db: &Database, id: &str, cafe_id: &str, version: i32) -> DbResult<()> {
        repo_soft_delete(db, Self::TABLE, "Expense", id, cafe_id, version).await
    }

    pub async fn hard_delete(db: &Database, id: &str, cafe_id: &str) -> DbResult<()> {
        sqlx::query("DELETE FROM expenses WHERE id = ? AND cafe_id = ?")
            .bind(id)
            .bind(cafe_id)
            .execute(&db.pool)
            .await?;
        Ok(())
    }

    pub async fn exists(db: &Database, id: &str, cafe_id: &str) -> DbResult<bool> {
        let row: Option<(i32,)> = sqlx::query_as(
            "SELECT 1 FROM expenses WHERE id = ? AND cafe_id = ? AND deleted_at IS NULL",
        )
        .bind(id)
        .bind(cafe_id)
        .fetch_optional(&db.pool)
        .await?;
        Ok(row.is_some())
    }

    pub async fn count(db: &Database, cafe_id: &str) -> DbResult<i64> {
        let (count,): (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM expenses WHERE cafe_id = ? AND deleted_at IS NULL",
        )
        .bind(cafe_id)
        .fetch_one(&db.pool)
        .await?;
        Ok(count)
    }
}
