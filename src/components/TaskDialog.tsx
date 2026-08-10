import { useEffect, useState } from "react";
import type { TaskEntry, TaskPriority } from "../types/tasks";
import type { TaskInput } from "../stores/taskStore";

const inputClass =
  "w-full select-text rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-text outline-none transition-colors placeholder:text-muted focus:border-accent/50";

export default function TaskDialog({
  task,
  busy = false,
  onSave,
  onCancel,
}: {
  task?: TaskEntry | null;
  busy?: boolean;
  onSave: (input: TaskInput) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [dueDate, setDueDate] = useState(task?.dueDate ?? "");
  const [priority, setPriority] = useState<TaskPriority | "">(task?.priority ?? "");

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  const canSave = title.trim().length > 0 && !busy;

  const save = () => {
    if (!canSave) return;
    onSave({
      title: title.trim(),
      description: description.trim(),
      dueDate: dueDate || null,
      priority: priority || null,
    });
  };

  return (
    <div
      className="animate-overlay-in fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-label={task ? "Edit task" : "New task"}
    >
      <div
        className="glass animate-dialog-in flex w-full max-w-md flex-col gap-3 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-text">
          {task ? "Edit Task" : "New Task"}
        </h3>

        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
          }}
          placeholder="Task title"
          className={inputClass}
        />

        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          rows={3}
          className={`${inputClass} resize-none`}
        />

        <div className="flex gap-3">
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-xs text-muted">Due date</span>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-xs text-muted">Priority</span>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as TaskPriority | "")}
              className={inputClass}
            >
              <option value="">None</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>
        </div>

        <div className="mt-2 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="glass-sm glass-hover px-3 py-1.5 text-xs text-muted disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!canSave}
            className="rounded-lg border border-accent/50 bg-accent/15 px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/25 disabled:opacity-60"
          >
            {busy ? "Saving…" : task ? "Save Changes" : "Create Task"}
          </button>
        </div>
      </div>
    </div>
  );
}
