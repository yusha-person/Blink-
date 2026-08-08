use std::sync::Mutex;

use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use argon2::password_hash::SaltString;
use argon2::{Algorithm, Argon2, Params, PasswordHash, PasswordHasher, PasswordVerifier, Version};
use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use rand::rngs::OsRng;
use rand::RngCore;

pub const ENC_PREFIX: &str = "enc1:";
pub const KEY_LEN: usize = 32;
pub const SALT_LEN: usize = 16;
const NONCE_LEN: usize = 12;

/// Session-only encryption key. Key material never leaves Rust.
pub struct CryptoState(pub Mutex<Option<[u8; KEY_LEN]>>);

impl CryptoState {
    pub fn new() -> Self {
        Self(Mutex::new(None))
    }

    pub fn key(&self) -> Option<[u8; KEY_LEN]> {
        self.0.lock().ok().and_then(|guard| *guard)
    }

    pub fn set_key(&self, key: Option<[u8; KEY_LEN]>) {
        if let Ok(mut guard) = self.0.lock() {
            *guard = key;
        }
    }
}

pub fn hash_password(password: &str) -> Result<String, String> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|hash| hash.to_string())
        .map_err(|e| format!("failed to hash password: {e}"))
}

pub fn verify_password(password: &str, phc: &str) -> bool {
    match PasswordHash::new(phc) {
        Ok(hash) => Argon2::default()
            .verify_password(password.as_bytes(), &hash)
            .is_ok(),
        Err(_) => false,
    }
}

pub fn generate_salt() -> [u8; SALT_LEN] {
    let mut salt = [0u8; SALT_LEN];
    OsRng.fill_bytes(&mut salt);
    salt
}

pub fn derive_key(password: &str, salt: &[u8]) -> Result<[u8; KEY_LEN], String> {
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, Params::default());
    let mut key = [0u8; KEY_LEN];
    argon2
        .hash_password_into(password.as_bytes(), salt, &mut key)
        .map_err(|e| format!("failed to derive encryption key: {e}"))?;
    Ok(key)
}

pub fn encode_salt(salt: &[u8]) -> String {
    B64.encode(salt)
}

pub fn decode_salt(encoded: &str) -> Result<Vec<u8>, String> {
    let salt = B64
        .decode(encoded)
        .map_err(|_| "stored encryption salt is corrupt".to_string())?;
    if salt.len() < SALT_LEN {
        return Err("stored encryption salt is corrupt".to_string());
    }
    Ok(salt)
}

pub fn encrypt(key: &[u8; KEY_LEN], plaintext: &str) -> Result<String, String> {
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|_| "failed to init cipher".to_string())?;
    let mut nonce = [0u8; NONCE_LEN];
    OsRng.fill_bytes(&mut nonce);
    let ciphertext = cipher
        .encrypt(Nonce::from_slice(&nonce), plaintext.as_bytes())
        .map_err(|_| "encryption failed".to_string())?;
    let mut blob = Vec::with_capacity(NONCE_LEN + ciphertext.len());
    blob.extend_from_slice(&nonce);
    blob.extend_from_slice(&ciphertext);
    Ok(format!("{ENC_PREFIX}{}", B64.encode(blob)))
}

pub fn decrypt(key: &[u8; KEY_LEN], blob: &str) -> Result<String, String> {
    let encoded = blob
        .strip_prefix(ENC_PREFIX)
        .ok_or_else(|| "payload is not encrypted".to_string())?;
    let bytes = B64
        .decode(encoded)
        .map_err(|_| "ciphertext encoding is corrupt".to_string())?;
    if bytes.len() <= NONCE_LEN {
        return Err("ciphertext is corrupt".to_string());
    }
    let (nonce, ciphertext) = bytes.split_at(NONCE_LEN);
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|_| "failed to init cipher".to_string())?;
    let plaintext = cipher
        .decrypt(Nonce::from_slice(nonce), ciphertext)
        .map_err(|_| "decryption failed (wrong key or corrupt data)".to_string())?;
    String::from_utf8(plaintext).map_err(|_| "decrypted text is not valid UTF-8".to_string())
}
