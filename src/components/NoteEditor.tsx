import { useCallback, useEffect, useRef, useState } from "react";
import { useNoteStore } from "../stores/noteStore";
import { usePrivacyStore } from "../stores/privacyStore";
import type { NoteDetail } from "../types/notes";
import { countWords } from "../utils/text";
import { formatFullTimestamp } from "../utils/timestamps";
import ConfirmDialog from "./ConfirmDialog";
import MarkdownPreview from "./MarkdownPreview";
import NoteTags from "./NoteTags";
import { EditIcon, EyeIcon, LinkIcon, LockIcon, RestoreIcon, StarIcon, TagIcon, TrashIcon, UnlockIcon } from "./icons";

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

export default function NoteEditor({
  note,
  folderName,
}: {
  note: NoteDetail;
  folderName?: string;
}) {
  const updateNote = useNoteStore((s) => s.updateNote);
  const setFavorite = useNoteStore((s) => s.setFavorite);
  const trashNote = useNoteStore((s) => s.trashNote);
  const restoreNote = useNoteStore((s) => s.restoreNote);
  const deleteNotePermanently = useNoteStore((s) => s.deleteNotePermanently);
  const backlinks = useNoteStore((s) => s.backlinks);
  const selectNote = useNoteStore((s) => s.selectNote);
  const openNoteByTitle = useNoteStore((s) => s.openNoteByTitle);
  const privacyStatus = usePrivacyStore((s) => s.status);
  const privacyError = usePrivacyStore((s) => s.error);
  const unlockPrivateNotes = usePrivacyStore((s) => s.unlock);
  const setNotePrivate = usePrivacyStore((s) => s.setNotePrivate);
  const [mode, setMode] = useState<EditorMode>("edit");
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [saving, setSaving] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [unlockPassword, setUnlockPassword] = useState("");

  const trashed = note.trashedAt !== null;
  const locked = note.isPrivate && !(privacyStatus?.unlocked ?? false);
  const dirty = !trashed && !locked && (title !== note.title || content !== note.content);
  const words = countWords(content);

  const latestRef = useRef({ noteId: note.id, title, content, dirty });
  latestRef.current = { noteId: note.id, title, content, dirty };
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushingRef = useRef(false);

  const handleNoteLink = useCallback(
    (linkTitle: string) => void openNoteByTitle(linkTitle),
    [openNoteByTitle],
  );

  const lockKey = `${note.id}:${locked ? "locked" : "open"}`;
  const prevLockKeyRef = useRef(lockKey);
  useEffect(() => {
    if (prevLockKeyRef.current !== lockKey) {
      prevLockKeyRef.current = lockKey;
      setTitle(note.title);
      setContent(note.content);
    }
  }, [lockKey, note.title, note.content]);

  const flush = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const { noteId, title, content, dirty } = latestRef.current;
    if (!dirty || flushingRef.current) return;
    flushingRef.current = true;
    setSaving(true);
    try {
      await updateNote(noteId, title, content);
    } catch {
      // store records the error
    } finally {
      flushingRef.current = false;
      setSaving(false);
    }
  }, [updateNote]);

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
      const { noteId, title, content, dirty } = latestRef.current;
      if (dirty && !flushingRef.current) {
        void updateNote(noteId, title, content).catch(() => {});
      }
    };
  }, [updateNote]);

  const runAction = async (action: () => Promise<void>) => {
    setActionBusy(true);
    try {
      await action();
    } finally {
      setActionBusy(false);
    }
  };

  const handleDeletePermanently = async () => {
    try {
      await runAction(() => deleteNotePermanently(note.id));
      setConfirmingDelete(false);
    } catch {
      // store records the error; keep the dialog open
    }
  };

  const handleUnlock = async () => {
    setActionBusy(true);
    try {
      const ok = await unlockPrivateNotes(unlockPassword);
      if (ok) setUnlockPassword("");
    } finally {
      setActionBusy(false);
    }
  };

  if (locked) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6">
        <LockIcon
          width={32}
          height={32}
          className="text-slate-400 dark:text-slate-500"
        />
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
          This note is private
        </p>
        <p className="max-w-64 text-center text-xs text-slate-500 dark:text-slate-400">
          Enter your master password to unlock private notes for this session.
        </p>
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void handleUnlock();
          }}
        >
          <input
            type="password"
            value={unlockPassword}
            onChange={(e) => setUnlockPassword(e.target.value)}
            placeholder="Master password"
            autoComplete="current-password"
            className="w-48 select-text rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-accent/50"
          />
          <button
            type="submit"
            disabled={actionBusy || !unlockPassword}
            className="glass-sm glass-hover px-3 py-1.5 text-xs font-medium text-accent disabled:opacity-60"
          >
            Unlock
          </button>
        </form>
        {privacyError && (
          <p className="text-xs text-red-600 dark:text-red-400">
            {privacyError}
          </p>
        )}
      </div>
    );
  }

  const privacyToggle = (() => {
    if (!privacyStatus?.passwordSet) {
      return {
        disabled: true,
        label: "Set a master password in Settings to use private notes",
      };
    }
    if (!privacyStatus.unlocked) {
      return {
        disabled: true,
        label: "Unlock private notes to change privacy",
      };
    }
    return {
      disabled: false,
      label: note.isPrivate ? "Make this note public" : "Make this note private",
    };
  })();

  return (
    <div className="flex h-full flex-col">
      {trashed && (
        <div className="flex items-center justify-between gap-2 border-b border-amber-400/30 bg-amber-400/10 px-4 py-2">
          <p className="text-xs text-amber-700 dark:text-amber-300">
            In the trash since {formatFullTimestamp(note.trashedAt ?? "")}.
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => void runAction(() => restoreNote(note.id))}
              disabled={actionBusy}
              className="glass-sm glass-hover flex items-center gap-1.5 px-2.5 py-1 text-xs text-slate-600 disabled:opacity-60 dark:text-slate-300"
            >
              <RestoreIcon width={12} height={12} />
              Restore
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              disabled={actionBusy}
              className="flex items-center gap-1.5 rounded-lg border border-red-400/40 bg-red-500/15 px-2.5 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-500/25 disabled:opacity-60 dark:text-red-400"
            >
              <TrashIcon width={12} height={12} />
              Delete permanently
            </button>
          </div>
        </div>
      )}

      <header className="flex flex-col gap-2 border-b border-slate-900/10 p-4 dark:border-white/10">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => void flush()}
            placeholder="Untitled"
            readOnly={trashed}
            className="min-w-0 flex-1 select-text rounded-lg bg-transparent px-2 py-1 text-lg font-semibold text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:bg-surface read-only:text-slate-500 dark:text-slate-100 dark:read-only:text-slate-400"
          />
          {!trashed && (
            <button
              type="button"
              onClick={() =>
                void runAction(() => setNotePrivate(note.id, !note.isPrivate))
              }
              disabled={actionBusy || privacyToggle.disabled}
              title={privacyToggle.label}
              aria-label={privacyToggle.label}
              aria-pressed={note.isPrivate}
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors disabled:opacity-60 ${
                note.isPrivate
                  ? "text-accent hover:text-accent"
                  : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              {note.isPrivate ? (
                <UnlockIcon width={15} height={15} />
              ) : (
                <LockIcon width={15} height={15} />
              )}
            </button>
          )}
          <button
            type="button"
            onClick={() => void setFavorite(note.id, !note.isFavorite)}
            title={note.isFavorite ? "Remove from favorites" : "Add to favorites"}
            aria-label={note.isFavorite ? "Remove from favorites" : "Add to favorites"}
            aria-pressed={note.isFavorite}
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors ${
              note.isFavorite
                ? "text-amber-500 hover:text-amber-600 dark:text-amber-400 dark:hover:text-amber-300"
                : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            <StarIcon
              width={15}
              height={15}
              fill={note.isFavorite ? "currentColor" : "none"}
            />
          </button>
          {!trashed && (
            <button
              type="button"
              onClick={() => void runAction(() => trashNote(note.id))}
              disabled={actionBusy}
              title="Move to trash"
              aria-label="Move to trash"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:text-red-500 disabled:opacity-60 dark:text-slate-400 dark:hover:text-red-400"
            >
              <TrashIcon width={15} height={15} />
            </button>
          )}
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
            {folderName ? `${folderName} · ` : ""}
            Created {formatFullTimestamp(note.createdAt)} · Updated{" "}
            {formatFullTimestamp(note.updatedAt)}
            {note.isPrivate ? " · Private" : ""}
          </p>
          <p className="shrink-0">
            {words} {words === 1 ? "word" : "words"}
            {" · "}
            {trashed ? "Read only" : saving ? "Saving…" : dirty ? "Unsaved changes" : "Saved"}
          </p>
        </div>
        <div className="flex items-start gap-2">
          <TagIcon
            width={13}
            height={13}
            className="mt-1 shrink-0 text-slate-400 dark:text-slate-500"
          />
          <NoteTags noteId={note.id} tags={note.tags} readOnly={trashed} />
        </div>
      </header>

      {mode === "edit" ? (
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onBlur={() => void flush()}
          placeholder="Write in Markdown… (# headings, **bold**, - lists, - [ ] checklists, ``` code blocks)"
          spellCheck
          readOnly={trashed}
          className="flex-1 resize-none select-text bg-transparent p-4 font-editor text-sm leading-relaxed text-slate-800 outline-none placeholder:text-slate-400 read-only:text-slate-500 dark:text-slate-100 dark:read-only:text-slate-400"
        />
      ) : (
        <div className="flex-1 overflow-y-auto p-4">
          {content.trim() ? (
            <MarkdownPreview
              content={content}
              onNoteLink={handleNoteLink}
            />
          ) : (
            <p className="text-sm italic text-slate-500 dark:text-slate-400">
              This note is empty.
            </p>
          )}
        </div>
      )}

      <footer className="shrink-0 border-t border-slate-900/10 px-4 py-3 dark:border-white/10">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          <LinkIcon width={12} height={12} />
          Backlinks{backlinks.length > 0 ? ` (${backlinks.length})` : ""}
        </p>
        {backlinks.length === 0 ? (
          <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
            No notes link here yet. Link with [[
            {note.title.trim() || "Note title"}]] from another note.
          </p>
        ) : (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {backlinks.map((link) => (
              <button
                key={link.id}
                type="button"
                onClick={() => void selectNote(link.id)}
                title={link.preview.trim() || undefined}
                className="glass-sm glass-hover max-w-48 truncate px-2.5 py-1 text-xs text-slate-600 dark:text-slate-300"
              >
                {link.title.trim() || "Untitled"}
              </button>
            ))}
          </div>
        )}
      </footer>

      {confirmingDelete && (
        <ConfirmDialog
          title="Delete note permanently?"
          message={`"${note.title.trim() || "Untitled"}" will be deleted forever. This cannot be undone.`}
          confirmLabel="Delete forever"
          busy={actionBusy}
          onConfirm={() => void handleDeletePermanently()}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </div>
  );
}
