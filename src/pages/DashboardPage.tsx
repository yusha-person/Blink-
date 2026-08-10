import { useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { ProgressBar, StatCard } from "../components/StatCard";
import { TaskRow } from "../components/TaskRow";
import { useGoalStore } from "../stores/goalStore";
import { useHabitStore } from "../stores/habitStore";
import { useTaskStore } from "../stores/taskStore";
import { groupTasks, sortTasks } from "../utils/tasks";
import { localDateString } from "../utils/timestamps";

function dayLabel(date: string): string {
  const dayMs = Date.parse(`${date}T00:00:00Z`);
  const now = new Date();
  const todayMs = Date.parse(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}T00:00:00Z`,
  );
  const diffDays = Math.round((todayMs - dayMs) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export default function DashboardPage() {
  const todayTotals = useHabitStore((s) => s.todayTotals);
  const streak = useHabitStore((s) => s.streak);
  const level = useHabitStore((s) => s.level);
  const xpSummary = useHabitStore((s) => s.xpSummary);
  const recentActivity = useHabitStore((s) => s.recentActivity);
  const hydrated = useHabitStore((s) => s.hydrated);
  const error = useHabitStore((s) => s.error);
  const minGoal = useGoalStore((s) => s.minGoal);
  const stretchGoal = useGoalStore((s) => s.stretchGoal);
  const tasks = useTaskStore((s) => s.tasks);
  const tasksHydrated = useTaskStore((s) => s.hydrated);
  const hydrateTasks = useTaskStore((s) => s.hydrate);
  const toggleTask = useTaskStore((s) => s.toggleTask);

  useEffect(() => {
    void hydrateTasks();
  }, [hydrateTasks]);

  const todayString = localDateString();
  const taskGroups = useMemo(() => {
    const open = sortTasks(
      tasks.filter((t) => !t.completedAt),
      "due",
    );
    return groupTasks(open, todayString);
  }, [tasks, todayString]);
  const openTaskCount = tasks.filter((t) => !t.completedAt).length;
  const completedTaskCount = tasks.length - openTaskCount;

  const handleTaskToggle = (id: number, completed: boolean) => {
    void toggleTask(id, completed);
  };

  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  if (!hydrated) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {error ? `Failed to load dashboard: ${error}` : "Loading…"}
        </p>
      </div>
    );
  }

  const points = todayTotals?.points ?? 0;
  const todayXp = todayTotals?.xp ?? 0;
  const currentStreak = streak?.current ?? 0;
  const longestStreak = streak?.longest ?? 0;
  const lvl = level?.level ?? 1;
  const totalXp = level?.totalXp ?? 0;
  const xpIntoLevel = level?.xpIntoLevel ?? 0;
  const levelSpan = level ? level.nextLevelXp - level.currentLevelXp : 100;
  const xpToNext = level?.xpToNextLevel ?? 0;
  const weeklyXp = xpSummary?.weeklyXp ?? 0;
  const monthlyXp = xpSummary?.monthlyXp ?? 0;

  return (
    <div className="flex flex-col gap-6 p-8">
      <header className="flex flex-col gap-1">
        <h2 className="text-2xl font-semibold text-slate-800 dark:text-slate-100">Dashboard</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">{today}</p>
      </header>

      {error && (
        <div className="glass border-red-400/40 p-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Today's Points" value={String(points)} hint={`Goal ${minGoal} / Stretch ${stretchGoal}`} />
        <StatCard label="Today's XP" value={String(todayXp)} hint="1 point = 10 XP" />
        <StatCard
          label="Current Streak"
          value={`${currentStreak} ${currentStreak === 1 ? "day" : "days"}`}
          hint={`Longest: ${longestStreak} ${longestStreak === 1 ? "day" : "days"}`}
        />
        <StatCard label="Level" value={String(lvl)} hint={`${totalXp.toLocaleString()} XP total`} />
      </section>

      <section className="grid grid-cols-2 gap-4 xl:grid-cols-3">
        <StatCard label="Last 7 Days XP" value={weeklyXp.toLocaleString()} hint="Rolling week" />
        <StatCard label="Last 30 Days XP" value={monthlyXp.toLocaleString()} hint="Rolling month" />
        <StatCard label="Total XP" value={totalXp.toLocaleString()} hint={`Level ${lvl}`} />
      </section>

      <section className="glass flex flex-col gap-3 p-5">
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-medium text-slate-800 dark:text-slate-200">Daily Goal</h3>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {points} / {stretchGoal} pts
          </span>
        </div>
        <ProgressBar value={points} max={stretchGoal} marker={minGoal} />
        <p className="text-xs text-slate-500">
          Marker shows the minimum goal ({minGoal} pts) needed to keep your streak.
        </p>
      </section>

      <section className="glass flex flex-col gap-3 p-5">
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-medium text-slate-800 dark:text-slate-200">Level {lvl}</h3>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {xpToNext.toLocaleString()} XP until level {lvl + 1}
          </span>
        </div>
        <ProgressBar value={xpIntoLevel} max={levelSpan} />
        <p className="text-xs text-slate-500">
          {xpIntoLevel.toLocaleString()} / {levelSpan.toLocaleString()} XP this level
        </p>
      </section>

      <section className="glass flex flex-col gap-3 p-5">
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-medium text-slate-800 dark:text-slate-200">Tasks</h3>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {openTaskCount} open · {completedTaskCount} completed
          </span>
        </div>
        {!tasksHydrated ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : taskGroups.overdue.length + taskGroups.today.length + taskGroups.upcoming.length === 0 ? (
          <p className="text-sm text-slate-500">
            Nothing due soon. <Link to="/tasks" className="text-accent">Open Tasks</Link> to plan ahead.
          </p>
        ) : (
          <>
            {([
              ["Overdue", taskGroups.overdue],
              ["Today", taskGroups.today],
              ["Upcoming (7 days)", taskGroups.upcoming],
            ] as const).map(([label, list]) =>
              list.length === 0 ? null : (
                <div key={label} className="flex flex-col gap-1.5">
                  <span className={`text-[10px] font-semibold uppercase tracking-wide ${label === "Overdue" ? "text-danger" : "text-slate-500 dark:text-slate-400"}`}>
                    {label}
                  </span>
                  {list.slice(0, 5).map((task) => (
                    <TaskRow key={task.id} task={task} today={todayString} onToggle={handleTaskToggle} />
                  ))}
                  {list.length > 5 && (
                    <Link to="/tasks" className="text-xs text-accent">
                      +{list.length - 5} more
                    </Link>
                  )}
                </div>
              ),
            )}
            <Link to="/tasks" className="mt-1 self-end text-xs text-accent">
              View all tasks
            </Link>
          </>
        )}
      </section>

      <section className="glass flex flex-col gap-2 p-5">
        <h3 className="text-sm font-medium text-slate-800 dark:text-slate-200">Recent Activity</h3>
        {recentActivity.length === 0 ? (
          <p className="text-sm text-slate-500">
            No activity yet. Complete a habit on the Habits page to get started.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-slate-900/5 dark:divide-white/5">
            {recentActivity.map((entry, index) => (
              <li key={`${entry.habitId}-${entry.date}-${index}`} className="flex items-center justify-between py-2">
                <div className="flex items-center gap-3">
                  <span className="w-16 shrink-0 text-xs text-slate-500 dark:text-slate-400">
                    {dayLabel(entry.date)}
                  </span>
                  <span className="text-sm text-slate-700 dark:text-slate-300">{entry.habitName}</span>
                </div>
                <span className="text-xs font-medium text-accent">+{entry.points} pts</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
