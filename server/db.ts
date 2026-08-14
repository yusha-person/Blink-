import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const DB_PATH = process.env.BLINK_DB_PATH ?? join(import.meta.dir, "feedback.db");

mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);
db.run(`CREATE TABLE IF NOT EXISTS reports (
  id            TEXT PRIMARY KEY,
  type          TEXT NOT NULL CHECK (type IN ('bug', 'feature')),
  title         TEXT NOT NULL,
  description   TEXT NOT NULL,
  contact_email TEXT,
  app_version   TEXT,
  os            TEXT,
  status        TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'in-progress', 'resolved', 'wont-fix')),
  admin_notes   TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
)`);

export function generateId(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  let suffix = "";
  for (const b of bytes) suffix += chars[b % chars.length];
  return `BLK-${suffix}`;
}
