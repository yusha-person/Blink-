use chrono::{Duration, Local};
use rusqlite::Connection;
use serde::Serialize;

use crate::db::Database;
use crate::xp::{self, LevelProgress};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct XpSummary {
    pub weekly_xp: i64,
    pub monthly_xp: i64,
}

fn sum_xp_since(conn: &Connection, since: &str) -> Result<i64, String> {
    conn.query_row(
        "SELECT COALESCE(SUM(xp), 0) FROM daily_totals WHERE date >= ?1",
        [since],
        |row| row.get(0),
    )
    .map_err(|e| format!("failed to sum XP since {since}: {e}"))
}

#[tauri::command]
pub fn get_xp_summary(db: tauri::State<'_, Database>) -> Result<XpSummary, String> {
    let today = Local::now().date_naive();
    let week_start = (today - Duration::days(6)).format("%Y-%m-%d").to_string();
    let month_start = (today - Duration::days(29)).format("%Y-%m-%d").to_string();
    let conn = db.conn()?;
    Ok(XpSummary {
        weekly_xp: sum_xp_since(&conn, &week_start)?,
        monthly_xp: sum_xp_since(&conn, &month_start)?,
    })
}

#[tauri::command]
pub fn get_level_progress(
    db: tauri::State<'_, Database>,
    total_xp: Option<i64>,
) -> Result<LevelProgress, String> {
    let total_xp = match total_xp {
        Some(xp) => xp,
        None => {
            let conn = db.conn()?;
            conn.query_row(
                "SELECT COALESCE(SUM(xp), 0) FROM daily_totals",
                [],
                |row| row.get(0),
            )
            .map_err(|e| format!("failed to sum total XP: {e}"))?
        }
    };
    Ok(xp::level_progress(total_xp))
}
