import { useEffect, useState, type ReactNode } from "react";
import NoteEditor from "../components/NoteEditor";
import FolderDialog from "../components/FolderDialog";
import DeleteFolderDialog from "../components/DeleteFolderDialog";
import FolderTree, { NOTE_DRAG_TYPE } from "../components/FolderTree";
import {
  LockIcon,
  NotesIcon,
  PlusIcon,
  SearchIcon,
  StarIcon,
  TagIcon,
  TrashIcon,
} from "../components/icons";
import { useNoteStore, type NotesView } from "../stores/noteStore";
import { usePrivacyStore } from "../stores/privacyStore";
import type { FolderEntry, NoteSummary } from "../types/notes";
import { formatListTimestamp } from "../utils/timestamps";

function SidebarButton({
  icon,
  label,
  count,
  active,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`glass-sm glass-hover flex items-center gap-2 px-3 py-2 text-sm ${
        active
          ? "border-accent/50 bg-accent/15 text-accent"
          : "border-transparent text-slate-600 dark:text-slate-300"
      }`}
    >
      <span className="flex h-4 w-4 shrink-0 items-center justify-center">
        {icon}
      </span>
      <span className="flex-1 truncate text-left">{label}</span>
      {count !== undefined && (
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {count}
        </span>
      )}
    </button>
  );
}

function SidebarHeading({ children }: { children: ReactNode }) {
  return (
    <h3 className="px-2 pb-1 pt-3 text-xs font-semibold uppercase tracking-wider text-slate-500 first:pt-0 dark:text-slate-400">
      {children}
    </h3>
  );
}

function NoteListItem({
  note,
  active,
  onClick,
}: {
  note: NoteSummary;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(NOTE_DRAG_TYPE, String(note.id));
        e.dataTransfer.effectAllowed = "move";
      }}
      className={`glass-sm glass-hover flex flex-col gap-1 p-3 text-left ${
        active ? "border-accent/50 bg-accent/10" : ""
      }`}
    >
      <span className="flex items-center gap-1.5">
        {note.isPrivate && (
          <LockIcon
            width={11}
            height={11}
            className="shrink-0 text-slate-400 dark:text-slate-500"
          />
        )}
        {note.isFavorite && (
          <StarIcon
            width={11}
            height={11}
            fill="currentColor"
            className="shrink-0 text-amber-500 dark:text-amber-400"
          />
        )}
        <span
          className={`truncate text-sm font-medium ${
            active ? "text-accent" : "text-slate-800 dark:text-slate-100"
          }`}
        >
          {note.title.trim() || "Untitled"}
        </span>
      </span>
      {note.preview.trim() && (
        <span className="line-clamp-2 text-xs text-slate-500 dark:text-slate-400">
          {note.preview}
        </span>
      )}
      <span className="flex items-center justify-between gap-2">
        <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500">
          {formatListTimestamp(note.updatedAt)}
        </span>
        {note.tags.length > 0 && (
          <span className="flex min-w-0 flex-wrap justify-end gap-1">
            {note.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="truncate rounded-full bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent"
              >
                {tag}
              </span>
            ))}
            {note.tags.length > 3 && (
              <span className="text-[10px] text-slate-400 dark:text-slate-500">
                +{note.tags.length - 3}
              </span>
            )}
          </span>
        )}
      </span>
    </button>
  );
}

function emptyMessage(
  view: NotesView,
  searching: boolean,
  query: string,
  loading: boolean,
): string {
  if (loading) return "Searching…";
  if (searching) return `No notes match "${query}".`;
  switch (view.kind) {
    case "trash":
      return "Trash is empty.";
    case "favorites":
      return "No favorite notes yet. Star a note to pin it here.";
    case "tag":
      return `No notes tagged "${view.tag}".`;
    default:
      return "No notes here yet. Create one with the + button.";
  }
}

