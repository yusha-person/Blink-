import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import ConfirmDialog from "../components/ConfirmDialog";
import HabitDialog from "../components/HabitDialog";
import {
  CheckIcon,
  EditIcon,
  EyeIcon,
  PlusIcon,
  RestoreIcon,
  TrashIcon,
} from "../components/icons";
import { ProgressBar } from "../components/StatCard";
import { useAchievementStore } from "../stores/achievementStore";
import { useGoalStore } from "../stores/goalStore";
import { useHabitStore } from "../stores/habitStore";
import type { HabitEntry, HabitInput } from "../types/habits";
import type { HabitCompletionStats } from "../types/statistics";
import { PRIORITY_BADGE_STYLES } from "../utils/priority";

const HabitCard = memo(function HabitCard({
  habit,
  pending,
  onToggle,
  onEdit,
  onDisable,
  onDelete,
}: {
  habit: HabitEntry;
  pending: boolean;
  onToggle: (id: number) => void;
  onEdit: (habit: HabitEntry) => void;
  onDisable: (habit: HabitEntry) => void;
  onDelete: (habit: HabitEntry) => void;
}) {
  return (
    <div
      className={`glass-sm glass-hover group flex items-center gap-3 p-4 transition-colors ${
        habit.completed ? "border-accent/50 bg-accent/10" : ""
      }`}
    >
      <button
        type="button"
        disabled={pending}
        onClick={() => onToggle(habit.id)}
        aria-pressed={habit.completed}
        aria-label={`${habit.completed ? "Uncomplete" : "Complete"} ${habit.name}`}
        className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:opacity-60"
      >
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition-colors ${
            habit.completed
              ? "border-accent bg-accent text-accent-text"
              : "border-slate-400/50 text-transparent dark:border-slate-500/50"
          }`}
        >
          <span
            className={`flex items-center justify-center ${habit.completed ? "animate-pop-in" : ""}`}
          >
            <CheckIcon width={14} height={14} />
          </span>
        </span>
        {habit.icon && <span className="shrink-0 text-base">{habit.icon}</span>}
        <span className="min-w-0 flex-1">
          <span
            className={`block truncate text-sm font-medium ${
              habit.completed ? "text-accent" : "text-slate-800 dark:text-slate-100"
            }`}
          >
            {habit.name}
          </span>
          {habit.requirement && (
            <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
              {habit.requirement}
            </span>
          )}
        </span>
      </button>
      <span
        className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize ${PRIORITY_BADGE_STYLES[habit.priority]}`}
      >
        {habit.priority}
      </span>
      <span
        className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
          habit.completed ? "bg-accent/20 text-accent" : "bg-surface text-muted"
        }`}
      >
        +{habit.points}
      </span>
      <span className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
        <button
          type="button"
          onClick={() => onEdit(habit)}
          aria-label={`Edit ${habit.name}`}
          className="rounded p-1 text-muted hover:text-accent"
        >
          <EditIcon width={13} height={13} />
        </button>
        <button
          type="button"
          onClick={() => onDisable(habit)}
          aria-label={`Disable ${habit.name}`}
          title="Disable (keeps history)"
          className="rounded p-1 text-muted hover:text-warning"
        >
          <EyeIcon width={13} height={13} />
        </button>
        <button
          type="button"
          onClick={() => onDelete(habit)}
          aria-label={`Delete ${habit.name}`}
          title="Delete permanently (removes history and its earned XP)"
          className="rounded p-1 text-muted hover:text-danger"
        >
          <TrashIcon width={13} height={13} />
        </button>
      </span>
    </div>
  );
});

export default function HabitsPage() {
  const habits = useHabitStore((s) => s.habits);
  const todayTotals = useHabitStore((s) => s.todayTotals);
  const streak = useHabitStore((s) => s.streak);
  const hydrated = useHabitStore((s) => s.hydrated);
  const error = useHabitStore((s) => s.error);
  const toggleHabit = useHabitStore((s) => s.toggleHabit);
  const createHabit = useHabitStore((s) => s.createHabit);
  const updateHabit = useHabitStore((s) => s.updateHabit);
  const setHabitArchived = useHabitStore((s) => s.setHabitArchived);
  const deleteHabit = useHabitStore((s) => s.deleteHabit);
  const minGoal = useGoalStore((s) => s.minGoal);
  const stretchGoal = useGoalStore((s) => s.stretchGoal);
  const customAchievements = useAchievementStore((s) => s.customAchievements);
  const achievementsHydrated = useAchievementStore((s) => s.hydrated);
  const hydrateAchievements = useAchievementStore((s) => s.hydrate);

  const [pendingId, setPendingId] = useState<number | null>(null);
  const [dialog, setDialog] = useState<{ open: boolean; habit: HabitEntry | null }>({
    open: false,
    habit: null,
  });
  const [deleting, setDeleting] = useState<HabitEntry | null>(null);
  const [deleteCompletions, setDeleteCompletions] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!achievementsHydrated) void hydrateAchievements();
  }, [achievementsHydrated, hydrateAchievements]);

  useEffect(() => {
    if (!deleting) {
      setDeleteCompletions(null);
      return;
    }
    let cancelled = false;
    void invoke<HabitCompletionStats[]>("get_habit_completion_stats").then((stats) => {
      if (cancelled) return;
      const match = stats.find((s) => s.habitId === deleting.id);
      setDeleteCompletions(match?.totalCompletions ?? 0);
    }).catch(() => setDeleteCompletions(null));
    return () => {
      cancelled = true;
    };
  }, [deleting]);

  const activeHabits = useMemo(() => habits.filter((h) => !h.archived), [habits]);
  const disabledHabits = useMemo(() => habits.filter((h) => h.archived), [habits]);

  const blockedAchievements = useMemo(() => {
    if (!deleting) return [];
    return customAchievements.filter(
      (a) => a.conditionType === "habit_count" && a.habitId === deleting.id && !a.unlocked,
    );
  }, [deleting, customAchievements]);

  const points = todayTotals?.points ?? 0;
  const completedCount = activeHabits.filter((h) => h.completed).length;

  const handleToggle = useCallback(
    async (habitId: number) => {
      setPendingId(habitId);
      try {
        await toggleHabit(habitId);
      } catch {
        // store records the error; card state is unchanged
      } finally {
        setPendingId(null);
      }
    },
    [toggleHabit],
  );

  const handleSave = async (input: HabitInput) => {
    setBusy(true);
    try {
      const ok = dialog.habit
        ? await updateHabit(dialog.habit.id, input)
        : await createHabit(input);
      if (ok) setDialog({ open: false, habit: null });
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      const ok = await deleteHabit(deleting.id);
      if (ok) setDeleting(null);
    } finally {
      setBusy(false);
    }
  };

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
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-semibold text-slate-800 dark:text-slate-100">Habits</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {completedCount} of {activeHabits.length} completed today
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDialog({ open: true, habit: null })}
          className="flex items-center gap-1.5 rounded-lg border border-accent/50 bg-accent/15 px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/25"
        >
          <PlusIcon width={14} height={14} />
          New Habit
        </button>
      </header>

      {error && (
        <p className="glass-sm border-red-400/40 p-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <section className="glass flex flex-col gap-3 p-5">
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-medium text-slate-800 dark:text-slate-200">Daily Goal</h3>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {points} / {stretchGoal} pts
            {streak?.todayMet ? " — minimum goal met" : ""}
          </span>
        </div>
        <ProgressBar value={points} max={stretchGoal} marker={minGoal} />
        <p className="text-xs text-slate-500">
          Reach {minGoal} pts (marker) to keep your streak; {stretchGoal} pts is the stretch goal.
          Extra points still earn XP.
        </p>
      </section>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {activeHabits.map((habit) => (
          <HabitCard
            key={habit.id}
            habit={habit}
            pending={pendingId === habit.id}
            onToggle={handleToggle}
            onEdit={(h) => setDialog({ open: true, habit: h })}
            onDisable={(h) => void setHabitArchived(h.id, true)}
            onDelete={setDeleting}
          />
        ))}
      </section>

      {disabledHabits.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
            Disabled · {disabledHabits.length}
          </h3>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
            {disabledHabits.map((habit) => (
              <div
                key={habit.id}
                className="glass-sm flex items-center gap-2 p-3 opacity-60"
              >
                {habit.icon && <span className="text-base">{habit.icon}</span>}
                <span className="min-w-0 flex-1 truncate text-sm text-muted">{habit.name}</span>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10px] capitalize ${PRIORITY_BADGE_STYLES[habit.priority]}`}
                >
                  {habit.priority}
                </span>
                <button
                  type="button"
                  onClick={() => void setHabitArchived(habit.id, false)}
                  aria-label={`Enable ${habit.name}`}
                  title="Enable again"
                  className="rounded p-1 text-muted hover:text-success"
                >
                  <RestoreIcon width={13} height={13} />
                </button>
                <button
                  type="button"
                  onClick={() => setDeleting(habit)}
                  aria-label={`Delete ${habit.name}`}
                  title="Delete permanently (removes history and its earned XP)"
                  className="rounded p-1 text-muted hover:text-danger"
                >
                  <TrashIcon width={13} height={13} />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {dialog.open && (
        <HabitDialog
          habit={dialog.habit}
          busy={busy}
          onSave={(input) => void handleSave(input)}
          onCancel={() => setDialog({ open: false, habit: null })}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title={`Delete "${deleting.name}"`}
          message={`This action is permanent and cannot be undone. All completion history for "${deleting.name}" will be deleted along with it.${
            deleteCompletions !== null && deleteCompletions > 0
              ? ` It has earned ${deleteCompletions * deleting.points} pts / ${deleteCompletions * deleting.points * 10} XP across ${deleteCompletions} completion${deleteCompletions === 1 ? "" : "s"} — that XP will be removed from your totals, which may lower your level and break streaks.`
              : ""
          }${
            deleting.isSystem
              ? " This is a built-in habit: statistics and built-in achievements that reference it will no longer be computable."
              : ""
          }${
            blockedAchievements.length > 0
              ? ` Warning: the following locked custom achievements reference this habit and will become permanently unattainable unless you edit them first: ${blockedAchievements
                  .map((a) => `"${a.name}"`)
                  .join(", ")}.`
              : ""
          }`}
          confirmLabel="Delete Permanently"
          busy={busy}
          onConfirm={() => void handleDelete()}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
