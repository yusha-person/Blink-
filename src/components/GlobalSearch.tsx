import {
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type KeyboardEvent,
  type SVGProps,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { useNavigate } from "react-router-dom";
import { useHabitStore } from "../stores/habitStore";
import { todayLocalString, useCalendarStore } from "../stores/calendarStore";
import { useNoteStore } from "../stores/noteStore";
import { useUiStore } from "../stores/uiStore";
import type { JournalEntry } from "../types/journal";
import type { NoteSummary } from "../types/notes";
import { formatJournalDate } from "./JournalEditor";
import OverlayDialog from "./OverlayDialog";
import {
  FolderIcon,
  HabitsIcon,
  JournalIcon,
  NotesIcon,
  TagIcon,
} from "./icons";

const SEARCH_DEBOUNCE_MS = 150;
const SECTION_LIMIT = 8;

type ResultSection = "Notes" | "Journal" | "Tags" | "Folders" | "Habits";

type SearchResult = {
  id: string;
  section: ResultSection;
  title: string;
  subtitle: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  run: () => void | Promise<void>;
};

function snippet(text: string, query: string, max = 80): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const idx = flat.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return flat.slice(0, max);
  const start = Math.max(0, idx - 20);
  const prefix = start > 0 ? "…" : "";
  return prefix + flat.slice(start, start + max);
}

