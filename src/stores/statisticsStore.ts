import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import type {
  DailyXpEntry,
  HabitCompletionStats,
  HabitDetailStats,
} from "../types/statistics";

export const FOCUS_HABITS: { name: string; label: string }[] = [
  { name: "Read Book", label: "Reading" },
  { name: "Meditation", label: "Meditation" },
  { name: "Chess", label: "Chess" },
  { name: "Practice Pad", label: "Practice Pad" },
];

type StatisticsState = {
  history: DailyXpEntry[];
  habitStats: HabitCompletionStats[];
  focusStats: HabitDetailStats[];
  hydrated: boolean;
  error: string | null;
  hydrate: () => Promise<void>;
};

let hydratePromise: Promise<void> | null = null;

export const useStatisticsStore = create<StatisticsState>((set, get) => ({
  history: [],
  habitStats: [],
  focusStats: [],
  hydrated: false,
  error: null,

  hydrate: async () => {
    if (get().hydrated) return;
    if (!hydratePromise) {
      hydratePromise = (async () => {
        try {
          const [history, habitStats] = await Promise.all([
            invoke<DailyXpEntry[]>("get_xp_history"),
            invoke<HabitCompletionStats[]>("get_habit_completion_stats"),
          ]);
          const focusIds = FOCUS_HABITS.map(
            (focus) => habitStats.find((s) => s.name === focus.name)?.habitId,
          ).filter((id): id is number => id !== undefined);
          const focusStats = await Promise.all(
            focusIds.map((id) =>
              invoke<HabitDetailStats>("get_habit_detail_stats", { habitId: id }),
            ),
          );
          set({ history, habitStats, focusStats, hydrated: true, error: null });
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
