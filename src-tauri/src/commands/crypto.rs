use rusqlite::Connection;
use serde::Serialize;

use crate::crypto::{self, CryptoState};
use crate::db::Database;

const HASH_SETTING: &str = "crypto.password_hash";
const SALT_SETTING: &str = "crypto.kdf_salt";
const MIN_PASSWORD_LEN: usize = 4;

struct FolderProtectionRow {
    password_hash: String,
    kdf_salt: String,
    wrapped_key_master: Option<String>,
    wrapped_key_folder: String,
}

fn folder_protection_row(conn: &Connection, folder_id: i64) -> Result<FolderProtectionRow, String> {
    conn.query_row(
        "SELECT password_hash, kdf_salt, wrapped_key_master, wrapped_key_folder
         FROM folders WHERE id = ?1 AND is_protected = 1",
        [folder_id],
        |row| {
            Ok(FolderProtectionRow {
                password_hash: row.get(0)?,
                kdf_salt: row.get(1)?,
                wrapped_key_master: row.get(2)?,
                wrapped_key_folder: row.get(3)?,
            })
        },
    )
    .map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => format!("folder {folder_id} is not protected"),
        other => format!("failed to load folder {folder_id}: {other}"),
    })
}

/// Derives the folder data key from either its folder password or the master
/// password — whichever matches. Returns (folder_key, master_key_if_matched).
fn unlock_folder_key(
    conn: &Connection,
    folder_id: i64,
    password: &str,
) -> Result<([u8; crypto::KEY_LEN], Option<[u8; crypto::KEY_LEN]>), String> {
    let row = folder_protection_row(conn, folder_id)?;
    if crypto::verify_password(password, &row.password_hash) {
        let salt = crypto::decode_salt(&row.kdf_salt)?;
        let kek = crypto::derive_key(password, &salt)?;
        let key = crypto::unwrap_key(&kek, &row.wrapped_key_folder)
            .map_err(|e| format!("folder key is corrupt: {e}"))?;
        return Ok((key, None));
    }
    if let Some(master_hash) = get_setting(conn, HASH_SETTING)? {
        if crypto::verify_password(password, &master_hash) {
            let wrapped = row.wrapped_key_master.ok_or_else(|| {
                "this folder predates the current master password; use the folder password"
                    .to_string()
            })?;
            let (_, salt) = stored_credentials(conn)?;
            let master_key = crypto::derive_key(password, &salt)?;
            let key = crypto::unwrap_key(&master_key, &wrapped)
                .map_err(|e| format!("folder key is corrupt: {e}"))?;
            return Ok((key, Some(master_key)));
        }
    }
    Err("incorrect password".to_string())
}

/// Encrypts every non-private note in a folder's subtree with the given key.
fn encrypt_subtree_notes(
    conn: &Connection,
    folder_id: i64,
    key: &[u8; crypto::KEY_LEN],
) -> Result<(), String> {
    let ids = super::notes::subtree_ids(conn, folder_id)?;
    let placeholders = ids.iter().map(|_| "?").collect::<Vec<_>>().join(", ");
    let mut stmt = conn
        .prepare(&format!(
            "SELECT id, title, content FROM notes
             WHERE folder_id IN ({placeholders}) AND is_private = 0"
        ))
        .map_err(|e| format!("failed to prepare subtree encryption: {e}"))?;
    let rows = stmt
        .query_map(rusqlite::params_from_iter(ids.iter()), |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })
        .map_err(|e| format!("failed to read subtree notes: {e}"))?;
    for row in rows {
        let (id, title, content) = row.map_err(|e| format!("failed to read subtree notes: {e}"))?;
        if title.starts_with(crypto::ENC_PREFIX) {
            continue;
        }
        conn.execute(
            "UPDATE notes SET title = ?1, content = ?2 WHERE id = ?3",
            rusqlite::params![
                crypto::encrypt(key, &title)?,
                crypto::encrypt(key, &content)?,
                id
            ],
        )
        .map_err(|e| format!("failed to encrypt note {id}: {e}"))?;
    }
    Ok(())
}

