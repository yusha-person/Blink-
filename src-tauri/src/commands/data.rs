use std::fs;
use std::path::{Path, PathBuf};

use chrono::Local;
use rusqlite::types::{Value, ValueRef};
use rusqlite::Connection;
use serde_json::{json, Map};
use tauri::Manager;
use tauri_plugin_opener::OpenerExt;

use crate::db::Database;

const EXPORT_FORMAT_VERSION: i64 = 1;
const BACKUPS_DIR: &str = "backups";
const EXPORTS_DIR: &str = "exports";

/// Every table included in a JSON export, in FK-safe insert order
/// (parents before children). Column lists are explicit and fixed.
const TABLES: &[(&str, &[&str])] = &[
    ("settings", &["key", "value"]),
    (
        "habits",
        &["id", "name", "points", "sort_order", "archived", "created_at"],
    ),
    ("folders", &["id", "name", "sort_order", "is_system", "created_at"]),
    ("tags", &["id", "name"]),
    (
        "notes",
        &[
            "id",
            "folder_id",
            "title",
            "content",
            "is_favorite",
            "is_private",
            "trashed_at",
            "created_at",
            "updated_at",
        ],
    ),
    (
        "habit_completions",
        &["id", "habit_id", "date", "completed_at"],
    ),
    ("daily_totals", &["date", "points", "xp"]),
    (
        "streaks",
        &["id", "current", "longest", "last_met_date", "last_evaluated"],
    ),
    ("note_tags", &["note_id", "tag_id"]),
    (
        "journal_entries",
        &["date", "content", "created_at", "updated_at"],
    ),
    ("achievements", &["key", "unlocked_at"]),
];

/// Deletion order for import: children first (cascades would handle it, but
/// being explicit keeps the intent clear and FK-safe either way).
const DELETE_ORDER: &[&str] = &[
    "note_tags",
    "habit_completions",
    "notes",
    "tags",
    "habits",
    "folders",
    "daily_totals",
    "streaks",
    "journal_entries",
    "achievements",
    "settings",
];

fn timestamp_slug() -> String {
    Local::now().format("%Y%m%d-%H%M%S").to_string()
}

fn data_subdir(app: &tauri::AppHandle, name: &str) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("failed to resolve app data directory: {e}"))?
        .join(name);
    fs::create_dir_all(&dir).map_err(|e| format!("failed to create {name} directory: {e}"))?;
    Ok(dir)
}

fn dump_table(conn: &Connection, table: &str, columns: &[&str]) -> Result<Vec<serde_json::Value>, String> {
    let sql = format!("SELECT {} FROM {table} ORDER BY rowid", columns.join(", "));
    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| format!("failed to prepare export of '{table}': {e}"))?;
    let rows = stmt
        .query_map([], |row| {
            let mut obj = Map::new();
            for (i, column) in columns.iter().enumerate() {
                let value = match row.get_ref(i)? {
                    ValueRef::Null => serde_json::Value::Null,
                    ValueRef::Integer(n) => json!(n),
                    ValueRef::Real(f) => json!(f),
                    ValueRef::Text(bytes) => {
                        json!(String::from_utf8_lossy(bytes).into_owned())
                    }
                    ValueRef::Blob(_) => serde_json::Value::Null,
                };
                obj.insert(column.to_string(), value);
            }
            Ok(serde_json::Value::Object(obj))
        })
        .map_err(|e| format!("failed to export '{table}': {e}"))?;

    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|e| format!("failed to read row of '{table}': {e}"))?);
    }
    Ok(out)
}

fn json_to_sql(value: &serde_json::Value, table: &str, column: &str) -> Result<Value, String> {
    match value {
        serde_json::Value::Null => Ok(Value::Null),
        serde_json::Value::Number(n) => n
            .as_i64()
            .map(Value::Integer)
            .ok_or_else(|| format!("import: non-integer number in {table}.{column}")),
        serde_json::Value::String(s) => Ok(Value::Text(s.clone())),
        other => Err(format!(
            "import: unsupported value type in {table}.{column}: {other}"
        )),
    }
}

/// Copies the SQLite database file (after a WAL checkpoint so the copy is
/// complete on its own) into the backups folder. Returns the backup path.
#[tauri::command]
pub fn backup_database(app: tauri::AppHandle, db: tauri::State<'_, Database>) -> Result<String, String> {
    let dest = data_subdir(&app, BACKUPS_DIR)?
        .join(format!("lifexp-backup-{}.db", timestamp_slug()));
    {
        let conn = db.conn()?;
        conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
            .map_err(|e| format!("failed to checkpoint database: {e}"))?;
    }
    fs::copy(db.path(), &dest).map_err(|e| format!("failed to copy database file: {e}"))?;
    Ok(dest.to_string_lossy().into_owned())
}

/// Dumps every table to a timestamped JSON file in the exports folder.
/// Private notes stay encrypted (ciphertext is exported as-is) and the crypto
/// settings travel along, so a re-imported export remains unlockable with the
/// same master password. Returns the export path.
#[tauri::command]
pub fn export_data(app: tauri::AppHandle, db: tauri::State<'_, Database>) -> Result<String, String> {
    let dest = data_subdir(&app, EXPORTS_DIR)?
        .join(format!("lifexp-export-{}.json", timestamp_slug()));

    let mut tables = Map::new();
    {
        let conn = db.conn()?;
        for (table, columns) in TABLES {
            tables.insert(
                table.to_string(),
                serde_json::Value::Array(dump_table(&conn, table, columns)?),
            );
        }
    }

    let payload = json!({
        "app": "lifexp",
        "formatVersion": EXPORT_FORMAT_VERSION,
        "exportedAt": Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
        "tables": serde_json::Value::Object(tables),
    });
    let text = serde_json::to_string_pretty(&payload)
        .map_err(|e| format!("failed to serialize export: {e}"))?;
    fs::write(&dest, text).map_err(|e| format!("failed to write export file: {e}"))?;
    Ok(dest.to_string_lossy().into_owned())
}

