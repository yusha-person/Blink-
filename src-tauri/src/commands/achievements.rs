use std::collections::HashMap;

use chrono::{Local, NaiveDate};
use serde::Serialize;

use crate::achievements::{longest_streak_from_met_dates, AchievementStats, ACHIEVEMENTS};
use crate::commands::goal_points;
use crate::db::Database;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AchievementEntry {
    pub key: String,
    pub name: String,
    pub description: String,
    pub target: i64,
    pub progress: i64,
    pub unlocked: bool,
    pub unlocked_at: Option<String>,
}

/// Evaluates every achievement against current data (idempotent, evaluate-on-read),
/// persists newly unlocked ones with a timestamp, and returns the full list.
#[tauri::command]
pub fn get_achievements(db: tauri::State<'_, Database>) -> Result<Vec<AchievementEntry>, String> {
    let today = Local::now().date_naive().format("%Y-%m-%d").to_string();
    let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    let mut conn = db.conn()?;
    let tx = conn
        .transaction()
        .map_err(|e| format!("failed to begin achievements transaction: {e}"))?;

    let total_xp: i64 = tx
        .query_row("SELECT COALESCE(SUM(xp), 0) FROM daily_totals", [], |row| {
            row.get(0)
        })
        .map_err(|e| format!("failed to read total XP: {e}"))?;

    let total_completions: i64 = tx
        .query_row("SELECT COUNT(*) FROM habit_completions", [], |row| row.get(0))
        .map_err(|e| format!("failed to count completions: {e}"))?;

    let mut habit_counts: HashMap<String, i64> = HashMap::new();
    {
        let mut stmt = tx
            .prepare(
                "SELECT h.name, COUNT(c.id) FROM habits h
                 LEFT JOIN habit_completions c ON c.habit_id = h.id
                 GROUP BY h.id",
            )
            .map_err(|e| format!("failed to prepare habit counts query: {e}"))?;
        let rows = stmt
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
            })
            .map_err(|e| format!("failed to query habit counts: {e}"))?;
        for row in rows {
            let (name, count) =
                row.map_err(|e| format!("failed to read habit count row: {e}"))?;
            habit_counts.insert(name, count);
        }
    }

    let (min_goal, _) = goal_points(&tx);
    let mut met_dates: Vec<NaiveDate> = Vec::new();
    {
        let mut stmt = tx
            .prepare(
                "SELECT date FROM daily_totals
                 WHERE points >= ?1 AND date <= ?2
                 ORDER BY date ASC",
            )
            .map_err(|e| format!("failed to prepare met dates query: {e}"))?;
        let rows = stmt
            .query_map(rusqlite::params![min_goal, &today], |row| {
                row.get::<_, String>(0)
            })
            .map_err(|e| format!("failed to query met dates: {e}"))?;
        for row in rows {
            let raw = row.map_err(|e| format!("failed to read met date: {e}"))?;
            let parsed = NaiveDate::parse_from_str(&raw, "%Y-%m-%d")
                .map_err(|e| format!("invalid date '{raw}' in daily_totals: {e}"))?;
            met_dates.push(parsed);
        }
    }

    let stats = AchievementStats {
        total_xp,
        total_completions,
        habit_counts,
        longest_streak: longest_streak_from_met_dates(&met_dates),
    };

    let mut unlocked_map: HashMap<String, String> = HashMap::new();
    {
        let mut stmt = tx
            .prepare("SELECT key, unlocked_at FROM achievements")
            .map_err(|e| format!("failed to prepare unlocked query: {e}"))?;
        let rows = stmt
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|e| format!("failed to query unlocked achievements: {e}"))?;
        for row in rows {
            let (key, unlocked_at) =
                row.map_err(|e| format!("failed to read unlocked row: {e}"))?;
            unlocked_map.insert(key, unlocked_at);
        }
    }

    let mut entries = Vec::with_capacity(ACHIEVEMENTS.len());
    for def in ACHIEVEMENTS {
        let value = (def.value)(&stats);
        let existing = unlocked_map.get(def.key);
        let unlocked_at = if value >= def.target {
            match existing {
                Some(ts) => Some(ts.clone()),
                None => {
                    tx.execute(
                        "INSERT INTO achievements (key, unlocked_at) VALUES (?1, ?2)",
                        rusqlite::params![def.key, &now],
                    )
                    .map_err(|e| format!("failed to unlock '{}': {e}", def.key))?;
                    Some(now.clone())
                }
            }
        } else {
            None
        };
        entries.push(AchievementEntry {
            key: def.key.to_string(),
            name: def.name.to_string(),
            description: def.description.to_string(),
            target: def.target,
            progress: value,
            unlocked: unlocked_at.is_some(),
            unlocked_at,
        });
    }

    tx.commit()
        .map_err(|e| format!("failed to commit achievements: {e}"))?;
    Ok(entries)
}