/// Decrypts every non-private note in a folder's subtree with the given key.
fn decrypt_subtree_notes(
    conn: &Connection,
    folder_id: i64,
    key: &[u8; crypto::KEY_LEN],
) -> Result<(), String> {
    let ids = super::notes::subtree_ids(conn, folder_id)?;
    let placeholders = ids.iter().map(|_| "?").collect::<Vec<_>>().join(", ");
    let mut stmt = conn
        .prepare(&format!(
            "SELECT id, title, content FROM notes
             WHERE folder_id IN ({placeholders}) AND is_private = 0"
        ))
        .map_err(|e| format!("failed to prepare subtree decryption: {e}"))?;
    let rows = stmt
        .query_map(rusqlite::params_from_iter(ids.iter()), |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })
        .map_err(|e| format!("failed to read subtree notes: {e}"))?;
    for row in rows {
        let (id, title, content) = row.map_err(|e| format!("failed to read subtree notes: {e}"))?;
        if !title.starts_with(crypto::ENC_PREFIX) {
            continue;
        }
        conn.execute(
            "UPDATE notes SET title = ?1, content = ?2 WHERE id = ?3",
            rusqlite::params![
                crypto::decrypt(key, &title)
                    .map_err(|e| format!("failed to decrypt note {id}: {e}"))?,
                crypto::decrypt(key, &content)
                    .map_err(|e| format!("failed to decrypt note {id}: {e}"))?,
                id
            ],
        )
        .map_err(|e| format!("failed to decrypt note {id}: {e}"))?;
    }
    Ok(())
}

#[tauri::command]
pub fn set_folder_password(
    db: tauri::State<'_, Database>,
    crypto: tauri::State<'_, CryptoState>,
    folder_id: i64,
    password: String,
) -> Result<(), String> {
    validate_password(&password)?;
    let master_key = crypto
        .key()
        .ok_or_else(|| "set up and unlock the master password first".to_string())?;

    let mut conn = db.conn()?;
    let tx = conn
        .transaction()
        .map_err(|e| format!("failed to begin transaction: {e}"))?;

    let is_protected: i64 = tx
        .query_row(
            "SELECT is_protected FROM folders WHERE id = ?1",
            [folder_id],
            |row| row.get(0),
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => format!("folder {folder_id} not found"),
            other => format!("failed to load folder {folder_id}: {other}"),
        })?;
    if is_protected != 0 {
        return Err("folder already has a password".to_string());
    }
    if super::notes::protecting_folder_id(&tx, folder_id)?.is_some() {
        return Err("this folder is already protected by a parent folder".to_string());
    }

    let folder_key = crypto::generate_key();
    let salt = crypto::generate_salt();
    let kek = crypto::derive_key(&password, &salt)?;
    let hash = crypto::hash_password(&password)?;

    encrypt_subtree_notes(&tx, folder_id, &folder_key)?;
    tx.execute(
        "UPDATE folders SET is_protected = 1, password_hash = ?1, kdf_salt = ?2,
                wrapped_key_master = ?3, wrapped_key_folder = ?4
         WHERE id = ?5",
        rusqlite::params![
            hash,
            crypto::encode_salt(&salt),
            crypto::wrap_key(&master_key, &folder_key)?,
            crypto::wrap_key(&kek, &folder_key)?,
            folder_id
        ],
    )
    .map_err(|e| format!("failed to protect folder {folder_id}: {e}"))?;
    tx.commit()
        .map_err(|e| format!("failed to commit folder protection: {e}"))?;

    crypto.set_folder_key(folder_id, folder_key);
    Ok(())
}

#[tauri::command]
pub fn remove_folder_password(
    db: tauri::State<'_, Database>,
    crypto: tauri::State<'_, CryptoState>,
    folder_id: i64,
    password: String,
) -> Result<(), String> {
    let conn0 = db.conn()?;
    let (folder_key, master_key) = unlock_folder_key(&conn0, folder_id, &password)?;
    drop(conn0);
    let mut conn = db.conn()?;
    let tx = conn
        .transaction()
        .map_err(|e| format!("failed to begin transaction: {e}"))?;
    decrypt_subtree_notes(&tx, folder_id, &folder_key)?;
    tx.execute(
        "UPDATE folders SET is_protected = 0, password_hash = NULL, kdf_salt = NULL,
                wrapped_key_master = NULL, wrapped_key_folder = NULL
         WHERE id = ?1",
        [folder_id],
    )
    .map_err(|e| format!("failed to unprotect folder {folder_id}: {e}"))?;
    tx.commit()
        .map_err(|e| format!("failed to commit folder unprotection: {e}"))?;
    if let Some(key) = master_key {
        crypto.set_key(Some(key));
    }
    crypto.remove_folder_key(folder_id);
    Ok(())
}

