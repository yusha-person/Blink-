# LifeXP — Phase Summaries

## Phase 1 — Project Setup & Shell ✅

**Verified 2026-08-08:** `bunx tsc --noEmit` clean, `bunx vite build` succeeds (195 KB JS / 12 KB CSS), production frontend serves correctly (smoke-tested via `vite preview`). Note: `cargo`/`tauri dev` cannot run in this build environment — Rust code is verified by careful review only; a `tauri dev` launch test should be done on a machine with the Rust toolchain.

Built:
- Tauri v2 + React 18 + TypeScript (Vite, strict TS) project; window "LifeXP" 1280x800 / min 900x600; placeholder icons.
- All deps: Tailwind v3, Zustand, react-router-dom (HashRouter), react-markdown, Recharts; Rust: rusqlite (bundled), chrono, argon2, aes-gcm, rand, base64.
- SQLite layer in Rust: `Database` (Mutex<Connection>), PRAGMAs (WAL, foreign_keys, busy_timeout), versioned migration system via `PRAGMA user_version`; migration v1 = `settings` table. DB at `lifexp.db` in `app_data_dir()`. Managed in `.setup()`, accessible via `tauri::State`.
- Commands so far: `schema_version`, `get_setting`, `set_setting`.
- App shell: fixed glass sidebar (`AppLayout`) with NavLinks to all 8 sections, HashRouter routing, thin page wrappers over `PagePlaceholder`.
- Theme system: dark default (`<html class="dark">`), light/dark toggle persisted to SQLite (`settings.theme`), hydrated in `App.tsx`; light = CSS base, dark via `dark:` variants.
- Reusable components: `StatCard`, `ProgressBar`, `SettingsSection`, `SettingsRow`, `ThemeToggle`, `icons.tsx` SVG set.
- Dashboard (placeholder zeros + goal bar) and Settings shell (5 sections, "Coming soon" badges) wired for later phases.

## Phase 2 — Habit Tracking ✅

**Verified 2026-08-08:** `bunx tsc --noEmit` clean, `bunx vite build` succeeds (200 KB JS / 13 KB CSS), 18/18 frontend unit tests pass (`bun test` on the XP + streak TS mirrors), and a 19-check bun:sqlite simulation of the exact Rust SQL passes: persistence across reopen, idempotent complete/uncomplete with clamped reversal, streak break/restart/survival rules, rolling XP windows, recent activity. All 9 commands registered in `lib.rs`. As with Phase 1, `cargo`/`tauri dev` is unavailable in this environment — Rust verified by review + SQL simulation; do a one-time `tauri dev` launch on a Rust-capable machine.

