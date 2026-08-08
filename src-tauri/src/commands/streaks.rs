use chrono::{Local, NaiveDate};
use rusqlite::Connection;

use crate::commands::goal_points;
use crate::db::Database;
use crate::streak::{self, StreakInfo};

fn read_longest(conn: &Connection) -> Result<i64, String> {
    conn.query_row("SELECT longest FROM streaks WHERE id = 1", [], |row| {
        row.get(0)
    })
    .map_err(|e| format!("failed to read streaks row: {e}"))
}

fn met_dates_desc(conn: &Connection, today: &str, min_goal: i64) -> Result<Vec<NaiveDate>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT date FROM daily_totals
             WHERE points >= ?1 AND date <= ?2
             ORDER BY date DESC",
        )
        .map_err(|e| format!("failed to prepare streak query: {e}"))?;
    let rows = stmt
        .query_map(rusqlite::params![min_goal, today], |row| {
            row.get::<_, String>(0)
        })
        .map_err(|e| format!("failed to query met dates: {e}"))?;

    let mut dates = Vec::new();
    for row in rows {
        let raw = row.map_err(|e| format!("failed to read met date: {e}"))?;
        let parsed = NaiveDate::parse_from_str(&raw, "%Y-%m-%d")
            .map_err(|e| format!("invalid date '{raw}' in daily_totals: {e}"))?;
        dates.push(parsed);
    }
    Ok(dates)
}

/// Recomputes the streak from `daily_totals` (idempotent, data-driven), persists
/// the result in the `streaks` singleton row, and returns it. Evaluating on read
/// means app open (hydration) always applies the day-boundary break rule.
#[tauri::command]
pub fn get_streak(db: tauri::State<'_, Database>) -> Result<StreakInfo, String> {
    let today = Local::now().date_naive();
    let today_str = today.format("%Y-%m-%d").to_string();

    let mut conn = db.conn()?;
    let tx = conn
        .transaction()
        .map_err(|e| format!("failed to begin streak transaction: {e}"))?;

    let (min_goal, _) = goal_points(&tx);
    let dates = met_dates_desc(&tx, &today_str, min_goal)?;
    let stored_longest = read_longest(&tx)?;
    let info = streak::streak_info(&dates, stored_longest, today);

    tx.execute(
        "UPDATE streaks SET current = ?1, longest = ?2, last_met_date = ?3, last_evaluated = ?4
         WHERE id = 1",
        rusqlite::params![info.current, info.longest, &info.last_met_date, &today_str],
    )
    .map_err(|e| format!("failed to persist streak: {e}"))?;

    tx.commit()
        .map_err(|e| format!("failed to commit streak update: {e}"))?;
    Ok(info)
}
