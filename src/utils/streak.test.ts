import { describe, expect, test } from "bun:test";
import { currentStreak } from "./streak";

describe("currentStreak", () => {
  test("no met days is zero", () => {
    const r = currentStreak([], "2026-08-08");
    expect(r.current).toBe(0);
    expect(r.lastMetDate).toBeNull();
    expect(r.todayMet).toBe(false);
  });

  test("today met starts streak", () => {
    const r = currentStreak(["2026-08-08"], "2026-08-08");
    expect(r.current).toBe(1);
    expect(r.lastMetDate).toBe("2026-08-08");
    expect(r.todayMet).toBe(true);
  });

  test("consecutive days including today", () => {
    const r = currentStreak(
      ["2026-08-08", "2026-08-07", "2026-08-06", "2026-08-04"],
      "2026-08-08",
    );
    expect(r.current).toBe(3);
  });

  test("streak survives unfinished today", () => {
    const r = currentStreak(
      ["2026-08-07", "2026-08-06", "2026-08-05"],
      "2026-08-08",
    );
    expect(r.current).toBe(3);
    expect(r.lastMetDate).toBe("2026-08-07");
  });

  test("missed yesterday breaks streak", () => {
    const r = currentStreak(
      ["2026-08-06", "2026-08-05", "2026-08-04"],
      "2026-08-08",
    );
    expect(r.current).toBe(0);
    expect(r.lastMetDate).toBe("2026-08-06");
  });

  test("today met but yesterday missed is one", () => {
    const r = currentStreak(["2026-08-08", "2026-08-06", "2026-08-05"], "2026-08-08");
    expect(r.current).toBe(1);
  });

  test("month boundary counts as consecutive", () => {
    const r = currentStreak(["2026-09-01", "2026-08-31", "2026-08-30"], "2026-09-01");
    expect(r.current).toBe(3);
  });

  test("year boundary counts as consecutive", () => {
    const r = currentStreak(["2027-01-01", "2026-12-31"], "2027-01-01");
    expect(r.current).toBe(2);
  });

  test("future dates are ignored", () => {
    const r = currentStreak(["2026-08-10", "2026-08-07", "2026-08-06"], "2026-08-08");
    expect(r.current).toBe(2);
    expect(r.lastMetDate).toBe("2026-08-07");
  });
});
