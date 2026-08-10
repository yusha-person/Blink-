use chrono::Local;
use rusqlite::{Connection, OptionalExtension};
use serde::Serialize;

use crate::crypto::{self, CryptoState};
use crate::db::Database;

pub const QUICK_NOTES_FOLDER: &str = "Quick Notes";
pub const LOCKED_NOTE_TITLE: &str = "Private note";
pub const MAX_FOLDER_DEPTH: i64 = 5;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderEntry {
    pub id: i64,
    pub name: String,
    pub parent_id: i64,
    pub sort_order: i64,
    pub is_system: bool,
    pub note_count: i64,
}

fn session_key(crypto: &tauri::State<'_, CryptoState>) -> Option<[u8; crypto::KEY_LEN]> {
    crypto.inner().key()
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

fn folder_entry(row: &rusqlite::Row) -> rusqlite::Result<FolderEntry> {
    Ok(FolderEntry {
        id: row.get(0)?,
        name: row.get(1)?,
        parent_id: row.get(2)?,
        sort_order: row.get(3)?,
        is_system: row.get::<_, i64>(4)? != 0,
        note_count: row.get(5)?,
    })
}

const FOLDER_COLUMNS: &str =
    "f.id, f.name, f.parent_id, f.sort_order, f.is_system, (SELECT COUNT(*) FROM notes n WHERE n.folder_id = f.id AND n.trashed_at IS NULL)";

fn get_folder_entry(conn: &Connection, id: i64) -> Result<FolderEntry, String> {
    conn.query_row(
        &format!("SELECT {FOLDER_COLUMNS} FROM folders f WHERE f.id = ?1"),
        [id],
        folder_entry,
    )
    .map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => format!("folder {id} not found"),
        other => format!("failed to load folder {id}: {other}"),
    })
}

fn folder_depth(conn: &Connection, id: i64) -> Result<i64, String> {
    let mut depth = 0;
    let mut current = id;
    loop {
        let parent: i64 = conn
            .query_row(
                "SELECT parent_id FROM folders WHERE id = ?1",
                [current],
                |row| row.get(0),
            )
            .map_err(|e| match e {
                rusqlite::Error::QueryReturnedNoRows => format!("folder {current} not found"),
                other => format!("failed to read folder {current}: {other}"),
            })?;
        depth += 1;
        if parent == 0 {
            return Ok(depth);
        }
        if depth > MAX_FOLDER_DEPTH + 1 {
            return Err("folder tree is deeper than the supported maximum".to_string());
        }
        current = parent;
    }
}

/// Height of the subtree rooted at `id` (1 = just the folder itself).
fn subtree_height(conn: &Connection, id: i64) -> Result<i64, String> {
    conn.query_row(
        "WITH RECURSIVE subtree(id, depth) AS (
             SELECT id, 1 FROM folders WHERE id = ?1
             UNION ALL
             SELECT f.id, s.depth + 1 FROM folders f JOIN subtree s ON f.parent_id = s.id
         )
         SELECT COALESCE(MAX(depth), 0) FROM subtree",
        [id],
        |row| row.get(0),
    )
    .map_err(|e| format!("failed to measure folder subtree {id}: {e}"))
}

