import { NavLink, Outlet, useLocation } from "react-router-dom";
import type { ComponentType, SVGProps } from "react";
import { useGlobalShortcuts } from "../hooks/useGlobalShortcuts";
import CommandPalette from "../components/CommandPalette";
import GlobalSearch from "../components/GlobalSearch";
import {
  AchievementsIcon,
  CalendarIcon,
  DashboardIcon,
  HabitsIcon,
  JournalIcon,
  NotesIcon,
  SettingsIcon,
  StatisticsIcon,
  TasksIcon,
} from "../components/icons";

type NavItem = {
  to: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
};

const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Dashboard", icon: DashboardIcon },
  { to: "/habits", label: "Habits", icon: HabitsIcon },
  { to: "/tasks", label: "Tasks", icon: TasksIcon },
  { to: "/notes", label: "Notes", icon: NotesIcon },
  { to: "/calendar", label: "Calendar", icon: CalendarIcon },
  { to: "/statistics", label: "Statistics", icon: StatisticsIcon },
  { to: "/journal", label: "Journal", icon: JournalIcon },
  { to: "/achievements", label: "Achievements", icon: AchievementsIcon },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
];

export default function AppLayout() {
  useGlobalShortcuts();
  const location = useLocation();

  return (
    <div className="flex h-full">
      <aside className="glass m-3 mr-0 flex w-56 flex-col gap-1 p-3">
        <div className="mb-4 px-2 pt-1">
          <h1 className="text-glow text-xl font-bold tracking-wider text-accent">
            Blink
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">Level up your life</p>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `glass-sm glass-hover flex items-center gap-3 px-3 py-2 text-sm ${
                  isActive
                    ? "border-accent/50 bg-accent/15 text-accent"
                    : "border-transparent text-slate-600 dark:text-slate-300"
                }`
              }
            >
              <Icon className="shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="flex-1 overflow-y-auto p-6">
        <div key={location.pathname} className="animate-page-in h-full">
          <Outlet />
        </div>
      </main>
      <CommandPalette />
      <GlobalSearch />
    </div>
  );
}
