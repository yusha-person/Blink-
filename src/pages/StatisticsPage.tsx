import { useEffect, useMemo } from "react";
import { ContributionHeatmap } from "../components/ContributionHeatmap";
import { HabitFocusCard } from "../components/HabitFocusCard";
import { ProgressBar, StatCard } from "../components/StatCard";
import { XpBarChart } from "../components/XpBarChart";
import { useGoalStore } from "../stores/goalStore";
import { useHabitStore } from "../stores/habitStore";
import { FOCUS_HABITS, useStatisticsStore } from "../stores/statisticsStore";
import {
  dailyBuckets,
  heatmapWeeks,
  monthlyBuckets,
  weeklyBuckets,
} from "../utils/statistics";

function formatRate(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

export default function StatisticsPage() {
  const history = useStatisticsStore((s) => s.history);
  const habitStats = useStatisticsStore((s) => s.habitStats);
  const focusStats = useStatisticsStore((s) => s.focusStats);
  const hydrated = useStatisticsStore((s) => s.hydrated);
  const error = useStatisticsStore((s) => s.error);
  const hydrate = useStatisticsStore((s) => s.hydrate);
  const streak = useHabitStore((s) => s.streak);
  const level = useHabitStore((s) => s.level);
  const habitsHydrated = useHabitStore((s) => s.hydrated);
  const minGoal = useGoalStore((s) => s.minGoal);
  const stretchGoal = useGoalStore((s) => s.stretchGoal);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const daily = useMemo(() => dailyBuckets(history, 30), [history]);
  const weekly = useMemo(() => weeklyBuckets(history, 12), [history]);
  const monthly = useMemo(() => monthlyBuckets(history, 12), [history]);
  const heatmap = useMemo(
    () =>
      heatmapWeeks(history, 53, new Date(), {
        minXp: minGoal * 10,
        stretchXp: stretchGoal * 10,
      }),
    [history, minGoal, stretchGoal],
  );

  if (!hydrated) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {error ? `Failed to load statistics: ${error}` : "Loading…"}
        </p>
      </div>
    );
  }

  const currentStreak = streak?.current ?? 0;
  const longestStreak = streak?.longest ?? 0;
  const totalXp = level?.totalXp ?? 0;
  const lvl = level?.level ?? 1;

  return (
    <div className="flex flex-col gap-6 p-8">
      <header className="flex flex-col gap-1">
        <h2 className="text-2xl font-semibold text-slate-800 dark:text-slate-100">Statistics</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Charts and insights about your progress.
        </p>
      </header>

      {error && (
        <div className="glass border-red-400/40 p-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard
          label="Current Streak"
          value={`${currentStreak} ${currentStreak === 1 ? "day" : "days"}`}
          hint={habitsHydrated ? "Min 8 pts per day" : undefined}
        />
        <StatCard
          label="Longest Streak"
          value={`${longestStreak} ${longestStreak === 1 ? "day" : "days"}`}
          hint="All-time best"
        />
        <StatCard label="Total XP" value={totalXp.toLocaleString()} hint={`Level ${lvl}`} />
        <StatCard
          label="Days With XP"
          value={String(history.length)}
          hint="Since tracking began"
        />
      </section>

      <section className="glass flex flex-col gap-3 p-5">
        <h3 className="text-sm font-medium text-slate-800 dark:text-slate-200">
          Daily XP — Last 30 Days
        </h3>
        <XpBarChart data={daily} />
      </section>

      <section className="glass flex flex-col gap-3 p-5">
        <h3 className="text-sm font-medium text-slate-800 dark:text-slate-200">
          Activity — Last 12 Months
        </h3>
        <ContributionHeatmap weeks={heatmap} />
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="glass flex flex-col gap-3 p-5">
          <h3 className="text-sm font-medium text-slate-800 dark:text-slate-200">
            Weekly XP — Last 12 Weeks
          </h3>
          <XpBarChart data={weekly} />
        </div>
        <div className="glass flex flex-col gap-3 p-5">
          <h3 className="text-sm font-medium text-slate-800 dark:text-slate-200">
            Monthly XP — Last 12 Months
          </h3>
          <XpBarChart data={monthly} />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-medium text-slate-800 dark:text-slate-200">
          Habit Focus
        </h3>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {FOCUS_HABITS.map((focus) => {
            const detail = focusStats.find((s) => s.name === focus.name);
            return detail ? (
              <HabitFocusCard key={focus.name} label={focus.label} detail={detail} />
            ) : null;
          })}
        </div>
      </section>

      <section className="glass flex flex-col gap-2 p-5">
        <h3 className="text-sm font-medium text-slate-800 dark:text-slate-200">
          Habit Completion Rates
        </h3>        {habitStats.length === 0 ? (
          <p className="text-sm text-slate-500">No habits to show yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-slate-900/5 dark:divide-white/5">
            {habitStats.map((stat) => (
              <li key={stat.habitId} className="flex flex-col gap-2 py-3">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-sm text-slate-700 dark:text-slate-300">
                    {stat.name}
                    <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">
                      +{stat.points} pts
                    </span>
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {formatRate(stat.completionRate)} all-time ·{" "}
                    {formatRate(stat.last30Rate)} last 30 days
                  </span>
                </div>
                <ProgressBar value={stat.completionRate} max={1} />
                <span className="text-xs text-slate-500">
                  {stat.totalCompletions} completions over {stat.daysTracked}{" "}
                  {stat.daysTracked === 1 ? "day" : "days"} ·{" "}
                  {stat.last30Completions} in the last 30 days
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
