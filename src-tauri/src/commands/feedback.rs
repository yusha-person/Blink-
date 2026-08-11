use chrono::Local;
use serde::Serialize;

use crate::db::Database;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FeedbackReportEntry {
    pub id: String,
    pub report_type: String,
    pub title: String,
    pub status: String,
    pub created_at: String,
}

fn row_to_report(row: &rusqlite::Row) -> rusqlite::Result<FeedbackReportEntry> {
    Ok(FeedbackReportEntry {
        id: row.get(0)?,
        report_type: row.get(1)?,
        title: row.get(2)?,
        status: row.get(3)?,
        created_at: row.get(4)?,
    })
}

#[tauri::command]
pub fn list_feedback_reports(
    db: tauri::State<'_, Database>,
) -> Result<Vec<FeedbackReportEntry>, String> {
    let conn = db.conn()?;
    let mut stmt = conn
        .prepare(
            "SELECT id, type, title, status, created_at FROM feedback_reports
             ORDER BY created_at DESC, id DESC",
        )
        .map_err(|e| format!("failed to prepare feedback query: {e}"))?;
    let rows = stmt
        .query_map([], row_to_report)
        .map_err(|e| format!("failed to list feedback reports: {e}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("failed to read feedback reports: {e}"))
}

#[tauri::command]
pub fn save_feedback_report(
    db: tauri::State<'_, Database>,
    id: String,
    report_type: String,
    title: String,
) -> Result<(), String> {
    if !matches!(report_type.as_str(), "feature" | "bug") {
        return Err(format!("invalid report type '{report_type}'"));
    }
    let conn = db.conn()?;
    conn.execute(
        "INSERT OR IGNORE INTO feedback_reports (id, type, title, status, created_at)
         VALUES (?1, ?2, ?3, 'Submitted', ?4)",
        rusqlite::params![
            id,
            report_type,
            title,
            Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
        ],
    )
    .map_err(|e| format!("failed to save feedback report: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn update_feedback_status(
    db: tauri::State<'_, Database>,
    id: String,
    status: String,
) -> Result<(), String> {
    let conn = db.conn()?;
    conn.execute(
        "UPDATE feedback_reports SET status = ?1 WHERE id = ?2",
        rusqlite::params![status, id],
    )
    .map_err(|e| format!("failed to update feedback status: {e}"))?;
    Ok(())
}
