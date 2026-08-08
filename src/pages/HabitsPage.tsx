import { memo, useCallback, useState } from "react";
import { CheckIcon } from "../components/icons";
import { ProgressBar } from "../components/StatCard";
import { useGoalStore } from "../stores/goalStore";
import { useHabitStore } from "../stores/habitStore";
import type { HabitEntry } from "../types/habits";

const HabitCard = memo(function HabitCard({
  habit,
  pending,
  onToggle,
}: {
  habit: HabitEntry;
  pending: boolean;
  onToggle: (id: number) => void;
}) {
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => onToggle(habit.id)}
      aria-pressed={habit.completed}
      className={`glass-sm glass-hover flex items-center gap-3 p-4 text-left transition-colors disabled:opacity-60 ${
        habit.completed ? "border-accent/50 bg-accent/10" : ""
      }`}
    >
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition-colors ${
          habit.completed
            ? "border-accent bg-accent text-white"
            : "border-slate-400/50 text-transparent dark:border-slate-500/50"
        }`}
      >
        <span
          className={`flex items-center justify-center ${habit.completed ? "animate-pop-in" : ""}`}
        >
          <CheckIcon width={14} height={14} />
        </span>
      </span>
      <span
        className={`flex-1 text-sm font-medium ${
          habit.completed
            ? "text-accent"
            : "text-slate-800 dark:text-slate-100"
        }`}
      >
        {habit.name}
      </span>
      <span
        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
          habit.completed
            ? "bg-accent/20 text-accent"
            : "bg-slate-900/5 text-slate-500 dark:bg-white/10 dark:text-slate-400"
        }`}
      >
        +{habit.points}
      </span>
    </button>
  );
});

export default function HabitsPage() {
  const habits = useHabitStore((s) => s.habits);
  const todayTotals = useHabitStore((s) => s.todayTotals);
  const streak = useHabitStore((s) => s.streak);
  const hydrated = useHabitStore((s) => s.hydrated);
  const error = useHabitStore((s) => s.error);
  const toggleHabit = useHabitStore((s) => s.toggleHabit);
  const minGoal = useGoalStore((s) => s.minGoal);
  const stretchGoal = useGoalStore((s) => s.stretchGoal);
  const [pendingId, setPendingId] = useState<number | null>(null);

  const points = todayTotals?.points ?? 0;
  const completedCount = habits.filter((h) => h.completed).length;

  const handleToggle = useCallback(async (habitId: number) => {
    setPendingId(habitId);
    try {
      await toggleHabit(habitId);
    } catch {
      // store records the error; card state is unchanged
    } finally {
      setPendingId(null);
    }
  }, [toggleHabit]);

  if (!hydrated) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {error ? `Failed to load habits: ${error}` : "Loading habits…"}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-8">
      <header className="flex flex-col gap-1">
        <h2 className="text-2xl font-semibold text-slate-800 dark:text-slate-100">
          Habits
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {completedCount} of {habits.length} completed today
        </p>
      </header>

      {error && (
        <p className="glass-sm border-red-400/40 p-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <section className="glass flex flex-col gap-3 p-5">
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-medium text-slate-800 dark:text-slate-200">
            Daily Goal
          </h3>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {points} / {stretchGoal} pts
            {streak?.todayMet ? " — minimum goal met" : ""}
          </span>
        </div>
        <ProgressBar
          value={points}
          max={stretchGoal}
          marker={minGoal}
        />
        <p className="text-xs text-slate-500">
          Reach {minGoal} pts (marker) to keep your streak;{" "}
          {stretchGoal} pts is the stretch goal. Extra points still earn
          XP.
        </p>
      </section>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {habits.map((habit) => (
          <HabitCard
            key={habit.id}
            habit={habit}
            pending={pendingId === habit.id}
            onToggle={handleToggle}
          />
        ))}
      </section>
    </div>
  );
}
