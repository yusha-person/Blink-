import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import type {
  FolderEntry,
  NoteDetail,
  NoteSummary,
  TagEntry,
} from "../types/notes";

const QUICK_NOTES_FOLDER = "Quick Notes";
const SEARCH_DEBOUNCE_MS = 150;

let searchTimer: ReturnType<typeof setTimeout> | null = null;
let quickNotePending = false;

export type NotesView =
  | { kind: "all" }
  | { kind: "favorites" }
  | { kind: "trash" }
  | { kind: "folder"; folderId: number }
  | { kind: "tag"; tag: string };

type NoteState = {
  folders: FolderEntry[];
  tags: TagEntry[];
  notes: NoteSummary[];
  view: NotesView;
  selectedNote: NoteDetail | null;
  backlinks: NoteSummary[];
  searchQuery: string;
  hydrated: boolean;
  notesLoading: boolean;
  error: string | null;
  hydrate: () => Promise<void>;
  refreshNotes: () => Promise<void>;
  refreshMeta: () => Promise<void>;
  selectView: (view: NotesView) => void;
  setSearchQuery: (query: string) => void;
  selectNote: (noteId: number) => Promise<void>;
  openNoteByTitle: (title: string) => Promise<void>;
  refreshBacklinks: () => Promise<void>;
  createNote: () => Promise<void>;
  createNoteGlobal: () => Promise<void>;
  createQuickNote: () => Promise<void>;
  updateNote: (
    noteId: number,
    title: string,
    content: string,
  ) => Promise<void>;
  setFavorite: (noteId: number, favorite: boolean) => Promise<void>;
  setNoteTags: (noteId: number, tags: string[]) => Promise<void>;
  trashNote: (noteId: number) => Promise<void>;
  restoreNote: (noteId: number) => Promise<void>;
  deleteNotePermanently: (noteId: number) => Promise<void>;
};

