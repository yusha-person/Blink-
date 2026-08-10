import { memo, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import MarkdownPreview from "../components/MarkdownPreview";
import BusynessChip from "../components/BusynessChip";
import ConfirmDialog from "../components/ConfirmDialog";
import TaskDialog from "../components/TaskDialog";
import { formatJournalDate } from "../components/JournalEditor";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  EditIcon,
  JournalIcon,
  LockIcon,
  NotesIcon,
  PlusIcon,
  TrashIcon,
} from "../components/icons";
import { todayLocalString, useCalendarStore } from "../stores/calendarStore";
import { useHabitStore } from "../stores/habitStore";
import { useJournalStore } from "../stores/journalStore";
import { useNoteStore } from "../stores/noteStore";
import { useTaskStore, type TaskInput } from "../stores/taskStore";
import type { CalendarDaySummary, CalendarTask } from "../types/calendar";
import { PRIORITY_BADGE_STYLES } from "../utils/priority";
import { formatFullTimestamp } from "../utils/timestamps";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function relativeDayLabel(date: string): string | null {
  const dayMs = Date.parse(`${date}T00:00:00Z`);
  const todayMs = Date.parse(`${todayLocalString()}T00:00:00Z`);
  const diff = Math.round((todayMs - dayMs) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return null;
}

const DayCell = memo(function DayCell({
  day,
  date,
  summary,
  isToday,
  isFuture,
  isSelected,
  onSelect,
}: {
  day: number;
  date: string;
  summary: CalendarDaySummary | undefined;
  isToday: boolean;
  isFuture: boolean;
  isSelected: boolean;
  onSelect: (date: string) => Promise<void>;
}) {
  return (
    <button
      type="button"
      onClick={() => void onSelect(date)}
      aria-pressed={isSelected}
      className={`flex min-h-20 flex-col rounded-xl border p-2 text-left transition-colors ${
        isSelected
          ? "border-accent/50 bg-accent/10"
          : "border-border hover:border-accent/30 hover:bg-accent/5"
      } ${isFuture ? "opacity-50" : ""}`}
    >
      <span
        className={`text-xs font-semibold ${
          isToday
            ? "flex h-5 w-5 items-center justify-center rounded-full bg-accent text-accent-text"
            : isSelected
              ? "text-accent"
              : "text-slate-700 dark:text-slate-300"
        }`}
      >
        {day}
      </span>
      {summary && (
        <span className="mt-auto flex flex-col gap-1 pt-1">
          {summary.points > 0 && (
            <span className="text-[11px] font-medium text-accent">
              {summary.points} pts · {summary.xp} XP
            </span>
          )}
          <span className="flex items-center gap-2 text-slate-400 dark:text-slate-500">
            {summary.journalWritten && (
              <JournalIcon width={12} height={12} aria-label="Journal written" />
            )}
            {summary.notesCreated > 0 && (
              <span className="flex items-center gap-0.5 text-[10px]">
                <NotesIcon width={12} height={12} />
                {summary.notesCreated}
              </span>
            )}
          </span>
        </span>
      )}
    </button>
  );
});

export default function CalendarPage() {
  const year = useCalendarStore((s) => s.year);
  const month = useCalendarStore((s) => s.month);
  const days = useCalendarStore((s) => s.days);
  const selectedDate = useCalendarStore((s) => s.selectedDate);
  const detail = useCalendarStore((s) => s.detail);
  const hydrated = useCalendarStore((s) => s.hydrated);
  const monthLoading = useCalendarStore((s) => s.monthLoading);
  const detailLoading = useCalendarStore((s) => s.detailLoading);
  const error = useCalendarStore((s) => s.error);
  const hydrate = useCalendarStore((s) => s.hydrate);
  const refresh = useCalendarStore((s) => s.refresh);
  const prevMonth = useCalendarStore((s) => s.prevMonth);
  const nextMonth = useCalendarStore((s) => s.nextMonth);
  const goToToday = useCalendarStore((s) => s.goToToday);
  const selectDate = useCalendarStore((s) => s.selectDate);
  const navigate = useNavigate();
  const todayTotals = useHabitStore((s) => s.todayTotals);
  const journalUpdatedAt = useJournalStore((s) => s.todayEntry?.updatedAt);
  const tasks = useTaskStore((s) => s.tasks);
  const tasksHydrated = useTaskStore((s) => s.hydrated);
  const hydrateTasks = useTaskStore((s) => s.hydrate);
  const toggleTask = useTaskStore((s) => s.toggleTask);
  const createTask = useTaskStore((s) => s.createTask);
  const updateTask = useTaskStore((s) => s.updateTask);
  const deleteTask = useTaskStore((s) => s.deleteTask);

  const [taskDialog, setTaskDialog] = useState<{ open: boolean; taskId: number | null }>({
    open: false,
    taskId: null,
  });
  const [deletingTask, setDeletingTask] = useState<CalendarTask | null>(null);
  const [taskBusy, setTaskBusy] = useState(false);

  useEffect(() => {
    if (!tasksHydrated) void hydrateTasks();
  }, [tasksHydrated, hydrateTasks]);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!hydrated) return;
    const timer = setTimeout(() => void refresh(), 150);
    return () => clearTimeout(timer);
  }, [hydrated, refresh, todayTotals, journalUpdatedAt, tasks]);

  const editingTask = taskDialog.taskId != null
    ? tasks.find((t) => t.id === taskDialog.taskId) ?? null
    : null;

  const handleTaskSave = async (input: TaskInput) => {
    setTaskBusy(true);
    try {
      if (editingTask) await updateTask(editingTask.id, input);
      else await createTask(input);
      setTaskDialog({ open: false, taskId: null });
      await refresh();
    } finally {
      setTaskBusy(false);
    }
  };

  const handleTaskDelete = async () => {
    if (!deletingTask) return;
    setTaskBusy(true);
    try {
      await deleteTask(deletingTask.id);
      setDeletingTask(null);
      await refresh();
    } finally {
      setTaskBusy(false);
    }
  };

  const handleTaskToggle = async (task: CalendarTask) => {
    await toggleTask(task.id, !task.completedAt);
    await refresh();
  };

  const openNote = async (noteId: number) => {
    navigate("/notes");
    const store = useNoteStore.getState();
    if (!store.hydrated) await store.hydrate();
    store.selectView({ kind: "all" });
    await useNoteStore.getState().selectNote(noteId);
  };

  if (!hydrated) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {error ?? "Loading calendar…"}
        </p>
      </div>
    );
  }

  const today = todayLocalString();
  const daysInMonth = new Date(year, month, 0).getDate();
  const leadingBlanks = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString(
    undefined,
    { year: "numeric", month: "long" },
  );
  const hasDetailData =
    detail &&
    (detail.points > 0 ||
      detail.habits.length > 0 ||
      detail.journal !== null ||
      detail.notes.length > 0 ||
      detail.tasks.length > 0);

  return (
    <div className="flex flex-col gap-6 p-8">
      <header className="flex flex-col gap-1">
        <h2 className="text-2xl font-semibold text-slate-800 dark:text-slate-100">
          Calendar
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          A day-by-day view of your activity.
        </p>
      </header>

      {error && (
        <div className="glass border-red-400/40 p-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-6 xl:flex-row">
        <section className="glass flex-1 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-medium text-slate-800 dark:text-slate-200">
              {monthLabel}
            </h3>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => void prevMonth()}
                title="Previous month"
                aria-label="Previous month"
                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-accent/10 hover:text-accent dark:text-slate-400"
              >
                <ChevronLeftIcon width={16} height={16} />
              </button>
              <button
                type="button"
                onClick={() => void goToToday()}
                className="rounded-lg px-2 py-1 text-xs font-medium text-slate-500 transition-colors hover:bg-accent/10 hover:text-accent dark:text-slate-400"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => void nextMonth()}
                title="Next month"
                aria-label="Next month"
                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-accent/10 hover:text-accent dark:text-slate-400"
              >
                <ChevronRightIcon width={16} height={16} />
              </button>
            </div>
          </div>
          <div
            className={`grid grid-cols-7 gap-1 transition-opacity ${
              monthLoading ? "opacity-50" : ""
            }`}
          >
            {WEEKDAYS.map((weekday) => (
              <div
                key={weekday}
                className="pb-1 text-center text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500"
              >
                {weekday}
              </div>
            ))}
            {Array.from({ length: leadingBlanks }, (_, i) => (
              <div key={`blank-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const day = i + 1;
              const date = `${year}-${pad2(month)}-${pad2(day)}`;
              return (
                <DayCell
                  key={date}
                  day={day}
                  date={date}
                  summary={days[date]}
                  isToday={date === today}
                  isFuture={date > today}
                  isSelected={date === selectedDate}
                  onSelect={selectDate}
                />
              );
            })}
          </div>
        </section>

        <section className="glass flex w-full flex-col gap-4 p-5 xl:w-96">
          {detailLoading || !detail ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {detailLoading ? "Loading day…" : "Select a day."}
            </p>
          ) : (
            <>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-medium text-slate-800 dark:text-slate-200">
                    {formatJournalDate(detail.date)}
                  </h3>
                  {relativeDayLabel(detail.date) && (
                    <p className="text-xs text-accent">
                      {relativeDayLabel(detail.date)}
                    </p>
                  )}
                </div>
                <BusynessChip day={detail.date} />
              </div>

              {!hasDetailData ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Nothing recorded for this day.
                </p>
              ) : (
                <>
                  <div className="flex gap-3">
                    <div className="glass-sm flex-1 px-3 py-2">
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Points
                      </p>
                      <p className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                        {detail.points}
                      </p>
                    </div>
                    <div className="glass-sm flex-1 px-3 py-2">
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        XP
                      </p>
                      <p className="text-lg font-semibold text-accent">
                        {detail.xp}
                      </p>
                    </div>
                  </div>

                  {detail.habits.length > 0 && (
                    <div className="flex flex-col gap-1">
                      <h4 className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                        Habits completed ({detail.habits.length})
                      </h4>
                      <ul className="flex flex-col divide-y divide-slate-900/5 dark:divide-white/5">
                        {detail.habits.map((habit) => (
                          <li
                            key={habit.id}
                            className="flex items-center gap-2 py-1.5"
                          >
                            {habit.icon && <span className="text-sm">{habit.icon}</span>}
                            <span className="min-w-0 flex-1 truncate text-sm text-slate-700 dark:text-slate-300">
                              {habit.name}
                            </span>
                            <span
                              className={`rounded-full border px-1.5 py-0.5 text-[9px] font-medium capitalize ${PRIORITY_BADGE_STYLES[habit.priority as "low" | "medium" | "high"] ?? ""}`}
                            >
                              {habit.priority}
                            </span>
                            <span className="text-xs font-medium text-accent">
                              +{habit.points} pts
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                        Tasks ({detail.tasks.length})
                      </h4>
                      <button
                        type="button"
                        onClick={() => setTaskDialog({ open: true, taskId: null })}
                        aria-label={`Add task for ${detail.date}`}
                        className="rounded p-0.5 text-slate-400 hover:text-accent"
                      >
                        <PlusIcon width={13} height={13} />
                      </button>
                    </div>
                    {detail.tasks.length > 0 && (
                      <ul className="flex flex-col divide-y divide-slate-900/5 dark:divide-white/5">
                        {detail.tasks.map((task) => (
                          <li key={task.id} className="group flex items-center gap-2 py-1.5">
                            <input
                              type="checkbox"
                              checked={task.completedAt !== null}
                              onChange={() => void handleTaskToggle(task)}
                              aria-label={`Mark "${task.title}" ${task.completedAt ? "incomplete" : "complete"}`}
                              className="h-3.5 w-3.5 shrink-0 accent-accent"
                            />
                            <span
                              className={`min-w-0 flex-1 truncate text-sm ${
                                task.completedAt
                                  ? "text-slate-400 line-through dark:text-slate-500"
                                  : "text-slate-700 dark:text-slate-300"
                              }`}
                            >
                              {task.title}
                            </span>
                            {task.dueTime && (
                              <span className="shrink-0 text-[10px] text-slate-400 dark:text-slate-500">
                                {task.dueTime}
                              </span>
                            )}
                            {task.priority && (
                              <span
                                className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-medium capitalize ${PRIORITY_BADGE_STYLES[task.priority as "low" | "medium" | "high"]}`}
                              >
                                {task.priority}
                              </span>
                            )}
                            <span className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
                              <button
                                type="button"
                                onClick={() => setTaskDialog({ open: true, taskId: task.id })}
                                aria-label={`Edit task "${task.title}"`}
                                className="rounded p-0.5 text-slate-400 hover:text-accent"
                              >
                                <EditIcon width={11} height={11} />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeletingTask(task)}
                                aria-label={`Delete task "${task.title}"`}
                                className="rounded p-0.5 text-slate-400 hover:text-red-500"
                              >
                                <TrashIcon width={11} height={11} />
                              </button>
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {detail.journal && (
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                          Journal
                        </h4>
                        {detail.date === today && (
                          <Link
                            to="/journal"
                            className="text-xs font-medium text-accent hover:underline"
                          >
                            Open journal
                          </Link>
                        )}
                      </div>
                      {detail.journal.written ? (
                        <>
                          <div className="max-h-72 overflow-y-auto rounded-lg border border-border p-3">
                            <MarkdownPreview content={detail.journal.content} />
                          </div>
                          <p className="text-[11px] text-slate-400 dark:text-slate-500">
                            Updated {formatFullTimestamp(detail.journal.updatedAt)}
                          </p>
                        </>
                      ) : (
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          Entry exists but nothing is written yet.
                        </p>
                      )}
                    </div>
                  )}

                  {detail.notes.length > 0 && (
                    <div className="flex flex-col gap-1">
                      <h4 className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                        Notes created ({detail.notes.length})
                      </h4>
                      <ul className="flex flex-col divide-y divide-slate-900/5 dark:divide-white/5">
                        {detail.notes.map((note) => (
                          <li key={note.id}>
                            <button
                              type="button"
                              onClick={() => void openNote(note.id)}
                              className="flex w-full items-center gap-2 py-1.5 text-left text-sm text-slate-700 transition-colors hover:text-accent dark:text-slate-300"
                            >
                              {note.isPrivate && (
                                <LockIcon
                                  width={12}
                                  height={12}
                                  className="shrink-0 text-slate-400"
                                />
                              )}
                              <span className="truncate">
                                {note.title || "Untitled"}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </section>
      </div>

      {taskDialog.open && (
        <TaskDialog
          task={editingTask}
          defaultDueDate={detail?.date}
          busy={taskBusy}
          onSave={(input) => void handleTaskSave(input)}
          onCancel={() => setTaskDialog({ open: false, taskId: null })}
        />
      )}
      {deletingTask && (
        <ConfirmDialog
          title="Delete task"
          message={`Permanently delete "${deletingTask.title}"? This cannot be undone.`}
          busy={taskBusy}
          onConfirm={() => void handleTaskDelete()}
          onCancel={() => setDeletingTask(null)}
        />
      )}
    </div>
  );
}
