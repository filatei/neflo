import type { Config } from "tailwindcss";

/**
 * Neflo design system — strictly monochrome.
 * Plain white background, black and its shades for text/borders.
 * No accent colors anywhere. Bold, highly readable type.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    // Replace the default palette so stray colors can't sneak in.
    colors: {
      transparent: "transparent",
      current: "currentColor",
      white: "#ffffff",
      black: "#000000",
      ink: {
        50: "#f6f6f6",
        100: "#ededed",
        200: "#d9d9d9",
        300: "#bdbdbd",
        400: "#8f8f8f",
        500: "#666666",
        600: "#444444",
        700: "#2b2b2b",
        800: "#1a1a1a",
        900: "#0d0d0d",
      },
    },
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1.25rem",
      },
      boxShadow: {
        card: "0 1px 2px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.06)",
        modal: "0 24px 60px rgba(0,0,0,0.18)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "toast-in": {
          from: { opacity: "0", transform: "translateY(12px) scale(0.98)" },
          to: { opacity: "1", transform: "translateY(0) scale(1)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.15s ease-out",
        "slide-up": "slide-up 0.18s ease-out",
        "toast-in": "toast-in 0.18s ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
