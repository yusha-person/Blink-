import JournalEditor from "../components/JournalEditor";
import { useJournalStore } from "../stores/journalStore";

export default function JournalPage() {
  const todayEntry = useJournalStore((s) => s.todayEntry);
  const hydrated = useJournalStore((s) => s.hydrated);
  const error = useJournalStore((s) => s.error);

  if (!hydrated || !todayEntry) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {error ?? "Loading journal…"}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
          Journal
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Reflect on your day, one entry at a time.
        </p>
      </div>
      {error && (
        <p className="glass-sm border-red-400/40 px-3 py-2 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      <div className="glass min-h-0 flex-1 overflow-hidden">
        <JournalEditor key={todayEntry.date} entry={todayEntry} />
      </div>
    </div>
  );
}
