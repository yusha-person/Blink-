import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import type { NoteDetail } from "../types/notes";
import type { PrivacyStatus } from "../types/privacy";
import { useNoteStore } from "./noteStore";

type PrivacyState = {
  status: PrivacyStatus | null;
  hydrated: boolean;
  error: string | null;
  hydrate: () => Promise<void>;
  setupPassword: (password: string) => Promise<boolean>;
  unlock: (password: string) => Promise<boolean>;
  lock: () => Promise<void>;
  changePassword: (current: string, next: string) => Promise<boolean>;
  setNotePrivate: (noteId: number, isPrivate: boolean) => Promise<void>;
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
}));
