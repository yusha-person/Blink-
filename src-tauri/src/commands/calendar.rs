use std::collections::BTreeMap;

use rusqlite::{Connection, OptionalExtension};
use serde::Serialize;

use crate::crypto::{self, CryptoState};
use crate::db::Database;

use super::journal::JOURNAL_TEMPLATE;
use super::notes::LOCKED_NOTE_TITLE;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarDaySummary {
    pub date: String,
    pub points: i64,
    pub xp: i64,
    pub habits_completed: i64,
    pub journal_written: bool,
    pub notes_created: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarHabit {
    pub id: i64,
    pub name: String,
    pub points: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarJournal {
    pub date: String,
    pub content: String,
    pub updated_at: String,
    pub written: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarNote {
    pub id: i64,
    pub title: String,
    pub is_private: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarDayDetail {
    pub date: String,
    pub points: i64,
    pub xp: i64,
    pub habits: Vec<CalendarHabit>,
    pub journal: Option<CalendarJournal>,
    pub notes: Vec<CalendarNote>,
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

fn journal_is_written(content: &str) -> bool {
    let trimmed = content.trim();
    !trimmed.is_empty() && trimmed != JOURNAL_TEMPLATE.trim()
}

fn month_range(year: i64, month: i64) -> Result<(String, String), String> {
    if !(1..=12).contains(&month) {
        return Err(format!("invalid month {month}, expected 1-12"));
    }
    if !(1970..=9999).contains(&year) {
        return Err(format!("invalid year {year}"));
    }
    let (end_year, end_month) = if month == 12 {
        (year + 1, 1)
    } else {
        (year, month + 1)
    };
    Ok((
        format!("{year:04}-{month:02}-01"),
        format!("{end_year:04}-{end_month:02}-01"),
    ))
}

#[tauri::command]
pub fn get_calendar_month(
    db: tauri::State<'_, Database>,
    year: i64,
    month: i64,
) -> Result<Vec<CalendarDaySummary>, String> {
    let (start, end) = month_range(year, month)?;
    let conn = db.conn()?;
    let mut days: BTreeMap<String, CalendarDaySummary> = BTreeMap::new();

    let mut stmt = conn
        .prepare(
            "SELECT date, points, xp FROM daily_totals
             WHERE date >= ?1 AND date < ?2",
        )
        .map_err(|e| format!("failed to prepare calendar totals query: {e}"))?;
    let rows = stmt
        .query_map([&start, &end], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, i64>(2)?,
            ))
        })
        .map_err(|e| format!("failed to load calendar totals: {e}"))?;
    for row in rows {
        let (date, points, xp) =
            row.map_err(|e| format!("failed to load calendar totals: {e}"))?;
        let entry = days.entry(date.clone()).or_insert(CalendarDaySummary {
            date,
            points: 0,
            xp: 0,
            habits_completed: 0,
            journal_written: false,
            notes_created: 0,
        });
        entry.points = points;
        entry.xp = xp;
    }

    let mut stmt = conn
        .prepare(
            "SELECT date, COUNT(*) FROM habit_completions
             WHERE date >= ?1 AND date < ?2
             GROUP BY date",
        )
        .map_err(|e| format!("failed to prepare calendar completions query: {e}"))?;
    let rows = stmt
        .query_map([&start, &end], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
        })
        .map_err(|e| format!("failed to load calendar completions: {e}"))?;
    for row in rows {
        let (date, count) =
            row.map_err(|e| format!("failed to load calendar completions: {e}"))?;
        let entry = days.entry(date.clone()).or_insert(CalendarDaySummary {
            date,
            points: 0,
            xp: 0,
            habits_completed: 0,
            journal_written: false,
            notes_created: 0,
        });
        entry.habits_completed = count;
    }

    let mut stmt = conn
        .prepare(
            "SELECT date, content FROM journal_entries
             WHERE date >= ?1 AND date < ?2",
        )
        .map_err(|e| format!("failed to prepare calendar journal query: {e}"))?;
    let rows = stmt
        .query_map([&start, &end], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| format!("failed to load calendar journal entries: {e}"))?;
    for row in rows {
        let (date, content) =
            row.map_err(|e| format!("failed to load calendar journal entries: {e}"))?;
        if journal_is_written(&content) {
            let entry = days.entry(date.clone()).or_insert(CalendarDaySummary {
                date,
                points: 0,
                xp: 0,
                habits_completed: 0,
                journal_written: false,
                notes_created: 0,
            });
            entry.journal_written = true;
        }
    }

    let mut stmt = conn
        .prepare(
            "SELECT substr(created_at, 1, 10) AS day, COUNT(*) FROM notes
             WHERE trashed_at IS NULL AND day >= ?1 AND day < ?2
             GROUP BY day",
        )
        .map_err(|e| format!("failed to prepare calendar notes query: {e}"))?;
    let rows = stmt
        .query_map([&start, &end], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
        })
        .map_err(|e| format!("failed to load calendar notes: {e}"))?;
    for row in rows {
        let (date, count) = row.map_err(|e| format!("failed to load calendar notes: {e}"))?;
        let entry = days.entry(date.clone()).or_insert(CalendarDaySummary {
            date,
            points: 0,
            xp: 0,
            habits_completed: 0,
            journal_written: false,
            notes_created: 0,
        });
        entry.notes_created = count;
    }

    Ok(days.into_values().collect())
}

