export function parseTimestamp(ts: string): Date | null {  const date = new Date(ts.replace(" ", "T"));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatFullTimestamp(ts: string): string {
  const date = parseTimestamp(ts);
  if (!date) return ts;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatListTimestamp(ts: string): string {
  const date = parseTimestamp(ts);
  if (!date) return ts;
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" as const }),
  });
}

export function localDateString(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(dateString: string, days: number): string {
  const [y, m, d] = dateString.split("-").map(Number);
  return localDateString(new Date(y, m - 1, d + days));
}

export function formatDueDate(dateString: string): string {
  const [y, m, d] = dateString.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
