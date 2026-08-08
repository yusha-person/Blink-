use chrono::Local;
use rusqlite::{Connection, OptionalExtension};
use serde::Serialize;

use crate::crypto::{self, CryptoState};
use crate::db::Database;

pub const QUICK_NOTES_FOLDER: &str = "Quick Notes";
pub const LOCKED_NOTE_TITLE: &str = "Private note";

fn session_key(crypto: &tauri::State<'_, CryptoState>) -> Option<[u8; crypto::KEY_LEN]> {
    crypto.inner().key()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderEntry {
    pub id: i64,
    pub name: String,
    pub sort_order: i64,
    pub is_system: bool,
    pub note_count: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteSummary {
    pub id: i64,
    pub folder_id: i64,
    pub title: String,
    pub preview: String,
    pub is_favorite: bool,
    pub is_private: bool,
    pub trashed_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub tags: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteDetail {
    pub id: i64,
    pub folder_id: i64,
    pub title: String,
    pub content: String,
    pub is_favorite: bool,
    pub is_private: bool,
    pub trashed_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub tags: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TagEntry {
    pub id: i64,
    pub name: String,
    pub note_count: i64,
}

fn now_local() -> String {
    Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

fn escape_like(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_")
}

fn note_exists(conn: &Connection, note_id: i64) -> Result<(), String> {
    conn.query_row("SELECT 1 FROM notes WHERE id = ?1", [note_id], |_| Ok(()))
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => format!("note {note_id} not found"),
            other => format!("failed to load note {note_id}: {other}"),
        })
}

fn folder_exists(conn: &Connection, folder_id: i64) -> Result<(), String> {
    conn.query_row(
        "SELECT 1 FROM folders WHERE id = ?1",
        [folder_id],
        |_| Ok(()),
    )
    .map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => format!("folder {folder_id} not found"),
        other => format!("failed to load folder {folder_id}: {other}"),
    })
}

const NOTE_COLUMNS: &str =
    "n.id, n.folder_id, n.title, substr(n.content, 1, 200) AS preview,
     n.is_favorite, n.is_private, n.trashed_at, n.created_at, n.updated_at,
     COALESCE(GROUP_CONCAT(t.name), '') AS tags";

fn map_summary(row: &rusqlite::Row<'_>) -> rusqlite::Result<NoteSummary> {
    let tags_raw: String = row.get(9)?;
    Ok(NoteSummary {
        id: row.get(0)?,
        folder_id: row.get(1)?,
        title: row.get(2)?,
        preview: row.get(3)?,
        is_favorite: row.get::<_, i64>(4)? != 0,
        is_private: row.get::<_, i64>(5)? != 0,
        trashed_at: row.get(6)?,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
        tags: if tags_raw.is_empty() {
            Vec::new()
        } else {
            tags_raw.split(',').map(|s| s.to_string()).collect()
        },
    })
}

fn decrypt_summary(
    conn: &Connection,
    note: &mut NoteSummary,
    key: Option<&[u8; crypto::KEY_LEN]>,
) -> Result<(), String> {
    if !note.is_private {
        return Ok(());
    }
    match key {
        None => {
            note.title = LOCKED_NOTE_TITLE.to_string();
            note.preview = String::new();
        }
        Some(key) => {
            note.title = crypto::decrypt(key, &note.title)
                .map_err(|e| format!("failed to decrypt note {} title: {e}", note.id))?;
            let content: String = conn
                .query_row(
                    "SELECT content FROM notes WHERE id = ?1",
                    [note.id],
                    |row| row.get(0),
                )
                .map_err(|e| format!("failed to load note {} content: {e}", note.id))?;
            let plain = crypto::decrypt(key, &content)
                .map_err(|e| format!("failed to decrypt note {} content: {e}", note.id))?;
            note.preview = plain.chars().take(200).collect();
        }
    }
    Ok(())
}

fn query_summaries(
    conn: &Connection,
    where_clause: &str,
    params: &[&dyn rusqlite::ToSql],
    key: Option<&[u8; crypto::KEY_LEN]>,
) -> Result<Vec<NoteSummary>, String> {
    let sql = format!(
        "SELECT {NOTE_COLUMNS}
         FROM notes n
         LEFT JOIN note_tags nt ON nt.note_id = n.id
         LEFT JOIN tags t ON t.id = nt.tag_id
         {where_clause}
         GROUP BY n.id
         ORDER BY n.updated_at DESC, n.id DESC"
    );
    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| format!("failed to prepare notes query: {e}"))?;
    let rows = stmt
        .query_map(params, map_summary)
        .map_err(|e| format!("failed to list notes: {e}"))?;
    let mut notes = rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("failed to list notes: {e}"))?;
    for note in notes.iter_mut() {
        decrypt_summary(conn, note, key)?;
    }
    Ok(notes)
}

