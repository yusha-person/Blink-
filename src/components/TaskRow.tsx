import { memo } from "react";
import type { TaskEntry } from "../types/tasks";
import { formatDueDate, localDateString } from "../utils/timestamps";
import { CheckIcon, EditIcon, TrashIcon } from "./icons";

export const PRIORITY_STYLES: Record<string, string> = {
  high: "border-danger/40 bg-danger/10 text-danger",
  medium: "border-warning/40 bg-warning/10 text-warning",
  low: "border-accent/40 bg-accent/10 text-accent",
};

export function taskDueState(task: TaskEntry, today: string): "overdue" | "today" | "future" | null {
  if (!task.dueDate) return null;
  if (task.dueDate < today && !task.completedAt) return "overdue";
  if (task.dueDate === today) return "today";
  return "future";
}

export const TaskRow = memo(function TaskRow({
  task,
  today = localDateString(),
  onToggle,
  onEdit,
  onDelete,
}: {
  task: TaskEntry;
  today?: string;
  onToggle: (id: number, completed: boolean) => void;
  onEdit?: (task: TaskEntry) => void;
  onDelete?: (task: TaskEntry) => void;
}) {
  const completed = task.completedAt !== null;
  const dueState = taskDueState(task, today);

  return (
    <div
      className={`glass-sm flex items-center gap-3 px-3 py-2.5 ${
        completed ? "opacity-60" : ""
      }`}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={completed}
        aria-label={completed ? `Mark "${task.title}" incomplete` : `Mark "${task.title}" complete`}
        onClick={() => onToggle(task.id, !completed)}
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors duration-150 ${
          completed
            ? "border-accent bg-accent text-accent-text"
            : "border-border hover:border-accent/50"
        }`}
      >
        {completed && (
          <span className="animate-pop-in flex">
            <CheckIcon width={12} height={12} />
          </span>
        )}
      </button>

      <div className="min-w-0 flex-1">
        <p
          className={`truncate text-sm ${
            completed ? "text-muted line-through" : "text-text"
          }`}
        >
          {task.title}
        </p>
        {task.description && (
          <p className="line-clamp-1 text-xs text-muted">{task.description}</p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {task.priority && (
          <span
            className={`rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize ${PRIORITY_STYLES[task.priority]}`}
          >
            {task.priority}
          </span>
        )}
        {task.dueDate && (
          <span
            className={`rounded-full border px-2 py-0.5 text-[10px] ${
              dueState === "overdue"
                ? "border-danger/40 bg-danger/10 text-danger"
                : dueState === "today"
                  ? "border-accent/40 bg-accent/10 text-accent"
                  : "border-border text-muted"
            }`}
          >
            {dueState === "overdue" ? "Overdue · " : ""}
            {formatDueDate(task.dueDate)}
          </span>
        )}
        {onEdit && (
          <button
            type="button"
            onClick={() => onEdit(task)}
            aria-label={`Edit task "${task.title}"`}
            className="rounded-md p-1 text-muted transition-colors hover:text-text"
          >
            <EditIcon width={14} height={14} />
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            onClick={() => onDelete(task)}
            aria-label={`Delete task "${task.title}"`}
            className="rounded-md p-1 text-muted transition-colors hover:text-danger"
          >
            <TrashIcon width={14} height={14} />
          </button>
        )}
      </div>
    </div>
  );
});
