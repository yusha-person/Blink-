use chrono::Local;
use rusqlite::Connection;
use serde::Serialize;

use crate::db::Database;

pub const XP_PER_POINT: i64 = 10;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HabitEntry {
    pub id: i64,
    pub name: String,
    pub description: String,
    pub requirement: String,
    pub icon: String,
    pub points: i64,
    pub priority: String,
    pub sort_order: i64,
    pub archived: bool,
    pub archived_at: Option<String>,
    pub is_system: bool,
    pub created_at: String,
    pub completed: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyTotals {
    pub date: String,
    pub points: i64,
    pub xp: i64,
}

fn today_local() -> String {
    Local::now().format("%Y-%m-%d").to_string()
}

fn read_totals(conn: &Connection, date: &str) -> Result<DailyTotals, String> {
    let (points, xp) = conn
        .query_row(
            "SELECT points, xp FROM daily_totals WHERE date = ?1",
            [date],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .or_else(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => Ok((0, 0)),
            other => Err(format!("failed to read daily totals for {date}: {other}")),
        })?;
    Ok(DailyTotals {
        date: date.to_string(),
        points,
        xp,
    })
}

fn habit_points(conn: &Connection, habit_id: i64) -> Result<i64, String> {
    conn.query_row(
        "SELECT points FROM habits WHERE id = ?1 AND archived = 0",
        [habit_id],
        |row| row.get(0),
    )
    .map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => format!("habit {habit_id} not found"),
        other => format!("failed to load habit {habit_id}: {other}"),
    })
}

fn apply_delta(conn: &Connection, date: &str, points_delta: i64) -> Result<(), String> {
    let updated = conn
        .execute(
            "UPDATE daily_totals SET
                points = MAX(0, points + ?2),
                xp     = MAX(0, xp + ?3)
             WHERE date = ?1",
            rusqlite::params![date, points_delta, points_delta * XP_PER_POINT],
        )
        .map_err(|e| format!("failed to update daily totals for {date}: {e}"))?;
    if updated == 0 {
        conn.execute(
            "INSERT INTO daily_totals (date, points, xp) VALUES (?1, ?2, ?3)",
            rusqlite::params![date, points_delta, points_delta * XP_PER_POINT],
        )
        .map_err(|e| format!("failed to insert daily totals for {date}: {e}"))?;
    }
    Ok(())
}

fn habit_entry(row: &rusqlite::Row) -> rusqlite::Result<HabitEntry> {
    Ok(HabitEntry {
        id: row.get(0)?,
        name: row.get(1)?,
        description: row.get(2)?,
        requirement: row.get(3)?,
        icon: row.get(4)?,
        points: row.get(5)?,
        priority: row.get(6)?,
        sort_order: row.get(7)?,
        archived: row.get::<_, i64>(8)? != 0,
        archived_at: row.get(9)?,
        is_system: row.get::<_, i64>(10)? != 0,
        created_at: row.get(11)?,
        completed: row.get::<_, i64>(12)? != 0,
    })
}

const HABIT_COLUMNS: &str =
    "h.id, h.name, h.description, h.requirement, h.icon, h.points, h.priority, h.sort_order, h.archived, h.archived_at, h.is_system, h.created_at";

