import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "var(--ink)",
        panel: "var(--panel)",
        "panel-raised": "var(--panel-raised)",
        border: "var(--border)",
        paper: "var(--paper)",
        muted: "var(--muted)",
        brass: "var(--brass)",
        "brass-bright": "var(--brass-bright)",
        "signal-red": "var(--signal-red)",
        "signal-green": "var(--signal-green)",
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        body: ["var(--font-body)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      borderRadius: {
        sm: "3px",
        DEFAULT: "4px",
        md: "6px",
      },
    },
  },
  plugins: [],
};
export default config;