/// Lists JSON export files in the exports folder, newest first (file names
/// start with a timestamp, so reverse name order = newest first).
#[tauri::command]
pub fn list_exports(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    let dir = data_subdir(&app, EXPORTS_DIR)?;
    let mut names: Vec<String> = Vec::new();
    let entries = fs::read_dir(&dir).map_err(|e| format!("failed to read exports folder: {e}"))?;
    for entry in entries {
        let entry = entry.map_err(|e| format!("failed to read export entry: {e}"))?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with("lifexp-export-") && name.ends_with(".json") {
            names.push(name);
        }
    }
    names.sort_by(|a, b| b.cmp(a));
    Ok(names)
}

/// Replaces ALL current data with the contents of a previous JSON export.
/// Runs in a single transaction — any validation or SQL error rolls back and
/// leaves the existing data untouched.
#[tauri::command]
pub fn import_data(
    app: tauri::AppHandle,
    db: tauri::State<'_, Database>,
    file_name: String,
) -> Result<(), String> {
    if file_name.contains('/') || file_name.contains('\\') || file_name.contains("..") {
        return Err("invalid export file name".to_string());
    }
    let path = data_subdir(&app, EXPORTS_DIR)?.join(&file_name);
    let text = fs::read_to_string(&path)
        .map_err(|e| format!("failed to read export '{file_name}': {e}"))?;
    let payload: serde_json::Value =
        serde_json::from_str(&text).map_err(|e| format!("export '{file_name}' is not valid JSON: {e}"))?;

    if payload.get("app").and_then(|v| v.as_str()) != Some("lifexp") {
        return Err("not a LifeXP export file".to_string());
    }
    if payload.get("formatVersion").and_then(|v| v.as_i64()) != Some(EXPORT_FORMAT_VERSION) {
        return Err(format!(
            "unsupported export format version (expected {EXPORT_FORMAT_VERSION})"
        ));
    }
    let tables = payload
        .get("tables")
        .and_then(|v| v.as_object())
        .ok_or_else(|| "export is missing the 'tables' object".to_string())?;

    let mut conn = db.conn()?;
    let tx = conn
        .transaction()
        .map_err(|e| format!("failed to begin import transaction: {e}"))?;

    for table in DELETE_ORDER {
        tx.execute(&format!("DELETE FROM {table}"), [])
            .map_err(|e| format!("failed to clear '{table}': {e}"))?;
    }

    for (table, columns) in TABLES {
        let rows = match tables.get(*table) {
            None => continue,
            Some(serde_json::Value::Array(rows)) => rows,
            _ => return Err(format!("import: table '{table}' is not an array")),
        };
        let sql = format!(
            "INSERT INTO {table} ({}) VALUES ({})",
            columns.join(", "),
            columns
                .iter()
                .enumerate()
                .map(|(i, _)| format!("?{}", i + 1))
                .collect::<Vec<_>>()
                .join(", ")
        );
        for row in rows {
            let obj = row
                .as_object()
                .ok_or_else(|| format!("import: row of '{table}' is not an object"))?;
            let mut values: Vec<Value> = Vec::with_capacity(columns.len());
            for column in *columns {
                let raw = obj
                    .get(*column)
                    .ok_or_else(|| format!("import: missing column '{column}' in '{table}'"))?;
                values.push(json_to_sql(raw, table, column)?);
            }
            tx.execute(&sql, rusqlite::params_from_iter(values))
                .map_err(|e| format!("failed to import row into '{table}': {e}"))?;
        }
    }

    tx.commit()
        .map_err(|e| format!("failed to commit import: {e}"))?;
    Ok(())
}

/// Opens the system file manager with the given backup/export file selected.
/// Restricted to files inside the app data directory.
#[tauri::command]
pub fn reveal_path(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("failed to resolve app data directory: {e}"))?;
    let target = Path::new(&path);
    if !target.starts_with(&base) {
        return Err("can only reveal files inside the app data directory".to_string());
    }
    if !target.exists() {
        return Err(format!("file does not exist: {path}"));
    }
    app.opener()
        .reveal_item_in_dir(target)
        .map_err(|e| format!("failed to reveal file: {e}"))
}

/// Clears all points, XP, completions, streak history, and unlocked
/// achievements. Habits, notes, journals, and settings are kept.
#[tauri::command]
pub fn reset_statistics(db: tauri::State<'_, Database>) -> Result<(), String> {
    let mut conn = db.conn()?;
    let tx = conn
        .transaction()
        .map_err(|e| format!("failed to begin reset transaction: {e}"))?;
    tx.execute_batch(
        "DELETE FROM habit_completions;
         DELETE FROM daily_totals;
         UPDATE streaks SET current = 0, longest = 0, last_met_date = NULL, last_evaluated = NULL
         WHERE id = 1;
         DELETE FROM achievements;",
    )
    .map_err(|e| format!("failed to reset statistics: {e}"))?;
    tx.commit()
        .map_err(|e| format!("failed to commit statistics reset: {e}"))?;
    Ok(())
}

/// Zeroes all earned XP (level drops back to 1). Points, completions, and
/// streaks are kept.
#[tauri::command]
pub fn reset_xp(db: tauri::State<'_, Database>) -> Result<(), String> {
    let conn = db.conn()?;
    conn.execute("UPDATE daily_totals SET xp = 0", [])
        .map_err(|e| format!("failed to reset XP: {e}"))?;
    Ok(())
}