export const useNoteStore = create<NoteState>((set, get) => ({
  folders: [],
  tags: [],
  notes: [],
  view: { kind: "all" },
  selectedNote: null,
  backlinks: [],
  searchQuery: "",
  hydrated: false,
  notesLoading: false,
  error: null,

  hydrate: async () => {
    try {
      const [folders, tags, notes] = await Promise.all([
        invoke<FolderEntry[]>("list_folders"),
        invoke<TagEntry[]>("list_tags"),
        invoke<NoteSummary[]>("list_notes"),
      ]);
      set({ folders, tags, notes, hydrated: true, error: null });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  refreshNotes: async () => {
    const { searchQuery, view } = get();
    const query = searchQuery.trim();
    set({ notesLoading: true });
    try {
      let notes: NoteSummary[];
      if (query) {
        notes = await invoke<NoteSummary[]>("search_notes", { query });
      } else if (view.kind === "favorites") {
        notes = await invoke<NoteSummary[]>("list_notes", {
          favoritesOnly: true,
        });
      } else if (view.kind === "trash") {
        notes = await invoke<NoteSummary[]>("list_notes", { trashed: true });
      } else if (view.kind === "folder") {
        notes = await invoke<NoteSummary[]>("list_notes", {
          folderId: view.folderId,
        });
      } else if (view.kind === "tag") {
        const all = await invoke<NoteSummary[]>("list_notes");
        const wanted = view.tag.toLowerCase();
        notes = all.filter((n) =>
          n.tags.some((t) => t.toLowerCase() === wanted),
        );
      } else {
        notes = await invoke<NoteSummary[]>("list_notes");
      }
      set({ notes, notesLoading: false, error: null });
    } catch (e) {
      set({ notesLoading: false, error: String(e) });
    }
  },

  refreshMeta: async () => {
    try {
      const [folders, tags] = await Promise.all([
        invoke<FolderEntry[]>("list_folders"),
        invoke<TagEntry[]>("list_tags"),
      ]);
      set({ folders, tags, error: null });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  selectView: (view) => {
    if (searchTimer) clearTimeout(searchTimer);
    set({ view, searchQuery: "" });
    void get().refreshNotes();
  },

  setSearchQuery: (query) => {
    set({ searchQuery: query });
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      void get().refreshNotes();
    }, SEARCH_DEBOUNCE_MS);
  },

  selectNote: async (noteId) => {
    try {
      const [note, backlinks] = await Promise.all([
        invoke<NoteDetail>("get_note", { noteId }),
        invoke<NoteSummary[]>("get_backlinks", { noteId }),
      ]);
      set({ selectedNote: note, backlinks, error: null });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  openNoteByTitle: async (title) => {
    try {
      const existing = await invoke<NoteDetail | null>("get_note_by_title", {
        title,
      });
      if (existing) {
        const backlinks = await invoke<NoteSummary[]>("get_backlinks", {
          noteId: existing.id,
        });
        set({ selectedNote: existing, backlinks, error: null });
        return;
      }
      const fallback = get().folders.find(
        (f) => f.name === QUICK_NOTES_FOLDER,
      );
      if (!fallback) {
        set({ error: "no folder available for the new note" });
        return;
      }
      const note = await invoke<NoteDetail>("create_note", {
        folderId: fallback.id,
        title,
      });
      set({ selectedNote: note, backlinks: [], error: null });
      await Promise.all([get().refreshMeta(), get().refreshNotes()]);
    } catch (e) {
      set({ error: String(e) });
    }
  },

  refreshBacklinks: async () => {
    const { selectedNote } = get();
    if (!selectedNote) {
      set({ backlinks: [] });
      return;
    }
    try {
      const backlinks = await invoke<NoteSummary[]>("get_backlinks", {
        noteId: selectedNote.id,
      });
      set({ backlinks, error: null });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  createNote: async () => {
    const { folders, view } = get();
    const fallback = folders.find((f) => f.name === QUICK_NOTES_FOLDER);
    const folderId = view.kind === "folder" ? view.folderId : fallback?.id;
    if (folderId == null) {
      set({ error: "no folder available for the new note" });
      return;
    }
    if (searchTimer) clearTimeout(searchTimer);
    try {
      const note = await invoke<NoteDetail>("create_note", { folderId });
      set({ selectedNote: note, backlinks: [], searchQuery: "", error: null });
      await Promise.all([get().refreshMeta(), get().refreshNotes()]);
    } catch (e) {
      set({ error: String(e) });
    }
  },

  createNoteGlobal: async () => {
    if (!get().hydrated) await get().hydrate();
    if (get().view.kind === "trash") {
      get().selectView({ kind: "all" });
    }
    await get().createNote();
  },

  createQuickNote: async () => {
    if (quickNotePending) return;
    quickNotePending = true;
    try {
      if (!get().hydrated) await get().hydrate();
      const folder = get().folders.find((f) => f.name === QUICK_NOTES_FOLDER);
      if (!folder) {
        set({ error: "Quick Notes folder not found" });
        return;
      }
      if (searchTimer) clearTimeout(searchTimer);
      const note = await invoke<NoteDetail>("create_note", {
        folderId: folder.id,
      });
      set({
        view: { kind: "folder", folderId: folder.id },
        selectedNote: note,
        backlinks: [],
        searchQuery: "",
        error: null,
      });
      await Promise.all([get().refreshMeta(), get().refreshNotes()]);
    } catch (e) {
      set({ error: String(e) });
    } finally {
      quickNotePending = false;
    }
  },

  updateNote: async (noteId, title, content) => {
    try {
      const note = await invoke<NoteDetail>("update_note", {
        noteId,
        title,
        content,
      });
      if (get().selectedNote?.id === noteId) {
        set({ selectedNote: note });
      }
      set({ error: null });
      await get().refreshNotes();
      if (get().selectedNote?.id === noteId) {
        await get().refreshBacklinks();
      }
    } catch (e) {
      set({ error: String(e) });
      throw e;
    }
  },

  setFavorite: async (noteId, favorite) => {
    try {
      await invoke("set_favorite", { noteId, favorite });
      const { selectedNote } = get();
      if (selectedNote?.id === noteId) {
        set({ selectedNote: { ...selectedNote, isFavorite: favorite } });
      }
      set({ error: null });
      await get().refreshNotes();
    } catch (e) {
      set({ error: String(e) });
    }
  },

  setNoteTags: async (noteId, tags) => {
    try {
      const saved = await invoke<string[]>("set_note_tags", { noteId, tags });
      const { selectedNote } = get();
      if (selectedNote?.id === noteId) {
        set({ selectedNote: { ...selectedNote, tags: saved } });
      }
      set({ error: null });
      await Promise.all([get().refreshMeta(), get().refreshNotes()]);
    } catch (e) {
      set({ error: String(e) });
      throw e;
    }
  },

  trashNote: async (noteId) => {
    try {
      await invoke("trash_note", { noteId });
      const { selectedNote, view } = get();
      if (selectedNote?.id === noteId) {
        if (view.kind === "trash") {
          const [note, backlinks] = await Promise.all([
            invoke<NoteDetail>("get_note", { noteId }),
            invoke<NoteSummary[]>("get_backlinks", { noteId }),
          ]);
          set({ selectedNote: note, backlinks });
        } else {
          set({ selectedNote: null, backlinks: [] });
        }
      }
      set({ error: null });
      await Promise.all([get().refreshMeta(), get().refreshNotes()]);
    } catch (e) {
      set({ error: String(e) });
    }
  },

  restoreNote: async (noteId) => {
    try {
      await invoke("restore_note", { noteId });
      if (get().selectedNote?.id === noteId) {
        set({ selectedNote: null, backlinks: [] });
      }
      set({ error: null });
      await Promise.all([get().refreshMeta(), get().refreshNotes()]);
    } catch (e) {
      set({ error: String(e) });
    }
  },

  deleteNotePermanently: async (noteId) => {
    try {
      await invoke("delete_note_permanently", { noteId });
      if (get().selectedNote?.id === noteId) {
        set({ selectedNote: null, backlinks: [] });
      }
      set({ error: null });
      await Promise.all([get().refreshMeta(), get().refreshNotes()]);
    } catch (e) {
      set({ error: String(e) });
      throw e;
    }
  },
}));
