export type FontDefinition = {
  id: string;
  name: string;
  family: string;
  mono: boolean;
};

export const FONTS: FontDefinition[] = [
  { id: "inter", name: "Inter", family: "Inter Variable", mono: false },
  { id: "roboto", name: "Roboto", family: "Roboto Variable", mono: false },
  { id: "open-sans", name: "Open Sans", family: "Open Sans Variable", mono: false },
  { id: "lato", name: "Lato", family: "Lato", mono: false },
  { id: "nunito", name: "Nunito", family: "Nunito Variable", mono: false },
  { id: "poppins", name: "Poppins", family: "Poppins", mono: false },
  { id: "montserrat", name: "Montserrat", family: "Montserrat Variable", mono: false },
  { id: "ubuntu", name: "Ubuntu", family: "Ubuntu", mono: false },
  { id: "fira-sans", name: "Fira Sans", family: "Fira Sans", mono: false },
  { id: "source-sans-3", name: "Source Sans 3", family: "Source Sans 3 Variable", mono: false },
  { id: "noto-sans", name: "Noto Sans", family: "Noto Sans Variable", mono: false },
  { id: "noto-serif", name: "Noto Serif", family: "Noto Serif Variable", mono: false },
  { id: "merriweather", name: "Merriweather", family: "Merriweather Variable", mono: false },
  { id: "ibm-plex-sans", name: "IBM Plex Sans", family: "IBM Plex Sans Variable", mono: false },
  { id: "space-grotesk", name: "Space Grotesk", family: "Space Grotesk Variable", mono: false },
  { id: "atkinson-hyperlegible", name: "Atkinson Hyperlegible", family: "Atkinson Hyperlegible", mono: false },
  { id: "fredoka", name: "Fredoka (Cartoony)", family: "Fredoka Variable", mono: false },
  { id: "caveat", name: "Caveat (Handwritten)", family: "Caveat Variable", mono: false },
  { id: "fira-code", name: "Fira Code", family: "Fira Code Variable", mono: true },
  { id: "jetbrains-mono", name: "JetBrains Mono", family: "JetBrains Mono Variable", mono: true },
  { id: "source-code-pro", name: "Source Code Pro", family: "Source Code Pro Variable", mono: true },
  { id: "ibm-plex-mono", name: "IBM Plex Mono", family: "IBM Plex Mono", mono: true },
];

export const DEFAULT_APP_FONT_ID = "inter";

const FONT_MAP = new Map(FONTS.map((font) => [font.id, font]));

export function isFontId(value: unknown): value is string {
  return typeof value === "string" && FONT_MAP.has(value);
}

export function getFont(id: string): FontDefinition {
  return FONT_MAP.get(id) ?? FONT_MAP.get(DEFAULT_APP_FONT_ID)!;
}

export function fontStack(id: string): string {
  const font = getFont(id);
  return `"${font.family}", ${font.mono ? "ui-monospace, monospace" : "system-ui, sans-serif"}`;
}
