import { create } from "zustand";

type UiState = {
  commandPaletteOpen: boolean;
  globalSearchOpen: boolean;
  toggleCommandPalette: () => void;
  openGlobalSearch: () => void;
  closeOverlays: () => void;
};

export const useUiStore = create<UiState>((set) => ({
  commandPaletteOpen: false,
  globalSearchOpen: false,
  toggleCommandPalette: () =>
    set((s) => ({
      commandPaletteOpen: !s.commandPaletteOpen,
      globalSearchOpen: false,
    })),
  openGlobalSearch: () =>
    set({ globalSearchOpen: true, commandPaletteOpen: false }),
  closeOverlays: () => set({ commandPaletteOpen: false, globalSearchOpen: false }),
}));