#[tauri::command]
pub fn change_folder_password(
    db: tauri::State<'_, Database>,
    crypto: tauri::State<'_, CryptoState>,
    folder_id: i64,
    current_password: String,
    new_password: String,
) -> Result<(), String> {
    validate_password(&new_password)?;
    let conn0 = db.conn()?;
    let (folder_key, master_key) =
        unlock_folder_key(&conn0, folder_id, &current_password)?;
    let conn = db.conn()?;
    let salt = crypto::generate_salt();
    let kek = crypto::derive_key(&new_password, &salt)?;
    conn.execute(
        "UPDATE folders SET password_hash = ?1, kdf_salt = ?2, wrapped_key_folder = ?3
         WHERE id = ?4",
        rusqlite::params![
            crypto::hash_password(&new_password)?,
            crypto::encode_salt(&salt),
            crypto::wrap_key(&kek, &folder_key)?,
            folder_id
        ],
    )
    .map_err(|e| format!("failed to change folder {folder_id} password: {e}"))?;
    if let Some(key) = master_key {
        crypto.set_key(Some(key));
    }
    crypto.set_folder_key(folder_id, folder_key);
    Ok(())
}

#[tauri::command]
pub fn unlock_folder(
    db: tauri::State<'_, Database>,
    crypto: tauri::State<'_, CryptoState>,
    folder_id: i64,
    password: String,
) -> Result<(), String> {
    let conn0 = db.conn()?;
    let (folder_key, master_key) = unlock_folder_key(&conn0, folder_id, &password)?;
    drop(conn0);
    if let Some(key) = master_key {
        crypto.set_key(Some(key));
    }
    crypto.set_folder_key(folder_id, folder_key);
    Ok(())
}

#[tauri::command]
pub fn lock_folder(
    crypto: tauri::State<'_, CryptoState>,
    folder_id: i64,
) -> Result<(), String> {
    crypto.remove_folder_key(folder_id);
    Ok(())
}

/// TESTING ONLY — resets the master password without requiring the old one.
/// If the master key is unlocked this session, everything is re-encrypted
/// safely. If locked, private notes encrypted with the old key stay encrypted
/// (inaccessible) and folders keep working via their own folder passwords.
#[tauri::command]
pub fn reset_master_password(
    db: tauri::State<'_, Database>,
    crypto: tauri::State<'_, CryptoState>,
    new_password: String,
) -> Result<PrivacyStatus, String> {
    validate_password(&new_password)?;
    let new_salt = crypto::generate_salt();
    let new_key = crypto::derive_key(&new_password, &new_salt)?;
    let new_hash = crypto::hash_password(&new_password)?;

    let mut conn = db.conn()?;
    let tx = conn
        .transaction()
        .map_err(|e| format!("failed to begin password reset: {e}"))?;

    if let Some(old_key) = crypto.key() {
        let private_notes: Vec<(i64, String, String)> = {
            let mut stmt = tx
                .prepare("SELECT id, title, content FROM notes WHERE is_private = 1")
                .map_err(|e| format!("failed to load private notes: {e}"))?;
            let rows = stmt
                .query_map([], |row| {
                    Ok((row.get(0)?, row.get(1)?, row.get(2)?))
                })
                .map_err(|e| format!("failed to load private notes: {e}"))?;
            rows.collect::<Result<Vec<_>, _>>()
                .map_err(|e| format!("failed to load private notes: {e}"))?
        };
        for (note_id, title, content) in private_notes {
            let plain_title = crypto::decrypt(&old_key, &title)
                .map_err(|e| format!("failed to decrypt note {note_id}: {e}"))?;
            let plain_content = crypto::decrypt(&old_key, &content)
                .map_err(|e| format!("failed to decrypt note {note_id}: {e}"))?;
            tx.execute(
                "UPDATE notes SET title = ?1, content = ?2 WHERE id = ?3",
                rusqlite::params![
                    crypto::encrypt(&new_key, &plain_title)?,
                    crypto::encrypt(&new_key, &plain_content)?,
                    note_id
                ],
            )
            .map_err(|e| format!("failed to re-encrypt note {note_id}: {e}"))?;
        }

        let wrapped: Vec<(i64, String)> = {
            let mut stmt = tx
                .prepare(
                    "SELECT id, wrapped_key_master FROM folders
                     WHERE is_protected = 1 AND wrapped_key_master IS NOT NULL",
                )
                .map_err(|e| format!("failed to load protected folders: {e}"))?;
            let rows = stmt
                .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
                .map_err(|e| format!("failed to load protected folders: {e}"))?;
            rows.collect::<Result<Vec<_>, _>>()
                .map_err(|e| format!("failed to load protected folders: {e}"))?
        };
        for (folder_id, blob) in wrapped {
            let folder_key = crypto::unwrap_key(&old_key, &blob)
                .map_err(|e| format!("failed to unwrap folder {folder_id} key: {e}"))?;
            tx.execute(
                "UPDATE folders SET wrapped_key_master = ?1 WHERE id = ?2",
                rusqlite::params![crypto::wrap_key(&new_key, &folder_key)?, folder_id],
            )
            .map_err(|e| format!("failed to re-wrap folder {folder_id} key: {e}"))?;
        }
    } else {
        tx.execute(
            "UPDATE folders SET wrapped_key_master = NULL WHERE is_protected = 1",
            [],
        )
        .map_err(|e| format!("failed to detach master-wrapped folder keys: {e}"))?;
    }

    put_setting(&tx, HASH_SETTING, &new_hash)?;
    put_setting(&tx, SALT_SETTING, &crypto::encode_salt(&new_salt))?;
    tx.commit()
        .map_err(|e| format!("failed to commit password reset: {e}"))?;

    crypto.set_key(Some(new_key));
    build_status(&conn, crypto.inner())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrivacyStatus {
    pub password_set: bool,
    pub unlocked: bool,
    pub private_count: i64,
}

fn get_setting(conn: &Connection, key: &str) -> Result<Option<String>, String> {
    conn.query_row("SELECT value FROM settings WHERE key = ?1", [key], |row| {
        row.get(0)
    })
    .map(Some)
    .or_else(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => Ok(None),
        other => Err(format!("failed to read setting '{key}': {other}")),
    })
}

