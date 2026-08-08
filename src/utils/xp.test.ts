import { describe, expect, test } from "bun:test";
import { levelForXp, levelProgress, xpForLevel } from "./xp";

describe("xpForLevel", () => {
  test("matches the spec formula thresholds", () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(2)).toBe(100);
    expect(xpForLevel(3)).toBe(250);
    expect(xpForLevel(4)).toBe(450);
    expect(xpForLevel(5)).toBe(700);
    expect(xpForLevel(10)).toBe(2700);
  });
});

describe("levelForXp", () => {
  test("level 1 below first threshold", () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(99)).toBe(1);
  });

  test("advances exactly at thresholds", () => {
    expect(levelForXp(100)).toBe(2);
    expect(levelForXp(249)).toBe(2);
    expect(levelForXp(250)).toBe(3);
    expect(levelForXp(2699)).toBe(9);
    expect(levelForXp(2700)).toBe(10);
  });

  test("clamps negative xp", () => {
    expect(levelForXp(-50)).toBe(1);
  });
});

describe("levelProgress", () => {
  test("zero xp", () => {
    const p = levelProgress(0);
    expect(p).toEqual({
      level: 1,
      totalXp: 0,
      currentLevelXp: 0,
      nextLevelXp: 100,
      xpIntoLevel: 0,
      xpToNextLevel: 100,
      progressRatio: 0,
    });
  });

  test("at exact level boundary", () => {
    const p = levelProgress(100);
    expect(p.level).toBe(2);
    expect(p.currentLevelXp).toBe(100);
    expect(p.nextLevelXp).toBe(250);
    expect(p.xpIntoLevel).toBe(0);
    expect(p.xpToNextLevel).toBe(150);
    expect(p.progressRatio).toBe(0);
  });

  test("mid-level ratio", () => {
    const p = levelProgress(175);
    expect(p.xpIntoLevel).toBe(75);
    expect(p.xpToNextLevel).toBe(75);
    expect(p.progressRatio).toBeCloseTo(0.5);
  });

  test("just below next level", () => {
    const p = levelProgress(249);
    expect(p.level).toBe(2);
    expect(p.xpToNextLevel).toBe(1);
    expect(p.progressRatio).toBeLessThan(1);
  });

  test("large xp stays consistent", () => {
    const p = levelProgress(1_000_000);
    expect(p.currentLevelXp).toBeLessThanOrEqual(p.totalXp);
    expect(p.totalXp).toBeLessThan(p.nextLevelXp);
    expect(p.xpIntoLevel + p.xpToNextLevel).toBe(p.nextLevelXp - p.currentLevelXp);
  });
});
