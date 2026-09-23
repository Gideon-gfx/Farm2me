import forms from "@tailwindcss/forms";

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Manrope", "system-ui", "sans-serif"],
      },
      colors: {
        // Farm2me approved design system — matches the desktop/mobile prototypes exactly.
        primary: "#2F6B3F", // forest green — brand, confirm actions
        "primary-dark": "#24352A", // ink — sidebar, headings, dark surfaces
        accent: "#D9A441", // harvest gold — CTAs, escrow highlights
        "accent-ink": "#3E2D1A", // text on gold surfaces
        background: "#F7F5EF", // app background (cream)
        "page-background": "#EAE7DF", // outer page background
        muted: "#8A8578",
        border: "rgba(0,0,0,0.07)",
        escrow: "#F6E7C6",
        "escrow-ink": "#8A6414",
        success: "#DDEBD9",
        danger: "#B4552E",
      },
      borderRadius: {
        card: "18px",
        pill: "999px",
      },
      minHeight: {
        tap: "48px", // large tap targets for rural touchscreen users
      },
    },
  },
  plugins: [forms],
};
