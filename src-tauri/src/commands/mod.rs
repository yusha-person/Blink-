pub mod achievements;
pub mod calendar;
pub mod crypto;
pub mod custom_achievements;
pub mod data;
pub mod feedback;
pub mod habits;
pub mod journal;
pub mod notes;
pub mod statistics;
pub mod streaks;
pub mod tasks;
pub mod xp;

use rusqlite::Connection;

use crate::db::{migrations, Database};
use crate::streak::MIN_GOAL_POINTS;

pub const GOAL_MIN_SETTING_KEY: &str = "goals.min";
pub const GOAL_STRETCH_SETTING_KEY: &str = "goals.stretch";
pub const DEFAULT_STRETCH_GOAL_POINTS: i64 = 10;

fn read_goal_setting(conn: &Connection, key: &str) -> Option<i64> {
    conn.query_row(
        "SELECT value FROM settings WHERE key = ?1",
        [key],
        |row| row.get::<_, String>(0),
    )
    .ok()
    .and_then(|raw| raw.trim().parse::<i64>().ok())
}

/// Reads the customizable daily goals from the settings table.
/// Defaults to 8/10; clamps min >= 1 and stretch >= min so the pair is always sane.
pub fn goal_points(conn: &Connection) -> (i64, i64) {
    let min = read_goal_setting(conn, GOAL_MIN_SETTING_KEY)
        .unwrap_or(MIN_GOAL_POINTS)
        .max(1);
    let stretch = read_goal_setting(conn, GOAL_STRETCH_SETTING_KEY)
        .unwrap_or(DEFAULT_STRETCH_GOAL_POINTS)
        .max(min);
    (min, stretch)
}

#[tauri::command]
pub fn schema_version(db: tauri::State<'_, Database>) -> Result<u32, String> {
    let conn = db.conn()?;
    migrations::current_version(&conn)
}

#[tauri::command]
pub fn get_setting(db: tauri::State<'_, Database>, key: String) -> Result<Option<String>, String> {
    let conn = db.conn()?;
    conn.query_row(
        "SELECT value FROM settings WHERE key = ?1",
        [&key],
        |row| row.get(0),
    )
    .map(Some)
    .or_else(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => Ok(None),
        other => Err(format!("failed to read setting '{key}': {other}")),
    })
}

#[tauri::command]
pub fn set_setting(db: tauri::State<'_, Database>, key: String, value: String) -> Result<(), String> {
    let conn = db.conn()?;
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [&key, &value],
    )
    .map_err(|e| format!("failed to write setting '{key}': {e}"))?;
    Ok(())
}
