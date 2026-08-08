# LifeXP — Build Plan

LifeXP is a fully offline desktop productivity app: habit tracking, notes, journaling, statistics, and a gamified XP/level system.

**Tech stack:** Tauri + React + TypeScript + Tailwind CSS + SQLite (rusqlite, Rust backend only) + Zustand + react-markdown + Recharts.

**Hard rules (apply to every task):**
- Completely offline. No network calls, no cloud, no accounts.
- Frontend never touches the DB directly — all DB access via Tauri commands into Rust.
- Zustand is an in-memory cache; every mutation goes to SQLite first, then updates the store.
- Strict TypeScript (no `any` where avoidable). Clean, modular, production-quality code.
- Day boundary = local midnight for streaks, goals, journal, calendar.
- After each completed phase, add a short summary in `docs/PHASES.md` before moving on.
- `src/` layout: components/, pages/, layouts/, hooks/, stores/, database/, utils/, types/, styles/, assets/
- `src-tauri/src/` layout: commands/, db/ (rusqlite + migrations), crypto/ (Argon2id + AES-256-GCM)

**Domain constants:**
- 1 Point = 10 XP. Daily Minimum Goal = 8 pts, Stretch Goal = 10 pts (progress bar caps at stretch; points beyond still convert to XP).
- Level formula (cumulative XP to reach level n): `XP(n) = 25 × (n − 1) × (n + 2)`.
- Streak: day counts if ≥ Minimum Goal earned before day boundary; missing breaks current streak to 0; Longest Streak preserved separately.
- Fixed v1 habits: Read Book (+2), Exercise (+2), Read Article (+1), Explain Article (+1), Meditation (+1), Artistic Session (+3), Clean Room (+2), Practice Pad (+2), Metronome (+1), Chess (+2), Political Reading (+3). Habits can be toggled off same-day, reversing Points/XP.

## Phase 1 — Project Setup & Shell

- [ ] **1.1** Initialize project: Tauri + React + TypeScript (Vite). Window title "LifeXP", default size 1280x800, min 900x600.
- [ ] **1.2** Install all dependencies (Tailwind, Zustand, react-markdown, Recharts, rusqlite, etc.) and configure Tailwind with a dark-blue/black theme (rounded corners, glassmorphism, blue accents).
- [ ] **1.3** SQLite setup in Rust backend: connection management, versioned migration system, initial migration (schema version 1). Migrations run on startup before UI loads.
- [ ] **1.4** App layout with sidebar navigation (Dashboard, Habits, Notes, Calendar, Statistics, Journal, Achievements, Settings) and routing.
- [ ] **1.5** Dashboard page (placeholder content) and Settings page shell.
- [ ] **1.6** Dark theme implementation (default) + light mode toggle.
- [ ] **1.7** Verify Phase 1: `tsc` clean, build passes, app launches. Write Phase 1 summary in `docs/PHASES.md`.

## Phase 2 — Habit Tracking

- [ ] **2.1** Schema migration (v2): habits, habit_completions, daily totals (points/XP), streaks tables.
- [ ] **2.2** Rust commands: list habits, complete/uncomplete habit (with point/XP award and reversal), get daily totals.
- [ ] **2.3** XP/level engine: formula-based level calculation, XP until next level, progress data. Unit-tested.
- [ ] **2.4** Streak engine: current streak with break rule, longest streak, evaluated on day boundary/app open.
- [ ] **2.5** Zustand store for habits/XP, hydrated from SQLite via commands; mutations write to SQLite first.
- [ ] **2.6** Habits page: cards for the 11 fixed habits with toggle complete/uncomplete for today.
- [ ] **2.7** Dashboard: Today's Points, Today's XP, daily goal progress bar (min/stretch), level, XP progress bar, XP until next level, total XP, current streak, weekly/monthly XP, recent activity. Updates instantly on habit toggle.
- [ ] **2.8** Verify Phase 2: persistence across restart, toggling reversal works, streak logic correct. Write Phase 2 summary.

## Phase 3 — Notes

- [ ] **3.1** Schema migration (v3): notes, folders (defaults: School, Programming, Music, Politics, Journal, Ideas, Personal, Quick Notes), tags, note_tags, trash support (soft delete).
- [ ] **3.2** Rust commands: CRUD notes/folders/tags, search, trash/restore/permanent delete, favorites.
- [ ] **3.3** Notes page: folder tree/sidebar, note list, search (instant, filters while typing).
- [ ] **3.4** Markdown editor with live preview (react-markdown), code blocks, checklists, word count, created/modified dates.
- [ ] **3.5** Autosave (debounced ~500ms) + manual Ctrl+S save.
- [ ] **3.6** Tags UI, favorites, trash view with restore + confirmation dialog before permanent delete.
- [ ] **3.7** Internal links `[[Note]]`: parsing, clickable navigation, Backlinks panel showing notes linking to current note.
- [ ] **3.8** Quick Notes (Ctrl+Shift+N creates note in Quick Notes folder).
- [ ] **3.9** Private notes: master password setup, Argon2id hashing (Rust only), AES-256-GCM encryption at rest (Rust only, no key material in JS), lock/unlock per session, hidden titles/content while locked, atomic password change re-encrypting all private notes.
- [ ] **3.10** Verify Phase 3: autosave works, backlinks correct, private notes unreadable on disk. Write Phase 3 summary.

## Phase 4 — Calendar, Journal, Statistics

- [ ] **4.1** Journal: auto-create empty daily journal page on first app open each day (template: Today's XP, Wins, Lessons Learned, Improvements, Tomorrow's Goals). User fills manually.
- [ ] **4.2** Calendar page: per-day points, XP, habits completed, journal entry link/preview, notes created.
- [ ] **4.3** Statistics page: daily/weekly/monthly XP charts (Recharts), habit completion rates, current + longest streak.
- [ ] **4.4** GitHub-style contribution heatmap of daily activity.
- [ ] **4.5** Per-habit statistics: Reading, Meditation, Chess, Practice Pad.
- [ ] **4.6** Verify Phase 4: charts match DB data, heatmap renders a full year. Write Phase 4 summary.

## Phase 5 — Polish

- [ ] **5.1** Achievements system: unlock detection + page (First Habit, First 100 XP, Read 100 Pages, Read 1000 Pages, First Political Reading, Musician, Chess Player, 7-Day Streak, 30-Day Streak, Reach Level 5, Reach Level 10, Earn 5000 XP).
- [ ] **5.2** Keyboard shortcuts: Ctrl+N new note, Ctrl+Shift+N quick note, Ctrl+F search, Ctrl+S save, Ctrl+Shift+P command palette.
- [ ] **5.3** Command Palette (Ctrl+Shift+P): navigation + actions.
- [ ] **5.4** Global instant search (Ctrl+F) across notes, journal, tags, folder names, habit names; locked private notes excluded until unlocked.
- [ ] **5.5** Settings completion: customizable daily goal min/stretch, backup database (raw file copy), export data (JSON), import data, reset statistics (confirm dialog), reset XP (confirm dialog), change master password.
- [ ] **5.6** Animations and transitions polish (smooth, minimal).
- [ ] **5.7** Performance pass: query indexes, avoid unnecessary re-renders, debounce expensive ops.
- [ ] **5.8** Final QA: strict `tsc` clean, lint clean, production build (`tauri build` or at least `vite build`) succeeds, full manual smoke test of every page. Write Phase 5 summary.

## Backlog

- [ ] **B.1** Final review pass over the whole spec — confirm nothing from the original requirements is missing.