fn note_summary(
    conn: &Connection,
    note_id: i64,
    key: Option<&[u8; crypto::KEY_LEN]>,
) -> Result<NoteSummary, String> {
    let sql = format!(
        "SELECT {NOTE_COLUMNS}
         FROM notes n
         LEFT JOIN note_tags nt ON nt.note_id = n.id
         LEFT JOIN tags t ON t.id = nt.tag_id
         WHERE n.id = ?1
         GROUP BY n.id"
    );
    let mut note = conn
        .query_row(&sql, [note_id], map_summary)
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => format!("note {note_id} not found"),
            other => format!("failed to load note {note_id}: {other}"),
        })?;
    decrypt_summary(conn, &mut note, key)?;
    Ok(note)
}

fn note_tags(conn: &Connection, note_id: i64) -> Result<Vec<String>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT t.name FROM tags t
             JOIN note_tags nt ON nt.tag_id = t.id
             WHERE nt.note_id = ?1
             ORDER BY t.name ASC",
        )
        .map_err(|e| format!("failed to prepare tag query: {e}"))?;
    let rows = stmt
        .query_map([note_id], |row| row.get(0))
        .map_err(|e| format!("failed to load note tags: {e}"))?;
    rows.collect::<Result<Vec<String>, _>>()
        .map_err(|e| format!("failed to load note tags: {e}"))
}

fn note_detail(
    conn: &Connection,
    note_id: i64,
    key: Option<&[u8; crypto::KEY_LEN]>,
) -> Result<NoteDetail, String> {
    let mut note = conn
        .query_row(
            "SELECT id, folder_id, title, content, is_favorite, is_private,
                    trashed_at, created_at, updated_at
             FROM notes WHERE id = ?1",
            [note_id],
            |row| {
                Ok(NoteDetail {
                    id: row.get(0)?,
                    folder_id: row.get(1)?,
                    title: row.get(2)?,
                    content: row.get(3)?,
                    is_favorite: row.get::<_, i64>(4)? != 0,
                    is_private: row.get::<_, i64>(5)? != 0,
                    trashed_at: row.get(6)?,
                    created_at: row.get(7)?,
                    updated_at: row.get(8)?,
                    tags: Vec::new(),
                })
            },
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => format!("note {note_id} not found"),
            other => format!("failed to load note {note_id}: {other}"),
        })?;
    if note.is_private {
        match key {
            None => {
                note.title = LOCKED_NOTE_TITLE.to_string();
                note.content = String::new();
            }
            Some(key) => {
                note.title = crypto::decrypt(key, &note.title)
                    .map_err(|e| format!("failed to decrypt note {note_id} title: {e}"))?;
                note.content = crypto::decrypt(key, &note.content)
                    .map_err(|e| format!("failed to decrypt note {note_id} content: {e}"))?;
            }
        }
    }
    Ok(NoteDetail {
        tags: note_tags(conn, note_id)?,
        ..note
    })
}

fn normalize_folder_name(name: &str) -> Result<String, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("folder name cannot be empty".to_string());
    }
    Ok(trimmed.to_string())
}

