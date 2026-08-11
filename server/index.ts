import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const PORT = Number(process.env.BLINK_API_PORT ?? 4789);
const DB_PATH = process.env.BLINK_DB_PATH ?? join(import.meta.dir, "feedback.db");
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX = 5;

const VALID_STATUSES = [
  "Submitted",
  "Reviewing",
  "Planned",
  "In Progress",
  "Completed",
  "Closed",
] as const;

const LIMITS = {
  name: 100,
  title: 200,
  description: 5000,
  expected: 5000,
  steps: 5000,
  version: 50,
  os: 100,
};

mkdirSync(dirname(DB_PATH), { recursive: true });
const db = new Database(DB_PATH);
db.run(`CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('feature', 'bug')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  expected TEXT,
  steps TEXT,
  version TEXT NOT NULL,
  os TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Submitted',
  created_at TEXT NOT NULL
)`);

function generateId(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let suffix = "";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  for (const b of bytes) suffix += chars[b % chars.length];
  return `BLK-${suffix}`;
}

function sanitize(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "").trim();
  if (cleaned.length === 0 || cleaned.length > max) return null;
  return cleaned;
}

const rateBuckets = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const bucket = (rateBuckets.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (bucket.length >= RATE_LIMIT_MAX) {
    rateBuckets.set(ip, bucket);
    return true;
  }
  bucket.push(now);
  rateBuckets.set(ip, bucket);
  return false;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Bun.serve({
  port: PORT,
  routes: {
    "/api/health": { GET: () => json({ ok: true }) },
    "/api/reports": {
      POST: async (req, server) => {
        const ip = server.requestIP(req)?.address ?? "unknown";
        if (rateLimited(ip)) {
          return json({ error: "too many reports, try again later" }, 429);
        }

        let body: Record<string, unknown>;
        try {
          body = (await req.json()) as Record<string, unknown>;
        } catch {
          return json({ error: "invalid JSON body" }, 400);
        }

        // Honeypot: bots filling the hidden "website" field get a fake success.
        if (typeof body.website === "string" && body.website.length > 0) {
          return json({ id: generateId() }, 201);
        }

        const name = sanitize(body.name, LIMITS.name);
        const title = sanitize(body.title, LIMITS.title);
        const description = sanitize(body.description, LIMITS.description);
        const type = body.type === "feature" || body.type === "bug" ? body.type : null;
        const expected = body.expected == null ? null : sanitize(body.expected, LIMITS.expected);
        const steps = body.steps == null ? null : sanitize(body.steps, LIMITS.steps);
        const version = sanitize(body.version, LIMITS.version) ?? "unknown";
        const os = sanitize(body.os, LIMITS.os) ?? "unknown";

        if (!name) return json({ error: "name is required" }, 400);
        if (!type) return json({ error: "type must be 'feature' or 'bug'" }, 400);
        if (!title) return json({ error: "title is required" }, 400);
        if (!description) return json({ error: "description is required" }, 400);
        if (type === "bug" && !expected) {
          return json({ error: "expected behavior is required for bug reports" }, 400);
        }

        const id = generateId();
        db.run(
          `INSERT INTO reports (id, name, type, title, description, expected, steps, version, os, status, created_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'Submitted', ?10)`,
          [id, name, type, title, description, expected, steps, version, os, new Date().toISOString()],
        );
        return json({ id }, 201);
      },
      GET: (req) => {
        const url = new URL(req.url);
        const name = sanitize(url.searchParams.get("name"), LIMITS.name);
        if (!name) return json({ error: "name query parameter is required" }, 400);
        const rows = db
          .query(
            `SELECT id, type, title, status, created_at FROM reports
             WHERE name = ?1 ORDER BY created_at DESC LIMIT 100`,
          )
          .all(name);
        return json({ reports: rows });
      },
    },
    "/api/reports/:id/status": {
      // Simple admin hook for future status tracking; requires BLINK_ADMIN_TOKEN.
      PATCH: async (req) => {
        const token = process.env.BLINK_ADMIN_TOKEN;
        if (!token || req.headers.get("authorization") !== `Bearer ${token}`) {
          return json({ error: "unauthorized" }, 401);
        }
        let body: Record<string, unknown>;
        try {
          body = (await req.json()) as Record<string, unknown>;
        } catch {
          return json({ error: "invalid JSON body" }, 400);
        }
        const status = VALID_STATUSES.find((s) => s === body.status);
        if (!status) return json({ error: "invalid status" }, 400);
        const result = db.run("UPDATE reports SET status = ?1 WHERE id = ?2", [
          status,
          req.params.id,
        ]);
        if (result.changes === 0) return json({ error: "report not found" }, 404);
        return json({ ok: true });
      },
    },
  },
  fetch: () => json({ error: "not found" }, 404),
});

console.log(`Blink feedback server listening on http://localhost:${PORT}`);
