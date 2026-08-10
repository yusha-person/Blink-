import type { HabitEntry, Priority } from "../types/habits";
import type { TaskEntry } from "../types/tasks";

export const TASK_WEIGHTS: Record<Priority, number> = {
  low: 1,
  medium: 2,
  high: 4,
};

export const HABIT_WEIGHTS: Record<Priority, number> = {
  low: 0.5,
  medium: 1,
  high: 2,
};

export type BusyLevel = {
  id: string;
  label: string;
  min: number;
  description: string;
};

export const BUSY_LEVELS: BusyLevel[] = [
  { id: "light", label: "Light", min: 0, description: "Little to nothing scheduled" },
  { id: "moderate", label: "Moderate", min: 5, description: "Normal workload" },
  { id: "busy", label: "Busy", min: 10, description: "Several important items" },
  { id: "very-busy", label: "Very Busy", min: 16, description: "Heavy workload" },
  { id: "extremely-busy", label: "Extremely Busy", min: 24, description: "Exceptionally demanding" },
];

export type BusynessBreakdown = {
  score: number;
  level: BusyLevel;
  taskCount: number;
  tasksByPriority: Record<Priority, number>;
  habitCount: number;
  habitsByPriority: Record<Priority, number>;
};

export function busyLevelFor(score: number): BusyLevel {
  let level = BUSY_LEVELS[0];
  for (const candidate of BUSY_LEVELS) {
    if (score >= candidate.min) level = candidate;
  }
  return level;
}

function habitActiveOn(habit: HabitEntry, day: string): boolean {
  const createdDay = habit.createdAt.slice(0, 10);
  if (createdDay > day) return false;
  if (!habit.archived) return true;
  const archivedDay = habit.archivedAt?.slice(0, 10);
  if (!archivedDay) return false;
  return day < archivedDay;
}

export function computeBusyness(
  tasks: TaskEntry[],
  habits: HabitEntry[],
  day: string,
): BusynessBreakdown {
  const tasksByPriority: Record<Priority, number> = { low: 0, medium: 0, high: 0 };
  const habitsByPriority: Record<Priority, number> = { low: 0, medium: 0, high: 0 };
  let score = 0;
  let taskCount = 0;
  let habitCount = 0;

  for (const task of tasks) {
    if (task.dueDate !== day) continue;
    taskCount++;
    if (task.priority) {
      tasksByPriority[task.priority]++;
      score += TASK_WEIGHTS[task.priority];
    }
  }
  for (const habit of habits) {
    if (!habitActiveOn(habit, day)) continue;
    habitCount++;
    habitsByPriority[habit.priority]++;
    score += HABIT_WEIGHTS[habit.priority];
  }

  return {
    score,
    level: busyLevelFor(score),
    taskCount,
    tasksByPriority,
    habitCount,
    habitsByPriority,
  };
}

export function busynessReason(b: BusynessBreakdown): string {
  const parts: string[] = [];
  for (const priority of ["high", "medium", "low"] as const) {
    const count = b.tasksByPriority[priority];
    if (count > 0) {
      parts.push(`${count} ${priority}-priority task${count === 1 ? "" : "s"}`);
    }
  }
  const habitParts: string[] = [];
  for (const priority of ["high", "medium", "low"] as const) {
    const count = b.habitsByPriority[priority];
    if (count > 0) {
      habitParts.push(`${count} ${priority}-priority habit${count === 1 ? "" : "s"}`);
    }
  }
  const taskText = parts.length > 0 ? parts.join(" + ") : "no prioritized tasks";
  const habitText = habitParts.length > 0 ? habitParts.join(", ") : "no active habits";
  return `${taskText}, plus ${habitText}, placed this day in the ${b.level.label} range.`;
}
