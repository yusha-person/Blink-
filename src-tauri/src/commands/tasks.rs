use chrono::Local;
use rusqlite::Connection;
use serde::Serialize;

use crate::db::Database;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskEntry {
    pub id: i64,
    pub title: String,
    pub description: String,
    pub due_date: Option<String>,
    pub priority: Option<String>,
    pub completed_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

fn now_string() -> String {
    Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
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

fn validate_priority(priority: &Option<String>) -> Result<(), String> {
    match priority.as_deref() {
        None | Some("low") | Some("medium") | Some("high") => Ok(()),
        Some(other) => Err(format!("invalid priority '{other}'")),
    }
}

fn row_to_task(row: &rusqlite::Row) -> rusqlite::Result<TaskEntry> {
    Ok(TaskEntry {
        id: row.get(0)?,
        title: row.get(1)?,
        description: row.get(2)?,
        due_date: row.get(3)?,
        priority: row.get(4)?,
        completed_at: row.get(5)?,
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
    })
}

const TASK_COLUMNS: &str =
    "id, title, description, due_date, priority, completed_at, created_at, updated_at";

fn get_task(conn: &Connection, id: i64) -> Result<TaskEntry, String> {
    conn.query_row(
        &format!("SELECT {TASK_COLUMNS} FROM tasks WHERE id = ?1"),
        [id],
        row_to_task,
    )
    .map_err(|e| format!("task {id} not found: {e}"))
}

#[tauri::command]
pub fn list_tasks(db: tauri::State<'_, Database>) -> Result<Vec<TaskEntry>, String> {
    let conn = db.conn()?;
    let mut stmt = conn
        .prepare(&format!("SELECT {TASK_COLUMNS} FROM tasks ORDER BY created_at DESC, id DESC"))
        .map_err(|e| format!("failed to prepare task list: {e}"))?;
    let tasks = stmt
        .query_map([], row_to_task)
        .map_err(|e| format!("failed to list tasks: {e}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("failed to read tasks: {e}"))?;
    Ok(tasks)
}

#[tauri::command]
pub fn create_task(
    db: tauri::State<'_, Database>,
    title: String,
    description: Option<String>,
    due_date: Option<String>,
    priority: Option<String>,
) -> Result<TaskEntry, String> {
    let title = title.trim().to_string();
    if title.is_empty() {
        return Err("task title is required".to_string());
    }
    if let Some(d) = &due_date {
        validate_date(d)?;
    }
    validate_priority(&priority)?;
    let conn = db.conn()?;
    let now = now_string();
    conn.execute(
        "INSERT INTO tasks (title, description, due_date, priority, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
        rusqlite::params![
            title,
            description.unwrap_or_default(),
            due_date,
            priority,
            now
        ],
    )
    .map_err(|e| format!("failed to create task: {e}"))?;
    get_task(&conn, conn.last_insert_rowid())
}

#[tauri::command]
pub fn update_task(
    db: tauri::State<'_, Database>,
    id: i64,
    title: String,
    description: Option<String>,
    due_date: Option<String>,
    priority: Option<String>,
) -> Result<TaskEntry, String> {
    let title = title.trim().to_string();
    if title.is_empty() {
        return Err("task title is required".to_string());
    }
    if let Some(d) = &due_date {
        validate_date(d)?;
    }
    validate_priority(&priority)?;
    let conn = db.conn()?;
    let changed = conn
        .execute(
            "UPDATE tasks SET title = ?1, description = ?2, due_date = ?3, priority = ?4, updated_at = ?5
             WHERE id = ?6",
            rusqlite::params![
                title,
                description.unwrap_or_default(),
                due_date,
                priority,
                now_string(),
                id
            ],
        )
        .map_err(|e| format!("failed to update task {id}: {e}"))?;
    if changed == 0 {
        return Err(format!("task {id} not found"));
    }
    get_task(&conn, id)
}

#[tauri::command]
pub fn set_task_completed(
    db: tauri::State<'_, Database>,
    id: i64,
    completed: bool,
) -> Result<TaskEntry, String> {
    let conn = db.conn()?;
    let completed_at = if completed { Some(now_string()) } else { None };
    let changed = conn
        .execute(
            "UPDATE tasks SET completed_at = ?1, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![completed_at, now_string(), id],
        )
        .map_err(|e| format!("failed to update task {id}: {e}"))?;
    if changed == 0 {
        return Err(format!("task {id} not found"));
    }
    get_task(&conn, id)
}

#[tauri::command]
pub fn delete_task(db: tauri::State<'_, Database>, id: i64) -> Result<(), String> {
    let conn = db.conn()?;
    let changed = conn
        .execute("DELETE FROM tasks WHERE id = ?1", [id])
        .map_err(|e| format!("failed to delete task {id}: {e}"))?;
    if changed == 0 {
        return Err(format!("task {id} not found"));
    }
    Ok(())
}
