use chrono::{Local, NaiveDate};
use rusqlite::Connection;
use serde::Serialize;

use crate::achievements::longest_streak_from_met_dates;
use crate::commands::goal_points;
use crate::db::Database;
use crate::streak::current_streak;

pub const CONDITION_TYPES: &[&str] = &[
    "total_xp",
    "total_points",
    "habits_completed",
    "habit_count",
    "current_streak",
    "longest_streak",
    "pages_read",
    "meditation_sessions",
    "chess_sessions",
    "practice_pad_sessions",
    "notes_created",
    "tasks_completed",
];

const HABIT_NAME_CONDITIONS: &[(&str, &str)] = &[
    ("pages_read", "Read Book"),
    ("meditation_sessions", "Meditation"),
    ("chess_sessions", "Chess"),
    ("practice_pad_sessions", "Practice Pad"),
];

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomAchievementEntry {
    pub id: i64,
    pub name: String,
    pub description: String,
    pub icon: String,
    pub condition_type: String,
    pub target: i64,
    pub habit_id: Option<i64>,
    pub habit_name: Option<String>,
    pub xp_reward: i64,
    pub point_reward: i64,
    pub progress: i64,
    pub unlocked: bool,
    pub unlocked_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

fn now_string() -> String {
    Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

fn validate_input(
    name: &str,
    condition_type: &str,
    target: i64,
    habit_id: Option<i64>,
) -> Result<String, String> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err("achievement name is required".to_string());
    }
    if !CONDITION_TYPES.contains(&condition_type) {
        return Err(format!("invalid condition type '{condition_type}'"));
    }
    if target <= 0 {
        return Err("target must be greater than 0".to_string());
    }
    if condition_type == "habit_count" && habit_id.is_none() {
        return Err("habit_count requires a habit reference".to_string());
    }
    Ok(name)
}

fn named_habit_count(conn: &Connection, habit_name: &str) -> Result<i64, String> {
    conn.query_row(
        "SELECT COUNT(*) FROM habit_completions c
         JOIN habits h ON h.id = c.habit_id
         WHERE h.name = ?1",
        [habit_name],
        |row| row.get(0),
    )
    .map_err(|e| format!("failed to count completions for '{habit_name}': {e}"))
}

fn met_dates(conn: &Connection, today: &str) -> Result<Vec<NaiveDate>, String> {
    let (min_goal, _) = goal_points(conn);
    let mut stmt = conn
        .prepare(
            "SELECT date FROM daily_totals
             WHERE points >= ?1 AND date <= ?2
             ORDER BY date ASC",
        )
        .map_err(|e| format!("failed to prepare met dates query: {e}"))?;
    let rows = stmt
        .query_map(rusqlite::params![min_goal, today], |row| {
            row.get::<_, String>(0)
        })
        .map_err(|e| format!("failed to query met dates: {e}"))?;
    let mut dates = Vec::new();
    for row in rows {
        let raw = row.map_err(|e| format!("failed to read met date: {e}"))?;
        dates.push(
            NaiveDate::parse_from_str(&raw, "%Y-%m-%d")
                .map_err(|e| format!("invalid date '{raw}' in daily_totals: {e}"))?,
        );
    }
    Ok(dates)
}