#[tauri::command]
pub fn list_folders(db: tauri::State<'_, Database>) -> Result<Vec<FolderEntry>, String> {
    let conn = db.conn()?;
    let mut stmt = conn
        .prepare(
            "SELECT f.id, f.name, f.sort_order, f.is_system,
                    (SELECT COUNT(*) FROM notes n
                     WHERE n.folder_id = f.id AND n.trashed_at IS NULL) AS note_count
             FROM folders f
             ORDER BY f.sort_order ASC, f.id ASC",
        )
        .map_err(|e| format!("failed to prepare folder query: {e}"))?;
    let rows = stmt
        .query_map([], |row| {
            Ok(FolderEntry {
                id: row.get(0)?,
                name: row.get(1)?,
                sort_order: row.get(2)?,
                is_system: row.get::<_, i64>(3)? != 0,
                note_count: row.get(4)?,
            })
        })
        .map_err(|e| format!("failed to list folders: {e}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("failed to list folders: {e}"))
}

#[tauri::command]
pub fn create_folder(db: tauri::State<'_, Database>, name: String) -> Result<FolderEntry, String> {
    let name = normalize_folder_name(&name)?;
    let conn = db.conn()?;
    conn.execute(
        "INSERT INTO folders (name, sort_order, is_system)
         VALUES (?1, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM folders), 0)",
        [&name],
    )
    .map_err(|e| match e {
        rusqlite::Error::SqliteFailure(err, _)
            if err.code == rusqlite::ErrorCode::ConstraintViolation =>
        {
            format!("folder '{name}' already exists")
        }
        other => format!("failed to create folder '{name}': {other}"),
    })?;
    let id = conn.last_insert_rowid();
    conn.query_row(
        "SELECT id, name, sort_order, is_system, 0 FROM folders WHERE id = ?1",
        [id],
        |row| {
            Ok(FolderEntry {
                id: row.get(0)?,
                name: row.get(1)?,
                sort_order: row.get(2)?,
                is_system: row.get::<_, i64>(3)? != 0,
                note_count: row.get(4)?,
            })
        },
    )
    .map_err(|e| format!("failed to load created folder: {e}"))
}

#[tauri::command]
pub fn rename_folder(
    db: tauri::State<'_, Database>,
    folder_id: i64,
    name: String,
) -> Result<(), String> {
    let name = normalize_folder_name(&name)?;
    let conn = db.conn()?;
    let is_system: i64 = conn
        .query_row(
            "SELECT is_system FROM folders WHERE id = ?1",
            [folder_id],
            |row| row.get(0),
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => format!("folder {folder_id} not found"),
            other => format!("failed to load folder {folder_id}: {other}"),
        })?;
    if is_system != 0 {
        return Err("system folders cannot be renamed".to_string());
    }
    conn.execute(
        "UPDATE folders SET name = ?1 WHERE id = ?2",
        rusqlite::params![name, folder_id],
    )
    .map_err(|e| match e {
        rusqlite::Error::SqliteFailure(err, _)
            if err.code == rusqlite::ErrorCode::ConstraintViolation =>
        {
            format!("folder '{name}' already exists")
        }
        other => format!("failed to rename folder {folder_id}: {other}"),
    })?;
    Ok(())
}

