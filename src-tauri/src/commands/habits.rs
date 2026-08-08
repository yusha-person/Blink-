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
    pub points: i64,
    pub sort_order: i64,
    pub archived: bool,
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

#[tauri::command]
pub fn list_habits(
    db: tauri::State<'_, Database>,
    date: Option<String>,
) -> Result<Vec<HabitEntry>, String> {
    let date = date.unwrap_or_else(today_local);
    let conn = db.conn()?;
    let mut stmt = conn
        .prepare(
            "SELECT h.id, h.name, h.points, h.sort_order, h.archived,
                    EXISTS(
                        SELECT 1 FROM habit_completions c
                        WHERE c.habit_id = h.id AND c.date = ?1
                    ) AS completed
             FROM habits h
             ORDER BY h.sort_order ASC, h.id ASC",
        )
        .map_err(|e| format!("failed to prepare habit query: {e}"))?;

    let rows = stmt
        .query_map([&date], |row| {
            Ok(HabitEntry {
                id: row.get(0)?,
                name: row.get(1)?,
                points: row.get(2)?,
                sort_order: row.get(3)?,
                archived: row.get::<_, i64>(4)? != 0,
                completed: row.get::<_, i64>(5)? != 0,
            })
        })
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
