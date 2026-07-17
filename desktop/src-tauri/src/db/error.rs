use thiserror::Error;

#[derive(Error, Debug)]
pub enum DbError {
    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),

    #[error("entity not found: {0}")]
    NotFound(String),

    #[error("optimistic lock conflict: {0} id={1}")]
    OptimisticLock(String, String),

    #[error("validation error: {0}")]
    Validation(String),

    #[error("foreign key violation: {0}")]
    ForeignKey(String),

    #[error("unique constraint violation: {0}")]
    UniqueViolation(String),
}

pub type DbResult<T> = Result<T, DbError>;
