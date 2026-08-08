import { useEffect } from "react";

export default function ConfirmDialog({
  title,
  message,
  confirmLabel = "Delete",
  busy = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  return (
    <div
      className="animate-overlay-in fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="glass animate-dialog-in w-full max-w-sm p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          {title}
        </h3>
        <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
          {message}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="glass-sm glass-hover px-3 py-1.5 text-xs text-slate-600 disabled:opacity-60 dark:text-slate-300"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="rounded-lg border border-red-400/40 bg-red-500/15 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-500/25 disabled:opacity-60 dark:text-red-400"
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
