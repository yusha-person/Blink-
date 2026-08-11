import { useEffect, useState } from "react";
import { usePrivacyStore } from "../stores/privacyStore";

const inputClass =
  "w-full select-text rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-text outline-none transition-colors placeholder:text-muted focus:border-accent/50";

export default function FolderPasswordDialog() {
  const dialog = usePrivacyStore((s) => s.folderSecurityDialog);
  const close = usePrivacyStore((s) => s.closeFolderSecurity);
  const error = usePrivacyStore((s) => s.error);
  const unlockFolder = usePrivacyStore((s) => s.unlockFolder);
  const setFolderPassword = usePrivacyStore((s) => s.setFolderPassword);
  const changeFolderPassword = usePrivacyStore((s) => s.changeFolderPassword);
  const removeFolderPassword = usePrivacyStore((s) => s.removeFolderPassword);

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setCurrent("");
    setNext("");
    setConfirm("");
  }, [dialog]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [close]);

  if (!dialog) return null;
  const { mode, folder } = dialog;

  const titles: Record<typeof mode, string> = {
    unlock: `Private Folder — "${folder.name}"`,
    add: `Protect "${folder.name}"`,
    change: `Change Password — "${folder.name}"`,
    remove: `Remove Password — "${folder.name}"`,
  };

  const needsCurrent = mode !== "add";
  const needsNew = mode === "add" || mode === "change";
  const mismatch = needsNew && next !== confirm;
  const canSubmit =
    !busy &&
    (!needsCurrent || current.length > 0) &&
    (!needsNew || (next.length >= 4 && !mismatch));

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      let ok = false;
      if (mode === "unlock") ok = await unlockFolder(folder.id, current);
      else if (mode === "add") ok = await setFolderPassword(folder.id, next);
      else if (mode === "change") ok = await changeFolderPassword(folder.id, current, next);
      else ok = await removeFolderPassword(folder.id, current);
      if (ok) close();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="animate-overlay-in fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4"
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-label={titles[mode]}
    >
      <div
        className="glass animate-dialog-in flex w-full max-w-sm flex-col gap-3 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-text">{titles[mode]}</h3>
        {mode === "unlock" && (
          <p className="text-xs text-muted">
            Enter the folder password or the master password.
          </p>
        )}
        {(mode === "change" || mode === "remove") && (
          <p className="text-xs text-muted">
            Enter the folder password or the master password to continue.
          </p>
        )}

        {needsCurrent && (
          <input
            autoFocus
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !needsNew) void submit();
            }}
            placeholder={mode === "unlock" ? "Password" : "Current password"}
            className={inputClass}
          />
        )}
        {needsNew && (
          <>
            <input
              autoFocus={mode === "add"}
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              placeholder="New folder password (min 4 chars)"
              className={inputClass}
            />
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submit();
              }}
              placeholder="Confirm password"
              className={inputClass}
            />
            {mismatch && confirm.length > 0 && (
              <p className="text-xs text-danger">Passwords do not match.</p>
            )}
          </>
        )}
        {error && <p className="text-xs text-danger">{error}</p>}

        <div className="mt-1 flex justify-end gap-2">
          <button
            type="button"
            onClick={close}
            disabled={busy}
            className="glass-sm glass-hover px-3 py-1.5 text-xs text-muted disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!canSubmit}
            className="rounded-lg border border-accent/50 bg-accent/15 px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/25 disabled:opacity-60"
          >
            {busy
              ? "Working…"
              : mode === "unlock"
                ? "Unlock"
                : mode === "add"
                  ? "Protect Folder"
                  : mode === "change"
                    ? "Change Password"
                    : "Remove Password"}
          </button>
        </div>
      </div>
    </div>
  );
}
