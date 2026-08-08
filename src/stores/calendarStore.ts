import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import type { CalendarDayDetail, CalendarDaySummary } from "../types/calendar";

export function todayLocalString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function shiftMonth(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const total = (year * 12 + (month - 1)) + delta;
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
}

let monthRequest = 0;
let detailRequest = 0;

type CalendarState = {
  year: number;
  month: number;
  days: Record<string, CalendarDaySummary>;
  selectedDate: string | null;
  detail: CalendarDayDetail | null;
  hydrated: boolean;
  monthLoading: boolean;
  detailLoading: boolean;
  error: string | null;
  hydrate: () => Promise<void>;
  loadMonth: (year: number, month: number) => Promise<void>;
  refresh: () => Promise<void>;
  prevMonth: () => Promise<void>;
  nextMonth: () => Promise<void>;
  goToToday: () => Promise<void>;
  goToDate: (date: string) => Promise<void>;
  selectDate: (date: string | null) => Promise<void>;
};

export const useCalendarStore = create<CalendarState>((set, get) => ({
  year: 1970,
  month: 1,
  days: {},
  selectedDate: null,
  detail: null,
  hydrated: false,
  monthLoading: false,
  detailLoading: false,
  error: null,

  hydrate: async () => {
    if (get().hydrated) return;
    const today = todayLocalString();
    const [year, month] = today.split("-").map(Number);
    await get().loadMonth(year, month);
    await get().selectDate(today);
    set({ hydrated: true });
  },

  loadMonth: async (year, month) => {
    const request = ++monthRequest;
    set({ year, month, monthLoading: true });
    try {
      const summaries = await invoke<CalendarDaySummary[]>(
        "get_calendar_month",
        { year, month },
      );
      if (request !== monthRequest) return;
      const days: Record<string, CalendarDaySummary> = {};
      for (const summary of summaries) {
        days[summary.date] = summary;
      }
      set({ days, monthLoading: false, error: null });
    } catch (e) {
      if (request !== monthRequest) return;
      set({ monthLoading: false, error: String(e) });
    }
  },

  refresh: async () => {
    const { year, month, selectedDate, hydrated } = get();
    if (!hydrated) return;
    await get().loadMonth(year, month);
    if (selectedDate) await get().selectDate(selectedDate);
  },

  prevMonth: async () => {
    const { year, month } = get();
    const prev = shiftMonth(year, month, -1);
    await get().loadMonth(prev.year, prev.month);
  },

  nextMonth: async () => {
    const { year, month } = get();
    const next = shiftMonth(year, month, 1);
    await get().loadMonth(next.year, next.month);
  },

  goToToday: async () => {
    const today = todayLocalString();
    const [year, month] = today.split("-").map(Number);
    await get().loadMonth(year, month);
    await get().selectDate(today);
  },

  goToDate: async (date) => {
    const [year, month] = date.split("-").map(Number);
    await get().loadMonth(year, month);
    await get().selectDate(date);
    set({ hydrated: true });
  },

  selectDate: async (date) => {
    const request = ++detailRequest;
    if (!date) {
      set({ selectedDate: null, detail: null, detailLoading: false });
      return;
    }
    set({ selectedDate: date, detailLoading: true });
    try {
      const detail = await invoke<CalendarDayDetail>("get_calendar_day", {
        date,
      });
      if (request !== detailRequest) return;
      set({ detail, detailLoading: false, error: null });
    } catch (e) {
      if (request !== detailRequest) return;
      set({ detail: null, detailLoading: false, error: String(e) });
    }
  },
}));
