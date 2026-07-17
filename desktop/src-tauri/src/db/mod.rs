pub mod branch;
pub mod category;
pub mod customer;
pub mod error;
pub mod expense;
pub mod inventory;
pub mod inventory_category;
pub mod migrations;
pub mod payment;
pub mod pos_audit;
pub mod pos_favorite;
pub mod pos_modifier;
pub mod pos_order;
pub mod pos_printer;
pub mod product;
pub mod recipe;
pub mod repo;
pub mod staff;
pub mod stock_movement;
pub mod supplier;

use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::{SqlitePool, Transaction};
use std::path::PathBuf;
use tracing::info;

use self::error::{DbError, DbResult};

#[derive(Debug, Clone)]
pub struct Database {
    pub pool: SqlitePool,
}

impl Database {
    pub async fn connect(path: &PathBuf) -> Result<Self, sqlx::Error> {
        let db_path = path.join("sonex.db");
        info!("connecting to database: {:?}", db_path);

        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent).ok();
        }

        let connect_opts = SqliteConnectOptions::new()
            .filename(&db_path)
            .create_if_missing(true);

        let pool = SqlitePoolOptions::new()
            .max_connections(4)
            .connect_with(connect_opts)
            .await?;

        sqlx::query("PRAGMA journal_mode=WAL;")
            .execute(&pool)
            .await?;

        sqlx::query("PRAGMA foreign_keys=ON;")
            .execute(&pool)
            .await?;

        sqlx::query("PRAGMA busy_timeout=5000;")
            .execute(&pool)
            .await?;

        info!("database connected");
        Ok(Self { pool })
    }

    pub async fn run_migrations(&self) -> Result<(), sqlx::Error> {
        migrations::run(&self.pool).await
    }

    /// Begin a new SQLite transaction.
    /// Caller must commit or rollback explicitly.
    pub async fn begin(&self) -> Result<Transaction<'_, sqlx::Sqlite>, DbError> {
        self.pool.begin().await.map_err(DbError::from)
    }
}
