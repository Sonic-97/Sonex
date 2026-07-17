use aes_gcm::{
    aead::{Aead, AeadCore, KeyInit, OsRng},
    Aes256Gcm, Nonce,
};
use base64::Engine;

/// AES-256-GCM encryption for sync payloads.
pub struct SyncEncryption {
    cipher: Aes256Gcm,
}

impl SyncEncryption {
    pub fn new(key: &[u8; 32]) -> Self {
        let cipher = Aes256Gcm::new_from_slice(key).expect("valid AES-256 key");
        Self { cipher }
    }

    pub fn from_b64(key_b64: &str) -> Option<Self> {
        let engine = base64::engine::general_purpose::STANDARD;
        let key_bytes = engine.decode(key_b64).ok()?;
        if key_bytes.len() != 32 {
            return None;
        }
        let mut key = [0u8; 32];
        key.copy_from_slice(&key_bytes);
        Some(Self::new(&key))
    }

    pub fn generate_key() -> [u8; 32] {
        Aes256Gcm::generate_key(OsRng).into()
    }

    pub fn generate_key_b64() -> String {
        let engine = base64::engine::general_purpose::STANDARD;
        engine.encode(Self::generate_key())
    }

    /// Encrypt plaintext. Returns base64-encoded ciphertext with nonce prepended.
    pub fn encrypt(&self, plaintext: &str) -> Result<String, String> {
        let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
        let ciphertext = self
            .cipher
            .encrypt(&nonce, plaintext.as_bytes())
            .map_err(|e| format!("encryption failed: {}", e))?;

        let engine = base64::engine::general_purpose::STANDARD;
        let mut combined = nonce.to_vec();
        combined.extend_from_slice(&ciphertext);
        Ok(engine.encode(&combined))
    }

    /// Decrypt base64-encoded ciphertext (with nonce prepended).
    pub fn decrypt(&self, encrypted_b64: &str) -> Result<String, String> {
        let engine = base64::engine::general_purpose::STANDARD;
        let combined = engine
            .decode(encrypted_b64)
            .map_err(|e| format!("base64 decode failed: {}", e))?;

        if combined.len() < 12 {
            return Err("ciphertext too short".into());
        }

        let (nonce_bytes, ciphertext) = combined.split_at(12);
        let nonce = Nonce::from_slice(nonce_bytes);

        let plaintext = self
            .cipher
            .decrypt(nonce, ciphertext)
            .map_err(|e| format!("decryption failed: {}", e))?;

        String::from_utf8(plaintext).map_err(|e| format!("utf8 decode failed: {}", e))
    }
}

/// Generate a deterministic encryption key from a cafe_id + secret.
pub fn derive_encryption_key(cafe_id: &str, secret: &str) -> [u8; 32] {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(cafe_id.as_bytes());
    hasher.update(b":");
    hasher.update(secret.as_bytes());
    let result = hasher.finalize();
    let mut key = [0u8; 32];
    key.copy_from_slice(&result);
    key
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encrypt_decrypt_roundtrip() {
        let key = SyncEncryption::generate_key();
        let enc = SyncEncryption::new(&key);
        let plaintext = r#"{"name":"Test Product","price":1500}"#;
        let encrypted = enc.encrypt(plaintext).unwrap();
        assert_ne!(encrypted, plaintext);
        let decrypted = enc.decrypt(&encrypted).unwrap();
        assert_eq!(decrypted, plaintext);
    }

    #[test]
    fn test_derive_key() {
        let key = derive_encryption_key("cafe-1", "sonic-secret-2026");
        assert_eq!(key.len(), 32);
        let enc = SyncEncryption::new(&key);
        let ct = enc.encrypt("hello sync").unwrap();
        let pt = enc.decrypt(&ct).unwrap();
        assert_eq!(pt, "hello sync");
    }

    #[test]
    fn test_bad_decrypt_fails() {
        let key = SyncEncryption::generate_key();
        let enc = SyncEncryption::new(&key);
        let result = enc.decrypt("invalid-base64!!!");
        assert!(result.is_err());
    }

    #[test]
    fn test_generate_key_b64() {
        let b64 = SyncEncryption::generate_key_b64();
        assert!(!b64.is_empty());
        let engine = base64::engine::general_purpose::STANDARD;
        let decoded = engine.decode(&b64).unwrap();
        assert_eq!(decoded.len(), 32);
    }

    #[test]
    fn test_different_keys_fail() {
        let key1 = SyncEncryption::generate_key();
        let key2 = SyncEncryption::generate_key();
        let enc1 = SyncEncryption::new(&key1);
        let enc2 = SyncEncryption::new(&key2);
        let ct = enc1.encrypt("secret data").unwrap();
        let result = enc2.decrypt(&ct);
        assert!(result.is_err());
    }
}
