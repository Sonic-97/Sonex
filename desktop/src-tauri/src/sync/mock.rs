use async_trait::async_trait;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Arc;
use chrono::Utc;
use tokio::sync::RwLock;

use super::auth::{AuthResponse, SyncAuth, SyncCredentials};
use super::encryption::SyncEncryption;
use super::error::SyncError;
use super::types::*;

/// Remote API trait — abstracts the cloud sync server.
#[async_trait]
pub trait RemoteApi: Send + Sync {
    async fn authenticate(&self, credentials: &SyncCredentials) -> Result<AuthResponse, SyncError>;
    async fn upload(&self, cafe_id: &str, branch_id: Option<&str>, item: &SyncQueueItem) -> Result<UploadResponse, SyncError>;
    async fn download(&self, cafe_id: &str, branch_id: Option<&str>, since_version: i64) -> Result<DownloadResponse, SyncError>;
    async fn health(&self) -> Result<bool, SyncError>;
}

/// Internal representation of a remote entity.
#[derive(Debug, Clone)]
struct RemoteEntity {
    entity_type: String,
    entity_id: String,
    cafe_id: String,
    branch_id: Option<String>,
    data: Value,
    version: i64,
    updated_at: String,
    deleted: bool,
}

/// Mock remote server — simulates a cloud sync API in-memory.
/// Supports JWT auth simulation, branch isolation, and encryption.
pub struct MockRemoteApi {
    store: Arc<RwLock<HashMap<String, RemoteEntity>>>,
    version_counter: Arc<RwLock<i64>>,
    should_fail: Arc<RwLock<bool>>,
    simulate_latency_ms: u64,
    fail_count: Arc<RwLock<u32>>,
    fail_after: u32,
    encryption: Arc<RwLock<Option<SyncEncryption>>>,
    tokens: Arc<RwLock<HashMap<String, String>>>,
    auth_enabled: bool,
}

impl MockRemoteApi {
    pub fn new() -> Self {
        Self {
            store: Arc::new(RwLock::new(HashMap::new())),
            version_counter: Arc::new(RwLock::new(0)),
            should_fail: Arc::new(RwLock::new(false)),
            simulate_latency_ms: 0,
            fail_count: Arc::new(RwLock::new(0)),
            fail_after: u32::MAX,
            encryption: Arc::new(RwLock::new(None)),
            tokens: Arc::new(RwLock::new(HashMap::new())),
            auth_enabled: false,
        }
    }

    pub fn with_auth(mut self) -> Self {
        self.auth_enabled = true;
        self
    }

    pub fn with_latency(mut self, ms: u64) -> Self {
        self.simulate_latency_ms = ms;
        self
    }

    pub fn with_fail_after(mut self, n: u32) -> Self {
        self.fail_after = n;
        self
    }

    pub async fn enable_encryption(&self, key: &[u8; 32]) {
        let mut enc = self.encryption.write().await;
        *enc = Some(SyncEncryption::new(key));
    }

    pub async fn seed(&self, entity_type: &str, entity_id: &str, data: Value, deleted: bool) {
        self.seed_with_branch(entity_type, entity_id, None, data, deleted).await;
    }

    pub async fn seed_with_branch(&self, entity_type: &str, entity_id: &str, branch_id: Option<&str>, data: Value, deleted: bool) {
        let key = format!("{}:{}:{}", branch_id.unwrap_or("_global"), entity_type, entity_id);
        let mut counter = self.version_counter.write().await;
        *counter += 1;
        let version = *counter;
        let mut store = self.store.write().await;
        store.insert(key, RemoteEntity {
            entity_type: entity_type.to_string(),
            entity_id: entity_id.to_string(),
            cafe_id: "mock-cafe".to_string(),
            branch_id: branch_id.map(|s| s.to_string()),
            data,
            version,
            updated_at: Utc::now().to_rfc3339(),
            deleted,
        });
    }

    pub async fn exists(&self, entity_type: &str, entity_id: &str) -> bool {
        self.exists_with_branch(entity_type, entity_id, None).await
    }

    pub async fn exists_with_branch(&self, entity_type: &str, entity_id: &str, branch_id: Option<&str>) -> bool {
        let key = format!("{}:{}:{}", branch_id.unwrap_or("_global"), entity_type, entity_id);
        let store = self.store.read().await;
        store.contains_key(&key)
    }

    pub async fn get_version(&self, entity_type: &str, entity_id: &str) -> Option<i64> {
        let key = format!("_global:{}:{}", entity_type, entity_id);
        let store = self.store.read().await;
        store.get(&key).map(|e| e.version)
    }

    pub async fn get_data(&self, entity_type: &str, entity_id: &str) -> Option<Value> {
        let key = format!("_global:{}:{}", entity_type, entity_id);
        let store = self.store.read().await;
        store.get(&key).map(|e| e.data.clone())
    }

    pub async fn clear(&self) {
        let mut store = self.store.write().await;
        store.clear();
        let mut counter = self.version_counter.write().await;
        *counter = 0;
    }

