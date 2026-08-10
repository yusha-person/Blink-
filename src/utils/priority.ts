import type { Priority } from "../types/habits";

export const PRIORITY_BADGE_STYLES: Record<Priority, string> = {
  low: "border-success/40 bg-success/10 text-success",
  medium: "border-warning/40 bg-warning/10 text-warning",
  high: "border-danger/40 bg-danger/10 text-danger",
};

export const PRIORITY_DOT_STYLES: Record<Priority, string> = {
  low: "bg-success",
  medium: "bg-warning",
  high: "bg-danger",
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};
