# AGENTS.md — LifeXP build notes

## Environment
- Package manager: **bun** (v1.3.14). Use `bun install`, `bunx tsc --noEmit`, `bunx vite build`.
- **No cargo/rustc/node available in this environment.** Rust code in `src-tauri/` must be written carefully by hand; `cargo check` cannot be run here. Verify Rust code by review; verify frontend with `bunx tsc --noEmit` and `bunx vite build`.

## Conventions (decided in 1.1)
- Tauri **v2** (API + CLI ^2). Backend entry: `src-tauri/src/lib.rs` (`pub fn run()`), thin `main.rs`. Capabilities in `src-tauri/capabilities/default.json`.
- Vite dev server pinned to port 1420 (`strictPort`), matching `tauri.conf.json` devUrl.
- React 18 + strict TS (`noUnusedLocals`, `noUnusedParameters` on). JSX runtime: `react-jsx`.
- Window: title "LifeXP", 1280x800, min 900x600 (set in `src-tauri/tauri.conf.json`).
- Icons are placeholder solid-blue PNGs in `src-tauri/icons/` (generated, replace later if desired).
- Directory skeleton created per PLAN: `src/{components,pages,layouts,hooks,stores,database,utils,types,styles,assets}` and `src-tauri/src/{commands,db,crypto}` (empty dirs kept with `.gitkeep`).
- Base dark background `#0a0f1e` in `src/styles/global.css`; Tailwind theme to be layered in task 1.2.

