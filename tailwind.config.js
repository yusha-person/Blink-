/** @type {import('tailwindcss').Config} */
const v = (name) => `rgb(var(${name}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        background: v("--background"),
        surface: {
          DEFAULT: v("--surface"),
          hover: v("--surface-hover"),
          active: v("--surface-active"),
        },
        text: v("--text"),
        muted: v("--text-muted"),
        border: v("--border"),
        "border-hover": v("--border-hover"),
        code: "var(--code-background)",
        overlay: "var(--overlay)",
        accent: {
          DEFAULT: v("--accent"),
          hover: v("--accent-hover"),
          text: v("--accent-text"),
          muted: "#1d4ed8",
          glow: "rgba(59, 130, 246, 0.35)",
        },
        success: v("--success"),
        warning: v("--warning"),
        danger: v("--danger"),
        slate: {
          100: v("--text"),
          200: v("--text"),
          300: v("--text"),
          400: v("--text-muted"),
          500: v("--text-muted"),
          600: v("--text"),
          700: v("--text"),
          800: v("--text"),
          900: v("--text"),
        },
        red: {
          400: v("--danger"),
          500: v("--danger"),
          600: v("--danger"),
        },
        amber: {
          300: v("--warning"),
          400: v("--warning"),
          500: v("--warning"),
          600: v("--warning"),
          700: v("--warning"),
        },
        emerald: {
          400: v("--success"),
          600: v("--success"),
        },
      },
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1.125rem",
        "3xl": "1.5rem",
      },
      boxShadow: {
        glass: "0 8px 32px var(--shadow)",
        "glass-sm": "0 2px 12px var(--shadow-sm)",
        "glass-light": "0 8px 32px var(--shadow)",
        "glass-sm-light": "0 2px 12px var(--shadow-sm)",
        "accent-glow": "0 0 18px color-mix(in srgb, var(--accent) 35%, transparent)",
      },
      backdropBlur: {
        glass: "14px",
      },
      fontFamily: {
        sans: ["var(--font-app)", "system-ui", "sans-serif"],
        mono: ['"Cascadia Code"', '"JetBrains Mono"', "Consolas", "monospace"],
        editor: ["var(--font-editor)", "var(--font-app)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
