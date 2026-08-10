import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import type { TaskEntry, TaskFilter, TaskPriority, TaskSortBy } from "../types/tasks";
import { useAchievementStore } from "./achievementStore";

export type TaskInput = {
  title: string;
  description?: string;
  dueDate?: string | null;
  priority?: TaskPriority | null;
};

type TaskState = {
  tasks: TaskEntry[];
  hydrated: boolean;
  error: string | null;
  sortBy: TaskSortBy;
  filter: TaskFilter;
  createDialogOpen: boolean;
  hydrate: () => Promise<void>;
  setSortBy: (sortBy: TaskSortBy) => void;
  setFilter: (filter: TaskFilter) => void;
  openCreateDialog: () => void;
  closeCreateDialog: () => void;
  createTask: (input: TaskInput) => Promise<void>;
  updateTask: (id: number, input: TaskInput) => Promise<void>;
  toggleTask: (id: number, completed: boolean) => Promise<void>;
  deleteTask: (id: number) => Promise<void>;
};

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],
  hydrated: false,
  error: null,
  sortBy: "due",
  filter: "incomplete",
  createDialogOpen: false,

  hydrate: async () => {
    try {
      const tasks = await invoke<TaskEntry[]>("list_tasks");
      set({ tasks, hydrated: true, error: null });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  setSortBy: (sortBy) => set({ sortBy }),
  setFilter: (filter) => set({ filter }),
  openCreateDialog: () => set({ createDialogOpen: true }),
  closeCreateDialog: () => set({ createDialogOpen: false }),

  createTask: async (input) => {
    await invoke("create_task", {
      title: input.title,
      description: input.description ?? "",
      dueDate: input.dueDate ?? null,
      priority: input.priority ?? null,
    });
    await get().hydrate();
  },

  updateTask: async (id, input) => {
    await invoke("update_task", {
      id,
      title: input.title,
      description: input.description ?? "",
      dueDate: input.dueDate ?? null,
      priority: input.priority ?? null,
    });
    await get().hydrate();
  },

  toggleTask: async (id, completed) => {
    const updated = await invoke<TaskEntry>("set_task_completed", { id, completed });
    set({ tasks: get().tasks.map((t) => (t.id === id ? updated : t)), error: null });
    void useAchievementStore.getState().refresh();
  },

  deleteTask: async (id) => {
    await invoke("delete_task", { id });
    set({ tasks: get().tasks.filter((t) => t.id !== id), error: null });
  },
}));
