import { useEffect, useState } from "react";
import { usePrivacyStore } from "../stores/privacyStore";
import { LockIcon, UnlockIcon } from "./icons";

const inputClass =
  "w-44 select-text rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-accent/50";

const buttonClass =
  "glass-sm glass-hover px-3 py-1.5 text-xs font-medium text-accent disabled:opacity-60";

function StatusBadge({ unlocked }: { unlocked: boolean }) {
  return (
    <span
      className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs ${
        unlocked
          ? "border-accent/40 bg-accent/10 text-accent"
          : "border-amber-400/40 bg-amber-400/10 text-amber-700 dark:text-amber-300"
      }`}
    >
      {unlocked ? (
        <UnlockIcon width={11} height={11} />
      ) : (
        <LockIcon width={11} height={11} />
      )}
      {unlocked ? "Unlocked" : "Locked"}
    </span>
  );
}

export default function PrivacySettings() {
  const status = usePrivacyStore((s) => s.status);
  const hydrated = usePrivacyStore((s) => s.hydrated);
  const error = usePrivacyStore((s) => s.error);
  const hydrate = usePrivacyStore((s) => s.hydrate);
  const setupPassword = usePrivacyStore((s) => s.setupPassword);
  const unlock = usePrivacyStore((s) => s.unlock);
  const lock = usePrivacyStore((s) => s.lock);
  const changePassword = usePrivacyStore((s) => s.changePassword);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [nextConfirm, setNextConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!hydrated) void hydrate();
  }, [hydrated, hydrate]);

  const run = async (action: () => Promise<boolean>) => {
    setBusy(true);
    setLocalError(null);
    setNotice(null);
    try {
      return await action();
    } finally {
      setBusy(false);
    }
  };

  const handleSetup = async () => {
    if (password !== confirm) {
      setLocalError("Passwords do not match.");
      return;
    }
    const ok = await run(() => setupPassword(password));
    if (ok) {
      setPassword("");
      setConfirm("");
      setNotice("Master password set. Private notes are unlocked for this session.");
    }
  };

  const handleUnlock = async () => {
    const ok = await run(() => unlock(password));
    if (ok) setPassword("");
  };

  const handleChange = async () => {
    if (next !== nextConfirm) {
      setLocalError("New passwords do not match.");
      return;
    }
    const ok = await run(() => changePassword(current, next));
    if (ok) {
      setCurrent("");
      setNext("");
      setNextConfirm("");
      setNotice("Password changed. All private notes were re-encrypted.");
    }
  };

  if (!hydrated || !status) {
    return <p className="py-3 text-xs text-slate-500">Loading…</p>;
  }

  const shownError = localError ?? error;

  return (
    <div className="flex flex-col gap-3 py-3">
      {!status.passwordSet ? (
        <>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Choose a master password to encrypt private notes (Argon2id +
            AES-256-GCM). It is never stored in plain text and cannot be
            recovered if forgotten.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="New password (min 4 chars)"
              autoComplete="new-password"
              className={inputClass}
            />
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Repeat password"
              autoComplete="new-password"
              className={inputClass}
            />
            <button
              type="button"
              onClick={() => void handleSetup()}
              disabled={busy || !password || !confirm}
              className={buttonClass}
            >
              Set password
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <StatusBadge unlocked={status.unlocked} />
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {status.privateCount}{" "}
              {status.privateCount === 1 ? "private note" : "private notes"}
            </span>
            {status.unlocked && (
              <button
                type="button"
                onClick={() => void lock()}
                disabled={busy}
                className={buttonClass}
              >
                Lock now
              </button>
            )}
          </div>

          {!status.unlocked ? (
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleUnlock();
                }}
                placeholder="Master password"
                autoComplete="current-password"
                className={inputClass}
              />
              <button
                type="button"
                onClick={() => void handleUnlock()}
                disabled={busy || !password}
                className={buttonClass}
              >
                Unlock
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
                Change master password
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="password"
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                  placeholder="Current password"
                  autoComplete="current-password"
                  className={inputClass}
                />
                <input
                  type="password"
                  value={next}
                  onChange={(e) => setNext(e.target.value)}
                  placeholder="New password (min 4 chars)"
                  autoComplete="new-password"
                  className={inputClass}
                />
                <input
                  type="password"
                  value={nextConfirm}
                  onChange={(e) => setNextConfirm(e.target.value)}
                  placeholder="Repeat new password"
                  autoComplete="new-password"
                  className={inputClass}
                />
                <button
                  type="button"
                  onClick={() => void handleChange()}
                  disabled={busy || !current || !next || !nextConfirm}
                  className={buttonClass}
                >
                  Change password
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {shownError && (
        <p className="text-xs text-red-600 dark:text-red-400">{shownError}</p>
      )}
      {notice && (
        <p className="text-xs text-emerald-600 dark:text-emerald-400">
          {notice}
        </p>
      )}
    </div>
  );
}
