import type { ReactNode } from "react";

type ProgressBarProps = {
  value: number;
  max: number;
  marker?: number;
  className?: string;
};

export function ProgressBar({ value, max, marker, className }: ProgressBarProps) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const markerPct = marker !== undefined && max > 0 ? Math.min(100, (marker / max) * 100) : undefined;
  return (
    <div className={`relative h-2.5 w-full overflow-hidden rounded-full bg-text/10 ${className ?? ""}`}>
      <div
        className="h-full rounded-full bg-accent transition-all duration-300"
        style={{ width: `${pct}%` }}
      />
      {markerPct !== undefined && (
        <div
          className="absolute top-0 h-full w-0.5 bg-muted"
          style={{ left: `${markerPct}%` }}
        />
      )}
    </div>
  );
}

type StatCardProps = {
  label: string;
  value: string;
  hint?: string;
  children?: ReactNode;
};

export function StatCard({ label, value, hint, children }: StatCardProps) {
  return (
    <div className="glass-sm glass-hover flex flex-col gap-1 p-4">
      <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</span>
      <span className="text-2xl font-semibold text-slate-800 dark:text-slate-100">{value}</span>
      {hint && <span className="text-xs text-slate-500">{hint}</span>}
      {children}
    </div>
  );
}