#[tauri::command]
pub fn delete_folder(db: tauri::State<'_, Database>, folder_id: i64) -> Result<(), String> {
    let mut conn = db.conn()?;
    let tx = conn
        .transaction()
        .map_err(|e| format!("failed to begin transaction: {e}"))?;

    let is_system: i64 = tx
        .query_row(
            "SELECT is_system FROM folders WHERE id = ?1",
            [folder_id],
            |row| row.get(0),
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => format!("folder {folder_id} not found"),
            other => format!("failed to load folder {folder_id}: {other}"),
        })?;
    if is_system != 0 {
        return Err("system folders cannot be deleted".to_string());
    }

    let fallback_id: i64 = tx
        .query_row(
            "SELECT id FROM folders WHERE name = ?1",
            [QUICK_NOTES_FOLDER],
            |row| row.get(0),
        )
        .map_err(|e| format!("failed to locate '{QUICK_NOTES_FOLDER}' folder: {e}"))?;
    if fallback_id == folder_id {
        return Err("cannot delete the fallback folder".to_string());
    }

    tx.execute(
        "UPDATE notes SET folder_id = ?1, updated_at = ?2 WHERE folder_id = ?3",
        rusqlite::params![fallback_id, now_local(), folder_id],
    )
    .map_err(|e| format!("failed to move notes out of folder {folder_id}: {e}"))?;
    tx.execute("DELETE FROM folders WHERE id = ?1", [folder_id])
        .map_err(|e| format!("failed to delete folder {folder_id}: {e}"))?;

    tx.commit()
        .map_err(|e| format!("failed to commit folder deletion: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn list_notes(
    db: tauri::State<'_, Database>,
    crypto: tauri::State<'_, CryptoState>,
    folder_id: Option<i64>,
    favorites_only: Option<bool>,
    trashed: Option<bool>,
) -> Result<Vec<NoteSummary>, String> {
    let conn = db.conn()?;
    let key = session_key(&crypto);
    let mut conditions: Vec<String> = Vec::new();
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if trashed.unwrap_or(false) {
        conditions.push("n.trashed_at IS NOT NULL".to_string());
    } else {
        conditions.push("n.trashed_at IS NULL".to_string());
    }
    if favorites_only.unwrap_or(false) {
        conditions.push("n.is_favorite = 1".to_string());
    }
    if let Some(fid) = folder_id {
        params.push(Box::new(fid));
        conditions.push(format!("n.folder_id = ?{}", params.len()));
    }

    let where_clause = format!("WHERE {}", conditions.join(" AND "));
    let param_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    query_summaries(&conn, &where_clause, &param_refs, key.as_ref())
}

#[tauri::command]
pub fn search_notes(
    db: tauri::State<'_, Database>,
    crypto: tauri::State<'_, CryptoState>,
    query: String,
) -> Result<Vec<NoteSummary>, String> {
    let conn = db.conn()?;
    let key = session_key(&crypto);
    let pattern = format!("%{}%", escape_like(&query));
    let mut results = query_summaries(
        &conn,
        "WHERE n.trashed_at IS NULL
           AND n.is_private = 0
           AND (n.title LIKE ?1 ESCAPE '\\' OR n.content LIKE ?1 ESCAPE '\\')",
        &[&pattern],
        key.as_ref(),
    )?;

    if let Some(key) = key.as_ref() {
        let needle = query.trim().to_lowercase();
        let mut stmt = conn
            .prepare(
                "SELECT id, title, content FROM notes
                 WHERE trashed_at IS NULL AND is_private = 1",
            )
            .map_err(|e| format!("failed to prepare private note search: {e}"))?;
        let private_rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            })
            .map_err(|e| format!("failed to search private notes: {e}"))?;
        for row in private_rows {
            let (note_id, title, content) =
                row.map_err(|e| format!("failed to search private notes: {e}"))?;
            let plain_title = crypto::decrypt(key, &title)
                .map_err(|e| format!("failed to decrypt note {note_id} title: {e}"))?;
            let plain_content = crypto::decrypt(key, &content)
                .map_err(|e| format!("failed to decrypt note {note_id} content: {e}"))?;
            if plain_title.to_lowercase().contains(&needle)
                || plain_content.to_lowercase().contains(&needle)
            {
                results.push(note_summary(&conn, note_id, Some(key))?);
            }
        }
        results.sort_by(|a, b| b.updated_at.cmp(&a.updated_at).then(b.id.cmp(&a.id)));
    }

    Ok(results)
}

#[tauri::command]
pub fn get_note(
    db: tauri::State<'_, Database>,
    crypto: tauri::State<'_, CryptoState>,
    note_id: i64,
) -> Result<NoteDetail, String> {
    let conn = db.conn()?;
    let key = session_key(&crypto);
    note_detail(&conn, note_id, key.as_ref())
}

