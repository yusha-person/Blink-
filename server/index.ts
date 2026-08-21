import crypto from "node:crypto";
import express, { type NextFunction, type Request, type Response } from "express";
import { argon2Verify } from "hash-wasm";
import { join } from "node:path";
import { SESSION_COOKIE, signSession, verifySession } from "./auth";
import { db, generateId } from "./db";

const PORT = Number(process.env.PORT ?? process.env.BLINK_API_PORT ?? 4789);
const ADMIN_USER = process.env.BLINK_ADMIN_USER;
const ADMIN_HASH = process.env.BLINK_ADMIN_HASH;
const REQUIRE_HTTPS = process.env.BLINK_REQUIRE_HTTPS === "1";

const LIMITS = { title: 200, description: 5000, contactEmail: 200, appVersion: 50, os: 100 };

// ---------------------------------------------------------------------------
// Rate limiting (in-memory, per IP)
// ---------------------------------------------------------------------------

type Bucket = number[];
const buckets = new Map<string, Bucket>();

function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= max) {
    buckets.set(key, hits);
    return true;
  }
  hits.push(now);
  buckets.set(key, hits);
  return false;
}

const reportLimiter = (req: Request, res: Response, next: NextFunction) => {
  if (rateLimit(`reports:${req.ip}`, 10, 60_000)) {
    return res.status(429).json({ error: "too many reports, try again later" });
  }
  next();
};

const loginLimiter = (req: Request, res: Response, next: NextFunction) => {
  if (rateLimit(`login:${req.ip}`, 5, 15 * 60_000)) {
    return res.status(429).json({ error: "too many login attempts, try again later" });
  }
  next();
};

// ---------------------------------------------------------------------------
// Sanitization — everything stored is escaped again on render in the admin UI.
// ---------------------------------------------------------------------------

function clean(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "").trim();
  return cleaned.length === 0 || cleaned.length > max ? null : cleaned;
}

function cleanOptional(value: unknown, max: number): string | null {
  if (value == null) return null;
  return clean(value, max);
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const cookieHeader = req.headers.cookie ?? "";
  const token = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
  if (!verifySession(token)) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
}

// ---------------------------------------------------------------------------

const app = express();
app.disable("x-powered-by");
if (REQUIRE_HTTPS) {
  app.set("trust proxy", true);
  app.use((req, res, next) => {
    if (!req.secure) {
      return res.status(403).json({ error: "HTTPS is required" });
    }
    next();
  });
}
app.use(express.json({ limit: "64kb" }));

// -- Public ----------------------------------------------------------------

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.post("/api/reports", reportLimiter, (req, res) => {
  const body = req.body as Record<string, unknown>;

  const type = body.type === "bug" || body.type === "feature" ? body.type : null;
  const title = clean(body.title, LIMITS.title);
  const description = clean(body.description, LIMITS.description);
  const contactEmail = cleanOptional(body.contactEmail, LIMITS.contactEmail);
  const appVersion = cleanOptional(body.appVersion, LIMITS.appVersion);
  const os = cleanOptional(body.os, LIMITS.os);

  if (!type) return res.status(400).json({ error: "type must be 'bug' or 'feature'" });
  if (!title) return res.status(400).json({ error: "title is required (max 200 chars)" });
  if (!description) {
    return res.status(400).json({ error: "description is required (max 5000 chars)" });
  }

  const id = generateId();
  const now = new Date().toISOString();
  db.run(
    `INSERT INTO reports (id, type, title, description, contact_email, app_version, os, status, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'new', ?8, ?8)`,
    [id, type, title, description, contactEmail, appVersion, os, now],
  );
  res.status(201).json({ id });
});

// -- Admin auth --------------------------------------------------------------

