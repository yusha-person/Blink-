export type ThemeTokens = {
  background: string;
  surface: string;
  surfaceHover: string;
  surfaceActive: string;
  text: string;
  textMuted: string;
  border: string;
  borderHover: string;
  accent: string;
  accentHover: string;
  accentText: string;
  success: string;
  warning: string;
  danger: string;
  overlay: string;
  focusRing: string;
  selection: string;
  codeBackground: string;
  scrollbarThumb: string;
  scrollbarTrack: string;
  shadow: string;
  shadowSm: string;
};

export type ThemeDefinition = {
  id: string;
  name: string;
  mode: "dark" | "light";
  tokens: ThemeTokens;
  chartPalette: string[];
};

type ThemeSeed = Pick<
  ThemeTokens,
  "background" | "surface" | "text" | "textMuted" | "border" | "accent" | "accentHover" | "accentText"
> &
  Partial<ThemeTokens>;

const SUCCESS = "#22c55e";
const WARNING = "#f59e0b";
const DANGER = "#ef4444";

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

function mix(hex: string, other: string, amount: number): string {
  const [r1, g1, b1] = hexToRgb(hex);
  const [r2, g2, b2] = hexToRgb(other);
  return rgbToHex(r1 + (r2 - r1) * amount, g1 + (g2 - g1) * amount, b1 + (b2 - b1) * amount);
}

function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function buildTokens(seed: ThemeSeed, mode: "dark" | "light"): ThemeTokens {
  const stepTarget = mode === "dark" ? "#ffffff" : "#000000";
  return {
    background: seed.background,
    surface: seed.surface,
    surfaceHover: seed.surfaceHover ?? mix(seed.surface, stepTarget, 0.06),
    surfaceActive: seed.surfaceActive ?? mix(seed.surface, stepTarget, 0.12),
    text: seed.text,
    textMuted: seed.textMuted,
    border: seed.border,
    borderHover: seed.borderHover ?? mix(seed.border, stepTarget, 0.15),
    accent: seed.accent,
    accentHover: seed.accentHover,
    accentText: seed.accentText,
    success: seed.success ?? SUCCESS,
    warning: seed.warning ?? WARNING,
    danger: seed.danger ?? DANGER,
    overlay: seed.overlay ?? withAlpha(seed.background, 0.7),
    focusRing: seed.focusRing ?? seed.accent,
    selection: seed.selection ?? withAlpha(seed.accent, 0.35),
    codeBackground: seed.codeBackground ?? mix(seed.surface, stepTarget, 0.06),
    scrollbarThumb: seed.scrollbarThumb ?? seed.border,
    scrollbarTrack: seed.scrollbarTrack ?? seed.surface,
    shadow: seed.shadow ?? (mode === "dark" ? "rgba(0, 0, 0, 0.45)" : "rgba(15, 23, 42, 0.10)"),
    shadowSm: seed.shadowSm ?? (mode === "dark" ? "rgba(0, 0, 0, 0.35)" : "rgba(15, 23, 42, 0.08)"),
  };
}

function defineTheme(
  id: string,
  name: string,
  mode: "dark" | "light",
  seed: ThemeSeed,
  chartPalette: string[],
): ThemeDefinition {
  return { id, name, mode, tokens: buildTokens(seed, mode), chartPalette };
}

const dark = defineTheme(
  "dark",
  "Dark Mode",
  "dark",
  {
    background: "#0a0f1e",
    surface: "#0f172a",
    text: "#e2e8f0",
    textMuted: "#94a3b8",
    border: "#26355c",
    accent: "#3b82f6",
    accentHover: "#60a5fa",
    accentText: "#ffffff",
    codeBackground: "#1a2030",
  },
  ["#3b82f6", "#60a5fa", "#22c55e", "#f59e0b", "#a78bfa"],
);

