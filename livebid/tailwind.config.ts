import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Dark "live studio" palette — the UI is night-mode first.
        ink: {
          900: "#08080c",
          800: "#101018",
          700: "#181824",
          600: "#222232",
          500: "#2e2e42",
        },
        neon: {
          300: "#8affd9",
          400: "#3ff0b8",
          500: "#12d99a",
          600: "#0bb37e",
        },
        hot: {
          400: "#ff6b8b",
          500: "#ff3d6b",
          600: "#e01f4e",
        },
        gold: {
          400: "#ffd479",
          500: "#f5b942",
        },
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-live": {
          "0%,100%": { opacity: "1" },
          "50%": { opacity: "0.35" },
        },
        "pop": {
          "0%": { transform: "scale(0.9)", opacity: "0" },
          "60%": { transform: "scale(1.03)", opacity: "1" },
          "100%": { transform: "scale(1)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.35s ease-out",
        "pulse-live": "pulse-live 1.4s ease-in-out infinite",
        pop: "pop 0.28s ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
