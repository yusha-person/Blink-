import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type KeyboardEvent,
  type SVGProps,
} from "react";
import { useNavigate } from "react-router-dom";
import { useNoteStore } from "../stores/noteStore";
import { usePrivacyStore } from "../stores/privacyStore";
import { useThemeStore } from "../stores/themeStore";
import { useUiStore } from "../stores/uiStore";
import OverlayDialog from "./OverlayDialog";
import {
  AchievementsIcon,
  CalendarIcon,
  DashboardIcon,
  HabitsIcon,
  JournalIcon,
  LockIcon,
  MoonIcon,
  NotesIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  StatisticsIcon,
  SunIcon,
} from "./icons";

type Command = {
  id: string;
  title: string;
  section: "Navigate" | "Actions";
  keywords: string;
  hint?: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  run: () => void | Promise<void>;
};

export default function CommandPalette() {
  const open = useUiStore((s) => s.commandPaletteOpen);
  const close = useUiStore((s) => s.closeOverlays);
  const navigate = useNavigate();
  const theme = useThemeStore((s) => s.theme);
  const privacyStatus = usePrivacyStore((s) => s.status);

  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      if (!usePrivacyStore.getState().hydrated) {
        void usePrivacyStore.getState().hydrate();
      }
    }
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    const goTo = (path: string) => () => navigate(path);
    const list: Command[] = [
      { id: "nav-dashboard", title: "Go to Dashboard", section: "Navigate", keywords: "home overview", icon: DashboardIcon, run: goTo("/") },
      { id: "nav-habits", title: "Go to Habits", section: "Navigate", keywords: "habit tracker daily", icon: HabitsIcon, run: goTo("/habits") },
      { id: "nav-notes", title: "Go to Notes", section: "Navigate", keywords: "note folder", icon: NotesIcon, run: goTo("/notes") },
      { id: "nav-calendar", title: "Go to Calendar", section: "Navigate", keywords: "history days", icon: CalendarIcon, run: goTo("/calendar") },
      { id: "nav-statistics", title: "Go to Statistics", section: "Navigate", keywords: "stats charts xp heatmap", icon: StatisticsIcon, run: goTo("/statistics") },
      { id: "nav-journal", title: "Go to Journal", section: "Navigate", keywords: "daily entry diary today", icon: JournalIcon, run: goTo("/journal") },
      { id: "nav-achievements", title: "Go to Achievements", section: "Navigate", keywords: "badges unlocks", icon: AchievementsIcon, run: goTo("/achievements") },
      { id: "nav-settings", title: "Go to Settings", section: "Navigate", keywords: "preferences appearance privacy", icon: SettingsIcon, run: goTo("/settings") },
      {
        id: "new-note",
        title: "New Note",
        section: "Actions",
        keywords: "create note",
        hint: "Ctrl+N",
        icon: PlusIcon,
        run: () => {
          navigate("/notes");
          void useNoteStore.getState().createNoteGlobal();
        },
      },
      {
        id: "quick-note",
        title: "New Quick Note",
        section: "Actions",
        keywords: "create note capture",
        hint: "Ctrl+Shift+N",
        icon: NotesIcon,
        run: () => {
          navigate("/notes");
          void useNoteStore.getState().createQuickNote();
        },
      },
      {
        id: "global-search",
        title: "Global Search",
        section: "Actions",
        keywords: "find search everything",
        hint: "Ctrl+F",
        icon: SearchIcon,
        run: () => useUiStore.getState().openGlobalSearch(),
      },
      {
        id: "toggle-theme",
        title: theme === "dark" ? "Switch to Light Theme" : "Switch to Dark Theme",
        section: "Actions",
        keywords: "theme dark light appearance toggle",
        icon: theme === "dark" ? SunIcon : MoonIcon,
        run: async () => {
          await useThemeStore.getState().setTheme(theme === "dark" ? "light" : "dark");
        },
      },
    ];
    if (privacyStatus?.passwordSet && privacyStatus.unlocked) {
      list.push({
        id: "lock-private",
        title: "Lock Private Notes",
        section: "Actions",
        keywords: "privacy lock encrypt hide",
        icon: LockIcon,
        run: async () => {
          await usePrivacyStore.getState().lock();
        },
      });
    }
    return list;
  }, [navigate, theme, privacyStatus]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.keywords.toLowerCase().includes(q),
    );
  }, [commands, query]);

  useEffect(() => {
    setSelectedIndex((i) => Math.min(i, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>('[data-selected="true"]');
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex, filtered]);

  if (!open) return null;

  const runCommand = (command: Command) => {
    close();
    void command.run();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => (filtered.length === 0 ? 0 : (i + 1) % filtered.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) =>
        filtered.length === 0 ? 0 : (i - 1 + filtered.length) % filtered.length,
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      const command = filtered[selectedIndex];
      if (command) runCommand(command);
    }
  };

  let lastSection: Command["section"] | null = null;

  return (
    <OverlayDialog label="Command palette" onClose={close}>
      <input
        autoFocus
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setSelectedIndex(0);
        }}
        onKeyDown={onKeyDown}
        placeholder="Type a command…"
        className="glass-sm w-full px-3 py-2 text-sm text-slate-800 select-text placeholder:text-slate-500 focus:border-accent/50 focus:outline-none dark:text-slate-100"
      />
      <div ref={listRef} className="mt-3 max-h-80 overflow-y-auto">
        {filtered.length === 0 && (
          <p className="px-1 pb-1 text-xs text-slate-500 dark:text-slate-400">
            No commands match "{query}"
          </p>
        )}
        {filtered.map((command, index) => {
          const showSection = command.section !== lastSection;
          lastSection = command.section;
          const selected = index === selectedIndex;
          return (
            <div key={command.id}>
              {showSection && (
                <p className="px-1 pt-2 pb-1 text-[10px] font-semibold tracking-wider text-slate-500 uppercase dark:text-slate-400">
                  {command.section}
                </p>
              )}
              <button
                type="button"
                data-selected={selected}
                onMouseEnter={() => setSelectedIndex(index)}
                onClick={() => runCommand(command)}
                className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm ${
                  selected
                    ? "bg-accent/15 text-accent"
                    : "text-slate-700 dark:text-slate-200"
                }`}
              >
                <command.icon className="shrink-0" />
                <span className="flex-1 truncate">{command.title}</span>
                {command.hint && (
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">
                    {command.hint}
                  </span>
                )}
              </button>
            </div>
          );
        })}
      </div>
      <p className="mt-3 border-t border-slate-900/10 px-1 pt-2 text-[10px] text-slate-500 dark:border-white/10 dark:text-slate-400">
        ↑↓ navigate · Enter run · Esc close
      </p>
    </OverlayDialog>
  );
}
