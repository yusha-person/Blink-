import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { useAchievementStore } from "./achievementStore";
import type { ActivityEntry, DailyTotals, HabitEntry, StreakInfo, XpSummary } from "../types/habits";
import { levelProgress, type LevelProgress } from "../utils/xp";

type HabitState = {
  habits: HabitEntry[];
  todayTotals: DailyTotals | null;
  streak: StreakInfo | null;
  level: LevelProgress | null;
  xpSummary: XpSummary | null;
  recentActivity: ActivityEntry[];
  hydrated: boolean;
  error: string | null;
  hydrate: () => Promise<void>;
  toggleHabit: (habitId: number) => Promise<void>;
};

export const useHabitStore = create<HabitState>((set, get) => ({
  habits: [],
  todayTotals: null,
  streak: null,
  level: null,
  xpSummary: null,
  recentActivity: [],
  hydrated: false,
  error: null,

  hydrate: async () => {
    try {
      const [habits, todayTotals, streak, level, xpSummary, recentActivity] = await Promise.all([
        invoke<HabitEntry[]>("list_habits"),
        invoke<DailyTotals>("get_daily_totals"),
        invoke<StreakInfo>("get_streak"),
        invoke<LevelProgress>("get_level_progress"),
        invoke<XpSummary>("get_xp_summary"),
        invoke<ActivityEntry[]>("get_recent_activity", { limit: 10 }),
      ]);
      set({ habits, todayTotals, streak, level, xpSummary, recentActivity, hydrated: true, error: null });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  toggleHabit: async (habitId) => {
    const habit = get().habits.find((h) => h.id === habitId);
    if (!habit) return;

    const command = habit.completed ? "uncomplete_habit" : "complete_habit";
    const totals = await invoke<DailyTotals>(command, { habitId });

    const previousXp = get().todayTotals?.xp ?? 0;
    const totalXp = (get().level?.totalXp ?? 0) + (totals.xp - previousXp);
    const [streak, xpSummary, recentActivity] = await Promise.all([
      invoke<StreakInfo>("get_streak"),
      invoke<XpSummary>("get_xp_summary"),
      invoke<ActivityEntry[]>("get_recent_activity", { limit: 10 }),
    ]);

    set((state) => ({
      habits: state.habits.map((h) =>
        h.id === habitId ? { ...h, completed: !h.completed } : h,
      ),
      todayTotals: totals,
      streak,
      xpSummary,
      recentActivity,
      level: levelProgress(totalXp),
      error: null,
    }));

    void useAchievementStore.getState().refresh();
  },
}));