#[tauri::command]
pub fn list_habits(
    db: tauri::State<'_, Database>,
    date: Option<String>,
) -> Result<Vec<HabitEntry>, String> {
    let date = date.unwrap_or_else(today_local);
    let conn = db.conn()?;
    let mut stmt = conn
        .prepare(
            &format!(
                "SELECT {HABIT_COLUMNS},
                        EXISTS(
                            SELECT 1 FROM habit_completions c
                            WHERE c.habit_id = h.id AND c.date = ?1
                        ) AS completed
                 FROM habits h
                 ORDER BY h.sort_order ASC, h.id ASC"
            ),
        )
        .map_err(|e| format!("failed to prepare habit query: {e}"))?;

    let rows = stmt
        .query_map([&date], habit_entry)
        .map_err(|e| format!("failed to list habits: {e}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("failed to list habits: {e}"))
}

#[tauri::command]
pub fn complete_habit(
    db: tauri::State<'_, Database>,
    habit_id: i64,
    date: Option<String>,
) -> Result<DailyTotals, String> {
    let date = date.unwrap_or_else(today_local);
    let mut conn = db.conn()?;
    let tx = conn
        .transaction()
        .map_err(|e| format!("failed to begin transaction: {e}"))?;

    let points = habit_points(&tx, habit_id)?;
    let inserted = tx
        .execute(
            "INSERT OR IGNORE INTO habit_completions (habit_id, date) VALUES (?1, ?2)",
            rusqlite::params![habit_id, &date],
        )
        .map_err(|e| format!("failed to complete habit {habit_id}: {e}"))?;

    if inserted > 0 {
        apply_delta(&tx, &date, points)?;
    }

    let totals = read_totals(&tx, &date)?;
    tx.commit()
        .map_err(|e| format!("failed to commit habit completion: {e}"))?;
    Ok(totals)
}

#[tauri::command]
pub fn uncomplete_habit(
    db: tauri::State<'_, Database>,
    habit_id: i64,
    date: Option<String>,
) -> Result<DailyTotals, String> {
    let date = date.unwrap_or_else(today_local);
    let mut conn = db.conn()?;
    let tx = conn
        .transaction()
        .map_err(|e| format!("failed to begin transaction: {e}"))?;

    let points = habit_points(&tx, habit_id)?;
    let removed = tx
        .execute(
            "DELETE FROM habit_completions WHERE habit_id = ?1 AND date = ?2",
            rusqlite::params![habit_id, &date],
        )
        .map_err(|e| format!("failed to uncomplete habit {habit_id}: {e}"))?;

    if removed > 0 {
        apply_delta(&tx, &date, -points)?;
    }

    let totals = read_totals(&tx, &date)?;
    tx.commit()
        .map_err(|e| format!("failed to commit habit reversal: {e}"))?;
    Ok(totals)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityEntry {
    pub habit_id: i64,
    pub habit_name: String,
    pub points: i64,
    pub date: String,
    pub completed_at: String,
}

#[tauri::command]
pub fn get_daily_totals(
    db: tauri::State<'_, Database>,
    date: Option<String>,
) -> Result<DailyTotals, String> {
    let date = date.unwrap_or_else(today_local);
    let conn = db.conn()?;
    read_totals(&conn, &date)
}

#[tauri::command]
pub fn get_recent_activity(
    db: tauri::State<'_, Database>,
    limit: Option<i64>,
) -> Result<Vec<ActivityEntry>, String> {
    let limit = limit.unwrap_or(10).clamp(1, 100);
    let conn = db.conn()?;
    let mut stmt = conn
        .prepare(
            "SELECT c.habit_id, h.name, h.points, c.date, c.completed_at
             FROM habit_completions c
             JOIN habits h ON h.id = c.habit_id
             ORDER BY c.date DESC, c.id DESC
             LIMIT ?1",
        )
        .map_err(|e| format!("failed to prepare recent activity query: {e}"))?;

    let rows = stmt
        .query_map([limit], |row| {
            Ok(ActivityEntry {
                habit_id: row.get(0)?,
                habit_name: row.get(1)?,
                points: row.get(2)?,
                date: row.get(3)?,
                completed_at: row.get(4)?,
            })
        })
        .map_err(|e| format!("failed to load recent activity: {e}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("failed to load recent activity: {e}"))
}

fn now_local() -> String {
    Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

fn validate_habit_input(name: &str, points: i64, priority: &str) -> Result<String, String> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err("habit name is required".to_string());
    }
    if points <= 0 {
        return Err("point reward must be greater than 0".to_string());
    }
    if !matches!(priority, "low" | "medium" | "high") {
        return Err(format!("invalid priority '{priority}'"));
    }
    Ok(name)
}

fn get_habit_entry(conn: &Connection, id: i64) -> Result<HabitEntry, String> {
    let today = today_local();
    conn.query_row(
        &format!(
            "SELECT {HABIT_COLUMNS},
                    EXISTS(
                        SELECT 1 FROM habit_completions c
                        WHERE c.habit_id = h.id AND c.date = ?1
                    ) AS completed
             FROM habits h WHERE h.id = ?2"
        ),
        rusqlite::params![today, id],
        habit_entry,
    )
    .map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => format!("habit {id} not found"),
        other => format!("failed to load habit {id}: {other}"),
    })
}

#[tauri::command]
pub fn create_habit(
    db: tauri::State<'_, Database>,
    name: String,
    description: Option<String>,
    requirement: Option<String>,
    points: i64,
    priority: Option<String>,
    icon: Option<String>,
) -> Result<HabitEntry, String> {
    let priority = priority.unwrap_or_else(|| "medium".to_string());
    let name = validate_habit_input(&name, points, &priority)?;
    let conn = db.conn()?;
    conn.execute(
        "INSERT INTO habits (name, description, requirement, icon, points, priority, sort_order, is_system)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6,
                 (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM habits), 0)",
        rusqlite::params![
            name,
            description.unwrap_or_default(),
            requirement.unwrap_or_default(),
            icon.unwrap_or_default(),
            points,
            priority
        ],
    )
    .map_err(|e| match e {
        rusqlite::Error::SqliteFailure(err, _)
            if err.code == rusqlite::ErrorCode::ConstraintViolation =>
        {
            format!("a habit named '{name}' already exists")
        }
        other => format!("failed to create habit '{name}': {other}"),
    })?;
    get_habit_entry(&conn, conn.last_insert_rowid())
}

/// Updates a habit. Built-in (system) habits only allow priority, description,
/// requirement, and icon changes; custom habits allow everything.
#[tauri::command]
pub fn update_habit(
    db: tauri::State<'_, Database>,
    id: i64,
    name: String,
    description: Option<String>,
    requirement: Option<String>,
    points: i64,
    priority: String,
    icon: Option<String>,
) -> Result<HabitEntry, String> {
    let name = validate_habit_input(&name, points, &priority)?;
    let conn = db.conn()?;
    let is_system: i64 = conn
        .query_row("SELECT is_system FROM habits WHERE id = ?1", [id], |row| {
            row.get(0)
        })
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => format!("habit {id} not found"),
            other => format!("failed to load habit {id}: {other}"),
        })?;

    if is_system != 0 {
        conn.execute(
            "UPDATE habits SET description = ?1, requirement = ?2, icon = ?3, priority = ?4
             WHERE id = ?5",
            rusqlite::params![
                description.unwrap_or_default(),
                requirement.unwrap_or_default(),
                icon.unwrap_or_default(),
                priority,
                id
            ],
        )
        .map_err(|e| format!("failed to update habit {id}: {e}"))?;
    } else {
        conn.execute(
            "UPDATE habits SET name = ?1, description = ?2, requirement = ?3, icon = ?4,
                    points = ?5, priority = ?6
             WHERE id = ?7",
            rusqlite::params![
                name,
                description.unwrap_or_default(),
                requirement.unwrap_or_default(),
                icon.unwrap_or_default(),
                points,
                priority,
                id
            ],
        )
        .map_err(|e| match e {
            rusqlite::Error::SqliteFailure(err, _)
                if err.code == rusqlite::ErrorCode::ConstraintViolation =>
            {
                format!("a habit named '{name}' already exists")
            }
            other => format!("failed to update habit {id}: {other}"),
        })?;
    }
    get_habit_entry(&conn, id)
}

