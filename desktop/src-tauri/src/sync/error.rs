use thiserror::Error;

#[derive(Error, Debug, Clone)]
pub enum SyncError {
    #[error("network offline")]
    Offline,

    #[error("conflict: {entity_type} {entity_id} local_v{local_version} != remote_v{remote_version}")]
    Conflict {
        entity_type: String,
        entity_id: String,
        local_version: i32,
        remote_version: i32,
    },

    #[error("retry exhausted for {entity_type} {entity_id} after {retries} attempts: {last_error}")]
    RetryExhausted {
        entity_type: String,
        entity_id: String,
        retries: u32,
        last_error: String,
    },

    #[error("remote error: {0}")]
    Remote(String),

    #[error("database error: {0}")]
    Database(String),

    #[error("entity type not supported: {0}")]
    UnsupportedEntity(String),

    #[error("engine not running")]
    NotRunning,

    #[error("engine already running")]
    AlreadyRunning,

    #[error("sync cancelled")]
    Cancelled,

    #[error("duplicate detected: {0}")]
    Duplicate(String),

    #[error("authentication failed: {0}")]
    AuthFailed(String),

    #[error("token expired")]
    TokenExpired,

    #[error("encryption error: {0}")]
    Encryption(String),

    #[error("decryption error: {0}")]
    Decryption(String),

    #[error("branch mismatch: expected {expected}, got {actual}")]
    BranchMismatch { expected: String, actual: String },

    #[error("invalid payload: {0}")]
    InvalidPayload(String),

    #[error("not authenticated")]
    NotAuthenticated,
}

impl From<sqlx::Error> for SyncError {
    fn from(e: sqlx::Error) -> Self {
        Self::Database(e.to_string())
    }
}

impl From<crate::db::error::DbError> for SyncError {
    fn from(e: crate::db::error::DbError) -> Self {
        Self::Database(e.to_string())
    }
}

pub type SyncResult<T> = Result<T, SyncError>;
