import { useEffect, useState } from "react";
import { useNoteStore } from "../stores/noteStore";

export default function FolderDialog() {
  const dialog = useNoteStore((s) => s.folderDialog);
  const closeFolderDialog = useNoteStore((s) => s.closeFolderDialog);
  const createFolder = useNoteStore((s) => s.createFolder);
  const renameFolder = useNoteStore((s) => s.renameFolder);
  const folders = useNoteStore((s) => s.folders);

  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(dialog?.mode === "rename" ? dialog.folder.name : "");
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

  const save = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      if (dialog.mode === "create") {
        await createFolder(name.trim(), dialog.parentId);
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
            disabled={!name.trim() || busy}
            className="rounded-lg border border-accent/50 bg-accent/15 px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/25 disabled:opacity-60"
          >
            {busy ? "Saving…" : dialog.mode === "create" ? "Create" : "Rename"}
          </button>
        </div>
      </div>
    </div>
  );
}
