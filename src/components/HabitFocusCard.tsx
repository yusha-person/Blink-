import { memo, useMemo } from "react";
import type { HabitDetailStats } from "../types/statistics";
import { habitWeeklyBuckets } from "../utils/statistics";
import { ProgressBar, StatCard } from "./StatCard";
import { XpBarChart } from "./XpBarChart";

type HabitFocusCardProps = {
  label: string;
  detail: HabitDetailStats;
};

function formatRate(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

export const HabitFocusCard = memo(function HabitFocusCard({ label, detail }: HabitFocusCardProps) {
  const weekly = useMemo(
    () => habitWeeklyBuckets(detail.completionDates, 12),
    [detail.completionDates],
  );

  return (
    <div className="glass flex flex-col gap-4 p-5">
      <div className="flex items-baseline justify-between gap-4">
        <h4 className="text-sm font-medium text-slate-800 dark:text-slate-200">{label}</h4>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          +{detail.points} pts per day
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="Current Streak"
          value={`${detail.currentStreak} ${detail.currentStreak === 1 ? "day" : "days"}`}
        />
        <StatCard
          label="Longest Streak"
          value={`${detail.longestStreak} ${detail.longestStreak === 1 ? "day" : "days"}`}
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-xs text-slate-500 dark:text-slate-400">Completion rate</span>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {formatRate(detail.completionRate)} all-time ·{" "}
            {formatRate(detail.last30Rate)} last 30 days
          </span>
        </div>
        <ProgressBar value={detail.completionRate} max={1} />
        <span className="text-xs text-slate-500">
          {detail.totalCompletions} completions over {detail.daysTracked}{" "}
          {detail.daysTracked === 1 ? "day" : "days"} ·{" "}
          {detail.last30Completions} in the last 30 days
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-xs text-slate-500 dark:text-slate-400">
          Completions per week — last 12 weeks
        </span>
        <XpBarChart data={weekly} height={120} unit="days" />
      </div>
    </div>
  );
});
