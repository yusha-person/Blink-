export interface DailyXpEntry {
  date: string;
  points: number;
  xp: number;
}

export interface HabitCompletionStats {
  habitId: number;
  name: string;
  points: number;
  daysTracked: number;
  totalCompletions: number;
  last30Completions: number;
  completionRate: number;
  last30Rate: number;
}

export interface HabitDetailStats extends HabitCompletionStats {
  currentStreak: number;
  longestStreak: number;
  completionDates: string[];
}
