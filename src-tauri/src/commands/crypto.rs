use rusqlite::Connection;
use serde::Serialize;

use crate::crypto::{self, CryptoState};
use crate::db::Database;

const HASH_SETTING: &str = "crypto.password_hash";
const SALT_SETTING: &str = "crypto.kdf_salt";
const MIN_PASSWORD_LEN: usize = 4;

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

    put_setting(&tx, HASH_SETTING, &new_hash)?;
    put_setting(&tx, SALT_SETTING, &crypto::encode_salt(&new_salt))?;
    tx.commit()
        .map_err(|e| format!("failed to commit password change: {e}"))?;

    crypto.set_key(Some(new_key));
    build_status(&conn, crypto.inner())
}
