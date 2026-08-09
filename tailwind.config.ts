import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Warm, romantic wedding palette.
        blush: {
          50: "#fdf2f4",
          100: "#fbe4e9",
          200: "#f7cdd6",
          300: "#f0a6b7",
          400: "#e67591",
          500: "#d84c6f",
          600: "#c33059",
          700: "#a42349",
          800: "#892042",
          900: "#761f3d",
        },
        gold: {
          400: "#d4b483",
          500: "#c19a5b",
          600: "#a67c3d",
        },
      },
      fontFamily: {
        serif: ["Georgia", "Cambria", "Times New Roman", "serif"],
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "slide-cross": {
          "0%": { opacity: "0", transform: "scale(1.04)" },
          "8%": { opacity: "1", transform: "scale(1)" },
          "92%": { opacity: "1", transform: "scale(1)" },
          "100%": { opacity: "0", transform: "scale(0.99)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.5s ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