fn condition_progress(
    conn: &Connection,
    condition_type: &str,
    habit_id: Option<i64>,
    today: &str,
    today_naive: NaiveDate,
) -> Result<i64, String> {
    match condition_type {
        "total_xp" => conn
            .query_row("SELECT COALESCE(SUM(xp), 0) FROM daily_totals", [], |r| {
                r.get(0)
            })
            .map_err(|e| format!("failed to read total XP: {e}")),
        "total_points" => conn
            .query_row("SELECT COALESCE(SUM(points), 0) FROM daily_totals", [], |r| {
                r.get(0)
            })
            .map_err(|e| format!("failed to read total points: {e}")),
        "habits_completed" => conn
            .query_row("SELECT COUNT(*) FROM habit_completions", [], |r| r.get(0))
            .map_err(|e| format!("failed to count completions: {e}")),
        "habit_count" => {
            let id = habit_id.ok_or("habit_count requires a habit reference")?;
            conn.query_row(
                "SELECT COUNT(*) FROM habit_completions WHERE habit_id = ?1",
                [id],
                |r| r.get(0),
            )
            .map_err(|e| format!("failed to count habit {id} completions: {e}"))
        }
        "current_streak" => {
            let dates = met_dates(conn, today)?;
            let desc: Vec<NaiveDate> = dates.iter().rev().copied().collect();
            Ok(current_streak(&desc, today_naive).0)
        }
        "longest_streak" => {
            let dates = met_dates(conn, today)?;
            Ok(longest_streak_from_met_dates(&dates))
        }
        "notes_created" => conn
            .query_row("SELECT COUNT(*) FROM notes WHERE trashed_at IS NULL", [], |r| {
                r.get(0)
            })
            .map_err(|e| format!("failed to count notes: {e}")),
        "tasks_completed" => conn
            .query_row(
                "SELECT COUNT(*) FROM tasks WHERE completed_at IS NOT NULL",
                [],
                |r| r.get(0),
            )
            .map_err(|e| format!("failed to count completed tasks: {e}")),
        other => {
            if let Some((_, habit_name)) = HABIT_NAME_CONDITIONS.iter().find(|(c, _)| *c == other)
            {
                named_habit_count(conn, habit_name)
            } else {
                Err(format!("unknown condition type '{other}'"))
            }
        }
    }
}

fn apply_reward(conn: &Connection, date: &str, points: i64, xp: i64) -> Result<(), String> {
    if points == 0 && xp == 0 {
        return Ok(());
    }
    let updated = conn
        .execute(
            "UPDATE daily_totals SET points = points + ?2, xp = xp + ?3 WHERE date = ?1",
            rusqlite::params![date, points, xp],
        )
        .map_err(|e| format!("failed to apply reward to {date}: {e}"))?;
    if updated == 0 {
        conn.execute(
            "INSERT INTO daily_totals (date, points, xp) VALUES (?1, ?2, ?3)",
            rusqlite::params![date, points, xp],
        )
        .map_err(|e| format!("failed to insert reward row for {date}: {e}"))?;
    }
    Ok(())
}

struct RawRow {
    id: i64,
    name: String,
    description: String,
    icon: String,
    condition_type: String,
    target: i64,
    habit_id: Option<i64>,
    habit_name: Option<String>,
    xp_reward: i64,
    point_reward: i64,
    unlocked_at: Option<String>,
    created_at: String,
    updated_at: String,
}

