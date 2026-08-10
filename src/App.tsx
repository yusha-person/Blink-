import { Suspense, lazy, useEffect } from "react";
import { HashRouter, Route, Routes } from "react-router-dom";
import AppLayout from "./layouts/AppLayout";
import DashboardPage from "./pages/DashboardPage";
import HabitsPage from "./pages/HabitsPage";
import NotesPage from "./pages/NotesPage";
import CalendarPage from "./pages/CalendarPage";
import JournalPage from "./pages/JournalPage";
import AchievementsPage from "./pages/AchievementsPage";
import SettingsPage from "./pages/SettingsPage";
import { useThemeStore } from "./stores/themeStore";
import { useHabitStore } from "./stores/habitStore";
import { useJournalStore } from "./stores/journalStore";
import { useGoalStore } from "./stores/goalStore";

const StatisticsPage = lazy(() => import("./pages/StatisticsPage"));

export default function App() {
  const hydrateTheme = useThemeStore((s) => s.hydrate);
  const hydrateHabits = useHabitStore((s) => s.hydrate);
  const hydrateJournal = useJournalStore((s) => s.hydrate);
  const hydrateGoals = useGoalStore((s) => s.hydrate);

  useEffect(() => {
    void hydrateTheme();
    void hydrateHabits();
    void hydrateJournal();
    void hydrateGoals();
  }, [hydrateTheme, hydrateHabits, hydrateJournal, hydrateGoals]);

  useEffect(() => {
    const checkDayChange = () => {
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      const entryDate = useJournalStore.getState().todayEntry?.date;
      if (entryDate && entryDate !== today) {
        void useJournalStore.getState().hydrate();
        void useHabitStore.getState().hydrate();
      }
    };
    const interval = setInterval(checkDayChange, 30_000);
    window.addEventListener("focus", checkDayChange);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", checkDayChange);
    };
  }, []);

  return (
    <HashRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="habits" element={<HabitsPage />} />
          <Route path="notes" element={<NotesPage />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route
            path="statistics"
            element={
              <Suspense
                fallback={
                  <div className="flex h-full items-center justify-center p-8">
                    <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>
                  </div>
                }
              >
                <StatisticsPage />
              </Suspense>
            }
          />
          <Route path="journal" element={<JournalPage />} />
          <Route path="achievements" element={<AchievementsPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
