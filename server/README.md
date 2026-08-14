# Blink Feedback Server

Standalone Express + SQLite service for Features/Bugs reports, with a
password-protected admin panel at `/admin/`.

## Setup

```bash
bun server/setup-admin.ts <username> <password>   # prints env vars to set
```

## Run

```bash
BLINK_ADMIN_USER=admin \
BLINK_ADMIN_HASH='$argon2id$v=19$…' \
BLINK_SESSION_SECRET='…' \
bun run server
```

| Var | Default | Purpose |
|---|---|---|
| `BLINK_API_PORT` | `4789` | Listen port |
| `BLINK_DB_PATH` | `server/feedback.db` | SQLite file (needs persistent disk) |
| `BLINK_ADMIN_USER` | — | Admin username |
| `BLINK_ADMIN_HASH` | — | Argon2id PHC hash of the admin password |
| `BLINK_SESSION_SECRET` | random per boot | HMAC session signing key (set it, or sessions die on restart) |
| `BLINK_REQUIRE_HTTPS` | off | `1` = reject plain HTTP (enable behind your TLS proxy) |

The desktop app submits via its Rust layer only, to the URL baked in at build
time: `BLINK_API_URL=https://your-server bun run tauri build`.

## API

Public:
- `POST /api/reports` — `{type: bug|feature, title, description, contactEmail?, appVersion?, os?}`. Validated + sanitized, 10/min per IP. Returns `{id}` (`BLK-XXXXXXXX`).
- `GET /api/health`

Admin (session cookie, httpOnly + SameSite=strict, 24h):
- `POST /api/admin/login` — 5 attempts / 15 min / IP; generic "invalid credentials"
- `POST /api/admin/logout`
- `GET /api/admin/reports?type=&status=&q=&page=` — filter + search + paginate (25/page)
- `GET /api/admin/reports/:id`
- `PATCH /api/admin/reports/:id` — `{status: new|in-progress|resolved|wont-fix, adminNotes?}`
- `DELETE /api/admin/reports/:id`

## Deployment notes

- SQLite needs a **persistent disk** (VPS, or a PaaS volume — Fly.io/Railway/Render
  disk add-on). Avoid stateless serverless platforms for this service.
- Terminate TLS at a proxy (nginx/caddy) in front and set `BLINK_REQUIRE_HTTPS=1`.
