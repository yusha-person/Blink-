import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import type { JournalEntry } from "../types/journal";

type JournalState = {
  todayEntry: JournalEntry | null;
  hydrated: boolean;
  error: string | null;
  hydrate: () => Promise<void>;
  updateToday: (content: string) => Promise<void>;
};

export const useJournalStore = create<JournalState>((set, get) => ({
  todayEntry: null,
  hydrated: false,
  error: null,

  hydrate: async () => {
    try {
      const todayEntry = await invoke<JournalEntry>("get_or_create_today_journal");
      set({ todayEntry, hydrated: true, error: null });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  updateToday: async (content) => {
    const entry = get().todayEntry;
    if (!entry) throw new Error("journal not hydrated");
    const updated = await invoke<JournalEntry>("update_journal", {
      date: entry.date,
      content,
    });
    set({ todayEntry: updated, error: null });
  },
}));
