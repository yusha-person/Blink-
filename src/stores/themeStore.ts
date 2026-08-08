import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";

export type Theme = "dark" | "light";

const THEME_SETTING_KEY = "theme";
const DEFAULT_THEME: Theme = "dark";

function applyThemeToDom(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
}

type ThemeState = {
  theme: Theme;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setTheme: (theme: Theme) => Promise<void>;
};

export const useThemeStore = create<ThemeState>((set) => ({
  theme: DEFAULT_THEME,
  hydrated: false,

  hydrate: async () => {
    let theme: Theme = DEFAULT_THEME;
    try {
      const stored = await invoke<string | null>("get_setting", {
        key: THEME_SETTING_KEY,
      });
      if (stored === "dark" || stored === "light") {
        theme = stored;
      }
    } catch {
      // Fall back to default theme if the backend is unreachable.
    }
    applyThemeToDom(theme);
    set({ theme, hydrated: true });
  },

  setTheme: async (theme) => {
    await invoke("set_setting", { key: THEME_SETTING_KEY, value: theme });
    applyThemeToDom(theme);
    set({ theme });
  },
}));
