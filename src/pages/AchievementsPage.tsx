import { useEffect, useState } from "react";
import AchievementDialog from "../components/AchievementDialog";
import ConfirmDialog from "../components/ConfirmDialog";
import {
  AchievementsIcon,
  CheckIcon,
  EditIcon,
  PlusIcon,
  TrashIcon,
} from "../components/icons";
import { ProgressBar } from "../components/StatCard";
import { useAchievementStore } from "../stores/achievementStore";
import { useHabitStore } from "../stores/habitStore";
import type {
  AchievementEntry,
  CustomAchievementEntry,
  CustomAchievementInput,
} from "../types/achievements";
import { CONDITION_LABELS, CONDITION_UNITS } from "../types/achievements";
import { formatFullTimestamp } from "../utils/timestamps";

function AchievementCard({ achievement }: { achievement: AchievementEntry }) {
  const { name, description, target, progress, unlocked, unlockedAt } = achievement;
  const shownProgress = Math.min(progress, target);
  return (
    <div
      className={`glass-sm glass-hover flex flex-col gap-3 p-4 ${
        unlocked ? "border-accent/50 bg-accent/10" : ""
      }`}
    >
      <div className="flex items-center gap-3">
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border ${
            unlocked
              ? "border-accent/50 bg-accent/15 text-accent"
              : "border-slate-900/10 text-slate-400 dark:border-white/10 dark:text-slate-500"
          }`}
        >
          {unlocked ? <CheckIcon /> : <AchievementsIcon />}
        </span>
        <div className="flex min-w-0 flex-col">
          <span
            className={`truncate text-sm font-semibold ${
              unlocked ? "text-accent" : "text-slate-800 dark:text-slate-100"
            }`}
          >
            {name}
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400">{description}</span>
        </div>
      </div>
      <ProgressBar value={shownProgress} max={target} />
      <span className="text-xs text-slate-500 dark:text-slate-400">
        {unlocked && unlockedAt
          ? `Unlocked ${formatFullTimestamp(unlockedAt)}`
          : `${shownProgress} / ${target}`}
      </span>
    </div>
  );
}

function CustomAchievementCard({
  achievement,
  onEdit,
  onDelete,
}: {
  achievement: CustomAchievementEntry;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { name, description, icon, target, progress, unlocked, unlockedAt, conditionType } =
    achievement;
  const shownProgress = Math.min(progress, target);
  const unit = CONDITION_UNITS[conditionType];
  const isTaskRequirement = conditionType === "task_requirement";
  const isAnyChecklist = isTaskRequirement && achievement.combinationMode === "any";
  return (
    <div
      className={`glass-sm glass-hover group flex flex-col gap-3 p-4 ${
        unlocked ? "border-accent/50 bg-accent/10" : ""
      }`}
    >
      <div className="flex items-center gap-3">
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-lg ${
            unlocked
              ? "border-accent/50 bg-accent/15"
              : "border-slate-900/10 dark:border-white/10"
          }`}
        >
          {icon}
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span
            className={`truncate text-sm font-semibold ${
              unlocked ? "text-accent" : "text-slate-800 dark:text-slate-100"
            }`}
          >
            {name}
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {description.trim() ||
              (isTaskRequirement
                ? achievement.combinationMode === "any"
                  ? "Complete any one of the linked tasks"
                  : "Complete all linked tasks"
                : CONDITION_LABELS[conditionType])}
          </span>
        </div>
        <span className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Edit ${name}`}
            className="rounded p-1 text-slate-400 hover:text-accent"
          >
            <EditIcon width={13} height={13} />
          </button>
          <button
            type="button"
            onClick={onDelete}
            aria-label={`Delete ${name}`}
            className="rounded p-1 text-slate-400 hover:text-red-500"
          >
            <TrashIcon width={13} height={13} />
          </button>
        </span>
      </div>
      {isAnyChecklist ? (
        <ul className="flex flex-col gap-1">
          {achievement.tasks.map((task) => (
            <li key={task.id} className="flex items-center gap-2 text-xs">
              <span
                className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border ${
                  task.completedAt
                    ? "border-accent bg-accent text-accent-text"
                    : "border-border text-transparent"
                }`}
              >
                <CheckIcon width={9} height={9} />
              </span>
              <span
                className={
                  task.completedAt
                    ? "text-slate-500 line-through dark:text-slate-400"
                    : "text-slate-700 dark:text-slate-300"
                }
              >
                {task.title}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <ProgressBar value={shownProgress} max={target} />
      )}
      <span className="text-xs text-slate-500 dark:text-slate-400">
        {unlocked && unlockedAt
          ? `Unlocked ${formatFullTimestamp(unlockedAt)}`
          : isAnyChecklist
            ? "Complete any one to unlock"
            : `${shownProgress} / ${target} ${unit}`}
      </span>
    </div>
  );
}

