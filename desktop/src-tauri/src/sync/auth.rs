use base64::Engine;
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

/// JWT authentication manager for cloud sync.
pub struct SyncAuth {
    _secret: String,
    cafe_id: String,
    token: Option<String>,
    expires_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncCredentials {
    pub cafe_id: String,
    pub owner_code: String,
    pub password: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthResponse {
    pub token: String,
    pub expires_at: u64,
    pub cafe_name: String,
    pub cloud_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthToken {
    pub sub: String,
    pub cafe_id: String,
    pub exp: u64,
    pub iat: u64,
    pub role: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthConfig {
    pub cloud_url: String,
    pub cafe_id: String,
    pub owner_code: String,
    pub password: String,
    pub token: Option<String>,
}

impl SyncAuth {
    pub fn new(cafe_id: &str, _secret: &str) -> Self {
        Self {
            _secret: _secret.to_string(),
            cafe_id: cafe_id.to_string(),
            token: None,
            expires_at: 0,
        }
    }

    pub fn is_authenticated(&self) -> bool {
        self.token.is_some() && !self.is_expired()
    }

    pub fn get_token(&self) -> Option<&str> {
        if self.is_expired() {
            return None;
        }
        self.token.as_deref()
    }

    pub fn is_expired(&self) -> bool {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        now >= self.expires_at
    }

    pub fn set_token(&mut self, token: String, expires_at: u64) {
        self.token = Some(token);
        self.expires_at = expires_at;
    }

    pub fn clear(&mut self) {
        self.token = None;
        self.expires_at = 0;
    }

    pub fn generate_mock_token(cafe_id: &str) -> String {
        let engine = base64::engine::general_purpose::URL_SAFE_NO_PAD;
        let header = engine.encode(b"{\"alg\":\"HS256\",\"typ\":\"JWT\"}");
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        let payload = serde_json::json!({
            "sub": cafe_id,
            "cafe_id": cafe_id,
            "exp": now + 86400,
            "iat": now,
            "role": "OWNER",
        });
        let payload_b64 = engine.encode(payload.to_string().as_bytes());
        format!("{}.{}.mock_signature", header, payload_b64)
    }

    pub fn decode_mock_token(token: &str) -> Option<AuthToken> {
        let parts: Vec<&str> = token.split('.').collect();
        if parts.len() != 3 {
            return None;
        }
        let engine = base64::engine::general_purpose::URL_SAFE_NO_PAD;
        let payload_bytes = engine.decode(parts[1]).ok()?;
        serde_json::from_slice::<AuthToken>(&payload_bytes).ok()
    }

    pub fn authenticate_mock(credentials: &SyncCredentials) -> Option<AuthResponse> {
        if credentials.owner_code.is_empty() || credentials.password.is_empty() {
            return None;
        }
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        let expires_at = now + 86400;
        Some(AuthResponse {
            token: Self::generate_mock_token(&credentials.cafe_id),
            expires_at,
            cafe_name: format!("Cafe {}", credentials.cafe_id),
            cloud_url: "http://localhost:5112/api/cloud".to_string(),
        })
    }
}
