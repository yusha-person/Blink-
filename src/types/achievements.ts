export interface AchievementEntry {
  key: string;
  name: string;
  description: string;
  target: number;
  progress: number;
  unlocked: boolean;
  unlockedAt: string | null;
}
