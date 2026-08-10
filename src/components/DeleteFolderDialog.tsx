import { useEffect, useState } from "react";
import { useNoteStore } from "../stores/noteStore";

export default function DeleteFolderDialog() {
  const request = useNoteStore((s) => s.deleteFolderRequest);
  const cancelDeleteFolder = useNoteStore((s) => s.cancelDeleteFolder);
  const deleteFolder = useNoteStore((s) => s.deleteFolder);
  const folders = useNoteStore((s) => s.folders);

  const [destinationId, setDestinationId] = useState("");
  const [subfolderAction, setSubfolderAction] = useState<"promote" | "delete_subfolders">("promote");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDestinationId("");
    setSubfolderAction("promote");
  }, [request?.folder.id]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancelDeleteFolder();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cancelDeleteFolder]);

  if (!request) return null;

  const { folder, directNoteCount, subfolderCount, subtreeNoteCount } = request;
  const notesToRelocate = subfolderAction === "promote" ? directNoteCount : subtreeNoteCount;

  const descendantIds = new Set<number>([folder.id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of folders) {
      if (!descendantIds.has(f.id) && descendantIds.has(f.parentId)) {
        descendantIds.add(f.id);
        grew = true;
      }
    }
  }
  const destinations = folders.filter((f) => !descendantIds.has(f.id));

  const needsDestination = notesToRelocate > 0;
  const canConfirm = (!needsDestination || destinationId !== "") && !busy;

  const confirm = async () => {
    if (!canConfirm) return;
    setBusy(true);
    try {
      await deleteFolder(
        folder.id,
        needsDestination ? Number(destinationId) : null,
        subfolderAction,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="animate-overlay-in fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4"
      onClick={cancelDeleteFolder}
      role="dialog"
      aria-modal="true"
      aria-label={`Delete folder ${folder.name}`}
    >
      <div
        className="glass animate-dialog-in flex w-full max-w-md flex-col gap-3 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-text">Delete "{folder.name}"</h3>
        <p className="text-xs leading-relaxed text-muted">
          The folder will be permanently deleted. Notes are never deleted.
        </p>

        {subfolderCount > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-text">
              This folder has {subfolderCount} subfolder{subfolderCount === 1 ? "" : "s"}:
            </span>
            <label className="flex items-start gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-xs text-text">
              <input
                type="radio"
                name="subfolder-action"
                checked={subfolderAction === "promote"}
                onChange={() => setSubfolderAction("promote")}
                className="mt-0.5 accent-accent"
              />
              <span>
                <span className="font-medium">Promote subfolders</span> (recommended) — move them up
                one level. Their notes stay in place.
              </span>
            </label>
            <label className="flex items-start gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-xs text-text">
              <input
                type="radio"
                name="subfolder-action"
                checked={subfolderAction === "delete_subfolders"}
                onChange={() => setSubfolderAction("delete_subfolders")}
                className="mt-0.5 accent-accent"
              />
              <span>
                <span className="font-medium">Delete subfolders too</span> — removes the whole
                branch. All {subtreeNoteCount} note{subtreeNoteCount === 1 ? "" : "s"} in it will be
                relocated.
              </span>
            </label>
          </div>
        )}

        {needsDestination && (
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-text">
              Move {notesToRelocate} note{notesToRelocate === 1 ? "" : "s"} to:
            </span>
            <select
              value={destinationId}
              onChange={(e) => setDestinationId(e.target.value)}
              className="select-text rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-text outline-none focus:border-accent/50"
            >
              <option value="" disabled>
                Choose a destination folder…
              </option>
              {destinations.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="mt-2 flex justify-end gap-2">
          <button
            type="button"
            onClick={cancelDeleteFolder}
            disabled={busy}
            className="glass-sm glass-hover px-3 py-1.5 text-xs text-muted disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void confirm()}
            disabled={!canConfirm}
            className="rounded-lg border border-danger/40 bg-danger/15 px-3 py-1.5 text-xs font-medium text-danger transition-colors hover:bg-danger/25 disabled:opacity-60"
          >
            {busy ? "Deleting…" : "Delete Folder"}
          </button>
        </div>
      </div>
    </div>
  );
}