app.post("/api/admin/login", loginLimiter, async (req, res) => {
  if (!ADMIN_USER || !ADMIN_HASH) {
    return res.status(503).json({ error: "admin account is not configured" });
  }
  const { username, password } = req.body as { username?: unknown; password?: unknown };
  const generic = { error: "invalid credentials" };
  if (typeof username !== "string" || typeof password !== "string") {
    return res.status(401).json(generic);
  }
  const userMatches =
    Buffer.from(username).length === Buffer.from(ADMIN_USER).length &&
    crypto.timingSafeEqual(Buffer.from(username), Buffer.from(ADMIN_USER));
  let passwordMatches = false;
  try {
    passwordMatches = await argon2Verify({ password, hash: ADMIN_HASH });
  } catch {
    passwordMatches = false;
  }
  if (!userMatches || !passwordMatches) {
    return res.status(401).json(generic);
  }
  res.cookie(SESSION_COOKIE, signSession(ADMIN_USER), {
    httpOnly: true,
    secure: REQUIRE_HTTPS,
    sameSite: "strict",
    maxAge: 24 * 60 * 60 * 1000,
  });
  res.json({ ok: true });
});

app.post("/api/admin/logout", (_req, res) => {
  res.clearCookie(SESSION_COOKIE);
  res.json({ ok: true });
});

// -- Admin reports -----------------------------------------------------------

app.get("/api/admin/reports", requireAdmin, (req, res) => {
  const { type, status, q, page } = req.query;
  const conditions: string[] = [];
  const params: string[] = [];
  if (type === "bug" || type === "feature") {
    conditions.push("type = ?");
    params.push(type);
  }
  if (typeof status === "string" && ["new", "in-progress", "resolved", "wont-fix"].includes(status)) {
    conditions.push("status = ?");
    params.push(status);
  }
  if (typeof q === "string" && q.trim()) {
    conditions.push("(title LIKE ? OR description LIKE ?)");
    const pattern = `%${q.trim()}%`;
    params.push(pattern, pattern);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const pageNum = Math.max(1, Number(page) || 1);
  const perPage = 25;
  const total = (db.query(`SELECT COUNT(*) c FROM reports ${where}`).get(...params) as { c: number }).c;
  const rows = db
    .query(
      `SELECT id, type, title, status, created_at FROM reports ${where}
       ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, perPage, (pageNum - 1) * perPage);
  res.json({ reports: rows, total, page: pageNum, perPage });
});

app.get("/api/admin/reports/:id", requireAdmin, (req, res) => {
  const row = db.query("SELECT * FROM reports WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "report not found" });
  res.json(row);
});

app.patch("/api/admin/reports/:id", requireAdmin, (req, res) => {
  const { status, adminNotes } = req.body as { status?: unknown; adminNotes?: unknown };
  const updates: string[] = [];
  const params: (string | null)[] = [];
  if (status !== undefined) {
    if (typeof status !== "string" || !["new", "in-progress", "resolved", "wont-fix"].includes(status)) {
      return res.status(400).json({ error: "invalid status" });
    }
    updates.push("status = ?");
    params.push(status);
  }
  if (adminNotes !== undefined) {
    updates.push("admin_notes = ?");
    params.push(cleanOptional(adminNotes, 5000));
  }
  if (updates.length === 0) return res.status(400).json({ error: "nothing to update" });
  updates.push("updated_at = ?");
  params.push(new Date().toISOString());
  params.push(req.params.id);
  const result = db.run(`UPDATE reports SET ${updates.join(", ")} WHERE id = ?`, params);
  if (result.changes === 0) return res.status(404).json({ error: "report not found" });
  res.json({ ok: true });
});

app.delete("/api/admin/reports/:id", requireAdmin, (req, res) => {
  const result = db.run("DELETE FROM reports WHERE id = ?", [req.params.id]);
  if (result.changes === 0) return res.status(404).json({ error: "report not found" });
  res.json({ ok: true });
});

// -- Admin webpage (static, same service) -------------------------------------

app.use("/admin", express.static(join(import.meta.dir, "admin")));
app.get("/admin", (_req, res) => res.redirect("/admin/"));

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Blink feedback server listening on port ${PORT}`);
  console.log(`Admin panel: /admin/`);
  if (!ADMIN_USER || !ADMIN_HASH) {
    console.warn("WARNING: admin not configured — set BLINK_ADMIN_USER and BLINK_ADMIN_HASH (run: bun server/setup-admin.ts)");
  }
});