Built:
- Schema v2: `habits` (11 fixed v1 habits seeded, max 20 pts/day), `habit_completions` (UNIQUE habit+date, FK cascade, date index), `daily_totals` (points/xp, CHECK >= 0), `streaks` singleton row.
- Commands: `list_habits`, `complete_habit`/`uncomplete_habit` (transactional, idempotent via INSERT OR IGNORE / DELETE row-count, UPDATE-first `apply_delta` with `MAX(0,...)` clamp — upsert can't be used due to CHECK ordering), `get_daily_totals`, `get_recent_activity` (JOIN, LIMIT clamped 1..100), `get_streak` (evaluate-on-read, persists singleton), `get_level_progress`, `get_xp_summary` (rolling 7/30-day).
- XP engine (`xp.rs`): `XP(n) = 25(n-1)(n+2)`, 1 pt = 10 XP; streak engine (`streak.rs`): min goal 8 pts, anchor = today if met else yesterday, gaps break to 0, `longest = max(stored, current)`. Both have `#[cfg(test)]` unit tests cross-verified via TS mirrors (`src/utils/xp.ts`, `src/utils/streak.ts`, run with `bun test`).
- `habitStore` (Zustand): hydrated on app open (habits, totals, streak, level, XP summary, recent activity in parallel); `toggleHabit` writes SQLite first, then updates store and refreshes streak/summary/activity.
- Habits page: responsive `HabitCard` toggle grid + daily goal `ProgressBar` (min 8 marker / stretch 10 cap), per-card pending state, error banner. Dashboard fully wired: today's points/XP, goal bar, level + XP progress + XP-to-next, streak, last 7/30-day XP, recent activity — all update instantly on toggle.

Gotcha learned: `longest` streak is persisted incrementally by `get_streak` (called on open + after every toggle), so it only reflects streaks the app observed live — this is guaranteed in practice since meeting the goal requires toggling habits in-app, which always triggers `get_streak`.

## Phase 3 — Notes ✅

**Verified 2026-08-08:** `bunx tsc --noEmit` clean, `bunx vite build` succeeds (393 KB JS / 19 KB CSS), 31/31 frontend unit tests pass (`bun test` on xp/streak/text/wikiLinks mirrors + parser), and a 25-check bun:sqlite + node:crypto simulation of the exact Rust SQL and on-disk crypto format passes:

- **Autosave:** repeated debounced `update_note` writes persist across close/reopen (app restart), `created_at` unchanged while `updated_at` bumps. Editor layers (500ms debounce, blur flush, Ctrl+S, unmount flush, `flushingRef` guard, `lockKey` reset on lock transitions) verified by review.
- **Backlinks:** exact `get_backlinks` SQL finds direct + case-insensitive `[[links]]`, excludes self/trashed/private sources, returns empty for untitled targets; `get_note_by_title` matches case-insensitively but never partially.
- **Private notes unreadable on disk:** ciphertext stored as `enc1:` + base64(nonce[12] ‖ ct+tag) (AES-256-GCM); round-trips with the correct key, wrong key and tampering both rejected by the GCM auth tag, and a raw byte scan of the DB file finds no plaintext secrets (public notes confirmed present as a sanity control). Locked search never matches ciphertext (SQL excludes `is_private`); unlocked search matches decrypted content. `update_note` on a private note re-encrypts with a fresh nonce.

Built across 3.1–3.9:
- Schema v3: `folders` (8 seeded system folders incl. Quick Notes), `notes` (soft delete via nullable `trashed_at`, explicit Rust-set timestamps), `tags` (NOCASE unique), `note_tags` (cascade).
- Full notes command set (~20 commands): folder/note/tag CRUD, search (LIKE with `ESCAPE '\\'`), trash/restore/guarded permanent delete, favorites, wiki-link resolution + backlinks, privacy commands. Folder delete moves notes to Quick Notes; system folders protected; orphaned tags pruned.
- Three-pane Notes page (folder sidebar, searchable list, editor), lazy store hydration, debounced search, `NotesView` union (all/favorites/trash/folder/tag).
- Markdown editor: react-markdown + remark-gfm preview (custom remark plugin for `[[wiki links]]` via `lifexp-note:` protocol, `urlTransform` passthrough), word count, autosave layers, ConfirmDialog, tag chips with datalist, backlinks panel, unresolved-link click creates the note.
- Quick Notes hotkey Ctrl+Shift+N from any page (matches `e.code`, hydrates store first).
- Private notes: Argon2id (PHC verifier + KDF into 32-byte key), AES-256-GCM with random nonce per message, session-only `CryptoState` key (never in JS), masked titles/previews while locked, private rows excluded from search/wiki resolution until unlocked (decrypt-then-match in Rust), atomic password change re-encrypting all private notes in one transaction.

Same environment caveat as before: no `cargo` — Rust (including the argon2 0.5 / aes-gcm 0.10 APIs) verified by review + format-exact simulation; run `cargo check` + a `tauri dev` smoke test on a Rust-capable machine before release.

## Phase 4 — Calendar, Journal, Statistics ✅

**Verified 2026-08-08:** `bunx tsc --noEmit` clean, `bunx vite build` succeeds (~772 KB JS — recharts; code-splitting deferred to 5.7), 45/45 frontend unit tests pass (`bun test src/utils/`), and a 29-check bun:sqlite simulation (`/tmp/opencode/phase4_verify.ts`) seeded with 400 days of data verifies:

- **Charts match DB data:** `get_xp_history` mirror returns all `daily_totals` ASC; TS bucketing (`dailyBuckets`/`weeklyBuckets`/`monthlyBuckets`) matches SQL `SUM`/`GROUP BY` aggregates exactly per bucket (incl. zero-fill of activity gaps); `habitWeeklyBuckets` matches per-week completion counts (with the same `date <= today` filter the Rust command applies).
- **Heatmap renders a full year:** `heatmapWeeks(history, 53)` = 53 Monday-start weeks × 7 cells, one cell per covered day, first Monday ≥ 364 days back and last Sunday ≥ today; every in-range DB row maps to a cell with matching xp/points/level; `activityLevel` boundaries verified with crafted 79/80/99/100/149/150 XP days; future cells flagged; month labels on the first week and every Monday-month change (≥ 12 distinct labels).
- **Calendar merge:** `get_calendar_month` 4-query merge (totals, completions GROUP BY date, journal, notes) matches seeded data; template-only journal does NOT count as written; zero-activity days absent from summaries; day detail returns habits ordered by `sort_order`, trashed notes excluded, private note titles masked ("Private note") while locked.
- **Per-habit stats:** future completions excluded; current streak anchors on today-else-yesterday (5 in fixture), longest preserved from an earlier run (9); `days_tracked` from `substr(created_at,1,10)`; completion/last-30 rates and archived-habit exclusion all correct.

Built across 4.1–4.5:
- Schema v4: dedicated `journal_entries` table (date PK). Journal auto-creates today's entry from `JOURNAL_TEMPLATE` on app open (`INSERT OR IGNORE`, idempotent); JournalEditor reuses the NoteEditor layered-save pattern (500ms debounce, blur, Ctrl+S, unmount flush). Known v1 limitation: no day-rollover watcher if the app stays open past midnight.
- Calendar: `get_calendar_month` (BTreeMap merge, half-open month range, Dec wraps year) + `get_calendar_day`; CalendarPage Monday-start grid, today/selected styling, detail panel with journal MarkdownPreview + clickable notes (cross-store navigation into NotesPage); live refresh on habit toggles/journal edits via store subscriptions; race-guarded async loads.
- Statistics: `get_xp_history` + `get_habit_completion_stats` + `get_habit_detail_stats` (per-habit streaks via consecutive-run walk + binary-search anchor, mirroring the global streak engine); pure TS bucketing in `utils/statistics.ts` (all UTC-ms date math, injectable `now`); Recharts `XpBarChart` with theme-adaptive ticks + glass tooltip; StatCards, daily-30d/weekly-12w/monthly-12m charts, habit completion rate list.
- Contribution heatmap: pure CSS grid (no chart lib), 53 weeks, 5 intensity levels tied to domain goals (80 XP min goal / 100 XP stretch), Mon/Wed/Fri + month labels, native tooltips, Less/More legend, horizontal scroll on narrow windows.
- Habit Focus section: Reading (seed name "Read Book"), Meditation, Chess, Practice Pad cards with streak StatCards, rate bars, and 12-week completions charts; focus habit ids resolved by seed name at hydrate.

Same environment caveat as before: no `cargo` — Rust verified by review + exact SQL simulation; run `cargo check` + a `tauri dev` smoke test on a Rust-capable machine before release.

## Phase 5 — Polish ✅

**Verified 2026-08-08:** `bunx tsc --noEmit` clean (no ESLint configured in the project — strict `tsc` is the static check), `bunx vite build` succeeds (427 KB main JS + 369 KB lazy StatisticsPage chunk / 21 KB CSS), 45/45 bun tests pass. Full smoke test of all 8 routes against the production build served locally with a `__TAURI_INTERNALS__` stub (headless Chrome, realistic mock data): every page renders with expected content, zero console errors/unhandled commands, and CDP screenshots visually confirm Dashboard, Notes, Calendar, Statistics (charts + heatmap fully painted), Journal, Achievements, Settings, plus the Ctrl+Shift+P command palette and Ctrl+F global search overlays opened via real key dispatch. As with all phases: no `cargo` — `tauri build` must be run once on a Rust-capable machine.

Built:
- Achievements: `achievements` table (v5), pure evaluate-on-read engine (`achievements.rs`, 12 defs), `get_achievements` command (one transaction, INSERT-or-keep preserves unlock timestamps), `achievementStore` refreshed fire-and-forget after every habit toggle, AchievementsPage card grid with progress bars.
- Keyboard shortcuts + overlays: `useGlobalShortcuts` (Ctrl+N, Ctrl+Shift+N, Ctrl+F, Ctrl+Shift+P; matches `e.code`), `uiStore`, shared `OverlayDialog` shell, Command Palette (8 navigation + 5 context-aware actions, arrow-key nav with wrap + auto-scroll), Global Search (debounced across notes/journal/tags/folders/habits, race-guarded, privacy-aware).
- Settings completion: customizable min/stretch goals (`goals.min`/`goals.stretch`, threaded through `get_streak`/`get_achievements` + goalStore), backup database (WAL checkpoint + raw copy), JSON export/import (all 11 tables, one-transaction full replace), reset statistics / reset XP (confirm dialogs), change master password.
- Animations: pure CSS keyframes (page-in per-route via keyed `<Outlet/>` wrapper, overlay/dialog, checkbox pop), `prefers-reduced-motion` support.
- Performance: v6 indexes (`note_tags(tag_id)`, expression index on note created-day), per-field Zustand selectors everywhere, React.memo on hot components (HabitCard, DayCell, charts, heatmap, MarkdownPreview), debounced calendar live-sync, StatisticsPage code-split via React.lazy (recharts out of the main bundle).
