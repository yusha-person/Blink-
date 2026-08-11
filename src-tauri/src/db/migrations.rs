use rusqlite::Connection;

pub struct Migration {
    pub version: u32,
    pub name: &'static str,
    pub sql: &'static str,
}

pub const MIGRATIONS: &[Migration] = &[
    Migration {
        version: 1,
        name: "initial schema: settings",
        sql: r#"
        CREATE TABLE IF NOT EXISTS settings (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
    "#,
    },
    Migration {
        version: 2,
        name: "habits, completions, daily totals, streaks",
        sql: r#"
        CREATE TABLE IF NOT EXISTS habits (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            name       TEXT NOT NULL UNIQUE,
            points     INTEGER NOT NULL CHECK (points > 0),
            sort_order INTEGER NOT NULL,
            archived   INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS habit_completions (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            habit_id     INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
            date         TEXT NOT NULL,
            completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (habit_id, date)
        );

        CREATE INDEX IF NOT EXISTS idx_habit_completions_date ON habit_completions(date);

        CREATE TABLE IF NOT EXISTS daily_totals (
            date   TEXT PRIMARY KEY,
            points INTEGER NOT NULL DEFAULT 0 CHECK (points >= 0),
            xp     INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0)
        );

        CREATE TABLE IF NOT EXISTS streaks (
            id              INTEGER PRIMARY KEY CHECK (id = 1),
            current         INTEGER NOT NULL DEFAULT 0 CHECK (current >= 0),
            longest         INTEGER NOT NULL DEFAULT 0 CHECK (longest >= 0),
            last_met_date   TEXT,
            last_evaluated  TEXT
        );

        INSERT INTO streaks (id, current, longest, last_met_date, last_evaluated)
        VALUES (1, 0, 0, NULL, NULL);

        INSERT INTO habits (name, points, sort_order) VALUES
            ('Read Book', 2, 1),
            ('Exercise', 2, 2),
            ('Read Article', 1, 3),
            ('Explain Article', 1, 4),
            ('Meditation', 1, 5),
            ('Artistic Session', 3, 6),
            ('Clean Room', 2, 7),
            ('Practice Pad', 2, 8),
            ('Metronome', 1, 9),
            ('Chess', 2, 10),
            ('Political Reading', 3, 11);
    "#,
    },
    Migration {
        version: 3,
        name: "notes, folders, tags, note_tags",
        sql: r#"
        CREATE TABLE IF NOT EXISTS folders (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            name       TEXT NOT NULL UNIQUE,
            sort_order INTEGER NOT NULL,
            is_system  INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS notes (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            folder_id   INTEGER NOT NULL REFERENCES folders(id),
            title       TEXT NOT NULL DEFAULT '',
            content     TEXT NOT NULL DEFAULT '',
            is_favorite INTEGER NOT NULL DEFAULT 0,
            is_private  INTEGER NOT NULL DEFAULT 0,
            trashed_at  TEXT,
            created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_notes_folder ON notes(folder_id);
        CREATE INDEX IF NOT EXISTS idx_notes_trashed ON notes(trashed_at);
        CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated_at);

        CREATE TABLE IF NOT EXISTS tags (
            id   INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE COLLATE NOCASE
        );

        CREATE TABLE IF NOT EXISTS note_tags (
            note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
            tag_id  INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
            PRIMARY KEY (note_id, tag_id)
        );

        INSERT INTO folders (name, sort_order, is_system) VALUES
            ('School', 1, 1),
            ('Programming', 2, 1),
            ('Music', 3, 1),
            ('Politics', 4, 1),
            ('Journal', 5, 1),
            ('Ideas', 6, 1),
            ('Personal', 7, 1),
            ('Quick Notes', 8, 1);
    "#,
    },
    Migration {
        version: 4,
        name: "journal entries",
        sql: r#"
        CREATE TABLE IF NOT EXISTS journal_entries (
            date       TEXT PRIMARY KEY,
            content    TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_journal_updated ON journal_entries(updated_at);
    "#,
    },
    Migration {
        version: 5,
        name: "achievements",
        sql: r#"
        CREATE TABLE IF NOT EXISTS achievements (
            key         TEXT PRIMARY KEY,
            unlocked_at TEXT NOT NULL
        );
    "#,
    },
    Migration {
        version: 6,
        name: "performance indexes",
        sql: r#"
        CREATE INDEX IF NOT EXISTS idx_note_tags_tag ON note_tags(tag_id);
        CREATE INDEX IF NOT EXISTS idx_notes_created_day ON notes(substr(created_at, 1, 10));
    "#,
    },
    Migration {
        version: 7,
        name: "tasks, nested folders, custom achievements",
        sql: r#"
        CREATE TABLE folders_new (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            name       TEXT NOT NULL,
            parent_id  INTEGER NOT NULL DEFAULT 0,
            sort_order INTEGER NOT NULL,
            is_system  INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (parent_id, name)
        );

        INSERT INTO folders_new (id, name, parent_id, sort_order, is_system, created_at)
            SELECT id, name, 0, sort_order, is_system, created_at FROM folders;

        DROP TABLE folders;
        ALTER TABLE folders_new RENAME TO folders;

        CREATE TABLE IF NOT EXISTS tasks (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            title        TEXT NOT NULL,
            description  TEXT NOT NULL DEFAULT '',
            due_date     TEXT,
            priority     TEXT CHECK (priority IN ('low', 'medium', 'high')),
            completed_at TEXT,
            created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date);

        CREATE TABLE IF NOT EXISTS custom_achievements (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            name           TEXT NOT NULL,
            description    TEXT NOT NULL DEFAULT '',
            icon           TEXT NOT NULL DEFAULT '🏆',
            condition_type TEXT NOT NULL CHECK (condition_type IN (
                'total_xp', 'total_points', 'habits_completed', 'habit_count',
                'current_streak', 'longest_streak', 'pages_read',
                'meditation_sessions', 'chess_sessions', 'practice_pad_sessions',
                'notes_created', 'tasks_completed'
            )),
            target         INTEGER NOT NULL CHECK (target > 0),
            habit_id       INTEGER REFERENCES habits(id),
            xp_reward      INTEGER NOT NULL DEFAULT 0 CHECK (xp_reward >= 0),
            point_reward   INTEGER NOT NULL DEFAULT 0 CHECK (point_reward >= 0),
            unlocked_at    TEXT,
            created_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
    "#,
    },
    Migration {
        version: 8,
        name: "task times, habit priority and metadata",
        sql: r#"
        ALTER TABLE tasks ADD COLUMN due_time TEXT;

        ALTER TABLE habits ADD COLUMN priority TEXT NOT NULL DEFAULT 'medium'
            CHECK (priority IN ('low', 'medium', 'high'));
        ALTER TABLE habits ADD COLUMN description TEXT NOT NULL DEFAULT '';
        ALTER TABLE habits ADD COLUMN requirement TEXT NOT NULL DEFAULT '';
        ALTER TABLE habits ADD COLUMN icon TEXT NOT NULL DEFAULT '';
        ALTER TABLE habits ADD COLUMN is_system INTEGER NOT NULL DEFAULT 1;
        ALTER TABLE habits ADD COLUMN archived_at TEXT;
    "#,
    },
    Migration {
        version: 9,
        name: "task-based achievements",
        sql: r#"
        CREATE TABLE custom_achievements_new (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            name             TEXT NOT NULL,
            description      TEXT NOT NULL DEFAULT '',
            icon             TEXT NOT NULL DEFAULT '🏆',
            condition_type   TEXT NOT NULL CHECK (condition_type IN (
                'total_xp', 'total_points', 'habits_completed', 'habit_count',
                'current_streak', 'longest_streak', 'pages_read',
                'meditation_sessions', 'chess_sessions', 'practice_pad_sessions',
                'notes_created', 'tasks_completed', 'task_requirement'
            )),
            target           INTEGER NOT NULL CHECK (target > 0),
            habit_id         INTEGER REFERENCES habits(id),
            combination_mode TEXT NOT NULL DEFAULT 'all'
                CHECK (combination_mode IN ('all', 'any')),
            xp_reward        INTEGER NOT NULL DEFAULT 0 CHECK (xp_reward >= 0),
            point_reward     INTEGER NOT NULL DEFAULT 0 CHECK (point_reward >= 0),
            unlocked_at      TEXT,
            created_at       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        INSERT INTO custom_achievements_new
            (id, name, description, icon, condition_type, target, habit_id,
             xp_reward, point_reward, unlocked_at, created_at, updated_at)
            SELECT id, name, description, icon, condition_type, target, habit_id,
                   xp_reward, point_reward, unlocked_at, created_at, updated_at
            FROM custom_achievements;

        DROP TABLE custom_achievements;
        ALTER TABLE custom_achievements_new RENAME TO custom_achievements;

        CREATE TABLE IF NOT EXISTS achievement_tasks (
            achievement_id INTEGER NOT NULL REFERENCES custom_achievements(id) ON DELETE CASCADE,
            task_id        INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
            PRIMARY KEY (achievement_id, task_id)
        );
    "#,
    },
    Migration {
        version: 10,
        name: "folder password protection",
        sql: r#"
        ALTER TABLE folders ADD COLUMN is_protected INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE folders ADD COLUMN password_hash TEXT;
        ALTER TABLE folders ADD COLUMN kdf_salt TEXT;
        ALTER TABLE folders ADD COLUMN wrapped_key_master TEXT;
        ALTER TABLE folders ADD COLUMN wrapped_key_folder TEXT;
    "#,
    },
    Migration {
        version: 11,
        name: "feedback report history",
        sql: r#"
        CREATE TABLE IF NOT EXISTS feedback_reports (
            id         TEXT PRIMARY KEY,
            type       TEXT NOT NULL CHECK (type IN ('feature', 'bug')),
            title      TEXT NOT NULL,
            status     TEXT NOT NULL DEFAULT 'Submitted',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
    "#,
    },
];

pub fn current_version(conn: &Connection) -> Result<u32, String> {
    conn.query_row("PRAGMA user_version", [], |row| row.get(0))
        .map_err(|e| format!("failed to read schema version: {e}"))
}

pub fn run_migrations(conn: &mut Connection) -> Result<(), String> {
    let mut version = current_version(conn)?;

    conn.execute_batch("PRAGMA foreign_keys = OFF")
        .map_err(|e| format!("failed to disable foreign keys for migrations: {e}"))?;

    for migration in MIGRATIONS {
        if migration.version <= version {
            continue;
        }
        let tx = conn
            .transaction()
            .map_err(|e| format!("failed to begin migration {}: {e}", migration.name))?;
        tx.execute_batch(migration.sql)
            .map_err(|e| format!("migration {} failed: {e}", migration.name))?;
        tx.execute_batch(&format!("PRAGMA user_version = {}", migration.version))
            .map_err(|e| format!("failed to bump schema version: {e}"))?;
        tx.commit()
            .map_err(|e| format!("failed to commit migration {}: {e}", migration.name))?;
        version = migration.version;
    }

    conn.execute_batch("PRAGMA foreign_keys = ON")
        .map_err(|e| format!("failed to re-enable foreign keys after migrations: {e}"))?;

    Ok(())
}
