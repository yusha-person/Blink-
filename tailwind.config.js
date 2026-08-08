/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        night: {
          950: "#050a14",
          900: "#0a0f1e",
          850: "#0c1326",
          800: "#0f172a",
          700: "#16213b",
          600: "#1e2a4a",
          500: "#26355c",
        },
        accent: {
          DEFAULT: "#3b82f6",
          hover: "#60a5fa",
          muted: "#1d4ed8",
          glow: "rgba(59, 130, 246, 0.35)",
        },
      },
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1.125rem",
        "3xl": "1.5rem",
      },
      boxShadow: {
        glass: "0 8px 32px rgba(0, 0, 0, 0.45)",
        "glass-sm": "0 2px 12px rgba(0, 0, 0, 0.35)",
        "glass-light": "0 8px 32px rgba(15, 23, 42, 0.10)",
        "glass-sm-light": "0 2px 12px rgba(15, 23, 42, 0.08)",
        "accent-glow": "0 0 18px rgba(59, 130, 246, 0.35)",
      },
      backdropBlur: {
        glass: "14px",
      },
      fontFamily: {
        sans: ['"Segoe UI"', "system-ui", "-apple-system", "sans-serif"],
        mono: ['"Cascadia Code"', '"JetBrains Mono"', "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};