#[tauri::command]
pub fn get_calendar_day(
    db: tauri::State<'_, Database>,
    crypto: tauri::State<'_, CryptoState>,
    date: String,
) -> Result<CalendarDayDetail, String> {
    validate_date(&date)?;
    let conn = db.conn()?;
    let key = crypto.inner().key();

    let (points, xp) = read_day_totals(&conn, &date)?;
    let habits = read_day_habits(&conn, &date)?;
    let journal = read_day_journal(&conn, &date)?;
    let notes = read_day_notes(&conn, &date, key.as_ref())?;

    Ok(CalendarDayDetail {
        date,
        points,
        xp,
        habits,
        journal,
        notes,
    })
}

fn read_day_totals(conn: &Connection, date: &str) -> Result<(i64, i64), String> {
    conn.query_row(
        "SELECT points, xp FROM daily_totals WHERE date = ?1",
        [date],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )
    .or_else(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => Ok((0, 0)),
        other => Err(format!("failed to read daily totals for {date}: {other}")),
    })
}

fn read_day_habits(conn: &Connection, date: &str) -> Result<Vec<CalendarHabit>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT h.id, h.name, h.points
             FROM habit_completions c
             JOIN habits h ON h.id = c.habit_id
             WHERE c.date = ?1
             ORDER BY h.sort_order ASC, h.id ASC",
        )
        .map_err(|e| format!("failed to prepare calendar habits query: {e}"))?;
    let rows = stmt
        .query_map([date], |row| {
            Ok(CalendarHabit {
                id: row.get(0)?,
                name: row.get(1)?,
                points: row.get(2)?,
            })
        })
        .map_err(|e| format!("failed to load calendar habits: {e}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("failed to load calendar habits: {e}"))
}

fn read_day_journal(conn: &Connection, date: &str) -> Result<Option<CalendarJournal>, String> {
    conn.query_row(
        "SELECT date, content, updated_at FROM journal_entries WHERE date = ?1",
        [date],
        |row| {
            let content: String = row.get(1)?;
            Ok(CalendarJournal {
                date: row.get(0)?,
                written: journal_is_written(&content),
                content,
                updated_at: row.get(2)?,
            })
        },
    )
    .optional()
    .map_err(|e| format!("failed to load journal entry for {date}: {e}"))
}

fn read_day_notes(
    conn: &Connection,
    date: &str,
    key: Option<&[u8; crypto::KEY_LEN]>,
) -> Result<Vec<CalendarNote>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, title, is_private FROM notes
             WHERE trashed_at IS NULL AND substr(created_at, 1, 10) = ?1
             ORDER BY id ASC",
        )
        .map_err(|e| format!("failed to prepare calendar notes query: {e}"))?;
    let rows = stmt
        .query_map([date], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, i64>(2)? != 0,
            ))
        })
        .map_err(|e| format!("failed to load calendar notes: {e}"))?;
    let mut notes = Vec::new();
    for row in rows {
        let (id, raw_title, is_private) =
            row.map_err(|e| format!("failed to load calendar notes: {e}"))?;
        let title = if is_private {
            match key {
                Some(key) => crypto::decrypt(key, &raw_title)
                    .map_err(|e| format!("failed to decrypt note {id} title: {e}"))?,
                None => LOCKED_NOTE_TITLE.to_string(),
            }
        } else {
            raw_title
        };
        notes.push(CalendarNote {
            id,
            title,
            is_private,
        });
    }
    Ok(notes)
}
