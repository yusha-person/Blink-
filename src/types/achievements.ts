export interface AchievementEntry {
  key: string;
  name: string;
  description: string;
  target: number;
  progress: number;
  unlocked: boolean;
  unlockedAt: string | null;
}

export type CustomConditionType =
  | "total_xp"
  | "total_points"
  | "habits_completed"
  | "habit_count"
  | "current_streak"
  | "longest_streak"
  | "pages_read"
  | "meditation_sessions"
  | "chess_sessions"
  | "practice_pad_sessions"
  | "notes_created"
  | "tasks_completed"
  | "task_requirement";

export type CombinationMode = "all" | "any";

export interface LinkedTask {
  id: number;
  title: string;
  completedAt: string | null;
}

export interface CustomAchievementEntry {
  id: number;
  name: string;
  description: string;
  icon: string;
  conditionType: CustomConditionType;
  target: number;
  habitId: number | null;
  habitName: string | null;
  combinationMode: CombinationMode;
  tasks: LinkedTask[];
  xpReward: number;
  pointReward: number;
  progress: number;
  unlocked: boolean;
  unlockedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomAchievementInput {
  name: string;
  description?: string;
  icon?: string;
  conditionType: CustomConditionType;
  target: number;
  habitId?: number | null;
  taskIds?: number[];
  combinationMode?: CombinationMode;
  xpReward?: number;
  pointReward?: number;
}

export const CONDITION_LABELS: Record<CustomConditionType, string> = {
  total_xp: "Total XP",
  total_points: "Total Points",
  habits_completed: "Completed habits (any)",
  habit_count: "Specific habit completed",
  current_streak: "Current streak",
  longest_streak: "Longest streak",
  pages_read: "Pages read",
  meditation_sessions: "Meditation sessions",
  chess_sessions: "Chess sessions",
  practice_pad_sessions: "Practice Pad sessions",
  notes_created: "Notes created",
  tasks_completed: "Tasks completed",
  task_requirement: "Task requirement",
};

export const CONDITION_UNITS: Record<CustomConditionType, string> = {
  total_xp: "XP",
  total_points: "points",
  habits_completed: "completions",
  habit_count: "times",
  current_streak: "days",
  longest_streak: "days",
  pages_read: "pages",
  meditation_sessions: "sessions",
  chess_sessions: "sessions",
  practice_pad_sessions: "sessions",
  notes_created: "notes",
  tasks_completed: "tasks",
  task_requirement: "tasks completed",
};
