use chrono::{Duration, Local, NaiveDate};
use serde::Serialize;

use crate::db::Database;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyXpEntry {
    pub date: String,
    pub points: i64,
    pub xp: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HabitDetailStats {
    pub habit_id: i64,
    pub name: String,
    pub points: i64,
    pub days_tracked: i64,
    pub total_completions: i64,
    pub last30_completions: i64,
    pub completion_rate: f64,
    pub last30_rate: f64,
    pub current_streak: i64,
    pub longest_streak: i64,
    pub completion_dates: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HabitCompletionStats {
    pub habit_id: i64,
    pub name: String,
    pub points: i64,
    pub days_tracked: i64,
    pub total_completions: i64,
    pub last30_completions: i64,
    pub completion_rate: f64,
    pub last30_rate: f64,
}

#[tauri::command]
pub fn get_habit_detail_stats(
    db: tauri::State<'_, Database>,
    habit_id: i64,
) -> Result<HabitDetailStats, String> {
    let today = Local::now().date_naive();
    let since30 = (today - Duration::days(29)).format("%Y-%m-%d").to_string();
    let conn = db.conn()?;

    let (name, points, created_date): (String, i64, String) = conn
        .query_row(
            "SELECT name, points, substr(created_at, 1, 10) FROM habits WHERE id = ?1",
            [habit_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|e| format!("habit {habit_id} not found: {e}"))?;

    let mut stmt = conn
        .prepare(
            "SELECT date FROM habit_completions WHERE habit_id = ?1 AND date <= ?2 ORDER BY date ASC",
        )
        .map_err(|e| format!("failed to prepare habit detail query: {e}"))?;
    let today_str = today.format("%Y-%m-%d").to_string();
    let rows = stmt
        .query_map(rusqlite::params![habit_id, today_str], |row| row.get::<_, String>(0))
        .map_err(|e| format!("failed to query habit completions: {e}"))?;
    let mut dates: Vec<NaiveDate> = Vec::new();
    let mut date_strings: Vec<String> = Vec::new();
    for row in rows {
        let date_str = row.map_err(|e| format!("failed to read completion date: {e}"))?;
        let date = NaiveDate::parse_from_str(&date_str, "%Y-%m-%d")
            .map_err(|e| format!("bad completion date '{date_str}': {e}"))?;
        dates.push(date);
        date_strings.push(date_str);
    }

    let created = NaiveDate::parse_from_str(&created_date, "%Y-%m-%d")
        .map_err(|e| format!("bad created_at date '{created_date}': {e}"))?;
    let days_tracked = ((today - created).num_days() + 1).max(1);
    let window = days_tracked.min(30);
    let total = dates.len() as i64;
    let last30 = dates
        .iter()
        .filter(|d| d.format("%Y-%m-%d").to_string() >= since30)
        .count() as i64;
    let completion_rate = (total as f64 / days_tracked as f64).min(1.0);
    let last30_rate = (last30 as f64 / window as f64).min(1.0);

    let mut longest: i64 = 0;
    let mut run: i64 = 0;
    let mut prev: Option<NaiveDate> = None;
    for d in &dates {
        run = match prev {
            Some(p) if *d - p == Duration::days(1) => run + 1,
            _ => 1,
        };
        if run > longest {
            longest = run;
        }
        prev = Some(*d);
    }

    let contains = |d: NaiveDate| dates.binary_search(&d).is_ok();
    let mut current: i64 = 0;
    let anchor = if contains(today) {
        Some(today)
    } else if contains(today - Duration::days(1)) {
        Some(today - Duration::days(1))
    } else {
        None
    };
    if let Some(mut d) = anchor {
        while contains(d) {
            current += 1;
            d -= Duration::days(1);
        }
    }

    Ok(HabitDetailStats {
        habit_id,
        name,
        points,
        days_tracked,
        total_completions: total,
        last30_completions: last30,
        completion_rate,
        last30_rate,
        current_streak: current,
        longest_streak: longest,
        completion_dates: date_strings,
    })
}

#[tauri::command]
pub fn get_xp_history(db: tauri::State<'_, Database>) -> Result<Vec<DailyXpEntry>, String> {
    let conn = db.conn()?;
    let mut stmt = conn
        .prepare("SELECT date, points, xp FROM daily_totals ORDER BY date ASC")
        .map_err(|e| format!("failed to prepare XP history query: {e}"))?;
    let rows = stmt
        .query_map([], |row| {
            Ok(DailyXpEntry {
                date: row.get(0)?,
                points: row.get(1)?,
                xp: row.get(2)?,
            })
        })
        .map_err(|e| format!("failed to query XP history: {e}"))?;
    let mut entries = Vec::new();
    for row in rows {
        entries.push(row.map_err(|e| format!("failed to read XP history row: {e}"))?);
    }
    Ok(entries)
}

#[tauri::command]
pub fn get_habit_completion_stats(
    db: tauri::State<'_, Database>,
) -> Result<Vec<HabitCompletionStats>, String> {
    let today = Local::now().date_naive();
    let since30 = (today - Duration::days(29)).format("%Y-%m-%d").to_string();
    let conn = db.conn()?;
    let mut stmt = conn
        .prepare(
            "SELECT h.id, h.name, h.points, substr(h.created_at, 1, 10),
                    (SELECT COUNT(*) FROM habit_completions c WHERE c.habit_id = h.id),
                    (SELECT COUNT(*) FROM habit_completions c WHERE c.habit_id = h.id AND c.date >= ?1)
             FROM habits h
             WHERE h.archived = 0
             ORDER BY h.sort_order ASC",
        )
        .map_err(|e| format!("failed to prepare habit stats query: {e}"))?;
    let rows = stmt
        .query_map([&since30], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, i64>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, i64>(4)?,
                row.get::<_, i64>(5)?,
            ))
        })
        .map_err(|e| format!("failed to query habit stats: {e}"))?;

    let mut stats = Vec::new();
    for row in rows {
        let (habit_id, name, points, created_date, total, last30) =
            row.map_err(|e| format!("failed to read habit stats row: {e}"))?;
        let created = NaiveDate::parse_from_str(&created_date, "%Y-%m-%d")
            .map_err(|e| format!("bad created_at date '{created_date}': {e}"))?;
        let days_tracked = ((today - created).num_days() + 1).max(1);
        let window = days_tracked.min(30);
        let completion_rate = (total as f64 / days_tracked as f64).min(1.0);
        let last30_rate = (last30 as f64 / window as f64).min(1.0);
        stats.push(HabitCompletionStats {
            habit_id,
            name,
            points,
            days_tracked,
            total_completions: total,
            last30_completions: last30,
            completion_rate,
            last30_rate,
        });
    }
    Ok(stats)
}
