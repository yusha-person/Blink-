import { useEffect } from "react";
import { AchievementsIcon, CheckIcon } from "../components/icons";
import { ProgressBar } from "../components/StatCard";
import { useAchievementStore } from "../stores/achievementStore";
import type { AchievementEntry } from "../types/achievements";
import { formatFullTimestamp } from "../utils/timestamps";

function AchievementCard({ achievement }: { achievement: AchievementEntry }) {
  const { name, description, target, progress, unlocked, unlockedAt } = achievement;
  const shownProgress = Math.min(progress, target);
  return (
    <div
      className={`glass-sm glass-hover flex flex-col gap-3 p-4 ${
        unlocked ? "border-accent/50 bg-accent/10" : ""
      }`}
    >
      <div className="flex items-center gap-3">
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border ${
            unlocked
              ? "border-accent/50 bg-accent/15 text-accent"
              : "border-slate-900/10 text-slate-400 dark:border-white/10 dark:text-slate-500"
          }`}
        >
          {unlocked ? <CheckIcon /> : <AchievementsIcon />}
        </span>
        <div className="flex min-w-0 flex-col">
          <span
            className={`truncate text-sm font-semibold ${
              unlocked ? "text-accent" : "text-slate-800 dark:text-slate-100"
            }`}
          >
            {name}
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400">{description}</span>
        </div>
      </div>
      <ProgressBar value={shownProgress} max={target} />
      <span className="text-xs text-slate-500 dark:text-slate-400">
        {unlocked && unlockedAt
          ? `Unlocked ${formatFullTimestamp(unlockedAt)}`
          : `${shownProgress} / ${target}`}
      </span>
    </div>
  );
}

export default function AchievementsPage() {
  const achievements = useAchievementStore((s) => s.achievements);
  const hydrated = useAchievementStore((s) => s.hydrated);
  const error = useAchievementStore((s) => s.error);
  const hydrate = useAchievementStore((s) => s.hydrate);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  if (!hydrated) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {error ? `Failed to load achievements: ${error}` : "Loading…"}
        </p>
      </div>
    );
  }

  const unlockedCount = achievements.filter((a) => a.unlocked).length;

  return (
    <div className="flex flex-col gap-6 p-8">
      <header className="flex flex-col gap-1">
        <h2 className="text-2xl font-semibold text-slate-800 dark:text-slate-100">Achievements</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {unlockedCount} / {achievements.length} unlocked — milestones you earn along the way.
        </p>
      </header>

      {error && (
        <div className="glass border-red-400/40 p-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {achievements.map((a) => (
          <AchievementCard key={a.key} achievement={a} />
        ))}
      </section>
    </div>
  );
}