#[tauri::command]
pub fn get_note_by_title(
    db: tauri::State<'_, Database>,
    crypto: tauri::State<'_, CryptoState>,
    title: String,
) -> Result<Option<NoteDetail>, String> {
    let trimmed = title.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }
    let conn = db.conn()?;
    let key = session_key(&crypto);
    let pattern = escape_like(trimmed);
    let note_id: Option<i64> = conn
        .query_row(
            "SELECT id FROM notes
             WHERE trashed_at IS NULL AND is_private = 0 AND title LIKE ?1 ESCAPE '\\'
             ORDER BY updated_at DESC, id DESC
             LIMIT 1",
            [&pattern],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| format!("failed to look up note titled '{trimmed}': {e}"))?;
    match note_id {
        Some(id) => note_detail(&conn, id, key.as_ref()).map(Some),
        None => Ok(None),
    }
}

#[tauri::command]
pub fn get_backlinks(
    db: tauri::State<'_, Database>,
    crypto: tauri::State<'_, CryptoState>,
    note_id: i64,
) -> Result<Vec<NoteSummary>, String> {
    let conn = db.conn()?;
    let key = session_key(&crypto);
    let (raw_title, is_private): (String, i64) = conn
        .query_row(
            "SELECT title, is_private FROM notes WHERE id = ?1",
            [note_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => format!("note {note_id} not found"),
            other => format!("failed to load note {note_id}: {other}"),
        })?;
    let title = if is_private != 0 {
        match key.as_ref() {
            Some(key) => crypto::decrypt(key, &raw_title)
                .map_err(|e| format!("failed to decrypt note {note_id} title: {e}"))?,
            None => return Ok(Vec::new()),
        }
    } else {
        raw_title
    };
    let trimmed = title.trim();
    if trimmed.is_empty() {
        return Ok(Vec::new());
    }
    let pattern = format!("%[[{}]]%", escape_like(trimmed));
    query_summaries(
        &conn,
        "WHERE n.trashed_at IS NULL
           AND n.is_private = 0
           AND n.id != ?2
           AND n.content LIKE ?1 ESCAPE '\\'",
        &[&pattern as &dyn rusqlite::ToSql, &note_id],
        key.as_ref(),
    )
}

#[tauri::command]
pub fn create_note(
    db: tauri::State<'_, Database>,
    crypto: tauri::State<'_, CryptoState>,
    folder_id: i64,
    title: Option<String>,
    content: Option<String>,
) -> Result<NoteDetail, String> {
    let conn = db.conn()?;
    folder_exists(&conn, folder_id)?;
    let now = now_local();
    conn.execute(
        "INSERT INTO notes (folder_id, title, content, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?4)",
        rusqlite::params![
            folder_id,
            title.unwrap_or_default(),
            content.unwrap_or_default(),
            now
        ],
    )
    .map_err(|e| format!("failed to create note: {e}"))?;
    let key = session_key(&crypto);
    note_detail(&conn, conn.last_insert_rowid(), key.as_ref())
}

#[tauri::command]
pub fn update_note(
    db: tauri::State<'_, Database>,
    crypto: tauri::State<'_, CryptoState>,
    note_id: i64,
    title: String,
    content: String,
) -> Result<NoteDetail, String> {
    let conn = db.conn()?;
    let is_private: i64 = conn
        .query_row(
            "SELECT is_private FROM notes WHERE id = ?1",
            [note_id],
            |row| row.get(0),
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => format!("note {note_id} not found"),
            other => format!("failed to load note {note_id}: {other}"),
        })?;
    let key = session_key(&crypto);
    let (stored_title, stored_content) = if is_private != 0 {
        let key = key
            .as_ref()
            .ok_or_else(|| "unlock private notes to edit this note".to_string())?;
        (
            crypto::encrypt(key, &title)?,
            crypto::encrypt(key, &content)?,
        )
    } else {
        (title, content)
    };
    conn.execute(
        "UPDATE notes SET title = ?1, content = ?2, updated_at = ?3 WHERE id = ?4",
        rusqlite::params![stored_title, stored_content, now_local(), note_id],
    )
    .map_err(|e| format!("failed to update note {note_id}: {e}"))?;
    note_detail(&conn, note_id, key.as_ref())
}