const light = defineTheme(
  "light",
  "Light Mode",
  "light",
  {
    background: "#f1f5f9",
    surface: "#ffffff",
    text: "#1e293b",
    textMuted: "#5d6a7d",
    border: "#e2e8f0",
    accent: "#3b82f6",
    accentHover: "#60a5fa",
    accentText: "#ffffff",
    codeBackground: "#eef1f5",
  },
  ["#3b82f6", "#2563eb", "#16a34a", "#d97706", "#8b5cf6"],
);

const ocean = defineTheme(
  "ocean",
  "Ocean",
  "dark",
  {
    background: "#0a1929",
    surface: "#0f2740",
    text: "#e6f1fb",
    textMuted: "#8fa8c2",
    border: "#1e3a52",
    accent: "#38bdf8",
    accentHover: "#0ea5e9",
    accentText: "#05202e",
  },
  ["#38bdf8", "#0ea5e9", "#22c55e", "#f59e0b", "#818cf8"],
);

const nord = defineTheme(
  "nord",
  "Nord",
  "dark",
  {
    background: "#2e3440",
    surface: "#3b4252",
    text: "#eceff4",
    textMuted: "#a8b2be",
    border: "#4c566a",
    accent: "#88c0d0",
    accentHover: "#81a1c1",
    accentText: "#1a1f27",
  },
  ["#88c0d0", "#81a1c1", "#a3be8c", "#ebcb8b", "#b48ead"],
);

const dracula = defineTheme(
  "dracula",
  "Dracula",
  "dark",
  {
    background: "#191a21",
    surface: "#282a36",
    text: "#f8f8f2",
    textMuted: "#a9abc3",
    border: "#3e4155",
    accent: "#ff79c6",
    accentHover: "#ff92d0",
    accentText: "#1e1f29",
  },
  ["#ff79c6", "#bd93f9", "#50fa7b", "#f1fa8c", "#8be9fd"],
);

const forest = defineTheme(
  "forest",
  "Forest",
  "dark",
  {
    background: "#0d1410",
    surface: "#14231a",
    text: "#e7f3ea",
    textMuted: "#8fae9a",
    border: "#1f3226",
    accent: "#4ade80",
    accentHover: "#22c55e",
    accentText: "#062910",
  },
  ["#4ade80", "#22c55e", "#a3e635", "#f59e0b", "#38bdf8"],
);

const emerald = defineTheme(
  "emerald",
  "Emerald",
  "dark",
  {
    background: "#17181a",
    surface: "#1f2b26",
    text: "#e9f5ef",
    textMuted: "#90ab9e",
    border: "#2a3a34",
    accent: "#2dd4bf",
    accentHover: "#14b8a6",
    accentText: "#062420",
  },
  ["#2dd4bf", "#14b8a6", "#4ade80", "#f59e0b", "#60a5fa"],
);

const sunset = defineTheme(
  "sunset",
  "Sunset",
  "dark",
  {
    background: "#1a120b",
    surface: "#241a10",
    text: "#fbeee0",
    textMuted: "#c2a184",
    border: "#3a2c1c",
    accent: "#f59e0b",
    accentHover: "#d97706",
    accentText: "#2b1a02",
  },
  ["#f59e0b", "#d97706", "#fb7185", "#facc15", "#38bdf8"],
);

const ruby = defineTheme(
  "ruby",
  "Ruby",
  "dark",
  {
    background: "#120608",
    surface: "#1f0a0e",
    text: "#fbe7e9",
    textMuted: "#c08a91",
    border: "#3a151b",
    accent: "#e11d48",
    accentHover: "#be123c",
    accentText: "#ffffff",
  },
  ["#e11d48", "#fb7185", "#f59e0b", "#f0abfc", "#60a5fa"],
);

