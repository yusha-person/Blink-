export const MIN_GOAL_POINTS = 8;

export interface StreakComputation {
  current: number;
  lastMetDate: string | null;
  todayMet: boolean;
}

const DAY_MS = 86_400_000;

function toMs(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

function toDateString(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function currentStreak(metDatesDesc: string[], today: string): StreakComputation {
  const todayMs = toMs(today);
  const dates = metDatesDesc.map(toMs).filter((ms) => ms <= todayMs);

  const todayMet = dates.includes(todayMs);
  const lastMetMs = dates.length > 0 ? Math.max(...dates) : null;

  const anchor = todayMet ? todayMs : todayMs - DAY_MS;

  let streak = 0;
  let expected = anchor;
  const sorted = [...dates].sort((a, b) => b - a);
  for (const ms of sorted) {
    if (ms > anchor) continue;
    if (ms === expected) {
      streak += 1;
      expected -= DAY_MS;
    } else if (ms < expected) {
      break;
    }
  }

  return {
    current: streak,
    lastMetDate: lastMetMs === null ? null : toDateString(lastMetMs),
    todayMet,
  };
}
