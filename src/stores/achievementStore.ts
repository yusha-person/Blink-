import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import type { AchievementEntry } from "../types/achievements";

type AchievementState = {
  achievements: AchievementEntry[];
  hydrated: boolean;
  error: string | null;
  hydrate: () => Promise<void>;
  refresh: () => Promise<void>;
};

let hydratePromise: Promise<void> | null = null;

export const useAchievementStore = create<AchievementState>((set, get) => ({
  achievements: [],
  hydrated: false,
  error: null,

  hydrate: async () => {
    if (get().hydrated) return;
    await get().refresh();
  },

  refresh: async () => {
    if (!hydratePromise) {
      hydratePromise = (async () => {
        try {
          const achievements = await invoke<AchievementEntry[]>("get_achievements");
          set({ achievements, hydrated: true, error: null });
        } catch (e) {
          set({ error: String(e) });
        } finally {
          hydratePromise = null;
        }
      })();
    }
    await hydratePromise;
  },
}));
