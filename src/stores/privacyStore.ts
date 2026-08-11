import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import type { FolderEntry, NoteDetail } from "../types/notes";
import type { PrivacyStatus } from "../types/privacy";
import { useNoteStore } from "./noteStore";

export type FolderSecurityMode = "unlock" | "add" | "change" | "remove";

export type FolderSecurityDialog = {
  mode: FolderSecurityMode;
  folder: FolderEntry;
} | null;

type PrivacyState = {
  status: PrivacyStatus | null;
  hydrated: boolean;
  error: string | null;
  hydrate: () => Promise<void>;
  setupPassword: (password: string) => Promise<boolean>;
  unlock: (password: string) => Promise<boolean>;
  lock: () => Promise<void>;
  changePassword: (current: string, next: string) => Promise<boolean>;
  resetPassword: (next: string) => Promise<boolean>;
  setNotePrivate: (noteId: number, isPrivate: boolean) => Promise<void>;
  unlockFolder: (folderId: number, password: string) => Promise<boolean>;
  lockFolder: (folderId: number) => Promise<void>;
  setFolderPassword: (folderId: number, password: string) => Promise<boolean>;
  removeFolderPassword: (folderId: number, password: string) => Promise<boolean>;
  changeFolderPassword: (folderId: number, current: string, next: string) => Promise<boolean>;
  folderSecurityDialog: FolderSecurityDialog;
  openFolderSecurity: (mode: FolderSecurityMode, folder: FolderEntry) => void;
  closeFolderSecurity: () => void;
};

async function refreshNotesView() {
  const noteStore = useNoteStore.getState();
  const selectedId = noteStore.selectedNote?.id;
  await noteStore.refreshNotes();
  if (selectedId != null) {
    await useNoteStore.getState().selectNote(selectedId);
  }
}

export const usePrivacyStore = create<PrivacyState>((set) => ({
  status: null,
  hydrated: false,
  error: null,

  hydrate: async () => {
    try {
      const status = await invoke<PrivacyStatus>("get_privacy_status");
      set({ status, hydrated: true, error: null });
    } catch (e) {
      set({ hydrated: true, error: String(e) });
    }
  },

  setupPassword: async (password) => {
    try {
      const status = await invoke<PrivacyStatus>("setup_master_password", {
        password,
      });
      set({ status, error: null });
      await refreshNotesView();
      return true;
    } catch (e) {
      set({ error: String(e) });
      return false;
    }
  },

  unlock: async (password) => {
    try {
      const status = await invoke<PrivacyStatus>("unlock_private_notes", {
        password,
      });
      set({ status, error: null });
      await refreshNotesView();
      return true;
    } catch (e) {
      set({ error: String(e) });
      return false;
    }
  },

  lock: async () => {
    try {
      const status = await invoke<PrivacyStatus>("lock_private_notes");
      set({ status, error: null });
      await refreshNotesView();
    } catch (e) {
      set({ error: String(e) });
    }
  },

  changePassword: async (current, next) => {
    try {
      const status = await invoke<PrivacyStatus>("change_master_password", {
        currentPassword: current,
        newPassword: next,
      });
      set({ status, error: null });
      return true;
    } catch (e) {
      set({ error: String(e) });
      return false;
    }
  },

  resetPassword: async (next) => {
    try {
      const status = await invoke<PrivacyStatus>("reset_master_password", {
        newPassword: next,
      });
      set({ status, error: null });
      await refreshNotesView();
      return true;
    } catch (e) {
      set({ error: String(e) });
      return false;
    }
  },

  unlockFolder: async (folderId, password) => {
    try {
      await invoke("unlock_folder", { folderId, password });
      set({ error: null });
      await useNoteStore.getState().refreshMeta();
      await refreshNotesView();
      return true;
    } catch (e) {
      set({ error: String(e) });
      return false;
    }
  },

  lockFolder: async (folderId) => {
    try {
      await invoke("lock_folder", { folderId });
      set({ error: null });
      await useNoteStore.getState().refreshMeta();
      await refreshNotesView();
    } catch (e) {
      set({ error: String(e) });
    }
  },

  setFolderPassword: async (folderId, password) => {
    try {
      await invoke("set_folder_password", { folderId, password });
      set({ error: null });
      await useNoteStore.getState().refreshMeta();
      await refreshNotesView();
      return true;
    } catch (e) {
      set({ error: String(e) });
      return false;
    }
  },

  removeFolderPassword: async (folderId, password) => {
    try {
      await invoke("remove_folder_password", { folderId, password });
      set({ error: null });
      await useNoteStore.getState().refreshMeta();
      await refreshNotesView();
      return true;
    } catch (e) {
      set({ error: String(e) });
      return false;
    }
  },

  changeFolderPassword: async (folderId, current, next) => {
    try {
      await invoke("change_folder_password", {
        folderId,
        currentPassword: current,
        newPassword: next,
      });
      set({ error: null });
      await useNoteStore.getState().refreshMeta();
      return true;
    } catch (e) {
      set({ error: String(e) });
      return false;
    }
  },

  setNotePrivate: async (noteId, isPrivate) => {
    try {
      const detail = await invoke<NoteDetail>("set_note_private", {
        noteId,
        private: isPrivate,
      });
      const status = await invoke<PrivacyStatus>("get_privacy_status");
      set({ status, error: null });
      if (useNoteStore.getState().selectedNote?.id === noteId) {
        useNoteStore.setState({ selectedNote: detail });
      }
      await useNoteStore.getState().refreshNotes();
    } catch (e) {
      set({ error: String(e) });
      throw e;
    }
  },
  folderSecurityDialog: null,
  openFolderSecurity: (mode, folder) => set({ folderSecurityDialog: { mode, folder } }),
  closeFolderSecurity: () => set({ folderSecurityDialog: null }),
}));
