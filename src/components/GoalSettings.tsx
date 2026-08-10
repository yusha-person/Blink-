import { useState } from "react";
import { useGoalStore } from "../stores/goalStore";
import { SettingsRow } from "./SettingsSection";

const inputClass =
  "w-20 select-text rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-accent/50";

const buttonClass =
  "glass-sm glass-hover px-3 py-1.5 text-xs font-medium text-accent disabled:opacity-60";

export default function GoalSettings() {
  const minGoal = useGoalStore((s) => s.minGoal);
  const stretchGoal = useGoalStore((s) => s.stretchGoal);
  const setGoals = useGoalStore((s) => s.setGoals);

  const [minInput, setMinInput] = useState<string | null>(null);
  const [stretchInput, setStretchInput] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const minValue = minInput ?? String(minGoal);
  const stretchValue = stretchInput ?? String(stretchGoal);
  const dirty = minInput !== null || stretchInput !== null;

  const handleSave = async () => {
    const min = Number.parseInt(minValue, 10);
    const stretch = Number.parseInt(stretchValue, 10);
    if (Number.isNaN(min) || Number.isNaN(stretch)) {
      setError("Goals must be whole numbers.");
      return;
    }
    if (min < 1) {
      setError("Minimum goal must be at least 1 point.");
      return;
    }
    if (stretch < min) {
      setError("Stretch goal must be greater than or equal to the minimum goal.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await setGoals(min, stretch);
      setMinInput(null);
      setStretchInput(null);
      setNotice("Goals saved. Streaks were re-evaluated against the new minimum.");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <SettingsRow
        label="Minimum daily goal"
        description="Points needed per day to keep your streak (default: 8). Changing it re-evaluates your streak."
      >
        <input
          type="number"
          min={1}
          value={minValue}
          onChange={(e) => {
            setMinInput(e.target.value);
            setNotice(null);
          }}
          className={inputClass}
        />
      </SettingsRow>
      <SettingsRow
        label="Stretch goal"
        description="Ambitious target shown on the dashboard progress bar (default: 10)."
      >
        <input
          type="number"
          min={1}
          value={stretchValue}
          onChange={(e) => {
            setStretchInput(e.target.value);
            setNotice(null);
          }}
          className={inputClass}
        />
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={busy || !dirty}
          className={buttonClass}
        >
          {busy ? "Saving…" : "Save goals"}
        </button>
      </SettingsRow>
      {(error || notice) && (
        <div className="py-2">
          {error && (
            <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
          )}
          {notice && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400">
              {notice}
            </p>
          )}
        </div>
      )}
    </>
  );
}
