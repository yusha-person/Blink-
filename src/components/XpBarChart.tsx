import { memo } from "react";
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { XpBucket } from "../utils/statistics";

type ChartTooltipProps = {
  active?: boolean;
  label?: string;
  payload?: Array<{ value?: number | string }>;
  unit: string;
};

function ChartTooltip({ active, label, payload, unit }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const value = Number(payload[0].value ?? 0);
  return (
    <div className="glass-sm px-3 py-2 text-xs">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span className="ml-2 font-semibold text-slate-800 dark:text-slate-100">
        {value.toLocaleString()} {unit}
      </span>
    </div>
  );
}

type XpBarChartProps = {
  data: XpBucket[];
  height?: number;
  unit?: string;
};

export const XpBarChart = memo(function XpBarChart({ data, height = 220, unit = "XP" }: XpBarChartProps) {
  return (
    <div className="text-slate-500 dark:text-slate-400" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fill: "currentColor", fontSize: 11 }}
            interval="preserveStartEnd"
            minTickGap={24}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fill: "currentColor", fontSize: 11 }}
            allowDecimals={false}
          />
          <Tooltip
            content={<ChartTooltip unit={unit} />}
            cursor={{ fill: "currentColor", opacity: 0.08 }}
          />
          <Bar dataKey="xp" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={40} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
});
