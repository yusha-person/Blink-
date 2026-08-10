import type { Priority } from "./habits";

export type TaskPriority = Priority;

export interface TaskEntry {
  id: number;
  title: string;
  description: string;
  dueDate: string | null;
  dueTime: string | null;
  priority: TaskPriority | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type TaskSortBy = "due" | "priority" | "created";
export type TaskFilter = "all" | "incomplete" | "completed";
