import { useEffect, useMemo, useState } from "react";
import {
  busynessReason,
  computeBusyness,
  type BusynessBreakdown,
} from "../config/busyness";
import { useHabitStore } from "../stores/habitStore";
import { useTaskStore } from "../stores/taskStore";

const LEVEL_STYLES: Record<string, string> = {
  light: "border-success/40 bg-success/10 text-success",
  moderate: "border-accent/40 bg-accent/10 text-accent",
  busy: "border-warning/40 bg-warning/10 text-warning",
  "very-busy": "border-danger/40 bg-danger/10 text-danger",
  "extremely-busy": "border-danger/60 bg-danger/20 text-danger",
};

export function useBusyness(day: string): BusynessBreakdown | null {
  const tasks = useTaskStore((s) => s.tasks);
  const tasksHydrated = useTaskStore((s) => s.hydrated);
  const hydrateTasks = useTaskStore((s) => s.hydrate);
  const habits = useHabitStore((s) => s.habits);
  const habitsHydrated = useHabitStore((s) => s.hydrated);

  useEffect(() => {
    if (!tasksHydrated) void hydrateTasks();
  }, [tasksHydrated, hydrateTasks]);

  return useMemo(() => {
    if (!tasksHydrated || !habitsHydrated) return null;
    return computeBusyness(tasks, habits, day);
  }, [tasks, habits, day, tasksHydrated, habitsHydrated]);
}

function BreakdownDialog({
  day,
  breakdown,
  onClose,
}: {
  day: string;
  breakdown: BusynessBreakdown;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const priorityLine = (counts: Record<"low" | "medium" | "high", number>) =>
    (["high", "medium", "low"] as const)
      .filter((p) => counts[p] > 0)
      .map((p) => `${p[0].toUpperCase()}${p.slice(1)}: ${counts[p]}`)
      .join(", ") || "none";

  return (
    <div
      className="animate-overlay-in fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Busyness breakdown"
    >
      <div
        className="glass animate-dialog-in flex w-full max-w-sm flex-col gap-3 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-text">
          {breakdown.level.label}{" "}
          <span className="font-normal text-muted">(score: {breakdown.score})</span>
        </h3>
        <p className="text-xs text-muted">{day}</p>
        <div className="flex flex-col gap-1 text-xs text-text">
          <p>
            <span className="font-medium">Tasks ({breakdown.taskCount}):</span>{" "}
            {priorityLine(breakdown.tasksByPriority)}
          </p>
          <p>
            <span className="font-medium">Habits ({breakdown.habitCount} active):</span>{" "}
            {priorityLine(breakdown.habitsByPriority)}
          </p>
        </div>
        <p className="border-t border-border pt-2 text-xs leading-relaxed text-muted">
          <span className="font-medium text-text">Reason:</span> {busynessReason(breakdown)}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="glass-sm glass-hover mt-1 self-end px-3 py-1.5 text-xs text-muted"
        >
          Close
        </button>
      </div>
    </div>
  );
}

export default function BusynessChip({ day }: { day: string }) {
  const breakdown = useBusyness(day);
  const [open, setOpen] = useState(false);

  if (!breakdown) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={`${breakdown.level.description} — click for breakdown`}
        className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold transition-colors ${LEVEL_STYLES[breakdown.level.id]}`}
      >
        {breakdown.level.label} · {breakdown.score}
      </button>
      {open && (
        <BreakdownDialog day={day} breakdown={breakdown} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
