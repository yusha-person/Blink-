import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";
import ConfirmDialog from "./ConfirmDialog";
import { SettingsRow } from "./SettingsSection";

const buttonClass =
  "glass-sm glass-hover px-3 py-1.5 text-xs font-medium text-accent disabled:opacity-60";

const dangerButtonClass =
  "rounded-lg border border-red-400/40 bg-red-500/15 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-500/25 disabled:opacity-60 dark:text-red-400";

const selectClass =
  "w-56 select-text rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-slate-800 outline-none transition-colors focus:border-accent/50";

type PendingReset = "statistics" | "xp" | null;

export default function DataSettings() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [createdPath, setCreatedPath] = useState<string | null>(null);
  const [exports, setExports] = useState<string[]>([]);
  const [selectedExport, setSelectedExport] = useState("");
  const [importConfirm, setImportConfirm] = useState(false);
  const [pendingReset, setPendingReset] = useState<PendingReset>(null);

  const refreshExports = useCallback(async () => {
    try {
      const files = await invoke<string[]>("list_exports");
      setExports(files);
      setSelectedExport((current) =>
        current && files.includes(current) ? current : (files[0] ?? ""),
      );
    } catch {
      // Leave the list as-is if the backend is unreachable.
    }
  }, []);

  useEffect(() => {
    void refreshExports();
  }, [refreshExports]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    setCreatedPath(null);
    try {
      await action();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleBackup = () =>
    run(async () => {
      const path = await invoke<string>("backup_database");
      setCreatedPath(path);
      setNotice("Database backup created.");
    });

  const handleExport = () =>
    run(async () => {
      const path = await invoke<string>("export_data");
      setCreatedPath(path);
      setNotice("Data exported as JSON.");
      await refreshExports();
    });

  const handleReveal = () =>
    run(async () => {
      if (createdPath) {
        await invoke("reveal_path", { path: createdPath });
      }
    });

  const handleImport = () => {
    setImportConfirm(false);
    void run(async () => {
      await invoke("import_data", { fileName: selectedExport });
      setNotice("Import complete. Reloading…");
      window.setTimeout(() => window.location.reload(), 800);
    });
  };

  const handleReset = () => {
    const which = pendingReset;
    setPendingReset(null);
    if (!which) return;
    void run(async () => {
      if (which === "statistics") {
        await invoke("reset_statistics");
        setNotice("Statistics reset. Reloading…");
      } else {
        await invoke("reset_xp");
        setNotice("XP reset. Reloading…");
      }
      window.setTimeout(() => window.location.reload(), 800);
    });
  };

  return (
    <>
      <SettingsRow
        label="Backup database"
        description="Save a timestamped copy of the SQLite database file to the app's backups folder."
      >
        <button
          type="button"
          onClick={() => void handleBackup()}
          disabled={busy}
          className={buttonClass}
        >
          Create backup
        </button>
      </SettingsRow>

      <SettingsRow
        label="Export data"
        description="Export all data as JSON. Private notes stay encrypted with your master password."
      >
        <button
          type="button"
          onClick={() => void handleExport()}
          disabled={busy}
          className={buttonClass}
        >
          Export JSON
        </button>
      </SettingsRow>

      <SettingsRow
        label="Import data"
        description="Replace ALL current data with a previous JSON export. This cannot be undone."
      >
        {exports.length === 0 ? (
          <span className="text-xs text-slate-500">
            No exports found — export data first.
          </span>
        ) : (
          <>
            <select
              value={selectedExport}
              onChange={(e) => setSelectedExport(e.target.value)}
              className={selectClass}
            >
              {exports.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setImportConfirm(true)}
              disabled={busy || !selectedExport}
              className={dangerButtonClass}
            >
              Import…
            </button>
          </>
        )}
      </SettingsRow>

      <SettingsRow
        label="Reset statistics"
        description="Clear points, XP, completions, streak history, and unlocked achievements. Habits, notes, and journals are kept."
      >
        <button
          type="button"
          onClick={() => setPendingReset("statistics")}
          disabled={busy}
          className={dangerButtonClass}
        >
          Reset…
        </button>
      </SettingsRow>

      <SettingsRow
        label="Reset XP"
        description="Set all earned XP back to zero (level returns to 1). Points, completions, and streaks are kept."
      >
        <button
          type="button"
          onClick={() => setPendingReset("xp")}
          disabled={busy}
          className={dangerButtonClass}
        >
          Reset…
        </button>
      </SettingsRow>

      {(error || notice) && (
        <div className="flex flex-col gap-1 py-2">
          {error && (
            <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
          )}
          {notice && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400">
              {notice}
            </p>
          )}
          {createdPath && (
            <p className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="select-text break-all">{createdPath}</span>
              <button
                type="button"
                onClick={() => void handleReveal()}
                disabled={busy}
                className={buttonClass}
              >
                Show in folder
              </button>
            </p>
          )}
        </div>
      )}

      {importConfirm && (
        <ConfirmDialog
          title="Import data"
          message={`This permanently replaces ALL current data (habits, history, notes, journals, achievements, settings) with the contents of ${selectedExport}. Consider creating a backup first.`}
          confirmLabel="Import"
          busy={busy}
          onConfirm={handleImport}
          onCancel={() => setImportConfirm(false)}
        />
      )}

      {pendingReset === "statistics" && (
        <ConfirmDialog
          title="Reset statistics"
          message="This permanently clears all points, XP, habit completions, streak history, and unlocked achievements. Notes and journals are kept. This cannot be undone."
          confirmLabel="Reset statistics"
          busy={busy}
          onConfirm={handleReset}
          onCancel={() => setPendingReset(null)}
        />
      )}

      {pendingReset === "xp" && (
        <ConfirmDialog
          title="Reset XP"
          message="This permanently sets all earned XP back to zero and returns you to level 1. Points, completions, and streaks are kept. This cannot be undone."
          confirmLabel="Reset XP"
          busy={busy}
          onConfirm={handleReset}
          onCancel={() => setPendingReset(null)}
        />
      )}
    </>
  );
}
