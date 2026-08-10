export type Priority = "low" | "medium" | "high";

export interface HabitEntry {
  id: number;
  name: string;
  description: string;
  requirement: string;
  icon: string;
  points: number;
  priority: Priority;
  sortOrder: number;
  archived: boolean;
  archivedAt: string | null;
  isSystem: boolean;
  createdAt: string;
  completed: boolean;
}

export interface DailyTotals {
  date: string;
  points: number;
  xp: number;
}

export interface StreakInfo {
  current: number;
  longest: number;
  lastMetDate: string | null;
  todayMet: boolean;
}

export interface XpSummary {
  weeklyXp: number;
  monthlyXp: number;
}

export interface ActivityEntry {
  habitId: number;
  habitName: string;
  points: number;
  date: string;
  completedAt: string;
}

export interface HabitInput {
  name: string;
  description?: string;
  requirement?: string;
  points: number;
  priority: Priority;
  icon?: string;
}
