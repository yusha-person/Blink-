import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { DEFAULT_APP_FONT_ID, fontStack, isFontId } from "../styles/fonts";

const APP_FONT_SETTING_KEY = "font.app";
const EDITOR_FONT_SETTING_KEY = "font.editor";

function applyFontsToDom(appFont: string, editorFont: string) {
  const root = document.documentElement;
  const appStack = fontStack(appFont);
  root.style.setProperty("--font-app", appStack);
  root.style.setProperty("--font-editor", editorFont ? fontStack(editorFont) : appStack);
}

type FontState = {
  appFont: string;
  editorFont: string;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setAppFont: (fontId: string) => Promise<void>;
  setEditorFont: (fontId: string) => Promise<void>;
};

export const useFontStore = create<FontState>((set, get) => ({
  appFont: DEFAULT_APP_FONT_ID,
  editorFont: "",
  hydrated: false,

  hydrate: async () => {
    let appFont = DEFAULT_APP_FONT_ID;
    let editorFont = "";
    try {
      const [storedApp, storedEditor] = await Promise.all([
        invoke<string | null>("get_setting", { key: APP_FONT_SETTING_KEY }),
        invoke<string | null>("get_setting", { key: EDITOR_FONT_SETTING_KEY }),
      ]);
      if (isFontId(storedApp)) appFont = storedApp;
      if (isFontId(storedEditor)) editorFont = storedEditor;
    } catch {
      // Fall back to defaults if the backend is unreachable.
    }
    applyFontsToDom(appFont, editorFont);
    set({ appFont, editorFont, hydrated: true });
  },

  setAppFont: async (fontId) => {
    if (!isFontId(fontId)) return;
    await invoke("set_setting", { key: APP_FONT_SETTING_KEY, value: fontId });
    applyFontsToDom(fontId, get().editorFont);
    set({ appFont: fontId });
  },

  setEditorFont: async (fontId) => {
    if (fontId !== "" && !isFontId(fontId)) return;
    await invoke("set_setting", { key: EDITOR_FONT_SETTING_KEY, value: fontId });
    applyFontsToDom(get().appFont, fontId);
    set({ editorFont: fontId });
  },
}));