    pub async fn total_entities(&self) -> usize {
        let store = self.store.read().await;
        store.len()
    }

    pub async fn total_entities_by_branch(&self, branch_id: &str) -> usize {
        let store = self.store.read().await;
        store.iter().filter(|(k, _)| k.starts_with(&format!("{}:", branch_id))).count()
    }

    pub async fn validate_token(&self, token: &str) -> Result<String, SyncError> {
        let tokens = self.tokens.read().await;
        for (cafe_id, stored_token) in tokens.iter() {
            if stored_token == token {
                return Ok(cafe_id.clone());
            }
        }
        // Also accept mock-format tokens
        if let Some(auth_token) = SyncAuth::decode_mock_token(token) {
            return Ok(auth_token.cafe_id);
        }
        Err(SyncError::AuthFailed("invalid token".into()))
    }

    fn key(branch_id: Option<&str>, entity_type: &str, entity_id: &str) -> String {
        format!("{}:{}:{}", branch_id.unwrap_or("_global"), entity_type, entity_id)
    }
}

#[async_trait]
impl RemoteApi for MockRemoteApi {
    async fn authenticate(&self, credentials: &SyncCredentials) -> Result<AuthResponse, SyncError> {
        if let Some(response) = SyncAuth::authenticate_mock(credentials) {
            let mut tokens = self.tokens.write().await;
            tokens.insert(credentials.cafe_id.clone(), response.token.clone());
            Ok(response)
        } else {
            Err(SyncError::AuthFailed("invalid credentials".into()))
        }
    }

    async fn upload(&self, cafe_id: &str, branch_id: Option<&str>, item: &SyncQueueItem) -> Result<UploadResponse, SyncError> {
        if self.simulate_latency_ms > 0 {
            tokio::time::sleep(std::time::Duration::from_millis(self.simulate_latency_ms)).await;
        }

        {
            let should_fail = self.should_fail.read().await;
            if *should_fail {
                return Err(SyncError::Remote("simulated remote error".into()));
            }
        }

        {
            let mut count = self.fail_count.write().await;
            if *count >= self.fail_after && self.fail_after != u32::MAX {
                *count += 1;
                return Err(SyncError::Remote(format!("simulated failure after {} calls", *count)));
            }
            *count += 1;
        }

        // Decrypt payload if encryption is enabled
        let raw_payload = {
            let enc = self.encryption.read().await;
            if let Some(ref cipher) = *enc {
                cipher.decrypt(&item.payload).map_err(|e| SyncError::Decryption(e))?
            } else {
                item.payload.clone()
            }
        };

        let local_payload: Value = serde_json::from_str(&raw_payload).unwrap_or(json!({}));
        let key = Self::key(branch_id, &item.entity_type, &item.entity_id);
        let mut store = self.store.write().await;
        let mut counter = self.version_counter.write().await;

        if let Some(existing) = store.get(&key) {
            if existing.version > item.local_version as i64 {
                return Ok(UploadResponse {
                    accepted: false,
                    remote_version: existing.version,
                    conflict: true,
                    remote_payload: Some(existing.data.clone()),
                    message: format!("conflict: remote v{} > local v{}", existing.version, item.local_version),
                });
            }
            *counter += 1;
            let new_version = *counter;
            let ts = Utc::now().to_rfc3339();
            let is_delete = item.operation == "DELETE";
            store.insert(key, RemoteEntity {
                entity_type: item.entity_type.clone(),
                entity_id: item.entity_id.clone(),
                cafe_id: cafe_id.to_string(),
                branch_id: branch_id.map(|s| s.to_string()),
                data: if is_delete { json!({}) } else { local_payload },
                version: new_version,
                updated_at: ts,
                deleted: is_delete,
            });
            Ok(UploadResponse {
                accepted: true,
                remote_version: new_version,
                conflict: false,
                remote_payload: None,
                message: "accepted".into(),
            })
        } else {
            *counter += 1;
            let new_version = *counter;
            let ts = Utc::now().to_rfc3339();
            let is_delete = item.operation == "DELETE";
            store.insert(key, RemoteEntity {
                entity_type: item.entity_type.clone(),
                entity_id: item.entity_id.clone(),
                cafe_id: cafe_id.to_string(),
                branch_id: branch_id.map(|s| s.to_string()),
                data: if is_delete { json!({}) } else { local_payload },
                version: new_version,
                updated_at: ts,
                deleted: is_delete,
            });
            Ok(UploadResponse {
                accepted: true,
                remote_version: new_version,
                conflict: false,
                remote_payload: None,
                message: "created".into(),
            })
        }
    }

