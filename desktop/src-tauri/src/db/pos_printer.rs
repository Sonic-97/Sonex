use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use tracing::info;

use crate::db::error::{DbError, DbResult};
use crate::db::repo::new_id;
use crate::db::Database;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Printer {
    pub id: String,
    pub cafe_id: String,
    pub name: String,
    pub printer_type: String,
    pub interface: String,
    pub address: Option<String>,
    pub port: Option<i64>,
    pub paper_width: i64,
    pub chars_per_line: i64,
    pub active: i64,
    pub is_default: i64,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrinterInput {
    pub name: String,
    pub printer_type: Option<String>,
    pub interface: Option<String>,
    pub address: Option<String>,
    pub port: Option<i64>,
    pub paper_width: Option<i64>,
    pub chars_per_line: Option<i64>,
    pub is_default: Option<i64>,
}

pub struct PosPrinterRepo;

impl PosPrinterRepo {
    pub async fn find_all(db: &Database, cafe_id: &str) -> DbResult<Vec<Printer>> {
        sqlx::query_as::<_, Printer>(
            "SELECT * FROM pos_printers WHERE cafe_id = ? ORDER BY is_default DESC, name ASC",
        )
        .bind(cafe_id)
        .fetch_all(&db.pool)
        .await
        .map_err(DbError::from)
    }

    pub async fn find_default(db: &Database, cafe_id: &str) -> DbResult<Option<Printer>> {
        sqlx::query_as::<_, Printer>(
            "SELECT * FROM pos_printers WHERE cafe_id = ? AND active = 1 ORDER BY is_default DESC LIMIT 1",
        )
        .bind(cafe_id)
        .fetch_optional(&db.pool)
        .await
        .map_err(DbError::from)
    }

    pub async fn insert(db: &Database, cafe_id: &str, input: &PrinterInput) -> DbResult<String> {
        let id = new_id();
        let is_def = input.is_default.unwrap_or(0);

        if is_def == 1 {
            sqlx::query("UPDATE pos_printers SET is_default = 0 WHERE cafe_id = ?")
                .bind(cafe_id)
                .execute(&db.pool)
                .await?;
        }

        sqlx::query(
            r#"
            INSERT INTO pos_printers (id, cafe_id, name, printer_type, interface, address, port, paper_width, chars_per_line, active, is_default)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
            "#,
        )
        .bind(&id)
        .bind(cafe_id)
        .bind(&input.name)
        .bind(input.printer_type.as_deref().unwrap_or("thermal"))
        .bind(input.interface.as_deref().unwrap_or("file"))
        .bind(&input.address)
        .bind(input.port)
        .bind(input.paper_width.unwrap_or(80))
        .bind(input.chars_per_line.unwrap_or(42))
        .bind(is_def)
        .execute(&db.pool)
        .await?;

        info!("printer created: {} ({})", input.name, id);
        Ok(id)
    }

    pub async fn delete(db: &Database, id: &str, cafe_id: &str) -> DbResult<()> {
        sqlx::query("DELETE FROM pos_printers WHERE id = ? AND cafe_id = ?")
            .bind(id)
            .bind(cafe_id)
            .execute(&db.pool)
            .await?;
        Ok(())
    }
}
