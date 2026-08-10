import { useEffect, useState } from "react";
import { useHabitStore } from "../stores/habitStore";
import {
  CONDITION_LABELS,
  type CustomAchievementEntry,
  type CustomAchievementInput,
  type CustomConditionType,
} from "../types/achievements";

export const EMOJI_CHOICES = [
  "🏆", "🥇", "🎯", "🎖️", "🏅", "⭐", "🔥", "💪",
  "📚", "🏃", "🧘", "♟️", "🥁", "🎵", "🎨", "✍️",
  "📝", "✅", "📅", "⚡", "🌟", "🚀", "💎", "🧠",
];

const CONDITION_TYPES = Object.keys(CONDITION_LABELS) as CustomConditionType[];

const inputClass =
  "w-full select-text rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-text outline-none transition-colors placeholder:text-muted focus:border-accent/50";

export default function AchievementDialog({
  achievement,
  busy = false,
  onSave,
  onCancel,
}: {
  achievement?: CustomAchievementEntry | null;
  busy?: boolean;
  onSave: (input: CustomAchievementInput) => void;
  onCancel: () => void;
}) {
  const habits = useHabitStore((s) => s.habits);
  const [name, setName] = useState(achievement?.name ?? "");
  const [description, setDescription] = useState(achievement?.description ?? "");
  const [icon, setIcon] = useState(achievement?.icon ?? "🏆");
  const [conditionType, setConditionType] = useState<CustomConditionType>(
    achievement?.conditionType ?? "habits_completed",
  );
  const [habitId, setHabitId] = useState<string>(
    achievement?.habitId != null ? String(achievement.habitId) : "",
  );
  const [target, setTarget] = useState(String(achievement?.target ?? 10));
  const [xpReward, setXpReward] = useState(String(achievement?.xpReward ?? 0));
  const [pointReward, setPointReward] = useState(String(achievement?.pointReward ?? 0));

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  const targetNum = Number(target);
  const needsHabit = conditionType === "habit_count";
  const canSave =
    name.trim().length > 0 &&
    Number.isInteger(targetNum) &&
    targetNum > 0 &&
    (!needsHabit || habitId !== "") &&
    !busy;

  const save = () => {
    if (!canSave) return;
    onSave({
      name: name.trim(),
      description: description.trim(),
      icon,
      conditionType,
      target: targetNum,
      habitId: needsHabit && habitId ? Number(habitId) : null,
      xpReward: Math.max(0, Number(xpReward) || 0),
      pointReward: Math.max(0, Number(pointReward) || 0),
    });
  };

  return (
    <div
      className="animate-overlay-in fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-label={achievement ? "Edit custom achievement" : "New custom achievement"}
    >
      <div
        className="glass animate-dialog-in flex max-h-[90vh] w-full max-w-md flex-col gap-3 overflow-y-auto p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-text">
          {achievement ? "Edit Custom Achievement" : "New Custom Achievement"}
        </h3>

        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted">Icon</span>
          <div className="grid grid-cols-8 gap-1">
            {EMOJI_CHOICES.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => setIcon(emoji)}
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
          placeholder='Name (e.g. "Practice Drums 50 Times")'
          className={inputClass}
        />
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          className={inputClass}
        />

        <div className="flex gap-3">
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-xs text-muted">Requirement</span>
            <select
              value={conditionType}
              onChange={(e) => setConditionType(e.target.value as CustomConditionType)}
              className={inputClass}
            >
              {CONDITION_TYPES.map((type) => (
                <option key={type} value={type}>
                  {CONDITION_LABELS[type]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex w-24 flex-col gap-1">
            <span className="text-xs text-muted">Target</span>
            <input
              type="number"
              min={1}
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className={inputClass}
            />
          </label>
        </div>

        {needsHabit && (
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">Habit</span>
            <select
              value={habitId}
              onChange={(e) => setHabitId(e.target.value)}
              className={inputClass}
            >
              <option value="" disabled>
                Choose a habit…
              </option>
              {habits
                .filter((h) => !h.archived)
                .map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
            </select>
          </label>
        )}

        <div className="flex gap-3">
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-xs text-muted">XP reward (one-time)</span>
            <input
              type="number"
              min={0}
              value={xpReward}
              onChange={(e) => setXpReward(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-xs text-muted">Point reward (one-time)</span>
            <input
              type="number"
              min={0}
              value={pointReward}
              onChange={(e) => setPointReward(e.target.value)}
              className={inputClass}
            />
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
            {busy ? "Saving…" : achievement ? "Save Changes" : "Create Achievement"}
          </button>
        </div>
      </div>
    </div>
  );
}
