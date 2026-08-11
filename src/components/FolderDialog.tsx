import { useEffect, useState } from "react";
import { useNoteStore } from "../stores/noteStore";
import { usePrivacyStore } from "../stores/privacyStore";

export default function FolderDialog() {
  const dialog = useNoteStore((s) => s.folderDialog);
  const closeFolderDialog = useNoteStore((s) => s.closeFolderDialog);
  const createFolder = useNoteStore((s) => s.createFolder);
  const renameFolder = useNoteStore((s) => s.renameFolder);
  const folders = useNoteStore((s) => s.folders);
  const setFolderPassword = usePrivacyStore((s) => s.setFolderPassword);
  const privacyStatus = usePrivacyStore((s) => s.status);

  const [name, setName] = useState("");
  const [protect, setProtect] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [protectError, setProtectError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(dialog?.mode === "rename" ? dialog.folder.name : "");
    setProtect(false);
    setPassword("");
    setConfirm("");
    setProtectError(null);
  }, [dialog]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeFolderDialog();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeFolderDialog]);

  if (!dialog) return null;

  const parentName =
    dialog.mode === "create" && dialog.parentId
      ? folders.find((f) => f.id === dialog.parentId)?.name
      : null;

  const passwordMismatch = protect && password !== confirm;
  const canSave =
    name.trim().length > 0 &&
    !busy &&
    (dialog.mode === "rename" ||
      !protect ||
      (password.length >= 4 && !passwordMismatch));

  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    try {
      if (dialog.mode === "create") {
        const folder = await createFolder(name.trim(), dialog.parentId);
        if (folder && protect) {
          const ok = await setFolderPassword(folder.id, password);
          if (!ok) {
            setProtectError(
              "Folder was created but could not be protected. Set up the master password in Settings first, then add a password from the folder's menu.",
            );
            return;
          }
        }
      } else {
        await renameFolder(dialog.folder.id, name.trim());
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="animate-overlay-in fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4"
      onClick={closeFolderDialog}
      role="dialog"
      aria-modal="true"
      aria-label={dialog.mode === "create" ? "New folder" : "Rename folder"}
    >
      <div
        className="glass animate-dialog-in flex w-full max-w-sm flex-col gap-3 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-text">
          {dialog.mode === "create"
            ? parentName
              ? `New Subfolder in "${parentName}"`
              : "New Folder"
            : `Rename "${dialog.folder.name}"`}
        </h3>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void save();
          }}
          placeholder="Folder name"
          className="w-full select-text rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-text outline-none transition-colors placeholder:text-muted focus:border-accent/50"
        />
        {dialog.mode === "create" && (
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-xs text-text">
              <input
                type="checkbox"
                checked={protect}
                onChange={(e) => setProtect(e.target.checked)}
                className="accent-accent"
              />
              Protect this folder with a password
            </label>
            {protect && (
              <>
                {!privacyStatus?.passwordSet && (
                  <p className="text-xs text-warning">
                    No master password is set yet — set one in Settings → Private Notes first.
                  </p>
                )}
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Folder password (min 4 chars)"
                  className="w-full select-text rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-text outline-none transition-colors placeholder:text-muted focus:border-accent/50"
                />
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Confirm password"
                  className="w-full select-text rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-text outline-none transition-colors placeholder:text-muted focus:border-accent/50"
                />
                {passwordMismatch && confirm.length > 0 && (
                  <p className="text-xs text-danger">Passwords do not match.</p>
                )}
              </>
            )}
            {protectError && <p className="text-xs text-warning">{protectError}</p>}
          </div>
        )}
        <div className="mt-1 flex justify-end gap-2">
          <button
            type="button"
            onClick={closeFolderDialog}
            disabled={busy}
            className="glass-sm glass-hover px-3 py-1.5 text-xs text-muted disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={!canSave}
            className="rounded-lg border border-accent/50 bg-accent/15 px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/25 disabled:opacity-60"
          >
            {busy ? "Saving…" : dialog.mode === "create" ? "Create Folder" : "Rename"}
          </button>
        </div>
      </div>
    </div>
  );
}