/// All folder ids in the subtree rooted at `id`, including `id` itself.
fn subtree_ids(conn: &Connection, id: i64) -> Result<Vec<i64>, String> {
    let mut stmt = conn
        .prepare(
            "WITH RECURSIVE subtree(id) AS (
                 SELECT id FROM folders WHERE id = ?1
                 UNION ALL
                 SELECT f.id FROM folders f JOIN subtree s ON f.parent_id = s.id
             )
             SELECT id FROM subtree",
        )
        .map_err(|e| format!("failed to prepare subtree query: {e}"))?;
    let rows = stmt
        .query_map([id], |row| row.get::<_, i64>(0))
        .map_err(|e| format!("failed to read subtree of folder {id}: {e}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("failed to collect subtree of folder {id}: {e}"))
}

fn is_duplicate_folder_error(e: &rusqlite::Error, name: &str) -> String {
    match e {
        rusqlite::Error::SqliteFailure(err, _)
            if err.code == rusqlite::ErrorCode::ConstraintViolation =>
        {
            format!("a folder named '{name}' already exists at that level")
        }
        other => format!("failed to save folder '{name}': {other}"),
    }
}

#[tauri::command]
pub fn list_folders(db: tauri::State<'_, Database>) -> Result<Vec<FolderEntry>, String> {
    let conn = db.conn()?;
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {FOLDER_COLUMNS} FROM folders f ORDER BY f.sort_order ASC, f.id ASC"
        ))
        .map_err(|e| format!("failed to prepare folder query: {e}"))?;
    let rows = stmt
        .query_map([], folder_entry)
        .map_err(|e| format!("failed to list folders: {e}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("failed to list folders: {e}"))
}

#[tauri::command]
pub fn create_folder(
    db: tauri::State<'_, Database>,
    name: String,
    parent_id: Option<i64>,
) -> Result<FolderEntry, String> {
    let name = normalize_folder_name(&name)?;
    let parent_id = parent_id.unwrap_or(0);
    let conn = db.conn()?;
    if parent_id != 0 {
        if folder_depth(&conn, parent_id)? >= MAX_FOLDER_DEPTH {
            return Err(format!(
                "folders can be nested at most {MAX_FOLDER_DEPTH} levels deep"
            ));
        }
    }
    conn.execute(
        "INSERT INTO folders (name, parent_id, sort_order, is_system)
         VALUES (?1, ?2, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM folders WHERE parent_id = ?2), 0)",
        rusqlite::params![name, parent_id],
    )
    .map_err(|e| is_duplicate_folder_error(&e, &name))?;
    get_folder_entry(&conn, conn.last_insert_rowid())
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
    .map_err(|e| is_duplicate_folder_error(&e, &name))?;
    Ok(())
}

/// Moves a folder to a new parent (0 = root) at the given sibling index,
/// then normalizes the sort_order of the new parent's children to 1..n.
#[tauri::command]
pub fn move_folder(
    db: tauri::State<'_, Database>,
    folder_id: i64,
    new_parent_id: i64,
    new_index: Option<i64>,
) -> Result<(), String> {
    let mut conn = db.conn()?;
    let tx = conn
        .transaction()
        .map_err(|e| format!("failed to begin transaction: {e}"))?;

    let (is_system, old_parent): (i64, i64) = tx
        .query_row(
            "SELECT is_system, parent_id FROM folders WHERE id = ?1",
            [folder_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => format!("folder {folder_id} not found"),
            other => format!("failed to load folder {folder_id}: {other}"),
        })?;
    if is_system != 0 && new_parent_id != old_parent {
        return Err("system folders cannot be moved".to_string());
    }
    if new_parent_id == folder_id {
        return Err("a folder cannot be moved into itself".to_string());
    }
    if new_parent_id != 0 {
        if subtree_ids(&tx, folder_id)?.contains(&new_parent_id) {
            return Err("a folder cannot be moved into its own subfolder".to_string());
        }
        let parent_depth = folder_depth(&tx, new_parent_id)?;
        if parent_depth + subtree_height(&tx, folder_id)? > MAX_FOLDER_DEPTH {
            return Err(format!(
                "folders can be nested at most {MAX_FOLDER_DEPTH} levels deep"
            ));
        }
    }

    let mut siblings: Vec<i64> = {
        let mut stmt = tx
            .prepare(
                "SELECT id FROM folders WHERE parent_id = ?1 AND id != ?2
                 ORDER BY sort_order ASC, id ASC",
            )
            .map_err(|e| format!("failed to prepare sibling query: {e}"))?;
        let rows = stmt
            .query_map(rusqlite::params![new_parent_id, folder_id], |row| {
                row.get::<_, i64>(0)
            })
            .map_err(|e| format!("failed to list siblings: {e}"))?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("failed to collect siblings: {e}"))?
    };
    let index = new_index
        .unwrap_or(i64::MAX)
        .clamp(0, siblings.len() as i64) as usize;
    siblings.insert(index, folder_id);

    tx.execute(
        "UPDATE folders SET parent_id = ?1 WHERE id = ?2",
        rusqlite::params![new_parent_id, folder_id],
    )
    .map_err(|e| {
        if let rusqlite::Error::SqliteFailure(err, _) = &e {
            if err.code == rusqlite::ErrorCode::ConstraintViolation {
                return "a folder with that name already exists at the destination".to_string();
            }
        }
        format!("failed to move folder {folder_id}: {e}")
    })?;
    for (position, id) in siblings.iter().enumerate() {
        tx.execute(
            "UPDATE folders SET sort_order = ?1 WHERE id = ?2",
            rusqlite::params![position as i64 + 1, id],
        )
        .map_err(|e| format!("failed to reorder folder {id}: {e}"))?;
    }

    tx.commit()
        .map_err(|e| format!("failed to commit folder move: {e}"))?;
    Ok(())
}

