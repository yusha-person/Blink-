import { useEffect, useState } from "react";
import { EMOJI_CHOICES } from "./AchievementDialog";
import type { HabitEntry, HabitInput, Priority } from "../types/habits";

const inputClass =
  "w-full select-text rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-text outline-none transition-colors placeholder:text-muted focus:border-accent/50";

export default function HabitDialog({
  habit,
  busy = false,
  onSave,
  onCancel,
}: {
  habit?: HabitEntry | null;
  busy?: boolean;
  onSave: (input: HabitInput) => void;
  onCancel: () => void;
}) {
  const isSystem = habit?.isSystem ?? false;
  const [name, setName] = useState(habit?.name ?? "");
  const [description, setDescription] = useState(habit?.description ?? "");
  const [requirement, setRequirement] = useState(habit?.requirement ?? "");
  const [points, setPoints] = useState(String(habit?.points ?? 1));
  const [priority, setPriority] = useState<Priority>(habit?.priority ?? "medium");
  const [icon, setIcon] = useState(habit?.icon ?? "");

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  const pointsNum = Number(points);
  const canSave = name.trim().length > 0 && Number.isInteger(pointsNum) && pointsNum > 0 && !busy;

  const save = () => {
    if (!canSave) return;
    onSave({
      name: name.trim(),
      description: description.trim(),
      requirement: requirement.trim(),
      points: pointsNum,
      priority,
      icon,
    });
  };

  return (
    <div
      className="animate-overlay-in fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-label={habit ? "Edit habit" : "New habit"}
    >
      <div
        className="glass animate-dialog-in flex max-h-[90vh] w-full max-w-md flex-col gap-3 overflow-y-auto p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-text">
          {habit ? `Edit "${habit.name}"` : "New Habit"}
        </h3>
        {isSystem && (
          <p className="rounded-lg border border-border bg-surface px-3 py-2 text-xs text-muted">
            Built-in habit — name and point reward are fixed.
          </p>
        )}

        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted">Icon (optional)</span>
          <div className="grid grid-cols-8 gap-1">
            {EMOJI_CHOICES.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => setIcon(icon === emoji ? "" : emoji)}
                aria-pressed={icon === emoji}
                aria-label={`Choose icon ${emoji}`}
                className={`flex h-8 items-center justify-center rounded-lg border text-base transition-colors ${
                  icon === emoji
                    ? "border-accent/50 bg-accent/15"
                    : "border-border hover:bg-surface-hover"
                }`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>

        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Habit name"
          disabled={isSystem}
          className={`${inputClass} disabled:opacity-50`}
        />
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          className={inputClass}
        />
        <input
          value={requirement}
          onChange={(e) => setRequirement(e.target.value)}
          placeholder='Requirement (e.g. "Read 10 pages")'
          className={inputClass}
        />

        <div className="flex gap-3">
          <label className="flex w-28 flex-col gap-1">
            <span className="text-xs text-muted">Point reward</span>
            <input
              type="number"
              min={1}
              value={points}
              onChange={(e) => setPoints(e.target.value)}
              disabled={isSystem}
              className={`${inputClass} disabled:opacity-50`}
            />
          </label>
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-xs text-muted">Priority</span>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as Priority)}
              className={inputClass}
            >
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
            {busy ? "Saving…" : habit ? "Save Changes" : "Create Habit"}
          </button>
        </div>
      </div>
    </div>
  );
}
