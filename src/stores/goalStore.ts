import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { useAchievementStore } from "./achievementStore";
import { useHabitStore } from "./habitStore";

export const DEFAULT_MIN_GOAL = 8;
export const DEFAULT_STRETCH_GOAL = 10;

const MIN_GOAL_SETTING_KEY = "goals.min";
const STRETCH_GOAL_SETTING_KEY = "goals.stretch";

export function normalizeGoals(minGoal: number, stretchGoal: number): { minGoal: number; stretchGoal: number } {
  const min = Math.max(1, Math.round(minGoal));
  const stretch = Math.max(min, Math.round(stretchGoal));
  return { minGoal: min, stretchGoal: stretch };
}

type GoalState = {
  minGoal: number;
  stretchGoal: number;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setGoals: (minGoal: number, stretchGoal: number) => Promise<void>;
};

export const useGoalStore = create<GoalState>((set) => ({
  minGoal: DEFAULT_MIN_GOAL,
  stretchGoal: DEFAULT_STRETCH_GOAL,
  hydrated: false,

  hydrate: async () => {
    let minGoal = DEFAULT_MIN_GOAL;
    let stretchGoal = DEFAULT_STRETCH_GOAL;
    try {
      const [storedMin, storedStretch] = await Promise.all([
        invoke<string | null>("get_setting", { key: MIN_GOAL_SETTING_KEY }),
        invoke<string | null>("get_setting", { key: STRETCH_GOAL_SETTING_KEY }),
      ]);
      const parsedMin = storedMin === null ? NaN : Number.parseInt(storedMin, 10);
      const parsedStretch = storedStretch === null ? NaN : Number.parseInt(storedStretch, 10);
      if (!Number.isNaN(parsedMin)) minGoal = parsedMin;
      if (!Number.isNaN(parsedStretch)) stretchGoal = parsedStretch;
    } catch {
      // Fall back to default goals if the backend is unreachable.
    }
    const normalized = normalizeGoals(minGoal, stretchGoal);
    set({ ...normalized, hydrated: true });
  },

  setGoals: async (minGoal, stretchGoal) => {
    const normalized = normalizeGoals(minGoal, stretchGoal);
    await invoke("set_setting", {
      key: MIN_GOAL_SETTING_KEY,
      value: String(normalized.minGoal),
    });
    await invoke("set_setting", {
      key: STRETCH_GOAL_SETTING_KEY,
      value: String(normalized.stretchGoal),
    });
    set(normalized);
    // The streak engine and streak achievements depend on the minimum goal;
    // re-evaluate both against the new setting.
    await useHabitStore.getState().hydrate();
    void useAchievementStore.getState().refresh();
  },
}));
