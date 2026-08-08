import type { DailyXpEntry } from "../types/statistics";

export interface XpBucket {
  label: string;
  xp: number;
}

const DAY_MS = 86_400_000;

export function formatDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function shortMonthDay(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function xpByDate(entries: DailyXpEntry[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const entry of entries) {
    map.set(entry.date, (map.get(entry.date) ?? 0) + entry.xp);
  }
  return map;
}

export function todayUtcMs(now: Date = new Date()): number {
  return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
}

export function dailyBuckets(
  entries: DailyXpEntry[],
  days: number,
  now: Date = new Date(),
): XpBucket[] {
  const map = xpByDate(entries);
  const today = todayUtcMs(now);
  const buckets: XpBucket[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const dayMs = today - i * DAY_MS;
    buckets.push({
      label: shortMonthDay(dayMs),
      xp: map.get(formatDay(dayMs)) ?? 0,
    });
  }
  return buckets;
}

export function weeklyBuckets(
  entries: DailyXpEntry[],
  weeks: number,
  now: Date = new Date(),
): XpBucket[] {
  const map = xpByDate(entries);
  const today = todayUtcMs(now);
  const weekday = (new Date(today).getUTCDay() + 6) % 7;
  const currentMonday = today - weekday * DAY_MS;
  const buckets: XpBucket[] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const monday = currentMonday - w * 7 * DAY_MS;
    let xp = 0;
    for (let d = 0; d < 7; d++) {
      xp += map.get(formatDay(monday + d * DAY_MS)) ?? 0;
    }
    buckets.push({ label: shortMonthDay(monday), xp });
  }
  return buckets;
}

export type HeatmapLevel = 0 | 1 | 2 | 3 | 4;

export interface HeatmapCell {
  date: string;
  xp: number;
  points: number;
  level: HeatmapLevel;
  inFuture: boolean;
}

export interface HeatmapWeek {
  monthLabel: string | null;
  cells: HeatmapCell[];
}

export interface HeatmapThresholds {
  minXp: number;
  stretchXp: number;
}

export const DEFAULT_HEATMAP_THRESHOLDS: HeatmapThresholds = {
  minXp: 80,
  stretchXp: 100,
};

export function activityLevel(
  xp: number,
  thresholds: HeatmapThresholds = DEFAULT_HEATMAP_THRESHOLDS,
): HeatmapLevel {
  if (xp <= 0) return 0;
  if (xp < thresholds.minXp) return 1;
  if (xp < thresholds.stretchXp) return 2;
  if (xp < thresholds.stretchXp * 1.5) return 3;
  return 4;
}

export function heatmapWeeks(
  entries: DailyXpEntry[],
  weeks = 53,
  now: Date = new Date(),
  thresholds: HeatmapThresholds = DEFAULT_HEATMAP_THRESHOLDS,
): HeatmapWeek[] {
  const xpMap = xpByDate(entries);
  const pointsMap = new Map<string, number>();
  for (const entry of entries) {
    pointsMap.set(entry.date, (pointsMap.get(entry.date) ?? 0) + entry.points);
  }
  const today = todayUtcMs(now);
  const weekday = (new Date(today).getUTCDay() + 6) % 7;
  const currentMonday = today - weekday * DAY_MS;
  const startMonday = currentMonday - (weeks - 1) * 7 * DAY_MS;

  const result: HeatmapWeek[] = [];
  let previousMonth = -1;
  for (let w = 0; w < weeks; w++) {
    const monday = startMonday + w * 7 * DAY_MS;
    const month = new Date(monday).getUTCMonth();
    const monthLabel =
      w === 0 || month !== previousMonth
        ? new Date(monday).toLocaleDateString(undefined, {
            month: "short",
            timeZone: "UTC",
          })
        : null;
    previousMonth = month;
    const cells: HeatmapCell[] = [];
    for (let d = 0; d < 7; d++) {
      const dayMs = monday + d * DAY_MS;
      const date = formatDay(dayMs);
      const xp = xpMap.get(date) ?? 0;
      cells.push({
        date,
        xp,
        points: pointsMap.get(date) ?? 0,
        level: activityLevel(xp, thresholds),
        inFuture: dayMs > today,
      });
    }
    result.push({ monthLabel, cells });
  }
  return result;
}

export function habitWeeklyBuckets(
  dates: string[],
  weeks: number,
  now: Date = new Date(),
): XpBucket[] {
  const counts = new Map<string, number>();
  for (const date of dates) {
    counts.set(date, (counts.get(date) ?? 0) + 1);
  }
  const today = todayUtcMs(now);
  const weekday = (new Date(today).getUTCDay() + 6) % 7;
  const currentMonday = today - weekday * DAY_MS;
  const buckets: XpBucket[] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const monday = currentMonday - w * 7 * DAY_MS;
    let count = 0;
    for (let d = 0; d < 7; d++) {
      count += counts.get(formatDay(monday + d * DAY_MS)) ?? 0;
    }
    buckets.push({ label: shortMonthDay(monday), xp: count });
  }
  return buckets;
}

export function monthlyBuckets(
  entries: DailyXpEntry[],
  months: number,
  now: Date = new Date(),
): XpBucket[] {
  const map = new Map<string, number>();
  for (const entry of entries) {
    const key = entry.date.slice(0, 7);
    map.set(key, (map.get(key) ?? 0) + entry.xp);
  }
  const monthIndex = now.getFullYear() * 12 + now.getMonth();
  const buckets: XpBucket[] = [];
  for (let m = months - 1; m >= 0; m--) {
    const idx = monthIndex - m;
    const year = Math.floor(idx / 12);
    const month = (idx % 12) + 1;
    const key = `${year}-${String(month).padStart(2, "0")}`;
    const label = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(
      undefined,
      { month: "short", year: "2-digit", timeZone: "UTC" },
    );
    buckets.push({ label, xp: map.get(key) ?? 0 });
  }
  return buckets;
}