#[tauri::command]
pub fn set_habit_archived(
    db: tauri::State<'_, Database>,
    id: i64,
    archived: bool,
) -> Result<HabitEntry, String> {
    let conn = db.conn()?;
    let archived_at = if archived { Some(now_local()) } else { None };
    let changed = conn
        .execute(
            "UPDATE habits SET archived = ?1, archived_at = ?2 WHERE id = ?3",
            rusqlite::params![archived as i64, archived_at, id],
        )
        .map_err(|e| format!("failed to update habit {id}: {e}"))?;
    if changed == 0 {
        return Err(format!("habit {id} not found"));
    }
    get_habit_entry(&conn, id)
}

/// Permanently deletes a custom habit and its entire completion history
/// (habit_completions cascade). Built-in habits can only be disabled.
/// Already-earned cumulative totals (XP, points, streaks, level) are
/// forward-only and are NOT retroactively changed.
/// Referencing custom achievements keep their row but become unevaluatable
/// (habit_id set to NULL → progress 0) so their unlock state is preserved.
#[tauri::command]
pub fn delete_habit(db: tauri::State<'_, Database>, id: i64) -> Result<(), String> {
    let mut conn = db.conn()?;
    let tx = conn
        .transaction()
        .map_err(|e| format!("failed to begin transaction: {e}"))?;

    let is_system: i64 = tx
        .query_row("SELECT is_system FROM habits WHERE id = ?1", [id], |row| {
            row.get(0)
        })
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => format!("habit {id} not found"),
            other => format!("failed to load habit {id}: {other}"),
        })?;
    if is_system != 0 {
        return Err("built-in habits can only be disabled, not deleted".to_string());
    }

    tx.execute(
        "UPDATE custom_achievements SET habit_id = NULL, updated_at = ?1 WHERE habit_id = ?2",
        rusqlite::params![now_local(), id],
    )
    .map_err(|e| format!("failed to detach custom achievements from habit {id}: {e}"))?;
    tx.execute("DELETE FROM habits WHERE id = ?1", [id])
        .map_err(|e| format!("failed to delete habit {id}: {e}"))?;

    tx.commit()
        .map_err(|e| format!("failed to commit habit deletion: {e}"))?;
    Ok(())
}