fn put_setting(conn: &Connection, key: &str, value: &str) -> Result<(), String> {
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [key, value],
    )
    .map_err(|e| format!("failed to write setting '{key}': {e}"))?;
    Ok(())
}

fn private_count(conn: &Connection) -> Result<i64, String> {
    conn.query_row(
        "SELECT COUNT(*) FROM notes WHERE is_private = 1",
        [],
        |row| row.get(0),
    )
    .map_err(|e| format!("failed to count private notes: {e}"))
}

fn build_status(conn: &Connection, crypto: &CryptoState) -> Result<PrivacyStatus, String> {
    Ok(PrivacyStatus {
        password_set: get_setting(conn, HASH_SETTING)?.is_some(),
        unlocked: crypto.key().is_some(),
        private_count: private_count(conn)?,
    })
}

fn stored_credentials(conn: &Connection) -> Result<(String, Vec<u8>), String> {
    let hash = get_setting(conn, HASH_SETTING)?.ok_or_else(|| {
        "no master password is set; create one in Settings first".to_string()
    })?;
    let salt = get_setting(conn, SALT_SETTING)
        .and_then(|s| s.ok_or_else(|| "stored encryption salt is missing".to_string()))
        .and_then(|s| crypto::decode_salt(&s))?;
    Ok((hash, salt))
}

fn validate_password(password: &str) -> Result<(), String> {
    if password.chars().count() < MIN_PASSWORD_LEN {
        return Err(format!(
            "password must be at least {MIN_PASSWORD_LEN} characters"
        ));
    }
    Ok(())
}

#[tauri::command]
pub fn get_privacy_status(
    db: tauri::State<'_, Database>,
    crypto: tauri::State<'_, CryptoState>,
) -> Result<PrivacyStatus, String> {
    let conn = db.conn()?;
    build_status(&conn, crypto.inner())
}

#[tauri::command]
pub fn setup_master_password(
    db: tauri::State<'_, Database>,
    crypto: tauri::State<'_, CryptoState>,
    password: String,
) -> Result<PrivacyStatus, String> {
    validate_password(&password)?;
    let conn = db.conn()?;
    if get_setting(&conn, HASH_SETTING)?.is_some() {
        return Err("a master password is already set".to_string());
    }
    let hash = crypto::hash_password(&password)?;
    let salt = crypto::generate_salt();
    put_setting(&conn, HASH_SETTING, &hash)?;
    put_setting(&conn, SALT_SETTING, &crypto::encode_salt(&salt))?;
    let key = crypto::derive_key(&password, &salt)?;
    crypto.set_key(Some(key));
    build_status(&conn, crypto.inner())
}

