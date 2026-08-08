export interface HabitEntry {
  id: number;
  name: string;
  points: number;
  sortOrder: number;
  archived: boolean;
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