export default function GlobalSearch() {
  const open = useUiStore((s) => s.globalSearchOpen);
  const close = useUiStore((s) => s.closeOverlays);
  const navigate = useNavigate();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [searching, setSearching] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setSelectedIndex(0);
      setSearching(false);
      if (!useNoteStore.getState().hydrated) {
        void useNoteStore.getState().hydrate();
      }
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    const q = query.trim();
    if (!q) {
      requestRef.current++;
      setResults([]);
      setSelectedIndex(0);
      setSearching(false);
      return;
    }
    setSearching(true);
    timerRef.current = setTimeout(() => {
      const request = ++requestRef.current;
      const needle = q.toLowerCase();
      void (async () => {
        try {
          const [notes, journal] = await Promise.all([
            invoke<NoteSummary[]>("search_notes", { query: q }),
            invoke<JournalEntry[]>("search_journal", { query: q }),
          ]);
          if (request !== requestRef.current) return;

          const { folders, tags } = useNoteStore.getState();
          const habits = useHabitStore.getState().habits;
          const folderName = (id: number) =>
            folders.find((f) => f.id === id)?.name ?? "";
          const openNote = async (noteId: number) => {
            const store = useNoteStore.getState();
            if (!store.hydrated) await store.hydrate();
            store.selectView({ kind: "all" });
            await useNoteStore.getState().selectNote(noteId);
          };

          const next: SearchResult[] = [];
          for (const note of notes.slice(0, SECTION_LIMIT)) {
            next.push({
              id: `note-${note.id}`,
              section: "Notes",
              title: note.title.trim() || "Untitled",
              subtitle: [folderName(note.folderId), snippet(note.preview, q)]
                .filter(Boolean)
                .join(" · "),
              icon: NotesIcon,
              run: async () => {
                navigate("/notes");
                await openNote(note.id);
              },
            });
          }
          for (const entry of journal.slice(0, SECTION_LIMIT)) {
            next.push({
              id: `journal-${entry.date}`,
              section: "Journal",
              title: formatJournalDate(entry.date),
              subtitle: snippet(entry.content, q),
              icon: JournalIcon,
              run: async () => {
                if (entry.date === todayLocalString()) {
                  navigate("/journal");
                } else {
                  navigate("/calendar");
                  await useCalendarStore.getState().goToDate(entry.date);
                }
              },
            });
          }
          for (const tag of tags.filter((t) =>
            t.name.toLowerCase().includes(needle),
          )) {
            next.push({
              id: `tag-${tag.id}`,
              section: "Tags",
              title: `#${tag.name}`,
              subtitle: `${tag.noteCount} note${tag.noteCount === 1 ? "" : "s"}`,
              icon: TagIcon,
              run: async () => {
                navigate("/notes");
                const store = useNoteStore.getState();
                if (!store.hydrated) await store.hydrate();
                useNoteStore.getState().selectView({ kind: "tag", tag: tag.name });
              },
            });
          }
          for (const folder of folders.filter((f) =>
            f.name.toLowerCase().includes(needle),
          )) {
            next.push({
              id: `folder-${folder.id}`,
              section: "Folders",
              title: folder.name,
              subtitle: `${folder.noteCount} note${folder.noteCount === 1 ? "" : "s"}`,
              icon: FolderIcon,
              run: async () => {
                navigate("/notes");
                const store = useNoteStore.getState();
                if (!store.hydrated) await store.hydrate();
                useNoteStore
                  .getState()
                  .selectView({ kind: "folder", folderId: folder.id });
              },
            });
          }
          for (const habit of habits.filter(
            (h) => !h.archived && h.name.toLowerCase().includes(needle),
          )) {
            next.push({
              id: `habit-${habit.id}`,
              section: "Habits",
              title: habit.name,
              subtitle: `+${habit.points} pts`,
              icon: HabitsIcon,
              run: () => navigate("/habits"),
            });
          }
          setResults(next);
          setSelectedIndex(0);
          setSearching(false);
        } catch {
          if (request !== requestRef.current) return;
          setResults([]);
          setSearching(false);
        }
      })();
    }, SEARCH_DEBOUNCE_MS);
  }, [query, open, navigate]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(
      '[data-selected="true"]',
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex, results]);

  if (!open) return null;

  const runResult = (result: SearchResult) => {
    close();
    void result.run();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) =>
        results.length === 0 ? 0 : (i + 1) % results.length,
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) =>
        results.length === 0 ? 0 : (i - 1 + results.length) % results.length,
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      const result = results[selectedIndex];
      if (result) runResult(result);
    }
  };

  let lastSection: ResultSection | null = null;
  const trimmed = query.trim();

  return (
    <OverlayDialog label="Global search" onClose={close}>
      <input
        autoFocus
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Search notes, journal, tags, folders, habits…"
        className="glass-sm w-full px-3 py-2 text-sm text-slate-800 select-text placeholder:text-slate-500 focus:border-accent/50 focus:outline-none dark:text-slate-100"
      />
      <div ref={listRef} className="mt-3 max-h-80 overflow-y-auto">
        {trimmed && !searching && results.length === 0 && (
          <p className="px-1 pb-1 text-xs text-slate-500 dark:text-slate-400">
            No results for "{trimmed}"
          </p>
        )}
        {results.map((result, index) => {
          const showSection = result.section !== lastSection;
          lastSection = result.section;
          const selected = index === selectedIndex;
          return (
            <div key={result.id}>
              {showSection && (
                <p className="px-1 pt-2 pb-1 text-[10px] font-semibold tracking-wider text-slate-500 uppercase dark:text-slate-400">
                  {result.section}
                </p>
              )}
              <button
                type="button"
                data-selected={selected}
                onMouseEnter={() => setSelectedIndex(index)}
                onClick={() => runResult(result)}
                className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm ${
                  selected
                    ? "bg-accent/15 text-accent"
                    : "text-slate-700 dark:text-slate-200"
                }`}
              >
                <result.icon className="shrink-0" />
                <span className="flex-1 truncate">{result.title}</span>
                {result.subtitle && (
                  <span className="max-w-48 truncate text-[10px] text-slate-500 dark:text-slate-400">
                    {result.subtitle}
                  </span>
                )}
              </button>
            </div>
          );
        })}
      </div>
      <p className="mt-3 border-t border-slate-900/10 px-1 pt-2 text-[10px] text-slate-500 dark:border-white/10 dark:text-slate-400">
        ↑↓ navigate · Enter open · Esc close
      </p>
    </OverlayDialog>
  );
}
