pub mod migrations;

use rusqlite::Connection;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};

pub const DB_FILE_NAME: &str = "lifexp.db";

pub struct Database {
    conn: Mutex<Connection>,
    path: PathBuf,
}

impl Database {
    pub fn connect(path: PathBuf) -> Result<Self, String> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("failed to create data directory: {e}"))?;
        }

        let mut conn =
            Connection::open(&path).map_err(|e| format!("failed to open database: {e}"))?;

        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA foreign_keys = ON;
             PRAGMA busy_timeout = 5000;",
        )
        .map_err(|e| format!("failed to configure database: {e}"))?;

        migrations::run_migrations(&mut conn)?;

        Ok(Self {
            conn: Mutex::new(conn),
            path,
        })
    }

    pub fn conn(&self) -> Result<MutexGuard<'_, Connection>, String> {
        self.conn
            .lock()
            .map_err(|e| format!("database lock poisoned: {e}"))
    }

    pub fn path(&self) -> &Path {
        &self.path
    }
}
