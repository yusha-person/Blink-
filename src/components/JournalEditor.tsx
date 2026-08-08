import { useCallback, useEffect, useRef, useState } from "react";
import { useJournalStore } from "../stores/journalStore";
import type { JournalEntry } from "../types/journal";
import { countWords } from "../utils/text";
import { formatFullTimestamp } from "../utils/timestamps";
import MarkdownPreview from "./MarkdownPreview";
import { EditIcon, EyeIcon } from "./icons";

type EditorMode = "edit" | "preview";

const AUTOSAVE_DEBOUNCE_MS = 500;

function ModeButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
        active
          ? "bg-accent/15 text-accent"
          : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
      }`}
    >
      {children}
    </button>
  );
}

export function formatJournalDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function JournalEditor({ entry }: { entry: JournalEntry }) {
  const updateToday = useJournalStore((s) => s.updateToday);
  const [mode, setMode] = useState<EditorMode>("edit");
  const [content, setContent] = useState(entry.content);
  const [saving, setSaving] = useState(false);

  const dirty = content !== entry.content;
  const words = countWords(content);

  const latestRef = useRef({ content, dirty });
  latestRef.current = { content, dirty };
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushingRef = useRef(false);

  const flush = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const { content, dirty } = latestRef.current;
    if (!dirty || flushingRef.current) return;
    flushingRef.current = true;
    setSaving(true);
    try {
      await updateToday(content);
    } catch {
      // store records the error
    } finally {
      flushingRef.current = false;
      setSaving(false);
    }
  }, [updateToday]);

  useEffect(() => {
    if (!dirty) return;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void flush();
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [dirty, flush]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void flush();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [flush]);

  useEffect(() => {
    return () => {
      const { content, dirty } = latestRef.current;
      if (dirty && !flushingRef.current) {
        void updateToday(content).catch(() => {});
      }
    };
  }, [updateToday]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-col gap-2 border-b border-slate-900/10 p-4 dark:border-white/10">
        <div className="flex items-center gap-2">
          <h2 className="min-w-0 flex-1 truncate px-2 text-lg font-semibold text-slate-800 dark:text-slate-100">
            {formatJournalDate(entry.date)}
          </h2>
          <div className="glass-sm flex shrink-0 items-center gap-0.5 p-0.5">
            <ModeButton
              label="Edit"
              active={mode === "edit"}
              onClick={() => setMode("edit")}
            >
              <EditIcon width={14} height={14} />
            </ModeButton>
            <ModeButton
              label="Preview"
              active={mode === "preview"}
              onClick={() => setMode("preview")}
            >
              <EyeIcon width={14} height={14} />
            </ModeButton>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
          <p className="truncate">
            Created {formatFullTimestamp(entry.createdAt)} · Updated{" "}
            {formatFullTimestamp(entry.updatedAt)}
          </p>
          <p className="shrink-0">
            {words} {words === 1 ? "word" : "words"}
            {" · "}
            {saving ? "Saving…" : dirty ? "Unsaved changes" : "Saved"}
          </p>
        </div>
      </header>

      {mode === "edit" ? (
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onBlur={() => void flush()}
          placeholder="Reflect on your day in Markdown…"
          spellCheck
          className="flex-1 resize-none select-text bg-transparent p-4 font-mono text-sm leading-relaxed text-slate-800 outline-none placeholder:text-slate-400 dark:text-slate-100"
        />
      ) : (
        <div className="flex-1 overflow-y-auto p-4">
          {content.trim() ? (
            <MarkdownPreview content={content} />
          ) : (
            <p className="text-sm italic text-slate-500 dark:text-slate-400">
              This entry is empty.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
