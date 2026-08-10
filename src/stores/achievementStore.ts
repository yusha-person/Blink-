import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import type {
  AchievementEntry,
  CustomAchievementEntry,
  CustomAchievementInput,
} from "../types/achievements";
import { useHabitStore } from "./habitStore";

type AchievementState = {
  achievements: AchievementEntry[];
  customAchievements: CustomAchievementEntry[];
  hydrated: boolean;
  error: string | null;
  customDialogOpen: boolean;
  hydrate: () => Promise<void>;
  refresh: () => Promise<void>;
  openCustomDialog: () => void;
  closeCustomDialog: () => void;
  createCustom: (input: CustomAchievementInput) => Promise<void>;
  updateCustom: (id: number, input: CustomAchievementInput) => Promise<void>;
  deleteCustom: (id: number) => Promise<void>;
};

let refreshPromise: Promise<void> | null = null;

function hasNewRewardUnlocks(
  before: CustomAchievementEntry[],
  after: CustomAchievementEntry[],
): boolean {
  const unlockedBefore = new Set(before.filter((a) => a.unlocked).map((a) => a.id));
  return after.some(
    (a) => a.unlocked && !unlockedBefore.has(a.id) && (a.xpReward > 0 || a.pointReward > 0),
  );
}

export const useAchievementStore = create<AchievementState>((set, get) => ({
  achievements: [],
  customAchievements: [],
  hydrated: false,
  error: null,
  customDialogOpen: false,

  hydrate: async () => {
    if (get().hydrated) return;
    await get().refresh();
  },

  refresh: async () => {
    if (!refreshPromise) {
      refreshPromise = (async () => {
        try {
          const before = get().customAchievements;
          const [achievements, customAchievements] = await Promise.all([
            invoke<AchievementEntry[]>("get_achievements"),
            invoke<CustomAchievementEntry[]>("list_custom_achievements"),
          ]);
          set({ achievements, customAchievements, hydrated: true, error: null });
          if (hasNewRewardUnlocks(before, customAchievements)) {
            await useHabitStore.getState().hydrate();
          }
        } catch (e) {
          set({ error: String(e) });
        } finally {
          refreshPromise = null;
        }
      })();
    }
    await refreshPromise;
  },

  openCustomDialog: () => set({ customDialogOpen: true }),
  closeCustomDialog: () => set({ customDialogOpen: false }),

  createCustom: async (input) => {
    const customAchievements = await invoke<CustomAchievementEntry[]>(
      "create_custom_achievement",
      {
        name: input.name,
        description: input.description ?? "",
        icon: input.icon ?? null,
        conditionType: input.conditionType,
        target: input.target,
        habitId: input.habitId ?? null,
        xpReward: input.xpReward ?? 0,
        pointReward: input.pointReward ?? 0,
      },
    );
    if (hasNewRewardUnlocks(get().customAchievements, customAchievements)) {
      await useHabitStore.getState().hydrate();
    }
    set({ customAchievements, error: null });
  },

  updateCustom: async (id, input) => {
    const customAchievements = await invoke<CustomAchievementEntry[]>(
      "update_custom_achievement",
      {
        id,
        name: input.name,
        description: input.description ?? "",
        icon: input.icon ?? null,
        conditionType: input.conditionType,
        target: input.target,
        habitId: input.habitId ?? null,
        xpReward: input.xpReward ?? 0,
        pointReward: input.pointReward ?? 0,
      },
    );
    if (hasNewRewardUnlocks(get().customAchievements, customAchievements)) {
      await useHabitStore.getState().hydrate();
    }
    set({ customAchievements, error: null });
  },

  deleteCustom: async (id) => {
    await invoke("delete_custom_achievement", { id });
    set({ customAchievements: get().customAchievements.filter((a) => a.id !== id), error: null });
  },
}));
