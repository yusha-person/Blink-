import { memo } from "react";
import type { HeatmapLevel, HeatmapWeek } from "../utils/statistics";

const CELL_CLASSES: Record<HeatmapLevel, string> = {
  0: "bg-slate-900/10 dark:bg-white/5",
  1: "bg-accent/25",
  2: "bg-accent/45",
  3: "bg-accent/70",
  4: "bg-accent",
};

const WEEKDAY_LABELS: Array<{ index: number; label: string }> = [
  { index: 0, label: "Mon" },
  { index: 2, label: "Wed" },
  { index: 4, label: "Fri" },
];

function formatCellDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

type ContributionHeatmapProps = {
  weeks: HeatmapWeek[];
};

export const ContributionHeatmap = memo(function ContributionHeatmap({ weeks }: ContributionHeatmapProps) {
  return (
    <div className="overflow-x-auto pb-1">
      <div className="inline-flex flex-col gap-1">
        <div className="flex gap-1 pl-9">
          {weeks.map((week, i) => (
            <span
              key={i}
              className="w-3 text-left text-[10px] leading-3 text-slate-500 dark:text-slate-400"
            >
              {week.monthLabel ?? ""}
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <div className="grid w-7 grid-rows-7 gap-1">
            {WEEKDAY_LABELS.map(({ index, label }) => (
              <span
                key={label}
                style={{ gridRowStart: index + 1 }}
                className="text-[10px] leading-3 text-slate-500 dark:text-slate-400"
              >
                {label}
              </span>
            ))}
          </div>
          <div className="flex gap-1">
            {weeks.map((week, i) => (
              <div key={i} className="grid grid-rows-7 gap-1">
                {week.cells.map((cell) => (
                  <div
                    key={cell.date}
                    title={`${formatCellDate(cell.date)} — ${cell.xp} XP (${cell.points} pts)`}
                    className={`h-3 w-3 rounded-[3px] ${CELL_CLASSES[cell.level]} ${
                      cell.inFuture ? "opacity-30" : ""
                    }`}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-end gap-1 pt-1 text-[10px] text-slate-500 dark:text-slate-400">
          <span className="mr-1">Less</span>
          {([0, 1, 2, 3, 4] as HeatmapLevel[]).map((level) => (
            <span
              key={level}
              className={`h-3 w-3 rounded-[3px] ${CELL_CLASSES[level]}`}
            />
          ))}
          <span className="ml-1">More</span>
        </div>
      </div>
    </div>
  );
});
