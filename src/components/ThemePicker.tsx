import { useRef } from "react";
import { CheckIcon } from "./icons";
import { useThemeStore } from "../stores/themeStore";
import {
  BASE_THEME_IDS,
  EXTRA_THEME_IDS,
  THEMES,
  type ThemeDefinition,
} from "../styles/themes";

function ThemeCard({
  theme,
  selected,
  tabIndex,
  onSelect,
  onKeyDown,
  cardRef,
}: {
  theme: ThemeDefinition;
  selected: boolean;
  tabIndex: number;
  onSelect: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLButtonElement>) => void;
  cardRef: (el: HTMLButtonElement | null) => void;
}) {
  const t = theme.tokens;
  return (
    <button
      ref={cardRef}
      type="button"
      onClick={onSelect}
      onKeyDown={onKeyDown}
      tabIndex={tabIndex}
      aria-pressed={selected}
      aria-label={`${theme.name} theme`}
      title={theme.name}
      className={`group flex w-32 flex-col gap-2 rounded-xl border p-2 text-left transition-colors duration-150 ${
        selected
          ? "border-accent ring-2 ring-accent/50"
          : "border-border hover:border-border-hover"
      }`}
    >
      <span
        className="relative flex h-14 w-full overflow-hidden rounded-lg border border-border"
        style={{ background: t.background }}
      >
        <span
          className="absolute left-1.5 top-1.5 h-9 w-4 rounded-sm"
          style={{ background: t.surface, border: `1px solid ${t.border}` }}
        />
        <span
          className="absolute bottom-1.5 left-1.5 right-1.5 h-3 rounded-sm"
          style={{ background: t.surface, border: `1px solid ${t.border}` }}
        />
        <span
          className="absolute bottom-2.5 right-3 h-1.5 w-8 rounded-full"
          style={{ background: t.accent }}
        />
        <span
          className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full"
          style={{ background: t.accent }}
        />
        {selected && (
          <span className="absolute left-1/2 top-1/2 flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-accent text-accent-text">
            <CheckIcon width={12} height={12} />
          </span>
        )}
      </span>
      <span className="flex items-center justify-between gap-1 px-0.5">
        <span className="text-xs font-medium text-text">{theme.name}</span>
        {selected && <span className="text-[10px] text-accent">Active</span>}
      </span>
    </button>
  );
}

function ThemeGrid({ ids }: { ids: readonly string[] }) {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const cardsRef = useRef<(HTMLButtonElement | null)[]>([]);

  const handleKeyDown = (index: number) => (e: React.KeyboardEvent<HTMLButtonElement>) => {
    let next: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (index + 1) % ids.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (index - 1 + ids.length) % ids.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = ids.length - 1;
    if (next !== null) {
      e.preventDefault();
      cardsRef.current[next]?.focus();
    }
  };

  return (
    <div role="group" className="flex flex-wrap gap-3">
      {ids.map((id, index) => (
        <ThemeCard
          key={id}
          theme={THEMES[id]}
          selected={theme === id}
          tabIndex={theme === id || (index === 0 && !ids.includes(theme)) ? 0 : -1}
          onSelect={() => void setTheme(id)}
          onKeyDown={handleKeyDown(index)}
          cardRef={(el) => {
            cardsRef.current[index] = el;
          }}
        />
      ))}
    </div>
  );
}

export default function ThemePicker() {
  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">Base</h4>
        <ThemeGrid ids={BASE_THEME_IDS} />
      </section>
      <section className="flex flex-col gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">Themes</h4>
        <ThemeGrid ids={EXTRA_THEME_IDS} />
      </section>
    </div>
  );
}