#[tauri::command]
pub fn set_note_private(
    db: tauri::State<'_, Database>,
    crypto: tauri::State<'_, CryptoState>,
    note_id: i64,
    private: bool,
) -> Result<NoteDetail, String> {
    let conn = db.conn()?;
    let (is_private, raw_title, raw_content): (i64, String, String) = conn
        .query_row(
            "SELECT is_private, title, content FROM notes WHERE id = ?1",
            [note_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => format!("note {note_id} not found"),
            other => format!("failed to load note {note_id}: {other}"),
        })?;
    let key = session_key(&crypto);
    if (is_private != 0) == private {
        return note_detail(&conn, note_id, key.as_ref());
    }
    let key_ref = key
        .as_ref()
        .ok_or_else(|| "unlock private notes first".to_string())?;
    let (title, content) = if private {
        (
            crypto::encrypt(key_ref, &raw_title)?,
            crypto::encrypt(key_ref, &raw_content)?,
        )
    } else {
        (
            crypto::decrypt(key_ref, &raw_title)?,
            crypto::decrypt(key_ref, &raw_content)?,
        )
    };
    conn.execute(
        "UPDATE notes SET title = ?1, content = ?2, is_private = ?3, updated_at = ?4
         WHERE id = ?5",
        rusqlite::params![title, content, private as i64, now_local(), note_id],
    )
    .map_err(|e| format!("failed to update privacy for note {note_id}: {e}"))?;
    note_detail(&conn, note_id, Some(key_ref))
}

#[tauri::command]
pub fn move_note(
    db: tauri::State<'_, Database>,
    crypto: tauri::State<'_, CryptoState>,
    note_id: i64,
    folder_id: i64,
) -> Result<NoteSummary, String> {
    let conn = db.conn()?;
    note_exists(&conn, note_id)?;
    folder_exists(&conn, folder_id)?;
    conn.execute(
        "UPDATE notes SET folder_id = ?1, updated_at = ?2 WHERE id = ?3",
        rusqlite::params![folder_id, now_local(), note_id],
    )
    .map_err(|e| format!("failed to move note {note_id}: {e}"))?;
    let key = session_key(&crypto);
    note_summary(&conn, note_id, key.as_ref())
}

#[tauri::command]
pub fn set_favorite(
    db: tauri::State<'_, Database>,
    crypto: tauri::State<'_, CryptoState>,
    note_id: i64,
    favorite: bool,
) -> Result<NoteSummary, String> {
    let conn = db.conn()?;
    note_exists(&conn, note_id)?;
    conn.execute(
        "UPDATE notes SET is_favorite = ?1 WHERE id = ?2",
        rusqlite::params![favorite as i64, note_id],
    )
    .map_err(|e| format!("failed to update favorite for note {note_id}: {e}"))?;
    let key = session_key(&crypto);
    note_summary(&conn, note_id, key.as_ref())
}

#[tauri::command]
pub fn trash_note(
    db: tauri::State<'_, Database>,
    crypto: tauri::State<'_, CryptoState>,
    note_id: i64,
) -> Result<NoteSummary, String> {
    let conn = db.conn()?;
    note_exists(&conn, note_id)?;
    conn.execute(
        "UPDATE notes SET trashed_at = ?1 WHERE id = ?2 AND trashed_at IS NULL",
        rusqlite::params![now_local(), note_id],
    )
    .map_err(|e| format!("failed to trash note {note_id}: {e}"))?;
    let key = session_key(&crypto);
    note_summary(&conn, note_id, key.as_ref())
}