export default function AchievementsPage() {
  const achievements = useAchievementStore((s) => s.achievements);
  const customAchievements = useAchievementStore((s) => s.customAchievements);
  const hydrated = useAchievementStore((s) => s.hydrated);
  const error = useAchievementStore((s) => s.error);
  const hydrate = useAchievementStore((s) => s.hydrate);
  const customDialogOpen = useAchievementStore((s) => s.customDialogOpen);
  const openCustomDialog = useAchievementStore((s) => s.openCustomDialog);
  const closeCustomDialog = useAchievementStore((s) => s.closeCustomDialog);
  const createCustom = useAchievementStore((s) => s.createCustom);
  const updateCustom = useAchievementStore((s) => s.updateCustom);
  const deleteCustom = useAchievementStore((s) => s.deleteCustom);
  const habitsHydrated = useHabitStore((s) => s.hydrated);
  const hydrateHabits = useHabitStore((s) => s.hydrate);

  const [editing, setEditing] = useState<CustomAchievementEntry | null>(null);
  const [deleting, setDeleting] = useState<CustomAchievementEntry | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!habitsHydrated) void hydrateHabits();
  }, [habitsHydrated, hydrateHabits]);

  const handleSave = async (input: CustomAchievementInput) => {
    setBusy(true);
    try {
      if (editing) {
        await updateCustom(editing.id, input);
        setEditing(null);
      } else {
        await createCustom(input);
        closeCustomDialog();
      }
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await deleteCustom(deleting.id);
      setDeleting(null);
    } finally {
      setBusy(false);
    }
  };

  if (!hydrated) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {error ? `Failed to load achievements: ${error}` : "Loading…"}
        </p>
      </div>
    );
  }

  const totalCount = achievements.length + customAchievements.length;
  const unlockedCount =
    achievements.filter((a) => a.unlocked).length +
    customAchievements.filter((a) => a.unlocked).length;

  return (
    <div className="flex flex-col gap-6 p-8">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-semibold text-slate-800 dark:text-slate-100">Achievements</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {unlockedCount} / {totalCount} unlocked — milestones you earn along the way.
          </p>
        </div>
        <button
          type="button"
          onClick={openCustomDialog}
          className="flex items-center gap-1.5 rounded-lg border border-accent/50 bg-accent/15 px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/25"
        >
          <PlusIcon width={14} height={14} />
          New Custom
        </button>
      </header>

      {error && (
        <div className="glass border-red-400/40 p-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {achievements.map((a) => (
          <AchievementCard key={a.key} achievement={a} />
        ))}
        {customAchievements.map((a) => (
          <CustomAchievementCard
            key={a.id}
            achievement={a}
            onEdit={() => setEditing(a)}
            onDelete={() => setDeleting(a)}
          />
        ))}
      </section>

      {(customDialogOpen || editing) && (
        <AchievementDialog
          achievement={editing}
          busy={busy}
          onSave={(input) => void handleSave(input)}
          onCancel={() => {
            closeCustomDialog();
            setEditing(null);
          }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title="Delete custom achievement"
          message={`Permanently delete "${deleting.name}"? This cannot be undone.`}
          busy={busy}
          onConfirm={() => void handleDelete()}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