    async fn download(&self, cafe_id: &str, branch_id: Option<&str>, since_version: i64) -> Result<DownloadResponse, SyncError> {
        if self.simulate_latency_ms > 0 {
            tokio::time::sleep(std::time::Duration::from_millis(self.simulate_latency_ms)).await;
        }

        let store = self.store.read().await;
        let mut changes = Vec::new();
        let mut last_version = since_version;
        let prefix = format!("{}:", branch_id.unwrap_or("_global"));

        for (key, entity) in store.iter() {
            // Branch isolation: only include entities matching branch or global
            let matches_branch = branch_id.is_none() || key.starts_with(&prefix) || key.starts_with("_global:");
            if !matches_branch {
                continue;
            }
            if entity.version > since_version {
                changes.push(RemoteChange {
                    entity_type: entity.entity_type.clone(),
                    entity_id: entity.entity_id.clone(),
                    operation: if entity.deleted { "DELETE" } else { "UPDATE" }.to_string(),
                    payload: entity.data.clone(),
                    remote_version: entity.version,
                    updated_at: entity.updated_at.clone(),
                    branch_id: entity.branch_id.clone(),
                });
                if entity.version > last_version {
                    last_version = entity.version;
                }
            }
        }

        changes.sort_by(|a, b| a.remote_version.cmp(&b.remote_version));
        const MAX_BATCH: usize = 100;
        let has_more = changes.len() > MAX_BATCH;
        changes.truncate(MAX_BATCH);

        Ok(DownloadResponse {
            changes,
            last_version,
            has_more,
        })
    }

    async fn health(&self) -> Result<bool, SyncError> {
        let should_fail = self.should_fail.read().await;
        Ok(!*should_fail)
    }
}

impl Default for MockRemoteApi {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sync::queue::QueueManager;
    use crate::db::Database;
    use uuid::Uuid;

    fn make_item(entity_type: &str, entity_id: &str, local_version: i32) -> SyncQueueItem {
        SyncQueueItem {
            id: 1,
            entity_type: entity_type.to_string(),
            entity_id: entity_id.to_string(),
            operation: "CREATE".to_string(),
            payload: r#"{"name":"test"}"#.to_string(),
            local_version,
            created_at: Utc::now().to_rfc3339(),
            retry_count: 0,
            max_retries: 5,
            last_error: None,
            status: "pending".to_string(),
            idempotency_key: None,
        }
    }

    #[tokio::test]
    async fn test_upload_new_entity() {
        let api = MockRemoteApi::new();
        let item = make_item("product", "p-123", 1);
        let resp = api.upload("cafe-1", None, &item).await.unwrap();
        assert!(resp.accepted);
        assert!(!resp.conflict);
    }

    #[tokio::test]
    async fn test_download_since_version() {
        let api = MockRemoteApi::new();
        api.seed("product", "p-1", json!({"name":"a"}), false).await;
        api.seed("product", "p-2", json!({"name":"b"}), false).await;
        let resp = api.download("cafe-1", None, 0).await.unwrap();
        assert_eq!(resp.changes.len(), 2);
        let resp2 = api.download("cafe-1", None, resp.last_version).await.unwrap();
        assert_eq!(resp2.changes.len(), 0);
    }

    #[tokio::test]
    async fn test_auth() {
        let api = MockRemoteApi::new().with_auth();
        let creds = SyncCredentials {
            cafe_id: "cafe-1".into(),
            owner_code: "admin".into(),
            password: "pass".into(),
        };
        let resp = api.authenticate(&creds).await.unwrap();
        assert!(!resp.token.is_empty());
        assert!(resp.cloud_url.contains("localhost"));
    }

    #[tokio::test]
    async fn test_branch_isolation() {
        let api = MockRemoteApi::new();
        api.seed_with_branch("product", "p-1", Some("branch-a"), json!({"name":"A"}), false).await;
        api.seed_with_branch("product", "p-2", Some("branch-b"), json!({"name":"B"}), false).await;
        api.seed("product", "p-global", json!({"name":"Global"}), false).await;

        let resp_a = api.download("cafe-1", Some("branch-a"), 0).await.unwrap();
        let types_a: Vec<&str> = resp_a.changes.iter().map(|c| c.entity_id.as_str()).collect();
        assert!(types_a.contains(&"p-1"), "branch-a should see p-1");
        assert!(types_a.contains(&"p-global"), "branch-a should see global");
        assert!(!types_a.contains(&"p-2"), "branch-a should NOT see p-2");
    }

    #[tokio::test]
    async fn test_encrypted_upload() {
        let api = MockRemoteApi::new();
        let key = SyncEncryption::generate_key();
        api.enable_encryption(&key).await;
        let enc = SyncEncryption::new(&key);
        let encrypted_payload = enc.encrypt(r#"{"name":"secret"}"#).unwrap();
        let item = SyncQueueItem {
            id: 1,
            entity_type: "product".to_string(),
            entity_id: "p-secret".to_string(),
            operation: "CREATE".to_string(),
            payload: encrypted_payload,
            local_version: 1,
            created_at: Utc::now().to_rfc3339(),
            retry_count: 0,
            max_retries: 5,
            last_error: None,
            status: "pending".to_string(),
            idempotency_key: None,
        };
        let resp = api.upload("cafe-1", None, &item).await.unwrap();
        assert!(resp.accepted);
        let data = api.get_data("product", "p-secret").await.unwrap();
        assert_eq!(data["name"], "secret");
    }
}
