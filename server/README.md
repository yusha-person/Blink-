# Blink Feedback Server

Small Bun HTTP backend for the in-app Features / Bugs reports.

## Run

```bash
bun run server          # listens on :4789, stores to server/feedback.db
```

Config via environment variables:

| Var | Default | Purpose |
|---|---|---|
| `BLINK_API_PORT` | `4789` | Listen port |
| `BLINK_DB_PATH` | `server/feedback.db` | SQLite file |
| `BLINK_ADMIN_TOKEN` | unset | Bearer token for status updates |

Point the desktop app at it with `BLINK_API_URL` (build-time env, e.g.
`BLINK_API_URL=https://feedback.example.com bun run tauri build`). Default:
`http://localhost:4789`.

## Endpoints

- `POST /api/reports` — submit `{name, type: feature|bug, title, description, expected?, steps?, version, os}`. Validates + sanitizes, rate-limits 5/hour/IP, honeypot field `website`. Returns `{id}` (`BLK-XXXXXXXX`).
- `GET /api/reports?name=X` — list a submitter's own reports (id/type/title/status/date).
- `PATCH /api/reports/:id/status` — admin status update (`Authorization: Bearer $BLINK_ADMIN_TOKEN`), statuses: Submitted, Reviewing, Planned, In Progress, Completed, Closed.
- `GET /api/health` — liveness.

No Blink user data (notes, tasks, habits, passwords) ever touches this server —
reports contain only the submitter's name and the report text.