## Task 1.2 notes
- All deps installed via bun: react-router-dom ^7, zustand ^5, react-markdown ^10, recharts ^3; Rust: rusqlite 0.31 (bundled), chrono, argon2 0.5, aes-gcm 0.10, rand, base64.
- Tailwind v3 (NOT v4) with `darkMode: "class"`. Theme palette in `tailwind.config.js`: `night-*` blues (#050a14–#26355c), `accent` (#3b82f6 family), `shadow-glass*`, `backdrop-blur-glass`.
- Reusable classes in `src/styles/global.css`: `.glass`, `.glass-sm`, `.glass-hover`, `.text-glow`. Body base: `bg-night-900 text-slate-200 select-none`.
- Verify with `bunx tsc --noEmit && bunx vite build` (both pass).

## Task 1.3 notes
- `src-tauri/src/db/mod.rs`: `Database` struct = `Mutex<Connection>`; `Database::connect(path)` creates parent dir, opens DB, sets PRAGMAs (`journal_mode=WAL`, `foreign_keys=ON`, `busy_timeout=5000`), runs migrations. `db.conn()?` returns `MutexGuard<Connection>` (lock errors → String).
- `src-tauri/src/db/migrations.rs`: versioned migrations via `PRAGMA user_version`; `MIGRATIONS` const array of `Migration { version, name, sql }` (each applied in a transaction, bumps user_version). Add future migrations by appending to `MIGRATIONS` — never edit shipped ones.
- Schema v1 = `settings` table (key TEXT PK, value TEXT). DB file: `lifexp.db` in `app_data_dir()` (identifier `com.lifexp.app`).
- `Database` is managed in `.setup()` (runs before UI) via `app.manage()`. Access in commands with `db: tauri::State<'_, Database>`.
- Commands module started: `src-tauri/src/commands/mod.rs` with `schema_version` command; registered in lib.rs `invoke_handler`.

## Task 1.4 notes
- Routing: `HashRouter` (works with Tauri file serving, no server needed) in `src/App.tsx`; all routes nested under `AppLayout` via `<Outlet />`.
- `src/layouts/AppLayout.tsx`: fixed 224px glass sidebar with `NavLink` items (active = `border-accent/50 bg-accent/15 text-accent`); main area scrolls (`overflow-y-auto`).
- Pages live in `src/pages/<Name>Page.tsx`, currently thin wrappers over `src/components/PagePlaceholder.tsx` (title + description).
- Nav icons from `src/components/icons.tsx` (SVG set created in 1.1, all 8 sections covered).

## Task 1.5 notes
- `src/components/StatCard.tsx`: reusable `StatCard` (label/value/hint glass-sm card) and `ProgressBar` (props: value, max, optional `marker` → white tick, e.g. min-goal marker on stretch-scaled bar). Dashboard uses these; goal bar = `ProgressBar value={pts} max={stretch} marker={min}`.
- `src/components/SettingsSection.tsx`: reusable `SettingsSection` (titled glass card, children divided by hairlines) + `SettingsRow` (label/description left, controls right).
- Settings page is a shell: Appearance, Goals, Private Notes, Data, About sections with "Coming soon" placeholder badges — wire real controls in 1.6 (theme), 3.9 (password), 5.5 (goals/data).
- Dashboard shows hardcoded 0 placeholders (min goal 8 / stretch 10 constants inline) — wire to real data in task 2.7.

## Task 1.6 notes
- Theming: Tailwind `darkMode: "class"`; **light is the CSS base, dark styles use `dark:` variants**. `<html>` starts with `class="dark"` (default theme) to avoid flash.
- `src/stores/themeStore.ts`: Zustand store; `hydrate()` reads `settings.theme` via `get_setting` command (default "dark"), `setTheme()` writes SQLite first then toggles `.dark` class + `colorScheme` on `<html>`. Hydrated once in `App.tsx` useEffect.
- Rust commands added: `get_setting(key) -> Option<String>`, `set_setting(key, value)` (upsert into settings table).
- `src/components/ThemeToggle.tsx`: segmented Dark/Light control (Sun/Moon icons in icons.tsx) used in Settings > Appearance.
- Light theme: body `bg-slate-100 text-slate-700`; glass classes have light bases + `dark:` overrides; `shadow-glass-light`/`glass-sm-light` in tailwind.config.js. When styling new components, write light colors first and add `dark:` variants (pattern: `text-slate-800 dark:text-slate-100`, `text-slate-600 dark:text-slate-300`, hints `text-slate-500`).

## Task 1.7 notes
- Phase 1 verified: `bunx tsc --noEmit` clean, `bunx vite build` passes, `vite preview` serves the production bundle. `tauri dev` launch NOT testable here (no cargo); do a one-time manual launch check on a Rust-capable machine.
- Phase summaries live in `docs/PHASES.md` (created).

## Task 2.1 notes
- Schema v2 (`src-tauri/src/db/migrations.rs`): `habits` (id, name UNIQUE, points, sort_order, archived, created_at), `habit_completions` (habit_id FK CASCADE, date TEXT, UNIQUE(habit_id, date), idx on date), `daily_totals` (date PK, points, xp), `streaks` (singleton row id=1: current, longest, last_met_date, last_evaluated).
- The 11 fixed v1 habits are SEEDED in the migration itself (INSERT in v2). Max possible = 20 pts/day.
- GOTCHA: SQLite rejects `strftime()` as a column DEFAULT (non-constant). `created_at`/`completed_at` use `DEFAULT CURRENT_TIMESTAMP`; the day-boundary-relevant `date` TEXT (YYYY-MM-DD local) is always supplied explicitly by Rust code via chrono.
- SQL verified by executing with `bun -e` + bun:sqlite (constraints, seeds, uniqueness all pass). No cargo available — same review+simulate verification approach for future Rust SQL.

## Task 2.2 notes
- `src-tauri/src/commands/habits.rs`: `list_habits(date?)` (habits + `completed` bool via EXISTS subquery), `complete_habit` / `uncomplete_habit` (transactional, idempotent via INSERT OR IGNORE / DELETE row-count), `get_daily_totals(date?)`. All default `date` to local today (`chrono::Local`, YYYY-MM-DD). Both return `DailyTotals` so the frontend can update stores from the response.
- `XP_PER_POINT = 10` const in habits.rs. DTOs (`HabitEntry`, `DailyTotals`) use `#[serde(rename_all = "camelCase")]`.
- GOTCHA: SQLite upsert (`ON CONFLICT DO UPDATE`) only intercepts UNIQUE/PK conflicts — CHECK constraints are validated on the *inserted* row first, so an upsert with negative delta values fails CHECK even when it would conflict-update. `apply_delta` therefore does UPDATE-first (with `MAX(0, ...)` clamp), then INSERT if no row matched.
- All SQL verified by simulating with bun:sqlite (award, reversal, idempotency, clamping, per-day isolation, list query). No cargo in env — Rust verified by review.

## Task 2.3 notes
- `src-tauri/src/xp.rs`: pure XP engine — `xp_for_level(n) = 25*(n-1)*(n+2)`, `level_for_xp` (largest n with threshold ≤ xp, clamps negatives to level 1), `level_progress` → `LevelProgress { level, totalXp, currentLevelXp, nextLevelXp, xpIntoLevel, xpToNextLevel, progressRatio }` (camelCase serde). `#[cfg(test)]` unit tests included but NOT runnable here (no cargo) — logic cross-verified via the TS mirror tests.
- Command `get_level_progress(total_xp?)` in `commands/xp.rs`: omitted arg = `SUM(xp)` over `daily_totals`; registered in lib.rs.
- TS mirror `src/utils/xp.ts` (same math, instant client-side use) + `src/utils/xp.test.ts` run with `bun test` (9 pass).
- GOTCHA: `bun:test` types aren't installed, so `tsconfig.json` excludes `src/**/*.test.ts` — keep test files matching that glob or tsc breaks. Run frontend tests with `bun test <file>`.

## Task 2.4 notes
- `src-tauri/src/streak.rs`: pure streak logic — `MIN_GOAL_POINTS = 8`, `current_streak(met_dates_desc, today)` walks a descending list of goal-met dates; anchor = today if met else yesterday (streak survives an unfinished today); any gap breaks to 0. `streak_info()` clamps `longest = max(stored, current)`. `#[cfg(test)]` tests cross-verified via the TS mirror.
- Command `get_streak` in `commands/streaks.rs`: recomputes from `daily_totals` (points >= 8, date <= today, ORDER BY date DESC) inside a transaction, persists the `streaks` singleton row, returns `StreakInfo { current, longest, lastMetDate, todayMet }`. Evaluate-on-read = idempotent, data-driven, safe against habit-toggle reversals; call it on app open (hydration) to apply the day-boundary break rule.
- TS mirror `src/utils/streak.ts` + `streak.test.ts` (9 pass via `bun test`). Date math uses UTC ms (`Date.parse(d + "T00:00:00Z")`) to avoid TZ drift.
- GOTCHA for 5.5: min goal is a hardcoded const (`streak.rs` + `streak.ts`); customizable goals must thread a setting through `get_streak` and the mirror.

## Task 2.5 notes
- `src/types/habits.ts`: `HabitEntry`, `DailyTotals`, `StreakInfo` interfaces matching the Rust camelCase DTOs.
- `src/stores/habitStore.ts`: Zustand store holding `habits`, `todayTotals`, `streak`, `level` (LevelProgress), `hydrated`, `error`. `hydrate()` runs `list_habits`, `get_daily_totals`, `get_streak`, `get_level_progress` in parallel (omit `date` args → Rust defaults to local today). Called in `App.tsx` useEffect alongside theme hydration — `get_streak` on open applies the day-boundary break rule.
- `toggleHabit(habitId)`: SQLite first (`complete_habit`/`uncomplete_habit` → returns fresh `DailyTotals`), then updates store; totalXp adjusted by the delta of today's xp (`totals.xp - previousXp`, idempotency-safe), level recomputed client-side via the `levelProgress` TS mirror, streak refreshed with a follow-up `get_streak` call.

## Task 2.7 notes
- New commands: `get_xp_summary` (commands/xp.rs → `XpSummary { weeklyXp, monthlyXp }`, rolling 7/30-day windows incl. today) and `get_recent_activity(limit?)` (commands/habits.rs → `ActivityEntry[]`, completions JOIN habits ORDER BY date DESC, id DESC, limit clamped 1..100, default 10). SQL verified with bun:sqlite. GOTCHA: negative SQLite LIMIT = unlimited — always clamp in Rust.
- `habitStore` extended with `xpSummary` + `recentActivity`, fetched in `hydrate()` and refreshed in `toggleHabit()` (parallel invokes alongside `get_streak`) so the Dashboard updates instantly on toggle.
- DashboardPage fully wired from the store (renders Loading… until `hydrated`); `dayLabel()` helper shows Today/Yesterday/short-date using UTC-ms date math (same pattern as streak.ts). "Weekly/Monthly XP" displayed as rolling "Last 7/30 Days XP".
- Min/stretch goal constants (8/10) still inline on DashboardPage + HabitsPage — 5.5 must thread a setting through both.

## Task 2.6 notes
- `src/pages/HabitsPage.tsx`: real page — header (x/y completed), error banner, Daily Goal glass section (`ProgressBar` value=points max=10 marker=8), grid of `HabitCard` buttons (1/2/3 cols responsive).
- HabitCard = `<button aria-pressed>`: checkbox span (accent-filled when done, `CheckIcon` added to icons.tsx), name, `+N` points badge. Completed state = `border-accent/50 bg-accent/10 text-accent`.
- Local `pendingId` state disables only the toggled card during the invoke; toggle errors surface via store `error` banner. Page renders a loading/error centered message until `hydrated`.
- Min/stretch goal constants (8/10) duplicated inline on HabitsPage like DashboardPage — 5.5 must thread a setting through both.

## Task 2.8 notes
- Phase 2 verified: `bunx tsc --noEmit` clean, `bunx vite build` passes, 18/18 TS mirror tests pass (`bun test src/utils/*.test.ts`), plus a 19-check bun:sqlite simulation (persistence across reopen, reversal idempotency/clamping, streak break/restart/survival, XP windows) — all pass.
- Verification pattern for Rust SQL without cargo: mirror the exact queries in a bun:sqlite script under `/tmp/opencode` and simulate multi-session scenarios (close/reopen the DB file = "restart").
- GOTCHA confirmed: `streaks.longest` is persisted incrementally by `get_streak` — simulating history must evaluate per-day like the real app (toggle → `get_streak`), otherwise stored longest lags. In-app this can't happen since every goal-met event triggers `get_streak`.

## Task 3.1 notes
- Schema v3 (`src-tauri/src/db/migrations.rs`): `folders` (id, name UNIQUE, sort_order, is_system, created_at), `notes` (id, folder_id FK, title, content, is_favorite, is_private, trashed_at NULL = not trashed, created_at, updated_at), `tags` (id, name UNIQUE COLLATE NOCASE), `note_tags` (note_id, tag_id, both FK CASCADE, composite PK). Indexes: `idx_notes_folder`, `idx_notes_trashed`, `idx_notes_updated`.
- The 8 default folders (School, Programming, Music, Politics, Journal, Ideas, Personal, Quick Notes) are SEEDED in the migration with `is_system = 1` (protected); user-created folders get `is_system = 0`. Quick Notes is looked up by name for Ctrl+Shift+N (3.8).
- Design decisions: soft delete = nullable `trashed_at` timestamp (filter `trashed_at IS NULL` for active notes). `notes.folder_id` FK has NO cascade — folder deletion policy (restrict vs move) is decided in 3.2. `updated_at` must be set explicitly by Rust on every update (no SQLite auto-update trigger).
- For 3.9: `is_private` flag is in place; when private, title+content will hold AES-256-GCM ciphertext (encrypt-then-store in Rust).
- SQL verified with bun:sqlite simulation (18 checks: seeds, soft delete, FK rejection, NOCASE tag uniqueness, cascades, idempotent reopen) — all pass.

## Task 3.2 notes
- `src-tauri/src/commands/notes.rs`: full notes command set — folders (`list_folders` w/ non-trashed note_count, `create_folder`, `rename_folder`, `delete_folder`), notes (`list_notes` w/ folder_id/favorites_only/trashed filters, `search_notes`, `get_note`, `create_note`, `update_note`, `move_note`, `set_favorite`, `trash_note`, `restore_note`, `delete_note_permanently`), tags (`list_tags` w/ note_count, `set_note_tags`). DTOs: `FolderEntry`, `NoteSummary` (preview = `substr(content,1,200)`, tags via GROUP_CONCAT), `NoteDetail` (summary + full content), `TagEntry` — all camelCase serde.
- Folder deletion policy (decided): system folders (`is_system=1`) can NOT be renamed or deleted; deleting a user folder MOVES all its notes (incl. trashed) to Quick Notes (const `QUICK_NOTES_FOLDER`), never deletes them.
- `delete_note_permanently` REFUSES non-trashed notes (must trash first) — safety guard for the 3.6 confirm dialog.
- `set_note_tags` replaces all tags transactionally: trims, dedupes case-insensitively, INSERT OR IGNORE into tags (NOCASE), re-links, then PRUNES orphaned tags (`DELETE FROM tags WHERE NOT EXISTS ...`).
- `search_notes`: LIKE with `ESCAPE '\\'` — user input escaped for `\`, `%`, `_` before wrapping in `%…%`; searches title+content, non-trashed only.
- Timestamps: notes `created_at`/`updated_at` are set explicitly by Rust via chrono Local ("%Y-%m-%d %H:%M:%S") on every mutation (schema default only a fallback). Ordering: `updated_at DESC, id DESC` (id tiebreak for same-second edits).
- Rust query helper pattern: `query_summaries(conn, where_clause, &[&dyn ToSql])` builds the GROUP_CONCAT list SQL; dynamic filters pushed as `Box<dyn ToSql>` then re-borrowed as `&dyn ToSql` for `query_map`.
- SQL verified with bun:sqlite simulation (33 checks: CRUD, dup folder rejection, FK, NOCASE tag dedupe/prune, LIKE escape, trash/restore/guard, cascade, folder-delete move) — all pass. `bunx tsc --noEmit` + `bunx vite build` pass.

## Task 3.3 notes
- `src/types/notes.ts`: `FolderEntry`, `NoteSummary`, `NoteDetail`, `TagEntry` matching the Rust camelCase DTOs.
- `src/stores/noteStore.ts`: Zustand store — `folders`, `notes`, `selectedFolderId` (null = All Notes), `selectedNote` (NoteDetail), `searchQuery`, `hydrated`, `error`. Hydrates lazily on first NotesPage visit (NOT in App.tsx like habitStore). `setSearchQuery` debounces (150ms, module-level timer) then `refreshNotes()` → `search_notes` when query non-empty else `list_notes(folderId)`. `selectFolder` clears the search query. `createNote` uses the selected folder, falling back to Quick Notes by name; clears search, refreshes folders (note counts) + list, selects the new note.
- `src/pages/NotesPage.tsx`: three-pane layout (`flex h-full gap-4 overflow-hidden` — works because `<main>` in AppLayout stretches to full height; panes scroll internally). Left: folder sidebar w/ note-count badges ("All Notes" + folders, active style = `border-accent/50 bg-accent/15 text-accent`). Middle: search input + new-note `+` button, note list items (title/"Untitled", `line-clamp-2` preview, smart timestamp: time if today, else short date). Right: read-only note viewer (title, folder/created/updated meta, `whitespace-pre-wrap` content) — 3.4 replaces this pane with the markdown editor.
- Timestamps from Rust are "%Y-%m-%d %H:%M:%S" local — parse with `new Date(ts.replace(" ", "T"))` (helpers `formatFullTimestamp`/`formatListTimestamp` in NotesPage).
- New icons in icons.tsx: `SearchIcon`, `FolderIcon`, `PlusIcon`. Inputs need `select-text` (body is `select-none`).
- Verified: `bunx tsc --noEmit` clean, `bunx vite build` passes.

## Task 3.4 notes
- Installed `remark-gfm` ^4 (needed for GFM checklists/tables; react-markdown v10 core has no GFM).
- `src/components/MarkdownPreview.tsx`: ReactMarkdown + remarkGfm with a typed `Components` map for styling (headings, lists, tables, blockquote, hr). GOTCHA: react-markdown v10 removed the `inline` prop on `code` — block code is detected via `language-*` className; anything else renders as inline code. GFM task-list items get `li.task-list-item` and a disabled `accent-accent` checkbox. Links render as styled `<span>` (offline app — no navigation).
- `src/components/NoteEditor.tsx`: replaces the NotesPage read-only viewer (mounted with `key={selectedNote.id}` to reset local state per note). Title input + mono textarea, Edit/Preview segmented toggle (new `EditIcon`/`EyeIcon` in icons.tsx), header meta = folder · Created · Updated · word count · save status (Saving…/Unsaved changes/Saved). Preview renders the LOCAL draft, so it's live.
- Saving in 3.4 is flush-on-blur via store `updateNote` (SQLite first, then store); 3.5 will layer debounced autosave + Ctrl+S on the same action. GOTCHA: `updateNote` only writes `selectedNote` if it's still the selected id (guard against blur-flush racing a note switch); it then calls `refreshNotes()` so list previews/order update.
- Timestamp helpers moved to `src/utils/timestamps.ts` (`parseTimestamp`, `formatFullTimestamp`, `formatListTimestamp`) — shared by NotesPage + NoteEditor. `countWords` in `src/utils/text.ts` with `text.test.ts` (4 pass, `bun test`).
- Verified: `bunx tsc --noEmit` clean, `bunx vite build` passes (370 KB JS / 16 KB CSS), `bun test src/utils/text.test.ts` 4/4.

## Task 3.5 notes
- NoteEditor saving layers (all funnel through one `flush()` callback → store `updateNote`, SQLite first): debounced autosave (500ms after last keystroke, `AUTOSAVE_DEBOUNCE_MS`), blur flush (title + textarea), Ctrl+S/Cmd+S (window keydown listener, scoped to the mounted editor; preventDefault), and an unmount flush so switching notes never loses pending edits (editor is keyed by note id, so a note switch unmounts it).
- `latestRef` mirrors `{noteId, title, content, dirty}` every render so timers/handlers never see stale state; `flushingRef` prevents concurrent saves. Typing during an in-flight save leaves `dirty` true after the store round-trip (note prop updates), which re-arms the autosave timer automatically.
- Save status line unchanged (Saving… / Unsaved changes / Saved); `saving` state is still local to the editor.

## Task 3.6 notes
- `noteStore` refactored: `selectedFolderId` replaced by `view: NotesView` = `{kind:"all"|"favorites"|"trash"} | {kind:"folder",folderId} | {kind:"tag",tag}`. `refreshNotes()` maps view → `list_notes` args (`favoritesOnly`/`trashed`/`folderId`); tag view filters client-side (NoteSummary.tags, case-insensitive). `refreshMeta()` = parallel `list_folders` + `list_tags`; called after any mutation affecting counts. Search overrides the current view (search_notes stays non-trashed only).
- New store actions (all SQLite-first): `setFavorite`, `setNoteTags`, `trashNote`, `restoreNote`, `deleteNotePermanently`. Trash deselects the note unless already in trash view (then re-fetches detail to show trashed state); restore/permanent-delete always deselect.
- Rust: `delete_note_permanently` now also prunes orphaned tags (same SQL as `set_note_tags`) since note_tags cascade leaves orphan tag rows.
- `src/components/ConfirmDialog.tsx`: reusable glass modal (backdrop click + Escape cancel, busy state, red confirm). Used for permanent delete inside NoteEditor.
- `src/components/NoteTags.tsx`: tag chips (click chip → tag view) + add input (Enter/comma/blur commits, Backspace on empty removes last) with native `<datalist>` suggestions from existing tags.
- NoteEditor: star favorite toggle (amber `StarIcon`, `fill="currentColor"` when active), trash button, tags row in header. Trashed note = amber banner with Restore / Delete permanently, title+textarea `readOnly`, dirty forced false, status shows "Read only".
- NotesPage sidebar: Folders / Collections (Favorites, Trash) / Tags sections via shared `SidebarButton`; list items show favorite star + up to 3 tag chips; `+` button disabled in trash view; per-view empty messages.
- New icons: `StarIcon`, `TrashIcon`, `TagIcon`, `RestoreIcon`, `XIcon`.
- GOTCHA: bun:sqlite `.run().changes` counts FK-cascaded child rows (a note delete with 2 tag links returns 3, not 1) — use `>= 1` in sims.
- Verified: `bunx tsc --noEmit` clean, `bunx vite build` passes, bun:sqlite sim (7 checks: delete guard, cascade, tag prune, restore, favorites filter) all pass.

## Task 3.7 notes
- `[[Note Title]]` wiki links: `src/utils/wikiLinks.ts` (`splitWikiLinks` pure parser — trims titles, empty/unclosed stay text; `wikiLinkUrl`/`parseWikiLinkUrl` round-trip via `lifexp-note:` protocol + encodeURIComponent) + `src/utils/remarkWikiLinks.ts` (custom remark plugin, manual mdast walk with local minimal `MdastNode` type — no unist-util-visit dep; text nodes split into link nodes, skips recursion into existing links, code/inlineCode untouched since they are not text nodes).
- GOTCHA: react-markdown v10 `defaultUrlTransform` strips unknown protocols — pass `urlTransform={(url) => url}` so `lifexp-note:` hrefs survive. `MarkdownPreview` takes optional `onNoteLink(title)`; its `a` renderer overrides `baseComponents.a` via useMemo and renders wiki links as accent buttons.
- Rust commands: `get_note_by_title(title) -> Option<NoteDetail>` (non-trashed, `title LIKE ? ESCAPE '\\'` = case-insensitive exact match, most-recently-updated wins) and `get_backlinks(note_id) -> Vec<NoteSummary>` (content LIKE `%[[title]]%` case-insensitive, excludes self + trashed sources + untitled targets). Shared `escape_like()` helper now also used by `search_notes`.
- Store: `backlinks` state fetched in parallel with `get_note` in `selectNote`; refreshed after `updateNote` (title changes move backlinks); cleared wherever `selectedNote` is cleared. `openNoteByTitle(title)`: opens existing note, else CREATES it (with that title) in Quick Notes — unresolved-link click = create (Obsidian-style).
- NoteEditor: always-visible Backlinks footer panel (LinkIcon added to icons.tsx) with clickable chips → `selectNote`; empty state shows the `[[title]]` syntax hint.
- Verified: `bunx tsc --noEmit` clean, `bunx vite build` passes, 31/31 bun tests pass (9 new wikiLinks tests), 11-check bun:sqlite sim of both new queries passes.

## Task 3.8 notes
- Quick Notes hotkey: `src/hooks/useQuickNoteHotkey.ts` — window keydown listener for Ctrl+Shift+N (also accepts Cmd; matches `e.code === "KeyN"`, NOT `e.key`, since Shift makes key uppercase "N"). Mounted in `AppLayout` (inside HashRouter, so `useNavigate` works); navigates to `/notes` then calls the store.
- Store action `noteStore.createQuickNote()`: hydrates the note store first if needed (hotkey works from any page before visiting Notes), finds Quick Notes by name, creates via `create_note`, then switches `view` to the Quick Notes folder, selects the new note, clears search. Module-level `quickNotePending` flag guards against double-fire while an invoke is in flight.
- Discoverability: NotesPage `+` button tooltip mentions the shortcut.
- Verified: `bunx tsc --noEmit` clean, `bunx vite build` passes.

## Task 3.9 notes
- Crypto (Rust only, no key material in JS): `src-tauri/src/crypto/mod.rs` — Argon2id (`argon2` 0.5: `hash_password`/`verify_password` for the PHC verifier, `hash_password_into` for KDF), AES-256-GCM (`aes-gcm` 0.10, random 12-byte nonce per message, `rand::rngs::OsRng`). Stored format: `enc1:` + base64(nonce ‖ ciphertext) in the `title`/`content` columns of private notes. `CryptoState(Mutex<Option<[u8;32]>>)` is managed app state = per-session key; locking just clears it.
- Settings keys: `crypto.password_hash` (PHC string), `crypto.kdf_salt` (base64 16-byte KDF salt). Key is derived from password+salt, so password change MUST re-encrypt every private note — done atomically in one transaction in `change_master_password` (decrypt old → encrypt new → update settings → commit; any failure rolls back).
- New commands (`src-tauri/src/commands/crypto.rs`): `get_privacy_status` (`PrivacyStatus { passwordSet, unlocked, privateCount }`), `setup_master_password` (auto-unlocks after setup, min 4 chars), `unlock_private_notes`, `lock_private_notes`, `change_master_password`. Plus `set_note_private(note_id, private)` in notes.rs (encrypts/decrypts in place, requires unlocked).
- notes.rs privacy integration: every query helper takes `key: Option<&[u8;32]>`; private rows are decrypted when unlocked, else masked (`LOCKED_NOTE_TITLE = "Private note"`, empty preview/content). GOTCHA: SQL `substr(content,1,200)` preview is garbage for ciphertext — for private notes the preview is recomputed in Rust by decrypting the FULL content then truncating chars (never decrypt a truncated ciphertext).
- `search_notes` SQL excludes private rows (`is_private = 0`); when unlocked, private notes are decrypted in Rust, substring-matched case-insensitively, appended, then the combined list is re-sorted by `updated_at DESC, id DESC`. `get_note_by_title` excludes private notes (wiki links can't resolve to locked titles — known v1 limitation). `get_backlinks` decrypts a private target's title when unlocked but only searches public sources.
- `update_note` on a private note re-encrypts title+content before UPDATE; errors if locked ("unlock private notes to edit this note") — locked edits can never overwrite ciphertext with plaintext.
- Frontend: `src/types/privacy.ts`, `src/stores/privacyStore.ts` (imports noteStore — one-way only — to refresh the list + re-select the open note after lock/unlock/privacy changes). `src/components/PrivacySettings.tsx` wired into Settings > Private Notes (setup form / unlock form / Lock now / change-password form). NoteEditor: lock toggle button in header (disabled w/ tooltip when no password or locked), locked private note = full-pane unlock form. NotesPage hydrates privacyStore and shows `LockIcon` on private list items. New icons: `LockIcon`, `UnlockIcon`.
- GOTCHA: NoteEditor keeps local title/content state keyed only by note id — after an in-place lock/unlock transition the stale state (e.g. masked "Private note") would flip `dirty` and autosave over the real content. Fixed with a `lockKey = "${id}:${locked}"` sync effect that resets local state on transitions.
- Verified: `bunx tsc --noEmit` clean, `bunx vite build` passes, 31/31 bun tests pass, 17-check bun:sqlite sim of all new SQL flows passes. No cargo — Rust crypto reviewed against argon2 0.5 / aes-gcm 0.10 / base64 0.22 / rand 0.8 APIs; do a `cargo check` on a Rust-capable machine before release.

## Task 3.10 notes
- Phase 3 verified: `bunx tsc --noEmit` clean, `bunx vite build` passes (393 KB JS / 19 KB CSS), 31/31 bun tests pass, 25-check sim (`/tmp/opencode/phase3_verify.ts` pattern) covers autosave persistence across reopen, backlinks SQL edge cases, wiki-link title resolution, LIKE escaping, and private-note disk safety.
- Crypto format cross-check technique: node:crypto `aes-256-gcm` reproduces the Rust `enc1:` format exactly (12-byte nonce ‖ ct+tag, base64) — wrong key and bit-flipped ciphertext both fail via GCM auth tag; raw DB byte scan confirms no plaintext leaks.
- Phase 3 summary appended to `docs/PHASES.md`.

## Task 4.1 notes
- Journal is a DEDICATED table, separate from notes: schema v4 `journal_entries` (date TEXT PK YYYY-MM-DD, content, created_at, updated_at) + `idx_journal_updated`. The notes "Journal" folder is unrelated.
- `src-tauri/src/commands/journal.rs`: `JOURNAL_TEMPLATE` const (## Today's XP / ## Wins / ## Lessons Learned / ## Improvements / ## Tomorrow's Goals), `get_or_create_today_journal` (INSERT OR IGNORE with template = idempotent auto-create), `get_journal(date)`, `update_journal(date, content)` (UPSERT; creating a past date does NOT use the template). `validate_date` enforces YYYY-MM-DD. Timestamps via chrono Local, same "%Y-%m-%d %H:%M:%S" pattern as notes.
- `src/stores/journalStore.ts`: holds only `todayEntry` + hydrated/error; `hydrate()` calls `get_or_create_today_journal` and runs in App.tsx useEffect (auto-create on first app open each day). `updateToday(content)` = SQLite first, then store.
- `src/components/JournalEditor.tsx` (mounted `key={todayEntry.date}`): same layered save pattern as NoteEditor 3.5 (500ms debounce, blur flush, Ctrl+S, unmount flush, latestRef/flushingRef). Edit/Preview via MarkdownPreview; `formatJournalDate` helper exported for reuse.
- Known v1 limitation: app left open past local midnight keeps showing yesterday's entry (no day-rollover watcher).
- Verified: 11-check bun:sqlite sim (auto-create idempotency, upsert, persistence across reopen), `bunx tsc --noEmit` clean, `bunx vite build` passes, 31/31 bun tests pass.

## Task 4.2 notes
- `src-tauri/src/commands/calendar.rs`: `get_calendar_month(year, month)` → `CalendarDaySummary[]` (only days WITH activity; merges 4 queries — daily_totals, completions GROUP BY date, journal, notes — into a BTreeMap; half-open `[start, end)` range computed by `month_range`, Dec wraps year). `get_calendar_day(date)` → `CalendarDayDetail` (totals default 0/0, completed habits ORDER BY sort_order, journal entry, notes created that day). Reuses `JOURNAL_TEMPLATE` + `LOCKED_NOTE_TITLE` consts from journal.rs/notes.rs.
- "Journal written" heuristic (`journal_is_written`): `content.trim()` non-empty AND != `JOURNAL_TEMPLATE.trim()` — auto-created template-only entries don't count as written (otherwise today would ALWAYS show a journal badge due to 4.1 auto-create).
- Calendar notes use `substr(created_at, 1, 10) = date` (created_at is "%Y-%m-%d %H:%M:%S" local), `trashed_at IS NULL`; private notes COUNT in summaries (count leaks nothing) but titles are decrypted only when unlocked, else masked `LOCKED_NOTE_TITLE` (same CryptoState session_key pattern as notes.rs).
- `src/types/calendar.ts` + `src/stores/calendarStore.ts`: cursor `year`/`month` (1-based), `days` map by date, lazy `hydrate()` on page mount (loads current month + auto-selects today). Race guards: module-level `monthRequest`/`detailRequest` counters — stale async responses are dropped. `todayLocalString()` helper exported (local YYYY-MM-DD, zero-padded; string compare works for date ordering, e.g. future-day dimming).
- CalendarPage: Monday-start grid (`leadingBlanks = (new Date(y, m-1, 1).getDay() + 6) % 7`, `daysInMonth = new Date(y, m, 0).getDate()`); today = accent circle on day number; selected = `border-accent/50 bg-accent/10`. Detail panel: points/XP glass-sm chips, habits list, journal MarkdownPreview (max-h-72 scroll; "Open journal" Link only when date == today since JournalPage only edits today), notes list clickable → `navigate("/notes")` + hydrate noteStore if needed + `selectView({kind:"all"})` + `selectNote(id)`.
- Live sync: CalendarPage useEffect on `habitStore.todayTotals` + `journalStore.todayEntry?.updatedAt` → `calendarStore.refresh()` (reloads month + selected detail) so habit toggles/journal edits reflect immediately.
- New icons: `ChevronLeftIcon`, `ChevronRightIcon`.
- bun:sqlite GOTCHA: `db.lastInsertRowid` returned 0 in sim scripts — use `SELECT last_insert_rowid()` instead.
- Verified: `bunx tsc --noEmit` clean, `bunx vite build` passes, 31/31 bun tests pass, 17-check bun:sqlite sim of both commands' queries (bounds, GROUP BY, template heuristic, trash/private filtering) passes.

## Task 4.3 notes
- `src-tauri/src/commands/statistics.rs`: `get_xp_history` (ALL `daily_totals` rows ASC — frontend aggregates) and `get_habit_completion_stats` (per non-archived habit: `days_tracked` = today − `substr(created_at,1,10)` + 1 (min 1, parsed with `NaiveDate`), total + last-30-day completion counts via correlated subqueries, `completion_rate`/`last30_rate` f64 clamped ≤ 1.0, window = `min(30, days_tracked)`). Registered in lib.rs.
- `src/utils/statistics.ts`: pure bucketing — `dailyBuckets` (continuous zero-filled range), `weeklyBuckets` (Monday-start via `(getUTCDay()+6)%7`, week label = Monday), `monthlyBuckets` (calendar months via year*12+month index, wraps years). All date math UTC-ms (`formatDay` = ISO slice), `now` injectable for tests. `statistics.test.ts` 7 pass (`bun test`).
- `src/stores/statisticsStore.ts`: lazy hydrate (module-level `hydratePromise` guard, NOT in App.tsx) fetching both commands in parallel.
- `src/components/XpBarChart.tsx`: Recharts BarChart wrapper — ticks `fill: "currentColor"` inside a `text-slate-500 dark:text-slate-400` wrapper (theme-adaptive SVG), custom glass `ChartTooltip` (recharts Tooltip `content` prop), Bar `fill="#3b82f6"`, `interval="preserveStartEnd"` + `minTickGap` for dense daily labels.
- StatisticsPage: StatCards (current/longest streak from habitStore, total XP/level, days-with-XP = history.length), daily-30d chart full width, weekly-12w + monthly-12m side by side, habit completion rates list (ProgressBar value=rate max=1, all-time % + last-30d %).
- GOTCHA: adding recharts jumps the bundle to ~772 KB JS — expected; code-splitting is a 5.7 concern, not now.
- Verified: `bunx tsc --noEmit` clean, `bunx vite build` passes, 7/7 bun tests pass, 13-check bun:sqlite sim of both queries (`/tmp/opencode/stats_43_verify.ts` pattern: ordering, archived exclusion, substr(created_at) date extraction, rate math, last-30 window) passes.

## Task 4.4 notes
- `src/utils/statistics.ts`: `heatmapWeeks(entries, weeks=53, now)` → `HeatmapWeek[]` (`{ monthLabel, cells[7] }`), Monday-start weeks ending with the current week (same `(getUTCDay()+6)%7` pattern as weeklyBuckets), UTC-ms date math, `inFuture` flag for cells after today. `monthLabel` = short month name on the first week and whenever the Monday's month changes (else null).
- `activityLevel(xp)` intensity 0–4 tied to domain constants: 0 = none, 1 = <80 XP, 2 = 80–99 (min goal met), 3 = 100–149 (stretch met), 4 = ≥150.
- `src/components/ContributionHeatmap.tsx`: pure CSS grid heatmap (no recharts) — month-label row, Mon/Wed/Fri weekday labels in a `grid-rows-7` column, one `grid-rows-7` column per week, cells = `h-3 w-3 rounded-[3px]` with level classes `bg-slate-900/10 dark:bg-white/5` → `bg-accent/25/45/70` → `bg-accent`, future cells `opacity-30`. Tooltip via native `title` attr. Less/More legend. Wrapped in `overflow-x-auto` with `inline-flex` so 53 weeks scroll horizontally on narrow windows.
- StatisticsPage: new "Activity — Last 12 Months" glass section between the daily chart and weekly/monthly charts; `heatmap = useMemo(() => heatmapWeeks(history, 53), [history])`.
- Verified: 12/12 bun tests in statistics.test.ts pass (4 new heatmap groups), `bunx tsc --noEmit` clean, `bunx vite build` passes.

## Task 4.5 notes
- New command `get_habit_detail_stats(habit_id)` in `commands/statistics.rs` → `HabitDetailStats` (extends completion stats with `currentStreak`, `longestStreak`, `completionDates` ASC). Per-habit streaks: dates ASC from `habit_completions` (filtered `date <= today`); longest = consecutive-day run walk; current = anchor today-else-yesterday then walk back with binary_search (same anchor rule as the global streak engine in `streak.rs`).
- TS: `HabitDetailStats` in types/statistics.ts extends `HabitCompletionStats`. `habitWeeklyBuckets(dates, weeks, now)` in utils/statistics.ts = Monday-start completions-per-week counts (XpBucket shape, xp field holds the count). Tests in statistics.test.ts (14 total pass).
- `XpBarChart` gained optional `unit` prop (default "XP") used by the tooltip.
- statisticsStore: new `focusStats` + exported `FOCUS_HABITS` const (`[{name, label}]`, maps seed name "Read Book" → display label "Reading"). hydrate() fetches history+habitStats first, resolves focus habit ids by NAME, then invokes detail in parallel.
- `src/components/HabitFocusCard.tsx` (label + detail props): streak StatCards, rate ProgressBar, 12-week completions chart (unit "days", height 120). StatisticsPage "Habit Focus" section (xl:grid-cols-2) sits between weekly/monthly charts and Habit Completion Rates; cards render only if the habit name resolves (find → null guard).
- Verified: `bunx tsc --noEmit` clean, `bunx vite build` passes, 14/14 bun tests pass, 9-check bun:sqlite sim of the new streak/rate math (`/tmp/opencode/verify_45.ts`) passes.

## Task 4.6 notes
- Phase 4 verified: `bunx tsc --noEmit` clean, `bunx vite build` passes, 45/45 bun tests pass, 29-check sim (`/tmp/opencode/phase4_verify.ts`) — seeded 400 days of `daily_totals`, focus-habit completions (5-day current + 9-day longest runs + a future completion), journal (written + template-only), notes (public/private/trashed). Charts match SQL aggregates per bucket; heatmap = 53×7 full-year grid with correct levels/labels/future flags; calendar merge + per-habit streak/rate math correct.
- Sim technique: import the real TS utils (`src/utils/statistics.ts`) directly in the bun script with an absolute path and compare their output against bun:sqlite mirrors of the Rust queries — verifies "charts match DB data" end-to-end without cargo.
- Sim gotchas hit: habit completions stats filter `date <= today` (mirror queries must too, or a future completion inflates the current week); `days_tracked`/`last30` rates depend on habit `created_at` — backdate it in sims (`UPDATE habits SET created_at = ...`) or the window degenerates to 1 day.
- Phase 4 summary appended to `docs/PHASES.md`.

## Task 5.1 notes
- Schema v5: `achievements` table (key TEXT PK, unlocked_at TEXT NOT NULL) — persists unlock timestamps only; evaluation is evaluate-on-read (like streaks).
- `src-tauri/src/achievements.rs`: pure engine — `AchievementDef { key, name, description, target, value: fn(&AchievementStats) -> i64 }` const array `ACHIEVEMENTS` (12 defs), `AchievementStats { total_xp, total_completions, habit_counts: HashMap<name,count>, longest_streak }`, `longest_streak_from_met_dates(asc)` walk. Level targets use `xp_for_level(5)`/`xp_for_level(10)` directly (const fn → 700/2700). `#[cfg(test)]` tests cross-verified via the bun:sqlite sim.
- Threshold decisions (plan was ambiguous): "Read N Pages" = N completions of "Read Book" (100/1000); Musician = 20 combined Practice Pad + Metronome sessions; Chess Player = 20 Chess completions; streak achievements use longest streak recomputed from `daily_totals` (independent of the incremental `streaks.longest` row).
- `get_achievements` (commands/achievements.rs): one transaction — SUM(xp), COUNT completions, LEFT JOIN per-habit counts, met-dates (points >= MIN_GOAL_POINTS, date <= today) for the streak walk, then INSERT-or-keep per def (existing timestamp preserved on re-eval). Returns `AchievementEntry[]` (key/name/description/target/progress/unlocked/unlockedAt, camelCase).
- Frontend: `src/types/achievements.ts`, `src/stores/achievementStore.ts` (lazy hydrate + `refresh()`, module-level promise guard). `habitStore.toggleHabit` fire-and-forgets `achievementStore.refresh()` after SQLite ops (one-way import habitStore → achievementStore) so unlock timestamps are recorded when earned, not on first page visit.
- AchievementsPage: unlocked x/12 header, responsive card grid (AchievementCard: icon circle = CheckIcon when unlocked else AchievementsIcon, ProgressBar value=min(progress,target), footer = unlock date via formatFullTimestamp or "progress / target").
- Verified: `bunx tsc --noEmit` clean, `bunx vite build` passes, 45/45 bun tests pass, 10-check bun:sqlite sim (`/tmp/opencode/verify_51.ts`: aggregates, gap-broken streak walk, LEFT JOIN zero counts, exact unlock set, idempotent re-eval, future-day exclusion) passes.

## Task 5.2 notes
- `src/hooks/useGlobalShortcuts.ts` (replaces `useQuickNoteHotkey.ts`, deleted): one window keydown listener for all global shortcuts, mounted in AppLayout. Matches `e.code` (NOT `e.key` — Shift changes key case) with `e.ctrlKey || e.metaKey`. Ctrl+N → new note, Ctrl+Shift+N → quick note, Ctrl+F → global search overlay, Ctrl+Shift+P → command palette toggle. Ctrl+S stays in NoteEditor/JournalEditor (scoped window listeners with preventDefault).
- New store action `noteStore.createNoteGlobal()`: hydrates note store if needed, switches out of trash view to "all" (the `+` button is disabled there), then `createNote()`. Works from any page.
- `src/stores/uiStore.ts`: overlay open state — `commandPaletteOpen`, `globalSearchOpen`, `toggleCommandPalette`, `openGlobalSearch` (opening one closes the other), `closeOverlays`. 5.3 fills CommandPalette with real actions; 5.4 fills GlobalSearch with real results.
- `src/components/OverlayDialog.tsx`: shared top-anchored modal shell (pt-24, max-w-lg glass panel, backdrop click + Escape close, aria-modal) used by `CommandPalette.tsx` and `GlobalSearch.tsx` — both are shells with autofocus input + "coming soon" hint until 5.3/5.4. Mounted in AppLayout.
- NotesPage `+` tooltip now mentions Ctrl+N.
- Verified: `bunx tsc --noEmit` clean, `bunx vite build` passes, 45/45 bun tests pass.

## Task 5.3 notes
- `src/components/CommandPalette.tsx` filled in: single `Command` list (`{id,title,section,keywords,hint?,icon,run}`) built in useMemo — 8 "Navigate" entries (Go to X, reusing the sidebar icons) + "Actions": New Note (Ctrl+N), New Quick Note (Ctrl+Shift+N), Global Search (Ctrl+F), Switch Theme (label/icon depend on current theme), and Lock Private Notes (only rendered when `privacyStatus.passwordSet && unlocked`).
- privacyStore is hydrated on palette open if not already (one-way store read, no noteStore dependency issue). Query/substring filter matches `title` + `keywords`; selected index clamps when the filtered list shrinks and auto-scrolls via `data-selected` + `scrollIntoView({block:"nearest"})`. ArrowUp/Down wrap modulo list length; Enter runs; runCommand closes the overlay FIRST then runs the action.
- Sections render with a header whenever `section` changes while mapping (single `lastSection` local, reset per render — safe because Navigate always precedes Actions).
- State (query/selectedIndex) is reset in an `open`-keyed effect since the component returns null when closed but stays mounted.
- GOTCHA: tsconfig `noUnusedLocals` — don't subscribe to store fields you only need inside callbacks; use `useStore.getState()` in effects/callbacks instead.
- Verified: `bunx tsc --noEmit` clean, `bunx vite build` passes.

## Task 5.4 notes
- `src/components/GlobalSearch.tsx` filled in: debounced (150ms) search across 5 sections — Notes (`search_notes`, already privacy-aware: locked private notes excluded from SQL, decrypted+matched in Rust when unlocked), Journal (new `search_journal` command), Tags/Folders (client-side substring filter of noteStore state), Habits (client-side filter of habitStore, archived excluded). Sections capped at `SECTION_LIMIT = 8` results each.
- New Rust command `search_journal(query)` in commands/journal.rs: LIKE with `ESCAPE '\\'` (local `escape_like` duplication of the notes.rs one), `ORDER BY date DESC`, and filters out template-only entries (`content.trim() == JOURNAL_TEMPLATE.trim()`) in Rust — otherwise searching e.g. "Wins" would match every auto-created untouched entry (same heuristic as calendar's `journal_is_written`).
- calendarStore gained `goToDate(date)` (loadMonth + selectDate + sets hydrated) — used when opening a past journal search result on the Calendar page; today's journal result navigates to /journal instead.
- Note results reuse the CalendarPage pattern: navigate("/notes") → hydrate noteStore if needed → `selectView({kind:"all"})` → `selectNote(id)`. Journal result titles use `formatJournalDate` exported from JournalEditor.tsx.
- Race guards in GlobalSearch: module-level `requestRef` counter (stale async responses dropped) — GOTCHA: the counter must also be bumped when the query is cleared, or an in-flight response can repopulate results after the list was emptied. Debounce timer kept in a ref, cleared on close/unmount.
- Result snippets: local `snippet()` flattens whitespace and centers a window around the match; date-only display for journal entries (never `formatFullTimestamp(...).split(" at ")` — locale output varies).
- Verified: `bunx tsc --noEmit` clean, `bunx vite build` passes, 45/45 bun tests pass, 8-check bun:sqlite sim of `search_journal` SQL (`/tmp/opencode/verify_54.ts`: LIKE escaping of `%`/`_`, template exclusion, DESC ordering, case-insensitivity) passes.

## Task 5.5 notes
- Customizable goals: settings keys `goals.min` / `goals.stretch` (defaults 8/10). Rust helper `goal_points(conn)` in `commands/mod.rs` reads them (clamps min >= 1, stretch >= min) and is threaded into `get_streak` (commands/streaks.rs) and `get_achievements` (commands/achievements.rs) — the hardcoded `MIN_GOAL_POINTS` const in streak.rs is now only the default. Frontend `src/stores/goalStore.ts` (hydrated in App.tsx) feeds DashboardPage, HabitsPage, and the heatmap thresholds; `setGoals` writes SQLite first, then re-hydrates habitStore (streak re-eval) and refreshes achievementStore.
- Heatmap thresholds parameterized: `activityLevel(xp, thresholds = {minXp: 80, stretchXp: 100})` and `heatmapWeeks(entries, weeks, now, thresholds)` — level 4 = `>= stretchXp * 1.5`. Defaults keep old tests valid; StatisticsPage passes `minGoal*10`/`stretchGoal*10`.
- No tauri-plugin-dialog in the project (no cargo to add deps): backup/export write timestamped files into `app_data_dir/backups|exports/` and `reveal_path` (new command using `tauri_plugin_opener::OpenerExt::reveal_item_in_dir`, no extra capability needed from Rust) opens the file manager. Import picks from `list_exports` (exports folder listing) instead of a file picker.
- New `src-tauri/src/commands/data.rs`: `backup_database` (PRAGMA wal_checkpoint(TRUNCATE) first so the raw .db copy is complete), `export_data` (all 11 tables, fixed column lists, `ORDER BY rowid`; format `{app:"lifexp", formatVersion:1, exportedAt, tables}`), `list_exports`, `import_data` (file_name validated against `/`, `\`, `..`; full replace in ONE transaction — DELETE children-first, INSERT parents-first with positional `?N` params from `Vec<rusqlite::types::Value>` via `params_from_iter`), `reveal_path` (restricted to app_data_dir), `reset_statistics` (clears completions/daily_totals/streaks/achievements), `reset_xp` (UPDATE daily_totals SET xp = 0).
- rusqlite GOTCHA: `params_from_iter` requires `Item: ToSql` — `(&str, Value)` named-param tuples do NOT implement ToSql; named-param `Params` impls only exist for fixed-size arrays/slices. Use positional `?N` for dynamic column lists.
- `Database` struct now stores its file `path` (accessor `db.path()`) for the backup copy.
- Frontend: `src/components/GoalSettings.tsx` (inputs default to store values via `input ?? String(goal)`, Save only when dirty) and `src/components/DataSettings.tsx` (ConfirmDialog for import/reset-statistics/reset-xp; after import/reset the app does `window.location.reload()` because several stores have module-level hydration guards — simplest correct re-hydration; locks private notes again, acceptable for destructive ops).
- Change master password was already shipped in 3.9 (PrivacySettings) — no new work needed.
- Verified: `bunx tsc --noEmit` clean, `bunx vite build` passes, 45/45 bun tests pass, 30-check bun:sqlite sim (`/tmp/opencode/verify_55.ts`: goal clamping, custom-min streak query, 11-table export dump, full import round-trip with FK integrity + ciphertext preservation, rollback on bad row, both resets) passes.

## Task 5.6 notes
- Animations are pure CSS in `src/styles/global.css` (no animation lib): keyframes `page-in` (fade + 6px rise, 180ms), `overlay-in` (backdrop fade, 150ms), `dialog-in` (fade + translateY(-6px) + scale .97, 180ms), `pop-in` (springy checkbox check, 160ms). Utility classes `.animate-page-in` etc. live in `@layer utilities`.
- Route transitions: AppLayout wraps `<Outlet />` in `<div key={location.pathname} className="animate-page-in h-full">` (keyed remount replays the animation per navigation). GOTCHA: the wrapper MUST keep `h-full` — pages (NotesPage, JournalPage, loading states) use `h-full` expecting `<main>`'s full height; without it the three-pane notes layout collapses.
- `animate-dialog-in`/`animate-overlay-in` applied in OverlayDialog + ConfirmDialog (all modals inherit). `animate-pop-in` on the HabitCard check icon span — conditional class on a persistent element re-triggers the animation on each toggle.
- `prefers-reduced-motion: reduce` media query disables all four animations AND forces `transition-duration: 0.01ms` globally.
- Verified: `bunx tsc --noEmit` clean, `bunx vite build` passes (795 KB JS / 21 KB CSS).

## Task 5.7 notes
- Schema v6 (performance indexes): `idx_note_tags_tag ON note_tags(tag_id)` (list_tags counts + tag pruning filtered by tag_id; the (note_id, tag_id) PK does NOT cover tag_id lookups) and `idx_notes_created_day ON notes(substr(created_at, 1, 10))` (expression index; calendar month/day notes queries). Both confirmed used via EXPLAIN QUERY PLAN in bun:sqlite. SQLite expression indexes work fine with rusqlite's bundled SQLite.
- Zustand perf rule now enforced: NEVER subscribe with whole-store `useXStore()` destructuring — use one selector per field (`useXStore((s) => s.field)`). Converted: DashboardPage, HabitsPage, StatisticsPage, CalendarPage, AchievementsPage, NotesPage.
- Memoized components (React.memo): `HabitCard` (toggle only recreates the toggled habit object, so only that card re-renders — requires the stable `useCallback` handleToggle in HabitsPage), `DayCell` (takes stable `selectDate` store action typed `(date) => Promise<void>`, called with `void`), `XpBarChart`, `ContributionHeatmap`, `HabitFocusCard`, `MarkdownPreview` (default export is now the memoized component; NoteEditor passes a stable `handleNoteLink` useCallback so memo isn't defeated).
- CalendarPage live-sync refresh (on todayTotals / journal updatedAt changes) is debounced 150ms with a setTimeout cleanup in the effect.
- Code splitting: StatisticsPage is `React.lazy` in App.tsx (only recharts consumer) wrapped in Suspense — recharts split into an async chunk; main bundle dropped 795 KB → 427 KB.
- Verified: `bunx tsc --noEmit` clean, `bunx vite build` passes, 45/45 bun tests pass, migration sim applies v1–v6 in order and v6 is idempotent on reopen.

## Task 5.8 notes
- Final QA passed: `bunx tsc --noEmit` clean, `bunx vite build` passes, 45/45 bun tests pass. No ESLint is configured (no eslint dep/script) — strict `tsc` is the only static check; "lint clean" = N/A unless a linter is added later.
- Browser smoke-test technique (no cargo/Tauri runtime needed): serve `dist/` statically with an injected `<script>` stubbing `window.__TAURI_INTERNALS__ = { invoke: (cmd, args) => Promise.resolve(mock[cmd](args)), transformCallback: () => 0, convertFileSrc: (p) => p }` BEFORE the module script — `@tauri-apps/api` v2 invoke() routes through it. Stub lives at `/tmp/opencode/tauri-stub.js`, route-marker harness at `/tmp/opencode/smoke.ts`.
- Headless Chrome GOTCHAs: `--virtual-time-budget` fast-forwards timers (good for dump-dom assertions) but recharts bar animations are captured mid-flight in screenshots (bars tiny/missing) — for visual chart verification use CDP (`--remote-debugging-port` + raw WebSocket: `Page.navigate`, real-time sleep, `Page.captureScreenshot`, `Input.dispatchKeyEvent` with modifiers bitmask Ctrl=2 Shift=8 for shortcut testing). Script: `/tmp/opencode/cdp-shot.ts`.
- `pkill -f <pattern>` self-matches the bash tool's own command line and hangs the shell — write patterns with a bracket trick (`pkill -f 'http.server 889[9]'`).
- Still pending a Rust-capable machine: `cargo check` + one `tauri dev`/`tauri build` launch test (crypto crate APIs were verified by review only).

## Task B.1 notes
- Final spec review pass: every requirement in PLAN.md confirmed implemented — no gaps found. Verified: no network calls in `src/` (grep for fetch/axios/http), frontend has zero SQLite usage (all DB access via `invoke()` Tauri commands), domain constants match spec exactly (11 seed habits/points in migration v2, `XP_PER_POINT = 10`, `xp_for_level = 25*(n-1)*(n+2)`, goal defaults 8/10 in `commands/mod.rs`), all 12 achievement defs present, nav has all 8 sections in spec order, journal template has all 5 sections, all 5 phase summaries in `docs/PHASES.md`.
- Final verification at completion: `bunx tsc --noEmit` clean, `bunx vite build` passes (427 KB main + 369 KB lazy StatisticsPage chunk / 21 KB CSS), 45/45 bun tests pass.
- Plan is complete; `<plan-complete>` marker appended to PLAN.md. Only remaining pre-release step (not possible in this env): `cargo check` + one `tauri dev` launch on a Rust-capable machine.