#[tauri::command]
pub fn restore_note(
    db: tauri::State<'_, Database>,
    crypto: tauri::State<'_, CryptoState>,
    note_id: i64,
) -> Result<NoteSummary, String> {
    let conn = db.conn()?;
    note_exists(&conn, note_id)?;
    conn.execute(
        "UPDATE notes SET trashed_at = NULL WHERE id = ?1",
        [note_id],
    )
    .map_err(|e| format!("failed to restore note {note_id}: {e}"))?;
    let key = session_key(&crypto);
    note_summary(&conn, note_id, key.as_ref())
}

#[tauri::command]
pub fn delete_note_permanently(
    db: tauri::State<'_, Database>,
    note_id: i64,
) -> Result<(), String> {
    let conn = db.conn()?;
    note_exists(&conn, note_id)?;
    let deleted = conn
        .execute(
            "DELETE FROM notes WHERE id = ?1 AND trashed_at IS NOT NULL",
            [note_id],
        )
        .map_err(|e| format!("failed to delete note {note_id}: {e}"))?;
    if deleted == 0 {
        return Err(format!(
            "note {note_id} must be in the trash before it can be deleted permanently"
        ));
    }
    conn.execute(
        "DELETE FROM tags WHERE NOT EXISTS (SELECT 1 FROM note_tags WHERE tag_id = tags.id)",
        [],
    )
    .map_err(|e| format!("failed to prune unused tags: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn list_tags(db: tauri::State<'_, Database>) -> Result<Vec<TagEntry>, String> {
    let conn = db.conn()?;
    let mut stmt = conn
        .prepare(
            "SELECT t.id, t.name,
                    (SELECT COUNT(*) FROM note_tags nt
                     JOIN notes n ON n.id = nt.note_id
                     WHERE nt.tag_id = t.id AND n.trashed_at IS NULL) AS note_count
             FROM tags t
             ORDER BY t.name ASC",
        )
        .map_err(|e| format!("failed to prepare tag query: {e}"))?;
    let rows = stmt
        .query_map([], |row| {
            Ok(TagEntry {
                id: row.get(0)?,
                name: row.get(1)?,
                note_count: row.get(2)?,
            })
        })
        .map_err(|e| format!("failed to list tags: {e}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("failed to list tags: {e}"))
}

#[tauri::command]
pub fn set_note_tags(
    db: tauri::State<'_, Database>,
    note_id: i64,
    tags: Vec<String>,
) -> Result<Vec<String>, String> {
    let mut conn = db.conn()?;
    let tx = conn
        .transaction()
        .map_err(|e| format!("failed to begin transaction: {e}"))?;

    note_exists(&tx, note_id)?;

    let mut cleaned: Vec<String> = Vec::new();
    for tag in &tags {
        let trimmed = tag.trim();
        if trimmed.is_empty() {
            continue;
        }
        if !cleaned.iter().any(|t| t.eq_ignore_ascii_case(trimmed)) {
            cleaned.push(trimmed.to_string());
        }
    }

    tx.execute("DELETE FROM note_tags WHERE note_id = ?1", [note_id])
        .map_err(|e| format!("failed to clear tags for note {note_id}: {e}"))?;

    for tag in &cleaned {
        tx.execute("INSERT OR IGNORE INTO tags (name) VALUES (?1)", [tag])
            .map_err(|e| format!("failed to create tag '{tag}': {e}"))?;
        tx.execute(
            "INSERT INTO note_tags (note_id, tag_id)
             SELECT ?1, id FROM tags WHERE name = ?2 COLLATE NOCASE",
            rusqlite::params![note_id, tag],
        )
        .map_err(|e| format!("failed to assign tag '{tag}' to note {note_id}: {e}"))?;
    }

    tx.execute(
        "DELETE FROM tags WHERE NOT EXISTS (SELECT 1 FROM note_tags WHERE tag_id = tags.id)",
        [],
    )
    .map_err(|e| format!("failed to prune unused tags: {e}"))?;

    let result = note_tags(&tx, note_id)?;
    tx.commit()
        .map_err(|e| format!("failed to commit tag update: {e}"))?;
    Ok(result)
}
