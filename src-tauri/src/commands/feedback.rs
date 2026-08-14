use chrono::Local;
use serde::Serialize;

use crate::db::Database;

/// Build-time constant — the only destination this app ever talks to.
/// Set BLINK_API_URL at build time to point at the hosted backend.
pub const API_URL: &str = match option_env!("BLINK_API_URL") {
    Some(url) => url,
    None => "http://localhost:4789",
};

const RETRY_DELAYS_MIN: [i64; 4] = [1, 5, 15, 60];

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueuedReport {
    pub id: i64,
    pub report_type: String,
    pub title: String,
    pub status: String,
    pub server_id: Option<String>,
    pub attempts: i64,
    pub created_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SubmitOutcome {
    pub status: String, // "sent" | "queued"
    pub id: String,     // server id when sent, local id when queued
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RetrySummary {
    pub attempted: i64,
    pub sent: i64,
    pub still_queued: i64,
}

fn now_string() -> String {
    Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

fn validate_input(title: &str, description: &str) -> Result<(), String> {
    if title.trim().is_empty() || title.chars().count() > 200 {
        return Err("title is required (max 200 characters)".to_string());
    }
    if description.trim().is_empty() || description.chars().count() > 5000 {
        return Err("description is required (max 5000 characters)".to_string());
    }
    Ok(())
}

fn insert_pending(
    conn: &rusqlite::Connection,
    report_type: &str,
    title: &str,
    description: &str,
    contact_email: Option<&str>,
    app_version: Option<&str>,
    os: Option<&str>,
) -> Result<i64, String> {
    conn.execute(
        "INSERT INTO pending_reports
            (type, title, description, contact_email, app_version, os, status, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'pending', ?7, ?7)",
        rusqlite::params![
            report_type,
            title,
            description,
            contact_email,
            app_version,
            os,
            now_string()
        ],
    )
    .map_err(|e| format!("failed to queue report: {e}"))?;
    Ok(conn.last_insert_rowid())
}

struct PendingRow {
    id: i64,
    report_type: String,
    title: String,
    description: String,
    contact_email: Option<String>,
    app_version: Option<String>,
    os: Option<String>,
    attempts: i64,
}

fn read_pending(conn: &rusqlite::Connection, id: i64) -> Result<PendingRow, String> {
    conn.query_row(
        "SELECT id, type, title, description, contact_email, app_version, os, attempts
         FROM pending_reports WHERE id = ?1",
        [id],
        |row| {
            Ok(PendingRow {
                id: row.get(0)?,
                report_type: row.get(1)?,
                title: row.get(2)?,
                description: row.get(3)?,
                contact_email: row.get(4)?,
                app_version: row.get(5)?,
                os: row.get(6)?,
                attempts: row.get(7)?,
            })
        },
    )
    .map_err(|e| format!("queued report {id} not found: {e}"))
}

/// POSTs one queued report to the backend. Returns the server id on success.
async fn send_pending(row: &PendingRow) -> Result<String, String> {
    let client = tauri_plugin_http::reqwest::Client::new();
    let mut payload = serde_json::json!({
        "type": row.report_type,
        "title": row.title,
        "description": row.description,
    });
    if let Some(email) = &row.contact_email {
        payload["contactEmail"] = serde_json::Value::String(email.clone());
    }
    if let Some(version) = &row.app_version {
        payload["appVersion"] = serde_json::Value::String(version.clone());
    }
    if let Some(os) = &row.os {
        payload["os"] = serde_json::Value::String(os.clone());
    }

    let response = client
        .post(format!("{API_URL}/api/reports"))
        .json(&payload)
        .timeout(std::time::Duration::from_secs(15))
        .send()
        .await
        .map_err(|e| format!("request failed: {e}"))?;
    if !response.status().is_success() {
        return Err(format!("server returned {}", response.status()));
    }
    let body: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("invalid server response: {e}"))?;
    body.get("id")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| "server response missing report id".to_string())
}

fn mark_sent(conn: &rusqlite::Connection, id: i64, server_id: &str) -> Result<(), String> {
    conn.execute(
        "UPDATE pending_reports SET status = 'sent', server_id = ?1, last_error = NULL, updated_at = ?2
         WHERE id = ?3",
        rusqlite::params![server_id, now_string(), id],
    )
    .map_err(|e| format!("failed to mark report {id} sent: {e}"))?;
    Ok(())
}

fn mark_failed(conn: &rusqlite::Connection, row: &PendingRow, error: &str) -> Result<(), String> {
    let attempts = row.attempts + 1;
    let delay = RETRY_DELAYS_MIN[(attempts as usize).min(RETRY_DELAYS_MIN.len()) - 1];
    let next_retry = (Local::now() + chrono::Duration::minutes(delay))
        .format("%Y-%m-%d %H:%M:%S")
        .to_string();
    conn.execute(
        "UPDATE pending_reports SET status = 'failed', last_error = ?1, attempts = ?2,
                next_retry_at = ?3, updated_at = ?4
         WHERE id = ?5",
        rusqlite::params![error, attempts, next_retry, now_string(), row.id],
    )
    .map_err(|e| format!("failed to update report {}: {e}", row.id))?;
    Ok(())
}

#[tauri::command]
pub async fn submit_feedback_report(
    db: tauri::State<'_, Database>,
    report_type: String,
    title: String,
    description: String,
    contact_email: Option<String>,
    include_device_info: bool,
) -> Result<SubmitOutcome, String> {
    if !matches!(report_type.as_str(), "feature" | "bug") {
        return Err(format!("invalid report type '{report_type}'"));
    }
    let title = title.trim().to_string();
    let description = description.trim().to_string();
    validate_input(&title, &description)?;
    let contact_email = contact_email
        .map(|e| e.trim().to_string())
        .filter(|e| !e.is_empty());
    let (app_version, os) = if include_device_info {
        (Some(env!("CARGO_PKG_VERSION").to_string()), Some(std::env::consts::OS.to_string()))
    } else {
        (None, None)
    };

    let local_id = {
        let conn = db.conn()?;
        insert_pending(
            &conn,
            &report_type,
            &title,
            &description,
            contact_email.as_deref(),
            app_version.as_deref(),
            os.as_deref(),
        )?
    };

    let row = {
        let conn = db.conn()?;
        read_pending(&conn, local_id)?
    };

    match send_pending(&row).await {
        Ok(server_id) => {
            let conn = db.conn()?;
            mark_sent(&conn, local_id, &server_id)?;
            Ok(SubmitOutcome {
                status: "sent".to_string(),
                id: server_id,
            })
        }
        Err(e) => {
            let conn = db.conn()?;
            mark_failed(&conn, &row, &e)?;
            Ok(SubmitOutcome {
                status: "queued".to_string(),
                id: local_id.to_string(),
            })
        }
    }
}

#[tauri::command]
pub fn list_queued_reports(db: tauri::State<'_, Database>) -> Result<Vec<QueuedReport>, String> {
    let conn = db.conn()?;
    let mut stmt = conn
        .prepare(
            "SELECT id, type, title, status, server_id, attempts, created_at
             FROM pending_reports ORDER BY created_at DESC, id DESC",
        )
        .map_err(|e| format!("failed to prepare queue query: {e}"))?;
    let rows = stmt
        .query_map([], |row| {
            Ok(QueuedReport {
                id: row.get(0)?,
                report_type: row.get(1)?,
                title: row.get(2)?,
                status: row.get(3)?,
                server_id: row.get(4)?,
                attempts: row.get(5)?,
                created_at: row.get(6)?,
            })
        })
        .map_err(|e| format!("failed to list queued reports: {e}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("failed to read queued reports: {e}"))
}

/// Retries every queued report whose backoff window has elapsed.
/// Called on app launch and periodically by the frontend.
#[tauri::command]
pub async fn retry_pending_reports(db: tauri::State<'_, Database>) -> Result<RetrySummary, String> {
    let due_ids: Vec<i64> = {
        let conn = db.conn()?;
        let mut stmt = conn
            .prepare(
                "SELECT id FROM pending_reports
                 WHERE status != 'sent'
                   AND (next_retry_at IS NULL OR next_retry_at <= ?1)
                 ORDER BY id ASC",
            )
            .map_err(|e| format!("failed to prepare retry query: {e}"))?;
        let rows = stmt
            .query_map([&now_string()], |row| row.get::<_, i64>(0))
            .map_err(|e| format!("failed to list retryable reports: {e}"))?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("failed to read retryable reports: {e}"))?
    };

    let mut sent = 0;
    let mut failed = 0;
    for id in due_ids {
        let row = {
            let conn = db.conn()?;
            read_pending(&conn, id)?
        };
        match send_pending(&row).await {
            Ok(server_id) => {
                let conn = db.conn()?;
                mark_sent(&conn, id, &server_id)?;
                sent += 1;
            }
            Err(e) => {
                let conn = db.conn()?;
                mark_failed(&conn, &row, &e)?;
                failed += 1;
            }
        }
    }

    Ok(RetrySummary {
        attempted: sent + failed,
        sent,
        still_queued: failed,
    })
}