/// Deletes a folder without ever deleting notes.
/// - `notes_destination_id`: where direct (promote) or subtree-wide (delete_subfolders)
///   notes are moved. Required whenever the affected folders contain any notes.
/// - `subfolder_action`: "promote" (children move up to the deleted folder's parent)
///   or "delete_subfolders" (recursively delete children; all subtree notes relocate).
#[tauri::command]
pub fn delete_folder(
    db: tauri::State<'_, Database>,
    folder_id: i64,
    notes_destination_id: Option<i64>,
    subfolder_action: Option<String>,
) -> Result<(), String> {
    let action = subfolder_action.as_deref().unwrap_or("promote");
    if action != "promote" && action != "delete_subfolders" {
        return Err(format!("invalid subfolder action '{action}'"));
    }

    let mut conn = db.conn()?;
    let tx = conn
        .transaction()
        .map_err(|e| format!("failed to begin transaction: {e}"))?;

    let (is_system, parent_id): (i64, i64) = tx
        .query_row(
            "SELECT is_system, parent_id FROM folders WHERE id = ?1",
            [folder_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => format!("folder {folder_id} not found"),
            other => format!("failed to load folder {folder_id}: {other}"),
        })?;
    if is_system != 0 {
        return Err("system folders cannot be deleted".to_string());
    }

    let subtree = subtree_ids(&tx, folder_id)?;
    let affected: &[i64] = if action == "delete_subfolders" {
        &subtree
    } else {
        &subtree[..1]
    };

    let placeholders = affected.iter().map(|_| "?").collect::<Vec<_>>().join(", ");
    let note_count: i64 = tx
        .query_row(
            &format!(
                "SELECT COUNT(*) FROM notes WHERE folder_id IN ({placeholders})"
            ),
            rusqlite::params_from_iter(affected.iter()),
            |row| row.get(0),
        )
        .map_err(|e| format!("failed to count notes in folder {folder_id}: {e}"))?;

    if note_count > 0 {
        let destination = notes_destination_id
            .ok_or("choose a destination folder for the notes before deleting")?;
        if affected.contains(&destination) {
            return Err("notes cannot be moved into a folder that is being deleted".to_string());
        }
        get_folder_entry(&tx, destination)?;
        let mut move_params: Vec<rusqlite::types::Value> = Vec::new();
        move_params.push(destination.into());
        move_params.push(now_local().into());
        move_params.extend(affected.iter().map(|id| (*id).into()));
        tx.execute(
            &format!(
                "UPDATE notes SET folder_id = ?1, updated_at = ?2 WHERE folder_id IN ({placeholders})"
            ),
            rusqlite::params_from_iter(move_params),
        )
        .map_err(|e| format!("failed to move notes out of folder {folder_id}: {e}"))?;
    }

    if action == "promote" {
        tx.execute(
            "UPDATE folders SET parent_id = ?1 WHERE parent_id = ?2",
            rusqlite::params![parent_id, folder_id],
        )
        .map_err(|e| {
            if let rusqlite::Error::SqliteFailure(err, _) = &e {
                if err.code == rusqlite::ErrorCode::ConstraintViolation {
                    return "a subfolder name conflicts with a folder at the destination level"
                        .to_string();
                }
            }
            format!("failed to promote subfolders of {folder_id}: {e}")
        })?;
    }

    tx.execute(
        &format!("DELETE FROM folders WHERE id IN ({placeholders})"),
        rusqlite::params_from_iter(affected.iter()),
    )
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