export default function NotesPage() {
  const folders = useNoteStore((s) => s.folders);
  const tags = useNoteStore((s) => s.tags);
  const notes = useNoteStore((s) => s.notes);
  const view = useNoteStore((s) => s.view);
  const selectedNote = useNoteStore((s) => s.selectedNote);
  const searchQuery = useNoteStore((s) => s.searchQuery);
  const hydrated = useNoteStore((s) => s.hydrated);
  const notesLoading = useNoteStore((s) => s.notesLoading);
  const error = useNoteStore((s) => s.error);
  const hydrate = useNoteStore((s) => s.hydrate);
  const selectView = useNoteStore((s) => s.selectView);
  const setSearchQuery = useNoteStore((s) => s.setSearchQuery);
  const selectNote = useNoteStore((s) => s.selectNote);
  const createNote = useNoteStore((s) => s.createNote);
  const privacyHydrated = usePrivacyStore((s) => s.hydrated);
  const hydratePrivacy = usePrivacyStore((s) => s.hydrate);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!hydrated) void hydrate();
  }, [hydrated, hydrate]);

  useEffect(() => {
    if (!privacyHydrated) void hydratePrivacy();
  }, [privacyHydrated, hydratePrivacy]);

  if (!hydrated) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {error ? `Failed to load notes: ${error}` : "Loading notes…"}
        </p>
      </div>
    );
  }

  const searching = searchQuery.trim().length > 0;
  const totalNotes = folders.reduce((sum, f) => sum + f.noteCount, 0);
  const selectedFolder: FolderEntry | undefined = folders.find(
    (f) => f.id === (selectedNote?.folderId ?? -1),
  );

  const handleCreate = async () => {
    setCreating(true);
    try {
      await createNote();
    } catch {
      // store records the error
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex h-full gap-4 overflow-hidden">
      <aside className="glass flex w-52 shrink-0 flex-col gap-1 overflow-y-auto p-3">
        <SidebarHeading>Folders</SidebarHeading>
        <SidebarButton
          icon={<NotesIcon width={16} height={16} />}
          label="All Notes"
          count={totalNotes}
          active={view.kind === "all" && !searching}
          onClick={() => selectView({ kind: "all" })}
        />
        <FolderTree
          activeFolderId={view.kind === "folder" && !searching ? view.folderId : null}
          onSelect={(folderId) => selectView({ kind: "folder", folderId })}
        />

        <SidebarHeading>Collections</SidebarHeading>
        <SidebarButton
          icon={<StarIcon width={16} height={16} />}
          label="Favorites"
          active={view.kind === "favorites" && !searching}
          onClick={() => selectView({ kind: "favorites" })}
        />
        <SidebarButton
          icon={<TrashIcon width={16} height={16} />}
          label="Trash"
          active={view.kind === "trash" && !searching}
          onClick={() => selectView({ kind: "trash" })}
        />

        {tags.length > 0 && (
          <>
            <SidebarHeading>Tags</SidebarHeading>
            {tags.map((tag) => (
              <SidebarButton
                key={tag.id}
                icon={<TagIcon width={14} height={14} />}
                label={tag.name}
                count={tag.noteCount}
                active={
                  view.kind === "tag" &&
                  view.tag.toLowerCase() === tag.name.toLowerCase() &&
                  !searching
                }
                onClick={() => selectView({ kind: "tag", tag: tag.name })}
              />
            ))}
          </>
        )}
      </aside>

      <section className="glass flex w-80 shrink-0 flex-col overflow-hidden">
        <div className="flex items-center gap-2 border-b border-slate-900/10 p-3 dark:border-white/10">
          <div className="relative flex-1">
            <SearchIcon
              width={14}
              height={14}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search notes…"
              className="w-full select-text rounded-lg border border-border bg-surface py-1.5 pl-8 pr-2 text-sm text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-accent/50"
            />
          </div>
          <button
            type="button"
            onClick={handleCreate}
            disabled={creating || view.kind === "trash"}
            title={
              view.kind === "trash"
                ? "Restore or delete notes from the trash"
                : "New note (Ctrl+N; Ctrl+Shift+N: quick note)"
            }
            className="glass-sm glass-hover flex h-8 w-8 shrink-0 items-center justify-center text-accent disabled:opacity-60"
          >
            <PlusIcon width={16} height={16} />
          </button>
        </div>

        {error && (
          <p className="border-b border-red-400/40 p-3 text-xs text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-2">
          {notes.length === 0 ? (
            <p className="p-3 text-center text-xs text-slate-500 dark:text-slate-400">
              {emptyMessage(view, searching, searchQuery.trim(), notesLoading)}
            </p>
          ) : (
            notes.map((note) => (
              <NoteListItem
                key={note.id}
                note={note}
                active={selectedNote?.id === note.id}
                onClick={() => void selectNote(note.id)}
              />
            ))
          )}
        </div>
      </section>

      <section className="glass flex-1 overflow-hidden">
        {selectedNote ? (
          <NoteEditor
            key={selectedNote.id}
            note={selectedNote}
            folderName={selectedFolder?.name}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-400 dark:text-slate-500">
            <NotesIcon width={40} height={40} />
            <p className="text-sm">
              {searching
                ? "Search results"
                : view.kind === "trash"
                  ? "Select a note to restore it or delete it permanently."
                  : "Select a note to view it, or create a new one."}
            </p>
          </div>
        )}
      </section>
      <FolderDialog />
      <DeleteFolderDialog />
    </div>
  );
}
