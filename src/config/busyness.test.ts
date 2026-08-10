import { describe, expect, test } from "bun:test";
import { busyLevelFor, computeBusyness } from "./busyness";
import type { HabitEntry } from "../types/habits";
import type { TaskEntry } from "../types/tasks";

const DAY = "2026-08-10";

function habit(overrides: Partial<HabitEntry>): HabitEntry {
  return {
    id: 1,
    name: "Habit",
    description: "",
    requirement: "",
    icon: "",
    points: 1,
    priority: "medium",
    sortOrder: 1,
    archived: false,
    archivedAt: null,
    isSystem: true,
    createdAt: "2026-01-01 00:00:00",
    completed: false,
    ...overrides,
  };
}

function task(overrides: Partial<TaskEntry>): TaskEntry {
  return {
    id: 1,
    title: "Task",
    description: "",
    dueDate: DAY,
    dueTime: null,
    priority: null,
    completedAt: null,
    createdAt: "2026-08-01 00:00:00",
    updatedAt: "2026-08-01 00:00:00",
    ...overrides,
  };
}

describe("busyLevelFor", () => {
  test("level thresholds", () => {
    expect(busyLevelFor(0).id).toBe("light");
    expect(busyLevelFor(4.9).id).toBe("light");
    expect(busyLevelFor(5).id).toBe("moderate");
    expect(busyLevelFor(10).id).toBe("busy");
    expect(busyLevelFor(16).id).toBe("very-busy");
    expect(busyLevelFor(24).id).toBe("extremely-busy");
  });
});

describe("computeBusyness", () => {
  test("weights by priority, tasks over habits", () => {
    const b = computeBusyness(
      [task({ priority: "high" }), task({ id: 2, priority: "medium" })],
      [habit({ priority: "high" }), habit({ id: 2, priority: "low" })],
      DAY,
    );
    expect(b.score).toBe(4 + 2 + 2 + 0.5);
    expect(b.taskCount).toBe(2);
    expect(b.habitCount).toBe(2);
    expect(b.level.id).toBe("moderate");
  });

  test("no-priority tasks count toward items but not score", () => {
    const b = computeBusyness([task({ priority: null })], [], DAY);
    expect(b.taskCount).toBe(1);
    expect(b.score).toBe(0);
  });

  test("completed items still count", () => {
    const b = computeBusyness(
      [task({ priority: "high", completedAt: "2026-08-10 09:00:00" })],
      [],
      DAY,
    );
    expect(b.score).toBe(4);
  });

  test("tasks on other days are ignored", () => {
    const b = computeBusyness([task({ dueDate: "2026-08-11", priority: "high" })], [], DAY);
    expect(b.score).toBe(0);
    expect(b.taskCount).toBe(0);
  });

  test("habit active range: created later does not count", () => {
    const b = computeBusyness([], [habit({ createdAt: "2026-08-11 08:00:00" })], DAY);
    expect(b.habitCount).toBe(0);
  });

  test("disabled habit counts only before its archived day", () => {
    const h = habit({ archived: true, archivedAt: "2026-08-10 12:00:00" });
    expect(computeBusyness([], [h], "2026-08-09").habitCount).toBe(1);
    expect(computeBusyness([], [h], DAY).habitCount).toBe(0);
    expect(computeBusyness([], [h], "2026-08-11").habitCount).toBe(0);
  });
});
