use chrono::Local;
use serde::Serialize;

use crate::db::Database;

pub const JOURNAL_TEMPLATE: &str = "## Today's XP\n\n\n## Wins\n\n\n## Lessons Learned\n\n\n## Improvements\n\n\n## Tomorrow's Goals\n";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JournalEntry {
    pub date: String,
    pub content: String,
    pub created_at: String,
    pub updated_at: String,
}

fn now_string() -> String {
    Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

fn today_string() -> String {
    Local::now().format("%Y-%m-%d").to_string()
}

fn validate_date(date: &str) -> Result<(), String> {
    let ok = date.len() == 10
        && date
            .chars()
            .enumerate()
            .all(|(i, c)| if i == 4 || i == 7 { c == '-' } else { c.is_ascii_digit() });
    if ok {
        Ok(())
    } else {
        Err(format!("invalid date '{date}', expected YYYY-MM-DD"))
    }
}

fn get_entry(conn: &rusqlite::Connection, date: &str) -> Result<Option<JournalEntry>, String> {
    conn.query_row(
        "SELECT date, content, created_at, updated_at FROM journal_entries WHERE date = ?1",
        [date],
        |row| {
            Ok(JournalEntry {
                date: row.get(0)?,
                content: row.get(1)?,
                created_at: row.get(2)?,
                updated_at: row.get(3)?,
            })
        },
    )
    .map(Some)
    .or_else(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => Ok(None),
        other => Err(format!("failed to read journal entry for {date}: {other}")),
    })
}

#[tauri::command]
pub fn get_or_create_today_journal(db: tauri::State<'_, Database>) -> Result<JournalEntry, String> {
    let conn = db.conn()?;
    let today = today_string();
    let now = now_string();
    conn.execute(
        "INSERT OR IGNORE INTO journal_entries (date, content, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?3)",
        rusqlite::params![&today, JOURNAL_TEMPLATE, &now],
    )
    .map_err(|e| format!("failed to create today's journal entry: {e}"))?;
    get_entry(&conn, &today)?.ok_or_else(|| "today's journal entry missing after insert".to_string())
}

#[tauri::command]
pub fn get_journal(db: tauri::State<'_, Database>, date: String) -> Result<Option<JournalEntry>, String> {
    validate_date(&date)?;
    let conn = db.conn()?;
    get_entry(&conn, &date)
}

#[tauri::command]
pub fn search_journal(
    db: tauri::State<'_, Database>,
    query: String,
) -> Result<Vec<JournalEntry>, String> {
    let conn = db.conn()?;
    let escaped = query
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_");
    let pattern = format!("%{escaped}%");
    let mut stmt = conn
        .prepare(
            "SELECT date, content, created_at, updated_at FROM journal_entries
             WHERE content LIKE ?1 ESCAPE '\\'
             ORDER BY date DESC",
        )
        .map_err(|e| format!("failed to prepare journal search: {e}"))?;
    let rows = stmt
        .query_map([&pattern], |row| {
            Ok(JournalEntry {
                date: row.get(0)?,
                content: row.get(1)?,
                created_at: row.get(2)?,
                updated_at: row.get(3)?,
            })
        })
        .map_err(|e| format!("failed to search journal entries: {e}"))?;
    let template = JOURNAL_TEMPLATE.trim();
    let mut results = Vec::new();
    for row in rows {
        let entry = row.map_err(|e| format!("failed to search journal entries: {e}"))?;
        if entry.content.trim() != template {
            results.push(entry);
        }
    }
    Ok(results)
}

#[tauri::command]
pub fn update_journal(
    db: tauri::State<'_, Database>,
    date: String,
    content: String,
) -> Result<JournalEntry, String> {
    validate_date(&date)?;
    let conn = db.conn()?;
    let now = now_string();
    conn.execute(
        "INSERT INTO journal_entries (date, content, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?3)
         ON CONFLICT(date) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at",
        rusqlite::params![&date, &content, &now],
    )
    .map_err(|e| format!("failed to update journal entry for {date}: {e}"))?;
    get_entry(&conn, &date)?.ok_or_else(|| format!("journal entry for {date} missing after update"))
}
