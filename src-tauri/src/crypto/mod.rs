use std::collections::HashMap;
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

/// Session-only encryption keys. Key material never leaves Rust.
/// Holds the master key plus one data key per unlocked protected folder.
pub struct CryptoState {
    master: Mutex<Option<[u8; KEY_LEN]>>,
    folder_keys: Mutex<HashMap<i64, [u8; KEY_LEN]>>,
}

impl CryptoState {
    pub fn new() -> Self {
        Self {
            master: Mutex::new(None),
            folder_keys: Mutex::new(HashMap::new()),
        }
    }

    pub fn key(&self) -> Option<[u8; KEY_LEN]> {
        self.master.lock().ok().and_then(|guard| *guard)
    }

    pub fn set_key(&self, key: Option<[u8; KEY_LEN]>) {
        if let Ok(mut guard) = self.master.lock() {
            *guard = key;
        }
        if key.is_none() {
            self.clear_folder_keys();
        }
    }

    pub fn folder_key(&self, folder_id: i64) -> Option<[u8; KEY_LEN]> {
        self.folder_keys
            .lock()
            .ok()
            .and_then(|guard| guard.get(&folder_id).copied())
    }

    pub fn set_folder_key(&self, folder_id: i64, key: [u8; KEY_LEN]) {
        if let Ok(mut guard) = self.folder_keys.lock() {
            guard.insert(folder_id, key);
        }
    }

    pub fn remove_folder_key(&self, folder_id: i64) {
        if let Ok(mut guard) = self.folder_keys.lock() {
            guard.remove(&folder_id);
        }
    }

    pub fn clear_folder_keys(&self) {
        if let Ok(mut guard) = self.folder_keys.lock() {
            guard.clear();
        }
    }
}

/// Generates a fresh random 256-bit data key (used per protected folder).
pub fn generate_key() -> [u8; KEY_LEN] {
    let mut key = [0u8; KEY_LEN];
    OsRng.fill_bytes(&mut key);
    key
}

/// Encrypts (wraps) a data key with a key-encryption key.
pub fn wrap_key(kek: &[u8; KEY_LEN], data_key: &[u8; KEY_LEN]) -> Result<String, String> {
    let encoded = B64.encode(data_key);
    encrypt(kek, &encoded)
}

/// Decrypts (unwraps) a wrapped data key.
pub fn unwrap_key(kek: &[u8; KEY_LEN], blob: &str) -> Result<[u8; KEY_LEN], String> {
    let encoded = decrypt(kek, blob)?;
    let bytes = B64
        .decode(encoded)
        .map_err(|_| "wrapped key is corrupt".to_string())?;
    if bytes.len() != KEY_LEN {
        return Err("wrapped key has an invalid length".to_string());
    }
    let mut key = [0u8; KEY_LEN];
    key.copy_from_slice(&bytes);
    Ok(key)
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