const violet = defineTheme(
  "violet",
  "Violet",
  "dark",
  {
    background: "#150a24",
    surface: "#201233",
    text: "#f1e9fb",
    textMuted: "#b6a0d1",
    border: "#33204d",
    accent: "#a855f7",
    accentHover: "#9333ea",
    accentText: "#1a0b2e",
  },
  ["#a855f7", "#c084fc", "#f472b6", "#22c55e", "#38bdf8"],
);

const slate = defineTheme(
  "slate",
  "Slate",
  "dark",
  {
    background: "#14161a",
    surface: "#1c1f24",
    text: "#eceef1",
    textMuted: "#9aa1ab",
    border: "#2b2f36",
    accent: "#64748b",
    accentHover: "#475569",
    accentText: "#ffffff",
  },
  ["#64748b", "#94a3b8", "#22c55e", "#f59e0b", "#38bdf8"],
);

const coffee = defineTheme(
  "coffee",
  "Coffee",
  "dark",
  {
    background: "#1c140f",
    surface: "#271c14",
    text: "#f5ead9",
    textMuted: "#c2a582",
    border: "#3a2c1e",
    accent: "#d4a15a",
    accentHover: "#c08a3e",
    accentText: "#1c1206",
  },
  ["#d4a15a", "#c08a3e", "#a3e635", "#fb7185", "#38bdf8"],
);

export const THEMES: Record<string, ThemeDefinition> = {
  dark,
  light,
  ocean,
  nord,
  dracula,
  forest,
  emerald,
  sunset,
  ruby,
  violet,
  slate,
  coffee,
};

export const BASE_THEME_IDS = ["dark", "light"] as const;
export const EXTRA_THEME_IDS = [
  "ocean",
  "nord",
  "dracula",
  "forest",
  "emerald",
  "sunset",
  "ruby",
  "violet",
  "slate",
  "coffee",
] as const;

export const DEFAULT_THEME_ID = "dark";

export function isThemeId(value: unknown): value is string {
  return typeof value === "string" && value in THEMES;
}

export function getTheme(id: string): ThemeDefinition {
  return THEMES[id] ?? THEMES[DEFAULT_THEME_ID];
}

export function contrastRatio(a: string, b: string): number {
  const l1 = luminance(a);
  const l2 = luminance(b);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

const TOKEN_CSS_VARS: Record<keyof ThemeTokens, string> = {
  background: "--background",
  surface: "--surface",
  surfaceHover: "--surface-hover",
  surfaceActive: "--surface-active",
  text: "--text",
  textMuted: "--text-muted",
  border: "--border",
  borderHover: "--border-hover",
  accent: "--accent",
  accentHover: "--accent-hover",
  accentText: "--accent-text",
  success: "--success",
  warning: "--warning",
  danger: "--danger",
  overlay: "--overlay",
  focusRing: "--focus-ring",
  selection: "--selection",
  codeBackground: "--code-background",
  scrollbarThumb: "--scrollbar-thumb",
  scrollbarTrack: "--scrollbar-track",
  shadow: "--shadow",
  shadowSm: "--shadow-sm",
};

function toRgbTriplet(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  return `${r} ${g} ${b}`;
}

function themeDecls(theme: ThemeDefinition): string {
  return (Object.entries(TOKEN_CSS_VARS) as [keyof ThemeTokens, string][])
    .map(([key, cssVar]) => {
      const value = theme.tokens[key];
      const resolved = value.startsWith("#") ? toRgbTriplet(value) : value;
      return `${cssVar}: ${resolved};`;
    })
    .join(" ");
}

function themeCssRule(theme: ThemeDefinition): string {
  return `[data-theme="${theme.id}"] { ${themeDecls(theme)} }`;
}

export function injectThemeCss(): void {
  const styleId = "lifexp-theme-tokens";
  if (document.getElementById(styleId)) return;
  const style = document.createElement("style");
  style.id = styleId;
  const rules = Object.values(THEMES).map(themeCssRule);
  style.textContent = `:root { ${themeDecls(dark)} }\n${rules.join("\n")}`;
  document.head.appendChild(style);
}
