import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { DEFAULT_THEME_ID, getTheme, injectThemeCss, isThemeId } from "../styles/themes";

const THEME_SETTING_KEY = "theme";

function applyThemeToDom(themeId: string) {
  const theme = getTheme(themeId);
  const root = document.documentElement;
  root.dataset.theme = theme.id;
  root.classList.toggle("dark", theme.mode === "dark");
  root.style.colorScheme = theme.mode;
}

type ThemeState = {
  theme: string;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setTheme: (theme: string) => Promise<void>;
};

export const useThemeStore = create<ThemeState>((set) => ({
  theme: DEFAULT_THEME_ID,
  hydrated: false,

  hydrate: async () => {
    let theme = DEFAULT_THEME_ID;
    try {
      const stored = await invoke<string | null>("get_setting", {
        key: THEME_SETTING_KEY,
      });
      if (isThemeId(stored)) {
        theme = stored;
      }
    } catch {
      // Fall back to default theme if the backend is unreachable.
    }
    injectThemeCss();
    applyThemeToDom(theme);
    set({ theme, hydrated: true });
  },

  setTheme: async (theme) => {
    if (!isThemeId(theme)) return;
    await invoke("set_setting", { key: THEME_SETTING_KEY, value: theme });
    applyThemeToDom(theme);
    set({ theme });
  },
}));
