export interface LevelProgress {
  level: number;
  totalXp: number;
  currentLevelXp: number;
  nextLevelXp: number;
  xpIntoLevel: number;
  xpToNextLevel: number;
  progressRatio: number;
}

export function xpForLevel(level: number): number {
  return 25 * (level - 1) * (level + 2);
}

export function levelForXp(totalXp: number): number {
  const xp = Math.max(0, Math.floor(totalXp));
  let level = 1;
  while (xpForLevel(level + 1) <= xp) {
    level += 1;
  }
  return level;
}

export function levelProgress(totalXp: number): LevelProgress {
  const clamped = Math.max(0, Math.floor(totalXp));
  const level = levelForXp(clamped);
  const currentLevelXp = xpForLevel(level);
  const nextLevelXp = xpForLevel(level + 1);
  const xpIntoLevel = clamped - currentLevelXp;
  const levelSpan = nextLevelXp - currentLevelXp;
  const xpToNextLevel = levelSpan - xpIntoLevel;
  return {
    level,
    totalXp: clamped,
    currentLevelXp,
    nextLevelXp,
    xpIntoLevel,
    xpToNextLevel,
    progressRatio: levelSpan > 0 ? xpIntoLevel / levelSpan : 0,
  };
}