fn read_rows(conn: &Connection) -> Result<Vec<RawRow>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT a.id, a.name, a.description, a.icon, a.condition_type, a.target,
                    a.habit_id, h.name, a.xp_reward, a.point_reward, a.unlocked_at,
                    a.created_at, a.updated_at
             FROM custom_achievements a
             LEFT JOIN habits h ON h.id = a.habit_id
             ORDER BY a.created_at ASC, a.id ASC",
        )
        .map_err(|e| format!("failed to prepare custom achievements query: {e}"))?;
    let rows = stmt
        .query_map([], |row| {
            Ok(RawRow {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                icon: row.get(3)?,
                condition_type: row.get(4)?,
                target: row.get(5)?,
                habit_id: row.get(6)?,
                habit_name: row.get(7)?,
                xp_reward: row.get(8)?,
                point_reward: row.get(9)?,
                unlocked_at: row.get(10)?,
                created_at: row.get(11)?,
                updated_at: row.get(12)?,
            })
        })
        .map_err(|e| format!("failed to query custom achievements: {e}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("failed to read custom achievements: {e}"))
}

/// Evaluate-on-read: computes progress for every custom achievement and unlocks
/// any whose target is met (persisting timestamp + applying one-time rewards).
/// An already-unlocked achievement never re-locks, even if its requirement is edited.
fn evaluate(conn: &Connection) -> Result<Vec<CustomAchievementEntry>, String> {
    let today = Local::now().date_naive().format("%Y-%m-%d").to_string();
    let today_naive = Local::now().date_naive();
    let now = now_string();

    let rows = read_rows(conn)?;
    let mut entries = Vec::with_capacity(rows.len());
    for row in rows {
        let progress = condition_progress(conn, &row.condition_type, row.habit_id, &today, today_naive)?;
        let mut unlocked_at = row.unlocked_at;
        if unlocked_at.is_none() && progress >= row.target {
            conn.execute(
                "UPDATE custom_achievements SET unlocked_at = ?1, updated_at = ?1 WHERE id = ?2",
                rusqlite::params![now, row.id],
            )
            .map_err(|e| format!("failed to unlock custom achievement {}: {e}", row.id))?;
            apply_reward(conn, &today, row.point_reward, row.xp_reward)?;
            unlocked_at = Some(now.clone());
        }
        entries.push(CustomAchievementEntry {
            id: row.id,
            name: row.name,
            description: row.description,
            icon: row.icon,
            condition_type: row.condition_type,
            target: row.target,
            habit_id: row.habit_id,
            habit_name: row.habit_name,
            xp_reward: row.xp_reward,
            point_reward: row.point_reward,
            progress,
            unlocked: unlocked_at.is_some(),
            unlocked_at,
            created_at: row.created_at,
            updated_at: row.updated_at,
        });
    }
    Ok(entries)
}

#[tauri::command]
pub fn list_custom_achievements(
    db: tauri::State<'_, Database>,
) -> Result<Vec<CustomAchievementEntry>, String> {
    let conn = db.conn()?;
    evaluate(&conn)
}

#[tauri::command]
pub fn create_custom_achievement(
    db: tauri::State<'_, Database>,
    name: String,
    description: Option<String>,
    icon: Option<String>,
    condition_type: String,
    target: i64,
    habit_id: Option<i64>,
    xp_reward: Option<i64>,
    point_reward: Option<i64>,
) -> Result<Vec<CustomAchievementEntry>, String> {
    let name = validate_input(&name, &condition_type, target, habit_id)?;
    let conn = db.conn()?;
    let now = now_string();
    conn.execute(
        "INSERT INTO custom_achievements
            (name, description, icon, condition_type, target, habit_id, xp_reward, point_reward, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)",
        rusqlite::params![
            name,
            description.unwrap_or_default(),
            icon.filter(|i| !i.trim().is_empty()).unwrap_or_else(|| "🏆".to_string()),
            condition_type,
            target,
            habit_id,
            xp_reward.unwrap_or(0).max(0),
            point_reward.unwrap_or(0).max(0),
            now
        ],
    )
    .map_err(|e| format!("failed to create custom achievement: {e}"))?;
    evaluate(&conn)
}

#[tauri::command]
pub fn update_custom_achievement(
    db: tauri::State<'_, Database>,
    id: i64,
    name: String,
    description: Option<String>,
    icon: Option<String>,
    condition_type: String,
    target: i64,
    habit_id: Option<i64>,
    xp_reward: Option<i64>,
    point_reward: Option<i64>,
) -> Result<Vec<CustomAchievementEntry>, String> {
    let name = validate_input(&name, &condition_type, target, habit_id)?;
    let conn = db.conn()?;
    let changed = conn
        .execute(
            "UPDATE custom_achievements SET
                name = ?1, description = ?2, icon = ?3, condition_type = ?4, target = ?5,
                habit_id = ?6, xp_reward = ?7, point_reward = ?8, updated_at = ?9
             WHERE id = ?10",
            rusqlite::params![
                name,
                description.unwrap_or_default(),
                icon.filter(|i| !i.trim().is_empty()).unwrap_or_else(|| "🏆".to_string()),
                condition_type,
                target,
                habit_id,
                xp_reward.unwrap_or(0).max(0),
                point_reward.unwrap_or(0).max(0),
                now_string(),
                id
            ],
        )
        .map_err(|e| format!("failed to update custom achievement {id}: {e}"))?;
    if changed == 0 {
        return Err(format!("custom achievement {id} not found"));
    }
    evaluate(&conn)
}

#[tauri::command]
pub fn delete_custom_achievement(db: tauri::State<'_, Database>, id: i64) -> Result<(), String> {
    let conn = db.conn()?;
    let changed = conn
        .execute("DELETE FROM custom_achievements WHERE id = ?1", [id])
        .map_err(|e| format!("failed to delete custom achievement {id}: {e}"))?;
    if changed == 0 {
        return Err(format!("custom achievement {id} not found"));
    }
    Ok(())
}
