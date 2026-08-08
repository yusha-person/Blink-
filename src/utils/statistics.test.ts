import { describe, expect, test } from "bun:test";
import {
  activityLevel,
  dailyBuckets,
  formatDay,
  habitWeeklyBuckets,
  heatmapWeeks,
  monthlyBuckets,
  weeklyBuckets,
} from "./statistics";

const NOW = new Date(2026, 7, 8); // Sat Aug 8 2026 (local)

describe("dailyBuckets", () => {
  test("fills a continuous range with zeros for missing days", () => {
    const buckets = dailyBuckets(
      [
        { date: "2026-08-08", points: 1, xp: 10 },
        { date: "2026-08-06", points: 2, xp: 20 },
      ],
      3,
      NOW,
    );
    expect(buckets.map((b) => b.xp)).toEqual([20, 0, 10]);
    expect(buckets).toHaveLength(3);
  });

  test("ignores entries outside the window", () => {
    const buckets = dailyBuckets(
      [{ date: "2026-08-01", points: 5, xp: 50 }],
      3,
      NOW,
    );
    expect(buckets.map((b) => b.xp)).toEqual([0, 0, 0]);
  });
});

describe("weeklyBuckets", () => {
  test("groups days into Monday-start weeks", () => {
    // Aug 8 2026 is a Saturday; week starts Mon Aug 3.
    const buckets = weeklyBuckets(
      [
        { date: "2026-08-03", points: 1, xp: 10 },
        { date: "2026-08-08", points: 2, xp: 20 },
        { date: "2026-08-02", points: 4, xp: 40 }, // previous week (Sunday)
      ],
      2,
      NOW,
    );
    expect(buckets.map((b) => b.xp)).toEqual([40, 30]);
    expect(buckets[1].label).toBe("Aug 3");
  });

  test("sums the full current partial week", () => {
    const buckets = weeklyBuckets(
      [{ date: "2026-08-08", points: 1, xp: 10 }],
      1,
      NOW,
    );
    expect(buckets[0].xp).toBe(10);
  });
});

describe("monthlyBuckets", () => {
  test("groups days into calendar months across year boundaries", () => {
    const buckets = monthlyBuckets(
      [
        { date: "2025-12-15", points: 1, xp: 100 },
        { date: "2026-01-01", points: 1, xp: 5 },
        { date: "2026-08-08", points: 1, xp: 7 },
      ],
      3,
      new Date(2026, 0, 10), // Jan 10 2026
    );
    expect(buckets.map((b) => b.xp)).toEqual([0, 100, 5]);
    expect(buckets[1].label).toContain("Dec");
  });

  test("includes the current partial month", () => {
    const buckets = monthlyBuckets(
      [{ date: "2026-08-01", points: 1, xp: 7 }],
      1,
      NOW,
    );
    expect(buckets[0].xp).toBe(7);
  });
});

describe("formatDay", () => {
  test("round-trips through dailyBuckets labels range", () => {
    expect(formatDay(Date.UTC(2026, 7, 8))).toBe("2026-08-08");
  });
});

describe("activityLevel", () => {
  test("maps XP to intensity levels", () => {
    expect(activityLevel(0)).toBe(0);
    expect(activityLevel(10)).toBe(1);
    expect(activityLevel(79)).toBe(1);
    expect(activityLevel(80)).toBe(2);
    expect(activityLevel(99)).toBe(2);
    expect(activityLevel(100)).toBe(3);
    expect(activityLevel(149)).toBe(3);
    expect(activityLevel(150)).toBe(4);
    expect(activityLevel(200)).toBe(4);
  });
});

describe("heatmapWeeks", () => {
  test("builds Monday-start weeks with 7 cells each", () => {
    const weeks = heatmapWeeks([], 53, NOW);
    expect(weeks).toHaveLength(53);
    for (const week of weeks) {
      expect(week.cells).toHaveLength(7);
    }
    const first = weeks[0].cells[0];
    expect(new Date(`${first.date}T00:00:00Z`).getUTCDay()).toBe(1);
  });

  test("ends with the current week and flags future days", () => {
    const weeks = heatmapWeeks([], 2, NOW);
    const last = weeks[weeks.length - 1];
    const today = last.cells.find((c) => c.date === "2026-08-08");
    expect(today?.inFuture).toBe(false);
    expect(last.cells[6].date).toBe("2026-08-09");
    expect(last.cells[6].inFuture).toBe(true);
  });

  test("places XP/points on the right day with the right level", () => {
    const weeks = heatmapWeeks(
      [{ date: "2026-08-03", points: 10, xp: 100 }],
      1,
      NOW,
    );
    expect(weeks[0].cells[0]).toMatchObject({
      date: "2026-08-03",
      xp: 100,
      points: 10,
      level: 3,
      inFuture: false,
    });
  });

  test("labels weeks when the month changes", () => {
    const weeks = heatmapWeeks([], 8, NOW);
    expect(weeks[0].monthLabel).not.toBeNull();
    const labels = weeks.map((w) => w.monthLabel);
    expect(labels).toContain("Aug");
    for (let i = 1; i < weeks.length; i++) {
      const prevMonth = new Date(
        `${weeks[i - 1].cells[0].date}T00:00:00Z`,
      ).getUTCMonth();
      const month = new Date(`${weeks[i].cells[0].date}T00:00:00Z`).getUTCMonth();
      if (month === prevMonth) expect(weeks[i].monthLabel).toBeNull();
    }
  });
});

describe("habitWeeklyBuckets", () => {
  test("counts completions per Monday-start week", () => {
    // NOW = Sat Aug 8 2026; current week starts Mon Aug 3, previous Mon Jul 27.
    const buckets = habitWeeklyBuckets(
      ["2026-08-03", "2026-08-08", "2026-07-28"],
      2,
      NOW,
    );
    expect(buckets).toHaveLength(2);
    expect(buckets.map((b) => b.xp)).toEqual([1, 2]);
    expect(buckets[1].label).toBe("Aug 3");
  });

  test("zero-fills weeks without completions", () => {
    const buckets = habitWeeklyBuckets(["2026-06-01"], 3, NOW);
    expect(buckets.map((b) => b.xp)).toEqual([0, 0, 0]);
  });
});
