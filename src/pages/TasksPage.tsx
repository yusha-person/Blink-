import { useEffect, useMemo, useState } from "react";
import ConfirmDialog from "../components/ConfirmDialog";
import TaskDialog from "../components/TaskDialog";
import { TaskRow } from "../components/TaskRow";
import { PlusIcon } from "../components/icons";
import { useAchievementStore } from "../stores/achievementStore";
import { useTaskStore, type TaskInput } from "../stores/taskStore";
import type { TaskEntry, TaskFilter, TaskSortBy } from "../types/tasks";
import { groupTasks, sortTasks } from "../utils/tasks";
import { localDateString } from "../utils/timestamps";

const SORT_OPTIONS: { value: TaskSortBy; label: string }[] = [
  { value: "due", label: "Due date" },
  { value: "priority", label: "Priority" },
  { value: "created", label: "Created" },
];

const FILTER_OPTIONS: { value: TaskFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "incomplete", label: "Incomplete" },
  { value: "completed", label: "Completed" },
];

function TaskSection({
  title,
  tasks,
  today,
  accent = false,
  onToggle,
  onEdit,
  onDelete,
}: {
  title: string;
  tasks: TaskEntry[];
  today: string;
  accent?: boolean;
  onToggle: (id: number, completed: boolean) => void;
  onEdit: (task: TaskEntry) => void;
  onDelete: (task: TaskEntry) => void;
}) {
  if (tasks.length === 0) return null;
  return (
    <section className="flex flex-col gap-2">
      <h3
        className={`text-xs font-semibold uppercase tracking-wide ${
          accent ? "text-danger" : "text-muted"
        }`}
      >
        {title} · {tasks.length}
      </h3>
      <div className="flex flex-col gap-2">
        {tasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            today={today}
            onToggle={onToggle}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </div>
    </section>
  );
}

export default function TasksPage() {
  const tasks = useTaskStore((s) => s.tasks);
  const hydrated = useTaskStore((s) => s.hydrated);
  const error = useTaskStore((s) => s.error);
  const sortBy = useTaskStore((s) => s.sortBy);
  const filter = useTaskStore((s) => s.filter);
  const hydrate = useTaskStore((s) => s.hydrate);
  const setSortBy = useTaskStore((s) => s.setSortBy);
  const setFilter = useTaskStore((s) => s.setFilter);
  const createTask = useTaskStore((s) => s.createTask);
  const updateTask = useTaskStore((s) => s.updateTask);
  const toggleTask = useTaskStore((s) => s.toggleTask);
  const deleteTask = useTaskStore((s) => s.deleteTask);

  const [dialog, setDialog] = useState<{ open: boolean; task: TaskEntry | null }>({
    open: false,
    task: null,
  });
  const createDialogOpen = useTaskStore((s) => s.createDialogOpen);
  const openCreateDialog = useTaskStore((s) => s.openCreateDialog);
  const closeCreateDialog = useTaskStore((s) => s.closeCreateDialog);
  const [deleting, setDeleting] = useState<TaskEntry | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const customAchievements = useAchievementStore((s) => s.customAchievements);
  const achievementsHydrated = useAchievementStore((s) => s.hydrated);
  const hydrateAchievements = useAchievementStore((s) => s.hydrate);
  const deleteCustomAchievement = useAchievementStore((s) => s.deleteCustom);

  useEffect(() => {
    if (!achievementsHydrated) void hydrateAchievements();
  }, [achievementsHydrated, hydrateAchievements]);

  const linkedAchievements = useMemo(() => {
    if (!deleting) return [];
    return customAchievements.filter(
      (a) => a.conditionType === "task_requirement" && a.tasks.some((t) => t.id === deleting.id),
    );
  }, [deleting, customAchievements]);
  const soleLinked = linkedAchievements.filter((a) => a.tasks.length <= 1);

  const today = localDateString();

  const visible = useMemo(() => {
    const filtered = tasks.filter((t) => {
      if (filter === "completed") return t.completedAt !== null;
      if (filter === "incomplete") return t.completedAt === null;
      return true;
    });
    return sortTasks(filtered, sortBy);
  }, [tasks, filter, sortBy]);

  const groups = useMemo(() => groupTasks(visible, today), [visible, today]);

  const handleToggle = (id: number, completed: boolean) => {
    void toggleTask(id, completed).catch(() => void hydrate());
  };

  const handleSave = async (input: TaskInput) => {
    setBusy(true);
    try {
      if (dialog.task) {
        await updateTask(dialog.task.id, input);
        setDialog({ open: false, task: null });
      } else {
        await createTask(input);
        closeCreateDialog();
      }
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      for (const achievement of soleLinked) {
        await deleteCustomAchievement(achievement.id);
      }
      await deleteTask(deleting.id);
      setDeleting(null);
    } finally {
      setBusy(false);
    }
  };

  if (!hydrated) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <p className="text-sm text-muted">{error ?? "Loading…"}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-8">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-semibold text-text">Tasks</h2>
          <p className="text-sm text-muted">
            {tasks.filter((t) => !t.completedAt).length} open ·{" "}
            {tasks.filter((t) => t.completedAt).length} completed
          </p>
        </div>
        <button
          type="button"
          onClick={() => openCreateDialog()}
          title="New task (Ctrl+T)"
          className="flex items-center gap-1.5 rounded-lg border border-accent/50 bg-accent/15 px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/25"
        >
          <PlusIcon width={14} height={14} />
          New Task
        </button>
      </header>

      {error && (
        <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <div className="glass-sm flex items-center gap-1 p-1" role="group" aria-label="Filter tasks">
          {FILTER_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setFilter(option.value)}
              aria-pressed={filter === option.value}
              className={`rounded-lg px-3 py-1 text-xs transition-colors duration-150 ${
                filter === option.value
                  ? "bg-accent/15 text-accent"
                  : "text-muted hover:text-text"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <label className="ml-auto flex items-center gap-2 text-xs text-muted">
          Sort by
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as TaskSortBy)}
            className="select-text rounded-lg border border-border bg-surface px-2 py-1 text-xs text-text outline-none focus:border-accent/50"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {visible.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted">
          {filter === "completed" ? "No completed tasks yet." : "No tasks. Create one to get started."}
        </p>
      ) : (
        <>
          <TaskSection title="Overdue" tasks={groups.overdue} today={today} accent onToggle={handleToggle} onEdit={(t) => setDialog({ open: true, task: t })} onDelete={setDeleting} />
          <TaskSection title="Today" tasks={groups.today} today={today} onToggle={handleToggle} onEdit={(t) => setDialog({ open: true, task: t })} onDelete={setDeleting} />
          <TaskSection title="Upcoming (7 days)" tasks={groups.upcoming} today={today} onToggle={handleToggle} onEdit={(t) => setDialog({ open: true, task: t })} onDelete={setDeleting} />
          <TaskSection title="Later" tasks={groups.later} today={today} onToggle={handleToggle} onEdit={(t) => setDialog({ open: true, task: t })} onDelete={setDeleting} />
          <TaskSection title="No Due Date" tasks={groups.noDate} today={today} onToggle={handleToggle} onEdit={(t) => setDialog({ open: true, task: t })} onDelete={setDeleting} />
          <TaskSection title="Completed" tasks={groups.completed} today={today} onToggle={handleToggle} onEdit={(t) => setDialog({ open: true, task: t })} onDelete={setDeleting} />
        </>
      )}

      {(dialog.open || createDialogOpen) && (
        <TaskDialog
          task={dialog.task}
          busy={busy}
          onSave={(input) => void handleSave(input)}
          onCancel={() => {
            setDialog({ open: false, task: null });
            closeCreateDialog();
          }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title="Delete task"
          message={(() => {
            const base = `Permanently delete "${deleting.title}"? This cannot be undone.`;
            if (linkedAchievements.length === 0) return base;
            const names = linkedAchievements.map((a) => `"${a.name}"`).join(", ");
            if (soleLinked.length > 0) {
              const soleNames = soleLinked.map((a) => `"${a.name}"`).join(", ");
              return `${base} It is the only requirement of achievement ${soleNames} — deleting the task will delete ${soleLinked.length === 1 ? "that achievement" : "those achievements"} too, since an achievement cannot have zero requirements.${
                soleLinked.length < linkedAchievements.length
                  ? ` It will also be removed from achievement ${names}.`
                  : ""
              }`;
            }
            return `${base} It is linked to achievement ${names}; deleting it will remove the task from ${linkedAchievements.length === 1 ? "that achievement" : "those achievements"}.`;
          })()}
          confirmLabel={
            linkedAchievements.length === 0
              ? "Delete"
              : soleLinked.length > 0
                ? "Delete Task & Achievement"
                : "Remove Link & Delete"
          }
          busy={busy}
          onConfirm={() => void handleDelete()}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
