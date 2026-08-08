import { MoonIcon, SunIcon } from "./icons";
import { useThemeStore, type Theme } from "../stores/themeStore";

const OPTIONS: { value: Theme; label: string; icon: typeof SunIcon }[] = [
  { value: "dark", label: "Dark", icon: MoonIcon },
  { value: "light", label: "Light", icon: SunIcon },
];

export default function ThemeToggle() {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="glass-sm flex items-center gap-1 p-1"
    >
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const active = theme === value;
        return (
          <button
            key={value}
            role="radio"
            aria-checked={active}
            onClick={() => void setTheme(value)}
            className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors duration-150 ${
              active
                ? "bg-accent/15 text-accent"
                : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            <Icon width={16} height={16} />
            {label}
          </button>
        );
      })}
    </div>
  );
}