#[tauri::command]
pub fn unlock_private_notes(
    db: tauri::State<'_, Database>,
    crypto: tauri::State<'_, CryptoState>,
    password: String,
) -> Result<PrivacyStatus, String> {
    let conn = db.conn()?;
    let (hash, salt) = stored_credentials(&conn)?;
    if !crypto::verify_password(&password, &hash) {
        return Err("incorrect password".to_string());
    }
    let key = crypto::derive_key(&password, &salt)?;
    crypto.set_key(Some(key));
    build_status(&conn, crypto.inner())
}

#[tauri::command]
pub fn lock_private_notes(
    db: tauri::State<'_, Database>,
    crypto: tauri::State<'_, CryptoState>,
) -> Result<PrivacyStatus, String> {
    crypto.set_key(None);
    let conn = db.conn()?;
    build_status(&conn, crypto.inner())
}

#[tauri::command]
pub fn change_master_password(
    db: tauri::State<'_, Database>,
    crypto: tauri::State<'_, CryptoState>,
    current_password: String,
    new_password: String,
) -> Result<PrivacyStatus, String> {
    validate_password(&new_password)?;
    let mut conn = db.conn()?;
    let (hash, salt) = stored_credentials(&conn)?;
    if !crypto::verify_password(&current_password, &hash) {
        return Err("current password is incorrect".to_string());
    }
    let old_key = crypto::derive_key(&current_password, &salt)?;
    let new_salt = crypto::generate_salt();
    let new_key = crypto::derive_key(&new_password, &new_salt)?;
    let new_hash = crypto::hash_password(&new_password)?;

    let tx = conn
        .transaction()
        .map_err(|e| format!("failed to begin password change: {e}"))?;

    let private_notes: Vec<(i64, String, String)> = {
        let mut stmt = tx
            .prepare("SELECT id, title, content FROM notes WHERE is_private = 1")
            .map_err(|e| format!("failed to load private notes: {e}"))?;
        let rows = stmt
            .query_map([], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?))
            })
            .map_err(|e| format!("failed to load private notes: {e}"))?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("failed to load private notes: {e}"))?
    };

    for (note_id, title, content) in private_notes {
        let plain_title = crypto::decrypt(&old_key, &title)
            .map_err(|e| format!("failed to decrypt note {note_id}: {e}"))?;
        let plain_content = crypto::decrypt(&old_key, &content)
            .map_err(|e| format!("failed to decrypt note {note_id}: {e}"))?;
        let new_title = crypto::encrypt(&new_key, &plain_title)?;
        let new_content = crypto::encrypt(&new_key, &plain_content)?;
        tx.execute(
            "UPDATE notes SET title = ?1, content = ?2 WHERE id = ?3",
            rusqlite::params![new_title, new_content, note_id],
        )
        .map_err(|e| format!("failed to re-encrypt note {note_id}: {e}"))?;
    }

    // Re-wrap every protected folder's master-wrapped key with the new key.
    let wrapped: Vec<(i64, String)> = {
        let mut stmt = tx
            .prepare(
                "SELECT id, wrapped_key_master FROM folders
                 WHERE is_protected = 1 AND wrapped_key_master IS NOT NULL",
            )
            .map_err(|e| format!("failed to load protected folders: {e}"))?;
        let rows = stmt
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
            .map_err(|e| format!("failed to load protected folders: {e}"))?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("failed to load protected folders: {e}"))?
    };
    for (folder_id, blob) in wrapped {
        let folder_key = crypto::unwrap_key(&old_key, &blob)
            .map_err(|e| format!("failed to unwrap folder {folder_id} key: {e}"))?;
        tx.execute(
            "UPDATE folders SET wrapped_key_master = ?1 WHERE id = ?2",
            rusqlite::params![crypto::wrap_key(&new_key, &folder_key)?, folder_id],
        )
        .map_err(|e| format!("failed to re-wrap folder {folder_id} key: {e}"))?;
    }

    put_setting(&tx, HASH_SETTING, &new_hash)?;
    put_setting(&tx, SALT_SETTING, &crypto::encode_salt(&new_salt))?;
    tx.commit()
        .map_err(|e| format!("failed to commit password change: {e}"))?;

    crypto.set_key(Some(new_key));
    build_status(&conn, crypto.inner())
}
